// Модели раздела «Инсайты и ИИ»: лента выводов (i1), ответы чата по сценарию (i2)
// и утренняя сводка за вчера (i3). Все цифры — из движка, тексты — словами отрасли.
import { DAYS_TOTAL, longDate, PERIODS, windowOf } from '../engine/calendar.ts';
import { change, daily, locsOf, spendOf, totals, weekly, type Dataset, type Totals } from '../engine/dataset.ts';
import { pnl } from '../engine/money.ts';
import { channelRows, type ChannelRow } from '../engine/channels.ts';
import { ahead, comms, reviews, staffRows, type StaffRow } from '../engine/ops.ts';
import { clientStats } from '../engine/clients.ts';
import type { Compare, LocFilter, LocKey, Model, Period, Win } from '../engine/types.ts';
import type { SectionKey } from '../blocks/registry.ts';
import { count, delta as fmtDelta, fmt, money, type Fmt } from '../../../components/dash/format.ts';
import { atLoc, bestCampaign, cap, DAYS, deadCampaigns, dipImpact, locName, noShowMoney, wastedAds } from './overview.ts';

export type InsightTone = 'good' | 'warn' | 'bad';
export type DrillKind = 'loc' | 'staff' | 'channel' | 'service' | 'campaign' | 'metric';

export interface Insight {
  key: string;
  tone: InsightTone;
  title: string;
  text: string;
  amount: number;
  amountFormat: Fmt;
  amountNote: string; // что за сумма: «недобрали», «потрачено впустую»
  action: string;
  section: SectionKey;
  drill?: { kind: DrillKind; key: string };
}

export const MIN_INSIGHTS = 6;
export const MAX_INSIGHTS = 8;
const MIN_SERVICE_BASE = 10; // рост услуги считаем, только если в прошлом окне было хотя бы 10 записей
const DIP_TITLE_DROP = -0.02; // падение меньше 2% не выносим в заголовок: сезон его перекрывает
const REVIEWS = ['отзыв', 'отзыва', 'отзывов'] as const;
const CALLS = ['звонок', 'звонка', 'звонков'] as const;
const TONE_ORDER: Record<InsightTone, number> = { bad: 0, warn: 1, good: 2 };

/** Всё, что нужно карточкам: срез, окна и итоги считаются один раз. */
interface Ctx {
  ds: Dataset;
  f: LocFilter;
  win: Win;
  prevWin: Win;
  vs: string;
  t: Totals;
  tp: Totals;
  rows: ChannelRow[];
}

const inScope = (f: LocFilter, k: LocKey) => f === 'all' || f === k;

export interface StaffGap { row: StaffRow; rows: StaffRow[]; avg: number; gap: number }

function gapOf(rows: StaffRow[], worst: StaffRow | undefined): StaffGap | null {
  const others = rows.filter((r) => r !== worst);
  if (!worst || !others.length) return null;
  const avg = others.reduce((s, r) => s + r.revenue, 0) / others.length;
  return { row: worst, rows, avg: Math.round(avg), gap: Math.round(avg - worst.revenue) };
}

/** Отстающий сотрудник из сюжета: имя, точка и сколько он недобирает до среднего у коллег. */
export function laggingStaff(ds: Dataset, f: LocFilter, win: Win): StaffGap | null {
  const { lagging } = ds.profile.story;
  if (!inScope(f, lagging.loc)) return null;
  const rows = staffRows(ds, lagging.loc, win);
  return gapOf(rows, [...rows].sort((a, b) => a.revenue - b.revenue)[0]);
}

/** Если отстающий из сюжета не в срезе — самый слабый в выбранной точке. */
export function weakestStaff(ds: Dataset, f: LocFilter, win: Win): StaffGap | null {
  const all = staffRows(ds, f, win);
  const worst = [...all].sort((a, b) => a.revenue - b.revenue)[0];
  return worst ? gapOf(all.filter((r) => r.loc === worst.loc), worst) : null;
}

// ── i1 Лента инсайтов: по карточке на функцию ────────────────────────

