// Модели блоков «Операционки» (p1–p10) и отраслевых операционных блоков (x2, x3, x6, x7, x9):
// части сходятся с итогами движка, доли — со 100%, сюжет отрасли виден, пустое — прочерк, а не ноль.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { windowOf } from '../src/lib/demo-app/engine/calendar.ts';
import { getDataset, perHourOf, perVisitOf, totals, type Dataset } from '../src/lib/demo-app/engine/dataset.ts';
import { pnl } from '../src/lib/demo-app/engine/money.ts';
import { freePrime, heat, isPrime } from '../src/lib/demo-app/engine/ops.ts';
import { INDUSTRY_ORDER } from '../src/lib/demo-app/industries/index.ts';
import type { LocFilter, Period, Win } from '../src/lib/demo-app/engine/types.ts';
import { aheadModel, commsModel, heatModel, noShowModel, primeModel, RECENT, serviceRevenue } from '../src/lib/demo-app/models/ops.ts';
import {
  dealsModel, eventService, materialsModel, MATERIALS_TARGET, reviewsModel, SALE_SOURCES, salesModel, staffModel,
} from '../src/lib/demo-app/models/ops-team.ts';
import { barbersModel, doctorsModel, eventsModel, groupsModel, MIN_FILL, ordersModel, POST_NORM } from '../src/lib/demo-app/models/ops-industry.ts';

const sum = (xs: readonly number[]) => xs.reduce((s, v) => s + v, 0);
const MONTH = windowOf('month');
/** Срезы, на которых проверяем каждую модель: вся сеть за месяц, неделя, одна точка (из сюжета), год. */
function slices(ds: Dataset): { f: LocFilter; win: Win; prev: Win; name: string }[] {
  const dip = ds.profile.story.dip.loc;
  return [
    { f: 'all', win: MONTH, prev: windowOf('month', 'prev'), name: 'сеть, месяц' },
    { f: 'all', win: windowOf('week'), prev: windowOf('week', 'prev'), name: 'сеть, неделя' },
    { f: dip, win: MONTH, prev: windowOf('month', 'year'), name: `точка ${dip}, к году назад` },
    { f: 'all', win: windowOf('year' as Period), prev: windowOf('year', 'year'), name: 'сеть, год к году' },
  ];
}

