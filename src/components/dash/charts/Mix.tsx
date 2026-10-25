'use client';
// Доли целого одной полосой (откуда пришли, чем платят, какие вердикты). Сегменты разделены
// зазором цвета поверхности; легенда с долей и значением всегда под полосой — цвет не единственный ключ.
import { useState } from 'react';
import { fmt, type Fmt } from '../format';
import { toneVar, type Tone } from './Tip';

export interface MixPart { key: string; label: string; value: number; tone: Tone }

export function Mix({ parts, format, label }: { parts: readonly MixPart[]; format: Fmt; label: string }) {
  const [on, setOn] = useState<string | null>(null);
  const total = parts.reduce((s, p) => s + Math.max(0, p.value), 0) || 1;
  return (
    <div className="ds-mix">
      <div className="ds-mix-bar" role="img" aria-label={`${label}: ${parts.map((p) => `${p.label} ${fmt(p.value / total, 'pct')}`).join(', ')}`}>
        {parts.filter((p) => p.value > 0).map((p, i) => (
          <i key={p.key} className={on && on !== p.key ? 'is-dim' : ''}
            style={{ flexGrow: p.value, background: toneVar(p.tone), ['--d' as string]: `${i * 60}ms` }}
            onPointerEnter={() => setOn(p.key)} onPointerLeave={() => setOn(null)} />
        ))}
      </div>
      <ul className="ds-legend is-rows">
        {parts.map((p) => (
          <li key={p.key} className={on === p.key ? 'is-on' : ''} onPointerEnter={() => setOn(p.key)} onPointerLeave={() => setOn(null)}>
            <i className="box" style={{ background: toneVar(p.tone) }} />
            <span>{p.label}</span>
            <b>{fmt(p.value, format)}</b>
            <em>{fmt(p.value / total, 'pct')}</em>
          </li>
        ))}
      </ul>
    </div>
  );
}