function dipCard({ ds, f, win, prevWin, vs }: Ctx): Insight | null {
  const dip = dipImpact(ds, f, win);
  if (!dip) return null;
  const d = change(totals(ds, dip.loc, win).revenue, totals(ds, dip.loc, prevWin).revenue);
  const name = locName(ds, dip.loc);
  return {
    key: 'dip', tone: 'bad', section: 'ops', drill: { kind: 'loc', key: dip.loc },
    title: d !== null && d < DIP_TITLE_DROP ? `${name}: выручка ${fmtDelta(d)} к ${vs}` : `${name}: запись просела последние ${count(dip.days, DAYS)}`,
    text: `Загрузка ниже обычной, причина: ${dip.reason}.`,
    amount: dip.money, amountFormat: 'money', amountNote: 'недобрали из-за провала',
    action: `Предложите перенос в соседние точки и предупредите постоянных ${ds.profile.words.client[2]}.`,
  };
}

function laggingCard({ ds, f, win }: Ctx): Insight | null {
  const lag = laggingStaff(ds, f, win);
  if (!lag) return null;
  return {
    key: 'lagging', tone: 'warn', section: 'ops', drill: { kind: 'staff', key: lag.row.name },
    title: `${lag.row.name} приносит меньше коллег`,
    text: `${cap(ds.profile.story.lagging.role)} ${atLoc(ds, lag.row.loc)}: ${money(lag.row.revenue)} против ${money(lag.avg)} в среднем у остальных.`,
    amount: lag.gap, amountFormat: 'money', amountNote: 'разница со средним',
    action: 'Разберите вместе записи и чек: обычно дело в допродажах и повторных визитах.',
  };
}

function campaignCard({ rows }: Ctx): Insight | null {
  const dead = deadCampaigns(rows)[0];
  if (!dead) return null;
  const best = bestCampaign(rows);
  return {
    key: 'campaign', tone: 'bad', section: 'marketing', drill: { kind: 'campaign', key: dead.name },
    title: `Кампания «${dead.name}» не дала ни одной продажи`,
    text: `${dead.channel}: за период списано ${money(dead.spend)}, записей с неё нет.`,
    amount: dead.spend, amountFormat: 'money', amountNote: 'потрачено впустую',
    action: best ? `Отключите её и переложите бюджет в «${best.name}»: там каждый рубль вернул ${fmt(best.roi, 'x')}.` : 'Отключите её или смените объявление и аудиторию.',
  };
}

function callsCard({ ds, f, win }: Ctx): Insight | null {
  const c = comms(ds, f, win);
  const missed = c.reduce((s, r) => s + r.missedOpen, 0);
  if (!missed) return null;
  const worst = [...c].sort((a, b) => b.missedOpen - a.missedOpen)[0]!;
  return {
    key: 'calls', tone: 'bad', section: 'ops', drill: { kind: 'loc', key: worst.loc },
    title: `Пропущено ${count(missed, CALLS)} в рабочее время`,
    text: c.length > 1
      ? `Больше всего ${atLoc(ds, worst.loc)}: ${worst.missedOpen}. Отвечают там в среднем через ${fmt(worst.answerMin, 'min')}.`
      : `Отвечают в среднем через ${fmt(worst.answerMin, 'min')}, клиент ждёт ${fmt(worst.waitMin, 'min')}.`,
    amount: c.reduce((s, r) => s + r.lostMoney, 0), amountFormat: 'money', amountNote: 'могли записаться',
    action: `Поставьте переадресацию на второго администратора ${atLoc(ds, worst.loc)}.`,
  };
}

function reviewsCard({ ds, f, win }: Ctx): Insight | null {
  const worst = [...reviews(ds, f, win)].sort((a, b) => b.low - a.low || a.avg - b.avg)[0];
  if (!worst || !worst.low) return null;
  return {
    key: 'reviews', tone: 'warn', section: 'ops', drill: { kind: 'loc', key: worst.loc },
    title: `${locName(ds, worst.loc)}: ${count(worst.low, REVIEWS)} на 3★ и ниже`,
    text: `Средняя оценка за период ${fmt(worst.avg, 'rating')}, без ответа ${count(worst.noReply, REVIEWS)}.`,
    amount: worst.low, amountFormat: 'int', amountNote: 'негативных отзывов',
    action: 'Ответьте на негатив сегодня: ответ в первые сутки возвращает часть клиентов.',
  };
}

