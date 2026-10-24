import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { API_URL } from "../apiBase";

/**
 * CENTRO DE CORREOS del panel de Mezztt (igual en todos los sistemas). Ver backend/mail_center.py.
 *  - default  MailCenter: página «Correos» (enviar a todos / a un grupo / a varios, plantillas, avisos automáticos, historial, correo saliente).
 *  - MailCompose: pestaña «Enviar mail» de un cliente (elige plantilla, dirección, vista previa y envío).
 * Usa estilos propios (en línea) para no depender de la hoja de estilos de cada sistema.
 */
const SETTINGS_PATH = "/admin/mail/config";

interface Tpl { key: string; name: string; category: string; subject: string; body: string; builtin: boolean; modified: boolean; vars: string[] }
interface Meta { templates: Tpl[]; categories: Record<string, string>; variables: Record<string, string>; configured: boolean; app_name: string }
interface Contact { email: string; label: string; kind: string; id: number | null }
interface CompanyRow { id: number; name: string; email: string | null; payment_status: string; payment_due_date: string | null; archived: boolean; stopped: boolean; overdue_days: number }
interface LogRow { id: number; company_id: number | null; company: string | null; recipient: string; subject: string; template_key: string | null; trigger: string; status: string; error: string | null; created_at: string }
interface Rule { key: string; name: string; desc: string; template_key: string; template_name: string; enabled: boolean; params: Record<string, any>; fields: { key: string; label: string; type: string }[]; last_run_at: string | null; last_count: number }

const PER_COMPANY = ["negocio", "contacto", "sistema", "sistema_by", "link", "link_web", "monto", "mes", "vencimiento", "fecha_suspension", "dias_para_pagar"];
const PAY_LABEL: Record<string, string> = { al_dia: "Al día", pendiente: "Pendiente", vencido: "Vencido" };
const STATUS_LABEL: Record<string, [string, string]> = {
  ENVIADO: ["Enviado", "#16a34a"], PENDIENTE: ["Enviando…", "#d97706"], ERROR: ["Error", "#dc2626"], SIN_SMTP: ["Sin correo configurado", "#dc2626"],
};

