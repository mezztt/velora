import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { API_URL, storeApi } from "../store/api";

type Opts = { method?: string; body?: unknown };
const appApi = (path: string, options: Opts = {}) => storeApi<any>(path, { ...options, auth: true });
const publicApi = (path: string, options: Opts = {}) => storeApi<any>(path, options);
const adminApi = async (path: string, options: Opts = {}): Promise<any> => {
  const res = await fetch(`${API_URL}${path}`, {
    method: options.method || "GET",
    headers: { Authorization: `Bearer ${localStorage.getItem("velora_admin_token")}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof data.detail === "string" ? data.detail : "No se pudo completar la acción");
  return data;
};

/**
 * «Dar de baja el servicio» de Mezztt para la EMPRESA que contrató el sistema (Disposición 954/2025, art. 4).
 * - BajaCard: tarjeta de Configuración (la ve y la ejecuta el administrador).
 * - BajaLoginLink: enlace del pie del ingreso (sin sesión, con el email del administrador).
 * Confirma en dos pasos, muestra la constancia BAJA-AAAA-NNNN al instante (se copia o se imprime) y NO corta el acceso:
 * el sistema sigue hasta el final del período ya pagado. Mientras no venza, se puede retirar la baja.
 */
const CARD_CLASS = "dashboard-section";
const SECTION_STYLE = true;   // true: dashboard-section + section-heading · false: tarjeta con h2 propio

export interface BajaConstancia {
  id: number; code: string; status: string; source: string | null; already: boolean; company_name: string;
  requested_by: string | null; created_at: string | null; service_end_date: string | null;
  withdrawn_at: string | null; ended_at: string | null; detail: string;
}
interface BajaState { current: BajaConstancia | null; history: BajaConstancia[]; preview_end: string | null }

/** "2026-10-22T14:03:00" -> "22/10/2026". Las fechas llegan en hora de Argentina sin zona: no se convierten. */
export function fmtDate(iso?: string | null): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}
export function fmtDateTime(iso?: string | null): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso || "");
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}` : fmtDate(iso);
}

const STATUS_LABEL: Record<string, string> = {
  PENDIENTE: "Vigente", ATENDIDA: "Vigente", RETIRADA: "Retirada", EFECTIVA: "Efectiva", REACTIVADA: "Reactivada",
};

const CSS = `
.sc-danger{background:#b42318;color:#fff;border:0;border-radius:10px;padding:10px 16px;font-weight:600;cursor:pointer;font:inherit;font-weight:600}
.sc-danger:hover:not(:disabled){background:#912018}
.sc-danger:disabled{opacity:.6;cursor:default}
.sc-link{background:none;border:0;padding:0;font:inherit;color:inherit;text-decoration:underline;cursor:pointer}
.sc-login-link{font-size:13px;font-weight:600}
.sc-box{border:1px solid currentColor;border-radius:12px;padding:14px 16px;margin:12px 0}
.sc-box dl{margin:8px 0 0;display:grid;grid-template-columns:auto 1fr;gap:4px 14px}
.sc-box dt{font-weight:600}
.sc-box dd{margin:0;word-break:break-word}
.sc-code{font-size:1.35em;font-weight:700;letter-spacing:.02em}
.sc-error{color:#b42318;background:rgba(180,35,24,.08);border-radius:8px;padding:8px 12px;margin-top:8px}
[data-theme="dark"] .sc-error{color:#ffb4a8;background:rgba(255,180,168,.12)}
.sc-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:10px}
.sc-steps{font-size:.85em;font-weight:600;letter-spacing:.04em;text-transform:uppercase}
.sc-admin{list-style:none;margin:8px 0 0;padding:0}
.sc-admin li{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;padding:10px 0;border-top:1px solid rgba(128,128,128,.35)}
.sc-admin li:first-child{border-top:0}
.sc-admin .sc-main{flex:1;min-width:200px}
.sc-admin strong,.sc-admin small{display:block}
.sc-list{list-style:none;margin:10px 0 0;padding:0;display:grid;gap:6px}
@media print{
  body *{visibility:hidden !important}
  .sc-print,.sc-print *{visibility:visible !important}
  .sc-print{position:fixed;left:0;top:0;width:100%;padding:24px;background:#fff !important;color:#000 !important;border:0 !important}
  .sc-noprint{display:none !important}
}
`;

async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* sigue con el plan B */ }
  try {
    const t = document.createElement("textarea");
    t.value = text; t.style.position = "fixed"; t.style.opacity = "0";
    document.body.appendChild(t); t.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(t);
    return ok;
  } catch { return false; }
}

function constanciaText(c: BajaConstancia): string {
  return [
    "CONSTANCIA DE BAJA DEL SERVICIO",
    `Código: ${c.code}`,
    `Empresa: ${c.company_name}`,
    `Pedida el: ${fmtDateTime(c.created_at)} (hora de Argentina)`,
    c.service_end_date ? `El sistema funciona hasta: ${fmtDate(c.service_end_date)}` : "",
    c.requested_by ? `Pedida por: ${c.requested_by}` : "",
    "Después de esa fecha el sistema se desactiva; tus datos se conservan. Podés retirar la baja antes de esa fecha.",
  ].filter(Boolean).join("\n");
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Imprime solo la constancia (en una ventana aparte; si el navegador la bloquea, imprime la pantalla). */
function printConstancia(c: BajaConstancia) {
  const w = window.open("", "_blank", "width=720,height=860");
  if (!w) { window.print(); return; }
  const rows = [
    ["Empresa", c.company_name], ["Pedida el", `${fmtDateTime(c.created_at)} (hora de Argentina)`],
    c.service_end_date ? ["El sistema funciona hasta", fmtDate(c.service_end_date)] : null,
    c.requested_by ? ["Pedida por", c.requested_by] : null,
  ].filter((r): r is string[] => !!r).map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join("");
  w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Constancia ${esc(c.code)}</title>
<style>body{font-family:system-ui,Segoe UI,Arial,sans-serif;color:#000;padding:36px;max-width:640px;margin:auto}h1{font-size:20px;margin:0 0 4px}
.code{font-size:30px;font-weight:700;margin:10px 0 18px}table{border-collapse:collapse;width:100%}th{text-align:left;padding:6px 14px 6px 0;white-space:nowrap}td{padding:6px 0}
p,small{display:block;margin-top:16px;line-height:1.45}</style></head><body>
<h1>Constancia de baja del servicio</h1><div class="code">${esc(c.code)}</div><table>${rows}</table>
<p>Después de esa fecha el sistema se desactiva y los datos se conservan. La baja se puede retirar antes de esa fecha.</p>
<small>Mezztt · Disposición 954/2025 (Subsecretaría de Defensa del Consumidor y Lealtad Comercial)</small></body></html>`);
  w.document.close(); w.focus(); w.print();
}

function Dialog({ title, eyebrow, onClose, footer, children }: { title: string; eyebrow: string; onClose: () => void; footer: ReactNode; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="product-modal" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-header">
          <div><span className="dashboard-eyebrow">{eyebrow}</span><h2>{title}</h2></div>
          <button className="modal-close sc-noprint" onClick={onClose} aria-label="Cerrar">×</button>
        </div>
        <div className="product-form">{children}</div>
        <div className="modal-actions sc-noprint">{footer}</div>
      </div>
    </div>
  );
}

/** La constancia: código, empresa, fecha y hora, y hasta cuándo funciona el sistema. Se copia o se imprime. */
export function BajaConstanciaView({ c }: { c: BajaConstancia }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <div className="sc-box sc-print">
        <strong>Constancia de baja del servicio</strong>
        <div className="sc-code">{c.code}</div>
        <dl>
          <dt>Empresa</dt><dd>{c.company_name}</dd>
          <dt>Pedida el</dt><dd>{fmtDateTime(c.created_at)} (hora de Argentina)</dd>
          {c.service_end_date && <><dt>Funciona hasta</dt><dd>{fmtDate(c.service_end_date)}</dd></>}
          {c.requested_by && <><dt>Pedida por</dt><dd>{c.requested_by}</dd></>}
        </dl>
        <p style={{ marginTop: 10 }}>Después de esa fecha el sistema se desactiva y tus datos se conservan. Podés retirar la baja antes.</p>
        <small>Mezztt · Disposición 954/2025</small>
      </div>
      <div className="sc-row sc-noprint">
        <button type="button" className="secondary-button" onClick={async () => { setCopied(await copyText(constanciaText(c))); setTimeout(() => setCopied(false), 2500); }}>{copied ? "Copiada" : "Copiar"}</button>
        <button type="button" className="secondary-button" onClick={() => printConstancia(c)}>Imprimir</button>
      </div>
    </div>
  );
}

/** Flujo en dos pasos. mode "public": pide el email del administrador (pie del ingreso). */
function BajaFlow({ mode, preview, onClose, onDone }: { mode: "app" | "public"; preview?: string | null; onClose: () => void; onDone?: (c: BajaConstancia) => void }) {
  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<BajaConstancia | null>(null);

  async function send() {
    setSaving(true); setError("");
    try {
      const body = mode === "public" ? { confirm: true, email: email.trim() } : { confirm: true };
      const c = mode === "public"
        ? await publicApi("/public/cancellation-request", { method: "POST", body })
        : await appApi("/cancellation-request", { method: "POST", body });
      setDone(c as BajaConstancia);
      onDone?.(c as BajaConstancia);
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo registrar la baja"); } finally { setSaving(false); }
  }

  if (done) {
    return (
      <Dialog eyebrow="BAJA DEL SERVICIO" title={done.already ? "Ya tenías la baja pedida" : "Baja registrada"} onClose={onClose}
        footer={<button type="button" className="primary-button" onClick={onClose}>Listo</button>}>
        <p>{done.already ? "Esta es la constancia de la baja que ya estaba pedida." : "Listo, registramos tu baja. El sistema sigue funcionando hasta el final del período que ya pagaste."} Guardá este comprobante.</p>
        <BajaConstanciaView c={done} />
      </Dialog>
    );
  }
  const canContinue = mode === "app" || /\S+@\S+\.\S+/.test(email.trim());
  return (
    <Dialog eyebrow="BAJA DEL SERVICIO" title="Dar de baja el servicio" onClose={onClose}
      footer={step === 1
        ? <><button type="button" className="secondary-button" onClick={onClose}>Volver</button>
            <button type="button" className="sc-danger" disabled={!canContinue} onClick={() => setStep(2)}>Continuar</button></>
        : <><button type="button" className="secondary-button" onClick={() => setStep(1)} disabled={saving}>No, volver</button>
            <button type="button" className="sc-danger" onClick={send} disabled={saving}>{saving ? "Registrando..." : "Sí, dar de baja el servicio"}</button></>}>
      <span className="sc-steps">Paso {step} de 2</span>
      {step === 1 ? (
        <>
          <p>Podés darte de baja cuando quieras, sin dar motivos ni hacer trámites (Disposición 954/2025, Defensa del Consumidor).</p>
          <p>El sistema <strong>no se corta ahora</strong>: sigue funcionando hasta el final del período que ya pagaste. Después no se te cobra más y tus datos se conservan.</p>
          {mode === "public" && (
            <div className="form-group">
              <label htmlFor="sc-email">Email del administrador</label>
              <input id="sc-email" type="email" autoComplete="username" placeholder="tu@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          )}
        </>
      ) : (
        <>
          <p><strong>¿Confirmás la baja?</strong> Se registra ahora mismo y te damos la constancia con fecha, hora y código.</p>
          {preview && <p>Vas a poder usar el sistema hasta el <strong>{fmtDate(preview)}</strong>. Antes de esa fecha podés retirar la baja.</p>}
          {!preview && <p>Vas a poder usar el sistema hasta el final del período pagado. Antes de esa fecha podés retirar la baja.</p>}
        </>
      )}
      {error && <div className="sc-error" role="alert">{error}</div>}
    </Dialog>
  );
}

/** Tarjeta de Configuración: botón visible «Dar de baja el servicio», o el estado de la baja vigente con «Retirar la baja». */
export function BajaCard() {
  const [state, setState] = useState<BajaState | null>(null);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<BajaConstancia | null>(null);
  const [askWithdraw, setAskWithdraw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    appApi("/cancellation-request").then((s: BajaState) => setState(s)).catch((e: unknown) => setError(e instanceof Error ? e.message : "No se pudo cargar"));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function withdraw() {
    setBusy(true); setError("");
    try { await appApi("/cancellation-request/withdraw", { method: "POST" }); setAskWithdraw(false); load(); }
    catch (e) { setError(e instanceof Error ? e.message : "No se pudo retirar la baja"); } finally { setBusy(false); }
  }

  const cur = state?.current || null;
  const head = (t: string) => SECTION_STYLE ? <div className="section-heading"><h2>{t}</h2></div> : <h2>{t}</h2>;
  return (
    <div className={CARD_CLASS} data-tour="baja-servicio">
      <style>{CSS}</style>
      {head("Dar de baja el servicio")}
      {cur ? (
        <>
          <p><strong>Baja solicitada · hasta {fmtDate(cur.service_end_date)}</strong></p>
          <p>El sistema sigue funcionando hasta esa fecha, el final del período que ya pagaste. Después se desactiva (los datos se conservan) y no se te cobra más.</p>
          <div className="sc-row">
            <button type="button" className="secondary-button" onClick={() => setView(cur)}>Ver constancia {cur.code}</button>
            {!askWithdraw
              ? <button type="button" className="secondary-button" onClick={() => setAskWithdraw(true)}>Retirar la baja</button>
              : <><span>¿Retirás la baja?</span>
                  <button type="button" className="primary-button" onClick={withdraw} disabled={busy}>{busy ? "Retirando..." : "Sí, retirar"}</button>
                  <button type="button" className="secondary-button" onClick={() => setAskWithdraw(false)} disabled={busy}>No</button></>}
          </div>
        </>
      ) : (
        <>
          <p>Podés darte de baja cuando quieras, sin dar motivos (Disposición 954/2025, Defensa del Consumidor). El sistema sigue funcionando hasta el final del período que ya pagaste.</p>
          <div className="sc-row"><button type="button" className="sc-danger" onClick={() => setOpen(true)} disabled={!state}>Dar de baja el servicio</button></div>
        </>
      )}
      {error && <div className="sc-error" role="alert">{error}</div>}
      {state && state.history.length > 0 && (
        <ul className="sc-list">
          {state.history.map((h) => (
            <li key={h.id}><button type="button" className="sc-link" onClick={() => setView(h)}>{h.code}</button> · {fmtDateTime(h.created_at)} · {STATUS_LABEL[h.status] || h.status}</li>
          ))}
        </ul>
      )}
      {open && <BajaFlow mode="app" preview={state?.preview_end} onClose={() => { setOpen(false); load(); }} onDone={() => load()} />}
      {view && (
        <Dialog eyebrow="BAJA DEL SERVICIO" title="Constancia" onClose={() => setView(null)} footer={<button type="button" className="primary-button" onClick={() => setView(null)}>Cerrar</button>}>
          <BajaConstanciaView c={view} />
        </Dialog>
      )}
    </div>
  );
}

/** Enlace del pie del ingreso (visible sin sesión). */
export function BajaLoginLink({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <style>{CSS}</style>
      <button type="button" className={className || "sc-link"} onClick={() => setOpen(true)}>Dar de baja el servicio</button>
      {open && <BajaFlow mode="public" onClose={() => setOpen(false)} />}
    </>
  );
}

interface AdminBaja {
  id: number; company_id: number; company_name: string; code: string; status: string; source: string | null; requested_by: string | null;
  created_at: string | null; service_end_date: string | null; withdrawn_at: string | null; ended_at: string | null;
}

/** Panel de Mezztt: bajas del servicio pedidas por las empresas. Las nuevas quedan «pendientes» hasta que las marcás como vistas;
 *  siguen funcionando hasta service_end_date y después pasan a inactivas solas. */
export function AdminBajas() {
  const [rows, setRows] = useState<AdminBaja[]>([]);
  const [error, setError] = useState("");
  const load = useCallback(() => { adminApi("/admin/cancellations").then((r: AdminBaja[]) => setRows(r)).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);
  async function attend(id: number) {
    try { await adminApi(`/admin/cancellations/${id}/attend`, { method: "POST" }); load(); }
    catch (e) { setError(e instanceof Error ? e.message : "No se pudo marcar"); }
  }
  const pending = rows.filter((r) => r.status === "PENDIENTE");
  const scheduled = rows.filter((r) => r.status === "ATENDIDA" && r.service_end_date);
  if (!pending.length && !scheduled.length) return null;
  const line = (b: AdminBaja) => `${fmtDateTime(b.created_at)}${b.service_end_date ? ` · funciona hasta ${fmtDate(b.service_end_date)}` : ""} · desde ${b.source === "LOGIN" ? "el ingreso" : "el panel"}${b.requested_by ? ` · ${b.requested_by}` : ""}`;
  return (
    <div className="dashboard-section" data-tour="admin-bajas">
      <style>{CSS}</style>
      {pending.length > 0 && (
        <>
          <div className="section-heading"><h2>Pedidos de baja pendientes ({pending.length})</h2><p>Disposición 954/2025: ya tienen su constancia. Siguen hasta el fin del período pagado y después pasan a inactivos solos.</p></div>
          <ul className="sc-admin">
            {pending.map((b) => (
              <li key={b.id}>
                <div className="sc-main"><strong>{b.company_name} · {b.code}</strong><small>{line(b)}</small></div>
                <button type="button" className="secondary-button" onClick={() => attend(b.id)}>Marcar visto</button>
              </li>
            ))}
          </ul>
        </>
      )}
      {scheduled.length > 0 && (
        <>
          <div className="section-heading" style={pending.length ? { marginTop: 16 } : undefined}><h2>Bajas programadas ({scheduled.length})</h2><p>Siguen funcionando hasta la fecha indicada.</p></div>
          <ul className="sc-admin">
            {scheduled.map((b) => (<li key={b.id}><div className="sc-main"><strong>{b.company_name} · {b.code}</strong><small>{line(b)}</small></div></li>))}
          </ul>
        </>
      )}
      {error && <div className="sc-error" role="alert">{error}</div>}
    </div>
  );
}
