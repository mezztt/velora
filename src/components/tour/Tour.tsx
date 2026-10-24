import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import "./tour.css";

/** Tutorial visual "¿Cómo funcionamos?": fondo oscurecido, el elemento a tocar resaltado y un cartel con
 *  Omitir / Anterior / Siguiente. Los pasos apuntan a elementos con data-tour="..." (o cualquier selector CSS).
 *  Si un elemento no existe o está oculto (p. ej. menú cerrado en el celular), el paso se muestra centrado. */
export type TourStep = { selector?: string; title: string; text: string };

export const TOUR_EVENT = "mezztt-tour-start";
export const startTour = () => window.dispatchEvent(new Event(TOUR_EVENT));

const key = (storageKey: string) => `${storageKey}_tour_done`;
const wasDone = (storageKey: string) => { try { return localStorage.getItem(key(storageKey)) === "1"; } catch { return true; } };
const markDone = (storageKey: string) => { try { localStorage.setItem(key(storageKey), "1"); } catch { /* sin storage */ } };

type Rect = { top: number; left: number; width: number; height: number };

function findTarget(selector?: string): HTMLElement | null {
  if (!selector) return null;
  const el = document.querySelector<HTMLElement>(selector);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 ? el : null;
}

export default function Tour({ steps, storageKey }: { steps: TourStep[]; storageKey: string }) {
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight });
  const cardRef = useRef<HTMLDivElement>(null);
  const [cardH, setCardH] = useState(180);

  // primera vez: abrir solo
  useEffect(() => {
    if (!wasDone(storageKey)) { const t = window.setTimeout(() => { setI(0); setOpen(true); }, 700); return () => window.clearTimeout(t); }
  }, [storageKey]);
  // botón "¿Cómo funcionamos?"
  useEffect(() => {
    const h = () => { setI(0); setOpen(true); };
    window.addEventListener(TOUR_EVENT, h);
    return () => window.removeEventListener(TOUR_EVENT, h);
  }, []);

  const close = useCallback(() => { markDone(storageKey); setOpen(false); }, [storageKey]);

  const measure = useCallback(() => {
    setVp({ w: window.innerWidth, h: window.innerHeight });
    const el = findTarget(steps[i]?.selector);
    if (!el) { setRect(null); return; }
    const r = el.getBoundingClientRect();
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, [i, steps]);

  useLayoutEffect(() => {
    if (!open) return;
    const el = findTarget(steps[i]?.selector);
    if (el) el.scrollIntoView({ block: "nearest", inline: "nearest" });
    measure();
    const t = window.setTimeout(measure, 250);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => { window.clearTimeout(t); window.removeEventListener("resize", measure); window.removeEventListener("scroll", measure, true); };
  }, [open, i, measure, steps]);

  useLayoutEffect(() => { if (open && cardRef.current) setCardH(cardRef.current.offsetHeight); }, [open, i, rect]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight" || e.key === "Enter") setI(x => (x < steps.length - 1 ? x + 1 : (close(), x)));
      if (e.key === "ArrowLeft") setI(x => Math.max(0, x - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, steps.length, close]);

  if (!open || !steps.length) return null;
  const step = steps[i];
  const last = i === steps.length - 1;
  const pad = 6;
  const cardW = Math.min(340, vp.w - 24);

  let cardStyle: CSSProperties;
  if (rect) {
    const spaceBelow = vp.h - (rect.top + rect.height + pad);
    const placeBelow = spaceBelow >= cardH + 16 || spaceBelow >= rect.top - pad;
    let top = placeBelow ? rect.top + rect.height + pad + 12 : rect.top - pad - 12 - cardH;
    top = Math.max(12, Math.min(top, vp.h - cardH - 12));
    let left = rect.left + rect.width + pad + 12;           // a la derecha (menú lateral)
    if (left + cardW > vp.w - 12 || rect.width > vp.w * 0.6) left = Math.max(12, Math.min(rect.left, vp.w - cardW - 12));
    else top = Math.max(12, Math.min(rect.top, vp.h - cardH - 12));
    cardStyle = { top, left, width: cardW };
  } else {
    cardStyle = { top: Math.max(12, (vp.h - cardH) / 2), left: Math.max(12, (vp.w - cardW) / 2), width: cardW };
  }

  return (
    <div className="tour-root" role="dialog" aria-modal="true" aria-label="Tutorial" data-contrast-ignore>
      {rect
        ? <div className="tour-spot" style={{ top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }} />
        : <div className="tour-dim" />}
      <div className="tour-card" ref={cardRef} style={cardStyle}>
        <div className="tour-count">Paso {i + 1} de {steps.length}</div>
        <h3 className="tour-title">{step.title}</h3>
        <p className="tour-text">{step.text}</p>
        <div className="tour-actions">
          <button type="button" className="tour-skip" onClick={close}>Omitir</button>
          <span className="tour-sp" />
          {i > 0 && <button type="button" className="tour-prev" onClick={() => setI(i - 1)}>Anterior</button>}
          <button type="button" className="tour-next" autoFocus onClick={() => (last ? close() : setI(i + 1))}>{last ? "Listo" : "Siguiente"}</button>
        </div>
      </div>
    </div>
  );
}
