// Детализация показателя: значение за окно, ряд по дням или неделям и разбивка по точкам.
// Тот же расчёт, что в плитках, — поэтому цифра в панели совпадает с цифрой, по которой кликнули.
import { avgCheck, loadOf, noShowOf, totals, type Dataset } from '../engine/dataset.ts';
import { pnl, PNL_LINES, type CostKey } from '../engine/money.ts';
import { channelRows } from '../engine/channels.ts';
import { clientStats } from '../engine/clients.ts';
import { freePrime } from '../engine/ops.ts';
import type { LocFilter, LocKey, Win } from '../engine/types.ts';

export type ClientKey = 'newClients' | 'returning' | 'multiLoc' | 'unique' | 'sleeping' | 'repeatShare';
export type MetricKey = 'revenue' | 'profit' | 'load' | 'noshow' | 'check' | 'roi' | 'prime' | ClientKey | CostKey;
type Fmt = 'money' | 'pct' | 'rub' | 'x' | 'int' | 'hours';

/** series: false — показатель считается за период целиком (спящие, прайм-часы), ряда по дням у него нет. */
export interface MetricDef { title: string; format: Fmt; goodWhen: 'up' | 'down'; how: string; series?: false }

const COSTS = Object.fromEntries(PNL_LINES.map((l) => [l.key, {
  title: l.name, format: 'money' as const, goodWhen: 'down' as const,
  how: 'Сумма статьи за период по данным учёта. Общие расходы сети распределены по точкам по вашему правилу.',
}])) as Record<CostKey, MetricDef>;

export const METRICS: Record<MetricKey, MetricDef> = {
  revenue: { title: 'Выручка', format: 'money', goodWhen: 'up', how: 'Оплаченные услуги и допродажи минус скидки, по дате визита.' },
  profit: { title: 'Прибыль', format: 'money', goodWhen: 'up', how: 'Выручка минус зарплаты, аренда, материалы, реклама, эквайринг, прочие расходы и налоги.' },
  load: { title: 'Загрузка', format: 'pct', goodWhen: 'up', how: 'Занятые часы мощности к доступным: кресла, посты или залы, умноженные на часы работы.' },
  noshow: { title: 'Неявки', format: 'pct', goodWhen: 'down', how: 'Записанные клиенты, которые не пришли, к числу всех записанных.' },
  check: { title: 'Средний чек', format: 'rub', goodWhen: 'up', how: 'Выручка к числу оплаченных визитов; в группах — к числу людей.' },
  roi: { title: 'Окупаемость рекламы', format: 'x', goodWhen: 'up', how: 'Выручка с платных каналов по последнему касанию к расходу на них.' },
  prime: { title: 'Свободные прайм-часы', format: 'hours', goodWhen: 'down', series: false, how: 'Незанятые часы в самое спросовое время на ближайшую неделю: мощность точки умноженная на пустую долю прайм-ячеек.' },
  newClients: { title: 'Пришли впервые', format: 'int', goodWhen: 'up', how: 'Люди, у которых это первый визит в сеть, по карточкам клиентов в системе записи.' },
  returning: { title: 'Вернулись', format: 'int', goodWhen: 'up', how: 'Визиты людей, которые уже бывали у вас раньше.' },
  multiLoc: { title: 'Ходят в несколько точек', format: 'int', goodWhen: 'up', series: false, how: 'Вернувшиеся клиенты, у которых за последний год есть визиты в разные точки сети.' },
  unique: { title: 'Разных клиентов', format: 'int', goodWhen: 'up', series: false, how: 'Сколько разных людей пришло за период: каждый считается один раз, сколько бы визитов ни было.' },
  sleeping: { title: 'Спящие клиенты', format: 'int', goodWhen: 'down', series: false, how: 'Были за последний год, но не пришли за два своих обычных интервала между визитами.' },
  repeatShare: { title: 'Доля повторных', format: 'pct', goodWhen: 'up', how: 'Вернувшиеся среди всех пришедших за период.' },
  ...COSTS,
};

export const isMetric = (k: string): k is MetricKey => k in METRICS;

/** Окупаемость рекламы: выручка платных каналов (последнее касание) к их расходу. Одна функция для плитки и панели. */
export function adReturn(ds: Dataset, f: LocFilter, win: Win): number {
  const paid = channelRows(ds, f, win, 'last').filter((r) => r.spend > 0);
  const spend = paid.reduce((s, r) => s + r.spend, 0);
  return spend ? paid.reduce((s, r) => s + r.revenue, 0) / spend : 0;
}

/** Значение показателя за окно — для сети или точки. */
export function metricValue(ds: Dataset, f: LocFilter, win: Win, key: MetricKey): number {
  const t = totals(ds, f, win);
  switch (key) {
    case 'revenue': return t.revenue;
    case 'profit': return pnl(ds, f, win).profit;
    case 'load': return loadOf(t);
    case 'noshow': return noShowOf(t);
    case 'check': return avgCheck(ds, t);
    case 'roi': return adReturn(ds, f, win);
    case 'prime': return freePrime(ds, f, win).hours;
    case 'newClients': return t.newClients;
    case 'returning': return t.visits - t.newClients;
    case 'repeatShare': return t.visits ? (t.visits - t.newClients) / t.visits : 0;
    case 'multiLoc': case 'unique': case 'sleeping': return clientStats(ds, f, win)[key];
    default: return pnl(ds, f, win)[key];
  }
}

/** Ряд показателя по дням (или по неделям, если окно длиннее 35 дней). */
export function metricSeries(ds: Dataset, f: LocFilter, [from, to]: Win, key: MetricKey): { starts: number[]; values: number[] } {
  const step = to - from > 35 ? 7 : 1;
  const starts: number[] = [];
  const values: number[] = [];
  for (let i = from; i < to; i += step) {
    starts.push(i);
    values.push(metricValue(ds, f, [i, Math.min(to, i + step)], key));
  }
  return { starts, values };
}

/** Показатель по каждой точке — кто тянет вверх, кто вниз. */
export function metricByLoc(ds: Dataset, win: Win, key: MetricKey): { loc: LocKey; name: string; value: number }[] {
  return ds.profile.locations.map((l) => ({ loc: l.key, name: l.name, value: metricValue(ds, l.key, win, key) }));
}
