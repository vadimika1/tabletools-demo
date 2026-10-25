import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BLOCKS, BLOCK_BY_ID, SECTION_ORDER, preset, parseBlocks, encodeBlocks, bySection, fitsIndustry, packRows } from '../src/lib/demo-app/blocks/registry.ts';
import { INDUSTRY_ORDER, INDUSTRIES } from '../src/lib/demo-app/industries/index.ts';

test('у каждого блока уникальный id вида «буква + число» и заполненные тексты', () => {
  const ids = BLOCKS.map((b) => b.id);
  assert.equal(new Set(ids).size, ids.length, 'повтор id');
  for (const b of BLOCKS) {
    assert.match(b.id, /^[a-z]\d{1,2}$/);
    assert.ok(b.title && b.question && b.custom, `${b.id}: пустой текст`);
    assert.ok(b.systems.length > 0, `${b.id}: не указан источник`);
  }
});

for (const k of INDUSTRY_ORDER) {
  test(`${k}: готовый дашборд — только существующие и подходящие блоки, без повторов, в каждом разделе ≥ 3`, () => {
    const p = preset(k);
    const all = SECTION_ORDER.flatMap((s) => p[s]);
    assert.equal(new Set(all).size, all.length, 'блок стоит дважды');
    for (const s of SECTION_ORDER) {
      assert.ok(p[s].length >= 3, `${s}: всего ${p[s].length}`);
      for (const id of p[s]) {
        const def = BLOCK_BY_ID.get(id);
        assert.ok(def, `нет блока ${id}`);
        assert.equal(def.section, s, `${id} лежит не в своём разделе`);
        assert.ok(fitsIndustry(def, k), `${id} не для ${k}`);
      }
    }
    const own = BLOCKS.filter((b) => b.from === 'industry' && b.industries?.includes(k));
    for (const b of own) assert.ok(all.includes(b.id), `отраслевой ${b.id} не попал в набор ${k}`);
  });

  test(`${k}: у отрасли названы все системы, на которые ссылаются блоки`, () => {
    for (const b of BLOCKS) for (const s of b.systems) assert.ok(INDUSTRIES[k].systems[s], `${k}: нет системы ${s} для ${b.id}`);
  });
}

test('набор из адреса: чужое, повторы и разметка отбрасываются, порядок выбора сохраняется', () => {
  assert.deepEqual(parseBlocks('p2,o1,P2, zz9,o99,q1,<script>,o1,m7'), ['p2', 'o1', 'm7'], 'похожие на id, но несуществующие (o99, q1) тоже отбрасываются');
  assert.deepEqual(parseBlocks(''), []);
  assert.deepEqual(parseBlocks(null), []);
  const all = BLOCKS.map((b) => b.id);
  assert.equal(parseBlocks(all.join(',')).length, all.length, 'весь каталог помещается в ссылку');
  assert.equal(parseBlocks([...all, ...all].join(',')).length, all.length, 'повторы не раздувают набор сверх каталога');
  assert.equal(encodeBlocks(['m7', 'x', 'o1']), 'm7,o1');
});

test('раскладка по разделам идёт в порядке каталога', () => {
  const s = bySection(['m1', 'o3', 'o1', 'c1']);
  assert.deepEqual(s.overview, ['o1', 'o3']);
  assert.deepEqual(s.marketing, ['m1']);
  assert.deepEqual(s.clients, ['c1']);
  assert.deepEqual(s.finance, []);
});

test('упаковка рядов: одинокий блок половинной ширины растягивается, полные ряды не трогаем', () => {
  // a4 и a5 — w-6 рядом, a6 — w-6 один в ряду
  assert.deepEqual(packRows(['a1', 'a4', 'a5', 'a6']), [12, 6, 6, 12]);
  // w-7 + w-5 = ряд полный; w-6, затем w-12 не влезает — w-6 растягивается
  assert.deepEqual(packRows(['m2', 'm3', 'm4', 'm1']), [7, 5, 12, 12]);
  // w-8 + w-6 не влезают вместе — w-8 растягивается до 12
  assert.deepEqual(packRows(['p2', 'p3']), [12, 12]);
});

test('упаковка: каждый ряд всегда ровно 12 колонок в любом готовом наборе', () => {
  for (const k of INDUSTRY_ORDER) for (const s of SECTION_ORDER) {
    const spans = packRows(preset(k)[s]);
    let used = 0;
    for (const x of spans) { used += x; assert.ok(used <= 12, `${k}/${s}: ряд переполнен`); if (used === 12) used = 0; }
    assert.equal(used, 0, `${k}/${s}: последний ряд не заполнен`);
  }
});
