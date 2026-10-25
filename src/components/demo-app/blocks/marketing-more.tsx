'use client';
// Блоки раздела «Маркетинг», часть вторая (m7–m12, x1): поиск, карты, соцсети, промокоды,
// как рано записываются, агрегаторы и планы лечения клиники.
import { useState, type ComponentType } from 'react';
import { Block, Seg } from '@/components/dash/kit/Block';
import { Stat } from '@/components/dash/kit/Stat';
import { DataTable, type Column } from '@/components/dash/kit/DataTable';
import { Trend } from '@/components/dash/charts/Trend';
import { BarList } from '@/components/dash/charts/BarList';
import { Columns } from '@/components/dash/charts/Columns';
import { Donut } from '@/components/dash/charts/Donut';
import { Funnel } from '@/components/dash/charts/Funnel';
import type { Tone } from '@/components/dash/charts/Tip';
import { fmt, plural } from '@/components/dash/format';
import { DIRECT_KEY } from '@/lib/demo-app/engine/channels';
import { channelIndex, siteFunnel, type FunnelStep } from '@/lib/demo-app/models/marketing';
import {
  aggregators, leadTime, mapsCards, promoCodes, searchQueries, social, treatmentPlans, LEAD_BINS,
  type AggRow, type LeadRow, type MapsRow, type Mailing, type PromoRow, type QueryRow,
} from '@/lib/demo-app/models/marketing-more';
import { useDrill } from '../drill';
import { sourcesOf, useSlice } from './common';
import { daysText, Dot, indexTone, Lede, orDash, StatOrDash } from './marketing-common';
import type { BlockViewProps } from './index';

const CLICKS: readonly [string, string, string] = ['клик', 'клика', 'кликов'];
const VISITS: readonly [string, string, string] = ['переход', 'перехода', 'переходов'];
const TIMES: readonly [string, string, string] = ['раз', 'раза', 'раз'];
const PLANS: readonly [string, string, string] = ['план', 'плана', 'планов'];
const PEOPLE: readonly [string, string, string] = ['человек', 'человека', 'человек'];
const position = (v: number) => v.toLocaleString('ru-RU', { maximumFractionDigits: 1 });

// ── m7 ──
type QueryScope = 'nonbrand' | 'brand' | 'all';
const SCOPES: readonly (readonly [QueryScope, string])[] = [['nonbrand', 'Без бренда'], ['brand', 'Брендовые'], ['all', 'Все']];

function SearchView({ id, className }: BlockViewProps) {
  const { ds, loc, win, def } = useSlice(id);
  const [scope, setScope] = useState<QueryScope>('nonbrand');
  const m = searchQueries(ds, loc, win);
  const f = siteFunnel(ds, loc, win);
  const visits = f.steps[0]?.value ?? 0;
  const chanceMoney = m.chance && visits ? (m.chance.extraClicks * f.booked * f.check) / visits : 0;
  const rows = m.rows.filter((r) => scope === 'all' || r.brand === (scope === 'brand'));
  const s = scope === 'brand' ? m.brand : scope === 'nonbrand' ? m.nonBrand : m.all;
  const avgPos = s.impressions ? rows.reduce((a, r) => a + r.position * r.impressions, 0) / s.impressions : null;
  const columns: Column<QueryRow>[] = [
    { key: 'q', label: 'Запрос', value: (r) => r.query },
    { key: 'i', label: 'Показы', format: 'int', value: (r) => r.impressions },
    { key: 'c', label: 'Клики', format: 'int', value: (r) => r.clicks },
    { key: 't', label: 'Кликабельность', num: true, value: (r) => orDash(r.ctr, 'pct') },
    { key: 'p', label: 'Позиция', num: true, value: (r) => position(r.position) },
  ];
  return (
    <Block title={def.title} question={def.question} className={className} custom={def.custom} sources={sourcesOf(ds, def)}
      actions={<Seg label="Какие запросы" value={scope} options={SCOPES} onChange={setScope} />}>
      <div className="mk-stack">
        <Lede>
          По названию сети вас находят сразу: <b>{fmt(m.brand.clicks, 'int')}</b> {plural(m.brand.clicks, CLICKS)}, кликабельность {orDash(m.brand.ctr, 'pct')}.
          {m.chance && m.chance.extraClicks > 0 && <> Без бренда больше всего показов у запроса «{m.chance.query}», но ваша средняя позиция {position(m.chance.position)}. Подъём в первую тройку даст около <b>{fmt(m.chance.extraClicks, 'int')}</b> {plural(m.chance.extraClicks, VISITS)}, это примерно <b>{fmt(chanceMoney, 'money')}</b> выручки за период.</>}
        </Lede>
        <div className="mk-kpis">
          <Stat label="Показы" value={s.impressions} format="int" />
          <Stat label="Клики" value={s.clicks} format="int" />
          <StatOrDash label="Кликабельность" value={s.ctr} format="pct" />
          <StatOrDash label="Средняя позиция" value={avgPos} format="rating" note="взвешено по показам" />
        </div>
        <DataTable columns={columns} rows={rows} rowKey={(r) => r.query} caption="Поисковые запросы" />
      </div>
    </Block>
  );
}

