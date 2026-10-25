import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DAYS_TOTAL, windowOf } from '../src/lib/demo-app/engine/calendar.ts';
import { getDataset, spendOf, totals, type Dataset } from '../src/lib/demo-app/engine/dataset.ts';
import { clientStats, cohorts } from '../src/lib/demo-app/engine/clients.ts';
import { INDUSTRY_ORDER } from '../src/lib/demo-app/industries/index.ts';
import {
  LTV_GOOD, LTV_OK, MONTHS_SHOWN, SHORT_REPEAT,
  clientFigures, clientValue, memberships, overdueClients, returnByService, sleepingClients, summerChurn,
} from '../src/lib/demo-app/models/clients.ts';
import type { Compare, LocFilter, Period } from '../src/lib/demo-app/engine/types.ts';

const sum = (xs: readonly number[]) => xs.reduce((s, v) => s + v, 0);

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

  test(`${key}: новые и вернувшиеся — ряд новичков складывается в итог периода`, () => {
    for (const s of slices(ds)) {
      const win = windowOf(s.period);
      const f = clientFigures(ds, s.loc, win, windowOf(s.period, s.compare));
      const t = totals(ds, s.loc, win);
      assert.deepEqual(f.now, clientStats(ds, s.loc, win));
      assert.equal(sum(f.series.map((x) => x.value)), t.newClients);
      assert.equal(f.series.length, s.period === 'week' ? 7 : (win[1] - win[0]) / 7);
      assert.equal(f.byWeek, s.period !== 'week');
      assert.equal(f.series[0]!.from, win[0]);
      assert.ok(f.repeatShare! >= 0 && f.repeatShare! <= 1);
      assert.equal(f.repeatShare, (t.visits - t.newClients) / t.visits);
      if (s.loc !== 'all') assert.equal(f.now.multiLoc, 0, 'в одной точке «несколько точек» не бывает');
    }
  });

  test(`${key}: цена клиента — LTV взвешен по когортам, CAC — реклама на платного новичка`, () => {
    for (const s of slices(ds)) {
      const win = windowOf(s.period);
      const v = clientValue(ds, s.loc, win);
      const list = cohorts(ds, s.loc);
      assert.deepEqual(v.cohorts, list);
      assert.ok(v.ltv >= Math.min(...list.map((c) => c.ltv)) && v.ltv <= Math.max(...list.map((c) => c.ltv)));
      assert.ok(v.ltvProfit > 0 && v.ltvProfit < v.ltv, 'прибыль с клиента меньше выручки');
      const t = totals(ds, s.loc, win);
      assert.ok(v.newPaid <= t.newClients);
      if (v.newPaid) assert.equal(v.cac, spendOf(t) / v.newPaid);
      else assert.equal(v.cac, null);
      if (v.ratio === null) assert.equal(v.verdict, null);
      else assert.equal(v.verdict, v.ratio >= LTV_GOOD ? 'good' : v.ratio >= LTV_OK ? 'warn' : 'bad');
    }
  });

  test(`${key}: спящие — пять примеров, дольше порога, по убыванию денег`, () => {
    for (const s of slices(ds)) {
      const sl = sleepingClients(ds, s.loc, windowOf(s.period));
      const st = clientStats(ds, s.loc, windowOf(s.period));
      assert.equal(sl.count, st.sleeping);
      assert.equal(sl.value, st.sleepingValue);
      assert.equal(sl.sample.length, Math.min(5, sl.count));
      assert.equal(new Set(sl.sample.map((x) => x.name)).size, sl.sample.length, 'имена не повторяются');
      const locs = s.loc === 'all' ? ds.profile.locations.map((l) => l.key) : [s.loc];
      for (const [k, x] of sl.sample.entries()) {
        assert.ok(x.days >= sl.afterDays && x.days < 365, `${x.name}: ${x.days} дней`);
        assert.ok(locs.includes(x.loc));
        assert.ok(x.visits >= 2 && x.spent > 0);
        if (k) assert.ok(sl.sample[k - 1]!.spent >= x.spent);
        assert.match(x.name, /^[А-ЯЁ][а-яё]+ [А-ЯЁ]\.$/);
      }
    }
    assert.deepEqual(sleepingClients(ds, 'all', windowOf('month')), sleepingClients(ds, 'all', windowOf('month')));
  });

  test(`${key}: повторные по услугам — доли в пределах записей, итог как у движка`, () => {
    for (const s of slices(ds)) {
      const win = windowOf(s.period);
      const t = totals(ds, s.loc, win);
      const r = returnByService(ds, s.loc, win);
      assert.equal(r.rows.length, ds.profile.services.length);
      assert.equal(sum(r.rows.map((x) => x.bookings)), t.bookings);
      for (const x of r.rows) {
        assert.ok(x.returning <= x.bookings);
        assert.equal(x.share, x.bookings ? x.returning / x.bookings : null);
      }
      const back = sum(r.rows.map((x) => x.returning));
      assert.ok(Math.abs(back / t.bookings - r.share!) < 0.02, `в сумме ${back / t.bookings} против ${r.share}`);
    }
    // С коротким циклом возвращаются чаще — если в отрасли есть и короткие, и длинные услуги.
    const { rows } = returnByService(ds, 'all', windowOf('quarter'));
    const repeat = new Map(ds.profile.services.map((x) => [x.key, x.repeatDays]));
    const short = rows.filter((x) => repeat.get(x.key)! <= SHORT_REPEAT && x.bookings > 30);
    const long = rows.filter((x) => repeat.get(x.key)! > SHORT_REPEAT && x.bookings > 30);
    if (short.length && long.length) assert.ok(Math.min(...short.map((x) => x.share!)) > Math.max(...long.map((x) => x.share!)));
  });

  test(`${key}: возврат к мастеру — разбивка по сотрудникам сходится с итогом`, () => {
    for (const loc of ['all', ...ds.profile.locations.map((l) => l.key)] as LocFilter[]) {
      const o = overdueClients(ds, loc);
      assert.ok(o.count > 0);
      assert.equal(sum(o.staff.map((x) => x.count)), o.count);
      assert.equal(sum(o.staff.map((x) => x.money)), o.money);
      assert.equal(new Set(o.staff.map((x) => x.key)).size, o.staff.length, 'ключи строк уникальны');
      assert.equal(o.usual[1] - o.usual[0], 7);
      assert.ok(o.deadline > o.usual[1]);
      if (loc !== 'all') assert.ok(o.staff.every((x) => x.loc === loc));
    }
  });

  test(`${key}: абонементы — было + продано − ушли = стало, двенадцать месяцев подряд`, () => {
    for (const loc of ['all', ...ds.profile.locations.map((l) => l.key)] as LocFilter[]) {
      const m = memberships(ds, loc);
      assert.equal(m.length, MONTHS_SHOWN);
      const last = m[m.length - 1]!;
      assert.equal(last.month, ds.anchor.getUTCMonth());
      assert.equal(last.partial, true, 'текущий месяц ещё идёт');
      assert.ok(m.slice(0, -1).every((x) => !x.partial));
      for (let k = 0; k < m.length; k++) {
        const x = m[k]!;
        assert.ok(x.sold >= 0 && x.churned >= 0 && x.renewals >= 0 && x.frozen >= 0, `${loc} ${x.month}`);
        assert.ok(x.frozen <= x.active);
        if (k) {
          const prev = m[k - 1]!;
          assert.equal((x.month - prev.month + 12) % 12, 1, 'месяцы подряд');
          assert.equal(prev.active + x.sold - x.churned, x.active);
          assert.equal(x.renewals + x.churned, prev.active);
          assert.equal(x.churn, prev.active ? x.churned / prev.active : null);
        }
      }
    }
  });
}

