// Клиенты: новые и вернувшиеся, спящие, сколько стоит клиент по годам первого визита.
import { avgCheck, locsOf, totals, type Dataset } from './dataset.ts';
import { DAYS_TOTAL } from './calendar.ts';
import type { LocFilter, Win } from './types.ts';

const MULTI_LOC_SHARE = 0.06; // вернувшиеся, которые ходят в несколько точек
const YEAR: Win = [DAYS_TOTAL - 364, DAYS_TOTAL];

/** Средний интервал между визитами, взвешенный по долям услуг. */
export function repeatDays(ds: Dataset): number {
  const s = ds.profile.services;
  return s.reduce((a, x) => a + x.share * x.repeatDays, 0) / s.reduce((a, x) => a + x.share, 0);
}

export interface ClientStats {
  newClients: number;
  returning: number;
  multiLoc: number;
  unique: number; // разных клиентов в окне
  sleeping: number; // были за год, но не приходили дольше двух обычных интервалов
  sleepingValue: number; // сколько принесёт один возвращённый визит каждого
}

export function clientStats(ds: Dataset, f: LocFilter, win: Win): ClientStats {
  const t = totals(ds, f, win);
  const returning = t.visits - t.newClients; // люди, а не записи: в группе на одну запись приходят несколько
  const days = win[1] - win[0];
  const every = repeatDays(ds);
  const visitsPerReturning = Math.max(1, days / every);
  const year = totals(ds, f, YEAR);
  const perYear = Math.max(1, 364 / every);
  const uniqueYear = year.newClients + (year.visits - year.newClients) / perYear;
  const weakness = locsOf(ds, f).reduce((s, l) => s + l.noShow, 0) / locsOf(ds, f).length;
  const sleeping = Math.round(uniqueYear * (1 - ds.profile.returnShare) * (0.3 + weakness * 2));
  return {
    newClients: t.newClients,
    returning,
    multiLoc: f === 'all' && ds.profile.locations.length > 1 ? Math.round(returning * MULTI_LOC_SHARE) : 0,
    unique: Math.round(t.newClients + returning / visitsPerReturning),
    sleeping,
    sleepingValue: Math.round(sleeping * avgCheck(ds, year)),
  };
}

export interface Cohort { year: number; clients: number; ltv: number; stillActive: number }

/** Сколько денег принёс клиент в среднем, по году первого визита (последние четыре года). */
export function cohorts(ds: Dataset, f: LocFilter): Cohort[] {
  const year = totals(ds, f, YEAR);
  const check = avgCheck(ds, year);
  const perYear = Math.min(364 / repeatDays(ds), 24);
  const keep = ds.profile.returnShare;
  const nowYear = ds.anchor.getUTCFullYear();
  return [3, 2, 1, 0].map((age) => {
    let ltv = check; // первый визит
    let alive = 1;
    for (let y = 0; y <= age; y++) {
      alive *= y === 0 ? 1 : keep;
      ltv += check * perYear * keep * alive * (y === age ? 0.5 : 1);
    }
    return { year: nowYear - age, clients: Math.round(year.newClients * (1 - age * 0.12)), ltv: Math.round(ltv), stillActive: Math.round(alive * keep * 100) / 100 };
  });
}
