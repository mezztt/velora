import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { API_URL, APP_BRAND, APP_NAME, APP_VERSION, BRAND_DEFAULTS } from "../config";
import type { BrandLinks } from "../config";

// ============================================================
// MARCA · familia de logos de Mezztt (Velora, Deportia, MIRA y Mezztt se construyen igual:
// cuadrado redondeado del color de marca + letra en trazo blanco + punto de acento).
// ============================================================

/** Logo de Velora: espresso (#241d19) + "V" + punto bronce (#d29a62), los mismos que usa la web de Mezztt. */
export function VeloraLogo({ size = 40, title = APP_NAME }: { size?: number; title?: string }) {
  return (
    <svg className="vl-logo" width={size} height={size} viewBox="0 0 48 48" role="img" aria-label={title}>
      <rect width="48" height="48" rx="13" fill="#241d19" />
      <path d="M14 19 L24 35 L34 19" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="37" cy="11" r="3" fill="#d29a62" />
    </svg>
  );
}

/** Logo de Mezztt (panel de control y firma). */
export function MezzttLogo({ size = 40, title = APP_BRAND }: { size?: number; title?: string }) {
  return <img className="vl-logo" src="/mezztt-logo.png" width={size} height={size} alt={title} />;
}

export function InstagramIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="5.5" />
      <circle cx="12" cy="12" r="4.2" />
      <circle cx="17.4" cy="6.6" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

// ---------- enlaces de marca (se piden una sola vez y quedan en memoria) ----------

let cachedLinks: BrandLinks | null = null;
let pendingLinks: Promise<BrandLinks> | null = null;

function cleanLinks(data: unknown): BrandLinks {
  const d = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  const pick = (key: keyof BrandLinks) => {
    const v = typeof d[key] === "string" ? (d[key] as string).trim() : "";
    return /^https?:\/\//i.test(v) ? v : BRAND_DEFAULTS[key];
  };
  return {
    system_instagram_url: pick("system_instagram_url"),
    mezztt_instagram_url: pick("mezztt_instagram_url"),
    mezztt_site_url: pick("mezztt_site_url"),
  };
}

function loadBrandLinks(): Promise<BrandLinks> {
  if (cachedLinks) return Promise.resolve(cachedLinks);
  if (!pendingLinks) {
    pendingLinks = fetch(`${API_URL}/public/brand`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => (cachedLinks = cleanLinks(data)))
      .catch(() => (cachedLinks = { ...BRAND_DEFAULTS }));
  }
  return pendingLinks;
}

/** Olvida los enlaces en memoria (después de cambiarlos desde el panel de Mezztt). */
export function resetBrandLinks() {
  cachedLinks = null;
  pendingLinks = null;
}

/**
 * Enlaces de marca: arranca con los valores por defecto, pide /public/brand una sola vez
 * y nunca rompe si falla. `mezztt` es a dónde lleva la palabra "Mezztt"
 * (su página o, si todavía no hay, su Instagram).
 */
export function useBrandLinks() {
  const [links, setLinks] = useState<BrandLinks>(cachedLinks || BRAND_DEFAULTS);
  useEffect(() => {
    let alive = true;
    loadBrandLinks().then((l) => { if (alive) setLinks(l); }).catch(() => { /* quedan los valores por defecto */ });
    return () => { alive = false; };
  }, []);
  return { ...links, mezztt: links.mezztt_site_url || links.mezztt_instagram_url };
}

/** La palabra "Mezztt" como enlace hacia afuera (único lugar de la marca que navega). */
export function MezzttLink({ children }: { children?: ReactNode }) {
  const { mezztt } = useBrandLinks();
  return (
    <a className="vl-brand-link" href={mezztt} target="_blank" rel="noopener noreferrer">
      {children || APP_BRAND}
    </a>
  );
}

export function InstagramLink({ who }: { who: "system" | "mezztt" }) {
  const links = useBrandLinks();
  const href = who === "system" ? links.system_instagram_url : links.mezztt_instagram_url;
  const name = who === "system" ? APP_NAME : APP_BRAND;
  return (
    <a className="vl-ig" href={href} target="_blank" rel="noopener noreferrer" aria-label={`Instagram de ${name}`} title={`Instagram de ${name}`}>
      <InstagramIcon />
    </a>
  );
}

/** Marca completa: logo + nombre + "v1.0.0 · by Mezztt" (login y páginas legales). */
export function BrandLockup({ size = 44 }: { size?: number }) {
  return (
    <div className="vl-lockup">
      <VeloraLogo size={size} />
      <div className="vl-lockup-text">
        <strong>{APP_NAME}</strong>
        <span>v{APP_VERSION} · by <MezzttLink /></span>
      </div>
    </div>
  );
}

/** Firma para el pie del menú lateral: versión, "by Mezztt" e Instagram del sistema. */
export function SidebarSignature() {
  return (
    <div className="vl-signature">
      <VeloraLogo size={26} />
      <span className="vl-signature-text">
        <strong>{APP_NAME} v{APP_VERSION}</strong>
        <small>by <MezzttLink /></small>
      </span>
      <InstagramLink who="system" />
    </div>
  );
}

/** Pie del login y de las páginas legales: redes + enlaces legales. */
export function BrandFooter({ legal = true }: { legal?: boolean }) {
  return (
    <div className="vl-brandfoot">
      <div className="vl-brandfoot-row">
        <span>Seguinos</span>
        <InstagramLink who="system" />
        <span className="vl-brandfoot-sep" aria-hidden="true">·</span>
        <span>by <MezzttLink /></span>
        <InstagramLink who="mezztt" />
      </div>
      {legal && (
        <div className="vl-brandfoot-row">
          <a className="vl-brand-link" href="/legal/terminos">Términos</a>
          <span className="vl-brandfoot-sep" aria-hidden="true">·</span>
          <a className="vl-brand-link" href="/legal/privacidad">Privacidad</a>
        </div>
      )}
    </div>
  );
}
