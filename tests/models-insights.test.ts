import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getDataset, totals } from '../src/lib/demo-app/engine/dataset.ts';
import { DAYS_TOTAL, windowOf } from '../src/lib/demo-app/engine/calendar.ts';
import { staffRows } from '../src/lib/demo-app/engine/ops.ts';
import { channelRows } from '../src/lib/demo-app/engine/channels.ts';
import { INDUSTRY_ORDER } from '../src/lib/demo-app/industries/index.ts';
import { SECTIONS } from '../src/lib/demo-app/blocks/registry.ts';
import { money } from '../src/components/dash/format.ts';
import {
  CHAT_SIZE, chatScript, insights, laggingStaff, MAX_ALERTS, MAX_INSIGHTS, MIN_INSIGHTS, morningDigest,
} from '../src/lib/demo-app/models/insights.ts';
import { deadCampaigns, dipImpact } from '../src/lib/demo-app/models/overview.ts';
import type { Compare, LocFilter, Period } from '../src/lib/demo-app/engine/types.ts';

const FORBIDDEN = /→|·|undefined|NaN|Infinity|\[object|\s{2}/;
const TONES = ['bad', 'warn', 'good'];
const filtersOf = (k: (typeof INDUSTRY_ORDER)[number]): LocFilter[] => ['all', ...getDataset(k).profile.locations.map((l) => l.key)];
const CASES: [Period, Compare][] = [['month', 'prev'], ['week', 'prev'], ['month', 'year'], ['quarter', 'year']];

test('лента инсайтов: 6–8 карточек в каждой отрасли, срезе, периоде и сравнении', () => {
  for (const k of INDUSTRY_ORDER) {
    const ds = getDataset(k);
    for (const f of filtersOf(k)) {
      for (const [p, c] of CASES) {
        const cards = insights(ds, f, p, c);
        assert.ok(cards.length >= MIN_INSIGHTS && cards.length <= MAX_INSIGHTS, `${k}/${f}/${p}/${c}: ${cards.length}`);
        assert.equal(new Set(cards.map((x) => x.key)).size, cards.length, 'без повторов');
        const order = cards.map((x) => TONES.indexOf(x.tone));
        assert.deepEqual(order, [...order].sort((a, b) => a - b), 'сначала тревоги, в конце хорошее');
        for (const x of cards) {
          assert.ok(TONES.includes(x.tone));
          assert.ok(x.section in SECTIONS);
          assert.ok(Number.isFinite(x.amount), `${k}: ${x.key} amount`);
          assert.ok(x.title && x.text && x.action && x.amountNote);
          assert.ok(!FORBIDDEN.test(`${x.title} ${x.text} ${x.action}`), `${k}/${f}: ${x.title} | ${x.text} | ${x.action}`);
        }
      }
    }
  }
});

test('лента инсайтов по сети: провал точки с причиной, отстающий сотрудник, кампания без продаж, лучшая точка', () => {
  for (const k of INDUSTRY_ORDER) {
    const ds = getDataset(k);
    const cards = insights(ds, 'all', 'month', 'prev');
    const by = Object.fromEntries(cards.map((x) => [x.key, x]));
    const { story } = ds.profile;
    assert.ok(by.dip?.text.includes(story.dip.reason), `${k}: причина провала`);
    assert.equal(by.dip!.amount, dipImpact(ds, 'all', windowOf('month'))!.money);
    assert.equal(by.dip!.drill?.key, story.dip.loc);
    const lag = laggingStaff(ds, 'all', windowOf('month'))!;
    assert.equal(lag.row.loc, story.lagging.loc);
    assert.ok(lag.gap > 0);
    assert.equal(by.lagging!.amount, lag.gap);
    assert.ok(by.lagging!.title.startsWith(lag.row.name));
    const dead = deadCampaigns(channelRows(ds, 'all', windowOf('month'), 'last'))[0]!;
    assert.ok(by.campaign!.title.includes(dead.name));
    assert.equal(by.campaign!.amount, dead.spend);
    assert.equal(by.best!.tone, 'good');
    assert.ok(by.calls && by.sleeping && by.reviews, `${k}: звонки, спящие, отзывы`);
  }
});

test('отстающий сотрудник: самый слабый в своей точке, разница — со средним коллег', () => {
  for (const k of INDUSTRY_ORDER) {
    const ds = getDataset(k);
    const win = windowOf('month');
    const lag = laggingStaff(ds, 'all', win)!;
    const rows = staffRows(ds, ds.profile.story.lagging.loc, win);
    const others = rows.filter((r) => r.name !== lag.row.name);
    assert.equal(lag.avg, Math.round(others.reduce((s, r) => s + r.revenue, 0) / others.length));
    assert.ok(others.every((r) => r.revenue > lag.row.revenue));
    assert.ok(Math.abs(lag.gap - (lag.avg - lag.row.revenue)) <= 1, `${k}: разница ${lag.gap} = среднее ${lag.avg} − ${lag.row.revenue}`);
    const elsewhere = ds.profile.locations.find((l) => l.key !== ds.profile.story.lagging.loc)!;
    assert.equal(laggingStaff(ds, elsewhere.key, win), null, 'в чужой точке отстающего нет');
  }
});

test('чат: шесть вопросов словами отрасли, ответы с цифрами из движка', () => {
  for (const k of INDUSTRY_ORDER) {
    const ds = getDataset(k);
    const w = ds.profile.words;
    for (const f of filtersOf(k)) {
      for (const p of ['week', 'month', 'year'] as Period[]) {
        const qa = chatScript(ds, f, p);
        assert.equal(qa.length, CHAT_SIZE, `${k}/${f}/${p}`);
        assert.equal(new Set(qa.map((x) => x.key)).size, CHAT_SIZE);
        for (const x of qa) {
          assert.ok(!FORBIDDEN.test(x.q + x.a), `${k}: ${x.q} | ${x.a}`);
          assert.ok(x.section in SECTIONS);
          if (x.chart?.kind === 'bars') assert.ok(x.chart.rows.every((r) => Number.isFinite(r.value)));
        }
        const where = qa.find((x) => x.key === 'where')!;
        assert.ok(where.chart?.kind === 'bars');
        assert.equal(where.chart.rows.reduce((s, r) => s + r.value, 0), totals(ds, 'all', windowOf(p)).revenue, 'полосы складываются в выручку сети');
        assert.ok(where.a.includes(money(where.chart.rows[0]!.value)), 'в ответе та же сумма, что на графике');
        assert.ok(qa.some((x) => x.q.includes(w.staff[2])), `${k}: вопрос про ${w.staff[2]}`);
        assert.ok(qa.some((x) => x.q.includes(w.client[2])), `${k}: вопрос про ${w.client[2]}`);
        const year = qa.find((x) => x.key === 'year')!;
        assert.ok(year.chart?.kind === 'spark' && year.chart.values.length === 52);
      }
    }
  }
});

test('утренняя сводка: вчерашняя выручка, записи на сегодня, неявки и не больше двух тревог', () => {
  for (const k of INDUSTRY_ORDER) {
    const ds = getDataset(k);
    for (const f of filtersOf(k)) {
      const d = morningDigest(ds, f, 'month', 'prev');
      const keys = d.lines.map((l) => l.key);
      assert.ok(keys.includes('money') && keys.includes('today') && keys.includes('noshow'), `${k}/${f}: ${keys}`);
      const alerts = d.lines.filter((l) => l.key === 'alerts');
      assert.ok(alerts.length >= 1 && alerts.length <= MAX_ALERTS, `${k}/${f}: ${alerts.length}`);
      assert.equal(new Set(d.lines.map((l) => l.id)).size, d.lines.length);
      const y = totals(ds, f, [DAYS_TOTAL - 1, DAYS_TOTAL]);
      assert.ok(d.lines[0]!.text.includes(money(y.revenue)), `${k}: ${d.lines[0]!.text}`);
      assert.match(d.day, /^Сводка за \S+, \d{1,2} [а-я]+$/);
      for (const l of d.lines) assert.ok(!FORBIDDEN.test(l.text), l.text);
      if (f !== 'all') assert.ok(d.scope.endsWith(ds.profile.locations.find((l) => l.key === f)!.name));
    }
  }
});
