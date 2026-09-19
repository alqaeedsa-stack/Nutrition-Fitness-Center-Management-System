import { Hono } from 'hono';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { withDatabase } from '../db/client';
import { requirePermission } from '../auth/permissions';

export type AccountingBindings = { HYPERDRIVE?: { connectionString: string }; DATABASE_URL?: string };
export const accountingRoutes = new Hono<{ Bindings: AccountingBindings }>();

async function access(c:any, permission:'accounting.read'|'accounting.write') { return requirePermission(c, permission); }

function reportDates(c:any) {
  const from=c.req.query('from') ?? new Date(new Date().getFullYear(),0,1).toISOString().slice(0,10);
  const to=c.req.query('to') ?? new Date().toISOString().slice(0,10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from>to) return null;
  return {from,to};
}

const accountSchema=z.object({
  code:z.string().trim().min(1).max(30),
  name:z.string().trim().min(1).max(200),
  accountType:z.enum(['asset','liability','equity','revenue','expense']),
  parentId:z.string().uuid().optional().nullable(),
});

accountingRoutes.get('/accounts',async c=>{
  const auth=await access(c,'accounting.read'); if('error' in auth)return auth.error;
  const rows=await withDatabase(c.env,db=>db.execute(sql`select a.id,a.code,a.name,a.account_type as "accountType",a.parent_id as "parentId",p.code as "parentCode",p.name as "parentName",a.is_active as "isActive",a.is_system as "isSystem" from accounting_accounts a left join accounting_accounts p on p.id=a.parent_id where a.center_id=${auth.user.centerId!} order by a.code`));
  return c.json({accounts:rows.rows});
});
accountingRoutes.put('/accounts/:id',async c=>{
  const auth=await access(c,'accounting.write'); if('error' in auth)return auth.error;
  const accountId=c.req.param('id');
  if(!z.string().uuid().safeParse(accountId).success)return c.json({error:{code:'INVALID_ACCOUNT_ID',message:'معرف الحساب غير صحيح'}},400);
  const parsed=accountSchema.safeParse(await c.req.json().catch(()=>null)); if(!parsed.success)return c.json({error:{code:'VALIDATION_ERROR',message:'بيانات الحساب غير صحيحة',details:parsed.error.flatten()}},400);
  const x=parsed.data;
  try{
    const current=await withDatabase(c.env,db=>db.execute(sql`select id,is_system as "isSystem" from accounting_accounts where id=${accountId} and center_id=${auth.user.centerId!} limit 1`));
    if(!current.rows[0])return c.json({error:{code:'ACCOUNT_NOT_FOUND',message:'الحساب غير موجود'}},404);
    if(current.rows[0].isSystem)return c.json({error:{code:'SYSTEM_ACCOUNT_LOCKED',message:'حسابات النظام لا يمكن تعديلها'}},409);
    if(x.parentId===accountId)return c.json({error:{code:'INVALID_PARENT',message:'لا يمكن جعل الحساب أبًا لنفسه'}},400);
    if(x.parentId){
      const parent=await withDatabase(c.env,db=>db.execute(sql`select id,account_type as "accountType" from accounting_accounts where id=${x.parentId} and center_id=${auth.user.centerId!} limit 1`));
      if(!parent.rows[0])return c.json({error:{code:'ACCOUNT_PARENT_INVALID',message:'الحساب الأب غير تابع للمركز'}},400);
      if(parent.rows[0].accountType!==x.accountType)return c.json({error:{code:'ACCOUNT_TYPE_MISMATCH',message:'نوع الحساب يجب أن يطابق نوع الحساب الأب'}},400);
    }
    const r=await withDatabase(c.env,db=>db.execute(sql`update accounting_accounts set parent_id=${x.parentId??null},code=${x.code},name=${x.name},account_type=${x.accountType},updated_at=now() where id=${accountId} and center_id=${auth.user.centerId!} returning id,code,name,account_type as "accountType",parent_id as "parentId",is_active as "isActive",is_system as "isSystem"`));
    return c.json({account:r.rows[0]});
  }catch(e){return c.json({error:{code:'ACCOUNT_UPDATE_FAILED',message:'تعذر تعديل الحساب',detail:e instanceof Error?e.message:'unknown'}},400);}
});

