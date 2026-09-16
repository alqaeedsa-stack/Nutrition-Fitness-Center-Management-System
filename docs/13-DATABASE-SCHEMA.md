# 13 — Detailed PostgreSQL Database Schema

## 1. Conventions

- PostgreSQL is the authoritative database engine.
- Primary keys use UUIDs unless a documented performance reason requires another strategy.
- All mutable tables include `created_at` and `updated_at` where applicable.
- Business records include `created_by` / `updated_by` when operational accountability is required.
- Money uses `numeric`, never floating point.
- Timestamps are stored consistently in UTC; the center timezone is configuration used for display and business-date interpretation.
- Foreign keys are explicit.
- Unique constraints are database-enforced.
- Indexes are added for foreign keys and high-frequency filters.
- Soft deletion is used only where historical/audit requirements justify it.

## 2. Center / Tenant

### centers

- id PK
- code UNIQUE
- name
- timezone
- currency_code
- locale
- status
- created_at
- updated_at

The first deployment may contain one center, but business data should carry `center_id` where cross-center isolation could become relevant.

## 3. Identity

### users

- id PK
- center_id FK
- email nullable
- phone nullable
- password_hash nullable
- status
- last_login_at nullable
- created_at
- updated_at
- created_by nullable FK users
- updated_by nullable FK users

Indexes:

- `(center_id, status)`
- normalized login identifier(s)

### roles

- id PK
- center_id FK nullable for system roles
- code
- name
- status
- created_at
- updated_at

Unique: `(center_id, code)`

### permissions

- id PK
- code UNIQUE
- resource
- action
- description

### user_roles

- user_id FK
- role_id FK
- created_at

PK: `(user_id, role_id)`

### role_permissions

- role_id FK
- permission_id FK
- created_at

PK: `(role_id, permission_id)`

### staff_profiles

- id PK
- user_id FK UNIQUE
- staff_type
- display_name
- active
- created_at
- updated_at

### sessions

- id PK
- user_id FK
- session_token_hash UNIQUE
- created_at
- expires_at
- last_seen_at
- revoked_at nullable
- ip_address nullable
- user_agent nullable

Index: `(user_id, revoked_at, expires_at)`

## 4. Customer 360

### customers

- id PK
- center_id FK
- customer_number
- first_name
- last_name
- phone
- email nullable
- date_of_birth nullable
- gender nullable/configurable
- status
- source nullable
- notes nullable
- created_at
- updated_at
- created_by FK
- updated_by FK

Unique: `(center_id, customer_number)`

Indexes:

- `(center_id, phone)`
- `(center_id, status)`
- searchable name fields

### customer_goals

- id PK
- customer_id FK
- goal_type
- target_value nullable
- target_unit nullable
- target_date nullable
- status
- created_at
- updated_at

### customer_tags

- id PK
- center_id FK
- name
- code
- active

Unique: `(center_id, code)`

### customer_tag_links

- customer_id FK
- tag_id FK

PK: `(customer_id, tag_id)`

## 5. Measurements

### measurement_types

- id PK
- center_id FK nullable
- code
- name
- unit
- value_type
- min_value nullable
- max_value nullable
- active

Unique: `(center_id, code)`

### measurement_records

- id PK
- center_id FK
- customer_id FK
- measurement_type_id FK
- numeric_value nullable
- text_value nullable
- measured_at
- source
- recorded_by FK
- notes nullable
- created_at
- updated_at

Constraint: exactly one value representation is valid according to `measurement_type.value_type`.

Indexes:

- `(customer_id, measured_at DESC)`
- `(measurement_type_id, measured_at DESC)`

## 6. Appointments and Follow-up

### appointments

- id PK
- center_id FK
- customer_id FK
- assigned_staff_id FK
- appointment_type
- scheduled_start
- scheduled_end
- status
- notes nullable
- created_at
- updated_at
- created_by FK
- updated_by FK

Indexes:

- `(center_id, scheduled_start)`
- `(assigned_staff_id, scheduled_start)`
- `(customer_id, scheduled_start DESC)`

### follow_up_tasks

- id PK
- center_id FK
- customer_id FK
- assigned_to FK
- due_at
- priority
- status
- completed_at nullable
- result nullable
- notes nullable
- created_at
- updated_at

Index: `(assigned_to, status, due_at)`

