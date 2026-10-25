// Модели раздела «Маркетинг» (m7–m12, x1). Там, где у движка нет фактов (поиск, карты, соцсети,
// промокоды), числа синтетические, но с семенем от отрасли, точки и окна и привязаны к записям движка.
import { avgCheck, locsOf, totals, type Dataset } from '../engine/dataset.ts';
import { channelRows, DIRECT_KEY } from '../engine/channels.ts';
import { DAYS_TOTAL, shortDate } from '../engine/calendar.ts';
import { staffRows } from '../engine/ops.ts';
import { jitter, rng, seedOf, splitInt } from '../engine/random.ts';
import type { IndustryKey, LocFilter, LocKey, Win } from '../engine/types.ts';
import { AGGREGATOR_KEYS, channelIndex, isMaps, ratio, sumOf, type FunnelStep } from './marketing.ts';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const locIndex = (ds: Dataset, key: LocKey) => ds.profile.locations.findIndex((l) => l.key === key);
/** Название бизнеса без типа: «Сеть стоматологий „Эмаль“» → «эмаль»; без названия — «ваша компания». */
export const brandOf = (ds: Dataset) => (/«([^»]+)»/.exec(ds.profile.business)?.[1] ?? 'ваша компания').toLowerCase();

// ── m7. Поиск ─────────────────────────────────────────────────

interface QueryDef { q: string; brand?: boolean; w: number; pos: number }

// {loc} — район точки, {brand} — название сети, {city} — город. Вес — доля показов, pos — средняя позиция.
const QUERIES: Record<IndustryKey, readonly QueryDef[]> = {
  clinic: [
    { q: '{brand} стоматология', brand: true, w: 6, pos: 1.1 }, { q: '{brand} {loc} отзывы', brand: true, w: 2, pos: 1.3 },
    { q: 'стоматология {loc}', w: 9, pos: 2.8 }, { q: 'имплантация зубов цена', w: 12, pos: 7.4 }, { q: 'брекеты цена', w: 8, pos: 9.1 },
    { q: 'лечение кариеса', w: 7, pos: 5.6 }, { q: 'профессиональная чистка зубов', w: 8, pos: 4.2 }, { q: 'стоматология рядом', w: 11, pos: 3.9 },
    { q: 'коронка на зуб стоимость', w: 5, pos: 8.3 }, { q: 'лечение каналов зуба', w: 4, pos: 6.1 },
  ],
  salon: [
    { q: 'барбершоп {brand}', brand: true, w: 6, pos: 1.1 }, { q: '{brand} {loc}', brand: true, w: 2, pos: 1.2 },
    { q: 'барбершоп {loc}', w: 9, pos: 2.4 }, { q: 'мужская стрижка {city}', w: 12, pos: 6.8 }, { q: 'барбершоп рядом', w: 11, pos: 3.6 },
    { q: 'стрижка и борода цена', w: 6, pos: 5.2 }, { q: 'детская стрижка мальчику', w: 4, pos: 8.9 }, { q: 'королевское бритьё', w: 3, pos: 4.4 },
    { q: 'камуфляж седины мужчине', w: 3, pos: 3.8 },
  ],
  fitness: [
    { q: 'фитнес {brand}', brand: true, w: 5, pos: 1.1 }, { q: '{brand} расписание', brand: true, w: 3, pos: 1.2 },
    { q: 'фитнес {loc}', w: 8, pos: 2.9 }, { q: 'пилатес на реформерах {city}', w: 7, pos: 3.4 }, { q: 'йога для начинающих', w: 9, pos: 8.7 },
    { q: 'фитнес рядом с домом', w: 11, pos: 4.8 }, { q: 'персональный тренер цена', w: 6, pos: 6.9 }, { q: 'функциональный тренинг', w: 4, pos: 5.5 },
    { q: 'абонемент в фитнес', w: 7, pos: 9.4 },
  ],
  auto: [
    { q: 'автосервис {brand}', brand: true, w: 5, pos: 1.1 }, { q: '{brand} {loc} запись', brand: true, w: 2, pos: 1.3 },
    { q: 'автосервис {loc}', w: 9, pos: 2.6 }, { q: 'замена масла цена', w: 10, pos: 6.4 }, { q: 'шиномонтаж рядом', w: 12, pos: 4.1 },
    { q: 'ремонт ходовой {city}', w: 7, pos: 5.3 }, { q: 'диагностика автомобиля', w: 6, pos: 7.2 }, { q: 'кузовной ремонт стоимость', w: 5, pos: 9.6 },
    { q: 'полировка кузова', w: 4, pos: 6.7 },
  ],
  studio: [
    { q: '{brand} мастер-классы', brand: true, w: 5, pos: 1.1 }, { q: '{brand} {loc}', brand: true, w: 2, pos: 1.2 },
    { q: 'гончарный мастер-класс {city}', w: 12, pos: 3.1 }, { q: 'мастер-класс {loc}', w: 7, pos: 2.7 }, { q: 'чем заняться вдвоём вечером', w: 9, pos: 8.8 },
    { q: 'мастер-класс по живописи', w: 8, pos: 4.9 }, { q: 'эпоксидная смола мастер-класс', w: 5, pos: 3.6 }, { q: 'день рождения в мастерской', w: 4, pos: 6.2 },
    { q: 'подарочный сертификат на мастер-класс', w: 6, pos: 5.4 },
  ],
  other: [
    { q: '{brand}', brand: true, w: 5, pos: 1.1 }, { q: '{brand} отзывы', brand: true, w: 2, pos: 1.3 },
    { q: 'услуги {loc}', w: 8, pos: 3.2 }, { q: 'услуги рядом', w: 11, pos: 4.4 }, { q: 'услуги цена {city}', w: 9, pos: 6.8 },
    { q: 'запись онлайн', w: 6, pos: 7.9 }, { q: 'консультация специалиста', w: 5, pos: 5.1 }, { q: 'экспресс-услуга быстро', w: 4, pos: 8.6 },
  ],
};

