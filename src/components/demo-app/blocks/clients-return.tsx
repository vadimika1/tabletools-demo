'use client';
// Клиенты, которых пора вернуть: спящие (c3) и те, кто пропустил обычный срок к барберу (x4).
// Кнопка действия в демо ничего не отправляет — показывает, куда уйдёт список в живом дашборде.
import { useState } from 'react';
import { Block } from '@/components/dash/kit/Block';
import { DataTable } from '@/components/dash/kit/DataTable';
import { BarList } from '@/components/dash/charts/BarList';
import { count, fmt } from '@/components/dash/format';
import { RETURN_DEADLINE, overdueClients, sleepingClients, type OverdueStaff, type SleepingClient } from '@/lib/demo-app/models/clients';
import { useDrill } from '../drill';
import { cap, sourcesOf, useSlice } from './common';
import { Figs, locName } from './money-kit';
import type { BlockViewProps } from './index';

const DAYS: readonly [string, string, string] = ['день', 'дня', 'дней'];
const STAFF_SHOWN = 8;

function Action({ label, notice }: { label: string; notice: string }) {
  const [sent, setSent] = useState(false);
  const handleSend = () => setSent(true);
  return (
    <div className="bf-action">
      <button type="button" className="btn btn-ink bf-btn" onClick={handleSend} disabled={sent}>{label}</button>
      <p className="bf-notice" role="status">{sent ? notice : ''}</p>
    </div>
  );
}

// ── c3: спящие клиенты ──

export function SleepingClients({ id, className }: BlockViewProps) {
  const { ds, loc, win, def } = useSlice(id);
  const s = sleepingClients(ds, loc, win);
  const w = ds.profile.words;
  const fifth = Math.round(s.value / 5);
  return (
    <Block title={def.title} question={def.question} className={className} custom={def.custom} sources={sourcesOf(ds, def)}>
      <div className="bf-stack">
        <Figs items={[
          { key: 'n', label: 'Спят', value: count(s.count, w.client), note: `не были дольше ${count(s.afterDays, DAYS)}` },
          { key: 'v', label: 'Могли бы принести за год', value: fmt(s.value, 'money'), note: 'если вернутся к обычному ритму' },
        ]} />
        <p className="bf-note">
          Вернуть хотя бы каждого пятого — это <b>{fmt(fifth, 'money')}</b> за год. Начните с тех, кто тратил больше всех:
        </p>
        <DataTable
          caption={`Примеры спящих ${w.client[2]}`}
          rowKey={(c: SleepingClient) => c.key}
          rows={s.sample}
          columns={[
            { key: 'n', label: cap(w.client[0]), value: (c) => c.name },
            { key: 'l', label: 'Точка', value: (c) => locName(ds, c.loc) },
            { key: 'd', label: 'Не был', value: (c) => count(c.days, DAYS) },
            { key: 'v', label: 'Визитов', format: 'int', value: (c) => c.visits },
            { key: 's', label: 'Потратил', format: 'rub', value: (c) => c.spent },
          ]}
        />
        <Action label="Отправить в рассылку" notice="В демо ничего не отправляется — в вашем дашборде список уйдёт в рассылку или администратору." />
      </div>
    </Block>
  );
}

// ── x4: возврат за 45 дней ──

export function OverdueClients({ id, className }: BlockViewProps) {
  const { ds, loc, def } = useSlice(id);
  const { open } = useDrill();
  const o = overdueClients(ds, loc);
  const w = ds.profile.words;
  const top = o.staff[0];
  const shown = o.staff.slice(0, STAFF_SHOWN);
  const handleStaff = (x: OverdueStaff) => open({ kind: 'staff', key: x.name });
  return (
    <Block
      title={o.deadline === RETURN_DEADLINE ? def.title : `Возврат за ${count(o.deadline, DAYS)}`}
      question={def.question}
      className={className}
      custom={def.custom}
      sources={sourcesOf(ds, def)}
      table={{
        columns: [
          { key: 'n', label: cap(w.staff[0]), value: (x: OverdueStaff) => x.name },
          { key: 'l', label: 'Точка', value: (x) => locName(ds, x.loc) },
          { key: 'c', label: cap(w.client[2]), format: 'int', value: (x) => x.count },
          { key: 'm', label: 'Недополучили', format: 'rub', value: (x) => x.money },
        ],
        rows: o.staff,
        rowKey: (x) => x.key,
        onRow: handleStaff,
      }}
    >
      <div className="bf-stack">
        <Figs items={[
          { key: 'n', label: 'Пропустили свой срок', value: count(o.count, w.client), note: `обычно приходят раз в ${o.usual[0]}–${o.usual[1]} ${DAYS[2]}` },
          { key: 'm', label: 'Это выручка', value: fmt(o.money, 'money'), note: 'если каждый придёт ещё раз' },
        ]} />
        {top && (
          <p className="bf-note">
            Больше всего таких {w.client[2]} у {w.staff[1]} <b>{top.name}</b> ({locName(ds, top.loc)}): {count(top.count, w.client)}, {fmt(top.money, 'money')}.
            Напоминание до {o.deadline}-го дня вернёт часть из них — список уже готов.
          </p>
        )}
        <BarList
          format="money"
          rows={shown.map((x) => ({ key: x.key, label: x.name, note: `${locName(ds, x.loc)}, ${count(x.count, w.client)}`, value: x.money, onClick: () => handleStaff(x) }))}
        />
        <Action label="Напомнить в WhatsApp" notice="В демо ничего не отправляется — в вашем дашборде напоминание уйдёт клиентам в WhatsApp с вашим текстом и ссылкой на запись." />
      </div>
    </Block>
  );
}
