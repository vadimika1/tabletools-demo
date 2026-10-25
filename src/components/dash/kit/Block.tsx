'use client';
// Лист-блок и остров. Блок отвечает на один вопрос бизнеса: заголовок, сам вопрос, источники,
// чип «Под вас» и переключатель в таблицу (двойник графика для тех, кому удобнее цифры).
import { useState, type ReactNode } from 'react';
import { Custom } from './Custom';
import { DataTable, type TableSpec } from './DataTable';

export interface BlockProps<R = never> {
  title: string;
  question?: string;
  actions?: ReactNode;
  custom?: string | false;
  sources?: readonly string[];
  table?: TableSpec<R>;
  className?: string;
  dark?: boolean;
  tour?: string;
  children: ReactNode;
}

export function Block<R>({ title, question, actions, custom, sources, table, className = '', dark, tour, children }: BlockProps<R>) {
  const [asTable, setAsTable] = useState(false);
  return (
    <section className={`ds-sheet${dark ? ' ds-dark' : ''} ${className}`} data-tour={tour} aria-label={title}>
      <header className="ds-head">
        <div className="ds-head-text">
          <h3 className="ds-title">{title}</h3>
          {question && <p className="ds-question">{question}</p>}
        </div>
        <div className="ds-actions">
          {actions}
          {table && (
            <button type="button" className="ds-link" aria-pressed={asTable} onClick={() => setAsTable((v) => !v)}>
              {asTable ? 'График' : 'Таблица'}
            </button>
          )}
          {custom !== false && <Custom text={custom || undefined} />}
        </div>
      </header>
      <div className="ds-body">{asTable && table ? <DataTable {...table} /> : children}</div>
      {sources && sources.length > 0 && (
        <footer className="ds-foot">
          <span>Источники:</span>
          {sources.map((s) => <span key={s} className="ds-source">{s}</span>)}
        </footer>
      )}
    </section>
  );
}

/** Тёмный стол, на котором лежат листы. Заголовок острова — для группы блоков об одном. */
export function Island({ title, note, cols, className = '', children }: { title?: string; note?: string; cols?: 2; className?: string; children: ReactNode }) {
  return (
    <div className={`ds-island${cols ? ` cols-${cols}` : ''} ${className}`}>
      {title && (
        <div className="ds-island-head" style={{ gridColumn: '1 / -1' }}>
          <h2>{title}</h2>
          {note && <p>{note}</p>}
        </div>
      )}
      {children}
    </div>
  );
}

/** Сегментный переключатель внутри блока (день/неделя, модель, разрез). */
export function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: readonly (readonly [T, string])[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="ds-seg" role="group" aria-label={label}>
      {options.map(([k, name]) => (
        <button key={k} type="button" aria-pressed={value === k} onClick={() => onChange(k)}>{name}</button>
      ))}
    </div>
  );
}
