'use client';
// Блоки раздела «Сквозная аналитика» (a1–a6). Все читают модель атрибуции из адреса (useDemo().model);
// переключает её только a1, поэтому экран с выбранной моделью можно переслать ссылкой.
import { useState, type ComponentType, type KeyboardEvent, type MouseEvent } from 'react';
import { Block, Seg } from '@/components/dash/kit/Block';
import { Stat } from '@/components/dash/kit/Stat';
import { DataTable, type Column } from '@/components/dash/kit/DataTable';
import { Funnel } from '@/components/dash/charts/Funnel';
import { BarList } from '@/components/dash/charts/BarList';
import { fmt, plural } from '@/components/dash/format';
import { DIRECT_KEY, MODELS } from '@/lib/demo-app/engine/channels';
import type { Model, SystemKind } from '@/lib/demo-app/engine/types';
import {
  channelFunnels, channelTree, customerPaths, dataHealth, modelShift, multiChannel, treeCsv, MODEL_ORDER,
  type ChannelFunnel, type LocHealth, type PairRow, type ShiftRow, type TreeRow,
} from '@/lib/demo-app/models/attribution';
import { useDemo } from '../state';
import { useDrill } from '../drill';
import { sourcesOf, useSlice } from './common';
import { agoText, Dot, hoursText, indexTone, Lede, orDash, Status, StatOrDash } from './marketing-common';
import type { BlockViewProps } from './index';

const SALES: readonly [string, string, string] = ['продажа', 'продажи', 'продаж'];
const DAYS: readonly [string, string, string] = ['день', 'дня', 'дней'];
const MODEL_OPTIONS = MODEL_ORDER.map((m) => [m, MODELS[m].name] as const);
const signed = (n: number) => (n > 0 ? `+${fmt(n, 'int')}` : n < 0 ? `−${fmt(-n, 'int')}` : '0');
const isChannel = (key: string) => key !== DIRECT_KEY && key !== 'total';

// ── a1 ──
/** Чем сквозная аналитика отличается от Метрики — с живой долей многоканальных продаж. */
function WhyNotMetrika({ ds, share, touches, days }: { ds: ReturnType<typeof useSlice>['ds']; share: number; touches: number; days: number }) {
  const sys = ds.profile.systems;
  return (
    <div className="mk-why">
      <div className="mk-why-col">
        <b>Метрика и рекламные кабинеты видят</b>
        <ul>
          <li>клик по объявлению и визит на сайт;</li>
          <li>заявку, если её оставили на сайте;</li>
          <li>каждая площадка засчитывает продажу себе, а Метрика — последнему клику.</li>
        </ul>
      </div>
      <div className="mk-why-col is-ours">
        <b>Сквозная аналитика видит</b>
        <ul>
          <li>звонок после рекламы ({sys.telephony}) и сообщение в мессенджер;</li>
          <li>запись через администратора и оплату в {sys.booking};</li>
          <li>весь путь клиента: <b>{fmt(share, 'pct')}</b> продаж — многоканальные, в среднем {touches.toLocaleString('ru-RU')} {Number.isInteger(touches) ? plural(touches, ['касание', 'касания', 'касаний']) : 'касания'} за {fmt(days, 'int')} {plural(days, ['день', 'дня', 'дней'])} до оплаты.</li>
        </ul>
      </div>
    </div>
  );
}

