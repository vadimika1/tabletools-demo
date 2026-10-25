'use client';
// Блоки раздела «Операционка», p1–p5: свободный прайм, загрузка по часам, неделя вперёд,
// неявки, обращения. p6–p10 — в ops-team.tsx, отраслевые — в ops-industry.tsx.
import { useState, type ComponentType } from 'react';
import { Block, Seg } from '@/components/dash/kit/Block';
import { DataTable } from '@/components/dash/kit/DataTable';
import { Num } from '@/components/dash/kit/Stat';
import { BarList } from '@/components/dash/charts/BarList';
import { Columns } from '@/components/dash/charts/Columns';
import { Heatmap } from '@/components/dash/charts/Heatmap';
import { count, fmt, plural } from '@/components/dash/format';
import { isPrime } from '@/lib/demo-app/engine/ops';
import type { LocFilter } from '@/lib/demo-app/engine/types';
import {
  aheadModel, commsModel, heatModel, noShowModel, primeModel, WD_NAME, WD_ON, WD_SHORT,
  type AheadRow, type CommsLine, type PrimeLoc, type WeekdayRow,
} from '@/lib/demo-app/models/ops';
import { useDrill } from '../drill';
import { cap, sourcesOf, useSlice } from './common';
import { Figs, Note, orDash } from './ops-common';
import { OPS_TEAM_VIEWS } from './ops-team';
import type { BlockViewProps } from './index';

const HOURS: readonly [string, string, string] = ['час', 'часа', 'часов'];

function FreePrime({ id, className }: BlockViewProps) {
  const { ds, loc, def } = useSlice(id);
  const { open } = useDrill();
  const m = primeModel(ds, loc);
  const w = ds.profile.words;
  const handleOpen = () => open({ kind: 'metric', key: 'prime' });
  return (
    <Block
      dark
      title={def.title}
      question={def.question}
      className={className}
      custom={def.custom}
      sources={sourcesOf(ds, def)}
      table={{
        columns: [
          { key: 'n', label: cap(w.location[0]), value: (r: PrimeLoc) => r.name },
          { key: 'h', label: 'Свободно в прайм', format: 'hours', value: (r) => r.hours },
          { key: 'm', label: 'Можно продать', format: 'rub', value: (r) => r.money },
        ],
        rows: m.byLoc,
        rowKey: (r) => r.loc,
        onRow: (r) => open({ kind: 'loc', key: r.loc }),
        footer: m.byLoc.length > 1 ? { loc: 'all', name: 'Итого', hours: m.hours, money: m.money } : undefined,
      }}
    >
      <button type="button" className="op-hero" onClick={handleOpen} aria-label={`Можно продать на неделю вперёд: ${fmt(m.money, 'money')}. Открыть разбивку`}>
        <span className="op-hero-label">Можно продать на неделю вперёд</span>
        <strong className="op-hero-value"><Num value={m.money} format="money" /></strong>
        <span className="op-hero-note">{count(m.hours, ['свободный час', 'свободных часа', 'свободных часов'])} в прайм-время, по загрузке последних четырёх недель</span>
      </button>
      {m.top && m.byLoc.length > 1 && (
        <Note>Больше всего свободного прайма — {m.top.name}: {fmt(m.top.hours, 'hours')} на {fmt(m.top.money, 'money')}.</Note>
      )}
      <Figs
        items={[
          { key: 'ns', label: 'Неявки', value: m.noShowsYesterday, format: 'int', note: 'вчера' },
          { key: 'c', label: 'Отмены', value: m.cancels7, format: 'int', note: 'за 7 дней' },
          { key: 'v', label: 'Пришли', value: m.visitsYesterday, format: 'int', note: `${plural(m.visitsYesterday, w.client)} вчера` },
        ]}
      />
    </Block>
  );
}

interface HeatRow { wd: number; label: string; values: number[] }

