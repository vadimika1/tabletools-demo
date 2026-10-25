// Календарь демо: ряд из двух лет, последний день — вчера (или заданный якорь в тестах).
// Окна — полуоткрытые [from, to) по индексам дней.
import type { Compare, Period, Win } from './types.ts';

export const DAYS_TOTAL = 728; // 104 недели: хватает на «год к году» для периода «год»
export const DAY_MS = 86_400_000;
/** Якорь по умолчанию для тестов и сборки: последний день ряда — 23 сентября 2026. */
export const DEFAULT_ANCHOR = '2026-09-23';

export const PERIODS: Record<Period, { label: string; days: number; prevLabel: string; yearLabel: string }> = {
  week: { label: 'Неделя', days: 7, prevLabel: 'прошлой неделе', yearLabel: 'той же неделе год назад' },
  month: { label: 'Месяц', days: 28, prevLabel: 'прошлому месяцу', yearLabel: 'тому же месяцу год назад' },
  quarter: { label: 'Квартал', days: 91, prevLabel: 'прошлому кварталу', yearLabel: 'тому же кварталу год назад' },
  year: { label: 'Год', days: 364, prevLabel: 'прошлому году', yearLabel: 'прошлому году' },
};
// Месяц — 28 дней, квартал — 13 недель, год — 52 недели: в окне всегда целые недели,
// поэтому сравнение с прошлым периодом не перекашивают лишние выходные.

export const COMPARE: Record<Compare, string> = { prev: 'К прошлому периоду', year: 'К году назад' };
/** Подпись «к чему сравниваем» для плиток: «к прошлому месяцу», «к тому же месяцу год назад». */
export const vsLabel = (p: Period, c: Compare) => (c === 'year' ? PERIODS[p].yearLabel : PERIODS[p].prevLabel);
const YEAR_SHIFT = 364; // ровно 52 недели: понедельник сравнивается с понедельником

/** Дата якоря из строки YYYY-MM-DD, в UTC. */
export function anchorDate(iso: string): Date {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) throw new Error(`Неверная дата якоря: ${iso}`);
  return d;
}

/** Вчерашний день по местному календарю в формате YYYY-MM-DD: демо всегда показывает свежие даты. */
export function yesterdayIso(now = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const dateOf = (anchor: Date, i: number) => new Date(anchor.getTime() - (DAYS_TOTAL - 1 - i) * DAY_MS);
export const weekdayOf = (d: Date) => (d.getUTCDay() + 6) % 7;

/** Окно периода: текущее или то, с которым сравниваем. */
export function windowOf(period: Period, compare?: Compare): Win {
  const n = PERIODS[period].days;
  if (!compare) return [DAYS_TOTAL - n, DAYS_TOTAL];
  const shift = compare === 'year' ? YEAR_SHIFT : n;
  return [DAYS_TOTAL - n - shift, DAYS_TOTAL - shift];
}

export const daysIn = (w: Win) => w[1] - w[0];

const DM = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const DMY = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
export const shortDate = (anchor: Date, i: number) => DM.format(dateOf(anchor, i)).replace('.', '');
export const longDate = (anchor: Date, i: number) => DMY.format(dateOf(anchor, i)).replace(' г.', '');
