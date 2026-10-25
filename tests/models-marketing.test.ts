import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getDataset, totals, spendOf, type Dataset } from '../src/lib/demo-app/engine/dataset.ts';
import { DAYS_TOTAL, windowOf } from '../src/lib/demo-app/engine/calendar.ts';
import { channelRows } from '../src/lib/demo-app/engine/channels.ts';
import { INDUSTRY_ORDER } from '../src/lib/demo-app/industries/index.ts';
import type { Compare, LocFilter, Period, Win } from '../src/lib/demo-app/engine/types.ts';
import {
  adsByPlatform, breakEven, campaignVerdicts, channelMix, servicesAbc, siteFunnel, upsells, verdictOf, AD_PERIODS, ABC_A, ABC_B,
} from '../src/lib/demo-app/models/marketing.ts';
import {
  aggregators, leadQuantile, leadTime, mapsCards, promoCodes, searchQueries, social, treatmentPlans, LEAD_BINS,
} from '../src/lib/demo-app/models/marketing-more.ts';

interface Case { name: string; ds: Dataset; loc: LocFilter; win: Win; prevWin: Win }

/** Каждая отрасль в трёх срезах: вся сеть за месяц, одна точка за неделю к году назад, сеть за год. */
function cases(): Case[] {
  const shapes: [Period, Compare, boolean][] = [['month', 'prev', false], ['week', 'year', true], ['year', 'year', false]];
  return INDUSTRY_ORDER.flatMap((k) => {
    const ds = getDataset(k);
    return shapes.map(([p, c, single]) => ({
      name: `${k} ${p} ${single ? 'точка' : 'сеть'}`, ds, loc: single ? ds.profile.locations[0]!.key : 'all', win: windowOf(p), prevWin: windowOf(p, c),
    }));
  });
}
const CASES = cases();
const sum = (xs: readonly number[]) => xs.reduce((s, v) => s + v, 0);
const close = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps;

test('m1: итоги площадок равны сумме платных каналов, 13 периодов, последний неполный', () => {
  for (const c of CASES) {
    const m = adsByPlatform(c.ds, c.loc, c.win, c.prevWin);
    const paid = channelRows(c.ds, c.loc, c.win, 'last').filter((r) => r.group === 'paid');
    assert.equal(m.now.spend, sum(paid.map((r) => r.spend)), c.name);
    assert.equal(m.now.spend, spendOf(totals(c.ds, c.loc, c.win)), `${c.name}: вся реклама — на платных каналах`);
    assert.equal(m.now.revenue, sum(m.rows.map((r) => r.revenue)), c.name);
    assert.ok(m.now.roi === null || m.now.roi > 0, c.name);
    assert.equal(m.periods.length, AD_PERIODS);
    const last = m.periods[AD_PERIODS - 1]!;
    assert.equal(last.to, DAYS_TOTAL);
    assert.ok(m.periods.slice(0, -1).every((p) => p.days === 28 && !p.partial), c.name);
    assert.equal(last.partial, last.days < 28);
    m.periods.slice(1).forEach((p, k) => assert.equal(p.from, m.periods[k]!.to, 'периоды идут встык'));
  }
});

test('m1: без расхода цена клиента и окупаемость — прочерк (null), а не 0 или бесконечность', () => {
  const ds = getDataset('clinic');
  const m = adsByPlatform(ds, 'all', [0, 0], [0, 0]);
  assert.equal(m.now.cac, null);
  assert.equal(m.now.roi, null);
  assert.equal(m.now.cpl, null);
});