function LoadHeat({ id, className }: BlockViewProps) {
  const { ds, loc, win, def } = useSlice(id);
  const { open } = useDrill();
  const [pick, setPick] = useState<LocFilter>('all');
  const locs = ds.profile.locations;
  // Общий фильтр точки главнее локального переключателя; чужая точка после смены отрасли — это «вся сеть».
  const scope: LocFilter = loc !== 'all' ? loc : locs.some((l) => l.key === pick) ? pick : 'all';
  const m = heatModel(ds, scope, win);
  const e = m.emptiest;
  const rows: HeatRow[] = m.values.map((values, wd) => ({ wd, label: WD_SHORT[wd]!, values }));
  const options = [['all', 'Вся сеть'] as const, ...locs.map((l) => [l.key, l.name] as const)];
  return (
    <Block
      title={def.title}
      question={def.question}
      className={className}
      custom={def.custom}
      sources={sourcesOf(ds, def)}
      actions={loc === 'all' && locs.length > 1 ? <Seg label="Какие точки показать" value={scope} options={options} onChange={setPick} /> : undefined}
      table={{
        columns: [
          { key: 'd', label: 'День', value: (r: HeatRow) => r.label },
          ...m.hours.map((h, k) => ({ key: String(h), label: `${h}:00`, format: 'pct' as const, value: (r: HeatRow) => r.values[k]! })),
        ],
        rows,
        rowKey: (r) => String(r.wd),
      }}
    >
      <Heatmap label={`Загрузка по часам: ${scope === 'all' ? 'вся сеть' : locs.find((l) => l.key === scope)?.name ?? ''}`}
        rows={WD_SHORT} cols={m.hours} values={m.values} prime={(r, h) => isPrime(ds, r, h)} />
      {e && (
        <Note>
          Самый пустой прайм — {WD_NAME[e.weekday]} {e.hour}:00{scope === e.loc ? '' : `, ${e.name}`}: занято {fmt(e.value, 'pct')}.
          {' '}За период там простаивало {count(e.idleHours, HOURS)} — это {fmt(e.money, 'money')}.
          {scope !== e.loc && <> <button type="button" className="ds-link" onClick={() => open({ kind: 'loc', key: e.loc })}>Открыть {e.name}</button></>}
        </Note>
      )}
    </Block>
  );
}

function WeekAhead({ id, className }: BlockViewProps) {
  const { ds, loc, def } = useSlice(id);
  const m = aheadModel(ds, loc);
  const e = m.emptiest;
  const usualShare = (d: AheadRow) => (d.capacity ? d.usual / d.capacity : null);
  return (
    <Block
      title={def.title}
      question={def.question}
      className={className}
      custom={def.custom}
      sources={sourcesOf(ds, def)}
      table={{
        columns: [
          { key: 'd', label: 'День', value: (r: AheadRow) => r.label },
          { key: 'b', label: 'Записано, ч', num: true, value: (r) => r.booked },
          { key: 'c', label: 'Мощность, ч', num: true, value: (r) => r.capacity },
          { key: 's', label: 'Записано', num: true, value: (r) => orDash(r.share, 'pct') },
          { key: 'u', label: 'Обычно', num: true, value: (r) => orDash(usualShare(r), 'pct') },
          { key: 'g', label: 'До обычного, ч', num: true, value: (r) => r.gap },
        ],
        rows: m.days,
        rowKey: (r) => String(r.offset),
      }}
    >
      <Figs
        items={[
          { key: 's', label: 'Записано на 7 дней', value: m.share, format: 'pct', note: `${fmt(m.booked, 'hours')} из ${fmt(m.capacity, 'hours')}` },
          { key: 'f', label: 'Свободно', value: m.free, format: 'hours', note: 'часы мощности' },
          { key: 'g', label: 'До обычной загрузки', value: m.gapMoney, format: 'money', note: `ещё ${count(m.gap, HOURS)}` },
        ]}
      />
      <Columns
        label="Записанные часы на следующие семь дней"
        format="hours"
        columns={m.days.map((d) => ({ key: String(d.offset), label: d.label, value: d.booked, note: `записано ${orDash(d.share, 'pct')} из ${d.capacity} ч, обычно ${orDash(usualShare(d), 'pct')}` }))}
      />
      {e && (
        <Note>
          Меньше всего записано на {e.label}: {orDash(e.share, 'pct')}, а обычно в этот день занято {orDash(usualShare(e), 'pct')}.
        </Note>
      )}
    </Block>
  );
}

