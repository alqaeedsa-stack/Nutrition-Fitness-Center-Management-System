-- Account-level properties and granular chart/report permissions.
alter table accounting_accounts add column if not exists statement_section varchar(40) not null default 'balance_sheet';
alter table accounting_accounts add column if not exists allow_reconciliation boolean not null default false;

update accounting_accounts
set statement_section = case
  when account_type in ('revenue','expense') then 'profit_loss'
  when account_type = 'equity' then 'equity'
  else 'balance_sheet'
end
where statement_section = 'balance_sheet';

insert into permissions(code,resource,action,description) values
('accounting.accounts.create','accounting_accounts','create','إنشاء حسابات دليل الحسابات'),
('accounting.accounts.update','accounting_accounts','update','تعديل حسابات دليل الحسابات'),
('accounting.accounts.duplicate','accounting_accounts','duplicate','تكرار حسابات دليل الحسابات'),
('accounting.accounts.archive','accounting_accounts','archive','أرشفة واستعادة حسابات دليل الحسابات'),
('accounting.accounts.delete','accounting_accounts','delete','حذف حسابات دليل الحسابات')
on conflict (code) do update set resource=excluded.resource,action=excluded.action,description=excluded.description;
