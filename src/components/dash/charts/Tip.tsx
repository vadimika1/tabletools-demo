'use client';
// Подсказка графика: значение крупно, подпись второй строкой, серия — короткой чертой её цвета.
// Текст вставляется как текст (React экранирует), никакого innerHTML.

export type Tone = 1 | 2 | 3 | 4 | 5 | 6 | 'muted' | 'good' | 'bad' | 'warn' | 'accent' | 'ink';

export function toneVar(t: Tone): string {
  if (typeof t === 'number') return `var(--ds-s${t})`;
  if (t === 'ink') return 'var(--ds-o5)';
  return `var(--ds-${t})`;
}

export interface TipRow { label: string; value: string; tone?: Tone; shape?: 'line' | 'box' }

/** x — доля ширины контейнера (0…1); у правого края подсказка разворачивается влево. */
export function Tip({ x, top = 8, title, rows }: { x: number; top?: number; title?: string; rows: TipRow[] }) {
  const flip = x > 0.62;
  return (
    <div className={`ds-tip${flip ? ' is-left' : ''}`} style={{ left: `${x * 100}%`, top }} role="status" aria-live="polite">
      {title && <span className="ds-tip-title">{title}</span>}
      {rows.map((r) => (
        <span key={r.label} className="ds-tip-row">
          {r.tone && <i className={r.shape === 'box' ? 'box' : ''} style={{ background: toneVar(r.tone) }} />}
          <b>{r.value}</b>
          <span>{r.label}</span>
        </span>
      ))}
    </div>
  );
}
