'use client';
// Обёртка для таблиц, собранных вручную (не через DataTable): подписывает ячейки заголовками
// колонок и включает вид карточек, когда таблица не помещается. Содержимое меняется (раскрыли
// строку) — перемеряем.
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useStacked } from './stacking';

export function StackWrap({ children }: { children: ReactNode }) {
  const wrap = useRef<HTMLDivElement>(null);
  const table = useRef<HTMLTableElement | null>(null);
  const [version, setVersion] = useState(0);

  useLayoutEffect(() => {
    const w = wrap.current;
    if (!w) return;
    const label = () => {
      const t = w.querySelector('table');
      table.current = t;
      if (!t) return;
      const heads = [...t.querySelectorAll('thead th')].map((th) => th.textContent ?? '');
      for (const tr of t.querySelectorAll('tbody tr, tfoot tr')) {
        [...tr.children].forEach((td, i) => { if (heads[i] !== undefined) td.setAttribute('data-label', heads[i]!); });
      }
    };
    label();
    const mo = new MutationObserver(() => { label(); setVersion((v) => v + 1); });
    mo.observe(w, { childList: true, subtree: true, characterData: true });
    return () => mo.disconnect();
  }, []);

  const stacked = useStacked(wrap, table, String(version));
  useLayoutEffect(() => { table.current?.classList.toggle('is-stacked', stacked); }, [stacked]);
  return <div className="ds-table-wrap" ref={wrap}>{children}</div>;
}
