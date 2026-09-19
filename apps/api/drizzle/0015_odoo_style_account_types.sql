ALTER TABLE accounting_accounts
  ADD COLUMN IF NOT EXISTS account_subtype varchar(50) NOT NULL DEFAULT 'asset_current',
  ADD COLUMN IF NOT EXISTS internal_group varchar(30) NOT NULL DEFAULT 'asset',
  ADD COLUMN IF NOT EXISTS is_deprecated boolean NOT NULL DEFAULT false;

UPDATE accounting_accounts
SET account_subtype = CASE
  WHEN account_type='asset' AND code IN ('1110') THEN 'asset_cash'
  WHEN account_type='asset' AND code IN ('1120') THEN 'asset_cash'
  WHEN account_type='asset' AND code IN ('1130') THEN 'asset_receivable'
  WHEN account_type='asset' AND code IN ('1140') THEN 'asset_current'
  WHEN account_type='asset' AND code IN ('1150','1160') THEN 'asset_current'
  WHEN account_type='asset' AND code IN ('1210','1220','1230','1240','1250','1260') THEN 'asset_fixed'
  WHEN account_type='asset' AND code IN ('1310') THEN 'asset_intangible'
  WHEN account_type='liability' AND code IN ('2110') THEN 'liability_payable'
  WHEN account_type='liability' AND code IN ('2130','2140','2150','2160') THEN 'liability_current'
  WHEN account_type='liability' AND code IN ('2210','2220') THEN 'liability_non_current'
  WHEN account_type='equity' THEN 'equity'
  WHEN account_type='revenue' AND code IN ('4310','4320') THEN 'income_other'
  WHEN account_type='revenue' THEN 'income'
  WHEN account_type='expense' AND code IN ('5410','5420') THEN 'expense_depreciation'
  WHEN account_type='expense' AND code IN ('5110','5120') THEN 'expense_direct_cost'
  ELSE CASE account_type
    WHEN 'asset' THEN 'asset_current'
    WHEN 'liability' THEN 'liability_current'
    WHEN 'equity' THEN 'equity'
    WHEN 'revenue' THEN 'income'
    WHEN 'expense' THEN 'expense'
    ELSE 'asset_current'
  END
END,
internal_group = CASE
  WHEN account_type='asset' THEN 'asset'
  WHEN account_type='liability' THEN 'liability'
  WHEN account_type='equity' THEN 'equity'
  WHEN account_type='revenue' THEN 'income'
  WHEN account_type='expense' THEN 'expense'
  ELSE 'asset'
END;

CREATE INDEX IF NOT EXISTS accounting_accounts_subtype_idx
  ON accounting_accounts(center_id, account_subtype, is_active);

CREATE INDEX IF NOT EXISTS accounting_accounts_parent_idx
  ON accounting_accounts(center_id, parent_id);

CREATE INDEX IF NOT EXISTS accounting_accounts_internal_group_idx
  ON accounting_accounts(center_id, internal_group, is_active);
