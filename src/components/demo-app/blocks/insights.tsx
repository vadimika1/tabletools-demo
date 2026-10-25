'use client';
// Блоки раздела «Инсайты и ИИ»: лента выводов (i1), чат по сценарию (i2), утренняя сводка (i3).
// Цифры — из моделей на данных движка; живого ИИ в демо нет, и блоки говорят это прямо.
import { useCallback, useEffect, useRef, useState, type ComponentType } from 'react';
import { Block } from '@/components/dash/kit/Block';
import { BarList } from '@/components/dash/charts/BarList';
import { Spark } from '@/components/dash/charts/Spark';
import type { Tone } from '@/components/dash/charts/Tip';
import { count, fmt } from '@/components/dash/format';
import { chatScript, insights, morningDigest, type ChatQA, type DigestKey, type Insight } from '@/lib/demo-app/models/insights';
import { useDemo } from '../state';
import { useDrill } from '../drill';
import { sourcesOf, useSlice } from './common';
import { SectionLink, TONE_LABEL, ToneBadge, ToneIcon, Typing } from './insights-parts';
import type { BlockViewProps } from './index';

// ── i1 Лента инсайтов ────────────────────────────────────────────────

const ALERTS = ['тревога', 'тревоги', 'тревог'] as const;

function InsightFeed({ id, className }: BlockViewProps) {
  const { ds, loc, def } = useSlice(id);
  const { period, compare, model } = useDemo();
  const { open } = useDrill();
  const cards = insights(ds, loc, period, compare, model);
  const bad = cards.filter((c) => c.tone === 'bad').length;
  return (
    <Block
      title={def.title}
      question={`${def.question}. Сейчас ${bad ? count(bad, ALERTS) : 'тревог нет'}`}
      className={className}
      custom={def.custom}
      sources={sourcesOf(ds, def)}
      table={{
        columns: [
          { key: 't', label: 'Оценка', value: (r: Insight) => TONE_LABEL[r.tone] },
          { key: 'h', label: 'Что случилось', value: (r) => r.title },
          { key: 'a', label: 'Сумма', num: true, value: (r) => fmt(r.amount, r.amountFormat === 'money' ? 'rub' : r.amountFormat) },
          { key: 'd', label: 'Что сделать', value: (r) => r.action },
        ],
        rows: cards,
        rowKey: (r) => r.key,
      }}
    >
      <ul className="bi-feed">
        {cards.map((c) => {
          const drill = c.drill;
          return (
            <li key={c.key} className={`bi-card is-${c.tone}`}>
              <ToneBadge tone={c.tone} />
              <h4>{c.title}</h4>
              <p className="bi-note">{c.text}</p>
              <p className="bi-card-sum">
                <b>{fmt(c.amount, c.amountFormat)}</b>
                <span>{c.amountNote}</span>
              </p>
              <p className="bi-card-act"><span>Что сделать:</span> {c.action}</p>
              <div className="bi-card-links">
                <SectionLink section={c.section} />
                {drill && (
                  <button type="button" className="ds-link" onClick={() => open(drill)}>Подробнее</button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </Block>
  );
}

// ── i2 Спросить у дашборда ───────────────────────────────────────────

function Answer({ qa, typing, onDone }: { qa: ChatQA; typing: boolean; onDone: (key: string) => void }) {
  const [typed, setTyped] = useState(false);
  const handleDone = useCallback(() => { setTyped(true); onDone(qa.key); }, [onDone, qa.key]);
  const ready = typed || !typing; // график и ссылка — когда ответ допечатан
  const chart = qa.chart;
  return (
    <div className="bi-msg is-bot">
      <p>{typing ? <Typing text={qa.a} onDone={handleDone} /> : qa.a}</p>
      {ready && chart?.kind === 'bars' && (
        <div className="bi-msg-chart">
          <BarList format={chart.format} rows={chart.rows.map((r) => ({ key: r.key, label: r.label, value: r.value, tone: r.tone as Tone }))} />
        </div>
      )}
      {ready && chart?.kind === 'spark' && (
        <div className="bi-msg-chart is-spark" role="img" aria-label={chart.label}>
          <Spark values={chart.values} />
          <small>{chart.label}</small>
        </div>
      )}
      {ready && <SectionLink section={qa.section} />}
    </div>
  );
}

function AskDashboard({ id, className }: BlockViewProps) {
  const { ds, loc, def } = useSlice(id);
  const { period, model } = useDemo();
  const script = chatScript(ds, loc, period, model);
  const [asked, setAsked] = useState<string[]>([]);
  const [typed, setTyped] = useState<string[]>([]);
  const log = useRef<HTMLDivElement>(null);
  const w = ds.profile.words;
  const askedQa = asked.map((k) => script.find((x) => x.key === k)).filter((x): x is ChatQA => Boolean(x));
  const left = script.filter((x) => !asked.includes(x.key));

  useEffect(() => { log.current?.scrollTo({ top: log.current.scrollHeight, behavior: 'smooth' }); }, [asked.length, typed.length]);

  const handleAsk = (key: string) => setAsked((a) => [...a, key]);
  const handleReset = () => { setAsked([]); setTyped([]); };
  const handleTyped = useCallback((key: string) => setTyped((t) => (t.includes(key) ? t : [...t, key])), []);

  return (
    <Block
      title={def.title}
      question={def.question}
      className={className}
      custom={def.custom}
      sources={sourcesOf(ds, def)}
      table={{
        columns: [
          { key: 'q', label: 'Вопрос', value: (r: ChatQA) => r.q },
          { key: 'a', label: 'Ответ', value: (r) => <span className="bi-wrap">{r.a}</span> },
        ],
        rows: script,
        rowKey: (r) => r.key,
      }}
    >
      <div className="bi-chat">
        <div className="bi-chat-log" ref={log} role="log" aria-label="Переписка с дашбордом">
          <div className="bi-msg is-bot">
            <p>Я отвечаю по данным дашборда: выручка, записи, реклама, работа {w.staff[2]} и возвраты {w.client[2]}. Выберите вопрос ниже.</p>
          </div>
          {askedQa.map((qa, i) => (
            <div key={qa.key} className="bi-pair">
              <div className="bi-msg is-me"><p>{qa.q}</p></div>
              <Answer qa={qa} typing={i === askedQa.length - 1 && !typed.includes(qa.key)} onDone={handleTyped} />
            </div>
          ))}
        </div>
        <div className="bi-chat-qs" aria-label="Готовые вопросы">
          {left.map((x) => <button key={x.key} type="button" onClick={() => handleAsk(x.key)}>{x.q}</button>)}
          {!left.length && <button type="button" onClick={handleReset}>Начать заново</button>}
        </div>
        <label className="bi-chat-input">
          <span className="sr-only">Свой вопрос</span>
          <input type="text" name="ask" disabled placeholder="Спросите своими словами" aria-describedby={`${id}-hint`} />
        </label>
        <p className="bi-note" id={`${id}-hint`}>В демо — готовые вопросы. В вашем дашборде спрашивайте что угодно своими словами.</p>
      </div>
    </Block>
  );
}

// ── i3 Утренняя сводка ───────────────────────────────────────────────

const DIGEST_PARTS: readonly (readonly [DigestKey, string])[] = [
  ['money', 'Выручка за вчера'],
  ['today', 'Записи на сегодня'],
  ['noshow', 'Неявки за вчера'],
  ['alerts', 'Тревоги из ленты инсайтов'],
];
const SEND_TIMES = ['08:00', '09:00', '10:00', '21:00'] as const;

function MorningDigest({ id, className }: BlockViewProps) {
  const { ds, loc, def } = useSlice(id);
  const { period, compare, model } = useDemo();
  const [on, setOn] = useState<Record<DigestKey, boolean>>({ money: true, today: true, noshow: true, alerts: true });
  const [time, setTime] = useState<string>('09:00');
  const [sent, setSent] = useState(false);
  const d = morningDigest(ds, loc, period, compare, model);
  const lines = d.lines.filter((l) => on[l.key]);
  const handleToggle = (k: DigestKey) => setOn((o) => ({ ...o, [k]: !o[k] }));

  return (
    <Block
      title={def.title}
      question={`Что придёт в Telegram в ${time}`}
      className={className}
      custom={def.custom}
      sources={sourcesOf(ds, def)}
    >
      <div className="bi-digest">
        <figure className="bi-phone">
          <figcaption className="sr-only">{`Пример сводки в Telegram, приходит в ${time}`}</figcaption>
          <div className="bi-phone-top">
            <span className="bi-phone-ava" aria-hidden="true">tt</span>
            <span><b>Сводка TableTools</b><small>бот, каждый день в {time}</small></span>
          </div>
          <div className="bi-phone-body">
            <span className="bi-phone-date">{d.day}</span>
            <div className="bi-bubble is-head"><b>{d.scope}</b></div>
            {lines.map((l, i) => (
              <div key={l.id} className={`bi-bubble${l.alert ? ' is-alert' : ''}`} style={{ ['--i' as string]: i }}>
                {l.alert && <span className="bi-bubble-tag"><ToneIcon tone="bad" />Тревога</span>}
                <p>{l.text}</p>
                <time>{time}</time>
              </div>
            ))}
            {!lines.length && <div className="bi-bubble"><p>Выберите хотя бы один раздел сводки.</p></div>}
          </div>
        </figure>
        <div className="bi-digest-set">
          <fieldset>
            <legend>Что присылать</legend>
            {DIGEST_PARTS.map(([k, label]) => (
              <label key={k} className="bi-switch">
                <span>{label}</span>
                <input type="checkbox" name={`digest-${k}`} role="switch" checked={on[k]} onChange={() => handleToggle(k)} />
                <i aria-hidden="true" />
              </label>
            ))}
          </fieldset>
          <label className="bi-time">
            <span>Во сколько присылать</span>
            <select name="digest-time" value={time} onChange={(e) => setTime(e.target.value)}>
              {SEND_TIMES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <button type="button" className="btn btn-ink bi-send" onClick={() => setSent(true)}>Прислать тестовую сводку</button>
          <p className="bi-notice" role="status">{sent ? 'В демо сводка не уходит — в вашем дашборде придёт в Telegram.' : ''}</p>
        </div>
      </div>
    </Block>
  );
}

export const INSIGHTS_VIEWS: Record<string, ComponentType<BlockViewProps>> = {
  i1: InsightFeed,
  i2: AskDashboard,
  i3: MorningDigest,
};

