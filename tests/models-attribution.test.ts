import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getDataset, totals, spendOf, type Dataset } from '../src/lib/demo-app/engine/dataset.ts';
import { windowOf } from '../src/lib/demo-app/engine/calendar.ts';
import { DIRECT_KEY, MODELS } from '../src/lib/demo-app/engine/channels.ts';
import { INDUSTRY_ORDER } from '../src/lib/demo-app/industries/index.ts';
import type { LocFilter, Model, Period, Win } from '../src/lib/demo-app/engine/types.ts';
import {
  channelFunnels, channelTree, creditedIndex, csvCell, customerPaths, dataHealth, modelShift, multiChannel, treeCsv, CSV_BOM, CSV_SEP, MODEL_ORDER,
} from '../src/lib/demo-app/models/attribution.ts';

interface Case { name: string; ds: Dataset; loc: LocFilter; win: Win; model: Model }

/** Каждая отрасль × каждая модель; срезы чередуются: сеть за месяц, точка за неделю, сеть за год. */
function cases(): Case[] {
  const shapes: [Period, boolean][] = [['month', false], ['week', true], ['year', false]];
  return INDUSTRY_ORDER.flatMap((k) => {
    const ds = getDataset(k);
    return MODEL_ORDER.map((model, i) => {
      const [p, single] = shapes[i]!;
      return { name: `${k} ${model} ${p}`, ds, loc: single ? ds.profile.locations[1]!.key : 'all', win: windowOf(p), model };
    });
  });
}
const CASES = cases();
const sum = (xs: readonly number[]) => xs.reduce((s, v) => s + v, 0);

test('a1: во всех моделях продажи каналов вместе с прямыми = все оплаченные; сдвиг к последнему касанию', () => {
  for (const c of CASES) {
    const m = modelShift(c.ds, c.loc, c.win, c.model);
    const served = totals(c.ds, c.loc, c.win).served;
    assert.equal(m.total, served, c.name);
    for (const model of MODEL_ORDER) assert.equal(sum(m.rows.map((r) => r.sales[model])), served, `${c.name}: ${model}`);
    for (const r of m.rows) assert.equal(r.delta, r.sales[c.model] - r.sales.last);
    assert.equal(sum(m.rows.map((r) => r.delta)), 0, `${c.name}: модель перекладывает, а не создаёт продажи`);
    assert.equal(m.hint, MODELS[c.model].hint);
  }
  const ds = getDataset('clinic');
  const w = windowOf('quarter');
  const direct = (model: Model) => modelShift(ds, 'all', w, model).rows.find((r) => r.key === DIRECT_KEY)!.sales[model];
  assert.ok(direct('nondirect') < direct('last'), 'последнее значимое забирает у прямых');
});

test('a2: ступени каналов сужаются, оплаты по каналам = продажи модели без прямых', () => {
  for (const c of CASES) {
    const rows = channelFunnels(c.ds, c.loc, c.win, c.model);
    const shift = modelShift(c.ds, c.loc, c.win, c.model).rows.filter((r) => r.key !== DIRECT_KEY);
    assert.equal(sum(rows.map((r) => r.paid)), sum(shift.map((r) => r.sales[c.model])), c.name);
    for (const r of rows) {
      if (r.impressions !== null) assert.ok(r.clicks <= r.impressions, `${c.name}: ${r.name}`);
      assert.ok(r.leads <= r.clicks || r.clicks === 0, `${c.name}: ${r.name}`);
      assert.ok(r.bookings <= r.leads && r.paid <= r.bookings, `${c.name}: ${r.name}`);
      assert.equal(r.toClick === null, r.impressions === null);
    }
    assert.ok(rows.some((r) => r.impressions === null), `${c.name}: у карт и сарафана показов нет — прочерк`);
  }
});

test('a3: дерево каналов сходится с итогом движка, кампании — с каналом', () => {
  for (const c of CASES) {
    const tree = channelTree(c.ds, c.loc, c.win, c.model);
    const t = totals(c.ds, c.loc, c.win);
    assert.equal(sum(tree.nodes.map((n) => n.row.sales)), tree.total.sales, c.name);
    assert.equal(tree.total.sales, t.served);
    assert.equal(sum(tree.nodes.map((n) => n.row.revenue)), t.revenue, c.name);
    assert.equal(sum(tree.nodes.map((n) => n.row.spend)), spendOf(t), c.name);
    assert.equal(tree.total.roi, null, 'окупаемость всей выручки на рекламу не делим');
    for (const n of tree.nodes) if (n.row.spend === 0) assert.equal(n.row.cac, null, `${c.name}: бесплатный канал — прочерк, а не 0 ₽`);
    for (const n of tree.nodes) {
      if (!n.children.length) continue;
      assert.equal(sum(n.children.map((x) => x.sales)), n.row.sales, `${c.name}: ${n.row.name}`);
      assert.equal(sum(n.children.map((x) => x.spend)), n.row.spend, `${c.name}: ${n.row.name}`);
      assert.ok(n.children.every((x) => /^[\p{L}\p{N}_.\- ]+$/u.test(x.key)), 'ключ кампании проходит проверку детализации');
    }
  }
});

