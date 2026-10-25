'use client';
// Вход в демо: сначала отрасль, потом режим —
// готовый дашборд отрасли или «Собери себе». Если отрасль пришла в адресе, первый шаг пропускается.
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Mark } from '@/components/ui/Logo';
import { NICHES } from '@/lib/niches';
import { SITE_URL } from '@/lib/site-link';
import { INDUSTRIES, INDUSTRY_ORDER, isIndustry } from '@/lib/demo-app/industries';
import { BLOCKS, SECTION_ORDER, fitsIndustry, preset } from '@/lib/demo-app/blocks/registry';
import { plural } from '@/components/dash/format';
import type { IndustryKey } from '@/lib/demo-app/engine/types';

const BLOCK_FORMS = ['блок', 'блока', 'блоков'] as const;

export function Entry() {
  const [niche, setNiche] = useState<IndustryKey | null>(null);

  useEffect(() => {
    const n = new URLSearchParams(location.search).get('n');
    if (isIndustry(n)) setNiche(n);
  }, []);

  const handlePick = (k: IndustryKey) => {
    setNiche(k);
    history.replaceState(history.state, '', `/?n=${k}`);
  };

  const ready = niche ? SECTION_ORDER.reduce((s, k) => s + preset(niche)[k].length, 0) : 0;
  const catalog = niche ? BLOCKS.filter((b) => fitsIndustry(b, niche)).length : 0;
  const p = niche ? INDUSTRIES[niche] : null;

  return (
    <main id="main" className="dm-entry">
      <header className="dm-entry-top">
        <a href={SITE_URL} className="dm-logo" aria-label="TableTools, на сайт"><Mark size={26} ink="var(--ivory)" /><span>table<b>tools</b></span></a>
        <span>Демо без регистрации</span>
      </header>

      {!niche || !p ? (
        <section className="dm-entry-step" key="niche">
          <h1>Какой у вас бизнес</h1>
          <p className="dm-entry-lead">Покажем дашборд на примере похожей сети — с её точками, услугами, рекламой и деньгами. Данные вымышленные, устроено всё как в настоящем проекте.</p>
          <ul className="dm-niches">
            {INDUSTRY_ORDER.map((k) => (
              <li key={k}>
                <button type="button" onClick={() => handlePick(k)}>
                  <b>{NICHES[k]}</b>
                  <small>{k === 'other' ? 'Соберём из каталога блоков под вас' : `${INDUSTRIES[k].business}, ${INDUSTRIES[k].city}`}</small>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <section className="dm-entry-step" key="mode">
          <button type="button" className="dm-entry-back" onClick={() => setNiche(null)}>Другая отрасль</button>
          <h1>{NICHES[niche]}</h1>
          <p className="dm-entry-lead">Пример — {p.business.charAt(0).toLowerCase() + p.business.slice(1)} {p.cityIn}, {p.locations.length} {plural(p.locations.length, p.words.location)}. Выберите, как смотреть.</p>
          <div className="dm-modes">
            {niche !== 'other' && (
              <Link href={`/obzor/?n=${niche}`} className="dm-mode is-main">
                <b>Готовый дашборд</b>
                <span>{ready} {plural(ready, BLOCK_FORMS)} в семи разделах: операционка, финансы, маркетинг, клиенты, сквозная аналитика и ИИ. Короткий тур покажет главное.</span>
                <em>Открыть дашборд</em>
              </Link>
            )}
            {niche !== 'other' && (
              <Link href={`/crm/?n=${niche}`} className="dm-mode">
                <b>CRM и склад</b>
                <span>Воронка сделок, задачи и просрочки, карточка клиента, работа администраторов и склад — на тех же данных, что и дашборд.</span>
                <em>Посмотреть CRM</em>
              </Link>
            )}
            <Link href={`/sobrat/?n=${niche}`} className="dm-mode">
              <b>Собери себе</b>
              <span>Выберите из {catalog} {plural(catalog, BLOCK_FORMS)} только то, что нужно вам, и отправьте нам ссылку — по ней и оценим проект.</span>
              <em>Собрать свой</em>
            </Link>
          </div>
          <p className="dm-entry-note">Каждый дашборд делаем под конкретный бизнес: любой блок меняем, убираем или придумываем новый.</p>
        </section>
      )}
    </main>
  );
}
