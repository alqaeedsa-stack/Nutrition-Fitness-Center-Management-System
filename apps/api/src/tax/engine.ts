import { and, eq } from 'drizzle-orm';
import { taxRates } from '../db/schema';

export type TaxInput = {
  taxCode?: string | null;
  quantity: number;
  unitPrice: number;
  discount?: number;
};

export type TaxResult = {
  taxCode: string | null;
  rate: number;
  categoryCode: string;
  taxableAmount: number;
  taxAmount: number;
  totalAmount: number;
};

function money(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export async function calculateTax(tx: any, centerId: string, input: TaxInput): Promise<TaxResult> {
  const taxableAmount = money(Math.max(0, input.quantity * input.unitPrice - (input.discount ?? 0)));

  if (!input.taxCode) {
    return {
      taxCode: null,
      rate: 0,
      categoryCode: 'O',
      taxableAmount,
      taxAmount: 0,
      totalAmount: taxableAmount,
    };
  }

  const rows = await tx.select({
    code: taxRates.code,
    rate: taxRates.rate,
    categoryCode: taxRates.categoryCode,
  }).from(taxRates).where(and(
    eq(taxRates.centerId, centerId),
    eq(taxRates.code, input.taxCode),
    eq(taxRates.active, true),
  )).limit(1);

  const rate = rows[0];
  if (!rate) {
    throw new Error(`TAX_RATE_NOT_CONFIGURED:${input.taxCode}`);
  }

  const percentage = Number(rate.rate);
  const taxAmount = money(taxableAmount * percentage / 100);

  return {
    taxCode: rate.code,
    rate: percentage,
    categoryCode: rate.categoryCode,
    taxableAmount,
    taxAmount,
    totalAmount: money(taxableAmount + taxAmount),
  };
}

export async function calculateTaxLines(tx: any, centerId: string, items: TaxInput[]) {
  const lines: TaxResult[] = [];
  for (const item of items) {
    lines.push(await calculateTax(tx, centerId, item));
  }
  return lines;
}
