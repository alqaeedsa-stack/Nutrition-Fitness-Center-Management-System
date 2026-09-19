import { sql } from 'drizzle-orm';

function journalNumber(prefix: string) {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  return `${prefix}-${stamp}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

async function settings(tx: any, centerId: string) {
  const result = await tx.execute(sql`select inventory_account_id, input_vat_account_id, accounts_payable_account_id, cash_bank_account_id from accounting_settings where center_id=${centerId} limit 1`);
  return result.rows[0] as any;
}

function requireAccounts(s: any, need: string[]) {
  const missing = need.filter(key => !s?.[key]);
  if (missing.length) {
    const labels: Record<string,string> = {
      inventory_account_id: 'حساب المخزون/المشتريات',
      input_vat_account_id: 'حساب ضريبة القيمة المضافة - مدخلات',
      accounts_payable_account_id: 'حساب الدائنين/الموردين',
      cash_bank_account_id: 'حساب النقدية/البنك',
    };
    throw new Error(`ACCOUNTING_SETUP_REQUIRED: ${missing.map(k => labels[k] ?? k).join('، ')}`);
  }
}

async function createEntry(tx: any, args: {
  centerId: string; date: string; sourceType: string; sourceId: string;
  description: string; createdBy: string;
  lines: Array<{accountId:string; description:string; debit:number; credit:number}>
}) {
  const totalDebit = Math.round(args.lines.reduce((n,l)=>n+l.debit,0)*100)/100;
  const totalCredit = Math.round(args.lines.reduce((n,l)=>n+l.credit,0)*100)/100;
  if (Math.abs(totalDebit-totalCredit) > 0.005) throw new Error('ACCOUNTING_UNBALANCED');
  const existing = await tx.execute(sql`select id, entry_number from journal_entries where center_id=${args.centerId} and source_type=${args.sourceType} and source_id=${args.sourceId} limit 1`);
  if (existing.rows[0]) return existing.rows[0] as any;
  const entryNumber = journalNumber(args.sourceType === 'purchase_bill' ? 'JE-BILL' : 'JE-PAY');
  const inserted = await tx.execute(sql`insert into journal_entries (center_id,entry_number,entry_date,source_type,source_id,description,status,created_by,posted_at) values (${args.centerId},${entryNumber},${args.date},${args.sourceType},${args.sourceId},${args.description},'posted',${args.createdBy},now()) returning id,entry_number`);
  const entry = inserted.rows[0] as any;
  for (const line of args.lines) {
    await tx.execute(sql`insert into journal_entry_lines (journal_entry_id,account_id,description,debit,credit) values (${entry.id},${line.accountId},${line.description},${line.debit.toFixed(2)},${line.credit.toFixed(2)})`);
  }
  return entry;
}

export async function postPurchaseBill(tx: any, args: {
  centerId: string; billId: string; billNumber: string; billDate: string; subtotal: number; tax: number; createdBy: string;
}) {
  const s = await settings(tx, args.centerId);
  requireAccounts(s, ['inventory_account_id', 'accounts_payable_account_id']);
  if (args.tax > 0) requireAccounts(s, ['input_vat_account_id']);
  const lines = [
    { accountId: s.inventory_account_id, description: `فاتورة مورد ${args.billNumber} - مخزون/مشتريات`, debit: args.subtotal, credit: 0 },
    ...(args.tax > 0 ? [{ accountId: s.input_vat_account_id, description: `فاتورة مورد ${args.billNumber} - ضريبة مدخلات`, debit: args.tax, credit: 0 }] : []),
    { accountId: s.accounts_payable_account_id, description: `فاتورة مورد ${args.billNumber} - دائنون`, debit: 0, credit: Math.round((args.subtotal+args.tax)*100)/100 },
  ];
  return createEntry(tx, { centerId: args.centerId, date: args.billDate, sourceType: 'purchase_bill', sourceId: args.billId, description: `ترحيل فاتورة المورد ${args.billNumber}`, createdBy: args.createdBy, lines });
}

export async function postPurchasePayment(tx: any, args: {
  centerId: string; paymentId: string; paymentNumber: string; paymentDate: string; amount: number; createdBy: string;
}) {
  const s = await settings(tx, args.centerId);
  requireAccounts(s, ['accounts_payable_account_id', 'cash_bank_account_id']);
  const lines = [
    { accountId: s.accounts_payable_account_id, description: `دفعة مورد ${args.paymentNumber} - تسوية الدائنين`, debit: args.amount, credit: 0 },
    { accountId: s.cash_bank_account_id, description: `دفعة مورد ${args.paymentNumber} - نقدية/بنك`, debit: 0, credit: args.amount },
  ];
  return createEntry(tx, { centerId: args.centerId, date: args.paymentDate, sourceType: 'purchase_payment', sourceId: args.paymentId, description: `ترحيل دفعة المورد ${args.paymentNumber}`, createdBy: args.createdBy, lines });
}

export async function postSale(tx:any,args:{centerId:string;saleId:string;saleNumber:string;saleDate:string;subtotal:number;tax:number;total:number;cogs:number;paymentMethod:string;createdBy:string}){
 const s=await settings(tx,args.centerId);
 requireAccounts(s,['revenue_account_id','cash_bank_account_id','cost_of_sales_account_id','inventory_account_id']);
 if(args.tax>0)requireAccounts(s,['output_vat_account_id']);
 const lines=[
  {accountId:s.cash_bank_account_id,description:`بيع ${args.saleNumber} - تحصيل`,debit:args.total,credit:0},
  {accountId:s.revenue_account_id,description:`بيع ${args.saleNumber} - إيراد`,debit:0,credit:args.subtotal},
  ...(args.tax>0?[{accountId:s.output_vat_account_id,description:`بيع ${args.saleNumber} - ضريبة مخرجات`,debit:0,credit:args.tax}]:[]),
  ...(args.cogs>0?[{accountId:s.cost_of_sales_account_id,description:`بيع ${args.saleNumber} - تكلفة المبيعات`,debit:args.cogs,credit:0},{accountId:s.inventory_account_id,description:`بيع ${args.saleNumber} - تخفيض المخزون`,debit:0,credit:args.cogs}]:[])
 ];
 return createEntry(tx,{centerId:args.centerId,date:args.saleDate,sourceType:'sale',sourceId:args.saleId,description:`ترحيل عملية البيع ${args.saleNumber}`,createdBy:args.createdBy,lines});
}
