'use client';
// Блоки раздела «Маркетинг», часть первая (m1–m6): реклама, вердикты кампаний, каналы, сайт, услуги, допродажи.
// Данные — из моделей lib/demo-app/models, тексты по умолчанию — из реестра, у графиков есть табличный двойник.
import { useState, type ComponentType } from 'react';
import { Block, Seg } from '@/components/dash/kit/Block';
import { Stat } from '@/components/dash/kit/Stat';
import type { Column } from '@/components/dash/kit/DataTable';
import { DataTable } from '@/components/dash/kit/DataTable';
import { Columns } from '@/components/dash/charts/Columns';
import { Bubbles } from '@/components/dash/charts/Bubbles';
import { Mix } from '@/components/dash/charts/Mix';
import { Funnel } from '@/components/dash/charts/Funnel';
import { BarList } from '@/components/dash/charts/BarList';
import { delta, fmt, plural } from '@/components/dash/format';
import { DIRECT_KEY, type ChannelRow } from '@/lib/demo-app/engine/channels';
import {
  adsByPlatform, campaignVerdicts, channelIndex, channelMix, servicesAbc, siteFunnel, upsells, GROUP_NAMES,
  type AdPeriod, type CampaignPoint, type FunnelStep, type MixRow, type ServiceRow, type UpsellItem, type Verdict,
} from '@/lib/demo-app/models/marketing';
import { useDrill } from '../drill';
import { sourcesOf, useSlice } from './common';
import { Dot, indexTone, Lede, orDash, signedPp, StatOrDash } from './marketing-common';
import { MARKETING_MORE_VIEWS } from './marketing-more';
import type { BlockViewProps } from './index';

const SALES: readonly [string, string, string] = ['продажу', 'продажи', 'продаж'];
const SERVICES: readonly [string, string, string] = ['услуга', 'услуги', 'услуг'];
const VERDICT_NAME: Record<Verdict, string> = { good: 'В плюсе', warn: 'Около нуля', bad: 'В минусе' };
const rubPerRub = (x: number) => `${x.toLocaleString('ru-RU', { maximumFractionDigits: 1 })} ₽`;

// ── m1 ──
type AdMetric = 'spend' | 'revenue';
const AD_METRICS: readonly (readonly [AdMetric, string])[] = [['spend', 'Расход'], ['revenue', 'Выручка с рекламы']];

