import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getDataset, totals, change, loadOf } from '../src/lib/demo-app/engine/dataset.ts';
import { windowOf } from '../src/lib/demo-app/engine/calendar.ts';
import { freePrime, comms } from '../src/lib/demo-app/engine/ops.ts';
import { pnl } from '../src/lib/demo-app/engine/money.ts';
import { channelRows } from '../src/lib/demo-app/engine/channels.ts';
import { INDUSTRY_ORDER } from '../src/lib/demo-app/industries/index.ts';
import { SECTIONS } from '../src/lib/demo-app/blocks/registry.ts';
import {
  atLoc, compareAll, deadCampaigns, dipImpact, locationsTable, lostRevenue, MAX_ACTIONS, MIN_ACTIONS, nextActions, noShowMoney, primeMoney, wastedAds,
} from '../src/lib/demo-app/models/overview.ts';
import type { Compare, LocFilter, Period } from '../src/lib/demo-app/engine/types.ts';

const FORBIDDEN = /→|·|undefined|NaN|Infinity|\[object/;
const filtersOf = (k: (typeof INDUSTRY_ORDER)[number]): LocFilter[] => ['all', ...getDataset(k).profile.locations.map((l) => l.key)];

test('упущенная выручка: пункты складываются в итог до рубля, во всех отраслях и срезах', () => {
  for (const k of INDUSTRY_ORDER) {
    const ds = getDataset(k);
    for (const f of filtersOf(k)) {
      for (const p of ['week', 'month'] as Period[]) {
        const win = windowOf(p);
        const lost = lostRevenue(ds, f, win);
        assert.equal(lost.items.length, 4, `${k}/${f}`);
        assert.equal(lost.total, lost.items.reduce((s, x) => s + x.money, 0), `${k}/${f}/${p}`);
        for (const it of lost.items) {
          assert.ok(Number.isInteger(it.money) && it.money >= 0, `${k}/${f} ${it.key}=${it.money}`);
          assert.ok(it.section in SECTIONS);
        }
        const ms = lost.items.map((x) => x.money);
        assert.deepEqual(ms, [...ms].sort((a, b) => b - a), 'самые большие потери первыми');
      }
    }
  }
});

test('упущенная выручка: каждый пункт посчитан по своему правилу', () => {
  for (const k of INDUSTRY_ORDER) {
    const ds = getDataset(k);
    const win = windowOf('month');
    const lost = lostRevenue(ds, 'all', win);
    const by = Object.fromEntries(lost.items.map((x) => [x.key, x]));
    const t = totals(ds, 'all', win);
    const check = ds.profile.checkBasis === 'visit' ? t.revenue / t.visits : t.revenue / t.served;
    assert.equal(by.noshow!.money, Math.round(t.noShows * check), `${k}: неявки × средний чек`);
    assert.equal(by.noshow!.count, t.noShows);
    // прайм-часы: freePrime — за неделю, окно месяца — четыре недели
    assert.equal(by.prime!.money, Math.round(freePrime(ds, 'all', win).money * 4), `${k}: прайм-часы × 4 недели`);
    assert.equal(by.comms!.money, comms(ds, 'all', win).reduce((s, r) => s + r.lostMoney, 0));
    const rows = channelRows(ds, 'all', win, 'last');
    const dead = deadCampaigns(rows);
    assert.ok(dead.length >= 1, `${k}: в сюжете есть кампания без продаж`);
    assert.ok(by.ads!.money >= dead.reduce((s, d) => s + d.spend, 0), `${k}: реклама без продаж не меньше расхода мёртвых кампаний`);
    assert.ok(by.ads!.names.includes(dead[0]!.name));
    const paidSpend = rows.reduce((s, r) => s + r.spend, 0);
    assert.ok(by.ads!.money <= paidSpend, `${k}: без отдачи не больше всего расхода`);
  }
});

test('реклама без отдачи: неокупившийся канал считается целиком и без двойного счёта', () => {
  const ds = getDataset('studio');
  const rows = channelRows(ds, 'all', windowOf('month'), 'last');
  const w = wastedAds(rows);
  const losing = rows.filter((r) => r.spend > 0 && r.roi !== null && r.roi < 1);
  assert.deepEqual(w.losing, losing.map((r) => r.name));
  const deadElsewhere = w.dead.filter((d) => !losing.some((r) => r.key === d.channelKey)).reduce((s, d) => s + d.spend, 0);
  assert.equal(w.money, losing.reduce((s, r) => s + r.spend, 0) + deadElsewhere);
});

test('прайм-часы растягиваются на длину окна: неделя = freePrime, квартал = 13 недель', () => {
  const ds = getDataset('clinic');
  const week = windowOf('week');
  assert.equal(primeMoney(ds, 'all', week).money, freePrime(ds, 'all', week).money);
  const q = windowOf('quarter');
  assert.equal(primeMoney(ds, 'all', q).money, Math.round(freePrime(ds, 'all', q).money * 13));
});

test('что сделать сейчас: 3–5 действий по убыванию рублей, оценка не больше самой потери', () => {
  for (const k of INDUSTRY_ORDER) {
    const ds = getDataset(k);
    for (const f of filtersOf(k)) {
      for (const p of ['week', 'month', 'quarter'] as Period[]) {
        const win = windowOf(p);
        const acts = nextActions(ds, f, win);
        assert.ok(acts.length >= MIN_ACTIONS && acts.length <= MAX_ACTIONS, `${k}/${f}/${p}: ${acts.length}`);
        const ms = acts.map((a) => a.money);
        assert.deepEqual(ms, [...ms].sort((a, b) => b - a));
        const lost = Object.fromEntries(lostRevenue(ds, f, win).items.map((x) => [x.key, x.money]));
        for (const a of acts) {
          assert.ok(a.money > 0 && Number.isInteger(a.money));
          assert.ok(a.section in SECTIONS);
          assert.ok(!FORBIDDEN.test(a.title + a.why), `${k}: «${a.title}» ${a.why}`);
          if (a.key === 'prepay') assert.ok(a.money <= lost.noshow!);
          if (a.key === 'prime') assert.ok(a.money <= lost.prime!);
          if (a.key === 'callback') assert.ok(a.money <= lost.comms!);
          if (a.key === 'campaign') assert.ok(a.money <= lost.ads!);
        }
      }
    }
  }
});

test('что сделать сейчас: называет кампанию без продаж и причину провала точки', () => {
  for (const k of INDUSTRY_ORDER) {
    const ds = getDataset(k);
    const win = windowOf('month');
    const acts = nextActions(ds, 'all', win);
    const dip = acts.find((a) => a.key === 'dip');
    const camp = acts.find((a) => a.key === 'campaign');
    const dead = deadCampaigns(channelRows(ds, 'all', win, 'last'))[0]!;
    assert.ok(dip && dip.why.includes(ds.profile.story.dip.reason), `${k}: причина провала в тексте`);
    assert.ok(camp && camp.title.includes(`«${dead.name}»`), `${k}: кампания названа`);
    assert.equal(camp.money, dead.spend);
  }
});

test('провал точки: считается только в окне и только для своей точки', () => {
  const ds = getDataset('clinic');
  const { dip } = ds.profile.story;
  const month = dipImpact(ds, 'all', windowOf('month'))!;
  assert.equal(month.days, dip.days);
  assert.equal(dipImpact(ds, 'all', windowOf('week'))!.days, 7);
  assert.equal(dipImpact(ds, 'ham', windowOf('month')), null);
  const rev = totals(ds, dip.loc, [windowOf('month')[1] - dip.days, windowOf('month')[1]]).revenue;
  assert.equal(month.money, Math.round((rev * (1 - dip.factor)) / dip.factor));
});

test('против всех сравнений: окна без повторов, выбранное в фильтре отмечено', () => {
  for (const k of INDUSTRY_ORDER) {
    const ds = getDataset(k);
    const month = compareAll(ds, 'all', 'month', 'prev');
    assert.deepEqual(month.rows.map((r) => r.key), ['prev', 'w8', 'year'], 'у месяца «4 недели назад» = прошлый период');
    assert.deepEqual(month.rows.filter((r) => r.selected).map((r) => r.key), ['prev']);
    assert.deepEqual(compareAll(ds, 'all', 'month', 'year').rows.filter((r) => r.selected).map((r) => r.key), ['year']);
    const week = compareAll(ds, 'all', 'week', 'prev');
    assert.deepEqual(week.rows.map((r) => r.key), ['prev', 'w4', 'w8', 'year']);
    const year = compareAll(ds, 'all', 'year', 'year');
    assert.deepEqual(year.rows.map((r) => r.key), ['prev', 'w4', 'w8'], 'у года прошлый период и год назад — одно окно');
    assert.equal(year.rows[0]!.selected, true);
    for (const r of week.rows) {
      const t = totals(ds, 'all', r.win);
      assert.equal(r.revenue, t.revenue);
      assert.equal(r.revDelta, change(week.revenue, t.revenue));
      assert.equal(r.servedDelta, change(week.served, t.served));
    }
  }
});

test('против всех сравнений: у точки, которой год назад не было, — прочерк, а не +∞', () => {
  const ds = getDataset('fitness');
  const young = ds.profile.locations.find((l) => l.openedDaysAgo)!;
  const r = compareAll(ds, young.key, 'month', 'year').rows.find((x) => x.key === 'year')!;
  assert.equal(r.revenue, 0);
  assert.equal(r.revDelta, null);
});

test('точки рядом: все точки даже при выбранной одной, доли дают 100%, прибыль сходится с сетью', () => {
  for (const k of INDUSTRY_ORDER) {
    const ds = getDataset(k);
    for (const f of filtersOf(k)) {
      for (const [p, c] of [['month', 'prev'], ['week', 'prev'], ['month', 'year']] as [Period, Compare][]) {
        const win = windowOf(p);
        const tbl = locationsTable(ds, f, win, windowOf(p, c));
        assert.equal(tbl.rows.length, ds.profile.locations.length);
        assert.equal(tbl.rows.reduce((s, r) => s + r.revenue, 0), tbl.total.revenue);
        assert.ok(Math.abs(tbl.rows.reduce((s, r) => s + r.share, 0) - 1) < 1e-9);
        assert.equal(tbl.rows.reduce((s, r) => s + r.profit, 0), pnl(ds, 'all', win).profit);
        assert.deepEqual(tbl.rows.filter((r) => r.selected).map((r) => r.key), f === 'all' ? [] : [f]);
        tbl.rows.forEach((r, i) => assert.equal(r.tone, Math.min(6, i + 1)));
      }
    }
  }
});

test('точки рядом: слабая по сюжету точка отмечена по загрузке и неявкам', () => {
  for (const k of INDUSTRY_ORDER) {
    const ds = getDataset(k);
    const weakest = [...ds.profile.locations].sort((a, b) => b.noShow - a.noShow)[0]!;
    const row = locationsTable(ds, 'all', windowOf('month'), windowOf('month', 'prev')).rows.find((r) => r.key === weakest.key)!;
    assert.ok(row.weak.noShow, `${k}: ${weakest.name} с неявками ${row.noShow}`);
    assert.ok(row.weak.load || row.load < loadOf(totals(ds, 'all', windowOf('month'))), `${k}: загрузка ${weakest.name}`);
  }
});

test('подпись точки не повторяет слово «точка»', () => {
  const ds = getDataset('other');
  assert.equal(atLoc(ds, 'b'), 'в точке у метро');
  assert.equal(atLoc(ds, 'b', 'в точку'), 'в точку у метро');
  assert.equal(atLoc(getDataset('clinic'), 'mit'), 'в точке Митино');
  assert.equal(noShowMoney(ds, 'all', windowOf('month')) > 0, true);
});
