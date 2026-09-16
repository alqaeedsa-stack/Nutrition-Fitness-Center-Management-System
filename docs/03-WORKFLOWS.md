# 03 — Workflows

## 1. Authentication

1. User opens login screen.
2. Client submits credentials over HTTPS.
3. Server validates input and verifies the credential using the selected authentication provider.
4. Server creates a secure session/token according to the final auth architecture.
5. Client receives only what it needs to establish the authenticated session.
6. Every protected request is authenticated and then authorized.
7. Logout invalidates/revokes the session according to the selected strategy.

Credentials must never be logged, exposed in URLs, stored in plaintext, or returned by APIs.

## 2. Customer Registration

Reception or an authorized staff member:

1. Search existing customer by approved identifiers.
2. Prevent accidental duplicate registration.
3. Create Customer.
4. Record goals when provided.
5. Create initial activity entry.
6. Optionally create appointment/follow-up.
7. Audit the creation event.

## 3. Customer 360

Customer search → Customer profile → authorized sections → source records.

The UI may aggregate information, but each section remains backed by its domain source of truth.

## 4. Measurements

1. Select customer.
2. Select configured measurement type.
3. Enter validated value/unit/date.
4. Save MeasurementRecord.
5. Audit the change.
6. Update the Customer 360 measurement summary/projection.
7. Compare current vs previous/baseline when requested.

No historical measurement is overwritten by a new measurement.

## 5. Appointment

1. Select customer.
2. Select appointment type.
3. Select authorized staff member.
4. Validate schedule conflicts.
5. Create appointment.
6. Create reminder/notification when configured.
7. Record activity and audit event.

Status transitions must be explicit: scheduled → confirmed → completed/cancelled/no-show, subject to approved rules.

## 6. Follow-up

1. Create task linked to Customer.
2. Assign authorized staff member.
3. Set priority and due date.
4. Notify assignee if configured.
5. Staff records outcome.
6. Complete or reschedule.
7. Preserve history and audit important changes.

## 7. Nutrition Plan

1. Specialist opens authorized Customer 360.
2. Reviews current information and measurements.
3. Creates a versioned NutritionPlan.
4. Sets goals, recommendations, dates and status.
5. Publishes/activates according to role permissions.
6. Customer portal exposes only the approved customer-visible version.

Old plan versions remain historically traceable.

## 8. Fitness Plan

Same lifecycle as nutrition plans, with structured exercises and schedules. Customer-visible content must be explicitly publishable and separated from internal notes.

## 9. POS Sale

1. Cashier starts sale.
2. Selects customer when customer-linked sale is required.
3. Scans/selects products.
4. Validates price, availability, tax and discount permissions.
5. Calculates totals using server-side rules.
6. Creates Sale and SaleItems.
7. Creates invoice when required.
8. Records payment.
9. Creates StockMovement records for sold quantities.
10. Creates Customer purchase history/activity when customer-linked.
11. Writes audit event.
12. Commit transaction.

If a required step fails, the transaction rolls back.

## 10. Return

1. Locate original sale.
2. Validate return permission and quantity.
3. Create Return and ReturnItems.
4. Reverse commercial effects through explicit records.
5. Create stock-in movement where product is restockable.
6. Record payment/refund status.
7. Record customer activity and audit event.
8. Commit transaction.

Historical sale lines are not rewritten.

## 11. Inventory Receiving

1. Create/receive purchase record according to the final purchasing scope.
2. Validate product, quantity, batch/lot and expiry when applicable.
3. Create StockMovement of type Purchase.
4. Update any derived balance/projection.
5. Audit receiving operation.

## 12. Inventory Adjustment

Only authorized roles may perform adjustments.

Adjustment requires:
- Product
- Quantity/direction
- Reason
- Optional batch/lot
- Actor
- Timestamp

The system records a StockMovement; it does not silently overwrite quantity.

## 13. Expiry / Damage

Authorized staff create explicit Expired or Damaged movements with reason and batch where applicable. The operation is audited.

## 14. Communication

### Internal
Staff conversation/note → internal visibility policy → authorized staff only.

### Customer-visible
Staff creates a message/note → system validates visibility → customer sees only approved content through portal.

Internal notes must never be returned by a customer API endpoint.

## 15. Client Portal

1. Customer authenticates.
2. Server resolves authenticated customer identity.
3. Every query is scoped to that customer ID.
4. Server filters records by portal visibility/publication state.
5. Response contains only authorized fields.
6. Access to another customer's ID must fail regardless of URL manipulation.

## 16. Dashboard

Dashboard metrics are computed from real persisted records. Empty states must be shown when there is no data. No fake numbers or placeholder operational charts are allowed in production.

## 17. Audit Workflow

Sensitive mutation → domain service validates authorization → transaction performs mutation → audit event records actor/action/resource/timestamp and approved metadata.

Audit failure handling will be finalized with the transaction strategy; security-critical audit events must not silently disappear.
