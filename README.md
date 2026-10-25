# TableTools: демо дашбордов

Интерактивный дашборд для малого бизнеса с несколькими точками. Все данные синтетические: их генерирует код при загрузке страницы, реальных клиентов и цифр здесь нет.

Живое демо: https://tabletools.ru/demo/

## Что можно посмотреть

- Шесть отраслевых профилей: сеть стоматологий, барбершопов, фитнес-студий, автосервисов, творческих студий и нейтральный пример «Другое». Названия сетей, точки, сотрудники и цены вымышленные.
- Восемь разделов: обзор, операционка, финансы, маркетинг, клиенты, CRM, сквозная аналитика, инсайты. Всего 62 блока, часть из них только для своей отрасли.
- Фильтры: период (неделя, месяц, квартал, год), точка, база сравнения. Выбранное хранится в адресе, ссылкой можно поделиться.
- Почти любую цифру можно открыть: в боковой панели она раскладывается по дням и по точкам.
- Конструктор «Собери себе»: отмечаете нужные блоки и сразу видите их на данных примера.
- Короткий тур с подсветкой элементов при первом входе.
- Раздел «Инсайты и ИИ» работает по сценарию: вопросы заготовлены, ответы считаются из тех же данных. Языковая модель не вызывается.

## Что внутри

- Генератор данных (`src/lib/demo-app/engine`). Из профиля отрасли он строит 728 дней (104 недели) по каждой точке: записи, неявки, выручку, рекламу, звонки, клиентов. Случайность с фиксированным семенем, поэтому при каждом запуске получаются одни и те же числа, а части всегда складываются в целое.
- Модели расчётов (`src/lib/demo-app/models`): P&L по точкам, структура расходов, юнит-экономика, прогноз денег на 13 недель, вердикты рекламных кампаний, модели атрибуции, когорты и спящие клиенты, воронка CRM, складские остатки и другое. Это чистые функции без React.
- Тесты на `node:test`, 375 штук: сходятся ли суммы по точкам с сетью, дают ли доли 100%, у каждого блока в реестре есть описание и источник данных, правильно ли ставится пузырь тура на телефоне.
- Графики написаны с нуля на SVG (`src/components/dash/charts`), без библиотек: линии, столбцы, водопад, кольцо, воронка, тепловая карта, пузырьки. У блоков с графиком есть переключатель «Таблица».
- Анимации на `requestAnimationFrame` и CSS: числа плавно доходят до нового значения, графики прорисовываются, когда появляются на экране. При `prefers-reduced-motion` всё показывается сразу.

Стек: Next.js 16 (App Router, все страницы статические), React 19, TypeScript. Других зависимостей во время работы нет.

## Как запустить

Нужны Node.js 24 и pnpm.

```bash
pnpm install
pnpm dev          # http://localhost:3000
pnpm test         # тесты моделей и движка
pnpm typecheck
pnpm build && pnpm start
```

Отрасль можно открыть сразу по адресу: `/obzor/?n=clinic` (варианты `clinic`, `salon`, `fitness`, `auto`, `studio`, `other`).

## Автор

Вадим Антонович, https://vadim.tabletools.ru

---

## English

An interactive dashboard demo for small multi-location businesses (clinics, barbershops, fitness studios, car services, creative studios), built on synthetic data. A seeded generator produces two years of daily records for every location, and pure TypeScript models turn them into P&L, unit economics, a 13-week cash forecast, ad campaign verdicts, attribution models, cohorts, a CRM pipeline and more, covered by 375 `node:test` tests. Charts are hand-written SVG components with count-up and draw-on-view animations that respect `prefers-reduced-motion`. Filters live in the URL, any figure opens a drill-down panel, and a block builder lets you assemble your own dashboard. The "AI insights" section is scripted and calls no language model. Built with Next.js 16, React 19 and TypeScript. Live demo: https://tabletools.ru/demo/. Author: Vadim Antonovich, https://vadim.tabletools.ru
