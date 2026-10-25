'use client';
// Тур с подсветкой: один вырез с тенью на весь экран переезжает между целями,
// пузырь ставится каскадом сторон и не уходит за край. Esc закрывает, стрелки листают, фокус в пузыре.
// Если цели нет (блок не показан в этом наборе), шаг показывается по центру — тур не застревает.
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { SECTIONS } from '@/lib/demo-app/blocks/registry';
import { GAP, MARGIN, SHEET_BELOW, holeBox, placeBubble, sheetFit, sheetPlacement, sideFit, targetTop, type Placement, type Rect } from '@/lib/tour/place';
import { CONTACT_URL } from '@/lib/site-link';
import { useDemo } from '../state';
import { BUILD_TOUR, READY_TOUR, type TourStep } from './steps';

const DONE_KEY = 'tt-tour-v1';
const BUILD_DONE_KEY = 'tt-tour-build-v1';
const WAIT_MS = 2500;
const AUTO_START_MS = 900;
const FOCUSABLE = 'button:not([disabled]), a[href]';

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function rectOf(el: Element): Rect {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}

/** Ждёт появления цели на странице (после перехода между разделами), не дольше WAIT_MS. */
function waitFor(selector: string): Promise<Element | null> {
  const now = document.querySelector(selector);
  if (now) return Promise.resolve(now);
  return new Promise((resolve) => {
    const mo = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) { mo.disconnect(); clearTimeout(timer); resolve(el); }
    });
    const timer = setTimeout(() => { mo.disconnect(); resolve(null); }, WAIT_MS);
    mo.observe(document.body, { childList: true, subtree: true });
  });
}

const SCROLL_PAD = 24; // воздух над высоким блоком
const SETTLE_MS = 450;

const BUBBLE_W = 340;
const BUBBLE_H_GUESS = 400; // пока пузырь не измерен

/** Цель — целиком на экране, а под ней, если получается, место для пузыря. */
function scrollToTarget(el: Element, reserve: number) {
  const r = el.getBoundingClientRect();
  const vh = window.innerHeight;
  // Телефон и блок, под которым пузырю не хватит места: пузырь станет нижней панелью —
  // блок ставим к самому верху, чтобы над панелью его было видно как можно больше.
  const toTop = window.innerWidth < SHEET_BELOW && r.height + GAP + reserve + SCROLL_PAD * 2 > vh;
  const top = window.scrollY + r.top - (toTop ? SCROLL_PAD : targetTop(r.height, vh, reserve, SCROLL_PAD));
  window.scrollTo({ top: Math.max(0, top), behavior: reduced() ? 'auto' : 'smooth' });
}

