import { useEffect, useMemo, useState } from "react";
import { api, errorText, money } from "../extras";

// ============================================================
// ACTUALIZACIÓN MASIVA DE PRECIOS (pestaña dentro de Productos)
// ============================================================

export interface BulkProduct {
  id: number;
  name: string;
  sku: string | null;
  price: number;
  cost?: number | null;
}

interface Options {
  categories: string[];
  suppliers: { id: number; name: string }[];
  product_categories: Record<string, string>;
}

interface PreviewRow {
  product_id: number; name: string; sku: string | null;
  old_price: number; new_price: number; old_cost: number | null; new_cost: number | null;
}
interface Preview { criteria: string; count: number; rows: PreviewRow[] }

interface Change {
  id: number; created_at: string; user_name: string | null; criteria: string; products_count: number;
  applied_price: boolean; applied_cost: boolean; undone: boolean; undone_at: string | null; can_undo: boolean;
  items?: PreviewRow[];
}

type Action = "UP_PCT" | "DOWN_PCT" | "UP_FIX" | "DOWN_FIX";

const ROUNDINGS: [string, string][] = [
  ["NONE", "Sin redondeo"],
  ["R10", "Redondear a $10"],
  ["R100", "Redondear a $100"],
  ["END90", "Terminar en 90 (ej. $1.290)"],
  ["END99", "Terminar en 99 (ej. $1.299)"],
];

