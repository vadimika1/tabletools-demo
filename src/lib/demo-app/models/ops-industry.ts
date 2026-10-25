// Модели отраслевых блоков операционки: врачи (x2), барберы (x3), группы и тренеры (x6),
// заказ-наряды (x7), мероприятия (x9). Строятся поверх движка и сходятся с его итогами.
import { checkOf, locsOf, perHourOf, totals, type Dataset } from '../engine/dataset.ts';
import { jitter, rng, seedOf, splitInt } from '../engine/random.ts';
import type { LocFilter, LocKey, Win } from '../engine/types.ts';
import { serviceRevenue, share } from './ops.ts';
import { eventService, staffLines, type StaffLine } from './ops-team.ts';

const sum = (xs: readonly number[]) => xs.reduce((s, v) => s + v, 0);

// ── x2 Выработка врачей ──────────────────────────────────────────

/**
 * План выручки на человека — доля от средней по своей точке, округлённая до 10 тыс. ₽:
 * у клиники в спальном районе и чек, и поток ниже, план ей ставят свой.
 */
export const PLAN_K = 0.9;
const PLAN_ROUND = 10_000;

export interface DoctorLine extends StaffLine { plan: number; vsPlan: number | null }
export interface DoctorsModel { rows: DoctorLine[]; below: DoctorLine[]; lagging: DoctorLine | null; shortfall: number }

export function doctorsModel(ds: Dataset, f: LocFilter, win: Win): DoctorsModel {
  const lines = staffLines(ds, f, win);
  const plans = new Map(locsOf(ds, f).map((l) => {
    const own = lines.filter((r) => r.loc === l.key);
    const avg = own.length ? sum(own.map((r) => r.revenue)) / own.length : 0;
    return [l.key, Math.round((avg * PLAN_K) / PLAN_ROUND) * PLAN_ROUND];
  }));
  const rows = lines.map((r) => {
    const plan = plans.get(r.loc) ?? 0;
    return { ...r, plan, vsPlan: plan ? r.revenue / plan - 1 : null };
  });
  const below = rows.filter((r) => r.vsPlan !== null && r.vsPlan < 0);
  const lagging = rows.filter((r) => r.lagging).reduce<DoctorLine | null>((a, r) => (!a || r.revenue < a.revenue ? r : a), null);
  return { rows, below, lagging, shortfall: sum(below.map((r) => r.plan - r.revenue)) };
}

// ── x3 Барберы ───────────────────────────────────────────────────

export type Grade = 'топ' | 'старший' | 'младший';
export interface BarberLine extends StaffLine { grade: Grade }
export interface BarbersModel {
  rows: BarberLine[]; // по возвращаемости, от большей
  avgReturning: number | null; // средняя по охвату, взвешенная по записям
  lowest: BarberLine | null;
  lostVisits: number; // сколько визитов недобрал худший, если бы к нему возвращались как в среднем
  lostMoney: number;
}

const TOP_PER_LOC = 2;

export function barbersModel(ds: Dataset, f: LocFilter, win: Win): BarbersModel {
  const lines = staffLines(ds, f, win);
  const rank = new Map<string, number>();
  for (const l of locsOf(ds, f)) {
    lines.filter((r) => r.loc === l.key).sort((a, b) => b.revenue - a.revenue).forEach((r, k) => rank.set(`${r.loc}|${r.name}`, k));
  }
  const size = (loc: LocKey) => lines.filter((r) => r.loc === loc).length;
  const rows = lines.map((r) => {
    const k = rank.get(`${r.loc}|${r.name}`) ?? 0;
    const grade: Grade = k < TOP_PER_LOC ? 'топ' : k === size(r.loc) - 1 ? 'младший' : 'старший';
    return { ...r, grade };
  }).sort((a, b) => b.returning - a.returning);
  const avgReturning = share(sum(rows.map((r) => r.returning * r.bookings)), sum(rows.map((r) => r.bookings)));
  const lowest = rows.length ? rows[rows.length - 1]! : null;
  const lostVisits = lowest && avgReturning !== null ? Math.max(0, Math.round((avgReturning - lowest.returning) * lowest.bookings)) : 0;
  return { rows, avgReturning, lowest, lostVisits, lostMoney: lowest ? Math.round(lostVisits * lowest.check) : 0 };
}

// ── x6 Группы и тренеры ──────────────────────────────────────────