function sleepingCard({ ds, f, win }: Ctx): Insight | null {
  const cs = clientStats(ds, f, win);
  if (!cs.sleeping) return null;
  return {
    key: 'sleeping', tone: 'warn', section: 'clients',
    title: `${cap(count(cs.sleeping, ds.profile.words.client))} перестали приходить`,
    text: 'Были за последний год, но пропустили уже два обычных срока повторного визита.',
    amount: cs.sleepingValue, amountFormat: 'money', amountNote: 'если каждый придёт хотя бы раз',
    action: 'Запустите рассылку с поводом вернуться, список уже собран.',
  };
}

function bestLocCard({ ds, f, win }: Ctx): Insight | null {
  if (f !== 'all' || ds.profile.locations.length < 2) return null;
  const m = ds.profile.locations.map((l) => ({ k: l.key, p: pnl(ds, l.key, win) })).sort((a, b) => b.p.margin - a.p.margin);
  const best = m[0]!;
  const weakest = m[m.length - 1]!;
  return {
    key: 'best', tone: 'good', section: 'finance', drill: { kind: 'loc', key: best.k },
    title: `${locName(ds, best.k)}: самая прибыльная точка`,
    text: `Маржа ${fmt(best.p.margin, 'pct')}, ${atLoc(ds, weakest.k)} ${fmt(weakest.p.margin, 'pct')}.`,
    amount: best.p.profit, amountFormat: 'money', amountNote: 'прибыль за период',
    action: `Разберите, что там работает, и перенесите ${atLoc(ds, weakest.k, 'в точку')}.`,
  };
}

function serviceCard({ ds, t, tp, vs }: Ctx): Insight | null {
  const g = ds.profile.services
    .map((s, k) => ({ s, now: t.services[k]!, prev: tp.services[k]!, d: change(t.services[k]!, tp.services[k]!) }))
    .filter((x) => x.prev >= MIN_SERVICE_BASE && x.d !== null && x.d > 0)
    .sort((a, b) => (b.d ?? 0) - (a.d ?? 0))[0];
  if (!g) return null;
  return {
    key: 'service', tone: 'good', section: 'marketing', drill: { kind: 'service', key: g.s.key },
    title: `${g.s.name}: ${fmtDelta(g.d)} записей к ${vs}`,
    text: `${g.now} против ${g.prev}, быстрее остальных услуг.`,
    amount: Math.round((g.now - g.prev) * g.s.price), amountFormat: 'money', amountNote: 'прибавка по прайсу',
    action: 'Поднимите её в рекламе и на сайте, пока спрос растёт.',
  };
}

// Запасные карточки — если основных меньше шести (например, выбрана одна точка)
function noShowCard({ ds, f, win, t }: Ctx): Insight | null {
  if (!t.noShows) return null;
  return {
    key: 'noshow', tone: 'warn', section: 'ops', drill: { kind: 'metric', key: 'noshow' },
    title: `${cap(count(t.noShows, ds.profile.words.client))} не пришли по записи`,
    text: `Это ${money(noShowMoney(ds, f, win))} выручки, которая не дошла до кассы.`,
    amount: noShowMoney(ds, f, win), amountFormat: 'money', amountNote: 'не пришло в кассу',
    action: 'Напоминайте о записи за сутки и за два часа, с новых берите предоплату.',
  };
}

function revenueCard({ t, tp, vs }: Ctx): Insight {
  const d = change(t.revenue, tp.revenue);
  const down = d !== null && d < 0;
  return {
    key: 'revenue', tone: down ? 'warn' : 'good', section: 'overview', drill: { kind: 'metric', key: 'revenue' },
    title: `Выручка ${fmtDelta(d)} к ${vs}`,
    text: `${money(t.revenue)} за период против ${money(tp.revenue)}.`,
    amount: t.revenue - tp.revenue, amountFormat: 'money', amountNote: 'разница',
    action: down ? 'Откройте выручку по дням и найдите, с какого дня пошло вниз.' : 'Держите темп: проверьте, хватит ли свободных часов на следующую неделю.',
  };
}

function adsCard({ t, rows }: Ctx): Insight {
  const ads = wastedAds(rows);
  return {
    key: 'ads', tone: ads.money > 0 ? 'warn' : 'good', section: 'marketing',
    title: `Реклама: расход ${money(spendOf(t))}`,
    text: ads.money > 0 ? `Из них без отдачи ${money(ads.money)}.` : 'Все платные каналы окупаются.',
    amount: ads.money, amountFormat: 'money', amountNote: 'без отдачи',
    action: 'Сверяйте кампании в разделе маркетинга раз в неделю.',
  };
}

