import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import "../store/store-admin.css";
import { api, money } from "../extras";
import type { CustomerDebt, PriceQuote, SellerOptions } from "../extras";
import { API_URL } from "../apiBase";
import { fmtMoney } from "../money";

// ============================================================
// TIPOS
// ============================================================

type OrderStatus =
  | "PENDIENTE"
  | "CONFIRMADO"
  | "PROGRAMADO"
  | "ENTREGADO"
  | "CANCELADO";

interface OrderListItem {
  id: number;
  customer_name: string;
  delivery_address: string | null;
  status: OrderStatus;
  items_summary: string;
  total_products: number;
  total_quantity: number;
  total: number;
  created_at: string;
  source?: "SISTEMA" | "WEB";
  web_code?: string | null;
  deposit_status?: "NO_APLICA" | "PENDIENTE" | "PAGADA" | "VENCIDA" | null;
}

interface WebInfo {
  code: string;
  customer_name: string;
  phone: string;
  email: string | null;
  delivery_type: "ENVIO" | "RETIRO";
  address: string | null;
  notes: string | null;
  items_total: number;
  shipping_cost: number;
  grand_total: number;
  deposit_status: "NO_APLICA" | "PENDIENTE" | "PAGADA" | "VENCIDA";
  deposit_percent: number;
  deposit_amount: number;
  remaining: number;
  hold_expires_at: string | null;
  late_payment: boolean;
  deposit_refunded_at?: string | null;
  deposit_refund_note?: string | null;
  coupon_code?: string | null;
  discount_amount?: number;
  shipping_zone_name?: string | null;
  price_list_name?: string | null;
}

const DEPOSIT_LABEL: Record<string, string> = {
  PENDIENTE: "Esperando seña",
  PAGADA: "Seña pagada",
  VENCIDA: "Seña vencida",
};

function waHref(phone: string) {
  let d = phone.replace(/\D/g, "");
  if (!d.startsWith("54") && d.length <= 11) d = "549" + d.replace(/^0/, "");
  return `https://wa.me/${d}`;
}