test('m2: порог окупаемости = 1 / маржинальный доход; вердикты по порогу; бюджет по вердиктам = весь расход кампаний', () => {
  for (const c of CASES) {
    const v = campaignVerdicts(c.ds, c.loc, c.win);
    const be = breakEven(c.ds, c.loc, c.win);
    assert.ok(be.margin > 0 && be.margin < 1, c.name);
    assert.ok(close(be.roi!, 1 / (1 - be.payroll - be.materials - be.acquiring - be.tax)), c.name);
    assert.equal(v.spend, spendOf(totals(c.ds, c.loc, c.win)), `${c.name}: расход кампаний = расход рекламы`);
    assert.equal(v.budget.good + v.budget.warn + v.budget.bad, v.spend, c.name);
    for (const p of v.points) {
      assert.equal(p.verdict, verdictOf(p.roi, be.roi), `${c.name}: ${p.name}`);
      assert.equal(p.profit, Math.round(p.revenue * be.margin - p.spend));
    }
    // В каждом профиле есть кампания без продаж — её и выключаем, экономия = её расход.
    assert.ok(v.switchOff, `${c.name}: есть что выключить`);
    assert.equal(v.switchOff!.verdict, 'bad');
    assert.ok(v.points.every((p) => p.profit >= v.switchOff!.profit), `${c.name}: выключаем худшую`);
    if (v.switchOff!.revenue === 0) assert.equal(v.saved, v.switchOff!.spend);
  }
});

test('m2: вердикт около порога — «около нуля», ниже — «в минусе», без порога — «в минусе»', () => {
  assert.equal(verdictOf(2, 2), 'warn');
  assert.equal(verdictOf(1.6, 2), 'bad');
  assert.equal(verdictOf(3, 2), 'good');
  assert.equal(verdictOf(5, null), 'bad');
});

test('m3: доли каналов вместе с прямыми дают 100%, записи — все оплаченные', () => {
  for (const c of CASES) {
    const m = channelMix(c.ds, c.loc, c.win, c.prevWin);
    assert.equal(m.total, totals(c.ds, c.loc, c.win).served, c.name);
    assert.ok(close(sum(m.rows.map((r) => r.share)), 1), c.name);
    assert.ok(close(sum(m.groups.map((g) => g.share)), 1), c.name);
    assert.deepEqual([...new Set(m.rows.map((r) => r.group))], ['paid', 'earned', 'direct'], `${c.name}: порядок групп`);
    const direct = m.rows.find((r) => r.group === 'direct')!;
    assert.equal(direct.index, -1);
    for (const r of m.rows) if (r.shift !== null) assert.ok(close(r.shift, r.share - r.prevShare!), c.name);
  }
});

test('m4: воронка сайта сужается, записи = сайтовые каналы + часть прямых, брошенные в рублях', () => {
  for (const c of CASES) {
    const f = siteFunnel(c.ds, c.loc, c.win);
    const v = f.steps.map((s) => s.value);
    assert.equal(v.length, 5);
    for (let k = 1; k < v.length; k++) assert.ok(v[k]! <= v[k - 1]!, `${c.name}: шаг ${k}`);
    assert.equal(v[4], f.booked);
    assert.equal(f.abandoned, v[2]! - f.booked);
    assert.equal(f.abandonedMoney, Math.round(f.abandoned * f.check));
    assert.ok(f.booked <= totals(c.ds, c.loc, c.win).served, `${c.name}: с сайта не больше, чем всего`);
    assert.deepEqual(siteFunnel(c.ds, c.loc, c.win), f, 'детерминированно');
  }
});

test('m5: услуги + допродажи = выручка; ABC по вкладу в прибыль с границами 80% и 95%', () => {
  for (const c of CASES) {
    const m = servicesAbc(c.ds, c.loc, c.win, c.prevWin);
    const t = totals(c.ds, c.loc, c.win);
    assert.equal(m.serviceRevenue + m.upsell, t.revenue, c.name);
    assert.equal(sum(m.rows.map((r) => r.bookings)), t.bookings, c.name);
    assert.ok(close(sum(m.rows.map((r) => r.share)), 1), c.name);
    let cum = 0;
    for (const r of m.rows) {
      const s = c.ds.profile.services[r.index]!;
      assert.equal(r.margin, Math.round(r.revenue * (1 - s.materials - c.ds.profile.payrollShare)));
      assert.equal(r.group, cum < ABC_A ? 'A' : cum < ABC_B ? 'B' : 'C', `${c.name}: ${r.name}`);
      cum += r.marginShare;
    }
    assert.ok(m.cards[0]!.names.length > 0, `${c.name}: группа A не пустая`);
    assert.ok(close(sum(m.cards.map((x) => x.marginShare)), 1), c.name);
  }
});

