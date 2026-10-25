'use client';
// Блоки раздела «Обзор». Эталон для остальных разделов: данные — через useSlice и движок,
// тексты по умолчанию — из реестра, «Под вас» — def.custom, у графика есть табличный двойник.
import type { ComponentType } from 'react';
import { Block } from '@/components/dash/kit/Block';
import { Stat } from '@/components/dash/kit/Stat';
import { Trend } from '@/components/dash/charts/Trend';
import { avgCheck, daily, loadOf, noShowOf, spendOf, weekly } from '@/lib/demo-app/engine/dataset';
import { pnl } from '@/lib/demo-app/engine/money';
import { adReturn } from '@/lib/demo-app/models/drill';
import { shortDate } from '@/lib/demo-app/engine/calendar';
import { useDemo } from '../state';
import { useDrill } from '../drill';
import { sourcesOf, useSlice } from './common';
import type { BlockViewProps } from './index';

function MainFigures({ id, className }: BlockViewProps) {
  const { ds, loc, win, prevWin, vs, t, tp, def } = useSlice(id);
  const { open } = useDrill();
  const p = pnl(ds, loc, win);
  const pp = pnl(ds, loc, prevWin);
  const spark = weekly(daily(ds, loc, win, (d) => d.revenue));
  const roi = adReturn(ds, loc, win);
  const roiPrev = adReturn(ds, loc, prevWin);
  const drill = (key: string) => () => open({ kind: 'metric', key });
  return (
    <section className={`${className} ds-stats is-row`} aria-label={def.title} data-tour="figures">
      <Stat hero dark label="Выручка" value={t.revenue} prev={tp.revenue} format="money" vs={vs} spark={spark.length > 1 ? spark : daily(ds, loc, win, (d) => d.revenue)} onClick={drill('revenue')} custom={def.custom} />
      <Stat label="Прибыль" value={p.profit} prev={pp.profit} format="money" vs={vs} onClick={drill('profit')} note={`маржа ${Math.round(p.margin * 100)}%`} />
      <Stat label="Загрузка" value={loadOf(t)} prev={loadOf(tp)} format="pct" vs={vs} onClick={drill('load')} />
      <Stat label="Неявки" value={noShowOf(t)} prev={noShowOf(tp)} format="pct" vs={vs} goodWhen="down" onClick={drill('noshow')} />
      <Stat label="Средний чек" value={avgCheck(ds, t)} prev={avgCheck(ds, tp)} format="rub" vs={vs} onClick={drill('check')} />
      <Stat label="Реклама окупилась" value={roi} prev={roiPrev} format="x" vs={vs} onClick={drill('roi')} note={`расход ${Math.round(spendOf(t) / 1000).toLocaleString('ru-RU')} тыс. ₽`} />
    </section>
  );
}

interface DayRow { label: string; cur: number; prev: number }

function RevenueTrend({ id, className }: BlockViewProps) {
  const { ds, loc, win, prevWin, def } = useSlice(id);
  const { period } = useDemo();
  const byWeek = period === 'quarter' || period === 'year';
  const curD = daily(ds, loc, win, (d) => d.revenue);
  const prevD = daily(ds, loc, prevWin, (d) => d.revenue);
  const cur = byWeek ? weekly(curD) : curD;
  const prev = byWeek ? weekly(prevD) : prevD;
  const step = byWeek ? 7 : 1;
  const labels = cur.map((_, k) => `${byWeek ? 'нед. с ' : ''}${shortDate(ds.anchor, win[0] + k * step)}`);
  const first = ds.profile.locations[0]!.key;
  const shade = byWeek ? undefined : cur.map((_, k) => ds.days[first]![win[0] + k]!.weekday >= 5);
  const rows: DayRow[] = labels.map((label, k) => ({ label, cur: cur[k]!, prev: prev[k] ?? 0 }));
  return (
    <Block
      title={byWeek ? 'Выручка по неделям' : def.title}
      question={def.question}
      className={className}
      custom={def.custom}
      sources={sourcesOf(ds, def)}
      table={{
        columns: [
          { key: 'd', label: byWeek ? 'Неделя' : 'День', value: (r: DayRow) => r.label },
          { key: 'c', label: 'Выручка', format: 'rub', value: (r) => r.cur },
          { key: 'p', label: 'Период сравнения', format: 'rub', value: (r) => r.prev },
        ],
        rows,
        rowKey: (r) => r.label,
      }}
    >
      <Trend
        label={`Выручка ${byWeek ? 'по неделям' : 'по дням'}`}
        labels={labels}
        format="rub"
        shade={shade}
        series={[
          { key: 'cur', label: 'Этот период', values: cur, tone: 1 },
          { key: 'prev', label: 'Период сравнения', values: prev, tone: 'muted', thin: true },
        ]}
      />
    </Block>
  );
}

export const OVERVIEW_VIEWS: Record<string, ComponentType<BlockViewProps>> = {
  o1: MainFigures,
  o4: RevenueTrend,
};
