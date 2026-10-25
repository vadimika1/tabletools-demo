'use client';
// «Собери себе»: каталог блоков отрасли слева, живое превью справа. Набор живёт в адресе (?b=o1,p2),
// ссылкой можно поделиться; «Хочу такой» ведёт на сайт TableTools.
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { plural } from '@/components/dash/format';
import { NICHES } from '@/lib/niches';
import { CONTACT_URL } from '@/lib/site-link';
import { BLOCKS, SECTIONS, SECTION_ORDER, bySection, fitsIndustry, preset } from '@/lib/demo-app/blocks/registry';
import { useDemo } from './state';
import { BlockGrid } from './blocks';

const BLOCK_FORMS = ['блок', 'блока', 'блоков'] as const;
const COPIED_MS = 2400;

export function Builder() {
  const { ds, niche, blocks, set, query } = useDemo();
  const [search, setSearch] = useState('');
  const [copied, setCopied] = useState(false);

  const catalog = BLOCKS.filter((b) => fitsIndustry(b, niche));
  const needle = search.trim().toLowerCase();
  const shown = needle ? catalog.filter((b) => `${b.title} ${b.question}`.toLowerCase().includes(needle)) : catalog;
  const chosen = useMemo(() => bySection(blocks), [blocks]);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(copiedTimer.current), []);

  const handleToggle = (id: string) => set({ blocks: blocks.includes(id) ? blocks.filter((x) => x !== id) : [...blocks, id] });
  const handlePreset = () => set({ blocks: SECTION_ORDER.flatMap((s) => preset(niche)[s]) });
  const handleClear = () => set({ blocks: [] });
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(`${location.origin}/sobrat/${query}`);
      setCopied(true);
      clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), COPIED_MS);
    } catch {
      setCopied(false); // буфер недоступен — ссылка всё равно в адресной строке
    }
  };

  return (
    <div className="bd">
      <div className="dm-head">
        <div>
          <h1>Соберите свой дашборд</h1>
          <p>Отметьте нужные блоки, и они сразу появятся на данных примера. {NICHES[niche]}: {catalog.length} {plural(catalog.length, BLOCK_FORMS)} в каталоге.</p>
        </div>
      </div>

      <div className="bd-layout">
        <aside className="bd-catalog" aria-label="Каталог блоков" data-tour="catalog">
          <div className="bd-tools">
            <label className="bd-search">
              <span className="sr-only">Найти блок</span>
              <input type="search" name="block-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Найти: неявки, реклама, прибыль" />
            </label>
            <div className="bd-quick">
              <button type="button" onClick={handlePreset}>Начать с готового</button>
              <button type="button" onClick={handleClear} disabled={!blocks.length}>Очистить</button>
            </div>
          </div>
          {SECTION_ORDER.map((s) => {
            const items = shown.filter((b) => b.section === s);
            if (!items.length) return null;
            return (
              <section key={s} className="bd-group">
                <h2>{SECTIONS[s].title}</h2>
                <ul>
                  {items.map((b) => {
                    const on = blocks.includes(b.id);
                    return (
                      <li key={b.id}>
                        <button type="button" className={`bd-item${on ? ' is-on' : ''}`} aria-pressed={on} onClick={() => handleToggle(b.id)}>
                          <span className="bd-check" aria-hidden="true" />
                          <span className="bd-text">
                            <b>{b.title}</b>
                            <small>{b.question}</small>
                          </span>
                          {b.from === 'industry' && <em className="bd-tag">для отрасли</em>}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
          {!shown.length && <p className="bd-empty">Ничего не нашлось. Попробуйте другое слово.</p>}
        </aside>

        <div className="bd-preview" aria-live="polite">
          {!blocks.length && (
            <div className="bd-placeholder">
              <b>Здесь появится ваш дашборд</b>
              <p>Отметьте блоки слева или начните с готового набора для отрасли — потом уберите лишнее.</p>
            </div>
          )}
          {ds && SECTION_ORDER.filter((s) => chosen[s].length).map((s) => (
            <section key={s} className="bd-section">
              <h2>{SECTIONS[s].title}</h2>
              <BlockGrid ids={chosen[s]} />
            </section>
          ))}
        </div>
      </div>

      <div className="bd-bar" role="region" aria-label="Ваш набор">
        <span><b>{blocks.length}</b> {plural(blocks.length, BLOCK_FORMS)} выбрано</span>
        <div className="bd-bar-actions">
          <button type="button" className="btn btn-line" onClick={handleCopy} disabled={!blocks.length}>{copied ? 'Ссылка скопирована' : 'Скопировать ссылку'}</button>
          {blocks.length > 0 && <Link href={`/obzor/${query}`} className="btn btn-line">Открыть как дашборд</Link>}
          <a className="btn btn-gold" href={CONTACT_URL} target="_blank" rel="noopener noreferrer">Хочу такой</a>
        </div>
      </div>
    </div>
  );
}
