// Модели раздела «Маркетинг» (m1–m6): чистые функции из набора данных и фильтров в данные вида.
// Всё, что пересекается с итогами движка, с ними сходится: части складываются в целое, доли — в 100%.
import { avgCheck, totals, type Dataset, type Totals } from '../engine/dataset.ts';
import { channelRows, DIRECT_KEY, type ChannelRow } from '../engine/channels.ts';
import { DAYS_TOTAL, dateOf, shortDate, weekdayOf } from '../engine/calendar.ts';
import { pnl } from '../engine/money.ts';
import { rng, seedOf, splitInt } from '../engine/random.ts';
import type { ChannelDef, LocFilter, Win } from '../engine/types.ts';

// ── Общее ──────────────────────────────────────────────────────

/** Отношение или null, если делить не на что: в интерфейсе это прочерк, а не 0 и не «+∞». */
export const ratio = (a: number, b: number): number | null => (b ? a / b : null);
export const sumOf = (xs: readonly number[]): number => xs.reduce((s, v) => s + v, 0);

/** Номер канала в профиле (для цвета сущности); прямые и повторные — −1. */
export const channelIndex = (ds: Dataset, key: string): number => ds.profile.channels.findIndex((c) => c.key === key);
export const channelDef = (ds: Dataset, key: string): ChannelDef | undefined => ds.profile.channels.find((c) => c.key === key);

/** Ключ кампании для детализации: имя кампании содержит «−», «%», «:», поэтому ключ — канал и номер. */
export const campaignKey = (channelKey: string, index: number) => `${channelKey}.${index}`;

/** Площадки-агрегаторы: запись проходит через чужой каталог, за неё платят комиссию. */
export const AGGREGATOR_KEYS: ReadonlySet<string> = new Set(['prodoctorov', 'yclients', 'avito']);
export const isMaps = (key: string) => key === 'maps' || key === '2gis';

// ── m1. Реклама по площадкам ──────────────────────────────────

export interface AdSummary {
  spend: number;
  leads: number;
  sales: number;
  revenue: number;
  cpl: number | null; // цена заявки
  cac: number | null; // цена клиента
  roi: number | null; // выручка на рубль расхода
}

export function adSummary(rows: readonly ChannelRow[]): AdSummary {
  const paid = rows.filter((r) => r.group === 'paid');
  const spend = sumOf(paid.map((r) => r.spend));
  const leads = sumOf(paid.map((r) => r.leads));
  const sales = sumOf(paid.map((r) => r.sales));
  const revenue = sumOf(paid.map((r) => r.revenue));
  return { spend, leads, sales, revenue, cpl: ratio(spend, leads), cac: ratio(spend, sales), roi: ratio(revenue, spend) };
}

export interface AdPeriod { key: string; from: number; to: number; label: string; days: number; partial: boolean; spend: number; revenue: number }

const PERIOD_DAYS = 28;
export const AD_PERIODS = 13;

/**
 * Последние 13 четырёхнедельных периодов. Периоды начинаются с понедельника по сетке от начала ряда,
 * поэтому последний обычно ещё идёт — он короче и в графике заштрихован.
 */
export function adPeriods(ds: Dataset, loc: LocFilter, count = AD_PERIODS): AdPeriod[] {
  const firstMonday = (7 - weekdayOf(dateOf(ds.anchor, 0))) % 7;
  const lastStart = firstMonday + PERIOD_DAYS * Math.floor((DAYS_TOTAL - 1 - firstMonday) / PERIOD_DAYS);
  return Array.from({ length: count }, (_, k) => {
    const from = lastStart - PERIOD_DAYS * (count - 1 - k);
    const to = Math.min(from + PERIOD_DAYS, DAYS_TOTAL);
    const s = adSummary(channelRows(ds, loc, [from, to], 'last'));
    return { key: String(from), from, to, label: shortDate(ds.anchor, from), days: to - from, partial: to - from < PERIOD_DAYS, spend: s.spend, revenue: s.revenue };
  });
}

export interface AdsModel { now: AdSummary; prev: AdSummary; rows: ChannelRow[]; periods: AdPeriod[] }

