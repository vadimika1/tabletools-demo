'use client';
// Мелочи для блоков финансов и клиентов: цвет точки, пометка-вердикт со значком, ряд цифр,
// подпись действия в демо и форматы дат из ISO. Только разметка, без данных.
import type { ReactNode } from 'react';
import { fmt, type Fmt } from '@/components/dash/format';
import type { Tone } from '@/components/dash/charts/Tip';
import type { Dataset } from '@/lib/demo-app/engine/dataset';
import type { LocKey } from '@/lib/demo-app/engine/types';

const MAX_TONE = 6;

/** Цвет точки — её место в профиле отрасли: при смене фильтра цвет не перескакивает. */
export function locTone(ds: Dataset, key: LocKey): Tone {
  const i = ds.profile.locations.findIndex((l) => l.key === key);
  return (i < 0 ? 'muted' : Math.min(MAX_TONE, i + 1)) as Tone;
}

export const locName = (ds: Dataset, key: LocKey) => ds.profile.locations.find((l) => l.key === key)?.name ?? key;

/** Деньги со знаком: +120 000 ₽ / −45 000 ₽; null — прочерк. */
export function signed(v: number | null, kind: Fmt = 'rub'): string {
  if (v === null) return '—';
  return `${v > 0 ? '+' : ''}${fmt(v, kind)}`;
}

/** Процентные пункты со знаком: +1,2 п.п. */
export const signedPp = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmt(Math.abs(v), 'pp')}`;

/** Первая буква строчная — для названий статей внутри фразы: «на налоги (УСН)». */
export const lc = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** Значение или прочерк, если данных нет. */
export const orDash = (v: number | null, kind: Fmt) => (v === null ? '—' : fmt(v, kind));

const DAY_LONG = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', timeZone: 'UTC' });
const DAY_SHORT = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', timeZone: 'UTC' });
export const longDay = (iso: string) => DAY_LONG.format(new Date(`${iso}T00:00:00Z`));
export const shortDay = (iso: string) => DAY_SHORT.format(new Date(`${iso}T00:00:00Z`)).replace('.', '');

/** Вердикт текстом и значком — цвет никогда не единственный признак. */
export function Flag({ tone, children }: { tone: 'good' | 'bad' | 'warn'; children: ReactNode }) {
  return (
    <span className={`bf-flag is-${tone}`}>
      <svg viewBox="0 0 12 12" aria-hidden="true" fill="currentColor">
        {tone === 'good' ? <path d="M4.8 8.6 2.2 6l-.9.9 3.5 3.5 6-6-.9-.9z" /> : <path d="M6 1 11.5 11h-11zm-.6 3.5v3h1.2v-3zm0 4v1.2h1.2V8.5z" />}
      </svg>
      {children}
    </span>
  );
}

export interface Fig { key: string; label: string; value: string; note?: ReactNode }

/** Ряд крупных цифр внутри блока — когда плитки Stat слишком тяжёлые для половины ширины. */
export function Figs({ items }: { items: readonly Fig[] }) {
  return (
    <dl className="bf-figs">
      {items.map((f) => (
        <div key={f.key} className="bf-fig">
          <dt>{f.label}</dt>
          <dd>
            <b>{f.value}</b>
            {f.note && <small>{f.note}</small>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Легенда для графиков без встроенной: цвет всегда с подписью. */
export function Legend({ items }: { items: readonly { key: string; label: string; color: string }[] }) {
  return (
    <div className="ds-legend">
      {items.map((x) => <span key={x.key}><i className="box" style={{ background: x.color }} />{x.label}</span>)}
    </div>
  );
}
