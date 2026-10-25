'use client';
// Общее для видов «Маркетинга» и «Сквозной»: цвет сущности, прочерк вместо пустого,
// строка-ответ над графиком и подписи дней и давности.
import type { ReactNode } from 'react';
import { Stat, type StatProps } from '@/components/dash/kit/Stat';
import { toneVar, type Tone } from '@/components/dash/charts/Tip';
import { fmt, plural, type Fmt } from '@/components/dash/format';

const MAX_TONES = 6;

/** Цвет сущности по её месту в профиле (канал, точка): 1…6, дальше и для прямых — приглушённый. */
export const indexTone = (index: number): Tone => (index >= 0 && index < MAX_TONES ? ((index + 1) as Tone) : 'muted');

/** Число или прочерк: пустое не показываем нулём. */
export const orDash = (v: number | null | undefined, kind: Fmt): string => (v === null || v === undefined || !Number.isFinite(v) ? '—' : fmt(v, kind));

/** Изменение доли в процентных пунктах со знаком: +1,2 п.п. / −0,4 п.п. */
export function signedPp(d: number | null): string {
  if (d === null) return '—';
  if (Math.abs(d) < 0.0005) return '0 п.п.';
  return `${d > 0 ? '+' : '−'}${fmt(Math.abs(d), 'pp')}`;
}

const DAY: readonly [string, string, string] = ['день', 'дня', 'дней'];
const MIN: readonly [string, string, string] = ['минуту', 'минуты', 'минут'];
const HOUR: readonly [string, string, string] = ['час', 'часа', 'часов'];

export const daysText = (n: number | null): string => (n === null ? '—' : n === 0 ? 'в тот же день' : `${n} ${plural(n, DAY)}`);
export const hoursText = (n: number): string => `${n} ${plural(n, HOUR)}`;
export function agoText(min: number): string {
  if (min < 60) return `${min} ${plural(min, MIN)} назад`;
  const h = Math.round(min / 60);
  return `${h} ${plural(h, HOUR)} назад`;
}

/** Строка-ответ на вопрос блока: деньги и имена жирным, без графика вокруг. */
export function Lede({ children }: { children: ReactNode }) {
  return <p className="mk-lede">{children}</p>;
}

/** Цветная метка сущности рядом с текстом (цвет — не единственный ключ: имя всегда рядом). */
export function Dot({ tone }: { tone: Tone }) {
  return <i className="mk-dot" style={{ background: toneVar(tone) }} aria-hidden="true" />;
}

/** Плитка, у которой значения может не быть: тогда прочерк, а не 0. */
export function StatOrDash({ value, ...rest }: Omit<StatProps, 'value'> & { value: number | null }) {
  if (value === null || !Number.isFinite(value)) {
    return (
      <article className="ds-stat">
        <span className="ds-stat-label">{rest.label}</span>
        <strong className="ds-stat-value">—</strong>
        <span className="ds-stat-note">нет данных за период</span>
      </article>
    );
  }
  return <Stat value={value} {...rest} />;
}

/** Статус с текстом и значком: цвет вердикта никогда не бывает единственным ключом. */
export function Status({ tone, children }: { tone: 'good' | 'warn' | 'bad'; children: ReactNode }) {
  return (
    <span className={`mk-status is-${tone}`}>
      <svg viewBox="0 0 12 12" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        {tone === 'good' ? <path d="M2.5 6.2l2.3 2.3 4.7-5" /> : <><path d="M6 2.5v4.2" /><path d="M6 9.2v.3" /></>}
      </svg>
      {children}
    </span>
  );
}
