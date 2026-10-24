import { useEffect, useMemo, useState } from "react";
import { MailCompose } from "./MailCenter";
import AppDesktop from "./AppDesktop";
import type { FormEvent } from "react";
import "./sistemas.css";

// ============================================================
// MEZZTT · SISTEMAS DE VELORA (crear, ver y EDITAR)
// ============================================================

interface SystemItem {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  country: string | null;
  store_slug: string | null;
  subscription_status: string;
  enabled_modules: string | null;
  rubro?: string | null;
  client_price: number | string | null;
  payment_status: string;
  payment_due_date: string | null;
  billed: boolean;
  apply_iva: boolean;
  created_at: string;
  archived: boolean;
  cancel_requested_at?: string | null;   // baja del servicio pedida por la empresa
  service_end_date?: string | null;       // el sistema funciona hasta esta fecha
}
interface PaymentItem { id: number; amount: number | string; payment_date: string; method: string | null; notes: string | null }
interface SystemUser { id: number; name: string; email: string; role: string; active?: boolean }

import { API_URL } from "../apiBase";
import DateField from "../components/DateField";
import { AdminBajas } from "../components/ServiceCancel";
import { RUBROS } from "../rubros";

const MODULE_GROUPS: { title: string; items: [string, string, string][] }[] = [
  { title: "Ventas", items: [
    ["pedidos", "Pedidos", "Reserva de stock, pago y entrega programada"],
    ["entregas", "Entregas", "Envíos en camino / entregados y remito"],
    ["pos", "Punto de venta", "Venta rápida de mostrador"],
    ["caja", "Caja", "Apertura, cierre y arqueo"],
  ] },
  { title: "Facturación", items: [
    ["facturacion", "Facturación", "Comprobantes electrónicos y notas de crédito"],
    ["cuentas", "Cuentas corrientes", "Saldos, límites y pagos por cliente"],
  ] },
  { title: "Catálogo", items: [
    ["productos", "Productos", "Precios, SKU, código de barras e IVA"],
    ["clientes", "Clientes", "Contactos y condiciones comerciales"],
    ["stock", "Stock", "Inventario por depósito y movimientos"],
  ] },
  { title: "Abastecimiento y gestión", items: [
    ["proveedores", "Proveedores", "Datos de proveedores"],
    ["compras", "Compras", "Órdenes de compra que suman stock"],
    ["reportes", "Reportes", "Ventas, más vendidos, stock bajo y rentabilidad"],
    ["vendedores", "Vendedores y comisiones", "Vendedor en cada pedido y venta, comisiones por mes y liquidaciones"],
  ] },
  { title: "Web", items: [
    ["landing", "Landing Page", "Página del negocio con productos, precios y stock"],
    ["ecommerce", "E-commerce", "Tienda online con carrito, stock en vivo y seña"],
  ] },
];
const MODULE_LABEL: Record<string, string> = Object.fromEntries(MODULE_GROUPS.flatMap((g) => g.items.map(([id, l]) => [id, l])));

function authHeaders(json = false): Record<string, string> {
  return { Authorization: `Bearer ${localStorage.getItem("velora_admin_token")}`, ...(json ? { "Content-Type": "application/json" } : {}) };
}
async function api<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { method, headers: authHeaders(body !== undefined), body: body !== undefined ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const d = (data as { detail?: unknown }).detail;
    throw new Error(typeof d === "string" ? d : "No se pudo completar la acción");
  }
  return data as T;
}
// ---------- precios (USD): configuración una sola vez · módulos y webs también por mes ----------
interface BillingPrices { module_price: number | string; base_cost: number | string; landing_price: number | string; ecommerce_price: number | string; web_combo_price?: number | string }
const WEB_MODULES = ["landing", "ecommerce"];

