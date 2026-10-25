'use client';
// Линия во времени: главный ряд с лёгкой заливкой, остальные ряды тоньше. Перекрестие находит дату,
// подсказка показывает все ряды сразу. Стрелки клавиатуры двигают перекрестие.
import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { axis, fmt, type Fmt } from '../format';
import { dataKey, labelStep, useInView, useWidth } from '../motion/hooks';
import { linePath, linear, niceTicks } from './scale';
import { Tip, toneVar, type Tone } from './Tip';

export interface TrendSeries { key: string; label: string; values: readonly number[]; tone: Tone; thin?: boolean }

export interface TrendProps {
  labels: readonly string[];
  series: readonly TrendSeries[];
  format: Fmt;
  height?: number;
  shade?: readonly boolean[]; // затенённые колонки (выходные)
  partialLast?: boolean; // последняя точка — неполный день
  fromZero?: boolean;
  label: string; // для экранных читалок
}

const W = 1000;
const PAD_T = 12;

export function Trend({ labels, series, format, height = 240, shade, partialLast, fromZero = false, label }: TrendProps) {
  const box = useRef<HTMLDivElement>(null);
  const seen = useInView(box);
  const width = useWidth(box);
  const [at, setAt] = useState<number | null>(null);
  const n = labels.length;
  const all = series.flatMap((s) => s.values);
  const { min, max, ticks } = niceTicks(Math.min(...all), Math.max(...all), 4, fromZero);
  const H = height;
  const x = (i: number) => (n > 1 ? (i / (n - 1)) * W : W / 2);
  const y = linear(min, max, H, PAD_T);
  const key = dataKey(series[0]?.values ?? []);

  const handlePointer = (e: PointerEvent) => {
    const r = box.current!.getBoundingClientRect();
    setAt(Math.max(0, Math.min(n - 1, Math.round(((e.clientX - r.left) / r.width) * (n - 1)))));
  };
  const handleKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') setAt((v) => Math.min(n - 1, (v ?? -1) + 1));
    else if (e.key === 'ArrowLeft') setAt((v) => Math.max(0, (v ?? n) - 1));
    else if (e.key === 'Escape') setAt(null);
    else return;
    e.preventDefault();
  };
  const step = labelStep(n, width);
  // Последняя подпись всегда видна; ближайшую к ней обычную убираем, чтобы не налезали.
  const xTicks = labels.map((l, i) => [i, l] as const).filter(([i]) => i === n - 1 || (i % step === 0 && n - 1 - i >= step));
  const main = series[0];

  return (
    <div className={`ds-trend${seen ? ' is-seen' : ''}`}>
      <div className="ds-plot" style={{ height: H }}>
        <div className="ds-yaxis" aria-hidden="true">
          {ticks.map((t) => <span key={t} style={{ top: y(t) }}>{axis(t)}</span>)}
        </div>
        <div
          ref={box}
          className="ds-plot-area"
          tabIndex={0}
          role="group"
          aria-roledescription="график"
          aria-label={`${label}. Стрелки влево и вправо показывают значения по точкам графика`}
          onPointerMove={handlePointer}
          onPointerLeave={() => setAt(null)}
          onFocus={() => setAt((v) => v ?? n - 1)}
          onBlur={() => setAt(null)}
          onKeyDown={handleKey}
        >
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
            {shade?.map((s, i) => {
              if (!s) return null;
              const half = W / (n - 1 || 1) / 2;
              const x0 = Math.max(0, x(i) - half);
              return <rect key={i} className="ds-shade" x={x0} width={Math.min(W, x(i) + half) - x0} y={0} height={H} />;
            })}
            {ticks.map((t) => <line key={t} className="ds-gridline" x1={0} x2={W} y1={y(t)} y2={y(t)} />)}
            {main && (
              <path key={`a${key}`} className="ds-area" style={{ fill: toneVar(main.tone) }}
                d={`${linePath(main.values.map((v, i) => [x(i), y(v)] as const))}L${W},${H}L0,${H}Z`} />
            )}
            {[...series].reverse().map((s) => (
              <path key={`${s.key}${key}`} className={`ds-line${s.thin ? ' thin' : ''}`} pathLength={1}
                style={{ stroke: toneVar(s.tone) }} d={linePath(s.values.map((v, i) => [x(i), y(v)] as const))} />
            ))}
            {partialLast && n > 1 && <rect className="ds-partial" x={x(n - 2) + (x(n - 1) - x(n - 2)) / 2} width={(x(n - 1) - x(n - 2)) / 2} y={0} height={H} />}
          </svg>
          {at !== null && (
            <>
              <span className="ds-cross" style={{ left: `${(x(at) / W) * 100}%` }} />
              {series.map((s) => (
                <span key={s.key} className="ds-dot" style={{ left: `${(x(at) / W) * 100}%`, top: y(s.values[at] ?? 0), background: toneVar(s.tone) }} />
              ))}
              <Tip x={x(at) / W} title={`${labels[at]}${partialLast && at === n - 1 ? ', день ещё идёт' : ''}`}
                rows={series.map((s) => ({ label: s.label, value: fmt(s.values[at] ?? 0, format), tone: s.tone }))} />
            </>
          )}
        </div>
      </div>
      <div className="ds-xaxis" aria-hidden="true">
        {xTicks.map(([i, l]) => <span key={i} style={{ left: `${(x(i) / W) * 100}%` }}>{l}</span>)}
      </div>
      {series.length > 1 && (
        <div className="ds-legend">
          {series.map((s) => <span key={s.key}><i className="line" style={{ background: toneVar(s.tone) }} />{s.label}</span>)}
        </div>
      )}
    </div>
  );
}
