// Модели раздела «CRM» r1–r5: воронка сделок, задачи, кто как ведёт заявки, карточка клиента, склад.
// Числа этапов сходятся с остальными разделами: заявки — сумма заявок каналов (как в «Маркетинге»),
// записи, приходы и выручка — итоги окна, неоплаченное — из f6. Примеры сделок и клиентов — синтетика
// с семенем по отрасли, точке и окну: при смене фильтров меняются, при перезагрузке — нет.
import { checkOf, locsOf, totals, type Dataset } from '../engine/dataset.ts';
import { channelRows } from '../engine/channels.ts';
import { clientStats, repeatDays } from '../engine/clients.ts';
import { comms } from '../engine/ops.ts';
import { jitter, rng, seedOf, splitInt } from '../engine/random.ts';
import { DAYS_TOTAL } from '../engine/calendar.ts';
import type { Forms, IndustryKey, LocFilter, LocKey, ServiceDef, Win } from '../engine/types.ts';
import { discounts } from './finance.ts';
import { AUTHORS, INITIALS } from './ops-reviews.ts';

const sum = (xs: readonly number[]) => xs.reduce((s, v) => s + v, 0);
const pickWeighted = <T>(r: () => number, xs: readonly T[], w: (x: T) => number): T => {
  const total = sum(xs.map(w));
  let x = r() * total;
  for (const it of xs) { x -= w(it); if (x < 0) return it; }
  return xs[xs.length - 1]!;
};

/** «Анна К.» — имя клиента из общего пула, без повторов внутри одного списка. */
function names(r: () => number, n: number): string[] {
  const out: string[] = [];
  for (let k = 0; out.length < n && k < n * 20; k++) {
    const g = r() < 0.55 ? 'f' : 'm';
    const pool = AUTHORS[g];
    const name = `${pool[Math.floor(r() * pool.length)]} ${INITIALS[Math.floor(r() * INITIALS.length)]}.`;
    if (!out.includes(name)) out.push(name);
  }
  return out;
}

// ── r1 Воронка сделок ─────────────────────────────────────────────

export const STAGES = [
  { key: 'new', name: 'Новая заявка', slaDays: 1 },
  { key: 'contacted', name: 'Связались', slaDays: 3 },
  { key: 'booked', name: 'Записан', slaDays: 0 },
  { key: 'came', name: 'Пришёл', slaDays: 0 },
  { key: 'paid', name: 'Оплатил', slaDays: 0 },
] as const;
export type StageKey = (typeof STAGES)[number]['key'];

export interface Deal { id: string; who: string; what: string; loc: LocKey; sum: number; from: string; ageDays: number; late: boolean }
export interface Stage { key: StageKey; name: string; count: number; sum: number; conv: number | null; deals: Deal[] }
export interface Pipeline { stages: Stage[]; leads: number; lost: number; owed: number; lateCount: number }

const DEALS_PER_STAGE = 3;
const MISSED_IN_HOURS = 0.72; // как в comms(): пропущенные в рабочее время
const REPEAT_SOURCE = 'Повторный';

/** Сколько заявок так и не дозвонились: доля пропущенных звонков и сообщений без ответа. */
function unreachedShare(ds: Dataset, f: LocFilter, win: Win): number {
  const t = totals(ds, f, win);
  const touches = t.calls + t.messages;
  return touches ? (Math.round(t.missedCalls * MISSED_IN_HOURS) + t.unanswered) / touches : 0;
}

function sampleDeals(ds: Dataset, f: LocFilter, win: Win, stage: StageKey, slaDays: number, n: number): Deal[] {
  const r = rng(seedOf(ds.profile.key, f, 'deals', stage, win[0], win[1]));
  const locs = locsOf(ds, f).filter((l) => ds.days[l.key]![win[1] - 1]?.open ?? true);
  const who = names(r, n);
  return who.map((name, k) => {
    const loc = locs[Math.floor(r() * locs.length)] ?? ds.profile.locations[0]!;
    const svc = pickWeighted(r, ds.profile.services, (s: ServiceDef) => s.share);
    const ch = r() < ds.profile.returnShare ? null : pickWeighted(r, ds.profile.channels, (c) => c.share);
    // Первая сделка в «новых» и «связались» — просроченная: так выглядит типичный день.
    const ageDays = slaDays ? (k === 0 ? slaDays + 1 + Math.floor(r() * 3) : Math.floor(r() * slaDays)) : Math.floor(r() * 5);
    return {
      id: `${stage}-${k}`, who: name, what: svc.name, loc: loc.key,
      sum: Math.round((svc.price * svc.group * loc.check) / 100) * 100,
      from: ch ? ch.name : REPEAT_SOURCE, ageDays, late: slaDays > 0 && ageDays > slaDays,
    };
  });
}

