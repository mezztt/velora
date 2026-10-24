import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { BRAND_DEFAULTS } from "../config";
import type { BrandLinks } from "../config";
import { resetBrandLinks } from "../components/Brand";
import { startTour } from "../components/tour/Tour";
import { API_URL } from "../apiBase";

function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem("velora_admin_token")}` };
}

// Precios de los sistemas (USD). Se usan en cotizaciones, facturas mensuales y el abono sugerido.
const PRICE_FIELDS: [string, string, string][] = [
  ["base_cost", "Configuración", "Se cobra una sola vez, en el pago inicial"],
  ["module_price", "Cada módulo", "En el pago inicial y en el abono de cada mes"],
  ["landing_price", "Web: Landing Page sola", "En el pago inicial y en el abono de cada mes"],
  ["ecommerce_price", "Web: E-commerce sola", "En el pago inicial y en el abono de cada mes"],
  ["web_combo_price", "Web: Landing + E-commerce juntas", "Reemplaza a las dos anteriores cuando lleva las dos"],
];

// Marca y redes: enlaces que se ven en el login, el menú y las páginas públicas.
const BRAND_FIELDS: [keyof BrandLinks, string, string][] = [
  ["system_instagram_url", "Instagram de Velora", "El ícono de Instagram del login, del menú y de las páginas públicas"],
  ["mezztt_instagram_url", "Instagram de Mezztt", "El ícono que acompaña a “by Mezztt”"],
  ["mezztt_site_url", "Página de Mezztt", "A dónde lleva la palabra “Mezztt”. Si está vacía, usa https://mezztt.site"],
];

function AdminSettings() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [saving, setSaving] = useState(false);

  // precios
  const [prices, setPrices] = useState<Record<string, string> | null>(null);
  const [pricesError, setPricesError] = useState("");
  const [savingPrices, setSavingPrices] = useState(false);
  const [pricesSaved, setPricesSaved] = useState(false);

  // copia de seguridad
  const [downloading, setDownloading] = useState(false);
  const [backupMessage, setBackupMessage] = useState<{ text: string; ok: boolean } | null>(null);

  // marca y redes
  const [brand, setBrand] = useState<Record<string, string>>({ system_instagram_url: "", mezztt_instagram_url: "", mezztt_site_url: "" });
  const [brandMessage, setBrandMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [savingBrand, setSavingBrand] = useState(false);

  function readBrand(data: Record<string, unknown>) {
    const next: Record<string, string> = {};
    BRAND_FIELDS.forEach(([key]) => { next[key] = typeof data[key] === "string" ? (data[key] as string) : ""; });
    setBrand(next);
  }

  async function saveBrand(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    for (const [key, label] of BRAND_FIELDS) {
      const value = (brand[key] || "").trim();
      if (value && !/^https?:\/\//i.test(value)) {
        setBrandMessage({ text: `${label}: el enlace tiene que empezar con http:// o https://`, ok: false });
        return;
      }
    }
    setSavingBrand(true);
    setBrandMessage(null);
    try {
      const body: Record<string, string> = {};
      BRAND_FIELDS.forEach(([key]) => { body[key] = (brand[key] || "").trim(); });
      const response = await fetch(`${API_URL}/admin/billing-settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "No se pudieron guardar los enlaces");
      readBrand(data);
      resetBrandLinks();
      setBrandMessage({ text: "Enlaces guardados. Ya se ven en el login, el menú y las páginas públicas.", ok: true });
    } catch (error) {
      setBrandMessage({ text: error instanceof Error ? error.message : "No se pudieron guardar los enlaces.", ok: false });
    } finally {
      setSavingBrand(false);
    }
  }

  useEffect(() => {
    fetch(`${API_URL}/admin/billing-settings`, { headers: authHeaders() })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const data = await response.json();
        readBrand(data);
        const next: Record<string, string> = {};
        PRICE_FIELDS.forEach(([key]) => { next[key] = String(Number(data[key] ?? 0)); });
        setPrices(next);
      })
      .catch(() => setPricesError("No se pudieron cargar los precios."));
  }, []);

  async function savePrices(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!prices) return;
    const body: Record<string, number> = {};
    for (const [key, label] of PRICE_FIELDS) {
      const value = Number(String(prices[key]).replace(",", "."));
      if (prices[key].trim() === "" || isNaN(value) || value < 0) {
        setPricesError(`Revisá el precio de "${label}": tiene que ser un número mayor o igual a cero.`);
        return;
      }
      body[key] = value;
    }
    setSavingPrices(true);
    setPricesError("");
    setPricesSaved(false);
    try {
      const response = await fetch(`${API_URL}/admin/billing-settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "No se pudieron guardar los precios");
      const next: Record<string, string> = {};
      PRICE_FIELDS.forEach(([key]) => { next[key] = String(Number(data[key] ?? 0)); });
      setPrices(next);
      setPricesSaved(true);
    } catch (error) {
      setPricesError(error instanceof Error ? error.message : "No se pudieron guardar los precios.");
    } finally {
      setSavingPrices(false);
    }
  }

  async function downloadBackup() {
    setDownloading(true);
    setBackupMessage(null);
    try {
      const response = await fetch(`${API_URL}/admin/backup`, { headers: authHeaders() });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(typeof data.detail === "string" ? data.detail : "No se pudo generar la copia");
      }
      const disposition = response.headers.get("Content-Disposition") || "";
      const match = /filename="?([^";]+)"?/.exec(disposition);
      const filename = match ? match[1] : `velora-backup-${new Date().toISOString().slice(0, 10)}.json`;
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setBackupMessage({ text: `Copia descargada: ${filename}`, ok: true });
    } catch (error) {
      setBackupMessage({ text: error instanceof Error ? error.message : "No se pudo descargar la copia.", ok: false });
    } finally {
      setDownloading(false);
    }
  }

  const n = (key: string) => Number(String(prices?.[key] ?? "0").replace(",", ".")) || 0;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await fetch(`${API_URL}/admin/me/password`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "No se pudo cambiar la contraseña");
      alert("Contraseña actualizada.");
      setCurrentPassword(""); setNewPassword("");
    } catch (error) {
      alert(error instanceof Error ? error.message : "No se pudo cambiar la contraseña.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="products-page">
      <div className="products-header">
        <div>
          <span className="dashboard-eyebrow">MEZZTT</span>
          <h1>Configuración</h1>
          <p>Precios de los sistemas, marca y redes, copia de seguridad y tu contraseña del panel.</p>
        </div>
      </div>

      {/* PRECIOS */}
      <div className="vx-panel" style={{ maxWidth: 760 }}>
        <div className="vx-panel-head">
          <div>
            <h2>Precios de los sistemas (USD)</h2>
            <p className="vx-sub">
              Pago inicial (una sola vez) = configuración + módulos + webs. Abono mensual = módulos + webs (la configuración no se cobra por mes).
              Planes: trimestral = 2 meses por 3 (1 mes gratis) y anual = 10 meses por 12 (2 meses gratis); el pago inicial no se descuenta.
            </p>
          </div>
        </div>
        {!prices ? (
          <span className="vx-muted">{pricesError || "Cargando precios…"}</span>
        ) : (
          <form onSubmit={savePrices}>
            <div className="vx-grid-2">
              {PRICE_FIELDS.map(([key, label, hint]) => (
                <div className="vx-field" key={key}>
                  <label htmlFor={`price-${key}`}>{label}</label>
                  <input
                    id={`price-${key}`}
                    type="number"
                    min={0}
                    step="0.01"
                    value={prices[key]}
                    onChange={(e) => { setPrices({ ...prices, [key]: e.target.value }); setPricesSaved(false); }}
                    required
                  />
                  <span className="vx-hint">{hint}</span>
                </div>
              ))}
            </div>
            <div className="vx-totals">
              <div className="vx-total-box">
                <span>Ejemplo: 5 módulos, sin web</span>
                <strong>USD {n("base_cost") + 5 * n("module_price")} de pago inicial</strong>
                <small>y USD {5 * n("module_price")} por mes (sin IVA) · trimestral USD {10 * n("module_price")} · anual USD {50 * n("module_price")}</small>
              </div>
              <div className="vx-total-box">
                <span>Ejemplo: 5 módulos + las dos webs</span>
                <strong>USD {n("base_cost") + 5 * n("module_price") + n("web_combo_price")} de pago inicial</strong>
                <small>y USD {5 * n("module_price") + n("web_combo_price")} por mes (sin IVA)</small>
              </div>
            </div>
            {pricesError && <div className="vx-note is-bad" role="alert" style={{ marginTop: 12 }}><span>{pricesError}</span></div>}
            {pricesSaved && <div className="vx-note is-ok" role="status" style={{ marginTop: 12 }}><span>Precios guardados. Las cotizaciones y facturas nuevas ya usan estos valores.</span></div>}
            <button type="submit" className="primary-button" disabled={savingPrices} style={{ marginTop: 14 }}>
              {savingPrices ? "Guardando..." : "Guardar precios"}
            </button>
          </form>
        )}
      </div>

      {/* MARCA Y REDES */}
      <div className="vx-panel" style={{ maxWidth: 760 }}>
        <div className="vx-panel-head">
          <div>
            <h2>Marca y redes</h2>
            <p className="vx-sub">
              Los enlaces que aparecen junto al logo: en el login, en el pie del menú y en las páginas públicas.
              Si dejás un campo vacío se usa el enlace por defecto.
            </p>
          </div>
        </div>
        <form onSubmit={saveBrand}>
          <div className="vx-grid-2">
            {BRAND_FIELDS.map(([key, label, hint]) => (
              <div className="vx-field" key={key}>
                <label htmlFor={`brand-${key}`}>{label}</label>
                <input
                  id={`brand-${key}`}
                  type="url"
                  inputMode="url"
                  maxLength={300}
                  placeholder={BRAND_DEFAULTS[key] || "https://…  (todavía no hay página)"}
                  value={brand[key] || ""}
                  onChange={(e) => { setBrand({ ...brand, [key]: e.target.value }); setBrandMessage(null); }}
                />
                <span className="vx-hint">{hint}</span>
              </div>
            ))}
          </div>
          {brandMessage && (
            <div className={`vx-note ${brandMessage.ok ? "is-ok" : "is-bad"}`} role={brandMessage.ok ? "status" : "alert"} style={{ marginTop: 12 }}>
              <span>{brandMessage.text}</span>
            </div>
          )}
          <button type="submit" className="primary-button" disabled={savingBrand} style={{ marginTop: 14 }}>
            {savingBrand ? "Guardando..." : "Guardar enlaces"}
          </button>
        </form>
      </div>

      {/* COPIA DE SEGURIDAD */}
      <div className="vx-panel" style={{ maxWidth: 760 }}>
        <div className="vx-panel-head">
          <div>
            <h2>Copia de seguridad</h2>
            <p className="vx-sub">
              Descarga un archivo con todos los datos de todos los sistemas de Velora (clientes, productos, pedidos, facturas, etc.).
              Guardalo en un lugar seguro: sirve para recuperar la información si algo falla.
            </p>
          </div>
          <button type="button" className="primary-button" onClick={downloadBackup} disabled={downloading}>
            {downloading ? "Preparando la copia..." : "Descargar copia"}
          </button>
        </div>
        {backupMessage && (
          <div className={`vx-note ${backupMessage.ok ? "is-ok" : "is-bad"}`} role="status" style={{ marginBottom: 0 }}>
            <span>{backupMessage.text}</span>
          </div>
        )}
      </div>

      {/* AYUDA */}
      <div className="vx-panel" style={{ maxWidth: 760 }}>
        <div className="vx-panel-head">
          <div>
            <h2>Ayuda</h2>
            <p className="vx-sub">Volvé a ver el recorrido por el sistema.</p>
          </div>
          <button type="button" className="secondary-button" onClick={startTour}>¿Cómo funcionamos?</button>
        </div>
      </div>

      {/* CONTRASEÑA */}
      <div className="vx-panel" style={{ maxWidth: 480 }}>
        <div className="vx-panel-head"><div><h2>Contraseña del panel</h2></div></div>
        <form onSubmit={handleSubmit} className="product-form">
          <div className="form-group">
            <label>Contraseña actual</label>
            <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
          </div>
          <div className="form-group">
            <label>Contraseña nueva</label>
            <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
          </div>
          <button type="submit" className="primary-button" disabled={saving} style={{ alignSelf: "flex-start" }}>
            {saving ? "Guardando..." : "Cambiar contraseña"}
          </button>
        </form>
      </div>
    </section>
  );
}

export default AdminSettings;