function NoShows({ id, className }: BlockViewProps) {
  const { ds, loc, win, prevWin, vs, def } = useSlice(id);
  const m = noShowModel(ds, loc, win, prevWin);
  const w = ds.profile.words;
  const worst = m.worst;
  return (
    <Block
      title={def.title}
      question={def.question}
      className={className}
      custom={def.custom}
      sources={sourcesOf(ds, def)}
      table={{
        columns: [
          { key: 'd', label: 'День', value: (r: WeekdayRow) => r.label },
          { key: 'e', label: 'Ждали', format: 'int', value: (r) => r.expected },
          { key: 'n', label: 'Не пришли', format: 'int', value: (r) => r.noShows },
          { key: 'r', label: 'Доля', num: true, value: (r) => orDash(r.rate, 'pct') },
          { key: 'c', label: 'Отмены', format: 'int', value: (r) => r.cancels },
          { key: 'l', label: 'Потеряли', format: 'rub', value: (r) => r.lost },
        ],
        rows: m.rows,
        rowKey: (r) => String(r.weekday),
      }}
    >
      <Figs
        items={[
          { key: 'n', label: 'Не пришли', value: m.noShows, format: 'int', prev: m.prevNoShows, vs, goodWhen: 'down' },
          { key: 'r', label: 'Доля неявок', value: m.rate, format: 'pct', prev: m.prevRate, vs, goodWhen: 'down' },
          { key: 'l', label: 'Потеряли на неявках', value: m.lost, format: 'money', note: 'по выручке на одного пришедшего' },
        ]}
      />
      <BarList
        format="pct"
        rows={m.rows.map((r) => ({
          key: String(r.weekday),
          label: cap(WD_NAME[r.weekday]!),
          note: `не пришли ${r.noShows} из ${r.expected}, ${fmt(r.lost, 'money')}`,
          value: r.rate ?? 0,
          display: orDash(r.rate, 'pct'),
        }))}
      />
      <Note>
        {worst ? <>Чаще всего не приходят {WD_ON[worst.weekday]}: {orDash(worst.rate, 'pct')} {w.client[2]}, это {fmt(worst.lost, 'money')} за период. </> : null}
        Отмены ({fmt(m.cancels, 'int')}) в потери не считаем: их обычно успевают перезаписать.
      </Note>
    </Block>
  );
}

function Comms({ id, className }: BlockViewProps) {
  const { ds, loc, win, prevWin, vs, def } = useSlice(id);
  const { open } = useDrill();
  const m = commsModel(ds, loc, win);
  const p = commsModel(ds, loc, prevWin).total;
  const t = m.total;
  const worst = m.worst;
  const footer: CommsLine = { ...t, loc: 'all', name: 'Итого' };
  return (
    <Block title={def.title} question={def.question} className={className} custom={def.custom} sources={sourcesOf(ds, def)}>
      <Figs
        items={[
          { key: 'm', label: 'Пропущено звонков в рабочее время', value: t.missedOpen, format: 'int', prev: p.missedOpen, vs, goodWhen: 'down' },
          { key: 'u', label: 'Сообщений без ответа', value: t.unanswered, format: 'int', prev: p.unanswered, vs, goodWhen: 'down' },
          { key: 'a', label: 'Отвечаем за', value: t.answerMin, format: 'min', note: `клиент ждёт ${fmt(t.waitMin, 'min')}` },
          { key: 'l', label: 'Потеряли на обращениях', value: t.lostMoney, format: 'money', prev: p.lostMoney, vs, goodWhen: 'down' },
        ]}
      />
      <DataTable<CommsLine>
        caption="Обращения по точкам"
        columns={[
          { key: 'n', label: cap(ds.profile.words.location[0]), value: (r) => r.name },
          { key: 'c', label: 'Звонки', format: 'int', value: (r) => r.calls },
          { key: 'mo', label: 'Пропущено в рабочее время', format: 'int', value: (r) => r.missedOpen },
          { key: 'ms', label: 'Сообщения', format: 'int', value: (r) => r.messages },
          { key: 'u', label: 'Без ответа', format: 'int', value: (r) => r.unanswered },
          { key: 'a', label: 'Медиана ответа', format: 'min', value: (r) => r.answerMin },
          { key: 'w', label: 'Клиент ждал', format: 'min', value: (r) => r.waitMin },
          { key: 'lb', label: 'Потеряно записей', format: 'int', value: (r) => r.lostBookings },
          { key: 'lm', label: 'Потеряно', format: 'rub', value: (r) => r.lostMoney },
        ]}
        rows={m.rows}
        rowKey={(r) => r.loc}
        onRow={(r) => open({ kind: 'loc', key: r.loc })}
        footer={m.rows.length > 1 ? footer : undefined}
      />
      <Note>
        {worst && <>Больше всех теряет {worst.name}: {count(worst.lostBookings, ds.profile.words.visit)} на {fmt(worst.lostMoney, 'money')}, ответа там ждут {fmt(worst.waitMin, 'min')}. </>}
        Медиана ответа — по рабочим часам; «клиент ждал» — по часам на стене, вместе с ночью и выходными.
      </Note>
    </Block>
  );
}

export const OPS_VIEWS: Record<string, ComponentType<BlockViewProps>> = {
  p1: FreePrime,
  p2: LoadHeat,
  p3: WeekAhead,
  p4: NoShows,
  p5: Comms,
  ...OPS_TEAM_VIEWS,
};
