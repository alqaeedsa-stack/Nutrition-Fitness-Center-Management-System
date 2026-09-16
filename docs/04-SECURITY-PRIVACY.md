# 04 — Security & Privacy

## 1. Security Baseline

The system handles identity, contact information, body measurements, plans, purchases and other potentially sensitive customer data. Security and privacy are treated as product requirements.

## 2. Authentication

- Use a proven authentication mechanism rather than custom cryptography.
- Passwords must be hashed with a modern password hashing algorithm and never stored plaintext.
- Enforce secure session lifecycle, expiry and logout.
- Protect authentication endpoints with rate limiting and abuse controls.
- Never place passwords, session secrets or tokens in logs.
- Secrets belong in environment/secret management, never source control.

## 3. Authorization / RBAC

Permission format:

`resource.action`

Examples:

- customer.read
- customer.create
- customer.update
- measurement.read
- measurement.create
- measurement.update
- appointment.read
- appointment.create
- sale.create
- sale.return
- inventory.read
- inventory.adjust
- report.read
- report.export

Authorization is enforced server-side at route/service/domain boundaries. Frontend visibility is only a UX feature.

## 4. Least Privilege

Default access is denied unless a role has the required permission. Sensitive capabilities such as inventory adjustment, returns, permission management and data export require explicit authorization.

## 5. Customer Isolation

Customer portal requests must derive customer identity from the authenticated session, not from a trusted client-supplied customer_id alone. Object-level authorization must prevent IDOR/BOLA vulnerabilities.

## 6. Internal vs Customer Data

Internal notes, staff communication, administrative metadata and unauthorized reports are never exposed through customer portal APIs. DTOs/serializers should explicitly define customer-visible fields rather than returning unrestricted database objects.

## 7. Input Security

- Validate all external input server-side.
- Enforce type, length, range, format and relationship validation.
- Use parameterized database access.
- Escape/sanitize content according to rendering context.
- Validate file type, size and storage policy for uploads.
- Reject unexpected fields where appropriate.

## 8. Transport & Storage

- HTTPS/TLS in production.
- Secure cookies when cookie sessions are used: Secure, HttpOnly and appropriate SameSite policy.
- Do not store sensitive tokens in unsafe browser storage without a documented threat model.
- Encrypt sensitive data at rest when required by the final hosting/database design and risk assessment.
- Backups must be protected and access-controlled.

## 9. CSRF / XSS / Injection

The final implementation must explicitly address:

- CSRF for cookie-authenticated state-changing requests.
- XSS through output encoding and safe rendering.
- SQL/ORM injection through parameterized access.
- SSRF if server-side URL fetching is ever introduced.
- File upload abuse if attachments are supported.

## 10. Audit Logging

AuditLog minimum fields:

- id
- user_id
- action
- resource_type
- resource_id
- timestamp
- metadata

Optional fields subject to privacy review:

- IP address
- user agent

Audit events include permission changes, user creation/deactivation, customer data mutations, measurement changes, plan publication, invoice creation, returns, inventory adjustments and destructive/deactivation operations.

## 11. Data Retention

Retention periods must be defined per data category before production. Do not retain personal data indefinitely by default. Deletion/deactivation workflows must account for legal, financial, operational and audit retention requirements.

## 12. Backup & Recovery

Before production define:

- backup frequency
- retention
- encryption
- access controls
- restore procedure
- recovery point objective (RPO)
- recovery time objective (RTO)
- restore testing cadence

A backup is not considered reliable until restoration has been tested.

## 13. Account Lifecycle

Support controlled account creation, activation, deactivation, password/session reset, role changes, and access revocation. Deactivated staff must lose access immediately or within the documented session policy.

## 14. Saudi Compliance

No Saudi regulatory requirement is assumed merely from the system's location. Before production, the applicable Saudi privacy, cybersecurity, tax/e-invoicing, health/sector and hosting requirements must be researched against current authoritative sources and mapped to concrete controls.

## 15. Security Testing

Before release:

- Authentication tests
- Authorization/RBAC tests
- Object-level access tests
- Input validation tests
- Session tests
- CSRF/XSS tests where applicable
- Rate-limit tests
- File upload tests if applicable
- Audit log tests
- Transaction consistency tests
- Dependency/security scanning
- Backup restore test

## 16. Security Definition of Done

A feature is not production-ready if it works only through the happy-path UI. Its API/service authorization, validation, audit behavior, error handling and relevant abuse cases must also be tested.
