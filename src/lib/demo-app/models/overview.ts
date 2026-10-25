// Модели блоков «Обзора» o2, o3, o5, o6: чистые функции от набора данных и фильтров.
// Суммы сходятся: пункты упущенной выручки дают итог до рубля, доли точек — 100%.
import { DAYS_TOTAL, PERIODS, windowOf } from '../engine/calendar.ts';
import { avgCheck, change, loadOf, locsOf, noShowOf, totals, type Dataset } from '../engine/dataset.ts';
import { pnl } from '../engine/money.ts';
import { channelRows, type ChannelRow } from '../engine/channels.ts';
import { comms, freePrime } from '../engine/ops.ts';
import { clientStats } from '../engine/clients.ts';
import type { Compare, LocFilter, LocKey, Model, Period, Win } from '../engine/types.ts';
import type { SectionKey } from '../blocks/registry.ts';
import { count, fmt, money } from '../../../components/dash/format.ts';

const DAYS_PER_WEEK = 7;
export const DAYS = ['день', 'дня', 'дней'] as const;
export const CONTACTS = ['обращение', 'обращения', 'обращений'] as const;
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// ── Подписи точек ────────────────────────────────────────────────────

export const locName = (ds: Dataset, k: LocKey): string => ds.profile.locations.find((l) => l.key === k)?.name ?? k;

/**
 * «в точке Митино», «в точку Митино». Если название уже начинается со слова «Точка»
 * («Точка у метро»), второй раз его не повторяем: «в точке у метро».
 */
export function atLoc(ds: Dataset, k: LocKey, prep: 'в точке' | 'в точку' = 'в точке'): string {
  const name = locName(ds, k);
  return /^точка\s/i.test(name) ? `${prep} ${name.replace(/^точка\s/i, '')}` : `${prep} ${name}`;
}

// ── Общие расчёты (их же берут инсайты) ──────────────────────────────

/** Деньги, которые не пришли из-за неявок: неявки × средний чек в правилах отрасли. */
export function noShowMoney(ds: Dataset, f: LocFilter, win: Win): number {
  const t = totals(ds, f, win);
  return Math.round(t.noShows * avgCheck(ds, t));
}

/** Пустые прайм-часы за окно: freePrime считает неделю, растягиваем на длину окна. */
export function primeMoney(ds: Dataset, f: LocFilter, win: Win): { hours: number; money: number } {
  const week = freePrime(ds, f, win);
  const k = (win[1] - win[0]) / DAYS_PER_WEEK;
  return { hours: Math.round(week.hours * k), money: Math.round(week.money * k) };
}

/** Точка среза, где показатель больше всего; null, если точка одна. */
export function worstLoc(ds: Dataset, f: LocFilter, value: (k: LocKey) => number): LocKey | null {
  const locs = locsOf(ds, f);
  if (locs.length < 2) return null;
  return locs.map((l) => [l.key, value(l.key)] as const).sort((a, b) => b[1] - a[1])[0]![0];
}

export interface DeadCampaign { channel: string; channelKey: string; name: string; spend: number }

/** Кампании, которые тратили деньги и не дали ни одной продажи; самые дорогие — первыми. */
export function deadCampaigns(rows: readonly ChannelRow[]): DeadCampaign[] {
  return rows
    .flatMap((r) => r.campaigns.filter((c) => c.spend > 0 && c.sales === 0).map((c) => ({ channel: r.name, channelKey: r.key, name: c.name, spend: c.spend })))
    .sort((a, b) => b.spend - a.spend);
}

/** Самая окупаемая кампания с продажами — куда переложить бюджет. */
export function bestCampaign(rows: readonly ChannelRow[]): { channel: string; name: string; roi: number } | null {
  const all = rows.flatMap((r) => r.campaigns.filter((c) => c.spend > 0 && c.sales > 0).map((c) => ({ channel: r.name, name: c.name, roi: c.revenue / c.spend })));
  return all.sort((a, b) => b.roi - a.roi)[0] ?? null;
}

/**
 * Реклама без отдачи: расход кампаний без продаж плюс весь расход платных каналов,
 * которые не окупились (выручка меньше расхода). Один рубль не считается дважды.
 */