test('m6: допродажи по позициям и по точкам сходятся с итогом движка', () => {
  for (const c of CASES) {
    const m = upsells(c.ds, c.loc, c.win, c.prevWin);
    const t = totals(c.ds, c.loc, c.win);
    assert.equal(sum(m.items.map((i) => i.revenue)), t.upsell, c.name);
    assert.equal(sum(m.locs.map((l) => l.revenue)), t.upsell, c.name);
    assert.ok(m.perVisit !== null && close(m.perVisit, t.upsell / t.served), c.name);
  }
});

test('m7: 8–10 запросов, брендовые отдельно, клики не больше показов, итоги сходятся', () => {
  for (const c of CASES) {
    const m = searchQueries(c.ds, c.loc, c.win);
    assert.ok(m.rows.length >= 8 && m.rows.length <= 10, c.name);
    assert.ok(m.rows.some((r) => r.brand) && m.rows.some((r) => !r.brand), c.name);
    assert.ok(m.rows.every((r) => r.clicks <= r.impressions && r.position >= 1 && !r.query.includes('{')), c.name);
    assert.equal(m.brand.clicks + m.nonBrand.clicks, m.all.clicks);
    assert.equal(m.brand.impressions + m.nonBrand.impressions, m.all.impressions);
    const brand = m.rows.filter((r) => r.brand);
    assert.ok(m.chance && m.chance.position > 3 && m.chance.extraClicks >= 0, `${c.name}: есть запрос, который стоит поднять`);
    if (c.loc === 'all') assert.ok(m.chance!.extraClicks > 0, `${c.name}: подъём в тройку добавит кликов`);
    assert.ok(Math.max(...brand.map((r) => r.position)) < Math.min(...m.rows.filter((r) => !r.brand).map((r) => r.position)), `${c.name}: по бренду вы первые`);
  }
});

test('m8: карты по точкам складываются в итог; продажи с карт = каналы карт движка', () => {
  for (const c of CASES) {
    const m = mapsCards(c.ds, c.loc, c.win, c.prevWin);
    assert.equal(m.total.views, sum(m.rows.map((r) => r.views)), c.name);
    assert.equal(m.total.actions, m.total.routes + m.total.calls + m.total.site, c.name);
    assert.ok(m.rows.every((r) => r.actions < r.views || r.views === 0), c.name);
    assert.ok(m.platforms.length >= 1, c.name);
    const fromEngine = sum(m.rows.map((r) => sum(channelRows(c.ds, r.key, c.win, 'last').filter((x) => x.key === 'maps' || x.key === '2gis').map((x) => x.sales))));
    assert.equal(m.total.sales, fromEngine, c.name);
  }
});

test('m9: подписчики растут, последняя неделя не зависит от периода, рассылки не возвращают больше, чем кликнули', () => {
  for (const c of CASES) {
    const m = social(c.ds, c.loc, c.win);
    assert.ok(m.labels.length >= 8, c.name);
    for (const p of m.platforms) {
      assert.equal(p.subscribers.length, m.labels.length);
      assert.equal(p.reach.length, m.labels.length);
      p.subscribers.slice(1).forEach((v, k) => assert.ok(v >= p.subscribers[k]!, `${c.name}: ${p.name} не падает`));
    }
    for (const x of m.mailings) assert.ok(x.opened <= x.sent && x.clicked <= x.opened && x.returned <= x.clicked, `${c.name}: ${x.name}`);
    assert.ok(m.mailRevenue < totals(c.ds, c.loc, c.win).revenue, c.name);
  }
  const ds = getDataset('salon');
  const lastOf = (p: Period) => social(ds, 'all', windowOf(p)).platforms[0]!.subscribers.at(-1);
  assert.equal(lastOf('week'), lastOf('year'));
});

