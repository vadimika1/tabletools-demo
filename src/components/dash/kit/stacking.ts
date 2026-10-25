'use client';
// Таблица, которая не помещается в свой блок, перестраивается в карточки строк: каждое значение
// с подписью колонки. Никакой обрезки и прокрутки вбок. Естественную ширину таблицы запоминаем,
// пока она в обычном виде, и сравниваем с шириной блока при каждом его изменении.
import { useLayoutEffect, useRef, useState, type RefObject } from 'react';

export function useStacked(wrap: RefObject<HTMLElement | null>, table: RefObject<HTMLTableElement | null>, contentKey: string): boolean {
  const [stacked, setStacked] = useState(false);
  const natural = useRef(0);

  // Новое содержимое — снова обычный вид, чтобы измерить его естественную ширину.
  useLayoutEffect(() => { natural.current = 0; setStacked(false); }, [contentKey]);

  useLayoutEffect(() => {
    const w = wrap.current;
    const t = table.current;
    if (!w || !t || typeof ResizeObserver === 'undefined') return;
    let live = true;
    const decide = () => {
      // Отложенный вызов (fonts.ready) может прийти после смены вида. Поэтому вид берём из DOM,
      // а не из замыкания: ширина карточек за естественную ширину таблицы не сойдёт, и вид
      // не будет переключаться туда-обратно без конца.
      if (!live) return;
      if (!t.classList.contains('is-stacked')) natural.current = t.scrollWidth;
      // Места для таблицы — ширина обёртки без её внутренних отступов.
      const cs = getComputedStyle(w);
      const room = w.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      setStacked(natural.current > room + 1);
    };
    decide();
    const ro = new ResizeObserver(decide);
    ro.observe(w);
    ro.observe(t); // таблица могла вырасти сама — например, догрузился шрифт
    if (document.fonts) void document.fonts.ready.then(decide);
    return () => { live = false; ro.disconnect(); };
  }, [wrap, table, contentKey]);

  return stacked;
}
