'use client';
// Общее для видов блоков: данные текущего среза и подписи источников по отрасли.
import { useMemo } from 'react';
import { useDemo } from '../state';
import { totals, type Dataset, type Totals } from '@/lib/demo-app/engine/dataset';
import { BLOCK_BY_ID, type BlockDef } from '@/lib/demo-app/blocks/registry';
import type { LocFilter, Win } from '@/lib/demo-app/engine/types';

export interface Slice {
  ds: Dataset;
  loc: LocFilter;
  win: Win;
  prevWin: Win;
  vs: string; // «к прошлому месяцу»
  t: Totals; // итоги текущего окна
  tp: Totals; // итоги окна сравнения
  def: BlockDef;
}

/** Срез для блока: отрасль, точка, окна периода и сравнения. Вызывать только когда ds готов. */
export function useSlice(id: string): Slice {
  const { ds, loc, win, prevWin, vs } = useDemo();
  if (!ds) throw new Error('Блок отрисован до готовности данных');
  const def = BLOCK_BY_ID.get(id);
  if (!def) throw new Error(`Нет блока ${id} в реестре`);
  // Итоги окна — сотни дней × точки; пересчитываем только при смене среза.
  const t = useMemo(() => totals(ds, loc, win), [ds, loc, win]);
  const tp = useMemo(() => totals(ds, loc, prevWin), [ds, loc, prevWin]);
  return { ds, loc, win, prevWin, vs, t, tp, def };
}

/** Названия систем-источников блока в этой отрасли, без повторов: ['IDENT', 'Mango Office']. */
export function sourcesOf(ds: Dataset, def: BlockDef): string[] {
  return [...new Set(def.systems.map((s) => ds.profile.systems[s]))];
}

/** Имя точки или «вся сеть» — для заголовков и подсказок. */
export function scopeName(ds: Dataset, loc: LocFilter): string {
  return loc === 'all' ? 'вся сеть' : ds.profile.locations.find((l) => l.key === loc)?.name ?? loc;
}

/** Первая буква заглавной — для слов из словаря отрасли в начале фразы. */
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
