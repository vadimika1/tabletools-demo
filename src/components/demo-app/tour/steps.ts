// Сценарий тура по готовому дашборду. Цель — CSS-селектор; блоки находятся по data-block,
// элементы оболочки — по data-tour. Последняя строка шага — что именно мы настраиваем под клиента.
import type { IndustryProfile } from '@/lib/demo-app/engine/types';
import type { SectionKey } from '@/lib/demo-app/blocks/registry';
import type { Side } from '@/lib/tour/place';
import { plural } from '@/components/dash/format';

export interface TourStep {
  key: string;
  section?: SectionKey; // шаг живёт в этом разделе — тур перейдёт туда сам
  target?: string; // нет цели — пузырь по центру
  prefer?: Side;
  title: string;
  body: (p: IndustryProfile) => string;
  custom?: (p: IndustryProfile) => string; // «Под вас» — только на ключевых шагах, чтобы не повторяться
  final?: boolean;
}

const block = (id: string) => `[data-block="${id}"] > *`;

export const READY_TOUR: readonly TourStep[] = [
  {
    key: 'industry', target: '[data-tour="industry"]', prefer: 'bottom',
    title: 'Это пример, похожий на ваш бизнес',
    body: (p) => `${p.business} ${p.cityIn}: ${p.locations.length} ${plural(p.locations.length, p.words.location)}. Переключите отрасль — поменяются услуги, точки и сами показатели.`,
    custom: (p) => `Под вас: ваши точки, ваши названия услуг и ваши системы — например, ${p.systems.booking} и ${p.systems.accounting}.`,
  },
  {
    key: 'filters', target: '[data-tour="filters"]', prefer: 'bottom',
    title: 'Период, точка и сравнение',
    body: () => 'Месяц или год, одна точка или вся сеть, сравнение с прошлым периодом или с прошлым годом — все блоки пересчитаются сразу.',
  },
  {
    key: 'figures', section: 'overview', target: '[data-tour="figures"]', prefer: 'bottom',
    title: 'Главные цифры — это двери',
    body: () => 'Каждая плитка открывает подробности: по дням, по точкам и как считаем. Нажмите на любую, когда закончите тур.',
  },
  {
    key: 'lost', section: 'overview', target: block('o2'), prefer: 'right',
    title: 'Сколько денег прошло мимо',
    body: () => 'Неявки, пустые часы, пропущенные звонки и реклама без продаж — в рублях и по пунктам. Ради этого блока дашборд обычно и заказывают.',
    custom: () => 'Под вас: считаем те потери, которые есть именно у вас.',
  },
  {
    key: 'attribution', section: 'attribution', target: '[data-block="a1"] .mk-why', prefer: 'bottom',
    title: 'Сквозная аналитика — это не Метрика',
    body: (p) => `Метрика видит клик по рекламе и визит на сайт, но не знает, что человек потом позвонил, записался через администратора и оплатил. Сквозная склеивает рекламу, звонки, мессенджеры и оплаты из ${p.systems.booking} в одного клиента. Треть продаж проходит через два-три канала — Метрика всё отдаёт последнему клику, а здесь видно всю цепочку и переключается модель.`,
  },
  {
    key: 'chat', section: 'insights', target: block('i2'), prefer: 'right',
    title: 'Спросите дашборд своими словами',
    body: (p) => `«Где больше всего неявок?», «Какой ${p.words.staff[0]} приносит больше всех?» — ответ цифрами и графиком. В демо вопросы готовые.`,
  },
  {
    key: 'digest', section: 'insights', target: block('i3'), prefer: 'left',
    title: 'Сводка в Telegram к девяти утра',
    body: () => 'Выручка за вчера, записи на сегодня и тревоги — владельцу не нужно открывать дашборд, чтобы знать главное.',
  },
  {
    key: 'build', final: true,
    title: 'Готово. Что дальше?',
    body: () => 'Посмотрите готовый дашборд сами — все плитки и строки открываются. Или отберите блоки из каталога и отправьте нам ссылку: по ней оценим проект.',
    custom: () => 'Каждый дашборд делаем под конкретный бизнес: любой блок меняем, убираем или придумываем новый.',
  },
];

/** Короткий тур по конструктору «Собери себе». */
export const BUILD_TOUR: readonly TourStep[] = [
  {
    key: 'catalog', target: '[data-tour="catalog"]', prefer: 'right',
    title: 'Каталог блоков для вашей отрасли',
    body: () => 'Отметьте то, что нужно, или начните с готового набора и уберите лишнее. Поиск понимает обычные слова: «неявки», «реклама», «прибыль».',
    custom: () => 'Нет нужного блока — его можно сделать: каждый дашборд собирается под конкретный бизнес.',
  },
  {
    key: 'preview', target: '.bd-preview', prefer: 'left',
    title: 'Превью на данных примера',
    body: (p) => `Блоки сразу показывают цифры ${p.business.charAt(0).toLowerCase() + p.business.slice(1)}. Меняйте период и точку сверху — превью пересчитается.`,
  },
  {
    key: 'bar', target: '.bd-bar', prefer: 'top', final: true,
    title: 'Поделитесь набором',
    body: () => 'Скопируйте ссылку — по ней откроется та же отрасль и тот же набор блоков. «Хочу такой» ведёт на сайт TableTools.',
    custom: () => 'Каждый дашборд делаем под конкретный бизнес: любой блок меняем, убираем или придумываем новый.',
  },
];
