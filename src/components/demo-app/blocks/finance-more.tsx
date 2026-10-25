'use client';
// Финансы, приоритет 2: деньги на 13 недель (f5), скидки и долги клиентов (f6), партнёры и роялти (f7).
import { Block } from '@/components/dash/kit/Block';
import { DataTable } from '@/components/dash/kit/DataTable';
import { Stat } from '@/components/dash/kit/Stat';
import { Columns } from '@/components/dash/charts/Columns';
import { Trend } from '@/components/dash/charts/Trend';
import { BarList } from '@/components/dash/charts/BarList';
import { toneVar, type Tone } from '@/components/dash/charts/Tip';
import { count, fmt, plural } from '@/components/dash/format';
import { CASH_LINES, cashForecast, type CashKey, type CashWeek } from '@/lib/demo-app/models/cash';
import { ROYALTY, discounts, partners, type DebtBucket, type PartnerRow, type PromoRow } from '@/lib/demo-app/models/finance';
import { cap, sourcesOf, useSlice } from './common';
import { Flag, Legend, lc, longDay, shortDay } from './money-kit';
import type { BlockViewProps } from './index';

// ── f5: деньги на 13 недель ──

const IN_TONE: Tone = 1;
const OUT_TONE: Tone = 2;
const BIG_OUT: readonly CashKey[] = ['payroll', 'rent', 'taxes'];

/** Крупные платежи недели словами: «зарплата, налог УСН». */
function bigPayments(w: CashWeek): string {
  const names = BIG_OUT.filter((k) => w.out[k] > 0).map((k) => lc(CASH_LINES.find((l) => l.key === k)!.name));
  return names.join(', ');
}

export function CashWeeks({ id, className }: BlockViewProps) {
  const { ds, loc, def } = useSlice(id);
  const c = cashForecast(ds, loc);
  const low = c.lowest;
  const gapWeek = c.gap ? c.weeks[c.gap.week]! : null;
  const columns = c.weeks.flatMap((w) => [
    { key: `${w.k}-in`, label: shortDay(w.startIso), value: w.inflow, tone: IN_TONE, note: 'приход за неделю' },
    { key: `${w.k}-out`, label: shortDay(w.startIso), value: w.outflow, tone: OUT_TONE, note: bigPayments(w) ? `расход, в том числе ${bigPayments(w)}` : 'расход за неделю' },
  ]);
  return (
    <Block
      title={def.title}
      question={def.question}
      className={className}
      custom={def.custom}
      sources={sourcesOf(ds, def)}
      table={{
        columns: [
          { key: 'w', label: 'Неделя с', value: (w: CashWeek) => shortDay(w.startIso) },
          { key: 'i', label: 'Приход', format: 'rub', value: (w) => w.inflow },
          { key: 'o', label: 'Расход', format: 'rub', value: (w) => w.outflow },
          { key: 'b', label: 'Крупные платежи', value: (w) => bigPayments(w) || '—' },
          { key: 'r', label: 'Остаток на конец', format: 'rub', value: (w) => w.balance },
        ],
        rows: c.weeks,
        rowKey: (w) => w.startIso,
      }}
    >
      <div className="bf-stack">
        <p className="bf-note">
          {c.gap && gapWeek ? (
            <>
              <Flag tone="bad">Кассовый разрыв</Flag>{' '}
              <b>{longDay(c.gap.iso)}</b>: денег не хватит на платежи недели{bigPayments(gapWeek) ? ` (${bigPayments(gapWeek)})` : ''}, минус дойдёт до <b>{fmt(c.gap.amount, 'money')}</b>. Перенесите платёж или отложите деньги заранее.
            </>
          ) : (
            <>
              <Flag tone="good">Разрыва не будет</Flag>{' '}
              Самый низкий остаток — <b>{fmt(low.low, 'money')}</b> {longDay(low.lowIso)}, в неделю с {longDay(low.startIso)}{bigPayments(low) ? ` (крупные платежи: ${bigPayments(low)})` : ''}.
            </>
          )}{' '}
          На старте {fmt(c.opening, 'money')} — прибыль последних четырёх недель, через 13 недель будет {fmt(c.closing, 'money')}.
        </p>
        <div>
          <Columns label="Приход и расход по неделям" format="money" height={180} columns={columns} />
          <Legend items={[{ key: 'in', label: 'Приход', color: toneVar(IN_TONE) }, { key: 'out', label: 'Расход', color: toneVar(OUT_TONE) }]} />
        </div>
        <div>
          <p className="bf-hint">Остаток на конец недели</p>
          <Trend label="Остаток денег на конец каждой недели" height={120} format="money" labels={c.weeks.map((w) => shortDay(w.startIso))}
            series={[{ key: 'bal', label: 'Остаток', values: c.weeks.map((w) => w.balance), tone: 1 }]} />
        </div>
      </div>
    </Block>
  );
}

// ── f6: скидки и неоплаченное ──