accountingRoutes.post('/accounts/:id/duplicate',async c=>{
  const auth=await access(c,'accounting.write'); if('error' in auth)return auth.error;
  const accountId=c.req.param('id');
  const parsed=z.object({code:z.string().trim().min(1).max(30),name:z.string().trim().min(1).max(200)}).safeParse(await c.req.json().catch(()=>null));
  if(!parsed.success)return c.json({error:{code:'VALIDATION_ERROR',message:'رقم واسم الحساب الجديد مطلوبان'}},400);
  try{
    const source=await withDatabase(c.env,db=>db.execute(sql`select parent_id as "parentId",account_type as "accountType" from accounting_accounts where id=${accountId} and center_id=${auth.user.centerId!} limit 1`));
    if(!source.rows[0])return c.json({error:{code:'ACCOUNT_NOT_FOUND',message:'الحساب غير موجود'}},404);
    const r=await withDatabase(c.env,db=>db.execute(sql`insert into accounting_accounts(center_id,parent_id,code,name,account_type,created_by,is_active,is_system) values(${auth.user.centerId!},${source.rows[0].parentId},${parsed.data.code},${parsed.data.name},${source.rows[0].accountType},${auth.user.userId},true,false) returning id,code,name,account_type as "accountType",parent_id as "parentId",is_active as "isActive",is_system as "isSystem"`));
    return c.json({account:r.rows[0]},201);
  }catch(e){return c.json({error:{code:'ACCOUNT_DUPLICATE_FAILED',message:'تعذر تكرار الحساب — تأكد أن رقم الحساب غير مستخدم',detail:e instanceof Error?e.message:'unknown'}},400);}
});

accountingRoutes.patch('/accounts/:id/archive',async c=>{
  const auth=await access(c,'accounting.write'); if('error' in auth)return auth.error;
  const accountId=c.req.param('id');
  try{
    const r=await withDatabase(c.env,db=>db.execute(sql`update accounting_accounts set is_active=false,updated_at=now() where id=${accountId} and center_id=${auth.user.centerId!} and is_system=false returning id,code,name,is_active as "isActive"`));
    if(!r.rows[0])return c.json({error:{code:'ACCOUNT_NOT_FOUND_OR_LOCKED',message:'الحساب غير موجود أو حساب نظام محمي'}},404);
    return c.json({account:r.rows[0]});
  }catch(e){return c.json({error:{code:'ACCOUNT_ARCHIVE_FAILED',message:'تعذر أرشفة الحساب',detail:e instanceof Error?e.message:'unknown'}},400);}
});

accountingRoutes.patch('/accounts/:id/restore',async c=>{
  const auth=await access(c,'accounting.write'); if('error' in auth)return auth.error;
  const accountId=c.req.param('id');
  try{
    const r=await withDatabase(c.env,db=>db.execute(sql`update accounting_accounts set is_active=true,updated_at=now() where id=${accountId} and center_id=${auth.user.centerId!} and is_system=false returning id,code,name,is_active as "isActive"`));
    if(!r.rows[0])return c.json({error:{code:'ACCOUNT_NOT_FOUND_OR_LOCKED',message:'الحساب غير موجود أو حساب نظام محمي'}},404);
    return c.json({account:r.rows[0]});
  }catch(e){return c.json({error:{code:'ACCOUNT_RESTORE_FAILED',message:'تعذر استعادة الحساب',detail:e instanceof Error?e.message:'unknown'}},400);}
});

