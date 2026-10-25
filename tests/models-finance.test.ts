import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DAY_MS, DAYS_TOTAL, dateOf, windowOf } from '../src/lib/demo-app/engine/calendar.ts';
import { avgCheck, getDataset, perHourOf, spendOf, totals, type Dataset } from '../src/lib/demo-app/engine/dataset.ts';
import { PNL_LINES, pnl, profitPerBooking } from '../src/lib/demo-app/engine/money.ts';
import { INDUSTRY_ORDER } from '../src/lib/demo-app/industries/index.ts';
import {
  COST_GROUPS, MAX_SLICES, OTHER_KEY, ROYALTY,
  costStructure, discounts, partners, partsInCheck, pnlByLocation, profitCascade, unitEconomics,
} from '../src/lib/demo-app/models/finance.ts';
import { CASH_WEEKS, cashForecast } from '../src/lib/demo-app/models/cash.ts';
import type { Compare, LocFilter, Period } from '../src/lib/demo-app/engine/types.ts';

const sum = (xs: readonly number[]) => xs.reduce((s, v) => s + v, 0);

/** Срезы для проверки: вся сеть и каждая точка, короткий и длинный период, оба сравнения. */
function slices(ds: Dataset): { loc: LocFilter; period: Period; compare: Compare }[] {
  const locs: LocFilter[] = ['all', ...ds.profile.locations.map((l) => l.key)];
  return locs.flatMap((loc) => [
    { loc, period: 'month' as const, compare: 'prev' as const },
    { loc, period: 'week' as const, compare: 'prev' as const },
    { loc, period: 'quarter' as const, compare: 'year' as const },
  ]);
}

