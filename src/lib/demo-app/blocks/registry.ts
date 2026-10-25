// Реестр блоков дашборда — только данные, без React: его читают страницы демо и тесты.
// Блок отвечает на один вопрос бизнеса; раздел — упорядоченный список id.
// Происхождение: base — общий блок для любой отрасли, industry — отраслевой.
import type { IndustryKey, SystemKind } from '../engine/types.ts';

export type SectionKey = 'overview' | 'ops' | 'finance' | 'marketing' | 'clients' | 'crm' | 'attribution' | 'insights';
export type Size = 'w-3' | 'w-4' | 'w-5' | 'w-6' | 'w-7' | 'w-8' | 'w-12';

export interface BlockDef {
  id: string;
  section: SectionKey;
  title: string;
  question: string;
  size: Size;
  priority: 1 | 2;
  from: 'base' | 'industry';
  systems: readonly SystemKind[]; // откуда данные — подписи берутся из профиля отрасли
  industries?: readonly IndustryKey[]; // нет — блок подходит всем
  custom: string; // что именно подстраиваем под клиента
}

export const SECTIONS: Record<SectionKey, { title: string; slug: string; hint: string }> = {
  overview: { title: 'Обзор', slug: 'obzor', hint: 'Главное за период и что сделать сегодня' },
  ops: { title: 'Операционка', slug: 'operacii', hint: 'Загрузка, записи, обращения, персонал' },
  finance: { title: 'Финансы', slug: 'finansy', hint: 'Прибыль по точкам, расходы, деньги вперёд' },
  marketing: { title: 'Маркетинг', slug: 'marketing', hint: 'Реклама, каналы, сайт, услуги' },
  clients: { title: 'Клиенты', slug: 'klienty', hint: 'Кто возвращается и сколько стоит клиент' },
  crm: { title: 'CRM', slug: 'crm', hint: 'Сделки, задачи, карточка клиента и склад' },
  attribution: { title: 'Сквозная аналитика', slug: 'skvoznaya', hint: 'Какая реклама приносит деньги, а не клики' },
  insights: { title: 'Инсайты и ИИ', slug: 'insayty', hint: 'Выводы каждое утро и ответы на вопросы' },
};
export const SECTION_ORDER: readonly SectionKey[] = ['overview', 'ops', 'finance', 'marketing', 'clients', 'crm', 'attribution', 'insights'];
export const sectionBySlug = (slug: string): SectionKey | undefined => SECTION_ORDER.find((k) => SECTIONS[k].slug === slug);

const b = (d: BlockDef) => d;

