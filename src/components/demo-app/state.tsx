'use client';
// Состояние демо: отрасль, период, точка, сравнение, модель атрибуции и набор «Собери себе».
// Всё живёт в адресе (?n=clinic&p=month&t=all&c=prev&m=last&b=o1,p2) — экраном можно поделиться,
// а выбор сохраняется при переходе между разделами. Данные собираются после монтирования
// с якорем «вчера», поэтому серверная и клиентская отрисовка не расходятся.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getDataset, type Dataset } from '@/lib/demo-app/engine/dataset';
import { COMPARE, PERIODS, vsLabel, windowOf, yesterdayIso } from '@/lib/demo-app/engine/calendar';
import { MODELS } from '@/lib/demo-app/engine/channels';
import { INDUSTRIES, isIndustry } from '@/lib/demo-app/industries';
import { encodeBlocks, parseBlocks } from '@/lib/demo-app/blocks/registry';
import type { Compare, IndustryKey, LocFilter, Model, Period, Win } from '@/lib/demo-app/engine/types';

export interface Filters {
  niche: IndustryKey;
  period: Period;
  loc: LocFilter;
  compare: Compare;
  model: Model;
  blocks: string[]; // пусто — готовый дашборд отрасли
}

export interface DemoCtx extends Filters {
  ds: Dataset | null; // null до монтирования
  win: Win;
  prevWin: Win;
  vs: string;
  query: string;
  set: (patch: Partial<Filters>) => void;
}

const DEFAULT: Filters = { niche: 'clinic', period: 'month', loc: 'all', compare: 'prev', model: 'last', blocks: [] };
const LAST_NICHE_KEY = 'tt-demo-niche';

function readNiche(q: URLSearchParams): IndustryKey {
  const n = q.get('n');
  if (isIndustry(n)) return n;
  try {
    const saved = localStorage.getItem(LAST_NICHE_KEY);
    if (isIndustry(saved)) return saved;
  } catch { /* хранилище недоступно — берём отрасль по умолчанию */ }
  return DEFAULT.niche;
}

export function parseFilters(search: string): Filters {
  const q = new URLSearchParams(search);
  const niche = readNiche(q);
  const p = q.get('p');
  const t = q.get('t');
  const c = q.get('c');
  const m = q.get('m');
  return {
    niche,
    period: p && p in PERIODS ? (p as Period) : DEFAULT.period,
    loc: t && INDUSTRIES[niche].locations.some((l) => l.key === t) ? t : 'all',
    compare: c && c in COMPARE ? (c as Compare) : DEFAULT.compare,
    model: m && m in MODELS ? (m as Model) : DEFAULT.model,
    blocks: parseBlocks(q.get('b')),
  };
}

export function toQuery(f: Filters): string {
  const q = new URLSearchParams();
  q.set('n', f.niche);
  if (f.period !== DEFAULT.period) q.set('p', f.period);
  if (f.loc !== 'all') q.set('t', f.loc);
  if (f.compare !== DEFAULT.compare) q.set('c', f.compare);
  if (f.model !== DEFAULT.model) q.set('m', f.model);
  if (f.blocks.length) q.set('b', encodeBlocks(f.blocks));
  return `?${q.toString().replace(/%2C/g, ',')}`;
}

const Ctx = createContext<DemoCtx | null>(null);

export function useDemo(): DemoCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useDemo вне DemoProvider');
  return v;
}

export function DemoProvider({ children }: { children: ReactNode }) {
  const [f, setF] = useState<Filters>(DEFAULT);
  const [anchor, setAnchor] = useState<string | null>(null);

  useEffect(() => {
    setF(parseFilters(location.search));
    setAnchor(yesterdayIso());
    const handlePop = () => setF(parseFilters(location.search));
    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
  }, []);

  const set = useCallback((patch: Partial<Filters>) => {
    setF((prev) => {
      const next = { ...prev, ...patch };
      if (patch.niche && patch.niche !== prev.niche && patch.loc === undefined) next.loc = 'all'; // у другой отрасли другие точки
      history.replaceState(history.state, '', `${location.pathname}${toQuery(next)}`);
      try { localStorage.setItem(LAST_NICHE_KEY, next.niche); } catch { /* не критично */ }
      return next;
    });
  }, []);

  const value = useMemo<DemoCtx>(() => ({
    ...f,
    ds: anchor ? getDataset(f.niche, anchor) : null,
    win: windowOf(f.period),
    prevWin: windowOf(f.period, f.compare),
    vs: vsLabel(f.period, f.compare),
    query: toQuery(f),
    set,
  }), [f, anchor, set]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
