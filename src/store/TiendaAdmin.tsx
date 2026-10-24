import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { assetUrl, compressImage, money, readableOn, storeApi } from "./api";
import "./store-admin.css";
import DateField from "../components/DateField";

// ============================================================
// PANEL · TIENDA ONLINE  (/online-store)
// ============================================================

interface Settings {
  slug: string; enabled: boolean; title: string | null; tagline: string | null; about: string | null; accent: string;
  has_logo: boolean; has_hero: boolean; logo_url: string | null; hero_url: string | null;
  whatsapp: string | null; instagram: string | null; email: string | null; address: string | null; hours: string | null;
  warehouse_id: number | null; effective_warehouse_id: number | null;
  show_stock_qty: boolean; low_stock_threshold: number; min_order: number;
  allow_shipping: boolean; shipping_cost: number; shipping_note: string | null; allow_pickup: boolean; pickup_note: string | null;
  deposit_enabled: boolean; deposit_percent: number; deposit_hold_minutes: number;
  has_mp_token: boolean; mp_token_hint: string | null; mp_test_mode: boolean;
  landing: boolean; ecommerce: boolean; mode: "landing" | "ecommerce" | "both" | "none";
  // datos legales del vendedor y políticas (vacío = se usa el valor por defecto)
  legal_name?: string | null; legal_cuit?: string | null; legal_address?: string | null; company_cuit?: string | null;
  returns_policy?: string | null; shipping_policy?: string | null; deposit_policy?: string | null;
  prices_final?: boolean; legal_missing?: string[];
  policy_defaults?: { returns: string; shipping: string; deposit: string };
  withdrawals_open?: number;
}
interface Withdrawal {
  id: number; code: string; order_code: string | null; order_id: number | null;
  customer_name: string | null; contact: string | null; reason: string | null;
  status: "RECIBIDA" | "RESUELTA"; resolution_note: string | null; created_at: string; resolved_at: string | null;
}
interface AdminProduct {
  id: number; name: string; sku: string | null; description: string | null; price: number; active: boolean;
  visible: boolean; featured: boolean; category: string | null; web_description: string | null;
  image_url: string | null; available: number; stock: "ok" | "low" | "out";
}
interface Summary { orders_total: number; orders_pending: number; waiting_deposit: number; sales_total: number; deposits_collected: number }
interface Warehouse { id: number; name: string; active: boolean }

type Tab = "productos" | "apariencia" | "contacto" | "ventas" | "envios" | "cupones" | "sena" | "legal" | "arrepentimientos";
const TABS: Tab[] = ["productos", "apariencia", "contacto", "ventas", "envios", "cupones", "sena", "legal", "arrepentimientos"];

interface Coupon {
  id: number; code: string; kind: "PERCENT" | "FIXED"; value: number; min_order: number;
  max_uses: number | null; used_count: number; valid_from: string | null; valid_until: string | null;
  active: boolean; first_order_only: boolean;
  state: "ACTIVO" | "PAUSADO" | "VENCIDO" | "AGOTADO" | "PROGRAMADO";
}
interface ShippingZone {
  id: number; name: string; price: number; free_from: number | null; estimated_days: string | null;
  active: boolean; sort_order: number;
}

const MODE_LABEL: Record<string, string> = {
  both: "Landing + E-commerce", ecommerce: "E-commerce", landing: "Landing Page", none: "Sin módulo",
};
const ACCENTS = ["#b07a46", "#1f6f5c", "#2f5f9e", "#8e3b5a", "#c2410c", "#4b5563", "#6d28d9", "#15803d"];

function storeUrl(slug: string) {
  return `${window.location.origin}/tienda/${slug}`;
}

