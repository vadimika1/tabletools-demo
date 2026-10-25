// Модели раздела «Клиенты» и клиентских отраслевых блоков: новые и вернувшиеся, цена клиента,
// спящие, повторные по услугам, возврат к барберу, абонементы. Чистые функции без React.
// Синтетика (имена, доли по услугам) — с семенем по отрасли, точке и окну, итоги сходятся с движком.
import { avgCheck, daily, locsOf, spendOf, totals, weekly, type Dataset } from '../engine/dataset.ts';
import { clientStats, cohorts, repeatDays, type ClientStats, type Cohort } from '../engine/clients.ts';
import { staffRows } from '../engine/ops.ts';
import { channelRows } from '../engine/channels.ts';
import { profitPerBooking } from '../engine/money.ts';
import { DAYS_TOTAL, dateOf } from '../engine/calendar.ts';
import { jitter, rng, seedOf, splitInt } from '../engine/random.ts';
import type { LocFilter, LocKey, Win } from '../engine/types.ts';

const ratio = (a: number, b: number): number | null => (b ? a / b : null);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// ── c1: новые и вернувшиеся ──

export interface ClientFigures {
  now: ClientStats;
  prev: ClientStats;
  repeatShare: number | null; // доля вернувшихся среди пришедших людей
  prevRepeatShare: number | null;
  byWeek: boolean;
  /** Новые клиенты по неделям (или дням для недели): индекс первого дня и значение. */
  series: { from: number; value: number }[];
}

export function clientFigures(ds: Dataset, loc: LocFilter, win: Win, prevWin: Win): ClientFigures {
  const now = clientStats(ds, loc, win);
  const prev = clientStats(ds, loc, prevWin);
  const t = totals(ds, loc, win);
  const tp = totals(ds, loc, prevWin);
  const days = daily(ds, loc, win, (d) => d.newClients);
  const byWeek = days.length > 7;
  const values = byWeek ? weekly(days) : days;
  return {
    now, prev,
    repeatShare: ratio(t.visits - t.newClients, t.visits),
    prevRepeatShare: ratio(tp.served - tp.newClients, tp.served),
    byWeek,
    series: values.map((value, k) => ({ from: win[0] + k * (byWeek ? 7 : 1), value })),
  };
}

// ── c2: сколько стоит клиент ──

export const LTV_GOOD = 3; // LTV в три цены привлечения и больше — реклама окупается с запасом
export const LTV_OK = 1;

export interface ClientValue {
  cohorts: Cohort[];
  ltv: number; // выручка с клиента за всё время: среднее по когортам, взвешенное числом клиентов
  ltvProfit: number; // сколько из неё остаётся после зарплат, материалов, эквайринга и налога
  newPaid: number; // новые клиенты, которых привела платная реклама (по первому касанию)
  cac: number | null; // расход на рекламу на одного такого клиента
  ratio: number | null; // ltvProfit / cac
  verdict: 'good' | 'warn' | 'bad' | null;
}

export function clientValue(ds: Dataset, loc: LocFilter, win: Win): ClientValue {
  const list = cohorts(ds, loc);
  const people = list.reduce((s, c) => s + c.clients, 0);
  const ltv = people ? Math.round(list.reduce((s, c) => s + c.ltv * c.clients, 0) / people) : 0;
  const t = totals(ds, loc, win);
  const contribution = t.revenue && t.served ? (profitPerBooking(ds, loc, win) * t.served) / t.revenue : 0;
  const ltvProfit = Math.round(ltv * Math.max(0, contribution));
  const rows = channelRows(ds, loc, win, 'first');
  const sales = rows.reduce((s, x) => s + x.sales, 0);
  const paid = rows.filter((x) => x.group === 'paid').reduce((s, x) => s + x.sales, 0);
  const newPaid = sales ? Math.round((t.newClients * paid) / sales) : 0;
  const cac = newPaid ? spendOf(t) / newPaid : null;
  const r = cac ? ltvProfit / cac : null;
  return { cohorts: list, ltv, ltvProfit, newPaid, cac, ratio: r, verdict: r === null ? null : r >= LTV_GOOD ? 'good' : r >= LTV_OK ? 'warn' : 'bad' };
}

// ── c3: спящие клиенты ──

export interface SleepingClient { key: string; name: string; loc: LocKey; days: number; visits: number; spent: number }

export interface Sleeping { count: number; value: number; afterDays: number; sample: SleepingClient[] }

