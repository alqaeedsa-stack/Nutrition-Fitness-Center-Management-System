# 16 — Implementation Readiness

## Status
Foundation design is ready for the first application-code phase.

## Completed Design Baseline

- Product blueprint
- Data model
- Workflows
- Security/privacy baseline
- Roadmap
- UI/UX specification
- API specification
- Acceptance criteria
- Architecture decisions
- Technical architecture
- Deployment architecture
- Technology stack decision
- Authentication/RBAC architecture
- Database schema
- API contract
- UI information architecture

## First Implementation Slice

The first code slice is intentionally limited to platform foundation:

1. Repository application scaffold
2. TypeScript configuration
3. React application shell
4. Hono API shell
5. Cloudflare Workers configuration
6. Environment typing
7. PostgreSQL/Drizzle database foundation
8. Health/readiness endpoints
9. Shared validation/error primitives
10. Test harness
11. Basic RTL application shell
12. No production business module yet

## First Business Slice After Foundation

Authentication and administration:

- User model
- Session model
- Password hashing strategy
- Login/logout
- Current-session endpoint
- Roles
- Permissions
- User-role assignment
- Role-permission assignment
- Server-side authorization middleware
- Audit events for security-sensitive operations

## Definition of Done for Foundation

- `npm install` completes successfully.
- TypeScript check passes.
- Lint passes.
- Unit tests pass.
- Application builds successfully.
- Worker can start locally.
- Health endpoint returns a controlled response.
- Database connection is configuration-driven and does not contain credentials in source control.
- Database migrations can be generated/applied in a development database.
- No production secrets are committed.
- No fake production data exists.
- RTL shell renders on mobile and desktop.

## Implementation Guardrails

- Do not introduce business logic into UI components.
- Do not bypass API authorization for convenience.
- Do not add a second ORM or database access layer without an architecture decision.
- Do not introduce a global state library unless a concrete cross-screen state requirement exists.
- Do not add analytics or charts before their underlying definitions and data sources are specified.
- Do not build all modules at once. Complete and test one vertical slice at a time.

## Deployment Readiness

Cloudflare Workers + Hyperdrive is compatible with PostgreSQL and is the selected deployment direction. Cloudflare documents Hyperdrive support for PostgreSQL and recommends `pg` for Workers; Neon is explicitly supported. The actual Hyperdrive configuration and Neon credentials must be created outside source control and injected through the deployment environment.

## Next Engineering Action

Create the application scaffold and foundation only. Do not implement Customer, POS, Inventory, Nutrition or Fitness business screens in the same change.
