# 11 — Technology Stack Decision

## Status
Approved baseline for implementation.

This document locks the initial stack for the first application version. The choice prioritizes: zero-cost development/initial operation, Cloudflare compatibility, relational integrity, POS + Inventory transactions, security, maintainability, and the ability to migrate providers later.

## 1. Final Initial Stack

| Layer | Decision | Reason |
|---|---|---|
| Language | TypeScript | Strong typing across frontend, API and domain logic |
| Web UI | React | Mature ecosystem, RTL support, component reuse |
| Routing | React Router | Explicit routing without depending on a full-stack server runtime |
| API/runtime | Cloudflare Workers + Hono | Cloudflare-native, lightweight, typed HTTP APIs |
| Database | PostgreSQL | Strong relational integrity and transactions required by POS/Inventory |
| Database provider | Neon Free initially | PostgreSQL with a free tier and provider independence |
| DB connection from Workers | Cloudflare Hyperdrive | Cloudflare-supported PostgreSQL connectivity, pooling and query acceleration |
| ORM/query layer | Drizzle ORM | Typed SQL/relations, migrations, PostgreSQL support and low runtime overhead |
| Validation | Zod | Shared request/domain validation |
| Authentication | Server-side session cookies | Avoid long-lived browser tokens in localStorage |
| Password hashing | Argon2id-compatible implementation | Strong password storage; exact Workers-compatible library is validated during implementation |
| File storage | Cloudflare R2 Free initially | Object storage with free tier and no Internet egress charge |
| Hosting | Cloudflare Workers | Application and API on one platform |
| Source control | GitHub | Existing repository and CI/CD integration |
| Testing | Vitest + integration/API tests + Playwright | Unit, server and end-to-end coverage |

## 2. Why PostgreSQL

The system has relational and transactional requirements that are central to correctness:

- Customer-to-measurement/follow-up/plan relationships.
- Sale-to-sale-item relationships.
- Inventory movement ledger.
- Returns and reversals.
- Role-permission relationships.
- Audit records.
- Atomic POS + stock operations.

PostgreSQL is therefore the default database engine. The application must not depend on provider-specific SQL features unless there is a documented reason.

## 3. Why Neon Initially

Neon Free currently provides PostgreSQL at no charge and is suitable for development and an initial low-volume deployment. The database remains ordinary PostgreSQL, so the application is not structurally locked to Neon.

The free tier is an operating constraint, not a promise of production durability. Before real business-critical usage, backups, recovery objectives, capacity and provider SLA must be reviewed and the database plan upgraded if required.

## 4. Why Cloudflare

Cloudflare Workers Free currently provides 100,000 Worker requests per day. Hyperdrive is available on the Workers Free plan and can connect Workers to PostgreSQL. This gives the project a practical zero-cost application edge while retaining PostgreSQL as the system of record.

The architecture is therefore:

```text
GitHub
   |
   v
Cloudflare Workers
   |
   +-- React Web UI
   +-- Hono API
   +-- Authentication/session handling
   |
   v
Cloudflare Hyperdrive
   |
   v
Neon PostgreSQL

Cloudflare R2
   |
   +-- Customer documents
   +-- Reports/files
   +-- Controlled uploads
```

## 5. Why Not D1 as the Primary Database

Cloudflare D1 is useful and free, but it is not selected as the primary database for this project. The Free plan has a 500 MB maximum database size and daily read/write limits; exceeding daily included read/write limits can cause queries to fail until the limit resets.

More importantly, PostgreSQL better matches the project's relational, transactional and future migration requirements.

D1 may be evaluated later for a separate bounded workload, cache-like data, or a different product where SQLite semantics are preferable.

## 6. Why Not Supabase as the Primary Platform

Supabase Free remains a strong development option because it bundles PostgreSQL, Authentication, Storage and APIs. However, the current project architecture is intentionally Cloudflare-first and keeps the database/provider replaceable.

Supabase Free also has operational constraints such as free-project limits and project pausing behavior. It can be used for experimentation or a temporary alternative, but it is not the locked infrastructure choice for this repository.

## 7. Why Not Vercel as the Default

Vercel is technically capable, but the current project direction is Cloudflare-first and cost-sensitive. There is no technical reason to introduce another primary hosting platform when Workers already covers the application edge and API runtime.

## 8. Authentication Decision

Authentication is application-owned rather than delegated to a frontend-only identity mechanism.

Rules:

- Passwords are never stored in plaintext.
- Password hashes are never returned to clients.
- Browser authentication uses secure, HTTP-only cookies.
- Session identifiers are random, opaque and revocable.
- Sessions have expiration and optional idle timeout.
- Login attempts are rate-limited.
- Authorization is checked server-side for every protected operation.
- Deactivated users cannot create new sessions.

## 9. Multi-Tenant / Center Scope Decision

The first implementation supports one center/tenant context but the data model includes a `center_id`/tenant boundary where business data may need future multi-center isolation.

The system must not expose cross-center data simply because the current deployment contains one center.

## 10. Currency and Tax

Money is stored using PostgreSQL decimal/numeric types, never floating point.

Currency is explicit at the center configuration level and can be stored on financial records where historical reporting requires it.

Tax is configuration-driven. Saudi VAT assumptions must not be hardcoded into generic financial calculations.

## 11. File Storage

Files are stored in R2 rather than PostgreSQL binary columns.

Database records store:

- file id
- owner/resource type
- owner/resource id
- storage key
- original filename
- MIME type
- size
- checksum where appropriate
- uploaded_by
- created_at

Access to private files must use authorization-controlled download paths or short-lived signed access.

## 12. Provider Independence

The domain/application layer must not import Neon, Cloudflare or R2-specific APIs directly.

Provider-specific integrations belong in Infrastructure adapters.

The intended replacement path is:

```text
Neon PostgreSQL -> another PostgreSQL provider
Cloudflare R2  -> another S3-compatible object store
Cloudflare Workers -> another TypeScript-compatible runtime
```

without rewriting Customer, Sales, Inventory or other domain rules.

## 13. Free-Tier Operating Mode

For the initial phase, the project targets zero mandatory monthly infrastructure cost.

Expected baseline:

- Cloudflare Workers Free: $0
- Neon Free: $0
- Cloudflare R2 within free allowance: $0
- GitHub: existing repository / free usage where applicable

Free-tier limits are monitored. No architecture decision may assume that free-tier limits are unlimited.

## 14. Upgrade Triggers

Move from free infrastructure when one or more of the following becomes true:

- Real customer data requires stronger backup/recovery guarantees.
- Database storage or compute approaches provider limits.
- Worker request/CPU limits affect normal operations.
- R2 storage/operation usage exceeds free allowance.
- Required observability or retention exceeds free capabilities.
- SLA or contractual requirements require paid infrastructure.
- Business volume makes paid infrastructure economically justified.

## 15. Implementation Gate

Before application code begins, the following must exist:

1. Database schema specification.
2. Authentication and RBAC specification.
3. API boundary specification.
4. UI information architecture.
5. Acceptance criteria for Foundation and Customer 360.
6. Migration and seed policy.

No production application code is authorized before these design gates are complete.
