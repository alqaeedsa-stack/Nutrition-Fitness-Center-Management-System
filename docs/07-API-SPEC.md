# 07 — API Specification

## 1. API Principles

The API is a domain boundary, not a thin database wrapper.

- Validate input at the boundary.
- Authenticate protected requests.
- Authorize every protected action.
- Return explicit response DTOs.
- Never expose unrestricted database records.
- Use consistent error responses.
- Use pagination for collections.
- Support filtering/sorting only through controlled parameters.
- Use idempotency where repeated requests could create duplicate financial operations.

## 2. Resource Groups

Indicative resource families:

- `/auth`
- `/users`
- `/roles`
- `/permissions`
- `/customers`
- `/measurements`
- `/appointments`
- `/follow-ups`
- `/nutrition-plans`
- `/fitness-plans`
- `/products`
- `/inventory`
- `/sales`
- `/invoices`
- `/payments`
- `/returns`
- `/messages`
- `/notifications`
- `/reports`
- `/audit`
- `/dashboard`

Exact routes are implementation details and must follow the final framework conventions.

## 3. Authentication Contract

Login:

`POST /auth/login`

Responsibilities:
- validate credentials
- authenticate identity
- establish secure session/token
- return minimal account/session information

Logout:

`POST /auth/logout`

Session/current user:

`GET /auth/me`

Password/session recovery endpoints will be added after the authentication architecture is finalized.

## 4. Authorization Contract

For each protected endpoint:

`Authentication → Permission check → Object-level scope check → Domain validation → Operation`

Example:

`GET /customers/{id}`

requires customer.read and the caller must be authorized to access that customer.

## 5. Customer API

Indicative operations:

- GET `/customers`
- POST `/customers`
- GET `/customers/{id}`
- PATCH `/customers/{id}`
- POST `/customers/{id}/deactivate`
- GET `/customers/{id}/timeline`

Search endpoints must use controlled indexed fields and pagination.

## 6. Measurement API

- GET `/customers/{id}/measurements`
- POST `/customers/{id}/measurements`
- PATCH `/measurements/{id}` only when the business rule permits correction
- GET `/customers/{id}/measurements/comparison`

Historical records should normally be append-oriented; corrections must be auditable.

## 7. Appointment / Follow-up API

- GET `/appointments`
- POST `/appointments`
- PATCH `/appointments/{id}`
- POST `/appointments/{id}/status`
- GET `/follow-ups`
- POST `/follow-ups`
- PATCH `/follow-ups/{id}`
- POST `/follow-ups/{id}/complete`

## 8. Plans API

- GET `/customers/{id}/nutrition-plans`
- POST `/customers/{id}/nutrition-plans`
- POST `/nutrition-plans/{id}/publish`
- GET `/customers/{id}/fitness-plans`
- POST `/customers/{id}/fitness-plans`
- POST `/fitness-plans/{id}/publish`

Publication endpoints require explicit permission and create an auditable state change.

## 9. POS API

A sale should be created through a transactional command rather than a sequence of unrelated public endpoints.

Indicative:

`POST /sales`

The server validates:
- customer scope
- products
- quantities
- prices
- discounts
- tax
- payment data
- inventory availability
- cashier permissions

Then executes the transaction.

Returns:

`POST /returns`

must reference the original sale and enforce return rules.

## 10. Inventory API

- GET `/products`
- POST `/products`
- PATCH `/products/{id}`
- GET `/products/{id}/stock`
- GET `/products/{id}/movements`
- POST `/inventory/receipts`
- POST `/inventory/adjustments`
- POST `/inventory/transfers`

Inventory writes must create controlled StockMovement records.

## 11. Communication API

- GET `/messages`
- POST `/messages`
- GET `/customers/{id}/messages`
- POST `/customers/{id}/messages`
- POST `/notes/internal`
- POST `/notes/customer-visible`

Visibility is enforced server-side.

## 12. Client Portal API

Portal endpoints should be separate in policy from staff APIs even when they share domain services.

Examples:

- GET `/portal/me`
- GET `/portal/me/measurements`
- GET `/portal/me/nutrition-plans`
- GET `/portal/me/fitness-plans`
- GET `/portal/me/appointments`
- GET `/portal/me/invoices`
- GET `/portal/me/purchases`
- GET `/portal/me/messages`

Portal endpoints must derive customer identity from the authenticated principal.

## 13. Error Model

Use a consistent structure such as:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": []
  }
}
```

Do not expose stack traces, SQL errors, secrets or internal infrastructure details to clients.

## 14. Pagination

Collection endpoints should support a consistent pagination model. The exact cursor/page strategy is a Phase 2 architecture decision.

## 15. Idempotency

Financial commands such as sale/payment creation should support an idempotency strategy to prevent duplicate operations caused by retries or double submissions.

## 16. Versioning

The API versioning strategy will be finalized before public API consumers exist. Internal application APIs should avoid unnecessary versioning complexity.
