'use client';
// Каскад «как сложилась прибыль»: выручка, затем каждая статья откусывает свою часть, внизу — прибыль.
// Горизонтальный, как в P&L: подписи слева, суммы справа, полосы висят на уровне остатка.
import { useRef } from 'react';
import { fmt, type Fmt } from '../format';
import { dataKey, useInView } from '../motion/hooks';

export interface WfStep { key: string; label: string; value: number; kind: 'total' | 'cost' | 'result' }

export function Waterfall({ steps, format = 'rub', onPick }: { steps: readonly WfStep[]; format?: Fmt; onPick?: (s: WfStep) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const seen = useInView(box);
  const top = Math.max(...steps.map((s) => Math.abs(s.value)), 1);
  let level = 0;
  const rows = steps.map((s) => {
    let from = 0;
    let to = s.value;
    if (s.kind === 'total') level = s.value;
    if (s.kind === 'cost') { from = level - s.value; to = level; level = from; }
    if (s.kind === 'result') { from = Math.min(0, s.value); to = Math.max(0, s.value); }
    return { ...s, from, to };
  });
  return (
    <div className={`ds-wf${seen ? ' is-seen' : ''}`} ref={box}>
      <div className="ds-wf-in" key={dataKey(steps.map((s) => s.value))}>
      {rows.map((r, i) => {
        const inner = (
          <>
            <span className="ds-wf-label">{r.label}</span>
            <span className="ds-wf-track">
              <i className={r.kind} style={{ left: `${(Math.max(0, r.from) / top) * 100}%`, width: `${(Math.abs(r.to - r.from) / top) * 100}%`, ['--d' as string]: `${i * 70}ms` }} />
            </span>
            <b className={r.kind === 'result' && r.value < 0 ? 'is-neg' : ''}>{r.kind === 'cost' ? '−' : ''}{fmt(Math.abs(r.value), format)}</b>
            <em>{steps[0]?.value ? fmt(Math.abs(r.value) / steps[0].value, 'pct') : ''}</em>
          </>
        );
        return onPick && r.kind === 'cost'
          ? <button key={r.key} type="button" className={`ds-wf-row is-${r.kind} is-link`} onClick={() => onPick(r)}>{inner}</button>
          : <div key={r.key} className={`ds-wf-row is-${r.kind}`}>{inner}</div>;
      })}
      </div>
    </div>
  );
}
