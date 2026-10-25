'use client';
// Раздел демо: заголовок, системы-источники отрасли и блоки — из готового набора или из «Собери себе».
import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { SECTIONS, bySection, preset, type SectionKey } from '@/lib/demo-app/blocks/registry';
import { useDemo } from './state';
import { BlockGrid } from './blocks';

/** Смена отрасли, периода или точки: прошлый кадр проявляется в новый из лёгкого размытия. */
function useSwap(dep: string) {
  const ref = useRef<HTMLDivElement>(null);
  const first = useRef(true);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (first.current) { first.current = false; return; }
    el.classList.remove('ds-swap');
    void el.offsetWidth; // перезапуск CSS-анимации
    el.classList.add('ds-swap');
  }, [dep]);
  return ref;
}

export function SectionView({ section }: { section: SectionKey }) {
  const { ds, niche, blocks, period, loc, compare, query } = useDemo();
  const swap = useSwap(`${niche}|${period}|${loc}|${compare}`);
  const s = SECTIONS[section];
  const ids = blocks.length ? bySection(blocks)[section] : preset(niche)[section];

  return (
    <>
      <div className="dm-head">
        <div>
          <h1>{s.title}</h1>
          <p>{s.hint}</p>
        </div>
        {ds && (
          <div className="dm-systems" aria-label="Откуда данные в этом примере">
            Данные из:
            {ds.profile.sources.slice(0, 5).map((x) => <span key={x}>{x}</span>)}
          </div>
        )}
      </div>
      <div ref={swap}>
        {ds && ids.length === 0 && (
          <div className="dm-empty-section">
            <b>В вашей сборке нет блоков этого раздела</b>
            <p>Добавьте их в конструкторе или посмотрите другие разделы.</p>
            <Link href={`/sobrat/${query}`} className="btn btn-ink">Вернуться в конструктор</Link>
          </div>
        )}
        {ds && ids.length > 0 && (
          <BlockGrid ids={ids} className="dm-settle" />
        )}
        {!ds && (
          <p className="dm-loading" aria-live="polite">Собираем данные…</p>
        )}
      </div>
    </>
  );
}
