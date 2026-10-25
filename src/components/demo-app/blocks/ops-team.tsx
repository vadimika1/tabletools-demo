'use client';
// Блоки «Операционки» p6–p10: персонал, отзывы, кто продаёт, материалы, корпоративы.
import type { ComponentType } from 'react';
import { Block } from '@/components/dash/kit/Block';
import { BarList } from '@/components/dash/charts/BarList';
import { Funnel } from '@/components/dash/charts/Funnel';
import { Mix } from '@/components/dash/charts/Mix';
import type { Tone } from '@/components/dash/charts/Tip';
import { count, fmt, plural } from '@/components/dash/format';
import {
  DEAL_STAGES, dealsModel, materialsModel, reviewsModel, SALE_SOURCES, saleLabels, salesModel, staffModel,
  type DealsLine, type MaterialsLine, type ReviewLine, type SalesLine, type StaffLine,
} from '@/lib/demo-app/models/ops-team';
import { useDrill } from '../drill';
import { cap, sourcesOf, useSlice } from './common';
import { Figs, Flag, locTone, MeterRows, Note, orDash, TargetKey, type Verdict } from './ops-common';
import { LocLegend, ReviewFeed, StarBar, STAR_TONES } from './ops-reviews';
import type { BlockViewProps } from './index';

const signed = (v: number, kind: 'pp' | 'money') => `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmt(Math.abs(v), kind)}`;

function Staff({ id, className }: BlockViewProps) {
  const { ds, loc, win, def } = useSlice(id);
  const { open } = useDrill();
  const m = staffModel(ds, loc, win);
  const w = ds.profile.words;
  const many = loc === 'all' && ds.profile.locations.length > 1;
  const perPerson = m.rows.length ? m.revenue / m.rows.length : null;
  const handleRow = (r: StaffLine) => open({ kind: 'staff', key: r.name });
  return (
    <Block
      title={def.title}
      question={def.question}
      className={className}
      custom={def.custom}
      sources={sourcesOf(ds, def)}
      table={{
        columns: [
          { key: 'n', label: cap(w.staff[0]), value: (r: StaffLine) => r.name },
          { key: 'l', label: cap(w.location[0]), value: (r) => r.locName },
          { key: 'b', label: cap(w.visit[2]), format: 'int', value: (r) => r.bookings },
          { key: 'r', label: 'Выручка', format: 'rub', value: (r) => r.revenue },
          { key: 'd', label: 'Загрузка', format: 'pct', value: (r) => r.load },
          { key: 'c', label: 'Чек', format: 'rub', value: (r) => r.check },
          { key: 'ret', label: 'Возвращаются', format: 'pct', value: (r) => r.returning },
          { key: 'f', label: 'Отметка', value: (r) => (r.lagging ? 'отстаёт' : '') },
        ],
        rows: m.rows,
        rowKey: (r) => `${r.loc}|${r.name}`,
        onRow: handleRow,
      }}
    >
      <Figs
        items={[
          { key: 'p', label: 'Выручка на человека', value: perPerson, format: 'money', note: `${m.rows.length} ${plural(m.rows.length, w.staff)} в охвате` },
          { key: 'l', label: 'Средняя загрузка смен', value: m.avgLoad, format: 'pct', note: 'занятые часы к часам в смене' },
          { key: 's', label: 'Зарплаты к выручке', value: m.payrollShare, format: 'pct', note: fmt(m.payroll, 'money') },
        ]}
      />
      <BarList limit={8}
        format="money"
        rows={m.rows.map((r) => ({
          key: `${r.loc}|${r.name}`,
          label: <>{r.name}{r.lagging && <> <Flag tone="bad">отстаёт</Flag></>}</>,
          note: `${many ? `${r.locName}, ` : ''}${count(r.bookings, w.visit)}, загрузка ${fmt(r.load, 'pct')}, чек ${fmt(r.check, 'rub')}, возвращаются ${fmt(r.returning, 'pct')}`,
          value: r.revenue,
          tone: locTone(ds, r.loc),
          onClick: () => handleRow(r),
        }))}
      />
      {many && <LocLegend ds={ds} />}
      {m.lagging.map((r) => (
        <Note key={`${r.loc}|${r.name}`}>
          {r.name}, {r.locName}: на {orDash(r.vsMedian === null ? null : -r.vsMedian, 'pct')} меньше медианы своей точки,
          {' '}это {fmt(r.vsMedian ? r.revenue / (1 + r.vsMedian) - r.revenue : 0, 'money')} за период. Загрузка {fmt(r.load, 'pct')}, возвращаются {fmt(r.returning, 'pct')} {w.client[2]}.
        </Note>
      ))}
    </Block>
  );
}

