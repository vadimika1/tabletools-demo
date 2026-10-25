// Типы движка демо-данных. Профиль отрасли — только данные, без логики: из него генератор
// строит два года дней по каждой точке, а блоки считают свои виды из этих дней.
export type IndustryKey = 'clinic' | 'salon' | 'fitness' | 'auto' | 'studio' | 'other';
export type LocKey = string;
export type LocFilter = LocKey | 'all';
export type Period = 'week' | 'month' | 'quarter' | 'year';
export type Compare = 'prev' | 'year';
/** Кому засчитать продажу: последнему касанию, последнему «значимому» (не прямому) или первому. */
export type Model = 'last' | 'nondirect' | 'first';
export type Win = readonly [from: number, to: number];

/** Формы слова для 1, 2–4 и 5+: ['приём', 'приёма', 'приёмов']. */
export type Forms = readonly [one: string, few: string, many: string];

export interface Words {
  visit: Forms; // приём, стрижка, тренировка, заказ-наряд, мастер-класс
  client: Forms; // пациент, клиент, гость
  unit: Forms; // кресло, пост, зал
  staff: Forms; // врач, мастер, тренер, механик, ведущий
  location: Forms; // клиника, барбершоп, студия, автосервис
}

export interface LocationDef {
  key: LocKey;
  name: string;
  units: number; // кресел / постов / залов
  load: number; // базовая загрузка единицы, 0…1
  check: number; // множитель цены к базовой (район, спрос)
  noShow: number; // доля неявок
  unanswered: number; // доля сообщений без ответа
  answerMin: number; // медиана ответа в рабочее время, минут
  rating: number; // средняя оценка в отзывах
  rentMonth: number; // аренда, ₽ в месяц
  openedDaysAgo?: number; // точка открылась недавно: до этого дня мощности нет
}

export interface ServiceDef {
  key: string;
  name: string;
  price: number; // ₽ за одного клиента
  hours: number; // сколько часов занимает единицу (кресло, пост, зал)
  group: number; // клиентов на одну запись (1 — индивидуально, 9 — группа)
  share: number; // доля записей
  materials: number; // доля цены на материалы и запчасти
  repeatDays: number; // через сколько дней обычно возвращаются
}

export interface CampaignDef {
  name: string;
  spendShare: number; // доля расхода канала
  salesShare: number; // доля продаж канала; 0 — кампания ничего не приносит
}

export interface ChannelDef {
  key: string;
  name: string;
  group: 'paid' | 'earned';
  spendPerDay: number; // на всю сеть, ₽; 0 — бесплатный канал
  share: number; // доля записей по последнему касанию
  firstBias: number; // во сколько раз больше заслуг при первом касании
  leadConv: number; // заявка → запись
  clickConv: number; // визит на сайт → заявка
  ctr: number; // показ → визит; 0 — показов нет (карты, сарафан)
  campaigns: CampaignDef[];
}

export interface UpsellDef {
  name: string;
  price: number;
  attach: number; // доля записей с этой допродажей
}

/** Роли источников данных: у каждой отрасли свои системы (запись у клиники — IDENT, у барбершопа — YCLIENTS). */
export type SystemKind = 'booking' | 'crm' | 'pos' | 'telephony' | 'ads' | 'web' | 'maps' | 'accounting' | 'payroll' | 'messengers';

export interface Story {
  /** Недавний провал точки: последние `days` дней загрузка × `factor`, причина — для инсайтов. */
  dip: { loc: LocKey; days: number; factor: number; reason: string };
  /** Сотрудник, который продаёт заметно хуже остальных. */
  lagging: { loc: LocKey; role: string; factor: number };
}

export interface IndustryProfile {
  key: IndustryKey;
  business: string; // «Сеть стоматологий „Эмаль“»
  city: string;
  cityIn: string; // «в Москве» — для фраз
  words: Words;
  /** От чего считать средний чек: запись (приём, заказ-наряд) или человек (гость группы, посещение). */
  checkBasis: 'booking' | 'visit';
  hours: readonly [open: number, close: number];
  prime: { weekday: readonly [number, number]; weekend: readonly [number, number] };
  weekdayFactor: readonly number[]; // 7 значений, 0 — понедельник
  hourFactor: readonly number[]; // по часу работы, длина close − open
  monthFactor: readonly number[]; // 12 значений, 0 — январь
  trendPerYear: number; // органический рост
  payrollShare: number; // ФОТ к выручке (сдельная часть)
  adminMonth: number; // оклады администраторов на точку, ₽ в месяц
  otherMonth: number; // коммуналка, софт, связь на точку, ₽ в месяц
  discountShare: number; // скидки к выручке
  returnShare: number; // доля записей от вернувшихся клиентов
  locations: readonly LocationDef[];
  services: readonly ServiceDef[];
  channels: readonly ChannelDef[];
  upsells: readonly UpsellDef[];
  staffNames: readonly string[];
  sources: readonly string[]; // что подключаем: YCLIENTS, amoCRM, 1С…
  systems: Record<SystemKind, string>;
  story: Story;
}

/** Факты одного дня одной точки. Всё целое, чтобы суммы сходились до рубля. */
export interface Day {
  i: number; // 0 — самый старый день ряда
  loc: LocKey;
  weekday: number; // 0 — понедельник
  month: number; // 0 — январь
  open: boolean; // точка уже работала
  capacity: number; // часы мощности: единицы × часы работы
  sold: number; // занятые часы
  bookings: number; // записи
  served: number; // записи, на которые пришли (от них — средний чек)
  visits: number; // пришедшие клиенты (в группе их несколько на запись)
  noShows: number;
  cancels: number;
  services: number[]; // записи по услугам, по порядку profile.services
  revenue: number; // услуги + допродажи − скидки
  upsell: number;
  discounts: number;
  materials: number;
  newClients: number;
  calls: number;
  missedCalls: number;
  messages: number;
  unanswered: number;
  spend: number[]; // расход рекламы по каналам, по порядку profile.channels
}
