import { useEffect, useState } from "react";
import QuoteFlowModal from "../components/QuoteFlowModal";
import BuzonCotizaciones from "../components/BuzonCotizaciones";
import { statusLabel } from "../extras";
import { API_URL } from "../apiBase";
import DateField from "../components/DateField";

const MODULES = ["clientes","proveedores","productos","stock","pedidos","entregas","facturacion","cuentas","compras","pos","caja","reportes","vendedores","landing","ecommerce"];
const MODULE_LABELS: Record<string, string> = {
  clientes: "Clientes", proveedores: "Proveedores", productos: "Productos", stock: "Stock",
  pedidos: "Pedidos", entregas: "Entregas", facturacion: "Facturación", cuentas: "Cuentas Corrientes",
  compras: "Compras", pos: "Punto de Venta", caja: "Caja", reportes: "Reportes",
  vendedores: "Vendedores y comisiones",
  landing: "Landing Page", ecommerce: "E-Commerce", // sumalos a MODULE_LABELS
};
const MODULE_HINTS: Record<string, string> = {
  vendedores: "Vendedor en cada pedido y venta, comisiones por mes y liquidaciones",
};
const WEB_MODULES = ["landing", "ecommerce"];

function usd(value: number | string | null | undefined): string {
  return "USD " + Number(value || 0).toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

// Planes sobre el abono mensual (iguales a backend/plans.py)
const TRIMESTRAL_MESES = 3, TRIMESTRAL_MESES_PAGOS = 2, ANUAL_MESES = 12, ANUAL_MESES_PAGOS = 10;
function planAmounts(monthly: number) {
  return {
    quarterly: monthly * TRIMESTRAL_MESES_PAGOS, quarterlyFree: TRIMESTRAL_MESES - TRIMESTRAL_MESES_PAGOS,
    annual: monthly * ANUAL_MESES_PAGOS, annualFree: ANUAL_MESES - ANUAL_MESES_PAGOS,
    annualSavings: monthly * ANUAL_MESES - monthly * ANUAL_MESES_PAGOS,
  };
}
const monthWord = (n: number) => `${n} mes${n === 1 ? "" : "es"} gratis`;

interface Pricing {
  setup: number; modulesCount: number; modulePrice: number; modulesTotal: number;
  hasLanding: boolean; hasEcommerce: boolean; websTotal: number;
  initialSubtotal: number; initialIva: number; initialTotal: number;
  monthlySubtotal: number; monthlyIva: number; monthlyTotal: number;
}

/** Misma cuenta que el servidor: pago inicial = configuración + módulos + webs · abono mensual = módulos + webs. */
function calcPricing(settings: any, mods: string[], applyIva: boolean, extraType = "NINGUNO"): Pricing {
  const modulePrice = Number(settings?.module_price ?? 0);
  const setup = Number(settings?.base_cost ?? 0);
  const unique = Array.from(new Set(mods.filter(Boolean)));
  const modulesCount = unique.filter((m) => !WEB_MODULES.includes(m)).length;
  const hasLanding = unique.includes("landing") || extraType === "LANDING";
  const hasEcommerce = unique.includes("ecommerce") || extraType === "ECOMMERCE";
  const websTotal = hasLanding && hasEcommerce
    ? Number(settings?.web_combo_price ?? 0)
    : hasLanding ? Number(settings?.landing_price ?? 0)
    : hasEcommerce ? Number(settings?.ecommerce_price ?? 0) : 0;
  const modulesTotal = modulePrice * modulesCount;
  const monthlySubtotal = modulesTotal + websTotal;
  const initialSubtotal = setup + monthlySubtotal;
  const rate = applyIva ? 0.21 : 0;
  return {
    setup, modulesCount, modulePrice, modulesTotal, hasLanding, hasEcommerce, websTotal,
    initialSubtotal, initialIva: initialSubtotal * rate, initialTotal: initialSubtotal * (1 + rate),
    monthlySubtotal, monthlyIva: monthlySubtotal * rate, monthlyTotal: monthlySubtotal * (1 + rate),
  };
}

function PricingBoxes({ pricing, applyIva }: { pricing: Pricing; applyIva: boolean }) {
  const ivaText = applyIva ? "con IVA 21%" : "sin IVA";
  return (
    <div className="vx-totals">
      <div className="vx-total-box">
        <span>Pago inicial (una sola vez)</span>
        <strong>{usd(pricing.initialTotal)}</strong>
        <small>
          Configuración {usd(pricing.setup)} + {pricing.modulesCount} módulo{pricing.modulesCount === 1 ? "" : "s"} {usd(pricing.modulesTotal)}
          {pricing.websTotal > 0 ? ` + web ${usd(pricing.websTotal)}` : ""} · {ivaText}
        </small>
      </div>
      <div className="vx-total-box">
        <span>Abono mensual</span>
        <strong>{usd(pricing.monthlyTotal)}</strong>
        <small>
          {pricing.modulesCount} módulo{pricing.modulesCount === 1 ? "" : "s"} {usd(pricing.modulesTotal)}
          {pricing.websTotal > 0 ? ` + web ${usd(pricing.websTotal)}` : ""} · {ivaText} · sin configuración
        </small>
        <PlanLines monthly={pricing.monthlyTotal} />
      </div>
    </div>
  );
}

function PlanLines({ monthly }: { monthly: number }) {
  if (!(monthly > 0)) return null;
  const pl = planAmounts(monthly);
  return (
    <div className="vx-plans">
      <small>Trimestral: <strong>{usd(pl.quarterly)}</strong> ({monthWord(pl.quarterlyFree)})</small>
      <small>Anual: <strong>{usd(pl.annual)}</strong> ({monthWord(pl.annualFree)}, ahorrás {usd(pl.annualSavings)})</small>
    </div>
  );
}
const QUOTE_STATUSES = ["TODAS", "BORRADOR", "ENVIADA", "ACEPTADA", "RECHAZADA"];
const TAB_LABEL: Record<string, string> = { TODAS: "Todas", BORRADOR: "Nuevas", ENVIADA: "Enviadas", ACEPTADA: "Aceptadas", RECHAZADA: "Rechazadas" };

function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem("velora_admin_token")}` };
}

async function veloraApi<T = any>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: options.method || "GET",
    headers: { ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}), ...authHeaders() },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof data.detail === "string" ? data.detail : "No se pudo completar la acción. Revisá los datos.");
  return data as T;
}

function ModuleCheckbox({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: () => void; hint?: string }) {
  return (
    <label title={hint} style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
      <input
        type="checkbox"
        style={{ width: 14, height: 14, flexShrink: 0 }}
        checked={checked}
        onChange={onChange}
      />
      {label}
    </label>
  );
}

// Datos que llegan en el mensaje de la solicitud web: forma de uso (mensual o un solo pago) y POS pedido
function quoteTags(notes?: string | null) {
  const n = String(notes || "");
  const uso = (n.match(/Forma de uso: ([^·]+)/) || [])[1];
  const pos = (n.match(/POS: ([^·]+)/) || [])[1];
  return { uso: uso ? uso.trim() : "", pos: pos ? pos.trim() : "" };
}

function AdminBilling() {
  const [tab, setTab] = useState<"cotizaciones" | "facturas">("cotizaciones");
  const [quotes, setQuotes] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [systems, setSystems] = useState<any[]>([]);
  const [billingSettings, setBillingSettings] = useState<any>(null);

  // nueva cotización
  const [clientName, setClientName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [modules, setModules] = useState<string[]>([]);
  const [applyIva, setApplyIva] = useState(true);
  const [deliveryDate, setDeliveryDate] = useState("");

  // detalle/edición de cotización
  const [selectedQuote, setSelectedQuote] = useState<any>(null);

  // nueva factura
  const [showInvoiceForm, setShowInvoiceForm] = useState(false);
  const [invoiceSystemId, setInvoiceSystemId] = useState("");
  const [generatingInvoice, setGeneratingInvoice] = useState(false);

  // detalle de factura
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  const [invoiceOwnerName, setInvoiceOwnerName] = useState("");

  // filtros
  const [quoteFilter, setQuoteFilter] = useState("TODAS");
  const [invoiceFilter, setInvoiceFilter] = useState<"activos" | "inactivos">("activos");

  async function load() {
    const [q, i, s, bs] = await Promise.all([
      fetch(`${API_URL}/admin/quotes`, { headers: authHeaders() }),
      fetch(`${API_URL}/admin/invoices`, { headers: authHeaders() }),
      fetch(`${API_URL}/admin/systems`, { headers: authHeaders() }),
      fetch(`${API_URL}/admin/billing-settings`, { headers: authHeaders() }),
    ]);
    if (q.ok) setQuotes(await q.json());
    if (i.ok) setInvoices(await i.json());
    if (s.ok) setSystems(await s.json());
    if (bs.ok) setBillingSettings(await bs.json());
  }
  useEffect(() => { load(); }, []);

  function toggleModule(m: string) {
    setModules((c) => (c.includes(m) ? c.filter((x) => x !== m) : [...c, m]));
  }
  async function deleteQuote(id: number) {
    if (!confirm("¿Borrar esta cotización? No se puede deshacer.")) return;
    const res = await fetch(`${API_URL}/admin/quotes/${id}`, { method: "DELETE", headers: authHeaders() });
    if (!res.ok) {
      const d = await res.json();
      alert(d.detail || "No se pudo borrar");
      return;
    }
    setSelectedQuote(null);
    await load();
  }

  async function createQuote() {
  const res = await fetch(`${API_URL}/admin/quotes`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({
      client_name: clientName, business_name: businessName, email,
      modules, apply_iva: applyIva,
      delivery_date: deliveryDate || null,
    }),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    alert(typeof d.detail === "string" ? d.detail : "No se pudo crear la cotización. Revisá que tenga cliente y negocio.");
    return;
  }
  setClientName(""); setBusinessName(""); setEmail(""); setModules([]); setDeliveryDate("");
  await load();
}

  function openQuote(q: any) {
    setSelectedQuote(q);
  }
  
  function loadIntoForm(q: any) {
  setClientName(q.client_name);
  setBusinessName(q.business_name);
  setEmail(q.email || "");
  setModules((q.modules || "").split(",").filter(Boolean));
  setApplyIva(q.apply_iva);
  setDeliveryDate(q.delivery_date ? q.delivery_date.slice(0, 10) : "");
  window.scrollTo({ top: 0, behavior: "smooth" });
}
  
  /**
   * Renglones de una cotización (monthly = false: pago inicial, con configuración)
   * o de una factura mensual / abono (monthly = true: sin configuración).
   */
  function buildLineItems(q: any, monthly = false) {
    const mods: string[] = (q.modules || "").split(",").map((m: string) => m.trim()).filter(Boolean);
    const p = calcPricing(billingSettings, mods, false, q.extra_type);
    const items: { label: string; qty: number; price: number }[] = Array.from(new Set(mods))
      .filter((m) => !WEB_MODULES.includes(m))
      .map((m) => ({ label: `Módulo ${MODULE_LABELS[m] || m}`, qty: 1, price: p.modulePrice }));
    if (p.hasLanding && p.hasEcommerce) items.push({ label: "Web: Landing Page + E-commerce", qty: 1, price: p.websTotal });
    else if (p.hasLanding) items.push({ label: "Web: Landing Page", qty: 1, price: p.websTotal });
    else if (p.hasEcommerce) items.push({ label: "Web: E-commerce", qty: 1, price: p.websTotal });
    if (!monthly) items.push({ label: "Configuración (se cobra una sola vez)", qty: 1, price: p.setup });
    return items;
  }

  /** Renglones de un documento ya guardado: si los precios cambiaron después, se muestra el importe guardado. */
  function storedLineItems(doc: any, monthly: boolean) {
    const items = buildLineItems(doc, monthly);
    const sum = items.reduce((a, it) => a + it.qty * it.price, 0);
    if (Math.abs(sum - Number(doc.subtotal || 0)) > 0.01) {
      const label = monthly
        ? `Abono del período ${doc.period} (con los precios de ese momento)`
        : "Sistema según los módulos elegidos (con los precios de ese momento)";
      return [{ label, qty: 1, price: Number(doc.subtotal || 0) }];
    }
    return items;
  }

  function printDocument(title: string, docNumber: string, toName: string, businessNameLabel: string, q: any, monthly = false) {
    const items = storedLineItems(q, monthly);
    const rows = items.map((it: any) => `
      <tr>
        <td>${it.label}</td>
        <td style="text-align:center">${it.qty}</td>
        <td style="text-align:right">${usd(it.price)}</td>
        <td style="text-align:right">${usd(it.qty * it.price)}</td>
      </tr>`).join("");

    const hasMonthly = !monthly && Number(q.monthly_total || 0) > 0;
    const pl = planAmounts(Number(q.monthly_total || 0));
    const totals = monthly
      ? `
        <div class="totales">
          <p>Subtotal: ${usd(q.subtotal)}</p>
          ${q.apply_iva ? `<p>IVA 21%: ${usd(q.iva_amount)}</p>` : ""}
          <p><strong>Total del abono mensual: ${usd(q.total)}</strong></p>
        </div>`
      : `
        <div class="cajas">
          <div class="caja">
            <h2>Pago inicial (una sola vez)</h2>
            <p>Subtotal: ${usd(q.subtotal)}</p>
            ${q.apply_iva ? `<p>IVA 21%: ${usd(q.iva_amount)}</p>` : ""}
            <p><strong>Total: ${usd(q.total)}</strong></p>
            <p class="nota">Incluye la configuración, los módulos y la web del primer mes.</p>
          </div>
          ${hasMonthly ? `
          <div class="caja">
            <h2>Abono mensual</h2>
            <p>Subtotal: ${usd(q.monthly_subtotal)}</p>
            ${q.apply_iva ? `<p>IVA 21%: ${usd(q.monthly_iva)}</p>` : ""}
            <p><strong>Total por mes: ${usd(q.monthly_total)}</strong></p>
            <p class="nota">Desde el segundo mes: módulos y web, sin configuración.</p>
            <p>Trimestral: ${usd(pl.quarterly)} (${monthWord(pl.quarterlyFree)})</p>
            <p>Anual: ${usd(pl.annual)} (${monthWord(pl.annualFree)}, ahorrás ${usd(pl.annualSavings)})</p>
          </div>` : ""}
        </div>`;

    const html = `
      <html><head><title>${title} ${docNumber}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 36px; color: #241f1b; }
        h1 { font-size: 22px; margin-bottom: 2px; }
        h2 { font-size: 14px; margin: 0 0 8px; }
        .sub { color: #5e5349; font-size: 12px; margin-bottom: 24px; }
        p { font-size: 13px; margin: 4px 0; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { border: 1px solid #ccc; padding: 8px; font-size: 12px; }
        th { background: #f4efe7; text-align: left; }
        .totales { margin-top: 16px; text-align: right; font-size: 14px; }
        .totales strong, .caja strong { font-size: 16px; }
        .cajas { display: flex; gap: 16px; margin-top: 18px; }
        .caja { flex: 1; border: 1px solid #ccc; border-radius: 8px; padding: 14px; }
        .nota { color: #5e5349; font-size: 11px; margin-top: 8px; }
        .no-fiscal { margin-top: 28px; font-size: 11px; font-weight: bold; letter-spacing: 0.5px; }
      </style></head>
      <body>
        <h1>${title}</h1>
        <div class="sub">N° ${docNumber} · ${new Date().toLocaleDateString("es-AR")} · Precios en dólares (USD)</div>
        <p><strong>Cliente:</strong> ${toName}</p>
        <p><strong>Negocio:</strong> ${businessNameLabel}</p>
        <table>
          <thead><tr><th>Ítem</th><th>Cant.</th><th>Precio</th><th>Subtotal</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        ${totals}
        <p class="no-fiscal">DOCUMENTO NO VÁLIDO COMO FACTURA</p>
      </body></html>`;

    const w = window.open("", "_blank");
    if (!w) { alert("Habilitá las ventanas emergentes."); return; }
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
  }

  async function generateInvoice() {
    if (!invoiceSystemId) return;
    setGeneratingInvoice(true);
    try {
      const res = await fetch(`${API_URL}/admin/systems/${invoiceSystemId}/generate-invoice`, {
        method: "POST",
        headers: authHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "No se pudo generar");
      setShowInvoiceForm(false);
      setInvoiceSystemId("");
      await load();
    } catch (error) {
      alert(error instanceof Error ? error.message : "No se pudo generar la factura.");
    } finally {
      setGeneratingInvoice(false);
    }
  }

  async function openInvoice(inv: any) {
    setSelectedInvoice(inv);
    setInvoiceOwnerName("");
    try {
      const res = await fetch(`${API_URL}/admin/systems/${inv.company_id}/users`, { headers: authHeaders() });
      if (res.ok) {
        const users = await res.json();
        const adminUser = users.find((u: any) => u.role === "ADMINISTRADOR") || users[0];
        if (adminUser) setInvoiceOwnerName(adminUser.name);
      }
    } catch {}
  }

  function systemName(id: number) {
    return systems.find((s) => s.id === id)?.name || `Sistema #${id}`;
  }

  const filteredQuotes = quotes.filter((q) => quoteFilter === "TODAS" || q.status === quoteFilter);
  const filteredInvoices = invoices.filter((inv) => {
    const sys = systems.find((s) => s.id === inv.company_id);
    const archived = sys?.archived ?? false;
    return invoiceFilter === "activos" ? !archived : archived;
  });

  return (
    <section className="products-page">
      <div className="products-header">
        <div><span className="dashboard-eyebrow">MEZTTT</span><h1>Facturación</h1></div>
        {tab === "facturas" && (
          <div className="products-header-actions">
            <button className="primary-button" onClick={() => setShowInvoiceForm(true)}>+ Nueva factura</button>
          </div>
        )}
      </div>

      <div className="product-actions" style={{ marginBottom: 20 }}>
        <button className={tab === "cotizaciones" ? "primary-button" : "secondary-button"} onClick={() => setTab("cotizaciones")}>Cotizaciones</button>
        <button className={tab === "facturas" ? "primary-button" : "secondary-button"} onClick={() => setTab("facturas")}>Facturas</button>
      </div>

      {tab === "cotizaciones" && <BuzonCotizaciones sistema="velora" apiUrl={API_URL} onDone={load} />}

      {tab === "cotizaciones" && (
        <>
          <div className="dashboard-section" style={{ marginBottom: 20 }}>
            <div className="section-heading"><h2>Nueva cotización</h2></div>
            <div className="form-row">
              <div className="form-group"><label>Cliente</label><input value={clientName} onChange={(e) => setClientName(e.target.value)} /></div>
              <div className="form-group"><label>Negocio</label><input value={businessName} onChange={(e) => setBusinessName(e.target.value)} /></div>
            </div>
            <div className="form-group"><label>Email</label><input value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div className="form-group">
              <label>Módulos</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                {MODULES.map((m) => (
                  <ModuleCheckbox key={m} label={MODULE_LABELS[m]} hint={MODULE_HINTS[m]} checked={modules.includes(m)} onChange={() => toggleModule(m)} />
                ))}
              </div>
            </div>
            <div className="form-row">
          
              <div className="form-group">
                <label>Entrega estimada</label>
                <DateField value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} />
              </div>
            </div>
            <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6, marginBottom: 14 }}>
              <input type="checkbox" style={{ width: 14, height: 14, flexShrink: 0 }} checked={applyIva} onChange={(e) => setApplyIva(e.target.checked)} />
              Aplicar IVA 21%
            </label>
            {billingSettings && (
              <div style={{ marginBottom: 14 }}>
                <PricingBoxes pricing={calcPricing(billingSettings, modules, applyIva)} applyIva={applyIva} />
                <p className="vx-hint" style={{ marginTop: 8 }}>
                  Una web sola se cobra {usd(billingSettings.landing_price)}; las dos juntas (Landing + E-commerce), {usd(billingSettings.web_combo_price)}. Los precios se cambian en Configuración.
                </p>
              </div>
            )}
            <button className="primary-button" onClick={createQuote} style={{ alignSelf: "flex-start" }}>Crear cotización</button>
          </div>

          <div className="product-actions" style={{ marginBottom: 12 }}>
            {QUOTE_STATUSES.map((s) => (
              <button key={s} className={quoteFilter === s ? "primary-button" : "secondary-button"} onClick={() => setQuoteFilter(s)}>
                {TAB_LABEL[s] || s}
              </button>
            ))}
          </div>

          <div className="products-table-container">
            {filteredQuotes.length === 0 ? (
              <div className="products-empty"><p>No hay cotizaciones para este filtro.</p></div>
            ) : (
              <div className="products-table-wrapper">
                <table className="products-table">
                  <thead><tr><th>Cliente</th><th>Módulos</th><th>Pago inicial</th><th>Abono mensual</th><th>Estado</th><th></th></tr></thead>
                  <tbody>
                    {filteredQuotes.map((q) => (
                      <tr key={q.id}>
                        <td>{q.business_name}{(() => { const tg = quoteTags(q.notes); return (<>{String(q.notes || "").startsWith("Pedido desde la web") && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 999, background: "rgba(210,154,98,.18)", color: "inherit", whiteSpace: "nowrap" }}>Web</span>}{tg.uso && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 999, background: "rgba(210,154,98,.18)", color: "inherit", whiteSpace: "nowrap" }}>{tg.uso.startsWith("Mensual") ? "Mensual" : "Un solo pago"}</span>}{tg.pos && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 999, background: "rgba(210,154,98,.18)", color: "inherit", whiteSpace: "nowrap" }}>POS</span>}</>); })()}</td>
                        <td style={{ fontSize: 11 }}>{(q.modules || "").split(",").filter(Boolean).map((m: string) => MODULE_LABELS[m] || m).join(", ")}</td>
                        <td>{usd(q.total)}</td>
                        <td>{Number(q.monthly_total || 0) > 0 ? `${usd(q.monthly_total)} / mes` : "—"}</td>
                        <td><span className="status-active" data-status={q.status}><span className="status-dot" />{statusLabel(q.status)}</span></td>
                        <td>
  {q.status === "BORRADOR" && (
    <button className="primary-button" onClick={() => loadIntoForm(q)} style={{ marginRight: 6 }}>Cotizar</button>
  )}
  <button className="product-action-edit" onClick={() => openQuote(q)}>Ver</button>
  {q.status === "BORRADOR" && (
    <button className="product-action-delete" onClick={() => deleteQuote(q.id)} style={{ marginLeft: 6 }}>Borrar</button>
  )}
</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {tab === "facturas" && (
        <>
          <div className="product-actions" style={{ marginBottom: 12 }}>
            <button className={invoiceFilter === "activos" ? "primary-button" : "secondary-button"} onClick={() => setInvoiceFilter("activos")}>Sistemas activos</button>
            <button className={invoiceFilter === "inactivos" ? "primary-button" : "secondary-button"} onClick={() => setInvoiceFilter("inactivos")}>Sistemas dados de baja</button>
          </div>

          <div className="products-table-container">
            {filteredInvoices.length === 0 ? (
              <div className="products-empty"><p>No hay facturas para este filtro.</p></div>
            ) : (
              <div className="products-table-wrapper">
                <table className="products-table">
                  <thead><tr><th>Período</th><th>Sistema</th><th>Abono mensual</th><th>Estado</th><th></th></tr></thead>
                  <tbody>
                    {filteredInvoices.map((inv) => (
                      <tr key={inv.id}>
                        <td>{inv.period}</td>
                        <td>{systemName(inv.company_id)}</td>
                        <td>{usd(inv.total)}</td>
                        <td><span className="status-active" data-status={inv.status}><span className="status-dot" />{statusLabel(inv.status)}</span></td>
                        <td><button className="product-action-edit" onClick={() => openInvoice(inv)}>Ver</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* COTIZACIÓN: precio del POS y del pago único, envío por mail, aceptar/rechazar (QuoteFlowModal) */}
      {selectedQuote && (
        <QuoteFlowModal
          quote={selectedQuote}
          api={veloraApi}
          fmt={usd}
          brandName="Velora"
          labelOf={(m: string) => MODULE_LABELS[m] || m}
          renderModules={(c) => (
            <>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                  {MODULES.map((m) => (
                    <ModuleCheckbox key={m} label={MODULE_LABELS[m]} hint={MODULE_HINTS[m]} checked={c.value.includes(m)} onChange={() => c.onChange(c.value.includes(m) ? c.value.filter((x: string) => x !== m) : [...c.value, m])} />
                  ))}
                </div>
                <div className="form-group" style={{ marginTop: 10 }}>
                  <label>Web pedida desde el sitio</label>
                  <select value={c.extra || "NINGUNO"} onChange={(e) => c.setExtra(e.target.value)}>
                    <option value="NINGUNO">Ninguna (valen los módulos tildados)</option>
                    <option value="LANDING">Landing Page</option>
                    <option value="ECOMMERCE">E-Commerce</option>
                  </select>
                </div>
              </>
          )}
          onClose={() => setSelectedQuote(null)}
          onChanged={load}
          onDelete={deleteQuote}
        />
      )}

      {/* MODAL: NUEVA FACTURA */}
      {showInvoiceForm && (
        <div className="modal-overlay" onClick={() => setShowInvoiceForm(false)}>
          <div className="product-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div><span className="dashboard-eyebrow">FACTURAS</span><h2>Nueva factura mensual</h2></div>
              <button className="modal-close" onClick={() => setShowInvoiceForm(false)}>×</button>
            </div>
            <div className="product-form">
              <div className="form-group">
                <label>Sistema</label>
                <select value={invoiceSystemId} onChange={(e) => setInvoiceSystemId(e.target.value)}>
                  <option value="">Elegí un sistema</option>
                  {systems.filter((s) => s.billed && !s.archived).map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <p className="vx-hint">
                Solo se muestran sistemas activos marcados como "se factura". La factura es el abono mensual: {usd(billingSettings?.module_price)} por
                cada módulo del sistema más la web ({usd(billingSettings?.landing_price)} una sola, {usd(billingSettings?.web_combo_price)} las dos).
                La configuración no se cobra por mes.
              </p>
              <div className="modal-actions">
                <button className="secondary-button" onClick={() => setShowInvoiceForm(false)}>Cancelar</button>
                <button className="primary-button" onClick={generateInvoice} disabled={generatingInvoice || !invoiceSystemId}>
                  {generatingInvoice ? "Generando..." : "Generar factura"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: DETALLE DE FACTURA */}
      {selectedInvoice && (
        <div className="modal-overlay" onClick={() => setSelectedInvoice(null)}>
          <div className="product-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div><span className="dashboard-eyebrow">FACTURA {selectedInvoice.period}</span><h2>{systemName(selectedInvoice.company_id)}</h2></div>
              <button className="modal-close" onClick={() => setSelectedInvoice(null)}>×</button>
            </div>
            <div className="product-form">
              <div className="form-group"><label>Titular</label><p>{invoiceOwnerName || "—"}</p></div>
              <div className="form-group">
                <label>Ítems</label>
                <div className="import-table-wrapper">
                  <table className="import-table">
                    <thead><tr><th>Ítem</th><th>Precio</th></tr></thead>
                    <tbody>
                      {storedLineItems(selectedInvoice, true).map((it: any, idx: number) => (
                        <tr key={idx}><td>{it.label}</td><td>{usd(it.price)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <p style={{ textAlign: "right" }}>
                Subtotal: {usd(selectedInvoice.subtotal)}<br />
                {selectedInvoice.apply_iva && <>IVA 21%: {usd(selectedInvoice.iva_amount)}<br /></>}
                <strong>Total del abono mensual: {usd(selectedInvoice.total)}</strong>
              </p>
              <button className="secondary-button" onClick={() => printDocument("Resumen de abono mensual", `${selectedInvoice.period}`, invoiceOwnerName, systemName(selectedInvoice.company_id), selectedInvoice, true)}>
                Imprimir
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default AdminBilling;