CREATE TABLE IF NOT EXISTS purchase_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id uuid NOT NULL REFERENCES centers(id),
  purchase_order_id uuid NOT NULL REFERENCES purchase_orders(id),
  receipt_number varchar(100) NOT NULL,
  receipt_date date NOT NULL,
  status varchar(30) NOT NULL DEFAULT 'posted',
  notes text,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (center_id, receipt_number)
);

CREATE INDEX IF NOT EXISTS purchase_receipts_order_date_idx
  ON purchase_receipts(purchase_order_id, receipt_date);

CREATE TABLE IF NOT EXISTS purchase_receipt_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_receipt_id uuid NOT NULL REFERENCES purchase_receipts(id) ON DELETE CASCADE,
  purchase_order_item_id uuid NOT NULL REFERENCES purchase_order_items(id),
  product_id uuid NOT NULL REFERENCES products(id),
  quantity numeric(14,3) NOT NULL,
  unit_cost numeric(14,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS purchase_receipt_items_receipt_idx
  ON purchase_receipt_items(purchase_receipt_id);

CREATE INDEX IF NOT EXISTS purchase_receipt_items_order_item_idx
  ON purchase_receipt_items(purchase_order_item_id);
