# 02 — Data Model

## 1. Modeling Principles

- Use stable primary keys for all business entities.
- Use foreign keys for ownership and relationships.
- Add created_at and updated_at to mutable business records; add created_by/updated_by where operational audit needs them.
- Use status fields only where a state machine is defined.
- Apply unique constraints to business identifiers such as SKU and barcode where the business rule requires uniqueness.
- Index foreign keys and high-frequency search fields.
- Use soft deletion only where restoration/audit requirements justify it.
- Never store derived stock as the only source of truth; the movement ledger is authoritative.

## 2. Identity & Administration

### User
- id PK
- username/email/phone as configured login identifier
- password_hash or external identity reference
- status
- last_login_at
- created_at, updated_at

### Role
- id PK
- name
- code UNIQUE
- status

### Permission
- id PK
- resource
- action
- code UNIQUE (for example `customer.read`)

### UserRole
- user_id FK
- role_id FK
- UNIQUE(user_id, role_id)

### RolePermission
- role_id FK
- permission_id FK
- UNIQUE(role_id, permission_id)

### StaffProfile
- id PK
- user_id FK UNIQUE
- staff_type
- display_name
- active

### CenterSettings / NotificationSettings
Configuration entities scoped to the center/tenant model selected during architecture design.

### AuditLog
- id PK
- user_id FK nullable for system events
- action
- resource_type
- resource_id
- timestamp
- metadata JSON
- ip_address nullable
- user_agent nullable

## 3. Customer Domain

### Customer
- id PK
- customer_number UNIQUE
- identity/contact fields required by product scope
- status
- goals summary where appropriate
- created_at, updated_at
- created_by, updated_by

### CustomerGoal
- id PK
- customer_id FK
- goal_type/configurable reference
- target_value nullable
- target_date nullable
- status

### MeasurementType
- id PK
- code UNIQUE
- name
- unit
- value_type
- active

### MeasurementRecord
- id PK
- customer_id FK
- measurement_type_id FK
- value
- measured_at
- source
- recorded_by FK
- notes nullable

Index: `(customer_id, measured_at)`.

### Appointment
- id PK
- customer_id FK
- assigned_staff_id FK
- scheduled_start
- scheduled_end
- status
- appointment_type
- notes visibility classification

### FollowUpTask
- id PK
- customer_id FK
- assigned_to FK
- due_at
- status
- priority
- completed_at
- result/notes according to visibility rules

## 4. Plans

### NutritionPlan
- id PK
- customer_id FK
- specialist_id FK
- title
- goals
- recommendations
- start_date
- end_date nullable
- status
- version / revision strategy

### FitnessPlan
- id PK
- customer_id FK
- specialist_id FK
- title
- goals
- start_date
- end_date nullable
- status
- version / revision strategy

### PlanExercise / PlanSchedule
Child entities for structured exercise and schedule data rather than storing an entire plan as unstructured text.

## 5. Sales & Billing

### Sale
- id PK
- customer_id FK nullable only when anonymous sale is explicitly supported
- cashier_id FK
- sale_number UNIQUE
- status
- subtotal
- discount_total
- tax_total
- grand_total
- payment_status
- created_at

### SaleItem
- id PK
- sale_id FK
- product_id FK
- quantity
- unit_price
- discount
- tax
- line_total

### Invoice
- id PK
- sale_id FK where invoice originates from a sale
- customer_id FK
- invoice_number UNIQUE
- status
- issue_date
- totals

### Payment
- id PK
- sale_id/invoice_id FK as appropriate
- method
- amount
- status
- paid_at
- reference nullable

### Return / ReturnItem
Explicit return records referencing the original sale/item. Returns must not mutate historical sale lines.

## 6. Inventory

### Product
- id PK
- sku UNIQUE
- name
- category_id FK
- brand_id FK nullable
- purchase_cost
- selling_price
- tax configuration
- reorder_point
- active

### ProductBarcode
- id PK
- product_id FK
- barcode UNIQUE
- type

### Category
- id PK
- parent_id self FK nullable
- name
- active

### Brand
- id PK
- name
- active

### Supplier
- id PK
- name
- contact fields
- active

### ProductBatch
- id PK
- product_id FK
- supplier_id FK nullable
- lot_number
- expiry_date nullable
- cost

### StockMovement
- id PK
- product_id FK
- batch_id FK nullable
- movement_type
- quantity signed or directionally represented by a controlled schema
- reference_type
- reference_id
- occurred_at
- created_by FK

Index: `(product_id, occurred_at)` and reference fields.

Movement types include Purchase, Sale, Sale Return, Purchase Return, Adjustment, Damaged, Expired and Transfer.

### StockTransfer / StockTransferItem
Used when multiple locations are introduced; the initial single-center design should not create unnecessary complexity but must leave a clear extension path.

## 7. Communication & Notifications

### Conversation / Message
Customer-linked and staff/internal conversations must have explicit visibility scope.

### InternalNote
Accessible only to authorized staff.

### CustomerNote
Visible to the customer only when its visibility/status explicitly allows it.

### Notification
- id PK
- recipient_user_id/customer_id
- type
- title
- body
- read_at
- created_at

### Task / Mention
Optional structured collaboration records tied to users and business resources.

## 8. Reports & Activity

### Report
- id PK
- customer_id FK where customer-scoped
- report_type
- status
- generated_by
- generated_at
- access policy

### ActivityTimelineEntry
- id PK
- customer_id FK
- event_type
- resource_type
- resource_id
- actor_user_id nullable
- timestamp
- summary/metadata

The timeline is an operational projection of relevant events; it must not replace the source records.

## 9. Relationship Summary

- Customer 1:N MeasurementRecord
- Customer 1:N Appointment
- Customer 1:N FollowUpTask
- Customer 1:N NutritionPlan
- Customer 1:N FitnessPlan
- Customer 1:N Sale
- Customer 1:N Invoice
- Sale 1:N SaleItem
- Product 1:N SaleItem
- Product 1:N StockMovement
- Product 1:N ProductBatch
- User N:N Role
- Role N:N Permission
- Customer 1:N ActivityTimelineEntry

## 10. Integrity Rules

1. Foreign keys must prevent orphaned business records.
2. Historical sales and returns are immutable except through explicit reversal/return operations.
3. Stock balances must be reconcilable from stock movements.
4. Customer portal queries must always be scoped to the authenticated customer identity.
5. Staff queries must enforce authorization at service/API level.
6. Unique identifiers must be enforced by the database, not only by UI validation.
7. Monetary fields require an explicit currency strategy and decimal-safe storage; floating-point money is prohibited.
8. Time handling must use a defined timezone policy and store timestamps consistently.
9. Soft-deleted records must remain excluded from normal reads while remaining auditable where required.

## 11. Architecture Decisions Still Requiring Finalization

- Exact database engine.
- ORM/query layer.
- Multi-branch vs single-center tenancy model.
- Currency/tax configuration model.
- File/document storage model.
- Full-text search strategy.
- Event/outbox strategy if asynchronous integrations are introduced.