export default function TiendaAdmin() {
  const [s, setS] = useState<Settings | null>(null);
  const [form, setForm] = useState<Partial<Settings> & { mp_access_token?: string }>({});
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  // se puede entrar directo a una pestaña: /online-store?tab=arrepentimientos (desde Pendientes)
  const [params] = useSearchParams();
  const initialTab = TABS.find((t) => t === params.get("tab")) || "productos";
  const [tab, setTab] = useState<Tab>(initialTab);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState<{ text: string; tone: "ok" | "error" } | null>(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  async function loadAll() {
    try {
      const [st, pr, su] = await Promise.all([
        storeApi<Settings>("/store/settings", { auth: true }),
        storeApi<AdminProduct[]>("/store/products", { auth: true }),
        storeApi<Summary>("/store/summary", { auth: true }),
      ]);
      setS(st); setForm({}); setProducts(pr); setSummary(su); setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar la tienda");
    }
    storeApi<Warehouse[]>("/stock/warehouses", { auth: true }).then(setWarehouses).catch(() => setWarehouses([]));
  }
  useEffect(() => { loadAll(); }, []);

  function notify(text: string, tone: "ok" | "error" = "ok") {
    setMsg({ text, tone });
    window.setTimeout(() => setMsg(null), 3200);
  }

  const v = <K extends keyof Settings>(k: K): Settings[K] => (k in form ? (form as Settings)[k] : (s as Settings)[k]);
  const set = (patch: Partial<Settings> & { mp_access_token?: string }) => setForm((f) => ({ ...f, ...patch }));
  const dirty = Object.keys(form).length > 0;

  async function save(e?: FormEvent, extra: Record<string, unknown> = {}) {
    e?.preventDefault();
    setSaving(true);
    try {
      const body: Record<string, unknown> = { ...form, ...extra };
      const updated = await storeApi<Settings>("/store/settings", { method: "PUT", auth: true, body });
      setS(updated); setForm({});
      notify("Cambios guardados");
      if ("warehouse_id" in body || "low_stock_threshold" in body) {
        setProducts(await storeApi<AdminProduct[]>("/store/products", { auth: true }));
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : "No se pudo guardar", "error");
    } finally {
      setSaving(false);
    }
  }

  async function uploadSiteImage(kind: "logo" | "hero", file: File | null) {
    try {
      const image = file ? await compressImage(file, kind === "logo" ? 400 : 1800, 0.85) : null;
      setS(await storeApi<Settings>(`/store/${kind}`, { method: "PUT", auth: true, body: { image } }));
      notify(file ? "Imagen actualizada" : "Imagen quitada");
    } catch (err) {
      notify(err instanceof Error ? err.message : "No se pudo subir la imagen", "error");
    }
  }

  if (error && !s) {
    return <section className="products-page"><div className="products-empty"><h3>No se pudo cargar la tienda</h3><p>{error}</p></div></section>;
  }
  if (!s) {
    return <section className="products-page"><div className="products-loading"><div className="products-loading-spinner" /><span>Cargando...</span></div></section>;
  }

  const url = storeUrl(s.slug);
  const isShop = s.ecommerce;
  const noWarehouse = !s.effective_warehouse_id;

  return (
    <section className="products-page vs-page">
      <div className="products-header">
        <div>
          <span className="dashboard-eyebrow">VENTAS</span>
          <h1>Tienda online</h1>
          <p>Tu página para clientes, conectada a tus productos, precios y stock en tiempo real.</p>
        </div>
        <div className="products-header-actions">
          <span className={`vs-mode vs-mode-${s.mode}`}>{MODE_LABEL[s.mode]}</span>
          <a className="primary-button vs-link-btn" href={url} target="_blank" rel="noopener">Ver mi tienda ↗</a>
        </div>
      </div>

      {msg && <div className={`vs-toast is-${msg.tone}`} role="status">{msg.text}</div>}

      {/* LINK */}
      <div className="vs-link-card">
        <div className="vs-link-main">
          <span className="vs-label">Link de tu tienda</span>
          <div className="vs-link-row">
            <code>{url}</code>
            <button type="button" className="secondary-button" onClick={async () => {
              try { await navigator.clipboard.writeText(url); setCopied(true); window.setTimeout(() => setCopied(false), 1500); } catch { /* nada */ }
            }}>{copied ? "¡Copiado!" : "Copiar"}</button>
            <a className="secondary-button" href={`https://wa.me/?text=${encodeURIComponent(`Mirá nuestra tienda online: ${url}`)}`} target="_blank" rel="noopener">Compartir</a>
          </div>
        </div>
        <label className="vs-switch-row">
          <Switch checked={v("enabled")} onChange={(on) => save(undefined, { enabled: on })} />
          <span><strong>{v("enabled") ? "Tienda publicada" : "Tienda pausada"}</strong><small>{v("enabled") ? "Cualquiera con el link la puede ver" : "Nadie la puede ver por ahora"}</small></span>
        </label>
      </div>

      {noWarehouse && (
        <div className="vs-alert">
          <strong>Falta un depósito.</strong> La tienda toma el stock de un depósito: creá uno en <b>Stock</b> y cargale cantidades a tus productos.
        </div>
      )}
      {(s.legal_missing || []).length > 0 && (
        <div className="vs-alert vs-alert-row">
          <span><strong>Completá los datos legales de tu tienda.</strong> Falta: {(s.legal_missing || []).join(", ").toLowerCase()}. Se muestran en el pie de la tienda y antes de pagar.</span>
          <button type="button" className="secondary-button" onClick={() => setTab("legal")}>Completar ahora</button>
        </div>
      )}
      {s.mode === "landing" && (
        <div className="vs-info">Tenés el módulo <b>Landing Page</b>: tus clientes ven productos, precios y disponibilidad, y te consultan por WhatsApp. Con <b>E-commerce</b> también pueden comprar y pagar seña online.</div>
      )}

      {/* RESUMEN */}
      {isShop && summary && (
        <div className="dashboard-cards vs-cards">
          <div className="dashboard-card"><span>Pedidos web</span><strong>{summary.orders_total}</strong><small>{summary.orders_pending} sin confirmar</small></div>
          <div className="dashboard-card"><span>Esperando seña</span><strong>{summary.waiting_deposit}</strong><small>Se liberan solos si no pagan</small></div>
          <div className="dashboard-card"><span>Vendido por la web</span><strong>{money(summary.sales_total)}</strong><small>Sin contar cancelados</small></div>
          <div className="dashboard-card"><span>Señas cobradas</span><strong>{money(summary.deposits_collected)}</strong><small>Por Mercado Pago</small></div>
        </div>
      )}

      {/* TABS */}
      <div className="vs-tabs" role="tablist">
        {([
          ["productos", "Productos"], ["apariencia", "Apariencia"], ["contacto", "Contacto"],
          ...(isShop ? [["ventas", "Ventas y entregas"], ["envios", "Envíos"], ["cupones", "Cupones"], ["sena", "Seña"]] : [["ventas", "Stock"]]),
          ["legal", "Legal y políticas"],
          ...(isShop || (s.withdrawals_open || 0) > 0 ? [["arrepentimientos", "Arrepentimientos"]] : []),
        ] as [Tab, string][]).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "is-on" : ""} onClick={() => setTab(k)}>
            {label}
            {k === "arrepentimientos" && (s.withdrawals_open || 0) > 0 && <span className="vs-tab-count">{s.withdrawals_open}</span>}
          </button>
        ))}
      </div>

      {tab === "productos" && (
        <ProductsTab products={products} setProducts={setProducts} notify={notify} />
      )}

      {tab === "apariencia" && (
        <form className="vs-panel" onSubmit={save}>
          <div className="vs-grid-2">
            <Field label="Nombre de la tienda"><input value={v("title") || ""} onChange={(e) => set({ title: e.target.value })} maxLength={150} /></Field>
            <Field label="Link" hint={`${window.location.origin}/tienda/…`}>
              <input value={v("slug")} onChange={(e) => set({ slug: e.target.value })} maxLength={60} />
            </Field>
          </div>
          <Field label="Frase de portada" hint="Ej: Todo para tu casa, con envío en el día">
            <input value={v("tagline") || ""} onChange={(e) => set({ tagline: e.target.value })} maxLength={255} />
          </Field>
          {s.landing && (
            <Field label="Sobre nosotros" hint="Contá quiénes son, qué venden, desde cuándo…">
              <textarea rows={4} value={v("about") || ""} onChange={(e) => set({ about: e.target.value })} maxLength={2000} />
            </Field>
          )}
          <Field label="Color de la marca">
            <div className="vs-colors">
              {ACCENTS.map((c) => (
                <button type="button" key={c} className={`vs-color ${v("accent") === c ? "is-on" : ""}`} style={{ background: c, color: readableOn(c) }} onClick={() => set({ accent: c })} aria-label={`Color ${c}`}>
                  {v("accent") === c ? "✓" : ""}
                </button>
              ))}
              <label className="vs-color-custom">
                <input type="color" value={v("accent")} onChange={(e) => set({ accent: e.target.value })} />
                <span>Otro</span>
              </label>
            </div>
          </Field>
          <div className="vs-grid-2">
            <ImagePick label="Logo" hint="Cuadrado, se ve arriba a la izquierda" url={s.logo_url} square onPick={(f) => uploadSiteImage("logo", f)} />
            <ImagePick label="Imagen de portada" hint="Horizontal (ej: tu local o tus productos)" url={s.hero_url} onPick={(f) => uploadSiteImage("hero", f)} />
          </div>
          <SaveBar dirty={dirty} saving={saving} onCancel={() => setForm({})} />
        </form>
      )}

      {tab === "contacto" && (
        <form className="vs-panel" onSubmit={save}>
          <div className="vs-grid-2">
            <Field label="WhatsApp" hint="Con código de área, ej: 261 555 1234"><input value={v("whatsapp") || ""} onChange={(e) => set({ whatsapp: e.target.value })} inputMode="tel" /></Field>
            <Field label="Instagram" hint="@usuario o link"><input value={v("instagram") || ""} onChange={(e) => set({ instagram: e.target.value })} /></Field>
            <Field label="Email"><input type="email" value={v("email") || ""} onChange={(e) => set({ email: e.target.value })} /></Field>
            <Field label="Horarios" hint="Ej: Lun a Sáb de 9 a 20 hs"><input value={v("hours") || ""} onChange={(e) => set({ hours: e.target.value })} /></Field>
          </div>
          <Field label="Dirección del local"><input value={v("address") || ""} onChange={(e) => set({ address: e.target.value })} /></Field>
          <SaveBar dirty={dirty} saving={saving} onCancel={() => setForm({})} />
        </form>
      )}

      {tab === "ventas" && (
        <form className="vs-panel" onSubmit={save}>
          <h3 className="vs-h">Stock que ve el cliente</h3>
          <div className="vs-grid-2">
            <Field label="Depósito de la tienda" hint="De acá sale el stock que se muestra y se reserva">
              <select value={v("warehouse_id") ?? ""} onChange={(e) => set({ warehouse_id: e.target.value ? Number(e.target.value) : null })}>
                <option value="">Automático (el primero activo)</option>
                {warehouses.filter((w) => w.active).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </Field>
            <Field label="Avisar “quedan pocos” desde" hint="Unidades o menos">
              <input type="number" min={0} value={v("low_stock_threshold")} onChange={(e) => set({ low_stock_threshold: Number(e.target.value) })} />
            </Field>
          </div>
          <label className="vs-switch-row">
            <Switch checked={v("show_stock_qty")} onChange={(on) => set({ show_stock_qty: on })} />
            <span><strong>Mostrar cuántas quedan</strong><small>“¡Quedan 3!” en vez de “Últimas unidades”</small></span>
          </label>

          {isShop && (
            <>
              <h3 className="vs-h">Entregas</h3>
              <div className="vs-delivery">
                <div className="vs-delivery-card">
                  <label className="vs-switch-row">
                    <Switch checked={v("allow_pickup")} onChange={(on) => set({ allow_pickup: on })} />
                    <span><strong>Retiro en el local</strong><small>Sin cargo</small></span>
                  </label>
                  {v("allow_pickup") && <Field label="Indicaciones" hint="Ej: Retirá de 9 a 18 hs por Av. San Martín 123"><input value={v("pickup_note") || ""} onChange={(e) => set({ pickup_note: e.target.value })} /></Field>}
                </div>
                <div className="vs-delivery-card">
                  <label className="vs-switch-row">
                    <Switch checked={v("allow_shipping")} onChange={(on) => set({ allow_shipping: on })} />
                    <span><strong>Envío a domicilio</strong><small>El cliente carga su dirección</small></span>
                  </label>
                  {v("allow_shipping") && (
                    <div className="vs-grid-2">
                      <Field label="Costo del envío" hint="0 = sin cargo. Si cargás zonas en la pestaña Envíos, se usa el costo de cada zona."><input type="number" min={0} value={v("shipping_cost")} onChange={(e) => set({ shipping_cost: Number(e.target.value) })} /></Field>
                      <Field label="Indicaciones" hint="Ej: Envíos en el día en Mendoza"><input value={v("shipping_note") || ""} onChange={(e) => set({ shipping_note: e.target.value })} /></Field>
                    </div>
                  )}
                </div>
              </div>
              <h3 className="vs-h">Compra mínima</h3>
              <Field label="Monto mínimo del pedido" hint="0 = sin mínimo"><input type="number" min={0} value={v("min_order")} onChange={(e) => set({ min_order: Number(e.target.value) })} /></Field>
            </>
          )}
          <SaveBar dirty={dirty} saving={saving} onCancel={() => setForm({})} />
        </form>
      )}

      {tab === "envios" && isShop && (
        <ShippingTab
          notify={notify}
          allowShipping={s.allow_shipping}
          allowPickup={s.allow_pickup}
          shippingCost={s.shipping_cost}
          onToggle={(patch) => save(undefined, patch)}
        />
      )}

      {tab === "cupones" && isShop && <CouponsTab notify={notify} />}

      {tab === "sena" && isShop && (
        <form className="vs-panel" onSubmit={save}>
          <div className="vs-explain">
            <strong>¿Cómo funciona?</strong>
            <ol>
              <li>El cliente arma el carrito; si pide más de lo que hay, la web le avisa al instante.</li>
              <li>Al confirmar, el stock queda <b>reservado</b> y paga la seña con Mercado Pago.</li>
              <li>Cuando el pago se aprueba, el pedido pasa solo a <b>Confirmado</b> en Pedidos.</li>
              <li>Si no paga dentro del tiempo límite, el pedido se cancela y el stock se libera.</li>
            </ol>
          </div>

          <h3 className="vs-h">Mercado Pago</h3>
          <Field label="Access Token" hint={s.has_mp_token ? `Cargado (${s.mp_token_hint})${s.mp_test_mode ? " · modo prueba" : ""}. Escribí uno nuevo solo si querés cambiarlo.` : "Lo sacás de Mercado Pago > Tu negocio > Credenciales de producción. La plata va directo a tu cuenta."}>
            <input type="password" autoComplete="off" placeholder={s.has_mp_token ? "••••••••••••" : "APP_USR-…"} value={form.mp_access_token || ""} onChange={(e) => set({ mp_access_token: e.target.value })} />
          </Field>
          {s.has_mp_token && (
            <button type="button" className="vs-text-danger" onClick={() => { if (window.confirm("¿Quitar el token? Se desactiva la seña.")) save(undefined, { clear_mp_token: true }); }}>Quitar token</button>
          )}

          <h3 className="vs-h">Seña</h3>
          <label className="vs-switch-row">
            <Switch checked={v("deposit_enabled")} onChange={(on) => set({ deposit_enabled: on })} disabled={!s.has_mp_token && !form.mp_access_token} />
            <span><strong>Pedir seña para confirmar el pedido</strong><small>{!s.has_mp_token && !form.mp_access_token ? "Primero cargá el Access Token" : "Se calcula sobre el total (productos − cupón + envío)"}</small></span>
          </label>
          {v("deposit_enabled") && (
            <div className="vs-grid-2">
              <Field label="Porcentaje de seña" hint={`Ej: en un pedido de ${money(50000)} el cliente paga ${money(50000 * (v("deposit_percent") || 0) / 100)} ahora`}>
                <div className="vs-suffix"><input type="number" min={1} max={100} value={v("deposit_percent")} onChange={(e) => set({ deposit_percent: Number(e.target.value) })} /><span>%</span></div>
              </Field>
              <Field label="Tiempo para pagar" hint="Mientras tanto el stock queda reservado">
                <div className="vs-suffix"><input type="number" min={5} max={1440} value={v("deposit_hold_minutes")} onChange={(e) => set({ deposit_hold_minutes: Number(e.target.value) })} /><span>min</span></div>
              </Field>
            </div>
          )}
          {v("deposit_enabled") && (
            <PolicyField
              label="Qué pasa con la seña si se cancela"
              hint="El cliente lo lee antes de pagar la seña y en la página de su pedido."
              value={v("deposit_policy")}
              suggested={s.policy_defaults?.deposit}
              rows={3}
              maxLength={1500}
              onChange={(text) => set({ deposit_policy: text })}
            />
          )}
          <SaveBar dirty={dirty} saving={saving} onCancel={() => setForm({})} />
        </form>
      )}

      {tab === "legal" && (
        <form className="vs-panel" onSubmit={save}>
          <h3 className="vs-h">Datos del vendedor</h3>
          <p className="vx-sub">Por ley tienen que estar a la vista: aparecen en el pie de tu tienda y en el último paso de la compra.</p>
          <div className="vs-grid-2">
            <Field label="Razón social o nombre y apellido" hint="El titular del negocio, como figura en ARCA">
              <input value={v("legal_name") || ""} onChange={(e) => set({ legal_name: e.target.value })} maxLength={200} placeholder={s.title || ""} />
            </Field>
            <Field label="CUIT" hint={s.company_cuit ? `Si lo dejás vacío se usa el de Configuración (${s.company_cuit})` : "11 números, con o sin guiones"}>
              <input value={v("legal_cuit") || ""} onChange={(e) => set({ legal_cuit: e.target.value })} maxLength={20} inputMode="numeric" placeholder={s.company_cuit || "30-12345678-9"} />
            </Field>
          </div>
          <Field label="Domicilio" hint={s.address ? `Si lo dejás vacío se usa la dirección del local (${s.address})` : "Calle, número, ciudad y provincia"}>
            <input value={v("legal_address") || ""} onChange={(e) => set({ legal_address: e.target.value })} maxLength={255} placeholder={s.address || ""} />
          </Field>
          <p className="vs-hint">El contacto (WhatsApp y email) se toma de la pestaña <b>Contacto</b>.</p>

          <h3 className="vs-h">Precios</h3>
          <label className="vs-switch-row">
            <Switch checked={!!v("prices_final")} onChange={(on) => set({ prices_final: on })} />
            <span><strong>Los precios publicados son finales</strong><small>Si lo activás, el cliente lee esa frase junto al total antes de confirmar. Activalo solo si es así en tu negocio.</small></span>
          </label>

          <h3 className="vs-h">Políticas de tu negocio</h3>
          <p className="vx-sub">Se leen desde el pie de la tienda y antes de confirmar la compra. Si dejás un campo vacío se muestra el texto sugerido.</p>
          <PolicyField
            label="Cambios y devoluciones"
            value={v("returns_policy")}
            suggested={s.policy_defaults?.returns}
            onChange={(text) => set({ returns_policy: text })}
          />
          <PolicyField
            label="Envíos"
            value={v("shipping_policy")}
            suggested={s.policy_defaults?.shipping}
            onChange={(text) => set({ shipping_policy: text })}
          />

          <div className="vs-info">
            Tu tienda ya muestra el <b>Botón de arrepentimiento</b> (el cliente tiene 10 días corridos para dejar sin efecto la compra, sin costo)
            y el enlace a <b>Defensa de las y los consumidores</b>. Las solicitudes llegan a la pestaña Arrepentimientos.
          </div>
          <SaveBar dirty={dirty} saving={saving} onCancel={() => setForm({})} />
        </form>
      )}

      {tab === "arrepentimientos" && (
        <WithdrawalsTab
          notify={notify}
          onChange={(open) => setS((cur) => (cur ? { ...cur, withdrawals_open: open } : cur))}
        />
      )}
    </section>
  );
}

