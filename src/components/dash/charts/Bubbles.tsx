'use client';
// Пузыри вокруг порога: по горизонтали — показатель (доля рекламных расходов, окупаемость),
// площадь пузыря — деньги, цвет — вердикт с подписью в легенде. Порог — одна вертикаль.
import { useState } from 'react';
import { fmt, type Fmt } from '../format';
import { Tip } from './Tip';

export type Verdict = 'good' | 'warn' | 'bad';
export interface Bubble { key: string; label: string; x: number; size: number; verdict: Verdict; note?: string }

const VERDICT: Record<Verdict, string> = { good: 'В плюсе', warn: 'Около нуля', bad: 'В минусе' };
const MAX_R = 26;
const MIN_R = 7;
const LANES = 3;

export function Bubbles({ points, xFormat, sizeFormat, threshold, thresholdLabel, domain, label, onPick }: {
  points: readonly Bubble[]; xFormat: Fmt; sizeFormat: Fmt; threshold: number; thresholdLabel: string; domain: readonly [number, number]; label: string; onPick?: (p: Bubble) => void;
}) {
  const [on, setOn] = useState<string | null>(null);
  const [lo, hi] = domain;
  const maxSize = Math.max(...points.map((p) => p.size), 1);
  const EDGE = 5; // отступ по краям, чтобы крайние пузыри не резались
  const px = (v: number) => EDGE + ((Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * (100 - EDGE * 2);
  const hit = points.find((p) => p.key === on);
  return (
    <div className="ds-bubbles">
      <div className="ds-bubbles-plot" role="img" aria-label={label}>
        <span className="ds-bubbles-th" style={{ left: `${px(threshold)}%` }}><em>{thresholdLabel}</em></span>
        {points.map((p, i) => {
          const r = MIN_R + Math.sqrt(p.size / maxSize) * (MAX_R - MIN_R);
          const handleEnter = () => setOn(p.key);
          return (
            <button key={p.key} type="button" className={`ds-bubble is-${p.verdict}${on && on !== p.key ? ' is-dim' : ''}${onPick ? ' is-link' : ''}`}
              style={{ left: `${px(p.x)}%`, top: `${22 + (i % LANES) * 28}%`, ['--r' as string]: `${r}px`, ['--d' as string]: `${i * 80}ms` }}
              onPointerEnter={handleEnter} onFocus={handleEnter} onPointerLeave={() => setOn(null)} onBlur={() => setOn(null)}
              onClick={onPick ? () => onPick(p) : undefined}
              aria-label={`${p.label}: ${fmt(p.x, xFormat)}, ${fmt(p.size, sizeFormat)}, ${VERDICT[p.verdict]}`}>
              <i />
            </button>
          );
        })}
        {hit && (
          <Tip x={px(hit.x) / 100} title={hit.label}
            rows={[{ label: 'показатель', value: fmt(hit.x, xFormat) }, { label: hit.note ?? 'расход', value: fmt(hit.size, sizeFormat) }]} />
        )}
      </div>
      <div className="ds-bubbles-axis" aria-hidden="true"><span>{fmt(lo, xFormat)}</span><span>{fmt(hi, xFormat)}</span></div>
      <ul className="ds-legend">
        {(Object.keys(VERDICT) as Verdict[]).map((v) => (
          <li key={v}><i className={`dot is-${v}`} />{VERDICT[v]}: {points.filter((p) => p.verdict === v).length}</li>
        ))}
      </ul>
    </div>
  );
}
