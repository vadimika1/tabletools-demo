'use client';
// Блоки раздела «CRM»: воронка сделок (r1), задачи (r2), кто как ведёт заявки (r3),
// карточка клиента (r4), склад и закупки (r5). Модели — src/lib/demo-app/models/crm.ts.
import type { ComponentType } from 'react';
import { Block } from '@/components/dash/kit/Block';
import { DataTable } from '@/components/dash/kit/DataTable';
import { count, fmt } from '@/components/dash/format';
import { longDate } from '@/lib/demo-app/engine/calendar';
import { clientCard, handling, pipeline, REORDER_DAYS, stock, tasks, type HandlingRow, type Stage, type StockRow, type TaskRow } from '@/lib/demo-app/models/crm';
import { cap, sourcesOf, useSlice } from './common';
import { Figs, Flag, locName, orDash } from './money-kit';
import type { BlockViewProps } from './index';

const DEALS: readonly [string, string, string] = ['сделка', 'сделки', 'сделок'];
const TASKS: readonly [string, string, string] = ['задача', 'задачи', 'задач'];
const DAYS: readonly [string, string, string] = ['день', 'дня', 'дней'];
const age = (d: number) => (d === 0 ? 'сегодня' : `${count(d, DAYS)} назад`);

// ── r1: воронка сделок ──

function Pipeline({ id, className }: BlockViewProps) {
  const { ds, loc, win, def } = useSlice(id);
  const p = pipeline(ds, loc, win);
  const paid = p.stages[p.stages.length - 1]!;
  return (
    <Block
      title={def.title} question={def.question} className={className} custom={def.custom} sources={sourcesOf(ds, def)}
      table={{
        columns: [
          { key: 'n', label: 'Этап', value: (s: Stage) => s.name },
          { key: 'c', label: 'Сделок', format: 'int', value: (s) => s.count },
          { key: 'v', label: 'Дошли от прошлого этапа', num: true, value: (s) => orDash(s.conv, 'pct') },
          { key: 's', label: 'Сумма', format: 'rub', value: (s) => s.sum },
        ],
        rows: p.stages, rowKey: (s) => s.key,
      }}
    >
      <div className="bf-stack">
        <p className="bf-note">
          За период пришло <b>{count(p.leads, DEALS)}</b>, до оплаты дошли {count(paid.count, DEALS)} на <b>{fmt(paid.sum, 'money')}</b>.{' '}
          {p.lost > 0 && <>До {fmt(p.lost, 'int')} заявок так и не дозвонились.{' '}</>}
          {p.owed > 0 && <>Ещё {fmt(p.owed, 'money')} клиенты должны после визита.</>}
        </p>
        <div className="crm-cols rb-board" tabIndex={0} aria-label="Доска сделок по этапам">
          {p.stages.map((s, i) => (
            <section key={s.key} className="crm-col" style={{ ['--i' as string]: i }}>
              <h4>
                <span>{s.name}<i>{fmt(s.count, 'int')}</i></span>
                <small>{fmt(s.sum, 'money')}{s.conv !== null && <>, дошли {fmt(s.conv, 'pct')}</>}</small>
              </h4>
              {s.deals.map((d) => (
                <article key={d.id} className={`crm-deal${d.late ? ' is-late' : ''}`}>
                  <b>{d.who}</b>
                  <span>{d.what}</span>
                  <span className="rb-deal-loc">{locName(ds, d.loc)}, {d.late ? <em className="rb-late">просрочена, {age(d.ageDays)}</em> : age(d.ageDays)}</span>
                  <span className="crm-meta"><em>{d.from}</em><strong>{fmt(d.sum, 'rub')}</strong></span>
                </article>
              ))}
            </section>
          ))}
        </div>
      </div>
    </Block>
  );
}

// ── r2: задачи и просрочки ──

const KIND_LABEL = { callback: 'Перезвонить', confirm: 'Подтвердить запись', winback: 'Вернуть' } as const;

function Tasks({ id, className }: BlockViewProps) {
  const { ds, loc, win, def } = useSlice(id);
  const t = tasks(ds, loc, win);
  const w = ds.profile.words;
  return (
    <Block title={def.title} question={def.question} className={className} custom={def.custom} sources={sourcesOf(ds, def)}>
      <div className="bf-stack">
        <Figs items={[
          { key: 'all', label: 'Задач на сегодня', value: count(t.total, TASKS) },
          { key: 'late', label: 'Просрочено со вчера', value: count(t.overdue, TASKS), note: t.overdue ? 'клиенты ждут ответа дольше суток' : 'хвоста нет' },
        ]} />
        <ul className="rb-tasks" aria-label="Задачи, которые горят">
          {t.items.map((x) => (
            <li key={`${x.kind}-${x.who}`} className={x.overdueDays ? 'is-late' : undefined}>
              <b>{KIND_LABEL[x.kind]}: {x.who}</b>
              <span>{locName(ds, x.loc)}, {x.note}</span>
              {x.overdueDays > 0 && <Flag tone="bad">просрочено на {count(x.overdueDays, DAYS)}</Flag>}
            </li>
          ))}
        </ul>
        <DataTable
          caption="Задачи по точкам"
          rows={t.rows} rowKey={(r: TaskRow) => r.loc}
          columns={[
            { key: 'l', label: cap(w.location[0]), value: (r) => locName(ds, r.loc) },
            { key: 'c', label: 'Перезвонить', format: 'int', value: (r) => r.callback },
            { key: 'f', label: 'Подтвердить', format: 'int', value: (r) => r.confirm },
            { key: 'w', label: 'Вернуть спящих', format: 'int', value: (r) => r.winBack },
            { key: 'o', label: 'Просрочено', format: 'int', value: (r) => r.overdue },
          ]}
        />
      </div>
    </Block>
  );
}

