'use client';
// Отраслевые блоки операционки: врачи (x2), барберы (x3), группы и тренеры (x6),
// заказ-наряды (x7), мероприятия (x9).
import { useState, type ComponentType } from 'react';
import { Block, Seg } from '@/components/dash/kit/Block';
import { BarList } from '@/components/dash/charts/BarList';
import { Mix } from '@/components/dash/charts/Mix';
import { count, fmt } from '@/components/dash/format';
import { perVisitOf } from '@/lib/demo-app/engine/dataset';
import {
  barbersModel, doctorsModel, eventsModel, groupsModel, MIN_FILL, ordersModel, PLAN_K, POST_NORM,
  type BarberLine, type ClassLine, type DoctorLine, type EventsLine, type PostLine, type TrainerLine,
} from '@/lib/demo-app/models/ops-industry';
import { useDrill } from '../drill';
import { cap, sourcesOf, useSlice } from './common';
import { channelTone, Figs, Flag, locTone, MeterRows, Note, ofN, orDash, TargetKey, type Verdict } from './ops-common';
import { LocLegend } from './ops-reviews';
import type { BlockViewProps } from './index';

const signedPct = (v: number | null) => (v === null ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmt(Math.abs(v), 'pct')}`);
const NEAR_PLAN = -0.1;
const NEAR_FILL = 0.08;

function planVerdict(r: DoctorLine): { tone: Verdict; text: string } {
  if (r.lagging) return { tone: 'bad', text: 'отстаёт' };
  if (r.vsPlan === null || r.vsPlan >= 0) return { tone: 'good', text: 'план есть' };
  return r.vsPlan >= NEAR_PLAN ? { tone: 'warn', text: 'почти' } : { tone: 'bad', text: 'ниже плана' };
}

const FOLD_AT = 8; // длинный список врачей сворачиваем: лидеры и двое последних, остальные по кнопке

function Doctors({ id, className }: BlockViewProps) {
  const { ds, loc, win, def } = useSlice(id);
  const { open } = useDrill();
  const m = doctorsModel(ds, loc, win);
  const w = ds.profile.words;
  const max = Math.max(...m.rows.map((r) => Math.max(r.revenue, r.plan)), 1) * 1.05;
  const done = m.rows.length - m.below.length;
  const lag = m.lagging;
  const [all, setAll] = useState(false);
  const folded = !all && m.rows.length > FOLD_AT;
  const shown = folded ? [...m.rows.slice(0, FOLD_AT - 2), ...m.rows.slice(-2)] : m.rows;
  return (
    <Block
      title={ds.profile.key === 'clinic' ? def.title : 'Выработка сотрудников'}
      question={def.question}
      className={className}
      custom={def.custom}
      sources={sourcesOf(ds, def)}
      table={{
        columns: [
          { key: 'n', label: cap(w.staff[0]), value: (r: DoctorLine) => r.name },
          { key: 'l', label: cap(w.location[0]), value: (r) => r.locName },
          { key: 'r', label: 'Выручка', format: 'rub', value: (r) => r.revenue },
          { key: 'p', label: 'План', format: 'rub', value: (r) => r.plan },
          { key: 'v', label: 'К плану', num: true, value: (r) => signedPct(r.vsPlan) },
          { key: 'c', label: 'Чек', format: 'rub', value: (r) => r.check },
          { key: 'd', label: `Загрузка: ${w.unit[0]}`, format: 'pct', value: (r) => r.load },
          { key: 'ret', label: 'Повторные', format: 'pct', value: (r) => r.returning },
        ],
        rows: m.rows,
        rowKey: (r) => `${r.loc}|${r.name}`,
        onRow: (r) => open({ kind: 'staff', key: r.name }),
      }}
    >
      <Figs
        items={[
          { key: 'd', label: 'Выполнили план', value: done, format: 'int', note: ofN(m.rows.length, w.staff) },
          { key: 's', label: 'Недобор к плану', value: m.shortfall, format: 'money', note: `ниже плана: ${m.below.length}` },
          { key: 'r', label: 'Повторные записи', value: m.rows.length ? m.rows.reduce((s, r) => s + r.returning * r.bookings, 0) / Math.max(1, m.rows.reduce((s, r) => s + r.bookings, 0)) : null, format: 'pct', note: 'в среднем' },
        ]}
      />
      <MeterRows
        format="money"
        max={max}
        targetLabel="план"
        rows={shown.map((r) => {
          const v = planVerdict(r);
          return {
            key: `${r.loc}|${r.name}`,
            label: r.name,
            sub: `${r.locName}, чек ${fmt(r.check, 'money')}, загрузка ${fmt(r.load, 'pct')}, повторные ${fmt(r.returning, 'pct')}`,
            value: r.revenue,
            target: r.plan,
            display: fmt(r.revenue, 'money'),
            tone: v.tone,
            flag: <Flag tone={v.tone}>{v.text}</Flag>,
            onClick: () => open({ kind: 'staff', key: r.name }),
          };
        })}
      />
      {m.rows.length > FOLD_AT && (
        <div className="ds-bl-more"><button type="button" onClick={() => setAll((v) => !v)}>{all ? 'Свернуть' : `Показать всех: ещё ${m.rows.length - shown.length}`}</button></div>
      )}
      <TargetKey label={`Черта — план: ${fmt(PLAN_K, 'pct')} средней выручки на человека по своей точке`} />
      {lag && lag.vsPlan !== null && (
        <Note>{lag.name}, {lag.locName}: {signedPct(lag.vsPlan)} к плану, не хватает {fmt(lag.plan - lag.revenue, 'money')}. Повторно записываются {fmt(lag.returning, 'pct')} {w.client[2]}.</Note>
      )}
    </Block>
  );
}

function Barbers({ id, className }: BlockViewProps) {
  const { ds, loc, win, def } = useSlice(id);
  const { open } = useDrill();
  const m = barbersModel(ds, loc, win);
  const w = ds.profile.words;
  const low = m.lowest;
  const many = loc === 'all' && ds.profile.locations.length > 1;
  return (
    <Block
      title={ds.profile.key === 'salon' ? def.title : 'К кому возвращаются'}
      question={def.question}
      className={className}
      custom={def.custom}
      sources={sourcesOf(ds, def)}
      table={{
        columns: [
          { key: 'n', label: cap(w.staff[0]), value: (r: BarberLine) => r.name },
          { key: 'l', label: cap(w.location[0]), value: (r) => r.locName },
          { key: 'g', label: 'Грейд', value: (r) => r.grade },
          { key: 'd', label: 'Загрузка', format: 'pct', value: (r) => r.load },
          { key: 'c', label: 'Чек', format: 'rub', value: (r) => r.check },
          { key: 'ret', label: 'Возвращаются', format: 'pct', value: (r) => r.returning },
        ],
        rows: m.rows,
        rowKey: (r) => `${r.loc}|${r.name}`,
        onRow: (r) => open({ kind: 'staff', key: r.name }),
      }}
    >
      <Figs
        items={[
          { key: 'a', label: 'Возвращаются в среднем', value: m.avgReturning, format: 'pct', note: 'к своему мастеру' },
          { key: 'l', label: 'Меньше всех', value: low?.returning ?? null, format: 'pct', note: low?.name },
          { key: 'm', label: 'Недобрали', value: m.lostMoney, format: 'money', note: count(m.lostVisits, w.visit) },
        ]}
      />
      <BarList limit={8}
        format="pct"
        max={1}
        rows={m.rows.map((r) => ({
          key: `${r.loc}|${r.name}`,
          label: <>{r.name}{r === low && <> <Flag tone="warn">меньше всех</Flag></>}</>,
          note: `${many ? `${r.locName}, ` : ''}грейд: ${r.grade}, загрузка ${fmt(r.load, 'pct')}, чек ${fmt(r.check, 'rub')}`,
          value: r.returning,
          tone: locTone(ds, r.loc),
          onClick: () => open({ kind: 'staff', key: r.name }),
        }))}
      />
      {many && <LocLegend ds={ds} />}
      {low && m.lostVisits > 0 && (
        <Note>{low.name}, {low.locName}: возвращаются {fmt(low.returning, 'pct')} против {orDash(m.avgReturning, 'pct')} в среднем. Если бы возвращались как к остальным — это ещё {count(m.lostVisits, w.visit)} на {fmt(m.lostMoney, 'money')}.</Note>
      )}
    </Block>
  );
}

function fillVerdict(fill: number | null): { tone: Verdict; text: string } {
  if (fill === null) return { tone: 'warn', text: 'нет занятий' };
  if (fill < MIN_FILL) return { tone: 'bad', text: 'ниже порога' };
  return fill < MIN_FILL + NEAR_FILL ? { tone: 'warn', text: 'на грани' } : { tone: 'good', text: 'окупается' };
}

type GroupsView = 'classes' | 'trainers';

function Groups({ id, className }: BlockViewProps) {
  const { ds, loc, win, t, def } = useSlice(id);
  const { open } = useDrill();
  const [view, setView] = useState<GroupsView>('classes');
  const m = groupsModel(ds, loc, win);
  const w = ds.profile.words;
  const byClass = view === 'classes';
  const list: readonly (ClassLine | TrainerLine)[] = byClass ? m.classes : m.trainers;
  const empty = m.seats - m.visits;
  const below = list.filter((x) => x.below);
  const meter = (x: ClassLine | TrainerLine) => {
    const v = fillVerdict(x.fill);
    const isTrainer = 'loc' in x;
    return {
      key: isTrainer ? `${x.loc}|${x.name}` : x.key,
      label: x.name,
      sub: `${isTrainer ? `${x.locName}, ` : ''}${count(x.classes, ['занятие', 'занятия', 'занятий'])}, ${count(x.visits, ['посещение', 'посещения', 'посещений'])}`,
      value: x.fill ?? 0,
      target: MIN_FILL,
      display: orDash(x.fill, 'pct'),
      tone: v.tone,
      flag: <Flag tone={v.tone}>{v.text}</Flag>,
      onClick: isTrainer ? () => open({ kind: 'staff', key: x.name }) : () => open({ kind: 'service', key: x.key }),
    };
  };
  if (!m.classes.length) {
    return (
      <Block title={def.title} question={def.question} className={className} custom={def.custom} sources={sourcesOf(ds, def)}>
        <Note>Групповых занятий в этом примере нет — блок строим по вашему расписанию.</Note>
      </Block>
    );
  }
  return (
    <Block
      title={def.title}
      question={def.question}
      className={className}
      custom={def.custom}
      sources={sourcesOf(ds, def)}
      actions={<Seg<GroupsView> label="Разрез" value={view} options={[['classes', 'По группам'], ['trainers', ds.profile.key === 'fitness' ? 'По тренерам' : 'По сотрудникам']]} onChange={setView} />}
      table={{
        columns: [
          { key: 'n', label: byClass ? 'Группа' : cap(w.staff[0]), value: (r: ClassLine | TrainerLine) => r.name },
          { key: 'c', label: 'Занятий', format: 'int', value: (r) => r.classes },
          { key: 'v', label: 'Посещений', format: 'int', value: (r) => r.visits },
          { key: 'f', label: 'Заполняемость', num: true, value: (r) => orDash(r.fill, 'pct') },
          { key: 'b', label: 'Отметка', value: (r) => fillVerdict(r.fill).text },
        ],
        rows: [...list],
        rowKey: (r) => ('loc' in r ? `${r.loc}|${r.name}` : r.key),
      }}
    >
      <Figs
        items={[
          { key: 'f', label: 'Заполняемость групп', value: m.fill, format: 'pct', note: `порог ${fmt(MIN_FILL, 'pct')}` },
          { key: 'b', label: 'Ниже порога', value: below.length, format: 'int', note: byClass ? ofN(list.length, ['группа', 'группы', 'групп']) : ofN(list.length, w.staff) },
          { key: 'e', label: 'Пустых мест', value: empty, format: 'int', note: `до ${fmt(empty * perVisitOf(t), 'money')} по средней цене посещения` },
        ]}
      />
      <MeterRows format="pct" max={1} targetLabel="порог" rows={list.map(meter)} />
      <TargetKey label={`Черта — минимальная заполняемость ${fmt(MIN_FILL, 'pct')}: ниже группа не окупается`} />
      {below[0] && <Note>{below.map((x) => x.name).join(', ')}: {byClass ? 'группы' : 'занятия'} заполнены меньше чем на {fmt(MIN_FILL, 'pct')}. Их стоит объединить или перенести на вечер.</Note>}
    </Block>
  );
}

function Orders({ id, className }: BlockViewProps) {
  const { ds, loc, win, def } = useSlice(id);
  const { open } = useDrill();
  const m = ordersModel(ds, loc, win);
  const w = ds.profile.words;
  const worst = m.worst;
  const dip = ds.profile.story.dip;
  const lag = m.mechanics.find((r) => r.lagging);
  return (
    <Block
      title={def.title}
      question={def.question}
      className={className}
      custom={def.custom}
      sources={sourcesOf(ds, def)}
      table={{
        columns: [
          { key: 'n', label: cap(w.location[0]), value: (r: PostLine) => r.name },
          { key: 'c', label: 'Часы постов', format: 'hours', value: (r) => r.capacity },
          { key: 's', label: 'Продано нормо-часов', format: 'hours', value: (r) => r.sold },
          { key: 'd', label: 'Загрузка', num: true, value: (r) => orDash(r.load, 'pct') },
          { key: 'g', label: 'До нормы', format: 'hours', value: (r) => r.gap },
          { key: 'm', label: 'Простой ниже нормы', format: 'rub', value: (r) => r.gapMoney },
        ],
        rows: m.rows,
        rowKey: (r) => r.loc,
        onRow: (r) => open({ kind: 'loc', key: r.loc }),
      }}
    >
      <Figs
        items={[
          { key: 's', label: 'Продано нормо-часов', value: m.sold, format: 'hours', note: `из ${fmt(m.capacity, 'hours')} постов` },
          { key: 'l', label: 'Загрузка постов', value: m.load, format: 'pct', note: `норма ${fmt(POST_NORM, 'pct')}` },
          { key: 'g', label: 'Простой ниже нормы', value: m.gapMoney, format: 'money', note: count(m.gap, ['час', 'часа', 'часов']) },
        ]}
      />
      <MeterRows
        format="pct"
        max={1}
        targetLabel="норма"
        rows={m.rows.map((r) => {
          const tone: Verdict = r.load !== null && r.load >= POST_NORM ? 'good' : r === worst ? 'bad' : 'warn';
          return {
            key: r.loc, label: r.name, sub: `простой ниже нормы ${fmt(r.gapMoney, 'money')}`, value: r.load ?? 0, target: POST_NORM,
            display: orDash(r.load, 'pct'), tone, flag: <Flag tone={tone}>{tone === 'good' ? 'в норме' : r === worst ? 'больше всех' : 'ниже нормы'}</Flag>,
            onClick: () => open({ kind: 'loc', key: r.loc }),
          };
        })}
      />
      <BarList limit={8}
        format="hours"
        rows={m.mechanics.map((r) => ({
          key: `${r.loc}|${r.name}`,
          label: <>{r.name}{r.lagging && <> <Flag tone="bad">отстаёт</Flag></>}</>,
          note: `${r.locName}, выработка ${fmt(r.load, 'pct')}, ${fmt(r.revenue, 'money')}`,
          value: r.sold,
          tone: locTone(ds, r.loc),
          onClick: () => open({ kind: 'staff', key: r.name }),
        }))}
      />
      {loc === 'all' && ds.profile.locations.length > 1 && <LocLegend ds={ds} />}
      {worst && (
        <Note>
          Больше всего простаивает {worst.name}: до нормы не хватило {count(worst.gap, ['часа', 'часов', 'часов'])} — это {fmt(worst.gapMoney, 'money')}.
          {worst.loc === dip.loc && <> Причина — {dip.reason}.</>}
          {lag && <> Меньше всех нормо-часов — {lag.name}, {lag.locName}: {fmt(lag.sold, 'hours')}.</>}
        </Note>
      )}
    </Block>
  );
}

function Events({ id, className }: BlockViewProps) {
  const { ds, loc, win, t, def } = useSlice(id);
  const { open } = useDrill();
  const m = eventsModel(ds, loc, win);
  const perVisit = perVisitOf(t);
  const topSource = [...m.sources].sort((a, b) => b.count - a.count)[0];
  if (!m.service) {
    return (
      <Block title={def.title} question={def.question} className={className} custom={def.custom} sources={sourcesOf(ds, def)}>
        <Note>Мероприятий в этом примере нет — блок строим по вашей CRM.</Note>
      </Block>
    );
  }
  return (
    <Block
      title={def.title}
      question={def.question}
      className={className}
      custom={def.custom}
      sources={sourcesOf(ds, def)}
      table={{
        columns: [
          { key: 'n', label: cap(ds.profile.words.location[0]), value: (r: EventsLine) => r.name },
          { key: 'e', label: 'Мероприятий', format: 'int', value: (r) => r.events },
          { key: 'g', label: 'Гостей', format: 'int', value: (r) => r.guests },
          { key: 'r', label: 'Выручка', format: 'rub', value: (r) => r.revenue },
          { key: 'c', label: 'Чек мероприятия', num: true, value: (r) => (r.events ? fmt(r.revenue / r.events, 'rub') : '—') },
        ],
        rows: m.rows,
        rowKey: (r) => r.loc,
        onRow: (r) => open({ kind: 'loc', key: r.loc }),
      }}
    >
      <Figs
        items={[
          { key: 'e', label: 'Мероприятий', value: m.events, format: 'int', note: `дни рождения ${m.kinds[0]}, корпоративы ${m.kinds[1]}` },
          { key: 'g', label: 'Средняя группа', value: m.avgGroup, format: 'int', note: 'гостей' },
          { key: 'c', label: 'Чек мероприятия', value: m.check, format: 'money', note: `выручка ${fmt(m.revenue, 'money')}` },
        ]}
      />
      <Mix label="Откуда пришли мероприятия" format="int" parts={m.sources.map((s) => ({ key: s.key, label: s.label, value: s.count, tone: channelTone(s.channel) }))} />
      {m.check !== null && perVisit > 0 && topSource && (
        <Note>
          Одно мероприятие — {fmt(m.check, 'money')}, как {count(Math.round(m.check / perVisit), ds.profile.words.visit)} обычного гостя.
          {' '}Больше всего пришло из источника «{topSource.label}»: {topSource.count} {ofN(m.events, ['мероприятия', 'мероприятий', 'мероприятий'])}.
        </Note>
      )}
    </Block>
  );
}

export const OPS_INDUSTRY_VIEWS: Record<string, ComponentType<BlockViewProps>> = {
  x2: Doctors,
  x3: Barbers,
  x6: Groups,
  x7: Orders,
  x9: Events,
};
