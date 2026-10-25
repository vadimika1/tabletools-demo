// Деньги на 13 недель вперёд: приход по сезонности, расходы по платёжному календарю.
// Зарплата 5-го и 20-го, аренда 1-го, коммуналка 10-го, реклама раз в неделю, материалы и эквайринг
// вместе с выручкой, налог УСН 6% — раз в квартал, 25-го числа месяца после конца квартала.
// Начальный остаток — прибыль последних четырёх недель (не меньше нуля): столько свободных денег накоплено.
import { DAY_MS, DAYS_TOTAL } from '../engine/calendar.ts';
import { locsOf, spendOf, totals, type Dataset } from '../engine/dataset.ts';
import { ACQUIRING, pnl, TAX } from '../engine/money.ts';
import type { LocFilter } from '../engine/types.ts';

export const CASH_WEEKS = 13;
const RECENT_DAYS = 28;
const DAYS_PER_MONTH = 30.44;
const PAYROLL_DAYS = [5, 20] as const;
const RENT_DAY = 1;
const OTHER_DAY = 10;
const TAX_DAY = 25;
const TAX_MONTHS = [0, 3, 6, 9] as const; // январь, апрель, июль, октябрь — за прошлый квартал

export const CASH_LINES = [
  { key: 'payroll', name: 'Зарплаты' },
  { key: 'rent', name: 'Аренда' },
  { key: 'taxes', name: 'Налог УСН' },
  { key: 'ads', name: 'Реклама' },
  { key: 'materials', name: 'Материалы' },
  { key: 'other', name: 'Эквайринг и коммуналка' },
] as const;
export type CashKey = (typeof CASH_LINES)[number]['key'];

export interface CashWeek {
  k: number; // 0…12
  startIso: string; // первый день недели
  inflow: number;
  out: Record<CashKey, number>;
  outflow: number;
  balance: number; // остаток на конец недели
  low: number; // самый низкий остаток внутри недели
  lowIso: string; // день, когда он был
}

export interface CashForecast {
  opening: number;
  weeks: CashWeek[];
  inflow: number;
  outflow: number;
  closing: number;
  /** Неделя с самым низким остатком. */
  lowest: CashWeek;
  /** Первый день, когда остаток ушёл в минус, и глубина разрыва; null — разрыва нет. */
  gap: { iso: string; week: number; amount: number } | null;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const emptyOut = (): Record<CashKey, number> => ({ payroll: 0, rent: 0, taxes: 0, ads: 0, materials: 0, other: 0 });

export function cashForecast(ds: Dataset, loc: LocFilter): CashForecast {
  const p = ds.profile;
  const recent = [DAYS_TOTAL - RECENT_DAYS, DAYS_TOTAL] as const;
  const t = totals(ds, loc, recent);
  const openLocs = locsOf(ds, loc).filter((l) => ds.days[l.key]![DAYS_TOTAL - 1]!.open);
  const firstLoc = openLocs[0]?.key ?? p.locations[0]!.key;

  // Сезонность: убираем её из последних 4 недель и накладываем на будущие даты.
  let factorSum = 0;
  for (let i = recent[0]; i < recent[1]; i++) factorSum += p.monthFactor[ds.days[firstLoc]![i]!.month]!;
  const baseDaily = t.revenue / RECENT_DAYS / (factorSum / RECENT_DAYS);
  const revenueOn = (d: Date) => Math.round(baseDaily * p.monthFactor[d.getUTCMonth()]!);
  const materialsRate = t.revenue ? t.materials / t.revenue : 0;
  const adsWeek = Math.round((spendOf(t) / RECENT_DAYS) * 7);
  const rent = openLocs.reduce((s, l) => s + l.rentMonth, 0);
  const other = p.otherMonth * openLocs.length;
  const payrollHalf = (month: number) => Math.round((p.payrollShare * baseDaily * p.monthFactor[month]! * DAYS_PER_MONTH + p.adminMonth * openLocs.length) / 2);

  const dayOf = (offset: number) => new Date(ds.anchor.getTime() + offset * DAY_MS); // 0 — вчера, 1 — сегодня
  /** Выручка квартала: прошлые дни — из данных, будущие — из прогноза. */
  const quarterRevenue = (year: number, firstMonth: number) => {
    const start = Date.UTC(year, firstMonth, 1);
    const end = Date.UTC(year, firstMonth + 3, 1);
    let sum = 0;
    for (let ms = start; ms < end; ms += DAY_MS) {
      const offset = Math.round((ms - ds.anchor.getTime()) / DAY_MS);
      if (offset > 0) sum += revenueOn(new Date(ms));
      else {
        const i = DAYS_TOTAL - 1 + offset;
        if (i >= 0) sum += openLocs.reduce((s, l) => s + ds.days[l.key]![i]!.revenue, 0);
      }
    }
    return sum;
  };

  // Убыточная точка начинает с пустой кассы, а не с «минуса»: разрыв покажет первый крупный платёж.
  const opening = Math.max(0, pnl(ds, loc, recent).profit);
  let balance = opening;
  let gapAt: { iso: string; week: number } | null = null;
  const weeks: CashWeek[] = [];
  for (let k = 0; k < CASH_WEEKS; k++) {
    const out = emptyOut();
    let inflow = 0;
    let low = Infinity;
    let lowIso = '';
    for (let j = 1; j <= 7; j++) {
      const d = dayOf(k * 7 + j);
      const dom = d.getUTCDate();
      const m = d.getUTCMonth();
      const rev = revenueOn(d);
      inflow += rev;
      const dayOut = emptyOut();
      dayOut.materials = Math.round(rev * materialsRate);
      dayOut.other = Math.round(rev * ACQUIRING) + (dom === OTHER_DAY ? other : 0);
      if (j === 1) dayOut.ads = adsWeek;
      if (dom === RENT_DAY) dayOut.rent = rent;
      if ((PAYROLL_DAYS as readonly number[]).includes(dom)) dayOut.payroll = payrollHalf((m + 11) % 12);
      if (dom === TAX_DAY && (TAX_MONTHS as readonly number[]).includes(m)) {
        const qMonth = (m + 9) % 12;
        dayOut.taxes = Math.round(quarterRevenue(m === 0 ? d.getUTCFullYear() - 1 : d.getUTCFullYear(), qMonth) * TAX);
      }
      let spent = 0;
      for (const key of Object.keys(dayOut) as CashKey[]) { out[key] += dayOut[key]; spent += dayOut[key]; }
      balance += rev - spent;
      if (balance < low) { low = balance; lowIso = iso(d); }
      if (balance < 0 && !gapAt) gapAt = { iso: iso(d), week: k };
    }
    const outflow = Object.values(out).reduce((s, v) => s + v, 0);
    weeks.push({ k, startIso: iso(dayOf(k * 7 + 1)), inflow, out, outflow, balance, low, lowIso });
  }

  const lowest = weeks.reduce((a, w) => (w.low < a.low ? w : a), weeks[0]!);
  return {
    opening, weeks,
    inflow: weeks.reduce((s, w) => s + w.inflow, 0),
    outflow: weeks.reduce((s, w) => s + w.outflow, 0),
    closing: balance,
    lowest,
    gap: gapAt ? { ...gapAt, amount: lowest.low } : null,
  };
}