// ── r3: кто как ведёт заявки ──

function Handling({ id, className }: BlockViewProps) {
  const { ds, loc, win, def } = useSlice(id);
  const rows = handling(ds, loc, win);
  const slowest = [...rows].sort((a, b) => b.answerMin - a.answerMin)[0];
  return (
    <Block title={def.title} question={def.question} className={className} custom={def.custom} sources={sourcesOf(ds, def)}>
      <div className="bf-stack">
        {slowest && rows.length > 1 && (
          <p className="bf-note">Дольше всех отвечают администраторы точки {locName(ds, slowest.loc)}: <b>{fmt(slowest.answerMin, 'min')}</b> до первого ответа, потеряно {count(slowest.lost, ['запись', 'записи', 'записей'])}.</p>
        )}
        <DataTable
          caption="Заявки по администраторам точек"
          rows={rows} rowKey={(r: HandlingRow) => r.loc}
          columns={[
            { key: 'l', label: 'Администраторы', value: (r) => locName(ds, r.loc) },
            { key: 'n', label: 'Заявок', format: 'int', value: (r) => r.leads },
            { key: 'b', label: 'Записано', num: true, value: (r) => orDash(r.bookedShare, 'pct') },
            { key: 'a', label: 'Первый ответ', format: 'min', value: (r) => r.answerMin },
            { key: 'r', label: 'Выручка', format: 'money', value: (r) => r.revenue },
          ]}
        />
      </div>
    </Block>
  );
}

// ── r4: карточка клиента ──

const EVENT_LABEL = { visit: 'Визит', call: 'Звонок', message: 'Сообщение' } as const;

function ClientCardView({ id, className }: BlockViewProps) {
  const { ds, loc, def } = useSlice(id);
  const c = clientCard(ds, loc);
  const w = ds.profile.words;
  return (
    <Block title={def.title} question={def.question} className={className} custom={def.custom} sources={sourcesOf(ds, def)}>
      <div className="bf-stack">
        <div className="rb-client">
          <span className="rb-ava" aria-hidden="true">{c.name.charAt(0)}</span>
          <div>
            <b>{c.name}</b>
            <span>Первый визит {longDate(ds.anchor, c.since)}, источник: {c.source}. {cap(w.location[0])}: {locName(ds, c.loc)}</span>
          </div>
        </div>
        <Figs items={[
          { key: 'v', label: 'Визитов', value: fmt(c.visits, 'int') },
          { key: 's', label: 'Оплатил за всё время', value: fmt(c.spent, 'money') },
          { key: 'f', label: 'Чаще всего', value: c.favorite },
        ]} />
        <ol className="rb-timeline" aria-label="История клиента">
          {c.events.map((e, k) => (
            <li key={`${e.day}-${k}`} className={`is-${e.kind}`}>
              <time>{longDate(ds.anchor, e.day)}</time>
              <span><b>{EVENT_LABEL[e.kind]}</b> {e.text}{e.sum !== undefined && <>, {fmt(e.sum, 'rub')}</>}</span>
            </li>
          ))}
        </ol>
        <p className={`rb-next${c.overdue ? ' is-late' : ''}`}>
          Следующий шаг: {c.overdue
            ? <>позвать на повторный визит, пора было {longDate(ds.anchor, c.nextDay)}</>
            : <>напомнить о визите за два дня до {longDate(ds.anchor, c.nextDay)}</>}
        </p>
      </div>
    </Block>
  );
}

// ── r5: склад и закупки ──

const ROWS_SHOWN = 8;

function Stock({ id, className }: BlockViewProps) {
  const { ds, loc, win, def } = useSlice(id);
  const s = stock(ds, loc, win);
  const rows = s.rows.slice(0, ROWS_SHOWN);
  return (
    <Block title={def.title} question={def.question} className={className} custom={def.custom} sources={sourcesOf(ds, def)}>
      <div className="bf-stack">
        <Figs items={[
          { key: 'v', label: 'Запасов на складе', value: fmt(s.value, 'money') },
          { key: 'o', label: 'Пора заказать', value: `${fmt(s.toOrder, 'int')} поз.`, note: s.toOrder ? `на ${fmt(s.orderSum, 'money')}, запас на месяц` : 'всего хватает' },
        ]} />
        <DataTable
          caption={`Остатки: сначала то, что закончится раньше; заказываем, когда хватит меньше чем на ${REORDER_DAYS} дней`}
          rows={rows} rowKey={(r: StockRow) => r.key}
          columns={[
            { key: 'i', label: 'Позиция', value: (r) => (loc === 'all' ? `${r.item}, ${locName(ds, r.loc)}` : r.item) },
            { key: 'h', label: 'Остаток', num: true, value: (r) => count(r.onHand, r.unit) },
            { key: 'd', label: 'Хватит на', num: true, value: (r) => (r.daysLeft < REORDER_DAYS ? <span className="rb-short">{count(Math.floor(r.daysLeft), DAYS)}</span> : count(Math.floor(r.daysLeft), DAYS)) },
            { key: 'o', label: 'Заказать', num: true, value: (r) => (r.order ? count(r.order, r.unit) : '—') },
          ]}
        />
      </div>
    </Block>
  );
}

export const CRM_VIEWS: Record<string, ComponentType<BlockViewProps>> = {
  r1: Pipeline, r2: Tasks, r3: Handling, r4: ClientCardView, r5: Stock,
};