export const BLOCKS: readonly BlockDef[] = [
  // ── Обзор ──
  b({ id: 'o1', section: 'overview', title: 'Главные цифры', question: 'Выручка, прибыль, загрузка, неявки, чек, окупаемость рекламы — и как изменились', size: 'w-12', priority: 1, from: 'base', systems: ['booking', 'pos', 'ads'], custom: 'Набор и порядок плиток — ваши: одним важна выручка на кресло, другим — доля повторных.' }),
  b({ id: 'o2', section: 'overview', title: 'Упущенная выручка', question: 'Сколько денег потеряли за период и где именно', size: 'w-6', priority: 1, from: 'base', systems: ['booking', 'telephony', 'ads'], custom: 'Считаем те потери, которые есть у вас: неявки, пустые часы, пропущенные звонки, списания.' }),
  b({ id: 'o3', section: 'overview', title: 'Что сделать сейчас', question: 'Три–пять действий с оценкой в рублях', size: 'w-6', priority: 1, from: 'base', systems: ['booking', 'ads'], custom: 'Правила рекомендаций пишем вместе с вами: пороги, ответственные, куда присылать.' }),
  b({ id: 'o4', section: 'overview', title: 'Выручка по дням', question: 'Как идём относительно прошлого периода', size: 'w-8', priority: 1, from: 'base', systems: ['pos'], custom: 'Можно по неделям, по точкам отдельными линиями, против плана.' }),
  b({ id: 'o5', section: 'overview', title: 'Против всех сравнений', question: 'Выручка и записи против прошлого периода, месяца назад и года назад', size: 'w-4', priority: 2, from: 'base', systems: ['pos', 'booking'], custom: 'Сравнения — какие вам нужны: с планом, с лучшей неделей, с конкурентом по рынку.' }),
  b({ id: 'o6', section: 'overview', title: 'Точки рядом', question: 'Какая точка тянет сеть, а какая проседает', size: 'w-12', priority: 1, from: 'base', systems: ['booking', 'pos'], custom: 'Колонки и порог «проседает» настраиваем под ваши точки.' }),
  // ── Операционка ──
  b({ id: 'p1', section: 'ops', title: 'Свободные прайм-часы', question: 'Что ещё можно продать на этой неделе и на сколько рублей', size: 'w-4', priority: 1, from: 'base', systems: ['booking'], custom: 'Прайм-время задаёте вы: по дням, по точкам, по услугам.' }),
  b({ id: 'p2', section: 'ops', title: 'Загрузка по часам', question: 'Когда пусто и когда очередь', size: 'w-8', priority: 1, from: 'base', systems: ['booking'], custom: 'Разрез по сотрудникам, кабинетам или услугам — как вы планируете смены.' }),
  b({ id: 'p3', section: 'ops', title: 'Неделя вперёд', question: 'Насколько заполнены следующие семь дней', size: 'w-6', priority: 1, from: 'base', systems: ['booking'], custom: 'Горизонт — неделя, две или месяц; можно присылать в Telegram каждое утро.' }),
  b({ id: 'p4', section: 'ops', title: 'Неявки и отмены', question: 'Сколько не пришло, в какие дни и сколько это стоило', size: 'w-6', priority: 1, from: 'base', systems: ['booking'], custom: 'Разделим неявки по каналам, новым и постоянным клиентам, сотрудникам.' }),
  b({ id: 'p5', section: 'ops', title: 'Обработка обращений', question: 'Сколько звонков потеряли в рабочее время и как быстро отвечаем', size: 'w-12', priority: 1, from: 'base', systems: ['telephony', 'messengers', 'web'], custom: 'Подключим вашу телефонию и мессенджеры; нормы ответа — ваши.' }),
  b({ id: 'p6', section: 'ops', title: 'Персонал и смены', question: 'Хватает ли людей на смене и сколько приносит каждый', size: 'w-12', priority: 1, from: 'base', systems: ['booking', 'payroll'], custom: 'Суммы зарплат видят только те, кому вы разрешите.' }),
  b({ id: 'p7', section: 'ops', title: 'Отзывы', question: 'Оценка по точкам, негатив и отзывы без ответа', size: 'w-6', priority: 1, from: 'base', systems: ['maps'], custom: 'Собираем с Яндекс Карт, 2ГИС, ПроДокторов, агрегаторов — где вас оценивают.' }),
  b({ id: 'p8', section: 'ops', title: 'Кто продаёт', question: 'Сколько записей приносят администраторы, сайт и агрегаторы', size: 'w-6', priority: 2, from: 'base', systems: ['booking'], custom: 'Каналы записи и планы администраторов — ваши.' }),
  b({ id: 'p9', section: 'ops', title: 'Материалы к выручке', question: 'Расход материалов против целевой доли', size: 'w-6', priority: 2, from: 'base', systems: ['accounting'], custom: 'Цели по доле материалов и разрез по услугам ставим вместе.' }),
  b({ id: 'p10', section: 'ops', title: 'Корпоративы и группы', question: 'Сделки по этапам: сколько выиграли и оплатили', size: 'w-6', priority: 2, from: 'base', systems: ['crm'], industries: ['studio', 'fitness', 'other'], custom: 'Этапы воронки — ваши, из вашей CRM.' }),
  // ── Финансы ──
  b({ id: 'f1', section: 'finance', title: 'Как сложилась прибыль', question: 'Выручка, затем каждая статья расходов, внизу — что осталось', size: 'w-7', priority: 1, from: 'base', systems: ['pos', 'accounting', 'payroll'], custom: 'Статьи — по вашему плану счетов, а не по нашему шаблону.' }),
  b({ id: 'f2', section: 'finance', title: 'P&L по точкам', question: 'Прибыль каждой точки и из чего она складывается', size: 'w-12', priority: 1, from: 'base', systems: ['pos', 'accounting', 'payroll'], custom: 'Распределение общих расходов по точкам — по вашему правилу.' }),
  b({ id: 'f3', section: 'finance', title: 'Структура расходов', question: 'Куда уходят деньги', size: 'w-5', priority: 1, from: 'base', systems: ['accounting'], custom: 'Группировку статей делаем такой, как вы привыкли смотреть.' }),
  b({ id: 'f4', section: 'finance', title: 'Юнит-экономика', question: 'Чек, выручка на час мощности, на клиента, доля рекламы', size: 'w-6', priority: 1, from: 'base', systems: ['booking', 'pos', 'ads'], custom: 'Единица счёта — ваша: кресло, пост, зал, мастер, квадратный метр.' }),
  b({ id: 'f5', section: 'finance', title: 'Деньги на 13 недель', question: 'Когда будет кассовый разрыв', size: 'w-6', priority: 2, from: 'base', systems: ['accounting', 'pos'], custom: 'Подтянем банк и платёжный календарь; сценарии «что если» по вашим правилам.' }),
  b({ id: 'f6', section: 'finance', title: 'Скидки и неоплаченное', question: 'Сколько отдали скидками и сколько клиенты ещё должны', size: 'w-6', priority: 2, from: 'base', systems: ['pos', 'booking'], custom: 'Рассрочки, депозиты, сертификаты — учтём ваши формы оплаты.' }),
  b({ id: 'f7', section: 'finance', title: 'Партнёры и франшиза', question: 'Выручка партнёров, начислено и получено роялти', size: 'w-6', priority: 2, from: 'base', systems: ['pos', 'accounting'], custom: 'Ставки и сроки расчётов — из ваших договоров.' }),
  // ── Маркетинг ──
  b({ id: 'm1', section: 'marketing', title: 'Реклама по площадкам', question: 'Расход, заявки, цена клиента и окупаемость', size: 'w-12', priority: 1, from: 'base', systems: ['ads', 'booking'], custom: 'Подключаем ваши кабинеты: Директ, VK, Авито, агрегаторы, агентство таблицей.' }),
  b({ id: 'm2', section: 'marketing', title: 'Вердикты кампаний', question: 'Какие кампании в плюсе, какие тратят впустую', size: 'w-7', priority: 1, from: 'base', systems: ['ads', 'booking'], custom: 'Порог окупаемости считаем по вашей марже, а не «в среднем по рынку».' }),
  b({ id: 'm3', section: 'marketing', title: 'Откуда приходят', question: 'Доля записей по каналам: реклама, карты, сарафан, повторные', size: 'w-5', priority: 1, from: 'base', systems: ['web', 'booking'], custom: 'Каналы группируем так, как вы о них говорите.' }),
  b({ id: 'm4', section: 'marketing', title: 'Воронка записи на сайте', question: 'Где теряем тех, кто уже начал записываться', size: 'w-6', priority: 1, from: 'base', systems: ['web', 'booking'], custom: 'Шаги — как устроена именно ваша запись или корзина.' }),
  b({ id: 'm5', section: 'marketing', title: 'Что продаётся', question: 'Топ услуг и какие держат прибыль (ABC)', size: 'w-6', priority: 1, from: 'base', systems: ['booking', 'pos'], custom: 'Группы услуг и границы A/B/C — по вашей логике.' }),
  b({ id: 'm6', section: 'marketing', title: 'Допродажи', question: 'Сколько приносят доп. услуги и товары на визит', size: 'w-6', priority: 2, from: 'base', systems: ['pos'], custom: 'Считаем допродажи по сотрудникам, если у вас есть план.' }),
  b({ id: 'm7', section: 'marketing', title: 'Поиск', question: 'Запросы, по которым вас находят, и позиции', size: 'w-6', priority: 2, from: 'base', systems: ['web'], custom: 'Вебмастер и Search Console; брендовые запросы отделяем по вашему списку.' }),
  b({ id: 'm8', section: 'marketing', title: 'Карты', question: 'Просмотры карточек, маршруты и звонки по точкам', size: 'w-6', priority: 1, from: 'base', systems: ['maps'], custom: 'Яндекс Бизнес, 2ГИС, Google — сколько у вас карточек.' }),
  b({ id: 'm9', section: 'marketing', title: 'Соцсети и рассылки', question: 'Охват, подписчики, сколько записей вернули рассылки', size: 'w-6', priority: 2, from: 'base', systems: ['messengers'], custom: 'VK, Telegram, рассылки — ваши площадки и ваши цели.' }),
  b({ id: 'm10', section: 'marketing', title: 'Промокоды', question: 'Какой код сколько принёс', size: 'w-6', priority: 2, from: 'base', systems: ['pos'], custom: 'Отдельно блогеры, партнёры и акции.' }),
  b({ id: 'm11', section: 'marketing', title: 'Как рано записываются', question: 'За сколько дней до визита, по каналам', size: 'w-6', priority: 2, from: 'base', systems: ['booking'], custom: 'Поможет решить, когда запускать рекламу перед праздниками.' }),
  b({ id: 'm12', section: 'marketing', title: 'Агрегаторы', question: 'Выручка через партнёров и их комиссия', size: 'w-6', priority: 2, from: 'base', systems: ['booking'], custom: 'Комиссии и условия — из ваших договоров.' }),
  // ── Клиенты ──
  b({ id: 'c1', section: 'clients', title: 'Новые и вернувшиеся', question: 'Сколько пришло впервые, сколько вернулось, кто ходит в несколько точек', size: 'w-12', priority: 1, from: 'base', systems: ['booking', 'crm'], custom: 'Определение «вернувшегося» — ваше: за 30, 60 или 180 дней.' }),
  b({ id: 'c2', section: 'clients', title: 'Сколько стоит клиент', question: 'Сколько приносит клиент за всё время, по году первого визита', size: 'w-6', priority: 1, from: 'base', systems: ['booking', 'pos'], custom: 'Считаем LTV по вашей марже и сравниваем с ценой привлечения.' }),
  b({ id: 'c3', section: 'clients', title: 'Спящие клиенты', question: 'Кто перестал приходить и сколько они приносили', size: 'w-6', priority: 1, from: 'base', systems: ['booking', 'crm'], custom: 'Список уходит в рассылку или администратору на обзвон — как удобно вам.' }),
  b({ id: 'c4', section: 'clients', title: 'С каких услуг возвращаются', question: 'Какие услуги превращают новичка в постоянного', size: 'w-6', priority: 2, from: 'base', systems: ['booking'], custom: 'Разрез по мастерам и точкам — по желанию.' }),
  // ── CRM и склад ──
  b({ id: 'r1', section: 'crm', title: 'Воронка сделок', question: 'Сколько заявок дошло до записи и оплаты и где застревают сделки', size: 'w-12', priority: 1, from: 'base', systems: ['crm', 'booking', 'pos'], custom: 'Этапы, поля и сроки реакции — как устроены продажи у вас.' }),
  b({ id: 'r2', section: 'crm', title: 'Задачи и просрочки', question: 'Кому перезвонить, чьи записи подтвердить и кого вернуть — сегодня', size: 'w-7', priority: 1, from: 'base', systems: ['crm', 'telephony', 'messengers'], custom: 'Какие задачи создаются сами и за сколько часов они считаются просроченными — решаете вы.' }),
  b({ id: 'r3', section: 'crm', title: 'Кто как ведёт заявки', question: 'Заявки, доля записанных, выручка и скорость ответа по администраторам', size: 'w-5', priority: 1, from: 'base', systems: ['crm', 'telephony', 'booking'], custom: 'Разрез по администраторам, сменам или менеджерам — как у вас распределены заявки.' }),
  b({ id: 'r4', section: 'crm', title: 'Карточка клиента', question: 'Вся история клиента на одном экране и что сделать дальше', size: 'w-6', priority: 1, from: 'base', systems: ['crm', 'booking', 'telephony', 'messengers'], custom: 'Поля карточки и подсказка «следующий шаг» — по вашим правилам работы с клиентами.' }),
  b({ id: 'r5', section: 'crm', title: 'Склад и закупки', question: 'На сколько дней хватит материалов и что заказать сейчас', size: 'w-6', priority: 1, from: 'industry', systems: ['accounting', 'pos'], industries: ['clinic', 'salon', 'auto', 'studio'], custom: 'Номенклатура, минимальные остатки и поставщики — из вашей учётной системы.' }),
  // ── Сквозная ──
  b({ id: 'a1', section: 'attribution', title: 'Модель атрибуции', question: 'Кому засчитать продажу: последнему, последнему значимому или первому касанию', size: 'w-12', priority: 1, from: 'base', systems: ['web', 'ads', 'booking'], custom: 'Окно сделки и правила склейки — под ваш цикл покупки.' }),
  b({ id: 'a2', section: 'attribution', title: 'Каналы от показа до оплаты', question: 'Показы, переходы, заявки, записи и оплаты по каждому каналу', size: 'w-12', priority: 1, from: 'base', systems: ['web', 'ads', 'booking'], custom: 'Этапы — ваши: заявка, звонок, запись, визит, оплата.' }),
  b({ id: 'a3', section: 'attribution', title: 'Отчёт по каналам', question: 'Канал, источник, кампания: продажи, выручка, расход, окупаемость', size: 'w-12', priority: 1, from: 'base', systems: ['web', 'ads', 'booking'], custom: 'Выгрузка в CSV и в вашу таблицу по расписанию.' }),
  b({ id: 'a4', section: 'attribution', title: 'Путь клиента', question: 'Все касания за 30 дней до оплаты и какое засчитано', size: 'w-6', priority: 1, from: 'base', systems: ['web', 'booking', 'telephony'], custom: 'Звонки, мессенджеры и сайт склеиваем в одного клиента.' }),
  b({ id: 'a5', section: 'attribution', title: 'Многоканальные продажи', question: 'Сколько продаж прошли через несколько каналов', size: 'w-6', priority: 2, from: 'base', systems: ['web', 'booking'], custom: 'Покажем, какие каналы работают в связке.' }),
  b({ id: 'a6', section: 'attribution', title: 'Здоровье данных', question: 'Какая доля продаж склеена с визитом и когда было последнее событие', size: 'w-6', priority: 2, from: 'base', systems: ['web', 'booking'], custom: 'Если источник замолчал — пришлём тревогу раньше, чем вы заметите пустой график.' }),
  // ── Инсайты и ИИ ──
  b({ id: 'i1', section: 'insights', title: 'Лента инсайтов', question: 'Что изменилось и почему — с суммой и действием', size: 'w-12', priority: 1, from: 'base', systems: ['booking', 'pos', 'ads'], custom: 'Какие события считать важными и кого будить — решаете вы.' }),
  b({ id: 'i2', section: 'insights', title: 'Спросить у дашборда', question: 'Вопрос обычными словами — ответ цифрами и графиком', size: 'w-7', priority: 1, from: 'base', systems: ['booking', 'pos', 'ads'], custom: 'Ассистент отвечает только по вашим данным и с вашими правами доступа.' }),
  b({ id: 'i3', section: 'insights', title: 'Утренняя сводка', question: 'Что придёт в Telegram в девять утра', size: 'w-5', priority: 1, from: 'base', systems: ['messengers'], custom: 'Время, получатели и состав сводки — для каждого свои.' }),
  // ── Отраслевые ──
  b({ id: 'x1', section: 'marketing', title: 'Планы лечения', question: 'Сколько пациентов доходит от консультации до оплаты плана и на какую сумму отказных планов', size: 'w-6', priority: 1, from: 'industry', systems: ['booking', 'crm'], industries: ['clinic'], custom: 'Этапы плана — как их ведут ваши врачи и администраторы в МИС.' }),
  b({ id: 'x2', section: 'ops', title: 'Выработка врачей', question: 'Чек, загрузка кресла и повторные записи по каждому врачу', size: 'w-6', priority: 1, from: 'industry', systems: ['booking', 'payroll'], industries: ['clinic'], custom: 'Мотивация врачей по вашей схеме: процент, оклад, план.' }),
  b({ id: 'x3', section: 'ops', title: 'Барберы', question: 'Загрузка, чек и сколько клиентов возвращается к каждому', size: 'w-6', priority: 1, from: 'industry', systems: ['booking'], industries: ['salon'], custom: 'Грейды мастеров и их цены — как у вас в прайсе.' }),
  b({ id: 'x4', section: 'clients', title: 'Возврат за 45 дней', question: 'Кто не записался повторно в свой обычный срок', size: 'w-6', priority: 1, from: 'industry', systems: ['booking', 'messengers'], industries: ['salon'], custom: 'Срок и текст напоминания — ваши; список уходит в WhatsApp.' }),
  b({ id: 'x5', section: 'finance', title: 'Абонементы', question: 'Продления, заморозки и отток по месяцам', size: 'w-6', priority: 1, from: 'industry', systems: ['booking', 'pos'], industries: ['fitness'], custom: 'Типы абонементов и правила заморозки — из вашей системы.' }),
  b({ id: 'x6', section: 'ops', title: 'Группы и тренеры', question: 'Заполняемость групп и посещаемость по тренерам', size: 'w-6', priority: 1, from: 'industry', systems: ['booking'], industries: ['fitness'], custom: 'Минимальная наполняемость группы — по вашей экономике зала.' }),
  b({ id: 'x7', section: 'ops', title: 'Заказ-наряды', question: 'Нормо-часы, выработка механиков, простои постов', size: 'w-6', priority: 1, from: 'industry', systems: ['booking', 'payroll'], industries: ['auto'], custom: 'Нормативы работ — из вашего справочника.' }),
  b({ id: 'x8', section: 'finance', title: 'Запчасти в чеке', question: 'Доля и маржа запчастей в заказ-нарядах', size: 'w-6', priority: 1, from: 'industry', systems: ['pos', 'accounting'], industries: ['auto'], custom: 'Наценку считаем по вашим закупочным ценам.' }),
  b({ id: 'x9', section: 'ops', title: 'Мероприятия и группы', question: 'Корпоративы и дни рождения: размер группы, чек, откуда пришли', size: 'w-6', priority: 1, from: 'industry', systems: ['crm', 'booking'], industries: ['studio'], custom: 'Типы мероприятий и их этапы — как у вас в CRM.' }),
];

