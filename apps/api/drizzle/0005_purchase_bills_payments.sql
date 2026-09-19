CREATE TABLE IF NOT EXISTS purchase_bills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id uuid NOT NULL REFERENCES centers(id),
  vendor_id uuid NOT NULL REFERENCES vendors(id),
  purchase_order_id uuid REFERENCES purchase_orders(id),
  bill_number varchar(100) NOT NULL,
  vendor_invoice_number varchar(100),
  bill_date date NOT NULL,
  due_date date,
  status varchar(30) NOT NULL DEFAULT 'draft',
  currency_code varchar(3) NOT NULL DEFAULT 'SAR',
  subtotal numeric(14,2) NOT NULL DEFAULT 0,
  tax_total numeric(14,2) NOT NULL DEFAULT 0,
  grand_total numeric(14,2) NOT NULL DEFAULT 0,
  paid_amount numeric(14,2) NOT NULL DEFAULT 0,
  balance_due numeric(14,2) NOT NULL DEFAULT 0,
  notes text,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT purchase_bills_center_number_uq UNIQUE(center_id, bill_number)
);
CREATE INDEX IF NOT EXISTS purchase_bills_vendor_date_idx ON purchase_bills(vendor_id, bill_date);
CREATE INDEX IF NOT EXISTS purchase_bills_status_idx ON purchase_bills(center_id, status);

CREATE TABLE IF NOT EXISTS purchase_bill_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_bill_id uuid NOT NULL REFERENCES purchase_bills(id) ON DELETE CASCADE,
  purchase_order_item_id uuid REFERENCES purchase_order_items(id),
  purchase_receipt_item_id uuid REFERENCES purchase_receipt_items(id),
  product_id uuid REFERENCES products(id),
  description varchar(250) NOT NULL,
  quantity numeric(14,3) NOT NULL,
  unit_cost numeric(14,2) NOT NULL,
  tax_rate numeric(7,4) NOT NULL DEFAULT 0,
  tax_amount numeric(14,2) NOT NULL DEFAULT 0,
  line_total numeric(14,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS purchase_bill_items_bill_idx ON purchase_bill_items(purchase_bill_id);
CREATE INDEX IF NOT EXISTS purchase_bill_items_order_item_idx ON purchase_bill_items(purchase_order_item_id);
CREATE INDEX IF NOT EXISTS purchase_bill_items_receipt_item_idx ON purchase_bill_items(purchase_receipt_item_id);

CREATE TABLE IF NOT EXISTS purchase_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id uuid NOT NULL REFERENCES centers(id),
  vendor_id uuid NOT NULL REFERENCES vendors(id),
  bill_id uuid REFERENCES purchase_bills(id),
  payment_number varchar(100) NOT NULL,
  payment_date date NOT NULL,
  amount numeric(14,2) NOT NULL,
  payment_method varchar(50) NOT NULL,
  reference varchar(150),
  notes text,
  status varchar(30) NOT NULL DEFAULT 'posted',
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT purchase_payments_center_number_uq UNIQUE(center_id, payment_number)
);
CREATE INDEX IF NOT EXISTS purchase_payments_vendor_date_idx ON purchase_payments(vendor_id, payment_date);
CREATE INDEX IF NOT EXISTS purchase_payments_bill_idx ON purchase_payments(bill_id);
