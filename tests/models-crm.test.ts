import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getDataset, totals } from '../src/lib/demo-app/engine/dataset.ts';
import { windowOf, DAYS_TOTAL } from '../src/lib/demo-app/engine/calendar.ts';
import { channelRows } from '../src/lib/demo-app/engine/channels.ts';
import { INDUSTRY_ORDER } from '../src/lib/demo-app/industries/index.ts';
import { clientCard, handling, pipeline, REORDER_DAYS, stock, STOCK_ITEMS, tasks, TARGET_DAYS } from '../src/lib/demo-app/models/crm.ts';

const sum = (xs: readonly number[]) => xs.reduce((s, v) => s + v, 0);

for (const k of INDUSTRY_ORDER) {
  const ds = getDataset(k);
  const w = windowOf('month');

  test(`${k}: воронка сделок сходится с «Маркетингом» и итогами периода`, () => {
    // Arrange
    const t = totals(ds, 'all', w);
    const leads = sum(channelRows(ds, 'all', w, 'last').map((c) => c.leads));
    // Act
    const p = pipeline(ds, 'all', w);
    const by = Object.fromEntries(p.stages.map((s) => [s.key, s]));
    // Assert
    assert.equal(by.new!.count, leads, 'заявки — те же, что в каналах');
    assert.equal(by.booked!.count, t.bookings);
    assert.equal(by.came!.count, t.served);
    assert.equal(by.came!.sum, t.revenue, 'пришедшие — это выручка периода до рубля');
    assert.equal(by.paid!.sum, t.revenue - p.owed);
  });

  test(`${k}: воронка сужается от этапа к этапу, и у каждого этапа есть примеры сделок`, () => {
    const p = pipeline(ds, 'all', w);
    for (let i = 1; i < p.stages.length; i++) assert.ok(p.stages[i]!.count <= p.stages[i - 1]!.count, `${p.stages[i]!.name} больше предыдущего`);
    for (const s of p.stages) assert.equal(s.deals.length, 3);
    assert.ok(p.lateCount >= 1, 'просроченная сделка показывает, как выглядит сигнал');
  });

  test(`${k}: задачи считаются по каждой точке, просрочено не больше, чем задач`, () => {
    const t = tasks(ds, 'all', w);
    assert.equal(t.rows.length, ds.profile.locations.length);
    assert.equal(t.total, sum(t.rows.map((r) => r.callback + r.confirm + r.winBack)));
    assert.ok(t.overdue <= t.total);
    assert.equal(t.items.length, 5);
  });

  test(`${k}: заявки по администраторам складываются в заявки воронки, выручка — в выручку`, () => {
    const rows = handling(ds, 'all', w);
    assert.equal(sum(rows.map((r) => r.leads)), pipeline(ds, 'all', w).leads);
    assert.equal(sum(rows.map((r) => r.revenue)), totals(ds, 'all', w).revenue);
  });

  test(`${k}: карточка клиента — события по убыванию даты, следующий визит после последнего`, () => {
    const c = clientCard(ds, 'all');
    for (let i = 1; i < c.events.length; i++) assert.ok(c.events[i]!.day <= c.events[i - 1]!.day);
    const lastVisit = Math.max(...c.events.filter((e) => e.kind === 'visit').map((e) => e.day));
    assert.ok(c.nextDay > lastVisit);
    assert.equal(c.overdue, c.nextDay < DAYS_TOTAL);
  });

  test(`${k}: одинаковые данные при повторном расчёте`, () => {
    assert.deepEqual(pipeline(ds, 'all', w), pipeline(ds, 'all', w));
    assert.deepEqual(clientCard(ds, 'all'), clientCard(ds, 'all'));
  });
}

for (const k of ['clinic', 'salon', 'auto', 'studio'] as const) {
  const ds = getDataset(k);
  const w = windowOf('month');

  test(`${k}: склад — расход в день из расхода материалов, заказ только для того, что скоро закончится`, () => {
    const s = stock(ds, 'all', w);
    const items = STOCK_ITEMS[k]!;
    assert.equal(s.rows.length, ds.profile.locations.length * items.length);
    for (const l of ds.profile.locations) {
      const t = totals(ds, l.key, w);
      const rub = sum(s.rows.filter((r) => r.loc === l.key).map((r) => r.perDay * items.find((i) => i.name === r.item)!.price));
      assert.ok(Math.abs(rub - t.materials / t.openDays) <= 1, `${l.key}: расход в рублях сходится с материалами`);
    }
    for (const r of s.rows) {
      if (r.daysLeft < REORDER_DAYS) assert.ok(r.order > 0 && r.onHand + r.order >= r.perDay * TARGET_DAYS - 1, `${r.key}: заказ покрывает месяц`);
      else assert.equal(r.order, 0, `${r.key}: заказ без нужды`);
    }
    for (let i = 1; i < s.rows.length; i++) assert.ok(s.rows[i]!.daysLeft >= s.rows[i - 1]!.daysLeft, 'сначала то, что кончится раньше');
  });
}