export const BLOCK_BY_ID: ReadonlyMap<string, BlockDef> = new Map(BLOCKS.map((x) => [x.id, x]));

export const fitsIndustry = (def: BlockDef, k: IndustryKey) => !def.industries || def.industries.includes(k);

type Preset = Record<SectionKey, readonly string[]>;

/** Готовый дашборд для отрасли: общий каркас + отраслевые блоки на своих местах. */
const BASE: Preset = {
  overview: ['o1', 'o2', 'o3', 'o4', 'o5', 'o6'],
  ops: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'],
  finance: ['f1', 'f3', 'f2', 'f4', 'f5', 'f6'],
  marketing: ['m1', 'm2', 'm3', 'm4', 'm5', 'm8', 'm6', 'm11'],
  clients: ['c1', 'c2', 'c3', 'c4'],
  crm: ['r1', 'r2', 'r3', 'r4', 'r5'],
  attribution: ['a1', 'a2', 'a3', 'a4', 'a5', 'a6'],
  insights: ['i1', 'i2', 'i3'],
};

const EXTRA: Record<IndustryKey, Partial<Record<SectionKey, readonly string[]>>> = {
  clinic: { ops: ['x2'], marketing: ['x1'] },
  salon: { ops: ['x3'], clients: ['x4'] },
  fitness: { ops: ['x6', 'p10'], finance: ['x5'] },
  auto: { ops: ['x7'], finance: ['x8'] },
  studio: { ops: ['x9', 'p10'], finance: ['f7'] },
  other: { ops: ['p9'] },
};

