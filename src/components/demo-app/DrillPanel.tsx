'use client';
// Панель детализации справа: что стоит за цифрой, по которой кликнули. Строится из тех же функций,
// что и блоки, поэтому числа совпадают. Внутри можно перейти глубже: из точки — к сотруднику.
import { memo, type ReactNode } from 'react';
import { Overlay } from '@/components/overlay/Overlay';
import { Stat } from '@/components/dash/kit/Stat';
import { Trend } from '@/components/dash/charts/Trend';
import { BarList } from '@/components/dash/charts/BarList';
import { Funnel } from '@/components/dash/charts/Funnel';
import { Waterfall } from '@/components/dash/charts/Waterfall';
import { DataTable } from '@/components/dash/kit/DataTable';
import { CUSTOM_DEFAULT } from '@/components/dash/kit/Custom';
import { fmt } from '@/components/dash/format';
import { avgCheck, daily, loadOf, missedOf, noShowOf, totals, type Dataset } from '@/lib/demo-app/engine/dataset';
import { pnl, PNL_LINES } from '@/lib/demo-app/engine/money';
import { channelRows, type CampaignRow } from '@/lib/demo-app/engine/channels';
import { staffRows, type StaffRow } from '@/lib/demo-app/engine/ops';
import { shortDate } from '@/lib/demo-app/engine/calendar';
import { METRICS, isMetric, metricByLoc, metricSeries, metricValue } from '@/lib/demo-app/models/drill';
import type { Win } from '@/lib/demo-app/engine/types';
import { useDemo } from './state';
import { useDrill, type DrillTarget } from './drill';

interface Ctx { ds: Dataset; win: Win; prevWin: Win; vs: string; loc: string }

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section className="dm-drill-sec"><h3>{title}</h3>{children}</section>;
}

function labelsFor(ds: Dataset, starts: number[], weekly: boolean) {
  return starts.map((i) => `${weekly ? 'нед. с ' : ''}${shortDate(ds.anchor, i)}`);
}

function MetricDrill({ c, k }: { c: Ctx; k: string }) {
  const { open } = useDrill();
  if (!isMetric(k)) return <p>Нет такого показателя.</p>;
  const m = METRICS[k];
  const hasSeries = m.series !== false;
  const cur = hasSeries ? metricSeries(c.ds, c.loc, c.win, k) : null;
  const prev = hasSeries ? metricSeries(c.ds, c.loc, c.prevWin, k) : null;
  const weekly = c.win[1] - c.win[0] > 35;
  const byLoc = metricByLoc(c.ds, c.win, k).sort((a, b) => (m.goodWhen === 'up' ? b.value - a.value : a.value - b.value));
  return (
    <>
      <div className="ds-stats">
        <Stat hero label={c.loc === 'all' ? 'Вся сеть за период' : `${c.ds.profile.locations.find((l) => l.key === c.loc)?.name ?? ''} за период`} value={metricValue(c.ds, c.loc, c.win, k)} prev={metricValue(c.ds, c.loc, c.prevWin, k)} format={m.format} vs={c.vs} goodWhen={m.goodWhen} />
      </div>
      {cur && prev && (
        <Section title={weekly ? 'По неделям' : 'По дням'}>
          <Trend label={m.title} labels={labelsFor(c.ds, cur.starts, weekly)} format={m.format}
            series={[{ key: 'c', label: 'Этот период', values: cur.values, tone: 1 }, { key: 'p', label: 'Период сравнения', values: prev.values, tone: 'muted', thin: true }]} />
        </Section>
      )}
      <Section title="По точкам">
        <BarList format={m.format} rows={byLoc.map((r) => ({ key: r.loc, label: r.name, value: r.value, onClick: () => open({ kind: 'loc', key: r.loc }) }))} />
      </Section>
      <Section title="Как считаем"><p>{m.how}</p></Section>
    </>
  );
}