export function Tour() {
  const { ds, query } = useDemo();
  const router = useRouter();
  const path = usePathname();
  const [index, setIndex] = useState<number | null>(null);
  const [target, setTarget] = useState<Element | null>(null);
  const [hole, setHole] = useState<Rect | null>(null);
  const [place, setPlace] = useState<Placement | null>(null);
  const [sheet, setSheet] = useState(false);
  const bubble = useRef<HTMLDivElement>(null);
  const bubbleH = useRef(BUBBLE_H_GUESS);
  const [bubbleW, setBubbleW] = useState(BUBBLE_W);
  const opener = useRef<HTMLElement | null>(null);
  const titleId = useId();

  const building = path.startsWith('/sobrat');
  const steps: readonly TourStep[] = building ? BUILD_TOUR : READY_TOUR;
  const doneKey = building ? BUILD_DONE_KEY : DONE_KEY;
  const step = index === null ? null : steps[index] ?? null;
  const total = steps.length;

  const finish = useCallback(() => {
    setIndex(null);
    setTarget(null);
    try { localStorage.setItem(doneKey, '1'); } catch { /* не критично: тур просто покажется снова */ }
    opener.current?.focus?.();
  }, [doneKey]);

  // Запуск: кнопка «?» шлёт событие; при первом входе в раздел — сам, один раз.
  useEffect(() => {
    const handleStart = () => { opener.current = document.activeElement as HTMLElement | null; setIndex(0); };
    window.addEventListener('tt-tour', handleStart);
    return () => window.removeEventListener('tt-tour', handleStart);
  }, []);
  const autoTried = useRef(false);
  useEffect(() => {
    if (!ds || autoTried.current) return;
    autoTried.current = true; // автозапуск пробуем один раз за визит
    let done = true;
    try { done = localStorage.getItem(doneKey) === '1'; } catch { done = true; }
    if (done) return;
    const t = setTimeout(() => setIndex((i) => i ?? 0), AUTO_START_MS);
    return () => clearTimeout(t);
  }, [ds, doneKey]);

  // Пока идёт тур, верхняя панель не прилипает — иначе она закрывает подсвеченный блок.
  const active = index !== null;
  useEffect(() => {
    document.documentElement.classList.toggle('tt-on', active);
    return () => document.documentElement.classList.remove('tt-on');
  }, [active]);

  // Переход к шагу: нужный раздел, ожидание цели, прокрутка к ней.
  useEffect(() => {
    if (!step) return;
    let alive = true;
    const want = step.section ? `/${SECTIONS[step.section].slug}/` : null;
    if (want && path !== want) { router.push(`${want}${query}`); return; }
    if (!step.target) { setTarget(null); return; }
    let settle: ReturnType<typeof setTimeout> | undefined;
    waitFor(step.target).then((el) => {
      if (!alive) return;
      if (el) {
        scrollToTarget(el, bubbleH.current);
        // Блок мог дорисоваться после перехода между разделами — доводим прокрутку ещё раз.
        settle = setTimeout(() => { if (alive) scrollToTarget(el, bubbleH.current); }, SETTLE_MS);
      }
      setTarget(el);
    });
    return () => { alive = false; clearTimeout(settle); };
  }, [step, path, query, router]);

  // Замер: вырез и пузырь следуют за целью при прокрутке и смене размера.
  const measure = useCallback(() => {
    const vp = { w: window.innerWidth, h: window.innerHeight };
    const b = bubble.current ? { w: bubble.current.offsetWidth, h: bubble.current.offsetHeight } : { w: BUBBLE_W, h: BUBBLE_H_GUESS };
    bubbleH.current = b.h;
    if (!target || !step?.target) {
      setHole(null);
      setSheet(false);
      setBubbleW(BUBBLE_W);
      setPlace({ side: 'bottom', x: Math.round((vp.w - b.w) / 2), y: Math.round((vp.h - b.h) / 2), arrow: -1 });
      return;
    }
    const r = rectOf(target);
    const h = holeBox(r, vp);
    setHole(h);
    // Телефон и высокий блок: пузырь — нижняя панель, блок виден над ней.
    if (sheetFit(h, { w: vp.w - MARGIN * 2, h: b.h }, vp)) {
      setSheet(true);
      setBubbleW(vp.w - MARGIN * 2);
      setPlace(sheetPlacement(b, vp));
      return;
    }
    setSheet(false);
    // Высокий блок во всю ширину: сверху и снизу места нет — пузырь сужается и встаёт сбоку.
    const side = sideFit(h, { w: BUBBLE_W, h: b.h }, vp);
    const w = side ? side.w : BUBBLE_W;
    setBubbleW(w);
    setPlace(placeBubble(h, { w, h: b.h }, vp, side ? side.side : step.prefer));
  }, [target, step]);

  useLayoutEffect(() => {
    if (!step) return;
    measure();
    let raf = requestAnimationFrame(function again() { measure(); raf = requestAnimationFrame(again); });
    const stop = setTimeout(() => cancelAnimationFrame(raf), 700); // досчитать, пока идёт плавная прокрутка
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => { cancelAnimationFrame(raf); clearTimeout(stop); window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure, true); };
  }, [step, measure]);

  // Клавиатура: Esc, стрелки, фокус не выходит из пузыря.
  useEffect(() => {
    if (!step) return;
    bubble.current?.querySelector<HTMLElement>('[data-primary]')?.focus();
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); finish(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); setIndex((i) => (i === null ? i : Math.min(total - 1, i + 1))); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); setIndex((i) => (i === null ? i : Math.max(0, i - 1))); }
      else if (e.key === 'Tab' && bubble.current) {
        const items = [...bubble.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
        const first = items[0];
        const last = items[items.length - 1];
        if (!first || !last) return;
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', handleKey, true);
    return () => document.removeEventListener('keydown', handleKey, true);
  }, [step, total, finish]);

  if (!step || !ds || typeof document === 'undefined') return null;
  const p = ds.profile;
  const handleNext = () => setIndex((i) => (i === null ? i : Math.min(total - 1, i + 1)));
  const handleBack = () => setIndex((i) => (i === null ? i : Math.max(0, i - 1)));
  // Дошёл до последнего шага и выбрал, что дальше, — тур пройден (крестик и Esc не считаются).
  const complete = finish;
  const handleWatch = () => {
    complete();
    const home = `/${SECTIONS.overview.slug}/`;
    if (path !== home) router.push(`${home}${query}`);
    window.scrollTo({ top: 0, behavior: reduced() ? 'auto' : 'smooth' });
  };

  return createPortal(
    <div className="tt-tour" aria-live="off">
      <div className="tt-shield" onClick={(e) => e.stopPropagation()} />
      {hole && <div className="tt-hole" style={{ transform: `translate(${hole.x}px, ${hole.y}px)`, width: hole.w, height: hole.h }} />}
      {!hole && <div className="tt-dim" />}
      <div
        ref={bubble}
        className={`tt-bubble is-${place?.side ?? 'bottom'}${hole ? '' : ' is-center'}${sheet ? ' is-sheet' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={{ width: `min(${bubbleW}px, calc(100vw - 24px))`, transform: place ? `translate(${place.x}px, ${place.y}px)` : undefined, visibility: place ? 'visible' : 'hidden', ['--arrow' as string]: `${place?.arrow ?? 0}px` }}
        key={step.key}
      >
        <div className="tt-head">
          <span className="tt-count" aria-live="polite">Шаг {index! + 1} из {total}</span>
          <button type="button" className="tt-x" onClick={finish} aria-label="Закрыть тур">×</button>
        </div>
        <h2 id={titleId}>{step.title}</h2>
        <p>{step.body(p)}</p>
        {step.custom && <p className="tt-custom">{step.custom(p)}</p>}
        <div className="tt-actions">
          {index! > 0 && <button type="button" className="tt-back" onClick={handleBack}>Назад</button>}
          {step.final && building ? (
            <button type="button" className="btn btn-gold" data-primary onClick={complete}>Понятно</button>
          ) : step.final ? (
            <div className="tt-final">
              <button type="button" className="btn btn-gold" data-primary onClick={handleWatch}>Смотреть готовый дашборд</button>
              <Link href={`/sobrat/${query}`} className="btn btn-line" onClick={complete}>Собрать свой</Link>
              <a className="tt-link" href={CONTACT_URL} target="_blank" rel="noopener noreferrer" onClick={complete}>Обсудить проект</a>
            </div>
          ) : (
            <button type="button" className="btn btn-gold" data-primary onClick={handleNext}>Дальше</button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
