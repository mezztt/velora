import { useEffect, useState } from "react";
import { statusLabel } from "../extras";
import { API_URL } from "../apiBase";
import { fmtMoney } from "../money";
import DateField from "../components/DateField";

// ============================================================
// TIPOS
// ============================================================

type InvoiceType = "A" | "B" | "C" | "NOTA_CREDITO" | "NOTA_DEBITO";
type InvoiceStatus = "PENDIENTE" | "AUTORIZADA" | "RECHAZADA" | "ANULADA";

interface InvoiceListItem {
  id: number;
  customer_name: string;
  invoice_type: InvoiceType;
  formatted_number: string;
  issue_date: string;
  status: InvoiceStatus;
  total: number;
}

interface InvoiceItemDetail {
  id: number;
  product_id: number;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  subtotal: number;
}

interface InvoiceDetail {
  id: number;
  company_id: number;
  customer_id: number;
  order_id: number | null;
  invoice_type: InvoiceType;
  point_of_sale: number;
  invoice_number: number;
  issue_date: string;
  cae: string | null;
  cae_due_date: string | null;
  status: InvoiceStatus;
  related_invoice_id: number | null;
  subtotal: number;
  tax_amount: number;
  total: number;
  payment_method: string | null;
  created_at: string;
  items: InvoiceItemDetail[];
}

interface OrderLite {
  id: number;
  customer_name: string;
  status: string;
  total: number;
}

interface CustomerLite {
  id: number;
  name: string;
}

interface ProductLite {
  id: number;
  name: string;
  sku: string | null;
  price: number;
  tax_rate: number;
}


function authHeaders() {
  const token = localStorage.getItem("velora_token");
  return { Authorization: `Bearer ${token}` };
}

const INVOICE_TYPE_LABELS: Record<InvoiceType, string> = {
  A: "Factura A",
  B: "Factura B",
  C: "Factura C",
  NOTA_CREDITO: "Nota de Crédito",
  NOTA_DEBITO: "Nota de Débito",
};

// ============================================================
// COMPONENTE
// ============================================================