## 7. Nutrition and Fitness Plans

### nutrition_plans

- id PK
- center_id FK
- customer_id FK
- specialist_id FK
- title
- goals nullable
- recommendations nullable
- start_date
- end_date nullable
- status
- version
- created_at
- updated_at

Unique/version rule: active revisions for the same logical plan are controlled by the application/domain rules.

### nutrition_plan_items

- id PK
- nutrition_plan_id FK
- meal_type
- item_name
- quantity nullable
- unit nullable
- calories nullable
- notes nullable
- sort_order

### fitness_plans

- id PK
- center_id FK
- customer_id FK
- specialist_id FK
- title
- goals nullable
- start_date
- end_date nullable
- status
- version
- created_at
- updated_at

### fitness_plan_exercises

- id PK
- fitness_plan_id FK
- exercise_name
- sets nullable
- repetitions nullable
- duration_seconds nullable
- rest_seconds nullable
- target_notes nullable
- sort_order

## 8. Products and Inventory

### categories

- id PK
- center_id FK
- parent_id nullable FK categories
- name
- code nullable
- active

Unique where business rule requires: `(center_id, code)`

### brands

- id PK
- center_id FK
- name
- code nullable
- active

### products

- id PK
- center_id FK
- sku
- name
- category_id FK
- brand_id nullable FK
- product_type
- purchase_cost numeric
- selling_price numeric
- tax_code/config reference
- reorder_point numeric
- active
- created_at
- updated_at

Unique: `(center_id, sku)`

### product_barcodes

- id PK
- product_id FK
- barcode
- barcode_type
- active

Unique: `(barcode)` or `(center_id, barcode)` depending on future multi-center barcode policy.

### suppliers

- id PK
- center_id FK
- name
- phone nullable
- email nullable
- tax_number nullable
- active
- created_at
- updated_at

### product_batches

- id PK
- center_id FK
- product_id FK
- supplier_id nullable FK
- lot_number nullable
- expiry_date nullable
- purchase_cost numeric
- quantity_received numeric
- created_at

Index: `(product_id, expiry_date)`

### stock_movements

- id PK
- center_id FK
- product_id FK
- batch_id nullable FK
- movement_type
- quantity numeric
- unit_cost numeric nullable
- reference_type nullable
- reference_id nullable
- occurred_at
- created_by FK
- notes nullable

The movement ledger is the source of truth for stock. Current quantity is calculated from movements or maintained as a controlled projection that can always be reconciled to the ledger.

Indexes:

- `(product_id, occurred_at DESC)`
- `(reference_type, reference_id)`
- `(center_id, occurred_at DESC)`

### stock_transfers

- id PK
- center_id FK
- source_location_id
- destination_location_id
- status
- created_at
- completed_at nullable
- created_by FK

### stock_transfer_items

- id PK
- transfer_id FK
- product_id FK
- quantity numeric
- batch_id nullable FK

Locations can remain a minimal single-location model initially, while preserving the extension point for multiple branches/storage locations.

## 9. Sales and Billing

### sales

- id PK
- center_id FK
- customer_id nullable FK
- cashier_id FK users
- sale_number
- status
- currency_code
- subtotal numeric
- discount_total numeric
- tax_total numeric
- grand_total numeric
- payment_status
- created_at
- updated_at

Unique: `(center_id, sale_number)`

### sale_items

- id PK
- sale_id FK
- product_id FK
- batch_id nullable FK
- quantity numeric
- unit_price numeric
- discount numeric
- tax numeric
- line_total numeric

### invoices

- id PK
- center_id FK
- sale_id nullable FK
- customer_id FK
- invoice_number
- status
- issue_date
- currency_code
- subtotal numeric
- discount_total numeric
- tax_total numeric
- grand_total numeric
- created_at
- updated_at

Unique: `(center_id, invoice_number)`

### payments

- id PK
- center_id FK
- sale_id nullable FK
- invoice_id nullable FK
- method
- amount numeric
- currency_code
- status
- paid_at nullable
- reference nullable
- created_by FK
- created_at

Business rule: payment must reference the appropriate sale/invoice according to the payment workflow; ambiguous orphan payments are prohibited.

### returns

- id PK
- center_id FK
- original_sale_id FK
- customer_id nullable FK
- return_number
- status
- subtotal numeric
- tax_total numeric
- grand_total numeric
- created_at
- created_by FK

