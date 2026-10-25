// Шкалы графиков: «круглые» деления (0 / 250 тыс. / 500 тыс.) и линейное отображение.

/** Круглый шаг делений: 1, 2, 2,5 или 5 × 10ⁿ. */
function niceStep(span: number, count: number): number {
  const raw = span / Math.max(1, count);
  const pow = 10 ** Math.floor(Math.log10(raw || 1));
  const n = raw / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * pow;
}

export interface Ticks { min: number; max: number; ticks: number[] }

/**
 * Деления до «круглого» максимума. По умолчанию от нуля (столбцы всегда от нуля);
 * для линии дневной выручки fromZero=false — иначе колебания сжимаются в полоску у верха.
 */
export function niceTicks(lo: number, hi: number, count = 4, fromZero = true): Ticks {
  const min0 = fromZero ? Math.min(0, lo) : lo - (hi - lo) * 0.15;
  const max0 = hi > min0 ? hi : min0 + 1;
  const step = niceStep(max0 - min0, count);
  const min = Math.floor(min0 / step) * step;
  const max = Math.ceil(max0 / step) * step;
  const ticks: number[] = [];
  for (let v = min; v <= max + step / 2; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return { min, max, ticks };
}

export const linear = (d0: number, d1: number, r0: number, r1: number) => (v: number) =>
  d1 === d0 ? (r0 + r1) / 2 : r0 + ((v - d0) / (d1 - d0)) * (r1 - r0);

/** Путь линии по точкам; сглаживание монотонное, без выбросов за значения. */
export function linePath(pts: readonly (readonly [number, number])[]): string {
  if (!pts.length) return '';
  if (pts.length < 3) return pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('');
  let d = `M${pts[0]![0].toFixed(1)},${pts[0]![1].toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1]!;
    const [x1, y1] = pts[i]!;
    const cx = (x0 + x1) / 2;
    d += `C${cx.toFixed(1)},${y0.toFixed(1)} ${cx.toFixed(1)},${y1.toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`;
  }
  return d;
}
