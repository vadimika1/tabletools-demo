'use client';
// Блоки раздела «Финансы»: каскад прибыли, структура расходов, юнит-экономика — здесь;
// P&L по точкам, деньги вперёд, скидки, партнёры и отраслевые — в соседних файлах.
// Все цифры — из моделей lib/demo-app/models, текст отвечает на вопрос блока деньгами.
import type { ComponentType } from 'react';
import { Block } from '@/components/dash/kit/Block';
import { DataTable } from '@/components/dash/kit/DataTable';
import { Delta } from '@/components/dash/kit/Stat';
import { Waterfall, type WfStep } from '@/components/dash/charts/Waterfall';
import { Donut } from '@/components/dash/charts/Donut';
import type { Tone } from '@/components/dash/charts/Tip';
import { fmt } from '@/components/dash/format';
import { PNL_LINES, type CostKey } from '@/lib/demo-app/engine/money';
import { OTHER_KEY, costStructure, profitCascade, unitEconomics, type CostSlice, type UnitKey, type UnitRow } from '@/lib/demo-app/models/finance';
import type { Dataset } from '@/lib/demo-app/engine/dataset';
import { useDrill } from '../drill';
import { sourcesOf, useSlice } from './common';
import { lc, orDash, signedPp } from './money-kit';
import { PnlByLocation } from './finance-pnl';
import { CashWeeks, DiscountsDebts, Partners } from './finance-more';
import { Memberships, PartsInCheck } from './finance-industry';
import type { BlockViewProps } from './index';

// ── f1: как сложилась прибыль ──

interface StepRow { key: string; label: string; value: number; share: number | null; prev: number }

function ProfitCascade({ id, className }: BlockViewProps) {
  const { ds, loc, win, prevWin, vs, def } = useSlice(id);
  const { open } = useDrill();
  const c = profitCascade(ds, loc, win, prevWin);
  const { pnl: p, prev } = c;
  const handlePick = (s: WfStep) => open({ kind: 'metric', key: s.key });
  const rows: StepRow[] = c.steps.map((s) => ({
    key: s.key, label: s.label, value: s.value,
    share: p.revenue ? s.value / p.revenue : null,
    prev: s.key === 'revenue' ? prev.revenue : s.key === 'profit' ? prev.profit : prev[s.key],
  }));
  return (
    <Block
      title={def.title}
      question={def.question}
      className={className}
      custom={def.custom}
      sources={sourcesOf(ds, def)}
      table={{
        columns: [
          { key: 'l', label: 'Статья', value: (r: StepRow) => r.label },
          { key: 'v', label: 'Сумма', format: 'rub', value: (r) => r.value },
          { key: 's', label: 'Доля выручки', num: true, value: (r) => orDash(r.share, 'pct') },
          { key: 'p', label: 'Период сравнения', format: 'rub', value: (r) => r.prev },
        ],
        rows,
        rowKey: (r) => r.key,
      }}
    >
      <div className="bf-stack">
        <p className="bf-note">
          Из {fmt(p.revenue, 'money')} выручки осталось <b>{fmt(p.profit, 'money')}</b>, маржа {fmt(p.margin, 'pct')}.{' '}
          {c.marginDiff === null
            ? `Сравнить маржу не с чем: к ${vs} выручки не было.`
            : `К ${vs} маржа ${Math.abs(c.marginDiff) < 0.001 ? 'не изменилась' : `${c.marginDiff > 0 ? 'выросла' : 'снизилась'} на ${fmt(Math.abs(c.marginDiff), 'pp')}`}.`.replace(/\.\.$/, '.')}
          {c.grew && ` Сильнее всего подросла статья «${c.grew.name}»: ${signedPp(c.grew.diff)} от выручки.`}
        </p>
        <Waterfall steps={c.steps} onPick={handlePick} />
        <p className="bf-hint">Нажмите на статью, чтобы открыть её разбивку.</p>
      </div>
    </Block>
  );
}

// ── f3: структура расходов ──

// Цвет статьи закреплён за ней, а не за местом в рейтинге.
const COST_TONE: Record<CostKey, Tone> = { payroll: 1, rent: 2, materials: 3, ads: 4, other: 5, taxes: 6, acquiring: 'ink' };
const sliceTone = (s: CostSlice): Tone => (s.key === OTHER_KEY ? 'muted' : COST_TONE[s.key as CostKey]);