/** Misma fórmula que el servidor. Devuelve los importes SIN IVA y con IVA si corresponde. */
function suggestedPricing(prices: BillingPrices | null, modules: string[], applyIva: boolean) {
  if (!prices) return null;
  const count = modules.filter((m) => !WEB_MODULES.includes(m)).length;
  const landing = modules.includes("landing");
  const ecommerce = modules.includes("ecommerce");
  const webs = landing && ecommerce ? Number(prices.web_combo_price ?? 0) : landing ? Number(prices.landing_price) : ecommerce ? Number(prices.ecommerce_price) : 0;
  const monthly = Number(prices.module_price) * count + webs;
  const initial = Number(prices.base_cost) + monthly;
  const factor = applyIva ? 1.21 : 1;
  return { count, webs, monthly, initial, monthlyTotal: Math.round(monthly * factor * 100) / 100, initialTotal: Math.round(initial * factor * 100) / 100 };
}
const usd = (v: number) => "USD " + v.toLocaleString("es-AR", { maximumFractionDigits: 2 });

const splitList = (v: string | null) => (v || "").split(",").map((x) => x.trim()).filter(Boolean);
const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
const money = (v: number | string | null) => (v === null || v === "" ? "—" : (Number(v) < 0 ? "-$" : "$") + Math.abs(Math.round(Number(v))).toLocaleString("es-AR"));
const shortDate = (iso: string | null) => (iso ? new Date(iso.length === 10 ? iso + "T12:00:00" : iso).toLocaleDateString("es-AR") : "—");

function status(s: SystemItem): { label: string; tone: "ok" | "warn" | "bad" | "off" } {
  if (s.archived) return { label: "Dado de baja", tone: "off" };
  if (s.service_end_date) return { label: `Baja solicitada · hasta ${s.service_end_date.slice(0, 10).split("-").reverse().join("/")}`, tone: "warn" };
  if (s.payment_status === "vencido") return { label: "Pago vencido", tone: "bad" };
  if (s.payment_due_date) {
    const days = Math.floor((Date.now() - new Date(s.payment_due_date).getTime()) / 86400000);
    if (s.payment_status !== "al_dia" && days > 10) return { label: "Pago atrasado", tone: "bad" };
    if (days > 0 && s.payment_status !== "al_dia") return { label: "Pago pendiente", tone: "warn" };
  }
  if (s.payment_status === "pendiente") return { label: "Pago pendiente", tone: "warn" };
  return { label: "Activo · al día", tone: "ok" };
}

type DetailTab = "info" | "pagos" | "usuarios" | "mail" | "app" | "seguridad";

const EMPTY_NEW = {
  company_name: "", email: "", phone: "", country: "Argentina", rubro: "", modules: [] as string[], apply_iva: true,
  price: "", payment_status: "al_dia", due: "", billed: false, admin_name: "Administrador", admin_email: "", admin_password: "",
};