const MAIN_CARDS = [dipCard, laggingCard, campaignCard, callsCard, reviewsCard, sleepingCard, bestLocCard, serviceCard];
const SPARE_CARDS = [noShowCard, revenueCard, adsCard];

/** Шесть–восемь карточек: сначала тревоги, потом предупреждения, в конце хорошее. */
export function insights(ds: Dataset, f: LocFilter, period: Period, compare: Compare, model: Model = 'last'): Insight[] {
  const win = windowOf(period);
  const prevWin = windowOf(period, compare);
  const ctx: Ctx = {
    ds, f, win, prevWin, vs: compare === 'year' ? PERIODS[period].yearLabel : PERIODS[period].prevLabel,
    t: totals(ds, f, win), tp: totals(ds, f, prevWin), rows: channelRows(ds, f, win, model),
  };
  const cards = MAIN_CARDS.map((make) => make(ctx)).filter((c): c is Insight => c !== null);
  for (const make of SPARE_CARDS) {
    if (cards.length >= MIN_INSIGHTS) break;
    const c = make(ctx);
    if (c) cards.push(c);
  }
  return cards.slice(0, MAX_INSIGHTS).sort((a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone]);
}

// ── i2 Спросить у дашборда ───────────────────────────────────────────

export interface ChartRow { key: string; label: string; value: number; tone: number | 'muted' }
export type ChatChart =
  | { kind: 'bars'; format: Fmt; rows: ChartRow[] }
  | { kind: 'spark'; label: string; values: number[] };
export interface ChatQA { key: string; q: string; a: string; chart?: ChatChart; section: SectionKey }

const FOR_PERIOD: Record<Period, string> = { week: 'за неделю', month: 'за месяц', quarter: 'за квартал', year: 'за год' };
export const WAKE_SHARE = 0.1;
export const CHAT_SIZE = 6;

const locTone = (ds: Dataset, k: LocKey) => Math.min(6, ds.profile.locations.findIndex((l) => l.key === k) + 1);
const chanTone = (ds: Dataset, k: string) => Math.min(6, ds.profile.channels.findIndex((c) => c.key === k) + 1);

function askWhere(ds: Dataset, win: Win, per: string): ChatQA {
  // Вопрос о сети: отвечаем по всем точкам, даже если в фильтре выбрана одна
  const byLoc = ds.profile.locations.map((l) => ({ k: l.key, rev: totals(ds, l.key, win).revenue })).sort((a, b) => b.rev - a.rev);
  const net = byLoc.reduce((s, x) => s + x.rev, 0);
  const top = byLoc[0]!;
  const low = byLoc[byLoc.length - 1]!;
  return {
    key: 'where', section: 'overview', q: 'Где выручка выше всего, а где проседает?',
    a: `Больше всего приносит ${locName(ds, top.k)}: ${money(top.rev)} ${per}, это ${fmt(net ? top.rev / net : 0, 'pct')} выручки сети. Меньше всего — ${locName(ds, low.k)}: ${money(low.rev)}.`,
    chart: { kind: 'bars', format: 'money', rows: byLoc.map((x) => ({ key: x.k, label: locName(ds, x.k), value: x.rev, tone: locTone(ds, x.k) })) },
  };
}

function askNoShow(ds: Dataset, f: LocFilter, win: Win, per: string): ChatQA {
  const t = totals(ds, f, win);
  const locs = locsOf(ds, f).map((l) => ({ k: l.key, m: noShowMoney(ds, l.key, win) })).sort((a, b) => b.m - a.m);
  const worst = locs.length > 1 ? ` Больше всего потерь ${atLoc(ds, locs[0]!.k)}: ${money(locs[0]!.m)}.` : '';
  return {
    key: 'noshow', section: 'ops', q: 'Сколько денег мы теряем на неявках?',
    a: `${cap(count(t.noShows, ds.profile.words.client))} не пришли по записи ${per}, это ${money(noShowMoney(ds, f, win))}.${worst} Напоминание за сутки и предоплата для новых обычно снимают половину.`,
    chart: locs.length > 1 ? { kind: 'bars', format: 'money', rows: locs.map((x) => ({ key: x.k, label: locName(ds, x.k), value: x.m, tone: locTone(ds, x.k) })) } : undefined,
  };
}

