import { useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { storeApi } from "./api";
import type { StoreLegal, StorePolicies, WithdrawalReceipt } from "./api";
import { InstagramLink, MezzttLink, VeloraLogo } from "../components/Brand";

/** Formulario oficial de reclamos de Defensa del Consumidor. */
export const CONSUMER_CLAIMS_URL = "https://www.argentina.gob.ar/produccion/defensadelconsumidor/formulario";

/**
 * La tienda pública tiene su propio diseño: mientras está abierta, se desactiva el
 * modo oscuro del panel de Velora (si el dueño lo usa) para que no se mezclen estilos.
 */
export function useStoreTheme() {
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.getAttribute("data-theme");
    root.setAttribute("data-theme", "store");
    document.body.classList.add("st-body");
    return () => {
      if (previous) root.setAttribute("data-theme", previous); else root.removeAttribute("data-theme");
      document.body.classList.remove("st-body");
    };
  }, []);
}

function useEscapeKey(fn: () => void) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") fn(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [fn]);
}

/** Ventana simple de texto (políticas, arrepentimiento). Va por encima del carrito. */
export function StoreSheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEscapeKey(onClose);
  return (
    <div className="st-overlay st-overlay-top" onClick={(e) => { e.stopPropagation(); onClose(); }}>
      <div className="st-sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="st-sheet-head">
          <h3>{title}</h3>
          <button type="button" className="st-close st-close-inline" onClick={onClose} aria-label="Cerrar">×</button>
        </div>
        <div className="st-sheet-body">{children}</div>
      </div>
    </div>
  );
}

export type PolicyKind = "returns" | "shipping";
const POLICY_TITLE: Record<PolicyKind, string> = { returns: "Cambios y devoluciones", shipping: "Envíos" };

/** Política del negocio (texto libre que carga el dueño, o el sugerido). */
export function PolicySheet({ kind, policies, storeName, onClose, onWithdraw }: {
  kind: PolicyKind; policies: StorePolicies; storeName: string; onClose: () => void; onWithdraw?: () => void;
}) {
  return (
    <StoreSheet title={POLICY_TITLE[kind]} onClose={onClose}>
      <p className="st-sheet-by">Política de {storeName}</p>
      <div className="st-policy-text">
        {policies[kind].split(/\n+/).filter((line) => line.trim()).map((line, i) => <p key={i}>{line}</p>)}
      </div>
      {kind === "returns" && onWithdraw && (
        <p className="st-sheet-note">
          ¿Querés dejar sin efecto una compra? Usá el{" "}
          <button type="button" className="st-link" onClick={onWithdraw}>Botón de arrepentimiento</button>.
        </p>
      )}
    </StoreSheet>
  );
}

/**
 * Botón de arrepentimiento (Disposición 954/2025 · Ley 24.240 art. 34): formulario simple, sin
 * registro. Al enviarlo muestra al instante el código de trámite.
 */
export function WithdrawalSheet({ slug, storeName, orderCode, days = 10, onClose }: {
  slug: string; storeName: string; orderCode?: string; days?: number; onClose: () => void;
}) {
  const [form, setForm] = useState({ order_code: orderCode || "", name: "", contact: "", reason: "" });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<WithdrawalReceipt | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!form.order_code.trim() && !(form.name.trim() && form.contact.trim())) {
      setError("Escribí el código de tu pedido, o tu nombre y un teléfono o email.");
      return;
    }
    setSending(true);
    try {
      const res = await storeApi<WithdrawalReceipt>(`/public/store/${encodeURIComponent(slug)}/withdrawals`, {
        method: "POST",
        body: {
          order_code: form.order_code.trim() || null,
          name: form.name.trim() || null,
          contact: form.contact.trim() || null,
          reason: form.reason.trim() || null,
        },
      });
      setDone(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo enviar la solicitud. Probá de nuevo.");
    } finally {
      setSending(false);
    }
  }

  if (done) {
    return (
      <StoreSheet title="Solicitud recibida" onClose={onClose}>
        <div className="st-withdraw-done" role="status">
          <p>{done.already ? "Ya teníamos registrada tu solicitud por este pedido." : `${storeName} recibió tu pedido de arrepentimiento.`}</p>
          <div className="st-withdraw-code">
            <small>Código de trámite</small>
            <strong>{done.code}</strong>
          </div>
          <p className="st-sheet-note">
            Guardá este código (podés sacarle una captura). {storeName} se va a comunicar con vos para coordinar la
            devolución, sin costo para vos.
          </p>
          <button type="button" className="st-btn st-btn-accent st-btn-block" onClick={onClose}>Listo</button>
        </div>
      </StoreSheet>
    );
  }

  return (
    <StoreSheet title="Botón de arrepentimiento" onClose={onClose}>
      <p className="st-sheet-lead">
        Tenés <strong>{days} días corridos</strong> desde que recibiste el producto (o desde que hiciste la compra, lo
        que pase último) para arrepentirte y dejarla sin efecto, <strong>sin costo y sin dar explicaciones</strong>.
      </p>
      <form onSubmit={submit} className="st-withdraw-form" noValidate>
        <div className="st-field">
          <label htmlFor="st-w-code">Código de pedido</label>
          <input id="st-w-code" value={form.order_code} maxLength={20} autoCapitalize="characters" placeholder="Ej: K7M2QX"
            onChange={(e) => setForm({ ...form, order_code: e.target.value.toUpperCase() })} />
        </div>
        <p className="st-withdraw-or">Si no tenés el código, completá tu nombre y un contacto:</p>
        <div className="st-field-row">
          <div className="st-field">
            <label htmlFor="st-w-name">Nombre y apellido</label>
            <input id="st-w-name" value={form.name} maxLength={150} autoComplete="name" onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="st-field">
            <label htmlFor="st-w-contact">Celular o email</label>
            <input id="st-w-contact" value={form.contact} maxLength={255} onChange={(e) => setForm({ ...form, contact: e.target.value })} />
          </div>
        </div>
        <div className="st-field">
          <label htmlFor="st-w-reason">Motivo <span>(opcional)</span></label>
          <textarea id="st-w-reason" rows={2} value={form.reason} maxLength={1000} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
        </div>
        {error && <div className="st-note st-note-error" role="alert">{error}</div>}
        <button type="submit" className="st-btn st-btn-accent st-btn-block" disabled={sending}>
          {sending ? "Enviando…" : "Enviar solicitud"}
        </button>
        <p className="st-sheet-note">
          No hace falta registrarse. El arrepentimiento no se aplica a productos perecederos ni a los hechos a medida
          o personalizados para vos.
        </p>
      </form>
    </StoreSheet>
  );
}

