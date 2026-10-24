import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { API_URL } from "../apiBase";
import { fmtMoney } from "../money";

type PurchaseStatus = "PENDIENTE" | "RECIBIDA" | "CANCELADA";

interface PurchaseListItem {
  id: number;
  supplier_name: string;
  status: PurchaseStatus;
  items_summary: string;
  total: number;
  created_at: string;
}

interface PurchaseItemDetail {
  id: number;
  product_id: number;
  quantity: number;
  unit_cost: number;
  subtotal: number;
}

interface PurchaseDetail {
  id: number;
  company_id: number;
  supplier_id: number;
  warehouse_id: number;
  status: PurchaseStatus;
  supplier_invoice_number: string | null;
  notes: string | null;
  subtotal: number;
  total: number;
  received_at: string | null;
  created_at: string;
  items: PurchaseItemDetail[];
}

interface SupplierLite {
  id: number;
  name: string;
}

interface ProductLite {
  id: number;
  name: string;
  sku: string | null;
}

interface WarehouseLite {
  id: number;
  name: string;
}

type Tab = "pendientes" | "recibidas" | "canceladas";


function authHeaders() {
  const token = localStorage.getItem("velora_token");
  return { Authorization: `Bearer ${token}` };
}

const TAB_STATUS: Record<Tab, PurchaseStatus> = {
  pendientes: "PENDIENTE",
  recibidas: "RECIBIDA",
  canceladas: "CANCELADA",
};

const TAB_LABELS: Record<Tab, string> = {
  pendientes: "Pendientes",
  recibidas: "Recibidas",
  canceladas: "Canceladas",
};

