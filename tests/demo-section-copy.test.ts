import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BLOCKS, SECTION_ORDER } from '../src/lib/demo-app/blocks/registry.ts';
import { SECTION_COPY, SYSTEM_NAMES } from '../src/lib/demo-app/section-copy.ts';

const TITLE_MAX = 70; // без « | TableTools»: длиннее поисковики обрезают в выдаче
const INTRO_MIN = 150; // меньше — снова «малоценная страница»

test('у каждого раздела демо свой заголовок для поиска, не длиннее 70 знаков', () => {
  const titles = SECTION_ORDER.map((k) => SECTION_COPY[k].seoTitle);
  assert.equal(new Set(titles).size, titles.length, 'заголовки повторяются');
  for (const t of titles) {
    assert.ok(t.length <= TITLE_MAX, `длинный заголовок (${t.length}): ${t}`);
    assert.doesNotMatch(t, /(^|[^\p{L}])(crm|ии)([^\p{L}]|$)/u, `аббревиатура строчными: ${t}`);
  }
});

const SERVICE_PATH = /^\/[a-z0-9-]+\/$/; // страница услуги на tabletools.ru, адрес собирает siteHref

test('у каждого раздела есть вступление и хотя бы одна ссылка на страницу услуги', () => {
  for (const k of SECTION_ORDER) {
    const c = SECTION_COPY[k];
    assert.ok(c.intro.length >= INTRO_MIN, `${k}: короткое вступление`);
    assert.ok(c.services.length > 0, `${k}: нет ссылки на услугу`);
    for (const s of c.services) assert.match(s.href, SERVICE_PATH, `${k}: адрес услуги не вида /slug/: ${s.href}`);
  }
});

test('у каждой системы-источника из реестра блоков есть общее название', () => {
  for (const b of BLOCKS) for (const s of b.systems) assert.ok(SYSTEM_NAMES[s], `${b.id}: нет названия для ${s}`);
});
