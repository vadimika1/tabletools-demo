// Геометрия тура: куда поставить пузырь рядом с подсвеченным элементом. Чистые функции —
// каскад сторон: предпочтительная → противоположная → просторная поперечная,
// затем прижимаем к краю экрана с отступом, а стрелку двигаем так, чтобы она смотрела на цель.

export type Side = 'top' | 'bottom' | 'left' | 'right';
export interface Rect { x: number; y: number; w: number; h: number }
export interface Size { w: number; h: number }
export interface Placement { side: Side; x: number; y: number; arrow: number }

export const MARGIN = 12; // отступ пузыря от края экрана
export const GAP = 14; // зазор между целью и пузырём
const ARROW_PAD = 20; // стрелка не подходит к углу пузыря ближе

const OPPOSITE: Record<Side, Side> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };

function room(t: Rect, vp: Size, side: Side): number {
  switch (side) {
    case 'top': return t.y;
    case 'bottom': return vp.h - (t.y + t.h);
    case 'left': return t.x;
    case 'right': return vp.w - (t.x + t.w);
  }
}

const fits = (t: Rect, b: Size, vp: Size, side: Side) =>
  room(t, vp, side) >= (side === 'top' || side === 'bottom' ? b.h : b.w) + GAP + MARGIN;

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));

/** Порядок перебора сторон для предпочтительной. */
export function sideOrder(t: Rect, vp: Size, prefer: Side): Side[] {
  const vertical = prefer === 'top' || prefer === 'bottom';
  const cross: Side[] = vertical ? ['right', 'left'] : ['bottom', 'top'];
  cross.sort((a, b) => room(t, vp, b) - room(t, vp, a));
  return [prefer, OPPOSITE[prefer], ...cross];
}

export function placeBubble(t: Rect, b: Size, vp: Size, prefer: Side = 'bottom'): Placement {
  const side = sideOrder(t, vp, prefer).find((s) => fits(t, b, vp, s)) ?? prefer;
  let x: number;
  let y: number;
  if (side === 'top' || side === 'bottom') {
    x = clamp(t.x + t.w / 2 - b.w / 2, MARGIN, vp.w - b.w - MARGIN);
    y = side === 'bottom' ? t.y + t.h + GAP : t.y - b.h - GAP;
    y = clamp(y, MARGIN, vp.h - b.h - MARGIN);
  } else {
    y = clamp(t.y + t.h / 2 - b.h / 2, MARGIN, vp.h - b.h - MARGIN);
    x = side === 'right' ? t.x + t.w + GAP : t.x - b.w - GAP;
    x = clamp(x, MARGIN, vp.w - b.w - MARGIN);
  }
  // Стрелка — туда, где центр цели, даже если пузырь прижат к краю.
  const arrow = side === 'top' || side === 'bottom'
    ? clamp(t.x + t.w / 2 - x, ARROW_PAD, b.w - ARROW_PAD)
    : clamp(t.y + t.h / 2 - y, ARROW_PAD, b.h - ARROW_PAD);
  return { side, x: Math.round(x), y: Math.round(y), arrow: Math.round(arrow) };
}

/** Вырез подсветки: цель с полями, но не выше экрана (высокие блоки режем по видимой части). */
export function holeBox(t: Rect, vp: Size, pad = 8): Rect {
  const y = Math.max(MARGIN, t.y - pad);
  const bottom = Math.min(vp.h - MARGIN, t.y + t.h + pad);
  return { x: Math.max(MARGIN / 2, t.x - pad), y, w: Math.min(vp.w - MARGIN, t.w + pad * 2), h: Math.max(24, bottom - y) };
}

export const MIN_SIDE_W = 230; // уже этого пузырь сбоку не делаем — текст превращается в столбик

/**
 * Если сверху и снизу пузырю не хватает места (высокий блок во всю ширину), его можно сузить
 * и поставить сбоку — туда, где просторнее. Возвращает ширину и сторону или null (сужать некуда).
 */
export function sideFit(t: Rect, b: Size, vp: Size): { w: number; side: Side } | null {
  if (fits(t, b, vp, 'top') || fits(t, b, vp, 'bottom')) return null;
  const left = t.x - GAP - MARGIN;
  const right = vp.w - (t.x + t.w) - GAP - MARGIN;
  const side: Side = left >= right ? 'left' : 'right';
  const room = Math.floor(Math.max(left, right));
  if (room >= b.w) return { w: b.w, side };
  return room >= MIN_SIDE_W ? { w: room, side } : null;
}

/**
 * Куда прокрутить, чтобы цель была на экране целиком и под ней осталось место для пузыря:
 * возвращает желаемый отступ верха цели от верха экрана.
 */
export function targetTop(h: number, vh: number, reserve: number, pad = 24): number {
  if (h + GAP + reserve + pad * 2 <= vh) return Math.max(pad, (vh - (h + GAP + reserve)) / 2);
  if (h + pad * 2 <= vh) return (vh - h) / 2;
  return pad;
}

export const SHEET_BELOW = 600; // уже этой ширины экрана (телефон) пузырь сбоку не встаёт — места нет

/**
 * Телефон, а над целью и под ней пузырю не хватает места (высокий блок): пузырь становится нижней
 * панелью во всю ширину. Иначе он висит посреди экрана и закрывает середину блока.
 */
export function sheetFit(t: Rect, b: Size, vp: Size): boolean {
  return vp.w < SHEET_BELOW && !fits(t, b, vp, 'top') && !fits(t, b, vp, 'bottom');
}

/** Нижняя панель: во всю ширину с отступами, прижата к низу экрана, без стрелки. */
export function sheetPlacement(b: Size, vp: Size): Placement {
  return { side: 'bottom', x: MARGIN, y: Math.max(MARGIN, vp.h - b.h - MARGIN), arrow: -1 };
}