function askStaff(ds: Dataset, f: LocFilter, win: Win, per: string): ChatQA | null {
  const lag = laggingStaff(ds, f, win) ?? weakestStaff(ds, f, win);
  if (!lag) return null;
  return {
    key: 'staff', section: 'ops', q: `Кто из ${ds.profile.words.staff[2]} приносит меньше всех?`,
    a: `${lag.row.name}, ${atLoc(ds, lag.row.loc).replace(/^в точке/, 'точка')}: ${money(lag.row.revenue)} ${per}. Это на ${money(lag.gap)} меньше, чем в среднем у коллег, загрузка ${fmt(lag.row.load, 'pct')}.`,
    chart: {
      kind: 'bars', format: 'money',
      rows: [...lag.rows].sort((a, b) => b.revenue - a.revenue).map((r) => ({ key: r.name, label: r.name, value: r.revenue, tone: r === lag.row ? 'muted' : locTone(ds, r.loc) })),
    },
  };
}

function askAds(ds: Dataset, f: LocFilter, win: Win, model: Model): ChatQA {
  const rows = channelRows(ds, f, win, model);
  const paid = rows.filter((r) => r.spend > 0 && r.roi !== null).sort((a, b) => (b.roi ?? 0) - (a.roi ?? 0));
  const dead = deadCampaigns(rows)[0];
  const best = paid[0];
  const lead = best ? `Лучше всех ${best.name}: каждый вложенный рубль вернул ${fmt(best.roi ?? 0, 'x')}.` : 'Платной рекламы в этом срезе нет.';
  const tail = dead ? ` Кампания «${dead.name}» (${dead.channel}) потратила ${money(dead.spend)} и не дала ни одной продажи, её стоит отключить.` : '';
  return {
    key: 'ads', section: 'marketing', q: 'Какая реклама окупается, а какая нет?', a: lead + tail,
    chart: paid.length ? { kind: 'bars', format: 'x', rows: paid.map((r) => ({ key: r.key, label: r.name, value: r.roi ?? 0, tone: chanTone(ds, r.key) })) } : undefined,
  };
}

function askYear(ds: Dataset, f: LocFilter, period: Period, per: string): ChatQA {
  const t = totals(ds, f, windowOf(period));
  const ty = totals(ds, f, windowOf(period, 'year'));
  const w = ds.profile.words;
  return {
    key: 'year', section: 'overview', q: 'Как мы идём против прошлого года?',
    a: ty.revenue
      ? `Выручка ${per} ${money(t.revenue)} против ${money(ty.revenue)} год назад, ${fmtDelta(change(t.revenue, ty.revenue))}. ${cap(w.visit[2])}: ${t.served.toLocaleString('ru-RU')} против ${ty.served.toLocaleString('ru-RU')}.`
      : 'Год назад эта точка ещё не работала, сравнивать не с чем.',
    chart: { kind: 'spark', label: 'Выручка по неделям за год', values: weekly(daily(ds, f, [DAYS_TOTAL - 364, DAYS_TOTAL], (d) => d.revenue)) },
  };
}

function askSleeping(ds: Dataset, f: LocFilter, win: Win): ChatQA {
  const cs = clientStats(ds, f, win);
  const w = ds.profile.words;
  return {
    key: 'sleeping', section: 'clients', q: `Сколько ${w.client[2]} перестали приходить?`,
    a: `${cap(count(cs.sleeping, w.client))} были у вас за последний год и пропустили уже два обычных срока. Если вернуть каждого десятого хотя бы на один визит, это ${money(cs.sleepingValue * WAKE_SHARE)}. Список готов для рассылки.`,
  };
}

/** Шесть готовых вопросов под отрасль с ответами на данных среза. */
export function chatScript(ds: Dataset, f: LocFilter, period: Period, model: Model = 'last'): ChatQA[] {
  const win = windowOf(period);
  const per = FOR_PERIOD[period];
  return [
    askWhere(ds, win, per),
    askNoShow(ds, f, win, per),
    askStaff(ds, f, win, per),
    askAds(ds, f, win, model),
    askYear(ds, f, period, per),
    askSleeping(ds, f, win),
  ].filter((q): q is ChatQA => q !== null);
}

// ── i3 Утренняя сводка ───────────────────────────────────────────────