function AdsByPlatform({ id, className }: BlockViewProps) {
  const { ds, loc, win, prevWin, vs, def } = useSlice(id);
  const { open } = useDrill();
  const [metric, setMetric] = useState<AdMetric>('spend');
  const { now, prev, rows, periods } = adsByPlatform(ds, loc, win, prevWin);
  const dearest = rows.filter((r) => r.cac !== null).sort((a, b) => b.cac! - a.cac!)[0];
  const handleRow = (r: ChannelRow) => { if (r.key !== 'total') open({ kind: 'channel', key: r.key }); };
  const footer: ChannelRow = {
    key: 'total', name: 'Итого', group: 'paid', spend: now.spend, impressions: 0, clicks: rows.reduce((s, r) => s + r.clicks, 0),
    leads: now.leads, sales: now.sales, revenue: now.revenue, roi: now.roi, cac: now.cac, cpl: now.cpl, campaigns: [],
  };
  const columns: Column<ChannelRow>[] = [
    { key: 'n', label: 'Площадка', value: (r) => (r.key === 'total' ? r.name : <><Dot tone={indexTone(channelIndex(ds, r.key))} />{r.name}</>) },
    { key: 's', label: 'Расход', format: 'rub', value: (r) => r.spend },
    { key: 'c', label: 'Переходы', format: 'int', value: (r) => r.clicks },
    { key: 'l', label: 'Заявки', format: 'int', value: (r) => r.leads },
    { key: 'p', label: 'Продажи', format: 'int', value: (r) => r.sales },
    { key: 'r', label: 'Выручка', format: 'rub', value: (r) => r.revenue },
    { key: 'roi', label: 'Окупаемость', num: true, value: (r) => orDash(r.roi, 'x') },
    { key: 'cac', label: 'Цена клиента', num: true, value: (r) => orDash(r.cac, 'rub') },
  ];
  return (
    <Block
      title={def.title} question={def.question} className={className} custom={def.custom} sources={sourcesOf(ds, def)}
      table={{
        columns: [
          { key: 'p', label: 'Период', value: (r: AdPeriod) => (r.partial ? `${r.label}, идёт ${r.days}-й день` : `с ${r.label}`) },
          { key: 's', label: 'Расход', format: 'rub', value: (r) => r.spend },
          { key: 'r', label: 'Выручка с рекламы', format: 'rub', value: (r) => r.revenue },
        ],
        rows: periods, rowKey: (r) => r.key,
      }}
    >
      <div className="mk-stack">
        <Lede>
          {now.roi === null ? 'За период расходов на рекламу нет.' : <>Реклама стоила <b>{fmt(now.spend, 'money')}</b> и принесла <b>{fmt(now.revenue, 'money')}</b> выручки: каждый рубль вернул <b>{rubPerRub(now.roi)}</b>.</>}
          {dearest && <> Дороже всего клиент в {dearest.name}: <b>{fmt(dearest.cac!, 'rub')}</b>.</>}
        </Lede>
        <div className="mk-kpis">
          <Stat label="Расход" value={now.spend} prev={prev.spend} format="money" vs={vs} goodWhen="down" />
          <Stat label="Заявки" value={now.leads} prev={prev.leads} format="int" vs={vs} />
          <StatOrDash label="Цена заявки" value={now.cpl} prev={prev.cpl} format="rub" vs={vs} goodWhen="down" />
          <Stat label="Продажи" value={now.sales} prev={prev.sales} format="int" vs={vs} />
          <StatOrDash label="Цена клиента" value={now.cac} prev={prev.cac} format="rub" vs={vs} goodWhen="down" />
          <StatOrDash label="Окупаемость" value={now.roi} prev={prev.roi} format="x" vs={vs} note="выручка на рубль расхода" />
        </div>
        <div className="mk-bar">
          <span className="mk-sub">13 периодов по четыре недели, последний ещё идёт</span>
          <Seg label="Что показать" value={metric} options={AD_METRICS} onChange={setMetric} />
        </div>
        <Columns
          label={metric === 'spend' ? 'Расход на рекламу по периодам' : 'Выручка с рекламы по периодам'} format="money"
          columns={periods.map((p) => ({ key: p.key, label: p.label, value: p[metric], partial: p.partial, note: p.partial ? `идёт ${p.days}-й день из 28` : metric === 'spend' ? 'расход' : 'выручка с рекламы' }))}
        />
        <DataTable columns={columns} rows={rows} rowKey={(r) => r.key} onRow={handleRow} footer={footer} caption="Площадки: расход, заявки, продажи, окупаемость" />
      </div>
    </Block>
  );
}