function Reviews({ id, className }: BlockViewProps) {
  const { ds, loc, win, def } = useSlice(id);
  const { open } = useDrill();
  const m = reviewsModel(ds, loc, win);
  const weak = m.weakest;
  return (
    <Block
      title={def.title}
      question={def.question}
      className={className}
      custom={def.custom}
      sources={sourcesOf(ds, def)}
      table={{
        columns: [
          { key: 'n', label: cap(ds.profile.words.location[0]), value: (r: ReviewLine) => r.name },
          { key: 'c', label: 'Отзывов', format: 'int', value: (r) => r.count },
          { key: 'a', label: 'Оценка', num: true, value: (r) => (r.count ? fmt(r.avg, 'rating') : '—') },
          ...[5, 4, 3, 2, 1].map((s, k) => ({ key: `s${s}`, label: `${s}★`, format: 'int' as const, value: (r: ReviewLine) => r.stars[k]! })),
          { key: 'l', label: 'Негатив', format: 'int', value: (r) => r.low },
          { key: 'nr', label: 'Без ответа', format: 'int', value: (r) => r.noReply },
        ],
        rows: m.rows,
        rowKey: (r) => r.loc,
        onRow: (r) => open({ kind: 'loc', key: r.loc }),
      }}
    >
      <div className="op-band ds-dark">
        <Figs
          items={[
            { key: 'a', label: loc === 'all' ? 'Оценка сети' : 'Оценка', value: m.avg, format: 'rating', note: 'из пяти' },
            { key: 'c', label: 'Отзывов', value: m.count, format: 'int', note: 'за период' },
            { key: 'l', label: 'Негатив', value: m.low, format: 'int', note: 'три звезды и ниже' },
            { key: 'r', label: 'Без ответа', value: m.noReply, format: 'int', note: 'ждут ответа' },
          ]}
        />
      </div>
      {m.rows.length > 1 && (
        <ul className="op-stars">
          {m.rows.map((r) => (
            <li key={r.loc}>
              <button type="button" className="op-stars-row is-link" onClick={() => open({ kind: 'loc', key: r.loc })}>
                <span className="op-stars-name">{r.name}</span>
                <StarBar stars={r.stars} />
                <b>{r.count ? fmt(r.avg, 'rating') : '—'}</b>
                <small>{r.noReply ? `без ответа ${r.noReply}` : 'все с ответом'}</small>
              </button>
            </li>
          ))}
        </ul>
      )}
      {m.rows.length > 1 && (
        <ul className="ds-legend" aria-label="Звёзды">
          {STAR_TONES.map((t, k) => <li key={t}><i className="box" style={{ background: `var(${t})` }} />{5 - k}★</li>)}
        </ul>
      )}
      {weak && m.rows.length > 1 && (
        <Note>Хуже всех — {weak.name}: оценка {fmt(weak.avg, 'rating')}, негативных {weak.low} из {weak.count}, без ответа {weak.noReply}. Там же больше всего пропущенных обращений — в негативе об этом и пишут.</Note>
      )}
      <ReviewFeed items={m.feed} />
    </Block>
  );
}

function Sales({ id, className }: BlockViewProps) {
  const { ds, loc, win, def } = useSlice(id);
  const { open } = useDrill();
  const m = salesModel(ds, loc, win);
  const labels = saleLabels(ds);
  const w = ds.profile.words;
  const online = m.rows.length > 1 ? m.rows.reduce((a, r) => (r.counts[1]! / (r.served || 1) < a.counts[1]! / (a.served || 1) ? r : a)) : null;
  const footer: SalesLine = { loc: 'all', name: 'Итого', served: m.served, counts: m.counts, revenue: m.revenue };
  return (
    <Block
      title={def.title}
      question={def.question}
      className={className}
      custom={def.custom}
      sources={sourcesOf(ds, def)}
      table={{
        columns: [
          { key: 'n', label: cap(w.location[0]), value: (r: SalesLine) => r.name },
          ...SALE_SOURCES.map((s, k) => ({ key: s, label: labels[s], format: 'int' as const, value: (r: SalesLine) => r.counts[k]! })),
          { key: 't', label: 'Всего', format: 'int', value: (r) => r.served },
        ],
        rows: m.rows,
        rowKey: (r) => r.loc,
        onRow: (r) => open({ kind: 'loc', key: r.loc }),
        footer: m.rows.length > 1 ? footer : undefined,
      }}
    >
      <Mix label="Кто записал" format="int" parts={SALE_SOURCES.map((s, k) => ({ key: s, label: labels[s], value: m.counts[k]!, tone: (k + 1) as Tone }))} />
      <Note>
        Администраторы записали {orDash(m.shares[0], 'pct')}: {count(m.counts[0]!, w.visit)} на {fmt(m.revenue[0]!, 'money')}.
        {online && <> Реже всего записываются онлайн — {online.name}: {fmt(online.counts[1]! / (online.served || 1), 'pct')}.</>}
      </Note>
    </Block>
  );
}

function verdictOf(dev: number | null): { tone: Verdict; text: string } {
  if (dev === null) return { tone: 'warn', text: 'нет данных' };
  if (dev > 0.005) return { tone: 'bad', text: 'выше цели' };
  if (dev > 0) return { tone: 'warn', text: 'чуть выше' };
  return { tone: 'good', text: 'в норме' };
}

