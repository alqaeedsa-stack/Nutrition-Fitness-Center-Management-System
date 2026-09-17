import { Client } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema';
import { customerAccounts } from './customer-accounts';

export type DatabaseBinding = {
  connectionString: string;
};

export type DatabaseEnv = {
  HYPERDRIVE?: DatabaseBinding;
  DATABASE_URL?: string;
};

export function createDatabase(env: DatabaseEnv) {
  const connectionString = env.HYPERDRIVE?.connectionString ?? env.DATABASE_URL;

  if (!connectionString) {
    throw new Error('Database connection is not configured');
  }

  const client = new Client({ connectionString });
  const db = drizzle({ client, schema: { ...schema, customerAccounts } });

  return { client, db };
}

export async function withDatabase<T>(env: DatabaseEnv, operation: (db: ReturnType<typeof createDatabase>['db']) => Promise<T>) {
  const { client, db } = createDatabase(env);

  await client.connect();
  try {
    return await operation(db);
  } finally {
    await client.end();
  }
}