function LocDrill({ c, k }: { c: Ctx; k: string }) {
  const { open, close } = useDrill();
  const { set } = useDemo();
  const l = c.ds.profile.locations.find((x) => x.key === k);
  if (!l) return <p>Нет такой точки.</p>;
  const t = totals(c.ds, k, c.win);
  const tp = totals(c.ds, k, c.prevWin);
  const p = pnl(c.ds, k, c.win);
  const pp = pnl(c.ds, k, c.prevWin);
  const cur = metricSeries(c.ds, k, c.win, 'revenue');
  const prev = metricSeries(c.ds, k, c.prevWin, 'revenue');
  const weekly = c.win[1] - c.win[0] > 35;
  const staff = staffRows(c.ds, k, c.win).sort((a, b) => b.revenue - a.revenue);
  const handleScope = () => { set({ loc: k }); close(); };
  return (
    <>
      <div className="ds-stats">
        <Stat label="Выручка" value={t.revenue} prev={tp.revenue} format="money" vs={c.vs} />
        <Stat label="Прибыль" value={p.profit} prev={pp.profit} format="money" vs={c.vs} />
        <Stat label="Загрузка" value={loadOf(t)} prev={loadOf(tp)} format="pct" vs={c.vs} />
        <Stat label="Неявки" value={noShowOf(t)} prev={noShowOf(tp)} format="pct" vs={c.vs} goodWhen="down" />
        <Stat label="Средний чек" value={avgCheck(c.ds, t)} prev={avgCheck(c.ds, tp)} format="rub" vs={c.vs} />
        <Stat label="Звонков пропущено" value={missedOf(t)} prev={missedOf(tp)} format="pct" vs={c.vs} goodWhen="down" />
      </div>
      <Section title="Выручка">
        <Trend label={`Выручка: ${l.name}`} labels={labelsFor(c.ds, cur.starts, weekly)} format="rub"
          series={[{ key: 'c', label: 'Этот период', values: cur.values, tone: 1 }, { key: 'p', label: 'Период сравнения', values: prev.values, tone: 'muted', thin: true }]} />
      </Section>
      <Section title="Как сложилась прибыль">
        <Waterfall steps={[{ key: 'r', label: 'Выручка', value: p.revenue, kind: 'total' }, ...PNL_LINES.map((x) => ({ key: x.key, label: x.name, value: p[x.key], kind: 'cost' as const })), { key: 'p', label: 'Прибыль', value: p.profit, kind: 'result' }]} />
      </Section>
      <Section title="Сотрудники">
        <BarList format="money" rows={staff.map((s) => ({ key: s.name, label: s.name, note: `загрузка ${Math.round(s.load * 100)}%`, value: s.revenue, onClick: () => open({ kind: 'staff', key: s.name }) }))} />
      </Section>
      <button type="button" className="btn btn-ink dm-drill-scope" onClick={handleScope}>Показать весь дашборд по точке «{l.name}»</button>
    </>
  );
}

function StaffDrill({ c, k }: { c: Ctx; k: string }) {
  const rows = staffRows(c.ds, 'all', c.win);
  const me = rows.find((r) => r.name === k);
  if (!me) return <p>Нет такого сотрудника.</p>;
  const mates = rows.filter((r) => r.loc === me.loc);
  const avg = (f: (r: StaffRow) => number) => mates.reduce((s, r) => s + f(r), 0) / mates.length;
  const loc = c.ds.profile.locations.find((l) => l.key === me.loc)!;
  const lag = c.ds.profile.story.lagging.loc === me.loc && [...mates].sort((a, b) => a.revenue - b.revenue)[0]?.name === me.name;
  return (
    <>
      <p className="dm-drill-sub">{me.role}, {loc.name}</p>
      <div className="ds-stats">
        <Stat label="Выручка" value={me.revenue} prev={avg((r) => r.revenue)} vs="среднему по точке" format="money" />
        <Stat label="Записи" value={me.bookings} prev={avg((r) => r.bookings)} vs="среднему по точке" format="int" />
        <Stat label="Загрузка" value={me.load} prev={avg((r) => r.load)} vs="среднему по точке" format="pct" />
        <Stat label="Средний чек" value={me.check} prev={avg((r) => r.check)} vs="среднему по точке" format="rub" />
        <Stat label="Возвращаются" value={me.returning} prev={avg((r) => r.returning)} vs="среднему по точке" format="pct" />
      </div>
      {lag && (
        <Section title="Что видно">
          <p>Меньше всех в точке по выручке: {fmt(avg((r) => r.revenue) - me.revenue, 'money')} до среднего за период. Обычно причина в расписании: мало прайм-часов в сменах или длинные окна между записями.</p>
        </Section>
      )}
    </>
  );
}