accountingRoutes.delete('/accounts/:id',async c=>{
  const auth=await access(c,'accounting.write'); if('error' in auth)return auth.error;
  const accountId=c.req.param('id');
  try{
    const current=await withDatabase(c.env,db=>db.execute(sql`select id,is_system as "isSystem" from accounting_accounts where id=${accountId} and center_id=${auth.user.centerId!} limit 1`));
    if(!current.rows[0])return c.json({error:{code:'ACCOUNT_NOT_FOUND',message:'الحساب غير موجود'}},404);
    if(current.rows[0].isSystem)return c.json({error:{code:'SYSTEM_ACCOUNT_LOCKED',message:'حسابات النظام لا يمكن حذفها'}},409);
    const refs=await withDatabase(c.env,db=>db.execute(sql`
      select
        (select count(*) from journal_entry_lines where account_id=${accountId}) as journal_lines,
        (select count(*) from accounting_accounts where parent_id=${accountId}) as children,
        (select count(*) from products where inventory_account_id=${accountId} or cost_of_sales_account_id=${accountId} or revenue_account_id=${accountId} or purchase_account_id=${accountId} or sales_return_account_id=${accountId} or purchase_return_account_id=${accountId} or deferred_revenue_account_id=${accountId} or subscription_revenue_account_id=${accountId}) as product_refs,
        (select count(*) from accounting_settings where inventory_account_id=${accountId} or input_vat_account_id=${accountId} or accounts_payable_account_id=${accountId} or cash_bank_account_id=${accountId} or accounts_receivable_account_id=${accountId} or revenue_account_id=${accountId} or output_vat_account_id=${accountId} or cost_of_sales_account_id=${accountId} or deferred_revenue_account_id=${accountId} or subscription_revenue_account_id=${accountId}) as settings_refs
    `));
    const ref=refs.rows[0] as any;
    if(Number(ref.journal_lines)>0||Number(ref.children)>0||Number(ref.product_refs)>0||Number(ref.settings_refs)>0)return c.json({error:{code:'ACCOUNT_IN_USE',message:'لا يمكن حذف الحساب لأنه مستخدم في قيود أو حسابات فرعية أو إعدادات منتجات. استخدم الأرشفة بدلًا من الحذف.'}},409);
    await withDatabase(c.env,db=>db.execute(sql`delete from accounting_accounts where id=${accountId} and center_id=${auth.user.centerId!} and is_system=false`));
    return c.json({ok:true});
  }catch(e){return c.json({error:{code:'ACCOUNT_DELETE_FAILED',message:'تعذر حذف الحساب',detail:e instanceof Error?e.message:'unknown'}},400);}
});

