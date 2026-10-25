// Деньги: P&L по точке и по сети. Сеть — сумма точек построчно, поэтому сходится до рубля.
import { avgCheck, locsOf, spendOf, totals, type Dataset } from './dataset.ts';
import type { LocFilter, LocKey, Win } from './types.ts';

const DAYS_PER_MONTH = 30.44;
export const ACQUIRING = 0.018; // эквайринг от выручки
export const TAX = 0.06; // УСН «доходы»

export const PNL_LINES = [
  { key: 'payroll', name: 'Зарплаты' },
  { key: 'rent', name: 'Аренда' },
  { key: 'materials', name: 'Материалы и закупки' },
  { key: 'ads', name: 'Реклама' },
  { key: 'acquiring', name: 'Эквайринг' },
  { key: 'other', name: 'Коммуналка, софт, связь' },
  { key: 'taxes', name: 'Налоги (УСН)' },
] as const;
export type CostKey = (typeof PNL_LINES)[number]['key'];

export interface Pnl extends Record<CostKey, number> {
  revenue: number;
  profit: number;
  margin: number;
}

function locPnl(ds: Dataset, loc: LocKey, win: Win): Omit<Pnl, 'margin'> {
  const p = ds.profile;
  const l = locsOf(ds, loc)[0]!;
  const t = totals(ds, loc, win);
  const months = t.openDays / DAYS_PER_MONTH;
  const revenue = t.revenue;
  const costs: Record<CostKey, number> = {
    payroll: Math.round(revenue * p.payrollShare + p.adminMonth * months),
    rent: Math.round(l.rentMonth * months),
    materials: t.materials,
    ads: spendOf(t),
    acquiring: Math.round(revenue * ACQUIRING),
    other: Math.round(p.otherMonth * months),
    taxes: Math.round(revenue * TAX),
  };
  const spent = Object.values(costs).reduce((s, v) => s + v, 0);
  return { revenue, ...costs, profit: revenue - spent };
}

export function pnl(ds: Dataset, f: LocFilter, win: Win): Pnl {
  const parts = locsOf(ds, f).map((l) => locPnl(ds, l.key, win));
  const sum = parts.reduce((a, x) => {
    const out = { ...a };
    for (const k of Object.keys(x) as (keyof typeof x)[]) out[k] = (a[k] ?? 0) + x[k];
    return out;
  }, {} as Omit<Pnl, 'margin'>);
  return { ...sum, margin: sum.revenue ? sum.profit / sum.revenue : 0 };
}

/** Прибыль на одну запись — сколько денег стоит пустой час или неявка. */
export function profitPerBooking(ds: Dataset, f: LocFilter, win: Win): number {
  const t = totals(ds, f, win);
  const variable = (ds.profile.payrollShare + ACQUIRING + TAX) * t.revenue + t.materials;
  return t.served ? (t.revenue - variable) / t.served : 0;
}

/** Средний чек в правилах отрасли — удобный доступ для блоков денег. */
export const checkIn = (ds: Dataset, f: LocFilter, win: Win): number => avgCheck(ds, totals(ds, f, win));
