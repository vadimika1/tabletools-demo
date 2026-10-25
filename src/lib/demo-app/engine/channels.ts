// Каналы и атрибуция. Модель перераспределяет заслуги, но продажи и деньги не создаёт:
// вместе со строкой «Прямые и повторные» каналы всегда дают ровно все оплаченные записи.
import { totals, type Dataset } from './dataset.ts';
import { jitter, rng, seedOf, splitInt } from './random.ts';
import type { ChannelDef, LocFilter, Model, Win } from './types.ts';

export const MODELS: Record<Model, { name: string; hint: string }> = {
  last: { name: 'Последнее касание', hint: 'Продажа засчитана каналу, после которого клиент записался.' },
  nondirect: { name: 'Последнее значимое', hint: 'Прямые заходы и повторные записи отдаются последнему каналу, который привёл клиента раньше.' },
  first: { name: 'Первое касание', hint: 'Продажа засчитана каналу, с которого клиент узнал о вас впервые.' },
};

const NONDIRECT_UPLIFT = 1.25; // сколько прямых заходов модель «значимого» возвращает каналам
export const DIRECT_KEY = 'direct';

export interface CampaignRow { name: string; spend: number; sales: number; revenue: number }

export interface ChannelRow {
  key: string;
  name: string;
  group: ChannelDef['group'] | 'direct';
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  sales: number;
  revenue: number;
  roi: number | null; // выручка / расход
  cac: number | null; // расход / продажа
  cpl: number | null; // расход / заявка
  campaigns: CampaignRow[];
}

const SHARE_WOBBLE = 0.12; // доля канала от периода к периоду гуляет на ±12%, как у живой рекламы

/** Доли каналов за окно: база из профиля с колебанием, зависящим от окна (одинаковым для всех моделей). */
function periodShares(ds: Dataset, win: Win): number[] {
  const r = rng(seedOf(ds.profile.key, 'shares', win[0], win[1]));
  return ds.profile.channels.map((c) => c.share * jitter(r, SHARE_WOBBLE));
}

function weights(channels: readonly ChannelDef[], shares: readonly number[], model: Model): number[] {
  const base = shares.reduce((s, v) => s + v, 0);
  if (model === 'last') return [...shares];
  if (model === 'nondirect') return shares.map((v) => v * NONDIRECT_UPLIFT);
  const raw = channels.map((c, k) => shares[k]! * c.firstBias);
  const sum = raw.reduce((s, v) => s + v, 0);
  return raw.map((v) => (v / sum) * base);
}

const per = (a: number, b: number) => (a && b ? a / b : null);

export function channelRows(ds: Dataset, f: LocFilter, win: Win, model: Model): ChannelRow[] {
  const { channels } = ds.profile;
  const t = totals(ds, f, win);
  const w = weights(channels, periodShares(ds, win), model);
  const direct = Math.max(0, 1 - w.reduce((s, v) => s + v, 0));
  const sales = splitInt(t.served, [...w, direct]);
  const revenue = splitInt(t.revenue, sales);

  const rows: ChannelRow[] = channels.map((c, k) => {
    const s = sales[k]!;
    const leads = Math.round(s / c.leadConv);
    const clicks = Math.round(leads / c.clickConv);
    const spend = t.spend[k]!;
    const campSales = splitInt(s, c.campaigns.map((x) => x.salesShare));
    const campRevenue = splitInt(revenue[k]!, campSales);
    const campSpend = splitInt(spend, c.campaigns.map((x) => x.spendShare));
    return {
      key: c.key, name: c.name, group: c.group, spend,
      impressions: c.ctr ? Math.round(clicks / c.ctr) : 0,
      clicks, leads, sales: s, revenue: revenue[k]!,
      roi: per(revenue[k]!, spend), cac: per(spend, s), cpl: per(spend, leads),
      campaigns: c.campaigns.map((x, j) => ({ name: x.name, spend: campSpend[j]!, sales: campSales[j]!, revenue: campRevenue[j]! })),
    };
  });
  const k = channels.length;
  rows.push({
    key: DIRECT_KEY, name: 'Прямые и повторные', group: 'direct', spend: 0, impressions: 0, clicks: 0,
    leads: sales[k]!, sales: sales[k]!, revenue: revenue[k]!, roi: null, cac: null, cpl: null, campaigns: [],
  });
  return rows;
}
