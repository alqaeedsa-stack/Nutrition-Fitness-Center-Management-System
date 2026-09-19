import type { ExecutionContext, ScheduledController } from '@cloudflare/workers-types';
import api from '../apps/api/src/index';
import { withDatabase } from '../apps/api/src/db/client';
import { recognizeDueSubscriptionSchedules } from '../apps/api/src/accounting/subscriptions';

type AssetsBinding = {
  fetch(request: Request): Promise<Response>;
};

type DatabaseBinding = {
  connectionString: string;
};

export interface Env {
  ASSETS: AssetsBinding;
  ENVIRONMENT: string;
  API_VERSION: string;
  HYPERDRIVE?: DatabaseBinding;
  DATABASE_URL?: string;
}

export default {
  async scheduled(_controller: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
    if (!env.HYPERDRIVE && !env.DATABASE_URL) return;
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map(p => [p.type, p.value]));
    const asOfDate = `${values.year}-${values.month}-${values.day}`;
    await withDatabase(env, db => db.transaction(async tx => {
      await recognizeDueSubscriptionSchedules(tx, asOfDate, null);
    }));
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/')) {
      return api.fetch(request, env);
    }

    return env.ASSETS.fetch(request);
  },
};
