'use client';
// Тепловая карта день × час: одна шкала чернил, светлее — пусто, темнее — занято.
// Прайм-часы обведены золотом: пустой прайм — это деньги, которые можно продать.
import { useState } from 'react';
import { fmt } from '../format';
import { Tip } from './Tip';

export function Heatmap({ rows, cols, values, prime, label }: {
  rows: readonly string[]; cols: readonly number[]; values: readonly (readonly number[])[]; prime?: (row: number, col: number) => boolean; label: string;
}) {
  const [at, setAt] = useState<[number, number] | null>(null);
  const cell = at ? values[at[0]]?.[at[1]] : undefined;
  // Цвет растянут на реальный диапазон, а легенда подписывает настоящие края —
  // иначе загрузка 30–70% сливается в один тон и пустые часы не видны.
  const flat = values.flat();
  const lo = Math.min(...flat);
  const hi = Math.max(...flat);
  const norm = (v: number) => (hi > lo ? 0.08 + ((v - lo) / (hi - lo)) * 0.92 : 0.5);
  return (
    <div className="ds-heat">
      <div className="ds-heat-grid" role="grid" aria-label={label} style={{ gridTemplateColumns: `auto repeat(${cols.length}, minmax(0, 1fr))` }}>
        <span />
        {cols.map((c, k) => <span key={c} className="ds-heat-h" aria-hidden="true">{k % 2 === 0 ? c : ''}</span>)}
        {rows.map((r, i) => (
          <div key={r} role="row" style={{ display: 'contents' }}>
            <span className="ds-heat-r" role="rowheader">{r}</span>
            {cols.map((c, k) => {
              const v = values[i]?.[k] ?? 0;
              const handleEnter = () => setAt([i, k]);
              return (
                <span
                  key={c}
                  role="gridcell"
                  className={`ds-heat-c${prime?.(i, c) ? ' is-prime' : ''}`}
                  style={{ ['--v' as string]: norm(v), ['--d' as string]: `${(i + k) * 12}ms` }}
                  aria-label={`${r}, ${c}:00 — занято ${fmt(v, 'pct')}`}
                  onPointerEnter={handleEnter}
                  onPointerLeave={() => setAt(null)}
                />
              );
            })}
          </div>
        ))}
        {at && cell !== undefined && (
          <Tip x={(at[1] + 1.5) / (cols.length + 1)} top={24 + at[0] * 30}
            title={`${rows[at[0]]}, ${cols[at[1]]}:00–${(cols[at[1]] ?? 0) + 1}:00`}
            rows={[{ label: prime?.(at[0], cols[at[1]]!) ? 'занято, прайм-время' : 'занято', value: fmt(cell, 'pct') }]} />
        )}
      </div>
      <div className="ds-heat-scale" aria-hidden="true">
        <span>занято {fmt(lo, 'pct')}</span><i /><span>{fmt(hi, 'pct')}</span>
        {prime && <span className="ds-heat-key"><em />прайм-время</span>}
      </div>
    </div>
  );
}