const IMPRESSIONS_PER_SALE = 14; // показов в поиске на одну оплаченную запись

/** Кликабельность по позиции: у брендового запроса первая строка забирает почти половину кликов. */
export const ctrAt = (pos: number, brand: boolean) => (brand ? 0.46 : 0.31) / pos ** (brand ? 0.5 : 1.1);

export interface QueryRow { query: string; brand: boolean; impressions: number; clicks: number; ctr: number | null; position: number }
export interface SearchSum { impressions: number; clicks: number; ctr: number | null }
export interface SearchChance { query: string; position: number; extraClicks: number }
export interface SearchModel { rows: QueryRow[]; brand: SearchSum; nonBrand: SearchSum; all: SearchSum; chance: SearchChance | null }

const TARGET_POS = 3; // до первой тройки — там начинаются клики

/** Самый показываемый небрендовый запрос ниже третьей строки: сколько кликов добавит подъём в тройку. */
function chanceOf(rows: readonly QueryRow[]): SearchChance | null {
  const low = rows.filter((r) => !r.brand && r.position > TARGET_POS).sort((a, b) => b.impressions - a.impressions)[0];
  if (!low) return null;
  return { query: low.query, position: low.position, extraClicks: Math.max(0, Math.round(low.impressions * ctrAt(TARGET_POS, false)) - low.clicks) };
}

const searchSum = (rows: readonly QueryRow[]): SearchSum => {
  const impressions = sumOf(rows.map((r) => r.impressions));
  const clicks = sumOf(rows.map((r) => r.clicks));
  return { impressions, clicks, ctr: ratio(clicks, impressions) };
};

export function searchQueries(ds: Dataset, loc: LocFilter, win: Win): SearchModel {
  const defs = QUERIES[ds.profile.key];
  const t = totals(ds, loc, win);
  const r = rng(seedOf(ds.profile.key, loc, win[0], win[1], 'search'));
  const where = locsOf(ds, loc)[0]!.name.toLowerCase();
  const impressions = splitInt(Math.round(t.served * IMPRESSIONS_PER_SALE), defs.map((d) => d.w * jitter(r, 0.15)));
  const rows = defs.map((d, k) => {
    const position = Math.max(1, Math.round(d.pos * jitter(r, 0.12) * 10) / 10);
    const impr = impressions[k]!;
    const clicks = Math.round(impr * ctrAt(position, Boolean(d.brand)));
    const query = d.q.replace('{loc}', where).replace('{brand}', brandOf(ds)).replace('{city}', ds.profile.city.toLowerCase());
    return { query, brand: Boolean(d.brand), impressions: impr, clicks, ctr: ratio(clicks, impr), position };
  }).sort((a, b) => b.clicks - a.clicks);
  return { rows, brand: searchSum(rows.filter((x) => x.brand)), nonBrand: searchSum(rows.filter((x) => !x.brand)), all: searchSum(rows), chance: chanceOf(rows) };
}

