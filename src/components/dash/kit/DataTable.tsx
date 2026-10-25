'use client';
// Таблица блока. Она же — табличный двойник графика: каждое значение доступно без наведения.
import { useRef, type ReactNode } from 'react';
import { useStacked } from './stacking';
import { fmt, type Fmt } from '../format';

export interface Column<R> {
  key: string;
  label: string;
  format?: Fmt;
  value: (row: R) => number | string | ReactNode;
  num?: boolean;
}

export interface TableSpec<R = Record<string, unknown>> {
  columns: Column<R>[];
  rows: R[];
  rowKey: (row: R) => string;
  onRow?: (row: R) => void;
  footer?: R;
  caption?: string;
}

function cell<R>(c: Column<R>, row: R): ReactNode {
  const v = c.value(row);
  if (typeof v === 'number') return c.format ? fmt(v, c.format) : v.toLocaleString('ru-RU');
  return v;
}

export function DataTable<R>({ columns, rows, rowKey, onRow, footer, caption }: TableSpec<R>) {
  const wrap = useRef<HTMLDivElement>(null);
  const table = useRef<HTMLTableElement>(null);
  const stacked = useStacked(wrap, table, `${columns.map((c) => c.key).join(',')}|${rows.map(rowKey).join(',')}`);
  return (
    <div className="ds-table-wrap" ref={wrap}>
      <table className={`ds-table${stacked ? ' is-stacked' : ''}`} ref={table}>
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr>{columns.map((c) => <th key={c.key} scope="col" className={c.num || c.format ? 'num' : ''}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={rowKey(r)}
              className={onRow ? 'is-link' : undefined}
              onClick={onRow ? () => onRow(r) : undefined}
              onKeyDown={onRow ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onRow(r); } } : undefined}
              tabIndex={onRow ? 0 : undefined}
            >
              {columns.map((c) => <td key={c.key} data-label={c.label} className={c.num || c.format ? 'num' : ''}>{cell(c, r)}</td>)}
            </tr>
          ))}
        </tbody>
        {footer && (
          <tfoot>
            <tr>{columns.map((c) => <td key={c.key} data-label={c.label} className={c.num || c.format ? 'num' : ''}>{cell(c, footer)}</td>)}</tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
