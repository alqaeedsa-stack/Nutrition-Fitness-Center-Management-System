import { Hono } from 'hono';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { withDatabase } from '../db/client';
import { requirePermission } from '../auth/permissions';

export type AccountingBindings = { HYPERDRIVE?: { connectionString: string }; DATABASE_URL?: string };
export const accountingRoutes = new Hono<{ Bindings: AccountingBindings }>();

async function access(c:any, permission:'purchases.read'|'purchases.write') { return requirePermission(c, permission); }

const accountSchema=z.object({
  code:z.string().trim().min(1).max(30),
  name:z.string().trim().min(1).max(200),
  accountType:z.enum(['asset','liability','equity','revenue','expense']),
  parentId:z.string().uuid().optional().nullable(),
});

accountingRoutes.get('/accounts',async c=>{
  const auth=await access(c,'purchases.read'); if('error' in auth)return auth.error;
  const rows=await withDatabase(c.env,db=>db.execute(sql`select a.id,a.code,a.name,a.account_type as "accountType",a.parent_id as "parentId",p.code as "parentCode",p.name as "parentName",a.is_active as "isActive",a.is_system as "isSystem" from accounting_accounts a left join accounting_accounts p on p.id=a.parent_id where a.center_id=${auth.user.centerId!} order by a.code`));
  return c.json({accounts:rows.rows});
});
accountingRoutes.post('/accounts',async c=>{
  const auth=await access(c,'purchases.write'); if('error' in auth)return auth.error;
  const parsed=accountSchema.safeParse(await c.req.json().catch(()=>null)); if(!parsed.success)return c.json({error:{code:'VALIDATION_ERROR',message:'بيانات الحساب غير صحيحة',details:parsed.error.flatten()}},400);
  const x=parsed.data;
  try{
    const r=await withDatabase(c.env,db=>db.execute(sql`insert into accounting_accounts(center_id,parent_id,code,name,account_type,created_by) values(${auth.user.centerId!},${x.parentId??null},${x.code},${x.name},${x.accountType},${auth.user.userId}) returning id,code,name,account_type as "accountType",parent_id as "parentId"`));
    return c.json({account:r.rows[0]},201);
  }catch(e){return c.json({error:{code:'ACCOUNT_CREATE_FAILED',message:'تعذر إنشاء الحساب',detail:e instanceof Error?e.message:'unknown'}},400);}
});
accountingRoutes.get('/settings',async c=>{
  const auth=await access(c,'purchases.read'); if('error' in auth)return auth.error;
  const r=await withDatabase(c.env,db=>db.execute(sql`select s.center_id as "centerId",s.inventory_account_id as "inventoryAccountId",s.input_vat_account_id as "inputVatAccountId",s.accounts_payable_account_id as "accountsPayableAccountId",s.cash_bank_account_id as "cashBankAccountId",ia.code as "inventoryAccountCode",ia.name as "inventoryAccountName",va.code as "inputVatAccountCode",va.name as "inputVatAccountName",pa.code as "accountsPayableAccountCode",pa.name as "accountsPayableAccountName",ca.code as "cashBankAccountCode",ca.name as "cashBankAccountName" from accounting_settings s left join accounting_accounts ia on ia.id=s.inventory_account_id left join accounting_accounts va on va.id=s.input_vat_account_id left join accounting_accounts pa on pa.id=s.accounts_payable_account_id left join accounting_accounts ca on ca.id=s.cash_bank_account_id where s.center_id=${auth.user.centerId!} limit 1`));
  return c.json({settings:r.rows[0]??null});
});
const settingsSchema=z.object({inventoryAccountId:z.string().uuid().nullable().optional(),inputVatAccountId:z.string().uuid().nullable().optional(),accountsPayableAccountId:z.string().uuid().nullable().optional(),cashBankAccountId:z.string().uuid().nullable().optional()});
accountingRoutes.post('/settings',async c=>{
  const auth=await access(c,'purchases.write'); if('error' in auth)return auth.error;
  const parsed=settingsSchema.safeParse(await c.req.json().catch(()=>null)); if(!parsed.success)return c.json({error:{code:'VALIDATION_ERROR',message:'إعدادات المحاسبة غير صحيحة',details:parsed.error.flatten()}},400);
  const x=parsed.data;
  try{
    const r=await withDatabase(c.env,db=>db.execute(sql`insert into accounting_settings(center_id,inventory_account_id,input_vat_account_id,accounts_payable_account_id,cash_bank_account_id,updated_by) values(${auth.user.centerId!},${x.inventoryAccountId??null},${x.inputVatAccountId??null},${x.accountsPayableAccountId??null},${x.cashBankAccountId??null},${auth.user.userId}) on conflict(center_id) do update set inventory_account_id=excluded.inventory_account_id,input_vat_account_id=excluded.input_vat_account_id,accounts_payable_account_id=excluded.accounts_payable_account_id,cash_bank_account_id=excluded.cash_bank_account_id,updated_by=excluded.updated_by,updated_at=now() returning *`));
    return c.json({settings:r.rows[0]});
  }catch(e){return c.json({error:{code:'SETTINGS_FAILED',message:'تعذر حفظ إعدادات المحاسبة',detail:e instanceof Error?e.message:'unknown'}},400);}
});
accountingRoutes.get('/journal-entries',async c=>{
  const auth=await access(c,'purchases.read'); if('error' in auth)return auth.error;
  const r=await withDatabase(c.env,db=>db.execute(sql`select j.id,j.entry_number as "entryNumber",j.entry_date as "entryDate",j.source_type as "sourceType",j.source_id as "sourceId",j.description,j.status,j.created_at as "createdAt",coalesce(sum(case when j.id is not null then l.debit else 0 end),0)::numeric(18,2) as debit,coalesce(sum(case when j.id is not null then l.credit else 0 end),0)::numeric(18,2) as credit from journal_entries j left join journal_entry_lines l on l.journal_entry_id=j.id where j.center_id=${auth.user.centerId!} group by j.id order by j.entry_date desc,j.created_at desc`));
  return c.json({entries:r.rows});
});
accountingRoutes.get('/journal-entries/:id',async c=>{
  const auth=await access(c,'purchases.read'); if('error' in auth)return auth.error;
  const r=await withDatabase(c.env,db=>db.execute(sql`select j.id,j.entry_number as "entryNumber",j.entry_date as "entryDate",j.source_type as "sourceType",j.source_id as "sourceId",j.description,j.status,j.created_at as "createdAt" from journal_entries j where j.id=${c.req.param('id')} and j.center_id=${auth.user.centerId!} limit 1`));
  if(!r.rows[0])return c.json({error:{code:'NOT_FOUND',message:'القيد غير موجود'}},404);
  const lines=await withDatabase(c.env,db=>db.execute(sql`select l.id,a.code as "accountCode",a.name as "accountName",l.description,l.debit,l.credit from journal_entry_lines l join accounting_accounts a on a.id=l.account_id where l.journal_entry_id=${c.req.param('id')} order by l.id`));
  return c.json({entry:r.rows[0],lines:lines.rows});
});
accountingRoutes.get('/reports/trial-balance',async c=>{
  const auth=await access(c,'purchases.read'); if('error' in auth)return auth.error;
  const r=await withDatabase(c.env,db=>db.execute(sql`select a.id,a.code,a.name,a.account_type as "accountType",coalesce(sum(case when j.id is not null then l.debit else 0 end),0)::numeric(18,2) as debit,coalesce(sum(case when j.id is not null then l.credit else 0 end),0)::numeric(18,2) as credit from accounting_accounts a left join journal_entry_lines l on l.account_id=a.id left join journal_entries j on j.id=l.journal_entry_id and j.center_id=a.center_id and j.status='posted' where a.center_id=${auth.user.centerId!} group by a.id order by a.code`));
  return c.json({accounts:r.rows});
});
accountingRoutes.get('/reports/income-statement',async c=>{
  const auth=await access(c,'purchases.read'); if('error' in auth)return auth.error;
  const r=await withDatabase(c.env,db=>db.execute(sql`select a.id,a.code,a.name,a.account_type as "accountType",coalesce(sum(case when j.id is not null then l.debit else 0 end),0)::numeric(18,2) as debit,coalesce(sum(case when j.id is not null then l.credit else 0 end),0)::numeric(18,2) as credit from accounting_accounts a left join journal_entry_lines l on l.account_id=a.id left join journal_entries j on j.id=l.journal_entry_id and j.center_id=a.center_id and j.status='posted' where a.center_id=${auth.user.centerId!} and a.account_type in ('revenue','expense') group by a.id order by a.account_type,a.code`));
  return c.json({accounts:r.rows});
});
accountingRoutes.get('/reports/balance-sheet',async c=>{
  const auth=await access(c,'purchases.read'); if('error' in auth)return auth.error;
  const r=await withDatabase(c.env,db=>db.execute(sql`select a.id,a.code,a.name,a.account_type as "accountType",coalesce(sum(case when j.id is not null then l.debit else 0 end),0)::numeric(18,2) as debit,coalesce(sum(case when j.id is not null then l.credit else 0 end),0)::numeric(18,2) as credit from accounting_accounts a left join journal_entry_lines l on l.account_id=a.id left join journal_entries j on j.id=l.journal_entry_id and j.center_id=a.center_id and j.status='posted' where a.center_id=${auth.user.centerId!} and a.account_type in ('asset','liability','equity') group by a.id order by a.account_type,a.code`));
  return c.json({accounts:r.rows});
});
accountingRoutes.get('/ledger/:accountId',async c=>{
  const auth=await access(c,'purchases.read'); if('error' in auth)return auth.error;
  const r=await withDatabase(c.env,db=>db.execute(sql`select a.id,a.code,a.name,a.account_type as "accountType" from accounting_accounts a where a.id=${c.req.param('accountId')} and a.center_id=${auth.user.centerId!} limit 1`));
  if(!r.rows[0])return c.json({error:{code:'NOT_FOUND',message:'الحساب غير موجود'}},404);
  const lines=await withDatabase(c.env,db=>db.execute(sql`select j.entry_number as "entryNumber",j.entry_date as "entryDate",j.description,l.debit,l.credit from journal_entry_lines l join journal_entries j on j.id=l.journal_entry_id and j.status='posted' where l.account_id=${c.req.param('accountId')} and j.center_id=${auth.user.centerId!} order by j.entry_date,j.created_at,l.id`));
  let balance=0; const ledger=lines.rows.map((x:any)=>{balance+=Number(x.debit)-Number(x.credit);return {...x,balance:balance.toFixed(2)};});
  return c.json({account:r.rows[0],ledger});
});
