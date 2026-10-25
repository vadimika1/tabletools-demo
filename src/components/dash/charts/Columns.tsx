'use client';
// Столбцы по времени или категориям: от нуля, не толще 24 px, скруглённый верх, зазор между столбцами.
// Незавершённый период заштрихован. У каждого столбца своя подсказка; Tab проходит по столбцам.
import { useRef, useState } from 'react';
import { axis, fmt, type Fmt } from '../format';
import { dataKey, labelStep, useInView, useWidth } from '../motion/hooks';
import { linear, niceTicks } from './scale';
import { Tip, toneVar, type Tone } from './Tip';

export interface Column { key: string; label: string; value: number; tone?: Tone; partial?: boolean; note?: string }

export function Columns({ columns, format, height = 200, tone = 1, label, onPick }: {
  columns: readonly Column[]; format: Fmt; height?: number; tone?: Tone; label: string; onPick?: (c: Column) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const seen = useInView(box);
  const width = useWidth(box);
  const [at, setAt] = useState<number | null>(null);
  const values = columns.map((c) => c.value);
  const { min, max, ticks } = niceTicks(Math.min(0, ...values), Math.max(...values), 4);
  const y = linear(min, max, 0, 100);
  const key = dataKey(values);
  const n = columns.length;
  const labelEvery = labelStep(n, width - 62);

  return (
    <div className={`ds-cols${seen ? ' is-seen' : ''}`} ref={box} role="group" aria-label={label}>
      <div className="ds-plot" style={{ height }}>
        <div className="ds-yaxis" aria-hidden="true">
          {ticks.map((t) => <span key={t} style={{ top: `${100 - y(t)}%` }}>{format === 'pct' ? fmt(t, 'pct') : axis(t)}</span>)}
        </div>
        <div className="ds-plot-area">
          {ticks.map((t) => <span key={t} className="ds-gridrow" style={{ top: `${100 - y(t)}%` }} />)}
          <div className="ds-cols-row" key={key}>
            {columns.map((c, i) => {
              const h = Math.max(0, y(c.value) - y(0));
              const handleEnter = () => setAt(i);
              return (
                <button
                  key={c.key}
                  type="button"
                  className={`ds-col${c.partial ? ' is-partial' : ''}${at === i ? ' is-on' : ''}`}
                  style={{ ['--h' as string]: `${h}%`, ['--d' as string]: `${Math.min(i, 24) * 22}ms`, ['--c' as string]: toneVar(c.tone ?? tone) }}
                  onPointerEnter={handleEnter}
                  onPointerLeave={() => setAt(null)}
                  onFocus={handleEnter}
                  onBlur={() => setAt(null)}
                  onClick={onPick ? () => onPick(c) : undefined}
                  aria-label={`${c.label}: ${fmt(c.value, format)}${c.partial ? ', период ещё идёт' : ''}`}
                  tabIndex={onPick ? 0 : -1}
                >
                  <i />
                </button>
              );
            })}
          </div>
          {at !== null && columns[at] && (
            <Tip x={(at + 0.5) / n} title={columns[at]!.label}
              rows={[{ label: columns[at]!.note ?? (columns[at]!.partial ? 'период ещё идёт' : ''), value: fmt(columns[at]!.value, format) }]} />
          )}
        </div>
      </div>
      <div className="ds-cols-labels" aria-hidden="true">
        {columns.map((c, i) => <span key={c.key}>{i % labelEvery === 0 || i === n - 1 ? c.label : ''}</span>)}
      </div>
    </div>
  );
}
