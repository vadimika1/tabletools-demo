import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DAYS_TOTAL, dateOf, windowOf, weekdayOf, yesterdayIso, anchorDate } from '../src/lib/demo-app/engine/calendar.ts';
import { getDataset, totals, loadOf, noShowOf, unansweredOf, avgCheck, locsOf, type Totals } from '../src/lib/demo-app/engine/dataset.ts';
import { splitInt, sround, rng } from '../src/lib/demo-app/engine/random.ts';
import { pnl, PNL_LINES } from '../src/lib/demo-app/engine/money.ts';
import { channelRows, DIRECT_KEY } from '../src/lib/demo-app/engine/channels.ts';
import { staffRows, heat, freePrime, ahead, comms, reviews } from '../src/lib/demo-app/engine/ops.ts';
import { clientStats, cohorts } from '../src/lib/demo-app/engine/clients.ts';
import { INDUSTRY_ORDER } from '../src/lib/demo-app/industries/index.ts';
import type { Model, Period } from '../src/lib/demo-app/engine/types.ts';

const PERIODS: Period[] = ['week', 'month', 'quarter', 'year'];
const MODELS: Model[] = ['last', 'nondirect', 'first'];
const SCALARS = ['capacity', 'sold', 'bookings', 'served', 'visits', 'noShows', 'revenue', 'materials', 'newClients', 'calls', 'missedCalls', 'messages', 'unanswered'] as const;

test('splitInt: части складываются в целое ровно и идут пропорционально весам', () => {
  const parts = splitInt(1001, [1, 1, 1]);
  assert.equal(parts.reduce((s, v) => s + v, 0), 1001);
  assert.deepEqual(parts, [334, 334, 333]);
  assert.deepEqual(splitInt(10, [3, 1]), [8, 2]);
  assert.deepEqual(splitInt(0, [1, 2]), [0, 0]);
});

test('вероятностное округление не смещает среднее (иначе малые неявки пропадают)', () => {
  const r = rng(7);
  let sum = 0;
  for (let k = 0; k < 20_000; k++) sum += sround(r, 0.36);
  assert.ok(Math.abs(sum / 20_000 - 0.36) < 0.01, `среднее ${sum / 20_000}`);
});

test('данные детерминированы и кэшируются; якорь — последний день ряда', () => {
  const a = getDataset('clinic', '2026-09-23');
  assert.equal(getDataset('clinic', '2026-09-23'), a);
  const w = windowOf('month');
  assert.deepEqual(totals(a, 'all', w), totals(getDataset('clinic', '2026-09-23'), 'all', w));
  assert.equal(dateOf(a.anchor, DAYS_TOTAL - 1).toISOString().slice(0, 10), '2026-09-23');
  assert.equal(yesterdayIso(new Date('2026-12-05T10:00:00Z')), '2026-12-04');
  assert.throws(() => anchorDate('не дата'));
});

test('окна: прошлый период встык, «год назад» — ровно 52 недели и тот же день недели', () => {
  const anchor = anchorDate('2026-09-23');
  for (const p of PERIODS) {
    const now = windowOf(p);
    const prev = windowOf(p, 'prev');
    const year = windowOf(p, 'year');
    assert.equal(now[1], DAYS_TOTAL);
    assert.equal(prev[1], now[0]);
    assert.ok(year[0] >= 0, `${p}: окно года вышло за ряд`);
    assert.equal(now[0] - year[0], 364);
    assert.equal(weekdayOf(dateOf(anchor, now[0])), weekdayOf(dateOf(anchor, year[0])));
  }
});

