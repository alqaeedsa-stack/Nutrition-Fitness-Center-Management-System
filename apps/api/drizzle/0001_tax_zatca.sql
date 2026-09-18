CREATE TABLE IF NOT EXISTS tax_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id uuid NOT NULL REFERENCES centers(id),
  code varchar(50) NOT NULL,
  name varchar(150) NOT NULL,
  rate numeric(7,4) NOT NULL,
  category_code varchar(10) NOT NULL DEFAULT 'S',
  exemption_reason_code varchar(20),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tax_rates_center_code_uq UNIQUE (center_id, code)
);

CREATE INDEX IF NOT EXISTS tax_rates_center_active_idx ON tax_rates(center_id, active);

CREATE TABLE IF NOT EXISTS zatca_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id uuid NOT NULL UNIQUE REFERENCES centers(id),
  environment varchar(20) NOT NULL DEFAULT 'simulation',
  vat_number varchar(20),
  legal_name varchar(200),
  invoice_type_code varchar(10) NOT NULL DEFAULT '0200000',
  device_serial varchar(200),
  pih text,
  last_icv integer NOT NULL DEFAULT 0,
  status varchar(30) NOT NULL DEFAULT 'not_configured',
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS e_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id uuid NOT NULL REFERENCES centers(id),
  sale_id uuid UNIQUE REFERENCES sales(id),
  invoice_number varchar(100) NOT NULL,
  uuid uuid NOT NULL UNIQUE,
  invoice_type varchar(30) NOT NULL,
  status varchar(30) NOT NULL DEFAULT 'pending',
  invoice_hash text,
  xml text,
  qr_code text,
  reporting_status varchar(30),
  clearance_status varchar(30),
  response_code varchar(50),
  response_body jsonb,
  submitted_at timestamptz,
  reported_at timestamptz,
  cleared_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT e_invoices_center_number_uq UNIQUE (center_id, invoice_number)
);

CREATE INDEX IF NOT EXISTS e_invoices_center_status_idx ON e_invoices(center_id, status);