export function wastedAds(rows: readonly ChannelRow[]): { money: number; dead: DeadCampaign[]; losing: string[] } {
  const dead = deadCampaigns(rows);
  let sum = 0;
  const losing: string[] = [];
  for (const r of rows) {
    if (r.spend <= 0) continue;
    if (r.roi !== null && r.roi < 1) {
      sum += r.spend;
      losing.push(r.name);
    } else sum += dead.filter((d) => d.channelKey === r.key).reduce((s, d) => s + d.spend, 0);
  }
  return { money: sum, dead, losing };
}

/** Потеря от провала точки из сюжета отрасли внутри окна: сколько выручки не хватило до обычной загрузки. */
export function dipImpact(ds: Dataset, f: LocFilter, win: Win): { loc: LocKey; days: number; money: number; reason: string } | null {
  const { dip } = ds.profile.story;
  if (f !== 'all' && f !== dip.loc) return null;
  const from = Math.max(win[0], DAYS_TOTAL - dip.days);
  if (from >= win[1]) return null;
  const rev = totals(ds, dip.loc, [from, win[1]]).revenue;
  return { loc: dip.loc, days: win[1] - from, money: Math.round((rev * (1 - dip.factor)) / dip.factor), reason: dip.reason };
}

// ── o2 Упущенная выручка ─────────────────────────────────────────────

export type LostKey = 'noshow' | 'prime' | 'comms' | 'ads';
export interface LostItem {
  key: LostKey;
  money: number;
  count: number; // неявок, часов, обращений, кампаний без продаж
  worst: LocKey | null; // где больше всего
  names: string[]; // кампании и каналы — для рекламы
  section: SectionKey;
}
export interface Lost { total: number; items: LostItem[] }

export function lostRevenue(ds: Dataset, f: LocFilter, win: Win, model: Model = 'last'): Lost {
  const t = totals(ds, f, win);
  const prime = primeMoney(ds, f, win);
  const c = comms(ds, f, win);
  const ads = wastedAds(channelRows(ds, f, win, model));
  const items: LostItem[] = [
    { key: 'noshow', money: noShowMoney(ds, f, win), count: t.noShows, worst: worstLoc(ds, f, (k) => noShowMoney(ds, k, win)), names: [], section: 'ops' },
    { key: 'prime', money: prime.money, count: prime.hours, worst: worstLoc(ds, f, (k) => freePrime(ds, k, win).money), names: [], section: 'ops' },
    {
      key: 'comms', money: c.reduce((s, r) => s + r.lostMoney, 0), count: c.reduce((s, r) => s + r.missedOpen + r.unanswered, 0),
      worst: worstLoc(ds, f, (k) => c.find((r) => r.loc === k)?.lostMoney ?? 0), names: [], section: 'ops',
    },
    { key: 'ads', money: ads.money, count: ads.dead.length, worst: null, names: [...ads.dead.map((d) => d.name), ...ads.losing], section: 'marketing' },
  ];
  items.sort((a, b) => b.money - a.money);
  return { total: items.reduce((s, x) => s + x.money, 0), items };
}

// ── o3 Что сделать сейчас ────────────────────────────────────────────

export type ActionKey = 'prepay' | 'campaign' | 'prime' | 'callback' | 'sleeping' | 'dip';
export interface Action { key: ActionKey; title: string; why: string; money: number; section: SectionKey }

/** Какую долю потери реально вернуть действием: осторожные оценки, а не вся потеря. */
export const RECOVERY: Record<Exclude<ActionKey, 'campaign'>, number> = {
  prepay: 0.5, // предоплата снимает около половины неявок
  prime: 1, // движок уже оценивает только ту долю пустых прайм-часов, которую реально продать (PRIME_SELLABLE)
  callback: 0.5, // перезвонили — записалась половина из тех, кто записался бы
  sleeping: 0.1, // рассылка возвращает каждого десятого спящего
  dip: 0.5, // половину провала можно отыграть переносом записей
};
export const MIN_ACTIONS = 3;
export const MAX_ACTIONS = 5;

function prepayAction(ds: Dataset, f: LocFilter, win: Win): Action {
  // Предоплату советуем там, где неявки — самая большая ДОЛЯ записей, а не где их больше в штуках:
  // у крупной точки неявок всегда больше просто потому, что записей больше.
  const top = locsOf(ds, f)
    .map((l) => ({ k: l.key, m: noShowMoney(ds, l.key, win), rate: noShowOf(totals(ds, l.key, win)) }))
    .sort((a, b) => b.rate - a.rate)[0]!;
  return {
    key: 'prepay', section: 'ops', money: Math.round(top.m * RECOVERY.prepay),
    title: `Брать предоплату с новых ${ds.profile.words.client[2]} ${atLoc(ds, top.k)}`,
    why: `Там самая высокая доля неявок — ${fmt(top.rate, 'pct')}: за период они стоили ${money(top.m)}. Предоплата обычно снимает половину.`,
  };
}

