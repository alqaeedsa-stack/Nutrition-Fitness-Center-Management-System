# 14 — API Contract

## Status
Approved baseline for implementation.

## 1. API Principles

- REST JSON API under `/api/v1`.
- JSON request/response bodies use camelCase.
- Database models remain internal; API DTOs are explicit contracts.
- Authentication uses secure, HttpOnly, SameSite cookies for browser sessions.
- Authorization is enforced on the server for every protected resource.
- Validation occurs at the API boundary before business logic.
- Errors use one predictable envelope.
- IDs are opaque strings at the API boundary.
- Dates/times use ISO 8601; server stores UTC and applies the configured center timezone for presentation.
- Money is returned as decimal-safe strings or structured money values, never binary floating-point values.

## 2. Response Contract

Success:
```json
{
  "data": {},
  "meta": {}
}
```

List:
```json
{
  "data": [],
  "meta": {
    "page": 1,
    "pageSize": 25,
    "total": 0
  }
}
```

Error:
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "fields": {}
  },
  "requestId": "..."
}
```

## 3. Authentication

- `POST /api/v1/auth/login`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/session`
- `POST /api/v1/auth/refresh` only if the selected session implementation requires rotation/refresh.

Login must not reveal whether an account exists through distinguishable error messages.

## 4. Administration

- `GET /api/v1/users`
- `POST /api/v1/users`
- `GET /api/v1/users/:id`
- `PATCH /api/v1/users/:id`
- `POST /api/v1/users/:id/deactivate`
- `GET /api/v1/roles`
- `POST /api/v1/roles`
- `PATCH /api/v1/roles/:id`
- `GET /api/v1/permissions`
- `PUT /api/v1/roles/:id/permissions`
- `GET /api/v1/audit-logs`
- `GET /api/v1/settings/center`
- `PATCH /api/v1/settings/center`

## 5. Customers

- `GET /api/v1/customers`
- `POST /api/v1/customers`
- `GET /api/v1/customers/:id`
- `PATCH /api/v1/customers/:id`
- `POST /api/v1/customers/:id/deactivate`
- `GET /api/v1/customers/:id/timeline`
- `GET /api/v1/customers/:id/summary`

Customer search supports controlled filters and pagination. Unbounded customer queries are prohibited.

## 6. Measurements & Follow-up

- `GET /api/v1/customers/:id/measurements`
- `POST /api/v1/customers/:id/measurements`
- `PATCH /api/v1/measurements/:id`
- `GET /api/v1/measurement-types`
- `POST /api/v1/measurement-types`
- `PATCH /api/v1/measurement-types/:id`
- `GET /api/v1/follow-ups`
- `POST /api/v1/follow-ups`
- `PATCH /api/v1/follow-ups/:id`
- `POST /api/v1/follow-ups/:id/complete`

## 7. Appointments

- `GET /api/v1/appointments`
- `POST /api/v1/appointments`
- `GET /api/v1/appointments/:id`
- `PATCH /api/v1/appointments/:id`
- `POST /api/v1/appointments/:id/cancel`
- `POST /api/v1/appointments/:id/complete`

The service layer must enforce staff scheduling and conflict rules.

## 8. Nutrition & Fitness

Nutrition:
- `GET /api/v1/customers/:id/nutrition-plans`
- `POST /api/v1/customers/:id/nutrition-plans`
- `GET /api/v1/nutrition-plans/:id`
- `PATCH /api/v1/nutrition-plans/:id`
- `POST /api/v1/nutrition-plans/:id/revise`

Fitness:
- `GET /api/v1/customers/:id/fitness-plans`
- `POST /api/v1/customers/:id/fitness-plans`
- `GET /api/v1/fitness-plans/:id`
- `PATCH /api/v1/fitness-plans/:id`
- `POST /api/v1/fitness-plans/:id/revise`

Published plan revisions are immutable; corrections create a new revision.

## 9. Products & Inventory

- `GET /api/v1/products`
- `POST /api/v1/products`
- `GET /api/v1/products/:id`
- `PATCH /api/v1/products/:id`
- `GET /api/v1/products/:id/stock`
- `GET /api/v1/products/:id/stock-movements`
- `POST /api/v1/stock-adjustments`
- `GET /api/v1/stock-adjustments/:id`
- `POST /api/v1/stock-transfers`
- `POST /api/v1/stock-transfers/:id/receive`
- `GET /api/v1/categories`
- `POST /api/v1/categories`
- `PATCH /api/v1/categories/:id`
- `GET /api/v1/suppliers`
- `POST /api/v1/suppliers`
- `PATCH /api/v1/suppliers/:id`

Direct arbitrary stock quantity updates are not allowed. All quantity changes must create controlled stock movements.

## 10. POS / Sales

- `POST /api/v1/sales/quote` optional pre-check calculation.
- `POST /api/v1/sales`
- `GET /api/v1/sales`
- `GET /api/v1/sales/:id`
- `POST /api/v1/sales/:id/return`
- `GET /api/v1/invoices`
- `GET /api/v1/invoices/:id`
- `POST /api/v1/payments`

Sale creation, payment allocation where applicable, inventory movement, and required timeline/audit records must use a database transaction.

## 11. Communication

- `GET /api/v1/conversations`
- `POST /api/v1/conversations`
- `GET /api/v1/conversations/:id/messages`
- `POST /api/v1/conversations/:id/messages`
- `GET /api/v1/notifications`
- `POST /api/v1/notifications/:id/read`

Internal notes are never returned by customer-portal endpoints.

## 12. Customer Portal

Portal routes are separated conceptually and authorization-scoped to the authenticated customer:

- `GET /api/v1/portal/me`
- `GET /api/v1/portal/appointments`
- `GET /api/v1/portal/measurements`
- `GET /api/v1/portal/nutrition-plans`
- `GET /api/v1/portal/fitness-plans`
- `GET /api/v1/portal/invoices`
- `GET /api/v1/portal/messages`
- `POST /api/v1/portal/messages`

A portal user must never supply another customer's ID to obtain another customer's data.

## 13. Pagination / Filtering

Default page size: 25.
Maximum page size: 100.

List endpoints must support deterministic ordering. Cursor pagination may be introduced for high-volume datasets.

## 14. HTTP Status Policy

- `200` successful read/update
- `201` resource created
- `204` successful action with no response body
- `400` malformed request
- `401` unauthenticated
- `403` authenticated but unauthorized
- `404` resource not found or not visible to caller
- `409` business conflict
- `422` validation/business input error when useful to distinguish from malformed requests
- `429` rate limited
- `500` unexpected server error

## 15. Security Requirements

- Never accept role/permission claims from the browser as authoritative.
- Never expose password hashes, session secrets, internal audit metadata or privileged database credentials.
- Apply request size limits.
- Validate content type and input schema.
- Rate-limit authentication and sensitive mutation endpoints.
- Use CSRF protection appropriate to cookie-based authentication.
- Log security-sensitive failures without logging secrets or sensitive payloads.
- Generate and return a request ID for operational tracing.

## 16. Versioning & Compatibility

The first public API is `/api/v1`.

Breaking changes require a new API version or an explicit migration strategy. Additive fields should not break clients.
