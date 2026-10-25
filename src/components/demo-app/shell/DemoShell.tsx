'use client';
// Оболочка демо-приложения: меню разделов, верхняя панель, демо-полоса про индивидуальность.
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { Mark } from '@/components/ui/Logo';
import { CONTACT_URL, SITE_URL } from '@/lib/site-link';
import { SECTIONS, SECTION_ORDER } from '@/lib/demo-app/blocks/registry';
import { DemoProvider, useDemo } from '../state';
import { DrillProvider } from '../drill';
import { DrillPanel } from '../DrillPanel';
import { Tour } from '../tour/Tour';
import { ICON, Icon, SECTION_ICON } from './icons';
import { Topbar } from './Topbar';

function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const path = usePathname();
  const { query } = useDemo();
  return (
    <>
      <aside className={`dm-side${open ? ' is-open' : ''}`} aria-label="Разделы демо">
        <div className="dm-side-top">
          <a href={SITE_URL} className="dm-logo" aria-label="TableTools, на сайт"><Mark size={26} ink="var(--ivory)" /><span>table<b>tools</b></span></a>
          <button type="button" className="dm-side-x" aria-label="Закрыть меню" onClick={onClose}><Icon d={ICON.close} /></button>
        </div>
        <nav data-tour="nav">
          <ul>
            {SECTION_ORDER.map((k) => {
              const href = `/${SECTIONS[k].slug}/`;
              const active = path === href || path === href.slice(0, -1);
              return (
                <li key={k}>
                  <Link href={`${href}${query}`} className={active ? 'on' : undefined} aria-current={active ? 'page' : undefined} onClick={onClose}>
                    <Icon d={SECTION_ICON[k]} /><span>{SECTIONS[k].title}</span>
                  </Link>
                </li>
              );
            })}
            <li className="dm-nav-build">
              <Link href={`/sobrat/${query}`} className={path.startsWith('/sobrat') ? 'on' : undefined} aria-current={path.startsWith('/sobrat') ? 'page' : undefined} onClick={onClose}>
                <Icon d={ICON.build} /><span>Собери себе</span>
              </Link>
            </li>
          </ul>
        </nav>
        <div className="dm-side-card">
          <p>Это пример. Ваш дашборд соберём под ваши точки, метрики и системы — меняется всё.</p>
          <a href={SITE_URL} className="dm-back"><Icon d={ICON.back} size={16} />На сайт TableTools</a>
        </div>
      </aside>
      {open && <button type="button" className="dm-scrim" aria-label="Закрыть меню" onClick={onClose} />}
    </>
  );
}

function Frame({ children }: { children: ReactNode }) {
  const path = usePathname();
  const { ds } = useDemo();
  const [menu, setMenu] = useState(false);

  useEffect(() => { document.body.style.overflow = menu ? 'hidden' : ''; return () => { document.body.style.overflow = ''; }; }, [menu]);

  const handleTour = () => window.dispatchEvent(new CustomEvent('tt-tour'));

  return (
    <div className="ds dm">
      <div className="dm-ambient" aria-hidden="true" />
      <Sidebar open={menu} onClose={() => setMenu(false)} />
      <div className="dm-main">
        <div className="dm-strip" role="note">
          <p className="dm-strip-full"><b>Демо на вымышленных данных.</b> Каждый дашборд мы собираем под конкретный бизнес: метрики, разрезы, источники и вид меняем под вас.</p>
          <p className="dm-strip-short"><b>Пример на вымышленных данных.</b> Каждый дашборд делаем под ваш бизнес.</p>
          <a href={CONTACT_URL} target="_blank" rel="noopener noreferrer">Обсудить свой</a>
        </div>
        <Topbar onMenu={() => setMenu(true)} onTour={handleTour} />
        <main id="main" className="dm-content" key={path} aria-busy={!ds}>{children}</main>
      </div>
      <DrillPanel />
      <Tour />
    </div>
  );
}

export function DemoShell({ children }: { children: ReactNode }) {
  return <DemoProvider><DrillProvider><Frame>{children}</Frame></DrillProvider></DemoProvider>;
}
