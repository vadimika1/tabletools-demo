// Операционка: загрузка по часам, свободные прайм-часы, неделя вперёд, персонал, обращения, отзывы.
// Всё выводится из дней точки; разбивки (сотрудники, звёзды) делятся splitInt и сходятся с итогом.
import { DAYS_TOTAL, weekdayOf, dateOf } from './calendar.ts';
import { checkOf, locsOf, perHourOf, totals, type Dataset } from './dataset.ts';
import { jitter, rng, seedOf, splitInt } from './random.ts';
import type { LocationDef, LocFilter, LocKey, Win } from './types.ts';

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export function hoursOf(ds: Dataset): number[] {
  const [open, close] = ds.profile.hours;
  return Array.from({ length: close - open }, (_, k) => open + k);
}

export function isPrime(ds: Dataset, weekday: number, hour: number): boolean {
  const [from, to] = weekday >= 5 ? ds.profile.prime.weekend : ds.profile.prime.weekday;
  return hour >= from && hour < to;
}

/** Средняя загрузка точки по дням недели в окне, 0…1. */
function loadByWeekday(ds: Dataset, loc: LocKey, [from, to]: Win): number[] {
  const sold = Array(7).fill(0) as number[];
  const cap = Array(7).fill(0) as number[];
  for (let i = from; i < to; i++) {
    const d = ds.days[loc]![i]!;
    sold[d.weekday]! += d.sold;
    cap[d.weekday]! += d.capacity;
  }
  return sold.map((s, k) => (cap[k] ? s / cap[k]! : 0));
}

/** Тепловая карта день недели × час: доля занятых единиц. Для сети — среднее, взвешенное числом единиц. */
export function heat(ds: Dataset, f: LocFilter, win: Win): number[][] {
  const hf = ds.profile.hourFactor;
  const mean = hf.reduce((s, v) => s + v, 0) / hf.length;
  const locs = locsOf(ds, f);
  const units = locs.reduce((s, l) => s + l.units, 0);
  const byWd = new Map(locs.map((l) => [l.key, loadByWeekday(ds, l.key, win)]));
  return Array.from({ length: 7 }, (_, wd) => hf.map((k, h) => {
    const sum = locs.reduce((s, l) => {
      const r = rng(seedOf(ds.profile.key, l.key, wd, h))();
      return s + l.units * clamp01(byWd.get(l.key)![wd]! * (k / mean) * (0.92 + r * 0.16));
    }, 0);
    return Math.round((sum / units) * 100) / 100;
  }));
}

// Пустой прайм-час не продаётся целиком: акцией и напоминаниями реально заполнить около трети.
// Поэтому деньги считаем по этой доле, иначе «упущенная выручка» обещает невозможное.
export const PRIME_SELLABLE = 0.3;

/** Свободные прайм-часы на неделю: единицы × незанятая доля прайм-ячеек и сколько из них реально продать, ₽. */
export function freePrime(ds: Dataset, f: LocFilter, win: Win): { hours: number; money: number } {
  const hours = hoursOf(ds);
  let free = 0;
  let money = 0;
  for (const l of locsOf(ds, f)) {
    const cells = heat(ds, l.key, win);
    const rate = perHourOf(totals(ds, l.key, win));
    const h = cells.reduce((s, row, wd) => s + row.reduce((a, v, k) => a + (isPrime(ds, wd, hours[k]!) ? (1 - v) * l.units : 0), 0), 0);
    free += h;
    money += h * rate * PRIME_SELLABLE;
  }
  return { hours: Math.round(free), money: Math.round(money) };
}

// Сколько уже записано на день вперёд: завтра почти полно, через неделю — треть.
const PREBOOKED = [0.92, 0.8, 0.68, 0.56, 0.46, 0.38, 0.3];

export interface AheadDay { offset: number; weekday: number; capacity: number; booked: number }

/** Неделя вперёд от завтрашнего дня: мощность и уже занятые часы. */
export function ahead(ds: Dataset, f: LocFilter): AheadDay[] {
  const recent: Win = [DAYS_TOTAL - 28, DAYS_TOTAL];
  const lastWd = weekdayOf(dateOf(ds.anchor, DAYS_TOTAL - 1));
  return PREBOOKED.map((pre, k) => {
    const weekday = (lastWd + 1 + k) % 7;
    let capacity = 0;
    let booked = 0;
    for (const l of locsOf(ds, f)) {
      if (!ds.days[l.key]![DAYS_TOTAL - 1]!.open) continue;
      const cap = l.units * (ds.profile.hours[1] - ds.profile.hours[0]);
      const load = loadByWeekday(ds, l.key, recent)[weekday]!;
      const r = rng(seedOf(ds.profile.key, l.key, 'ahead', k))();
      capacity += cap;
      booked += Math.round(cap * clamp01(load * pre * (0.94 + r * 0.12)));
    }
    return { offset: k + 1, weekday, capacity, booked };
  });
}

export interface StaffRow {
  name: string;
  role: string;
  loc: LocKey;
  bookings: number;
  revenue: number;
  sold: number; // занятые часы
  hours: number; // часы в смене
  load: number;
  check: number;
  returning: number; // доля вернувшихся клиентов
}

const STAFF_EXTRA = 2; // сотрудников на точке: по одному на единицу + подмена
const CHECK_SPREAD = 0.6; // < 1: разница в чеке между сотрудниками, а не только в числе записей
const SHIFT_SLACK = 1.05;

const SKILL_SPREAD = 0.15; // разброс «силы» сотрудников; отстающий по сюжету заметно ниже
// Запасные имена, если в профиле отрасли их меньше, чем людей во всей сети.
const EXTRA_FIRST = ['Алексей', 'Мария', 'Дмитрий', 'Анна', 'Сергей', 'Екатерина', 'Иван', 'Ольга', 'Павел', 'Наталья', 'Артём', 'Юлия', 'Максим', 'Ирина', 'Никита', 'Светлана'];
const EXTRA_INITIAL = 'АБВГДЕЗКЛМНОПРСТФЧШЯ';