export function preset(k: IndustryKey): Preset {
  const extra = EXTRA[k];
  const out = {} as Record<SectionKey, readonly string[]>;
  for (const s of SECTION_ORDER) out[s] = [...BASE[s], ...(extra[s] ?? [])].filter((id) => fitsIndustry(BLOCK_BY_ID.get(id)!, k));
  return out;
}

// Весь каталог: «Начать с готового» набирает больше 40 блоков, и ссылка не должна их обрезать.
const MAX_BLOCKS = BLOCKS.length;
const ID_RE = /^[a-z]\d{1,2}$/;

/**
 * Набор «Собери себе» из адреса (`?b=o1,p2,m7`): неизвестные id, повторы и лишнее отбрасываются.
 * Та же функция проверяет набор в заявке на сервере — чужой текст в Telegram не попадёт.
 */
export function parseBlocks(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const out: string[] = [];
  for (const id of raw.split(',').map((x) => x.trim().toLowerCase())) {
    if (ID_RE.test(id) && BLOCK_BY_ID.has(id) && !out.includes(id)) out.push(id);
    if (out.length >= MAX_BLOCKS) break;
  }
  return out;
}

export const encodeBlocks = (ids: readonly string[]) => parseBlocks(ids.join(',')).join(',');

/** Раскладка набора по разделам в порядке каталога. */
export function bySection(ids: readonly string[]): Record<SectionKey, string[]> {
  const out = Object.fromEntries(SECTION_ORDER.map((s) => [s, [] as string[]])) as Record<SectionKey, string[]>;
  for (const def of BLOCKS) if (ids.includes(def.id)) out[def.section].push(def.id);
  return out;
}

const SPAN: Record<Size, number> = { 'w-3': 3, 'w-4': 4, 'w-5': 5, 'w-6': 6, 'w-7': 7, 'w-8': 8, 'w-12': 12 };
export const COLS = 12;

/**
 * Раскладка рядов на широком экране: если ряд не заполнен (блок остался один или не хватило места
 * следующему), последний блок ряда растягивается на остаток — без пустых дыр в сетке.
 * wide — блоки, которые после замера поставлены во всю ширину (слишком разная высота соседей).
 * Возвращает ширину каждого блока в колонках из 12.
 */
export function packRows(ids: readonly string[], wide: ReadonlySet<string> = new Set()): number[] {
  const spans = ids.map((id) => (wide.has(id) ? COLS : SPAN[BLOCK_BY_ID.get(id)?.size ?? 'w-12']));
  const out = [...spans];
  let used = 0;
  let last = -1; // индекс последнего блока в текущем ряду
  spans.forEach((s, i) => {
    if (used + s > COLS) {
      if (last >= 0) out[last]! += COLS - used;
      used = 0;
    }
    used += s;
    last = i;
    if (used === COLS) used = 0;
  });
  if (used > 0 && last >= 0) out[last]! += COLS - used;
  return out;
}
