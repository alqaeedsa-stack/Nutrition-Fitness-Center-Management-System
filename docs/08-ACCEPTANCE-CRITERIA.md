# 08 — Acceptance Criteria

## Global

- [ ] Every protected operation requires authentication.
- [ ] Every protected operation enforces backend authorization.
- [ ] Customer portal cannot access another customer's data.
- [ ] Internal notes never appear in customer-visible responses.
- [ ] Production UI contains no fake operational data.
- [ ] Critical mutations are auditable.
- [ ] API validation exists independently of frontend validation.
- [ ] Monetary calculations use decimal-safe storage/calculation.
- [ ] Business records preserve required history.

## Foundation & Administration

- [ ] Users can authenticate using the approved mechanism.
- [ ] Passwords are never stored plaintext.
- [ ] Roles can be assigned only by authorized users.
- [ ] Permissions are enforced server-side.
- [ ] Deactivated users cannot perform new authenticated operations.
- [ ] Permission changes are audited.

## Customer 360

- [ ] Authorized staff can create a customer.
- [ ] Duplicate prevention/search rules work.
- [ ] Customer profile aggregates authorized domain information.
- [ ] Customer ID is used consistently for customer-linked operations.
- [ ] Customer timeline reflects configured business events.

## Measurements

- [ ] Measurement types can be configured according to approved model.
- [ ] Measurements are stored historically.
- [ ] New measurements do not overwrite previous records.
- [ ] Previous/current/difference comparisons are correct.
- [ ] Unauthorized users cannot alter measurements.

## Appointments & Follow-up

- [ ] Appointment conflicts are validated.
- [ ] Authorized staff can assign follow-up tasks.
- [ ] Due and overdue states are correct.
- [ ] Status transitions follow defined rules.
- [ ] Reminder behavior follows configuration.

## Nutrition & Fitness

- [ ] Authorized specialists can create plans.
- [ ] Plans have explicit dates and status.
- [ ] Plan revisions remain traceable.
- [ ] Customer-visible publication is explicit.
- [ ] Internal content is not exposed through the portal.

## POS

- [ ] Cashier can select/search customer when required.
- [ ] Barcode/product selection works.
- [ ] Server validates prices, discounts, tax and quantities.
- [ ] Sale creation is transactional.
- [ ] Required invoice/payment records are consistent with sale state.
- [ ] Sale creates correct stock movements.
- [ ] Customer purchase history is updated for customer-linked sales.
- [ ] Failed transactions roll back required changes.
- [ ] Returns reference original sales and do not rewrite history.

## Inventory

- [ ] Product SKU and barcode uniqueness are database-enforced where required.
- [ ] Stock is reconcilable from movement history.
- [ ] Purchase/receiving creates movements.
- [ ] Sale creates outbound movement.
- [ ] Sale return creates inbound movement when restockable.
- [ ] Adjustments require permission and reason.
- [ ] Damage and expiry are explicit movement types.
- [ ] Batch/lot and expiry are supported where configured.
- [ ] Low-stock and expiry views use real persisted data.

## Communication

- [ ] Internal messages/notes are staff-only.
- [ ] Customer-visible communication is explicitly classified.
- [ ] Notifications have read/unread state.
- [ ] Unauthorized staff cannot access restricted conversations.

## Client Portal

- [ ] Customer can authenticate.
- [ ] Customer sees only their own authorized records.
- [ ] Customer cannot manipulate customer_id to access another customer.
- [ ] Customer sees only published/approved plans and reports.
- [ ] Customer cannot see internal notes or staff communication.

## Dashboard

- [ ] Dashboard metrics are computed from persisted data.
- [ ] Empty datasets display truthful empty states.
- [ ] Follow-up due/overdue counts are correct.
- [ ] Appointment counts are correct.
- [ ] Sales/invoice metrics match source records.
- [ ] Inventory alerts match stock/batch records.

## Security / Release

- [ ] Authentication abuse/rate limits are tested.
- [ ] RBAC matrix is tested.
- [ ] Object-level authorization is tested.
- [ ] Session lifecycle is tested.
- [ ] Input validation and injection defenses are tested.
- [ ] Relevant CSRF/XSS protections are tested.
- [ ] Audit logging is tested.
- [ ] Backup restore is tested.
- [ ] Production secrets are not committed.
- [ ] Dependencies are scanned.
- [ ] No critical unresolved security defects remain.
