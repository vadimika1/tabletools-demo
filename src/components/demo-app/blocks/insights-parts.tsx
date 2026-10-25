'use client';
// Мелкие детали блоков обзора и инсайтов: значок вердикта с подписью (цвет никогда не один),
// ссылка в раздел и печатающийся ответ чата.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { SECTIONS, type SectionKey } from '@/lib/demo-app/blocks/registry';
import type { InsightTone } from '@/lib/demo-app/models/insights';
import { prefersReduced } from '@/components/dash/motion/hooks';
import { useDemo } from '../state';

export const TONE_LABEL: Record<InsightTone, string> = { bad: 'Тревога', warn: 'Внимание', good: 'Хорошо' };

/** Значок вердикта: треугольник — внимание, круг с чертой — тревога, галочка — хорошо. */
export function ToneIcon({ tone }: { tone: InsightTone }) {
  return (
    <svg className={`bi-icon is-${tone}`} viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      {tone === 'good' && <><circle cx="8" cy="8" r="6.5" /><path d="M5 8.3l2 2 4-4.3" /></>}
      {tone === 'warn' && <><path d="M8 2.2L14.3 13.3H1.7z" /><path d="M8 6.6v3M8 11.4v.1" /></>}
      {tone === 'bad' && <><circle cx="8" cy="8" r="6.5" /><path d="M8 4.6v4.2M8 11.2v.1" /></>}
    </svg>
  );
}

export function ToneBadge({ tone }: { tone: InsightTone }) {
  return <span className={`bi-badge is-${tone}`}><ToneIcon tone={tone} />{TONE_LABEL[tone]}</span>;
}

/** Ссылка в раздел демо с текущими фильтрами. Текст без стрелок — только куда ведёт. */
export function SectionLink({ section, children }: { section: SectionKey; children?: string }) {
  const { query } = useDemo();
  const s = SECTIONS[section];
  return <Link className="bi-link" href={`/${s.slug}/${query}`}>{children ?? `В раздел «${s.title}»`}</Link>;
}

const TYPE_STEP = 3; // символов за тик
const TYPE_MS = 18;

/**
 * Ответ печатается по нескольку символов; при prefers-reduced-motion появляется сразу.
 * Экранные читалки получают весь текст сразу — побуквенный вывод им не зачитывается.
 */
export function Typing({ text, onDone }: { text: string; onDone?: () => void }) {
  const [shown, setShown] = useState({ text, n: 0 });
  const n = shown.text === text ? shown.n : 0; // новый текст — печатаем заново
  const done = n >= text.length;
  useEffect(() => {
    if (done) return;
    if (prefersReduced()) { setShown({ text, n: text.length }); return; }
    const id = window.setTimeout(() => setShown({ text, n: Math.min(text.length, n + TYPE_STEP) }), TYPE_MS);
    return () => window.clearTimeout(id);
  }, [text, n, done]);
  useEffect(() => { if (done) onDone?.(); }, [done, onDone]);
  return (
    <>
      <span aria-hidden="true">{text.slice(0, n)}{n < text.length && <i className="bi-caret" />}</span>
      <span className="sr-only">{text}</span>
    </>
  );
}
