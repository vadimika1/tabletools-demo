// Модели блоков «Операционки» p1–p5: прайм-часы, загрузка по часам, неделя вперёд, неявки, обращения.
// Чистые функции от набора данных и фильтров. Всё, что пересекается с итогами движка, сходится с ними:
// части складываются в целое до единицы (splitInt), деньги — до рубля.
import { DAYS_TOTAL, daysIn, shortDate } from '../engine/calendar.ts';
import { locsOf, perHourOf, perVisitOf, totals, type Dataset } from '../engine/dataset.ts';
import { ahead, comms, freePrime, heat, hoursOf, isPrime, type CommsRow } from '../engine/ops.ts';
import { splitInt } from '../engine/random.ts';
import type { Day, LocFilter, LocKey, Win } from '../engine/types.ts';

/** Последние четыре недели — база для прогнозов «на неделю вперёд», не зависит от выбранного периода. */
export const RECENT: Win = [DAYS_TOTAL - 28, DAYS_TOTAL];
export const YESTERDAY: Win = [DAYS_TOTAL - 1, DAYS_TOTAL];
export const LAST_7: Win = [DAYS_TOTAL - 7, DAYS_TOTAL];

export const WD_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'] as const;
export const WD_NAME = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'] as const;
/** «во вторник», «в среду» — для фраз. */
export const WD_ON = ['в понедельник', 'во вторник', 'в среду', 'в четверг', 'в пятницу', 'в субботу', 'в воскресенье'] as const;

export const locName = (ds: Dataset, key: LocKey): string => ds.profile.locations.find((l) => l.key === key)?.name ?? key;
/** Доля или null, если делить не на что: в интерфейсе это прочерк, а не 0 или ∞. */
export const share = (a: number, b: number): number | null => (b ? a / b : null);
const sum = (xs: readonly number[]) => xs.reduce((s, v) => s + v, 0);

/** Сумма поля дня по дням недели (0 — понедельник) в окне по выбранным точкам. */
export function byWeekday(ds: Dataset, f: LocFilter, [from, to]: Win, pick: (d: Day) => number): number[] {
  const out = Array(7).fill(0) as number[];
  for (const l of locsOf(ds, f)) {
    const days = ds.days[l.key]!;
    for (let i = Math.max(0, from); i < to; i++) out[days[i]!.weekday]! += pick(days[i]!);
  }
  return out;
}

/**
 * Выручка окна по услугам: итог делится пропорционально записям × размер группы × цена.
 * Сумма частей — ровно выручка окна (с допродажами и скидками, разнесёнными по долям).
 */
export function serviceRevenue(ds: Dataset, f: LocFilter, win: Win): number[] {
  const t = totals(ds, f, win);
  return splitInt(t.revenue, ds.profile.services.map((s, k) => t.services[k]! * s.group * s.price));
}

// ── p1 Свободные прайм-часы ──────────────────────────────────────

export interface PrimeLoc { loc: LocKey; name: string; hours: number; money: number }

export interface PrimeModel {
  hours: number; // свободно в прайм-время на неделю вперёд
  money: number;
  byLoc: PrimeLoc[];
  top: PrimeLoc | null; // где свободных прайм-часов больше всего
  noShowsYesterday: number;
  cancels7: number;
  visitsYesterday: number;
}

export function primeModel(ds: Dataset, f: LocFilter): PrimeModel {
  const byLoc = locsOf(ds, f).map((l) => ({ loc: l.key, name: l.name, ...freePrime(ds, l.key, RECENT) }));
  const top = byLoc.reduce<PrimeLoc | null>((a, x) => (!a || x.hours > a.hours ? x : a), null);
  const y = totals(ds, f, YESTERDAY);
  return {
    hours: sum(byLoc.map((x) => x.hours)),
    money: sum(byLoc.map((x) => x.money)),
    byLoc,
    top: top && top.hours > 0 ? top : null,
    noShowsYesterday: y.noShows,
    cancels7: totals(ds, f, LAST_7).cancels,
    visitsYesterday: y.visits,
  };
}

// ── p2 Загрузка по часам ─────────────────────────────────────────

export interface EmptySlot { loc: LocKey; name: string; weekday: number; hour: number; value: number; idleHours: number; money: number }

export interface HeatModel {
  hours: number[];
  values: number[][]; // 7 × часы, доля занятых единиц
  emptiest: EmptySlot | null; // самая пустая прайм-ячейка среди точек в охвате
}

export function heatModel(ds: Dataset, scope: LocFilter, win: Win): HeatModel {
  const hours = hoursOf(ds);
  const weeks = daysIn(win) / 7;
  let emptiest: EmptySlot | null = null;
  for (const l of locsOf(ds, scope)) {
    const cells = heat(ds, l.key, win);
    const rate = perHourOf(totals(ds, l.key, win));
    cells.forEach((row, wd) => row.forEach((v, k) => {
      const hour = hours[k]!;
      if (!isPrime(ds, wd, hour) || (emptiest && v >= emptiest.value)) return;
      const idleHours = Math.round((1 - v) * l.units * weeks);
      emptiest = { loc: l.key, name: l.name, weekday: wd, hour, value: v, idleHours, money: Math.round(idleHours * rate) };
    }));
  }
  return { hours, values: heat(ds, scope, win), emptiest };
}

// ── p3 Неделя вперёд ─────────────────────────────────────────────

