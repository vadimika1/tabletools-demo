'use client';
// Блоки «Обзора» o2, o3, o5, o6 по образцу overview.tsx: данные — через useSlice и модели,
// тексты по умолчанию — из реестра, у списков и полос есть табличный двойник.
import type { ComponentType, ReactNode } from 'react';
import { Block } from '@/components/dash/kit/Block';
import { Num } from '@/components/dash/kit/Stat';
import { toneVar, type Tone } from '@/components/dash/charts/Tip';
import { count, delta as fmtDelta, fmt } from '@/components/dash/format';
import { SECTIONS } from '@/lib/demo-app/blocks/registry';
import {
  atLoc, compareAll, CONTACTS, locationsTable, lostRevenue, nextActions, type LocRow, type LostItem,
} from '@/lib/demo-app/models/overview';
import type { Dataset } from '@/lib/demo-app/engine/dataset';
import { useDemo } from '../state';
import { useDrill } from '../drill';
import { cap, sourcesOf, useSlice } from './common';
import { SectionLink, ToneIcon } from './insights-parts';
import type { BlockViewProps } from './index';
import { StackWrap } from '@/components/dash/kit/StackWrap';

// ── o2 Упущенная выручка ─────────────────────────────────────────────

const LOST_LABEL: Record<LostItem['key'], string> = {
  noshow: 'Неявки',
  prime: 'Пустые прайм-часы',
  comms: 'Пропущенные обращения',
  ads: 'Реклама без отдачи',
};

function lostNote(ds: Dataset, it: LostItem): string {
  const w = ds.profile.words;
  const where = it.worst ? `, больше всего ${atLoc(ds, it.worst)}` : '';
  switch (it.key) {
    case 'noshow': return `${cap(count(it.count, w.client))} не пришли по записи${where}`;
    case 'prime': return `${it.count.toLocaleString('ru-RU')} ч свободно в самое спросовое время${where}`;
    case 'comms': return `${cap(count(it.count, CONTACTS))} без ответа в рабочее время${where}`;
    case 'ads': return it.names.length ? `Без продаж: ${it.names.map((n) => `«${n}»`).join(', ')}` : 'Все кампании приносят продажи';
  }
}

interface LostRow { key: string; label: string; money: number; share: number }

function LostRevenue({ id, className }: BlockViewProps) {
  const { ds, loc, win, def } = useSlice(id);
  const { model } = useDemo();
  const lost = lostRevenue(ds, loc, win, model);
  return (
    <Block
      title={def.title}
      question={def.question}
      className={className}
      custom={def.custom}
      sources={sourcesOf(ds, def)}
      table={{
        columns: [
          { key: 'n', label: 'Где теряем', value: (r: LostRow) => r.label },
          { key: 'm', label: 'Сумма', format: 'rub', value: (r) => r.money },
          { key: 's', label: 'Доля', format: 'pct', value: (r) => r.share },
        ],
        rows: lost.items.map((it) => ({ key: it.key, label: LOST_LABEL[it.key], money: it.money, share: lost.total ? it.money / lost.total : 0 })),
        rowKey: (r) => r.key,
        footer: { key: 'total', label: 'Всего', money: lost.total, share: 1 },
      }}
    >
      <div className="bi-lost">
        <p className="bi-lost-total">
          <strong><Num value={-lost.total} format="money" /></strong>
          <span>упущено за период{loc === 'all' ? ' по всей сети' : ''}, по пунктам ниже</span>
        </p>
        <ul className="bi-lost-list">
          {lost.items.map((it) => (
            <li key={it.key}>
              <div className="bi-lost-head">
                <b>{LOST_LABEL[it.key]}</b>
                <span className="bi-lost-sum">{fmt(-it.money, 'money')}</span>
              </div>
              <span className="bi-lost-track" aria-hidden="true">
                <i style={{ ['--w' as string]: lost.total ? it.money / lost.total : 0 }} />
              </span>
              <p className="bi-note">{lostNote(ds, it)}</p>
              <SectionLink section={it.section} />
            </li>
          ))}
        </ul>
      </div>
    </Block>
  );
}

// ── o3 Что сделать сейчас ────────────────────────────────────────────