export function pipeline(ds: Dataset, f: LocFilter, win: Win): Pipeline {
  const t = totals(ds, f, win);
  const leads = sum(channelRows(ds, f, win, 'last').map((c) => c.leads));
  const booked = t.bookings;
  const contacted = Math.max(booked, leads - Math.round(leads * unreachedShare(ds, f, win)));
  const came = t.served;
  const owedRaw = discounts(ds, f, win, win).unpaid;
  // Неоплаченное из f6 — за 90 дней; в короткое окно попадает не больше, чем пришло.
  const owedCount = Math.min(owedRaw.count, Math.round(came * 0.1));
  const owed = owedRaw.count ? Math.round((owedRaw.total * owedCount) / owedRaw.count) : 0;
  const perBooking = checkOf(t);
  const counts: Record<StageKey, number> = { new: leads, contacted, booked, came, paid: came - owedCount };
  const sums: Record<StageKey, number> = {
    new: Math.round(leads * perBooking), contacted: Math.round(contacted * perBooking), booked: Math.round(booked * perBooking),
    came: t.revenue, paid: t.revenue - owed,
  };
  const stages = STAGES.map((s, k) => {
    const prev = k ? counts[STAGES[k - 1]!.key] : 0;
    return {
      key: s.key, name: s.name, count: counts[s.key], sum: sums[s.key],
      conv: k && prev ? counts[s.key] / prev : null,
      deals: sampleDeals(ds, f, win, s.key, s.slaDays, DEALS_PER_STAGE),
    };
  });
  return { stages, leads, lost: leads - contacted, owed, lateCount: stages.flatMap((s) => s.deals).filter((d) => d.late).length };
}

// ── r2 Задачи и просрочки ─────────────────────────────────────────

export interface TaskRow { loc: LocKey; callback: number; confirm: number; winBack: number; overdue: number }
export interface TaskItem { kind: 'callback' | 'confirm' | 'winback'; who: string; loc: LocKey; note: string; overdueDays: number }
export interface Tasks { rows: TaskRow[]; items: TaskItem[]; total: number; overdue: number }

const WINBACK_DAYS = 30; // спящих возвращаем равными порциями за месяц
const OVERDUE_CAP = 0.6;

/** Задачи на сегодня по точкам: перезвонить вчерашним пропущенным, подтвердить завтрашние записи, вернуть спящих. */
export function tasks(ds: Dataset, f: LocFilter, win: Win): Tasks {
  const yesterday: Win = [win[1] - 1, win[1]];
  const rows = locsOf(ds, f).map((l) => {
    const c = comms(ds, l.key, yesterday)[0]!;
    const day = ds.days[l.key]![win[1] - 1]!;
    const callback = c.missedOpen + c.unanswered;
    const confirm = day.open ? day.bookings : 0;
    const winBack = Math.round(clientStats(ds, l.key, win).sleeping / WINBACK_DAYS);
    // Чем медленнее точка отвечает, тем больше хвост вчерашних задач.
    const overdue = Math.round((callback + winBack) * Math.min(OVERDUE_CAP, l.answerMin / 60));
    return { loc: l.key, callback, confirm, winBack, overdue };
  });
  const r = rng(seedOf(ds.profile.key, f, 'tasks', win[1]));
  const worst = [...rows].sort((a, b) => b.overdue - a.overdue);
  const who = names(r, 5);
  const svc = ds.profile.services;
  const items: TaskItem[] = who.map((name, k) => {
    const want = (['callback', 'winback', 'callback', 'confirm', 'winback'] as const)[k]!;
    const withCalls = worst.filter((x) => x.callback > 0);
    const kind = want === 'callback' && !withCalls.length ? 'winback' : want;
    const pool = kind === 'callback' ? withCalls : worst;
    const row = pool[k % pool.length]!;
    const s = svc[Math.floor(r() * svc.length)]!;
    const note = kind === 'callback' ? 'пропущенный звонок, не перезвонили' : kind === 'confirm' ? `запись на завтра: ${s.name.toLowerCase()}` : `не был дольше обычного, последний визит: ${s.name.toLowerCase()}`;
    return { kind, who: name, loc: row.loc, note, overdueDays: kind === 'confirm' ? 0 : 1 + Math.floor(r() * 3) };
  });
  const total = sum(rows.map((x) => x.callback + x.confirm + x.winBack));
  return { rows, items, total, overdue: sum(rows.map((x) => x.overdue)) };
}