accountingRoutes.post('/accounts',async c=>{
  const auth=await access(c,'accounting.write'); if('error' in auth)return auth.error;
  const parsed=accountSchema.safeParse(await c.req.json().catch(()=>null)); if(!parsed.success)return c.json({error:{code:'VALIDATION_ERROR',message:'بيانات الحساب غير صحيحة',details:parsed.error.flatten()}},400);
  const x=parsed.data;
  try{
    if (x.parentId) {
      const parent = await withDatabase(c.env,db=>db.execute(sql`select id from accounting_accounts where id=${x.parentId} and center_id=${auth.user.centerId!} limit 1`));
      if (!parent.rows[0]) return c.json({error:{code:'ACCOUNT_PARENT_INVALID',message:'الحساب الأب غير تابع للمركز'}},400);
    }
    const r=await withDatabase(c.env,db=>db.execute(sql`insert into accounting_accounts(center_id,parent_id,code,name,account_type,created_by) values(${auth.user.centerId!},${x.parentId??null},${x.code},${x.name},${x.accountType},${auth.user.userId}) returning id,code,name,account_type as "accountType",parent_id as "parentId"`));
    return c.json({account:r.rows[0]},201);
  }catch(e){return c.json({error:{code:'ACCOUNT_CREATE_FAILED',message:'تعذر إنشاء الحساب',detail:e instanceof Error?e.message:'unknown'}},400);}
});
accountingRoutes.get('/settings',async c=>{
  const auth=await access(c,'accounting.read'); if('error' in auth)return auth.error;
  const r=await withDatabase(c.env,db=>db.execute(sql`select s.center_id as "centerId",s.inventory_account_id as "inventoryAccountId",s.input_vat_account_id as "inputVatAccountId",s.accounts_payable_account_id as "accountsPayableAccountId",s.cash_bank_account_id as "cashBankAccountId",s.accounts_receivable_account_id as "accountsReceivableAccountId",s.revenue_account_id as "revenueAccountId",s.output_vat_account_id as "outputVatAccountId",s.cost_of_sales_account_id as "costOfSalesAccountId",s.deferred_revenue_account_id as "deferredRevenueAccountId",s.subscription_revenue_account_id as "subscriptionRevenueAccountId",ia.code as "inventoryAccountCode",ia.name as "inventoryAccountName",va.code as "inputVatAccountCode",va.name as "inputVatAccountName",pa.code as "accountsPayableAccountCode",pa.name as "accountsPayableAccountName",ca.code as "cashBankAccountCode",ca.name as "cashBankAccountName",ra.code as "accountsReceivableAccountCode",ra.name as "accountsReceivableAccountName",reva.code as "revenueAccountCode",reva.name as "revenueAccountName",ova.code as "outputVatAccountCode",ova.name as "outputVatAccountName",coa.code as "costOfSalesAccountCode",coa.name as "costOfSalesAccountName" from accounting_settings s left join accounting_accounts ia on ia.id=s.inventory_account_id left join accounting_accounts va on va.id=s.input_vat_account_id left join accounting_accounts pa on pa.id=s.accounts_payable_account_id left join accounting_accounts ca on ca.id=s.cash_bank_account_id left join accounting_accounts ra on ra.id=s.accounts_receivable_account_id left join accounting_accounts reva on reva.id=s.revenue_account_id left join accounting_accounts ova on ova.id=s.output_vat_account_id left join accounting_accounts coa on coa.id=s.cost_of_sales_account_id where s.center_id=${auth.user.centerId!} limit 1`));
  return c.json({settings:r.rows[0]??null});
});
const settingsSchema=z.object({inventoryAccountId:z.string().uuid().nullable().optional(),inputVatAccountId:z.string().uuid().nullable().optional(),accountsPayableAccountId:z.string().uuid().nullable().optional(),cashBankAccountId:z.string().uuid().nullable().optional(),accountsReceivableAccountId:z.string().uuid().nullable().optional(),revenueAccountId:z.string().uuid().nullable().optional(),outputVatAccountId:z.string().uuid().nullable().optional(),costOfSalesAccountId:z.string().uuid().nullable().optional(),deferredRevenueAccountId:z.string().uuid().nullable().optional(),subscriptionRevenueAccountId:z.string().uuid().nullable().optional()});
accountingRoutes.post('/settings',async c=>{
  const auth=await access(c,'accounting.write'); if('error' in auth)return auth.error;
  const parsed=settingsSchema.safeParse(await c.req.json().catch(()=>null)); if(!parsed.success)return c.json({error:{code:'VALIDATION_ERROR',message:'إعدادات المحاسبة غير صحيحة',details:parsed.error.flatten()}},400);
  const x=parsed.data;
  try{
    const selected = [
      ['inventoryAccountId', x.inventoryAccountId],
      ['inputVatAccountId', x.inputVatAccountId],
      ['accountsPayableAccountId', x.accountsPayableAccountId],
      ['cashBankAccountId', x.cashBankAccountId],
      ['accountsReceivableAccountId', x.accountsReceivableAccountId],
      ['revenueAccountId', x.revenueAccountId],
      ['outputVatAccountId', x.outputVatAccountId],
      ['costOfSalesAccountId', x.costOfSalesAccountId],
      ['deferredRevenueAccountId', x.deferredRevenueAccountId],
      ['subscriptionRevenueAccountId', x.subscriptionRevenueAccountId],
    ] as const;
    const ids = selected.map(([, id]) => id).filter((id): id is string => Boolean(id));
    if (ids.length) {
      const rows = await withDatabase(c.env,db=>db.execute(sql`select id,account_type as "accountType" from accounting_accounts where center_id=${auth.user.centerId!} and id in (${sql.join(ids.map(id=>sql`${id}`),sql`,`)})`));
      if (rows.rows.length !== ids.length) return c.json({error:{code:'ACCOUNT_SCOPE_INVALID',message:'أحد الحسابات المختارة لا يتبع للمركز'}},400);
      const byId = new Map(rows.rows.map((row:any)=>[row.id,row.accountType]));
      const expected: Record<string,string[]> = {
        inventoryAccountId:['asset','expense'],
        inputVatAccountId:['asset'],
        accountsPayableAccountId:['liability'],
        cashBankAccountId:['asset'],
        accountsReceivableAccountId:['asset'],
        revenueAccountId:['revenue'],
        outputVatAccountId:['liability'],
        costOfSalesAccountId:['expense'],
        deferredRevenueAccountId:['liability'],
        subscriptionRevenueAccountId:['revenue'],
      };
      for (const [key,id] of selected) {
        if (!id) continue;
        const type = byId.get(id);
        if (!type || !expected[key].includes(type)) return c.json({error:{code:'ACCOUNT_TYPE_INVALID',message:`نوع الحساب غير مناسب للإعداد: ${key}`}},400);
      }
    }
    const r=await withDatabase(c.env,db=>db.execute(sql`insert into accounting_settings(center_id,inventory_account_id,input_vat_account_id,accounts_payable_account_id,cash_bank_account_id,accounts_receivable_account_id,revenue_account_id,output_vat_account_id,cost_of_sales_account_id,deferred_revenue_account_id,subscription_revenue_account_id,updated_by) values(${auth.user.centerId!},${x.inventoryAccountId??null},${x.inputVatAccountId??null},${x.accountsPayableAccountId??null},${x.cashBankAccountId??null},${x.accountsReceivableAccountId??null},${x.revenueAccountId??null},${x.outputVatAccountId??null},${x.costOfSalesAccountId??null},${x.deferredRevenueAccountId??null},${x.subscriptionRevenueAccountId??null},${auth.user.userId}) on conflict(center_id) do update set inventory_account_id=excluded.inventory_account_id,input_vat_account_id=excluded.input_vat_account_id,accounts_payable_account_id=excluded.accounts_payable_account_id,cash_bank_account_id=excluded.cash_bank_account_id,accounts_receivable_account_id=excluded.accounts_receivable_account_id,revenue_account_id=excluded.revenue_account_id,output_vat_account_id=excluded.output_vat_account_id,cost_of_sales_account_id=excluded.cost_of_sales_account_id,deferred_revenue_account_id=excluded.deferred_revenue_account_id,subscription_revenue_account_id=excluded.subscription_revenue_account_id,updated_by=excluded.updated_by,updated_at=now() returning *`));
    return c.json({settings:r.rows[0]});
  }catch(e){return c.json({error:{code:'SETTINGS_FAILED',message:'تعذر حفظ إعدادات المحاسبة',detail:e instanceof Error?e.message:'unknown'}},400);}
});
accountingRoutes.get('/journal-entries',async c=>{
  const auth=await access(c,'accounting.read'); if('error' in auth)return auth.error;
  const r=await withDatabase(c.env,db=>db.execute(sql`select j.id,j.entry_number as "entryNumber",j.entry_date as "entryDate",j.source_type as "sourceType",j.source_id as "sourceId",j.description,j.status,j.created_at as "createdAt",coalesce(sum(case when j.id is not null then l.debit else 0 end),0)::numeric(18,2) as debit,coalesce(sum(case when j.id is not null then l.credit else 0 end),0)::numeric(18,2) as credit from journal_entries j left join journal_entry_lines l on l.journal_entry_id=j.id where j.center_id=${auth.user.centerId!} group by j.id order by j.entry_date desc,j.created_at desc`));
  return c.json({entries:r.rows});
});
accountingRoutes.get('/journal-entries/:id',async c=>{
  const auth=await access(c,'accounting.read'); if('error' in auth)return auth.error;
  const r=await withDatabase(c.env,db=>db.execute(sql`select j.id,j.entry_number as "entryNumber",j.entry_date as "entryDate",j.source_type as "sourceType",j.source_id as "sourceId",j.description,j.status,j.created_at as "createdAt" from journal_entries j where j.id=${c.req.param('id')} and j.center_id=${auth.user.centerId!} limit 1`));
  if(!r.rows[0])return c.json({error:{code:'NOT_FOUND',message:'القيد غير موجود'}},404);
  const lines=await withDatabase(c.env,db=>db.execute(sql`select l.id,a.code as "accountCode",a.name as "accountName",l.description,l.debit,l.credit from journal_entry_lines l join accounting_accounts a on a.id=l.account_id where l.journal_entry_id=${c.req.param('id')} order by l.id`));
  return c.json({entry:r.rows[0],lines:lines.rows});
});
accountingRoutes.get('/reports/trial-balance',async c=>{
  const auth=await access(c,'accounting.read'); if('error' in auth)return auth.error;
  const dates=reportDates(c); if(!dates)return c.json({error:{code:'INVALID_DATE_RANGE',message:'نطاق التاريخ غير صحيح'}},400);
  const r=await withDatabase(c.env,db=>db.execute(sql`select a.id,a.code,a.name,a.account_type as "accountType",coalesce(sum(case when j.id is not null then l.debit else 0 end),0)::numeric(18,2) as debit,coalesce(sum(case when j.id is not null then l.credit else 0 end),0)::numeric(18,2) as credit from accounting_accounts a left join journal_entry_lines l on l.account_id=a.id left join journal_entries j on j.id=l.journal_entry_id and j.center_id=a.center_id and j.status='posted' and j.entry_date <= ${dates.to} where a.center_id=${auth.user.centerId!} group by a.id order by a.code`));
  return c.json({accounts:r.rows});
});
accountingRoutes.get('/reports/income-statement',async c=>{
  const auth=await access(c,'accounting.read'); if('error' in auth)return auth.error;
  const dates=reportDates(c); if(!dates)return c.json({error:{code:'INVALID_DATE_RANGE',message:'نطاق التاريخ غير صحيح'}},400);
  const r=await withDatabase(c.env,db=>db.execute(sql`select a.id,a.code,a.name,a.account_type as "accountType",coalesce(sum(case when j.id is not null then l.debit else 0 end),0)::numeric(18,2) as debit,coalesce(sum(case when j.id is not null then l.credit else 0 end),0)::numeric(18,2) as credit from accounting_accounts a left join journal_entry_lines l on l.account_id=a.id left join journal_entries j on j.id=l.journal_entry_id and j.center_id=a.center_id and j.status='posted' and j.entry_date >= ${dates.from} and j.entry_date <= ${dates.to} where a.center_id=${auth.user.centerId!} and a.account_type in ('revenue','expense') group by a.id order by a.account_type,a.code`));
  return c.json({accounts:r.rows});
});
accountingRoutes.get('/reports/balance-sheet',async c=>{
  const auth=await access(c,'accounting.read'); if('error' in auth)return auth.error;
  const dates=reportDates(c); if(!dates)return c.json({error:{code:'INVALID_DATE_RANGE',message:'نطاق التاريخ غير صحيح'}},400);
  const r=await withDatabase(c.env,db=>db.execute(sql`select a.id,a.code,a.name,a.account_type as "accountType",coalesce(sum(case when j.id is not null then l.debit else 0 end),0)::numeric(18,2) as debit,coalesce(sum(case when j.id is not null then l.credit else 0 end),0)::numeric(18,2) as credit from accounting_accounts a left join journal_entry_lines l on l.account_id=a.id left join journal_entries j on j.id=l.journal_entry_id and j.center_id=a.center_id and j.status='posted' and j.entry_date <= ${dates.to} where a.center_id=${auth.user.centerId!} and a.account_type in ('asset','liability','equity') group by a.id order by a.account_type,a.code`));
  return c.json({accounts:r.rows});
});
accountingRoutes.get('/ledger/:accountId',async c=>{
  const auth=await access(c,'accounting.read'); if('error' in auth)return auth.error;
  const r=await withDatabase(c.env,db=>db.execute(sql`select a.id,a.code,a.name,a.account_type as "accountType" from accounting_accounts a where a.id=${c.req.param('accountId')} and a.center_id=${auth.user.centerId!} limit 1`));
  if(!r.rows[0])return c.json({error:{code:'NOT_FOUND',message:'الحساب غير موجود'}},404);
  const lines=await withDatabase(c.env,db=>db.execute(sql`select j.entry_number as "entryNumber",j.entry_date as "entryDate",j.description,l.debit,l.credit from journal_entry_lines l join journal_entries j on j.id=l.journal_entry_id and j.status='posted' where l.account_id=${c.req.param('accountId')} and j.center_id=${auth.user.centerId!} order by j.entry_date,j.created_at,l.id`));
  let balance=0; const ledger=lines.rows.map((x:any)=>{balance+=Number(x.debit)-Number(x.credit);return {...x,balance:balance.toFixed(2)};});
  return c.json({account:r.rows[0],ledger});
});
