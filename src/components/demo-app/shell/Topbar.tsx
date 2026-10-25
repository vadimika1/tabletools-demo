'use client';
// Верхняя панель демо: отрасль, период, точка, сравнение — один ряд над всем, что они меняют.
import { useEffect, useRef, useState } from 'react';
import { COMPARE, PERIODS, shortDate } from '@/lib/demo-app/engine/calendar';
import { INDUSTRIES, INDUSTRY_ORDER } from '@/lib/demo-app/industries';
import { NICHES } from '@/lib/niches';
import { plural } from '@/components/dash/format';
import type { Compare, IndustryKey, Period } from '@/lib/demo-app/engine/types';
import { useDemo } from '../state';
import { CONTACT_URL } from '@/lib/site-link';
import { ICON, Icon } from './icons';

function IndustryPicker() {
  const { niche, set } = useDemo();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const p = INDUSTRIES[niche];

  useEffect(() => {
    if (!open) return;
    const handleDown = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', handleDown);
    document.addEventListener('keydown', handleKey);
    return () => { document.removeEventListener('pointerdown', handleDown); document.removeEventListener('keydown', handleKey); };
  }, [open]);

  const handlePick = (k: IndustryKey) => { set({ niche: k, blocks: [] }); setOpen(false); };

  return (
    <div className="dm-picker" ref={box} data-tour="industry">
      <button type="button" className="dm-picker-btn" aria-expanded={open} aria-haspopup="listbox" onClick={() => setOpen((v) => !v)}>
        <span className="dm-picker-ava" aria-hidden="true">{p.business.match(/«(.)/)?.[1] ?? 'Б'}</span>
        <span className="dm-picker-text">
          <b>{p.business}</b>
          <small>{p.city}, {p.locations.length} {plural(p.locations.length, p.words.location)}</small>
        </span>
        <Icon d={ICON.chevron} size={16} />
      </button>
      {open && (
        <ul className="dm-picker-menu" role="listbox" aria-label="Отрасль">
          {INDUSTRY_ORDER.map((k) => (
            <li key={k}>
              <button type="button" role="option" aria-selected={k === niche} onClick={() => handlePick(k)}>
                <b>{NICHES[k]}</b>
                <small>{INDUSTRIES[k].business}</small>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Filters() {
  const { ds, period, loc, compare, win, set } = useDemo();
  const p = ds?.profile;
  return (
    <div className="dm-filters" data-tour="filters">
      <div className="ds-seg" role="group" aria-label="Период">
        {(Object.keys(PERIODS) as Period[]).map((k) => (
          <button key={k} type="button" aria-pressed={k === period} onClick={() => set({ period: k })}>{PERIODS[k].label}</button>
        ))}
      </div>
      <label className="dm-select">
        <span className="sr-only">Точка</span>
        <select name="loc" value={loc} onChange={(e) => set({ loc: e.target.value })}>
          <option value="all">Вся сеть</option>
          {p?.locations.map((l) => <option key={l.key} value={l.key}>{l.name}</option>)}
        </select>
      </label>
      <label className="dm-select">
        <span className="sr-only">Сравнение</span>
        <select name="compare" value={compare} onChange={(e) => set({ compare: e.target.value as Compare })}>
          {(Object.keys(COMPARE) as Compare[]).map((k) => <option key={k} value={k}>{COMPARE[k]}</option>)}
        </select>
      </label>
      {ds && <span className="dm-range">{shortDate(ds.anchor, win[0])} — {shortDate(ds.anchor, win[1] - 1)}</span>}
    </div>
  );
}

export function Topbar({ onMenu, onTour }: { onMenu: () => void; onTour: () => void }) {
  return (
    <header className="dm-top">
      <div className="dm-top-row">
        <button type="button" className="dm-burger" aria-label="Меню разделов" onClick={onMenu}><Icon d={ICON.menu} /></button>
        <IndustryPicker />
        <div className="dm-top-end">
          <span className="dm-live"><i aria-hidden="true" />обновлено 4 мин назад</span>
          <button type="button" className="dm-help" aria-label="Как пользоваться демо" onClick={onTour} data-tour="help"><Icon d={ICON.help} /></button>
          <a className="btn btn-gold dm-cta" href={CONTACT_URL} target="_blank" rel="noopener noreferrer">Хочу такой</a>
        </div>
      </div>
      <Filters />
    </header>
  );
}
