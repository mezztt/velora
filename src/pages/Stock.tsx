import { useEffect, useState } from "react";
import { statusLabel } from "../extras";
import type { FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import Reposicion from "./Reposicion";
import { API_URL } from "../apiBase";

// ============================================================
// TIPOS
// ============================================================

interface Warehouse {
  id: number;
  company_id: number;
  name: string;
  address: string | null;
  active: boolean;
  created_at: string;
}

interface InventoryItem {
  id: number;
  company_id: number;
  warehouse_id: number;
  product_id: number;
  quantity: number;
  reserved_quantity: number;
  available: number;
  min_stock: number | null;
  created_at: string;
  updated_at: string;
}

interface StockMovement {
  id: number;
  company_id: number;
  warehouse_id: number;
  product_id: number;
  user_id: number | null;
  movement_type: string;
  quantity: number;
  previous_qty: number;
  new_qty: number;
  reference: string | null;
  notes: string | null;
  created_at: string;
}

interface ProductLite {
  id: number;
  name: string;
  sku: string | null;
}

const MOVEMENT_TYPES = [
  { value: "ENTRADA", label: "Entrada" },
  { value: "SALIDA", label: "Salida" },
  { value: "AJUSTE", label: "Ajuste (conteo físico)" },
  { value: "RESERVA", label: "Reserva" },
  { value: "LIBERACION", label: "Liberación" },
];


function authHeaders() {
  const token = localStorage.getItem("velora_token");
  return { Authorization: `Bearer ${token}` };
}

// ============================================================
// COMPONENTE
// ============================================================

function Stock() {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [products, setProducts] = useState<ProductLite[]>([]);

  const [loading, setLoading] = useState(true);
  const [selectedWarehouse, setSelectedWarehouse] = useState<number | "all">(
    "all"
  );
  const [search, setSearch] = useState("");

  // pestañas: Inventario · Reposición
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "reposicion" ? "reposicion" : "inventario";
  function setTab(next: "inventario" | "reposicion") {
    setParams(next === "inventario" ? {} : { tab: next }, { replace: true });
  }

  // mínimo de un producto (se edita en la misma tabla)
  async function saveMinStock(item: InventoryItem, value: string) {
    const min = Number(value);
    if (value.trim() === "" || isNaN(min) || min < 0 || min === Number(item.min_stock ?? -1)) return;
    try {
      const response = await fetch(`${API_URL}/stock/inventory/${item.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ min_stock: min }),
      });
      if (!response.ok) throw new Error("No se pudo guardar el mínimo");
      await loadInventory();
    } catch (error) {
      console.error("Error guardando mínimo:", error);
      alert("No se pudo guardar el stock mínimo.");
    }
  }

  // modal: nuevo depósito
  const [showWarehouseForm, setShowWarehouseForm] = useState(false);
  const [warehouseName, setWarehouseName] = useState("");
  const [warehouseAddress, setWarehouseAddress] = useState("");
  const [savingWarehouse, setSavingWarehouse] = useState(false);

  // modal: registrar movimiento
  const [showMovementForm, setShowMovementForm] = useState(false);
  const [movementWarehouseId, setMovementWarehouseId] = useState("");
  const [movementProductId, setMovementProductId] = useState("");
  const [movementType, setMovementType] = useState("ENTRADA");
  const [movementQuantity, setMovementQuantity] = useState("");
  const [movementReference, setMovementReference] = useState("");
  const [savingMovement, setSavingMovement] = useState(false);

  // modal: historial de movimientos de una fila puntual
  const [historyFor, setHistoryFor] = useState<InventoryItem | null>(null);
  const [historyItems, setHistoryItems] = useState<StockMovement[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // ------------------------------------------------------------
  // CARGA DE DATOS
  // ------------------------------------------------------------

  async function loadWarehouses() {
    const response = await fetch(`${API_URL}/stock/warehouses`, {
      headers: authHeaders(),
    });
    if (!response.ok) return;
    setWarehouses(await response.json());
  }

  async function loadProducts() {
    const response = await fetch(`${API_URL}/products`, {
      headers: authHeaders(),
    });
    if (!response.ok) return;
    const data: ProductLite[] = await response.json();
    setProducts(data);
  }

  async function loadInventory() {
    setLoading(true);
    try {
      const params =
        selectedWarehouse !== "all"
          ? `?warehouse_id=${selectedWarehouse}`
          : "";

      const response = await fetch(
        `${API_URL}/stock/inventory${params}`,
        { headers: authHeaders() }
      );

      if (response.status === 401) {
        throw new Error("Sesión no válida o expirada");
      }
      if (!response.ok) {
        throw new Error(`No se pudo cargar el inventario (${response.status})`);
      }

      setInventory(await response.json());
    } catch (error) {
      console.error("Error cargando inventario:", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadWarehouses();
    loadProducts();
  }, []);

  useEffect(() => {
    loadInventory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWarehouse]);

  // ------------------------------------------------------------
  // HELPERS DE NOMBRES
  // ------------------------------------------------------------

  function productLabel(productId: number) {
    const product = products.find((p) => p.id === productId);
    if (!product) return `Producto #${productId}`;
    return product.sku ? `${product.name} (${product.sku})` : product.name;
  }

  function warehouseLabel(warehouseId: number) {
    const warehouse = warehouses.find((w) => w.id === warehouseId);
    return warehouse ? warehouse.name : `Depósito #${warehouseId}`;
  }

  // ------------------------------------------------------------
  // DEPÓSITOS
  // ------------------------------------------------------------

  function openWarehouseForm() {
    setWarehouseName("");
    setWarehouseAddress("");
    setShowWarehouseForm(true);
  }

  async function saveWarehouse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingWarehouse(true);

    try {
      const response = await fetch(`${API_URL}/stock/warehouses`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify({
          name: warehouseName,
          address: warehouseAddress || null,
        }),
      });

      if (!response.ok) {
        throw new Error(`No se pudo crear el depósito (${response.status})`);
      }

      setShowWarehouseForm(false);
      await loadWarehouses();
    } catch (error) {
      console.error("Error creando depósito:", error);
      alert("No se pudo crear el depósito.");
    } finally {
      setSavingWarehouse(false);
    }
  }

  // ------------------------------------------------------------
  // MOVIMIENTOS
  // ------------------------------------------------------------

  function openMovementForm(item?: InventoryItem) {
    setMovementWarehouseId(
      item ? String(item.warehouse_id) : warehouses[0]?.id ? String(warehouses[0].id) : ""
    );
    setMovementProductId(
      item ? String(item.product_id) : products[0]?.id ? String(products[0].id) : ""
    );
    setMovementType("ENTRADA");
    setMovementQuantity("");
    setMovementReference("");
    setShowMovementForm(true);
  }

  async function saveMovement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingMovement(true);

    try {
      const response = await fetch(`${API_URL}/stock/movements`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify({
          warehouse_id: Number(movementWarehouseId),
          product_id: Number(movementProductId),
          movement_type: movementType,
          quantity: Number(movementQuantity),
          reference: movementReference || null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || `No se pudo registrar el movimiento (${response.status})`);
      }

      setShowMovementForm(false);
      await loadInventory();
    } catch (error) {
      console.error("Error registrando movimiento:", error);
      alert(
        error instanceof Error
          ? error.message
          : "No se pudo registrar el movimiento."
      );
    } finally {
      setSavingMovement(false);
    }
  }

  // ------------------------------------------------------------
  // HISTORIAL
  // ------------------------------------------------------------

  async function openHistory(item: InventoryItem) {
    setHistoryFor(item);
    setLoadingHistory(true);

    try {
      const response = await fetch(
        `${API_URL}/stock/movements?warehouse_id=${item.warehouse_id}&product_id=${item.product_id}`,
        { headers: authHeaders() }
      );
      if (!response.ok) throw new Error("No se pudo cargar el historial");
      setHistoryItems(await response.json());
    } catch (error) {
      console.error("Error cargando historial:", error);
      setHistoryItems([]);
    } finally {
      setLoadingHistory(false);
    }
  }

  function closeHistory() {
    setHistoryFor(null);
    setHistoryItems([]);
  }

  // ------------------------------------------------------------
  // FILTRADO
  // ------------------------------------------------------------

  const filteredInventory = inventory.filter((item) => {
    const searchText = search.toLowerCase().trim();
    if (!searchText) return true;
    return productLabel(item.product_id).toLowerCase().includes(searchText);
  });

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <section className="products-page">
      {/* HEADER */}
      <div className="products-header">
        <div>
          <span className="dashboard-eyebrow">INVENTARIO</span>
          <h1>Stock</h1>
          <p>Controlá el stock por depósito y el historial de movimientos.</p>
        </div>

        <div className="products-header-actions">
          <button
            className="secondary-button"
            type="button"
            onClick={openWarehouseForm}
          >
            + Nuevo depósito
          </button>

          <button
            className="primary-button"
            type="button"
            onClick={() => openMovementForm()}
            disabled={warehouses.length === 0 || products.length === 0}
          >
            + Registrar movimiento
          </button>
        </div>
      </div>

      {/* PESTAÑAS */}
      <div className="vx-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "inventario"} className={tab === "inventario" ? "is-on" : ""} onClick={() => setTab("inventario")}>Inventario</button>
        <button type="button" role="tab" aria-selected={tab === "reposicion"} className={tab === "reposicion" ? "is-on" : ""} onClick={() => setTab("reposicion")}>Reposición</button>
      </div>

      {tab === "reposicion" && <Reposicion warehouses={warehouses} />}

      {tab === "inventario" && (
      <>
      {/* TOOLBAR */}
      <div className="products-toolbar">
        <div className="products-search">
          <span className="products-search-icon">⌕</span>
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar producto..."
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

        <select
          value={selectedWarehouse}
          onChange={(event) =>
            setSelectedWarehouse(
              event.target.value === "all"
                ? "all"
                : Number(event.target.value)
            )
          }
        >
          <option value="all">Todos los depósitos</option>
          {warehouses.map((warehouse) => (
            <option key={warehouse.id} value={warehouse.id}>
              {warehouse.name}
            </option>
          ))}
        </select>

        <div className="products-count">
          {filteredInventory.length}{" "}
          {filteredInventory.length === 1 ? "registro" : "registros"}
        </div>
      </div>

      {/* TABLA */}
      <div className="products-table-container">
        {loading ? (
          <div className="products-loading">
            <div className="products-loading-spinner" />
            <span>Cargando inventario...</span>
          </div>
        ) : warehouses.length === 0 ? (
          <div className="products-empty">
            <div className="products-empty-icon">◯</div>
            <h3>Todavía no hay depósitos</h3>
            <p>Creá tu primer depósito para empezar a cargar stock.</p>
            <button className="primary-button" onClick={openWarehouseForm}>
              + Nuevo depósito
            </button>
          </div>
        ) : filteredInventory.length === 0 ? (
          <div className="products-empty">
            <div className="products-empty-icon">◯</div>
            <h3>No hay stock cargado</h3>
            <p>Registrá una ENTRADA para empezar a ver inventario acá.</p>
          </div>
        ) : (
          <div className="products-table-wrapper">
            <table className="products-table">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Depósito</th>
                  <th>Físico</th>
                  <th>Reservado</th>
                  <th>Disponible</th>
                  <th>Mínimo</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredInventory.map((item) => {
                  const belowMin =
                    item.min_stock !== null &&
                    item.quantity <= item.min_stock;

                  return (
                    <tr key={item.id}>
                      <td>
                        <div className="product-name">
                          {productLabel(item.product_id)}
                        </div>
                      </td>
                      <td>{warehouseLabel(item.warehouse_id)}</td>
                      <td>
                        <span
                          className={
                            belowMin ? "stock-low" : "stock-normal"
                          }
                        >
                          {item.quantity}
                        </span>
                      </td>
                      <td>{item.reserved_quantity}</td>
                      <td>{item.available}</td>
                      <td>
                        <input
                          key={`${item.id}-${item.min_stock ?? ""}`}
                          className="vx-input vx-input-sm"
                          type="number"
                          min={0}
                          step="1"
                          defaultValue={item.min_stock ?? ""}
                          placeholder="—"
                          title="Stock mínimo: cuando el disponible llega a este número, aparece en Reposición"
                          aria-label={`Stock mínimo de ${productLabel(item.product_id)}`}
                          onBlur={(event) => saveMinStock(item, event.target.value)}
                        />
                      </td>
                      <td>
                        <div className="product-actions">
                          <button
                            type="button"
                            className="product-action-edit"
                            onClick={() => openMovementForm(item)}
                          >
                            Movimiento
                          </button>
                          <button
                            type="button"
                            className="product-action-edit"
                            onClick={() => openHistory(item)}
                          >
                            Historial
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </>
      )}

      {/* MODAL: NUEVO DEPÓSITO */}
      {showWarehouseForm && (
        <div
          className="modal-overlay"
          onClick={() => setShowWarehouseForm(false)}
        >
          <div
            className="product-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <span className="dashboard-eyebrow">STOCK</span>
                <h2>Nuevo depósito</h2>
              </div>
              <button
                className="modal-close"
                type="button"
                onClick={() => setShowWarehouseForm(false)}
              >
                ×
              </button>
            </div>

            <form onSubmit={saveWarehouse} className="product-form">
              <div className="form-group">
                <label>Nombre</label>
                <input
                  type="text"
                  value={warehouseName}
                  onChange={(event) => setWarehouseName(event.target.value)}
                  placeholder="Ej. Depósito Central"
                  required
                />
              </div>

              <div className="form-group">
                <label>Dirección</label>
                <input
                  type="text"
                  value={warehouseAddress}
                  onChange={(event) =>
                    setWarehouseAddress(event.target.value)
                  }
                  placeholder="Opcional"
                />
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setShowWarehouseForm(false)}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="primary-button"
                  disabled={savingWarehouse}
                >
                  {savingWarehouse ? "Guardando..." : "Guardar depósito"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: REGISTRAR MOVIMIENTO */}
      {showMovementForm && (
        <div
          className="modal-overlay"
          onClick={() => setShowMovementForm(false)}
        >
          <div
            className="product-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <span className="dashboard-eyebrow">STOCK</span>
                <h2>Registrar movimiento</h2>
              </div>
              <button
                className="modal-close"
                type="button"
                onClick={() => setShowMovementForm(false)}
              >
                ×
              </button>
            </div>

            <form onSubmit={saveMovement} className="product-form">
              <div className="form-row">
                <div className="form-group">
                  <label>Depósito</label>
                  <select
                    value={movementWarehouseId}
                    onChange={(event) =>
                      setMovementWarehouseId(event.target.value)
                    }
                    required
                  >
                    {warehouses.map((warehouse) => (
                      <option key={warehouse.id} value={warehouse.id}>
                        {warehouse.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Producto</label>
                  <select
                    value={movementProductId}
                    onChange={(event) =>
                      setMovementProductId(event.target.value)
                    }
                    required
                  >
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Tipo de movimiento</label>
                  <select
                    value={movementType}
                    onChange={(event) => setMovementType(event.target.value)}
                    required
                  >
                    {MOVEMENT_TYPES.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Cantidad</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={movementQuantity}
                    onChange={(event) =>
                      setMovementQuantity(event.target.value)
                    }
                    placeholder={
                      movementType === "AJUSTE"
                        ? "Cantidad final tras el conteo"
                        : "Cantidad"
                    }
                    required
                  />
                </div>
              </div>

              {movementType === "AJUSTE" && (
                <p className="import-description">
                  En un AJUSTE, la cantidad ingresada reemplaza el stock
                  actual — no se suma ni se resta.
                </p>
              )}

              <div className="form-group">
                <label>Referencia / motivo</label>
                <input
                  type="text"
                  value={movementReference}
                  onChange={(event) =>
                    setMovementReference(event.target.value)
                  }
                  placeholder="Opcional"
                />
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setShowMovementForm(false)}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="primary-button"
                  disabled={savingMovement}
                >
                  {savingMovement ? "Guardando..." : "Registrar movimiento"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: HISTORIAL */}
      {historyFor && (
        <div className="modal-overlay" onClick={closeHistory}>
          <div
            className="product-import-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <span className="dashboard-eyebrow">HISTORIAL</span>
                <h2>
                  {productLabel(historyFor.product_id)} —{" "}
                  {warehouseLabel(historyFor.warehouse_id)}
                </h2>
              </div>
              <button
                className="modal-close"
                type="button"
                onClick={closeHistory}
              >
                ×
              </button>
            </div>

            {loadingHistory ? (
              <div className="products-loading">
                <div className="products-loading-spinner" />
                <span>Cargando historial...</span>
              </div>
            ) : historyItems.length === 0 ? (
              <div className="products-empty">
                <p>Todavía no hay movimientos registrados.</p>
              </div>
            ) : (
              <div className="import-table-wrapper">
                <table className="import-table">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Tipo</th>
                      <th>Cantidad</th>
                      <th>Antes</th>
                      <th>Después</th>
                      <th>Referencia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyItems.map((movement) => (
                      <tr key={movement.id}>
                        <td>
                          {new Date(movement.created_at).toLocaleString(
                            "es-AR"
                          )}
                        </td>
                        <td>{statusLabel(movement.movement_type)}</td>
                        <td>{movement.quantity}</td>
                        <td>{movement.previous_qty}</td>
                        <td>{movement.new_qty}</td>
                        <td>{movement.reference || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

export default Stock;