for (const key of INDUSTRY_ORDER) {
  const ds = getDataset(key);

  test(`${key}: сеть = сумма точек по всем показателям и периодам`, () => {
    for (const p of PERIODS) {
      const w = windowOf(p);
      const all = totals(ds, 'all', w);
      const parts = ds.profile.locations.map((l) => totals(ds, l.key, w));
      for (const k of SCALARS) assert.equal(all[k], parts.reduce((s, t: Totals) => s + t[k], 0), `${p}.${k}`);
      assert.equal(all.services.reduce((s, v) => s + v, 0), all.bookings, `${p}: услуги ≠ записи`);
    }
  });

  test(`${key}: P&L — прибыль = выручка − все статьи, у сети каждая строка = сумма точек`, () => {
    const w = windowOf('month');
    const all = pnl(ds, 'all', w);
    const costs = PNL_LINES.reduce((s, l) => s + all[l.key], 0);
    assert.equal(all.profit, all.revenue - costs);
    for (const line of [...PNL_LINES.map((l) => l.key), 'revenue', 'profit'] as const) {
      assert.equal(all[line], ds.profile.locations.reduce((s, l) => s + pnl(ds, l.key, w)[line], 0), line);
    }
    assert.ok(all.margin > 0.05 && all.margin < 0.45, `маржа сети ${all.margin}`);
  });

  test(`${key}: атрибуция — вместе с прямыми продажи и деньги сходятся в любой модели`, () => {
    const w = windowOf('quarter');
    const t = totals(ds, 'all', w);
    const channelSales: Record<Model, number> = { last: 0, nondirect: 0, first: 0 };
    for (const m of MODELS) {
      const rows = channelRows(ds, 'all', w, m);
      assert.equal(rows.reduce((s, r) => s + r.sales, 0), t.served, `${m}: продажи`);
      assert.equal(rows.reduce((s, r) => s + r.revenue, 0), t.revenue, `${m}: выручка`);
      for (const r of rows.filter((x) => x.campaigns.length)) {
        assert.equal(r.campaigns.reduce((s, c) => s + c.sales, 0), r.sales, `${m}/${r.key}: кампании`);
        assert.equal(r.campaigns.reduce((s, c) => s + c.spend, 0), r.spend, `${m}/${r.key}: расход кампаний`);
      }
      channelSales[m] = rows.filter((r) => r.key !== DIRECT_KEY).reduce((s, r) => s + r.sales, 0);
    }
    assert.ok(Math.abs(channelSales.first - channelSales.last) <= ds.profile.channels.length, 'первое касание перераспределяет, а не добавляет');
    assert.ok(channelSales.nondirect > channelSales.last, 'значимое касание забирает часть прямых');
    const dead = channelRows(ds, 'all', w, 'last').flatMap((r) => r.campaigns).filter((c) => c.spend > 0 && c.sales === 0);
    assert.ok(dead.length >= 1, 'в сюжете есть кампания, которая тратит и не продаёт');
  });

  test(`${key}: персонал — сумма по сотрудникам = точка, отстающий хуже всех в своей точке`, () => {
    const w = windowOf('month');
    const { lagging } = ds.profile.story;
    const rows = staffRows(ds, lagging.loc, w);
    const t = totals(ds, lagging.loc, w);
    assert.equal(rows.reduce((s, r) => s + r.revenue, 0), t.revenue);
    assert.equal(rows.reduce((s, r) => s + r.bookings, 0), t.served);
    const worst = [...rows].sort((a, b) => a.revenue - b.revenue)[0]!;
    assert.equal(worst, rows[rows.length - 1]);
    const names = staffRows(ds, 'all', w).map((r) => r.name);
    assert.equal(new Set(names).size, names.length, 'имя сотрудника в сети не повторяется — по нему открывается детализация');
  });

  test(`${key}: слабая точка — больше всех неявок и сообщений без ответа`, () => {
    const w = windowOf('quarter');
    const weak = [...ds.profile.locations].sort((a, b) => b.noShow - a.noShow)[0]!;
    const byNoShow = [...ds.profile.locations].sort((a, b) => noShowOf(totals(ds, b.key, w)) - noShowOf(totals(ds, a.key, w)))[0]!;
    const byUnanswered = [...ds.profile.locations].sort((a, b) => unansweredOf(totals(ds, b.key, w)) - unansweredOf(totals(ds, a.key, w)))[0]!;
    assert.equal(byNoShow.key, weak.key);
    assert.equal(byUnanswered.key, weak.key);
    const worstReviews = [...reviews(ds, 'all', w)].sort((a, b) => a.avg - b.avg)[0]!;
    assert.equal(worstReviews.loc, weak.key);
  });

  test(`${key}: провал из сюжета виден — точка просела сильнее сети`, () => {
    const { dip } = ds.profile.story;
    const now: [number, number] = [DAYS_TOTAL - dip.days, DAYS_TOTAL];
    const before: [number, number] = [DAYS_TOTAL - dip.days - 28, DAYS_TOTAL - dip.days];
    const k = (f: string) => loadOf(totals(ds, f, now)) / loadOf(totals(ds, f, before));
    const others = ds.profile.locations.filter((l) => l.key !== dip.loc);
    const othersK = others.reduce((s, l) => s + k(l.key), 0) / others.length;
    assert.ok(k(dip.loc) < othersK - 0.08, `точка ×${k(dip.loc).toFixed(2)}, остальные ×${othersK.toFixed(2)}`);
  });

  test(`${key}: тепловая карта, прайм-часы, неделя вперёд, обращения — в границах`, () => {
    const w = windowOf('month');
    const h = heat(ds, 'all', w);
    assert.equal(h.length, 7);
    assert.ok(h.every((row) => row.length === ds.profile.hours[1] - ds.profile.hours[0] && row.every((v) => v >= 0 && v <= 1)));
    const free = freePrime(ds, 'all', w);
    assert.ok(free.hours > 0 && free.money > 0);
    for (const d of ahead(ds, 'all')) assert.ok(d.booked >= 0 && d.booked <= d.capacity);
    for (const c of comms(ds, 'all', w)) assert.ok(c.missedOpen <= c.missed && c.missed <= c.calls && c.unanswered <= c.messages);
    for (const r of reviews(ds, 'all', w)) assert.equal(r.stars.reduce((s, v) => s + v, 0), r.count);
    for (const r of reviews(ds, 'all', windowOf('year'))) {
      const rating = ds.profile.locations.find((l) => l.key === r.loc)!.rating;
      assert.ok(Math.abs(r.avg - rating) < 0.08, `${r.loc}: средняя ${r.avg} при рейтинге ${rating}`);
    }
  });

  test(`${key}: клиенты — вернувшиеся + новые = пришедшие люди, старшие когорты ценнее`, () => {
    const w = windowOf('month');
    const c = clientStats(ds, 'all', w);
    assert.equal(c.newClients + c.returning, totals(ds, 'all', w).visits);
    assert.ok(c.sleeping > 0 && c.sleepingValue > 0);
    const co = cohorts(ds, 'all');
    assert.equal(co.length, 4);
    assert.ok(co[0]!.ltv > co[3]!.ltv, 'клиент четырёхлетней давности принёс больше нового');
  });
}

