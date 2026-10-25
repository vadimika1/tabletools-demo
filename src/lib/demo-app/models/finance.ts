// Модели раздела «Финансы»: каскад прибыли, P&L по точкам, структура расходов, юнит-экономика,
// скидки и долги клиентов, партнёры, запчасти в чеке. Чистые функции от набора данных и фильтров.
// Где цифры пересекаются с движком, они сходятся до рубля: части складываются в итог P&L.
import { avgCheck, locsOf, perHourOf, spendOf, totals, type Dataset } from '../engine/dataset.ts';
import { PNL_LINES, pnl, profitPerBooking, type CostKey, type Pnl } from '../engine/money.ts';
import { clientStats } from '../engine/clients.ts';
import { DAYS_TOTAL } from '../engine/calendar.ts';
import { jitter, rng, seedOf, splitInt } from '../engine/random.ts';
import type { LocFilter, LocKey, Win } from '../engine/types.ts';

const MIN_GROWTH_PP = 0.002;

const DAYS_PER_MONTH = 30.44;
const ratio = (a: number, b: number): number | null => (b ? a / b : null);

// ── f1: как сложилась прибыль ──

export interface ProfitStep { key: 'revenue' | CostKey | 'profit'; label: string; value: number; kind: 'total' | 'cost' | 'result' }

export interface ProfitCascade {
  steps: ProfitStep[];
  pnl: Pnl;
  prev: Pnl;
  /** Изменение маржи в долях (0,02 = +2 п.п.); null — в окне сравнения не было выручки. */
  marginDiff: number | null;
  /** Статья, которая сильнее всех выросла в доле от выручки. */
  grew: { key: CostKey; name: string; diff: number } | null;
}

export function profitCascade(ds: Dataset, loc: LocFilter, win: Win, prevWin: Win): ProfitCascade {
  const p = pnl(ds, loc, win);
  const pp = pnl(ds, loc, prevWin);
  const steps: ProfitStep[] = [
    { key: 'revenue', label: 'Выручка', value: p.revenue, kind: 'total' },
    ...PNL_LINES.map((l) => ({ key: l.key, label: l.name, value: p[l.key], kind: 'cost' as const })),
    { key: 'profit', label: 'Прибыль', value: p.profit, kind: 'result' },
  ];
  // Рост доли статьи меньше 0,2 п.п. — шум округления (налог — всегда 6%), такой рост не называем.
  let grew: ProfitCascade['grew'] = null;
  if (p.revenue && pp.revenue) {
    for (const l of PNL_LINES) {
      const diff = p[l.key] / p.revenue - pp[l.key] / pp.revenue;
      if (diff >= MIN_GROWTH_PP && (!grew || diff > grew.diff)) grew = { key: l.key, name: l.name, diff };
    }
  }
  return { steps, pnl: p, prev: pp, marginDiff: pp.revenue && p.revenue ? p.margin - pp.margin : null, grew };
}

// ── f2: P&L по точкам ──

export const COST_GROUPS: readonly { key: string; name: string; lines: readonly CostKey[] }[] = [
  { key: 'payroll', name: 'Зарплаты', lines: ['payroll'] },
  { key: 'rent', name: 'Аренда', lines: ['rent'] },
  { key: 'materials', name: 'Материалы', lines: ['materials'] },
  { key: 'ads', name: 'Реклама', lines: ['ads'] },
  { key: 'rest', name: 'Налоги и прочее', lines: ['acquiring', 'other', 'taxes'] },
];

export interface PnlRow {
  key: LocKey | 'total';
  name: string;
  pnl: Pnl;
  groups: number[]; // суммы по COST_GROUPS
  /** Прибыль к окну сравнения, ₽; null — точка тогда ещё не работала. */
  profitDiff: number | null;
  loss: boolean;
  /** Точка открылась недавно: сколько месяцев назад; null — давно работает. */
  openedMonthsAgo: number | null;
}

const NEW_LOC_DAYS = 365;
const groupSums = (p: Pnl) => COST_GROUPS.map((g) => g.lines.reduce((s, k) => s + p[k], 0));

