-- Product subscription revenue recognition settings and strict accounting links.
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS subscription_deferred_revenue_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS subscription_recognition_method varchar(30) NOT NULL DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS subscription_duration_months integer,
  ADD COLUMN IF NOT EXISTS subscription_daily_proration boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS products_subscription_enabled_idx
  ON products(center_id, product_type, subscription_deferred_revenue_enabled);

ALTER TABLE accounting_settings
  ADD COLUMN IF NOT EXISTS revenue_account_id uuid REFERENCES accounting_accounts(id),
  ADD COLUMN IF NOT EXISTS output_vat_account_id uuid REFERENCES accounting_accounts(id),
  ADD COLUMN IF NOT EXISTS cost_of_sales_account_id uuid REFERENCES accounting_accounts(id),
  ADD COLUMN IF NOT EXISTS accounts_receivable_account_id uuid REFERENCES accounting_accounts(id),
  ADD COLUMN IF NOT EXISTS deferred_revenue_account_id uuid REFERENCES accounting_accounts(id),
  ADD COLUMN IF NOT EXISTS subscription_revenue_account_id uuid REFERENCES accounting_accounts(id);

ALTER TABLE products ADD CONSTRAINT products_inventory_account_fk FOREIGN KEY (inventory_account_id) REFERENCES accounting_accounts(id);
ALTER TABLE products ADD CONSTRAINT products_cogs_account_fk FOREIGN KEY (cost_of_sales_account_id) REFERENCES accounting_accounts(id);
ALTER TABLE products ADD CONSTRAINT products_revenue_account_fk FOREIGN KEY (revenue_account_id) REFERENCES accounting_accounts(id);
ALTER TABLE products ADD CONSTRAINT products_purchase_account_fk FOREIGN KEY (purchase_account_id) REFERENCES accounting_accounts(id);
ALTER TABLE products ADD CONSTRAINT products_sales_return_account_fk FOREIGN KEY (sales_return_account_id) REFERENCES accounting_accounts(id);
ALTER TABLE products ADD CONSTRAINT products_purchase_return_account_fk FOREIGN KEY (purchase_return_account_id) REFERENCES accounting_accounts(id);
ALTER TABLE products ADD CONSTRAINT products_deferred_revenue_account_fk FOREIGN KEY (deferred_revenue_account_id) REFERENCES accounting_accounts(id);
ALTER TABLE products ADD CONSTRAINT products_subscription_revenue_account_fk FOREIGN KEY (subscription_revenue_account_id) REFERENCES accounting_accounts(id);
