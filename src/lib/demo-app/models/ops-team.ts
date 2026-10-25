// Модели блоков «Операционки» p6–p10: персонал, отзывы, кто продаёт, материалы, корпоративы.
// Синтетика (каналы записи, этапы сделок, лента отзывов) — с семенем по отрасли, точке и окну;
// где она пересекается с движком, части сходятся с итогами: записи — с оплаченными, деньги — с выручкой.
import { locsOf, totals, type Dataset } from '../engine/dataset.ts';
import { pnl } from '../engine/money.ts';
import { reviews, staffRows, type ReviewsRow, type StaffRow } from '../engine/ops.ts';
import { jitter, rng, seedOf, splitInt } from '../engine/random.ts';
import type { IndustryKey, LocFilter, LocKey, Win } from '../engine/types.ts';
import { AUTHORS, INITIALS, REVIEW_TEXTS, type ReviewText } from './ops-reviews.ts';
import { locName, serviceRevenue, share } from './ops.ts';

const sum = (xs: readonly number[]) => xs.reduce((s, v) => s + v, 0);
const median = (xs: readonly number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const k = s.length >> 1;
  return s.length ? (s.length % 2 ? s[k]! : (s[k - 1]! + s[k]!) / 2) : 0;
};
const pick = <T>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length) % xs.length]!;

// ── p6 Персонал и смены ──────────────────────────────────────────

/**
 * Отстаёт: меньше этой доли от медианы своей точки. Разброс «сильных» и «средних» в демо до ±22%,
 * поэтому порог ниже шума — иначе флажок получает каждый второй. Сотрудник из сюжета отрасли
 * (самый слабый на своей точке) отмечается всегда: ради него блок и показывают.
 */
export const LAG_THRESHOLD = 0.65;

export interface StaffLine extends StaffRow { locName: string; vsMedian: number | null; lagging: boolean }

export interface StaffModel {
  rows: StaffLine[]; // по выручке, от большей
  revenue: number;
  payroll: number;
  payrollShare: number | null;
  avgLoad: number | null;
  lagging: StaffLine[];
}

export function staffLines(ds: Dataset, f: LocFilter, win: Win): StaffLine[] {
  const rows = staffRows(ds, f, win);
  const story = ds.profile.story.lagging.loc;
  const med = new Map(locsOf(ds, f).map((l) => [l.key, median(rows.filter((r) => r.loc === l.key).map((r) => r.revenue))]));
  const storyMin = Math.min(...rows.filter((r) => r.loc === story).map((r) => r.revenue));
  return rows.map((r) => {
    const m = med.get(r.loc) ?? 0;
    const vsMedian = m ? r.revenue / m - 1 : null;
    const weakest = r.loc === story && r.revenue === storyMin && r.revenue < m;
    return { ...r, locName: locName(ds, r.loc), vsMedian, lagging: weakest || (vsMedian !== null && r.revenue < m * LAG_THRESHOLD) };
  }).sort((a, b) => b.revenue - a.revenue);
}

export function staffModel(ds: Dataset, f: LocFilter, win: Win): StaffModel {
  const rows = staffLines(ds, f, win);
  const p = pnl(ds, f, win);
  return {
    rows,
    revenue: sum(rows.map((r) => r.revenue)),
    payroll: p.payroll,
    payrollShare: share(p.payroll, p.revenue),
    avgLoad: share(sum(rows.map((r) => r.sold)), sum(rows.map((r) => r.hours))),
    lagging: rows.filter((r) => r.lagging),
  };
}

// ── p7 Отзывы ────────────────────────────────────────────────────

export interface ReviewLine extends ReviewsRow { name: string }
export interface ReviewItem { id: string; loc: LocKey; locName: string; stars: number; author: string; text: string; daysAgo: number; replied: boolean }

export interface ReviewsModel {
  rows: ReviewLine[];
  count: number;
  avg: number | null;
  stars: number[]; // 5★ … 1★ по сети
  low: number;
  noReply: number;
  weakest: ReviewLine | null;
  feed: ReviewItem[];
}