// ── m8 ──
function MapsView({ id, className }: BlockViewProps) {
  const { ds, loc, win, prevWin, vs, def } = useSlice(id);
  const { open } = useDrill();
  const m = mapsCards(ds, loc, win, prevWin);
  const weakest = m.rows.length > 1 ? [...m.rows].sort((a, b) => (a.conv ?? 0) - (b.conv ?? 0))[0] : undefined;
  const columns: Column<MapsRow>[] = [
    { key: 'n', label: 'Точка', value: (r) => (r.index < 0 ? r.name : <><Dot tone={indexTone(r.index)} />{r.name}</>) },
    { key: 'v', label: 'Просмотры', format: 'int', value: (r) => r.views },
    { key: 'r', label: 'Маршруты', format: 'int', value: (r) => r.routes },
    { key: 'c', label: 'Звонки', format: 'int', value: (r) => r.calls },
    { key: 's', label: 'На сайт', format: 'int', value: (r) => r.site },
    { key: 'k', label: 'Действуют', num: true, value: (r) => orDash(r.conv, 'pct') },
  ];
  return (
    <Block title={def.title} question={def.question} className={className} custom={def.custom} sources={sourcesOf(ds, def)}>
      <div className="mk-stack">
        <Lede>
          Карточки в {m.platforms.join(' и ')} посмотрели <b>{fmt(m.total.views, 'int')}</b> {plural(m.total.views, TIMES)}: маршрут построили {fmt(m.total.routes, 'int')}, позвонили {fmt(m.total.calls, 'int')}, перешли на сайт {fmt(m.total.site, 'int')}.
          {weakest && <> Реже всего действуют в карточке «{weakest.name}»: <b>{orDash(weakest.conv, 'pct')}</b> просмотров против {orDash(m.total.conv, 'pct')} в среднем. Обычно помогают свежие фото и ответы на отзывы.</>}
        </Lede>
        <div className="mk-kpis">
          <Stat label="Просмотры карточек" value={m.total.views} prev={m.prev.views} format="int" vs={vs} />
          <Stat label="Маршруты" value={m.total.routes} prev={m.prev.routes} format="int" vs={vs} />
          <Stat label="Звонки" value={m.total.calls} prev={m.prev.calls} format="int" vs={vs} />
          <Stat label="Переходы на сайт" value={m.total.site} prev={m.prev.site} format="int" vs={vs} />
        </div>
        <DataTable columns={columns} rows={m.rows} rowKey={(r) => r.key} footer={m.rows.length > 1 ? m.total : undefined}
          onRow={(r) => { if (r.index >= 0) open({ kind: 'loc', key: r.key }); }} caption="Карточки на картах по точкам" />
      </div>
    </Block>
  );
}