/** Datos del vendedor (razón social, CUIT, domicilio y contacto). */
export function SellerInfo({ legal, compact }: { legal?: StoreLegal; compact?: boolean }) {
  if (!legal) return null;
  const contact = [legal.phone, legal.email].filter(Boolean).join(" · ");
  if (!legal.name && !legal.cuit && !legal.address && !contact) return null;
  return (
    <div className={`st-seller ${compact ? "is-compact" : ""}`}>
      <small>Vendedor</small>
      {legal.name && <strong>{legal.name}</strong>}
      {legal.cuit && <span>CUIT {legal.cuit}</span>}
      {legal.address && <span>{legal.address}</span>}
      {contact && <span>{contact}</span>}
    </div>
  );
}

export function StoreFooter({ name, slug, legal, policies, withdrawal = true, withdrawalDays, orderCode }: {
  name: string;
  slug?: string;
  legal?: StoreLegal;
  policies?: StorePolicies;
  /** las tiendas que venden online muestran el Botón de arrepentimiento */
  withdrawal?: boolean;
  withdrawalDays?: number;
  orderCode?: string;
}) {
  const [policy, setPolicy] = useState<PolicyKind | null>(null);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const canWithdraw = withdrawal && !!slug;

  return (
    <footer className="st-footer">
      <div className="st-wrap">
        <div className="st-footer-main">
          <div className="st-footer-col">
            <SellerInfo legal={legal} />
            {!legal && <strong className="st-footer-name">{name}</strong>}
          </div>

          <nav className="st-footer-col st-footer-links" aria-label="Información legal">
            {policies && <button type="button" className="st-foot-link" onClick={() => setPolicy("returns")}>Cambios y devoluciones</button>}
            {policies && <button type="button" className="st-foot-link" onClick={() => setPolicy("shipping")}>Envíos</button>}
            <a className="st-foot-link" href="/legal/privacidad" target="_blank" rel="noopener noreferrer">Privacidad</a>
            <a className="st-foot-link" href="/legal/terminos" target="_blank" rel="noopener noreferrer">Términos</a>
          </nav>

          <div className="st-footer-col st-footer-consumer">
            {canWithdraw && (
              <button type="button" className="st-withdraw-btn" onClick={() => setWithdrawOpen(true)}>
                Botón de arrepentimiento
              </button>
            )}
            <p>
              Defensa de las y los consumidores. Para reclamos{" "}
              <a href={CONSUMER_CLAIMS_URL} target="_blank" rel="noopener noreferrer">ingresá aquí</a>.
            </p>
          </div>
        </div>

        <div className="st-footer-in">
          <span>© {new Date().getFullYear()} {name}</span>
          <span className="st-powered">
            <VeloraLogo size={16} title="" />
            Hecho con Velora · by <MezzttLink />
            <InstagramLink who="system" />
            <InstagramLink who="mezztt" />
          </span>
        </div>
      </div>

      {policy && policies && (
        <PolicySheet
          kind={policy}
          policies={policies}
          storeName={name}
          onClose={() => setPolicy(null)}
          onWithdraw={canWithdraw ? () => { setPolicy(null); setWithdrawOpen(true); } : undefined}
        />
      )}
      {withdrawOpen && slug && (
        <WithdrawalSheet slug={slug} storeName={name} orderCode={orderCode} days={withdrawalDays} onClose={() => setWithdrawOpen(false)} />
      )}
    </footer>
  );
}

export function StoreState({ loading, title, text }: { loading?: boolean; title?: string; text?: string }) {
  useStoreTheme();
  return (
    <div className="st-root st-state">
      {loading ? (
        <div className="st-state-box" role="status">
          <div className="st-spinner" />
          <span>Cargando la tienda…</span>
        </div>
      ) : (
        <div className="st-state-box">
          <strong>{title}</strong>
          <p>{text}</p>
        </div>
      )}
    </div>
  );
}
