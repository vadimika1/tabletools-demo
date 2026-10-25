'use client';
// Пончик для «целого из частей» на глаз: до шести долей, в центре — итог или наведённая доля.
import { useState } from 'react';
import { fmt, type Fmt } from '../format';
import { toneVar, type Tone } from './Tip';

export interface Slice { key: string; label: string; value: number; tone: Tone }

const R = 42;
const C = 2 * Math.PI * R;
const GAP = 1.4; // зазор между долями, в единицах окружности (≈2px на 180px)
const MAX_SLICES = 6;

export function Donut({ slices, format, total: totalLabel }: { slices: readonly Slice[]; format: Fmt; total: string }) {
  const [on, setOn] = useState<string | null>(null);
  const list = slices.slice(0, MAX_SLICES);
  const total = list.reduce((s, x) => s + x.value, 0) || 1;
  let acc = 0;
  const arcs = list.map((s, i) => {
    const len = (s.value / total) * C;
    const arc = { ...s, dash: Math.max(0, len - GAP), offset: -acc, i };
    acc += len;
    return arc;
  });
  const hit = list.find((s) => s.key === on);
  return (
    <div className="ds-donut">
      <div className="ds-donut-ring">
        <svg viewBox="0 0 100 100" role="img" aria-label={list.map((s) => `${s.label} ${fmt(s.value / total, 'pct')}`).join(', ')}>
          {arcs.map((a) => (
            <circle key={a.key} cx="50" cy="50" r={R} className={on && on !== a.key ? 'is-dim' : ''}
              style={{ stroke: toneVar(a.tone), strokeDasharray: `${a.dash} ${C}`, strokeDashoffset: a.offset, ['--d' as string]: `${a.i * 70}ms` }}
              onPointerEnter={() => setOn(a.key)} onPointerLeave={() => setOn(null)} />
          ))}
        </svg>
        <div className="ds-donut-center">
          <span>{hit ? hit.label : totalLabel}</span>
          <b>{fmt(hit ? hit.value : total, format)}</b>
          {hit && <em>{fmt(hit.value / total, 'pct')}</em>}
        </div>
      </div>
      <ul className="ds-legend is-rows">
        {list.map((s) => (
          <li key={s.key} className={on === s.key ? 'is-on' : ''} onPointerEnter={() => setOn(s.key)} onPointerLeave={() => setOn(null)}>
            <i className="box" style={{ background: toneVar(s.tone) }} />
            <span>{s.label}</span>
            <em>{fmt(s.value / total, 'pct')}</em>
          </li>
        ))}
      </ul>
    </div>
  );
}