function campaignAction(rows: readonly ChannelRow[]): Action | null {
  const dead = deadCampaigns(rows)[0];
  if (!dead) return null;
  return {
    key: 'campaign', section: 'marketing', money: dead.spend,
    title: `Отключить кампанию «${dead.name}»`,
    why: `${dead.channel}: деньги списываются, а продаж за период нет ни одной.`,
  };
}

function primeAction(ds: Dataset, f: LocFilter, win: Win): Action {
  const prime = primeMoney(ds, f, win);
  const worst = worstLoc(ds, f, (k) => freePrime(ds, k, win).money);
  return {
    key: 'prime', section: 'ops', money: Math.round(prime.money * RECOVERY.prime),
    title: 'Заполнить пустые прайм-часы',
    why: `Свободно ${prime.hours.toLocaleString('ru-RU')} ч в самое спросовое время${worst ? `, больше всего ${atLoc(ds, worst)}` : ''}. Помогут акция на эти часы и «приведи друга» для постоянных ${ds.profile.words.client[2]}.`,
  };
}

function callbackAction(ds: Dataset, f: LocFilter, win: Win): Action {
  const c = comms(ds, f, win);
  const missed = c.reduce((s, r) => s + r.missedOpen + r.unanswered, 0);
  return {
    key: 'callback', section: 'ops', money: Math.round(c.reduce((s, r) => s + r.lostMoney, 0) * RECOVERY.callback),
    title: 'Перезвонить тем, кому не ответили',
    why: `${cap(count(missed, CONTACTS))} в рабочее время остались без ответа. Примерно каждый третий записался бы.`,
  };
}

function sleepingAction(ds: Dataset, f: LocFilter, win: Win): Action {
  const cs = clientStats(ds, f, win);
  const w = ds.profile.words;
  return {
    key: 'sleeping', section: 'clients', money: Math.round(cs.sleepingValue * RECOVERY.sleeping), // разовый возврат: каждый десятый приходит хотя бы раз
    title: `Вернуть спящих ${w.client[2]}`,
    why: `${cap(count(cs.sleeping, w.client))} не приходили дольше обычного. Рассылка с поводом вернуться возвращает каждого десятого.`,
  };
}

function dipAction(ds: Dataset, f: LocFilter, win: Win): Action | null {
  const dip = dipImpact(ds, f, win);
  if (!dip) return null;
  return {
    key: 'dip', section: 'ops', money: Math.round(dip.money * RECOVERY.dip),
    title: `Поднять запись ${atLoc(ds, dip.loc)}`,
    why: `Последние ${count(dip.days, DAYS)} загрузка ниже обычного: ${dip.reason}.`,
  };
}

/** Три–пять действий с оценкой в рублях за окно, самые денежные — первыми. */
export function nextActions(ds: Dataset, f: LocFilter, win: Win, model: Model = 'last'): Action[] {
  const all = [
    prepayAction(ds, f, win),
    campaignAction(channelRows(ds, f, win, model)),
    primeAction(ds, f, win),
    callbackAction(ds, f, win),
    sleepingAction(ds, f, win),
    dipAction(ds, f, win),
  ];
  const ok = all.filter((a): a is Action => a !== null && a.money > 0).sort((a, b) => b.money - a.money);
  // Кампанию без продаж и провал точки показываем всегда: это самые конкретные действия, даже если рублей меньше
  const must = ok.filter((a) => MUST_SHOW.includes(a.key));
  const rest = ok.filter((a) => !MUST_SHOW.includes(a.key)).slice(0, MAX_ACTIONS - must.length);
  return [...must, ...rest].sort((a, b) => b.money - a.money);
}

const MUST_SHOW: readonly ActionKey[] = ['campaign', 'dip'];

// ── o5 Против всех сравнений ─────────────────────────────────────────

export type CompareKey = 'prev' | 'w4' | 'w8' | 'year';
export interface CompareRow {
  key: CompareKey;
  label: string; // после «к»: «прошлому месяцу», «тем же дням 4 недели назад»
  win: Win;
  revenue: number;
  served: number;
  revDelta: number | null;
  servedDelta: number | null;
  selected: boolean; // это сравнение выбрано в фильтрах
}
export interface CompareAll { revenue: number; served: number; rows: CompareRow[] }