function NextActions({ id, className }: BlockViewProps) {
  const { ds, loc, win, def } = useSlice(id);
  const { model } = useDemo();
  const acts = nextActions(ds, loc, win, model);
  const sum = acts.reduce((s, a) => s + a.money, 0);
  return (
    <Block
      title={def.title}
      question={`${def.question}. Вместе — до ${fmt(sum, 'money')} за период`}
      className={className}
      custom={def.custom}
      sources={sourcesOf(ds, def)}
      table={{
        columns: [
          { key: 't', label: 'Действие', value: (r: (typeof acts)[number]) => r.title },
          { key: 'm', label: 'Оценка', format: 'rub', value: (r) => r.money },
          { key: 's', label: 'Раздел', value: (r) => SECTIONS[r.section].title },
        ],
        rows: acts,
        rowKey: (r) => r.key,
      }}
    >
      <ol className="bi-acts">
        {acts.map((a) => (
          <li key={a.key}>
            <div className="bi-acts-text">
              <b>{a.title}</b>
              <p className="bi-note">{a.why}</p>
              <SectionLink section={a.section} />
            </div>
            <span className="bi-acts-sum">
              <strong>+{fmt(a.money, 'money')}</strong>
              <small>оценка за период</small>
            </span>
          </li>
        ))}
      </ol>
    </Block>
  );
}

// ── o5 Против всех сравнений ─────────────────────────────────────────

function AgainstAll({ id, className }: BlockViewProps) {
  const { ds, loc, def } = useSlice(id);
  const { period, compare } = useDemo();
  const cmp = compareAll(ds, loc, period, compare);
  type Row = (typeof cmp.rows)[number];
  return (
    <Block
      title={def.title}
      question={def.question}
      className={className}
      custom={def.custom}
      sources={sourcesOf(ds, def)}
      table={{
        columns: [
          { key: 'l', label: 'Сравнение', value: (r: Row) => `К ${r.label}` },
          { key: 'r', label: 'Выручка тогда', format: 'rub', value: (r) => r.revenue },
          { key: 'rd', label: 'Выручка сейчас к тогда', value: (r) => fmtDelta(r.revDelta) },
          { key: 's', label: 'Записи тогда', format: 'int', value: (r) => r.served },
          { key: 'sd', label: 'Записи сейчас к тогда', value: (r) => fmtDelta(r.servedDelta) },
        ],
        rows: cmp.rows,
        rowKey: (r) => r.key,
      }}
    >
      <div className="bi-vs">
        <p className="bi-vs-now">
          <span>Сейчас</span>
          <b><Num value={cmp.revenue} format="money" /></b>
          <span>{count(cmp.served, ds.profile.words.visit)}</span>
        </p>
        <ul className="bi-vs-list">
          {cmp.rows.map((r) => (
            <li key={r.key} className={r.selected ? 'is-on' : undefined}>
              <span className="bi-vs-label">
                {`К ${r.label}`}
                {r.selected && <em>выбрано в фильтре</em>}
              </span>
              <span className="bi-vs-cell"><small>выручка</small><DeltaChip d={r.revDelta} /></span>
              <span className="bi-vs-cell"><small>записи</small><DeltaChip d={r.servedDelta} /></span>
            </li>
          ))}
        </ul>
      </div>
    </Block>
  );
}

const FLAT = 0.005;

/** Изменение со значком и цветом по смыслу (рост — хорошо); нет базы для сравнения — прочерк. */
function DeltaChip({ d }: { d: number | null }) {
  if (d === null) return <span className="bi-d"><b>—</b><span className="sr-only">нет данных для сравнения</span></span>;
  const flat = Math.abs(d) < FLAT;
  const tone = flat ? '' : d > 0 ? 'good' : 'bad';
  return (
    <span className={`bi-d ${tone}`}>
      {!flat && (
        <svg viewBox="0 0 12 12" aria-hidden="true" fill="currentColor">{d > 0 ? <path d="M6 2l4.5 6h-9z" /> : <path d="M6 10L1.5 4h9z" />}</svg>
      )}
      <b>{flat ? '0%' : fmtDelta(d)}</b>
      {flat && <span className="sr-only">, без изменений</span>}
      {tone && <span className="sr-only">{tone === 'good' ? ', хорошо' : ', плохо'}</span>}
    </span>
  );
}