// ── m8. Карты ─────────────────────────────────────────────────

export interface MapsRow { key: string; name: string; index: number; views: number; routes: number; calls: number; site: number; actions: number; sales: number; conv: number | null }
export interface MapsModel { rows: MapsRow[]; total: MapsRow; prev: MapsRow; platforms: string[] }

function mapsRows(ds: Dataset, loc: LocFilter, win: Win): MapsRow[] {
  return locsOf(ds, loc).map((l) => {
    const sales = sumOf(channelRows(ds, l.key, win, 'last').filter((c) => isMaps(c.key)).map((c) => c.sales));
    const r = rng(seedOf(ds.profile.key, l.key, win[0], win[1], 'maps'));
    const calls = Math.round(sales * 0.9 * jitter(r, 0.15));
    const routes = Math.round(sales * 2.2 * jitter(r, 0.15));
    const site = Math.round(sales * 0.7 * jitter(r, 0.2));
    const actions = calls + routes + site;
    const actionRate = clamp(0.05 + (l.rating - 4.3) * 0.05, 0.04, 0.09) * jitter(r, 0.08); // у высокого рейтинга чаще действуют
    const views = Math.round(actions / actionRate);
    return { key: l.key, name: l.name, index: locIndex(ds, l.key), views, routes, calls, site, actions, sales, conv: ratio(actions, views) };
  });
}

function sumMaps(rows: readonly MapsRow[], name: string): MapsRow {
  const pick = (k: 'views' | 'routes' | 'calls' | 'site' | 'actions' | 'sales') => sumOf(rows.map((r) => r[k]));
  const views = pick('views');
  const actions = pick('actions');
  return { key: 'total', name, index: -1, views, routes: pick('routes'), calls: pick('calls'), site: pick('site'), actions, sales: pick('sales'), conv: ratio(actions, views) };
}

export function mapsCards(ds: Dataset, loc: LocFilter, win: Win, prevWin: Win): MapsModel {
  const rows = mapsRows(ds, loc, win);
  return {
    rows,
    total: sumMaps(rows, 'Итого'),
    prev: sumMaps(mapsRows(ds, loc, prevWin), 'Итого'),
    platforms: ds.profile.systems.maps.split(' и ').map((s) => s.trim()),
  };
}

// ── m9. Соцсети и рассылки ────────────────────────────────────

export interface SocialPlatform { key: 'vk' | 'tg'; name: string; subscribers: number[]; reach: number[]; gained: number; reachLast: number }
export interface Mailing { key: string; name: string; sent: number; opened: number; clicked: number; returned: number; revenue: number }
export interface SocialModel { labels: string[]; platforms: SocialPlatform[]; mailings: Mailing[]; mailRevenue: number; mailReturned: number }

const MIN_WEEKS = 8;
const ALL_WEEKS = Math.floor(DAYS_TOTAL / 7);
const PLATFORMS = [
  { key: 'vk', name: 'ВКонтакте', perClient: 0.35, reach: 0.28 },
  { key: 'tg', name: 'Telegram', perClient: 0.2, reach: 0.45 },
] as const;

/** Подписчики за все 104 недели от одного семени — у последней недели одно число при любом периоде. */
function subscriberSeries(ds: Dataset, loc: LocFilter, key: string, base: number, reachRate: number) {
  const r = rng(seedOf(ds.profile.key, loc, key, 'social'));
  const growth = 0.004 + r() * 0.008;
  let s = base / (1 + growth) ** ALL_WEEKS;
  const subs: number[] = [];
  const reach: number[] = [];
  for (let w = 0; w < ALL_WEEKS; w++) {
    s += s * growth * jitter(r, 0.5);
    subs.push(Math.round(s));
    reach.push(Math.round(s * reachRate * jitter(r, 0.2)));
  }
  return { subs, reach };
}

