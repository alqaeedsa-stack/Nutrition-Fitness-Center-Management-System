# Nutrition & Fitness Center Management System

## Project Status

**Phase 1 — Foundation Documentation**

This repository is intentionally documentation-first. No application code is introduced until the product model, data model, workflows, security model, UI/UX rules, API contract, roadmap, and acceptance criteria are reviewed.

## Product

A modular management system for nutrition, weight-loss, fitness, strength, supplements/products, customer follow-up, POS, inventory, communication, reporting, and a customer portal.

The **Customer** is the core business entity. Customer-linked operations must use a stable Customer ID.

## Architectural Direction

The initial target is a **Modular Monolith**, not microservices. Domains are separated logically so they can evolve independently and be extracted later if scale or organizational needs justify it.

Core domains:

- Identity
- Administration
- Customers
- Appointments
- Follow-up
- Measurements
- Nutrition
- Fitness
- Reports
- Sales
- Inventory
- Communication
- Notifications
- Client Portal
- Analytics
- Audit

The technology stack is deliberately not fixed in this phase. It will be selected after the architecture and data model are approved.

## Principles

1. Documentation before application code.
2. Customer 360 is the center of the product.
3. Backend authorization is mandatory; frontend hiding is not security.
4. RBAC uses roles, permissions, resources, and actions.
5. Inventory is ledger-based; direct quantity editing is not the primary stock mechanism.
6. Sale, invoice, stock movement, and required activity records must be transactionally consistent.
7. No fake production data.
8. Test/seed data must be isolated from production.
9. Sensitive operations are audited.
10. Arabic RTL is the primary UX direction, with mobile-first responsive support.
11. Security, privacy, validation, and auditability are architectural requirements, not post-launch additions.

## Documentation

- [Product Blueprint](docs/01-PRODUCT-BLUEPRINT.md)
- [Data Model](docs/02-DATA-MODEL.md)
- [Workflows](docs/03-WORKFLOWS.md)
- [Security & Privacy](docs/04-SECURITY-PRIVACY.md)
- [Roadmap](docs/05-ROADMAP.md)
- [UI/UX Specification](docs/06-UI-UX-SPEC.md)
- [API Specification](docs/07-API-SPEC.md)
- [Acceptance Criteria](docs/08-ACCEPTANCE-CRITERIA.md)

## Development Rule

No production application code should be added until the baseline architecture and data model have been reviewed and the relevant documentation is stable enough to serve as the implementation contract.
