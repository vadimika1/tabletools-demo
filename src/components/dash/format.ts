// Форматы чисел и склонения для дашбордов. Чистые функции без React — годятся и для тестов, и для сервера.

export type Fmt = 'money' | 'rub' | 'int' | 'pct' | 'pp' | 'x' | 'hours' | 'min' | 'rating';

const NBSP = ' ';
const int = (v: number) => Math.round(v).toLocaleString('ru-RU');

/** Деньги компактно: 842 ₽, 12,4 тыс. ₽, 3,37 млн ₽. Для крупных цифр на плитках. */
export function money(v: number): string {
  const a = Math.abs(v);
  const s = v < 0 ? '−' : '';
  if (a >= 1e6) return `${s}${(a / 1e6).toLocaleString('ru-RU', { maximumFractionDigits: a >= 1e8 ? 0 : 2 })}${NBSP}млн${NBSP}₽`;
  if (a >= 1e4) return `${s}${(a / 1e3).toLocaleString('ru-RU', { maximumFractionDigits: a >= 1e5 ? 0 : 1 })}${NBSP}тыс.${NBSP}₽`;
  return `${s}${int(a)}${NBSP}₽`;
}

export function fmt(v: number, kind: Fmt): string {
  switch (kind) {
    case 'money': return money(v);
    case 'rub': return `${v < 0 ? '−' : ''}${int(Math.abs(v))}${NBSP}₽`;
    case 'pct': return `${v < 0 ? '−' : ''}${(Math.abs(v) * 100).toLocaleString('ru-RU', { maximumFractionDigits: 1, minimumFractionDigits: Math.abs(v) < 0.1 ? 1 : 0 })}%`; // настоящий минус, как у денег
    case 'pp': return `${(v * 100).toLocaleString('ru-RU', { maximumFractionDigits: 1 })}${NBSP}п.п.`;
    case 'x': return `${v.toLocaleString('ru-RU', { maximumFractionDigits: 1, minimumFractionDigits: 1 })}×`;
    case 'hours': return `${int(v)}${NBSP}ч`;
    case 'min': return v >= 90 ? `${(v / 60).toLocaleString('ru-RU', { maximumFractionDigits: 1 })}${NBSP}ч` : `${int(v)}${NBSP}мин`;
    case 'rating': return v.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    default: return int(v);
  }
}

/** Подпись оси: 0, 250 тыс., 1,5 млн — коротко, без валюты (валюта в заголовке). */
export function axis(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e6) return `${(v / 1e6).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} млн`;
  if (a >= 1e3) return `${(v / 1e3).toLocaleString('ru-RU', { maximumFractionDigits: 0 })} тыс.`;
  return v.toLocaleString('ru-RU', { maximumFractionDigits: 1 });
}

/** Изменение со знаком: +4,2% / −1,1%; null — прочерк (сравнивать не с чем). */
export function delta(d: number | null): string {
  if (d === null || !Number.isFinite(d)) return '—';
  if (Math.abs(d) < 0.0005) return '0%';
  return `${d > 0 ? '+' : '−'}${Math.abs(d * 100).toLocaleString('ru-RU', { maximumFractionDigits: 1 })}%`;
}

export type Forms = readonly [string, string, string];

/** Склонение: plural(3, ['приём','приёма','приёмов']) → «приёма». */
export function plural(n: number, [one, few, many]: Forms): string {
  const a = Math.abs(Math.round(n)) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b === 1) return one;
  if (b >= 2 && b <= 4) return few;
  return many;
}

export const count = (n: number, forms: Forms) => `${int(n)}${NBSP}${plural(n, forms)}`;