// ============================================================
// BOTÓN DE ARREPENTIMIENTO: solicitudes recibidas
// ============================================================

function WithdrawalsTab({ notify, onChange }: {
  notify: (t: string, tone?: "ok" | "error") => void;
  onChange: (open: number) => void;
}) {
  const [rows, setRows] = useState<Withdrawal[] | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  async function load() {
    try {
      const data = await storeApi<Withdrawal[]>("/store/withdrawals", { auth: true });
      setRows(data);
      onChange(data.filter((w) => w.status === "RECIBIDA").length);
    } catch (err) {
      setRows([]);
      notify(err instanceof Error ? err.message : "No se pudieron cargar las solicitudes", "error");
    }
  }
  useEffect(() => { load(); }, []);

  async function setStatus(w: Withdrawal, status: "RECIBIDA" | "RESUELTA") {
    let note: string | null = null;
    if (status === "RESUELTA") {
      note = window.prompt("¿Cómo se resolvió? (opcional, queda anotado). Ej: se devolvió el dinero por transferencia.", w.resolution_note || "");
      if (note === null) return;
    }
    setBusyId(w.id);
    try {
      await storeApi(`/store/withdrawals/${w.id}`, { method: "PUT", auth: true, body: { status, resolution_note: note } });
      notify(status === "RESUELTA" ? `Solicitud ${w.code} marcada como resuelta` : `Solicitud ${w.code} vuelve a estar pendiente`);
      await load();
    } catch (err) {
      notify(err instanceof Error ? err.message : "No se pudo actualizar la solicitud", "error");
    } finally {
      setBusyId(null);
    }
  }

  const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");

  return (
    <div className="vs-panel">
      <div className="vx-panel-head">
        <div>
          <h3 className="vs-h" style={{ margin: 0 }}>Solicitudes de arrepentimiento</h3>
          <p className="vx-sub">
            Clientes que usaron el Botón de arrepentimiento de tu tienda. Tienen 10 días corridos desde la entrega o la compra para
            dejarla sin efecto, sin costo: contactalos, coordiná la devolución y marcá la solicitud como resuelta.
          </p>
        </div>
      </div>

      {rows === null ? (
        <span className="vx-muted">Cargando…</span>
      ) : rows.length === 0 ? (
        <div className="vx-empty">
          <strong>No hay solicitudes</strong>
          Cuando un cliente use el Botón de arrepentimiento de tu tienda, la solicitud aparece acá y te llega una notificación.
        </div>
      ) : (
        <div className="vx-table-wrap">
          <table className="vx-table">
            <thead><tr><th>Trámite</th><th>Recibida</th><th>Cliente</th><th>Pedido</th><th>Motivo</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              {rows.map((w) => (
                <tr key={w.id}>
                  <td><strong>{w.code}</strong></td>
                  <td>{when(w.created_at)}</td>
                  <td>{w.customer_name || "Sin nombre"}<small>{w.contact || "Sin contacto"}</small></td>
                  <td>
                    {w.order_id ? <>Pedido #{w.order_id}<small>Código {w.order_code}</small></> : w.order_code ? <>{w.order_code}<small>No coincide con ningún pedido</small></> : "—"}
                  </td>
                  <td>{w.reason || "—"}{w.resolution_note && <small>Resolución: {w.resolution_note}</small>}</td>
                  <td>
                    <span className={`vx-badge ${w.status === "RESUELTA" ? "is-ok" : "is-warn"}`}>{w.status === "RESUELTA" ? "Resuelta" : "Recibida"}</span>
                    {w.resolved_at && <small>{when(w.resolved_at)}</small>}
                  </td>
                  <td>
                    <div className="vx-row-end">
                      {w.status === "RECIBIDA" ? (
                        <button type="button" className="primary-button" disabled={busyId === w.id} onClick={() => setStatus(w, "RESUELTA")}>Marcar resuelta</button>
                      ) : (
                        <button type="button" className="product-action-edit" disabled={busyId === w.id} onClick={() => setStatus(w, "RECIBIDA")}>Volver a pendiente</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ============================================================
// PRODUCTOS DE LA WEB
// ============================================================

function ProductsTab({ products, setProducts, notify }: {
  products: AdminProduct[];
  setProducts: (fn: (p: AdminProduct[]) => AdminProduct[]) => void;
  notify: (t: string, tone?: "ok" | "error") => void;
}) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "visible" | "hidden" | "nophoto">("all");
  const categories = useMemo(() => Array.from(new Set(products.map((p) => p.category).filter(Boolean))) as string[], [products]);

  const list = products.filter((p) => {
    const t = q.trim().toLowerCase();
    if (t && !p.name.toLowerCase().includes(t) && !(p.sku || "").toLowerCase().includes(t)) return false;
    if (filter === "visible") return p.visible && p.active;
    if (filter === "hidden") return !p.visible || !p.active;
    if (filter === "nophoto") return !p.image_url;
    return true;
  });

  async function patch(p: AdminProduct, body: Partial<AdminProduct>) {
    setProducts((all) => all.map((x) => (x.id === p.id ? { ...x, ...body } : x)));
    try {
      await storeApi(`/store/products/${p.id}`, { method: "PUT", auth: true, body });
    } catch (err) {
      setProducts((all) => all.map((x) => (x.id === p.id ? p : x)));
      notify(err instanceof Error ? err.message : "No se pudo guardar", "error");
    }
  }

  async function upload(p: AdminProduct, file: File | null) {
    try {
      const image = file ? await compressImage(file) : null;
      const res = await storeApi<{ image_url: string | null }>(`/store/products/${p.id}/image`, { method: "PUT", auth: true, body: { image } });
      setProducts((all) => all.map((x) => (x.id === p.id ? { ...x, image_url: res.image_url } : x)));
      notify(file ? `Foto de ${p.name} actualizada` : "Foto quitada");
    } catch (err) {
      notify(err instanceof Error ? err.message : "No se pudo subir la foto", "error");
    }
  }

  const visibleCount = products.filter((p) => p.visible && p.active).length;

  return (
    <div className="vs-panel vs-panel-flush">
      <div className="vs-products-toolbar">
        <div className="products-search">
          <span className="products-search-icon">⌕</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar producto o SKU..." />
        </div>
        <div className="vs-filter">
          {([["all", "Todos"], ["visible", "En la web"], ["hidden", "Ocultos"], ["nophoto", "Sin foto"]] as const).map(([k, l]) => (
            <button key={k} type="button" className={filter === k ? "is-on" : ""} onClick={() => setFilter(k)}>{l}</button>
          ))}
        </div>
        <span className="vs-count">{visibleCount} de {products.length} en la web</span>
      </div>
      <datalist id="vs-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>

      {products.length === 0 ? (
        <div className="products-empty"><h3>Todavía no hay productos</h3><p>Cargalos en Productos y aparecen acá para publicarlos.</p></div>
      ) : list.length === 0 ? (
        <div className="products-empty"><p>No hay productos con ese filtro.</p></div>
      ) : (
        <ul className="vs-products">
          {list.map((p) => (
            <li key={p.id} className={!p.active ? "is-inactive" : !p.visible ? "is-hidden" : ""}>
              <PhotoButton url={p.image_url} name={p.name} onPick={(f) => upload(p, f)} />
              <div className="vs-p-main">
                <strong>{p.name}</strong>
                <span className="vs-p-meta">
                  {money(p.price)}
                  <span className={`vs-stock vs-stock-${p.stock}`}>{p.stock === "out" ? "Sin stock" : `${p.available} disponibles`}</span>
                  {!p.active && <span className="vs-tag">Producto inactivo</span>}
                </span>
                <input
                  className="vs-cat-input"
                  list="vs-categories"
                  placeholder="Categoría (ej: Bebidas)"
                  defaultValue={p.category || ""}
                  onBlur={(e) => { const val = e.target.value.trim(); if (val !== (p.category || "")) patch(p, { category: val || null }); }}
                  aria-label={`Categoría de ${p.name}`}
                />
              </div>
              <div className="vs-p-toggles">
                <label className="vs-mini-toggle">
                  <Switch checked={p.featured} onChange={(on) => patch(p, { featured: on })} small />
                  <span>Destacado</span>
                </label>
                <label className="vs-mini-toggle">
                  <Switch checked={p.visible} onChange={(on) => patch(p, { visible: on })} small disabled={!p.active} />
                  <span>{p.visible ? "Visible" : "Oculto"}</span>
                </label>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="vs-foot-note">Los precios y el stock se toman de <b>Productos</b> y <b>Stock</b>: si los cambiás ahí, la web se actualiza sola.</p>
    </div>
  );
}

// ============================================================
// ENVÍOS: retiro en el local + zonas de envío con su costo
// ============================================================

const EMPTY_ZONE = { name: "", price: "", free_from: "", estimated_days: "", active: true, sort_order: "0" };

function ShippingTab({ notify, allowShipping, allowPickup, shippingCost, onToggle }: {
  notify: (t: string, tone?: "ok" | "error") => void;
  allowShipping: boolean; allowPickup: boolean; shippingCost: number;
  onToggle: (patch: Record<string, unknown>) => void;
}) {
  const [zones, setZones] = useState<ShippingZone[] | null>(null);
  const [editing, setEditing] = useState<ShippingZone | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_ZONE });
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      setZones(await storeApi<ShippingZone[]>("/store/shipping-zones", { auth: true }));
    } catch (err) {
      setZones([]);
      notify(err instanceof Error ? err.message : "No se pudieron cargar las zonas", "error");
    }
  }
  useEffect(() => { load(); }, []);

  function openCreate() {
    setEditing(null);
    setForm({ ...EMPTY_ZONE, sort_order: String((zones || []).length) });
    setShowForm(true);
  }
  function openEdit(z: ShippingZone) {
    setEditing(z);
    setForm({
      name: z.name, price: String(z.price), free_from: z.free_from ? String(z.free_from) : "",
      estimated_days: z.estimated_days || "", active: z.active, sort_order: String(z.sort_order),
    });
    setShowForm(true);
  }

  async function saveZone(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const body = {
        name: form.name, price: Number(form.price || 0), free_from: form.free_from ? Number(form.free_from) : null,
        estimated_days: form.estimated_days || null, active: form.active, sort_order: Math.round(Number(form.sort_order || 0)),
      };
      if (editing) await storeApi(`/store/shipping-zones/${editing.id}`, { method: "PUT", auth: true, body });
      else await storeApi("/store/shipping-zones", { method: "POST", auth: true, body });
      setShowForm(false);
      notify(editing ? "Zona actualizada" : "Zona creada");
      await load();
    } catch (err) {
      notify(err instanceof Error ? err.message : "No se pudo guardar la zona", "error");
    } finally {
      setBusy(false);
    }
  }

  async function toggleZone(z: ShippingZone) {
    try {
      await storeApi(`/store/shipping-zones/${z.id}`, {
        method: "PUT", auth: true,
        body: { name: z.name, price: z.price, free_from: z.free_from, estimated_days: z.estimated_days, active: !z.active, sort_order: z.sort_order },
      });
      await load();
    } catch (err) {
      notify(err instanceof Error ? err.message : "No se pudo cambiar la zona", "error");
    }
  }

  async function removeZone(z: ShippingZone) {
    if (!window.confirm(`¿Borrar la zona "${z.name}"? Los pedidos que ya la usaron no cambian.`)) return;
    try {
      await storeApi(`/store/shipping-zones/${z.id}`, { method: "DELETE", auth: true });
      notify("Zona borrada");
      await load();
    } catch (err) {
      notify(err instanceof Error ? err.message : "No se pudo borrar la zona", "error");
    }
  }

  const activeCount = (zones || []).filter((z) => z.active).length;

  return (
    <div className="vs-panel">
      <h3 className="vs-h">Cómo recibe el pedido tu cliente</h3>
      <div className="vs-delivery">
        <div className="vs-delivery-card">
          <label className="vs-switch-row">
            <Switch checked={allowPickup} onChange={(on) => onToggle({ allow_pickup: on })} />
            <span><strong>Retiro en el local</strong><small>{allowPickup ? "El cliente puede pasar a buscarlo, sin cargo" : "No se ofrece retiro"}</small></span>
          </label>
        </div>
        <div className="vs-delivery-card">
          <label className="vs-switch-row">
            <Switch checked={allowShipping} onChange={(on) => onToggle({ allow_shipping: on })} />
            <span><strong>Envío a domicilio</strong><small>{allowShipping ? "El cliente carga su dirección (obligatoria)" : "No se hacen envíos"}</small></span>
          </label>
        </div>
      </div>

      <div className="vx-panel-head" style={{ marginTop: 18 }}>
        <div>
          <h3 className="vs-h" style={{ margin: 0 }}>Zonas de envío</h3>
          <p className="vx-sub">
            {activeCount > 0
              ? "En el checkout el cliente elige su zona y el costo se suma al total."
              : `Sin zonas activas, todos los envíos cuestan lo mismo: ${shippingCost > 0 ? money(shippingCost) : "sin cargo"} (se cambia en Ventas y entregas).`}
          </p>
        </div>
        <button type="button" className="primary-button" onClick={openCreate}>+ Nueva zona</button>
      </div>

      {!allowShipping && activeCount > 0 && (
        <div className="vx-note is-warn"><span>Tenés zonas cargadas pero el envío a domicilio está apagado: tus clientes no las ven.</span></div>
      )}

      {zones === null ? (
        <span className="vx-muted">Cargando…</span>
      ) : zones.length === 0 ? (
        <div className="vx-empty">
          <strong>Todavía no cargaste zonas</strong>
          Creá una por cada lugar al que enviás (ej. “Centro”, “Gran Mendoza”, “Resto del país”), cada una con su costo.
        </div>
      ) : (
        <div className="vx-table-wrap">
          <table className="vx-table">
            <thead><tr><th>Zona</th><th className="vx-r">Costo</th><th className="vx-r">Gratis desde</th><th>Demora</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              {zones.map((z) => (
                <tr key={z.id}>
                  <td>{z.name}</td>
                  <td className="vx-r">{z.price > 0 ? money(z.price) : "Sin cargo"}</td>
                  <td className="vx-r">{z.free_from ? money(z.free_from) : "—"}</td>
                  <td>{z.estimated_days || "—"}</td>
                  <td><span className={`vx-badge ${z.active ? "is-ok" : ""}`}>{z.active ? "Activa" : "Pausada"}</span></td>
                  <td>
                    <div className="vx-row-end">
                      <button type="button" className="product-action-edit" onClick={() => openEdit(z)}>Editar</button>
                      <button type="button" className="product-action-edit" onClick={() => toggleZone(z)}>{z.active ? "Pausar" : "Activar"}</button>
                      <button type="button" className="product-action-delete" onClick={() => removeZone(z)}>Borrar</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="product-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div><span className="dashboard-eyebrow">ENVÍOS</span><h2>{editing ? "Editar zona" : "Nueva zona de envío"}</h2></div>
              <button className="modal-close" type="button" onClick={() => setShowForm(false)}>×</button>
            </div>
            <form className="product-form" onSubmit={saveZone}>
              <Field label="Nombre de la zona" hint="Como lo va a ver el cliente. Ej: Gran Mendoza">
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required maxLength={80} autoFocus />
              </Field>
              <div className="form-row">
                <Field label="Costo del envío" hint="0 = sin cargo">
                  <input type="number" min={0} step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
                </Field>
                <Field label="Envío gratis desde" hint="Vacío = nunca es gratis">
                  <input type="number" min={0} step="0.01" value={form.free_from} onChange={(e) => setForm({ ...form, free_from: e.target.value })} placeholder="Ej. 50000" />
                </Field>
              </div>
              <div className="form-row">
                <Field label="Demora estimada" hint="Texto libre. Ej: 24 a 48 hs">
                  <input value={form.estimated_days} onChange={(e) => setForm({ ...form, estimated_days: e.target.value })} maxLength={80} />
                </Field>
                <Field label="Orden" hint="Las de número más bajo aparecen primero">
                  <input type="number" step="1" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} />
                </Field>
              </div>
              <label className="vx-check">
                <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
                Zona activa (el cliente la puede elegir)
              </label>
              <div className="modal-actions">
                <button type="button" className="secondary-button" onClick={() => setShowForm(false)}>Cancelar</button>
                <button type="submit" className="primary-button" disabled={busy}>{busy ? "Guardando..." : editing ? "Guardar cambios" : "Crear zona"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// CUPONES DE DESCUENTO
// ============================================================

const EMPTY_COUPON = {
  code: "", kind: "PERCENT" as "PERCENT" | "FIXED", value: "", min_order: "", max_uses: "",
  valid_from: "", valid_until: "", active: true, first_order_only: false,
};
const COUPON_STATE: Record<Coupon["state"], [string, string]> = {
  ACTIVO: ["Activo", "is-ok"], PAUSADO: ["Pausado", ""], VENCIDO: ["Vencido", "is-bad"],
  AGOTADO: ["Agotado", "is-warn"], PROGRAMADO: ["Todavía no empezó", "is-info"],
};

function dayLabel(iso: string | null) {
  return iso ? new Date(iso + "T12:00:00").toLocaleDateString("es-AR") : null;
}

function CouponsTab({ notify }: { notify: (t: string, tone?: "ok" | "error") => void }) {
  const [coupons, setCoupons] = useState<Coupon[] | null>(null);
  const [editing, setEditing] = useState<Coupon | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_COUPON });
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      setCoupons(await storeApi<Coupon[]>("/store/coupons", { auth: true }));
    } catch (err) {
      setCoupons([]);
      notify(err instanceof Error ? err.message : "No se pudieron cargar los cupones", "error");
    }
  }
  useEffect(() => { load(); }, []);

  function openCreate() {
    setEditing(null);
    setForm({ ...EMPTY_COUPON });
    setShowForm(true);
  }
  function openEdit(c: Coupon) {
    setEditing(c);
    setForm({
      code: c.code, kind: c.kind, value: String(c.value), min_order: c.min_order ? String(c.min_order) : "",
      max_uses: c.max_uses ? String(c.max_uses) : "", valid_from: c.valid_from || "", valid_until: c.valid_until || "",
      active: c.active, first_order_only: c.first_order_only,
    });
    setShowForm(true);
  }

  function bodyOf(f: typeof EMPTY_COUPON) {
    return {
      code: f.code.trim().toUpperCase(), kind: f.kind, value: Number(f.value || 0), min_order: Number(f.min_order || 0),
      max_uses: f.max_uses ? Math.round(Number(f.max_uses)) : null,
      valid_from: f.valid_from ? `${f.valid_from}T00:00:00` : null,
      valid_until: f.valid_until ? `${f.valid_until}T00:00:00` : null,
      active: f.active, first_order_only: f.first_order_only,
    };
  }

  async function saveCoupon(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const body = bodyOf(form);
      if (editing) await storeApi(`/store/coupons/${editing.id}`, { method: "PUT", auth: true, body });
      else await storeApi("/store/coupons", { method: "POST", auth: true, body });
      setShowForm(false);
      notify(editing ? "Cupón actualizado" : `Cupón ${body.code} creado`);
      await load();
    } catch (err) {
      notify(err instanceof Error ? err.message : "No se pudo guardar el cupón", "error");
    } finally {
      setBusy(false);
    }
  }

  async function toggleCoupon(c: Coupon) {
    try {
      await storeApi(`/store/coupons/${c.id}`, {
        method: "PUT", auth: true,
        body: bodyOf({
          code: c.code, kind: c.kind, value: String(c.value), min_order: String(c.min_order || ""),
          max_uses: c.max_uses ? String(c.max_uses) : "", valid_from: c.valid_from || "", valid_until: c.valid_until || "",
          active: !c.active, first_order_only: c.first_order_only,
        }),
      });
      await load();
    } catch (err) {
      notify(err instanceof Error ? err.message : "No se pudo cambiar el cupón", "error");
    }
  }

  async function removeCoupon(c: Coupon) {
    if (!window.confirm(`¿Borrar el cupón ${c.code}? Si ya se usó en algún pedido, queda pausado en vez de borrarse.`)) return;
    try {
      const res = await storeApi<{ detail: string }>(`/store/coupons/${c.id}`, { method: "DELETE", auth: true });
      notify(res.detail);
      await load();
    } catch (err) {
      notify(err instanceof Error ? err.message : "No se pudo borrar el cupón", "error");
    }
  }

  return (
    <div className="vs-panel">
      <div className="vx-panel-head">
        <div>
          <h3 className="vs-h" style={{ margin: 0 }}>Cupones de descuento</h3>
          <p className="vx-sub">El cliente escribe el código en el carrito. El descuento se aplica sobre los productos (no sobre el envío) y baja el total y la seña.</p>
        </div>
        <button type="button" className="primary-button" onClick={openCreate}>+ Nuevo cupón</button>
      </div>

      {coupons === null ? (
        <span className="vx-muted">Cargando…</span>
      ) : coupons.length === 0 ? (
        <div className="vx-empty">
          <strong>Todavía no creaste cupones</strong>
          Creá uno (ej. BIENVENIDA con 10% de descuento) y pasale el código a tus clientes.
        </div>
      ) : (
        <div className="vx-table-wrap">
          <table className="vx-table">
            <thead><tr><th>Código</th><th>Descuento</th><th>Condiciones</th><th className="vx-r">Usos</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              {coupons.map((c) => {
                const conditions = [
                  c.min_order > 0 ? `Compra mínima ${money(c.min_order)}` : null,
                  c.first_order_only ? "Solo primera compra" : null,
                  c.valid_from ? `Desde el ${dayLabel(c.valid_from)}` : null,
                  c.valid_until ? `Hasta el ${dayLabel(c.valid_until)}` : null,
                ].filter(Boolean).join(" · ");
                return (
                  <tr key={c.id}>
                    <td><strong>{c.code}</strong></td>
                    <td>{c.kind === "PERCENT" ? `${c.value}%` : money(c.value)}</td>
                    <td>{conditions || "Sin condiciones"}</td>
                    <td className="vx-r">{c.used_count}{c.max_uses ? ` de ${c.max_uses}` : ""}</td>
                    <td><span className={`vx-badge ${COUPON_STATE[c.state][1]}`}>{COUPON_STATE[c.state][0]}</span></td>
                    <td>
                      <div className="vx-row-end">
                        <button type="button" className="product-action-edit" onClick={() => openEdit(c)}>Editar</button>
                        <button type="button" className="product-action-edit" onClick={() => toggleCoupon(c)}>{c.active ? "Pausar" : "Activar"}</button>
                        <button type="button" className="product-action-delete" onClick={() => removeCoupon(c)}>Borrar</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="product-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div><span className="dashboard-eyebrow">CUPONES</span><h2>{editing ? `Editar ${editing.code}` : "Nuevo cupón"}</h2></div>
              <button className="modal-close" type="button" onClick={() => setShowForm(false)}>×</button>
            </div>
            <form className="product-form" onSubmit={saveCoupon}>
              <Field label="Código" hint="Letras, números y guiones, sin espacios. Se guarda en mayúsculas.">
                <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase().replace(/\s+/g, "") })} required minLength={2} maxLength={40} placeholder="Ej. BIENVENIDA" autoFocus />
              </Field>
              <div className="form-row">
                <Field label="Tipo de descuento">
                  <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value === "FIXED" ? "FIXED" : "PERCENT" })}>
                    <option value="PERCENT">Porcentaje (%)</option>
                    <option value="FIXED">Monto fijo ($)</option>
                  </select>
                </Field>
                <Field label={form.kind === "PERCENT" ? "Porcentaje" : "Monto"} hint={form.kind === "PERCENT" ? "Entre 1 y 100" : "En pesos"}>
                  <input type="number" min={0.01} max={form.kind === "PERCENT" ? 100 : undefined} step="0.01" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} required />
                </Field>
              </div>
              <div className="form-row">
                <Field label="Compra mínima" hint="Vacío = sin mínimo">
                  <input type="number" min={0} step="0.01" value={form.min_order} onChange={(e) => setForm({ ...form, min_order: e.target.value })} />
                </Field>
                <Field label="Cantidad máxima de usos" hint="Vacío = sin límite">
                  <input type="number" min={1} step="1" value={form.max_uses} onChange={(e) => setForm({ ...form, max_uses: e.target.value })} />
                </Field>
              </div>
              <div className="form-row">
                <Field label="Vale desde" hint="Vacío = desde ahora">
                  <DateField value={form.valid_from} onChange={(e) => setForm({ ...form, valid_from: e.target.value })} />
                </Field>
                <Field label="Vale hasta" hint="Vacío = no vence">
                  <DateField value={form.valid_until} onChange={(e) => setForm({ ...form, valid_until: e.target.value })} />
                </Field>
              </div>
              <label className="vx-check">
                <input type="checkbox" checked={form.first_order_only} onChange={(e) => setForm({ ...form, first_order_only: e.target.checked })} />
                Solo para la primera compra del cliente
              </label>
              <label className="vx-check">
                <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
                Cupón activo
              </label>
              {editing && editing.used_count > 0 && (
                <small className="vs-hint">Este cupón ya se usó {editing.used_count} {editing.used_count === 1 ? "vez" : "veces"}. Los pedidos ya hechos no cambian.</small>
              )}
              <div className="modal-actions">
                <button type="button" className="secondary-button" onClick={() => setShowForm(false)}>Cancelar</button>
                <button type="submit" className="primary-button" disabled={busy}>{busy ? "Guardando..." : editing ? "Guardar cambios" : "Crear cupón"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// PIEZAS
// ============================================================

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="form-group vs-field">
      <label>{label}</label>
      {children}
      {hint && <small className="vs-hint">{hint}</small>}
    </div>
  );
}

/** Texto libre de una política, con el texto sugerido a mano. */
function PolicyField({ label, hint, value, suggested, rows = 5, maxLength = 4000, onChange }: {
  label: string; hint?: string; value: string | null | undefined; suggested?: string; rows?: number; maxLength?: number;
  onChange: (text: string) => void;
}) {
  return (
    <div className="form-group vs-field">
      <label>{label}</label>
      <textarea rows={rows} maxLength={maxLength} value={value || ""} placeholder={suggested} onChange={(e) => onChange(e.target.value)} />
      <small className="vs-hint">
        {hint ? `${hint} ` : ""}
        {value ? "Vacío = se muestra el texto sugerido." : "Ahora se muestra el texto sugerido (el que ves en gris)."}
        {suggested && value !== suggested && (
          <> <button type="button" className="vx-linkbtn" onClick={() => onChange(suggested)}>Usar el texto sugerido para editarlo</button></>
        )}
      </small>
    </div>
  );
}

function Switch({ checked, onChange, disabled, small }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; small?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      className={`vs-switch ${checked ? "is-on" : ""} ${small ? "is-small" : ""}`}
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  );
}

function SaveBar({ dirty, saving, onCancel }: { dirty: boolean; saving: boolean; onCancel: () => void }) {
  return (
    <div className={`vs-savebar ${dirty ? "is-dirty" : ""}`}>
      <span>{dirty ? "Tenés cambios sin guardar" : "Todo guardado"}</span>
      <div>
        {dirty && <button type="button" className="secondary-button" onClick={onCancel}>Descartar</button>}
        <button type="submit" className="primary-button" disabled={!dirty || saving}>{saving ? "Guardando..." : "Guardar cambios"}</button>
      </div>
    </div>
  );
}

function PhotoButton({ url, name, onPick }: { url: string | null; name: string; onPick: (f: File | null) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="vs-photo">
      <button type="button" className="vs-photo-btn" onClick={() => ref.current?.click()} title="Cambiar foto">
        {url ? <img src={assetUrl(url)!} alt={name} /> : <span>+ Foto</span>}
      </button>
      {url && <button type="button" className="vs-photo-x" onClick={() => onPick(null)} aria-label="Quitar foto">×</button>}
      <input ref={ref} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f); e.target.value = ""; }} />
    </div>
  );
}

function ImagePick({ label, hint, url, square, onPick }: { label: string; hint: string; url: string | null; square?: boolean; onPick: (f: File | null) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="form-group vs-field">
      <label>{label}</label>
      <div className={`vs-image-pick ${square ? "is-square" : ""}`}>
        <button type="button" onClick={() => ref.current?.click()}>
          {url ? <img src={`${assetUrl(url)}`} alt="" /> : <span>Subir imagen</span>}
        </button>
        <div className="vs-image-actions">
          <button type="button" className="secondary-button" onClick={() => ref.current?.click()}>{url ? "Cambiar" : "Elegir archivo"}</button>
          {url && <button type="button" className="vs-text-danger" onClick={() => onPick(null)}>Quitar</button>}
        </div>
      </div>
      <small className="vs-hint">{hint}</small>
      <input ref={ref} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f); e.target.value = ""; }} />
    </div>
  );
}
