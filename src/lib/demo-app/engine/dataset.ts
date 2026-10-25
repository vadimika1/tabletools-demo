// Набор данных отрасли и базовые запросы: итоги по окну, ряды, соотношения.
// Блоки строят свои виды поверх этих функций — сами дни не трогают.
import { INDUSTRIES } from '../industries/index.ts';
import { anchorDate, DEFAULT_ANCHOR } from './calendar.ts';
import { generate } from './generate.ts';
import type { Day, IndustryKey, IndustryProfile, LocationDef, LocFilter, LocKey, Win } from './types.ts';

export interface Dataset {
  profile: IndustryProfile;
  anchor: Date;
  days: Record<LocKey, Day[]>;
}

const CACHE_LIMIT = 8;
const cache = new Map<string, Dataset>();

/** Набор отрасли на дату якоря. Генерация ~20 мс, поэтому держим несколько последних в памяти. */
export function getDataset(key: IndustryKey, anchorIso: string = DEFAULT_ANCHOR): Dataset {
  const id = `${key}@${anchorIso}`;
  const hit = cache.get(id);
  if (hit) return hit;
  const profile = INDUSTRIES[key];
  const anchor = anchorDate(anchorIso);
  const ds = { profile, anchor, days: generate(profile, anchor) };
  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value!);
  cache.set(id, ds);
  return ds;
}

export const locByKey = (ds: Dataset, k: LocKey): LocationDef => {
  const loc = ds.profile.locations.find((l) => l.key === k);
  if (!loc) throw new Error(`Нет точки ${k} в отрасли ${ds.profile.key}`);
  return loc;
};
export const locsOf = (ds: Dataset, f: LocFilter): readonly LocationDef[] => (f === 'all' ? ds.profile.locations : [locByKey(ds, f)]);

export interface Totals {
  openDays: number;
  capacity: number;
  sold: number;
  bookings: number;
  served: number;
  visits: number;
  noShows: number;
  cancels: number;
  revenue: number;
  upsell: number;
  discounts: number;
  materials: number;
  newClients: number;
  calls: number;
  missedCalls: number;
  messages: number;
  unanswered: number;
  services: number[];
  spend: number[];
}

type Scalar = Exclude<keyof Totals, 'services' | 'spend' | 'openDays'>;
const SCALARS: Scalar[] = ['capacity', 'sold', 'bookings', 'served', 'visits', 'noShows', 'cancels', 'revenue', 'upsell', 'discounts', 'materials', 'newClients', 'calls', 'missedCalls', 'messages', 'unanswered'];

export function totals(ds: Dataset, f: LocFilter, [from, to]: Win): Totals {
  const t: Totals = {
    openDays: 0, ...Object.fromEntries(SCALARS.map((k) => [k, 0])) as Record<Scalar, number>,
    services: ds.profile.services.map(() => 0), spend: ds.profile.channels.map(() => 0),
  };
  for (const loc of locsOf(ds, f)) {
    const days = ds.days[loc.key]!;
    for (let i = Math.max(0, from); i < to; i++) {
      const d = days[i]!;
      if (d.open) t.openDays++;
      for (const k of SCALARS) t[k] += d[k];
      d.services.forEach((n, s) => { t.services[s]! += n; });
      d.spend.forEach((n, c) => { t.spend[c]! += n; });
    }
  }
  return t;
}

/** Значение по дням окна, суммарно по выбранным точкам. */
export function daily(ds: Dataset, f: LocFilter, [from, to]: Win, pick: (d: Day) => number): number[] {
  const locs = locsOf(ds, f);
  return Array.from({ length: to - from }, (_, k) => locs.reduce((s, l) => s + pick(ds.days[l.key]![from + k]!), 0));
}

/** Складывает дневной ряд в недели (для квартала и года — иначе график превращается в шум). */
export const weekly = (series: number[]) =>
  Array.from({ length: Math.ceil(series.length / 7) }, (_, w) => series.slice(w * 7, w * 7 + 7).reduce((s, v) => s + v, 0));

const ratio = (a: number, b: number) => (b ? a / b : 0);
export const loadOf = (t: Totals) => ratio(t.sold, t.capacity);
export const noShowOf = (t: Totals) => ratio(t.noShows, t.visits + t.noShows);
export const checkOf = (t: Totals) => ratio(t.revenue, t.served); // на запись
export const perVisitOf = (t: Totals) => ratio(t.revenue, t.visits); // на человека
/** Средний чек так, как его считают в отрасли: в фитнесе и студиях — на человека. */
export const avgCheck = (ds: Dataset, t: Totals) => (ds.profile.checkBasis === 'visit' ? perVisitOf(t) : checkOf(t));
export const perHourOf = (t: Totals) => ratio(t.revenue, t.sold); // выручка на занятый час мощности
export const missedOf = (t: Totals) => ratio(t.missedCalls, t.calls);
export const unansweredOf = (t: Totals) => ratio(t.unanswered, t.messages);
export const spendOf = (t: Totals) => t.spend.reduce((s, v) => s + v, 0);
/** Изменение к прошлому: null, если сравнивать не с чем (прочерк, а не «+∞»). */
export const change = (now: number, prev: number): number | null => (prev ? (now - prev) / prev : null);
