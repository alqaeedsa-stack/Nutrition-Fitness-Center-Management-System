# 12 — Authentication & RBAC Architecture

## 1. Goal

Define a secure, server-enforced identity and permission model for staff and customers.

## 2. Actors

### Internal Staff

- Manager
- Specialist / Doctor
- Reception
- Cashier
- Inventory Staff
- Follow-up Staff
- Accountant

### External Actor

- Customer / Client Portal user

A user may have one or more roles. Permissions are additive unless an explicit deny model is introduced later. The first version uses allow-only permissions with least privilege.

## 3. Core Authorization Model

```text
User
  |
  +-- UserRole -- Role
                   |
                   +-- RolePermission -- Permission
                                          |
                                          +-- resource + action
```

Examples:

```text
customer.read
customer.create
customer.update
measurement.read
measurement.create
measurement.update
appointment.read
appointment.create
plan.read
plan.create
sale.create
sale.return
inventory.read
inventory.adjust
report.read
report.export
user.manage
role.manage
```

## 4. Authentication

### Login

1. User submits identifier + password over HTTPS.
2. Server validates input.
3. Server finds active user.
4. Server verifies password hash.
5. Server applies login/rate-limit rules.
6. Server creates an opaque session.
7. Server sends a Secure + HttpOnly + SameSite cookie.
8. Response never contains the password or password hash.

### Logout

- Server invalidates the session.
- Browser cookie is expired.
- Previously issued session identifiers cannot be reused.

### Password Reset

Password reset uses short-lived, single-use tokens stored as hashes where practical. Tokens are invalidated after use or expiration.

## 5. Session Model

### Session

- id PK
- user_id FK
- session_token_hash UNIQUE
- created_at
- expires_at
- last_seen_at
- revoked_at nullable
- ip_address nullable
- user_agent nullable

The raw session token is never stored in the database.

## 6. User Model

Minimum fields:

- id PK
- center_id FK
- email nullable where phone-only login is allowed
- phone nullable
- password_hash nullable for external identity users
- status
- last_login_at
- created_at
- updated_at
- created_by
- updated_by

Business rules:

- At least one configured login identifier is required.
- Login identifiers are normalized before comparison.
- Deactivated users cannot authenticate.
- User deletion is avoided when historical records depend on the identity; deactivation is preferred.

## 7. Role Model

Initial roles:

| Role | Primary responsibility |
|---|---|
| Manager | Center administration and broad operational oversight |
| Specialist | Customer care, measurements, plans and follow-up within assigned scope |
| Reception | Customers, appointments and operational front desk |
| Cashier | Sales, payments and returns within assigned authority |
| Inventory Staff | Products, stock and inventory operations |
| Follow-up Staff | Follow-up tasks and customer communication within scope |
| Accountant | Financial records, invoices, payments and financial reports |
| Customer | Own portal records only |

Role names are configuration data; application logic should check permission codes rather than hardcoding role names.

## 8. Resource Scope

A permission may require a scope in addition to the resource/action pair.

Initial scopes:

- `center`
- `own`
- `assigned`
- `customer`
- `all`

Examples:

```text
measurement.read + customer
measurement.update + assigned
report.read + all
customer.read + all
client_portal.read + own
```

The API must resolve the authenticated user's effective scope before executing the query.

## 9. Authorization Pipeline

Every protected API request follows:

```text
Request
  -> Session authentication
  -> User status check
  -> Permission check
  -> Resource ownership/scope check
  -> Input validation
  -> Business rule validation
  -> Transaction / query
  -> Audit event where required
  -> Response
```

Frontend visibility is not authorization. A hidden button must never be treated as proof that an operation is protected.

## 10. Customer Portal Isolation

A customer portal session can access only resources belonging to the authenticated customer.

The backend must derive the customer identity from the authenticated session. The client cannot choose an arbitrary `customer_id` to bypass ownership.

For example:

```text
GET /api/me/measurements
```

is preferred over exposing an unrestricted endpoint where the browser supplies any customer ID.

If an internal endpoint accepts a customer ID, the authorization layer must verify that the staff member is permitted to access that customer.

## 11. Sensitive Permissions

The following operations require explicit permissions and audit logging:

- User creation/deactivation.
- Role assignment.
- Permission changes.
- Customer identity/contact changes.
- Plan creation/update/versioning.
- Measurement edits/deletions.
- Sale cancellation.
- Return creation.
- Inventory adjustment.
- Manual financial adjustments.
- Report export containing sensitive customer information.
- File deletion.

## 12. Audit Event Structure

```text
AuditLog
- id
- center_id
- actor_user_id nullable
- action
- resource_type
- resource_id nullable
- result
- timestamp
- metadata JSON
- ip_address nullable
- user_agent nullable
```

Metadata must not unnecessarily store passwords, session tokens, payment secrets or other sensitive values.

## 13. API Rules

- All protected routes require authentication middleware.
- All protected mutations require permission checks.
- Input is validated before business logic.
- IDs are treated as untrusted input.
- Authorization queries include the appropriate center/ownership scope.
- Server-generated fields cannot be supplied by the client when they should be authoritative.
- Financial and inventory mutations use transactions.

## 14. Rate Limiting

At minimum rate-limit:

- Login.
- Password reset requests.
- Session creation.
- High-cost report generation.
- File upload initiation.
- Public/portal messaging endpoints.

Rate-limit keys should avoid storing more identifying information than necessary.

## 15. Security Boundaries

```text
Browser
  |
  | HTTPS
  v
Cloudflare Worker
  |
  +-- Authentication
  +-- Authorization
  +-- Validation
  +-- Domain logic
  |
  v
PostgreSQL
```

The browser must never receive database credentials, privileged API keys or administrative secrets.

## 16. Testing Requirements

Authorization tests must cover:

1. Unauthenticated request -> rejected.
2. Authenticated user without permission -> rejected.
3. User with permission but wrong center -> rejected.
4. Customer accessing another customer's record -> rejected.
5. Staff accessing permitted customer -> allowed.
6. Deactivated user with old session -> rejected.
7. Expired session -> rejected.
8. Revoked session -> rejected.
9. Role change takes effect without relying on stale frontend state.
10. Sensitive mutations create audit events.
