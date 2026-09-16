# Architecture Decisions Register

## ADR-001 — Documentation First

**Status:** Accepted

No application code is introduced until the product baseline, data model, workflows, security model, UI/UX requirements, API contract and acceptance criteria exist.

**Reason:** The system contains tightly connected customer, sales, inventory, identity and portal domains. Early coding without a shared model would increase rework and data-integrity risk.

## ADR-002 — Modular Monolith as Initial Architecture

**Status:** Proposed for Phase 2 confirmation

The initial system should use a modular monolith with explicit domain boundaries rather than premature microservices.

**Reason:** The domains require strong transactional consistency and shared identity/authorization. A modular monolith provides simpler deployment and operations while preserving boundaries for future extraction.

## ADR-003 — Customer as Core Business Entity

**Status:** Accepted

Customer ID is the primary linkage for customer-centric operations.

**Reason:** Customer 360 is the central operational workflow and is shared by appointments, measurements, plans, sales, invoices, communication and portal access.

## ADR-004 — Inventory Ledger over Direct Quantity Editing

**Status:** Accepted

Stock changes are represented by controlled StockMovement records. Direct quantity mutation is not the primary business operation.

**Reason:** Auditability, reconciliation, returns, expiry/damage tracking and transactional integrity.

## ADR-005 — Server-Side Authorization

**Status:** Accepted

Frontend role-based visibility is a UX feature only. Backend/API/domain authorization is mandatory.

**Reason:** Client-controlled UI cannot be treated as a security boundary.

## ADR-006 — No Production Fake Data

**Status:** Accepted

Seed/test data must be isolated from production. Empty production datasets must display truthful empty states.

**Reason:** Fake numbers undermine operational trust and can create incorrect business decisions.

## Phase 2 Decisions Pending

- Framework and language
- Database engine
- ORM/data access layer
- Authentication/session provider or implementation
- Branch/tenant model
- Deployment platform
- Object/file storage
- Background jobs/queues
- Observability stack
- Test framework
