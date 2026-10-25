'use client';
// f2 «P&L по точкам»: строка точки раскрывается в статьи, итог сети — сумма строк до рубля.
// Клик по строке открывает детализацию точки; раскрытие — отдельной кнопкой, чтобы не мешать клику.
import { Fragment, useState, type KeyboardEvent } from 'react';
import { Block } from '@/components/dash/kit/Block';
import { fmt, plural } from '@/components/dash/format';
import { toneVar } from '@/components/dash/charts/Tip';
import { PNL_LINES } from '@/lib/demo-app/engine/money';
import { COST_GROUPS, pnlByLocation, type PnlRow } from '@/lib/demo-app/models/finance';
import { useDrill } from '../drill';
import { sourcesOf, useSlice } from './common';
import { Flag, locTone, signed } from './money-kit';
import type { BlockViewProps } from './index';
import { StackWrap } from '@/components/dash/kit/StackWrap';

const MONTHS: readonly [string, string, string] = ['месяц', 'месяца', 'месяцев'];
const groupOf = (key: string) => COST_GROUPS.findIndex((g) => (g.lines as readonly string[]).includes(key));

export function PnlByLocation({ id, className }: BlockViewProps) {
  const { ds, loc, win, prevWin, vs, def } = useSlice(id);
  const { open } = useDrill();
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const { rows, total } = pnlByLocation(ds, loc, win, prevWin);
  const losing = rows.filter((r) => r.loss);
  const best = [...rows].sort((a, b) => b.pnl.profit - a.pnl.profit)[0];
  const weakest = [...rows].sort((a, b) => a.pnl.margin - b.pnl.margin)[0];

  const handleToggle = (key: string) => setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const handleOpen = (key: string) => open({ kind: 'loc', key });
  const handleKey = (key: string) => (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleOpen(key); }
  };

  const cells = (r: PnlRow) => (
    <>
      <td className="num">{fmt(r.pnl.revenue, 'rub')}</td>
      {r.groups.map((v, g) => <td key={COST_GROUPS[g]!.key} className="num">{fmt(v, 'rub')}</td>)}
      <td className="num"><b>{fmt(r.pnl.profit, 'rub')}</b></td>
      <td className="num">{r.pnl.revenue ? fmt(r.pnl.margin, 'pct') : '—'}</td>
      <td className="num">{signed(r.profitDiff)}</td>
    </>
  );

  return (
    <Block title={def.title} question={def.question} className={className} custom={def.custom} sources={sourcesOf(ds, def)}>
      <div className="bf-stack">
        {best && (
          <p className="bf-note">
            {rows.length > 1 ? <>Больше всего прибыли приносит <b>{best.name}</b>: {fmt(best.pnl.profit, 'money')}. </> : <>Прибыль {best.name}: <b>{fmt(best.pnl.profit, 'money')}</b>. </>}
            {losing.length
              ? `В минусе: ${losing.map((r) => `${r.name} (${fmt(r.pnl.profit, 'money')})`).join(', ')} — выручки не хватает, чтобы покрыть аренду и оклады.`
              : rows.length > 1 && weakest ? `Все в плюсе, тоньше всех маржа у ${weakest.name}: ${fmt(weakest.pnl.margin, 'pct')}.` : ''}
          </p>
        )}
        <StackWrap>
          <table className="ds-table bf-pnl">
            <caption className="sr-only">Прибыль и расходы по точкам, изменение прибыли к {vs}</caption>
            <thead>
              <tr>
                <th scope="col">Точка</th>
                <th scope="col" className="num">Выручка</th>
                {COST_GROUPS.map((g) => <th key={g.key} scope="col" className="num">{g.name}</th>)}
                <th scope="col" className="num">Прибыль</th>
                <th scope="col" className="num">Маржа</th>
                <th scope="col" className="num">К {vs}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const isOpen = expanded.has(r.key);
                return (
                  <Fragment key={r.key}>
                    <tr className="is-link" tabIndex={0} onClick={() => handleOpen(r.key)} onKeyDown={handleKey(r.key)}>
                      <td>
                        <span className="bf-loc">
                          <button
                            type="button"
                            className="bf-expand"
                            aria-expanded={isOpen}
                            aria-label={`${isOpen ? 'Свернуть' : 'Раскрыть'} статьи: ${r.name}`}
                            onClick={(e) => { e.stopPropagation(); handleToggle(r.key); }}
                            onKeyDown={(e) => e.stopPropagation()}
                          >
                            <svg viewBox="0 0 12 12" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M4.5 2.5 8 6l-3.5 3.5" /></svg>
                          </button>
                          <i className="bf-dot" style={{ background: toneVar(locTone(ds, r.key)) }} aria-hidden="true" />
                          <span>
                            {r.name}
                            {r.openedMonthsAgo !== null && <small>открыта {r.openedMonthsAgo} {plural(r.openedMonthsAgo, MONTHS)} назад</small>}
                            {r.loss && <small><Flag tone="bad">в минусе</Flag></small>}
                          </span>
                        </span>
                      </td>
                      {cells(r)}
                    </tr>
                    {isOpen && PNL_LINES.map((l) => {
                      const g = groupOf(l.key);
                      return (
                        <tr key={`${r.key}-${l.key}`} className="bf-sub">
                          <td>{l.name}</td>
                          <td className="num" />
                          {COST_GROUPS.map((cg, k) => <td key={cg.key} className="num">{k === g ? fmt(r.pnl[l.key], 'rub') : ''}</td>)}
                          <td className="num" />
                          <td className="num">{r.pnl.revenue ? `${fmt(r.pnl[l.key] / r.pnl.revenue, 'pct')} выручки` : '—'}</td>
                          <td className="num" />
                        </tr>
                      );
                    })}
                  </Fragment>
                );
              })}
            </tbody>
            {rows.length > 1 && (
              <tfoot>
                <tr>
                  <td>{total.name}</td>
                  {cells(total)}
                </tr>
              </tfoot>
            )}
          </table>
        </StackWrap>
      </div>
    </Block>
  );
}