export function social(ds: Dataset, loc: LocFilter, win: Win): SocialModel {
  const t = totals(ds, loc, win);
  const year = totals(ds, loc, [DAYS_TOTAL - 364, DAYS_TOTAL]);
  const count = Math.max(MIN_WEEKS, Math.ceil((win[1] - win[0]) / 7));
  const endWeek = Math.floor(win[1] / 7);
  const from = endWeek - count;
  const labels = Array.from({ length: count }, (_, k) => shortDate(ds.anchor, (from + k) * 7));
  const platforms = PLATFORMS.map((p) => {
    const { subs, reach } = subscriberSeries(ds, loc, p.key, year.newClients * p.perClient + 200, p.reach);
    const subscribers = subs.slice(from, endWeek);
    const r = reach.slice(from, endWeek);
    return { key: p.key, name: p.name, subscribers, reach: r, gained: subscribers[subscribers.length - 1]! - (subs[from - 1] ?? subscribers[0]!), reachLast: r[r.length - 1]! };
  });
  const mr = rng(seedOf(ds.profile.key, loc, win[0], win[1], 'mail'));
  const check = avgCheck(ds, t);
  const client = ds.profile.words.client[2];
  const defs = [
    { key: 'remind', name: 'Напоминание о записи', sent: 0.9, open: 0.88, click: 0.12, back: 0.01 },
    { key: 'sleep', name: `Вернуть спящих ${client}`, sent: 0.25, open: 0.52, click: 0.09, back: 0.03 },
    { key: 'review', name: 'Просьба об отзыве', sent: 0.6, open: 0.7, click: 0.18, back: 0.004 },
    { key: 'bday', name: 'Поздравление с днём рождения', sent: 0.05, open: 0.8, click: 0.22, back: 0.12 },
    { key: 'promo', name: 'Акция месяца', sent: 0.8, open: 0.46, click: 0.07, back: 0.015 },
  ];
  const mailings = defs.map((d) => {
    const sent = Math.round(t.served * d.sent * jitter(mr, 0.1));
    const opened = Math.round(sent * d.open * jitter(mr, 0.06));
    const clicked = Math.round(opened * d.click * jitter(mr, 0.15));
    const returned = Math.min(clicked, Math.round(sent * d.back * jitter(mr, 0.2)));
    return { key: d.key, name: d.name, sent, opened, clicked, returned, revenue: Math.round(returned * check) };
  });
  return { labels, platforms, mailings, mailRevenue: sumOf(mailings.map((m) => m.revenue)), mailReturned: sumOf(mailings.map((m) => m.returned)) };
}

// ── m10. Промокоды ────────────────────────────────────────────

interface CodeDef { code: string; about: string; pct: number; w: number }

const CODES: Record<IndustryKey, readonly CodeDef[]> = {
  clinic: [
    { code: 'Gigiena20', about: 'Профгигиена −20% из VK', pct: 0.2, w: 5 }, { code: 'Pervyi10', about: 'Первый приём', pct: 0.1, w: 6 },
    { code: 'Drug1000', about: 'Приведи друга', pct: 0.08, w: 4 }, { code: 'Semya10', about: 'Семейная скидка', pct: 0.1, w: 3 },
    { code: 'Implant15', about: 'Имплантация осенью', pct: 0.15, w: 2 }, { code: 'Blog_dr_anna', about: 'Блог стоматолога', pct: 0.1, w: 1 },
  ],
  salon: [
    { code: 'Pervaya30', about: 'Первая стрижка −30%', pct: 0.3, w: 6 }, { code: 'Drug300', about: 'Приведи друга', pct: 0.15, w: 4 },
    { code: 'Papa_syn', about: 'Стрижка с сыном', pct: 0.15, w: 2 }, { code: 'Utro15', about: 'Утренние окна по будням', pct: 0.15, w: 3 },
    { code: 'Blog_kazan', about: 'Городской блогер', pct: 0.2, w: 2 },
  ],
  fitness: [
    { code: 'Probnaya', about: 'Первая тренировка бесплатно', pct: 0.5, w: 6 }, { code: 'Viz20', about: 'Открытие ВИЗ', pct: 0.2, w: 4 },
    { code: 'Drug2', about: 'Приведи друга', pct: 0.15, w: 3 }, { code: 'Reformer10', about: 'Пилатес на реформерах', pct: 0.1, w: 2 },
    { code: 'Korp15', about: 'Корпоративный абонемент', pct: 0.15, w: 2 }, { code: 'Blog_fit', about: 'Фитнес-блогер', pct: 0.1, w: 1 },
  ],
  auto: [
    { code: 'To10', about: 'Скидка на ТО из VK', pct: 0.1, w: 5 }, { code: 'Shiny', about: 'Сезонный шиномонтаж', pct: 0.1, w: 6 },
    { code: 'Drive2', about: 'Читатели бортжурналов', pct: 0.07, w: 3 }, { code: 'Avito5', about: 'Клиенты с Авито', pct: 0.05, w: 3 },
    { code: 'Polirovka', about: 'Детейлинг весной', pct: 0.12, w: 1 },
  ],
  studio: [
    { code: 'Svidanie', about: 'Свидание в студии', pct: 0.1, w: 5 }, { code: 'Podarok', about: 'Подарочный сертификат', pct: 0.08, w: 4 },
    { code: 'Kupchino20', about: 'Будни в Купчино', pct: 0.2, w: 2 }, { code: 'Tg_anons', about: 'Анонсы в Telegram', pct: 0.1, w: 3 },
    { code: 'Korporativ', about: 'Корпоративы', pct: 0.12, w: 2 }, { code: 'Blog_spb', about: 'Городской блогер', pct: 0.15, w: 2 },
    { code: 'Deti10', about: 'Детские мастер-классы', pct: 0.1, w: 1 },
  ],
  other: [
    { code: 'Pervyi15', about: 'Первый визит', pct: 0.15, w: 5 }, { code: 'Drug500', about: 'Приведи друга', pct: 0.1, w: 3 },
    { code: 'Akciya', about: 'Акция месяца из VK', pct: 0.2, w: 4 }, { code: 'Utro10', about: 'Утренние часы', pct: 0.1, w: 2 },
    { code: 'Blog_partner', about: 'Партнёрский блог', pct: 0.1, w: 1 },
  ],
};

