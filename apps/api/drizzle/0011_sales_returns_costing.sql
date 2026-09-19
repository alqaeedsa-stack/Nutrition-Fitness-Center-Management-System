-- Sales return records and journal linkage for purchase returns.
CREATE TABLE IF NOT EXISTS sale_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id uuid NOT NULL REFERENCES centers(id),
  sale_id uuid NOT NULL REFERENCES sales(id),
  return_number varchar(100) NOT NULL,
  return_date date NOT NULL,
  status varchar(30) NOT NULL DEFAULT 'posted',
  subtotal numeric(14,2) NOT NULL DEFAULT 0,
  tax_total numeric(14,2) NOT NULL DEFAULT 0,
  grand_total numeric(14,2) NOT NULL DEFAULT 0,
  journal_entry_id uuid REFERENCES journal_entries(id),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sale_returns_center_number_uq UNIQUE(center_id, return_number)
);
CREATE INDEX IF NOT EXISTS sale_returns_sale_idx ON sale_returns(sale_id);

CREATE TABLE IF NOT EXISTS sale_return_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_return_id uuid NOT NULL REFERENCES sale_returns(id) ON DELETE CASCADE,
  sale_item_id uuid REFERENCES sale_items(id),
  product_id uuid NOT NULL REFERENCES products(id),
  quantity numeric(14,3) NOT NULL,
  unit_price numeric(14,2) NOT NULL,
  tax numeric(14,2) NOT NULL DEFAULT 0,
  line_total numeric(14,2) NOT NULL,
  unit_cost numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sale_return_items_return_idx ON sale_return_items(sale_return_id);
CREATE INDEX IF NOT EXISTS sale_return_items_product_idx ON sale_return_items(product_id);

ALTER TABLE purchase_returns
  ADD COLUMN IF NOT EXISTS journal_entry_id uuid REFERENCES journal_entries(id);
