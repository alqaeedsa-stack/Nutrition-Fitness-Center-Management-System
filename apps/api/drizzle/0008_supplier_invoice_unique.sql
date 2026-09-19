-- Supplier invoice number must be unique per vendor within a center.
-- NULL remains allowed for bills that do not carry a supplier invoice number.
CREATE UNIQUE INDEX IF NOT EXISTS purchase_bills_vendor_invoice_uq
ON purchase_bills(center_id, vendor_id, vendor_invoice_number)
WHERE vendor_invoice_number IS NOT NULL;