// ── o6 Точки рядом ───────────────────────────────────────────────────

function Weak({ on, children }: { on: boolean; children: ReactNode }) {
  if (!on) return <>{children}</>;
  return <span className="bi-weak"><ToneIcon tone="warn" />{children}<span className="sr-only">, проседает</span></span>;
}


function LocationsNearby({ id, className }: BlockViewProps) {
  const { ds, loc, win, prevWin, vs, def } = useSlice(id);
  const { open } = useDrill();
  const tbl = locationsTable(ds, loc, win, prevWin);
  const w = ds.profile.words;
  const maxShare = Math.max(...tbl.rows.map((r) => r.share), 0);
  const weakCount = tbl.rows.filter((r) => Object.values(r.weak).some(Boolean)).length;
  const footer: LocRow = {
    ...tbl.total, key: 'total', name: 'Вся сеть', tone: 1,
    weak: { load: false, noShow: false, margin: false, delta: false }, selected: false,
  };
  return (
    <Block
      title={def.title}
      question={`${def.question}. Проседает ${count(weakCount, w.location)} из ${tbl.rows.length}`}
      className={className}
      custom={def.custom}
      sources={sourcesOf(ds, def)}
    >
      <div className="bi-locs">
        <StackWrap>
          <table className="ds-table">
            <caption className="sr-only">{`${def.title}: выручка, доля, загрузка, неявки, маржа и изменение ${vs}`}</caption>
            <thead>
              <tr>
                <th scope="col">Точка</th>
                <th scope="col" className="num">Выручка</th>
                <th scope="col">Доля сети</th>
                <th scope="col" className="num">Загрузка</th>
                <th scope="col" className="num">Неявки</th>
                <th scope="col" className="num">Маржа</th>
                <th scope="col" className="num">К {vs}</th>
              </tr>
            </thead>
            <tbody>
              {tbl.rows.map((r) => {
                const handleOpen = () => open({ kind: 'loc', key: r.key });
                return (
                  <tr key={r.key} className={`is-link${r.selected ? ' bi-sel' : ''}`} tabIndex={0} onClick={handleOpen}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleOpen(); } }}
                    aria-label={`${r.name}: открыть детализацию`}>
                    <td>
                      <span className="bi-loc-name"><i style={{ background: toneVar(r.tone as Tone) }} aria-hidden="true" />{r.name}</span>
                      {r.selected && <em className="bi-tag">в фильтре</em>}
                    </td>
                    <td className="num">{fmt(r.revenue, 'rub')}</td>
                    <td>
                      <span className="bi-share">
                        <span className="bi-share-track" aria-hidden="true"><i style={{ ['--w' as string]: maxShare ? r.share / maxShare : 0, background: toneVar(r.tone as Tone) }} /></span>
                        {fmt(r.share, 'pct')}
                      </span>
                    </td>
                    <td className="num"><Weak on={r.weak.load}>{fmt(r.load, 'pct')}</Weak></td>
                    <td className="num"><Weak on={r.weak.noShow}>{fmt(r.noShow, 'pct')}</Weak></td>
                    <td className="num"><Weak on={r.weak.margin}>{fmt(r.margin, 'pct')}</Weak></td>
                    <td className="num"><Weak on={r.weak.delta}><DeltaChip d={r.delta} /></Weak></td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td>{footer.name}</td>
                <td className="num">{fmt(footer.revenue, 'rub')}</td>
                <td>{fmt(1, 'pct')}</td>
                <td className="num">{fmt(footer.load, 'pct')}</td>
                <td className="num">{fmt(footer.noShow, 'pct')}</td>
                <td className="num">{fmt(footer.margin, 'pct')}</td>
                <td className="num"><DeltaChip d={footer.delta} /></td>
              </tr>
            </tfoot>
          </table>
        </StackWrap>
        <p className="bi-legend"><ToneIcon tone="warn" />проседает относительно сети: загрузка, неявки, маржа или выручка к {vs}. Строка открывает детализацию точки.</p>
      </div>
    </Block>
  );
}

export const OVERVIEW_MORE_VIEWS: Record<string, ComponentType<BlockViewProps>> = {
  o2: LostRevenue,
  o3: NextActions,
  o5: AgainstAll,
  o6: LocationsNearby,
};
