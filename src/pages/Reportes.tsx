import { useEffect, useState } from "react";
import Rentabilidad from "./Rentabilidad";
import { API_URL } from "../apiBase";
import { fmtMoney } from "../money";
import DateField from "../components/DateField";

interface SalesSummary {
  total_invoiced: number;
  invoice_count: number;
  total_pos: number;
  pos_count: number;
  by_type: Record<string, number>;
  by_day: { date: string; total: number }[];
}

interface TopProduct {
  product_id: number;
  product_name: string;
  quantity_sold: number;
  revenue: number;
}

interface TopCustomer {
  customer_id: number;
  customer_name: string;
  total_invoiced: number;
  invoice_count: number;
}

interface LowStockItem {
  product_id: number;
  product_name: string;
  warehouse_name: string;
  quantity: number;
  min_stock: number;
}

interface ReceivableItem {
  customer_id: number;
  customer_name: string;
  balance: number;
  credit_limit: number;
}

interface PurchasesSummary {
  total: number;
  by_supplier: {
    supplier_id: number;
    supplier_name: string;
    total: number;
    purchase_count: number;
  }[];
}


function authHeaders() {
  const token = localStorage.getItem("velora_token");
  return { Authorization: `Bearer ${token}` };
}

function defaultDateFrom() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

function defaultDateTo() {
  return new Date().toISOString().slice(0, 10);
}