export type DigestKey = 'money' | 'today' | 'noshow' | 'alerts';
export interface DigestLine { id: string; key: DigestKey; text: string; alert: boolean }
export interface Digest { scope: string; day: string; lines: DigestLine[] }

const WD_ACC = ['понедельник', 'вторник', 'среду', 'четверг', 'пятницу', 'субботу', 'воскресенье'];
const WD_PREV_GEN = ['прошлого понедельника', 'прошлого вторника', 'прошлой среды', 'прошлого четверга', 'прошлой пятницы', 'прошлой субботы', 'прошлого воскресенья'];
export const MAX_ALERTS = 2;
const REVENUE_ALERT = -0.15; // вчера ниже того же дня прошлой недели больше чем на 15%
const NOSHOW_ALERT = 1.5; // неявок вчера в полтора раза больше обычного дня
const FLAT = 0.005;
const RECENT_DAYS = 28;

function moneyLine(ds: Dataset, f: LocFilter, last: number, wd: number): DigestLine {
  const y = totals(ds, f, [last, last + 1]);
  const d = change(y.revenue, totals(ds, f, [last - 7, last - 6]).revenue);
  const vsWeek = d === null ? '' : Math.abs(d) < FLAT ? `, как у ${WD_PREV_GEN[wd]}` : `, ${d > 0 ? 'выше' : 'ниже'} ${WD_PREV_GEN[wd]} на ${fmtDelta(Math.abs(d)).replace('+', '')}`;
  return { id: 'money', key: 'money', alert: d !== null && d < REVENUE_ALERT, text: `Вчера выручка ${money(y.revenue)}${vsWeek}. ${cap(count(y.served, ds.profile.words.visit))}.` };
}

function todayLine(ds: Dataset, f: LocFilter): DigestLine | null {
  const today = ahead(ds, f)[0];
  if (!today || !today.capacity) return null;
  const s = ds.profile.services;
  const avgHours = s.reduce((a, x) => a + x.share * x.hours, 0) / s.reduce((a, x) => a + x.share, 0);
  return {
    id: 'today', key: 'today', alert: false,
    text: `На сегодня записано ${count(Math.round(today.booked / avgHours), ds.profile.words.visit)}, занято ${fmt(today.booked / today.capacity, 'pct')} времени.`,
  };
}

function noShowLine(ds: Dataset, f: LocFilter, last: number): DigestLine {
  const n = totals(ds, f, [last, last + 1]).noShows;
  const usual = totals(ds, f, [last - RECENT_DAYS, last]).noShows / RECENT_DAYS;
  const byLoc = locsOf(ds, f).map((l) => ({ k: l.key, n: totals(ds, l.key, [last, last + 1]).noShows })).sort((a, b) => b.n - a.n);
  const where = byLoc.length > 1 && byLoc[0]!.n ? `, больше всего ${atLoc(ds, byLoc[0]!.k)}` : '';
  return {
    id: 'noshow', key: 'noshow', alert: n > 0 && n >= usual * NOSHOW_ALERT,
    text: n ? `Вчера не пришли ${count(n, ds.profile.words.client)}${where}.` : 'Вчера все пришли по записи.',
  };
}

/** Сообщение, которое придёт в Telegram утром: вчерашний день, сегодня и одна-две тревоги. */
export function morningDigest(ds: Dataset, f: LocFilter, period: Period, compare: Compare, model: Model = 'last'): Digest {
  const p = ds.profile;
  const last = DAYS_TOTAL - 1;
  const wd = ds.days[p.locations[0]!.key]![last]!.weekday;
  const alerts = insights(ds, f, period, compare, model).filter((x) => x.tone === 'bad').slice(0, MAX_ALERTS)
    .map((x): DigestLine => ({ id: `alert-${x.key}`, key: 'alerts', alert: true, text: `${x.title}. ${x.action}` }));
  const lines = [moneyLine(ds, f, last, wd), todayLine(ds, f), noShowLine(ds, f, last), ...alerts].filter((l): l is DigestLine => l !== null);
  return {
    scope: f === 'all' ? p.business : `${p.business}, ${locName(ds, f)}`,
    day: `Сводка за ${WD_ACC[wd]}, ${longDate(ds.anchor, last).replace(/\s\d{4}$/, '')}`,
    lines,
  };
}