test('барбершопы: обычный интервал 28–35 дней, срок возврата 45', () => {
  const o = overdueClients(getDataset('salon'), 'all');
  assert.deepEqual(o.usual, [28, 35]);
  assert.equal(o.deadline, 45);
});

test('фитнес: летом отток абонементов выше, чем в остальные месяцы', () => {
  const s = summerChurn(memberships(getDataset('fitness'), 'all'));
  assert.ok(s.summer! > s.rest! * 1.3, `лето ${s.summer}, остальное ${s.rest}`);
  const m = memberships(getDataset('fitness'), 'all');
  assert.ok(Math.max(...m.filter((x) => [5, 6, 7].includes(x.month)).map((x) => x.frozen)) > Math.max(...m.filter((x) => [0, 1, 2].includes(x.month)).map((x) => x.frozen)), 'заморозки — летом');
});

test('фитнес: ВИЗ открылась пять месяцев назад — до этого абонементов нет, отток прочерком', () => {
  const m = memberships(getDataset('fitness'), 'viz');
  const before = m.filter((x) => x.active === 0);
  assert.ok(before.length >= 6);
  const firstOpen = m.findIndex((x) => x.active > 0);
  assert.equal(m[firstOpen]!.churn, null, 'в первый месяц не с чем сравнить');
});

test('клиенты: окно «неделя» и «год назад» дают другие цифры, чем месяц', () => {
  const ds = getDataset('clinic');
  const w = clientFigures(ds, 'all', windowOf('week'), windowOf('week', 'year'));
  const m = clientFigures(ds, 'all', windowOf('month'), windowOf('month', 'prev'));
  assert.ok(w.now.newClients < m.now.newClients);
  assert.notDeepEqual(w.prev, m.prev);
  assert.equal(w.series.length, 7);
  assert.ok(DAYS_TOTAL - w.series[0]!.from === 7);
});