for (const key of INDUSTRY_ORDER) {
  const ds = getDataset(key);

  test(`${key}: каскад прибыли — выручка минус статьи ровно равна прибыли`, () => {
    for (const s of slices(ds)) {
      const c = profitCascade(ds, s.loc, windowOf(s.period), windowOf(s.period, s.compare));
      const [first, ...rest] = c.steps;
      const last = rest.pop()!;
      assert.equal(first!.kind, 'total');
      assert.equal(last.kind, 'result');
      assert.equal(rest.length, PNL_LINES.length);
      assert.equal(first!.value - sum(rest.map((x) => x.value)), last.value, `${s.loc}/${s.period}`);
      assert.equal(last.value, c.pnl.profit);
      if (c.marginDiff !== null) assert.ok(Math.abs(c.marginDiff - (c.pnl.margin - c.prev.margin)) < 1e-12);
      if (c.grew) assert.ok(c.grew.diff > 0);
    }
  });

  test(`${key}: P&L по точкам — итог сети равен сумме точек по каждой колонке`, () => {
    const win = windowOf('month');
    const prev = windowOf('month', 'prev');
    const { rows, total } = pnlByLocation(ds, 'all', win, prev);
    assert.equal(rows.length, ds.profile.locations.length);
    assert.equal(total.pnl.revenue, sum(rows.map((r) => r.pnl.revenue)));
    assert.equal(total.pnl.profit, sum(rows.map((r) => r.pnl.profit)));
    COST_GROUPS.forEach((_, g) => assert.equal(total.groups[g], sum(rows.map((r) => r.groups[g]!)), COST_GROUPS[g]!.name));
    for (const r of [...rows, total]) {
      assert.equal(r.pnl.revenue - sum(r.groups), r.pnl.profit, `${r.name}: группы расходов не сходятся с прибылью`);
      assert.equal(r.loss, r.pnl.profit < 0);
    }
    const net = pnl(ds, 'all', prev);
    assert.equal(total.profitDiff, total.pnl.profit - net.profit);
  });

  test(`${key}: структура расходов — не больше шести долей, доли дают 100%`, () => {
    for (const s of slices(ds)) {
      const c = costStructure(ds, s.loc, windowOf(s.period));
      const p = pnl(ds, s.loc, windowOf(s.period));
      assert.ok(c.slices.length <= MAX_SLICES);
      assert.equal(sum(c.slices.map((x) => x.value)), c.total);
      assert.equal(c.total, sum(PNL_LINES.map((l) => p[l.key])));
      assert.equal(c.total, p.revenue - p.profit);
      assert.ok(Math.abs(sum(c.slices.map((x) => x.ofCosts)) - 1) < 1e-9);
      const other = c.slices.find((x) => x.key === OTHER_KEY);
      if (other) {
        const head = c.slices.filter((x) => x.key !== OTHER_KEY);
        const smallestHead = Math.min(...head.map((x) => x.value));
        for (const k of other.lines) assert.ok(p[k] <= smallestHead, `в «Прочее» попала крупная статья ${k}`);
      }
      const lines = c.slices.flatMap((x) => x.lines);
      assert.equal(new Set(lines).size, PNL_LINES.length, 'каждая статья ровно в одной доле');
    }
  });

  test(`${key}: юнит-экономика считается движком и знает, что хорошо`, () => {
    for (const s of slices(ds)) {
      const win = windowOf(s.period);
      const t = totals(ds, s.loc, win);
      const rows = unitEconomics(ds, s.loc, win, windowOf(s.period, s.compare));
      const by = Object.fromEntries(rows.map((r) => [r.key, r]));
      assert.equal(rows.length, 6);
      assert.equal(by.check!.value, avgCheck(ds, t));
      assert.equal(by.perHour!.value, perHourOf(t));
      assert.equal(by.adShare!.value, spendOf(t) / t.revenue);
      assert.equal(by.payrollShare!.value, pnl(ds, s.loc, win).payroll / t.revenue);
      assert.equal(by.profitPerBooking!.value, profitPerBooking(ds, s.loc, win));
      assert.equal(by.adShare!.goodWhen, 'down');
      assert.equal(by.payrollShare!.goodWhen, 'down');
      assert.equal(by.check!.goodWhen, 'up');
      assert.ok(by.perClient!.value! >= by.check!.value! * 0.99 || ds.profile.checkBasis === 'visit', 'на клиента не меньше чека');
    }
  });

  test(`${key}: скидки — промокоды складываются в сумму скидок, долги — в итог`, () => {
    for (const s of slices(ds)) {
      const win = windowOf(s.period);
      const d = discounts(ds, s.loc, win, windowOf(s.period, s.compare));
      const t = totals(ds, s.loc, win);
      assert.equal(d.amount, t.discounts);
      assert.ok(d.promos.length >= 4 && d.promos.length <= 6);
      assert.equal(sum(d.promos.map((p) => p.amount)), d.amount);
      assert.ok(d.promos.every((p, k) => k === 0 || d.promos[k - 1]!.amount >= p.amount), 'по убыванию');
      assert.ok(d.share! > 0 && d.share! < 0.15, `доля скидок ${d.share}`);
      assert.equal(d.unpaid.kind, key === 'clinic' ? 'plans' : 'deposits');
      assert.equal(sum(d.unpaid.buckets.map((b) => b.amount)), d.unpaid.total);
      assert.equal(sum(d.unpaid.buckets.map((b) => b.count)), d.unpaid.count);
      assert.ok(d.unpaid.total > 0 && d.unpaid.total < t.revenue * 3);
    }
    const w = windowOf('month');
    assert.deepEqual(discounts(ds, 'all', w, windowOf('month', 'prev')), discounts(ds, 'all', w, windowOf('month', 'prev')), 'детерминированно');
  });

  test(`${key}: партнёры — роялти 8%, получено не больше начисленного, долг = разница`, () => {
    for (const p of ['week', 'month', 'year'] as const) {
      const { rows, total } = partners(ds, windowOf(p));
      assert.ok(rows.length >= 2 && rows.length <= 3);
      for (const r of rows) {
        assert.equal(r.charged, Math.round(r.revenue * ROYALTY));
        assert.ok(r.received <= r.charged && r.received >= 0);
        assert.equal(r.owed, r.charged - r.received);
        assert.notEqual(r.city, ds.profile.city);
      }
      for (const k of ['revenue', 'charged', 'received', 'owed'] as const) assert.equal(total[k], sum(rows.map((r) => r[k])));
      assert.ok(Math.max(...rows.map((r) => r.owed / r.charged)) > 0.3, 'один партнёр задерживает оплату');
    }
  });

  test(`${key}: запчасти — выручка и закупка по работам сходятся с итогами`, () => {
    for (const s of slices(ds)) {
      const win = windowOf(s.period);
      const t = totals(ds, s.loc, win);
      const { rows, total } = partsInCheck(ds, s.loc, win);
      assert.equal(total.revenue, t.revenue);
      assert.equal(sum(rows.map((r) => r.revenue)), t.revenue);
      assert.equal(total.partsCost, Math.max(0, t.materials - Math.round(t.upsell * 0.5)));
      for (const r of rows) {
        assert.ok(r.partsRevenue >= 0 && r.partsRevenue <= r.revenue);
        if (r.partsRevenue === 0) assert.equal(r.margin, null);
        if (r.share !== null) assert.ok(r.share <= 0.85 + 1e-9);
      }
    }
  });

  test(`${key}: деньги на 13 недель — остаток сходится неделя к неделе`, () => {
    for (const loc of ['all', ...ds.profile.locations.map((l) => l.key)] as LocFilter[]) {
      const c = cashForecast(ds, loc);
      assert.equal(c.weeks.length, CASH_WEEKS);
      assert.equal(c.opening, Math.max(0, pnl(ds, loc, [DAYS_TOTAL - 28, DAYS_TOTAL]).profit));
      let bal = c.opening;
      c.weeks.forEach((w, k) => {
        assert.equal(w.outflow, sum(Object.values(w.out)));
        bal += w.inflow - w.outflow;
        assert.equal(w.balance, bal, `${loc}: неделя ${k}`);
        assert.ok(w.low <= w.balance);
        assert.equal(Date.parse(w.startIso), ds.anchor.getTime() + (k * 7 + 1) * DAY_MS);
      });
      assert.equal(c.closing, bal);
      assert.equal(c.inflow - c.outflow, c.closing - c.opening);
      assert.ok(c.weeks.every((w) => w.low >= c.lowest.low));
      if (c.gap) {
        assert.ok(c.gap.amount < 0);
        assert.ok(c.weeks[c.gap.week]!.low < 0);
        assert.ok(c.weeks.slice(0, c.gap.week).every((w) => w.low >= 0), 'разрыв — первый минус');
      } else assert.ok(c.lowest.low >= 0);
    }
  });

  test(`${key}: платёжный календарь — аренда 1-го, зарплата 5-го и 20-го, УСН 25 октября`, () => {
    const c = cashForecast(ds, 'all');
    const days = (k: number) => Array.from({ length: 7 }, (_, j) => new Date(Date.parse(c.weeks[k]!.startIso) + j * DAY_MS).getUTCDate());
    const rent = sum(ds.profile.locations.filter((l) => ds.days[l.key]![DAYS_TOTAL - 1]!.open).map((l) => l.rentMonth));
    c.weeks.forEach((w, k) => {
      const dom = days(k);
      assert.equal(w.out.rent, dom.includes(1) ? rent : 0, `аренда, неделя ${w.startIso}`);
      assert.equal(w.out.payroll > 0, dom.includes(5) || dom.includes(20), `зарплата, неделя ${w.startIso}`);
      assert.ok(w.out.ads > 0 || spendOf(totals(ds, 'all', [DAYS_TOTAL - 28, DAYS_TOTAL])) === 0);
    });
    // Якорь 23.09.2026: в горизонте один налоговый платёж — 25 октября за третий квартал.
    const taxWeeks = c.weeks.filter((w) => w.out.taxes > 0);
    assert.equal(taxWeeks.length, 1);
    assert.ok(days(taxWeeks[0]!.k).includes(25));
    let q3 = 0;
    for (let i = 0; i < DAYS_TOTAL; i++) {
      const d = dateOf(ds.anchor, i);
      if (d.getUTCFullYear() === 2026 && d.getUTCMonth() >= 6 && d.getUTCMonth() <= 8) q3 += sum(ds.profile.locations.map((l) => ds.days[l.key]![i]!.revenue));
    }
    q3 += c.weeks[0]!.inflow; // 24–30 сентября — прогноз
    assert.equal(taxWeeks[0]!.out.taxes, Math.round(q3 * 0.06));
  });
}