function ModelPicker({ id, className }: BlockViewProps) {
  const { ds, loc, win, def } = useSlice(id);
  const { model, set } = useDemo();
  const { open } = useDrill();
  const m = modelShift(ds, loc, win, model);
  const multi = multiChannel(ds, loc, win);
  const handleModel = (v: Model) => set({ model: v });
  const ranked = [...m.rows].sort((a, b) => b.delta - a.delta);
  const gainer = ranked[0];
  const loser = ranked[ranked.length - 1];
  const columns: Column<ShiftRow>[] = [
    { key: 'n', label: 'Канал', value: (r) => <><Dot tone={indexTone(r.index)} />{r.name}</> },
    ...MODEL_ORDER.map((k): Column<ShiftRow> => ({ key: k, label: MODELS[k].name, format: 'int', value: (r) => r.sales[k] })),
    // При последнем касании сдвиг к нему же всегда ноль — колонку не показываем.
    ...(model === 'last' ? [] : [{ key: 'd', label: 'Сдвиг к последнему касанию', num: true, value: (r: ShiftRow) => signed(r.delta) }]),
    { key: 'r', label: 'Выручка в этой модели', format: 'rub', value: (r) => r.revenue[model] },
  ];
  return (
    <Block title={def.title} question={def.question} className={className} custom={def.custom} sources={sourcesOf(ds, def)}
      actions={<Seg label="Модель атрибуции" value={model} options={MODEL_OPTIONS} onChange={handleModel} />}>
      <div className="mk-stack">
        <WhyNotMetrika ds={ds} share={multi.share} touches={multi.avgTouches} days={multi.avgDays} />
        <Lede>
          <b>{m.name}.</b> {m.hint}{' '}
          {model === 'last' || !gainer || !loser || gainer.delta === 0
            ? 'Переключите модель, чтобы увидеть, кому достаются прямые заходы и кто приводит клиентов впервые. Модель меняет все блоки раздела.'
            : <>В этой модели {gainer.name} получает <b>{signed(gainer.delta)} {plural(gainer.delta, SALES)}</b> и {fmt(gainer.revenue[model] - gainer.revenue.last, 'money')} выручки, а {loser.name} теряет {fmt(-loser.delta, 'int')}. Всего продаж столько же: {fmt(m.total, 'int')}.</>}
        </Lede>
        <DataTable columns={columns} rows={m.rows} rowKey={(r) => r.key} onRow={(r) => { if (isChannel(r.key)) open({ kind: 'channel', key: r.key }); }} caption="Продажи каналов в трёх моделях" />
      </div>
    </Block>
  );
}

// ── a2 ──
type Stage = 'toLead' | 'toBooking' | 'toPaid';
const STAGE_TEXT: Record<Stage, string> = { toLead: 'между переходом и заявкой', toBooking: 'между заявкой и записью', toPaid: 'между записью и оплатой' };

function ChannelFunnels({ id, className }: BlockViewProps) {
  const { ds, loc, win, def } = useSlice(id);
  const { model } = useDemo();
  const { open } = useDrill();
  const rows = channelFunnels(ds, loc, win, model);
  const [picked, setPicked] = useState<string | null>(null);
  const cur = rows.find((r) => r.key === picked) ?? rows.find((r) => r.impressions !== null) ?? rows[0];
  const weakest = cur ? (['toLead', 'toBooking', 'toPaid'] as const).filter((s) => cur[s] !== null).sort((a, b) => cur[a]! - cur[b]!)[0] : undefined;
  const steps = cur ? [
    ...(cur.impressions !== null ? [{ key: 'i', label: 'Показы', value: cur.impressions }] : []),
    { key: 'c', label: 'Переходы', value: cur.clicks },
    { key: 'l', label: 'Заявки', value: cur.leads },
    { key: 'b', label: 'Записи', value: cur.bookings },
    { key: 'p', label: 'Оплаты', value: cur.paid },
  ] : [];
  const columns: Column<ChannelFunnel>[] = [
    { key: 'n', label: 'Канал', value: (r) => <><Dot tone={indexTone(r.index)} />{r.name}</> },
    { key: 'i', label: 'Показы', num: true, value: (r) => orDash(r.impressions, 'int') },
    { key: 'c', label: 'Переходы', format: 'int', value: (r) => r.clicks },
    { key: 'l', label: 'Заявки', format: 'int', value: (r) => r.leads },
    { key: 'b', label: 'Записи', format: 'int', value: (r) => r.bookings },
    { key: 'p', label: 'Оплаты', format: 'int', value: (r) => r.paid },
    { key: 'cl', label: 'Из перехода в заявку', num: true, value: (r) => orDash(r.toLead, 'pct') },
    { key: 'lb', label: 'Из заявки в запись', num: true, value: (r) => orDash(r.toBooking, 'pct') },
    { key: 'bp', label: 'Из записи в оплату', num: true, value: (r) => orDash(r.toPaid, 'pct') },
  ];
  return (
    <Block title={def.title} question={def.question} className={className} custom={def.custom} sources={sourcesOf(ds, def)}>
      <div className="mk-stack">
        <Seg label="Канал" value={cur?.key ?? ''} options={rows.map((r) => [r.key, r.name] as const)} onChange={setPicked} />
        {cur && (
          <Lede>
            {cur.name}: до оплаты дошли <b>{fmt(cur.paid, 'int')}</b> из {fmt(cur.impressions ?? cur.clicks, 'int')} {cur.impressions !== null ? 'показов' : 'переходов'}, выручка <b>{fmt(cur.revenue, 'money')}</b>.
            {weakest && <> Больше всего теряем {STAGE_TEXT[weakest]}: доходит {orDash(cur[weakest], 'pct')}.</>} Модель: {MODELS[model].name.toLowerCase()}.
          </Lede>
        )}
        <Funnel steps={steps} />
        <DataTable columns={columns} rows={rows} rowKey={(r) => r.key} onRow={(r) => open({ kind: 'channel', key: r.key })} caption="Каналы от показа до оплаты" />
      </div>
    </Block>
  );
}