/** Платные площадки текущего окна и окна сравнения, по последнему касанию (как плитка в обзоре). */
export function adsByPlatform(ds: Dataset, loc: LocFilter, win: Win, prevWin: Win): AdsModel {
  const cur = channelRows(ds, loc, win, 'last');
  return {
    now: adSummary(cur),
    prev: adSummary(channelRows(ds, loc, prevWin, 'last')),
    rows: cur.filter((r) => r.group === 'paid'),
    periods: adPeriods(ds, loc),
  };
}

// ── m2. Вердикты кампаний ─────────────────────────────────────

export type Verdict = 'good' | 'warn' | 'bad';

export interface BreakEven {
  payroll: number; // сдельная часть зарплат к выручке
  materials: number;
  acquiring: number;
  tax: number;
  margin: number; // что остаётся с рубля выручки до аренды и окладов
  roi: number | null; // окупаемость, при которой кампания выходит в ноль
}

/** Порог окупаемости из маржинального дохода: 1 / (1 − зарплаты − материалы − эквайринг − налог). */
export function breakEven(ds: Dataset, loc: LocFilter, win: Win): BreakEven {
  const p = pnl(ds, loc, win);
  const r = (v: number) => (p.revenue ? v / p.revenue : 0);
  const payroll = ds.profile.payrollShare;
  const materials = r(p.materials);
  const acquiring = r(p.acquiring);
  const tax = r(p.taxes);
  const margin = 1 - payroll - materials - acquiring - tax;
  return { payroll, materials, acquiring, tax, margin, roi: margin > 0 ? 1 / margin : null };
}

// Вокруг порога — «около нуля»: чуть ниже ещё не повод выключать, чуть выше — ещё не успех.
export const WARN_LOW = 0.85;
export const WARN_HIGH = 1.25;

export function verdictOf(roi: number, threshold: number | null): Verdict {
  if (threshold === null) return 'bad';
  if (roi < threshold * WARN_LOW) return 'bad';
  return roi < threshold * WARN_HIGH ? 'warn' : 'good';
}

export interface CampaignPoint {
  key: string;
  channelKey: string;
  channel: string;
  name: string;
  spend: number;
  sales: number;
  revenue: number;
  roi: number;
  profit: number; // маржинальный доход кампании минус её расход
  verdict: Verdict;
}

export interface VerdictModel {
  be: BreakEven;
  points: CampaignPoint[];
  spend: number;
  budget: Record<Verdict, number>; // расход по вердиктам
  switchOff: CampaignPoint | null; // что выключить первым
  saved: number; // сколько прибыли вернёт выключение
}

export function campaignVerdicts(ds: Dataset, loc: LocFilter, win: Win): VerdictModel {
  const be = breakEven(ds, loc, win);
  const points = channelRows(ds, loc, win, 'last').flatMap((r) =>
    r.campaigns.flatMap((c, j) => {
      if (c.spend <= 0) return [];
      const roi = c.revenue / c.spend;
      return [{
        key: campaignKey(r.key, j), channelKey: r.key, channel: r.name, name: c.name, spend: c.spend, sales: c.sales, revenue: c.revenue,
        roi, profit: Math.round(c.revenue * be.margin - c.spend), verdict: verdictOf(roi, be.roi),
      }];
    }));
  const budget: Record<Verdict, number> = { good: 0, warn: 0, bad: 0 };
  for (const p of points) budget[p.verdict] += p.spend;
  const worst = points.reduce<CampaignPoint | null>((w, p) => (!w || p.profit < w.profit ? p : w), null);
  const switchOff = worst && worst.profit < 0 ? worst : null;
  return { be, points, spend: sumOf(points.map((p) => p.spend)), budget, switchOff, saved: switchOff ? -switchOff.profit : 0 };
}

// ── m3. Откуда приходят ───────────────────────────────────────

export type ChannelGroup = ChannelRow['group'];
export const GROUP_ORDER: readonly ChannelGroup[] = ['paid', 'earned', 'direct'];
export const GROUP_NAMES: Record<ChannelGroup, string> = { paid: 'Купленные', earned: 'Заработанные', direct: 'Прямые и повторные' };

export interface MixRow { key: string; name: string; group: ChannelGroup; index: number; sales: number; share: number; prevShare: number | null; shift: number | null }
export interface MixModel { rows: MixRow[]; groups: { group: ChannelGroup; sales: number; share: number }[]; total: number }