const PROMO_OF_DISCOUNTS = 0.5; // доля всех скидок, выданных по промокодам (остальное — ручные скидки)

export interface PromoRow { code: string; about: string; pct: number; uses: number; discount: number; revenue: number }
export interface PromoModel { rows: PromoRow[]; revenue: number; discount: number; uses: number; share: number }

export function promoCodes(ds: Dataset, loc: LocFilter, win: Win): PromoModel {
  const t = totals(ds, loc, win);
  const check = avgCheck(ds, t);
  const defs = CODES[ds.profile.key];
  const r = rng(seedOf(ds.profile.key, loc, win[0], win[1], 'promo'));
  const discounts = splitInt(Math.round(t.discounts * PROMO_OF_DISCOUNTS), defs.map((d) => d.w * jitter(r, 0.25)));
  const rows = defs.map((d, k) => {
    const uses = check ? Math.round(discounts[k]! / (check * d.pct)) : 0;
    return { code: d.code, about: d.about, pct: d.pct, uses, discount: discounts[k]!, revenue: Math.round(uses * check * (1 - d.pct)) };
  }).sort((a, b) => b.revenue - a.revenue);
  const revenue = sumOf(rows.map((x) => x.revenue));
  return { rows, revenue, discount: sumOf(rows.map((x) => x.discount)), uses: sumOf(rows.map((x) => x.uses)), share: t.revenue ? revenue / t.revenue : 0 };
}

// ── m11. Как рано записываются ────────────────────────────────

export const LEAD_BINS = [
  { key: 'd0', label: 'В тот же день', from: 0, to: 0 },
  { key: 'd2', label: '1–2 дня', from: 1, to: 2 },
  { key: 'd7', label: '3–7 дней', from: 3, to: 7 },
  { key: 'd14', label: '8–14 дней', from: 8, to: 14 },
  { key: 'd30', label: '15–30 дней', from: 15, to: 30 },
  { key: 'd60', label: 'Больше месяца', from: 31, to: 60 },
] as const;

const LEAD_BASE: Record<IndustryKey, readonly number[]> = {
  clinic: [0.12, 0.2, 0.3, 0.2, 0.12, 0.06],
  salon: [0.3, 0.3, 0.25, 0.1, 0.04, 0.01],
  fitness: [0.35, 0.3, 0.2, 0.1, 0.04, 0.01],
  auto: [0.2, 0.3, 0.3, 0.12, 0.06, 0.02],
  studio: [0.1, 0.15, 0.25, 0.25, 0.17, 0.08],
  other: [0.2, 0.25, 0.3, 0.15, 0.08, 0.02],
};
// Меньше единицы — записываются спонтанно (карты, окна дня), больше — планируют заранее.
const LEAN: Record<string, number> = { maps: 0.7, '2gis': 0.7, tg: 0.8, search: 0.9, referral: 1.1, vk: 1.2, display: 1.25, [DIRECT_KEY]: 1.3 };