// ── a3 ──
const CSV_NAME = 'kanaly.csv';

function ChannelReport({ id, className }: BlockViewProps) {
  const { ds, loc, win, def } = useSlice(id);
  const { model } = useDemo();
  const { open } = useDrill();
  const tree = channelTree(ds, loc, win, model);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const rows = tree.nodes.flatMap((n) => [n.row, ...(expanded.has(n.row.key) ? n.children : [])]);
  const hasKids = new Set(tree.nodes.filter((n) => n.children.length).map((n) => n.row.key));
  const paid = tree.nodes.map((n) => n.row).filter((r) => r.roi !== null);
  const bestRoi = [...paid].sort((a, b) => b.roi! - a.roi!)[0];
  const dearest = [...paid].sort((a, b) => (b.cac ?? 0) - (a.cac ?? 0))[0];

  const handleToggle = (key: string) => (e: MouseEvent) => {
    e.stopPropagation();
    setExpanded((prev) => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  };
  const stopKeys = (e: KeyboardEvent) => e.stopPropagation();
  const handleRow = (r: TreeRow) => {
    if (r.level === 1) open({ kind: 'campaign', key: r.key });
    else if (isChannel(r.key)) open({ kind: 'channel', key: r.key });
  };
  const handleExport = () => {
    const url = URL.createObjectURL(new Blob([treeCsv(tree)], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = CSV_NAME;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const nameCell = (r: TreeRow) => {
    if (r.level === 1) return <span className="mk-tree-cell is-child">{r.name}</span>;
    if (r.key === 'total') return r.name;
    const isOpen = expanded.has(r.key);
    return (
      <span className="mk-tree-cell">
        {hasKids.has(r.key)
          ? <button type="button" className="mk-tree-btn" aria-expanded={isOpen} aria-label={`${isOpen ? 'Свернуть' : 'Показать'} кампании: ${r.name}`} onClick={handleToggle(r.key)} onKeyDown={stopKeys}>
              <svg viewBox="0 0 10 10" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3.5 2l3 3-3 3" /></svg>
            </button>
          : <span className="mk-tree-gap" />}
        <Dot tone={indexTone(r.index)} />{r.name}
      </span>
    );
  };
  const columns: Column<TreeRow>[] = [
    { key: 'n', label: 'Канал и кампания', value: nameCell },
    { key: 's', label: 'Продажи', format: 'int', value: (r) => r.sales },
    { key: 'r', label: 'Выручка', format: 'rub', value: (r) => r.revenue },
    { key: 'e', label: 'Расход', format: 'rub', value: (r) => r.spend },
    { key: 'o', label: 'Окупаемость', num: true, value: (r) => orDash(r.roi, 'x') },
    { key: 'c', label: 'Цена клиента', num: true, value: (r) => orDash(r.cac, 'rub') },
  ];
  return (
    <Block title={def.title} question={def.question} className={className} custom={def.custom} sources={sourcesOf(ds, def)}
      actions={<button type="button" className="mk-btn" onClick={handleExport}>Скачать CSV</button>}>
      <div className="mk-stack">
        <Lede>
          Модель: {MODELS[model].name.toLowerCase()}.
          {bestRoi && <> Лучше всех окупается {bestRoi.name}: <b>{orDash(bestRoi.roi, 'x')}</b>.</>}
          {dearest && dearest.cac !== null && <> Самый дорогой клиент в {dearest.name}: <b>{fmt(dearest.cac, 'rub')}</b>.</>} Раскройте канал, чтобы увидеть кампании.
        </Lede>
        <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} onRow={handleRow} footer={tree.total} caption="Отчёт по каналам и кампаниям" />
      </div>
    </Block>
  );
}

// ── a4 ──
function CustomerPath({ id, className }: BlockViewProps) {
  const { ds, loc, win, def } = useSlice(id);
  const { model } = useDemo();
  const paths = customerPaths(ds, loc, win, model);
  return (
    <Block title={def.title} question={def.question} className={className} custom={def.custom} sources={sourcesOf(ds, def)}>
      <div className="mk-stack">
        <Lede>
          Модель «{MODELS[model].name}» засчитывает первую продажу каналу <b>{paths[0]?.credited}</b>, вторую — <b>{paths[1]?.credited}</b>.
          Смените модель в блоке «Модель атрибуции», и отметка переедет.
        </Lede>
        <div className="mk-buyers">
          {paths.map((b) => (
            <section key={b.id} className="mk-buyer" aria-label={`Путь клиента: ${b.name}`}>
              <h4>{b.name}, {b.place}<span>{b.service}, {fmt(b.amount, 'rub')}</span></h4>
              <ol className="mk-path">
                {b.touches.map((t) => (
                  <li key={t.id} className={t.credited ? 'is-credited' : undefined}>
                    <Dot tone={indexTone(t.index)} />
                    <time>{t.date}, {t.time}</time>
                    <span><b>{t.channel}.</b> {t.action}</span>
                    {t.credited && <span className="mk-credit">Засчитано в этой модели</span>}
                  </li>
                ))}
                <li className="is-paid"><Dot tone="ink" /><time>{b.paidDate}</time><span>Запись и оплата: {fmt(b.amount, 'rub')}</span></li>
              </ol>
            </section>
          ))}
        </div>
      </div>
    </Block>
  );
}

// ── a5 ──
function MultiChannel({ id, className }: BlockViewProps) {
  const { ds, loc, win, def } = useSlice(id);
  const { open } = useDrill();
  const m = multiChannel(ds, loc, win);
  const top = m.pairs[0];
  const touches = m.avgTouches.toLocaleString('ru-RU', { maximumFractionDigits: 1 });
  return (
    <Block title={def.title} question={def.question} className={className} custom={def.custom} sources={sourcesOf(ds, def)}
      table={{
        columns: [
          { key: 'a', label: 'Сначала', value: (r: PairRow) => r.first },
          { key: 'b', label: 'Затем', value: (r) => r.then },
          { key: 's', label: 'Продажи', format: 'int', value: (r) => r.sales },
          { key: 'p', label: 'Доля многоканальных', format: 'pct', value: (r) => r.share },
          { key: 'r', label: 'Выручка', format: 'rub', value: (r) => r.revenue },
        ],
        rows: m.pairs, rowKey: (r) => r.key,
      }}>
      <div className="mk-stack">
        <Lede>
          <b>{fmt(m.share, 'pct')}</b> продаж прошли через два канала и больше: {fmt(m.multi, 'int')} {plural(m.multi, SALES)} на <b>{fmt(m.revenue, 'money')}</b>.
          В среднем {touches} касания за {m.avgDays} {plural(m.avgDays, DAYS)}.
          {top && (top.thenKey === DIRECT_KEY
            ? <> Чаще всего клиента приводит {top.first}, а записывается он потом сам, прямым заходом: без первого канала этих продаж не было бы.</>
            : <> Чаще всего первым приходит {top.first}, а дожимает {top.then}: выключив одного, вы потеряете продажи другого.</>)}
        </Lede>
        <div className="mk-kpis">
          <Stat label="Многоканальные продажи" value={m.share} format="pct" note={`${fmt(m.multi, 'int')} из ${fmt(m.total, 'int')}`} />
          <Stat label="Их выручка" value={m.revenue} format="money" />
        </div>
        <BarList format="int" rows={[
          ...m.pairs.map((p) => ({
            key: p.key, label: <><Dot tone={indexTone(p.firstIndex)} />{p.first}, затем {p.then}</>, value: p.sales, note: `${fmt(p.share, 'pct')} многоканальных`,
            onClick: isChannel(p.firstKey) ? () => open({ kind: 'channel', key: p.firstKey }) : undefined,
          })),
          { key: 'other', label: 'Другие сочетания', value: m.other, tone: 'muted' as const },
        ]} />
      </div>
    </Block>
  );
}

// ── a6 ──
const KIND_NAME: Record<SystemKind, string> = {
  web: 'сайт', booking: 'запись', ads: 'реклама', telephony: 'телефония', crm: 'CRM', pos: 'касса',
  maps: 'карты', accounting: 'бухгалтерия', payroll: 'зарплаты', messengers: 'мессенджеры',
};

function DataHealth({ id, className }: BlockViewProps) {
  const { ds, loc, win, def } = useSlice(id);
  const { open } = useDrill();
  const h = dataHealth(ds, loc, win);
  const weakest = h.locs.length > 1 ? [...h.locs].sort((a, b) => (a.share ?? 1) - (b.share ?? 1))[0] : undefined;
  const late = h.sources.find((s) => s.state !== 'ok');
  const columns: Column<LocHealth>[] = [
    { key: 'n', label: 'Точка', value: (r) => <><Dot tone={indexTone(r.index)} />{r.name}</> },
    { key: 's', label: 'Продажи', format: 'int', value: (r) => r.sales },
    { key: 'm', label: 'Склеено с визитом', num: true, value: (r) => orDash(r.share, 'pct') },
    { key: 'v', label: 'Последний визит', num: true, value: (r) => agoText(r.lastVisitMin) },
    { key: 'p', label: 'Последняя продажа', num: true, value: (r) => agoText(r.lastSaleMin) },
  ];
  return (
    <Block title={def.title} question={def.question} className={className} custom={def.custom} sources={sourcesOf(ds, def)}>
      <div className="mk-stack">
        <Lede>
          <b>{orDash(h.share, 'pct')}</b> продаж склеены с визитом на сайт: для них видно, какая реклама привела клиента.
          {weakest && <> Меньше всего в точке «{weakest.name}»: {orDash(weakest.share, 'pct')}, там чаще записываются по телефону без метки.</>}
          {late && <> {late.name} присылает данные с задержкой {hoursText(late.lagHours)}: вчерашние цифры этого источника ещё дополнятся.</>}
        </Lede>
        <div className="mk-kpis">
          <StatOrDash label="Склеено с визитом" value={h.share} format="pct" note={`${fmt(h.matched, 'int')} из ${fmt(h.sales, 'int')} продаж`} />
          <Stat label="Источники на связи" value={h.sources.length - h.warnings} format="int" note={`из ${h.sources.length}`} />
        </div>
        <ul className="mk-sources">
          {h.sources.map((s) => (
            <li key={s.kind}>
              <span>{s.name}<small>{KIND_NAME[s.kind]}, последнее событие {agoText(s.lastMin)}</small></span>
              {s.state === 'ok' ? <Status tone="good">на связи</Status> : <Status tone="warn">задержка {hoursText(s.lagHours)}</Status>}
            </li>
          ))}
        </ul>
        <DataTable columns={columns} rows={h.locs} rowKey={(r) => r.key} onRow={(r) => open({ kind: 'loc', key: r.key })} caption="Склейка продаж по точкам" />
      </div>
    </Block>
  );
}

export const ATTRIBUTION_VIEWS: Record<string, ComponentType<BlockViewProps>> = {
  a1: ModelPicker,
  a2: ChannelFunnels,
  a3: ChannelReport,
  a4: CustomerPath,
  a5: MultiChannel,
  a6: DataHealth,
};