test('m10: 5–7 промокодов, скидки по кодам не больше всех скидок, выручка по кодам меньше всей', () => {
  for (const c of CASES) {
    const m = promoCodes(c.ds, c.loc, c.win);
    const t = totals(c.ds, c.loc, c.win);
    assert.ok(m.rows.length >= 5 && m.rows.length <= 7, c.name);
    assert.ok(m.discount <= t.discounts, c.name);
    assert.ok(m.revenue <= t.revenue, c.name);
    assert.ok(m.rows.every((r, k) => k === 0 || r.revenue <= m.rows[k - 1]!.revenue), `${c.name}: по убыванию`);
    assert.ok(m.rows.every((r) => r.code === r.code.replace(/[^\p{L}\p{N}_]/gu, '') && r.code !== r.code.toUpperCase()), `${c.name}: коды без капса`);
  }
});

test('m11: распределение по каналам складывается в продажи, медиана ≤ 90-й процентиль', () => {
  for (const c of CASES) {
    const m = leadTime(c.ds, c.loc, c.win);
    for (const r of m.rows) {
      assert.equal(sum(r.bins), r.sales, c.name);
      if (r.median !== null) assert.ok(r.median <= r.p90!, `${c.name}: ${r.name}`);
    }
    assert.equal(m.total.sales, totals(c.ds, c.loc, c.win).served, c.name);
  }
  assert.equal(leadQuantile([0, 0, 0, 0, 0, 0], 0.5), null);
  assert.equal(leadQuantile([10, 0, 0, 0, 0, 0], 0.9), 0);
  assert.equal(leadQuantile([0, 0, 10, 0, 0, 0], 0.5), 5); // середина корзины 3–7 дней
  assert.equal(LEAD_BINS.length, 6);
});

test('m12: агрегаторы из профиля, где они есть; иначе партнёры из прямых; комиссия меньше выручки', () => {
  for (const c of CASES) {
    const m = aggregators(c.ds, c.loc, c.win);
    const t = totals(c.ds, c.loc, c.win);
    const own = ['clinic', 'salon', 'auto'].includes(c.ds.profile.key);
    assert.equal(m.synthetic, !own, c.name);
    assert.ok(m.rows.length > 0, c.name);
    assert.equal(m.revenue + m.rest, t.revenue, c.name);
    assert.ok(m.rows.every((r) => r.commission < r.revenue || r.revenue === 0), c.name);
    assert.ok(m.share > 0 && m.share < 0.5, c.name);
  }
});

test('x1: планы лечения сужаются, врачи складываются в итог, отказные в рублях', () => {
  for (const c of CASES.filter((x) => x.ds.profile.key === 'clinic')) {
    const m = treatmentPlans(c.ds, c.loc, c.win);
    const v = m.steps.map((s) => s.value);
    for (let k = 1; k < v.length; k++) assert.ok(v[k]! <= v[k - 1]!, c.name);
    assert.equal(m.consults, sum(m.doctors.map((d) => d.consults)));
    assert.equal(m.accepted, sum(m.doctors.map((d) => d.accepted)));
    assert.equal(m.full + m.partial, m.paid);
    assert.equal(m.rejectedMoney, m.rejected * m.avgPlan);
    assert.ok(m.avgPlan > 30_000, `${c.name}: план лечения — крупные работы`);
  }
  const ds = getDataset('clinic');
  const lag = ds.profile.story.lagging.loc;
  const m = treatmentPlans(ds, lag, windowOf('quarter'));
  const worst = m.doctors[m.doctors.length - 1]!;
  assert.equal(worst.loc, lag, 'хуже всех принимают планы у отстающего врача');
});