// ── r3 Кто как ведёт заявки ───────────────────────────────────────

const LOSS_CAP = 0.5;

export interface HandlingRow { loc: LocKey; leads: number; booked: number; bookedShare: number | null; revenue: number; answerMin: number; lost: number }

/** По администраторам точек: заявки делим пропорционально записям точки — сумма сходится с воронкой. */
export function handling(ds: Dataset, f: LocFilter, win: Win): HandlingRow[] {
  const locs = locsOf(ds, f);
  const leads = sum(channelRows(ds, f, win, 'last').map((c) => c.leads));
  const tl = locs.map((l) => totals(ds, l.key, win));
  // Медленные администраторы теряют заявки: при тех же записях заявок у них было больше.
  const split = splitInt(leads, tl.map((t, k) => t.bookings / (1 - Math.min(LOSS_CAP, locs[k]!.answerMin / 100 + locs[k]!.unanswered))));
  const cm = comms(ds, f, win);
  return locs.map((l, k) => ({
    loc: l.key, leads: split[k]!, booked: tl[k]!.bookings,
    bookedShare: split[k] ? tl[k]!.bookings / split[k]! : null,
    revenue: tl[k]!.revenue, answerMin: cm[k]!.answerMin, lost: cm[k]!.lostBookings,
  }));
}

// ── r4 Карточка клиента ───────────────────────────────────────────

export interface ClientEvent { day: number; kind: 'visit' | 'call' | 'message'; text: string; sum?: number }
export interface ClientCard { name: string; loc: LocKey; source: string; since: number; visits: number; spent: number; favorite: string; events: ClientEvent[]; nextDay: number; overdue: boolean }

const CARD_VISITS = 8;
const CARD_MAX_REPEAT = 60;

/** Пример постоянного клиента: визиты раз в обычный интервал, звонки и сообщения между ними. */
export function clientCard(ds: Dataset, f: LocFilter): ClientCard {
  const r = rng(seedOf(ds.profile.key, f, 'client-card'));
  const locs = locsOf(ds, f);
  const loc = locs[Math.floor(r() * locs.length)]!;
  // Постоянный клиент: самая частая из услуг, к которым возвращаются не реже чем раз в два месяца.
  const regular = ds.profile.services.filter((x) => x.repeatDays <= CARD_MAX_REPEAT);
  const svc = [...(regular.length ? regular : ds.profile.services)].sort((a, b) => b.share - a.share)[0]!;
  const every = Math.max(7, Math.round(Math.min(svc.repeatDays, CARD_MAX_REPEAT, repeatDays(ds) * 1.5)));
  const last = DAYS_TOTAL - 1 - Math.floor(every * (0.4 + r() * 1.1)); // последний визит: иногда уже пора возвращаться
  const price = Math.round((svc.price * svc.group * loc.check) / 100) * 100;
  const events: ClientEvent[] = [];
  let spent = 0;
  for (let k = 0; k < CARD_VISITS; k++) {
    const day = last - Math.round(k * every * jitter(r, 0.2));
    const s = Math.round((price * jitter(r, 0.25)) / 100) * 100;
    spent += s;
    events.push({ day, kind: 'visit', text: svc.name, sum: s });
    if (k < 3) events.push({ day: day - 2, kind: k % 2 ? 'call' : 'message', text: k % 2 ? 'перенос на другое время' : 'напоминание о записи, ответ «приду»' });
  }
  const ch = pickWeighted(r, ds.profile.channels, (c) => c.share);
  events.sort((a, b) => b.day - a.day);
  const nextDay = last + every;
  return {
    name: names(r, 1)[0]!, loc: loc.key, source: ch.name, since: events[events.length - 1]!.day,
    visits: CARD_VISITS, spent, favorite: svc.name, events: events.slice(0, 6), nextDay, overdue: nextDay < DAYS_TOTAL,
  };
}

// ── r5 Склад и закупки ────────────────────────────────────────────

interface Item { name: string; unit: Forms; price: number; weight: number }