### return_items

- id PK
- return_id FK
- original_sale_item_id FK
- product_id FK
- quantity numeric
- unit_price numeric
- tax numeric
- line_total numeric

Historical sales are immutable. Returns/reversals create explicit records and corresponding inventory movements.

## 10. Communication

### conversations

- id PK
- center_id FK
- customer_id nullable FK
- visibility_scope
- status
- created_at
- updated_at

### messages

- id PK
- conversation_id FK
- sender_user_id nullable FK
- sender_customer_id nullable FK
- body
- message_type
- created_at

Exactly one valid sender identity is required according to the conversation rules.

### internal_notes

- id PK
- center_id FK
- customer_id FK
- author_user_id FK
- body
- created_at
- updated_at

Internal notes are never returned by customer portal APIs.

## 11. Notifications

### notifications

- id PK
- center_id FK
- recipient_user_id nullable FK
- recipient_customer_id nullable FK
- type
- title
- body
- read_at nullable
- created_at

## 12. Reports and Activity Timeline

### reports

- id PK
- center_id FK
- customer_id nullable FK
- report_type
- status
- generated_by FK
- file_id nullable
- generated_at nullable
- created_at

### activity_timeline_entries

- id PK
- center_id FK
- customer_id FK
- event_type
- resource_type
- resource_id nullable
- actor_user_id nullable FK
- summary
- metadata JSONB nullable
- created_at

Timeline entries are a projection. They do not replace source records.

## 13. File Metadata

### files

- id PK
- center_id FK
- storage_provider
- storage_key UNIQUE
- original_name
- mime_type
- size_bytes
- checksum nullable
- resource_type nullable
- resource_id nullable
- uploaded_by FK
- created_at
- deleted_at nullable

Actual file bytes are stored in object storage, not in PostgreSQL.

## 14. Audit

### audit_logs

- id PK
- center_id nullable FK
- actor_user_id nullable FK
- action
- resource_type
- resource_id nullable
- result
- metadata JSONB nullable
- ip_address nullable
- user_agent nullable
- created_at

Index:

- `(center_id, created_at DESC)`
- `(resource_type, resource_id, created_at DESC)`
- `(actor_user_id, created_at DESC)`

## 15. Critical Transactions

### Sale + Inventory

A product sale must execute as one transaction:

```text
Validate permission
  -> validate product/price/tax
  -> create sale
  -> create sale items
  -> create payment/invoice as applicable
  -> create stock movement(s)
  -> create customer activity event if applicable
  -> create audit event
  -> commit
```

If a required step fails, the transaction rolls back.

### Return + Inventory

```text
Validate original sale
  -> validate return quantity
  -> create return
  -> create return items
  -> create stock return movement(s)
  -> create payment/refund record if applicable
  -> audit
  -> commit
```

### Inventory Adjustment

No direct `products.quantity` update is permitted as the authoritative mutation.

```text
Authorize
  -> record adjustment reason
  -> create stock movement
  -> audit
  -> commit
```

## 16. Indexing Strategy

Every high-volume foreign key receives an index unless query analysis demonstrates otherwise.

Expected high-frequency access patterns:

- Customer search by phone/name/number.
- Customer timeline by customer/date.
- Measurements by customer/date.
- Appointments by staff/date.
- Sales by customer/date/number.
- Inventory movements by product/date.
- Product lookup by SKU/barcode.
- Audit events by resource/user/date.

Indexes are validated with query plans after real usage patterns appear.

## 17. Deletion Policy

Hard deletion is prohibited for records that are part of financial, inventory, security or audit history.

Preferred alternatives:

- deactivate user
- archive product
- cancel appointment
- reverse/return sale
- deactivate plan
- soft-delete file metadata

Where deletion is legally/business-required, the operation must preserve necessary audit information without retaining unnecessary personal data.

## 18. Migration Policy

All schema changes are versioned migrations.

Rules:

- No manual production schema changes.
- Every migration is committed to Git.
- Destructive migrations require explicit review.
- Data migrations are separate from schema migrations when complexity warrants it.
- Rollback strategy is documented for every high-risk migration.

## 19. Seed Policy

Production contains no fake customer, sales, inventory or financial records.

Development/test seed data must be:

- clearly marked as test data
- generated only in development/test environments
- safe to delete/recreate
- excluded from production deployments