// ── m9 ──
function SocialView({ id, className }: BlockViewProps) {
  const { ds, loc, win, def } = useSlice(id);
  const m = social(ds, loc, win);
  const tones: Tone[] = m.platforms.map((p, k) => { const i = channelIndex(ds, p.key); return i >= 0 ? indexTone(i) : k ? 6 : 5; });
  if (tones[0] === tones[1]) tones[1] = 'muted';
  const top = [...m.mailings].sort((a, b) => b.revenue - a.revenue)[0];
  const gained = m.platforms.reduce((s, p) => s + p.gained, 0);
  const client = ds.profile.words.client;
  const weekRows = m.labels.map((label, k) => ({ label, k }));
  return (
    <Block title={def.title} question={def.question} className={className} custom={def.custom} sources={sourcesOf(ds, def)}
      table={{
        columns: [
          { key: 'w', label: 'Неделя с', value: (r: { label: string; k: number }) => r.label },
          ...m.platforms.flatMap((p) => [
            { key: `${p.key}s`, label: `${p.name}: подписчики`, format: 'int' as const, value: (r: { label: string; k: number }) => p.subscribers[r.k] ?? 0 },
            { key: `${p.key}r`, label: `${p.name}: охват`, format: 'int' as const, value: (r: { label: string; k: number }) => p.reach[r.k] ?? 0 },
          ]),
        ],
        rows: weekRows, rowKey: (r) => r.label,
      }}>
      <div className="mk-stack">
        <Lede>
          Рассылки вернули <b>{fmt(m.mailReturned, 'int')} {plural(m.mailReturned, client)}</b> и <b>{fmt(m.mailRevenue, 'money')}</b> выручки.
          {top && <> Больше всего денег у рассылки «{top.name}»: {fmt(top.revenue, 'money')}.</>} За период подписались {fmt(gained, 'int')} {plural(gained, PEOPLE)}.
        </Lede>
        <Trend label="Подписчики по неделям" labels={m.labels} format="int"
          series={m.platforms.map((p, k) => ({ key: p.key, label: `${p.name}: подписчики`, values: p.subscribers, tone: tones[k]! }))} />
        <DataTable caption="Охват за последнюю неделю" rowKey={(r) => r.key} rows={m.platforms}
          columns={[
            { key: 'n', label: 'Площадка', value: (r) => <><Dot tone={tones[m.platforms.indexOf(r)]!} />{r.name}</> },
            { key: 's', label: 'Подписчики', format: 'int', value: (r) => r.subscribers[r.subscribers.length - 1] ?? 0 },
            { key: 'g', label: 'Прирост за период', format: 'int', value: (r) => r.gained },
            { key: 'r', label: 'Охват за неделю', format: 'int', value: (r) => r.reachLast },
          ]} />
        <DataTable caption="Рассылки и автоматизации" rowKey={(r: Mailing) => r.key} rows={m.mailings}
          columns={[
            { key: 'n', label: 'Рассылка', value: (r) => r.name },
            { key: 's', label: 'Отправлено', format: 'int', value: (r) => r.sent },
            { key: 'o', label: 'Открыли', format: 'int', value: (r) => r.opened },
            { key: 'c', label: 'Перешли', format: 'int', value: (r) => r.clicked },
            { key: 'b', label: 'Записались', format: 'int', value: (r) => r.returned },
            { key: 'r', label: 'Выручка', format: 'rub', value: (r) => r.revenue },
          ]} />
      </div>
    </Block>
  );
}

// ── m10 ──
function PromoView({ id, className }: BlockViewProps) {
  const { ds, loc, win, def } = useSlice(id);
  const m = promoCodes(ds, loc, win);
  const best = m.rows[0];
  return (
    <Block title={def.title} question={def.question} className={className} custom={def.custom} sources={sourcesOf(ds, def)}
      table={{
        columns: [
          { key: 'c', label: 'Код', value: (r: PromoRow) => r.code },
          { key: 'a', label: 'Для чего', value: (r) => r.about },
          { key: 'p', label: 'Скидка', format: 'pct', value: (r) => r.pct },
          { key: 'u', label: 'Покупки', format: 'int', value: (r) => r.uses },
          { key: 'd', label: 'Отдали скидкой', format: 'rub', value: (r) => r.discount },
          { key: 'r', label: 'Выручка', format: 'rub', value: (r) => r.revenue },
        ],
        rows: m.rows, rowKey: (r) => r.code,
      }}>
      <div className="mk-stack">
        <Lede>
          Промокоды принесли <b>{fmt(m.revenue, 'money')}</b>, это {fmt(m.share, 'pct')} выручки; скидками по ним отдали <b>{fmt(m.discount, 'money')}</b>.
          {best && <> Лучший код {best.code}, «{best.about}»: {fmt(best.revenue, 'money')}.</>}
        </Lede>
        <BarList format="money" rows={m.rows.map((r) => ({ key: r.code, label: r.code, note: `${r.about}, скидка ${fmt(r.pct, 'pct')}`, value: r.revenue }))} />
      </div>
    </Block>
  );
}

