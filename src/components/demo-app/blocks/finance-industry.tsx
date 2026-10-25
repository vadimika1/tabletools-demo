'use client';
// Отраслевые блоки раздела «Финансы»: абонементы фитнеса (x5) и запчасти в заказ-нарядах (x8).
import { Block } from '@/components/dash/kit/Block';
import { Columns } from '@/components/dash/charts/Columns';
import { BarList } from '@/components/dash/charts/BarList';
import { toneVar, type Tone } from '@/components/dash/charts/Tip';
import { fmt, plural } from '@/components/dash/format';
import { SUMMER, memberships, summerChurn, type MembershipMonth } from '@/lib/demo-app/models/clients';
import { partsInCheck, type PartsRow } from '@/lib/demo-app/models/finance';
import { useDrill } from '../drill';
import { sourcesOf, useSlice } from './common';
import { Figs, Legend, orDash } from './money-kit';
import type { BlockViewProps } from './index';

// ── x5: абонементы ──

const MONTH = new Intl.DateTimeFormat('ru-RU', { month: 'short', timeZone: 'UTC' });
const monthLabel = (m: MembershipMonth) => `${MONTH.format(new Date(Date.UTC(m.year, m.month, 1))).replace('.', '')}${m.partial ? ', идёт' : ''}`;
const isSummer = (m: MembershipMonth) => (SUMMER as readonly number[]).includes(m.month);
const SUBS: readonly [string, string, string] = ['абонемент', 'абонемента', 'абонементов'];
const BASE_TONE: Tone = 1;
const SUMMER_TONE: Tone = 2;

export function Memberships({ id, className }: BlockViewProps) {
  const { ds, loc, def } = useSlice(id);
  const months = memberships(ds, loc);
  const s = summerChurn(months);
  const now = months[months.length - 1]!;
  const lastFull = [...months].reverse().find((m) => !m.partial) ?? now;
  const worst = [...months].filter((m) => m.churn !== null).sort((a, b) => b.churn! - a.churn!)[0];
  const known = months.filter((m) => m.churn !== null); // до открытия точки оттока нет — не рисуем нулём
  const lost = months.filter(isSummer).reduce((sum, m) => sum + m.churned, 0);
  return (
    <Block
      title={def.title}
      question={def.question}
      className={className}
      custom={def.custom}
      sources={sourcesOf(ds, def)}
      table={{
        columns: [
          { key: 'm', label: 'Месяц', value: (m: MembershipMonth) => monthLabel(m) },
          { key: 'a', label: 'Активные', format: 'int', value: (m) => m.active },
          { key: 's', label: 'Продали', format: 'int', value: (m) => m.sold },
          { key: 'r', label: 'Продлили', format: 'int', value: (m) => m.renewals },
          { key: 'f', label: 'Заморозили', format: 'int', value: (m) => m.frozen },
          { key: 'c', label: 'Ушли', format: 'int', value: (m) => m.churned },
          { key: 'p', label: 'Отток', num: true, value: (m) => orDash(m.churn, 'pct') },
        ],
        rows: months,
        rowKey: (m) => `${m.year}-${m.month}`,
      }}
    >
      <div className="bf-stack">
        <Figs items={[
          { key: 'a', label: 'Активных сейчас', value: fmt(now.active, 'int'), note: `заморожено ${fmt(now.frozen, 'int')}` },
          { key: 's', label: 'Продали за прошлый месяц', value: fmt(lastFull.sold, 'int'), note: `продлили ${fmt(lastFull.renewals, 'int')}` },
          { key: 'c', label: 'Отток летом', value: orDash(s.summer, 'pct'), note: `в остальные месяцы ${orDash(s.rest, 'pct')}` },
        ]} />
        {s.summer !== null && s.rest !== null && (
          <p className="bf-note">
            Летом уходит <b>{fmt(s.summer, 'pct')}</b> абонементов в месяц против {fmt(s.rest, 'pct')} в остальное время — за июнь, июль и август ушли {fmt(lost, 'int')} {plural(lost, SUBS)}.
            {worst && ` Хуже всего был ${monthLabel(worst)}: ${fmt(worst.churn!, 'pct')}.`} Заморозка вместо отмены и летний тариф удержат часть из них.
          </p>
        )}
        <div>
          <Columns label="Отток абонементов по месяцам" format="pct" height={180}
            columns={known.map((m) => ({ key: `${m.year}-${m.month}`, label: monthLabel(m), value: m.churn!, partial: m.partial, tone: isSummer(m) ? SUMMER_TONE : BASE_TONE, note: `ушли ${fmt(m.churned, 'int')} из ${fmt(m.renewals + m.churned, 'int')}` }))} />
          <Legend items={[{ key: 'y', label: 'Отток за месяц', color: toneVar(BASE_TONE) }, { key: 's', label: 'Летние месяцы', color: toneVar(SUMMER_TONE) }]} />
        </div>
      </div>
    </Block>
  );
}

// ── x8: запчасти в чеке ──

export function PartsInCheck({ id, className }: BlockViewProps) {
  const { ds, loc, win, def } = useSlice(id);
  const { open } = useDrill();
  const { rows, total } = partsInCheck(ds, loc, win);
  const ranked = rows.filter((r) => r.share !== null).sort((a, b) => b.share! - a.share!);
  const top = ranked[0];
  const earned = total.partsRevenue - total.partsCost;
  return (
    <Block
      title={def.title}
      question={def.question}
      className={className}
      custom={def.custom}
      sources={sourcesOf(ds, def)}
      table={{
        columns: [
          { key: 'n', label: 'Работы', value: (r: PartsRow) => r.name },
          { key: 'b', label: 'Записей', format: 'int', value: (r) => r.bookings },
          { key: 'v', label: 'Выручка', format: 'rub', value: (r) => r.revenue },
          { key: 'p', label: 'Запчасти в чеке', format: 'rub', value: (r) => r.partsRevenue },
          { key: 's', label: 'Доля', num: true, value: (r) => orDash(r.share, 'pct') },
          { key: 'c', label: 'Закупка', format: 'rub', value: (r) => r.partsCost },
          { key: 'm', label: 'Маржа', num: true, value: (r) => orDash(r.margin, 'pct') },
          { key: 'k', label: 'Наценка', num: true, value: (r) => orDash(r.markup, 'pct') },
        ],
        rows,
        rowKey: (r) => r.key,
        footer: total,
        onRow: (r) => open({ kind: 'service', key: r.key }),
      }}
    >
      <div className="bf-stack">
        <p className="bf-note">
          Запчасти — <b>{orDash(total.share, 'pct')}</b> выручки ({fmt(total.partsRevenue, 'money')}), на них заработали {fmt(earned, 'money')} при марже {orDash(total.margin, 'pct')}.
          {top && ` Больше всего держится на запчастях «${top.name}»: ${fmt(top.share!, 'pct')} чека.`}
        </p>
        <BarList
          format="pct"
          rows={ranked.map((r) => ({ key: r.key, label: r.name, value: r.share!, note: `маржа ${orDash(r.margin, 'pct')}, наценка ${orDash(r.markup, 'pct')}`, onClick: () => open({ kind: 'service', key: r.key }) }))}
        />
      </div>
    </Block>
  );
}
