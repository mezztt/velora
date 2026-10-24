import { useEffect, useState } from "react";
import { API_URL } from "../apiBase";

// ============================================================
// TIPOS
// ============================================================

type OrderStatus =
  | "PENDIENTE"
  | "CONFIRMADO"
  | "PROGRAMADO"
  | "EN_CAMINO"
  | "ENTREGADO"
  | "CANCELADO";

interface OrderListItem {
  id: number;
  customer_name: string;
  delivery_address: string | null;
  status: OrderStatus;
  delivery_type: "ENVIO" | "RETIRO" | null;
  scheduled_date: string | null;
  courier_name: string | null;
  items_summary: string;
  total_products: number;
  total_quantity: number;
  total: number;
  created_at: string;
}

interface OrderItemDetail {
  id: number;
  product_id: number;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

interface OrderDetail extends OrderListItem {
  customer_id: number;
  warehouse_id: number;
  received_by: string | null;
  delivered_at: string | null;
  items: OrderItemDetail[];
}

interface ProductLite {
  id: number;
  name: string;
  sku: string | null;
}

type Tab = "por_enviar" | "por_entregarse" | "entregados";


function authHeaders() {
  const token = localStorage.getItem("velora_token");
  return { Authorization: `Bearer ${token}` };
}

const TAB_STATUS: Record<Tab, OrderStatus> = {
  por_enviar: "PROGRAMADO",
  por_entregarse: "EN_CAMINO",
  entregados: "ENTREGADO",
};

const TAB_LABELS: Record<Tab, string> = {
  por_enviar: "Por enviar",
  por_entregarse: "Por entregarse",
  entregados: "Entregados",
};

// ============================================================
// COMPONENTE
// ============================================================

function Entregas() {
  const [activeTab, setActiveTab] = useState<Tab>("por_enviar");
  const [orders, setOrders] = useState<OrderListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [products, setProducts] = useState<ProductLite[]>([]);

  const [selectedOrder, setSelectedOrder] = useState<OrderDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const [courierName, setCourierName] = useState("");
  const [receivedBy, setReceivedBy] = useState("");

  const [showRemitoPicker, setShowRemitoPicker] = useState(false);

  // ------------------------------------------------------------
  // CARGA
  // ------------------------------------------------------------

  async function loadProducts() {
    const response = await fetch(`${API_URL}/products`, {
      headers: authHeaders(),
    });
    if (!response.ok) return;
    setProducts(await response.json());
  }

  async function loadOrders(tab: Tab) {
    setLoading(true);
    try {
      const response = await fetch(
        `${API_URL}/orders?status=${TAB_STATUS[tab]}&delivery_type=ENVIO`,
        { headers: authHeaders() }
      );
      if (!response.ok) {
        throw new Error(`No se pudieron cargar las entregas (${response.status})`);
      }
      setOrders(await response.json());
    } catch (error) {
      console.error("Error cargando entregas:", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadProducts();
  }, []);

  useEffect(() => {
    loadOrders(activeTab);
  }, [activeTab]);

  const filteredOrders = orders.filter((order) => {
    const searchText = search.toLowerCase().trim();
    if (!searchText) return true;
    return (
      order.customer_name.toLowerCase().includes(searchText) ||
      (order.courier_name || "").toLowerCase().includes(searchText)
    );
  });

  // ------------------------------------------------------------
  // DETALLE
  // ------------------------------------------------------------

  async function openOrder(orderId: number) {
    setLoadingDetail(true);
    setCourierName("");
    setReceivedBy("");
    setShowRemitoPicker(false);

    try {
      const response = await fetch(`${API_URL}/orders/${orderId}`, {
        headers: authHeaders(),
      });
      if (!response.ok) throw new Error("No se pudo cargar el pedido");
      setSelectedOrder(await response.json());
    } catch (error) {
      console.error("Error cargando pedido:", error);
      alert("No se pudo cargar el pedido.");
    } finally {
      setLoadingDetail(false);
    }
  }

  function closeOrder() {
    setSelectedOrder(null);
  }

  function productLabel(productId: number) {
    const product = products.find((p) => p.id === productId);
    if (!product) return `Producto #${productId}`;
    return product.sku ? `${product.name} (${product.sku})` : product.name;
  }

  async function dispatchOrder() {
    if (!selectedOrder) return;
    if (!courierName.trim()) {
      alert("Indicá el nombre del repartidor o empresa de envío.");
      return;
    }

    setActionLoading(true);
    try {
      const response = await fetch(
        `${API_URL}/orders/${selectedOrder.id}/dispatch`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...authHeaders(),
          },
          body: JSON.stringify({ courier_name: courierName }),
        }
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "No se pudo despachar el pedido");
      }
      closeOrder();
      await loadOrders(activeTab);
    } catch (error) {
      console.error("Error despachando:", error);
      alert(error instanceof Error ? error.message : "No se pudo despachar el pedido.");
    } finally {
      setActionLoading(false);
    }
  }

  async function deliverOrder() {
    if (!selectedOrder) return;

    setActionLoading(true);
    try {
      const response = await fetch(
        `${API_URL}/orders/${selectedOrder.id}/deliver`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...authHeaders(),
          },
          body: JSON.stringify({ received_by: receivedBy || null }),
        }
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "No se pudo marcar como entregado");
      }
      closeOrder();
      await loadOrders(activeTab);
    } catch (error) {
      console.error("Error entregando:", error);
      alert(error instanceof Error ? error.message : "No se pudo marcar como entregado.");
    } finally {
      setActionLoading(false);
    }
  }

  function printRemito(withSignature: boolean) {
    if (!selectedOrder) return;

    const itemsRows = selectedOrder.items
      .map(
        (item) => `
          <tr>
            <td>${productLabel(item.product_id)}</td>
            <td style="text-align:center">${item.quantity}</td>
          </tr>`
      )
      .join("");

    const signatureBlock = withSignature
      ? `
        <div style="margin-top:60px; display:flex; justify-content:space-between;">
          <div style="width:45%; border-top:1px solid #333; padding-top:8px;">
            Firma de quien recibe
          </div>
          <div style="width:45%; border-top:1px solid #333; padding-top:8px;">
            Aclaración y DNI
          </div>
        </div>`
      : "";

    const html = `
      <html>
        <head>
          <title>Remito - Pedido #${selectedOrder.id}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 32px; color: #241f1b; }
            h1 { font-size: 18px; margin-bottom: 4px; }
            p { font-size: 13px; margin: 4px 0; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ccc; padding: 8px; font-size: 13px; text-align: left; }
          </style>
        </head>
        <body>
          <h1>Remito de entrega — Pedido #${selectedOrder.id}</h1>
          <p><strong>Cliente:</strong> ${selectedOrder.customer_name}</p>
          <p><strong>Dirección:</strong> ${selectedOrder.delivery_address || "—"}</p>
          <p><strong>Repartidor:</strong> ${selectedOrder.courier_name || "—"}</p>
          <p><strong>Fecha:</strong> ${new Date().toLocaleString("es-AR")}</p>

          <table>
            <thead>
              <tr><th>Producto</th><th style="text-align:center">Cantidad</th></tr>
            </thead>
            <tbody>${itemsRows}</tbody>
          </table>

          ${signatureBlock}

          <p style="margin-top:28px; font-size:11px; font-weight:bold; letter-spacing:0.5px;">DOCUMENTO NO VÁLIDO COMO FACTURA</p>
        </body>
      </html>
    `;

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      alert("Habilitá las ventanas emergentes para imprimir el remito.");
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
          <span className="dashboard-eyebrow">LOGÍSTICA</span>
          <h1>Entregas</h1>
          <p>Pedidos con envío: por enviar, en camino y entregados.</p>
        </div>
      </div>

      {/* TABS */}
      <div className="products-toolbar" style={{ marginBottom: 4 }}>
        <div className="product-actions">
          {(Object.keys(TAB_LABELS) as Tab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              className={activeTab === tab ? "primary-button" : "secondary-button"}
              onClick={() => setActiveTab(tab)}
            >
              {TAB_LABELS[tab]}
            </button>
          ))}
        </div>
      </div>

      {/* TOOLBAR */}
      <div className="products-toolbar">
        <div className="products-search">
          <span className="products-search-icon">⌕</span>
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar cliente o repartidor..."
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

        <div className="products-count">
          {filteredOrders.length}{" "}
          {filteredOrders.length === 1 ? "entrega" : "entregas"}
        </div>
      </div>

      {/* TABLA */}
      <div className="products-table-container">
        {loading ? (
          <div className="products-loading">
            <div className="products-loading-spinner" />
            <span>Cargando entregas...</span>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="products-empty">
            <div className="products-empty-icon">◯</div>
            <h3>No hay entregas acá</h3>
            <p>
              {activeTab === "por_enviar"
                ? "Los pedidos programados con envío aparecen en esta sección."
                : "Todavía no hay entregas en este estado."}
            </p>
          </div>
        ) : (
          <div className="products-table-wrapper">
            <table className="products-table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Dirección</th>
                  <th>Programado para</th>
                  <th>Repartidor</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((order) => (
                  <tr key={order.id}>
                    <td>
                      <div className="product-name">{order.customer_name}</div>
                    </td>
                    <td>{order.delivery_address || "—"}</td>
                    <td>
                      {order.scheduled_date
                        ? new Date(order.scheduled_date).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })
                        : "—"}
                    </td>
                    <td>{order.courier_name || "—"}</td>
                    <td>
                      <div className="product-actions">
                        <button
                          type="button"
                          className="product-action-edit"
                          onClick={() => openOrder(order.id)}
                        >
                          Abrir
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

      {/* MODAL: DETALLE DE ENTREGA */}
      {selectedOrder && (
        <div className="modal-overlay" onClick={closeOrder}>
          <div
            className="product-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <span className="dashboard-eyebrow">
                  PEDIDO #{selectedOrder.id} · {TAB_LABELS[activeTab]}
                </span>
                <h2>{selectedOrder.customer_name}</h2>
              </div>
              <button className="modal-close" type="button" onClick={closeOrder}>
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
                  <label>Dirección de entrega</label>
                  <p>{selectedOrder.delivery_address || "Sin especificar"}</p>
                </div>

                {selectedOrder.scheduled_date && (
                  <div className="form-group">
                    <label>Programado para</label>
                    <p>{new Date(selectedOrder.scheduled_date).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })}</p>
                  </div>
                )}

                {selectedOrder.courier_name && (
                  <div className="form-group">
                    <label>Repartidor</label>
                    <p>{selectedOrder.courier_name}</p>
                  </div>
                )}

                {selectedOrder.received_by && (
                  <div className="form-group">
                    <label>Recibido por</label>
                    <p>{selectedOrder.received_by}</p>
                  </div>
                )}

                {/* ITEMS */}
                <div className="form-group">
                  <label>Productos</label>
                  <div className="import-table-wrapper">
                    <table className="import-table">
                      <thead>
                        <tr>
                          <th>Producto</th>
                          <th>Cant.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedOrder.items.map((item) => (
                          <tr key={item.id}>
                            <td>{productLabel(item.product_id)}</td>
                            <td>{item.quantity}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* ACCIÓN: DESPACHAR (Por enviar) */}
                {activeTab === "por_enviar" && (
                  <div className="form-row">
                    <div className="form-group">
                      <label>Repartidor / empresa de envío</label>
                      <input
                        type="text"
                        value={courierName}
                        onChange={(event) => setCourierName(event.target.value)}
                        placeholder="Ej. Juan Pérez / Correo Andreani"
                      />
                    </div>
                    <div className="form-group" style={{ justifyContent: "flex-end" }}>
                      <button
                        type="button"
                        className="primary-button"
                        onClick={dispatchOrder}
                        disabled={actionLoading}
                      >
                        {actionLoading ? "Despachando..." : "Marcar como en camino"}
                      </button>
                    </div>
                  </div>
                )}

                {/* ACCIÓN: ENTREGAR (Por entregarse) */}
                {activeTab === "por_entregarse" && (
                  <div className="form-row">
                    <div className="form-group">
                      <label>Recibido por</label>
                      <input
                        type="text"
                        value={receivedBy}
                        onChange={(event) => setReceivedBy(event.target.value)}
                        placeholder="Nombre de quien recibe"
                      />
                    </div>
                    <div className="form-group" style={{ justifyContent: "flex-end" }}>
                      <button
                        type="button"
                        className="primary-button"
                        onClick={deliverOrder}
                        disabled={actionLoading}
                      >
                        {actionLoading ? "Guardando..." : "Marcar como entregado"}
                      </button>
                    </div>
                  </div>
                )}

                {/* REMITO */}
                <div className="modal-actions" style={{ justifyContent: "flex-start" }}>
                  {!showRemitoPicker ? (
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => setShowRemitoPicker(true)}
                    >
                      Imprimir remito
                    </button>
                  ) : (
                    <div style={{ display: "flex", gap: 10 }}>
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => printRemito(false)}
                      >
                        Remito para cliente
                      </button>
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => printRemito(true)}
                      >
                        Remito + firma y DNI
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

export default Entregas;