/** Мест в группе больше, чем в среднем приходит: ёмкость = средний размер × запас. */
export const SEAT_HEADROOM = 1.25;
/** Ниже этой заполняемости группа не окупает зал и тренера. */
export const MIN_FILL = 0.6;

export interface ClassLine { key: string; name: string; classes: number; seats: number; visits: number; fill: number | null; below: boolean }
export interface TrainerLine { name: string; loc: LocKey; locName: string; classes: number; visits: number; fill: number | null; below: boolean }
export interface GroupsModel { classes: ClassLine[]; trainers: TrainerLine[]; minFill: number; fill: number | null; visits: number; seats: number }

const seatsOf = (group: number) => Math.ceil(group * SEAT_HEADROOM);
const fillLine = (visits: number, seats: number) => {
  const fill = share(visits, seats);
  return { fill, below: fill !== null && fill < MIN_FILL };
};

/** Групповые занятия точки: посещения делятся по видам с весом записи × места × «интерес» к виду. */
function locGroups(ds: Dataset, loc: LocKey, win: Win) {
  const p = ds.profile;
  const t = totals(ds, loc, win);
  const came = t.bookings ? t.served / t.bookings : 0;
  const idx = p.services.map((s, k) => (s.group > 1 ? k : -1)).filter((k) => k >= 0);
  const personal = sum(p.services.map((s, k) => (s.group > 1 ? 0 : Math.round(t.services[k]! * came))));
  const visits = Math.max(0, t.visits - personal);
  const interest = idx.map((k) => 0.6 + rng(seedOf(p.key, p.services[k]!.key, 'interest'))() * 0.45);
  const split = splitInt(visits, idx.map((k, j) => t.services[k]! * seatsOf(p.services[k]!.group) * interest[j]!));
  return { idx, visits: split, classes: idx.map((k) => t.services[k]!), seats: idx.map((k) => t.services[k]! * seatsOf(p.services[k]!.group)) };
}

export function groupsModel(ds: Dataset, f: LocFilter, win: Win): GroupsModel {
  const p = ds.profile;
  const locs = locsOf(ds, f).map((l) => ({ l, g: locGroups(ds, l.key, win) }));
  const idx = p.services.map((s, k) => (s.group > 1 ? k : -1)).filter((k) => k >= 0);
  const classes = idx.map((k, j) => {
    const visits = sum(locs.map((x) => x.g.visits[j]!));
    const seats = sum(locs.map((x) => x.g.seats[j]!));
    return { key: p.services[k]!.key, name: p.services[k]!.name, classes: sum(locs.map((x) => x.g.classes[j]!)), seats, visits, ...fillLine(visits, seats) };
  });
  const staff = staffLines(ds, f, win);
  const trainers = locs.flatMap(({ l, g }) => {
    const people = staff.filter((s) => s.loc === l.key);
    const meanLoad = people.length ? sum(people.map((s) => s.load)) / people.length : 0;
    const cls = splitInt(sum(g.classes), people.map((s) => s.bookings));
    const w = people.map((s, k) => cls[k]! * (meanLoad ? Math.pow(s.load / meanLoad, 0.7) : 1));
    const vis = splitInt(sum(g.visits), w);
    const seatsPer = sum(g.classes) ? sum(g.seats) / sum(g.classes) : 0;
    return people.map((s, k) => ({ name: s.name, loc: l.key, locName: s.locName, classes: cls[k]!, visits: vis[k]!, ...fillLine(vis[k]!, Math.round(cls[k]! * seatsPer)) }));
  }).sort((a, b) => (b.fill ?? -1) - (a.fill ?? -1));
  const visits = sum(classes.map((c) => c.visits));
  const seats = sum(classes.map((c) => c.seats));
  return { classes: [...classes].sort((a, b) => (b.fill ?? -1) - (a.fill ?? -1)), trainers, minFill: MIN_FILL, fill: share(visits, seats), visits, seats };
}

// ── x7 Заказ-наряды ──────────────────────────────────────────────

/**
 * Норма загрузки поста. Выше неё в сервисе не бывает: приёмка, выдача, уборка.
 * Простоем в деньгах считаем только часы ниже нормы — остальное не продать.
 */
export const POST_NORM = 0.7;