interface OrderItemDetail {
  id: number;
  product_id: number;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

interface OrderDetail {
  id: number;
  company_id: number;
  customer_id: number;
  warehouse_id: number;
  delivery_address: string | null;
  status: OrderStatus;
  delivery_type: "ENVIO" | "RETIRO" | null;
  scheduled_date: string | null;
  payment_method: "EFECTIVO" | "TRANSFERENCIA" | "PENDIENTE";
  paid: boolean;
  cancel_reason: string | null;
  total: number;
  created_at: string;
  updated_at: string;
  items: OrderItemDetail[];
  web?: WebInfo | null;
  seller_id?: number | null;
  seller_name?: string | null;
  price_list_name?: string | null;
}

interface CustomerLite {
  id: number;
  name: string;
  address: string | null;
  seller_id?: number | null;
}

interface ProductLite {
  id: number;
  name: string;
  sku: string | null;
  price: number;
}

interface WarehouseLite {
  id: number;
  name: string;
}

type Tab = "pendientes" | "finalizados" | "cancelados";


function authHeaders() {
  const token = localStorage.getItem("velora_token");
  return { Authorization: `Bearer ${token}` };
}

const STATUS_LABELS: Record<OrderStatus, string> = {
  PENDIENTE: "Pendiente",
  CONFIRMADO: "Confirmado",
  PROGRAMADO: "Programado",
  ENTREGADO: "Entregado",
  CANCELADO: "Cancelado",
};

// ============================================================
// COMPONENTE
// ============================================================

function Pedidos() {
  const [activeTab, setActiveTab] = useState<Tab>("pendientes");

  const [orders, setOrders] = useState<OrderListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [customers, setCustomers] = useState<CustomerLite[]>([]);
  const [products, setProducts] = useState<ProductLite[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseLite[]>([]);

  // modal: nuevo pedido
  const [showNewOrder, setShowNewOrder] = useState(false);
  const [newCustomerId, setNewCustomerId] = useState("");
  const [newWarehouseId, setNewWarehouseId] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [newItems, setNewItems] = useState<
    { product_id: string; quantity: string }[]
  >([{ product_id: "", quantity: "" }]);
  const [savingOrder, setSavingOrder] = useState(false);

  // nuevo pedido: precios de la lista del cliente, aviso de deuda y vendedor
  const [quote, setQuote] = useState<PriceQuote | null>(null);
  const [customerDebt, setCustomerDebt] = useState<CustomerDebt | null>(null);
  const [sellerOptions, setSellerOptions] = useState<SellerOptions>({ enabled: false, sellers: [], my_seller_id: null });
  const [newSellerId, setNewSellerId] = useState("");

  // modal: detalle de pedido
  const [selectedOrder, setSelectedOrder] = useState<OrderDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // sub-form: confirmar pago
  const [paymentMethod, setPaymentMethod] = useState("EFECTIVO");

  // sub-form: programar
  const [deliveryType, setDeliveryType] = useState<"ENVIO" | "RETIRO">("ENVIO");
  const [scheduledDate, setScheduledDate] = useState("");

  // sub-form: cancelar
  const [showCancelForm, setShowCancelForm] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  // ------------------------------------------------------------
  // CARGA DE DATOS BASE
  // ------------------------------------------------------------

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

  async function loadWarehouses() {
    const response = await fetch(`${API_URL}/stock/warehouses`, {
      headers: authHeaders(),
    });
    if (!response.ok) return;
    setWarehouses(await response.json());
  }

  async function loadOrders() {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/orders`, {
        headers: authHeaders(),
      });
      if (response.status === 401) {
        throw new Error("Sesión no válida o expirada");
      }
      if (!response.ok) {
        throw new Error(`No se pudieron cargar los pedidos (${response.status})`);
      }
      setOrders(await response.json());
    } catch (error) {
      console.error("Error cargando pedidos:", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCustomers();
    loadProducts();
    loadWarehouses();
    loadOrders();
    api<SellerOptions>("/sellers/options").then(setSellerOptions).catch(() => undefined);
  }, []);

  // Al elegir el cliente: precios de su lista y aviso si tiene deuda vencida o supera su límite
  useEffect(() => {
    if (!showNewOrder || !newCustomerId) {
      setQuote(null);
      setCustomerDebt(null);
      return;
    }
    let cancelled = false;
    setQuote(null);
    setCustomerDebt(null);
    api<PriceQuote>(`/pricing/quote?customer_id=${newCustomerId}`)
      .then((data) => { if (!cancelled) setQuote(data); })
      .catch(() => undefined);
    api<CustomerDebt>(`/customers/${newCustomerId}/debt`)
      .then((data) => { if (!cancelled) setCustomerDebt(data); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [showNewOrder, newCustomerId]);

  /** Precio del producto para el cliente elegido (el de su lista, o el base si no tiene). */
  function priceFor(product: ProductLite): number {
    const listed = quote?.prices[String(product.id)];
    return listed !== undefined ? listed : product.price;
  }

  function defaultSellerFor(customerId: string): string {
    const customer = customers.find((c) => c.id === Number(customerId));
    const id = customer?.seller_id || sellerOptions.my_seller_id;
    return id && sellerOptions.sellers.some((seller) => seller.id === id) ? String(id) : "";
  }

  const newOrderTotal = newItems.reduce((sum, item) => {
    const product = products.find((p) => p.id === Number(item.product_id));
    return sum + (product ? priceFor(product) * Number(item.quantity || 0) : 0);
  }, 0);

  // ------------------------------------------------------------
  // FILTRADO POR PESTAÑA + BÚSQUEDA
  // ------------------------------------------------------------

  const tabStatuses: Record<Tab, OrderStatus[]> = {
    pendientes: ["PENDIENTE", "CONFIRMADO", "PROGRAMADO"],
    finalizados: ["ENTREGADO"],
    cancelados: ["CANCELADO"],
  };

  const filteredOrders = orders.filter((order) => {
    if (!tabStatuses[activeTab].includes(order.status)) return false;

    const searchText = search.toLowerCase().trim();
    if (!searchText) return true;
    return (
      order.customer_name.toLowerCase().includes(searchText) ||
      order.items_summary.toLowerCase().includes(searchText)
    );
  });

  // ------------------------------------------------------------
  // NUEVO PEDIDO
  // ------------------------------------------------------------

  function openNewOrder() {
    setNewCustomerId(customers[0] ? String(customers[0].id) : "");
    setNewSellerId(customers[0] ? defaultSellerFor(String(customers[0].id)) : "");
    setNewWarehouseId(warehouses[0] ? String(warehouses[0].id) : "");
    setNewAddress("");
    setNewItems([{ product_id: products[0] ? String(products[0].id) : "", quantity: "" }]);
    setShowNewOrder(true);
  }

  function updateNewItem(index: number, field: "product_id" | "quantity", value: string) {
    setNewItems((current) =>
      current.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    );
  }

  function addNewItemRow() {
    setNewItems((current) => [
      ...current,
      { product_id: products[0] ? String(products[0].id) : "", quantity: "" },
    ]);
  }

  function removeNewItemRow(index: number) {
    setNewItems((current) => current.filter((_, i) => i !== index));
  }

  async function saveNewOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingOrder(true);

    try {
      const items = newItems
        .filter((item) => item.product_id && item.quantity)
        .map((item) => ({
          product_id: Number(item.product_id),
          quantity: Number(item.quantity),
        }));

      if (items.length === 0) {
        throw new Error("Agregá al menos un producto al pedido");
      }

      const response = await fetch(`${API_URL}/orders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify({
          customer_id: Number(newCustomerId),
          warehouse_id: Number(newWarehouseId),
          delivery_address: newAddress || null,
          items,
          // sin precio manual: el servidor aplica la lista de precios del cliente
          ...(sellerOptions.enabled ? { seller_id: newSellerId ? Number(newSellerId) : null } : {}),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || `No se pudo crear el pedido (${response.status})`);
      }

      setShowNewOrder(false);
      await loadOrders();
    } catch (error) {
      console.error("Error creando pedido:", error);
      alert(error instanceof Error ? error.message : "No se pudo crear el pedido.");
    } finally {
      setSavingOrder(false);
    }
  }

  // ------------------------------------------------------------
  // DETALLE / ACCIONES
  // ------------------------------------------------------------

  async function openOrder(orderId: number) {
    setLoadingDetail(true);
    setShowCancelForm(false);
    setCancelReason("");
    setPaymentMethod("EFECTIVO");
    setDeliveryType("ENVIO");
    setScheduledDate("");

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

  function customerName(customerId: number) {
    const customer = customers.find((c) => c.id === customerId);
    return customer ? customer.name : `Cliente #${customerId}`;
  }

  function productLabel(productId: number) {
    const product = products.find((p) => p.id === productId);
    if (!product) return `Producto #${productId}`;
    return product.sku ? `${product.name} (${product.sku})` : product.name;
  }

  async function refreshSelectedOrder(orderId: number) {
    const response = await fetch(`${API_URL}/orders/${orderId}`, {
      headers: authHeaders(),
    });
    if (response.ok) {
      setSelectedOrder(await response.json());
    }
    await loadOrders();
  }

  async function confirmOrder() {
    if (!selectedOrder) return;
    setActionLoading(true);

    try {
      const response = await fetch(
        `${API_URL}/orders/${selectedOrder.id}/confirm`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...authHeaders(),
          },
          body: JSON.stringify({ payment_method: paymentMethod }),
        }
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "No se pudo confirmar el pedido");
      }
      await refreshSelectedOrder(selectedOrder.id);
    } catch (error) {
      console.error("Error confirmando pedido:", error);
      alert(error instanceof Error ? error.message : "No se pudo confirmar el pedido.");
    } finally {
      setActionLoading(false);
    }
  }

  async function scheduleOrder() {
    if (!selectedOrder) return;
    if (deliveryType === "ENVIO" && !scheduledDate) {
      alert("Elegí fecha y hora para el envío.");
      return;
    }
    setActionLoading(true);

    try {
      const response = await fetch(
        `${API_URL}/orders/${selectedOrder.id}/schedule`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...authHeaders(),
          },
          body: JSON.stringify({
            delivery_type: deliveryType,
            scheduled_date:
              deliveryType === "ENVIO" ? new Date(scheduledDate).toISOString() : null,
          }),
        }
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "No se pudo programar el pedido");
      }
      await refreshSelectedOrder(selectedOrder.id);
    } catch (error) {
      console.error("Error programando pedido:", error);
      alert(error instanceof Error ? error.message : "No se pudo programar el pedido.");
    } finally {
      setActionLoading(false);
    }
  }

  async function deliverOrder() {
    if (!selectedOrder) return;
    const confirmed = window.confirm("¿Confirmás que el pedido fue entregado / retirado?");
    if (!confirmed) return;

    setActionLoading(true);
    try {
      const response = await fetch(
        `${API_URL}/orders/${selectedOrder.id}/deliver`,
        {
          method: "POST",
          headers: authHeaders(),
        }
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "No se pudo marcar como entregado");
      }
      await refreshSelectedOrder(selectedOrder.id);
    } catch (error) {
      console.error("Error entregando pedido:", error);
      alert(error instanceof Error ? error.message : "No se pudo marcar como entregado.");
    } finally {
      setActionLoading(false);
    }
  }

  async function cancelOrder() {
    if (!selectedOrder) return;
    if (!cancelReason.trim()) {
      alert("Indicá el motivo de la cancelación.");
      return;
    }

    setActionLoading(true);
    try {
      const response = await fetch(
        `${API_URL}/orders/${selectedOrder.id}/cancel`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...authHeaders(),
          },
          body: JSON.stringify({ cancel_reason: cancelReason }),
        }
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "No se pudo cancelar el pedido");
      }
      setShowCancelForm(false);
      setCancelReason("");
      await refreshSelectedOrder(selectedOrder.id);
    } catch (error) {
      console.error("Error cancelando pedido:", error);
      alert(error instanceof Error ? error.message : "No se pudo cancelar el pedido.");
    } finally {
      setActionLoading(false);
    }
  }

  async function registerDepositRefund() {
    if (!selectedOrder?.web) return;
    const note = window.prompt(
      "Registrá que ya devolviste la seña desde tu cuenta de Mercado Pago.\nPodés dejar una nota (opcional):",
      ""
    );
    if (note === null) return;
    setActionLoading(true);
    try {
      const response = await fetch(`${API_URL}/orders/${selectedOrder.id}/deposit-refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ note }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "No se pudo registrar la devolución");
      await refreshSelectedOrder(selectedOrder.id);
    } catch (error) {
      alert(error instanceof Error ? error.message : "No se pudo registrar la devolución.");
    } finally {
      setActionLoading(false);
    }
  }

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <section className="products-page">
      {/* HEADER */}
      <div className="products-header">
        <div>
          <span className="dashboard-eyebrow">VENTAS</span>
          <h1>Pedidos</h1>
          <p>Gestioná pedidos, reservas de stock y entregas.</p>
        </div>

        <div className="products-header-actions">
          <button
            className="primary-button"
            type="button"
            onClick={openNewOrder}
            disabled={customers.length === 0 || warehouses.length === 0 || products.length === 0}
          >
            + Nuevo pedido
          </button>
        </div>
      </div>

      {/* TABS */}
      <div className="products-toolbar" style={{ marginBottom: 4 }}>
        <div className="product-actions">
          <button
            type="button"
            className={activeTab === "pendientes" ? "primary-button" : "secondary-button"}
            onClick={() => setActiveTab("pendientes")}
          >
            Pendientes
          </button>
          <button
            type="button"
            className={activeTab === "finalizados" ? "primary-button" : "secondary-button"}
            onClick={() => setActiveTab("finalizados")}
          >
            Finalizados
          </button>
          <button
            type="button"
            className={activeTab === "cancelados" ? "primary-button" : "secondary-button"}
            onClick={() => setActiveTab("cancelados")}
          >
            Cancelados
          </button>
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
            placeholder="Buscar cliente o producto..."
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
          {filteredOrders.length === 1 ? "pedido" : "pedidos"}
        </div>
      </div>

      {/* TABLA */}
      <div className="products-table-container">
        {loading ? (
          <div className="products-loading">
            <div className="products-loading-spinner" />
            <span>Cargando pedidos...</span>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="products-empty">
            <div className="products-empty-icon">◯</div>
            <h3>No hay pedidos acá</h3>
            <p>
              {activeTab === "pendientes"
                ? "Los pedidos nuevos aparecen en esta sección."
                : "Todavía no hay pedidos en este estado."}
            </p>
          </div>
        ) : (
          <div className="products-table-wrapper">
            <table className="products-table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Artículos</th>
                  <th>Cant.</th>
                  <th>Dirección</th>
                  <th>Estado</th>
                  <th>Total</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((order) => (
                  <tr key={order.id}>
                    <td>
                      <div className="product-name">{order.customer_name}</div>
                      {order.source === "WEB" && (
                        <span
                          className={`vs-web-badge ${order.deposit_status === "PENDIENTE" ? "is-wait" : order.deposit_status === "PAGADA" ? "is-paid" : ""}`}
                          title="Pedido hecho desde la tienda online"
                        >
                          🌐 Web · {order.web_code}
                          {order.deposit_status && DEPOSIT_LABEL[order.deposit_status] ? ` · ${DEPOSIT_LABEL[order.deposit_status]}` : ""}
                        </span>
                      )}
                    </td>
                    <td>{order.items_summary}</td>
                    <td>{order.total_quantity}</td>
                    <td>{order.delivery_address || "—"}</td>
                    <td>
                      <span className="status-active" data-status={order.status}>
                        <span className="status-dot" />
                        {STATUS_LABELS[order.status]}
                      </span>
                    </td>
                    <td>
                      <span className="product-price">
                        {fmtMoney(order.total)}
                      </span>
                    </td>
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

      {/* MODAL: NUEVO PEDIDO */}
      {showNewOrder && (
        <div className="modal-overlay" onClick={() => setShowNewOrder(false)}>
          <div
            className="product-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <span className="dashboard-eyebrow">PEDIDOS</span>
                <h2>Nuevo pedido</h2>
              </div>
              <button
                className="modal-close"
                type="button"
                onClick={() => setShowNewOrder(false)}
              >
                ×
              </button>
            </div>

            <form onSubmit={saveNewOrder} className="product-form">
              <div className="form-row">
                <div className="form-group">
                  <label>Cliente</label>
                  <select
                    value={newCustomerId}
                    onChange={(event) => {
                      setNewCustomerId(event.target.value);
                      setNewSellerId(defaultSellerFor(event.target.value));
                      const customer = customers.find(
                        (c) => c.id === Number(event.target.value)
                      );
                      if (customer?.address) setNewAddress(customer.address);
                    }}
                    required
                  >
                    {customers.map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Depósito</label>
                  <select
                    value={newWarehouseId}
                    onChange={(event) => setNewWarehouseId(event.target.value)}
                    required
                  >
                    {warehouses.map((warehouse) => (
                      <option key={warehouse.id} value={warehouse.id}>
                        {warehouse.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {quote?.list && (
                <div className="vx-note is-info vx-inline-note">
                  <span>
                    <strong>Lista: {quote.list.name}</strong>
                    {quote.list.kind === "PERCENT" && quote.list.percent !== 0
                      ? ` · ${quote.list.percent > 0 ? "+" : "−"}${Math.abs(quote.list.percent)}% sobre el precio base`
                      : " · precios propios de esta lista"}
                    . Los precios de abajo ya son los de este cliente.
                  </span>
                </div>
              )}

              {customerDebt && (customerDebt.overdue_amount > 0 || customerDebt.over_limit) && (
                <div className="vx-note is-bad vx-inline-note" role="alert">
                  <span>
                    <strong>Atención: este cliente debe {money(customerDebt.balance)}.</strong>
                    {customerDebt.overdue_amount > 0 &&
                      ` Tiene ${money(customerDebt.overdue_amount)} vencido hace ${customerDebt.overdue_days} ${customerDebt.overdue_days === 1 ? "día" : "días"}.`}
                    {customerDebt.over_limit && ` Supera su límite de crédito (${money(customerDebt.credit_limit)}).`}
                    {" "}Podés cargar el pedido igual.
                  </span>
                </div>
              )}

              {sellerOptions.enabled && (
                <div className="form-group">
                  <label>Vendedor</label>
                  <select value={newSellerId} onChange={(event) => setNewSellerId(event.target.value)}>
                    <option value="">Sin vendedor</option>
                    {sellerOptions.sellers.map((seller) => (
                      <option key={seller.id} value={seller.id}>{seller.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="form-group">
                <label>Dirección de entrega</label>
                <input
                  type="text"
                  value={newAddress}
                  onChange={(event) => setNewAddress(event.target.value)}
                  placeholder="Se completa con la del cliente, editable"
                />
              </div>

              <div className="form-group">
                <label>Productos</label>

                {newItems.map((item, index) => (
                  <div className="form-row" key={index} style={{ marginBottom: 8 }}>
                    <select
                      value={item.product_id}
                      onChange={(event) =>
                        updateNewItem(index, "product_id", event.target.value)
                      }
                    >
                      {products.map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.name} — {money(priceFor(product))}
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
                          updateNewItem(index, "quantity", event.target.value)
                        }
                      />
                      {newItems.length > 1 && (
                        <button
                          type="button"
                          className="import-remove-button"
                          onClick={() => removeNewItemRow(index)}
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
                  onClick={addNewItemRow}
                >
                  + Agregar producto
                </button>

                {newOrderTotal > 0 && (
                  <p style={{ textAlign: "right", marginTop: 8 }}>
                    <strong>Total estimado: {money(newOrderTotal)}</strong>
                    {quote?.list ? ` (lista ${quote.list.name})` : ""}
                  </p>
                )}
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setShowNewOrder(false)}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="primary-button"
                  disabled={savingOrder}
                >
                  {savingOrder ? "Creando..." : "Crear pedido"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: DETALLE DE PEDIDO */}
      {selectedOrder && (
        <div className="modal-overlay" onClick={closeOrder}>
          <div
            className="product-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <span className="dashboard-eyebrow">
                  PEDIDO #{selectedOrder.id} · {STATUS_LABELS[selectedOrder.status]}
                </span>
                <h2>{customerName(selectedOrder.customer_id)}</h2>
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
                {/* PEDIDO DE LA TIENDA ONLINE */}
                {selectedOrder.web && (
                  <div className="vs-web-box">
                    <div className="vs-web-title">
                      <strong>🌐 Pedido de la tienda online · {selectedOrder.web.code}</strong>
                      {DEPOSIT_LABEL[selectedOrder.web.deposit_status] && (
                        <span className={`vs-web-badge ${selectedOrder.web.deposit_status === "PENDIENTE" ? "is-wait" : selectedOrder.web.deposit_status === "PAGADA" ? "is-paid" : ""}`}>
                          {DEPOSIT_LABEL[selectedOrder.web.deposit_status]}
                        </span>
                      )}
                    </div>
                    <div className="vs-web-row">
                      <span>{selectedOrder.web.customer_name} · <a href={waHref(selectedOrder.web.phone)} target="_blank" rel="noopener">{selectedOrder.web.phone}</a>{selectedOrder.web.email ? ` · ${selectedOrder.web.email}` : ""}</span>
                    </div>
                    <div className="vs-web-row">
                      <span>{selectedOrder.web.delivery_type === "ENVIO" ? `Envío a: ${selectedOrder.web.address}` : "Retira en el local"}</span>
                    </div>
                    {selectedOrder.web.notes && <div className="vs-web-row"><span>“{selectedOrder.web.notes}”</span></div>}
                    <div className="vs-web-row"><span>Productos{selectedOrder.web.price_list_name ? ` (lista ${selectedOrder.web.price_list_name})` : ""}</span><span>{fmtMoney(selectedOrder.web.items_total)}</span></div>
                    {(selectedOrder.web.discount_amount || 0) > 0 && (
                      <div className="vs-web-row"><span>Cupón {selectedOrder.web.coupon_code}</span><span>− {fmtMoney((selectedOrder.web.discount_amount || 0))}</span></div>
                    )}
                    {selectedOrder.web.delivery_type === "ENVIO" && (
                      <div className="vs-web-row">
                        <span>Envío{selectedOrder.web.shipping_zone_name ? ` · ${selectedOrder.web.shipping_zone_name}` : ""}</span>
                        <span>{selectedOrder.web.shipping_cost > 0 ? `${fmtMoney(selectedOrder.web.shipping_cost)}` : "Sin cargo"}</span>
                      </div>
                    )}
                    <div className="vs-web-row"><span>Total a cobrar{selectedOrder.web.delivery_type === "ENVIO" ? " (con envío)" : ""}</span><strong>{fmtMoney(selectedOrder.web.grand_total)}</strong></div>
                    {selectedOrder.web.deposit_status === "PAGADA" && (
                      <>
                        <div className="vs-web-row"><span>Seña cobrada por Mercado Pago ({selectedOrder.web.deposit_percent}%)</span><strong>− {fmtMoney(selectedOrder.web.deposit_amount)}</strong></div>
                        <div className="vs-web-row"><span>Falta cobrar</span><strong>{fmtMoney(selectedOrder.web.remaining)}</strong></div>
                      </>
                    )}
                    {selectedOrder.web.deposit_status === "PENDIENTE" && selectedOrder.web.hold_expires_at && (
                      <div className="vs-web-row"><span>Seña de {fmtMoney(selectedOrder.web.deposit_amount)} · si no paga antes de las {new Date(selectedOrder.web.hold_expires_at).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })} se cancela y se libera el stock</span></div>
                    )}
                    {selectedOrder.web.late_payment && (
                      <div className="vs-web-row"><strong>⚠ Pagó la seña después de que venció: contactalo para devolverla o rearmar el pedido.</strong></div>
                    )}
                    {selectedOrder.web.deposit_refunded_at ? (
                      <div className="vs-web-row">
                        <span>Seña devuelta el {new Date(selectedOrder.web.deposit_refunded_at).toLocaleDateString("es-AR")}{selectedOrder.web.deposit_refund_note ? ` · ${selectedOrder.web.deposit_refund_note}` : ""}</span>
                      </div>
                    ) : (selectedOrder.status === "CANCELADO" && selectedOrder.web.deposit_status === "PAGADA") || selectedOrder.web.late_payment ? (
                      <div className="vs-web-row vs-web-refund">
                        <span>La devolución de la seña se hace a mano desde tu cuenta de Mercado Pago. Después registrala acá para dejar constancia (no mueve plata ni toca la caja).</span>
                        <button type="button" className="primary-button" onClick={registerDepositRefund} disabled={actionLoading}>Registrar seña devuelta</button>
                      </div>
                    ) : null}
                  </div>
                )}

                {/* DIRECCIÓN */}
                <div className="form-group">
                  <label>Dirección de entrega</label>
                  <p>{selectedOrder.delivery_address || "Sin especificar"}</p>
                </div>

                {/* ITEMS */}
                <div className="form-group">
                  <label>Productos</label>
                  <div className="import-table-wrapper">
                    <table className="import-table">
                      <thead>
                        <tr>
                          <th>Producto</th>
                          <th>Cant.</th>
                          <th>Precio</th>
                          <th>Subtotal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedOrder.items.map((item) => (
                          <tr key={item.id}>
                            <td>{productLabel(item.product_id)}</td>
                            <td>{item.quantity}</td>
                            <td>${item.unit_price}</td>
                            <td>${item.subtotal}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {selectedOrder.web && (selectedOrder.web.discount_amount || 0) > 0 && (
                    <p style={{ textAlign: "right", marginTop: 8 }}>
                      Cupón {selectedOrder.web.coupon_code}: − {fmtMoney((selectedOrder.web.discount_amount || 0))}
                    </p>
                  )}
                  <p style={{ textAlign: "right", marginTop: 8 }}>
                    <strong>Total: {fmtMoney(selectedOrder.total)}</strong>
                  </p>
                  {(selectedOrder.seller_name || (!selectedOrder.web && selectedOrder.price_list_name)) && (
                    <div className="vx-badges" style={{ justifyContent: "flex-end" }}>
                      {selectedOrder.seller_name && <span className="vx-badge">Vendedor: {selectedOrder.seller_name}</span>}
                      {!selectedOrder.web && selectedOrder.price_list_name && <span className="vx-badge is-info">Lista del cliente: {selectedOrder.price_list_name}</span>}
                    </div>
                  )}
                </div>

                {/* PROGRAMACIÓN YA DEFINIDA */}
                {selectedOrder.status === "PROGRAMADO" && (
                  <div className="import-warning">
                    <strong>
                      {selectedOrder.delivery_type === "ENVIO" ? "Envío" : "Retiro"}
                    </strong>
                    <span>
                      {selectedOrder.delivery_type === "ENVIO" && selectedOrder.scheduled_date
                        ? `Programado para ${new Date(
                            selectedOrder.scheduled_date
                          ).toLocaleString("es-AR")}`
                        : "El cliente retira en el local"}
                    </span>
                  </div>
                )}

                {/* MOTIVO DE CANCELACIÓN */}
                {selectedOrder.status === "CANCELADO" && selectedOrder.cancel_reason && (
                  <div className="import-warning">
                    <strong>Motivo de cancelación</strong>
                    <span>{selectedOrder.cancel_reason}</span>
                  </div>
                )}

                {/* ACCIÓN: CONFIRMAR (solo PENDIENTE) */}
                {selectedOrder.status === "PENDIENTE" && (
                  <div className="form-row">
                    <div className="form-group">
                      <label>Método de pago</label>
                      <select
                        value={paymentMethod}
                        onChange={(event) => setPaymentMethod(event.target.value)}
                      >
                        <option value="EFECTIVO">Efectivo</option>
                        <option value="TRANSFERENCIA">Transferencia</option>
                        <option value="PENDIENTE">Pendiente</option>
                      </select>
                    </div>
                    <div className="form-group" style={{ justifyContent: "flex-end" }}>
                      <button
                        type="button"
                        className="primary-button"
                        onClick={confirmOrder}
                        disabled={actionLoading}
                      >
                        {actionLoading ? "Confirmando..." : "Confirmar pedido"}
                      </button>
                    </div>
                  </div>
                )}

                {/* ACCIÓN: PROGRAMAR (solo CONFIRMADO) */}
                {selectedOrder.status === "CONFIRMADO" && (
                  <>
                    <div className="form-row">
                      <div className="form-group">
                        <label>Tipo de entrega</label>
                        <select
                          value={deliveryType}
                          onChange={(event) =>
                            setDeliveryType(event.target.value as "ENVIO" | "RETIRO")
                          }
                        >
                          <option value="ENVIO">Envío</option>
                          <option value="RETIRO">Retiro en local</option>
                        </select>
                      </div>

                      {deliveryType === "ENVIO" && (
                        <div className="form-group">
                          <label>Fecha y hora de envío</label>
                          <input
                            type="datetime-local"
                            value={scheduledDate}
                            onChange={(event) => setScheduledDate(event.target.value)}
                          />
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      className="primary-button"
                      onClick={scheduleOrder}
                      disabled={actionLoading}
                    >
                      {actionLoading ? "Guardando..." : "Programar"}
                    </button>
                  </>
                )}

                {/* ACCIÓN: ENTREGAR (solo PROGRAMADO) */}
                {selectedOrder.status === "PROGRAMADO" && (
                  <button
                    type="button"
                    className="primary-button"
                    onClick={deliverOrder}
                    disabled={actionLoading}
                  >
                    {actionLoading ? "Guardando..." : "Marcar como entregado / retirado"}
                  </button>
                )}

                {/* ACCIÓN: CANCELAR (cualquier estado no final) */}
                {["PENDIENTE", "CONFIRMADO", "PROGRAMADO"].includes(selectedOrder.status) && (
                  <div className="modal-actions" style={{ justifyContent: "space-between" }}>
                    {!showCancelForm ? (
                      <button
                        type="button"
                        className="product-action-delete"
                        onClick={() => setShowCancelForm(true)}
                      >
                        Cancelar pedido
                      </button>
                    ) : (
                      <div className="form-group" style={{ width: "100%" }}>
                        <label>Motivo de cancelación</label>
                        <input
                          type="text"
                          value={cancelReason}
                          onChange={(event) => setCancelReason(event.target.value)}
                          placeholder="Ej. el cliente se arrepintió"
                        />
                        <div className="modal-actions">
                          <button
                            type="button"
                            className="secondary-button"
                            onClick={() => setShowCancelForm(false)}
                          >
                            Volver
                          </button>
                          <button
                            type="button"
                            className="product-action-delete"
                            onClick={cancelOrder}
                            disabled={actionLoading}
                          >
                            {actionLoading ? "Cancelando..." : "Confirmar cancelación"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

export default Pedidos;