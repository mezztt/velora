import { useEffect, useState } from "react";
import { api, downloadCsv, errorText, money, num } from "../extras";

// ============================================================
// RENTABILIDAD (sección dentro de Reportes)
// ============================================================

interface Bucket {
  units: number; revenue: number; cost: number; margin: number; margin_pct: number | null;
  estimated: boolean; missing_cost: boolean;
}
interface ProductRow extends Bucket { product_id: number; name: string; sku: string | null; category: string | null }
interface NamedRow extends Bucket { name: string }
interface CategoryRow extends Bucket { category: string }
interface Data {
  threshold: number;
  totals: Bucket & { missing_cost_products: number; operations: number };
  by_product: ProductRow[];
  by_category: CategoryRow[];
  by_customer: NamedRow[];
  by_seller: NamedRow[] | null;
  top: ProductRow[];
  low: ProductRow[];
}

type View = "producto" | "categoria" | "cliente" | "vendedor";

function pct(v: number | null) {
  return v === null ? "—" : `${num(v, 1)}%`;
}

function MarginCell({ row, threshold }: { row: Bucket; threshold: number }) {
  if (row.missing_cost) return <span className="vx-badge is-warn">Sin costo cargado</span>;
  const p = row.margin_pct;
  const tone = p === null ? "" : p < 0 ? "is-bad" : p < threshold ? "is-warn" : "";
  return (
    <span className="vx-row" style={{ justifyContent: "flex-end", flexWrap: "nowrap" }}>
      <span className={p !== null && p < 0 ? "vx-neg" : ""}>{pct(p)}</span>
      <span className={`vx-bar ${tone}`} aria-hidden="true"><i style={{ width: `${Math.max(0, Math.min(100, p || 0))}%` }} /></span>
    </span>
  );
}

