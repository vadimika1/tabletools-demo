import { test } from 'node:test';
import assert from 'node:assert/strict';
import { placeBubble, holeBox, sideOrder, MARGIN, GAP } from '../src/lib/tour/place.ts';

const VP = { w: 1440, h: 900 };
const BUBBLE = { w: 340, h: 180 };

test('места хватает — пузырь под целью, по центру, стрелка на центр цели', () => {
  const p = placeBubble({ x: 500, y: 100, w: 200, h: 60 }, BUBBLE, VP, 'bottom');
  assert.equal(p.side, 'bottom');
  assert.equal(p.y, 100 + 60 + GAP);
  assert.equal(p.x, 600 - 170);
  assert.equal(p.arrow, 170);
});

test('снизу тесно — пузырь уходит наверх', () => {
  const p = placeBubble({ x: 500, y: 760, w: 200, h: 60 }, BUBBLE, VP, 'bottom');
  assert.equal(p.side, 'top');
  assert.equal(p.y, 760 - 180 - GAP);
});

test('цель у правого края — пузырь прижат к краю, стрелка всё равно смотрит на цель', () => {
  const t = { x: 1380, y: 60, w: 44, h: 44 };
  const p = placeBubble(t, BUBBLE, VP, 'bottom');
  assert.equal(p.x, VP.w - BUBBLE.w - MARGIN);
  assert.equal(p.x + p.arrow, 1402, 'кончик стрелки — над центром цели');
});

test('высокая цель на весь экран — сбоку, где просторнее', () => {
  const t = { x: 260, y: 0, w: 700, h: 900 };
  const p = placeBubble(t, BUBBLE, VP, 'bottom');
  assert.equal(p.side, 'right');
  assert.ok(p.x >= 960 && p.x + BUBBLE.w <= VP.w - MARGIN + 1);
  assert.deepEqual(sideOrder(t, VP, 'bottom'), ['bottom', 'top', 'right', 'left']);
});

test('на телефоне пузырь никогда не выходит за экран, даже если места нет нигде', () => {
  const phone = { w: 360, h: 640 };
  const b = { w: 320, h: 180 };
  for (const t of [{ x: 0, y: 0, w: 360, h: 640 }, { x: 100, y: 300, w: 160, h: 40 }, { x: 300, y: 600, w: 50, h: 30 }]) {
    const p = placeBubble(t, b, phone, 'right');
    assert.ok(p.x >= MARGIN && p.x + b.w <= phone.w - MARGIN, `x ${p.x}`);
    assert.ok(p.y >= MARGIN && p.y + b.h <= phone.h - MARGIN, `y ${p.y}`);
  }
});

test('вырез подсветки обрезается по экрану', () => {
  const h = holeBox({ x: 300, y: -200, w: 800, h: 1600 }, VP);
  assert.ok(h.y >= MARGIN && h.y + h.h <= VP.h - MARGIN);
});

test('высокий блок во всю ширину: пузырь сужается и встаёт слева, над меню', async () => {
  const { sideFit, MIN_SIDE_W } = await import('../src/lib/tour/place.ts');
  const t = { x: 284, y: 24, w: 1124, h: 820 };
  const fit = sideFit(t, { w: 340, h: 420 }, VP);
  assert.deepEqual(fit, { w: 284 - GAP - MARGIN, side: 'left' });
  assert.ok(fit!.w >= MIN_SIDE_W);
  assert.equal(sideFit({ x: 100, y: 100, w: 200, h: 60 }, { w: 340, h: 200 }, VP), null, 'снизу место есть — не сужаем');
  assert.equal(sideFit({ x: 20, y: 0, w: 1400, h: 900 }, { w: 340, h: 420 }, VP), null, 'сбоку тоже некуда');
});

test('прокрутка оставляет под небольшой целью место для пузыря', async () => {
  const { targetTop } = await import('../src/lib/tour/place.ts');
  const top = targetTop(150, 900, 420);
  assert.ok(top + 150 + GAP + 420 <= 900, `цель ${top}..${top + 150}, пузырь не влезает`);
  assert.equal(targetTop(700, 900, 420), 100, 'цель с пузырём не влезает — цель по центру');
  assert.equal(targetTop(1200, 900, 420), 24, 'цель выше экрана — верхом к краю');
});

test('телефон и высокий блок — пузырь становится нижней панелью во всю ширину', async () => {
  const { sheetFit, sheetPlacement } = await import('../src/lib/tour/place.ts');
  // Arrange: экран 375×740, блок почти на весь экран, пузырь 350×300
  const phone = { w: 375, h: 740 };
  const tall = { x: 8, y: 16, w: 359, h: 712 };
  const bubble = { w: 351, h: 300 };
  // Act + Assert
  assert.equal(sheetFit(tall, bubble, phone), true);
  const p = sheetPlacement(bubble, phone);
  assert.equal(p.x, MARGIN);
  assert.equal(p.y, phone.h - bubble.h - MARGIN, 'прижат к низу экрана');
  assert.equal(p.arrow, -1, 'без стрелки');
});

test('небольшой блок на телефоне и любой блок на компьютере — обычный пузырь рядом', async () => {
  const { sheetFit } = await import('../src/lib/tour/place.ts');
  const bubble = { w: 351, h: 300 };
  assert.equal(sheetFit({ x: 8, y: 60, w: 359, h: 60 }, bubble, { w: 375, h: 740 }), false, 'под маленьким блоком места хватает');
  assert.equal(sheetFit({ x: 280, y: 16, w: 1100, h: 860 }, { w: 340, h: 300 }, VP), false, 'на широком экране пузырь встаёт сбоку');
});
