// Модели раздела «Сквозная аналитика» (a1–a6). Все читают выбранную модель атрибуции:
// она перераспределяет продажи между каналами, но итог всегда равен оплаченным записям движка.
import { avgCheck, locsOf, spendOf, totals, type Dataset } from '../engine/dataset.ts';
import { channelRows, DIRECT_KEY, MODELS, type ChannelRow } from '../engine/channels.ts';
import { shortDate } from '../engine/calendar.ts';
import { jitter, rng, seedOf, splitInt } from '../engine/random.ts';
import type { ChannelDef, LocFilter, Model, SystemKind, Win } from '../engine/types.ts';
import { campaignKey, channelIndex, isMaps, ratio, sumOf } from './marketing.ts';

export const MODEL_ORDER: readonly Model[] = ['last', 'nondirect', 'first'];
const DIRECT_NAME = 'Прямые и повторные';

// ── a1. Модель атрибуции ──────────────────────────────────────

export interface ShiftRow { key: string; name: string; group: ChannelRow['group']; index: number; sales: Record<Model, number>; revenue: Record<Model, number>; delta: number }
export interface ShiftModel { model: Model; name: string; hint: string; rows: ShiftRow[]; total: number }

/** Продажи каналов во всех трёх моделях и сдвиг выбранной модели к последнему касанию. */
export function modelShift(ds: Dataset, loc: LocFilter, win: Win, model: Model): ShiftModel {
  const by = Object.fromEntries(MODEL_ORDER.map((m) => [m, channelRows(ds, loc, win, m)])) as Record<Model, ChannelRow[]>;
  const rows = by.last.map((r, k) => {
    const sales = Object.fromEntries(MODEL_ORDER.map((m) => [m, by[m][k]!.sales])) as Record<Model, number>;
    const revenue = Object.fromEntries(MODEL_ORDER.map((m) => [m, by[m][k]!.revenue])) as Record<Model, number>;
    return { key: r.key, name: r.name, group: r.group, index: channelIndex(ds, r.key), sales, revenue, delta: sales[model] - sales.last };
  });
  return { model, name: MODELS[model].name, hint: MODELS[model].hint, rows, total: sumOf(by.last.map((r) => r.sales)) };
}

// ── a2. Каналы от показа до оплаты ────────────────────────────

export interface ChannelFunnel {
  key: string; name: string; index: number; group: ChannelRow['group'];
  impressions: number | null; clicks: number; leads: number; bookings: number; paid: number; revenue: number;
  toClick: number | null; toLead: number | null; toBooking: number | null; toPaid: number | null;
}

/** Показы → переходы → заявки → записи → оплаты по каждому каналу (без прямых: у них нет показов и переходов). */
export function channelFunnels(ds: Dataset, loc: LocFilter, win: Win, model: Model): ChannelFunnel[] {
  const t = totals(ds, loc, win);
  const perPaid = t.served ? t.bookings / t.served : 1; // записей на одну оплаченную
  return channelRows(ds, loc, win, model).filter((r) => r.key !== DIRECT_KEY).map((r) => {
    const bookings = Math.min(r.leads, Math.max(r.sales, Math.round(r.sales * perPaid)));
    const impressions = r.impressions || null;
    return {
      key: r.key, name: r.name, index: channelIndex(ds, r.key), group: r.group,
      impressions, clicks: r.clicks, leads: r.leads, bookings, paid: r.sales, revenue: r.revenue,
      toClick: impressions ? r.clicks / impressions : null, toLead: ratio(r.leads, r.clicks), toBooking: ratio(bookings, r.leads), toPaid: ratio(r.sales, bookings),
    };
  });
}

// ── a3. Отчёт по каналам: дерево и CSV ────────────────────────

export interface TreeRow { id: string; level: 0 | 1; key: string; channelKey: string; name: string; index: number; sales: number; revenue: number; spend: number; roi: number | null; cac: number | null }
export interface TreeNode { row: TreeRow; children: TreeRow[] }
export interface ChannelTree { nodes: TreeNode[]; total: TreeRow }