function ChannelDrill({ c, k, model }: { c: Ctx; k: string; model: Parameters<typeof channelRows>[3] }) {
  const row = channelRows(c.ds, c.loc, c.win, model).find((r) => r.key === k);
  if (!row) return <p>Нет такого канала.</p>;
  return (
    <>
      <div className="ds-stats">
        <Stat label="Расход" value={row.spend} format="money" />
        <Stat label="Продажи" value={row.sales} format="int" />
        <Stat label="Выручка" value={row.revenue} format="money" />
        <Stat label="Окупаемость" value={row.roi ?? 0} format="x" note={row.roi === null ? 'бесплатный канал' : undefined} />
      </div>
      {row.impressions > 0 && (
        <Section title="От показа до продажи">
          <Funnel steps={[{ key: 'i', label: 'Показы', value: row.impressions }, { key: 'c', label: 'Переходы', value: row.clicks }, { key: 'l', label: 'Заявки', value: row.leads }, { key: 's', label: 'Продажи', value: row.sales }]} />
        </Section>
      )}
      {row.campaigns.length > 0 && (
        <Section title="Кампании">
          <DataTable<CampaignRow> rowKey={(r) => r.name} rows={row.campaigns} columns={[
            { key: 'n', label: 'Кампания', value: (r) => r.name },
            { key: 's', label: 'Расход', format: 'rub', value: (r) => r.spend },
            { key: 'p', label: 'Продажи', format: 'int', value: (r) => r.sales },
            { key: 'r', label: 'Выручка', format: 'rub', value: (r) => r.revenue },
            { key: 'o', label: 'Окупаемость', value: (r) => (r.spend ? fmt(r.revenue / r.spend, 'x') : '—'), num: true },
          ]} />
        </Section>
      )}
    </>
  );
}

function ServiceDrill({ c, k }: { c: Ctx; k: string }) {
  const { open } = useDrill();
  const idx = c.ds.profile.services.findIndex((s) => s.key === k);
  const s = c.ds.profile.services[idx];
  if (!s) return <p>Нет такой услуги.</p>;
  const cur = daily(c.ds, c.loc, c.win, (d) => d.services[idx] ?? 0);
  const prev = daily(c.ds, c.loc, c.prevWin, (d) => d.services[idx] ?? 0);
  const sum = (a: number[]) => a.reduce((x, v) => x + v, 0);
  const t = totals(c.ds, c.loc, c.win);
  const byLoc = c.ds.profile.locations.map((l) => ({ key: l.key, label: l.name, value: totals(c.ds, l.key, c.win).services[idx] ?? 0 }));
  return (
    <>
      <div className="ds-stats">
        <Stat label="Записей" value={sum(cur)} prev={sum(prev)} vs={c.vs} format="int" />
        <Stat label="Доля записей" value={t.bookings ? sum(cur) / t.bookings : 0} format="pct" />
        <Stat label="Цена" value={s.price} format="rub" note={`${s.hours} ч на запись`} />
      </div>
      <Section title="Записи по дням">
        <Trend label={s.name} labels={cur.map((_, i) => shortDate(c.ds.anchor, c.win[0] + i))} format="int" fromZero
          series={[{ key: 'c', label: 'Этот период', values: cur, tone: 1 }, { key: 'p', label: 'Период сравнения', values: prev, tone: 'muted', thin: true }]} />
      </Section>
      <Section title="По точкам">
        <BarList format="int" rows={byLoc.map((r) => ({ ...r, onClick: () => open({ kind: 'loc', key: r.key }) }))} />
      </Section>
    </>
  );
}

function titleOf(ds: Dataset, t: DrillTarget): string {
  switch (t.kind) {
    case 'metric': return isMetric(t.key) ? METRICS[t.key].title : 'Показатель';
    case 'loc': return ds.profile.locations.find((l) => l.key === t.key)?.name ?? 'Точка';
    case 'channel': return ds.profile.channels.find((x) => x.key === t.key)?.name ?? (t.key === 'direct' ? 'Прямые и повторные' : 'Канал');
    case 'service': return ds.profile.services.find((x) => x.key === t.key)?.name ?? 'Услуга';
    default: return t.key;
  }
}

/** memo: панель не пересчитывает графики, когда перерисовывается оболочка (например, открыли меню). */
export const DrillPanel = memo(function DrillPanel() {
  const { target, close } = useDrill();
  const { ds, win, prevWin, vs, loc, model } = useDemo();
  if (!ds || !target) return null;
  const c: Ctx = { ds, win, prevWin, vs, loc };
  return (
    <Overlay open onClose={close} kind="drawer" labelledBy="drill-h">
      <div className="ds dm-drill">
        <p className="dm-drill-kicker">{shortDate(ds.anchor, win[0])} — {shortDate(ds.anchor, win[1] - 1)}, изменения — к {vs}</p>
        <h2 id="drill-h">{titleOf(ds, target)}</h2>
        {target.kind === 'metric' && <MetricDrill c={c} k={target.key} />}
        {target.kind === 'loc' && <LocDrill c={c} k={target.key} />}
        {target.kind === 'staff' && <StaffDrill c={c} k={target.key} />}
        {(target.kind === 'channel' || target.kind === 'campaign') && <ChannelDrill c={c} k={target.kind === 'campaign' ? target.key.split('.')[0] ?? '' : target.key} model={model} />}
        {target.kind === 'service' && <ServiceDrill c={c} k={target.key} />}
        <p className="dm-drill-custom">{CUSTOM_DEFAULT}</p>
      </div>
    </Overlay>
  );
});