for (const key of INDUSTRY_ORDER) {
  const ds = getDataset(key);
  const locs = ds.profile.locations;

  test(`${key}: служебная выручка по услугам сходится с выручкой окна`, () => {
    for (const s of slices(ds)) assert.equal(sum(serviceRevenue(ds, s.f, s.win)), totals(ds, s.f, s.win).revenue, s.name);
  });

  test(`${key}: p1 прайм-часы — сеть равна сумме точек, названа точка с максимумом`, () => {
    const m = primeModel(ds, 'all');
    assert.equal(m.hours, sum(m.byLoc.map((x) => x.hours)));
    assert.equal(m.money, sum(m.byLoc.map((x) => x.money)));
    assert.ok(Math.abs(m.hours - freePrime(ds, 'all', RECENT).hours) <= locs.length, 'округление по точкам не уводит итог');
    assert.ok(m.hours > 0 && m.money > 0);
    assert.equal(m.top?.hours, Math.max(...m.byLoc.map((x) => x.hours)));
    const one = primeModel(ds, locs[0]!.key);
    assert.equal(one.byLoc.length, 1);
    assert.equal(one.top?.loc, locs[0]!.key);
    assert.ok(m.visitsYesterday >= 0 && m.noShowsYesterday >= 0 && m.cancels7 >= 0);
  });

  test(`${key}: p2 загрузка по часам — самая пустая ячейка прайм-времени найдена по точкам`, () => {
    for (const s of slices(ds)) {
      const m = heatModel(ds, s.f, s.win);
      assert.equal(m.values.length, 7);
      assert.ok(m.values.every((row) => row.length === m.hours.length && row.every((v) => v >= 0 && v <= 1)));
      const e = m.emptiest!;
      assert.ok(isPrime(ds, e.weekday, e.hour), 'ячейка — прайм');
      const inScope = s.f === 'all' ? locs.map((l) => l.key) : [s.f];
      assert.ok(inScope.includes(e.loc));
      const min = Math.min(...inScope.flatMap((l) => heat(ds, l, s.win).flatMap((row, wd) => row.filter((_, k) => isPrime(ds, wd, m.hours[k]!)))));
      assert.equal(e.value, min, s.name);
      assert.ok(e.idleHours >= 0 && e.money >= 0);
    }
  });

  test(`${key}: p3 неделя вперёд — семь дней, записано не больше мощности, итоги сходятся`, () => {
    for (const f of ['all', locs[0]!.key] as LocFilter[]) {
      const m = aheadModel(ds, f);
      assert.equal(m.days.length, 7);
      assert.deepEqual(m.days.map((d) => d.offset), [1, 2, 3, 4, 5, 6, 7]);
      assert.ok(m.days.every((d) => d.booked <= d.capacity && d.free === d.capacity - d.booked && d.gap === Math.max(0, d.usual - d.booked)));
      assert.equal(m.booked, sum(m.days.map((d) => d.booked)));
      assert.equal(m.free, m.capacity - m.booked);
      assert.equal(m.gapMoney, Math.round(m.gap * perHourOf(totals(ds, f, RECENT))));
      assert.equal(m.emptiest?.share, Math.min(...m.days.map((d) => d.share ?? 1)));
      assert.match(m.days[0]!.label, /^(Пн|Вт|Ср|Чт|Пт|Сб|Вс), \d+ /);
    }
  });

  test(`${key}: p4 неявки — по дням недели сходятся с итогом, потери до рубля`, () => {
    for (const s of slices(ds)) {
      const t = totals(ds, s.f, s.win);
      const m = noShowModel(ds, s.f, s.win, s.prev);
      assert.equal(sum(m.rows.map((r) => r.noShows)), t.noShows, s.name);
      assert.equal(sum(m.rows.map((r) => r.cancels)), t.cancels);
      assert.equal(m.lost, Math.round(t.noShows * perVisitOf(t)));
      assert.equal(sum(m.rows.map((r) => r.lost)), m.lost);
      assert.ok(m.rows.every((r) => r.rate === (r.expected ? r.noShows / r.expected : null)), 'доля — от тех, кого ждали');
      assert.equal(sum(m.rows.map((r) => r.expected)), t.visits + t.noShows);
      assert.ok(Math.abs(sum(m.rows.map((r) => (r.rate ?? 0) * r.expected)) / (t.visits + t.noShows) - m.rate!) < 1e-12, 'дни недели сходятся с общей долей');
      assert.equal(m.worst?.rate, Math.max(...m.rows.map((r) => r.rate ?? 0)));
      assert.equal(m.prevNoShows, totals(ds, s.f, s.prev).noShows);
    }
  });

  test(`${key}: p5 обращения — сеть равна сумме точек, слабая точка теряет больше`, () => {
    for (const s of slices(ds)) {
      const t = totals(ds, s.f, s.win);
      const m = commsModel(ds, s.f, s.win);
      assert.equal(m.total.calls, t.calls);
      assert.equal(m.total.messages, t.messages);
      assert.equal(m.total.lostMoney, sum(m.rows.map((r) => r.lostMoney)));
      assert.ok(m.rows.every((r) => r.missedOpen <= r.missed && r.missed <= r.calls && r.unanswered <= r.messages && r.waitMin >= r.answerMin));
    }
    const worstAnswer = [...locs].sort((a, b) => b.answerMin - a.answerMin)[0]!;
    const m = commsModel(ds, 'all', MONTH);
    assert.equal([...m.rows].sort((a, b) => b.waitMin - a.waitMin)[0]!.loc, worstAnswer.key, 'дольше всех ждут там, где медленнее отвечают');
  });

  test(`${key}: p6 персонал — выручка сходится, отстающий из сюжета отмечен`, () => {
    for (const s of slices(ds)) {
      const m = staffModel(ds, s.f, s.win);
      assert.equal(m.revenue, totals(ds, s.f, s.win).revenue, s.name);
      const p = pnl(ds, s.f, s.win);
      assert.equal(m.payrollShare, p.payroll / p.revenue);
      assert.ok(m.rows.every((r, k) => k === 0 || m.rows[k - 1]!.revenue >= r.revenue), 'по выручке');
    }
    const story = ds.profile.story.lagging.loc;
    const m = staffModel(ds, 'all', MONTH);
    const own = m.rows.filter((r) => r.loc === story);
    const weakest = own.reduce((a, r) => (r.revenue < a.revenue ? r : a));
    assert.ok(weakest.lagging, `${weakest.name} отмечен`);
    assert.ok(m.lagging.length <= 3, 'флажок — исключение, а не каждый второй');
  });

  test(`${key}: p7 отзывы — звёзды сходятся, в ленте нет звёзд сверх распределения`, () => {
    for (const s of slices(ds)) {
      const m = reviewsModel(ds, s.f, s.win);
      assert.equal(m.count, sum(m.rows.map((r) => r.count)));
      assert.equal(sum(m.stars), m.count);
      if (m.count) assert.ok(m.avg! >= 1 && m.avg! <= 5);
      else assert.equal(m.avg, null);
      assert.ok(m.feed.length <= 5 && m.feed.length <= m.count);
      for (const r of m.rows) {
        for (let star = 1; star <= 5; star++) {
          const inFeed = m.feed.filter((x) => x.loc === r.loc && x.stars === star).length;
          assert.ok(inFeed <= r.stars[5 - star]!, `${s.name}: ${r.name} ${star}★`);
        }
      }
      assert.ok(m.feed.filter((x) => x.stars <= 3).every((x) => x.loc === m.weakest?.loc), 'негатив — у слабой точки');
      assert.ok(m.feed.every((x) => !x.text.includes('{staff}') && !x.text.includes('..') && /^\S+ [А-ЯЁ]\.$/.test(x.author)));
      assert.ok(m.feed.every((x, k) => k === 0 || m.feed[k - 1]!.daysAgo <= x.daysAgo), 'свежие сверху');
      assert.deepEqual(reviewsModel(ds, s.f, s.win), m, 'детерминированно');
    }
    const net = reviewsModel(ds, 'all', MONTH);
    assert.ok(net.feed.some((x) => x.stars <= 3), 'в ленте сети есть негатив');
  });

  test(`${key}: p8 кто продаёт — записи по источникам равны оплаченным, деньги — выручке`, () => {
    for (const s of slices(ds)) {
      const t = totals(ds, s.f, s.win);
      const m = salesModel(ds, s.f, s.win);
      assert.equal(m.counts.length, SALE_SOURCES.length);
      assert.equal(sum(m.counts), t.served, s.name);
      assert.equal(sum(m.revenue), t.revenue);
      for (const r of m.rows) assert.equal(sum(r.counts), r.served);
      if (t.served) assert.ok(Math.abs(sum(m.shares.map((x) => x ?? 0)) - 1) < 1e-9);
    }
  });

  test(`${key}: p9 материалы — сумма по точкам равна итогу, отклонение от цели в п.п. и рублях`, () => {
    for (const s of slices(ds)) {
      const t = totals(ds, s.f, s.win);
      const m = materialsModel(ds, s.f, s.win);
      assert.equal(m.target, MATERIALS_TARGET[key]);
      assert.equal(m.materials, t.materials);
      assert.equal(m.over, sum(m.rows.map((r) => r.over)));
      assert.ok(Math.abs(m.over - (t.materials - t.revenue * m.target)) <= m.rows.length);
      assert.ok(Math.abs(m.dev! - (t.materials / t.revenue - m.target)) < 1e-12);
    }
  });

  test(`${key}: p10 сделки — этапы не растут вниз по воронке, сеть — сумма точек`, () => {
    for (const s of slices(ds)) {
      const m = dealsModel(ds, s.f, s.win);
      for (const st of [m.stages, ...m.rows.map((r) => r.stages)]) assert.ok(st.every((v, k) => k === 0 || st[k - 1]! >= v), `${s.name}: ${st}`);
      m.stages.forEach((v, k) => assert.equal(v, sum(m.rows.map((r) => r.stages[k]!))));
      assert.ok(m.wonRate === null || (m.wonRate > 0 && m.wonRate <= 1));
      assert.ok(m.paid >= 0);
    }
  });

  test(`${key}: x2 выработка — план по точке, отстающий из сюжета ниже плана`, () => {
    const m = doctorsModel(ds, 'all', MONTH);
    assert.equal(m.lagging?.loc, ds.profile.story.lagging.loc);
    assert.ok(m.lagging!.vsPlan! < 0);
    assert.ok(m.rows.every((r) => r.plan % 10_000 === 0 && r.plan > 0));
    assert.equal(m.shortfall, sum(m.below.map((r) => r.plan - r.revenue)));
  });

  test(`${key}: x3 возвращаемость — худший назван, недобор в визитах и рублях не отрицательный`, () => {
    for (const s of slices(ds)) {
      const m = barbersModel(ds, s.f, s.win);
      assert.equal(m.lowest?.returning, Math.min(...m.rows.map((r) => r.returning)));
      assert.ok(m.lostVisits >= 0 && m.lostMoney >= 0);
      for (const l of s.f === 'all' ? locs.map((x) => x.key) : [s.f]) {
        const own = m.rows.filter((r) => r.loc === l);
        assert.equal(own.filter((r) => r.grade === 'топ').length, 2);
        assert.equal(own.filter((r) => r.grade === 'младший').length, 1);
      }
    }
  });

  test(`${key}: x6 группы — посещения по видам и по тренерам сходятся, порог отмечен`, () => {
    for (const s of slices(ds)) {
      const m = groupsModel(ds, s.f, s.win);
      const hasGroups = ds.profile.services.some((x) => x.group > 1);
      assert.equal(m.classes.length > 0, hasGroups);
      assert.equal(sum(m.trainers.map((r) => r.visits)), m.visits, s.name);
      assert.equal(sum(m.trainers.map((r) => r.classes)), sum(m.classes.map((c) => c.classes)));
      for (const c of [...m.classes, ...m.trainers]) assert.equal(c.below, c.fill !== null && c.fill < MIN_FILL);
      if (!hasGroups) assert.equal(m.fill, null);
      else assert.ok(m.fill! > 0.3 && m.fill! < 1);
    }
  });

  test(`${key}: x7 посты — часы сходятся с мощностью, простой считается только ниже нормы`, () => {
    for (const s of slices(ds)) {
      const t = totals(ds, s.f, s.win);
      const m = ordersModel(ds, s.f, s.win);
      assert.equal(m.capacity, t.capacity);
      assert.equal(m.sold, t.sold);
      assert.equal(m.idle, t.capacity - t.sold);
      assert.equal(sum(m.mechanics.map((r) => r.sold)), t.sold);
      assert.equal(m.gapMoney, sum(m.rows.map((r) => r.gapMoney)));
      assert.ok(m.rows.every((r) => r.gap === Math.max(0, Math.round(r.capacity * POST_NORM) - r.sold)));
    }
  });

  test(`${key}: x9 мероприятия — события, типы и источники сходятся`, () => {
    for (const s of slices(ds)) {
      const m = eventsModel(ds, s.f, s.win);
      const ev = eventService(ds);
      assert.equal(sum(m.rows.map((r) => r.events)), m.events);
      assert.equal(sum(m.kinds), m.events);
      assert.equal(sum(m.sources.map((x) => x.count)), m.events);
      if (ev < 0) {
        assert.equal(m.service, null);
        assert.equal(m.check, null);
        assert.equal(m.avgGroup, null);
      } else {
        const scope = s.f === 'all' ? locs.map((l) => l.key) : [s.f];
        assert.equal(m.revenue, sum(scope.map((l) => serviceRevenue(ds, l, s.win)[ev]!)), 'выручка мероприятий — доля выручки точек');
        assert.ok(m.events > 0 && m.avgGroup! > 5);
        assert.equal(m.check, Math.round(m.revenue / m.events));
      }
    }
  });
}

test('сюжеты видны в моделях: слабая точка в отзывах, простой автосервиса, мероприятия у студий', () => {
  const studio = getDataset('studio');
  assert.equal(reviewsModel(studio, 'all', MONTH).weakest?.loc, 'kup', 'Купчино — худшая оценка');
  assert.equal(eventsModel(studio, 'all', MONTH).service, 'День рождения и корпоратив');
  assert.equal(eventsModel(getDataset('clinic'), 'all', MONTH).events, 0);
  const auto = getDataset('auto');
  assert.equal(ordersModel(auto, 'all', MONTH).worst?.loc, auto.profile.story.dip.loc, 'простой — там, где встал подъёмник');
  const salon = getDataset('salon');
  assert.equal(barbersModel(salon, 'all', MONTH).lowest?.loc, salon.profile.story.lagging.loc);
});