/** Квантиль дней по гистограмме: внутри корзины — линейно. null, если записей нет. */
export function leadQuantile(bins: readonly number[], q: number): number | null {
  const total = sumOf(bins);
  if (!total) return null;
  const goal = q * total;
  let cum = 0;
  for (let k = 0; k < bins.length; k++) {
    const n = bins[k]!;
    const b = LEAD_BINS[k]!;
    if (n && cum + n >= goal) return Math.round(b.from + ((b.to - b.from) * (goal - cum)) / n);
    cum += n;
  }
  return LEAD_BINS[LEAD_BINS.length - 1]!.to;
}

export interface LeadRow { key: string; name: string; index: number; sales: number; bins: number[]; median: number | null; sameDay: number | null; week: number | null; p90: number | null }
export interface LeadModel { rows: LeadRow[]; total: LeadRow }

const leadRow = (key: string, name: string, index: number, bins: number[]): LeadRow => {
  const sales = sumOf(bins);
  return {
    key, name, index, sales, bins, median: leadQuantile(bins, 0.5), p90: leadQuantile(bins, 0.9),
    sameDay: ratio(bins[0]!, sales), week: ratio(bins[0]! + bins[1]! + bins[2]!, sales),
  };
};

export function leadTime(ds: Dataset, loc: LocFilter, win: Win): LeadModel {
  const base = LEAD_BASE[ds.profile.key];
  const rows = channelRows(ds, loc, win, 'last').map((c) => {
    const r = rng(seedOf(ds.profile.key, loc, c.key, win[0], 'lead'));
    const lean = LEAN[c.key] ?? 1;
    const bins = splitInt(c.sales, base.map((w, k) => w * lean ** (k - 2) * jitter(r, 0.1)));
    return leadRow(c.key, c.name, channelIndex(ds, c.key), bins);
  });
  const total = leadRow('total', 'Все каналы', -1, LEAD_BINS.map((_, k) => sumOf(rows.map((x) => x.bins[k]!))));
  return { rows, total };
}

// ── m12. Агрегаторы ───────────────────────────────────────────

interface PartnerDef { key: string; name: string; rate: number; w: number }
// Для отраслей без агрегаторов в профиле: партнёрские продажи, которые сейчас прячутся в «прямых».
const PARTNERS: Partial<Record<IndustryKey, readonly PartnerDef[]>> = {
  fitness: [{ key: 'fitmost', name: 'Фитмост', rate: 0.25, w: 3 }, { key: 'corp', name: 'Корпоративные программы', rate: 0.12, w: 2 }],
  studio: [{ key: 'afisha', name: 'Яндекс Афиша', rate: 0.1, w: 3 }, { key: 'gifts', name: 'Магазины впечатлений', rate: 0.2, w: 2 }],
  other: [{ key: 'avito', name: 'Авито Услуги', rate: 0.1, w: 3 }, { key: 'profi', name: 'Профи.ру', rate: 0.15, w: 2 }],
};
const PARTNER_OF_DIRECT = 0.06;

export interface AggRow { key: string; name: string; index: number; bookings: number; revenue: number; commission: number; rate: number | null; net: number }
export interface AggModel { rows: AggRow[]; synthetic: boolean; revenue: number; commission: number; rest: number; share: number }

export function aggregators(ds: Dataset, loc: LocFilter, win: Win): AggModel {
  const t = totals(ds, loc, win);
  const ch = channelRows(ds, loc, win, 'last');
  const own = ch.filter((c) => AGGREGATOR_KEYS.has(c.key));
  let rows: AggRow[];
  if (own.length) {
    rows = own.map((c) => ({ key: c.key, name: c.name, index: channelIndex(ds, c.key), bookings: c.sales, revenue: c.revenue, commission: c.spend, rate: ratio(c.spend, c.revenue), net: c.revenue - c.spend }));
  } else {
    const defs = PARTNERS[ds.profile.key] ?? [];
    const direct = ch.find((c) => c.key === DIRECT_KEY)!;
    const w = defs.map((d) => d.w);
    const bookings = splitInt(Math.round(direct.sales * PARTNER_OF_DIRECT), w);
    const revenue = splitInt(Math.round(direct.revenue * PARTNER_OF_DIRECT), w);
    rows = defs.map((d, k) => {
      const commission = Math.round(revenue[k]! * d.rate);
      return { key: d.key, name: d.name, index: -1, bookings: bookings[k]!, revenue: revenue[k]!, commission, rate: ratio(commission, revenue[k]!), net: revenue[k]! - commission };
    });
  }
  const revenue = sumOf(rows.map((r) => r.revenue));
  return { rows, synthetic: !own.length, revenue, commission: sumOf(rows.map((r) => r.commission)), rest: t.revenue - revenue, share: t.revenue ? revenue / t.revenue : 0 };
}