// ── m11 ──
function LeadTimeView({ id, className }: BlockViewProps) {
  const { ds, loc, win, def } = useSlice(id);
  const { open } = useDrill();
  const m = leadTime(ds, loc, win);
  const visit = ds.profile.words.visit;
  const slowest = [...m.rows].filter((r) => r.median !== null).sort((a, b) => b.median! - a.median!)[0];
  const med = m.total.median;
  const columns: Column<LeadRow>[] = [
    { key: 'n', label: 'Канал', value: (r) => (r.index < 0 ? r.name : <><Dot tone={indexTone(r.index)} />{r.name}</>) },
    { key: 'm', label: 'Медиана', num: true, value: (r) => daysText(r.median) },
    { key: 'd', label: 'В тот же день', num: true, value: (r) => orDash(r.sameDay, 'pct') },
    { key: 'w', label: 'За неделю', num: true, value: (r) => orDash(r.week, 'pct') },
    { key: 'p', label: '90% записей за', num: true, value: (r) => daysText(r.p90) },
  ];
  return (
    <Block title={def.title} question={def.question} className={className} custom={def.custom} sources={sourcesOf(ds, def)}
      table={{
        columns: [
          { key: 'b', label: 'За сколько записались', value: (r: { label: string; n: number }) => r.label },
          { key: 'n', label: 'Записи', format: 'int', value: (r) => r.n },
        ],
        rows: LEAD_BINS.map((b, k) => ({ label: b.label, n: m.total.bins[k] ?? 0 })), rowKey: (r) => r.label,
      }}>
      <div className="mk-stack">
        <Lede>
          Половина записывается {med === 0 ? 'в тот же день' : <>за <b>{daysText(med)}</b> до {visit[1]}</>}, а 9 из 10 — не раньше чем за <b>{daysText(m.total.p90)}</b> до {visit[1]}.
          Рекламу к праздникам запускайте за {daysText(m.total.p90)} до даты.
          {slowest && slowest.median !== med && slowest.key !== DIRECT_KEY && <> Дольше всех планируют пришедшие из канала «{slowest.name}»: медиана {daysText(slowest.median)}.</>}
          {slowest && slowest.median !== med && slowest.key === DIRECT_KEY && <> Дольше всех планируют постоянные {ds.profile.words.client[2]}: медиана {daysText(slowest.median)}.</>}
        </Lede>
        <Columns label="За сколько дней записываются" format="int"
          columns={LEAD_BINS.map((b, k) => ({ key: b.key, label: b.label, value: m.total.bins[k] ?? 0, note: `${orDash(m.total.sales ? (m.total.bins[k] ?? 0) / m.total.sales : null, 'pct')} записей` }))} />
        <DataTable columns={columns} rows={m.rows} rowKey={(r) => r.key} footer={m.total}
          onRow={(r) => { if (r.index >= 0 && r.key !== DIRECT_KEY) open({ kind: 'channel', key: r.key }); }} caption="Как рано записываются по каналам" />
      </div>
    </Block>
  );
}

// ── m12 ──
const PARTNER_TONES: readonly Tone[] = ['accent', 'ink'];

function AggregatorsView({ id, className }: BlockViewProps) {
  const { ds, loc, win, def } = useSlice(id);
  const { open } = useDrill();
  const m = aggregators(ds, loc, win);
  const tone = (r: AggRow, k: number): Tone => (r.index >= 0 ? indexTone(r.index) : PARTNER_TONES[k % PARTNER_TONES.length]!);
  const total: AggRow = { key: 'total', name: 'Итого', index: -1, bookings: m.rows.reduce((s, r) => s + r.bookings, 0), revenue: m.revenue, commission: m.commission, rate: m.revenue ? m.commission / m.revenue : null, net: m.revenue - m.commission };
  const columns: Column<AggRow>[] = [
    { key: 'n', label: 'Площадка', value: (r) => (r.key === 'total' ? r.name : <><Dot tone={tone(r, m.rows.indexOf(r))} />{r.name}</>) },
    { key: 'b', label: 'Записи', format: 'int', value: (r) => r.bookings },
    { key: 'r', label: 'Выручка', format: 'rub', value: (r) => r.revenue },
    { key: 'c', label: 'Комиссия', format: 'rub', value: (r) => r.commission },
    { key: 'p', label: 'Ставка', num: true, value: (r) => orDash(r.rate, 'pct') },
    { key: 'e', label: 'Осталось вам', format: 'rub', value: (r) => r.net },
  ];
  return (
    <Block title={def.title} question={def.question} className={className} custom={def.custom} sources={sourcesOf(ds, def)}>
      <div className="mk-stack">
        <Lede>
          Через {m.rows.map((r) => r.name).join(' и ')} пришло <b>{fmt(m.revenue, 'money')}</b>, это {fmt(m.share, 'pct')} выручки.
          Площадкам за это ушло <b>{fmt(m.commission, 'money')}</b>, {orDash(total.rate, 'pct')} от их выручки.
          {m.synthetic && <> В {ds.profile.systems.booking} такие записи сейчас видны как прямые: подключим отчёты партнёров, и они встанут отдельной строкой.</>}
        </Lede>
        <Donut total="Вся выручка" format="money"
          slices={[...m.rows.map((r, k) => ({ key: r.key, label: r.name, value: r.revenue, tone: tone(r, k) })), { key: 'rest', label: 'Напрямую и через свои каналы', value: m.rest, tone: 'muted' as const }]} />
        <DataTable columns={columns} rows={m.rows} rowKey={(r) => r.key} footer={total}
          onRow={(r) => { if (r.index >= 0) open({ kind: 'channel', key: r.key }); }} caption="Агрегаторы и комиссия" />
      </div>
    </Block>
  );
}