function Materials({ id, className }: BlockViewProps) {
  const { ds, loc, win, def } = useSlice(id);
  const { open } = useDrill();
  const m = materialsModel(ds, loc, win);
  const max = Math.max(m.target, ...m.rows.map((r) => r.share ?? 0)) * 1.25;
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
          { key: 'n', label: cap(ds.profile.words.location[0]), value: (r: MaterialsLine) => r.name },
          { key: 'r', label: 'Выручка', format: 'rub', value: (r) => r.revenue },
          { key: 'm', label: 'Материалы', format: 'rub', value: (r) => r.materials },
          { key: 's', label: 'Доля', num: true, value: (r) => orDash(r.share, 'pct') },
          { key: 'd', label: 'К цели', num: true, value: (r) => (r.dev === null ? '—' : signed(r.dev, 'pp')) },
          { key: 'o', label: 'Сверх цели', format: 'rub', value: (r) => r.over },
        ],
        rows: m.rows,
        rowKey: (r) => r.loc,
        onRow: (r) => open({ kind: 'loc', key: r.loc }),
      }}
    >
      <Figs
        items={[
          { key: 's', label: 'Материалы к выручке', value: m.share, format: 'pct', note: `цель ${fmt(m.target, 'pct')}` },
          { key: 'd', label: 'К цели', value: m.dev === null ? null : Math.abs(m.dev), format: 'pp', note: m.dev === null ? undefined : m.dev > 0 ? 'выше цели' : 'ниже цели' },
          { key: 'o', label: m.over > 0 ? 'Перерасход' : 'Экономия', value: Math.abs(m.over), format: 'money', note: 'к целевой доле' },
        ]}
      />
      <MeterRows
        format="pct"
        max={max}
        targetLabel="цель"
        rows={m.rows.map((r) => {
          const v = verdictOf(r.dev);
          return {
            key: r.loc,
            label: r.name,
            sub: r.dev === null ? undefined : `${signed(r.dev, 'pp')} к цели, ${r.over > 0 ? 'перерасход' : 'экономия'} ${fmt(Math.abs(r.over), 'money')}`,
            value: r.share ?? 0,
            target: m.target,
            display: orDash(r.share, 'pct'),
            tone: v.tone,
            flag: <Flag tone={v.tone}>{v.text}</Flag>,
            onClick: () => open({ kind: 'loc', key: r.loc }),
          };
        })}
      />
      <TargetKey label={`Цель — ${fmt(m.target, 'pct')} выручки`} />
      {worst && worst.over > 0 && <Note>Больше всего сверх цели тратит {worst.name}: {fmt(worst.over, 'money')} за период. Стоит сверить списания с записями по услугам.</Note>}
    </Block>
  );
}

function Deals({ id, className }: BlockViewProps) {
  const { ds, loc, win, def } = useSlice(id);
  const { open } = useDrill();
  const m = dealsModel(ds, loc, win);
  const drops = m.stages.slice(1).map((v, k) => ({ k, rate: m.stages[k] ? v / m.stages[k]! : 1 }));
  const worstDrop = drops.reduce((a, d) => (d.rate < a.rate ? d : a), drops[0]!);
  return (
    <Block
      title={def.title}
      question={def.question}
      className={className}
      custom={def.custom}
      sources={sourcesOf(ds, def)}
      table={{
        columns: [
          { key: 'n', label: cap(ds.profile.words.location[0]), value: (r: DealsLine) => r.name },
          ...DEAL_STAGES.map((s, k) => ({ key: `s${k}`, label: s, format: 'int' as const, value: (r: DealsLine) => r.stages[k]! })),
          { key: 'p', label: 'Оплачено', format: 'rub', value: (r) => r.paid },
        ],
        rows: m.rows,
        rowKey: (r) => r.loc,
        onRow: (r) => open({ kind: 'loc', key: r.loc }),
      }}
    >
      <Figs
        items={[
          { key: 'w', label: 'Дошли до мероприятия', value: m.wonRate, format: 'pct', note: 'от заявок' },
          { key: 'p', label: 'Оплачено', value: m.paid, format: 'money', note: 'с предоплатами будущих' },
          { key: 'a', label: 'Средняя сделка', value: m.avgDeal, format: 'money', note: 'по проведённым' },
        ]}
      />
      <Funnel steps={DEAL_STAGES.map((s, k) => ({ key: s, label: s, value: m.stages[k]! }))} />
      {m.stages[0] ? (
        <Note>
          Больше всего теряем между этапами «{DEAL_STAGES[worstDrop.k]}» и «{DEAL_STAGES[worstDrop.k + 1]}»: дальше проходят {fmt(worstDrop.rate, 'pct')}.
          {m.avgDeal !== null && <> Каждая сделка, которую довели до конца, — это {fmt(m.avgDeal, 'money')}.</>}
        </Note>
      ) : <Note>Заявок за период не было.</Note>}
    </Block>
  );
}

export const OPS_TEAM_VIEWS: Record<string, ComponentType<BlockViewProps>> = {
  p6: Staff,
  p7: Reviews,
  p8: Sales,
  p9: Materials,
  p10: Deals,
};
