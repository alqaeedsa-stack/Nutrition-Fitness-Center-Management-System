create table if not exists accounting_accounts (
 id uuid primary key default gen_random_uuid(), center_id uuid not null references centers(id), parent_id uuid references accounting_accounts(id),
 code varchar(30) not null, name varchar(200) not null, account_type varchar(30) not null, is_active boolean not null default true,
 is_system boolean not null default false, created_by uuid references users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 constraint accounting_accounts_center_code_uq unique(center_id,code)
);
create index if not exists accounting_accounts_center_parent_idx on accounting_accounts(center_id,parent_id);
create table if not exists accounting_settings (
 center_id uuid primary key references centers(id), inventory_account_id uuid references accounting_accounts(id), input_vat_account_id uuid references accounting_accounts(id),
 accounts_payable_account_id uuid references accounting_accounts(id), cash_bank_account_id uuid references accounting_accounts(id), updated_by uuid references users(id), updated_at timestamptz not null default now()
);
create table if not exists journal_entries (
 id uuid primary key default gen_random_uuid(), center_id uuid not null references centers(id), entry_number varchar(50) not null, entry_date date not null,
 source_type varchar(50) not null, source_id uuid, description varchar(500) not null, status varchar(20) not null default 'posted',
 created_by uuid references users(id), posted_at timestamptz, created_at timestamptz not null default now(), constraint journal_entries_center_number_uq unique(center_id,entry_number)
);
create index if not exists journal_entries_center_date_idx on journal_entries(center_id,entry_date desc);
create index if not exists journal_entries_source_idx on journal_entries(source_type,source_id);
create table if not exists journal_entry_lines (
 id uuid primary key default gen_random_uuid(), journal_entry_id uuid not null references journal_entries(id) on delete cascade, account_id uuid not null references accounting_accounts(id),
 description varchar(500), debit numeric(18,2) not null default 0, credit numeric(18,2) not null default 0, created_at timestamptz not null default now(),
 constraint journal_entry_lines_nonnegative_chk check(debit>=0 and credit>=0), constraint journal_entry_lines_one_side_chk check(not(debit>0 and credit>0)),
 constraint journal_entry_lines_amount_chk check(debit>0 or credit>0)
);
create index if not exists journal_entry_lines_account_idx on journal_entry_lines(account_id);
alter table purchase_bills add column if not exists journal_entry_id uuid references journal_entries(id);
alter table purchase_payments add column if not exists journal_entry_id uuid references journal_entries(id);
create index if not exists purchase_bills_journal_entry_idx on purchase_bills(journal_entry_id);
create index if not exists purchase_payments_journal_entry_idx on purchase_payments(journal_entry_id);