const shift = (w: Win, days: number): Win => [w[0] - days, w[1] - days];
const sameWin = (a: Win, b: Win) => a[0] === b[0] && a[1] === b[1];

/**
 * Выручка и записи против прошлого периода, 4 и 8 недель назад и года назад. Совпадающие окна
 * схлопываются: у месяца «прошлый период» = «4 недели назад», у года «прошлый» = «год назад».
 */
export function compareAll(ds: Dataset, f: LocFilter, period: Period, compare: Compare): CompareAll {
  const win = windowOf(period);
  const now = totals(ds, f, win);
  const cands: { key: CompareKey; label: string; win: Win; matches: Compare[] }[] = [
    { key: 'prev', label: PERIODS[period].prevLabel, win: windowOf(period, 'prev'), matches: ['prev'] },
    { key: 'w4', label: 'тем же дням 4 недели назад', win: shift(win, 28), matches: [] },
    { key: 'w8', label: 'тем же дням 8 недель назад', win: shift(win, 56), matches: [] },
    { key: 'year', label: PERIODS[period].yearLabel, win: windowOf(period, 'year'), matches: ['year'] },
  ];
  const unique = cands
    .filter((c) => c.win[0] >= 0)
    .reduce<typeof cands>((acc, c) => {
      const dup = acc.find((x) => sameWin(x.win, c.win));
      return dup ? acc.map((x) => (x === dup ? { ...x, matches: [...x.matches, ...c.matches] } : x)) : [...acc, c];
    }, []);
  const rows = unique.map((c): CompareRow => {
    const t = totals(ds, f, c.win);
    return {
      key: c.key, label: c.label, win: c.win, revenue: t.revenue, served: t.served,
      revDelta: change(now.revenue, t.revenue), servedDelta: change(now.served, t.served), selected: c.matches.includes(compare),
    };
  });
  return { revenue: now.revenue, served: now.served, rows };
}

// ── o6 Точки рядом ───────────────────────────────────────────────────

/** Пороги «проседает» — относительно сети в целом. */
export const WEAK = { load: 0.85, noShow: 1.3, marginGap: 0.08, delta: -0.05 } as const;

export interface LocRow {
  key: LocKey;
  name: string;
  tone: number; // цвет точки: номер в профиле + 1
  revenue: number;
  share: number;
  load: number;
  noShow: number;
  profit: number;
  margin: number;
  delta: number | null;
  weak: { load: boolean; noShow: boolean; margin: boolean; delta: boolean };
  selected: boolean;
}
export type LocTotal = Pick<LocRow, 'revenue' | 'share' | 'load' | 'noShow' | 'profit' | 'margin' | 'delta'>;
export interface LocTable { rows: LocRow[]; total: LocTotal }

/** Все точки сети рядом; выбранная в фильтре отмечена, но остальные не прячутся. */
export function locationsTable(ds: Dataset, f: LocFilter, win: Win, prevWin: Win): LocTable {
  const all = totals(ds, 'all', win);
  const net = pnl(ds, 'all', win);
  const netLoad = loadOf(all);
  const netNoShow = noShowOf(all);
  const rows = ds.profile.locations.map((l, i): LocRow => {
    const t = totals(ds, l.key, win);
    const p = pnl(ds, l.key, win);
    const delta = change(t.revenue, totals(ds, l.key, prevWin).revenue);
    const load = loadOf(t);
    const noShow = noShowOf(t);
    return {
      key: l.key, name: l.name, tone: Math.min(6, i + 1), revenue: t.revenue, share: all.revenue ? t.revenue / all.revenue : 0,
      load, noShow, profit: p.profit, margin: p.margin, delta,
      weak: {
        load: load < netLoad * WEAK.load,
        noShow: noShow > netNoShow * WEAK.noShow,
        margin: p.margin < 0 || p.margin < net.margin - WEAK.marginGap,
        delta: delta !== null && delta < WEAK.delta,
      },
      selected: f === l.key,
    };
  });
  return {
    rows,
    total: { revenue: all.revenue, share: 1, load: netLoad, noShow: netNoShow, profit: net.profit, margin: net.margin, delta: change(all.revenue, totals(ds, 'all', prevWin).revenue) },
  };
}