const box: CSSProperties = { borderWidth: 1, borderStyle: "solid", borderColor: "rgba(128,128,128,.35)", background: "rgba(128,128,128,.08)", borderRadius: 10, padding: "10px 12px", lineHeight: 1.5, fontSize: 14 };
const warn: CSSProperties = { ...box, borderColor: "rgba(217,119,6,.6)", background: "rgba(217,119,6,.12)" };
const okBox: CSSProperties = { ...box, borderColor: "rgba(22,163,74,.55)", background: "rgba(22,163,74,.12)" };
const badBox: CSSProperties = { ...box, borderColor: "rgba(220,38,38,.55)", background: "rgba(220,38,38,.1)" };
const hint: CSSProperties = { opacity: 0.7, fontSize: 12.5, margin: "4px 0 0" };
const field: CSSProperties = { display: "flex", flexDirection: "column", gap: 4, flex: "1 1 220px" };
const input: CSSProperties = { font: "inherit", fontSize: 14, padding: "8px 10px", borderRadius: 8, borderWidth: 1, borderStyle: "solid", borderColor: "rgba(128,128,128,.5)", background: "transparent", color: "inherit", width: "100%", boxSizing: "border-box" };
const btn: CSSProperties = { borderWidth: 1, borderStyle: "solid", borderColor: "rgba(128,128,128,.5)", background: "transparent", color: "inherit", borderRadius: 8, padding: "7px 13px", cursor: "pointer", fontFamily: "inherit", fontSize: 13 };
const btnMain: CSSProperties = { ...btn, background: "#2563eb", color: "#fff", borderWidth: 0, padding: "10px 18px", fontWeight: 700 };
const row: CSSProperties = { display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" };
const h3: CSSProperties = { margin: "18px 0 8px", fontSize: 15 };

function token(): string {
  try { return localStorage.getItem("velora_admin_token") || ""; } catch { return ""; }
}
function errText(data: any): string {
  const d = data?.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d) && d[0]?.msg) return String(d[0].msg);
  return "Ocurrió un error";
}
async function api<T = any>(path: string, method = "GET", body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { method, headers: { Authorization: `Bearer ${token()}`, ...(body !== undefined ? { "Content-Type": "application/json" } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch { throw new Error("No se pudo conectar con el servidor"); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(errText(data));
  return data as T;
}
function dateTime(v: string | null): string {
  if (!v) return "";
  const d = new Date(v);
  return isNaN(d.getTime()) ? v : d.toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
}
function usedVars(...texts: string[]): string[] {
  const seen: string[] = [];
  for (const t of texts) for (const m of (t || "").matchAll(/\{\{\s*([a-z_]+)\s*\}\}/g)) if (!seen.includes(m[1])) seen.push(m[1]);
  return seen;
}
function useMeta() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [err, setErr] = useState("");
  const reload = useCallback(async () => {
    try { setMeta(await api<Meta>("/admin/mail/templates")); setErr(""); } catch (e: any) { setErr(e.message); }
  }, []);
  useEffect(() => { void reload(); }, [reload]);
  return { meta, err, reload };
}
function Note({ msg }: { msg: { text: string; bad?: boolean } | null }) {
  return msg ? <div style={{ ...(msg.bad ? badBox : okBox), margin: "10px 0" }} role="status">{msg.text}</div> : null;
}
function NotConfigured({ goSettings }: { goSettings?: () => void }) {
  return (
    <div style={{ ...warn, margin: "0 0 12px" }}>
      El correo todavía no está configurado, así que no se puede enviar nada.{" "}
      {goSettings ? <button type="button" style={btn} onClick={goSettings}>Configurar el correo</button> : <>Se configura en <b>Correos → Correo</b> (menú del panel).</>}
    </div>
  );
}

// ============================================================ redactor (plantilla, texto, vista previa, envío)
function Composer({ companyId, meta, getTarget, needsConfirm, onSent, initialKey, goSettings }: {
  companyId?: number; meta: Meta; getTarget: () => { error?: string; body?: any; summary?: string }; needsConfirm?: boolean; onSent?: () => void; initialKey?: string; goSettings?: () => void;
}) {
  const [key, setKey] = useState(initialKey || "");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [image, setImage] = useState("");
  const [vars, setVars] = useState<Record<string, string>>({});
  const [html, setHtml] = useState("");
  const [missing, setMissing] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [testTo, setTestTo] = useState("");
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const [skipped, setSkipped] = useState<{ company: string; reason: string }[]>([]);

  const pick = (k: string) => {
    setKey(k); setHtml(""); setMsg(null); setSkipped([]);
    const t = meta.templates.find((x) => x.key === k);
    if (t) { setSubject(t.subject); setBody(t.body); }
  };
  useEffect(() => { if (initialKey && !subject && !body) pick(initialKey); /* eslint-disable-next-line */ }, [initialKey, meta]);

  const extras = useMemo(() => usedVars(subject, body).filter((v) => !PER_COMPANY.includes(v)), [subject, body]);
  const grouped = useMemo(() => {
    const g: Record<string, Tpl[]> = {};
    for (const t of meta.templates) (g[t.category] = g[t.category] || []).push(t);
    return g;
  }, [meta]);
  const payload = () => ({ subject, body, template_key: key || null, image_url: image.trim() || null, vars, company_id: companyId ?? null });

  async function doPreview() {
    setBusy(true); setMsg(null);
    try {
      const r = await api<{ html: string; missing: string[] }>("/admin/mail/preview", "POST", payload());
      setHtml(r.html); setMissing(r.missing);
    } catch (e: any) { setMsg({ text: e.message, bad: true }); }
    setBusy(false);
  }
  async function doTest() {
    setBusy(true); setMsg(null);
    try {
      const r = await api<{ detail: string }>("/admin/mail/test", "POST", { ...payload(), to: testTo.trim() });
      setMsg({ text: r.detail });
    } catch (e: any) { setMsg({ text: e.message, bad: true }); }
    setBusy(false);
  }
  function askSend() {
    setMsg(null);
    if (!subject.trim() || !body.trim()) { setMsg({ text: "Escribí el asunto y el mensaje", bad: true }); return; }
    const t = getTarget();
    if (t.error) { setMsg({ text: t.error, bad: true }); return; }
    if (needsConfirm) setConfirming(t.summary || "los clientes elegidos"); else void doSend(t.body);
  }
  async function doSend(extra: any) {
    setBusy(true); setConfirming(null); setMsg(null); setSkipped([]);
    try {
      const r = await api<{ queued: number; duplicates: number; skipped: { company: string; reason: string }[] }>("/admin/mail/send", "POST", { ...payload(), ...extra, confirm: true });
      setSkipped(r.skipped || []);
      setMsg({ text: r.queued ? `Listo: ${r.queued} mail${r.queued === 1 ? "" : "s"} en camino. Mirá el estado en el historial.` : "No se envió ningún mail.", bad: !r.queued });
      onSent?.();
    } catch (e: any) { setMsg({ text: e.message, bad: true }); }
    setBusy(false);
  }

  return (
    <div>
      {!meta.configured && <NotConfigured goSettings={goSettings} />}
      <div style={row}>
        <label style={field}>
          <span>Plantilla</span>
          <select style={input} value={key} onChange={(e) => pick(e.target.value)}>
            <option value="">— Escribir desde cero —</option>
            {Object.entries(grouped).map(([cat, list]) => (
              <optgroup key={cat} label={meta.categories[cat] || cat}>{list.map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}</optgroup>
            ))}
          </select>
        </label>
        <label style={{ ...field, flex: "2 1 300px" }}>
          <span>Asunto</span>
          <input style={input} value={subject} maxLength={250} onChange={(e) => setSubject(e.target.value)} placeholder="Asunto del mail" />
        </label>
      </div>
      <label style={{ ...field, marginTop: 10 }}>
        <span>Mensaje</span>
        <textarea style={{ ...input, minHeight: 230, resize: "vertical", lineHeight: 1.5 }} value={body} onChange={(e) => setBody(e.target.value)}
          placeholder="Escribí tu mensaje. Dejá una línea en blanco entre párrafos." />
        <small style={hint}>
          Se completa solo: <code>{"{{negocio}}"}</code>, <code>{"{{contacto}}"}</code>, <code>{"{{sistema}}"}</code>, <code>{"{{monto}}"}</code>, <code>{"{{vencimiento}}"}</code>… · «- » arma una viñeta · «## » un subtítulo ·
          **negrita** · [texto](https://…) un enlace · [[Texto del botón|https://…]] un botón.
        </small>
      </label>
      {extras.length > 0 && (
        <div style={{ ...row, marginTop: 10 }}>
          {extras.map((v) => (
            <label key={v} style={field}>
              <span>{meta.variables[v] || v}</span>
              {v === "novedades"
                ? <textarea style={{ ...input, minHeight: 90 }} value={vars[v] || ""} onChange={(e) => setVars({ ...vars, [v]: e.target.value })} placeholder={"Una novedad por línea:\nNuevo tablero de ventas\nExportar a Excel"} />
                : <input style={input} value={vars[v] || ""} onChange={(e) => setVars({ ...vars, [v]: e.target.value })} placeholder={v === "version" ? "1.1.0" : ""} />}
            </label>
          ))}
        </div>
      )}
      <label style={{ ...field, marginTop: 10 }}>
        <span>Imagen (opcional)</span>
        <input style={input} value={image} onChange={(e) => setImage(e.target.value)} placeholder="https://… (dirección de una imagen; se muestra arriba del mensaje, ancho 600 px)" />
      </label>

      <div style={{ ...row, marginTop: 14 }}>
        <button type="button" style={btn} disabled={busy} onClick={doPreview}>Vista previa</button>
        <input style={{ ...input, width: 230 }} value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="Mandarme una prueba a…" />
        <button type="button" style={btn} disabled={busy || testTo.trim().length < 5} onClick={doTest}>Enviar prueba</button>
        <span style={{ flex: 1 }} />
        {!confirming && <button type="button" style={btnMain} disabled={busy} onClick={askSend}>Enviar mail</button>}
      </div>
      {confirming && (
        <div style={{ ...warn, marginTop: 12 }}>
          Vas a enviar este mail a <b>{confirming}</b>. No se puede deshacer.{" "}
          <button type="button" style={btnMain} disabled={busy} onClick={() => doSend(getTarget().body)}>Sí, enviar</button>{" "}
          <button type="button" style={btn} onClick={() => setConfirming(null)}>Cancelar</button>
        </div>
      )}
      <Note msg={msg} />
      {skipped.length > 0 && (
        <div style={{ ...warn, margin: "8px 0" }}>
          <b>No se les mandó ({skipped.length}):</b>
          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>{skipped.slice(0, 30).map((s, i) => <li key={i}>{s.company}: {s.reason}</li>)}</ul>
        </div>
      )}
      {html && (
        <div style={{ marginTop: 14 }}>
          {missing.length > 0 && <div style={{ ...warn, marginBottom: 8 }}>Falta completar: {missing.map((m) => meta.variables[m] || m).join(", ")}. Aparece marcado como «[falta: …]» en la vista previa.</div>}
          <div style={{ fontSize: 13, opacity: 0.7, marginBottom: 4 }}>Así lo va a ver el cliente:</div>
          <iframe title="Vista previa del mail" sandbox="" srcDoc={html} style={{ width: "100%", height: 640, borderWidth: 1, borderStyle: "solid", borderColor: "rgba(128,128,128,.4)", borderRadius: 10, background: "#f1f1f4" }} />
        </div>
      )}
    </div>
  );
}

// ============================================================ historial
function History({ companyId, limit = 100, reloadKey }: { companyId?: number; limit?: number; reloadKey?: number }) {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [status, setStatus] = useState("");
  const [err, setErr] = useState("");
  const load = useCallback(async () => {
    try {
      const qs = new URLSearchParams({ limit: String(limit) });
      if (companyId) qs.set("company_id", String(companyId));
      if (status) qs.set("status", status);
      setRows(await api<LogRow[]>(`/admin/mail/log?${qs}`)); setErr("");
    } catch (e: any) { setErr(e.message); }
  }, [companyId, limit, status]);
  useEffect(() => { void load(); }, [load, reloadKey]);
  return (
    <div>
      <div style={{ ...row, alignItems: "center", marginBottom: 8 }}>
        {!companyId && (
          <select style={{ ...input, width: 200 }} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Todos los estados</option><option value="ENVIADO">Enviados</option><option value="ERROR">Con error</option><option value="PENDIENTE">En camino</option>
          </select>
        )}
        <button type="button" style={btn} onClick={load}>Actualizar</button>
      </div>
      {err && <div style={badBox}>{err}</div>}
      {!err && rows.length === 0 && <p style={hint}>Todavía no se envió ningún mail.</p>}
      {rows.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr style={{ textAlign: "left", opacity: 0.7 }}><th style={{ padding: 6 }}>Fecha</th>{!companyId && <th>Cliente</th>}<th>Para</th><th>Asunto</th><th>Tipo</th><th>Estado</th></tr></thead>
            <tbody>
              {rows.map((r) => {
                const [label, color] = STATUS_LABEL[r.status] || [r.status, "#71717a"];
                return (
                  <tr key={r.id} style={{ borderTop: "1px solid rgba(128,128,128,.25)", verticalAlign: "top" }}>
                    <td style={{ padding: 6, whiteSpace: "nowrap" }}>{dateTime(r.created_at)}</td>
                    {!companyId && <td>{r.company || "—"}</td>}
                    <td>{r.recipient}</td><td>{r.subject}</td>
                    <td>{r.trigger === "AUTO" ? "Automático" : r.trigger === "PRUEBA" ? "Prueba" : "Manual"}</td>
                    <td><span style={{ color, fontWeight: 600 }}>{label}</span>{r.error && <div style={{ ...hint, color: "#dc2626" }}>{r.error}</div>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ============================================================ pestaña «Enviar mail» de un cliente
export function MailCompose({ companyId, status, dueDate }: { companyId: number; status?: string; dueDate?: string | null }) {
  const { meta, err, reload } = useMeta();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [choice, setChoice] = useState("");          // email elegido o "__otro__"
  const [other, setOther] = useState("");
  const [save, setSave] = useState(true);
  const [label, setLabel] = useState("");
  const [tick, setTick] = useState(0);
  const loadContacts = useCallback(async () => {
    try {
      const r = await api<{ contacts: Contact[] }>(`/admin/mail/companies/${companyId}/contacts`);
      setContacts(r.contacts);
      setChoice((c) => (c && c !== "__otro__" && r.contacts.some((x) => x.email === c)) ? c : (r.contacts[0]?.email || "__otro__"));
    } catch { /* se ve en el aviso de abajo */ }
  }, [companyId]);
  useEffect(() => { void loadContacts(); }, [loadContacts]);

  if (err) return <div style={badBox}>{err}</div>;
  if (!meta) return <p style={hint}>Cargando…</p>;
  const unpaid = (status || "al_dia") !== "al_dia";
  const to = choice === "__otro__" ? other.trim() : choice;
  const isNew = choice === "__otro__" && other.trim() !== "" && !contacts.some((c) => c.email.toLowerCase() === other.trim().toLowerCase());

  async function removeContact(id: number) {
    try { await api(`/admin/mail/contacts/${id}`, "DELETE"); await loadContacts(); } catch { /* nada */ }
  }

  return (
    <div>
      {unpaid && (
        <div style={warn}>Este cliente figura como <b>{PAY_LABEL[status || ""] || status}</b>{dueDate ? <> (vencimiento {dateTime(dueDate).split(",")[0]})</> : null}. Elegí «Abono vencido» o «Recordatorio» para avisarle.</div>
      )}
      <h4 style={h3}>¿A qué dirección?</h4>
      <div style={{ display: "grid", gap: 6 }}>
        {contacts.map((c) => (
          <label key={c.email} style={{ display: "flex", gap: 8, alignItems: "baseline", cursor: "pointer" }}>
            <input type="radio" name={`mail-to-${companyId}`} checked={choice === c.email} onChange={() => setChoice(c.email)} />
            <span><b>{c.email}</b> <span style={{ opacity: 0.7 }}>· {c.label}</span></span>
            {c.kind === "saved" && c.id != null && <button type="button" style={{ ...btn, padding: "2px 8px", fontSize: 12 }} onClick={() => removeContact(c.id as number)}>Quitar</button>}
          </label>
        ))}
        <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer", flexWrap: "wrap" }}>
          <input type="radio" name={`mail-to-${companyId}`} checked={choice === "__otro__"} onChange={() => setChoice("__otro__")} />
          <span>Otra dirección:</span>
          <input style={{ ...input, width: 260 }} value={other} onChange={(e) => { setOther(e.target.value); setChoice("__otro__"); }} placeholder="nombre@ejemplo.com" />
        </label>
        {isNew && (
          <div style={{ marginLeft: 26, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ cursor: "pointer" }}><input type="checkbox" checked={save} onChange={(e) => setSave(e.target.checked)} /> Guardar esta dirección para este cliente</label>
            {save && <input style={{ ...input, width: 220 }} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Nombre (ej.: Contadora)" />}
          </div>
        )}
        {contacts.length === 0 && <p style={hint}>Este cliente no tiene un mail cargado: escribí una dirección.</p>}
      </div>

      <h4 style={h3}>El mail</h4>
      <Composer companyId={companyId} meta={meta} initialKey={unpaid ? "vencido" : "mensaje_libre"}
        getTarget={() => to && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)
          ? { body: { company_id: companyId, to, save_contact: isNew && save, contact_label: label.trim() || null }, summary: to }
          : { error: "Elegí o escribí una dirección de mail válida" }}
        onSent={() => { setTick((t) => t + 1); void loadContacts(); void reload(); }} />

      <h4 style={h3}>Mails enviados a este cliente</h4>
      <History companyId={companyId} limit={15} reloadKey={tick} />
    </div>
  );
}

// ============================================================ página «Correos»
type Tab = "enviar" | "plantillas" | "automaticos" | "historial" | "correo";

function SendBulk({ meta, goSettings }: { meta: Meta; goSettings: () => void }) {
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [kind, setKind] = useState<"all" | "estado" | "ids">("all");
  const [estado, setEstado] = useState("deuda");
  const [ids, setIds] = useState<number[]>([]);
  const [q, setQ] = useState("");
  const [tick, setTick] = useState(0);
  useEffect(() => { api<CompanyRow[]>("/admin/mail/companies").then(setCompanies).catch(() => setCompanies([])); }, []);

  const active = companies.filter((c) => !c.archived);
  const matches = useMemo(() => {
    if (kind === "all") return active;
    if (kind === "estado") return active.filter((c) => (estado === "deuda" ? c.payment_status !== "al_dia" : c.payment_status === estado));
    return companies.filter((c) => ids.includes(c.id));
  }, [kind, estado, ids, companies]); // eslint-disable-line
  const withMail = matches.filter((c) => c.email).length;
  const list = companies.filter((c) => c.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div>
      <h4 style={h3}>¿A quiénes?</h4>
      <div style={{ display: "grid", gap: 6 }}>
        <label><input type="radio" checked={kind === "all"} onChange={() => setKind("all")} /> A <b>todos</b> los clientes activos ({active.length})</label>
        <label style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input type="radio" checked={kind === "estado"} onChange={() => setKind("estado")} /> Según el estado de pago:
          <select style={{ ...input, width: 220 }} value={estado} onChange={(e) => { setEstado(e.target.value); setKind("estado"); }}>
            <option value="deuda">Pendientes o vencidos</option><option value="vencido">Solo vencidos</option><option value="pendiente">Solo pendientes</option><option value="al_dia">Solo al día</option>
          </select>
        </label>
        <label><input type="radio" checked={kind === "ids"} onChange={() => setKind("ids")} /> Elegir clientes uno por uno</label>
      </div>
      {kind === "ids" && (
        <div style={{ ...box, marginTop: 8 }}>
          <input style={{ ...input, marginBottom: 8 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar cliente…" />
          <div style={{ maxHeight: 220, overflowY: "auto", display: "grid", gap: 4 }}>
            {list.map((c) => (
              <label key={c.id} style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                <input type="checkbox" checked={ids.includes(c.id)} onChange={(e) => setIds(e.target.checked ? [...ids, c.id] : ids.filter((x) => x !== c.id))} />
                <span>{c.name} <span style={{ opacity: 0.65, fontSize: 12.5 }}>· {PAY_LABEL[c.payment_status] || c.payment_status}{c.email ? "" : " · sin mail"}{c.archived ? " · de baja" : ""}</span></span>
              </label>
            ))}
          </div>
        </div>
      )}
      <p style={{ ...hint, fontSize: 13 }}>
        Le llega a <b>{withMail}</b> cliente{withMail === 1 ? "" : "s"}{matches.length - withMail > 0 ? <> · {matches.length - withMail} sin mail cargado (se omiten)</> : null}. Cada uno recibe el mail con sus propios datos, a la dirección con la que se creó el sistema.
      </p>
      <h4 style={h3}>El mail</h4>
      <Composer meta={meta} needsConfirm goSettings={goSettings} initialKey="novedad_actualizacion"
        getTarget={() => {
          if (kind === "ids" && ids.length === 0) return { error: "Elegí al menos un cliente" };
          if (withMail === 0) return { error: "Ninguno de los clientes elegidos tiene un mail cargado" };
          const audience = kind === "estado" ? { kind, estado: estado === "deuda" ? "" : estado } : kind === "ids" ? { kind, ids } : { kind };
          return { body: { audience }, summary: `${withMail} cliente${withMail === 1 ? "" : "s"}` };
        }}
        onSent={() => setTick((t) => t + 1)} />
      <h4 style={h3}>Últimos envíos</h4>
      <History limit={15} reloadKey={tick} />
    </div>
  );
}

function Templates({ meta, reload }: { meta: Meta; reload: () => Promise<void> }) {
  const [sel, setSel] = useState<string>(meta.templates[0]?.key || "");
  const tpl = meta.templates.find((t) => t.key === sel) || null;
  const [name, setName] = useState("");
  const [category, setCategory] = useState("otros");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [html, setHtml] = useState("");
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const [isNew, setIsNew] = useState(false);
  useEffect(() => {
    if (tpl && !isNew) { setName(tpl.name); setCategory(tpl.category); setSubject(tpl.subject); setBody(tpl.body); setHtml(""); setMsg(null); }
  }, [sel, tpl?.subject, tpl?.body]); // eslint-disable-line

  async function save() {
    setMsg(null);
    try {
      if (isNew) {
        const r = await api<{ key: string }>("/admin/mail/templates", "POST", { name, category, subject, body });
        await reload(); setIsNew(false); setSel(r.key);
      } else if (tpl) {
        await api(`/admin/mail/templates/${tpl.key}`, "PUT", { name, category, subject, body });
        await reload();
      }
      setMsg({ text: "Guardado." });
    } catch (e: any) { setMsg({ text: e.message, bad: true }); }
  }
  async function remove() {
    if (!tpl) return;
    try { await api(`/admin/mail/templates/${tpl.key}`, "DELETE"); await reload(); setMsg({ text: tpl.builtin ? "Se restauró el texto original." : "Plantilla eliminada." }); if (!tpl.builtin) setSel(meta.templates[0]?.key || ""); }
    catch (e: any) { setMsg({ text: e.message, bad: true }); }
  }
  async function preview() {
    try { setHtml((await api<{ html: string }>("/admin/mail/preview", "POST", { subject, body, vars: { version: "1.1.0", novedades: "Primera novedad\nSegunda novedad", fecha_mantenimiento: "sábado 22 hs" } })).html); }
    catch (e: any) { setMsg({ text: e.message, bad: true }); }
  }
  const grouped: Record<string, Tpl[]> = {};
  for (const t of meta.templates) (grouped[t.category] = grouped[t.category] || []).push(t);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(200px, 260px) 1fr", gap: 18, alignItems: "start" }}>
      <div>
        <button type="button" style={{ ...btnMain, width: "100%", marginBottom: 10 }} onClick={() => { setIsNew(true); setSel(""); setName(""); setCategory("otros"); setSubject(""); setBody("Hola {{contacto}}:\n\n\n\nSaludos."); setHtml(""); setMsg(null); }}>+ Nueva plantilla</button>
        {Object.entries(grouped).map(([cat, list]) => (
          <div key={cat} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 12, opacity: 0.65, textTransform: "uppercase", letterSpacing: ".04em", margin: "6px 0 4px" }}>{meta.categories[cat] || cat}</div>
            {list.map((t) => (
              <button key={t.key} type="button" onClick={() => { setIsNew(false); setSel(t.key); }}
                style={{ ...btn, display: "block", width: "100%", textAlign: "left", marginBottom: 4, ...(sel === t.key && !isNew ? { borderColor: "#2563eb", background: "rgba(37,99,235,.12)" } : {}) }}>
                {t.name}{t.modified ? " ✎" : ""}
              </button>
            ))}
          </div>
        ))}
      </div>
      <div>
        {(tpl || isNew) ? (
          <>
            <div style={row}>
              {(isNew || !tpl?.builtin) && <label style={field}><span>Nombre de la plantilla</span><input style={input} value={name} onChange={(e) => setName(e.target.value)} /></label>}
              {(isNew || !tpl?.builtin) && (
                <label style={{ ...field, flex: "0 1 200px" }}><span>Categoría</span>
                  <select style={input} value={category} onChange={(e) => setCategory(e.target.value)}>{Object.entries(meta.categories).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                </label>
              )}
            </div>
            <label style={{ ...field, marginTop: 10 }}><span>Asunto</span><input style={input} value={subject} onChange={(e) => setSubject(e.target.value)} /></label>
            <label style={{ ...field, marginTop: 10 }}><span>Mensaje</span>
              <textarea style={{ ...input, minHeight: 300, resize: "vertical", lineHeight: 1.5 }} value={body} onChange={(e) => setBody(e.target.value)} />
            </label>
            <details style={{ margin: "8px 0" }}>
              <summary style={{ cursor: "pointer", fontSize: 13 }}>Datos que se completan solos</summary>
              <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 13 }}>
                {Object.entries(meta.variables).map(([k, v]) => <li key={k}><code>{`{{${k}}}`}</code> — {v}</li>)}
              </ul>
              <p style={hint}>«- » arma una viñeta · «## » un subtítulo · **negrita** · [texto](https://…) enlace · [[Texto del botón|https://…]] botón.</p>
            </details>
            <div style={{ ...row, marginTop: 10 }}>
              <button type="button" style={btnMain} onClick={save}>Guardar</button>
              <button type="button" style={btn} onClick={preview}>Vista previa</button>
              {!isNew && tpl && (tpl.modified || !tpl.builtin) && <button type="button" style={btn} onClick={remove}>{tpl.builtin ? "Volver al texto original" : "Eliminar"}</button>}
            </div>
            <Note msg={msg} />
            {html && <iframe title="Vista previa" sandbox="" srcDoc={html} style={{ width: "100%", height: 640, borderWidth: 1, borderStyle: "solid", borderColor: "rgba(128,128,128,.4)", borderRadius: 10, marginTop: 12, background: "#f1f1f4" }} />}
          </>
        ) : <p style={hint}>Elegí una plantilla para verla o editarla.</p>}
      </div>
    </div>
  );
}

function Automatic({ configured, goSettings }: { configured: boolean; goSettings: () => void }) {
  const [data, setData] = useState<{ hour: number; rules: Rule[]; grace_days: number } | null>(null);
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const [dry, setDry] = useState<{ rule?: string; items: any[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { try { setData(await api("/admin/mail/auto")); } catch (e: any) { setMsg({ text: e.message, bad: true }); } }, []);
  useEffect(() => { void load(); }, [load]);

  async function put(rules: any, hour?: number) {
    setMsg(null);
    try { setData(await api("/admin/mail/auto", "PUT", { rules, ...(hour !== undefined ? { hour } : {}) })); } catch (e: any) { setMsg({ text: e.message, bad: true }); }
  }
  async function run(dryRun: boolean, rule?: string) {
    setBusy(true); setMsg(null);
    try {
      const r = await api<{ count: number; items: any[] }>("/admin/mail/auto/run", "POST", { dry_run: dryRun, rule: rule || null });
      if (dryRun) setDry({ rule, items: r.items });
      else { setMsg({ text: r.count ? `Se mandaron ${r.count} aviso${r.count === 1 ? "" : "s"}.` : "Hoy no correspondía mandar nada." }); setDry(null); await load(); }
    } catch (e: any) { setMsg({ text: e.message, bad: true }); }
    setBusy(false);
  }
  if (!data) return <p style={hint}>Cargando…</p>;
  return (
    <div>
      {!configured && <NotConfigured goSettings={goSettings} />}
      <div style={okBox}>
        Los avisos automáticos están <b>apagados</b> hasta que los prendas. Se revisan todos los días a partir de la hora que elijas, y <b>nunca se manda dos veces el mismo aviso</b> al mismo cliente.
        Usan la fecha de vencimiento y el estado de pago que cargues en cada cliente. El sistema se detiene {data.grace_days} días después del vencimiento si no se paga.
      </div>
      <div style={{ ...row, margin: "12px 0", alignItems: "center" }}>
        <span>Revisar todos los días desde las</span>
        <select style={{ ...input, width: 90 }} value={data.hour} onChange={(e) => put({}, Number(e.target.value))}>
          {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}
        </select>
        <span style={hint}>(hora de Argentina)</span>
      </div>
      <div style={{ display: "grid", gap: 10 }}>
        {data.rules.map((r) => (
          <div key={r.key} style={{ ...box, borderColor: r.enabled ? "rgba(22,163,74,.55)" : undefined }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer", fontWeight: 700 }}>
                <input type="checkbox" checked={r.enabled} onChange={(e) => put({ [r.key]: { enabled: e.target.checked } })} /> {r.name}
              </label>
              <span style={{ opacity: 0.65, fontSize: 12.5 }}>Plantilla: {r.template_name}</span>
              <span style={{ flex: 1 }} />
              <button type="button" style={btn} disabled={busy} onClick={() => run(true, r.key)}>¿A quién se mandaría hoy?</button>
            </div>
            <p style={hint}>{r.desc}</p>
            {r.fields.length > 0 && (
              <div style={{ ...row, marginTop: 6 }}>
                {r.fields.map((f) => (
                  <label key={f.key} style={{ ...field, flex: "0 1 260px" }}><span style={{ fontSize: 12.5 }}>{f.label}</span>
                    <input style={input} defaultValue={String(r.params[f.key] ?? "")} onBlur={(e) => { if (e.target.value !== String(r.params[f.key] ?? "")) put({ [r.key]: { params: { [f.key]: f.type === "int" ? Number(e.target.value) || 0 : e.target.value } } }); }} />
                  </label>
                ))}
              </div>
            )}
            {r.last_run_at && <p style={hint}>Última vez que corrió: {dateTime(r.last_run_at)} · mandó {r.last_count}</p>}
          </div>
        ))}
      </div>
      <Note msg={msg} />
      {dry && (
        <div style={{ ...box, marginTop: 12 }}>
          <b>{dry.items.length ? `Hoy se mandaría a ${dry.items.length} cliente${dry.items.length === 1 ? "" : "s"}:` : "Hoy no correspondería mandarle nada a nadie con esta regla."}</b>
          <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 13 }}>{dry.items.slice(0, 40).map((i, k) => <li key={k}>{i.company} · {i.to} · «{i.subject}»</li>)}</ul>
          {dry.items.length > 0 && <p style={hint}>Esto es solo la vista previa: no se mandó nada. Cuando la regla está prendida, se envía sola.</p>}
        </div>
      )}
      <div style={{ ...row, marginTop: 14 }}>
        <button type="button" style={btn} disabled={busy} onClick={() => run(true)}>Ver todo lo que saldría hoy</button>
        <button type="button" style={btn} disabled={busy || !configured} onClick={() => run(false)}>Revisar y enviar ahora (reglas prendidas)</button>
      </div>
    </div>
  );
}

function Settings({ reload }: { reload: () => Promise<void> }) {
  const [cfg, setCfg] = useState<any>(null);
  const [f, setF] = useState({ host: "", port: "587", user: "", password: "", sender: "", use_tls: true });
  const [testTo, setTestTo] = useState("");
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const load = useCallback(async () => {
    try {
      const r = await api(SETTINGS_PATH);
      setCfg(r);
      setF({ host: r.host || "", port: String(r.port || 587), user: r.user || "", password: r.password || "", sender: r.sender || "", use_tls: r.use_tls !== false });
    } catch (e: any) { setMsg({ text: e.message, bad: true }); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  async function save() {
    setMsg(null);
    try { await api(SETTINGS_PATH, "PUT", { host: f.host, port: Number(f.port) || 587, user: f.user, password: f.password, sender: f.sender, use_tls: f.use_tls }); await load(); await reload(); setMsg({ text: "Guardado." }); }
    catch (e: any) { setMsg({ text: e.message, bad: true }); }
  }
  async function test() {
    setMsg(null);
    try { const r = await api<{ detail: string }>(`${SETTINGS_PATH}/test`, "POST", { to: testTo.trim() }); setMsg({ text: r.detail }); await load(); }
    catch (e: any) { setMsg({ text: e.message, bad: true }); await load(); }
  }
  if (!cfg) return <p style={hint}>Cargando…</p>;
  const eff = cfg.effective || {};
  return (
    <div style={{ maxWidth: 720 }}>
      <div style={cfg.configured ? okBox : warn}>
        {cfg.configured ? <>Correo configurado: se manda desde <b>{eff.sender}</b>{eff.from_env ? " (variables del servidor)" : ""}.</> : "Todavía no hay correo configurado."}
      </div>
      <div style={{ ...row, marginTop: 12 }}>
        <label style={field}><span>Servidor (SMTP)</span><input style={input} value={f.host} onChange={(e) => setF({ ...f, host: e.target.value })} placeholder="smtp-relay.brevo.com" /></label>
        <label style={{ ...field, flex: "0 1 110px" }}><span>Puerto</span><input style={input} value={f.port} onChange={(e) => setF({ ...f, port: e.target.value })} /></label>
      </div>
      <div style={{ ...row, marginTop: 10 }}>
        <label style={field}><span>Usuario</span><input style={input} value={f.user} onChange={(e) => setF({ ...f, user: e.target.value })} autoComplete="off" /></label>
        <label style={field}><span>Contraseña</span><input style={input} type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="new-password" /></label>
      </div>
      <label style={{ ...field, marginTop: 10 }}><span>Desde (remitente)</span>
        <input style={input} value={f.sender} onChange={(e) => setF({ ...f, sender: e.target.value })} placeholder="Avisos <avisos@mezztt.site>" />
        <small style={hint}>Ej.: <code>Mezztt &lt;avisos@mezztt.site&gt;</code>. Con Gmail tiene que ser la misma cuenta. Los clientes pueden contestar a esta dirección.</small>
      </label>
      <label style={{ display: "block", margin: "10px 0", cursor: "pointer" }}><input type="checkbox" checked={f.use_tls} onChange={(e) => setF({ ...f, use_tls: e.target.checked })} /> Conexión segura (TLS / STARTTLS)</label>
      <button type="button" style={btnMain} onClick={save}>Guardar</button>

      <h4 style={h3}>Probar</h4>
      <div style={row}>
        <input style={{ ...input, width: 280 }} value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="tu-mail@ejemplo.com" />
        <button type="button" style={btn} disabled={testTo.trim().length < 5} onClick={test}>Enviar mail de prueba</button>
      </div>
      <Note msg={msg} />
      <details style={{ marginTop: 14 }}>
        <summary style={{ cursor: "pointer" }}>¿Qué servidor uso? (gratis)</summary>
        <ul style={{ fontSize: 13.5, lineHeight: 1.6 }}>
          <li><b>Brevo</b> (300 mails por día gratis): servidor <code>smtp-relay.brevo.com</code>, puerto 587, TLS. Usuario y clave SMTP desde tu cuenta de Brevo.</li>
          <li><b>Gmail</b> (hasta unos 500 por día): servidor <code>smtp.gmail.com</code>, puerto 587, TLS. Usuario: tu mail; contraseña: una <i>contraseña de aplicación</i> (Cuenta de Google → Seguridad → Verificación en 2 pasos → Contraseñas de aplicaciones). No uses tu contraseña normal.</li>
        </ul>
        <p style={hint}>Esta configuración es de este sistema: cada sistema de Mezztt (Velora, Nominal, etc.) tiene la suya, aunque podés cargar los mismos datos en todos.</p>
      </details>
      {cfg.recent?.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <h4 style={h3}>Últimos intentos</h4>
          <ul style={{ fontSize: 13, paddingLeft: 18 }}>{cfg.recent.map((r: any) => <li key={r.id}>{dateTime(r.created_at)} · {r.recipient} · {(STATUS_LABEL[r.status] || [r.status])[0]}{r.error ? ` — ${r.error}` : ""}</li>)}</ul>
        </div>
      )}
    </div>
  );
}

export default function MailCenter() {
  const { meta, err, reload } = useMeta();
  const [tab, setTab] = useState<Tab>("enviar");
  const tabs: [Tab, string][] = [["enviar", "Enviar"], ["plantillas", "Plantillas"], ["automaticos", "Automáticos"], ["historial", "Historial"], ["correo", "Correo"]];
  return (
    <div style={{ padding: "4px 2px" }}>
      <h1 style={{ margin: "0 0 4px" }}>Correos</h1>
      <p style={{ ...hint, marginBottom: 12 }}>Mandá mails a tus clientes (uno, un grupo o todos), con plantillas ya escritas, y dejá avisos automáticos de cobro. Para escribirle a un cliente puntual también podés abrirlo en Clientes → pestaña «Enviar mail».</p>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
        {tabs.map(([k, l]) => (
          <button key={k} type="button" onClick={() => setTab(k)} style={{ ...btn, ...(tab === k ? { background: "#2563eb", color: "#fff", borderColor: "#2563eb", fontWeight: 700 } : {}) }}>{l}</button>
        ))}
      </div>
      {err && <div style={badBox}>{err}</div>}
      {!meta && !err && <p style={hint}>Cargando…</p>}
      {meta && tab === "enviar" && <SendBulk meta={meta} goSettings={() => setTab("correo")} />}
      {meta && tab === "plantillas" && <Templates meta={meta} reload={reload} />}
      {meta && tab === "automaticos" && <Automatic configured={meta.configured} goSettings={() => setTab("correo")} />}
      {tab === "historial" && <History limit={200} />}
      {tab === "correo" && <Settings reload={reload} />}
    </div>
  );
}
