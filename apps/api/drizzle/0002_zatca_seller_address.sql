ALTER TABLE zatca_settings
  ADD COLUMN IF NOT EXISTS seller_street varchar(200),
  ADD COLUMN IF NOT EXISTS seller_building_number varchar(50),
  ADD COLUMN IF NOT EXISTS seller_city varchar(100),
  ADD COLUMN IF NOT EXISTS seller_postal_code varchar(20),
  ADD COLUMN IF NOT EXISTS seller_country_code varchar(2) NOT NULL DEFAULT 'SA';