function Reportes() {
  const [dateFrom, setDateFrom] = useState(defaultDateFrom());
  const [dateTo, setDateTo] = useState(defaultDateTo());
  const [loading, setLoading] = useState(true);
  const [section, setSection] = useState<"general" | "rentabilidad">("general");

  const [summary, setSummary] = useState<SalesSummary | null>(null);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [topCustomers, setTopCustomers] = useState<TopCustomer[]>([]);
  const [lowStock, setLowStock] = useState<LowStockItem[]>([]);
  const [receivables, setReceivables] = useState<ReceivableItem[]>([]);
  const [purchases, setPurchases] = useState<PurchasesSummary | null>(null);

  async function loadAll() {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        date_from: new Date(dateFrom).toISOString(),
        date_to: new Date(dateTo + "T23:59:59").toISOString(),
      });

      const [summaryRes, productsRes, customersRes, stockRes, receivablesRes, purchasesRes] =
        await Promise.all([
          fetch(`${API_URL}/reports/sales-summary?${params}`, { headers: authHeaders() }),
          fetch(`${API_URL}/reports/top-products?${params}&limit=8`, { headers: authHeaders() }),
          fetch(`${API_URL}/reports/top-customers?${params}&limit=8`, { headers: authHeaders() }),
          fetch(`${API_URL}/reports/low-stock`, { headers: authHeaders() }),
          fetch(`${API_URL}/reports/accounts-receivable`, { headers: authHeaders() }),
          fetch(`${API_URL}/reports/purchases-summary?${params}`, { headers: authHeaders() }),
        ]);

      if (summaryRes.ok) setSummary(await summaryRes.json());
      if (productsRes.ok) setTopProducts(await productsRes.json());
      if (customersRes.ok) setTopCustomers(await customersRes.json());
      if (stockRes.ok) setLowStock(await stockRes.json());
      if (receivablesRes.ok) setReceivables(await receivablesRes.json());
      if (purchasesRes.ok) setPurchases(await purchasesRes.json());
    } catch (error) {
      console.error("Error cargando reportes:", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom, dateTo]);

  const maxDay = summary?.by_day.length
    ? Math.max(...summary.by_day.map((d) => d.total))
    : 0;

  return (
    <section className="products-page">
      <div className="products-header">
        <div>
          <span className="dashboard-eyebrow">INTELIGENCIA</span>
          <h1>Reportes</h1>
          <p>Ventas, productos, clientes, stock y compras — todo en un vistazo.</p>
        </div>
      </div>

      {/* FILTRO DE FECHAS */}
      <div className="products-toolbar">
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <DateField aria-label="Desde" value={dateFrom}
            onChange={(event) => setDateFrom(event.target.value)}
          />
          <span className="vl-date-sep">a</span>
          <DateField aria-label="Hasta" value={dateTo}
            onChange={(event) => setDateTo(event.target.value)}
          />
        </div>
      </div>

      {/* SECCIONES */}
      <div className="vx-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={section === "general"} className={section === "general" ? "is-on" : ""} onClick={() => setSection("general")}>Ventas, stock y compras</button>
        <button type="button" role="tab" aria-selected={section === "rentabilidad"} className={section === "rentabilidad" ? "is-on" : ""} onClick={() => setSection("rentabilidad")}>Rentabilidad</button>
      </div>

      {section === "rentabilidad" ? (
        <Rentabilidad dateFrom={dateFrom} dateTo={dateTo} />
      ) : loading ? (
        <div className="products-loading">
          <div className="products-loading-spinner" />
          <span>Cargando reportes...</span>
        </div>
      ) : (
        <>
          {/* CARDS RESUMEN */}
          {summary && (
            <div className="dashboard-cards">
              <div className="dashboard-card">
                <span>Total facturado</span>
                <strong>{fmtMoney(summary.total_invoiced)}</strong>
                <small>{summary.invoice_count} comprobantes</small>
              </div>
              <div className="dashboard-card">
                <span>Total POS</span>
                <strong>{fmtMoney(summary.total_pos)}</strong>
                <small>{summary.pos_count} ventas de mostrador</small>
              </div>
              <div className="dashboard-card">
                <span>Factura A</span>
                <strong>{fmtMoney((summary.by_type.A || 0))}</strong>
              </div>
              <div className="dashboard-card">
                <span>Factura B / C</span>
                <strong>
                  {fmtMoney((summary.by_type.B || 0) + (summary.by_type.C || 0))}
                </strong>
              </div>
            </div>
          )}

          {/* GRÁFICO DE VENTAS POR DÍA (barras simples con CSS) */}
          {summary && summary.by_day.length > 0 && (
            <div className="dashboard-section" style={{ marginBottom: 20 }}>
              <div className="section-heading">
                <h2>Ventas facturadas por día</h2>
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-end",
                  gap: 4,
                  height: 160,
                  overflowX: "auto",
                  paddingBottom: 8,
                }}
              >
                {summary.by_day.map((day) => (
                  <div
                    key={day.date}
                    title={`${day.date}: ${fmtMoney(day.total)}`}
                    style={{
                      minWidth: 16,
                      flex: "1 0 auto",
                      height: maxDay > 0 ? `${(day.total / maxDay) * 100}%` : "2%",
                      background: "#80654d",
                      borderRadius: "4px 4px 0 0",
                      transition: "height 0.3s ease",
                    }}
                  />
                ))}
              </div>
              <p style={{ fontSize: 11, color: "#9a8b7d", marginTop: 8 }}>
                Pasá el mouse sobre una barra para ver el detalle del día.
              </p>
            </div>
          )}

          {/* TOP PRODUCTOS Y CLIENTES */}
          <div className="form-row" style={{ marginBottom: 20 }}>
            <div className="dashboard-section">
              <div className="section-heading">
                <h2>Productos más vendidos</h2>
              </div>
              {topProducts.length === 0 ? (
                <p style={{ color: "#9a8b7d", fontSize: 12 }}>Sin datos en este período.</p>
              ) : (
                <div className="import-table-wrapper">
                  <table className="import-table">
                    <thead>
                      <tr>
                        <th>Producto</th>
                        <th>Cant.</th>
                        <th>Facturado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topProducts.map((product) => (
                        <tr key={product.product_id}>
                          <td>{product.product_name}</td>
                          <td>{product.quantity_sold}</td>
                          <td>{fmtMoney(product.revenue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="dashboard-section">
              <div className="section-heading">
                <h2>Mejores clientes</h2>
              </div>
              {topCustomers.length === 0 ? (
                <p style={{ color: "#9a8b7d", fontSize: 12 }}>Sin datos en este período.</p>
              ) : (
                <div className="import-table-wrapper">
                  <table className="import-table">
                    <thead>
                      <tr>
                        <th>Cliente</th>
                        <th>Facturas</th>
                        <th>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topCustomers.map((customer) => (
                        <tr key={customer.customer_id}>
                          <td>{customer.customer_name}</td>
                          <td>{customer.invoice_count}</td>
                          <td>{fmtMoney(customer.total_invoiced)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* STOCK BAJO */}
          <div className="dashboard-section" style={{ marginBottom: 20 }}>
            <div className="section-heading">
              <h2>Stock bajo</h2>
              <p>Productos en o por debajo de su mínimo configurado.</p>
            </div>
            {lowStock.length === 0 ? (
              <p style={{ color: "#9a8b7d", fontSize: 12 }}>
                Ningún producto está bajo su mínimo. 👍
              </p>
            ) : (
              <div className="import-table-wrapper">
                <table className="import-table">
                  <thead>
                    <tr>
                      <th>Producto</th>
                      <th>Depósito</th>
                      <th>Stock actual</th>
                      <th>Mínimo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lowStock.map((item, index) => (
                      <tr key={index}>
                        <td>{item.product_name}</td>
                        <td>{item.warehouse_name}</td>
                        <td>
                          <span className="stock-low">{item.quantity}</span>
                        </td>
                        <td>{item.min_stock}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* CUENTAS POR COBRAR */}
          <div className="dashboard-section" style={{ marginBottom: 20 }}>
            <div className="section-heading">
              <h2>Cuentas por cobrar</h2>
              <p>Clientes con saldo pendiente en su cuenta corriente.</p>
            </div>
            {receivables.length === 0 ? (
              <p style={{ color: "#9a8b7d", fontSize: 12 }}>
                Ningún cliente tiene saldo pendiente.
              </p>
            ) : (
              <div className="import-table-wrapper">
                <table className="import-table">
                  <thead>
                    <tr>
                      <th>Cliente</th>
                      <th>Saldo</th>
                      <th>Límite de crédito</th>
                    </tr>
                  </thead>
                  <tbody>
                    {receivables.map((item) => (
                      <tr key={item.customer_id}>
                        <td>{item.customer_name}</td>
                        <td>
                          <span
                            className={
                              item.credit_limit > 0 && item.balance > item.credit_limit
                                ? "stock-low"
                                : "stock-normal"
                            }
                          >
                            {fmtMoney(item.balance)}
                          </span>
                        </td>
                        <td>{fmtMoney(item.credit_limit)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* COMPRAS POR PROVEEDOR */}
          {purchases && (
            <div className="dashboard-section">
              <div className="section-heading">
                <h2>Compras por proveedor</h2>
                <p>Total: {fmtMoney(purchases.total)}</p>
              </div>
              {purchases.by_supplier.length === 0 ? (
                <p style={{ color: "#9a8b7d", fontSize: 12 }}>
                  No hay compras recibidas en este período.
                </p>
              ) : (
                <div className="import-table-wrapper">
                  <table className="import-table">
                    <thead>
                      <tr>
                        <th>Proveedor</th>
                        <th>Compras</th>
                        <th>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {purchases.by_supplier.map((supplier) => (
                        <tr key={supplier.supplier_id}>
                          <td>{supplier.supplier_name}</td>
                          <td>{supplier.purchase_count}</td>
                          <td>{fmtMoney(supplier.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}

export default Reportes;