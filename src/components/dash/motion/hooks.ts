'use client';
// Движение дашбордов: числа доезжают от прошлого значения,
// графики рисуются при появлении и повторяют это, если вернуться к ним прокруткой.
// При prefers-reduced-motion всё сразу на месте.
import { useEffect, useRef, useState, type RefObject } from 'react';

export const EASE_OUT = 'cubic-bezier(.22,1,.36,1)';
export const COUNT_MS = 900;

export function prefersReduced(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Число плавно меняется от предыдущего значения к новому (power2.out), а не от нуля. */
export function useCountUp(target: number, ms = COUNT_MS): number {
  const [v, setV] = useState(target);
  const cur = useRef(target);
  useEffect(() => {
    if (prefersReduced() || cur.current === target) { cur.current = target; setV(target); return; }
    const from = cur.current;
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / ms);
      const e = 1 - (1 - k) * (1 - k);
      cur.current = from + (target - from) * e;
      setV(cur.current);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

/**
 * Элемент в зоне видимости: true при появлении, false при уходе — чтобы анимация
 * рисования повторялась, когда к графику возвращаются прокруткой.
 */
export function useInView<T extends Element>(ref: RefObject<T | null>, rootMargin = '0px 0px -12% 0px'): boolean {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReduced() || typeof IntersectionObserver === 'undefined') { setSeen(true); return; }
    // Удалённый из документа узел всегда «не виден» — такие сообщения не должны прятать график.
    const io = new IntersectionObserver(([e]) => { if (e?.target.isConnected) setSeen(e.isIntersecting); }, { rootMargin });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, rootMargin]);
  return seen;
}

/** Ключ, который меняется вместе с данными: перезапускает CSS-анимацию рисования. */
export function dataKey(values: readonly number[]): string {
  let h = values.length;
  for (const v of values) h = (h * 31 + Math.round(v)) | 0;
  return String(h);
}

/** Ширина элемента в пикселях (ResizeObserver): сколько подписей оси поместится без наложений. */
export function useWidth<T extends Element>(ref: RefObject<T | null>, fallback = 800): number {
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => { if (e) setW(e.contentRect.width); });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

/** Шаг подписей оси: подпись занимает ~72 px вместе с воздухом. */
export const LABEL_PX = 72;
export const labelStep = (count: number, width: number) => Math.max(1, Math.ceil(count / Math.max(2, Math.floor(width / LABEL_PX))));