function Facturacion() {
  const [invoices, setInvoices] = useState<InvoiceListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortBy, setSortBy] = useState<"fecha" | "total" | "numero">("fecha");

  const [orders, setOrders] = useState<OrderLite[]>([]);
  const [customers, setCustomers] = useState<CustomerLite[]>([]);
  const [products, setProducts] = useState<ProductLite[]>([]);
  
  // Aviso de modo prueba: solo si la empresa realmente emite CAE simulados o está en homologación de ARCA
  const [arcaMode, setArcaMode] = useState<{ enabled: boolean; environment: string } | null>(null);
  const testNotice = !arcaMode
    ? ""
    : !arcaMode.enabled
      ? "Los CAE son simulados (empiezan con TEST-) hasta que actives ARCA en Configuración. Estos comprobantes no tienen validez fiscal."
      : arcaMode.environment === "testing"
        ? "Estás conectado al entorno de homologación de ARCA: los comprobantes no tienen validez fiscal."
        : "";

  const [invoiceTab, setInvoiceTab] = useState<"facturas" | "notas">("facturas");
  // modal: nueva factura
  const [showNewInvoice, setShowNewInvoice] = useState(false);
  const [source, setSource] = useState<"pedido" | "manual">("pedido");
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [invoiceType, setInvoiceType] = useState<InvoiceType>("B");
  const [pointOfSale, setPointOfSale] = useState("1");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [manualItems, setManualItems] = useState<
    { product_id: string; quantity: string }[]
  >([{ product_id: "", quantity: "" }]);
  const [savingInvoice, setSavingInvoice] = useState(false);

  // modal: detalle
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);

  // ------------------------------------------------------------
  // CARGA
  // ------------------------------------------------------------

  useEffect(() => {
    fetch(`${API_URL}/company/arca`, { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setArcaMode({ enabled: !!d.arca_enabled, environment: String(d.arca_environment || "") }); })
      .catch(() => {});
  }, []);

  async function loadInvoices() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set("date_from", new Date(dateFrom).toISOString());
      if (dateTo) params.set("date_to", new Date(dateTo).toISOString());

      const response = await fetch(`${API_URL}/invoices?${params.toString()}`, {
        headers: authHeaders(),
      });
      if (!response.ok) {
        throw new Error(`No se pudieron cargar las facturas (${response.status})`);
      }
      setInvoices(await response.json());
    } catch (error) {
      console.error("Error cargando facturas:", error);
    } finally {
      setLoading(false);
    }
  }

  async function loadOrders() {
    const response = await fetch(`${API_URL}/orders?status=ENTREGADO`, {
      headers: authHeaders(),
    });
    if (!response.ok) return;
    setOrders(await response.json());
  }

  async function loadCustomers() {
    const response = await fetch(`${API_URL}/customers`, {
      headers: authHeaders(),
    });
    if (!response.ok) return;
    setCustomers(await response.json());
  }

  async function loadProducts() {
    const response = await fetch(`${API_URL}/products`, {
      headers: authHeaders(),
    });
    if (!response.ok) return;
    setProducts(await response.json());
  }

  useEffect(() => {
    loadOrders();
    loadCustomers();
    loadProducts();
  }, []);

  useEffect(() => {
    loadInvoices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom, dateTo]);

  const filteredInvoices = invoices.filter((invoice) => {
    const isNota = invoice.invoice_type.startsWith("NOTA");
    if (invoiceTab === "facturas" ? isNota : !isNota) return false;
    const searchText = search.toLowerCase().trim();
    if (!searchText) return true;
    return (
      invoice.customer_name.toLowerCase().includes(searchText) ||
      invoice.formatted_number.includes(searchText)
    );
  });

  const sortedInvoices = [...filteredInvoices].sort((a, b) => {
    if (sortBy === "total") return b.total - a.total;
    if (sortBy === "numero") {
      return b.formatted_number.localeCompare(a.formatted_number, "es", { numeric: true });
    }
    return new Date(b.issue_date).getTime() - new Date(a.issue_date).getTime();
  });

  // ------------------------------------------------------------
  // NUEVA FACTURA
  // ------------------------------------------------------------

  function openNewInvoice() {
    setSource("pedido");
    setSelectedOrderId(orders[0] ? String(orders[0].id) : "");
    setSelectedCustomerId(customers[0] ? String(customers[0].id) : "");
    setInvoiceType("B");
    setPointOfSale("1");
    setPaymentMethod("");
    setManualItems([{ product_id: products[0] ? String(products[0].id) : "", quantity: "" }]);
    setShowNewInvoice(true);
  }

  function updateManualItem(index: number, field: "product_id" | "quantity", value: string) {
    setManualItems((current) =>
      current.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    );
  }

  function addManualItemRow() {
    setManualItems((current) => [
      ...current,
      { product_id: products[0] ? String(products[0].id) : "", quantity: "" },
    ]);
  }

  function removeManualItemRow(index: number) {
    setManualItems((current) => current.filter((_, i) => i !== index));
  }

  async function saveInvoice() {
    setSavingInvoice(true);
    try {
      const body: Record<string, unknown> = {
        invoice_type: invoiceType,
        point_of_sale: Number(pointOfSale),
        payment_method: paymentMethod || null,
      };

      if (source === "pedido") {
        if (!selectedOrderId) throw new Error("Elegí un pedido");
        body.order_id = Number(selectedOrderId);
      } else {
        const items = manualItems
          .filter((item) => item.product_id && item.quantity)
          .map((item) => ({
            product_id: Number(item.product_id),
            quantity: Number(item.quantity),
          }));
        if (!selectedCustomerId || items.length === 0) {
          throw new Error("Elegí un cliente y al menos un producto");
        }
        body.customer_id = Number(selectedCustomerId);
        body.items = items;
      }

      const response = await fetch(`${API_URL}/invoices`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || `No se pudo crear la factura (${response.status})`);
      }

      setShowNewInvoice(false);
      await loadInvoices();
    } catch (error) {
      console.error("Error creando factura:", error);
      alert(error instanceof Error ? error.message : "No se pudo crear la factura.");
    } finally {
      setSavingInvoice(false);
    }
  }

  // ------------------------------------------------------------
  // DETALLE / ANULAR / IMPRIMIR
  // ------------------------------------------------------------

  async function openInvoice(invoiceId: number) {
    setLoadingDetail(true);
    try {
      const response = await fetch(`${API_URL}/invoices/${invoiceId}`, {
        headers: authHeaders(),
      });
      if (!response.ok) throw new Error("No se pudo cargar la factura");
      setSelectedInvoice(await response.json());
    } catch (error) {
      console.error("Error cargando factura:", error);
      alert("No se pudo cargar la factura.");
    } finally {
      setLoadingDetail(false);
    }
  }

  function closeInvoice() {
    setSelectedInvoice(null);
  }

  function productLabel(productId: number) {
    const product = products.find((p) => p.id === productId);
    return product ? product.name : `Producto #${productId}`;
  }

  function customerName(customerId: number) {
    const customer = customers.find((c) => c.id === customerId);
    return customer ? customer.name : `Cliente #${customerId}`;
  }

  async function cancelInvoice() {
    if (!selectedInvoice) return;
    const confirmed = window.confirm(
      "¿Anular esta factura? Se generará una Nota de Crédito y la original quedará ANULADA (no se puede deshacer)."
    );
    if (!confirmed) return;

    setCancelLoading(true);
    try {
      const response = await fetch(
        `${API_URL}/invoices/${selectedInvoice.id}/cancel`,
        {
          method: "POST",
          headers: authHeaders(),
        }
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "No se pudo anular la factura");
      }
      closeInvoice();
      await loadInvoices();
      alert(`Nota de crédito generada: ${data.point_of_sale}-${data.invoice_number}`);
    } catch (error) {
      console.error("Error anulando factura:", error);
      alert(error instanceof Error ? error.message : "No se pudo anular la factura.");
    } finally {
      setCancelLoading(false);
    }
  }

  function printInvoice() {
    if (!selectedInvoice) return;

    const itemsRows = selectedInvoice.items
      .map(
        (item) => `
        <tr>
          <td>${productLabel(item.product_id)}</td>
          <td style="text-align:center">${item.quantity}</td>
          <td style="text-align:right">${fmtMoney(item.unit_price, "fixed")}</td>
          <td style="text-align:center">${item.tax_rate}%</td>
          <td style="text-align:right">${fmtMoney(item.subtotal, "fixed")}</td>
        </tr>`
      )
      .join("");

    const html = `
      <html>
        <head>
          <title>${INVOICE_TYPE_LABELS[selectedInvoice.invoice_type]} ${selectedInvoice.point_of_sale
      .toString()
      .padStart(4, "0")}-${selectedInvoice.invoice_number.toString().padStart(8, "0")}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 32px; color: #241f1b; }
            h1 { font-size: 20px; margin-bottom: 4px; }
            p { font-size: 13px; margin: 4px 0; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ccc; padding: 8px; font-size: 12px; }
            th { text-align: left; background: #f4efe7; }
            .totales { margin-top: 16px; text-align: right; font-size: 14px; }
            .cae-box { margin-top: 24px; padding: 10px; border: 1px dashed #999; font-size: 11px; }
            .no-fiscal { display: inline-block; margin: 0 0 12px; padding: 6px 10px; border: 2px solid #241f1b; font-size: 12px; font-weight: bold; letter-spacing: 0.5px; }
          </style>
        </head>
        <body>
          ${
            !selectedInvoice.cae || selectedInvoice.cae.startsWith("TEST-")
              ? '<p class="no-fiscal">DOCUMENTO NO VÁLIDO COMO FACTURA</p>'
              : ""
          }
          <h1>${
            !selectedInvoice.cae || selectedInvoice.cae.startsWith("TEST-")
              ? "Comprobante de prueba (" + INVOICE_TYPE_LABELS[selectedInvoice.invoice_type] + " sin validez fiscal)"
              : INVOICE_TYPE_LABELS[selectedInvoice.invoice_type]
          }</h1>
          <p><strong>N°:</strong> ${selectedInvoice.point_of_sale
            .toString()
            .padStart(4, "0")}-${selectedInvoice.invoice_number.toString().padStart(8, "0")}</p>
          <p><strong>Cliente:</strong> ${customerName(selectedInvoice.customer_id)}</p>
          <p><strong>Fecha de emisión:</strong> ${new Date(
            selectedInvoice.issue_date
          ).toLocaleString("es-AR")}</p>

          <table>
            <thead>
              <tr>
                <th>Producto</th><th>Cant.</th><th>Precio unit.</th><th>IVA</th><th>Subtotal</th>
              </tr>
            </thead>
            <tbody>${itemsRows}</tbody>
          </table>

          <div class="totales">
            <p>Subtotal: ${fmtMoney(selectedInvoice.subtotal, "fixed")}</p>
            <p>IVA: ${fmtMoney(selectedInvoice.tax_amount, "fixed")}</p>
            <p><strong>Total: ${fmtMoney(selectedInvoice.total, "fixed")}</strong></p>
          </div>

          <div class="cae-box">
            ${
              // solo vale como factura si ARCA otorgó un CAE real; si no, se aclara bien grande
              !selectedInvoice.cae || selectedInvoice.cae.startsWith("TEST-")
                ? "<strong>DOCUMENTO NO VÁLIDO COMO FACTURA</strong><br/>Comprobante de prueba, sin CAE otorgado por ARCA."
                : "CAE: " + selectedInvoice.cae
            }
            ${
              selectedInvoice.cae_due_date
                ? `<br/>Vencimiento CAE: ${new Date(
                    selectedInvoice.cae_due_date
                  ).toLocaleDateString("es-AR")}`
                : ""
            }
          </div>
        </body>
      </html>
    `;

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      alert("Habilitá las ventanas emergentes para imprimir.");
      return;
    }
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <section className="products-page">
      {/* HEADER */}
      <div className="products-header">
        <div>
          <span className="dashboard-eyebrow">FISCAL</span>
          <h1>Facturación</h1>
          <p>Comprobantes electrónicos.</p>
        </div>

        <div className="products-header-actions">
          <button
            className="primary-button"
            type="button"
            onClick={openNewInvoice}
            disabled={customers.length === 0 || products.length === 0}
          >
            + Nueva factura
          </button>
        </div>
      </div>

      {testNotice && (
        <div className="vx-note is-warn" role="status">
          <span><strong>Modo de prueba.</strong> {testNotice}</span>
        </div>
      )}

      {/* TOOLBAR */}
      <div className="products-toolbar">
        <div className="product-actions" style={{ marginBottom: 12 }}>
  <button className={invoiceTab === "facturas" ? "primary-button" : "secondary-button"} onClick={() => setInvoiceTab("facturas")}>Facturas</button>
  <button className={invoiceTab === "notas" ? "primary-button" : "secondary-button"} onClick={() => setInvoiceTab("notas")}>Notas de Crédito</button>
  <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)} style={{ marginLeft: "auto" }}>
    <option value="fecha">Ordenar por fecha</option>
    <option value="total">Ordenar por monto</option>
    <option value="numero">Ordenar por N° comprobante</option>
  </select>
