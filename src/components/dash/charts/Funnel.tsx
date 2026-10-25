'use client';
// Воронка: ступени сужаются по центру, между ними — сколько дошло и сколько потеряли.
// Ступени окрашены порядковой шкалой чернил (светлее → темнее к оплате).
import { Fragment, useRef } from 'react';
import { fmt, type Fmt } from '../format';
import { dataKey, useInView } from '../motion/hooks';

export interface Step { key: string; label: string; value: number }

const ORDINAL = ['--ds-o1', '--ds-o2', '--ds-o3', '--ds-o4', '--ds-o5'];

export function Funnel({ steps, format = 'int', lostLabel = 'потеряли' }: { steps: readonly Step[]; format?: Fmt; lostLabel?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const seen = useInView(box);
  const top = steps[0]?.value || 1;
  const key = dataKey(steps.map((s) => s.value));
  return (
    // key — на внутренней обёртке: корень, за которым следит useInView, не должен пересоздаваться,
    // иначе наблюдатель остаётся на удалённом узле и новая воронка так и не появится.
    <div className={`ds-funnel${seen ? ' is-seen' : ''}`} ref={box}>
      <div className="ds-funnel-in" key={key}>
      {steps.map((s, i) => {
        const prev = steps[i - 1];
        const color = `var(${ORDINAL[Math.round((i / Math.max(1, steps.length - 1)) * (ORDINAL.length - 1))]})`;
        return (
          <Fragment key={s.key}>
            {prev && (
              <div className="ds-funnel-gap">
                <span>дошли <b>{fmt(prev.value ? s.value / prev.value : 0, 'pct')}</b></span>
                <span>{lostLabel} {fmt(prev.value - s.value, format)}</span>
              </div>
            )}
            <div className="ds-funnel-step">
              <span className="ds-funnel-label">{s.label}</span>
              <span className="ds-funnel-track">
                <i style={{ ['--w' as string]: s.value / top, background: color, ['--d' as string]: `${i * 90}ms` }} />
              </span>
              <span className="ds-funnel-val"><b>{fmt(s.value, format)}</b><em>{fmt(s.value / top, 'pct')}</em></span>
            </div>
          </Fragment>
        );
      })}
      </div>
    </div>
  );
}
