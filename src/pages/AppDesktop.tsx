import { useCallback, useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { API_URL } from "../apiBase";

/**
 * «App de escritorio» de un cliente (panel de Mezztt → Sistemas → cliente → pestaña App de escritorio).
 * Genera instaladores de UN SOLO USO (código ABC-XXXX-XXXX-XXXX + clave para desinstalar) y muestra el estado de cada instalación.
 * Ver backend/app_instalable.py. Es igual en todos los sistemas de Mezztt; usa estilos propios para no depender de cada hoja de estilos.
 */
interface Install {
  id: number; mode: "MENSUAL" | "UNICO"; status: string; label: string | null; code_hint: string | null; downloads: number;
  code_expires_at: string | null; created_at: string | null; activated_at: string | null; last_seen_at: string | null; ended_at: string | null; app_version: string | null;
}
interface AppState { installs: Install[]; available: Record<string, boolean>; files: Record<string, string>; code_ttl_days: number; max_downloads: number; stopped: string | null }
interface Generated { id: number; code: string; uninstall_key: string; mode: string; filename: string; download_path: string; expires_at: string }
interface SystemUser { id: number; name: string; email: string; role: string; active?: boolean }

const MODE_LABEL: Record<string, string> = { MENSUAL: "Mensual · conectada (misma información que la web)", UNICO: "Pago único · local (corre en la PC del cliente)" };
const STATUS: Record<string, [string, string]> = {
  PENDIENTE: ["Sin instalar", "#d97706"], ACTIVA: ["Instalada", "#16a34a"], DESINSTALADA: ["Desinstalada", "#71717a"], REVOCADA: ["Cerrada", "#71717a"], VENCIDA: ["Código vencido", "#71717a"],
};

const box: CSSProperties = { border: "1px solid rgba(128,128,128,.35)", background: "rgba(128,128,128,.08)", borderRadius: 10, padding: "10px 12px", lineHeight: 1.5, fontSize: 14 };
const warn: CSSProperties = { ...box, borderColor: "rgba(217,119,6,.6)", background: "rgba(217,119,6,.12)" };
const hint: CSSProperties = { opacity: 0.7, fontSize: 12.5, margin: "4px 0 0" };
const field: CSSProperties = { display: "flex", flexDirection: "column", gap: 4, flex: "1 1 220px" };
const btn: CSSProperties = { border: "1px solid rgba(128,128,128,.5)", background: "transparent", color: "inherit", borderRadius: 8, padding: "6px 12px", cursor: "pointer", font: "inherit", fontSize: 13 };
const btnMain: CSSProperties = { ...btn, background: "#2563eb", color: "#fff", border: "none", padding: "10px 16px", fontWeight: 700 };

function token(): string {
  try { return localStorage.getItem("velora_admin_token") || ""; } catch { return ""; }
}

function errText(data: any): string {
  const d = data?.detail;
  if (typeof d === "string") return d;
  if (d && typeof d === "object" && typeof d.message === "string") return d.message;
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

async function download(path: string, body: unknown, fallbackName: string) {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { method: "POST", headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch { throw new Error("No se pudo conectar con el servidor"); }
  if (!res.ok) throw new Error(errText(await res.json().catch(() => ({}))));
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = fallbackName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

function dateTime(v: string): string {
  const d = new Date(v);
  return isNaN(d.getTime()) ? v : d.toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
}

export default function AppDesktop({ companyId, users }: { companyId: number; users: SystemUser[] }) {
  const [state, setState] = useState<AppState | null>(null);
  const [mode, setMode] = useState<"MENSUAL" | "UNICO">("MENSUAL");
  const [label, setLabel] = useState("");
  const [userId, setUserId] = useState("");
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState<Generated | null>(null);
  const [msg, setMsg] = useState<{ text: string; bad: boolean } | null>(null);

  const ok = (text: string) => setMsg({ text, bad: false });
  const fail = (e: unknown) => setMsg({ text: e instanceof Error ? e.message : "Ocurrió un error", bad: true });

  const load = useCallback(async () => {
    try { setState(await api<AppState>(`/admin/systems/${companyId}/app`)); } catch (e) { fail(e); }
  }, [companyId]);
  useEffect(() => { load(); }, [load]);

  async function generate() {
    setBusy(true);
    setMsg(null);
    try {
      const g = await api<Generated>(`/admin/systems/${companyId}/app/instalador`, "POST", { mode, label: label.trim() || null, login_user_id: mode === "MENSUAL" && userId ? Number(userId) : null });
      setMade(g);
      setLabel("");
      await download(g.download_path, { code: g.code }, g.filename);
      ok("Instalador generado y descargado");
      await load();
    } catch (e) { fail(e); } finally { setBusy(false); }
  }

  async function redownload() {
    if (!made) return;
    try { await download(made.download_path, { code: made.code }, made.filename); await load(); } catch (e) { fail(e); }
  }

  async function close(i: Install) {
    const text = i.status === "PENDIENTE" ? "El código de este instalador va a dejar de servir." : "La app de esa PC va a dejar de abrir (muestra «Sistema detenido»). Para volver a darle acceso hay que generar otro instalador.";
    if (!window.confirm(text + " ¿Seguro?")) return;
    try { await api(`/admin/app/installs/${i.id}/cerrar`, "POST"); ok("Listo"); await load(); } catch (e) { fail(e); }
  }

  async function newKey(i: Install) {
    if (!window.confirm("Se genera una clave de desinstalación nueva y la anterior deja de servir. ¿Seguro?")) return;
    try {
      const r = await api<{ uninstall_key: string }>(`/admin/app/installs/${i.id}/nueva-clave`, "POST");
      window.prompt("Clave de desinstalación nueva (copiala y anotala; no se vuelve a mostrar):", r.uninstall_key);
    } catch (e) { fail(e); }
  }

  async function rename(i: Install) {
    const v = window.prompt("Nombre para reconocer esta PC (por ejemplo «Recepción»)", i.label || "");
    if (v === null) return;
    try { await api(`/admin/app/installs/${i.id}`, "PUT", { label: v }); await load(); } catch (e) { fail(e); }
  }

  if (!state) return <p style={hint}>{msg ? msg.text : "Cargando…"}</p>;
  const missing = !state.available[mode];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={box}>
        Instalador de <strong>un solo uso</strong>: se instala en una sola PC, se borra solo al terminar y no se puede volver a usar. El código vence a los {state.code_ttl_days} días si no se instala.
      </div>
      {state.stopped && <div style={warn}>Este cliente está {state.stopped === "PAGO" ? "con el pago vencido: la web y las apps mensuales muestran «Sistema detenido por falta de pago»" : "dado de baja: la web y las apps no abren"}.</div>}
      {msg && <div style={msg.bad ? warn : box}>{msg.text}</div>}

      <div style={field}>
        <label>Modalidad</label>
        <select value={mode} onChange={(e) => setMode(e.target.value as "MENSUAL" | "UNICO")}>
          <option value="MENSUAL">{MODE_LABEL.MENSUAL}</option>
          <option value="UNICO">{MODE_LABEL.UNICO}</option>
        </select>
        <p style={hint}>
          {mode === "MENSUAL"
            ? "Usa tu servidor: la web y la app comparten los datos. Si el cliente no paga, la app y la web se detienen solas. Necesita internet."
            : "Los datos quedan solo en esa PC y no se conectan con la web. Licencia de por vida: nunca se corta. Funciona sin internet."}
        </p>
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <div style={field}><label>Nombre de la PC (opcional)</label><input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Recepción, Caja…" maxLength={80} /></div>
        {mode === "MENSUAL" && (
          <div style={field}><label>Entra con el usuario</label>
            <select value={userId} onChange={(e) => setUserId(e.target.value)}>
              <option value="">Administrador principal</option>
              {users.filter((u) => u.active).map((u) => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}
            </select></div>
        )}
      </div>
      {missing && <div style={warn}>Todavía no está cargado el instalador base ({state.files[mode]}) en el servidor. Armalo con <code>desktop\CONSTRUIR APP.bat</code> y copialo a la carpeta <code>installers</code> del servidor.</div>}
      <button type="button" disabled={busy || missing} onClick={generate} style={{ ...btnMain, alignSelf: "flex-start", opacity: busy || missing ? 0.5 : 1 }}>
        {busy ? "Generando…" : "Descargar instalador (app de escritorio)"}
      </button>

      {made && (
        <div style={box}>
          <strong>Código de activación: {made.code}</strong><br />
          <strong>Clave para desinstalar: {made.uninstall_key}</strong><br />
          El código va en el nombre del archivo ({made.filename}); si lo renombran, el instalador lo pide a mano. La clave se la das al cliente: sin ella no puede desinstalar.
          Anotá las dos ahora: después no se vuelven a mostrar (la clave se puede cambiar por una nueva).
          <div style={{ marginTop: 8 }}><button type="button" style={btn} onClick={redownload}>Descargar de nuevo</button></div>
        </div>
      )}

      <hr style={{ width: "100%", border: 0, borderTop: "1px solid rgba(128,128,128,.3)", margin: "4px 0" }} />
      <h3 style={{ margin: 0 }}>Instalaciones</h3>
      {state.installs.length === 0 ? <p style={hint}>Todavía no se generó ningún instalador para este cliente.</p> : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
            <thead><tr style={{ textAlign: "left", opacity: 0.7 }}><th style={{ padding: 6 }}>PC</th><th style={{ padding: 6 }}>Modalidad</th><th style={{ padding: 6 }}>Estado</th><th style={{ padding: 6 }}>Instalada</th><th style={{ padding: 6 }}>Última conexión</th><th /></tr></thead>
            <tbody>
              {state.installs.map((i) => {
                const [txt, color] = STATUS[i.status] || [i.status, "#71717a"];
                const closable = i.status === "PENDIENTE" || (i.status === "ACTIVA" && i.mode === "MENSUAL");
                return (
                  <tr key={i.id} style={{ borderTop: "1px solid rgba(128,128,128,.25)", verticalAlign: "top" }}>
                    <td style={{ padding: 6 }}>{i.label || <span style={hint}>sin nombre</span>}<br /><span style={hint}>código …{i.code_hint}</span></td>
                    <td style={{ padding: 6 }}>{i.mode === "MENSUAL" ? "Mensual" : "Pago único"}</td>
                    <td style={{ padding: 6 }}><span style={{ color, fontWeight: 700 }}>{txt}</span>{i.status === "PENDIENTE" && <><br /><span style={hint}>{i.downloads} descargas</span></>}</td>
                    <td style={{ padding: 6 }}>{i.activated_at ? dateTime(i.activated_at) : "—"}{i.app_version ? <><br /><span style={hint}>v{i.app_version}</span></> : null}</td>
                    <td style={{ padding: 6 }}>{i.last_seen_at ? dateTime(i.last_seen_at) : "—"}</td>
                    <td style={{ padding: 6, whiteSpace: "nowrap" }}>
                      <button type="button" style={btn} onClick={() => rename(i)}>Nombre</button>{" "}
                      {(i.status === "ACTIVA" || i.status === "PENDIENTE") && <><button type="button" style={btn} onClick={() => newKey(i)}>Clave nueva</button>{" "}</>}
                      {closable && <button type="button" style={{ ...btn, borderColor: "#dc2626", color: "#dc2626" }} onClick={() => close(i)}>{i.status === "PENDIENTE" ? "Anular" : "Cortar"}</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p style={hint}>Las instalaciones de pago único no se pueden cortar a distancia: son locales y de por vida.</p>
    </div>
  );
}
