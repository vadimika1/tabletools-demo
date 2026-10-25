'use client';
// Рейтинг полосами: подпись, полоса от нуля, значение у конца. Строка может открывать детализацию.
import { useState, type ReactNode } from 'react';
import { fmt, type Fmt } from '../format';
import { toneVar, type Tone } from './Tip';

export interface BarRow { key: string; label: ReactNode; value: number; display?: string; note?: ReactNode; tone?: Tone; onClick?: () => void }

const TAIL = 2; // в свёрнутом рейтинге последние строки видны всегда — там обычно отстающий

/**
 * limit: длинный рейтинг показывает лидеров и двух последних, между ними — «Показать всех N».
 * Полный список всегда есть в табличном двойнике блока.
 */
export function BarList({ rows, format, tone = 1, max, limit }: { rows: readonly BarRow[]; format: Fmt; tone?: Tone; max?: number; limit?: number }) {
  const [all, setAll] = useState(false);
  const m = max ?? Math.max(...rows.map((r) => Math.abs(r.value)), 0);
  const folded = !all && limit !== undefined && rows.length > limit;
  const head = folded ? rows.slice(0, limit - TAIL) : rows;
  const tail = folded ? rows.slice(rows.length - TAIL) : [];
  const hidden = rows.length - head.length - tail.length;
  const render = (list: readonly BarRow[], offset: number) => list.map((r, j) => {
    const i = j + offset;
    const inner = (
      <>
        <span className="ds-bl-label">{r.label}{r.note && <small>{r.note}</small>}</span>
        <span className="ds-bl-track">
          <i style={{ ['--w' as string]: m ? Math.abs(r.value) / m : 0, ['--d' as string]: `${Math.min(i, 12) * 45}ms`, background: toneVar(r.tone ?? tone) }} />
        </span>
        <b>{r.display ?? fmt(r.value, format)}</b>
      </>
    );
    return (
      <li key={r.key}>
        {r.onClick ? <button type="button" className="ds-bl-row is-link" onClick={r.onClick}>{inner}</button> : <div className="ds-bl-row">{inner}</div>}
      </li>
    );
  });
  return (
    <ul className="ds-barlist">
      {render(head, 0)}
      {folded && (
        <li className="ds-bl-more"><button type="button" onClick={() => setAll(true)}>Показать всех: ещё {hidden}</button></li>
      )}
      {render(tail, rows.length - TAIL)}
      {all && limit !== undefined && rows.length > limit && (
        <li className="ds-bl-more"><button type="button" onClick={() => setAll(false)}>Свернуть</button></li>
      )}
    </ul>
  );
}
