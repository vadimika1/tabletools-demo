'use client';
// Общие куски видов операционки: цифры в строку внутри листа (без карточки в карточке),
// строки «значение против цели», текстовые флажки вердикта и цвет точки.
import type { ReactNode } from 'react';
import { Delta, Num } from '@/components/dash/kit/Stat';
import { Meter } from '@/components/dash/charts/Meter';
import type { Tone } from '@/components/dash/charts/Tip';
import { fmt, type Fmt } from '@/components/dash/format';
import type { Dataset } from '@/lib/demo-app/engine/dataset';
import type { LocKey } from '@/lib/demo-app/engine/types';

const MAX_TONE = 6;

/** Цвет точки — её место в профиле отрасли, а не в рейтинге: при фильтрах цвет не прыгает. */
export function locTone(ds: Dataset, key: LocKey): Tone {
  const i = ds.profile.locations.findIndex((l) => l.key === key);
  return i < 0 || i >= MAX_TONE ? 'muted' : ((i + 1) as Tone);
}

/** Цвет канала — его место в профиле отрасли. */
export function channelTone(index: number | null): Tone {
  return index === null || index >= MAX_TONE ? 'muted' : ((index + 1) as Tone);
}

/** «из 21 врача», «из 24 врачей»: после «из» — родительный падеж. */
export const ofN = (n: number, forms: readonly [string, string, string]) =>
  `из ${n.toLocaleString('ru-RU')} ${n % 10 === 1 && n % 100 !== 11 ? forms[1] : forms[2]}`;

/** Значение или прочерк, если данных нет. */
export const orDash = (v: number | null | undefined, kind: Fmt) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : fmt(v, kind));

export interface Fig {
  key: string;
  label: string;
  value: number | null;
  format: Fmt;
  note?: ReactNode; // окно или пояснение: «вчера», «за 7 дней»
  prev?: number | null;
  vs?: string;
  goodWhen?: 'up' | 'down';
}

/** Три–четыре цифры в строку: подпись, число (доезжает от прошлого), окно или изменение. */
export function Figs({ items }: { items: readonly Fig[] }) {
  return (
    <dl className="op-figs">
      {items.map((x) => (
        <div key={x.key} className="op-fig">
          <dt>{x.label}</dt>
          <dd className="op-fig-value">{x.value === null ? '—' : <Num value={x.value} format={x.format} />}</dd>
          {x.prev !== undefined && x.value !== null && <dd><Delta now={x.value} prev={x.prev} vs={x.vs ?? 'прошлому периоду'} goodWhen={x.goodWhen} /></dd>}
          {x.note && <dd className="op-fig-note">{x.note}</dd>}
        </div>
      ))}
    </dl>
  );
}

export type Verdict = 'good' | 'warn' | 'bad';

/** Вердикт всегда со значком и словом — цвет не единственный ключ. */
export function Flag({ tone, children }: { tone: Verdict; children: ReactNode }) {
  return (
    <span className={`op-flag is-${tone}`}>
      <svg viewBox="0 0 12 12" aria-hidden="true" fill="currentColor">
        {tone === 'good' ? <path d="M4.8 8.6 2.4 6.2l.9-.9 1.5 1.5 3.9-3.9.9.9z" /> : <path d="M6 1.5 11 10.5H1zM5.4 4.8v2.7h1.2V4.8zm0 3.4v1.1h1.2V8.2z" />}
      </svg>
      {children}
    </span>
  );
}

/** Вывод блока одной-двумя фразами: что это значит в деньгах и где. */
export function Note({ children }: { children: ReactNode }) {
  return <p className="op-note">{children}</p>;
}

export interface MeterRow {
  key: string;
  label: ReactNode;
  sub?: ReactNode;
  value: number;
  target?: number;
  display: string;
  tone: Verdict;
  flag?: ReactNode;
  onClick?: () => void;
}

/** Строки «значение против цели»: подпись, шкала с отметкой цели, значение и вердикт словами. */
export function MeterRows({ rows, max, format, targetLabel }: { rows: readonly MeterRow[]; max: number; format: Fmt; targetLabel: string }) {
  return (
    <ul className="op-meters">
      {rows.map((r) => {
        const inner = (
          <>
            <span className="op-meters-label">{r.label}{r.sub && <small>{r.sub}</small>}</span>
            <span className="op-meters-bar"><Meter value={r.value} max={max} target={r.target} format={format} targetLabel={targetLabel} tone={r.tone} /></span>
            <b>{r.display}</b>
            <span className="op-meters-flag">{r.flag}</span>
          </>
        );
        return (
          <li key={r.key}>
            {r.onClick ? <button type="button" className="op-meters-row is-link" onClick={r.onClick}>{inner}</button> : <div className="op-meters-row">{inner}</div>}
          </li>
        );
      })}
    </ul>
  );
}

/** Подпись цели под строками: короткая черта — это цель. */
export function TargetKey({ label }: { label: string }) {
  return <p className="op-target-key"><i aria-hidden="true" />{label}</p>;
}
