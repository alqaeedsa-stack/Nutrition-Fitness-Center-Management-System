# Deployment Architecture

## Initial Recommendation

Use **Cloudflare for the web/application edge**, while keeping the primary relational database as an independently managed PostgreSQL service.

The recommended production shape is:

```text
                    Internet
                       |
                Cloudflare Edge
                       |
              Web App / API Layer
                       |
          +------------+------------+
          |                         |
     PostgreSQL              Object Storage
          |                         |
   Core business data       Documents / media
```

## Why Cloudflare

Cloudflare is a strong fit for the initial deployment because the project is cost-sensitive and web-first. Workers Free currently provides 100,000 requests/day, while static asset requests are free and unlimited. Workers Builds Free includes 3,000 build minutes/month. Cloudflare D1 is also available on the Free plan, but this project should not select D1 merely because it is free; PostgreSQL is the preferred relational database baseline for the business domain. [1][2]

## Cloudflare Free Plan Constraints

The architecture must explicitly account for:

- 100,000 Workers requests/day on the Free plan
- 10 ms CPU time per invocation on Workers Free
- 128 MB memory per invocation
- 100 MB maximum request body on the Free Cloudflare account tier
- 3,000 build minutes/month for Workers Builds Free

These limits are acceptable for an initial controlled deployment, but they are not a promise that the free tier is sufficient for a large production customer base. [1][3]

## Database Decision

Do **not** make D1 the default production database merely to keep the entire system on one vendor.

The system contains:

- Customer records
- Measurements
- Plans
- Appointments
- Sales
- Invoices
- Inventory ledger
- Audit logs
- RBAC
- Transactional workflows

These requirements strongly favor a mature relational PostgreSQL model with strong constraints and transactions.

A managed PostgreSQL service can be connected to the Cloudflare application layer. The database provider can be changed later without rewriting the business domain if persistence boundaries remain clean.

## Free/Low-Cost Development Option

Supabase Free is a viable development/staging option because it currently provides a managed Postgres database with 500 MB database storage, 5 GB egress, 1 GB file storage, and up to 50,000 monthly active users. Free projects can be paused after one week of inactivity and the plan has no automatic backups. [4]

For this reason:

- Development: Supabase Free is acceptable.
- Early staging: Supabase Free may be acceptable.
- Production: do not treat a free tier with no automatic backups as the final disaster-recovery strategy.

## Why Not Vercel Hobby as the Default

Vercel Hobby is technically capable, but its current terms state that the Hobby plan is for personal, non-commercial use. Since this system is intended to become a real center-management product, Cloudflare is the cleaner free/low-cost starting point from a commercial-use perspective. [5]

## Production Upgrade Path

When usage grows:

```text
Cloudflare Free
      |
      v
Cloudflare Workers Paid
      |
      +--> higher request/CPU capacity
      |
      +--> PostgreSQL paid tier
      |
      +--> managed backups
      |
      +--> object storage / CDN
      |
      +--> observability
```

Cloudflare Workers Paid currently starts at $5/month and increases the included usage substantially. [1]

## Important Security Rule

The frontend must never connect directly to privileged database credentials.

The flow must be:

```text
Browser
  -> authenticated application/API
  -> authorization
  -> validated use case
  -> database
```

Secrets remain server-side.

## References

1. Cloudflare Workers pricing and limits: https://developers.cloudflare.com/workers/platform/pricing/
2. Cloudflare Pages pricing: https://developers.cloudflare.com/pages/functions/pricing/
3. Cloudflare Workers limits: https://developers.cloudflare.com/workers/platform/limits/
4. Supabase pricing: https://supabase.com/pricing
5. Vercel pricing and Hobby terms: https://vercel.com/pricing