// ── m2 ──
function CampaignVerdicts({ id, className }: BlockViewProps) {
  const { ds, loc, win, def } = useSlice(id);
  const { open } = useDrill();
  const v = campaignVerdicts(ds, loc, win);
  const th = v.be.roi ?? 0;
  const top = Math.ceil(Math.max(th * 1.5, ...v.points.map((p) => p.roi)) * 1.1);
  const near = [...v.points].sort((a, b) => a.roi - b.roi)[0];
  const off = v.switchOff;
  return (
    <Block
      title={def.title} question={def.question} className={className} custom={def.custom} sources={sourcesOf(ds, def)}
      table={{
        columns: [
          { key: 'n', label: 'Кампания', value: (r: CampaignPoint) => r.name },
          { key: 'c', label: 'Площадка', value: (r) => r.channel },
          { key: 's', label: 'Расход', format: 'rub', value: (r) => r.spend },
          { key: 'r', label: 'Выручка', format: 'rub', value: (r) => r.revenue },
          { key: 'x', label: 'Окупаемость', format: 'x', value: (r) => r.roi },
          { key: 'p', label: 'Прибыль после рекламы', format: 'rub', value: (r) => r.profit },
          { key: 'v', label: 'Вердикт', value: (r) => VERDICT_NAME[r.verdict] },
        ],
        rows: v.points, rowKey: (r) => r.key, onRow: (r) => open({ kind: 'campaign', key: r.key }),
      }}
    >
      <div className="mk-stack">
        <Lede>
          С рубля выручки после зарплат {ds.profile.words.staff[2]}, материалов, эквайринга и налога остаётся <b>{fmt(v.be.margin, 'pct')}</b>.
          Поэтому кампания выходит в ноль, когда выручка больше расхода в <b>{fmt(th, 'x')}</b>: это вертикаль на графике.
        </Lede>
        <Bubbles
          label="Кампании: окупаемость и расход" xFormat="x" sizeFormat="money" threshold={th} thresholdLabel={`в ноль при ${fmt(th, 'x')}`} domain={[0, top]}
          points={v.points.map((p) => ({ key: p.key, label: `${p.channel}: ${p.name}`, x: p.roi, size: p.spend, verdict: p.verdict, note: 'расход' }))}
          onPick={(p) => open({ kind: 'campaign', key: p.key })}
        />
        <Lede>
          {off ? (
            <>Выключите <b>«{off.name}»</b> в {off.channel}: она потратила {fmt(off.spend, 'money')} и {off.sales ? `принесла ${off.sales} ${plural(off.sales, SALES)}` : 'не привела ни одной продажи'}. Это <b>{fmt(v.saved, 'money')}</b> прибыли за период.</>
          ) : near ? <>Все кампании окупаются. Ближе всех к порогу «{near.name}»: {fmt(near.roi, 'x')}.</> : 'Платных кампаний в периоде нет.'}
        </Lede>
        <div>
          <p className="mk-sub">Куда уходит бюджет</p>
          <Mix label="Бюджет по вердиктам" format="money" parts={(['good', 'warn', 'bad'] as const).map((k) => ({ key: k, label: VERDICT_NAME[k], value: v.budget[k], tone: k }))} />
        </div>
      </div>
    </Block>
  );
}

// ── m3 ──
function ChannelMixView({ id, className }: BlockViewProps) {
  const { ds, loc, win, prevWin, vs, def } = useSlice(id);
  const { open } = useDrill();
  const m = channelMix(ds, loc, win, prevWin);
  const share = (g: MixRow['group']) => m.groups.find((x) => x.group === g)?.share ?? 0;
  const earned = m.rows.filter((r) => r.group === 'earned').map((r) => r.name).join(', ');
  const mover = [...m.rows].filter((r) => r.shift !== null).sort((a, b) => Math.abs(b.shift!) - Math.abs(a.shift!))[0];
  const handleRow = (r: MixRow) => { if (r.key !== DIRECT_KEY) open({ kind: 'channel', key: r.key }); };
  return (
    <Block
      title={def.title} question={def.question} className={className} custom={def.custom} sources={sourcesOf(ds, def)}
      table={{
        columns: [
          { key: 'n', label: 'Канал', value: (r: MixRow) => r.name },
          { key: 'g', label: 'Группа', value: (r) => GROUP_NAMES[r.group] },
          { key: 's', label: 'Записи', format: 'int', value: (r) => r.sales },
          { key: 'p', label: 'Доля', format: 'pct', value: (r) => r.share },
          { key: 'd', label: `Изменение к ${vs}`, num: true, value: (r) => signedPp(r.shift) },
        ],
        rows: m.rows, rowKey: (r) => r.key, onRow: handleRow,
      }}
    >
      <div className="mk-stack">
        <Lede>
          Платная реклама привела <b>{fmt(share('paid'), 'pct')}</b> оплаченных записей, бесплатные каналы ({earned}) — <b>{fmt(share('earned'), 'pct')}</b>,
          остальное — прямые и повторные.{mover && mover.shift && Math.abs(mover.shift) >= 0.001 ? <> Сильнее всего изменилась доля {mover.name}: <b>{signedPp(mover.shift)}</b> к {vs}.</> : null}
        </Lede>
        <Mix label="Записи по каналам" format="int" parts={m.rows.map((r) => ({ key: r.key, label: r.name, value: r.sales, tone: r.group === 'direct' ? 'muted' : indexTone(r.index) }))} />
        <ul className="mk-groups">
          {m.groups.map((g) => <li key={g.group}>{GROUP_NAMES[g.group]}: <b>{fmt(g.share, 'pct')}</b></li>)}
        </ul>
      </div>
    </Block>
  );
}

