// Под экраном выбора отрасли: что такое демо и какие в нём разделы. Серверный текст —
// экран выбора рисуется в браузере, и без этого блока поисковику на странице читать нечего.
import Link from 'next/link';
import { NICHES } from '@/lib/niches';
import { BLOCKS, SECTIONS, SECTION_ORDER } from '@/lib/demo-app/blocks/registry';
import { siteHref } from '@/lib/site-link';

const INDUSTRY_NAMES = (['clinic', 'salon', 'fitness', 'auto', 'studio'] as const).map((k) => NICHES[k].toLowerCase());

export function DemoAbout() {
  return (
    <section className="dm-entry-about" aria-labelledby="dm-entry-about-title">
      <h2 id="dm-entry-about-title">Что внутри демо</h2>
      <p>
        Это рабочий дашборд на вымышленных данных сети из нескольких точек: {INDUSTRY_NAMES.join(', ')}.
        За каждой цифрой стоят два года дней, записей, оплат и рекламы, поэтому суммы сходятся, а любой показатель
        раскладывается по точкам и датам. Регистрация не нужна.
      </p>
      <ul className="dm-entry-about-list">
        {SECTION_ORDER.map((k) => {
          const n = BLOCKS.filter((b) => b.section === k).length;
          return (
            <li key={k}>
              <Link href={`/${SECTIONS[k].slug}/`}>{SECTIONS[k].title}</Link>
              <span>{SECTIONS[k].hint}. Блоков в каталоге: {n}.</span>
            </li>
          );
        })}
      </ul>
      <p>
        В разделе <Link href="/sobrat/">«Собери себе»</Link> можно отметить только нужные блоки и поделиться ссылкой на сборку.
        Если вы сейчас в Power BI и ищете замену, посмотрите, <a href={siteHref('/zamena-power-bi/')}>как мы переносим отчёты</a>.
        Цены на дашборды — на странице <a href={siteHref('/ceny/')}>«Цены»</a> сайта TableTools.
      </p>
    </section>
  );
}
