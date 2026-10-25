// Генератор дней: из профиля отрасли — два года фактов по каждой точке. Детерминированно:
// семя зависит от отрасли и точки, поэтому цифры одинаковы при каждом открытии демо.
import { DAYS_TOTAL, dateOf, weekdayOf } from './calendar.ts';
import { jitter, rng, seedOf, splitInt, sround } from './random.ts';
import type { Day, IndustryProfile, LocationDef, LocKey } from './types.ts';

const LOAD_MIN = 0.12;
const LOAD_MAX = 0.97;
const RAMP_DAYS = 70; // новая точка выходит на плановую загрузку за 10 недель
const RAMP_START = 0.45;
const PRICE_GROWTH_PER_YEAR = 0.08; // цены за год выросли на 8%
const CANCEL_TO_NOSHOW = 0.7;
const CALLS_PER_BOOKING = 0.45;
const MESSAGES_PER_BOOKING = 0.3;
const MISSED_CALL_K = 1.2; // звонки теряются чаще, чем сообщения
const UPSELL_MATERIALS = 0.5; // себестоимость допродаж (товары)
const SPEND_BASE = 0.35; // доля бюджета, которая не зависит от сезона
const SPEND_SEASON = 0.65;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function emptyDay(p: IndustryProfile, loc: LocKey, i: number, weekday: number, month: number): Day {
  return {
    i, loc, weekday, month, open: false, capacity: 0, sold: 0, bookings: 0, served: 0, visits: 0, noShows: 0, cancels: 0,
    services: p.services.map(() => 0), revenue: 0, upsell: 0, discounts: 0, materials: 0, newClients: 0,
    calls: 0, missedCalls: 0, messages: 0, unanswered: 0, spend: p.channels.map(() => 0),
  };
}

/** Доля рекламного бюджета сети на точку: по мощности и спросу. */
export function spendWeights(p: IndustryProfile): number[] {
  return p.locations.map((l) => l.units * l.load);
}

function generateLocation(p: IndustryProfile, loc: LocationDef, spendWeight: number, anchor: Date): Day[] {
  const r = rng(seedOf(p.key, loc.key));
  const [openH, closeH] = p.hours;
  const capacity = loc.units * (closeH - openH);
  const shareSum = p.services.reduce((s, x) => s + x.share, 0);
  const avgHours = p.services.reduce((s, x) => s + x.share * x.hours, 0) / shareSum;
  const openFrom = loc.openedDaysAgo ? DAYS_TOTAL - loc.openedDaysAgo : 0;
  const { dip } = p.story;

  return Array.from({ length: DAYS_TOTAL }, (_, i) => {
    const date = dateOf(anchor, i);
    const weekday = weekdayOf(date);
    const month = date.getUTCMonth();
    if (i < openFrom) return emptyDay(p, loc.key, i, weekday, month);

    const sinceOpen = i - openFrom;
    const ramp = loc.openedDaysAgo && sinceOpen < RAMP_DAYS ? RAMP_START + ((1 - RAMP_START) * sinceOpen) / RAMP_DAYS : 1;
    const yearsBack = (DAYS_TOTAL - 1 - i) / 364;
    const trend = 1 - p.trendPerYear * yearsBack;
    const dipK = dip.loc === loc.key && i >= DAYS_TOTAL - dip.days ? dip.factor : 1;
    const load = clamp(loc.load * p.weekdayFactor[weekday]! * p.monthFactor[month]! * trend * dipK * ramp * jitter(r, 0.07), LOAD_MIN, LOAD_MAX);

    const sold = Math.round(capacity * load);
    const bookings = Math.round((sold / avgHours) * jitter(r, 0.04));
    const services = splitInt(bookings, p.services.map((s) => s.share * jitter(r, 0.25)));
    const noShowRate = clamp(loc.noShow * jitter(r, 0.35), 0, 0.5);
    const served = bookings - sround(r, bookings * noShowRate);
    const came = bookings ? served / bookings : 0;

    const booked = Math.round(services.reduce((s, n, k) => s + n * p.services[k]!.group * jitter(r, p.services[k]!.group > 1 ? 0.15 : 0), 0));
    const visits = sround(r, booked * came);
    const noShows = booked - visits;
    const priceK = loc.check * (1 - PRICE_GROWTH_PER_YEAR * yearsBack);

    let serviceRevenue = 0;
    let materials = 0;
    services.forEach((n, k) => {
      const s = p.services[k]!;
      const rev = Math.round(n * came * s.group * s.price * priceK);
      serviceRevenue += rev;
      materials += Math.round(rev * s.materials);
    });
    const upsell = p.upsells.reduce((sum, u) => sum + sround(r, served * u.attach * jitter(r, 0.3)) * u.price, 0);
    materials += Math.round(upsell * UPSELL_MATERIALS);
    const gross = serviceRevenue + upsell;
    const discounts = Math.round(gross * p.discountShare * jitter(r, 0.3));

    const calls = Math.round(bookings * CALLS_PER_BOOKING * jitter(r, 0.2));
    const messages = Math.round(bookings * MESSAGES_PER_BOOKING * jitter(r, 0.25));
    const newShare = clamp((1 - p.returnShare) * (loc.openedDaysAgo ? 1.6 : 1) * jitter(r, 0.15), 0.05, 0.95);

    return {
      i, loc: loc.key, weekday, month, open: true, capacity, sold, bookings, served, visits, noShows,
      cancels: sround(r, noShows * CANCEL_TO_NOSHOW * jitter(r, 0.3)),
      services, revenue: gross - discounts, upsell, discounts, materials,
      newClients: sround(r, visits * newShare), // люди: в группе новичков несколько на одну запись
      calls,
      missedCalls: Math.min(calls, sround(r, calls * loc.unanswered * MISSED_CALL_K * jitter(r, 0.4))),
      messages,
      unanswered: Math.min(messages, sround(r, messages * loc.unanswered * jitter(r, 0.4))),
      // Бюджет живой: следует за сезоном (перед высоким сезоном вкладывают больше) и растёт вместе с сетью.
      spend: p.channels.map((c) => Math.round(c.spendPerDay * spendWeight * (SPEND_BASE + SPEND_SEASON * p.monthFactor[month]!) * trend * jitter(r, 0.12))),
    };
  });
}

/** Все точки отрасли: два года дней на каждую. */
export function generate(p: IndustryProfile, anchor: Date): Record<LocKey, Day[]> {
  const weights = spendWeights(p);
  const sum = weights.reduce((s, w) => s + w, 0);
  return Object.fromEntries(p.locations.map((l, k) => [l.key, generateLocation(p, l, weights[k]! / sum, anchor)]));
}