// ── m4 ──
function SiteFunnelView({ id, className }: BlockViewProps) {
  const { ds, loc, win, def } = useSlice(id);
  const f = siteFunnel(ds, loc, win);
  const rows = f.steps.map((s, k) => ({ ...s, conv: k && f.steps[k - 1]!.value ? s.value / f.steps[k - 1]!.value : null }));
  return (
    <Block
      title={def.title} question={def.question} className={className} custom={def.custom} sources={sourcesOf(ds, def)}
      table={{
        columns: [
          { key: 'l', label: 'Шаг', value: (r: FunnelStep & { conv: number | null }) => r.label },
          { key: 'v', label: 'Человек', format: 'int', value: (r) => r.value },
          { key: 'c', label: 'От прошлого шага', num: true, value: (r) => orDash(r.conv, 'pct') },
        ],
        rows, rowKey: (r) => r.key,
      }}
    >
      <div className="mk-stack">
        <Lede>
          <b>{fmt(f.callable, 'int')}</b> человек оставили контакты, но не записались: это <b>{fmt(f.callableMoney, 'money')}</b> по среднему чеку.
          Звонок администратора в тот же день возвращает часть из них.
        </Lede>
        <Funnel steps={f.steps} />
        <div className="mk-kpis">
          <Stat label="Брошенные записи" value={f.abandoned} format="int" note={`выбрали время и ушли, ${fmt(f.abandonedMoney, 'money')}`} />
          <Stat label="Записались с сайта" value={f.booked} format="int" note={`средний чек ${fmt(f.check, 'rub')}`} />
        </div>
      </div>
    </Block>
  );
}

// ── m5 ──
const ABC_TEXT = { A: 'Держат прибыль', B: 'Добирают', C: 'Хвост' } as const;

function ServicesView({ id, className }: BlockViewProps) {
  const { ds, loc, win, prevWin, vs, def } = useSlice(id);
  const { open } = useDrill();
  const m = servicesAbc(ds, loc, win, prevWin);
  const [a, , c] = m.cards;
  const columns: Column<ServiceRow>[] = [
    { key: 'n', label: 'Услуга', value: (r) => r.name },
    { key: 'b', label: 'Записи', format: 'int', value: (r) => r.bookings },
    { key: 'r', label: 'Выручка', format: 'rub', value: (r) => r.revenue },
    { key: 's', label: 'Доля', format: 'pct', value: (r) => r.share },
    { key: 'd', label: `К ${vs}`, num: true, value: (r) => delta(r.delta) },
    { key: 'm', label: 'Вклад в прибыль', format: 'rub', value: (r) => r.margin },
    { key: 'g', label: 'Группа', value: (r) => r.group },
  ];
  return (
    <Block title={def.title} question={def.question} className={className} custom={def.custom} sources={sourcesOf(ds, def)}>
      <div className="mk-stack">
        {a && c && (
          <Lede>
            <b>{a.names.length} {plural(a.names.length, SERVICES)} из {m.rows.length}</b> дают <b>{fmt(a.marginShare, 'pct')}</b> прибыли с услуг: {a.names.join(', ')}.
            {c.names.length > 0 && <> {c.names.join(', ')}: всего {fmt(c.marginShare, 'pct')} прибыли. Сами по себе почти ничего не дают, держите их как вход к услугам группы A.</>}
          </Lede>
        )}
        <div className="mk-cards">
          {m.cards.map((card) => (
            <article key={card.group} className="mk-card">
              <div className="mk-card-head"><span className="mk-card-letter">{card.group}</span><span className="mk-sub">{ABC_TEXT[card.group]}</span></div>
              <span className="mk-card-value">{fmt(card.marginShare, 'pct')} прибыли</span>
              <p>{card.names.length ? `${card.names.length} ${plural(card.names.length, SERVICES)}, вклад ${fmt(card.margin, 'money')}` : 'Нет услуг'}</p>
            </article>
          ))}
        </div>
        <DataTable columns={columns} rows={m.rows} rowKey={(r) => r.key} onRow={(r) => open({ kind: 'service', key: r.key })} caption="Услуги и группы ABC" />
        <p className="mk-note">Вклад в прибыль — выручка услуги минус материалы и сдельная зарплата. Группа A — услуги, которые вместе дают 80% вклада, B — следующие 15%, C — остальное.</p>
      </div>
    </Block>
  );
}