const MEN = ['Артём В.', 'Илья С.', 'Максим Д.', 'Кирилл Н.', 'Роман Ш.', 'Никита П.', 'Сергей Л.', 'Дмитрий Ж.', 'Тимур Г.', 'Олег Ф.'];
const MIXED = ['Анна К.', 'Мария С.', 'Ольга Д.', 'Екатерина Л.', 'Дмитрий П.', 'Ирина В.', 'Алексей Н.', 'Светлана Р.', 'Наталья Б.', 'Павел Т.'];
const SAMPLE = 5;
const SLEEP_CAP = 300; // дольше года клиент уже не «спящий», а ушедший

/** Перемешивание Фишера — Йетса с семенем: порядок не зависит от движка сортировки. */
function shuffle<T>(xs: readonly T[], r: () => number): T[] {
  const out = [...xs];
  for (let k = out.length - 1; k > 0; k--) {
    const j = Math.floor(r() * (k + 1));
    [out[k], out[j]] = [out[j]!, out[k]!];
  }
  return out;
}

export function sleepingClients(ds: Dataset, loc: LocFilter, win: Win): Sleeping {
  const s = clientStats(ds, loc, win);
  const every = repeatDays(ds);
  const afterDays = Math.min(SLEEP_CAP, Math.round(every * 2));
  const r = rng(seedOf(ds.profile.key, loc, 'sleeping'));
  const pool = shuffle(ds.profile.key === 'salon' || ds.profile.key === 'auto' ? MEN : MIXED, r);
  const locs = locsOf(ds, loc);
  const check = avgCheck(ds, totals(ds, loc, [DAYS_TOTAL - 364, DAYS_TOTAL]));
  const n = Math.min(SAMPLE, s.sleeping);
  const sample = Array.from({ length: n }, (_, k): SleepingClient => {
    const visits = 2 + Math.floor(r() * 9);
    return {
      key: `s${k}`, name: pool[k % pool.length]!, loc: locs[Math.floor(r() * locs.length)]!.key,
      days: afterDays + Math.floor(r() * (364 - afterDays)), visits, spent: Math.round(visits * check * jitter(r, 0.2)),
    };
  }).sort((a, b) => b.spent - a.spent);
  return { count: s.sleeping, value: s.sleepingValue, afterDays, sample };
}

// ── c4: с каких услуг возвращаются ──

export const SHORT_REPEAT = 45; // услуги с коротким циклом возвращают чаще

export interface ServiceReturnRow { key: string; name: string; bookings: number; returning: number; share: number | null }

export function returnByService(ds: Dataset, loc: LocFilter, win: Win): { rows: ServiceReturnRow[]; share: number | null } {
  const t = totals(ds, loc, win);
  const r = rng(seedOf(ds.profile.key, loc, 'repeat', win[0], win[1]));
  const overall = ratio(t.served - t.newClients, t.served);
  const target = Math.round(t.bookings * (overall ?? 0));
  const raw = ds.profile.services.map((s) => clamp(ds.profile.returnShare * (s.repeatDays <= SHORT_REPEAT ? 1.15 : 0.8) * jitter(r, 0.08), 0.05, 0.97));
  const returning = splitInt(target, raw.map((x, k) => x * t.services[k]!));
  const rows = ds.profile.services.map((s, k) => {
    const back = Math.min(returning[k]!, t.services[k]!);
    return { key: s.key, name: s.name, bookings: t.services[k]!, returning: back, share: ratio(back, t.services[k]!) };
  });
  return { rows: rows.sort((a, b) => (b.share ?? -1) - (a.share ?? -1)), share: overall };
}

// ── x4: возврат за 45 дней ──

export const RETURN_DEADLINE = 45;
const OVERDUE_SHARE = 0.14;
const RECENT: Win = [DAYS_TOTAL - 56, DAYS_TOTAL];

export interface OverdueStaff { key: string; name: string; loc: LocKey; count: number; money: number }

export interface Overdue { count: number; money: number; usual: readonly [number, number]; deadline: number; staff: OverdueStaff[] }

/** Постоянные клиенты, у которых обычный интервал прошёл, а новой записи нет. Состояние «на сегодня». */
export function overdueClients(ds: Dataset, loc: LocFilter): Overdue {
  const every = Math.round(repeatDays(ds));
  const s = clientStats(ds, loc, RECENT);
  const r = rng(seedOf(ds.profile.key, loc, 'overdue'));
  const weak = locsOf(ds, loc).reduce((a, l) => a + l.noShow, 0) / locsOf(ds, loc).length;
  const regulars = s.unique * ds.profile.returnShare;
  const count = Math.round(regulars * OVERDUE_SHARE * (1 + weak * 3) * jitter(r, 0.1));
  const check = avgCheck(ds, totals(ds, loc, RECENT));
  const money = Math.round(count * check);
  const people = staffRows(ds, loc, RECENT);
  const w = people.map((p) => p.bookings * (1 - p.returning));
  const counts = splitInt(count, w);
  const sums = splitInt(money, w);
  const staff = people
    .map((p, k) => ({ key: `${p.loc}-${k}`, name: p.name, loc: p.loc, count: counts[k]!, money: sums[k]! }))
    .sort((a, b) => b.money - a.money);
  return { count, money, usual: [every, every + 7], deadline: Math.max(RETURN_DEADLINE, every + 10), staff };
}

