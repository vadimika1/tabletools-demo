// Случайность с семенем и деление целых без потерь: одинаковые данные при каждом запуске,
// а части всегда складываются в целое до единицы.

/** mulberry32: быстрый генератор с семенем, 0 ≤ x < 1. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Семя из строки (FNV-1a): у каждой отрасли и точки свой ряд, не зависящий от порядка в списке. */
export function seedOf(...parts: (string | number)[]): number {
  let h = 0x811c9dc5;
  for (const ch of parts.join('|')) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Вероятностное округление: 8,64 → 9 с вероятностью 64%, иначе 8. На малых дневных числах
 * обычное округление систематически съедает «неполные» неявки и пропущенные звонки.
 */
export const sround = (r: () => number, x: number) => {
  const f = Math.floor(x);
  return f + (r() < x - f ? 1 : 0);
};

/** Множитель шума вокруг единицы: 1 ± spread. */
export const jitter = (r: () => number, spread: number) => 1 - spread + r() * spread * 2;

/**
 * Делит целое `total` пропорционально весам методом наибольшего остатка:
 * сумма частей равна `total` ровно, ни рубль, ни запись не теряются.
 */
export function splitInt(total: number, weights: readonly number[]): number[] {
  const sum = weights.reduce((s, w) => s + w, 0);
  if (!sum || !total) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / sum);
  const out = raw.map(Math.floor);
  let rest = total - out.reduce((s, v) => s + v, 0);
  const order = raw.map((v, k) => [v - Math.floor(v), k] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (let n = 0; rest > 0; n = (n + 1) % order.length, rest--) out[order[n]![1]]! += 1;
  return out;
}