/** Оплаченные записи по каналам (последнее касание): купленные, заработанные, прямые — в этом порядке. */
export function channelMix(ds: Dataset, loc: LocFilter, win: Win, prevWin: Win): MixModel {
  const cur = channelRows(ds, loc, win, 'last');
  const prev = channelRows(ds, loc, prevWin, 'last');
  const total = sumOf(cur.map((r) => r.sales));
  const prevTotal = sumOf(prev.map((r) => r.sales));
  const rows = GROUP_ORDER.flatMap((g) => cur.filter((r) => r.group === g)).map((r) => {
    const share = total ? r.sales / total : 0;
    const p = prev.find((x) => x.key === r.key);
    const prevShare = prevTotal && p ? p.sales / prevTotal : null;
    return { key: r.key, name: r.name, group: r.group, index: channelIndex(ds, r.key), sales: r.sales, share, prevShare, shift: prevShare === null ? null : share - prevShare };
  });
  const groups = GROUP_ORDER.map((group) => {
    const sales = sumOf(rows.filter((r) => r.group === group).map((r) => r.sales));
    return { group, sales, share: total ? sales / total : 0 };
  });
  return { rows, groups, total };
}

// ── m4. Воронка записи на сайте ───────────────────────────────

export interface FunnelStep { key: string; label: string; value: number }
export interface SiteFunnel {
  steps: FunnelStep[];
  booked: number;
  abandoned: number; // выбрали услугу и время, но не записались
  abandonedMoney: number;
  callable: number; // оставили контакты, но не записались — им можно позвонить
  callableMoney: number;
  check: number;
}

const DIRECT_ONLINE = 0.2; // доля прямых и повторных, кто записывается через сайт сам

/** Каналы, которые ведут на сайт: есть показы и это не чужой каталог. */
export const isSiteChannel = (c: ChannelDef) => c.ctr > 0 && !AGGREGATOR_KEYS.has(c.key);

export function siteFunnel(ds: Dataset, loc: LocFilter, win: Win): SiteFunnel {
  const rows = channelRows(ds, loc, win, 'last');
  const site = rows.filter((r) => { const c = channelDef(ds, r.key); return c ? isSiteChannel(c) : false; });
  const direct = rows.find((r) => r.key === DIRECT_KEY)?.sales ?? 0;
  const booked = sumOf(site.map((r) => r.sales)) + Math.round(direct * DIRECT_ONLINE);
  const r = rng(seedOf(ds.profile.key, loc, win[0], win[1], 'site'));
  const toOpen = 0.14 + r() * 0.06; // зашли → открыли запись
  const toChoose = 0.52 + r() * 0.12; // открыли → выбрали услугу и время
  const toContacts = 0.6 + r() * 0.12; // выбрали → оставили контакты
  const toBooked = 0.8 + r() * 0.1; // оставили контакты → записались
  const contacts = Math.round(booked / toBooked);
  const chose = Math.round(contacts / toContacts);
  const opened = Math.round(chose / toChoose);
  const visits = Math.round(opened / toOpen);
  const check = avgCheck(ds, totals(ds, loc, win));
  const abandoned = chose - booked;
  const callable = contacts - booked;
  return {
    steps: [
      { key: 'visit', label: 'Зашли на сайт', value: visits },
      { key: 'open', label: 'Открыли запись', value: opened },
      { key: 'choose', label: 'Выбрали услугу и время', value: chose },
      { key: 'contacts', label: 'Оставили контакты', value: contacts },
      { key: 'booked', label: 'Записались', value: booked },
    ],
    booked, abandoned, abandonedMoney: Math.round(abandoned * check), callable, callableMoney: Math.round(callable * check), check,
  };
}

// ── m5. Что продаётся (ABC по вкладу в прибыль) ───────────────

export type AbcGroup = 'A' | 'B' | 'C';
export const ABC_A = 0.8;
export const ABC_B = 0.95;