// ── x5: абонементы ──

export const MONTHS_SHOWN = 12;
const CHURN_OF_NEW = 0.6; // базовый месячный отток — от доли новичков в записях
const CHURN_SUMMER = 3; // во сколько раз просадка сезона усиливает отток
const MIN_BUY = 0.35; // хотя бы столько новичков месяца покупают абонемент
const FREEZE_BASE = 0.03;
const FREEZE_SUMMER = 0.35; // заморозки растут, когда сезон проседает
export const SUMMER = [5, 6, 7] as const;

export interface MembershipMonth {
  year: number;
  month: number; // 0 — январь
  days: number;
  partial: boolean;
  active: number;
  sold: number;
  renewals: number;
  frozen: number;
  churned: number;
  churn: number | null; // доля ушедших от активных на начало месяца
}

/** Абонементы по календарным месяцам: активные ≈ разные клиенты, поток сходится (было + продано − ушли = стало). */
export function memberships(ds: Dataset, loc: LocFilter): MembershipMonth[] {
  const every = repeatDays(ds);
  const buckets: { year: number; month: number; days: number; visits: number; newClients: number }[] = [];
  const locs = locsOf(ds, loc);
  for (let i = 0; i < DAYS_TOTAL; i++) {
    const d = dateOf(ds.anchor, i);
    const [year, month] = [d.getUTCFullYear(), d.getUTCMonth()];
    let b = buckets[buckets.length - 1];
    if (!b || b.year !== year || b.month !== month) { b = { year, month, days: 0, visits: 0, newClients: 0 }; buckets.push(b); }
    b.days++;
    for (const l of locs) { b.visits += ds.days[l.key]![i]!.visits; b.newClients += ds.days[l.key]![i]!.newClients; }
  }
  const last = buckets.slice(-(MONTHS_SHOWN + 1));
  const mf = ds.profile.monthFactor;
  const r = rng(seedOf(ds.profile.key, loc, 'members'));
  const base = (1 - ds.profile.returnShare) * CHURN_OF_NEW;
  const out: MembershipMonth[] = [];
  let prevActive = Math.round(last[0]!.visits / Math.max(1, last[0]!.days / every));
  for (const b of last.slice(1)) {
    const active = Math.round(b.visits / Math.max(1, b.days / every));
    const rate = base * (1 + Math.max(0, 1 - mf[b.month]!) * CHURN_SUMMER) * jitter(r, 0.12) * (b.days / 30.44);
    let churned = Math.min(prevActive, Math.round(prevActive * rate));
    let sold = active - prevActive + churned;
    if (sold < 0) { churned -= sold; sold = 0; } // активных стало меньше, чем объясняет отток, — ушли и остальные
    const minSold = Math.round(b.newClients * MIN_BUY);
    if (sold < minSold) { churned = Math.min(prevActive, churned + minSold - sold); sold = active - prevActive + churned; }
    const full = new Date(Date.UTC(b.year, b.month + 1, 0)).getUTCDate();
    out.push({
      year: b.year, month: b.month, days: b.days, partial: b.days < full, active, sold,
      renewals: prevActive - churned,
      frozen: Math.round(active * (FREEZE_BASE + Math.max(0, 1 - mf[b.month]!) * FREEZE_SUMMER)),
      churned, churn: ratio(churned, prevActive),
    });
    prevActive = active;
  }
  return out;
}

/** Средний отток летом против остальных месяцев — главный вывод блока абонементов. */
export function summerChurn(months: readonly MembershipMonth[]): { summer: number | null; rest: number | null } {
  const avg = (xs: MembershipMonth[]) => {
    const v = xs.map((m) => m.churn).filter((c): c is number => c !== null);
    return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
  };
  const full = months.filter((m) => !m.partial);
  const isSummer = (m: MembershipMonth) => (SUMMER as readonly number[]).includes(m.month);
  return { summer: avg(full.filter(isSummer)), rest: avg(full.filter((m) => !isSummer(m))) };
}