// ── x1 ──
const WORST_DOCTORS = 6;
// В реестре вопрос со стрелками; в блоке — словами (стрелки в текстах интерфейса не используем).
const PLANS_QUESTION = 'Сколько пациентов доходит от консультации до оплаты плана и на какую сумму отказных планов';

function TreatmentPlansView({ id, className }: BlockViewProps) {
  const { ds, loc, win, def } = useSlice(id);
  const { open } = useDrill();
  const m = treatmentPlans(ds, loc, win);
  const worst = m.doctors.filter((d) => d.offered > 0).slice(-WORST_DOCTORS).reverse();
  const w = worst[0];
  const locName = (key: string) => ds.profile.locations.find((l) => l.key === key)?.name ?? key;
  const locIdx = (key: string) => ds.profile.locations.findIndex((l) => l.key === key);
  return (
    <Block title={def.title} question={PLANS_QUESTION} className={className} custom={def.custom} sources={sourcesOf(ds, def)}
      table={{
        columns: [
          { key: 'l', label: 'Этап', value: (r: FunnelStep) => r.label },
          { key: 'v', label: 'Пациентов', format: 'int', value: (r) => r.value },
        ],
        rows: m.steps, rowKey: (r) => r.key,
      }}>
      <div className="mk-stack">
        <Lede>
          Пациенты отказались от <b>{fmt(m.rejected, 'int')} {plural(m.rejected, PLANS)}</b> лечения на <b>{fmt(m.rejectedMoney, 'money')}</b>.
          {w && <> Реже всего план принимают на приёмах: {w.name}, {locName(w.loc)} — {orDash(w.rate, 'pct')} против {orDash(m.acceptRate, 'pct')} в среднем.</>}
        </Lede>
        <div className="mk-kpis">
          <Stat label="Отказные планы" value={m.rejectedMoney} format="money" note={`${fmt(m.rejected, 'int')} ${plural(m.rejected, PLANS)}`} />
          <Stat label="Средний план" value={m.avgPlan} format="rub" />
          <StatOrDash label="Принимают план" value={m.acceptRate} format="pct" />
          <Stat label="Оплачены полностью" value={m.full} format="int" note={`частично ${fmt(m.partial, 'int')}`} />
        </div>
        <div className="mk-split">
          <Funnel steps={m.steps} lostLabel="отпало" />
          <div>
            <p className="mk-sub">Где чаще отказываются</p>
            <BarList format="pct" rows={worst.map((d) => ({ key: `${d.loc}-${d.name}`, label: d.name, note: locName(d.loc), value: d.rate ?? 0, display: orDash(d.rate, 'pct'), tone: indexTone(locIdx(d.loc)), onClick: () => open({ kind: 'staff', key: d.name }) }))} />
          </div>
        </div>
      </div>
    </Block>
  );
}

export const MARKETING_MORE_VIEWS: Record<string, ComponentType<BlockViewProps>> = {
  m7: SearchView,
  m8: MapsView,
  m9: SocialView,
  m10: PromoView,
  m11: LeadTimeView,
  m12: AggregatorsView,
  x1: TreatmentPlansView,
};
