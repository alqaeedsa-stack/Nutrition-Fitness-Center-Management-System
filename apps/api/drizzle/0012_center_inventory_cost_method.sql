-- Center default cost method used when a product does not override it.
ALTER TABLE centers
  ADD COLUMN IF NOT EXISTS inventory_cost_method varchar(20) NOT NULL DEFAULT 'standard';