function Sistemas() {
  const [systems, setSystems] = useState<SystemItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"activos" | "inactivos" | "locales">("activos");
  const [localIds, setLocalIds] = useState<number[]>([]);
  const [q, setQ] = useState("");
  const [toast, setToast] = useState<{ text: string; tone: "ok" | "error" } | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [nf, setNf] = useState({ ...EMPTY_NEW });
  const [saving, setSaving] = useState(false);

  const [detail, setDetail] = useState<SystemItem | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>("info");
  const [edit, setEdit] = useState<{
    name: string; email: string; phone: string; country: string; rubro: string; enabled_modules: string[];
    client_price: string; payment_status: string; payment_due_date: string; billed: boolean; apply_iva: boolean;
  } | null>(null);
  const [payments, setPayments] = useState<PaymentItem[]>([]);
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("Transferencia");
  const [payNotes, setPayNotes] = useState("");
  const [resetUserId, setResetUserId] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [closePassword, setClosePassword] = useState("");
  const [prices, setPrices] = useState<BillingPrices | null>(null);

  function notify(text: string, tone: "ok" | "error" = "ok") {
    setToast({ text, tone });
    window.setTimeout(() => setToast(null), 3000);
  }

  async function loadSystems(): Promise<SystemItem[]> {
    try {
      const list = await api<SystemItem[]>("/admin/systems");
      setSystems(list);
      api<{ ids: number[] }>("/admin/local-systems").then((r) => setLocalIds(r.ids)).catch(() => {});
      return list;
    } catch (e) {
      notify(e instanceof Error ? e.message : "No se pudieron cargar los sistemas", "error");
      return [];
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    loadSystems();
    api<BillingPrices>("/admin/billing-settings").then(setPrices).catch(() => setPrices(null));
  }, []);

  /** Abono mensual sugerido según los módulos tildados (el precio que se guarda sigue siendo editable). */
  function SuggestedFee({ modules, applyIva, current, onUse, showInitial }: {
    modules: string[]; applyIva: boolean; current: string; onUse: (value: string) => void; showInitial?: boolean;
  }) {
    const p = suggestedPricing(prices, modules, applyIva);
    if (!p) return null;
    const iva = applyIva ? "con IVA" : "sin IVA";
    return (
      <small className="ss-hint">
        Abono mensual sugerido: <strong>{usd(p.monthlyTotal)}</strong> {iva} ({p.count} módulo{p.count === 1 ? "" : "s"}
        {p.webs > 0 ? ` + web ${usd(p.webs)}` : ""}).
        {p.monthlyTotal > 0 && <> Trimestral: <strong>{usd(p.monthlyTotal * 2)}</strong> (1 mes gratis) · Anual: <strong>{usd(p.monthlyTotal * 10)}</strong> (2 meses gratis).</>}
        {showInitial && <> Pago inicial: <strong>{usd(p.initialTotal)}</strong> {iva} (suma la configuración, una sola vez).</>}
        {Number(current || 0) !== p.monthlyTotal && (
          <> <button type="button" className="ss-link" onClick={() => onUse(String(p.monthlyTotal))}>Usar el sugerido</button></>
        )}
      </small>
    );
  }

  // ---------------- crear ----------------
  async function createSystem(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const created = await api<SystemItem>("/admin/systems", "POST", {
        company_name: nf.company_name, email: nf.email || null, phone: nf.phone || null, country: nf.country || null,
        rubro: nf.rubro || null, enabled_modules: nf.modules, apply_iva: nf.apply_iva, client_price: nf.price ? Number(nf.price) : null,
        payment_status: nf.payment_status, payment_due_date: nf.due || null, billed: nf.billed, extra_type: "NINGUNO",
        admin_name: nf.admin_name || "Administrador", admin_email: nf.admin_email, admin_password: nf.admin_password,
      });
      setShowForm(false);
      setNf({ ...EMPTY_NEW });
      await loadSystems();
      setTab("activos");
      notify(`Sistema "${created.name}" creado`);
    } catch (err) {
      notify(err instanceof Error ? err.message : "No se pudo crear el sistema", "error");
    } finally {
      setSaving(false);
    }
  }

  // ---------------- detalle / editar ----------------
  async function openDetail(s: SystemItem) {
    setDetail(s);
    setDetailTab("info");
    setEdit({
      name: s.name, email: s.email || "", phone: s.phone || "", country: s.country || "", rubro: s.rubro || "",
      enabled_modules: splitList(s.enabled_modules), client_price: s.client_price === null ? "" : String(s.client_price),
      payment_status: s.payment_status, payment_due_date: s.payment_due_date ? s.payment_due_date.slice(0, 10) : "",
      billed: s.billed, apply_iva: s.apply_iva,
    });
    setPayAmount(s.client_price ? String(s.client_price) : ""); setPayNotes("");
    setNewPassword(""); setClosePassword(""); setResetUserId("");
    const [p, u] = await Promise.all([
      api<PaymentItem[]>(`/admin/systems/${s.id}/payments`).catch(() => []),
      api<SystemUser[]>(`/admin/systems/${s.id}/users`).catch(() => []),
    ]);
    setPayments(p); setUsers(u);
  }

  const dirty = useMemo(() => {
    if (!detail || !edit) return false;
    return (
      edit.name !== detail.name || edit.email !== (detail.email || "") || edit.phone !== (detail.phone || "") ||
      edit.country !== (detail.country || "") || edit.rubro !== (detail.rubro || "") || edit.enabled_modules.join(",") !== splitList(detail.enabled_modules).join(",") ||
      edit.client_price !== (detail.client_price === null ? "" : String(detail.client_price)) ||
      edit.payment_status !== detail.payment_status ||
      edit.payment_due_date !== (detail.payment_due_date ? detail.payment_due_date.slice(0, 10) : "") ||
      edit.billed !== detail.billed || edit.apply_iva !== detail.apply_iva
    );
  }, [detail, edit]);

  async function saveInfo() {
    if (!detail || !edit) return;
    setSaving(true);
    try {
      const updated = await api<SystemItem>(`/admin/systems/${detail.id}`, "PUT", {
        ...edit,
        client_price: edit.client_price === "" ? null : Number(edit.client_price),
        payment_due_date: edit.payment_due_date || null,
      });
      setDetail(updated);
      setEdit({ ...edit, enabled_modules: splitList(updated.enabled_modules) });
      await loadSystems();
      notify("Cambios guardados");
    } catch (err) {
      notify(err instanceof Error ? err.message : "No se pudo guardar", "error");
    } finally {
      setSaving(false);
    }
  }

  async function addPayment() {
    if (!detail || !payAmount) return;
    try {
      await api(`/admin/systems/${detail.id}/payments`, "POST", { amount: Number(payAmount), method: payMethod, notes: payNotes || null });
      setPayNotes("");
      setPayments(await api<PaymentItem[]>(`/admin/systems/${detail.id}/payments`));
      const fresh = (await loadSystems()).find((s) => s.id === detail.id);
      if (fresh && edit) {
        setDetail(fresh);
        setEdit({ ...edit, payment_status: fresh.payment_status, payment_due_date: fresh.payment_due_date ? fresh.payment_due_date.slice(0, 10) : "" });
      }
      notify("Pago registrado");
    } catch (err) {
      notify(err instanceof Error ? err.message : "No se pudo registrar el pago", "error");
    }
  }

  async function doSecurityReset() {
    if (!detail || !newPassword) return;
    try {
      const r = await api<{ detail: string }>(`/admin/systems/${detail.id}/security-reset`, "POST", {
        new_password: newPassword, user_id: resetUserId ? Number(resetUserId) : null,
      });
      setNewPassword("");
      notify(r.detail);
    } catch (err) {
      notify(err instanceof Error ? err.message : "No se pudo resetear", "error");
    }
  }

  async function toggleActive() {
    if (!detail || !closePassword) return;
    try {
      const r = await api<{ detail: string; archived: boolean }>(`/admin/systems/${detail.id}/toggle-active`, "POST", { password: closePassword });
      setClosePassword("");
      setDetail(null);
      await loadSystems();
      setTab(r.archived ? "inactivos" : "activos");
      notify(r.archived ? "Sistema dado de baja" : "Sistema reactivado");
    } catch (err) {
      notify(err instanceof Error ? err.message : "No se pudo cambiar el estado", "error");
    }
  }

  const counts = { activos: systems.filter((s) => !s.archived && !localIds.includes(s.id)).length, inactivos: systems.filter((s) => s.archived && !localIds.includes(s.id)).length, locales: systems.filter((s) => localIds.includes(s.id)).length };
  const visible = systems
    .filter((s) => (tab === "locales" ? localIds.includes(s.id) : localIds.includes(s.id) ? false : tab === "activos" ? !s.archived : s.archived))
    .filter((s) => { const t = q.trim().toLowerCase(); return !t || s.name.toLowerCase().includes(t) || (s.email || "").toLowerCase().includes(t); });
  const monthly = systems.filter((s) => !s.archived && !localIds.includes(s.id)).reduce((a, s) => a + Number(s.client_price || 0), 0);
  const late = systems.filter((s) => !s.archived && !localIds.includes(s.id) && status(s).tone === "bad").length;

  /** Tipo de negocio: en el alta, al elegirlo se tildan los módulos sugeridos (después se pueden cambiar a mano). */
  function RubroSelect({ value, onChange, hint }: { value: string; onChange: (v: string) => void; hint?: boolean }) {
    const current = RUBROS.find((r) => r.key === value);
    return (
      <div className="form-group">
        <label>Tipo de negocio</label>
        <select value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">Sin definir</option>
          {RUBROS.map((r) => <option key={r.key} value={r.key}>{r.icon} {r.label}</option>)}
        </select>
        {current && <small className="ss-hint">{current.tagline}</small>}
        {hint && current && (
          <small className="ss-hint">Sugerido para {current.label}: {current.modules.map((m) => MODULE_LABEL[m] || m).join(", ")}</small>
        )}
      </div>
    );
  }

  function ModulePicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
    return (
      <div className="ss-modules">
        {MODULE_GROUPS.map((g) => (
          <div key={g.title} className="ss-module-group">
            <span className="ss-module-title">{g.title}</span>
            <div className="ss-module-grid">
              {g.items.map(([id, label, hint]) => (
                <label key={id} className={`ss-module ${value.includes(id) ? "is-on" : ""}`}>
                  <input type="checkbox" checked={value.includes(id)} onChange={() => onChange(toggle(value, id))} />
                  <span><strong>{label}</strong><small>{hint}</small></span>
                </label>
              ))}
            </div>
          </div>
        ))}
        <div className="ss-module-actions">
          <button type="button" className="ss-link" onClick={() => onChange(MODULE_GROUPS.flatMap((g) => g.items.map((i) => i[0])))}>Marcar todos</button>
          <button type="button" className="ss-link" onClick={() => onChange([])}>Ninguno</button>
          <span>{value.length} seleccionados</span>
        </div>
      </div>
    );
  }

  return (
    <section className="products-page ss-page">
      <div className="products-header">
        <div>
          <span className="dashboard-eyebrow">MEZZTT · VELORA</span>
          <h1>Sistemas</h1>
          <p>Todos los sistemas que creaste: tocá uno para ver y editar sus datos, módulos y pagos.</p>
        </div>
        <div className="products-header-actions">
          <button className="primary-button" onClick={() => { setNf({ ...EMPTY_NEW }); setShowForm(true); }}>+ Nuevo sistema</button>
        </div>
      </div>

      {toast && <div className={`ss-toast is-${toast.tone}`} role="status">{toast.text}</div>}

      <AdminBajas />

      <div className="ss-kpis">
        <div><span>Activos</span><strong>{counts.activos}</strong></div>
        <div><span>Ingreso mensual</span><strong>{money(monthly)}</strong></div>
        <div className={late ? "is-bad" : ""}><span>Con pago atrasado</span><strong>{late}</strong></div>
        <div><span>Dados de baja</span><strong>{counts.inactivos}</strong></div>
      </div>

      <div className="ss-toolbar">
        <div className="ss-tabs">
          <button className={tab === "activos" ? "is-on" : ""} onClick={() => setTab("activos")}>Activos ({counts.activos})</button>
          <button className={tab === "inactivos" ? "is-on" : ""} onClick={() => setTab("inactivos")}>Inactivos ({counts.inactivos})</button>
          <button className={tab === "locales" ? "is-on" : ""} onClick={() => setTab("locales")}>Comprados · locales ({counts.locales})</button>
        </div>
        <div className="products-search">
          <span className="products-search-icon">⌕</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar sistema o email..." />
        </div>
      </div>

      {loading ? (
        <div className="products-loading"><div className="products-loading-spinner" /><span>Cargando...</span></div>
      ) : visible.length === 0 ? (
        <div className="products-empty">
          <h3>{systems.length === 0 ? "Todavía no creaste ningún sistema" : q ? "No hay sistemas con esa búsqueda" : `No hay sistemas ${tab === "locales" ? "comprados (locales)" : tab}`}</h3>
        </div>
      ) : (
        <div className="ss-grid">
          {visible.map((s) => {
            const st = localIds.includes(s.id) ? { label: "Comprado · local", tone: (s.archived ? "off" : "ok") as ReturnType<typeof status>["tone"] } : status(s);
            const mods = splitList(s.enabled_modules);
            return (
              <button key={s.id} className="ss-card" onClick={() => openDetail(s)}>
                <span className={`ss-status is-${st.tone}`}><i />{st.label}</span>
                <strong className="ss-card-name">{s.name}</strong>
                <span className="ss-card-price">{localIds.includes(s.id) ? "Pago único" : s.client_price ? `${money(s.client_price)} / mes` : "Sin precio cargado"}</span>
                <span className="ss-card-meta">
                  {mods.length} módulo{mods.length === 1 ? "" : "s"}
                  {(mods.includes("landing") || mods.includes("ecommerce")) && " · 🌐 Web"}
                  {!localIds.includes(s.id) && s.payment_due_date && ` · vence ${shortDate(s.payment_due_date)}`}
                </span>
                <span className="ss-chips">
                  {mods.slice(0, 5).map((m) => <span key={m}>{MODULE_LABEL[m] || m}</span>)}
                  {mods.length > 5 && <span>+{mods.length - 5}</span>}
                </span>
                <span className="ss-card-edit">Ver y editar →</span>
              </button>
            );
          })}
        </div>
      )}

      {/* ================= NUEVO ================= */}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="product-modal ss-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div><span className="dashboard-eyebrow">NUEVO</span><h2>Nuevo sistema</h2></div>
              <button className="modal-close" onClick={() => setShowForm(false)}>×</button>
            </div>
            <form onSubmit={createSystem} className="product-form">
              <h3 className="ss-h">Empresa</h3>
              <div className="form-row">
                <div className="form-group"><label>Nombre de la empresa</label><input value={nf.company_name} onChange={(e) => setNf({ ...nf, company_name: e.target.value })} required /></div>
                <div className="form-group"><label>País</label><input value={nf.country} onChange={(e) => setNf({ ...nf, country: e.target.value })} /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>Email de contacto</label><input type="email" value={nf.email} onChange={(e) => setNf({ ...nf, email: e.target.value })} placeholder="Si lo dejás vacío, usa el del admin" /></div>
                <div className="form-group"><label>Teléfono</label><input value={nf.phone} onChange={(e) => setNf({ ...nf, phone: e.target.value })} /></div>
              </div>

              <h3 className="ss-h">Módulos</h3>
              <RubroSelect
                value={nf.rubro}
                hint
                onChange={(v) => setNf({ ...nf, rubro: v, modules: v ? RUBROS.find((r) => r.key === v)?.modules ?? nf.modules : nf.modules })}
              />
              <ModulePicker value={nf.modules} onChange={(v) => setNf({ ...nf, modules: v })} />

              <h3 className="ss-h">Cobro</h3>
              <div className="form-row">
                <div className="form-group">
                  <label>Precio mensual</label>
                  <input type="number" min={0} step="0.01" value={nf.price} onChange={(e) => setNf({ ...nf, price: e.target.value })} />
                  {SuggestedFee({ modules: nf.modules, applyIva: nf.apply_iva, current: nf.price, onUse: (value) => setNf({ ...nf, price: value }), showInitial: true })}
                </div>
                <div className="form-group"><label>Próximo vencimiento</label><DateField value={nf.due} onChange={(e) => setNf({ ...nf, due: e.target.value })} /></div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Estado de pago</label>
                  <select value={nf.payment_status} onChange={(e) => setNf({ ...nf, payment_status: e.target.value })}>
                    <option value="al_dia">Al día</option><option value="pendiente">Pendiente</option><option value="vencido">Vencido</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Facturación</label>
                  <div className="ss-checks">
                    <label><input type="checkbox" checked={nf.billed} onChange={(e) => setNf({ ...nf, billed: e.target.checked })} /> Se factura</label>
                    <label><input type="checkbox" checked={nf.apply_iva} onChange={(e) => setNf({ ...nf, apply_iva: e.target.checked })} /> IVA 21%</label>
                  </div>
                </div>
              </div>

              <h3 className="ss-h">Usuario administrador del cliente</h3>
              <div className="form-row">
                <div className="form-group"><label>Nombre</label><input value={nf.admin_name} onChange={(e) => setNf({ ...nf, admin_name: e.target.value })} /></div>
                <div className="form-group"><label>Email (para entrar)</label><input type="email" value={nf.admin_email} onChange={(e) => setNf({ ...nf, admin_email: e.target.value })} required /></div>
              </div>
              <div className="form-group"><label>Contraseña inicial</label><input value={nf.admin_password} onChange={(e) => setNf({ ...nf, admin_password: e.target.value })} required minLength={6} /></div>

              <div className="modal-actions">
                <button type="button" className="secondary-button" onClick={() => setShowForm(false)}>Cancelar</button>
                <button type="submit" className="primary-button" disabled={saving}>{saving ? "Creando..." : "Crear sistema"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= DETALLE ================= */}
      {detail && edit && (
        <div className="modal-overlay" onClick={() => setDetail(null)}>
          <div className="product-modal ss-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <span className="dashboard-eyebrow">SISTEMA #{detail.id} · ALTA {shortDate(detail.created_at)}</span>
                <h2>{detail.name}</h2>
                <span className={`ss-status is-${status(detail).tone}`}><i />{status(detail).label}</span>
              </div>
              <button className="modal-close" onClick={() => setDetail(null)}>×</button>
            </div>

            <div className="ss-tabs ss-tabs-modal">
              {(["info", "pagos", "usuarios", "mail", "app", "seguridad"] as DetailTab[]).map((t) => (
                <button key={t} className={detailTab === t ? "is-on" : ""} onClick={() => setDetailTab(t)}>
                  {{ info: "Datos y módulos", pagos: `Pagos (${payments.length})`, usuarios: `Usuarios (${users.length})`, mail: "Enviar mail", app: "App de escritorio", seguridad: "Seguridad" }[t]}
                </button>
              ))}
            </div>

            {detailTab === "info" && (
              <div className="product-form">
                <div className="form-row">
                  <div className="form-group"><label>Nombre</label><input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></div>
                  <div className="form-group"><label>País</label><input value={edit.country} onChange={(e) => setEdit({ ...edit, country: e.target.value })} /></div>
                </div>
                <div className="form-row">
                  <div className="form-group"><label>Email</label><input type="email" value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></div>
                  <div className="form-group"><label>Teléfono</label><input value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></div>
                </div>

                <RubroSelect value={edit.rubro} onChange={(v) => setEdit({ ...edit, rubro: v })} />
                <div className="form-group">
                  <label>Módulos</label>
                  <ModulePicker value={edit.enabled_modules} onChange={(v) => setEdit({ ...edit, enabled_modules: v })} />
                  {(edit.enabled_modules.includes("landing") || edit.enabled_modules.includes("ecommerce")) && (
                    <small className="ss-hint">
                      {detail.store_slug
                        ? <>Tienda online: <a href={`${window.location.origin}/tienda/${detail.store_slug}`} target="_blank" rel="noopener">{window.location.host}/tienda/{detail.store_slug}</a></>
                        : "El cliente configura su tienda desde “Tienda online” en su sistema."}
                    </small>
                  )}
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Precio mensual</label>
                    <input type="number" min={0} step="0.01" value={edit.client_price} onChange={(e) => setEdit({ ...edit, client_price: e.target.value })} />
                    {SuggestedFee({ modules: edit.enabled_modules, applyIva: edit.apply_iva, current: edit.client_price, onUse: (value) => setEdit({ ...edit, client_price: value }) })}
                  </div>
                  <div className="form-group">
                    <label>Estado de pago</label>
                    <select value={edit.payment_status} onChange={(e) => setEdit({ ...edit, payment_status: e.target.value })}>
                      <option value="al_dia">Al día</option><option value="pendiente">Pendiente</option><option value="vencido">Vencido</option>
                    </select>
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group"><label>Próximo vencimiento</label><DateField value={edit.payment_due_date} onChange={(e) => setEdit({ ...edit, payment_due_date: e.target.value })} /></div>
                  <div className="form-group">
                    <label>Facturación</label>
                    <div className="ss-checks">
                      <label><input type="checkbox" checked={edit.billed} onChange={(e) => setEdit({ ...edit, billed: e.target.checked })} /> Se factura</label>
                      <label><input type="checkbox" checked={edit.apply_iva} onChange={(e) => setEdit({ ...edit, apply_iva: e.target.checked })} /> IVA 21%</label>
                    </div>
                  </div>
                </div>
                <div className={`ss-savebar ${dirty ? "is-dirty" : ""}`}>
                  <span>{dirty ? "Tenés cambios sin guardar" : "Todo guardado"}</span>
                  <div>
                    {dirty && <button type="button" className="secondary-button" onClick={() => openDetail(detail)}>Descartar</button>}
                    <button className="primary-button" type="button" onClick={saveInfo} disabled={!dirty || saving}>{saving ? "Guardando..." : "Guardar cambios"}</button>
                  </div>
                </div>
              </div>
            )}

            {detailTab === "pagos" && (
              <div className="product-form">
                <div className="form-row">
                  <div className="form-group"><label>Monto</label><input type="number" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} /></div>
                  <div className="form-group">
                    <label>Método</label>
                    <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>
                      <option>Transferencia</option><option>Efectivo</option><option>Mercado Pago</option><option>Otro</option>
                    </select>
                  </div>
                </div>
                <div className="form-group"><label>Notas</label><input value={payNotes} onChange={(e) => setPayNotes(e.target.value)} placeholder="Opcional (ej: Octubre)" /></div>
                <small className="ss-hint">Al registrar el pago el sistema queda “Al día” y el vencimiento pasa al mes siguiente.</small>
                <button className="primary-button" type="button" onClick={addPayment} disabled={!payAmount} style={{ alignSelf: "flex-start" }}>Registrar pago</button>
                {payments.length === 0 ? <p className="ss-hint">Sin pagos todavía.</p> : (
                  <div className="import-table-wrapper" style={{ marginTop: 12 }}>
                    <table className="import-table">
                      <thead><tr><th>Fecha</th><th>Monto</th><th>Método</th><th>Notas</th></tr></thead>
                      <tbody>
                        {payments.map((p) => (
                          <tr key={p.id}><td>{shortDate(p.payment_date)}</td><td>{money(p.amount)}</td><td>{p.method || "—"}</td><td>{p.notes || "—"}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {detailTab === "usuarios" && (
              <div className="product-form">
                {users.length === 0 ? <p className="ss-hint">Sin usuarios.</p> : (
                  <div className="import-table-wrapper">
                    <table className="import-table">
                      <thead><tr><th>Nombre</th><th>Email</th><th>Rol</th><th>Estado</th></tr></thead>
                      <tbody>
                        {users.map((u) => (
                          <tr key={u.id}><td>{u.name}</td><td>{u.email}</td><td>{u.role}</td><td>{u.active === false ? "Inactivo" : "Activo"}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <small className="ss-hint">Los usuarios los crea el propio cliente desde su sistema. Desde Seguridad podés resetear contraseñas.</small>
              </div>
            )}

            {detailTab === "mail" && <MailCompose companyId={detail.id} status={(detail as any).payment_status} dueDate={(detail as any).payment_due_date} />}
          {detailTab === "app" && <AppDesktop companyId={detail.id} users={users} />}
            {detailTab === "seguridad" && (
              <div className="product-form">
                <p className="ss-danger">Cierra TODAS las sesiones del sistema y cambia la contraseña del usuario elegido.</p>
                <div className="form-row">
                  <div className="form-group">
                    <label>Usuario</label>
                    <select value={resetUserId} onChange={(e) => setResetUserId(e.target.value)}>
                      <option value="">Administrador principal</option>
                      {users.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}
                    </select>
                  </div>
                  <div className="form-group"><label>Contraseña nueva</label><input value={newPassword} onChange={(e) => setNewPassword(e.target.value)} /></div>
                </div>
                <button className="product-action-delete" type="button" onClick={doSecurityReset} disabled={!newPassword} style={{ alignSelf: "flex-start" }}>Cerrar sesiones y resetear</button>
                <hr className="ss-hr" />
                <p className="ss-danger">
                  {detail.archived ? "Reactivar este sistema (vuelve a Activos y sus usuarios pueden entrar de nuevo)." : "Dar de baja este sistema (pasa a Inactivos y sus usuarios no van a poder entrar)."}
                </p>
                <div className="form-group"><label>Tu contraseña del panel</label><input type="password" value={closePassword} onChange={(e) => setClosePassword(e.target.value)} /></div>
                <button className="product-action-delete" type="button" onClick={toggleActive} disabled={!closePassword} style={{ alignSelf: "flex-start" }}>
                  {detail.archived ? "Reactivar sistema" : "Dar de baja sistema"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

export default Sistemas;
