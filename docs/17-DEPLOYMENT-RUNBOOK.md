# 17 — Deployment Runbook

## الهدف

تشغيل النظام على Cloudflare Workers مع فصل الواجهة عن API داخليًا، وربط API لاحقًا بـ Neon PostgreSQL عبر Cloudflare Hyperdrive.

## البنية الحالية

```text
Browser
  |
  v
nutrition-fitness-center-management-system
  |-- Static Assets (React/Vite)
  |
  +-- /api/* --> Service Binding --> nutrition-center-api
                              |
                              +--> Hyperdrive --> Neon PostgreSQL
```

Cloudflare Service Bindings تسمح للـ Web Worker باستدعاء API Worker داخليًا بدون إرسال الطلب عبر الإنترنت العام.

## ترتيب النشر

### 1. API Worker

من مجلد `apps/api`:

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm exec wrangler deploy
```

يجب أن يكون اسم الـ Worker المنشور:

```text
nutrition-center-api
```

### 2. Web Worker

من جذر المشروع:

```bash
pnpm install
pnpm typecheck
pnpm build
pnpm exec wrangler deploy
```

الـ Web Worker يستخدم Service Binding باسم `API` ويحوّل كل `/api/*` إلى `nutrition-center-api`.

## قاعدة البيانات

قاعدة البيانات المستهدفة هي PostgreSQL على Neon.

Cloudflare Hyperdrive هو طبقة الاتصال بين Worker وPostgreSQL.

لا يتم وضع:

- DATABASE_URL
- كلمة مرور Neon
- Hyperdrive credentials
- مفاتيح API

داخل GitHub.

## إعداد Hyperdrive

بعد إنشاء قاعدة Neon وإنشاء مستخدم مخصص للاتصال، أنشئ Hyperdrive باستخدام اتصال PostgreSQL.

مثال CLI:

```bash
npx wrangler hyperdrive create nutrition-center-db \
  --connection-string="postgres://USER:PASSWORD@HOST:5432/DATABASE"
```

احتفظ بمعرّف Hyperdrive خارج المستودع ثم أضفه إلى إعداد Worker الخاص بالـ API.

مثال:

```toml
[[hyperdrive]]
binding = "HYPERDRIVE"
id = "YOUR_HYPERDRIVE_ID"
```

## Migration

بعد ضبط `DATABASE_URL` محليًا، يتم توليد migrations ثم تطبيقها على قاعدة الاختبار/التطوير:

```bash
cd apps/api
pnpm db:generate
pnpm db:migrate
```

لا يتم تشغيل migration على Production قبل مراجعة SQL الناتج وأخذ نسخة احتياطية/نقطة استرجاع مناسبة.

## فحص النظام

بعد نشر API:

```text
/api/v1/health
```

يجب أن يعيد:

```json
{
  "ok": true,
  "service": "nutrition-center-api",
  "environment": "development",
  "version": "v1"
}
```

وبعد ربط قاعدة البيانات:

```text
/api/v1/health/db
```

يجب أن يعيد حالة اتصال قاعدة البيانات.

## ملاحظات أمنية

- Session cookies تكون HttpOnly وSecure وSameSite.
- صلاحيات API يتم تطبيقها في Backend وليس في الواجهة فقط.
- لا توجد بيانات مستخدمين وهمية في Production.
- لا يتم إنشاء مستخدم إداري بكلمة مرور ثابتة داخل الكود.
- بيانات Production وDevelopment منفصلة.