function when(iso: string) {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "—" : d.toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function BulkPrices({ products, canEdit, onApplied }: { products: BulkProduct[]; canEdit: boolean; onApplied: () => void }) {
  const [options, setOptions] = useState<Options>({ categories: [], suppliers: [], product_categories: {} });
  const [scope, setScope] = useState<"filters" | "manual">("filters");
  const [category, setCategory] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [picked, setPicked] = useState<number[]>([]);
  const [search, setSearch] = useState("");

  const [action, setAction] = useState<Action>("UP_PCT");
  const [value, setValue] = useState("");
  const [rounding, setRounding] = useState("NONE");
  const [applyPrice, setApplyPrice] = useState(true);
  const [applyCost, setApplyCost] = useState(false);

  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<{ text: string; tone: "ok" | "error" } | null>(null);

  const [history, setHistory] = useState<Change[]>([]);
  const [detail, setDetail] = useState<Change | null>(null);

  function notify(text: string, tone: "ok" | "error" = "ok") {
    setToast({ text, tone });
    window.setTimeout(() => setToast(null), 3500);
  }

  async function loadHistory() {
    try { setHistory(await api<Change[]>("/pricing/changes")); } catch { /* el historial no es crítico */ }
  }
  useEffect(() => {
    api<Options>("/pricing/bulk/options").then(setOptions).catch(() => undefined);
    loadHistory();
  }, []);

  // cualquier cambio en el criterio invalida la vista previa: hay que volver a verla antes de aplicar
  useEffect(() => { setPreview(null); setError(""); }, [scope, category, supplierId, picked, action, value, rounding, applyPrice, applyCost]);

  function body() {
    const n = Number(value.replace(",", "."));
    const negative = action === "DOWN_PCT" || action === "DOWN_FIX";
    return {
      category: scope === "filters" ? category || null : null,
      supplier_id: scope === "filters" && supplierId !== "" ? Number(supplierId) : null,
      product_ids: scope === "manual" ? picked : null,
      mode: action === "UP_PCT" || action === "DOWN_PCT" ? "PERCENT" : "FIXED",
      value: (isNaN(n) ? 0 : n) * (negative ? -1 : 1),
      rounding,
      apply_price: applyPrice,
      apply_cost: applyCost,
    };
  }

  async function seePreview() {
    setBusy(true); setError("");
    try {
      setPreview(await api<Preview>("/pricing/bulk/preview", "POST", body()));
    } catch (e) {
      setPreview(null);
      setError(errorText(e, "No se pudo calcular la vista previa"));
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    if (!preview || preview.count === 0) return;
    if (!window.confirm(`Vas a cambiar ${preview.count} producto${preview.count === 1 ? "" : "s"}.\n\n${preview.criteria}\n\n¿Confirmás? Después podés deshacerlo desde el historial.`)) return;
    setBusy(true); setError("");
    try {
      const res = await api<{ count: number }>("/pricing/bulk/apply", "POST", body());
      setPreview(null); setValue(""); setPicked([]);
      notify(`Listo: se actualizaron ${res.count} producto${res.count === 1 ? "" : "s"}`);
      await loadHistory();
      onApplied();
    } catch (e) {
      setError(errorText(e, "No se pudieron actualizar los precios"));
    } finally {
      setBusy(false);
    }
  }

  async function undo(c: Change) {
    if (!window.confirm(`¿Deshacer esta actualización?\n\n${c.criteria}\n\nLos ${c.products_count} productos vuelven al valor que tenían antes (salvo los que cambiaste a mano después).`)) return;
    setBusy(true);
    try {
      const res = await api<{ restored: number; skipped: number }>(`/pricing/changes/${c.id}/undo`, "POST");
      notify(`Se deshizo: ${res.restored} producto${res.restored === 1 ? "" : "s"} volvieron al valor anterior${res.skipped ? ` (${res.skipped} no se tocaron porque se cambiaron después)` : ""}`);
      setDetail(null);
      await loadHistory();
      onApplied();
    } catch (e) {
      notify(errorText(e, "No se pudo deshacer"), "error");
    } finally {
      setBusy(false);
    }
  }

  async function openDetail(c: Change) {
    try { setDetail(await api<Change>(`/pricing/changes/${c.id}`)); }
    catch (e) { notify(errorText(e), "error"); }
  }

  const manualList = useMemo(() => {
    const t = search.trim().toLowerCase();
    return products.filter((p) => !t || p.name.toLowerCase().includes(t) || (p.sku || "").toLowerCase().includes(t));
  }, [products, search]);

  const isPct = action === "UP_PCT" || action === "DOWN_PCT";
  const ready = value.trim() !== "" || rounding !== "NONE";

  return (
    <div>
      {toast && <div className={`vx-toast is-${toast.tone}`} role="status">{toast.text}</div>}

      {!canEdit ? (
        <div className="vx-note is-info"><span>Solo un administrador o encargado puede cambiar precios en masa. Abajo podés ver el historial.</span></div>
      ) : (
        <div className="vx-panel">
          <div className="vx-panel-head">
            <div>
              <h2>Actualizar precios</h2>
              <p className="vx-sub">Elegí los productos, el cambio y mirá la vista previa antes de confirmar. Nada se modifica hasta que confirmes.</p>
            </div>
          </div>

          <h3>1 · ¿Qué productos?</h3>
          <div className="vx-tabs" role="tablist" style={{ marginTop: 6 }}>
            <button type="button" className={scope === "filters" ? "is-on" : ""} onClick={() => setScope("filters")}>Por categoría o proveedor</button>
            <button type="button" className={scope === "manual" ? "is-on" : ""} onClick={() => setScope("manual")}>Elegir a mano{picked.length ? ` (${picked.length})` : ""}</button>
          </div>

          {scope === "filters" ? (
            <div className="vx-grid-2" style={{ marginBottom: 16 }}>
              <div className="vx-field">
                <label htmlFor="vx-bulk-cat">Categoría</label>
                <select id="vx-bulk-cat" value={category} onChange={(e) => setCategory(e.target.value)}>
                  <option value="">Todas</option>
                  {options.categories.map((c) => <option key={c} value={c}>{c}</option>)}
                  <option value="__none__">Sin categoría</option>
                </select>
              </div>
              <div className="vx-field">
                <label htmlFor="vx-bulk-sup">Proveedor habitual</label>
                <select id="vx-bulk-sup" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                  <option value="">Todos</option>
                  {options.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  <option value="0">Sin proveedor</option>
                </select>
              </div>
            </div>
          ) : (
            <div style={{ marginBottom: 16 }}>
              <div className="vx-row" style={{ marginBottom: 8 }}>
                <div className="products-search" style={{ flex: 1, minWidth: 220 }}>
                  <span className="products-search-icon">⌕</span>
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar producto o SKU..." />
                </div>
                <button type="button" className="vx-linkbtn" onClick={() => setPicked(Array.from(new Set([...picked, ...manualList.map((p) => p.id)])))}>Marcar los {manualList.length} que se ven</button>
                {picked.length > 0 && <button type="button" className="vx-linkbtn" onClick={() => setPicked([])}>Desmarcar todos</button>}
              </div>
              <div className="vx-table-wrap vx-table-scroll" style={{ maxHeight: 260 }}>
                <table className="vx-table">
                  <tbody>
                    {manualList.slice(0, 200).map((p) => (
                      <tr key={p.id}>
                        <td style={{ width: 36 }}>
                          <input type="checkbox" aria-label={`Elegir ${p.name}`} checked={picked.includes(p.id)}
                            onChange={() => setPicked(picked.includes(p.id) ? picked.filter((x) => x !== p.id) : [...picked, p.id])} />
                        </td>
                        <td>{p.name}<small>{[p.sku, options.product_categories[String(p.id)]].filter(Boolean).join(" · ")}</small></td>
                        <td className="vx-r">{money(p.price)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {manualList.length > 200 && <p className="vx-hint" style={{ marginTop: 6 }}>Se muestran los primeros 200. Usá el buscador.</p>}
            </div>
          )}

          <h3>2 · ¿Qué cambio?</h3>
          <div className="vx-grid-3" style={{ margin: "8px 0 12px" }}>
            <div className="vx-field">
              <label htmlFor="vx-bulk-action">Cambio</label>
              <select id="vx-bulk-action" value={action} onChange={(e) => setAction(e.target.value as Action)}>
                <option value="UP_PCT">Aumentar un porcentaje</option>
                <option value="DOWN_PCT">Bajar un porcentaje</option>
                <option value="UP_FIX">Sumar un monto fijo</option>
                <option value="DOWN_FIX">Restar un monto fijo</option>
              </select>
            </div>
            <div className="vx-field">
              <label htmlFor="vx-bulk-value">{isPct ? "Porcentaje (%)" : "Monto ($)"}</label>
              <input id="vx-bulk-value" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder={isPct ? "Ej. 12" : "Ej. 500"} />
            </div>
            <div className="vx-field">
              <label htmlFor="vx-bulk-round">Redondeo</label>
              <select id="vx-bulk-round" value={rounding} onChange={(e) => setRounding(e.target.value)}>
                {ROUNDINGS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </div>
          </div>
          <div className="vx-row" style={{ marginBottom: 14 }}>
            <label className="vx-check"><input type="checkbox" checked={applyPrice} onChange={(e) => setApplyPrice(e.target.checked)} /> Precio de venta</label>
            <label className="vx-check"><input type="checkbox" checked={applyCost} onChange={(e) => setApplyCost(e.target.checked)} /> Costo</label>
          </div>

          {error && <div className="vx-note is-bad" role="alert"><span>{error}</span></div>}

          <button type="button" className="secondary-button" onClick={seePreview} disabled={busy || !ready || (scope === "manual" && picked.length === 0)}>
            {busy && !preview ? "Calculando..." : "Ver vista previa"}
          </button>

          {preview && (
            <div style={{ marginTop: 16 }}>
              <h3>3 · Vista previa</h3>
              <p className="vx-sub" style={{ marginBottom: 10 }}>{preview.criteria}</p>
              {preview.count === 0 ? (
                <div className="vx-note is-warn"><span>Con ese criterio no cambia ningún producto.</span></div>
              ) : (
                <>
                  <div className="vx-table-wrap vx-table-scroll">
                    <table className="vx-table">
                      <thead>
                        <tr>
                          <th>Producto</th>
                          {applyPrice && <><th className="vx-r">Precio antes</th><th className="vx-r">Precio después</th></>}
                          {applyCost && <><th className="vx-r">Costo antes</th><th className="vx-r">Costo después</th></>}
                        </tr>
                      </thead>
                      <tbody>
                        {preview.rows.slice(0, 300).map((r) => (
                          <tr key={r.product_id}>
                            <td>{r.name}<small>{r.sku || ""}</small></td>
                            {applyPrice && <><td className="vx-r">{money(r.old_price)}</td><td className={`vx-r ${r.new_price > r.old_price ? "is-up" : r.new_price < r.old_price ? "is-down" : ""}`}>{r.new_price > r.old_price ? "↑ " : r.new_price < r.old_price ? "↓ " : ""}{money(r.new_price)}</td></>}
                            {applyCost && <><td className="vx-r">{r.old_cost === null ? "—" : money(r.old_cost)}</td><td className="vx-r">{r.new_cost === null ? "Sin costo cargado" : money(r.new_cost)}</td></>}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {preview.rows.length > 300 && <p className="vx-hint" style={{ marginTop: 6 }}>Se muestran 300 de {preview.count}. El cambio se aplica a todos.</p>}
                  <div className="vx-row-end" style={{ marginTop: 14 }}>
                    <button type="button" className="secondary-button" onClick={() => setPreview(null)}>Cancelar</button>
                    <button type="button" className="primary-button" onClick={apply} disabled={busy}>
                      {busy ? "Aplicando..." : `Confirmar y actualizar ${preview.count} producto${preview.count === 1 ? "" : "s"}`}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* ---------- historial ---------- */}
      <div className="vx-panel">
        <div className="vx-panel-head">
          <div>
            <h2>Historial de actualizaciones</h2>
            <p className="vx-sub">Queda registrado quién cambió qué. La última actualización se puede deshacer.</p>
          </div>
        </div>
        {history.length === 0 ? (
          <div className="vx-empty">Todavía no hiciste ninguna actualización masiva.</div>
        ) : (
          <div className="vx-table-wrap">
            <table className="vx-table">
              <thead><tr><th>Fecha</th><th>Usuario</th><th>Qué se hizo</th><th className="vx-r">Productos</th><th>Estado</th><th></th></tr></thead>
              <tbody>
                {history.map((c) => (
                  <tr key={c.id}>
                    <td>{when(c.created_at)}</td>
                    <td>{c.user_name || "—"}</td>
                    <td>{c.criteria}</td>
                    <td className="vx-r">{c.products_count}</td>
                    <td>{c.undone ? <span className="vx-badge">Deshecha</span> : <span className="vx-badge is-ok">Aplicada</span>}</td>
                    <td>
                      <div className="vx-row-end">
                        <button type="button" className="product-action-edit" onClick={() => openDetail(c)}>Ver detalle</button>
                        {c.can_undo && canEdit && <button type="button" className="product-action-delete" onClick={() => undo(c)} disabled={busy}>Deshacer</button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {detail && (
        <div className="modal-overlay" onClick={() => setDetail(null)}>
          <div className="product-modal vx-modal-wide" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div><span className="dashboard-eyebrow">{when(detail.created_at)} · {detail.user_name || "—"}</span><h2>{detail.products_count} productos {detail.undone ? "(deshecha)" : "actualizados"}</h2></div>
              <button className="modal-close" type="button" onClick={() => setDetail(null)}>×</button>
            </div>
            <div className="product-form">
              <p className="vx-sub">{detail.criteria}</p>
              <div className="vx-table-wrap vx-table-scroll">
                <table className="vx-table">
                  <thead>
                    <tr>
                      <th>Producto</th>
                      {detail.applied_price && <><th className="vx-r">Precio anterior</th><th className="vx-r">Precio nuevo</th></>}
                      {detail.applied_cost && <><th className="vx-r">Costo anterior</th><th className="vx-r">Costo nuevo</th></>}
                    </tr>
                  </thead>
                  <tbody>
                    {(detail.items || []).map((r) => (
                      <tr key={r.product_id}>
                        <td>{r.name}<small>{r.sku || ""}</small></td>
                        {detail.applied_price && <><td className="vx-r">{money(r.old_price)}</td><td className="vx-r">{money(r.new_price)}</td></>}
                        {detail.applied_cost && <><td className="vx-r">{r.old_cost === null ? "—" : money(r.old_cost)}</td><td className="vx-r">{r.new_cost === null ? "—" : money(r.new_cost)}</td></>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="modal-actions">
                {detail.can_undo && canEdit && <button type="button" className="product-action-delete" onClick={() => undo(detail)} disabled={busy}>Deshacer esta actualización</button>}
                <button type="button" className="secondary-button" onClick={() => setDetail(null)}>Cerrar</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
