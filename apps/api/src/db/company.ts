import { asc, eq } from 'drizzle-orm';
import { centers } from './schema';

/**
 * This application is single-company. The existing `centers` table is retained
 * as the internal company record so existing foreign keys and data stay intact.
 * The oldest active record is the canonical company record.
 */
export async function getCompany(db: any) {
  const rows = await db
    .select({ id: centers.id, name: centers.name, status: centers.status })
    .from(centers)
    .where(eq(centers.status, 'active'))
    .orderBy(asc(centers.createdAt))
    .limit(1);

  return rows[0] ?? null;
}
