'use client';
// Спарклайн в плитке: тихая линия ряда, последняя точка — акцентом.
import { linePath } from './scale';

const W = 120;
const H = 28;

export function Spark({ values }: { values: readonly number[] }) {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pts = values.map((v, i) => [(i / (values.length - 1)) * W, H - 3 - ((v - lo) / (hi - lo || 1)) * (H - 6)] as const);
  const last = pts[pts.length - 1]!;
  return (
    <svg className="ds-spark" viewBox={`-3 0 ${W + 6} ${H}`} aria-hidden="true">
      <path d={linePath(pts)} />
      <circle cx={last[0]} cy={last[1]} r="3" />
    </svg>
  );
}