export function pnlByLocation(ds: Dataset, loc: LocFilter, win: Win, prevWin: Win): { rows: PnlRow[]; total: PnlRow } {
  const rows = locsOf(ds, loc).map((l): PnlRow => {
    const p = pnl(ds, l.key, win);
    const pp = pnl(ds, l.key, prevWin);
    return {
      key: l.key, name: l.name, pnl: p, groups: groupSums(p),
      profitDiff: pp.revenue ? p.profit - pp.profit : null,
      loss: p.profit < 0,
      openedMonthsAgo: l.openedDaysAgo && l.openedDaysAgo < NEW_LOC_DAYS ? Math.max(1, Math.round(l.openedDaysAgo / DAYS_PER_MONTH)) : null,
    };
  });
  const p = pnl(ds, loc, win);
  const pp = pnl(ds, loc, prevWin);
  const total: PnlRow = {
    key: 'total', name: loc === 'all' ? 'Вся сеть' : 'Итого', pnl: p, groups: groupSums(p),
    profitDiff: pp.revenue ? p.profit - pp.profit : null, loss: p.profit < 0, openedMonthsAgo: null,
  };
  return { rows, total };
}

// ── f3: структура расходов ──

export const MAX_SLICES = 6;
export const OTHER_KEY = 'rest';

export interface CostSlice { key: string; name: string; value: number; ofCosts: number; ofRevenue: number | null; lines: CostKey[] }

/** Статьи расходов по убыванию; больше шести — мелкие складываются в «Прочее». Доли дают 100%. */
export function costStructure(ds: Dataset, loc: LocFilter, win: Win): { total: number; revenue: number; slices: CostSlice[] } {
  const p = pnl(ds, loc, win);
  const total = PNL_LINES.reduce((s, l) => s + p[l.key], 0);
  const sorted = [...PNL_LINES].sort((a, b) => p[b.key] - p[a.key]);
  const make = (key: string, name: string, lines: CostKey[]): CostSlice => {
    const value = lines.reduce((s, k) => s + p[k], 0);
    return { key, name, value, ofCosts: total ? value / total : 0, ofRevenue: ratio(value, p.revenue), lines };
  };
  const head = sorted.length > MAX_SLICES ? sorted.slice(0, MAX_SLICES - 1) : sorted;
  const tail = sorted.slice(head.length);
  const slices = head.map((l) => make(l.key, l.name, [l.key]));
  if (tail.length) slices.push(make(OTHER_KEY, 'Прочее', tail.map((l) => l.key)));
  return { total, revenue: p.revenue, slices };
}

// ── f4: юнит-экономика ──

export type UnitKey = 'check' | 'perHour' | 'perClient' | 'adShare' | 'payrollShare' | 'profitPerBooking';

export interface UnitRow { key: UnitKey; value: number | null; prev: number | null; format: 'rub' | 'pct'; goodWhen: 'up' | 'down' }

function unitValues(ds: Dataset, loc: LocFilter, win: Win): Record<UnitKey, number | null> {
  const t = totals(ds, loc, win);
  const p = pnl(ds, loc, win);
  const unique = clientStats(ds, loc, win).unique;
  return {
    check: t.served ? avgCheck(ds, t) : null,
    perHour: t.sold ? perHourOf(t) : null,
    perClient: ratio(t.revenue, unique),
    adShare: ratio(spendOf(t), t.revenue),
    payrollShare: ratio(p.payroll, p.revenue),
    profitPerBooking: t.served ? profitPerBooking(ds, loc, win) : null,
  };
}

const UNIT_META: readonly { key: UnitKey; format: UnitRow['format']; goodWhen: UnitRow['goodWhen'] }[] = [
  { key: 'check', format: 'rub', goodWhen: 'up' },
  { key: 'perHour', format: 'rub', goodWhen: 'up' },
  { key: 'perClient', format: 'rub', goodWhen: 'up' },
  { key: 'adShare', format: 'pct', goodWhen: 'down' },
  { key: 'payrollShare', format: 'pct', goodWhen: 'down' },
  { key: 'profitPerBooking', format: 'rub', goodWhen: 'up' },
];

