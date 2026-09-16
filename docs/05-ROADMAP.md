# 05 — Roadmap

## Phase 1 — Foundation Documentation

Deliverables:
- Product Blueprint
- Data Model
- Workflows
- Security & Privacy baseline
- Roadmap
- UI/UX specification
- API specification
- Acceptance criteria

Status: **In progress / baseline documented**

## Phase 2 — Architecture & Data Model

- Select application stack based on documented requirements.
- Finalize modular boundaries.
- Finalize database engine and ORM/data layer.
- Finalize tenancy/branch strategy.
- Define API conventions.
- Define error model.
- Define authentication/session strategy.
- Define testing architecture.
- Define deployment environments.

No feature implementation before this baseline is approved.

## Phase 3 — Authentication / Users / Roles / Permissions

- Authentication
- User lifecycle
- Staff profiles
- RBAC
- Permission enforcement
- Sessions
- Audit foundation

## Phase 4 — Customer 360

- Customer CRUD
- Search and duplicate prevention
- Customer profile
- Goals
- Activity timeline foundation
- Customer-level authorization

## Phase 5 — Measurements & Follow-up

- Configurable measurement types
- Measurement history/comparison
- Appointments
- Follow-up tasks
- Reminders
- Assignment and statuses

## Phase 6 — Nutrition & Fitness Plans

- Versioned nutrition plans
- Versioned fitness plans
- Exercises and schedules
- Publication/visibility
- Progress tracking

## Phase 7 — POS

- Product selection/barcode
- Customer selection
- Discounts/taxes
- Payments
- Invoice/receipt
- Returns
- Transactional sale flow

## Phase 8 — Inventory

- Products/categories/brands
- Suppliers
- Batches/lots
- Expiry
- Stock ledger
- Receiving
- Sale movements
- Returns
- Adjustments/damage/expiry/transfers
- Stock reconciliation

## Phase 9 — Communication

- Internal communication
- Customer-linked communication
- Internal vs customer-visible notes
- Tasks/mentions
- Notifications

## Phase 10 — Client Portal

- Customer authentication
- Customer-scoped data access
- Plans
- Measurements
- Appointments
- Reports
- Purchases/invoices
- Messages/notifications

## Phase 11 — Dashboard & Analytics

Operational dashboard, KPIs, queues, stock alerts, appointment/follow-up indicators and approved analytics.

## Phase 12 — Testing / Security / Hardening / Deployment

- Full regression
- Authorization matrix testing
- Security review
- Performance testing
- Backup/restore test
- Observability
- Production configuration
- Deployment
- Release checklist

## Release Gates

Each phase requires:

1. Requirements complete.
2. Acceptance criteria defined.
3. Implementation complete.
4. Automated tests for critical paths.
5. Authorization/security review.
6. No unresolved critical defects.
7. Documentation updated.
8. Production data separation verified.
