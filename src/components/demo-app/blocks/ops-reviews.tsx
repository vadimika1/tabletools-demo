'use client';
// Куски блока «Отзывы» и легенда точек: полоса звёзд по точке, лента отзывов.
import { toneVar } from '@/components/dash/charts/Tip';
import { plural } from '@/components/dash/format';
import type { Dataset } from '@/lib/demo-app/engine/dataset';
import type { ReviewItem } from '@/lib/demo-app/models/ops-team';
import { Flag, locTone } from './ops-common';

/** 5★ … 1★ — порядковая шкала чернил: чем выше оценка, тем темнее. */
export const STAR_TONES = ['--ds-o5', '--ds-o4', '--ds-o3', '--ds-o2', '--ds-o1'] as const;

export function StarBar({ stars }: { stars: readonly number[] }) {
  const total = stars.reduce((s, v) => s + v, 0);
  if (!total) return <span className="op-starbar is-empty" aria-label="Отзывов нет" />;
  return (
    <span className="op-starbar" role="img" aria-label={stars.map((n, k) => `${5 - k}★: ${n}`).join(', ')}>
      {stars.map((n, k) => (n > 0 ? <i key={STAR_TONES[k]} style={{ flexGrow: n, background: `var(${STAR_TONES[k]})` }} /> : null))}
    </span>
  );
}

/** Легенда цветов точек, когда в одном графике их несколько. */
export function LocLegend({ ds }: { ds: Dataset }) {
  return (
    <ul className="ds-legend" aria-label="Цвета точек">
      {ds.profile.locations.map((l) => <li key={l.key}><i className="box" style={{ background: toneVar(locTone(ds, l.key)) }} />{l.name}</li>)}
    </ul>
  );
}

/** Якорь демо — вчерашний день, поэтому «0 дней назад» — это вчера. */
function when(daysAgo: number): string {
  if (daysAgo === 0) return 'вчера';
  const n = daysAgo + 1;
  return `${n} ${plural(n, ['день', 'дня', 'дней'])} назад`;
}

export function ReviewFeed({ items }: { items: readonly ReviewItem[] }) {
  if (!items.length) return <p className="op-note">Новых отзывов за период нет.</p>;
  return (
    <ul className="op-feed" aria-label="Последние отзывы">
      {items.map((x) => (
        <li key={x.id} className={x.stars <= 3 ? 'is-low' : ''}>
          <div className="op-feed-head">
            <span className="op-feed-stars" aria-label={`Оценка ${x.stars} из 5`}>{'★'.repeat(x.stars)}<span aria-hidden="true">{'★'.repeat(5 - x.stars)}</span></span>
            <b>{x.author}</b>
            <span>{x.locName}, {when(x.daysAgo)}</span>
            {x.stars <= 3 && !x.replied && <Flag tone="bad">без ответа</Flag>}
          </div>
          <p>{x.text}</p>
        </li>
      ))}
    </ul>
  );
}
