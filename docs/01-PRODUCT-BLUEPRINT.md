# 01 — Product Blueprint

## 1. Vision

Provide one operational system for a nutrition and fitness center to manage the complete customer lifecycle: onboarding, goals, measurements, plans, appointments, follow-up, sales, inventory, invoices, communication, reporting, and customer self-service.

## 2. Target Users

- Center Manager: operations, configuration, staff, reporting, oversight.
- Specialist / Doctor: customer assessment, measurements, nutrition and fitness plans, follow-up.
- Reception: customer registration, appointments, reminders, customer lookup.
- Cashier: POS, customer selection, payments, invoices, receipts, returns according to permission.
- Inventory Staff: products, receiving, transfers, adjustments, batches, expiry, stock control.
- Follow-up Staff: assigned tasks, reminders, customer communication, follow-up history.
- Accountant: invoices, payments, returns, financial records and exports according to permission.
- Customer: restricted portal access to their own approved information.

## 3. Product Scope

### Foundation & Administration
Authentication, users, staff, roles, permissions, center settings, notification settings, audit logs.

### Customer 360
Profile, goals, measurements summary, appointments, follow-ups, nutrition plans, fitness plans, reports, purchases, invoices, messages, notifications, activity timeline.

### Appointments & Follow-up
Appointments, assignment, tasks, reminders, statuses, due dates, history.

### Measurements & Reports
Configurable measurement types, historical records, baseline/current comparison, difference and percentage change, reporting.

### Nutrition Plans
Goals, recommendations, start/end dates, status, assigned specialist, progress.

### Fitness Plans
Goals, exercises, schedules, start/end dates, status, assigned specialist, progress.

### POS
Customer selection, products, barcode, quantity, discount, tax, payment, invoice, receipt, returns.

### Inventory
Products, SKU, barcode, categories, brands, costs, selling prices, tax, stock, reorder point, suppliers, batches/lots, expiry, stock movement ledger.

### Communication
Staff messages, customer-linked communication, internal notes, customer-visible notes, tasks, mentions, notifications.

### Client Portal
Customer-owned profile, progress, measurements, plans, appointments, approved reports, purchases, invoices, messages and notifications.

### Management Dashboard
Operational KPIs and work queues rather than decorative cards: customers, follow-ups, appointments, sales, invoices, products, stock and expiry.

## 4. Core Product Rules

1. Customer is the core entity and every customer-linked operation references Customer ID.
2. A customer may have many measurements, appointments, follow-ups, plans, sales, invoices and messages.
3. Internal notes and customer-visible notes are separate security domains.
4. A customer may access only their own authorized portal data.
5. Staff access is determined by permissions, not by frontend visibility alone.
6. Measurement types should be configurable where practical.
7. Stock is derived from controlled stock movements and not from arbitrary quantity edits.
8. Sale/invoice/inventory changes that must remain consistent occur in one database transaction.
9. Returns reverse the relevant commercial and inventory effects through explicit records.
10. Deactivation/soft deletion is preferred over destructive deletion for business records where auditability matters.
11. Production screens must not contain fake operational numbers.

## 5. Non-Functional Requirements

- Arabic RTL first; responsive mobile, tablet and desktop.
- Fast workflows for reception, cashier and specialist roles.
- Server-side authorization for every protected operation.
- Input validation at API boundaries.
- Secure password/session handling.
- Auditability for sensitive operations.
- Transactional integrity for sales and inventory.
- Backups and recovery planning before production.
- Observable errors without leaking secrets or personal data.
- Architecture that can scale without premature microservices.

## 6. Out of Scope for Initial Baseline

- Microservice deployment solely for architectural fashion.
- AI-generated clinical or medical decisions.
- Unverified Saudi regulatory claims.
- Automatic integrations with external payment, tax, health, or messaging providers before their contracts and security requirements are defined.
- Full accounting ERP replacement; accounting capabilities are limited to the product scope approved for this system.

## 7. Future Expansion Candidates

Multiple branches, multi-tenant operation, external accounting integrations, payment gateways, messaging providers, advanced analytics, mobile applications, subscription billing, loyalty, and specialized clinical workflows.
