# Technical Architecture Baseline

## Status
Proposed baseline — approved for design work, not yet application code.

## Architectural Style
The system will start as a **Modular Monolith**. Domains remain isolated through explicit module boundaries while sharing one application deployment and one transactional database.

Microservices are explicitly deferred until measurable operational or scaling requirements justify extraction.

## Core Domains

- Identity
- Administration
- Customers
- Appointments
- FollowUp
- Measurements
- Nutrition
- Fitness
- Reports
- Sales
- Inventory
- Communication
- Notifications
- ClientPortal
- Analytics
- Audit

## Layering

```text
Presentation / Web UI
        |
Application / Use Cases
        |
Domain Modules
        |
Infrastructure / Persistence / External Services
        |
Database
```

Business rules must not depend on UI components. Authorization must be enforced at the server/API boundary.

## Core Design Rules

1. Customer is the central business entity.
2. Every customer-linked operation carries a Customer ID where applicable.
3. Inventory quantity is derived from a stock ledger rather than arbitrary direct quantity edits.
4. Sale, invoice, stock movement and required customer activity records are committed transactionally.
5. RBAC is data-driven: Role -> Permission -> Resource + Action.
6. Client Portal access is isolated from internal staff data at the backend authorization layer.
7. Audit events are generated for security-sensitive and business-critical changes.
8. Measurement types should be configurable rather than forcing every possible measurement into the schema.
9. Production data must never depend on seed/mock records.
10. Test data must be isolated to test/development environments.

## Technology Selection Criteria

The final stack must satisfy:

- Strong TypeScript support or an equally robust typed alternative
- RTL-friendly UI ecosystem
- Server-side authorization
- PostgreSQL-class relational integrity or an equivalent relational database
- Transactions suitable for POS + Inventory
- Mature validation and testing tooling
- Straightforward Cloudflare-compatible deployment
- Local development without vendor lock-in
- Migration tooling
- Structured logging and observability

## Current Stack Decision

No framework, ORM, database provider, or authentication provider is permanently selected yet. The selection will be documented after comparing candidates against the criteria above.

## Deployment Direction

Preferred initial deployment direction:

```text
GitHub
  |
  +--> Cloudflare Pages / Workers (Web + API)
  |
  +--> Managed PostgreSQL provider
  |
  +--> Object storage for controlled file uploads
```

Cloudflare is the preferred application edge/hosting platform because the project is expected to be web-first, globally accessible, and cost-sensitive. The database should remain relational and independently replaceable rather than coupling the domain model to a platform-specific database too early.

## Environment Separation

```text
Development
   |
Test / CI
   |
Staging
   |
Production
```

Production secrets must never be committed to GitHub.

## Deferred Decisions

- Exact frontend framework
- Exact backend runtime/framework
- PostgreSQL provider
- ORM
- Authentication/session implementation
- File storage provider
- Email/SMS/WhatsApp provider
- Observability provider

These decisions require architecture evaluation, not assumptions.