// ── x1. Планы лечения (клиника) ───────────────────────────────

const PLAN_OFFER = 0.72; // консультаций, после которых врач предлагает план
const PLAN_ACCEPT = 0.55;
const PLAN_PAID = 0.86; // принятых планов, по которым уже платят
const PLAN_FULL = 0.48; // оплаченных полностью
const PLAN_ITEMS = 2.2; // сколько крупных работ в среднем плане

export interface DoctorPlans { name: string; loc: LocKey; consults: number; offered: number; accepted: number; paid: number; rate: number | null }
export interface PlansModel {
  steps: FunnelStep[];
  consults: number; offered: number; accepted: number; paid: number; full: number; partial: number;
  rejected: number; rejectedMoney: number; avgPlan: number; acceptRate: number | null;
  doctors: DoctorPlans[];
}

/** Средний план: крупные работы (цена выше медианы прайса) × сколько их обычно в плане. */
function avgPlanOf(ds: Dataset): number {
  const s = ds.profile.services;
  const prices = s.map((x) => x.price).sort((a, b) => a - b);
  const median = prices[Math.floor(prices.length / 2)]!;
  const big = s.filter((x) => x.price >= median);
  return Math.round((sumOf(big.map((x) => x.price * x.share)) / sumOf(big.map((x) => x.share))) * PLAN_ITEMS);
}

export function treatmentPlans(ds: Dataset, loc: LocFilter, win: Win): PlansModel {
  const svc = ds.profile.services;
  const ci = Math.max(0, svc.findIndex((s) => s.key === 'consult'));
  const staff = staffRows(ds, loc, win);
  const byLoc = new Map<LocKey, number>();
  for (const s of staff) byLoc.set(s.loc, (byLoc.get(s.loc) ?? 0) + s.bookings);
  const perLoc = locsOf(ds, loc).map((l) => {
    const t = totals(ds, l.key, win);
    return [l.key, t.bookings ? Math.round((t.services[ci]! * t.served) / t.bookings) : 0] as const;
  });
  const r = rng(seedOf(ds.profile.key, loc, win[0], win[1], 'plans'));
  const doctors = perLoc.flatMap(([lk, consults]) => {
    const people = staff.filter((s) => s.loc === lk);
    const mean = (byLoc.get(lk) ?? 0) / Math.max(1, people.length);
    const split = splitInt(consults, people.map((p) => p.bookings));
    return people.map((p, k) => {
      const rate = clamp(PLAN_ACCEPT * (mean ? (p.bookings / mean) ** 0.5 : 1) * jitter(r, 0.08), 0.2, 0.85);
      const offered = Math.round(split[k]! * PLAN_OFFER);
      const accepted = Math.round(offered * rate);
      return { name: p.name, loc: lk, consults: split[k]!, offered, accepted, paid: Math.round(accepted * PLAN_PAID), rate: ratio(accepted, offered) };
    });
  });
  const sum = (k: 'consults' | 'offered' | 'accepted' | 'paid') => sumOf(doctors.map((d) => d[k]));
  const [consults, offered, accepted, paid] = [sum('consults'), sum('offered'), sum('accepted'), sum('paid')];
  const full = Math.round(paid * PLAN_FULL);
  const avgPlan = avgPlanOf(ds);
  return {
    steps: [
      { key: 'consult', label: 'Консультация', value: consults },
      { key: 'offered', label: 'План предложен', value: offered },
      { key: 'accepted', label: 'План принят', value: accepted },
      { key: 'paid', label: 'Оплачен частично или полностью', value: paid },
    ],
    consults, offered, accepted, paid, full, partial: paid - full,
    rejected: offered - accepted, rejectedMoney: (offered - accepted) * avgPlan, avgPlan, acceptRate: ratio(accepted, offered),
    doctors: doctors.sort((a, b) => (b.rate ?? 0) - (a.rate ?? 0)),
  };
}
