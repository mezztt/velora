import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, errorText, loadModules, moduleOn, money, num } from "../extras";

// ============================================================
// REPOSICIÓN (pestaña dentro de Stock): qué falta y cuánto conviene comprar
// ============================================================

interface Row {
  product_id: number;
  name: string;
  sku: string | null;
  supplier_id: number | null;
  supplier_name: string | null;
  available: number;
  min_stock: number;
  avg_daily_sales: number;
  days_left: number | null;
  on_order: number;
  suggested: number;
  unit_cost: number;
}
interface Group { supplier_id: number | null; supplier_name: string; items: Row[]; estimated_total: number }
interface Data { days: number; sales_window_days: number; count: number; groups: Group[] }
interface Lite { id: number; name: string; active?: boolean }
interface DraftLine { product_id: number; name: string; quantity: string; unit_cost: string }

export default function Reposicion({ warehouses }: { warehouses: Lite[] }) {
  const navigate = useNavigate();
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [days, setDays] = useState("30");
  const [warehouseId, setWarehouseId] = useState("");
  const [suppliers, setSuppliers] = useState<Lite[]>([]);
  const [modules, setModules] = useState<string[] | null>(null);
  const [toast, setToast] = useState<{ text: string; tone: "ok" | "error"; link?: boolean } | null>(null);

  // orden de compra en preparación
  const [draftGroup, setDraftGroup] = useState<Group | null>(null);
  const [draftLines, setDraftLines] = useState<DraftLine[]>([]);
  const [draftWarehouse, setDraftWarehouse] = useState("");
  const [saving, setSaving] = useState(false);

  function notify(text: string, tone: "ok" | "error" = "ok", link = false) {
    setToast({ text, tone, link });
    window.setTimeout(() => setToast(null), link ? 7000 : 3200);
  }

  async function load() {
    const d = Math.min(Math.max(Math.round(Number(days) || 30), 1), 365);
    setLoading(true);
    try {
      const qs = `days=${d}${warehouseId ? `&warehouse_id=${warehouseId}` : ""}`;
      setData(await api<Data>(`/stock/replenishment?${qs}`));
      setError("");
    } catch (e) {
      setError(errorText(e, "No se pudo calcular la reposición"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    api<Lite[]>("/suppliers").then(setSuppliers).catch(() => setSuppliers([]));
    loadModules().then(setModules);
  }, []);

  useEffect(() => {
    const t = window.setTimeout(load, 300);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, warehouseId]);

  async function assignSupplier(row: Row, supplierId: string) {
    if (!supplierId) return;
    try {
      await api(`/products/${row.product_id}/supplier`, "PUT", { supplier_id: Number(supplierId) });
      notify(`${row.name}: proveedor asignado`);
      await load();
    } catch (e) {
      notify(errorText(e, "No se pudo asignar el proveedor"), "error");
    }
  }

  function openDraft(group: Group) {
    const activeWarehouses = warehouses.filter((w) => w.active !== false);
    setDraftGroup(group);
    setDraftWarehouse(warehouseId || (activeWarehouses[0] ? String(activeWarehouses[0].id) : ""));
    setDraftLines(group.items.filter((r) => r.suggested > 0).map((r) => ({
      product_id: r.product_id, name: r.name, quantity: String(r.suggested), unit_cost: r.unit_cost ? String(r.unit_cost) : "",
    })));
  }

  const draftTotal = draftLines.reduce((sum, l) => sum + Number(l.quantity || 0) * Number(l.unit_cost || 0), 0);

  async function createPurchase() {
    if (!draftGroup || !draftGroup.supplier_id) return;
    const items = draftLines
      .filter((l) => Number(l.quantity) > 0)
      .map((l) => ({ product_id: l.product_id, quantity: Number(l.quantity), unit_cost: Number(l.unit_cost || 0) }));
    if (!items.length) { notify("Dejá al menos un producto con cantidad mayor a cero", "error"); return; }
    if (!draftWarehouse) { notify("Elegí a qué depósito va a entrar la mercadería", "error"); return; }
    setSaving(true);
    try {
      const created = await api<{ id: number }>("/purchases", "POST", {
        supplier_id: draftGroup.supplier_id,
        warehouse_id: Number(draftWarehouse),
        notes: `Generada desde Reposición (cubre ${data?.days ?? 30} días)`,
        items,
      });
      setDraftGroup(null);
      notify(`Orden de compra #${created.id} creada para ${draftGroup.supplier_name}. Queda pendiente de recibir.`, "ok", true);
      await load();
    } catch (e) {
      notify(errorText(e, "No se pudo crear la orden de compra"), "error");
    } finally {
      setSaving(false);
    }
  }

  const canBuy = moduleOn(modules, "compras");

  return (
    <div>
      {toast && (
        <div className={`vx-toast is-${toast.tone}`} role="status">
          {toast.text}
          {toast.link && <> <button type="button" className="vx-linkbtn" style={{ color: "#fff" }} onClick={() => navigate("/purchases")}>Ver en Compras</button></>}
        </div>
      )}

      <div className="vx-panel">
        <div className="vx-panel-head">
          <div>
            <h2>Reposición</h2>
            <p className="vx-sub">
              Productos con stock disponible igual o menor a su mínimo. La cantidad sugerida alcanza para los días que elijas,
              según lo vendido en los últimos {data?.sales_window_days ?? 30} días, menos lo que ya está pedido.
            </p>
          </div>
        </div>
        <div className="vx-row">
          <div className="vx-field" style={{ width: 150 }}>
            <label htmlFor="vx-rep-days">Cubrir (días)</label>
            <input id="vx-rep-days" type="number" min={1} max={365} value={days} onChange={(e) => setDays(e.target.value)} />
          </div>
          <div className="vx-field" style={{ minWidth: 220 }}>
            <label htmlFor="vx-rep-wh">Depósito</label>
            <select id="vx-rep-wh" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
              <option value="">Todos los depósitos</option>
              {warehouses.filter((w) => w.active !== false).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      {error && <div className="vx-note is-bad" role="alert"><span>{error}</span></div>}

      {loading && !data ? (
        <div className="products-loading"><div className="products-loading-spinner" /><span>Calculando...</span></div>
      ) : data && data.count === 0 ? (
        <div className="vx-panel">
          <div className="vx-empty">
            <strong>No hay nada para reponer</strong>
            Ningún producto está en o por debajo de su mínimo. El mínimo de cada producto se carga en la pestaña Inventario.
          </div>
        </div>
      ) : data && (
        data.groups.map((g) => (
          <div className="vx-group" key={g.supplier_id ?? 0}>
            <div className="vx-group-head">
              <div>
                <strong>{g.supplier_name}</strong>{" "}
                <span>· {g.items.length} producto{g.items.length === 1 ? "" : "s"}{g.estimated_total > 0 ? ` · compra estimada ${money(g.estimated_total)}` : ""}</span>
              </div>
              {g.supplier_id ? (
                canBuy && (
                  <button type="button" className="primary-button" onClick={() => openDraft(g)} disabled={!g.items.some((r) => r.suggested > 0)}>
                    Generar orden de compra
                  </button>
                )
              ) : (
                <span>Asignales un proveedor para poder generar la orden de compra</span>
              )}
            </div>
            <div className="vx-table-wrap">
              <table className="vx-table">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th className="vx-r">Disponible</th>
                    <th className="vx-r">Mínimo</th>
                    <th className="vx-r">Venta por día</th>
                    <th className="vx-r">Alcanza para</th>
                    <th className="vx-r">Ya pedido</th>
                    <th className="vx-r">Sugerido</th>
                    {!g.supplier_id && <th>Proveedor</th>}
                  </tr>
                </thead>
                <tbody>
                  {g.items.map((r) => (
                    <tr key={r.product_id}>
                      <td>{r.name}<small>{r.sku || ""}</small></td>
                      <td className={`vx-r ${r.available <= 0 ? "vx-neg" : ""}`}>{num(r.available)}</td>
                      <td className="vx-r">{num(r.min_stock)}</td>
                      <td className="vx-r">{r.avg_daily_sales > 0 ? num(r.avg_daily_sales) : "Sin ventas"}</td>
                      <td className="vx-r">{r.days_left === null ? "—" : `${num(r.days_left, 1)} día${r.days_left === 1 ? "" : "s"}`}</td>
                      <td className="vx-r">{r.on_order > 0 ? num(r.on_order) : "—"}</td>
                      <td className="vx-r"><strong>{r.suggested > 0 ? num(r.suggested) : "Nada (ya está pedido)"}</strong></td>
                      {!g.supplier_id && (
                        <td>
                          <select className="vx-input" aria-label={`Proveedor de ${r.name}`} value="" onChange={(e) => assignSupplier(r, e.target.value)}>
                            <option value="">Elegir proveedor…</option>
                            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                          </select>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}

      {/* ---------- orden de compra (editable antes de crear) ---------- */}
      {draftGroup && (
        <div className="modal-overlay" onClick={() => setDraftGroup(null)}>
          <div className="product-modal vx-modal-wide" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div><span className="dashboard-eyebrow">ORDEN DE COMPRA</span><h2>{draftGroup.supplier_name}</h2></div>
              <button className="modal-close" type="button" onClick={() => setDraftGroup(null)}>×</button>
            </div>
            <div className="product-form">
              <p className="vx-sub">Revisá las cantidades y los costos antes de crearla. La orden queda en Compras como <strong>pendiente de recibir</strong>: el stock sube recién cuando la marcás como recibida.</p>
              <div className="form-group">
                <label>Depósito donde entra la mercadería</label>
                <select value={draftWarehouse} onChange={(e) => setDraftWarehouse(e.target.value)}>
                  {warehouses.filter((w) => w.active !== false).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>
              <div className="vx-table-wrap">
                <table className="vx-table">
                  <thead><tr><th>Producto</th><th className="vx-r">Cantidad</th><th className="vx-r">Costo unitario</th><th className="vx-r">Subtotal</th><th></th></tr></thead>
                  <tbody>
                    {draftLines.map((l, idx) => (
                      <tr key={l.product_id}>
                        <td>{l.name}</td>
                        <td className="vx-r">
                          <input className="vx-input vx-input-sm" type="number" min={0} step="0.01" aria-label={`Cantidad de ${l.name}`} value={l.quantity}
                            onChange={(e) => setDraftLines(draftLines.map((x, i) => (i === idx ? { ...x, quantity: e.target.value } : x)))} />
                        </td>
                        <td className="vx-r">
                          <input className="vx-input vx-input-sm" type="number" min={0} step="0.01" aria-label={`Costo de ${l.name}`} value={l.unit_cost} placeholder="0"
                            onChange={(e) => setDraftLines(draftLines.map((x, i) => (i === idx ? { ...x, unit_cost: e.target.value } : x)))} />
                        </td>
                        <td className="vx-r">{money(Number(l.quantity || 0) * Number(l.unit_cost || 0))}</td>
                        <td><button type="button" className="import-remove-button" aria-label={`Quitar ${l.name}`} onClick={() => setDraftLines(draftLines.filter((_, i) => i !== idx))}>×</button></td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot><tr><td colSpan={3}>Total de la orden</td><td className="vx-r">{money(draftTotal)}</td><td></td></tr></tfoot>
                </table>
              </div>
              <div className="modal-actions">
                <button type="button" className="secondary-button" onClick={() => setDraftGroup(null)}>Cancelar</button>
                <button type="button" className="primary-button" onClick={createPurchase} disabled={saving || draftLines.length === 0}>{saving ? "Creando..." : "Crear orden de compra"}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