export interface PostLine {
  loc: LocKey;
  name: string;
  capacity: number;
  sold: number;
  idle: number; // все непроданные часы
  load: number | null;
  rate: number; // выручка на проданный час
  gap: number; // часов до нормы загрузки
  gapMoney: number;
}
export interface OrdersModel {
  capacity: number; // часы постов
  sold: number; // проданные нормо-часы
  idle: number;
  gap: number;
  gapMoney: number;
  load: number | null;
  orders: number;
  check: number | null;
  rows: PostLine[];
  worst: PostLine | null; // больше всего денег в простое ниже нормы
  mechanics: StaffLine[]; // по проданным часам
}

export function ordersModel(ds: Dataset, f: LocFilter, win: Win): OrdersModel {
  const rows = locsOf(ds, f).map((l) => {
    const t = totals(ds, l.key, win);
    const rate = perHourOf(t);
    const gap = Math.max(0, Math.round(t.capacity * POST_NORM) - t.sold);
    return { loc: l.key, name: l.name, capacity: t.capacity, sold: t.sold, idle: t.capacity - t.sold, load: share(t.sold, t.capacity), rate, gap, gapMoney: Math.round(gap * rate) };
  });
  const t = totals(ds, f, win);
  const worst = rows.reduce<PostLine | null>((a, x) => (x.gapMoney > 0 && (!a || x.gapMoney > a.gapMoney) ? x : a), null);
  return {
    capacity: sum(rows.map((x) => x.capacity)), sold: sum(rows.map((x) => x.sold)), idle: sum(rows.map((x) => x.idle)),
    gap: sum(rows.map((x) => x.gap)), gapMoney: sum(rows.map((x) => x.gapMoney)),
    load: share(t.sold, t.capacity), orders: t.served, check: t.served ? checkOf(t) : null,
    rows, worst, mechanics: [...staffLines(ds, f, win)].sort((a, b) => b.sold - a.sold),
  };
}

// ── x9 Мероприятия и группы ──────────────────────────────────────

export const EVENT_KINDS = ['Дни рождения', 'Корпоративы'] as const;
const CORP_SHARE = 0.42;
const REPEAT_KEY = 'repeat';

export interface EventsLine { loc: LocKey; name: string; events: number; guests: number; revenue: number }
export interface EventSource { key: string; label: string; channel: number | null; count: number }
export interface EventsModel {
  service: string | null; // название услуги-мероприятия, null — в отрасли её нет
  events: number;
  guests: number;
  avgGroup: number | null;
  revenue: number;
  check: number | null; // на мероприятие
  kinds: number[]; // по EVENT_KINDS
  sources: EventSource[];
  rows: EventsLine[];
}

export function eventsModel(ds: Dataset, f: LocFilter, win: Win): EventsModel {
  const p = ds.profile;
  const ev = eventService(ds);
  const rows = locsOf(ds, f).map((l) => {
    if (ev < 0) return { loc: l.key, name: l.name, events: 0, guests: 0, revenue: 0 };
    const t = totals(ds, l.key, win);
    const r = rng(seedOf(p.key, l.key, 'events', win[0], win[1]));
    const events = Math.round(t.services[ev]! * (t.bookings ? t.served / t.bookings : 0));
    return { loc: l.key, name: l.name, events, guests: Math.round(events * p.services[ev]!.group * jitter(r, 0.2)), revenue: serviceRevenue(ds, l.key, win)[ev]! };
  });
  const events = sum(rows.map((x) => x.events));
  const guests = sum(rows.map((x) => x.guests));
  const revenue = sum(rows.map((x) => x.revenue));
  const r = rng(seedOf(p.key, f, 'event-sources', win[0], win[1]));
  const kinds = splitInt(events, [1 - CORP_SHARE, CORP_SHARE * jitter(r, 0.15)]);
  // Откуда пришли: три самых больших канала отрасли по записям и «повторные и рекомендации».
  const top = p.channels.map((c, k) => ({ c, k })).sort((a, b) => b.c.share - a.c.share).slice(0, 3);
  const w = [...top.map((x) => x.c.share * jitter(r, 0.25)), 0.3 * jitter(r, 0.2)];
  const counts = splitInt(events, w);
  const sources: EventSource[] = [
    ...top.map((x, j) => ({ key: x.c.key, label: x.c.name, channel: x.k, count: counts[j]! })),
    { key: REPEAT_KEY, label: 'Повторные и рекомендации', channel: null, count: counts[top.length]! },
  ];
  return {
    service: ev >= 0 ? p.services[ev]!.name : null,
    events, guests, avgGroup: share(guests, events), revenue, check: events ? Math.round(revenue / events) : null,
    kinds, sources, rows,
  };
}