/** Имена на всю сеть без повторов: сначала из профиля, затем запасные «Имя И.». */
export function staffNames(ds: Dataset): string[] {
  const need = ds.profile.locations.reduce((s, l) => s + l.units + STAFF_EXTRA, 0);
  const out = [...new Set(ds.profile.staffNames)];
  for (let k = 0; out.length < need; k++) {
    const name = `${EXTRA_FIRST[k % EXTRA_FIRST.length]} ${EXTRA_INITIAL[(k * 7) % EXTRA_INITIAL.length]}.`;
    if (!out.includes(name)) out.push(name);
  }
  return out;
}

function staffOf(ds: Dataset, loc: LocationDef, locIndex: number) {
  const p = ds.profile;
  const r = rng(seedOf(p.key, loc.key, 'staff'));
  const n = loc.units + STAFF_EXTRA;
  const start = p.locations.slice(0, locIndex).reduce((s, l) => s + l.units + STAFF_EXTRA, 0);
  const names = staffNames(ds);
  return Array.from({ length: n }, (_, k) => {
    const lagging = p.story.lagging.loc === loc.key && k === n - 1;
    return { name: names[start + k]!, skill: lagging ? p.story.lagging.factor : jitter(r, SKILL_SPREAD) };
  });
}

/** Разбивка точки по сотрудникам: доли от выручки, записей и часов точки, суммы сходятся с итогом. */
export function staffRows(ds: Dataset, f: LocFilter, win: Win): StaffRow[] {
  const all = ds.profile.locations;
  return locsOf(ds, f).flatMap((l) => {
    const t = totals(ds, l.key, win);
    const people = staffOf(ds, l, all.indexOf(l));
    const w = people.map((x) => x.skill);
    const revenue = splitInt(t.revenue, w);
    // Записи делим мягче, чем выручку: сильный сотрудник берёт не только больше записей, но и выше чек.
    const bookings = splitInt(t.served, w.map((x) => x ** CHECK_SPREAD));
    const sold = splitInt(t.sold, w);
    const base = Math.round((t.capacity * SHIFT_SLACK) / people.length);
    const [lo, hi] = [Math.min(...w), Math.max(...w)];
    return people.map((x, k) => ({
      name: x.name, role: ds.profile.words.staff[0], loc: l.key,
      bookings: bookings[k]!, revenue: revenue[k]!, sold: sold[k]!, hours: base,
      load: base ? sold[k]! / base : 0,
      check: bookings[k] ? revenue[k]! / bookings[k]! : 0,
      returning: Math.min(0.95, ds.profile.returnShare * (0.8 + (hi > lo ? (0.35 * (x.skill - lo)) / (hi - lo) : 0.15))),
    }));
  });
}

export interface CommsRow {
  loc: LocKey;
  calls: number;
  missed: number;
  missedOpen: number; // пропущено в рабочее время — это деньги, а не ночные звонки
  messages: number;
  unanswered: number;
  answerMin: number; // медиана ответа в рабочие часы
  waitMin: number; // сколько ждал клиент по часам на стене
  lostBookings: number;
  lostMoney: number;
}

const MISSED_IN_HOURS = 0.72;
const LOST_CONV = 0.35; // сколько пропущенных обращений стали бы записью

export function comms(ds: Dataset, f: LocFilter, win: Win): CommsRow[] {
  return locsOf(ds, f).map((l) => {
    const t = totals(ds, l.key, win);
    const r = rng(seedOf(ds.profile.key, l.key, 'comms', win[0], win[1]));
    const missedOpen = Math.round(t.missedCalls * MISSED_IN_HOURS);
    const lostBookings = Math.round((missedOpen + t.unanswered) * LOST_CONV);
    const answerMin = Math.round(l.answerMin * jitter(r, 0.15));
    return {
      loc: l.key, calls: t.calls, missed: t.missedCalls, missedOpen, messages: t.messages, unanswered: t.unanswered,
      answerMin, waitMin: Math.round(answerMin * 2.6 + l.unanswered * 900), lostBookings, lostMoney: Math.round(lostBookings * checkOf(t)),
    };
  });
}

export interface ReviewsRow { loc: LocKey; count: number; avg: number; stars: number[]; low: number; noReply: number }

const REVIEW_RATE = 0.035; // доля пришедших людей, которые пишут отзыв (в группе — каждый гость)

export function reviews(ds: Dataset, f: LocFilter, win: Win): ReviewsRow[] {
  return locsOf(ds, f).map((l) => {
    const t = totals(ds, l.key, win);
    const r = rng(seedOf(ds.profile.key, l.key, 'reviews', win[0]));
    const count = Math.round(t.visits * REVIEW_RATE * jitter(r, 0.2));
    const gap = 5 - l.rating; // 0.1 у лучших, 0.6 у слабых
    // Доли звёзд подобраны так, что средняя равна рейтингу точки: 5 − 0,3·g·1 − 0,12·g·2 − 0,06·g·3 − 0,07·g·4 = 5 − g.
    const stars = splitInt(count, [1 - gap * 0.55, gap * 0.3, gap * 0.12, gap * 0.06, gap * 0.07]); // 5★ … 1★
    const avg = count ? stars.reduce((s, n, k) => s + n * (5 - k), 0) / count : 0;
    return { loc: l.key, count, avg: Math.round(avg * 100) / 100, stars, low: stars[2]! + stars[3]! + stars[4]!, noReply: Math.round(count * Math.min(0.6, l.unanswered * 2.2)) };
  });
}