export default function Rentabilidad({ dateFrom, dateTo }: { dateFrom: string; dateTo: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [threshold, setThreshold] = useState("10");
  const [view, setView] = useState<View>("producto");

  async function load() {
    setLoading(true);
    try {
      const t = Math.min(Math.max(Number(threshold) || 0, 0), 100);
      const params = new URLSearchParams({
        date_from: new Date(dateFrom).toISOString(),
        date_to: new Date(dateTo + "T23:59:59").toISOString(),
        threshold: String(t),
      });
      setData(await api<Data>(`/reports/profitability?${params}`));
      setError("");
    } catch (e) {
      setError(errorText(e, "No se pudo calcular la rentabilidad"));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    const timer = window.setTimeout(load, 250);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom, dateTo, threshold]);

  function rowsFor(v: View): { label: string; sub?: string; row: Bucket }[] {
    if (!data) return [];
    if (v === "producto") return data.by_product.map((r) => ({ label: r.name, sub: [r.sku, r.category].filter(Boolean).join(" · "), row: r }));
    if (v === "categoria") return data.by_category.map((r) => ({ label: r.category, row: r }));
    if (v === "cliente") return data.by_customer.map((r) => ({ label: r.name, row: r }));
    return (data.by_seller || []).map((r) => ({ label: r.name, row: r }));
  }

  const VIEW_LABEL: Record<View, string> = { producto: "Producto", categoria: "Categoría", cliente: "Cliente", vendedor: "Vendedor" };

  function exportCsv() {
    if (!data) return;
    const head = [VIEW_LABEL[view], "Unidades", "Venta neta sin IVA", "Costo", "Margen $", "Margen %", "Nota"];
    downloadCsv(`rentabilidad-por-${view}-${dateFrom}-a-${dateTo}.csv`, [
      head,
      ...rowsFor(view).map(({ label, row }) => [
        label, row.units, row.revenue, row.cost, row.margin, row.margin_pct,
        row.missing_cost ? "Sin costo cargado" : row.estimated ? "Costo estimado" : "",
      ]),
      ["TOTAL", data.totals.units, data.totals.revenue, data.totals.cost, data.totals.margin, data.totals.margin_pct, ""],
    ]);
  }

  const rows = rowsFor(view);

  return (
    <div className="dashboard-section" style={{ marginBottom: 20 }}>
      <div className="vx-panel-head">
        <div className="section-heading" style={{ marginBottom: 0 }}>
          <h2>Rentabilidad</h2>
          <p>Cuánto ganás con lo que vendés: venta sin IVA menos el costo. Toma los pedidos confirmados y las ventas de mostrador del período.</p>
        </div>
        <div className="vx-row">
          <div className="vx-field" style={{ width: 150 }}>
            <label htmlFor="vx-margin-threshold">Margen bajo si es menor a (%)</label>
            <input id="vx-margin-threshold" type="number" min={0} max={100} value={threshold} onChange={(e) => setThreshold(e.target.value)} />
          </div>
          <button type="button" className="secondary-button" onClick={exportCsv} disabled={!data || rows.length === 0}>Exportar CSV</button>
        </div>
      </div>

      {error && <div className="vx-note is-bad" role="alert"><span>{error}</span></div>}

      {loading && !data ? (
        <div className="products-loading"><div className="products-loading-spinner" /><span>Calculando...</span></div>
      ) : data && data.by_product.length === 0 ? (
        <div className="vx-empty"><strong>No hay ventas en este período</strong>Probá con otro rango de fechas.</div>
      ) : data && (
        <>
          <div className="vx-kpis">
            <div className="vx-kpi"><span>Venta neta (sin IVA)</span><strong>{money(data.totals.revenue)}</strong><small>{data.totals.operations} operaciones</small></div>
            <div className="vx-kpi"><span>Costo</span><strong>{money(data.totals.cost)}</strong><small>{num(data.totals.units)} unidades</small></div>
            <div className={`vx-kpi ${data.totals.margin < 0 ? "is-bad" : "is-ok"}`}><span>Margen del período</span><strong>{money(data.totals.margin)}</strong><small>{pct(data.totals.margin_pct)} de la venta</small></div>
          </div>

          {data.totals.missing_cost_products > 0 && (
            <div className="vx-note is-warn">
              <span>
                <strong>{data.totals.missing_cost_products} producto{data.totals.missing_cost_products === 1 ? "" : "s"} no tiene{data.totals.missing_cost_products === 1 ? "" : "n"} costo cargado</strong>:
                {" "}en esos el margen aparece inflado. Cargales el costo en Productos (o recibí una compra: el costo se actualiza solo).
              </span>
            </div>
          )}
          {data.totals.estimated && (
            <div className="vx-note is-info">
              <span>Algunas ventas son anteriores a que el sistema guardara el costo de cada venta: para esas se usó el <strong>costo actual</strong> del producto (margen estimado).</span>
            </div>
          )}

          <div className="vx-grid-2" style={{ marginBottom: 16 }}>
            <div>
              <h3 style={{ marginBottom: 8 }}>Los 10 más rentables</h3>
              {data.top.length === 0 ? <p className="vx-hint">Sin datos.</p> : (
                <div className="vx-table-wrap">
                  <table className="vx-table">
                    <thead><tr><th>Producto</th><th className="vx-r">Margen $</th><th className="vx-r">Margen %</th></tr></thead>
                    <tbody>
                      {data.top.map((r) => (
                        <tr key={r.product_id}><td>{r.name}</td><td className="vx-r">{money(r.margin)}</td><td className="vx-r">{pct(r.margin_pct)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div>
              <h3 style={{ marginBottom: 8 }}>Con margen negativo o menor a {data.threshold}%</h3>
              {data.low.length === 0 ? <p className="vx-hint">Ningún producto está por debajo de ese margen.</p> : (
                <div className="vx-table-wrap">
                  <table className="vx-table">
                    <thead><tr><th>Producto</th><th className="vx-r">Margen $</th><th className="vx-r">Margen %</th></tr></thead>
                    <tbody>
                      {data.low.slice(0, 10).map((r) => (
                        <tr key={r.product_id}>
                          <td>{r.name}</td>
                          <td className={`vx-r ${r.margin < 0 ? "vx-neg" : ""}`}>{money(r.margin)}</td>
                          <td className={`vx-r ${r.margin < 0 ? "vx-neg" : ""}`}>{pct(r.margin_pct)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {data.low.length > 10 && <p className="vx-hint" style={{ marginTop: 6 }}>Y {data.low.length - 10} más: están todos en el detalle de abajo y en el CSV.</p>}
            </div>
          </div>

          <div className="vx-tabs" role="tablist">
            {(["producto", "categoria", "cliente", ...(data.by_seller ? ["vendedor"] : [])] as View[]).map((v) => (
              <button key={v} type="button" className={view === v ? "is-on" : ""} onClick={() => setView(v)}>Por {VIEW_LABEL[v].toLowerCase()}</button>
            ))}
          </div>

          <div className="vx-table-wrap vx-table-scroll">
            <table className="vx-table">
              <thead>
                <tr>
                  <th>{VIEW_LABEL[view]}</th><th className="vx-r">Unidades</th><th className="vx-r">Venta neta</th>
                  <th className="vx-r">Costo</th><th className="vx-r">Margen $</th><th className="vx-r">Margen %</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ label, sub, row }, i) => (
                  <tr key={`${view}-${i}`}>
                    <td>{label}{sub ? <small>{sub}</small> : null}{row.estimated && !row.missing_cost ? <small>Costo estimado</small> : null}</td>
                    <td className="vx-r">{num(row.units)}</td>
                    <td className="vx-r">{money(row.revenue)}</td>
                    <td className="vx-r">{money(row.cost)}</td>
                    <td className={`vx-r ${row.margin < 0 ? "vx-neg" : ""}`}>{money(row.margin)}</td>
                    <td className="vx-r"><MarginCell row={row} threshold={data.threshold} /></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Total del período</td><td className="vx-r">{num(data.totals.units)}</td><td className="vx-r">{money(data.totals.revenue)}</td>
                  <td className="vx-r">{money(data.totals.cost)}</td><td className="vx-r">{money(data.totals.margin)}</td><td className="vx-r">{pct(data.totals.margin_pct)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
