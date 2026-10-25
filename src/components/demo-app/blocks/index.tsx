'use client';
// Виды блоков по id из реестра. Размер и тексты по умолчанию берутся из реестра,
// поэтому блок в разметке раздела — это просто <BlockView id="p2" />.
import { memo, useEffect, useLayoutEffect, useRef, useState, type ComponentType } from 'react';
import { useDemo } from '../state';
import { Block } from '@/components/dash/kit/Block';
import { BLOCK_BY_ID, packRows } from '@/lib/demo-app/blocks/registry';
import { OVERVIEW_VIEWS } from './overview';
import { OVERVIEW_MORE_VIEWS } from './overview-more';
import { INSIGHTS_VIEWS } from './insights';
import { MARKETING_VIEWS } from './marketing';
import { ATTRIBUTION_VIEWS } from './attribution';
import { OPS_VIEWS } from './ops';
import { OPS_INDUSTRY_VIEWS } from './ops-industry';
import { FINANCE_VIEWS } from './finance';
import { CLIENTS_VIEWS } from './clients';
import { CRM_VIEWS } from './crm';

export interface BlockViewProps { id: string; className: string }

// Каждый раздел — свой файл с видами его блоков; здесь они только собираются в один словарь.
const VIEWS: Record<string, ComponentType<BlockViewProps>> = { ...OVERVIEW_VIEWS, ...OVERVIEW_MORE_VIEWS, ...FINANCE_VIEWS, ...CLIENTS_VIEWS, ...CRM_VIEWS, ...INSIGHTS_VIEWS, ...MARKETING_VIEWS, ...ATTRIBUTION_VIEWS, ...OPS_VIEWS, ...OPS_INDUSTRY_VIEWS };

function Pending({ id, className }: BlockViewProps) {
  const def = BLOCK_BY_ID.get(id)!;
  return (
    <Block title={def.title} question={def.question} className={className} custom={def.custom}>
      <p className="ds-question">Блок в работе.</p>
    </Block>
  );
}

/**
 * span — ширина из упаковки рядов (packRows); без неё — размер из реестра.
 * memo: блок перерисовывается только при смене своих данных (контекст демо) или id/span,
 * а не при каждом нажатии клавиши в поиске конструктора.
 */
export const BlockView = memo(function BlockView({ id, span }: { id: string; span?: number }) {
  const def = BLOCK_BY_ID.get(id);
  if (!def) return null;
  const size = span ? `w-${span}` : def.size;
  const View = VIEWS[id] ?? Pending;
  // Обёртка — ячейка сетки с размером из реестра; по data-block блок находят тур и конструктор.
  return <div data-block={id} className={`ds-cell ${size}`}><View id={id} className="" /></div>;
});

// Пара блоков в ряду растягивает короткий до высоты длинного — внутри остаётся пустота.
// Если разница заметная, оба блока встают во всю ширину друг под другом.
const HEIGHT_RATIO = 1.15;
const HEIGHT_GAP = 120;
const WIDE_FROM = 720; // уже этой ширины блоки и так идут по одному в ряд (см. @container в dash.css)

/** Высота содержимого листа без растяжения: поля + дети + зазоры между ними. */
function naturalHeight(sheet: HTMLElement): number {
  const cs = getComputedStyle(sheet);
  const kids = [...sheet.children] as HTMLElement[];
  const gap = parseFloat(cs.rowGap) || 0;
  return parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) + kids.reduce((s, k) => s + k.offsetHeight, 0) + gap * Math.max(0, kids.length - 1);
}

/** Сетка блоков с упаковкой рядов: без пустых мест справа и без пустот внутри блоков. */
export function BlockGrid({ ids, className = '' }: { ids: readonly string[]; className?: string }) {
  const { ds, niche, period, loc, compare, model } = useDemo();
  const box = useRef<HTMLDivElement>(null);
  const [wide, setWide] = useState<ReadonlySet<string>>(new Set());
  const resetKey = `${ids.join(',')}|${niche}|${period}|${loc}|${compare}|${model}|${ds ? 1 : 0}`;
  useEffect(() => { setWide(new Set()); }, [resetKey]);

  useLayoutEffect(() => {
    const grid = box.current;
    if (!grid || typeof ResizeObserver === 'undefined') return;
    let raf = 0;
    const check = () => {
      if (grid.clientWidth < WIDE_FROM) return;
      const rows = new Map<number, { id: string; h: number }[]>();
      for (const cell of grid.children as HTMLCollectionOf<HTMLElement>) {
        const id = cell.dataset.block;
        const sheet = cell.firstElementChild as HTMLElement | null;
        if (!id || !sheet?.classList.contains('ds-sheet')) continue;
        const row = rows.get(cell.offsetTop) ?? [];
        row.push({ id, h: naturalHeight(sheet) });
        rows.set(cell.offsetTop, row);
      }
      const add: string[] = [];
      for (const row of rows.values()) {
        if (row.length < 2) continue;
        const hs = row.map((r) => r.h);
        const hi = Math.max(...hs);
        const lo = Math.min(...hs);
        if (hi / lo > HEIGHT_RATIO && hi - lo > HEIGHT_GAP) add.push(...row.map((r) => r.id));
      }
      if (add.length) setWide((w) => (add.every((id) => w.has(id)) ? w : new Set([...w, ...add])));
    };
    const schedule = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(check); };
    const ro = new ResizeObserver(schedule);
    ro.observe(grid);
    schedule();
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [resetKey, wide]);

  const spans = packRows(ids, wide);
  return <div ref={box} className={`ds-grid ${className}`}>{ids.map((id, i) => <BlockView key={id} id={id} span={spans[i]} />)}</div>;
}
