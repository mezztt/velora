import { useEffect, useState } from "react";
import { currentRole, statusLabel } from "../extras";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { startTour } from "../components/tour/Tour";
import { BajaCard } from "../components/ServiceCancel";
import { API_URL } from "../apiBase";
import { RUBROS, RUBRO_STARTER } from "../rubros";

interface Company {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  country: string | null;
  currency: string;
  subscription_status: string;
  rubro?: string | null;
}


function authHeaders() {
  const token = localStorage.getItem("velora_token");
  return { Authorization: `Bearer ${token}` };
}

function Configuracion() {
  const navigate = useNavigate();

  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cuit, setCuit] = useState("");
  const [arcaCert, setArcaCert] = useState("");
  const [arcaKey, setArcaKey] = useState("");
  const [arcaEnv, setArcaEnv] = useState("testing");
  const [arcaEnabled, setArcaEnabled] = useState(false);
  const [savingArca, setSavingArca] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [rubro, setRubro] = useState("");
  async function loadArcaConfig() {
  const response = await fetch(`${API_URL}/company/arca`, { headers: authHeaders() });
  if (!response.ok) return;
  const data = await response.json();
  setCuit(data.cuit || "");
  setArcaCert(data.arca_cert || "");
  setArcaKey(data.arca_key || "");
  setArcaEnv(data.arca_environment);
  setArcaEnabled(data.arca_enabled);
}
  async function saveArcaConfig() {
  setSavingArca(true);
  try {
    const response = await fetch(`${API_URL}/company/arca`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({
        cuit, arca_cert: arcaCert, arca_key: arcaKey,
        arca_environment: arcaEnv, arca_enabled: arcaEnabled,
      }),
    });
    if (!response.ok) throw new Error();
    alert("Configuración de ARCA guardada.");
  } catch {
    alert("No se pudo guardar.");
  } finally {
    setSavingArca(false);
  }
}

  async function loadCompany() {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/company`, {
        headers: authHeaders(),
      });
      if (!response.ok) throw new Error("No se pudo cargar la empresa");
      const data: Company = await response.json();
      setCompany(data);
      setName(data.name);
      setEmail(data.email || "");
      setPhone(data.phone || "");
      setCountry(data.country || "");
      setCurrency(data.currency);
      setRubro(data.rubro || "");
    } catch (error) {
      console.error("Error cargando empresa:", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCompany();
    loadArcaConfig();
  }, []);

  async function saveCompany(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);

    try {
      const response = await fetch(`${API_URL}/company`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify({
          name,
          email: email || null,
          phone: phone || null,
          country: country || null,
          currency,
          rubro: rubro || null,
        }),
      });

      if (!response.ok) throw new Error("No se pudo guardar");
      await loadCompany();
      alert("Datos de la empresa actualizados.");
    } catch (error) {
      console.error("Error guardando empresa:", error);
      alert("No se pudo guardar los cambios.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="products-page">
      <div className="products-header">
        <div>
          <span className="dashboard-eyebrow">SISTEMA</span>
          <h1>Configuración</h1>
          <p>Datos de tu empresa y preferencias generales.</p>
        </div>
      </div>

      {loading ? (
        <div className="products-loading">
          <div className="products-loading-spinner" />
          <span>Cargando...</span>
        </div>
      ) : (
        <>
          <div className="dashboard-section" style={{ marginBottom: 20 }}>
            <div className="section-heading">
              <h2>Datos de la empresa</h2>
              <p>Esta información aparece en tus comprobantes y en el panel.</p>
            </div>

            <form onSubmit={saveCompany} className="product-form" style={{ maxWidth: 560 }}>
              <div className="form-group">
                <label>Nombre de la empresa</label>
                <input
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label>Tipo de negocio</label>
                <select value={rubro} onChange={(event) => setRubro(event.target.value)}>
                  <option value="">Sin definir</option>
                  {RUBROS.map((r) => (
                    <option key={r.key} value={r.key}>{r.icon} {r.label}</option>
                  ))}
                </select>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Teléfono</label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>País</label>
                  <input
                    type="text"
                    value={country}
                    onChange={(event) => setCountry(event.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Moneda</label>
                  <select
                    value={currency}
                    onChange={(event) => setCurrency(event.target.value)}
                  >
                    <option value="USD">USD</option>
                    <option value="ARS">ARS</option>
                    <option value="EUR">EUR</option>
                  </select>
                </div>
              </div>

              {company && (
                <div className="form-group">
                  <label>Estado de suscripción</label>
                  <p style={{ fontSize: 13, color: "#5f554d" }}>
                    {statusLabel(company.subscription_status)}
                  </p>
                </div>
              )}

              <button type="submit" className="primary-button" disabled={saving} style={{ alignSelf: "flex-start" }}>
                {saving ? "Guardando..." : "Guardar cambios"}
              </button>
            </form>
          </div>

          {company?.rubro && RUBRO_STARTER[company.rubro] && (
            <div className="dashboard-section" style={{ marginBottom: 20 }}>
              <div className="section-heading">
                <h2>Sugerencias para {RUBROS.find((r) => r.key === company.rubro)?.label}</h2>
                <p>Categorías y unidades típicas de tu rubro. Al cargar productos, las categorías aparecen como opciones; no se crea nada solo.</p>
              </div>
              <p style={{ margin: "0 0 6px", fontWeight: 600 }}>Categorías</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                {RUBRO_STARTER[company.rubro].categories.map((c) => (
                  <span key={c} style={{ padding: "4px 10px", borderRadius: 999, background: "rgba(127,127,127,0.14)" }}>{c}</span>
                ))}
              </div>
              <p style={{ margin: "0 0 6px", fontWeight: 600 }}>Unidades</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                {RUBRO_STARTER[company.rubro].units.map((u) => (
                  <span key={u} style={{ padding: "4px 10px", borderRadius: 999, background: "rgba(127,127,127,0.14)" }}>{u}</span>
                ))}
              </div>
              <button
                type="button"
                className="primary-button"
                onClick={() => {
                  const text = RUBRO_STARTER[company.rubro as string].categories.join("\n");
                  navigator.clipboard?.writeText(text).then(
                    () => alert("Categorías copiadas. Podés pegarlas donde las necesites."),
                    () => alert("No se pudo copiar. Seleccioná las categorías a mano."),
                  );
                }}
              >
                Copiar categorías sugeridas
              </button>
            </div>
          )}

          <div className="dashboard-section" style={{ marginBottom: 20 }}>
            <div className="section-heading">
              <h2>Depósitos</h2>
              <p>Los depósitos se administran dentro del módulo Stock.</p>
            </div>
            <button className="secondary-button" onClick={() => navigate("/stock")}>
              Ir a Stock →
            </button>
          </div>

          <div className="dashboard-section">
  <div className="section-heading"><h2>Facturación electrónica (ARCA)</h2></div>
  <div className="form-group"><label>CUIT</label><input value={cuit} onChange={(e) => setCuit(e.target.value)} /></div>
  <div className="form-group"><label>Certificado (.crt)</label><textarea rows={4} value={arcaCert} onChange={(e) => setArcaCert(e.target.value)} /></div>
  <div className="form-group"><label>Clave privada (.key)</label><textarea rows={4} value={arcaKey} onChange={(e) => setArcaKey(e.target.value)} /></div>
  <div className="form-group">
    <label>Ambiente</label>
    <select value={arcaEnv} onChange={(e) => setArcaEnv(e.target.value)}>
      <option value="testing">Homologación (pruebas)</option>
      <option value="production">Producción</option>
    </select>
  </div>
  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, marginBottom: 14 }}>
    <input type="checkbox" checked={arcaEnabled} onChange={(e) => setArcaEnabled(e.target.checked)} />
    Activar ARCA real para este sistema
  </label>
  <button className="primary-button" onClick={saveArcaConfig} disabled={savingArca} style={{ alignSelf: "flex-start" }}>
    {savingArca ? "Guardando..." : "Guardar"}
  </button>
</div>

          <div className="dashboard-section" style={{ marginBottom: 20 }}>
            <div className="section-heading">
              <h2>Ayuda</h2>
              <p>Volvé a ver el recorrido por el sistema.</p>
            </div>
            <div className="product-actions" style={{ justifyContent: "flex-start" }}>
              <button type="button" className="secondary-button" onClick={startTour}>¿Cómo funcionamos?</button>
            </div>
          </div>

          {currentRole() === "ADMINISTRADOR" && <div style={{ marginBottom: 20 }}><BajaCard /></div>}

          <div className="dashboard-section" style={{ marginBottom: 20 }}>
            <div className="section-heading">
              <h2>Apariencia</h2>
            </div>
            <div className="product-actions" style={{ justifyContent: "flex-start" }}>
              <button
                className="secondary-button"
                onClick={() => {
                  document.documentElement.setAttribute("data-theme", "light");
                  localStorage.setItem("velora_theme", "light");
                }}
              >
                Claro
              </button>
              <button
                className="secondary-button"
                onClick={() => {
                  document.documentElement.setAttribute("data-theme", "dark");
                  localStorage.setItem("velora_theme", "dark");
                }}
              >
                Oscuro
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

export default Configuracion;