function CostStructure({ id, className }: BlockViewProps) {
  const { ds, loc, win, def } = useSlice(id);
  const { open } = useDrill();
  const c = costStructure(ds, loc, win);
  const [top, second] = c.slices;
  const kept = c.revenue ? (c.revenue - c.total) / c.revenue : null;
  const per100 = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)} ₽`);
  const handleRow = (s: CostSlice) => { if (s.key !== OTHER_KEY) open({ kind: 'metric', key: s.key }); };
  const columns = [
    { key: 'n', label: 'Статья', value: (s: CostSlice) => (s.key === OTHER_KEY ? `Прочее: ${s.lines.map((k) => lc(PNL_LINES.find((l) => l.key === k)!.name)).join(', ')}` : s.name) },
    { key: 'v', label: 'Сумма', format: 'rub' as const, value: (s: CostSlice) => s.value },
    { key: 'r', label: 'От выручки', num: true, value: (s: CostSlice) => orDash(s.ofRevenue, 'pct') },
  ];
  return (
    <Block
      title={def.title}
      question={def.question}
      className={className}
      custom={def.custom}
      sources={sourcesOf(ds, def)}
      table={{ columns: [...columns, { key: 'c', label: 'Доля расходов', format: 'pct', value: (s: CostSlice) => s.ofCosts }], rows: c.slices, rowKey: (s) => s.key }}
    >
      <div className="bf-stack">
        {top && (
          <p className="bf-note">
            Из каждых 100 ₽ выручки {per100(top.ofRevenue)} уходит на {lc(top.name)}
            {second ? `, ${per100(second.ofRevenue)} — на ${lc(second.name)}` : ''}. Прибылью остаётся <b>{per100(kept)}</b>.
          </p>
        )}
        <Donut total="Все расходы" format="money" slices={c.slices.map((s) => ({ key: s.key, label: s.name, value: s.value, tone: sliceTone(s) }))} />
        <DataTable columns={columns} rows={c.slices} rowKey={(s) => s.key} onRow={handleRow} caption="Статьи расходов: сумма и доля от выручки" />
      </div>
    </Block>
  );
}

// ── f4: юнит-экономика ──

function unitText(ds: Dataset, key: UnitKey): { label: string; grain: string } {
  const w = ds.profile.words;
  switch (key) {
    case 'check': return { label: 'Средний чек', grain: ds.profile.checkBasis === 'visit' ? `с ${w.client[1]} за посещение` : `на ${w.visit[0]}` };
    case 'perHour': return { label: 'Выручка на час мощности', grain: `за занятый час ${w.unit[1]}` };
    case 'perClient': return { label: `Выручка с ${w.client[1]}`, grain: 'за период, все визиты вместе' };
    case 'adShare': return { label: 'Доля рекламы в выручке', grain: 'расход на рекламу к выручке' };
    case 'payrollShare': return { label: 'Зарплаты к выручке', grain: 'вместе с окладами администраторов' };
    case 'profitPerBooking': return { label: 'Прибыль с записи', grain: 'после зарплат, материалов, эквайринга и налога' };
  }
}

function UnitEconomics({ id, className }: BlockViewProps) {
  const { ds, loc, win, prevWin, vs, def } = useSlice(id);
  const rows = unitEconomics(ds, loc, win, prevWin);
  const ppb = rows.find((r) => r.key === 'profitPerBooking')?.value ?? null;
  return (
    <Block title={def.title} question={def.question} className={className} custom={def.custom} sources={sourcesOf(ds, def)}>
      <div className="bf-stack">
        {ppb !== null && (
          <p className="bf-note">
            Каждая запись оставляет <b>{fmt(ppb, 'rub')}</b> после переменных расходов — столько стоит одна неявка или пустое окно в расписании.
          </p>
        )}
        <DataTable
          caption="Юнит-экономика"
          rowKey={(r: UnitRow) => r.key}
          rows={rows}
          columns={[
            { key: 'l', label: 'Показатель', value: (r) => { const t = unitText(ds, r.key); return <span className="bf-cell">{t.label}<small>{t.grain}</small></span>; } },
            { key: 'v', label: 'Сейчас', num: true, value: (r) => orDash(r.value, r.format) },
            { key: 'd', label: 'Изменение', value: (r) => (r.value === null ? '—' : <Delta now={r.value} prev={r.prev} vs={vs} goodWhen={r.goodWhen} />) },
          ]}
        />
      </div>
    </Block>
  );
}

export const FINANCE_VIEWS: Record<string, ComponentType<BlockViewProps>> = {
  f1: ProfitCascade,
  f2: PnlByLocation,
  f3: CostStructure,
  f4: UnitEconomics,
  f5: CashWeeks,
  f6: DiscountsDebts,
  f7: Partners,
  x5: Memberships,
  x8: PartsInCheck,
};
