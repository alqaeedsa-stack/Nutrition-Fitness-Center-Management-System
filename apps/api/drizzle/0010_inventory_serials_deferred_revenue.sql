-- Inventory valuation preference, automatic product serials, and subscription deferred revenue.
ALTER TABLE centers
  ADD COLUMN IF NOT EXISTS inventory_valuation_method varchar(20) NOT NULL DEFAULT 'perpetual';

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS serial_tracking boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS serial_prefix varchar(30);

CREATE TABLE IF NOT EXISTS product_serials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id uuid NOT NULL REFERENCES centers(id),
  product_id uuid NOT NULL REFERENCES products(id),
  serial_number varchar(120) NOT NULL,
  status varchar(30) NOT NULL DEFAULT 'available',
  sale_id uuid REFERENCES sales(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_serials_center_serial_uq UNIQUE(center_id, serial_number)
);
CREATE INDEX IF NOT EXISTS product_serials_product_status_idx ON product_serials(product_id,status);

CREATE TABLE IF NOT EXISTS subscription_revenue_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id uuid NOT NULL REFERENCES centers(id),
  subscription_id uuid NOT NULL REFERENCES customer_subscriptions(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  recognition_date date NOT NULL,
  amount numeric(14,2) NOT NULL,
  status varchar(30) NOT NULL DEFAULT 'pending',
  journal_entry_id uuid REFERENCES journal_entries(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT subscription_revenue_schedule_uq UNIQUE(subscription_id, recognition_date)
);
CREATE INDEX IF NOT EXISTS subscription_revenue_schedule_due_idx
  ON subscription_revenue_schedules(center_id, recognition_date, status);

ALTER TABLE customer_subscriptions
  ADD COLUMN IF NOT EXISTS deferred_revenue_account_id uuid REFERENCES accounting_accounts(id),
  ADD COLUMN IF NOT EXISTS revenue_account_id uuid REFERENCES accounting_accounts(id),
  ADD COLUMN IF NOT EXISTS recognition_method varchar(30) NOT NULL DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS recognized_amount numeric(14,2) NOT NULL DEFAULT 0;

ALTER TABLE accounting_settings
  ADD COLUMN IF NOT EXISTS deferred_revenue_account_id uuid REFERENCES accounting_accounts(id),
  ADD COLUMN IF NOT EXISTS subscription_revenue_account_id uuid REFERENCES accounting_accounts(id);
 