test('деньги: приход следует сезонности — декабрь у барбершопов сильнее октября', () => {
  const c = cashForecast(getDataset('salon'), 'all');
  const oct = c.weeks.find((w) => w.startIso.startsWith('2026-10-08'))!;
  const dec = c.weeks.find((w) => w.startIso.startsWith('2026-12-10'))!;
  assert.ok(dec.inflow > oct.inflow * 1.2, `${dec.inflow} против ${oct.inflow}`);
});

test('деньги: убыточная точка уходит в кассовый разрыв, а сеть — нет', () => {
  const ds = getDataset('auto');
  const weak = cashForecast(ds, 'cen');
  assert.equal(weak.opening, 0);
  assert.ok(weak.gap, 'у Центрального должен быть разрыв');
  assert.ok(weak.gap!.iso >= '2026-09-24');
  assert.equal(cashForecast(ds, 'all').gap, null);
});

test('P&L: новая точка фитнеса подписана, сколько месяцев работает', () => {
  const ds = getDataset('fitness');
  const { rows } = pnlByLocation(ds, 'all', windowOf('month'), windowOf('month', 'prev'));
  assert.equal(rows.find((r) => r.key === 'viz')!.openedMonthsAgo, 5);
  assert.ok(rows.filter((r) => r.key !== 'viz').every((r) => r.openedMonthsAgo === null));
  // Год назад ВИЗ не работала: изменения прибыли нет, вместо него прочерк.
  const year = pnlByLocation(ds, 'viz', windowOf('month'), windowOf('month', 'year'));
  assert.equal(year.rows[0]!.profitDiff, null);
});

test('P&L: одна точка — строка точки и итог совпадают', () => {
  const ds = getDataset('studio');
  const { rows, total } = pnlByLocation(ds, 'kup', windowOf('quarter'), windowOf('quarter', 'year'));
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0]!.pnl, total.pnl);
  assert.ok(rows[0]!.loss, 'Купчино в минусе');
});

test('запчасти: в автосервисе ТО и ремонт двигателя держатся на запчастях, диагностика — нет', () => {
  const ds = getDataset('auto');
  const { rows } = partsInCheck(ds, 'all', windowOf('quarter'));
  const by = Object.fromEntries(rows.map((r) => [r.key, r]));
  assert.ok(by.engine!.share! > 0.4);
  assert.ok(by.diag!.share! < 0.1);
  for (const r of rows) if (r.markup !== null) assert.ok(r.markup >= 0.2 && r.markup <= 0.5, `${r.name}: наценка ${r.markup}`);
});