// ── m6 ──
function UpsellsView({ id, className }: BlockViewProps) {
  const { ds, loc, win, prevWin, vs, def } = useSlice(id);
  const { open } = useDrill();
  const m = upsells(ds, loc, win, prevWin);
  const visit = ds.profile.words.visit;
  const ranked = m.locs.filter((l) => l.perVisit !== null).sort((x, y) => y.perVisit! - x.perVisit!);
  const best = ranked[0];
  const worst = ranked.length > 1 ? ranked[ranked.length - 1] : undefined;
  const gain = worst && m.perVisit !== null && worst.perVisit ? Math.max(0, (m.perVisit - worst.perVisit) * (worst.revenue / worst.perVisit)) : 0;
  return (
    <Block
      title={def.title} question={def.question} className={className} custom={def.custom} sources={sourcesOf(ds, def)}
      table={{
        columns: [
          { key: 'n', label: 'Позиция', value: (r: UpsellItem) => r.name },
          { key: 's', label: 'Продано', format: 'int', value: (r) => r.sold },
          { key: 'a', label: `Доля ${visit[2]}`, format: 'pct', value: (r) => r.attach },
          { key: 'r', label: 'Выручка', format: 'rub', value: (r) => r.revenue },
        ],
        rows: m.items, rowKey: (r) => r.name,
      }}
    >
      <div className="mk-stack">
        <Lede>
          Допродажи принесли <b>{fmt(m.total, 'money')}</b>, по <b>{orDash(m.perVisit, 'rub')}</b> на запись.
          {best && worst && <> Лучше всех продаёт {best.name} ({orDash(best.perVisit, 'rub')}), слабее всех {worst.name} ({orDash(worst.perVisit, 'rub')}).</>}
          {gain > 0 && <> Если {worst!.name} выйдет на средний уровень, это ещё <b>{fmt(gain, 'money')}</b> за период.</>}
        </Lede>
        <div className="mk-kpis">
          <StatOrDash label="Допродажи на запись" value={m.perVisit} prev={m.prevPerVisit} format="rub" vs={vs} />
          <Stat label="Допродажи всего" value={m.total} format="money" />
        </div>
        <BarList format="money" rows={m.items.map((i) => ({ key: i.name, label: i.name, value: i.revenue, note: `в ${fmt(i.attach, 'pct')} ${visit[2]}` }))} />
        {m.locs.length > 1 && (
          <div>
            <p className="mk-sub">На запись по точкам</p>
            <BarList format="rub" rows={m.locs.map((l) => ({ key: l.key, label: l.name, value: l.perVisit ?? 0, display: orDash(l.perVisit, 'rub'), tone: indexTone(l.index), note: `всего ${fmt(l.revenue, 'money')}`, onClick: () => open({ kind: 'loc', key: l.key }) }))} />
          </div>
        )}
      </div>
    </Block>
  );
}

export const MARKETING_VIEWS: Record<string, ComponentType<BlockViewProps>> = {
  m1: AdsByPlatform,
  m2: CampaignVerdicts,
  m3: ChannelMixView,
  m4: SiteFunnelView,
  m5: ServicesView,
  m6: UpsellsView,
  ...MARKETING_MORE_VIEWS,
};