</div>
        <div className="products-search">
          <span className="products-search-icon">⌕</span>
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar cliente o número..."
          />
          {search && (
            <button
              className="products-search-clear"
              onClick={() => setSearch("")}
              type="button"
            >
              ×
            </button>
          )}
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <DateField aria-label="Desde" value={dateFrom}
            onChange={(event) => setDateFrom(event.target.value)}
          />
          <span className="vl-date-sep">a</span>
          <DateField aria-label="Hasta" value={dateTo}
            onChange={(event) => setDateTo(event.target.value)}
          />
        </div>

        <div className="products-count">
          {filteredInvoices.length}{" "}
          {filteredInvoices.length === 1 ? "factura" : "facturas"}
        </div>
      </div>

      {/* TABLA */}
      <div className="products-table-container">
        {loading ? (
          <div className="products-loading">
            <div className="products-loading-spinner" />
            <span>Cargando facturas...</span>
          </div>
        ) : filteredInvoices.length === 0 ? (
          <div className="products-empty">
            <div className="products-empty-icon">◯</div>
            <h3>No hay facturas todavía</h3>
            <p>Creá una factura desde un pedido entregado, o manualmente.</p>
          </div>
        ) : (
          <div className="products-table-wrapper">
            <table className="products-table">
              <thead>
                <tr>
                  <th>N° Comprobante</th>
                  <th>Tipo</th>
                  <th>Cliente</th>
                  <th>Fecha</th>
                  <th>Total</th>
                  <th>Estado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sortedInvoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td>
                      <div className="product-name">{invoice.formatted_number}</div>
                    </td>
                    <td>{INVOICE_TYPE_LABELS[invoice.invoice_type]}</td>
                    <td>{invoice.customer_name}</td>
                    <td>{new Date(invoice.issue_date).toLocaleDateString("es-AR")}</td>
                    <td>
                      <span className="product-price">
                        {fmtMoney(invoice.total)}
                      </span>
                    </td>
                    <td>
                      <span className="status-active" data-status={invoice.status}>
                        <span className="status-dot" />
                        {statusLabel(invoice.status)}
                      </span>
                    </td>
                    <td>
                      <div className="product-actions">
                        <button
                          type="button"
                          className="product-action-edit"
                          onClick={() => openInvoice(invoice.id)}
                        >
                          Ver
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL: NUEVA FACTURA */}
      {showNewInvoice && (
        <div className="modal-overlay" onClick={() => setShowNewInvoice(false)}>
          <div
            className="product-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <span className="dashboard-eyebrow">FACTURACIÓN</span>
                <h2>Nueva factura</h2>
              </div>
              <button
                className="modal-close"
                type="button"
                onClick={() => setShowNewInvoice(false)}
              >
                ×
              </button>
            </div>

            <div className="product-form">
              <div className="product-actions" style={{ justifyContent: "flex-start" }}>
                <button
                  type="button"
                  className={source === "pedido" ? "primary-button" : "secondary-button"}
                  onClick={() => setSource("pedido")}
                >
                  Desde un pedido
                </button>
                <button
                  type="button"
                  className={source === "manual" ? "primary-button" : "secondary-button"}
                  onClick={() => setSource("manual")}
                >
                  Manual
                </button>
              </div>

              {source === "pedido" ? (
                <div className="form-group">
                  <label>Pedido entregado</label>
                  <select
                    value={selectedOrderId}
                    onChange={(event) => setSelectedOrderId(event.target.value)}
                  >
                    {orders.length === 0 && <option value="">No hay pedidos entregados</option>}
                    {orders.map((order) => (
                      <option key={order.id} value={order.id}>
                        Pedido #{order.id} — {order.customer_name} — ${order.total}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <>
                  <div className="form-group">
                    <label>Cliente</label>
                    <select
                      value={selectedCustomerId}
                      onChange={(event) => setSelectedCustomerId(event.target.value)}
                    >
                      {customers.map((customer) => (
                        <option key={customer.id} value={customer.id}>
                          {customer.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Productos</label>
                    {manualItems.map((item, index) => (
                      <div className="form-row" key={index} style={{ marginBottom: 8 }}>
                        <select
                          value={item.product_id}
                          onChange={(event) =>
                            updateManualItem(index, "product_id", event.target.value)
                          }
                        >
                          {products.map((product) => (
                            <option key={product.id} value={product.id}>
                              {product.name} — ${product.price} (IVA {product.tax_rate}%)
                            </option>
                          ))}
                        </select>
                        <div style={{ display: "flex", gap: 8 }}>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="Cantidad"
                            value={item.quantity}
                            onChange={(event) =>
                              updateManualItem(index, "quantity", event.target.value)
                            }
                          />
                          {manualItems.length > 1 && (
                            <button
                              type="button"
                              className="import-remove-button"
                              onClick={() => removeManualItemRow(index)}
                            >
                              ×
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={addManualItemRow}
                    >
                      + Agregar producto
                    </button>
                  </div>
                </>
              )}

              <div className="form-row">
                <div className="form-group">
                  <label>Tipo de comprobante</label>
                  <select
                    value={invoiceType}
                    onChange={(event) => setInvoiceType(event.target.value as InvoiceType)}
                  >
                    <option value="A">Factura A</option>
                    <option value="B">Factura B</option>
                    <option value="C">Factura C</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Punto de venta</label>
                  <input
                    type="number"
                    min="1"
                    value={pointOfSale}
                    onChange={(event) => setPointOfSale(event.target.value)}
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Forma de pago</label>
                <input
                  type="text"
                  value={paymentMethod}
                  onChange={(event) => setPaymentMethod(event.target.value)}
                  placeholder="Ej. Efectivo, transferencia (opcional)"
                />
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setShowNewInvoice(false)}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="primary-button"
                  onClick={saveInvoice}
                  disabled={savingInvoice}
                >
                  {savingInvoice ? "Emitiendo..." : "Emitir factura"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: DETALLE */}
      {selectedInvoice && (
        <div className="modal-overlay" onClick={closeInvoice}>
          <div
            className="product-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <span className="dashboard-eyebrow">
                  {INVOICE_TYPE_LABELS[selectedInvoice.invoice_type]} ·{" "}
                  {selectedInvoice.point_of_sale.toString().padStart(4, "0")}-
                  {selectedInvoice.invoice_number.toString().padStart(8, "0")}
                </span>
                <h2>{customerName(selectedInvoice.customer_id)}</h2>
              </div>
              <button className="modal-close" type="button" onClick={closeInvoice}>
                ×
              </button>
            </div>

            {loadingDetail ? (
              <div className="products-loading">
                <div className="products-loading-spinner" />
                <span>Cargando...</span>
              </div>
            ) : (
              <div className="product-form">
                <div className="form-group">
                  <label>Estado</label>
                  <p>{selectedInvoice.status}</p>
                </div>

                {selectedInvoice.cae && (
                  <div className="import-warning">
                    <strong>
                      {selectedInvoice.cae.startsWith("TEST-")
                        ? "CAE de prueba (no válido fiscalmente)"
                        : "CAE"}
                    </strong>
                    <span>{selectedInvoice.cae}</span>
                  </div>
                )}

                <div className="form-group">
                  <label>Productos</label>
                  <div className="import-table-wrapper">
                    <table className="import-table">
                      <thead>
                        <tr>
                          <th>Producto</th>
                          <th>Cant.</th>
                          <th>Precio</th>
                          <th>IVA</th>
                          <th>Subtotal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedInvoice.items.map((item) => (
                          <tr key={item.id}>
                            <td>{productLabel(item.product_id)}</td>
                            <td>{item.quantity}</td>
                            <td>${item.unit_price}</td>
                            <td>{item.tax_rate}%</td>
                            <td>${item.subtotal}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p style={{ textAlign: "right", marginTop: 8 }}>
                    Subtotal: ${selectedInvoice.subtotal} — IVA: ${selectedInvoice.tax_amount}
                    <br />
                    <strong>Total: {fmtMoney(selectedInvoice.total)}</strong>
                  </p>
                </div>

                <div className="modal-actions" style={{ justifyContent: "space-between" }}>
                  <div>
                    {selectedInvoice.status === "AUTORIZADA" && (
                      <button
                        type="button"
                        className="product-action-delete"
                        onClick={cancelInvoice}
                        disabled={cancelLoading}
                      >
                        {cancelLoading ? "Anulando..." : "Anular (nota de crédito)"}
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={printInvoice}
                  >
                    Imprimir
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

export default Facturacion;