test('отрасли различаются: чек клиники выше барбершопа, шины весной и осенью, фитнес в январе', () => {
  const w = windowOf('year');
  const check = (k: Parameters<typeof getDataset>[0]) => { const ds = getDataset(k); return avgCheck(ds, totals(ds, 'all', w)); };
  assert.ok(check('clinic') > check('salon') * 3);
  // По точкам, работающим весь год: новая точка в сети иначе выдаёт себя за сезон.
  const byMonth = (k: Parameters<typeof getDataset>[0]) => {
    const ds = getDataset(k);
    const m = Array(12).fill(0) as number[];
    for (const l of locsOf(ds, 'all').filter((x) => !x.openedDaysAgo)) for (const d of ds.days[l.key]!.slice(w[0], w[1])) m[d.month]! += d.revenue;
    return m;
  };
  const auto = byMonth('auto');
  assert.ok(auto[3]! > auto[6]! && auto[9]! > auto[6]!, 'апрель и октябрь сильнее июля');
  const fit = byMonth('fitness');
  assert.ok(fit[0]! > fit[6]! * 1.3, 'январь в фитнесе сильнее июля');
  const salon = byMonth('salon');
  assert.equal(salon.indexOf(Math.max(...salon)), 11, 'у барбершопов пик в декабре');
});

test('новая точка: до открытия мощности нет, после — выходит на загрузку', () => {
  const ds = getDataset('fitness');
  const viz = ds.profile.locations.find((l) => l.openedDaysAgo)!;
  const days = ds.days[viz.key]!;
  const openFrom = DAYS_TOTAL - viz.openedDaysAgo!;
  assert.ok(days.slice(0, openFrom).every((d) => !d.open && d.capacity === 0 && d.revenue === 0));
  assert.ok(days.slice(openFrom).every((d) => d.open && d.capacity > 0));
  const first = loadOf(totals(ds, viz.key, [openFrom, openFrom + 14]));
  const last = loadOf(totals(ds, viz.key, [DAYS_TOTAL - 14, DAYS_TOTAL]));
  assert.ok(last > first * 1.4, `загрузка ${first.toFixed(2)} → ${last.toFixed(2)}`);
  assert.equal(pnl(ds, viz.key, [0, openFrom]).rent, 0, 'аренда до открытия не начисляется');
});