export interface AheadRow {
  offset: number;
  weekday: number;
  label: string;
  capacity: number;
  booked: number;
  free: number;
  share: number | null;
  usual: number; // сколько часов обычно занято в этот день недели (последние 4 недели)
  gap: number; // сколько ещё не добрали до обычного
}

export interface AheadModel {
  days: AheadRow[];
  capacity: number;
  booked: number;
  free: number;
  share: number | null;
  gap: number; // часов до обычной загрузки по всем семи дням
  gapMoney: number; // эти часы по выручке часа последних 4 недель
  emptiest: AheadRow | null; // день с самой низкой долей записанного
}

export function aheadModel(ds: Dataset, f: LocFilter): AheadModel {
  const sold = byWeekday(ds, f, RECENT, (d) => d.sold);
  const cap = byWeekday(ds, f, RECENT, (d) => d.capacity);
  const days = ahead(ds, f).map((d) => {
    const usual = Math.round(d.capacity * (cap[d.weekday] ? sold[d.weekday]! / cap[d.weekday]! : 0));
    return {
      ...d,
      label: `${WD_SHORT[d.weekday]}, ${shortDate(ds.anchor, DAYS_TOTAL - 1 + d.offset)}`,
      free: d.capacity - d.booked,
      share: share(d.booked, d.capacity),
      usual,
      gap: Math.max(0, usual - d.booked),
    };
  });
  const capacity = sum(days.map((d) => d.capacity));
  const booked = sum(days.map((d) => d.booked));
  const gap = sum(days.map((d) => d.gap));
  const emptiest = days.reduce<AheadRow | null>((a, d) => (d.share !== null && (!a || d.share < (a.share ?? 1)) ? d : a), null);
  return {
    days, capacity, booked, free: capacity - booked, share: share(booked, capacity), gap,
    gapMoney: Math.round(gap * perHourOf(totals(ds, f, RECENT))),
    emptiest,
  };
}

// ── p4 Неявки и отмены ───────────────────────────────────────────

export interface WeekdayRow { weekday: number; label: string; expected: number; noShows: number; cancels: number; rate: number | null; lost: number }

export interface NoShowModel {
  rows: WeekdayRow[];
  noShows: number;
  cancels: number;
  rate: number | null;
  prevNoShows: number;
  prevRate: number | null;
  lost: number; // неявки × выручка на одного пришедшего; отмены в потери не считаем — их успевают перезаписать
  worst: WeekdayRow | null;
}

export function noShowModel(ds: Dataset, f: LocFilter, win: Win, prevWin: Win): NoShowModel {
  const t = totals(ds, f, win);
  const tp = totals(ds, f, prevWin);
  const noShows = byWeekday(ds, f, win, (d) => d.noShows);
  const came = byWeekday(ds, f, win, (d) => d.visits);
  const cancels = byWeekday(ds, f, win, (d) => d.cancels);
  const lost = Math.round(t.noShows * perVisitOf(t));
  const lostBy = splitInt(lost, noShows);
  const rows = noShows.map((n, wd) => ({
    weekday: wd, label: WD_SHORT[wd]!, expected: came[wd]! + n, noShows: n, cancels: cancels[wd]!,
    rate: share(n, came[wd]! + n), lost: lostBy[wd]!,
  }));
  const worst = rows.reduce<WeekdayRow | null>((a, r) => (r.rate !== null && (!a || r.rate > (a.rate ?? 0)) ? r : a), null);
  return {
    rows, noShows: t.noShows, cancels: t.cancels, rate: share(t.noShows, t.visits + t.noShows),
    prevNoShows: tp.noShows, prevRate: share(tp.noShows, tp.visits + tp.noShows), lost, worst,
  };
}

// ── p5 Обработка обращений ───────────────────────────────────────

export interface CommsLine extends CommsRow { name: string }

export interface CommsModel {
  rows: CommsLine[];
  total: Omit<CommsRow, 'loc'>;
  worst: CommsLine | null; // точка, которая теряет больше всего денег на обращениях
}

/** Среднее, взвешенное по объёму: у сети время ответа — это время тех точек, куда пишут больше. */
const weighted = (rows: readonly CommsRow[], pick: (r: CommsRow) => number, w: (r: CommsRow) => number) => {
  const ws = sum(rows.map(w));
  return ws ? Math.round(sum(rows.map((r) => pick(r) * w(r))) / ws) : 0;
};

export function commsModel(ds: Dataset, f: LocFilter, win: Win): CommsModel {
  const rows = comms(ds, f, win).map((r) => ({ ...r, name: locName(ds, r.loc) }));
  const add = (k: keyof Omit<CommsRow, 'loc' | 'answerMin' | 'waitMin'>) => sum(rows.map((r) => r[k]));
  const total = {
    calls: add('calls'), missed: add('missed'), missedOpen: add('missedOpen'), messages: add('messages'), unanswered: add('unanswered'),
    answerMin: weighted(rows, (r) => r.answerMin, (r) => r.messages), waitMin: weighted(rows, (r) => r.waitMin, (r) => r.messages),
    lostBookings: add('lostBookings'), lostMoney: add('lostMoney'),
  };
  const worst = rows.reduce<CommsLine | null>((a, r) => (!a || r.lostMoney > a.lostMoney ? r : a), null);
  return { rows, total, worst: worst && worst.lostMoney > 0 ? worst : null };
}