export interface ServiceRow {
  key: string;
  name: string;
  index: number;
  bookings: number;
  revenue: number;
  share: number; // доля выручки услуг
  delta: number | null; // выручка к периоду сравнения
  margin: number; // выручка − материалы − сдельная зарплата
  marginShare: number;
  group: AbcGroup;
}
export interface AbcCard { group: AbcGroup; names: string[]; revenue: number; margin: number; marginShare: number }
export interface ServicesModel { rows: ServiceRow[]; cards: AbcCard[]; serviceRevenue: number; upsell: number; margin: number }

/** Выручка услуг: всё, кроме допродаж, делится по записям × размер группы × цена. Сумма с допродажами = выручка. */
export function serviceRevenue(ds: Dataset, t: Totals): number[] {
  const s = ds.profile.services;
  return splitInt(Math.max(0, t.revenue - t.upsell), t.services.map((n, k) => n * s[k]!.group * s[k]!.price));
}

export function servicesAbc(ds: Dataset, loc: LocFilter, win: Win, prevWin: Win): ServicesModel {
  const { services, payrollShare } = ds.profile;
  const t = totals(ds, loc, win);
  const rev = serviceRevenue(ds, t);
  const prev = serviceRevenue(ds, totals(ds, loc, prevWin));
  const total = sumOf(rev);
  const base = services.map((s, k) => ({
    key: s.key, name: s.name, index: k, bookings: t.services[k]!, revenue: rev[k]!,
    share: total ? rev[k]! / total : 0, delta: prev[k] ? (rev[k]! - prev[k]!) / prev[k]! : null,
    margin: Math.round(rev[k]! * (1 - s.materials - payrollShare)),
  }));
  const marginTotal = sumOf(base.map((r) => Math.max(0, r.margin)));
  let cum = 0;
  const rows: ServiceRow[] = [...base].sort((a, b) => b.margin - a.margin).map((r) => {
    const before = cum;
    const marginShare = marginTotal ? Math.max(0, r.margin) / marginTotal : 0;
    cum += marginShare;
    const group: AbcGroup = !marginTotal ? 'C' : before < ABC_A ? 'A' : before < ABC_B ? 'B' : 'C';
    return { ...r, marginShare, group };
  });
  const cards = (['A', 'B', 'C'] as const).map((group) => {
    const g = rows.filter((r) => r.group === group);
    return { group, names: g.map((r) => r.name), revenue: sumOf(g.map((r) => r.revenue)), margin: sumOf(g.map((r) => r.margin)), marginShare: sumOf(g.map((r) => r.marginShare)) };
  });
  return { rows, cards, serviceRevenue: total, upsell: t.upsell, margin: sumOf(rows.map((r) => r.margin)) };
}

// ── m6. Допродажи ─────────────────────────────────────────────

export interface UpsellItem { name: string; index: number; revenue: number; share: number; sold: number; attach: number }
export interface UpsellLoc { key: string; name: string; index: number; revenue: number; perVisit: number | null; prevPerVisit: number | null }
export interface UpsellModel { items: UpsellItem[]; locs: UpsellLoc[]; total: number; perVisit: number | null; prevPerVisit: number | null; served: number }

/** Допродажи из итога движка, разделённые по весам (цена × доля записей с допродажей). */
export function upsells(ds: Dataset, loc: LocFilter, win: Win, prevWin: Win): UpsellModel {
  const list = ds.profile.upsells;
  const t = totals(ds, loc, win);
  const tp = totals(ds, loc, prevWin);
  const split = splitInt(t.upsell, list.map((u) => u.price * u.attach));
  const items = list.map((u, k) => {
    const sold = Math.round(split[k]! / u.price);
    return { name: u.name, index: k, revenue: split[k]!, share: t.upsell ? split[k]! / t.upsell : 0, sold, attach: t.served ? sold / t.served : 0 };
  });
  const locs = (loc === 'all' ? ds.profile.locations : ds.profile.locations.filter((l) => l.key === loc)).map((l) => {
    const lt = totals(ds, l.key, win);
    const lp = totals(ds, l.key, prevWin);
    return { key: l.key, name: l.name, index: ds.profile.locations.indexOf(l), revenue: lt.upsell, perVisit: ratio(lt.upsell, lt.served), prevPerVisit: ratio(lp.upsell, lp.served) };
  });
  return { items, locs, total: t.upsell, perVisit: ratio(t.upsell, t.served), prevPerVisit: ratio(tp.upsell, tp.served), served: t.served };
}