export function unitEconomics(ds: Dataset, loc: LocFilter, win: Win, prevWin: Win): UnitRow[] {
  const now = unitValues(ds, loc, win);
  const prev = unitValues(ds, loc, prevWin);
  return UNIT_META.map((m) => ({ ...m, value: now[m.key], prev: prev[m.key] }));
}

// ── f6: скидки и неоплаченное ──

export interface PromoRow { key: string; name: string; amount: number; uses: number }
export interface DebtBucket { key: string; name: string; amount: number; count: number }

export interface Discounts {
  amount: number;
  prev: number;
  /** Доля скидок от выручки до скидок. */
  share: number | null;
  prevShare: number | null;
  promos: PromoRow[];
  unpaid: { kind: 'plans' | 'deposits'; total: number; count: number; buckets: DebtBucket[] };
}

const PROMOS: readonly { key: string; name: string; pct: number }[] = [
  { key: 'first', name: 'Первый визит', pct: 0.15 },
  { key: 'friend', name: 'Приведи друга', pct: 0.1 },
  { key: 'birthday', name: 'День рождения', pct: 0.2 },
  { key: 'loyal', name: 'Постоянным клиентам', pct: 0.07 },
  { key: 'season', name: 'Акция месяца', pct: 0.12 },
  { key: 'blogger', name: 'Код блогера', pct: 0.1 },
];
const MIN_PROMOS = 4;
const UNPAID_DAYS = 90;
// Сколько от выручки за 90 дней висит неоплаченным: в клинике — рассрочки по планам лечения,
// у остальных — остатки после предоплаты или депозита.
const UNPAID_RATE = { plans: 0.05, deposits: 0.012 } as const;
const PLAN_REMAINDER = 55_000; // средний остаток по плану лечения, ₽
const DEBT_AGES = [
  { key: 'fresh', name: 'До 30 дней', weight: 0.55 },
  { key: 'mid', name: '30–60 дней', weight: 0.3 },
  { key: 'old', name: 'Больше 60 дней', weight: 0.15 },
] as const;

export function discounts(ds: Dataset, loc: LocFilter, win: Win, prevWin: Win): Discounts {
  const t = totals(ds, loc, win);
  const tp = totals(ds, loc, prevWin);
  const r = rng(seedOf(ds.profile.key, loc, 'promo', win[0], win[1]));
  const n = MIN_PROMOS + Math.floor(r() * (PROMOS.length - MIN_PROMOS + 1));
  const picked = PROMOS.slice(0, n);
  const amounts = splitInt(t.discounts, picked.map((_, k) => (n - k) * jitter(r, 0.3)));
  const check = avgCheck(ds, t);
  const promos = picked
    .map((x, k) => ({ key: x.key, name: x.name, amount: amounts[k]!, uses: check ? Math.round(amounts[k]! / (check * x.pct)) : 0 }))
    .sort((a, b) => b.amount - a.amount);

  const kind = ds.profile.key === 'clinic' ? 'plans' : 'deposits';
  const recent = totals(ds, loc, [DAYS_TOTAL - UNPAID_DAYS, DAYS_TOTAL]);
  const ru = rng(seedOf(ds.profile.key, loc, 'unpaid'));
  const total = Math.round(recent.revenue * UNPAID_RATE[kind] * jitter(ru, 0.15));
  const per = kind === 'plans' ? PLAN_REMAINDER : Math.max(1, avgCheck(ds, recent) * 0.5);
  const count = total ? Math.max(1, Math.round(total / per)) : 0;
  const bAmounts = splitInt(total, DEBT_AGES.map((a) => a.weight * jitter(ru, 0.25)));
  const bCounts = splitInt(count, bAmounts);
  return {
    amount: t.discounts, prev: tp.discounts,
    share: ratio(t.discounts, t.revenue + t.discounts), prevShare: ratio(tp.discounts, tp.revenue + tp.discounts),
    promos,
    unpaid: { kind, total, count, buckets: DEBT_AGES.map((a, k) => ({ key: a.key, name: a.name, amount: bAmounts[k]!, count: bCounts[k]! })) },
  };
}

// ── f7: партнёры и франшиза ──

export const ROYALTY = 0.08;

