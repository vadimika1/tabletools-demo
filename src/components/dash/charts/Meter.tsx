'use client';
// Шкала «значение против цели»: дорожка — светлая ступень того же цвета, отметка — цель.
import { fmt, type Fmt } from '../format';

export function Meter({ value, max, target, format, targetLabel = 'цель', tone = 'good' }: {
  value: number; max: number; target?: number; format: Fmt; targetLabel?: string; tone?: 'good' | 'warn' | 'bad';
}) {
  const w = Math.min(1, Math.max(0, value / (max || 1)));
  return (
    <div className={`ds-meter is-${tone}`} role="meter" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} aria-valuetext={fmt(value, format)}>
      <span className="ds-meter-track"><i style={{ ['--w' as string]: w }} /></span>
      {target !== undefined && (
        <span className="ds-meter-target" style={{ left: `${Math.min(100, (target / (max || 1)) * 100)}%` }} title={`${targetLabel}: ${fmt(target, format)}`} />
      )}
    </div>
  );
}
