import { sql } from 'drizzle-orm';

type CostMethod = 'standard' | 'average' | 'fifo';

function normalizeMethod(value: unknown): CostMethod {
  const v = String(value ?? '').toLowerCase();
  if (v === 'fifo') return 'fifo';
  if (v === 'average' || v === 'avco' || v === 'moving_average') return 'average';
  return 'standard';
}

type Layer = { quantity: number; unitCost: number };

async function movementLayers(tx: any, centerId: string, productId: string) {
  const result = await tx.execute(sql`
    select quantity, unit_cost as "unitCost"
    from stock_movements
    where center_id=${centerId} and product_id=${productId}
    order by occurred_at asc, id asc
  `);
  return result.rows as Array<{ quantity: string | number; unitCost: string | number | null }>;
}

function rebuildLayers(rows: Array<{ quantity: string | number; unitCost: string | number | null }>) {
  const layers: Layer[] = [];
  for (const row of rows) {
    const quantity = Number(row.quantity);
    if (!Number.isFinite(quantity) || Math.abs(quantity) < 0.000001) continue;
    const unitCost = Number(row.unitCost ?? 0);
    if (quantity > 0) {
      layers.push({ quantity, unitCost: Number.isFinite(unitCost) ? unitCost : 0 });
      continue;
    }
    let remaining = -quantity;
    for (let i = 0; i < layers.length && remaining > 0.000001; i++) {
      const consumed = Math.min(layers[i].quantity, remaining);
      layers[i].quantity -= consumed;
      remaining -= consumed;
    }
    for (let i = layers.length - 1; i >= 0; i--) {
      if (layers[i].quantity <= 0.000001) layers.splice(i, 1);
    }
  }
  return layers;
}

function fifoIssueCost(layers: Layer[], quantity: number, fallbackCost: number) {
  let remaining = quantity;
  let cost = 0;
  for (const layer of layers) {
    if (remaining <= 0.000001) break;
    const used = Math.min(layer.quantity, remaining);
    cost += used * layer.unitCost;
    remaining -= used;
  }
  if (remaining > 0.000001) cost += remaining * fallbackCost;
  return cost;
}

export async function getProductCost(tx: any, args: {
  centerId: string;
  productId: string;
  quantity: number;
  costMethod?: string | null;
  standardCost?: number;
}) {
  const quantity = Number(args.quantity);
  if (!(quantity > 0)) return 0;
  const fallback = Number(args.standardCost ?? 0);
  const method = normalizeMethod(args.costMethod);
  if (method === 'standard') return fallback;
  const rows = await movementLayers(tx, args.centerId, args.productId);
  const layers = rebuildLayers(rows);
  const onHand = layers.reduce((sum, layer) => sum + layer.quantity, 0);
  if (method === 'average') {
    if (onHand <= 0.000001) return fallback;
    const value = layers.reduce((sum, layer) => sum + layer.quantity * layer.unitCost, 0);
    return Math.max(0, value / onHand);
  }
  return fifoIssueCost(layers, quantity, fallback) / quantity;
}

export async function getOriginalSaleUnitCost(tx: any, args: {
  centerId: string;
  saleId: string;
  productId: string;
  fallbackCost: number;
}) {
  const result = await tx.execute(sql`
    select coalesce(sum(abs(quantity) * coalesce(unit_cost, 0)) / nullif(sum(abs(quantity)), 0), ${Number(args.fallbackCost)})
      as "unitCost"
    from stock_movements
    where center_id=${args.centerId}
      and product_id=${args.productId}
      and reference_id=${args.saleId}
      and reference_type in ('sale','pos_sale')
      and quantity < 0
  `);
  const value = Number((result.rows[0] as any)?.unitCost);
  return Number.isFinite(value) ? value : Number(args.fallbackCost);
}

export async function getInventoryValue(tx: any, args: {
  centerId: string;
  productId: string;
  costMethod?: string | null;
  standardCost?: number;
}) {
  const method = normalizeMethod(args.costMethod);
  if (method === 'standard') {
    const rows = await tx.execute(sql`
      select coalesce(sum(quantity),0) as "quantity"
      from stock_movements
      where center_id=${args.centerId} and product_id=${args.productId}
    `);
    return Number(rows.rows[0]?.quantity ?? 0) * Number(args.standardCost ?? 0);
  }
  const rows = await movementLayers(tx, args.centerId, args.productId);
  const layers = rebuildLayers(rows);
  return layers.reduce((sum, layer) => sum + layer.quantity * layer.unitCost, 0);
}
