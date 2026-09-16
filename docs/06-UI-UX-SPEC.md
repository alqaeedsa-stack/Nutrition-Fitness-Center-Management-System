# 06 — UI/UX Specification

## 1. Design Direction

Professional operational software for a real center. Priorities are clarity, speed, consistency and error prevention.

Avoid:
- AI-looking decorative UI
- excessive gradients
- decorative shapes without meaning
- unnecessary animations
- fake charts or fake metrics
- meaningless icon overload

## 2. Layout

Arabic RTL is the primary direction. The interface must work on:

- Mobile first
- Tablet
- Desktop

Responsive layouts should adapt workflows rather than merely shrink desktop screens.

## 3. Navigation

Navigation should reflect business domains and user permissions. Users should not see modules they cannot use, while backend authorization remains mandatory.

Suggested high-level areas:

- Dashboard
- Customers
- Appointments & Follow-up
- Measurements
- Nutrition
- Fitness
- POS
- Inventory
- Communication
- Reports
- Administration

## 4. Customer 360 UX

Customer profile should provide a clear identity header and prioritized operational information, followed by sections/tabs for:

- Overview
- Goals
- Measurements
- Appointments
- Follow-up
- Nutrition
- Fitness
- Reports
- Purchases
- Invoices
- Messages
- Timeline

On mobile, use compact navigation and progressive disclosure rather than a very long single page.

## 5. Reception UX

Optimized tasks:
- Find/create customer quickly.
- View today's appointments.
- Confirm/reschedule/cancel.
- Create follow-up tasks.
- Access only relevant customer information.

## 6. Cashier UX

Optimized tasks:
- Start sale.
- Scan barcode/search product.
- Select customer.
- Review cart.
- Apply authorized discount.
- Collect payment.
- Complete invoice/receipt.
- Process authorized return.

The payment action must show the final amount clearly and require an explicit confirmation.

## 7. Specialist UX

Optimized tasks:
- Open assigned customer.
- Review recent measurements.
- Record new measurements.
- Create/update plans.
- Review follow-up history.
- Publish customer-visible plan/report content.

## 8. Inventory UX

Optimized tasks:
- Search product/SKU/barcode.
- View available stock and batches.
- Receive stock.
- Review movement ledger.
- Process authorized adjustments.
- Review low-stock and expiry queues.

## 9. Forms

- Label every field clearly.
- Validate near the point of entry.
- Preserve entered data when non-destructive validation fails.
- Distinguish required vs optional fields.
- Avoid oversized forms; group fields by business purpose.
- Confirmation dialogs are required for destructive or high-impact actions.

## 10. Tables

Tables must support mobile alternatives such as cards, horizontal scrolling only where appropriate, or focused detail views. Search, filter and sort must be designed around actual operational tasks.

## 11. Empty / Loading / Error States

Every data-driven screen must have:
- Loading state
- Empty state
- Error state
- Permission-denied state where relevant

Empty production data must not be replaced with fake examples.

## 12. Accessibility & Usability

- Sufficient text contrast.
- Keyboard support on desktop.
- Touch targets appropriate for mobile.
- Visible focus states.
- Semantic labels for forms and controls.
- Do not rely on color alone for status.

## 13. Notifications

Notifications should be actionable and contextual. Avoid notification spam. Critical system events and customer reminders must have clear status and read/unread behavior.

## 14. Dashboard

The dashboard is a work surface. Prioritize:

1. Tasks requiring attention.
2. Today's appointments.
3. Overdue follow-ups.
4. Sales/payment indicators.
5. Low-stock/expiry alerts.
6. Relevant customer activity.

Decorative charts are secondary to operational information.
