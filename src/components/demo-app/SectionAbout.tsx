// Под дашбордом раздела: что в нём есть словами. Рендерится на сервере, чтобы смысл страницы
// был в HTML, а не только в графиках, которые рисует браузер. Блоки — из реестра, без отрасли.
import { BLOCKS, SECTIONS, type SectionKey } from '@/lib/demo-app/blocks/registry';
import { SECTION_COPY, SYSTEM_NAMES } from '@/lib/demo-app/section-copy';
import { CONTACT_URL, siteHref } from '@/lib/site-link';

export function SectionAbout({ section }: { section: SectionKey }) {
  const s = SECTIONS[section];
  const copy = SECTION_COPY[section];
  const blocks = BLOCKS.filter((b) => b.section === section);
  const systems = [...new Set(blocks.flatMap((b) => b.systems))].map((k) => SYSTEM_NAMES[k]);

  return (
    <section className="dm-about" aria-labelledby="dm-about-title">
      <h2 id="dm-about-title">Что показывает раздел «{s.title}»</h2>
      <p className="dm-about-intro">{copy.intro}</p>
      <p className="dm-about-meta"><b>Блоки раздела в каталоге: {blocks.length}.</b> Часть из них отраслевые, поэтому в готовом наборе вашей отрасли их может быть меньше.</p>
      <ul className="dm-about-blocks">
        {blocks.map((b) => (
          <li key={b.id}>
            <b>{b.title}</b>
            <span>{b.question}</span>
          </li>
        ))}
      </ul>
      <p className="dm-about-meta"><b>Откуда данные:</b> {systems.join(', ')}. Набор зависит от того, чем пользуетесь вы.</p>
      <p className="dm-about-meta"><b>Что меняем под вас:</b> показатели, разрезы, пороги и вид каждого блока. Любой блок убираем или делаем новый.</p>
      <nav className="dm-about-links" aria-label="Услуги по этому разделу">
        {copy.services.map((x) => <a key={x.href} href={siteHref(x.href)}>{x.label}</a>)}
        <a href={CONTACT_URL} className="is-ink">Обсудить свой дашборд</a>
      </nav>
    </section>
  );
}