export interface PartnerRow { key: string; city: string; revenue: number; charged: number; received: number; owed: number }

const PARTNER_CITIES = ['Казань', 'Нижний Новгород', 'Екатеринбург', 'Новосибирск', 'Самара', 'Краснодар'];

/** Партнёрские точки в других городах: выручка, роялти 8%, сколько пришло и сколько должны. */
export function partners(ds: Dataset, win: Win): { rows: PartnerRow[]; total: PartnerRow } {
  const r = rng(seedOf(ds.profile.key, 'partners', win[0], win[1]));
  const cities = PARTNER_CITIES.filter((c) => c !== ds.profile.city);
  const n = 2 + (r() < 0.5 ? 1 : 0);
  const net = totals(ds, 'all', win);
  const perLoc = net.revenue / Math.max(1, ds.profile.locations.length);
  const rows = cities.slice(0, n).map((city, k): PartnerRow => {
    const revenue = Math.round(perLoc * (0.45 + r() * 0.45));
    const charged = Math.round(revenue * ROYALTY);
    // Один партнёр всегда задерживает оплату — ради этого блок и смотрят.
    const paidShare = k === n - 1 ? 0.35 + r() * 0.25 : 0.9 + r() * 0.1;
    const received = Math.min(charged, Math.round(charged * paidShare));
    return { key: `p${k}`, city, revenue, charged, received, owed: charged - received };
  });
  const sum = (f: (x: PartnerRow) => number) => rows.reduce((s, x) => s + f(x), 0);
  return { rows, total: { key: 'total', city: 'Все партнёры', revenue: sum((x) => x.revenue), charged: sum((x) => x.charged), received: sum((x) => x.received), owed: sum((x) => x.owed) } };
}

// ── x8: запчасти в чеке ──

export interface PartsRow {
  key: string;
  name: string;
  bookings: number;
  revenue: number; // выручка услуги вместе с запчастями
  partsRevenue: number; // запчасти в чеке по цене продажи
  partsCost: number; // закупка
  share: number | null; // доля запчастей в выручке услуги
  margin: number | null; // (продажа − закупка) / продажа
  markup: number | null; // (продажа − закупка) / закупка
}

const UPSELL_COST = 0.5; // себестоимость допродаж — как в генераторе
const MARKUP_MIN = 0.22;
const MARKUP_SPAN = 0.26;
const PARTS_CAP = 0.85; // запчасти не больше этой доли чека

export function partsInCheck(ds: Dataset, loc: LocFilter, win: Win): { rows: PartsRow[]; total: PartsRow } {
  const { services } = ds.profile;
  const t = totals(ds, loc, win);
  const r = rng(seedOf(ds.profile.key, loc, 'parts'));
  const revenue = splitInt(t.revenue, services.map((s, k) => t.services[k]! * s.price * s.group));
  const costPool = Math.max(0, t.materials - Math.round(t.upsell * UPSELL_COST));
  const cost = splitInt(costPool, services.map((s, k) => revenue[k]! * s.materials));
  const rows = services.map((s, k): PartsRow => {
    const markup = MARKUP_MIN + r() * MARKUP_SPAN;
    const partsCost = cost[k]!;
    const partsRevenue = Math.min(Math.round(partsCost * (1 + markup)), Math.round(revenue[k]! * PARTS_CAP));
    return row(s.key, s.name, t.services[k]!, revenue[k]!, partsRevenue, partsCost);
  });
  const sum = (f: (x: PartsRow) => number) => rows.reduce((s, x) => s + f(x), 0);
  return { rows, total: row('total', 'Все работы', sum((x) => x.bookings), sum((x) => x.revenue), sum((x) => x.partsRevenue), sum((x) => x.partsCost)) };
}

function row(key: string, name: string, bookings: number, revenue: number, partsRevenue: number, partsCost: number): PartsRow {
  return {
    key, name, bookings, revenue, partsRevenue, partsCost,
    share: ratio(partsRevenue, revenue),
    margin: partsRevenue ? (partsRevenue - partsCost) / partsRevenue : null,
    markup: partsCost ? (partsRevenue - partsCost) / partsCost : null,
  };
}
