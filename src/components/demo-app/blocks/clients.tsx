'use client';
// Блоки раздела «Клиенты»: новые и вернувшиеся (c1), сколько стоит клиент (c2), повторные по услугам (c4).
// Спящие (c3) и возврат к барберу (x4) — в clients-return.tsx: у них есть действие «отправить».
import type { ComponentType } from 'react';
import { Block } from '@/components/dash/kit/Block';
import { Stat } from '@/components/dash/kit/Stat';
import { Columns } from '@/components/dash/charts/Columns';
import { BarList } from '@/components/dash/charts/BarList';
import { count, fmt } from '@/components/dash/format';
import { shortDate } from '@/lib/demo-app/engine/calendar';
import type { Cohort } from '@/lib/demo-app/engine/clients';
import { clientFigures, clientValue, returnByService, type ServiceReturnRow } from '@/lib/demo-app/models/clients';
import { useDrill } from '../drill';
import { cap, sourcesOf, useSlice } from './common';
import { Flag, orDash } from './money-kit';
import { OverdueClients, SleepingClients } from './clients-return';
import type { BlockViewProps } from './index';

// ── c1: новые и вернувшиеся ──

interface WeekRow { key: string; label: string; value: number }

function NewAndReturning({ id, className }: BlockViewProps) {
  const { ds, loc, win, prevWin, vs, def } = useSlice(id);
  const { open } = useDrill();
  const f = clientFigures(ds, loc, win, prevWin);
  const { now, prev } = f;
  const w = ds.profile.words;
  const drill = (key: string) => () => open({ kind: 'metric', key });
  const rows: WeekRow[] = f.series.map((x) => ({ key: String(x.from), label: `${f.byWeek ? 'нед. с ' : ''}${shortDate(ds.anchor, x.from)}`, value: x.value }));
  const network = loc === 'all' && ds.profile.locations.length > 1;
  return (
    <Block
      title={def.title}
      question={def.question}
      className={className}
      custom={def.custom}
      sources={sourcesOf(ds, def)}
      table={{
        columns: [
          { key: 'l', label: f.byWeek ? 'Неделя' : 'День', value: (r: WeekRow) => r.label },
          { key: 'v', label: 'Пришли впервые', format: 'int', value: (r) => r.value },
        ],
        rows,
        rowKey: (r) => r.key,
      }}
    >
      <div className="bf-stack">
        <div className="ds-stats">
          <Stat label="Пришли впервые" value={now.newClients} prev={prev.newClients} vs={vs} format="int" onClick={drill('newClients')} />
          <Stat label="Вернулись" value={now.returning} prev={prev.returning} vs={vs} format="int" note="записи постоянных клиентов" onClick={drill('returning')} />
          {network ? (
            <Stat label="Ходят в несколько точек" value={now.multiLoc} prev={prev.multiLoc} vs={vs} format="int" onClick={drill('multiLoc')} />
          ) : (
            <article className="ds-stat">
              <span className="ds-stat-label">Ходят в несколько точек</span>
              <strong className="ds-stat-value">—</strong>
              <span className="ds-stat-note">считаем для всей сети</span>
            </article>
          )}
          <Stat label={`Всего разных ${w.client[2]}`} value={now.unique} prev={prev.unique} vs={vs} format="int" onClick={drill('unique')} />
          <Stat label="Спящие" value={now.sleeping} format="int" note={`не были дольше двух обычных интервалов; если каждый придёт хотя бы раз — ${fmt(now.sleepingValue, 'money')}`} onClick={drill('sleeping')} />
          {f.repeatShare === null ? (
            <article className="ds-stat">
              <span className="ds-stat-label">Доля повторных</span>
              <strong className="ds-stat-value">—</strong>
            </article>
          ) : (
            <Stat label="Доля повторных" value={f.repeatShare} prev={f.prevRepeatShare} vs={vs} format="pct" onClick={drill('repeatShare')} />
          )}
        </div>
        <div>
          <p className="bf-hint">Пришли впервые, {f.byWeek ? 'по неделям' : 'по дням'}</p>
          <Columns label={`Новые ${w.client[2]} ${f.byWeek ? 'по неделям' : 'по дням'}`} format="int" height={160}
            columns={rows.map((r) => ({ key: r.key, label: r.label, value: r.value, note: 'пришли впервые' }))} />
        </div>
      </div>
    </Block>
  );
}