test('a3: CSV — BOM для Excel, точка с запятой, строки из тех же чисел, итог внизу', () => {
  const ds = getDataset('studio');
  const tree = channelTree(ds, 'all', windowOf('month'), 'last');
  const csv = treeCsv(tree);
  assert.ok(csv.startsWith(CSV_BOM));
  const lines = csv.slice(1).trimEnd().split('\r\n');
  assert.equal(lines.length, 1 + tree.nodes.length + sum(tree.nodes.map((n) => n.children.length)) + 1);
  assert.equal(lines[0]!.split(CSV_SEP).length, 7);
  const last = lines[lines.length - 1]!.split(CSV_SEP);
  assert.equal(last[0], 'Итого');
  assert.equal(Number(last[2]), tree.total.sales);
  assert.equal(Number(last[3]), tree.total.revenue);
});

test('a3: ячейка CSV защищена от формул и экранирует кавычки и разделитель', () => {
  assert.equal(csvCell('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`);
  assert.equal(csvCell('+7 999'), "'+7 999");
  assert.equal(csvCell('-сумма'), "'-сумма");
  assert.equal(csvCell('@admin'), "'@admin");
  assert.equal(csvCell('Гигиена −20%'), 'Гигиена −20%'); // длинное тире «−» — не минус, формулой не станет
  assert.equal(csvCell('а;б'), '"а;б"');
  assert.equal(csvCell('строка\nдругая'), '"строка\nдругая"');
  assert.equal(csvCell(12), '12');
  assert.equal(csvCell(3.456), '3,46');
  assert.equal(csvCell(null), '');
});

test('a4: два пути, касания по времени, засчитано одно касание по правилу модели', () => {
  for (const c of CASES) {
    const paths = customerPaths(c.ds, c.loc, c.win, c.model);
    assert.equal(paths.length, 2, c.name);
    const keys = c.ds.profile.channels.map((x) => x.key);
    for (const p of paths) {
      assert.equal(p.touches.filter((t) => t.credited).length, 1, c.name);
      p.touches.slice(1).forEach((t, k) => assert.ok(t.day >= p.touches[k]!.day, `${c.name}: по порядку`));
      assert.ok(p.touches[0]!.day >= -30 && p.touches[p.touches.length - 1]!.day <= 0, c.name);
      assert.ok(p.touches.every((t) => t.channelKey === DIRECT_KEY || keys.includes(t.channelKey)), `${c.name}: каналы из профиля`);
      const credited = p.touches.findIndex((t) => t.credited);
      assert.equal(credited, creditedIndex(p.touches.map((t) => t.channelKey), c.model));
      assert.ok(p.amount > 0 && !p.touches.some((t) => t.action.includes('→')), c.name);
    }
    assert.equal(paths[0]!.touches.at(-1)!.channelKey, DIRECT_KEY, 'первый путь заканчивается прямым заходом');
  }
});

test('a4: правило засчитывания — последнее, последнее не прямое, первое', () => {
  const keys = ['vk', 'search', DIRECT_KEY];
  assert.equal(creditedIndex(keys, 'last'), 2);
  assert.equal(creditedIndex(keys, 'nondirect'), 1);
  assert.equal(creditedIndex(keys, 'first'), 0);
  assert.equal(creditedIndex([DIRECT_KEY], 'nondirect'), 0);
  assert.equal(creditedIndex([], 'last'), -1);
});

test('a5: многоканальных 25–40%, пары и «другие» складываются в многоканальные', () => {
  for (const c of CASES) {
    const m = multiChannel(c.ds, c.loc, c.win);
    assert.ok(m.share >= 0.24 && m.share <= 0.41, `${c.name}: ${m.share}`);
    assert.equal(sum(m.pairs.map((p) => p.sales)) + m.other, m.multi, c.name);
    assert.ok(m.pairs.every((p) => p.firstKey !== p.thenKey), c.name);
    assert.ok(m.multi <= m.total, c.name);
  }
});

test('a6: склейка по точкам сходится, ровно одно лёгкое предупреждение, без повторов источников', () => {
  for (const c of CASES) {
    const h = dataHealth(c.ds, c.loc, c.win);
    assert.equal(h.sales, totals(c.ds, c.loc, c.win).served, c.name);
    assert.equal(h.matched, sum(h.locs.map((l) => l.matched)), c.name);
    assert.ok(h.locs.every((l) => l.share === null || (l.share >= 0.55 && l.share <= 0.98)), c.name);
    assert.equal(h.warnings, 1, c.name);
    assert.equal(new Set(h.sources.map((s) => s.name)).size, h.sources.length, c.name);
  }
  const ds = getDataset('clinic');
  const h = dataHealth(ds, 'all', windowOf('month'));
  const weakest = [...h.locs].sort((a, b) => a.share! - b.share!)[0]!;
  assert.equal(weakest.key, 'mit', 'хуже всех склеивается точка, которая теряет звонки');
});
