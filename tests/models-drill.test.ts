import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getDataset, totals, loadOf } from '../src/lib/demo-app/engine/dataset.ts';
import { windowOf } from '../src/lib/demo-app/engine/calendar.ts';
import { pnl } from '../src/lib/demo-app/engine/money.ts';
import { METRICS, metricValue, metricSeries, metricByLoc, isMetric, adReturn } from '../src/lib/demo-app/models/drill.ts';
import { channelRows } from '../src/lib/demo-app/engine/channels.ts';
import { INDUSTRY_ORDER } from '../src/lib/demo-app/industries/index.ts';

for (const k of INDUSTRY_ORDER) {
  const ds = getDataset(k);

  test(`${k}: панель показывает ту же цифру, что плитка`, () => {
    const w = windowOf('month');
    assert.equal(metricValue(ds, 'all', w, 'revenue'), totals(ds, 'all', w).revenue);
    assert.equal(metricValue(ds, 'all', w, 'profit'), pnl(ds, 'all', w).profit);
    assert.equal(metricValue(ds, 'all', w, 'load'), loadOf(totals(ds, 'all', w)));
    assert.equal(metricValue(ds, 'all', w, 'rent'), pnl(ds, 'all', w).rent);
    const paid = channelRows(ds, 'all', w, 'last').filter((r) => r.spend > 0);
    const byRows = paid.reduce((a, r) => a + r.revenue, 0) / paid.reduce((a, r) => a + r.spend, 0);
    assert.equal(metricValue(ds, 'all', w, 'roi'), byRows);
    assert.equal(adReturn(ds, 'all', w), byRows);
  });

  test(`${k}: выручка по дням и неделям складывается в выручку окна, по точкам — в сеть`, () => {
    for (const p of ['month', 'quarter'] as const) {
      const w = windowOf(p);
      const s = metricSeries(ds, 'all', w, 'revenue');
      assert.equal(s.values.reduce((a, v) => a + v, 0), totals(ds, 'all', w).revenue, p);
      assert.equal(s.starts.length, p === 'month' ? 28 : 13);
    }
    const w = windowOf('month');
    assert.equal(metricByLoc(ds, w, 'revenue').reduce((a, r) => a + r.value, 0), totals(ds, 'all', w).revenue);
  });
}

test('у каждого показателя есть объяснение, формат и направление «хорошо»', () => {
  for (const [key, m] of Object.entries(METRICS)) {
    assert.ok(m.title && m.how.length > 20, key);
    assert.ok(isMetric(key));
  }
  assert.equal(isMetric('<script>'), false);
});

test('показатели клиентов в панели совпадают с блоком «Новые и вернувшиеся»', async () => {
  const { clientStats } = await import('../src/lib/demo-app/engine/clients.ts');
  const ds = getDataset('salon');
  const w = windowOf('month');
  const cs = clientStats(ds, 'all', w);
  assert.equal(metricValue(ds, 'all', w, 'newClients'), cs.newClients);
  assert.equal(metricValue(ds, 'all', w, 'returning'), cs.returning);
  assert.equal(metricValue(ds, 'all', w, 'sleeping'), cs.sleeping);
  assert.equal(metricValue(ds, 'all', w, 'unique'), cs.unique);
  assert.equal(METRICS.sleeping.series, false);
});
