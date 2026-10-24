import { useState } from "react";

// Botón «Buscar cotizaciones»: trae las solicitudes que dejó la web en el buzón de Mezztt (Cloudflare) y las carga en este sistema.
// Cada solicitud se envía al /public/quote-request de este backend (el mismo que usaría la web) y, si entró bien, se borra del buzón.
// La dirección y la clave del buzón se piden una sola vez y quedan guardadas en este navegador.
const BUZON_URL_POR_DEFECTO = (import.meta as any).env?.VITE_BUZON_URL || "https://mezztt-buzon.mezzttofficial.workers.dev";   // buzón de Mezztt
const LS = "mezzttBuzon";

function leer(): { url: string; clave: string } {
  try {
    const d = JSON.parse(localStorage.getItem(LS) || "{}");
    return { url: String(d.url || BUZON_URL_POR_DEFECTO || ""), clave: String(d.clave || "") };
  } catch {
    return { url: BUZON_URL_POR_DEFECTO, clave: "" };
  }
}

export default function BuzonCotizaciones({ sistema, apiUrl, onDone }: { sistema: string; apiUrl: string; onDone?: () => void }) {
  const inicial = leer();
  const [url, setUrl] = useState(inicial.url);
  const [clave, setClave] = useState(inicial.clave);
  const [config, setConfig] = useState(!(inicial.url && inicial.clave));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  function guardar() {
    const u = url.trim().replace(/\/$/, "");
    if (!/^https?:\/\//.test(u) || !clave.trim()) { setMsg("Completá la dirección del buzón (https://…) y la clave."); return; }
    try { localStorage.setItem(LS, JSON.stringify({ url: u, clave: clave.trim() })); } catch { /* sin almacenamiento */ }
    setUrl(u); setConfig(false); setMsg("Buzón guardado. Ya podés buscar cotizaciones.");
  }

  async function buscar() {
    setBusy(true); setMsg("Buscando…");
    try {
      const base = url.trim().replace(/\/$/, "");
      const auth = { Authorization: `Bearer ${clave.trim()}` };
      const r = await fetch(`${base}/quotes?sistema=${encodeURIComponent(sistema)}`, { headers: auth });
      if (r.status === 401) { setConfig(true); throw new Error("La clave del buzón no es correcta."); }
      if (!r.ok) throw new Error("No se pudo consultar el buzón.");
      const lista: { id: string; query: string }[] = (await r.json()).quotes || [];
      if (!lista.length) { setMsg("No hay cotizaciones nuevas."); return; }
      const ok: string[] = [];
      let fallaron = 0;
      for (const q of lista) {
        try {
          const res = await fetch(`${apiUrl}/public/quote-request?${q.query}`, { method: "POST" });
          if (res.ok) ok.push(q.id); else fallaron++;
        } catch { fallaron++; }
      }
      if (ok.length) {
        await fetch(`${base}/quotes/ack`, { method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify({ ids: ok }) });
      }
      setMsg(`Se cargaron ${ok.length} cotización(es)` + (fallaron ? ` · ${fallaron} no se pudieron cargar y quedan en el buzón para reintentar.` : "."));
      if (ok.length && onDone) onDone();
    } catch (e: any) {
      setMsg(e?.message || "No se pudo buscar. Revisá tu conexión a internet.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dashboard-section" style={{ marginBottom: 20 }}>
      <div className="section-heading"><h2>Cotizaciones de la web</h2></div>
      <div className="product-actions" style={{ gap: 8, flexWrap: "wrap" }}>
        <button className="primary-button" onClick={buscar} disabled={busy || config}>{busy ? "Buscando…" : "Buscar cotizaciones"}</button>
        <button className="secondary-button" onClick={() => setConfig(!config)}>{config ? "Cerrar" : "Configurar buzón"}</button>
      </div>
      {config && (
        <div className="product-form" style={{ marginTop: 12 }}>
          <label>Dirección del buzón<input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://mezztt-buzon.tu-cuenta.workers.dev" /></label>
          <label>Clave del buzón<input type="password" value={clave} onChange={(e) => setClave(e.target.value)} autoComplete="off" /></label>
          <button className="primary-button" onClick={guardar}>Guardar</button>
        </div>
      )}
      {msg && <p style={{ marginTop: 10, fontSize: 13 }}>{msg}</p>}
    </div>
  );
}