// ── c2: сколько стоит клиент ──

const VERDICT = {
  good: 'окупается с запасом',
  warn: 'окупается, но запас небольшой',
  bad: 'реклама не окупается',
} as const;

function ClientValue({ id, className }: BlockViewProps) {
  const { ds, loc, win, def } = useSlice(id);
  const v = clientValue(ds, loc, win);
  const w = ds.profile.words;
  return (
    <Block
      title={def.title}
      question={def.question}
      className={className}
      custom={def.custom}
      sources={sourcesOf(ds, def)}
      table={{
        columns: [
          { key: 'y', label: 'Год первого визита', value: (c: Cohort) => String(c.year) },
          { key: 'c', label: cap(w.client[2]), format: 'int', value: (c) => c.clients },
          { key: 'l', label: 'Принёс за всё время', format: 'rub', value: (c) => c.ltv },
          { key: 'a', label: 'Ещё ходят', format: 'pct', value: (c) => c.stillActive },
        ],
        rows: v.cohorts,
        rowKey: (c) => String(c.year),
      }}
    >
      <div className="bf-stack">
        <p className="bf-note">
          {cap(w.client[0])} приносит в среднем <b>{fmt(v.ltv, 'money')}</b> выручки за всё время, после зарплат, материалов и налога остаётся {fmt(v.ltvProfit, 'money')}.{' '}
          {v.cac === null || v.ratio === null || !v.verdict
            ? 'Цену привлечения посчитать не из чего: в периоде не было новичков из рекламы.'
            : <>Привести нового через рекламу стоит {fmt(v.cac, 'rub')}, вложение возвращается в <b>{fmt(v.ratio, 'x')}</b>: <Flag tone={v.verdict}>{VERDICT[v.verdict]}</Flag></>}
        </p>
        <BarList
          format="money"
          rows={v.cohorts.map((c) => ({ key: String(c.year), label: `Пришли в ${c.year}`, value: c.ltv, note: `${count(c.clients, w.client)}, ещё ходят ${fmt(c.stillActive, 'pct')}` }))}
        />
      </div>
    </Block>
  );
}

// ── c4: с каких услуг возвращаются ──

function ReturnByService({ id, className }: BlockViewProps) {
  const { ds, loc, win, def } = useSlice(id);
  const { open } = useDrill();
  const r = returnByService(ds, loc, win);
  const known = r.rows.filter((x) => x.share !== null);
  const best = known[0];
  const worst = known[known.length - 1];
  const w = ds.profile.words;
  const handleService = (x: ServiceReturnRow) => open({ kind: 'service', key: x.key });
  return (
    <Block
      title={def.title}
      question={def.question}
      className={className}
      custom={def.custom}
      sources={sourcesOf(ds, def)}
      table={{
        columns: [
          { key: 'n', label: 'Услуга', value: (x: ServiceReturnRow) => x.name },
          { key: 'b', label: 'Записей', format: 'int', value: (x) => x.bookings },
          { key: 'r', label: 'От вернувшихся', format: 'int', value: (x) => x.returning },
          { key: 's', label: 'Доля', num: true, value: (x) => orDash(x.share, 'pct') },
        ],
        rows: r.rows,
        rowKey: (x) => x.key,
        onRow: handleService,
      }}
    >
      <div className="bf-stack">
        {best && worst && best !== worst && (
          <p className="bf-note">
            Чаще всего возвращаются на «{best.name}»: <b>{fmt(best.share!, 'pct')}</b> записей от постоянных {w.client[2]}. Реже всего — на «{worst.name}»: {fmt(worst.share!, 'pct')}.
            {r.share !== null && ` В среднем по всем услугам — ${fmt(r.share, 'pct')}.`}
          </p>
        )}
        <BarList
          format="pct"
          rows={known.map((x) => ({ key: x.key, label: x.name, value: x.share!, note: `${fmt(x.returning, 'int')} из ${count(x.bookings, ['записи', 'записей', 'записей'])}`, onClick: () => handleService(x) }))}
        />
      </div>
    </Block>
  );
}

export const CLIENTS_VIEWS: Record<string, ComponentType<BlockViewProps>> = {
  c1: NewAndReturning,
  c2: ClientValue,
  c3: SleepingClients,
  c4: ReturnByService,
  x4: OverdueClients,
};