const PLANS: readonly [string, string, string] = ['план', 'плана', 'планов'];
const USES: readonly [string, string, string] = ['применение', 'применения', 'применений'];

export function DiscountsDebts({ id, className }: BlockViewProps) {
  const { ds, loc, win, prevWin, vs, def } = useSlice(id);
  const d = discounts(ds, loc, win, prevWin);
  const top = d.promos[0];
  const u = d.unpaid;
  const isPlans = u.kind === 'plans';
  const old = u.buckets[u.buckets.length - 1];
  return (
    <Block
      title={def.title}
      question={def.question}
      className={className}
      custom={def.custom}
      sources={sourcesOf(ds, def)}
      table={{
        columns: [
          { key: 'n', label: 'Скидка', value: (p: PromoRow) => p.name },
          { key: 'a', label: 'Отдали', format: 'rub', value: (p) => p.amount },
          { key: 'u', label: 'Применений', format: 'int', value: (p) => p.uses },
          { key: 's', label: 'Доля скидок', num: true, value: (p) => (d.amount ? fmt(p.amount / d.amount, 'pct') : '—') },
        ],
        rows: d.promos,
        rowKey: (p) => p.key,
      }}
    >
      <div className="bf-stack">
        <div className="ds-stats">
          <Stat label="Отдали скидками" value={d.amount} prev={d.prev} vs={vs} format="money" goodWhen="down"
            note={d.share === null ? undefined : `${fmt(d.share, 'pct')} от выручки до скидок`} />
          <Stat label={isPlans ? 'Рассрочка по планам лечения' : 'Остатки после предоплаты'} value={u.total} format="money"
            note={isPlans ? `${count(u.count, PLANS)} ещё не оплачены целиком` : `${count(u.count, ds.profile.words.client)} доплатят на месте`} />
        </div>
        {top && (
          <p className="bf-note">
            Больше всего отдали по скидке «{top.name}»: <b>{fmt(top.amount, 'money')}</b>, {count(top.uses, USES)}.
            {old && old.amount > 0 && ` ${isPlans ? 'Платежи по рассрочке' : 'Доплаты'} старше 60 дней — ${fmt(old.amount, 'money')}: их пора напомнить.`}
          </p>
        )}
        <BarList format="money" rows={d.promos.map((p) => ({ key: p.key, label: p.name, value: p.amount, note: count(p.uses, USES) }))} />
        <DataTable
          caption={isPlans ? 'Рассрочка по сроку' : 'Остатки по сроку'}
          rowKey={(b: DebtBucket) => b.key}
          rows={u.buckets}
          columns={[
            { key: 'n', label: 'Сколько ждём', value: (b) => b.name },
            { key: 'c', label: isPlans ? 'Планов' : cap(plural(5, ds.profile.words.client)), format: 'int', value: (b) => b.count },
            { key: 'a', label: 'Сумма', format: 'rub', value: (b) => b.amount },
          ]}
        />
      </div>
    </Block>
  );
}

// ── f7: партнёры и франшиза ──

const LATE_SHARE = 0.3; // не оплачено больше 30% начисленного — партнёр задерживает

export function Partners({ id, className }: BlockViewProps) {
  const { ds, win, def } = useSlice(id);
  const { rows, total } = partners(ds, win);
  const worst = [...rows].sort((a, b) => b.owed - a.owed)[0];
  const brand = ds.profile.business.match(/«(.+)»/)?.[1] ?? ds.profile.business;
  return (
    <Block title={def.title} question={def.question} className={className} custom={def.custom} sources={sourcesOf(ds, def)}>
      <div className="bf-stack">
        {worst && (
          <p className="bf-note">
            Партнёры «{brand}» в других городах заработали {fmt(total.revenue, 'money')}, роялти {fmt(ROYALTY, 'pct')} — {fmt(total.charged, 'money')}.
            Не оплачено <b>{fmt(total.owed, 'money')}</b>, больше всех должен {worst.city}: {fmt(worst.owed, 'money')}.
          </p>
        )}
        <DataTable
          caption="Партнёры: выручка, роялти и долг"
          rowKey={(r: PartnerRow) => r.key}
          rows={rows}
          footer={total}
          columns={[
            { key: 'c', label: 'Партнёр', value: (r) => (r.key === 'total' ? r.city : <span className="bf-cell">{r.city}{r.charged && r.owed / r.charged > LATE_SHARE ? <small><Flag tone="bad">задерживает оплату</Flag></small> : null}</span>) },
            { key: 'r', label: 'Выручка', format: 'rub', value: (r) => r.revenue },
            { key: 'ch', label: 'Роялти начислено', format: 'rub', value: (r) => r.charged },
            { key: 'rc', label: 'Получено', format: 'rub', value: (r) => r.received },
            { key: 'o', label: 'Долг', format: 'rub', value: (r) => r.owed },
          ]}
        />
      </div>
    </Block>
  );
}
