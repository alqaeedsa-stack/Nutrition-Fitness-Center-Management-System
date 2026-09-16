# 15 — UI Information Architecture

## Status
Approved baseline for implementation.

## 1. Global UX Direction

- Arabic RTL is the primary interface.
- Mobile-first, with responsive tablet and desktop layouts.
- Practical operational UI; avoid decorative AI-style visuals.
- Primary actions must be obvious and reachable with minimal navigation.
- Search and customer identification are first-class workflows.
- Destructive actions require explicit confirmation and appropriate permission.
- Empty states must explain what the user can do next; they must not contain fake records.

## 2. Global Navigation

### Manager
- الرئيسية
- العملاء
- المواعيد والمتابعة
- الخطط
- المبيعات
- المخزون
- التقارير
- الرسائل
- الموظفون والصلاحيات
- الإعدادات
- سجل التدقيق

### Specialist / Doctor
- الرئيسية
- العملاء
- المواعيد
- القياسات
- المتابعة
- الخطط الغذائية
- الخطط الرياضية
- التقارير
- الرسائل

### Reception
- الرئيسية
- العملاء
- المواعيد
- المتابعة
- الرسائل

### Cashier
- نقطة البيع
- المبيعات
- العملاء للبحث والربط
- المرتجعات حسب الصلاحية

### Inventory Staff
- المنتجات
- المخزون
- الحركات
- التسويات
- الموردون

### Accountant
- المبيعات
- الفواتير
- المدفوعات
- التقارير المالية التشغيلية

### Customer
- الرئيسية
- مواعيدي
- قياساتي
- خطتي الغذائية
- خطتي الرياضية
- فواتيري
- رسائلي
- الإشعارات

## 3. Customer 360

The customer page is the central operational screen.

Header:
- Customer name
- Customer number
- Status
- Primary contact
- Next appointment
- Key actions allowed by role

Tabs/sections:
1. Overview
2. Measurements
3. Follow-up
4. Appointments
5. Nutrition plans
6. Fitness plans
7. Purchases
8. Invoices
9. Messages
10. Reports
11. Timeline

The visible tabs must be permission-aware. Staff should not see modules they cannot access.

## 4. Operational Dashboard

Do not use fake metrics. Production dashboard widgets render only from actual authorized data.

Recommended first widgets:
- Today's appointments
- Follow-ups due today
- New customers today
- Sales today
- Low-stock products
- Outstanding operational tasks

Manager-only widgets may be added later after analytics definitions are finalized.

## 5. Customer Creation

Mobile priority:
1. Name
2. Mobile
3. Customer type/status if required
4. Goal
5. Optional additional information
6. Save

Do not force staff to complete fields that are not required for the current workflow.

## 6. Appointment Workflow

Calendar/list view must support:
- Date
- Staff
- Status
- Customer
- Appointment type

Appointment creation should require only fields necessary to schedule the appointment, with optional notes.

## 7. Measurement Workflow

Measurement entry should support fast repeated entry on mobile.

Show:
- Customer
- Measurement date/time
- Measurement type
- Value
- Unit
- Source
- Notes

Historical records remain visible and ordered by date.

## 8. Plan Workflow

Plan editor separates structured fields from notes.

Nutrition:
- Goal
- Duration
- Schedule
- Recommendations
- Meals/items when structured nutrition is introduced
- Revision history

Fitness:
- Goal
- Duration
- Schedule
- Exercises
- Sets/repetitions/duration when structured fitness is introduced
- Revision history

Publishing a plan creates a controlled revision; published history remains auditable.

## 9. POS Workflow

Primary sequence:
1. Search/scan product
2. Add item
3. Adjust quantity
4. Identify customer when required
5. Review subtotal/discount/tax/total
6. Select payment
7. Confirm sale
8. Show receipt/result

The UI must prevent unauthorized discount, price, return or stock actions through both UI and backend authorization.

## 10. Inventory Workflow

Primary screens:
- Product catalog
- Product detail
- Current stock
- Movement ledger
- Adjustments
- Suppliers
- Batches/expiry where enabled

Stock quantity displayed to users is a calculated operational balance derived from stock movements.

## 11. Forms & Validation

- Inline validation where practical.
- Required fields visibly marked.
- Arabic error messages for user-facing validation.
- Preserve entered values after recoverable validation errors.
- Disable duplicate submission while a mutation is in progress.
- Server validation is authoritative.

## 12. Responsive Rules

Mobile:
- Single-column primary workflows.
- Sticky or easily reachable primary action when useful.
- Avoid horizontal tables where a card/list representation is clearer.
- Use bottom sheets/drawers only when they improve task speed.

Tablet:
- Two-column layouts where useful.

Desktop:
- Sidebar navigation.
- Dense data tables for operational work.
- Multi-panel layouts where they improve productivity.

## 13. Accessibility

Minimum baseline:
- Keyboard navigation on desktop.
- Visible focus states.
- Semantic form labels.
- Adequate text contrast.
- Touch targets appropriate for mobile.
- Do not rely on color alone for status.
- Arabic text must remain readable without forced truncation of critical information.

## 14. Loading / Error / Empty States

Every data-driven screen must define:
- Loading state
- Empty state
- Error state
- Retry behavior where appropriate
- Permission-denied state

No fake records are permitted to make screens look populated.