function Compras() {
  const [activeTab, setActiveTab] = useState<Tab>("pendientes");
  const [purchases, setPurchases] = useState<PurchaseListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [suppliers, setSuppliers] = useState<SupplierLite[]>([]);
  const [products, setProducts] = useState<ProductLite[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseLite[]>([]);

  const [showNewPurchase, setShowNewPurchase] = useState(false);
  const [newSupplierId, setNewSupplierId] = useState("");
  const [newWarehouseId, setNewWarehouseId] = useState("");
  const [newInvoiceNumber, setNewInvoiceNumber] = useState("");
  const [newItems, setNewItems] = useState<
    { product_id: string; quantity: string; unit_cost: string }[]
  >([{ product_id: "", quantity: "", unit_cost: "" }]);
  const [savingPurchase, setSavingPurchase] = useState(false);

  const [selectedPurchase, setSelectedPurchase] = useState<PurchaseDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  async function loadSuppliers() {
    const response = await fetch(`${API_URL}/suppliers`, { headers: authHeaders() });
    if (!response.ok) return;
    setSuppliers(await response.json());
  }

  async function loadProducts() {
    const response = await fetch(`${API_URL}/products`, { headers: authHeaders() });
    if (!response.ok) return;
    setProducts(await response.json());
  }

  async function loadWarehouses() {
    const response = await fetch(`${API_URL}/stock/warehouses`, { headers: authHeaders() });
    if (!response.ok) return;
    setWarehouses(await response.json());
  }

  async function loadPurchases(tab: Tab) {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/purchases?status=${TAB_STATUS[tab]}`, {
        headers: authHeaders(),
      });
      if (!response.ok) throw new Error(`No se pudieron cargar las compras (${response.status})`);
      setPurchases(await response.json());
    } catch (error) {
      console.error("Error cargando compras:", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSuppliers();
    loadProducts();
    loadWarehouses();
  }, []);

  useEffect(() => {
    loadPurchases(activeTab);
  }, [activeTab]);

  const filteredPurchases = purchases.filter((purchase) => {
    const searchText = search.toLowerCase().trim();
    if (!searchText) return true;
    return (
      purchase.supplier_name.toLowerCase().includes(searchText) ||
      purchase.items_summary.toLowerCase().includes(searchText)
    );
  });

  function openNewPurchase() {
    setNewSupplierId(suppliers[0] ? String(suppliers[0].id) : "");
    setNewWarehouseId(warehouses[0] ? String(warehouses[0].id) : "");
    setNewInvoiceNumber("");
    setNewItems([{ product_id: products[0] ? String(products[0].id) : "", quantity: "", unit_cost: "" }]);
    setShowNewPurchase(true);
  }

  function updateNewItem(
    index: number,
    field: "product_id" | "quantity" | "unit_cost",
    value: string
  ) {
    setNewItems((current) =>
      current.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    );
  }

  function addNewItemRow() {
    setNewItems((current) => [
      ...current,
      { product_id: products[0] ? String(products[0].id) : "", quantity: "", unit_cost: "" },
    ]);
  }

  function removeNewItemRow(index: number) {
    setNewItems((current) => current.filter((_, i) => i !== index));
  }

  async function saveNewPurchase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingPurchase(true);

    try {
      const items = newItems
        .filter((item) => item.product_id && item.quantity && item.unit_cost)
        .map((item) => ({
          product_id: Number(item.product_id),
          quantity: Number(item.quantity),
          unit_cost: Number(item.unit_cost),
        }));

      if (items.length === 0) {
        throw new Error("Agregá al menos un producto");
      }

      const response = await fetch(`${API_URL}/purchases`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify({
          supplier_id: Number(newSupplierId),
          warehouse_id: Number(newWarehouseId),
          supplier_invoice_number: newInvoiceNumber || null,
          items,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || `No se pudo crear la compra (${response.status})`);
      }

      setShowNewPurchase(false);
      await loadPurchases(activeTab);
    } catch (error) {
      console.error("Error creando compra:", error);
      alert(error instanceof Error ? error.message : "No se pudo crear la compra.");
    } finally {
      setSavingPurchase(false);
    }
  }

  async function openPurchase(purchaseId: number) {
    setLoadingDetail(true);
    try {
      const response = await fetch(`${API_URL}/purchases/${purchaseId}`, {
        headers: authHeaders(),
      });
      if (!response.ok) throw new Error("No se pudo cargar la compra");
      setSelectedPurchase(await response.json());
    } catch (error) {
      console.error("Error cargando compra:", error);
      alert("No se pudo cargar la compra.");
    } finally {
      setLoadingDetail(false);
    }
  }

  function closePurchase() {
    setSelectedPurchase(null);
  }

  function supplierName(supplierId: number) {
    const supplier = suppliers.find((s) => s.id === supplierId);
    return supplier ? supplier.name : `Proveedor #${supplierId}`;
  }

  function productLabel(productId: number) {
    const product = products.find((p) => p.id === productId);
    if (!product) return `Producto #${productId}`;
    return product.sku ? `${product.name} (${product.sku})` : product.name;
  }

  async function receivePurchase() {
    if (!selectedPurchase) return;
    const confirmed = window.confirm(
      "¿Confirmás la recepción? Esto va a sumar el stock automáticamente."
    );
    if (!confirmed) return;

    setActionLoading(true);
    try {
      const response = await fetch(
        `${API_URL}/purchases/${selectedPurchase.id}/receive`,
        { method: "POST", headers: authHeaders() }
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "No se pudo recibir la compra");
      }
      closePurchase();
      await loadPurchases(activeTab);
    } catch (error) {
      console.error("Error recibiendo compra:", error);
      alert(error instanceof Error ? error.message : "No se pudo recibir la compra.");
    } finally {
      setActionLoading(false);
    }
  }

  async function cancelPurchase() {
    if (!selectedPurchase) return;
    const confirmed = window.confirm("¿Cancelar esta compra?");
    if (!confirmed) return;

    setActionLoading(true);
    try {
      const response = await fetch(
        `${API_URL}/purchases/${selectedPurchase.id}/cancel`,
        { method: "POST", headers: authHeaders() }
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "No se pudo cancelar la compra");
      }
      closePurchase();
      await loadPurchases(activeTab);
    } catch (error) {
      console.error("Error cancelando compra:", error);
      alert(error instanceof Error ? error.message : "No se pudo cancelar la compra.");
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <section className="products-page">
      <div className="products-header">
        <div>
          <span className="dashboard-eyebrow">ABASTECIMIENTO</span>
          <h1>Compras</h1>
          <p>Órdenes de compra a proveedores y recepción de mercadería.</p>
        </div>
        <div className="products-header-actions">
          <button
            className="primary-button"
            type="button"
            onClick={openNewPurchase}
            disabled={suppliers.length === 0 || warehouses.length === 0 || products.length === 0}
          >
            + Nueva compra
          </button>
        </div>
      </div>

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

      <div className="products-toolbar">
        <div className="products-search">
          <span className="products-search-icon">⌕</span>
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar proveedor o producto..."
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
          {filteredPurchases.length}{" "}
          {filteredPurchases.length === 1 ? "compra" : "compras"}
        </div>
      </div>

      <div className="products-table-container">
        {loading ? (
          <div className="products-loading">
            <div className="products-loading-spinner" />
            <span>Cargando compras...</span>
          </div>
        ) : filteredPurchases.length === 0 ? (
          <div className="products-empty">
            <div className="products-empty-icon">◯</div>
            <h3>No hay compras acá</h3>
          </div>
        ) : (
          <div className="products-table-wrapper">
            <table className="products-table">
              <thead>
                <tr>
                  <th>Proveedor</th>
                  <th>Artículos</th>
                  <th>Total</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredPurchases.map((purchase) => (
                  <tr key={purchase.id}>
                    <td>
                      <div className="product-name">{purchase.supplier_name}</div>
                    </td>
                    <td>{purchase.items_summary}</td>
                    <td>
                      <span className="product-price">
                        {fmtMoney(purchase.total)}
                      </span>
                    </td>
                    <td>
                      <div className="product-actions">
                        <button
                          type="button"
                          className="product-action-edit"
                          onClick={() => openPurchase(purchase.id)}
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

      {/* MODAL: NUEVA COMPRA */}
      {showNewPurchase && (
        <div className="modal-overlay" onClick={() => setShowNewPurchase(false)}>
          <div className="product-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <span className="dashboard-eyebrow">COMPRAS</span>
                <h2>Nueva compra</h2>
              </div>
              <button
                className="modal-close"
                type="button"
                onClick={() => setShowNewPurchase(false)}
              >
                ×
              </button>
            </div>

            <form onSubmit={saveNewPurchase} className="product-form">
              <div className="form-row">
                <div className="form-group">
                  <label>Proveedor</label>
                  <select
                    value={newSupplierId}
                    onChange={(event) => setNewSupplierId(event.target.value)}
                    required
                  >
                    {suppliers.map((supplier) => (
                      <option key={supplier.id} value={supplier.id}>
                        {supplier.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Depósito de destino</label>
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

              <div className="form-group">
                <label>N° de factura del proveedor</label>
                <input
                  type="text"
                  value={newInvoiceNumber}
                  onChange={(event) => setNewInvoiceNumber(event.target.value)}
                  placeholder="Opcional"
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
                          {product.name}
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
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="Costo unit."
                        value={item.unit_cost}
                        onChange={(event) =>
                          updateNewItem(index, "unit_cost", event.target.value)
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
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setShowNewPurchase(false)}
                >
                  Cancelar
                </button>
                <button type="submit" className="primary-button" disabled={savingPurchase}>
                  {savingPurchase ? "Creando..." : "Crear compra"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: DETALLE */}
      {selectedPurchase && (
        <div className="modal-overlay" onClick={closePurchase}>
          <div className="product-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <span className="dashboard-eyebrow">
                  COMPRA #{selectedPurchase.id} · {selectedPurchase.status}
                </span>
                <h2>{supplierName(selectedPurchase.supplier_id)}</h2>
              </div>
              <button className="modal-close" type="button" onClick={closePurchase}>
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
                {selectedPurchase.supplier_invoice_number && (
                  <div className="form-group">
                    <label>N° factura del proveedor</label>
                    <p>{selectedPurchase.supplier_invoice_number}</p>
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
                          <th>Costo unit.</th>
                          <th>Subtotal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedPurchase.items.map((item) => (
                          <tr key={item.id}>
                            <td>{productLabel(item.product_id)}</td>
                            <td>{item.quantity}</td>
                            <td>{fmtMoney(Number(item.unit_cost))}</td>
                            <td>{fmtMoney(Number(item.subtotal))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p style={{ textAlign: "right", marginTop: 8 }}>
                    <strong>Total: {fmtMoney(selectedPurchase.total)}</strong>
                  </p>
                </div>

                {selectedPurchase.status === "PENDIENTE" && (
                  <div className="modal-actions" style={{ justifyContent: "space-between" }}>
                    <button
                      type="button"
                      className="product-action-delete"
                      onClick={cancelPurchase}
                      disabled={actionLoading}
                    >
                      Cancelar compra
                    </button>
                    <button
                      type="button"
                      className="primary-button"
                      onClick={receivePurchase}
                      disabled={actionLoading}
                    >
                      {actionLoading ? "Procesando..." : "Marcar como recibida"}
                    </button>
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

export default Compras;