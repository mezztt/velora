import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

// Pantalla de una cotización del panel: precio del POS y del pago único, envío por mail, edición después de enviada,
// aceptar (crea el sistema con el mail de la solicitud y una clave de 6 dígitos, y le manda la bienvenida) o rechazar.
// Igual en todos los sistemas; lo propio de cada uno (lista de módulos, formato de importes) llega por props.

type Api = <T = any>(path: string, options?: { method?: string; body?: unknown }) => Promise<T>;
export type ModulesCtx = { value: string[]; onChange: (v: string[]) => void; quote: any; extra: string; setExtra: (v: string) => void };

type Props = {
  quote: any;
  api: Api;
  fmt: (n: any) => string;
  brandName: string;
  renderModules: (c: ModulesCtx) => ReactNode;
  labelOf: (moduleId: string, quote: any) => string;
  onClose: () => void;
  onChanged: () => void | Promise<void>;
  onDelete?: (id: number) => void;
};

const ESTADO: Record<string, string> = { BORRADOR: "Nueva", ENVIADA: "Enviada", ACEPTADA: "Aceptada", RECHAZADA: "Rechazada" };
const COLOR: Record<string, string> = { BORRADOR: "#8a6d1d", ENVIADA: "#1f5fa8", ACEPTADA: "#1d7a46", RECHAZADA: "#a33a3a" };

const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const num = (v: string) => { const n = Number(String(v).replace(",", ".")); return Number.isFinite(n) && n > 0 ? n : 0; };
const list = (s?: string | null) => String(s || "").split(",").map((x) => x.trim()).filter(Boolean);
const dayInput = (d?: string | null) => (d ? String(d).slice(0, 10) : "");

function tags(notes?: string | null) {
  const n = String(notes || "");
  return { uso: ((n.match(/Forma de uso: ([^·]+)/) || [])[1] || "").trim(), pos: ((n.match(/POS: ([^·]+)/) || [])[1] || "").trim() };
}

