'use client';
// Плитка-показатель: подпись, значение (доезжает от прошлого), изменение к названному периоду,
// спарклайн. Цвет изменения — по смыслу для бизнеса (рост неявок — плохо), плюс значок.
import type { ReactNode } from 'react';
import { delta as fmtDelta, fmt, type Fmt } from '../format';
import { useCountUp } from '../motion/hooks';
import { Spark } from '../charts/Spark';
import { Custom } from './Custom';

export function Delta({ now, prev, vs, goodWhen = 'up' }: { now: number; prev: number | null; vs: string; goodWhen?: 'up' | 'down' }) {
  if (prev === null || !prev) return <span className="ds-delta">нет данных за {vs}</span>;
  const d = (now - prev) / Math.abs(prev);
  const flat = Math.abs(d) < 0.005;
  const good = goodWhen === 'up' ? d > 0 : d < 0;
  const tone = flat ? '' : good ? 'good' : 'bad';
  return (
    <span className={`ds-delta ${tone}`}>
      {!flat && (
        <svg viewBox="0 0 12 12" aria-hidden="true" fill="currentColor">
          {d > 0 ? <path d="M6 2l4.5 6h-9z" /> : <path d="M6 10L1.5 4h9z" />}
        </svg>
      )}
      <b>{flat ? 'без изменений' : fmtDelta(d)}</b>
      <span>к {vs}</span>
      {tone && <span className="sr-only">{good ? ', хорошо' : ', плохо'}</span>}
    </span>
  );
}

export function Num({ value, format }: { value: number; format: Fmt }) {
  return <>{fmt(useCountUp(value), format)}</>;
}

export interface StatProps {
  label: string;
  value: number;
  format: Fmt;
  prev?: number | null;
  vs?: string;
  goodWhen?: 'up' | 'down';
  note?: ReactNode;
  spark?: readonly number[];
  hero?: boolean;
  dark?: boolean;
  custom?: string | boolean; // true — «Под вас» с текстом по умолчанию
  onClick?: () => void;
  tour?: string;
}

export function Stat({ label, value, format, prev, vs = 'прошлому периоду', goodWhen, note, spark, hero, dark, custom = false, onClick, tour }: StatProps) {
  const cls = `ds-stat${hero ? ' is-hero' : ''}${dark ? ' ds-dark' : ''}`;
  const inner = (
    <>
      <span className="ds-stat-label">{label}</span>
      <strong className="ds-stat-value"><Num value={value} format={format} /></strong>
      {prev !== undefined && <Delta now={value} prev={prev} vs={vs} goodWhen={goodWhen} />}
      {note && <span className="ds-stat-note">{note}</span>}
      {spark && spark.length > 1 && <Spark values={spark} />}
    </>
  );
  if (onClick) {
    return (
      <div style={{ position: 'relative', display: 'grid' }} data-tour={tour}>
        <button type="button" className={cls} onClick={onClick} aria-label={`${label}: ${fmt(value, format)}. Открыть разбивку`}>{inner}</button>
        {custom && <span style={{ position: 'absolute', top: 12, right: 12 }}><Custom text={typeof custom === 'string' ? custom : undefined} /></span>}
      </div>
    );
  }
  return <article className={cls} data-tour={tour}>{inner}{custom && <Custom text={typeof custom === 'string' ? custom : undefined} />}</article>;
}