const FEED_SIZE = 5;
const FEED_BAD = 2; // плохих в ленте не больше двух и не больше, чем их было

function author(r: () => number, g: ReviewText['gender']): string {
  const gender = g === 'n' ? (r() < 0.5 ? 'm' : 'f') : g;
  return `${pick(r, AUTHORS[gender])} ${pick(r, [...INITIALS])}.`;
}

function shuffled<T>(r: () => number, xs: readonly T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

const REPLIED_GOOD = 0.7; // на хорошие отзывы отвечают не всегда

/**
 * Лента: сначала плохие отзывы слабой точки, затем хорошие по точкам по кругу.
 * Звёзды берутся из распределения точки и не превышают его: пять пятёрок в ленте — только если их было пять.
 */
function feedOf(ds: Dataset, f: LocFilter, win: Win, rows: readonly ReviewLine[], weakest: ReviewLine | null): ReviewItem[] {
  const r = rng(seedOf(ds.profile.key, f, 'feed', win[0], win[1]));
  const texts = REVIEW_TEXTS[ds.profile.key];
  const staff = staffLines(ds, f, win).filter((s) => !s.lagging);
  const left = new Map(rows.map((x) => [x.loc, [...x.stars]]));
  const items: Omit<ReviewItem, 'id' | 'daysAgo'>[] = [];
  if (weakest) {
    const bad = shuffled(r, texts.bad);
    const w = left.get(weakest.loc)!;
    for (let k = 0; k < FEED_BAD; k++) {
      const idx = [4, 3, 2].find((i) => w[i]! > 0); // 1★, затем 2★, затем 3★
      if (idx === undefined) break;
      w[idx]! -= 1;
      const t = bad[k % bad.length]!;
      items.push({ loc: weakest.loc, locName: weakest.name, stars: 5 - idx, author: author(r, t.gender), text: t.text, replied: k >= weakest.noReply });
    }
  }
  const good = shuffled(r, texts.good);
  const plain = good.filter((t) => !t.text.includes('{staff}'));
  const limit = Math.min(FEED_SIZE, sum(rows.map((x) => x.count)));
  for (let k = 0, g = 0; items.length < limit && k < rows.length * FEED_SIZE; k++) {
    const row = rows[k % rows.length]!;
    const s = left.get(row.loc)!;
    const idx = [0, 1].find((i) => s[i]! > 0);
    if (idx === undefined) continue;
    s[idx]! -= 1;
    const people = staff.filter((p) => p.loc === row.loc);
    const t0 = good[g++ % good.length]!;
    const t = !people.length && t0.text.includes('{staff}') ? plain[g % plain.length] ?? t0 : t0;
    const text = (people.length ? t.text.replace('{staff}', pick(r, people).name) : t.text).replace('..', '.'); // «Врач — Дарья Ю.»
    items.push({ loc: row.loc, locName: row.name, stars: 5 - idx, author: author(r, t.gender), text, replied: r() < REPLIED_GOOD });
  }
  const span = Math.max(1, win[1] - win[0]);
  const days = items.map(() => Math.floor(r() * span)).sort((a, b) => a - b);
  return items.map((x, k) => ({ ...x, id: `${x.loc}-${k}`, daysAgo: days[k]! }));
}

export function reviewsModel(ds: Dataset, f: LocFilter, win: Win): ReviewsModel {
  const rows = reviews(ds, f, win).map((x) => ({ ...x, name: locName(ds, x.loc) }));
  const count = sum(rows.map((x) => x.count));
  const stars = [0, 1, 2, 3, 4].map((k) => sum(rows.map((x) => x.stars[k]!)));
  const withReviews = rows.filter((x) => x.count > 0);
  const weakest = withReviews.reduce<ReviewLine | null>((a, x) => (!a || x.avg < a.avg ? x : a), null);
  return {
    rows,
    count,
    avg: count ? Math.round((sum(stars.map((n, k) => n * (5 - k))) / count) * 100) / 100 : null,
    stars,
    low: sum(rows.map((x) => x.low)),
    noReply: sum(rows.map((x) => x.noReply)),
    weakest: weakest && weakest.low > 0 ? weakest : null,
    feed: feedOf(ds, f, win, rows, weakest && weakest.low > 0 ? weakest : null),
  };
}

// ── p8 Кто продаёт ───────────────────────────────────────────────

export const SALE_SOURCES = ['admin', 'online', 'aggregator', 'rebook'] as const;
export type SaleSource = (typeof SALE_SOURCES)[number];

/** Доли записей по источнику в отрасли: администратор, сайт, агрегатор, повторная запись на месте. */
const SALE_MIX: Record<IndustryKey, readonly [number, number, number, number]> = {
  clinic: [0.46, 0.18, 0.12, 0.24],
  salon: [0.2, 0.42, 0.08, 0.3],
  fitness: [0.22, 0.5, 0.1, 0.18],
  auto: [0.55, 0.2, 0.1, 0.15],
  studio: [0.3, 0.5, 0.12, 0.08],
  other: [0.4, 0.3, 0.1, 0.2],
};
const AGGREGATOR: Record<IndustryKey, string> = {
  clinic: 'ПроДокторов и агрегаторы', salon: 'Маркетплейс YCLIENTS', fitness: 'Агрегаторы абонементов',
  auto: 'Авито и агрегаторы', studio: 'Афиши и агрегаторы', other: 'Агрегаторы',
};
const ADMIN_MISS_K = 2.5; // точка, где не берут трубку, теряет долю администраторов

export function saleLabels(ds: Dataset): Record<SaleSource, string> {
  return { admin: 'Администратор', online: 'Сайт и онлайн-запись', aggregator: AGGREGATOR[ds.profile.key], rebook: `Записал ${ds.profile.words.staff[0]}` };
}

export interface SalesLine { loc: LocKey; name: string; served: number; counts: number[]; revenue: number[] }
export interface SalesModel { rows: SalesLine[]; served: number; counts: number[]; revenue: number[]; shares: (number | null)[] }

export function salesModel(ds: Dataset, f: LocFilter, win: Win): SalesModel {
  const base = SALE_MIX[ds.profile.key];
  const rows = locsOf(ds, f).map((l) => {
    const t = totals(ds, l.key, win);
    const r = rng(seedOf(ds.profile.key, l.key, 'sales', win[0], win[1]));
    const w = base.map((b, k) => b * jitter(r, 0.12) * (k === 0 ? Math.max(0.3, 1 - l.unanswered * ADMIN_MISS_K) : 1));
    const counts = splitInt(t.served, w);
    return { loc: l.key, name: l.name, served: t.served, counts, revenue: splitInt(t.revenue, counts) };
  });
  const counts = SALE_SOURCES.map((_, k) => sum(rows.map((x) => x.counts[k]!)));
  const served = sum(rows.map((x) => x.served));
  return { rows, served, counts, revenue: SALE_SOURCES.map((_, k) => sum(rows.map((x) => x.revenue[k]!))), shares: counts.map((c) => share(c, served)) };
}

// ── p9 Материалы к выручке ───────────────────────────────────────

/** Целевая доля материалов в выручке — ставится вместе с владельцем; в демо — около рыночной. */
export const MATERIALS_TARGET: Record<IndustryKey, number> = { clinic: 0.2, salon: 0.09, fitness: 0.016, auto: 0.34, studio: 0.145, other: 0.117 };

export interface MaterialsLine { loc: LocKey; name: string; revenue: number; materials: number; share: number | null; dev: number | null; over: number }
export interface MaterialsModel { target: number; rows: MaterialsLine[]; revenue: number; materials: number; share: number | null; dev: number | null; over: number; worst: MaterialsLine | null }

export function materialsModel(ds: Dataset, f: LocFilter, win: Win): MaterialsModel {
  const target = MATERIALS_TARGET[ds.profile.key];
  const rows = locsOf(ds, f).map((l) => {
    const t = totals(ds, l.key, win);
    const s = share(t.materials, t.revenue);
    return { loc: l.key, name: l.name, revenue: t.revenue, materials: t.materials, share: s, dev: s === null ? null : s - target, over: Math.round(t.materials - t.revenue * target) };
  });
  const revenue = sum(rows.map((x) => x.revenue));
  const materials = sum(rows.map((x) => x.materials));
  const s = share(materials, revenue);
  const worst = rows.reduce<MaterialsLine | null>((a, x) => (x.dev !== null && (!a || x.dev > (a.dev ?? -1)) ? x : a), null);
  return { target, rows, revenue, materials, share: s, dev: s === null ? null : s - target, over: sum(rows.map((x) => x.over)), worst };
}

// ── p10 Корпоративы и группы ─────────────────────────────────────

export const DEAL_STAGES = ['Заявка', 'КП отправлено', 'Предоплата', 'Проведено'] as const;

/** Сделок на одну оплаченную запись и средний чек сделки там, где нет услуги-мероприятия. */
const DEAL_RATE: Partial<Record<IndustryKey, { rate: number; check: number }>> = {
  fitness: { rate: 0.012, check: 85_000 },
  other: { rate: 0.012, check: 45_000 },
  clinic: { rate: 0.004, check: 120_000 },
  salon: { rate: 0.003, check: 30_000 },
  auto: { rate: 0.01, check: 150_000 },
};
const PREPAY_SHARE = 0.3; // предоплата по сделкам, которые ещё впереди

export interface DealsLine { loc: LocKey; name: string; stages: number[]; paid: number; doneMoney: number }
export interface DealsModel { stages: number[]; wonRate: number | null; paid: number; avgDeal: number | null; rows: DealsLine[] }

export const EVENT_KEY = 'party';

/** Индекс услуги-мероприятия («День рождения и корпоратив» у студий) или −1, если в отрасли её нет. */
export const eventService = (ds: Dataset): number => ds.profile.services.findIndex((x) => x.key === EVENT_KEY);

export function dealsModel(ds: Dataset, f: LocFilter, win: Win): DealsModel {
  const ev = eventService(ds);
  const rows = locsOf(ds, f).map((l) => {
    const t = totals(ds, l.key, win);
    const r = rng(seedOf(ds.profile.key, l.key, 'deals', win[0], win[1]));
    const cfg = DEAL_RATE[ds.profile.key] ?? { rate: 0.01, check: 50_000 };
    const done = ev >= 0 ? Math.round(t.services[ev]! * (t.bookings ? t.served / t.bookings : 0)) : Math.round(t.served * cfg.rate * jitter(r, 0.2));
    const doneMoney = ev >= 0 ? serviceRevenue(ds, l.key, win)[ev]! : Math.round(done * cfg.check * l.check);
    const deal = done ? doneMoney / done : cfg.check * l.check;
    const prepaid = done + Math.round(done * (0.12 + r() * 0.18));
    const offer = Math.ceil(prepaid / (0.55 + r() * 0.15));
    const lead = Math.ceil(offer / (0.62 + r() * 0.18));
    return { loc: l.key, name: l.name, stages: [lead, offer, prepaid, done], doneMoney, paid: Math.round(doneMoney + (prepaid - done) * deal * PREPAY_SHARE) };
  });
  const stages = DEAL_STAGES.map((_, k) => sum(rows.map((x) => x.stages[k]!)));
  const done = stages[3]!;
  const paid = sum(rows.map((x) => x.paid));
  return { stages, wonRate: share(done, stages[0]!), paid, avgDeal: done ? Math.round(sum(rows.map((x) => x.doneMoney)) / done) : null, rows };
}
