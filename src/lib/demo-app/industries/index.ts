// Реестр отраслей демо. Отрасль можно передать в адресе (?n=clinic) и открыть демо сразу в ней.
import type { IndustryKey, IndustryProfile } from '../engine/types.ts';
import { auto } from './auto.ts';
import { clinic } from './clinic.ts';
import { fitness } from './fitness.ts';
import { other } from './other.ts';
import { salon } from './salon.ts';
import { studio } from './studio.ts';

export const INDUSTRIES: Record<IndustryKey, IndustryProfile> = { clinic, salon, fitness, auto, studio, other };

/** Порядок в переключателе — как в квизе. */
export const INDUSTRY_ORDER: readonly IndustryKey[] = ['clinic', 'salon', 'fitness', 'auto', 'studio', 'other'];

export const isIndustry = (v: unknown): v is IndustryKey => typeof v === 'string' && v in INDUSTRIES;