const treeRow = (id: string, level: 0 | 1, key: string, channelKey: string, name: string, index: number, sales: number, revenue: number, spend: number): TreeRow =>
  ({ id, level, key, channelKey, name, index, sales, revenue, spend, roi: ratio(revenue, spend), cac: spend ? ratio(spend, sales) : null });

export function channelTree(ds: Dataset, loc: LocFilter, win: Win, model: Model): ChannelTree {
  const t = totals(ds, loc, win);
  const nodes = channelRows(ds, loc, win, model).map((r) => {
    const index = channelIndex(ds, r.key);
    return {
      row: treeRow(r.key, 0, r.key, r.key, r.name, index, r.sales, r.revenue, r.spend),
      children: r.campaigns.length > 1 ? r.campaigns.map((c, j) => treeRow(campaignKey(r.key, j), 1, campaignKey(r.key, j), r.key, c.name, index, c.sales, c.revenue, c.spend)) : [],
    };
  });
  // В итоге окупаемость и цена клиента — прочерк: делить всю выручку на расход рекламы значит приписать рекламе прямые и повторные.
  const total = { ...treeRow('total', 0, 'total', 'total', 'Итого', -1, t.served, t.revenue, spendOf(t)), roi: null, cac: null };
  return { nodes, total };
}

const FORMULA_START = /^[=+\-@\t\r]/;
const NEEDS_QUOTES = /[";\r\n]/;
export const CSV_SEP = ';'; // Excel с русской локалью ждёт точку с запятой
export const CSV_BOM = '﻿';

/** Ячейка CSV: текст защищён от формул (апостроф впереди) и экранирован; дробные числа — с запятой. */
export function csvCell(v: string | number | null): string {
  if (v === null) return '';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(2).replace('.', ',');
  const safe = FORMULA_START.test(v) ? `'${v}` : v;
  return NEEDS_QUOTES.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export const CSV_HEAD = ['Канал', 'Кампания', 'Продажи', 'Выручка, ₽', 'Расход, ₽', 'Окупаемость', 'Цена клиента, ₽'] as const;

/** Весь отчёт одним текстом для Excel: с BOM, строка канала, под ней кампании, внизу итог. */
export function treeCsv(tree: ChannelTree): string {
  const line = (channel: string, campaign: string, r: TreeRow) =>
    [channel, campaign, r.sales, r.revenue, r.spend, r.roi, r.cac === null ? null : Math.round(r.cac)].map(csvCell).join(CSV_SEP);
  const lines = [CSV_HEAD.map(csvCell).join(CSV_SEP)];
  for (const n of tree.nodes) {
    lines.push(line(n.row.name, 'Все кампании', n.row));
    for (const c of n.children) lines.push(line(n.row.name, c.name, c));
  }
  lines.push(line(tree.total.name, '', tree.total));
  return CSV_BOM + lines.join('\r\n') + '\r\n';
}

// ── a4. Путь клиента ──────────────────────────────────────────

export interface Touch { id: string; day: number; date: string; time: string; channelKey: string; channel: string; index: number; action: string; credited: boolean }
export interface BuyerPath { id: string; name: string; place: string; touches: Touch[]; service: string; amount: number; paidDate: string; credited: string }

const BUYERS = ['Ирина М.', 'Олег Т.', 'Светлана Р.', 'Артём Д.', 'Наталья Г.', 'Максим Л.'];
const PATH_DAYS = 30;

function actionOf(c: ChannelDef | undefined, place: string): string {
  if (!c) return 'Прямой заход на сайт';
  const camp = c.campaigns.find((x) => x.salesShare > 0)?.name ?? c.name;
  if (isMaps(c.key) || c.key.includes('maps')) return `Карточка «${place}» на картах, построен маршрут`;
  if (c.key === 'referral') return 'Ссылка от друга';
  if (c.key === 'tg') return 'Пост в Telegram-канале';
  if (c.key === 'seo') return 'Статья на сайте из поиска';
  if (c.key === 'prodoctorov' || c.key === 'yclients' || c.key === 'avito') return `Профиль на площадке ${c.name}`;
  if (c.key === 'search') return `Клик по объявлению «${camp}»`;
  return `Реклама «${c.campaigns[0]?.name ?? camp}», переход на сайт`;
}

/** Какое касание засчитано: последнее, последнее не прямое или первое. */
export function creditedIndex(keys: readonly string[], model: Model): number {
  if (!keys.length) return -1;
  if (model === 'first') return 0;
  if (model === 'last') return keys.length - 1;
  for (let k = keys.length - 1; k >= 0; k--) if (keys[k] !== DIRECT_KEY) return k;
  return keys.length - 1;
}

/** Два покупателя: у первого путь заканчивается прямым заходом, у второго — каналом; модели засчитывают по-разному. */
export function customerPaths(ds: Dataset, loc: LocFilter, win: Win, model: Model): BuyerPath[] {
  const p = ds.profile;
  const r = rng(seedOf(p.key, loc, win[0], win[1], 'paths'));
  const byBias = [...p.channels].sort((a, b) => b.firstBias - a.firstBias);
  const byShare = [...p.channels].sort((a, b) => b.share - a.share);
  const aware = byBias[0]!;
  const middle = byShare.find((c) => c.ctr > 0 && c.key !== aware.key) ?? byShare[0]!;
  const near = byShare.find((c) => c.ctr === 0 && c.key !== aware.key) ?? byShare[1] ?? middle;
  const second = byBias.find((c) => c.key !== aware.key && c.key !== near.key && c.key !== middle.key) ?? aware;
  const plans: string[][] = [[aware.key, middle.key, near.key, DIRECT_KEY], [second.key, middle.key, near.key]];
  const locs = locsOf(ds, loc);
  const [open, close] = p.hours;
  return plans.map((keys, b) => {
    const at = locs[Math.floor(r() * locs.length)]!;
    const place = at.name;
    const svc = p.services[Math.floor(r() * p.services.length)]!;
    const paidDay = win[1] - 1 - Math.floor(r() * Math.min(5, win[1] - win[0]));
    const first = -(PATH_DAYS - Math.floor(r() * 8)); // первое касание — за 23–30 дней до оплаты
    const last = -Math.floor(r() * 3);
    const credited = creditedIndex(keys, model);
    let prevDay = first;
    const touches = keys.map((key, k) => {
      const even = first + ((last - first) * k) / Math.max(1, keys.length - 1);
      const day = Math.max(prevDay, Math.min(0, Math.round(even + (k && k < keys.length - 1 ? r() * 4 - 2 : 0))));
      prevDay = day;
      const c = p.channels.find((x) => x.key === key);
      const hour = open + Math.floor(r() * Math.max(1, close - open));
      return {
        id: `${b}-${k}`, day, date: shortDate(ds.anchor, paidDay + day), time: `${hour}:${String(Math.floor(r() * 12) * 5).padStart(2, '0')}`,
        channelKey: key, channel: c?.name ?? DIRECT_NAME, index: channelIndex(ds, key), action: actionOf(c, place), credited: k === credited,
      };
    });
    return {
      id: `buyer-${b}`, name: BUYERS[(b * 3 + Math.floor(r() * 3)) % BUYERS.length]!, place, touches, service: svc.name,
      amount: Math.round((svc.price * at.check * jitter(r, 0.1)) / 100) * 100, paidDate: shortDate(ds.anchor, paidDay), credited: touches[credited]?.channel ?? DIRECT_NAME,
    };
  });
}

// ── a5. Многоканальные продажи ────────────────────────────────

export interface PairRow { key: string; first: string; firstKey: string; firstIndex: number; then: string; thenKey: string; thenIndex: number; sales: number; share: number; revenue: number }
export interface MultiModel { total: number; multi: number; share: number; avgTouches: number; avgDays: number; pairs: PairRow[]; other: number; revenue: number }

const TOP_PAIRS = 5;
const DIRECT_PAIR_WEIGHT = 0.3; // прямой заход есть почти в каждом пути, но как пара он ничего не объясняет

export function multiChannel(ds: Dataset, loc: LocFilter, win: Win): MultiModel {
  const p = ds.profile;
  const t = totals(ds, loc, win);
  const r = rng(seedOf(p.key, loc, win[0], win[1], 'multi'));
  const share = 0.25 + rng(seedOf(p.key, loc, 'multi-base'))() * 0.1 + r() * 0.05;
  const multi = Math.round(t.served * share);
  const direct = Math.max(0, 1 - sumOf(p.channels.map((c) => c.share)));
  const nodes = [...p.channels.map((c) => ({ key: c.key, name: c.name, share: c.share, bias: c.firstBias })), { key: DIRECT_KEY, name: DIRECT_NAME, share: direct * DIRECT_PAIR_WEIGHT, bias: 0.6 }];
  const cand = nodes.flatMap((a, i) => nodes.slice(i + 1).map((b) => {
    const [first, then] = a.bias >= b.bias ? [a, b] : [b, a];
    return { first, then, w: a.share * b.share * (a.bias + b.bias) };
  })).sort((x, y) => y.w - x.w);
  const top = cand.slice(0, TOP_PAIRS);
  const split = splitInt(multi, [...top.map((c) => c.w), sumOf(cand.slice(TOP_PAIRS).map((c) => c.w))]);
  const check = avgCheck(ds, t);
  const pairs = top.map((c, k) => ({
    key: `${c.first.key}+${c.then.key}`, first: c.first.name, firstKey: c.first.key, firstIndex: channelIndex(ds, c.first.key),
    then: c.then.name, thenKey: c.then.key, thenIndex: channelIndex(ds, c.then.key), sales: split[k]!, share: multi ? split[k]! / multi : 0, revenue: Math.round(split[k]! * check),
  }));
  return {
    total: t.served, multi, share: t.served ? multi / t.served : 0,
    avgTouches: Math.round((2.3 + r() * 0.8) * 10) / 10, avgDays: Math.round(6 + r() * 9),
    pairs, other: split[TOP_PAIRS] ?? 0, revenue: Math.round(multi * check),
  };
}

// ── a6. Здоровье данных ───────────────────────────────────────

export type SourceState = 'ok' | 'delay';
export interface SourceHealth { kind: SystemKind; name: string; state: SourceState; lagHours: number; lastMin: number }
export interface LocHealth { key: string; name: string; index: number; sales: number; matched: number; share: number | null; lastVisitMin: number; lastSaleMin: number }
export interface HealthModel { locs: LocHealth[]; sales: number; matched: number; share: number | null; sources: SourceHealth[]; warnings: number }

const HEALTH_KINDS: readonly SystemKind[] = ['web', 'booking', 'ads', 'telephony', 'crm', 'pos'];
export const DELAY_HOURS = 3;

export function dataHealth(ds: Dataset, loc: LocFilter, win: Win): HealthModel {
  const p = ds.profile;
  const locs = locsOf(ds, loc).map((l) => {
    const r = rng(seedOf(p.key, l.key, win[0], win[1], 'health'));
    const sales = totals(ds, l.key, win).served;
    const rate = Math.min(0.97, Math.max(0.6, (0.93 - l.unanswered * 0.8 - l.noShow * 0.3) * jitter(r, 0.015)));
    const matched = Math.round(sales * rate);
    return {
      key: l.key, name: l.name, index: p.locations.indexOf(l), sales, matched, share: ratio(matched, sales),
      lastVisitMin: 1 + Math.floor(r() * 20), lastSaleMin: 12 + Math.floor(r() * 150 * (1 + l.unanswered * 4)),
    };
  });
  const seen = new Set<string>();
  const kinds = HEALTH_KINDS.filter((k) => !seen.has(p.systems[k]) && seen.add(p.systems[k]));
  const late: SystemKind = kinds.includes('telephony') ? 'telephony' : 'ads';
  const r = rng(seedOf(p.key, loc, 'sources'));
  const sources = kinds.map((kind) => {
    const state: SourceState = kind === late ? 'delay' : 'ok';
    return { kind, name: p.systems[kind], state, lagHours: state === 'delay' ? DELAY_HOURS : 0, lastMin: state === 'delay' ? DELAY_HOURS * 60 + 7 : 1 + Math.floor(r() * 14) };
  });
  const sales = sumOf(locs.map((l) => l.sales));
  const matched = sumOf(locs.map((l) => l.matched));
  return { locs, sales, matched, share: ratio(matched, sales), sources, warnings: sources.filter((s) => s.state !== 'ok').length };
}