export const STOCK_ITEMS: Partial<Record<IndustryKey, readonly Item[]>> = {
  clinic: [
    { name: 'Имплантаты', unit: ['шт', 'шт', 'шт'], price: 9000, weight: 0.4 },
    { name: 'Композит', unit: ['шприц', 'шприца', 'шприцев'], price: 2500, weight: 0.2 },
    { name: 'Слепочная масса', unit: ['банка', 'банки', 'банок'], price: 3200, weight: 0.15 },
    { name: 'Анестетик', unit: ['карпула', 'карпулы', 'карпул'], price: 90, weight: 0.1 },
    { name: 'Перчатки', unit: ['упаковка', 'упаковки', 'упаковок'], price: 700, weight: 0.15 },
  ],
  salon: [
    { name: 'Краска для волос', unit: ['туба', 'тубы', 'туб'], price: 650, weight: 0.35 },
    { name: 'Шампунь', unit: ['литр', 'литра', 'литров'], price: 900, weight: 0.2 },
    { name: 'Средство для укладки', unit: ['банка', 'банки', 'банок'], price: 800, weight: 0.2 },
    { name: 'Лезвия', unit: ['упаковка', 'упаковки', 'упаковок'], price: 450, weight: 0.15 },
    { name: 'Пеньюары', unit: ['упаковка', 'упаковки', 'упаковок'], price: 600, weight: 0.1 },
  ],
  auto: [
    { name: 'Моторное масло', unit: ['литр', 'литра', 'литров'], price: 750, weight: 0.3 },
    { name: 'Тормозные колодки', unit: ['комплект', 'комплекта', 'комплектов'], price: 4200, weight: 0.3 },
    { name: 'Фильтры', unit: ['шт', 'шт', 'шт'], price: 900, weight: 0.2 },
    { name: 'Антифриз', unit: ['литр', 'литра', 'литров'], price: 450, weight: 0.1 },
    { name: 'Свечи зажигания', unit: ['шт', 'шт', 'шт'], price: 700, weight: 0.1 },
  ],
  studio: [
    { name: 'Эпоксидная смола', unit: ['литр', 'литра', 'литров'], price: 2400, weight: 0.35 },
    { name: 'Акриловые краски', unit: ['набор', 'набора', 'наборов'], price: 1800, weight: 0.25 },
    { name: 'Холсты', unit: ['шт', 'шт', 'шт'], price: 450, weight: 0.2 },
    { name: 'Глина', unit: ['кг', 'кг', 'кг'], price: 300, weight: 0.1 },
    { name: 'Кисти', unit: ['набор', 'набора', 'наборов'], price: 900, weight: 0.1 },
  ],
};

export interface StockRow { key: string; loc: LocKey; item: string; unit: Forms; onHand: number; perDay: number; daysLeft: number; order: number; orderSum: number }
export interface Stock { rows: StockRow[]; value: number; toOrder: number; orderSum: number }

export const REORDER_DAYS = 10; // меньше — пора заказывать: поставка идёт около недели
export const TARGET_DAYS = 30; // заказываем с запасом на месяц

/** Остатки материалов: расход в день — из расхода материалов точки за окно, остаток — синтетика. */
export function stock(ds: Dataset, f: LocFilter, win: Win): Stock {
  const items = STOCK_ITEMS[ds.profile.key] ?? [];
  const rows: StockRow[] = [];
  for (const l of locsOf(ds, f)) {
    const t = totals(ds, l.key, win);
    if (!t.openDays) continue;
    const perDayRub = t.materials / t.openDays;
    const parts = splitInt(Math.round(perDayRub), items.map((i) => i.weight));
    const r = rng(seedOf(ds.profile.key, l.key, 'stock', win[1]));
    items.forEach((it, k) => {
      const perDay = parts[k]! / it.price; // единиц в день
      if (perDay <= 0) return;
      const days = 2 + r() * 38;
      const onHand = Math.max(1, Math.round(perDay * days));
      const daysLeft = onHand / perDay;
      const order = daysLeft < REORDER_DAYS ? Math.ceil(perDay * TARGET_DAYS - onHand) : 0;
      rows.push({ key: `${l.key}-${k}`, loc: l.key, item: it.name, unit: it.unit, onHand, perDay, daysLeft, order, orderSum: order * it.price });
    });
  }
  rows.sort((a, b) => a.daysLeft - b.daysLeft);
  const price = (row: StockRow) => items.find((i) => i.name === row.item)!.price;
  return {
    rows,
    value: Math.round(sum(rows.map((x) => x.onHand * price(x)))),
    toOrder: rows.filter((x) => x.order > 0).length,
    orderSum: sum(rows.map((x) => x.orderSum)),
  };
}
