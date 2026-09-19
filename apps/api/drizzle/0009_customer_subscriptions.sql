CREATE TABLE IF NOT EXISTS customer_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id uuid NOT NULL REFERENCES centers(id),
  customer_id uuid NOT NULL REFERENCES customers(id),
  product_id uuid NOT NULL REFERENCES products(id),
  sale_id uuid REFERENCES sales(id),
  start_date date NOT NULL,
  end_date date NOT NULL,
  status varchar(30) NOT NULL DEFAULT 'active',
  unit_price numeric(14,2) NOT NULL DEFAULT 0,
  notes text,
  created_by uuid NOT NULL REFERENCES users(id),
  updated_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_subscriptions_date_ck CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS customer_subscriptions_center_customer_date_idx
  ON customer_subscriptions(center_id, customer_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS customer_subscriptions_center_product_date_idx
  ON customer_subscriptions(center_id, product_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS customer_subscriptions_sale_idx
  ON customer_subscriptions(sale_id);