export default function QuoteFlowModal({ quote, api, fmt, brandName, renderModules, labelOf, onClose, onChanged, onDelete }: Props) {
  const [q, setQ] = useState<any>(quote);
  const st: string = q.status;
  const editable = st === "BORRADOR" || st === "ENVIADA";
  const tg = tags(q.notes);

  const [modules, setModules] = useState<string[]>(list(q.modules));
  const [extra, setExtra] = useState<string>(q.extra_type || "");
  const [iva, setIva] = useState<boolean>(!!q.apply_iva);
  const [usage, setUsage] = useState<string>(q.usage || "mensual");
  const [withPos, setWithPos] = useState<boolean>(!!(q.pos_desc || Number(q.pos_price) > 0 || tg.pos));
  const [posDesc, setPosDesc] = useState<string>(q.pos_desc || tg.pos || "");
  const [posPrice, setPosPrice] = useState<string>(Number(q.pos_price) ? String(Number(q.pos_price)) : "");
  const [onePrice, setOnePrice] = useState<string>(Number(q.one_time_price) ? String(Number(q.one_time_price)) : "");
  const [delivery, setDelivery] = useState<string>(dayInput(q.delivery_date));
  const [notes, setNotes] = useState<string>(q.notes || "");
  const [calc, setCalc] = useState<any>(null);
  const [busy, setBusy] = useState<string>("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [welcome, setWelcome] = useState<{ email: string; password: string; mail_enviado: boolean; mail_error: string; sin_modulos: boolean; local?: boolean; instalador?: { code: string; uninstall_key: string; link: string; ok: boolean; error: string } | null } | null>(null);
  const seq = useRef(0);

  function body() {
    return {
      modules, apply_iva: iva, usage,
      pos_price: withPos ? num(posPrice) : 0,
      pos_desc: withPos ? posDesc.trim() || null : null,
      one_time_price: usage === "pago_unico" ? num(onePrice) : 0,
      delivery_date: delivery ? `${delivery}T00:00:00` : null,
      notes: notes.trim() || null,
      ...(extra ? { extra_type: extra } : {}),
    };
  }

  // vista previa con el cálculo real del servidor (no guarda nada)
  useEffect(() => {
    if (!editable) return;
    const mine = ++seq.current;
    const t = setTimeout(() => {
      api(`/admin/quotes/${q.id}/propuesta/calcular`, { method: "POST", body: body() })
        .then((r) => { if (mine === seq.current) setCalc(r); })
        .catch(() => { if (mine === seq.current) setCalc(null); });
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line
  }, [modules, extra, iva, usage, withPos, posDesc, posPrice, onePrice]);

  async function guardar(silencioso = false): Promise<any> {
    const r = await api(`/admin/quotes/${q.id}/propuesta`, { method: "PUT", body: body() });
    setQ(r);
    await onChanged();
    if (!silencioso) setMsg({ ok: true, text: "Cambios guardados." });
    return r;
  }

  function html(d: any): string {
    const pos = Number(d.pos_price || 0), uno = Number(d.one_time_price || 0), sub = Number(d.subtotal || 0), iv = Number(d.iva_amount || 0);
    const unico = d.usage === "pago_unico";
    const th = "padding:8px;border:1px solid #ccc;background:#f4f4f4;text-align:left;font-size:12px";
    const td = "padding:8px;border:1px solid #ccc;font-size:13px";
    const tr = (a: string, b: string) => `<tr><td style="${td}">${a}</td><td style="${td};text-align:right;white-space:nowrap">${b}</td></tr>`;
    const mods = list(d.modules).map((m) => esc(labelOf(m, d)));
    const filas: string[] = [];
    if (unico) filas.push(tr("Sistema completo · pago único (sin abono mensual)", fmt(uno)));
    else filas.push(tr("Sistema: configuración inicial y módulos", fmt(sub - pos)));
    if (pos > 0) filas.push(tr(`Punto de venta (POS)${d.pos_desc ? ": " + esc(d.pos_desc) : ""}`, fmt(pos)));
    const totales = unico
      ? `<p style="margin:4px 0">Subtotal: ${fmt(sub)}</p>${d.apply_iva ? `<p style="margin:4px 0">IVA 21%: ${fmt(iv)}</p>` : ""}<p style="margin:8px 0;font-size:16px"><b>Total en un solo pago: ${fmt(d.total)}</b></p>`
      : `<p style="margin:10px 0 2px;font-size:11px;letter-spacing:.6px;text-transform:uppercase;color:#666">Pago inicial (una sola vez)</p>
         <p style="margin:4px 0">Subtotal: ${fmt(sub)}</p>${d.apply_iva ? `<p style="margin:4px 0">IVA 21%: ${fmt(iv)}</p>` : ""}<p style="margin:4px 0"><b>Total pago inicial: ${fmt(d.total)}</b></p>
         <p style="margin:12px 0 2px;font-size:11px;letter-spacing:.6px;text-transform:uppercase;color:#666">Abono mensual (desde el segundo mes)</p>
         <p style="margin:4px 0">Subtotal: ${fmt(d.monthly_subtotal)}</p>${d.apply_iva ? `<p style="margin:4px 0">IVA 21%: ${fmt(d.monthly_iva)}</p>` : ""}<p style="margin:4px 0"><b>Total por mes: ${fmt(d.monthly_total)}</b></p>`;
    const mail = !!d.__mail;       // en el mail, el título y el pie los pone el marco del sistema
    return `<div style="${mail ? "" : "font-family:Arial,sans-serif;max-width:680px;margin:auto;padding:24px;"}color:#222">
      ${mail ? "" : `<h1 style="font-size:22px;margin:0 0 2px">${esc(brandName)} · Cotización</h1>`}
      <p style="margin:0 0 18px;color:#666;font-size:12px">N° #${d.id} · ${new Date().toLocaleDateString("es-AR")}</p>
      <p style="margin:4px 0;font-size:13px"><b>Cliente:</b> ${esc(d.client_name)}</p>
      <p style="margin:4px 0;font-size:13px"><b>Negocio:</b> ${esc(d.business_name)}</p>
      ${mods.length ? `<p style="margin:12px 0 4px;font-size:13px"><b>Incluye los módulos:</b> ${mods.join(", ")}</p>` : ""}
      ${unico ? `<p style="margin:4px 0;font-size:13px"><b>Forma de uso:</b> un solo pago, en una única PC (datos locales, sin internet)</p>` : `<p style="margin:4px 0;font-size:13px"><b>Forma de uso:</b> mensual, en la nube (web y app conectadas)</p>`}
      <table style="width:100%;border-collapse:collapse;margin-top:16px"><tr><th style="${th}">Concepto</th><th style="${th};text-align:right">Importe</th></tr>${filas.join("")}</table>
      <div style="margin-top:14px;text-align:right">${totales}</div>
      <p style="margin-top:24px;padding-top:10px;border-top:1px solid #ccc;font-size:11px;color:#666;text-align:center">Documento no válido como factura${mail ? "<br>Para aceptar la cotización o hacer cambios, respondé este mail." : ` · ${esc(brandName)} by Mezztt`}</p></div>`;
  }

  function imprimir(d: any) {
    const w = window.open("", "_blank");
    if (!w) { alert("Habilitá las ventanas emergentes."); return; }
    w.document.write(`<html><head><title>Cotización #${d.id}</title></head><body>${html(d)}</body></html>`);
    w.document.close(); w.focus(); w.print();
  }

  async function run(name: string, fn: () => Promise<void>) {
    setBusy(name); setMsg(null);
    try { await fn(); } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "No se pudo completar la acción." }); } finally { setBusy(""); }
  }

  function enviar() {
    if (!(q.email || "").trim()) { setMsg({ ok: false, text: "La cotización no tiene mail del cliente. Escribí uno en el mensaje o creá otra cotización." }); return; }
    run("enviar", async () => {
      const d = await guardar(true);
      if (Number(d.total) <= 0 && !confirm("El total de la cotización es 0. ¿Enviarla igual?")) return;
      const doc = { ...d, __mail: true };
      const r = await api(`/admin/quotes/${d.id}/enviar`, {
        method: "POST",
        body: { subject: `Cotización ${brandName} #${d.id} · ${d.business_name}`, html: html(doc), plain: `Cotización ${brandName} #${d.id} para ${d.business_name}. Total: ${fmt(d.total)}.` },
      });
      setQ(r); await onChanged();
      setMsg({ ok: true, text: `Cotización enviada a ${r.email}.` });
    });
  }

  function aceptar() {
    if (!confirm(`Se va a crear el sistema de «${q.business_name}» con el mail ${q.email || "(sin mail)"} y una contraseña de 6 dígitos al azar, y se le envía un mail de bienvenida. ¿Aceptar la cotización?`)) return;
    run("aceptar", async () => {
      const r = await api(`/admin/quotes/${q.id}/aceptar`, { method: "POST" });
      setQ(r.quote); await onChanged();
      setWelcome({ email: r.email, password: r.password, mail_enviado: r.mail_enviado, mail_error: r.mail_error, sin_modulos: r.sin_modulos, local: usage === "pago_unico", instalador: r.instalador });
    });
  }

  function rechazar() {
    if (!confirm("¿Marcar esta cotización como rechazada? Pasa a la pestaña «Rechazadas».")) return;
    run("rechazar", async () => { const r = await api(`/admin/quotes/${q.id}/rechazar`, { method: "POST" }); setQ(r); await onChanged(); setMsg({ ok: true, text: "Cotización rechazada." }); });
  }

  function reabrir() {
    run("reabrir", async () => { const r = await api(`/admin/quotes/${q.id}/reabrir`, { method: "POST" }); setQ(r); await onChanged(); setMsg({ ok: true, text: "Cotización reabierta." }); });
  }

  function reenviarAccesos() {
    if (!confirm("Se genera una contraseña nueva (la anterior deja de servir) y se envía por mail al cliente. ¿Continuar?")) return;
    run("accesos", async () => {
      const r = await api(`/admin/quotes/${q.id}/accesos`, { method: "POST", body: { enviar: true } });
      setWelcome({ email: r.email, password: r.password, mail_enviado: true, mail_error: "", sin_modulos: false, local: usage === "pago_unico", instalador: r.instalador });
    });
  }

  const shown = calc && editable ? calc : q;
  const unico = usage === "pago_unico";
  const input = { width: "100%" } as const;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="product-modal" onClick={(e) => e.stopPropagation()} style={{ maxHeight: "92vh", overflowY: "auto" }}>
        <div className="modal-header">
          <div>
            <span className="dashboard-eyebrow">COTIZACIÓN #{q.id} · <span style={{ color: COLOR[st] || "inherit", fontWeight: 700 }}>{ESTADO[st] || st}</span></span>
            <h2>{q.business_name}</h2>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="product-form">
          <div className="form-group"><label>Cliente</label><p>{q.client_name}{q.email ? ` — ${q.email}` : " — (sin mail)"}{q.phone ? ` — ${q.phone}` : ""}</p></div>
          {q.sent_at && <p className="dp-muted" style={{ fontSize: 12, margin: 0 }}>Última vez enviada: {new Date(q.sent_at).toLocaleString("es-AR")}</p>}
          {tg.uso && <div className="form-group"><label>Lo que pidió el cliente</label><p>{tg.uso}{tg.pos ? ` · POS: ${tg.pos}` : ""}</p></div>}

          {st === "ACEPTADA" && (
            <div className="form-group">
              <p style={{ margin: 0 }}><b>Sistema creado</b>{q.company_id ? ` (n.º ${q.company_id})` : ""}. Usuario: {q.email}. La contraseña se mostró al aceptar; si hace falta, generá una nueva y se la enviamos.</p>
              <div style={{ marginTop: 8 }}><button className="secondary-button" disabled={!!busy} onClick={reenviarAccesos}>{busy === "accesos" ? "Enviando…" : "Enviar accesos nuevos al cliente"}</button></div>
            </div>
          )}
          {st === "RECHAZADA" && <p style={{ margin: 0 }}>Esta cotización fue rechazada{q.decided_at ? ` el ${new Date(q.decided_at).toLocaleDateString("es-AR")}` : ""}. Si el cliente cambió de idea, reabrila para editarla y enviarla de nuevo.</p>}

          {editable ? (
            <>
              <div className="form-group">
                <label>Módulos</label>
                {renderModules({ value: modules, onChange: setModules, quote: q, extra, setExtra })}
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Forma de uso</label>
                  <select value={usage} onChange={(e) => setUsage(e.target.value)} style={input}>
                    <option value="mensual">Mensual, en la nube</option>
                    <option value="pago_unico">Un solo pago (una única PC)</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>IVA</label>
                  <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
                    <input type="checkbox" style={{ width: 14, height: 14 }} checked={iva} onChange={(e) => setIva(e.target.checked)} /> Aplicar IVA 21%
                  </label>
                </div>
              </div>
              {unico && (
                <div className="form-group">
                  <label>Valor total del sistema en un solo pago</label>
                  <input type="number" min="0" step="any" value={onePrice} onChange={(e) => setOnePrice(e.target.value)} placeholder="0" style={input} />
                </div>
              )}
              <div className="form-group">
                <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input type="checkbox" style={{ width: 14, height: 14 }} checked={withPos} onChange={(e) => setWithPos(e.target.checked)} /> Incluye POS (sistema + equipos)
                </label>
                {withPos && (
                  <div className="form-row" style={{ marginTop: 6 }}>
                    <div className="form-group"><label>Qué incluye el POS</label><input value={posDesc} maxLength={200} onChange={(e) => setPosDesc(e.target.value)} placeholder="Ej.: Kit mostrador, 1 puesto" style={input} /></div>
                    <div className="form-group"><label>Precio del POS</label><input type="number" min="0" step="any" value={posPrice} onChange={(e) => setPosPrice(e.target.value)} placeholder="0" style={input} /></div>
                  </div>
                )}
              </div>
              <div className="form-row">
                <div className="form-group"><label>Fecha de entrega (opcional)</label><input type="date" value={delivery} onChange={(e) => setDelivery(e.target.value)} style={input} /></div>
              </div>
              <div className="form-group"><label>Mensaje / notas</label><textarea rows={3} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} style={input} /></div>
            </>
          ) : (
            <div className="form-group"><label>Módulos</label><p>{list(q.modules).map((m) => labelOf(m, q)).join(", ") || "—"}</p></div>
          )}

          <div className="import-table-wrapper">
            <table className="import-table">
              <thead><tr><th></th><th>{(editable ? unico : q.usage === "pago_unico") ? "Total en un solo pago" : "Pago inicial (una vez)"}</th>{!(editable ? unico : q.usage === "pago_unico") && <th>Abono mensual</th>}</tr></thead>
              <tbody>
                <tr><td>{editable ? "Con lo que ves en pantalla" : "Cotizado"}</td><td><strong>{fmt(shown.total)}</strong></td>{!(editable ? unico : q.usage === "pago_unico") && <td><strong>{fmt(shown.monthly_total)}</strong></td>}</tr>
                {editable && <tr><td>Guardado</td><td>{fmt(q.total)}</td>{!unico && <td>{fmt(q.monthly_total)}</td>}</tr>}
              </tbody>
            </table>
          </div>
          {editable && <p className="dp-muted" style={{ fontSize: 11, margin: 0 }}>El cálculo se actualiza solo. Para que quede guardado, tocá «Guardar cambios» (o «{st === "ENVIADA" ? "Enviar de nuevo" : "Enviar por mail"}», que también guarda).</p>}

          {msg && <p style={{ margin: 0, fontSize: 13, color: msg.ok ? "#1d7a46" : "#b3261e" }}>{msg.text}</p>}

          <div className="modal-actions" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="secondary-button" onClick={() => imprimir(editable && calc ? { ...q, ...calc, usage, pos_price: withPos ? num(posPrice) : 0, pos_desc: withPos ? posDesc : "", one_time_price: unico ? num(onePrice) : 0, modules: modules.join(","), apply_iva: iva } : q)}>Imprimir</button>
              {st === "BORRADOR" && onDelete && <button className="product-action-delete" onClick={() => onDelete(q.id)}>Borrar</button>}
              {st === "RECHAZADA" && <button className="secondary-button" disabled={!!busy} onClick={reabrir}>Reabrir</button>}
            </div>
            {editable && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="secondary-button" disabled={!!busy} onClick={() => run("guardar", async () => { await guardar(); })}>{busy === "guardar" ? "Guardando…" : "Guardar cambios"}</button>
                <button className="primary-button" disabled={!!busy} onClick={enviar}>{busy === "enviar" ? "Enviando…" : st === "ENVIADA" ? "Enviar de nuevo por mail" : "Enviar por mail"}</button>
              </div>
            )}
          </div>
          {st === "ENVIADA" && (
            <div className="modal-actions" style={{ justifyContent: "flex-end", gap: 8, borderTop: "1px solid rgba(128,128,128,.25)", paddingTop: 10 }}>
              <span style={{ fontSize: 12, marginRight: "auto", opacity: 0.8 }}>¿Qué respondió el cliente?</span>
              <button className="product-action-delete" disabled={!!busy} onClick={rechazar}>Marcar rechazada</button>
              <button className="primary-button" disabled={!!busy} onClick={aceptar}>{busy === "aceptar" ? "Creando sistema…" : "Marcar aceptada y crear el sistema"}</button>
            </div>
          )}
        </div>
      </div>

      {welcome && (
        <div className="modal-overlay" onClick={(e) => { e.stopPropagation(); setWelcome(null); }} style={{ zIndex: 1100 }}>
          <div className="product-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
            <div className="modal-header"><div><span className="dashboard-eyebrow">SISTEMA CREADO</span><h2>Accesos del cliente</h2></div><button className="modal-close" onClick={() => setWelcome(null)}>×</button></div>
            <div className="product-form">
              <div className="form-group"><label>Usuario</label><p style={{ fontFamily: "monospace" }}>{welcome.email}</p></div>
              <div className="form-group"><label>Contraseña (solo se ve ahora)</label><p style={{ fontFamily: "monospace", fontSize: 22, letterSpacing: 2, margin: 0 }}>{welcome.password}</p></div>
              <button className="secondary-button" onClick={() => { try { navigator.clipboard.writeText(`Usuario: ${welcome.email}\nContraseña: ${welcome.password}`); } catch { /* sin portapapeles */ } }}>Copiar usuario y contraseña</button>
              {welcome.instalador && welcome.instalador.code && (
                <div className="form-group"><label>Instalador {welcome.local ? "local (pago único)" : "de la app"}</label>
                  <p style={{ fontFamily: "monospace", margin: 0 }}>Código: {welcome.instalador.code}</p>
                  <p style={{ fontFamily: "monospace", margin: 0 }}>Clave para desinstalar (solo se ve ahora): {welcome.instalador.uninstall_key}</p>
                  {!welcome.instalador.ok && <p style={{ margin: "6px 0 0", fontSize: 12, color: "#b3261e" }}>El mail salió sin link de descarga: {welcome.instalador.error}</p>}
                </div>)}
              {welcome.instalador && !welcome.instalador.code && <p style={{ margin: 0, fontSize: 12, color: "#b3261e" }}>No se pudo crear el instalador: {welcome.instalador.error}. Generalo desde «App de escritorio» en el sistema.</p>}
              {welcome.mail_enviado
                ? <p style={{ margin: 0, fontSize: 13, color: "#1d7a46" }}>Le enviamos el mail de bienvenida a {welcome.email} con {welcome.local ? "el instalador de la app local y cómo instalarla" : "el link de la web, el usuario, la contraseña, la app para la PC y cómo cambiar la contraseña"}.</p>
                : <p style={{ margin: 0, fontSize: 13, color: "#b3261e" }}>El sistema se creó, pero no se pudo enviar el mail de bienvenida: {welcome.mail_error}. Pasale los datos de arriba o usá «Enviar accesos nuevos al cliente».</p>}
              {welcome.sin_modulos && <p style={{ margin: 0, fontSize: 12 }}>La cotización no tenía módulos: activalos desde el panel del sistema.</p>}
              <div className="modal-actions"><button className="primary-button" onClick={() => setWelcome(null)}>Listo</button></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
