import { useEffect, useState } from "react";
import { api, money } from "../extras";
import type { CustomerDebt, PriceQuote, SellerOptions } from "../extras";
import { API_URL } from "../apiBase";
import { fmtMoney } from "../money";

interface ProductLite {
  id: number;
  name: string;
  sku: string | null;
  price: number;
  tax_rate: number;
}

interface CustomerLite {
  id: number;
  name: string;
  seller_id?: number | null;
}

interface WarehouseLite {
  id: number;
  name: string;
}

interface CartItem {
  product_id: number;
  name: string;
  quantity: number;
  unit_price: number;
}


function authHeaders() {
  const token = localStorage.getItem("velora_token");
  return { Authorization: `Bearer ${token}` };
}

function POS() {
  const [hasCashSession, setHasCashSession] = useState<boolean | null>(null);

  const [products, setProducts] = useState<ProductLite[]>([]);
  const [customers, setCustomers] = useState<CustomerLite[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseLite[]>([]);

  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("EFECTIVO");
  const [posnetConfirmed, setPosnetConfirmed] = useState(false);
  const [charging, setCharging] = useState(false);

  // precios de la lista del cliente, aviso de deuda y vendedor
  const [quote, setQuote] = useState<PriceQuote | null>(null);
  const [customerDebt, setCustomerDebt] = useState<CustomerDebt | null>(null);
  const [sellerOptions, setSellerOptions] = useState<SellerOptions>({ enabled: false, sellers: [], my_seller_id: null });
  const [sellerId, setSellerId] = useState("");

  async function checkCashSession() {
    const response = await fetch(`${API_URL}/cash-sessions/current`, {
      headers: authHeaders(),
    });
    setHasCashSession(response.ok);
  }

  async function loadProducts() {
    const response = await fetch(`${API_URL}/products`, { headers: authHeaders() });
    if (!response.ok) return;
    setProducts(await response.json());
  }

  async function loadCustomers() {
    const response = await fetch(`${API_URL}/customers`, { headers: authHeaders() });
    if (!response.ok) return;
    setCustomers(await response.json());
  }

  async function loadWarehouses() {
    const response = await fetch(`${API_URL}/stock/warehouses`, { headers: authHeaders() });
    if (!response.ok) return;
    const data: WarehouseLite[] = await response.json();
    setWarehouses(data);
    if (data[0]) setWarehouseId(String(data[0].id));
  }

  useEffect(() => {
    checkCashSession();
    loadProducts();
    loadCustomers();
    loadWarehouses();
    api<SellerOptions>("/sellers/options")
      .then((options) => {
        setSellerOptions(options);
        if (options.my_seller_id) setSellerId(String(options.my_seller_id));
      })
      .catch(() => undefined);
  }, []);

  // Al elegir el cliente: se cargan los precios de su lista y se actualiza el carrito
  useEffect(() => {
    let cancelled = false;
    setCustomerDebt(null);
    if (!customerId) {
      setQuote(null);
      setCart((current) =>
        current.map((item) => {
          const product = products.find((p) => p.id === item.product_id);
          return product ? { ...item, unit_price: product.price } : item;
        })
      );
      return;
    }
    api<PriceQuote>(`/pricing/quote?customer_id=${customerId}`)
      .then((data) => {
        if (cancelled) return;
        setQuote(data);
        setCart((current) =>
          current.map((item) => {
            const listed = data.prices[String(item.product_id)];
            return listed !== undefined ? { ...item, unit_price: listed } : item;
          })
        );
      })
      .catch(() => undefined);
    api<CustomerDebt>(`/customers/${customerId}/debt`)
      .then((data) => { if (!cancelled) setCustomerDebt(data); })
      .catch(() => undefined);
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  /** Precio del producto para el cliente elegido (el de su lista, o el base). */
  function priceFor(product: ProductLite): number {
    const listed = quote?.prices[String(product.id)];
    return listed !== undefined ? listed : product.price;
  }

  function chooseCustomer(value: string) {
    setCustomerId(value);
    if (!sellerOptions.enabled) return;
    const customer = customers.find((c) => c.id === Number(value));
    const id = customer?.seller_id || sellerOptions.my_seller_id;
    setSellerId(id && sellerOptions.sellers.some((seller) => seller.id === id) ? String(id) : "");
  }

  const filteredProducts = products.filter((product) => {
    const searchText = search.toLowerCase().trim();
    if (!searchText) return false; // no mostrar todo el catálogo de una, solo al buscar
    return (
      product.name.toLowerCase().includes(searchText) ||
      (product.sku || "").toLowerCase().includes(searchText)
    );
  });

  function addToCart(product: ProductLite) {
    setCart((current) => {
      const existing = current.find((item) => item.product_id === product.id);
      if (existing) {
        return current.map((item) =>
          item.product_id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [
        ...current,
        {
          product_id: product.id,
          name: product.name,
          quantity: 1,
          unit_price: priceFor(product),
        },
      ];
    });
    setSearch("");
  }

  function updateQuantity(productId: number, quantity: number) {
    if (quantity <= 0) {
      setCart((current) => current.filter((item) => item.product_id !== productId));
      return;
    }
    setCart((current) =>
      current.map((item) =>
        item.product_id === productId ? { ...item, quantity } : item
      )
    );
  }

  function removeFromCart(productId: number) {
    setCart((current) => current.filter((item) => item.product_id !== productId));
  }

  const total = cart.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);

  async function checkout() {
    if (cart.length === 0) {
      alert("Agregá al menos un producto.");
      return;
    }
    if (!warehouseId) {
      alert("Elegí un depósito.");
      return;
    }

    setCharging(true);
    try {
      const response = await fetch(`${API_URL}/pos/sale`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify({
          warehouse_id: Number(warehouseId),
          customer_id: customerId ? Number(customerId) : null,
          payment_method: paymentMethod,
          // sin precio manual: el servidor aplica la lista de precios del cliente (la misma que se ve acá)
          items: cart.map((item) => ({
            product_id: item.product_id,
            quantity: item.quantity,
          })),
          ...(sellerOptions.enabled ? { seller_id: sellerId ? Number(sellerId) : null } : {}),
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "No se pudo completar la venta");
      }

      setCart([]);
      chooseCustomer("");
      alert(`Venta #${data.id} completada. Total: ${fmtMoney(data.total, "fixed")}`);
    } catch (error) {
      console.error("Error en la venta:", error);
      alert(error instanceof Error ? error.message : "No se pudo completar la venta.");
    } finally {
      setCharging(false);
    }
  }

  if (hasCashSession === false) {
    return (
      <section className="products-page">
        <div className="products-empty" style={{ minHeight: 400 }}>
          <div className="products-empty-icon">◯</div>
          <h3>La caja está cerrada</h3>
          <p>Necesitás abrir la caja antes de poder vender. Andá a la sección Caja.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="products-page">
      <div className="products-header">
        <div>
          <span className="dashboard-eyebrow">PUNTO DE VENTA</span>
          <h1>Vender</h1>
          <p>Buscá productos, armá el carrito y cobrá.</p>
        </div>
      </div>

      <div className="vl-pos-grid">
        {/* BÚSQUEDA */}
        <div>
          <div className="products-search" style={{ width: "100%", marginBottom: 14 }}>
            <span className="products-search-icon">⌕</span>
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={async (event) => {
                if (event.key !== "Enter") return;
                const response = await fetch(
                  `${API_URL}/products?search=${encodeURIComponent(search)}`,
                  { headers: authHeaders() }
                );
                const products = await response.json();
                const exact = products.find(
                  (product: any) => product.barcode === search.trim()
                );
                if (exact) addToCart(exact);
              }}
              placeholder="Buscar producto por nombre o SKU..."
              autoFocus
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

          {search && (
            <div className="products-table-container">
              {filteredProducts.length === 0 ? (
                <div className="products-empty">
                  <p>No se encontraron productos.</p>
                </div>
              ) : (
                <div className="products-table-wrapper">
                  <table className="products-table">
                    <tbody>
                      {filteredProducts.slice(0, 10).map((product) => (
                        <tr key={product.id}>
                          <td>
                            <div className="product-name">{product.name}</div>
                            {product.sku && (
                              <div className="product-description">{product.sku}</div>
                            )}
                          </td>
                          <td>
                            <span className="product-price">
                              {quote?.list && priceFor(product) !== product.price && (
                                <span className="vx-old-price">{fmtMoney(product.price, "fixed")}</span>
                              )}
                              {fmtMoney(priceFor(product), "fixed")}
                            </span>
                          </td>
                          <td>
                            <button
                              type="button"
                              className="primary-button"
                              onClick={() => addToCart(product)}
                            >
                              + Agregar
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* CARRITO */}
        <div className="dashboard-section">
          <div className="section-heading">
            <h2>Carrito</h2>
          </div>

          {cart.length === 0 ? (
            <p style={{ color: "#9a8b7d", fontSize: 12 }}>
              Todavía no agregaste productos.
            </p>
          ) : (
            <div className="import-table-wrapper" style={{ marginBottom: 16 }}>
              <table className="import-table">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>Cant.</th>
                    <th>Subtotal</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {cart.map((item) => (
                    <tr key={item.product_id}>
                      <td>{item.name}</td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={item.quantity}
                          onChange={(event) =>
                            updateQuantity(item.product_id, Number(event.target.value))
                          }
                          style={{ width: 60 }}
                        />
                      </td>
                      <td>{fmtMoney(item.unit_price * item.quantity, "fixed")}</td>
                      <td>
                        <button
                          type="button"
                          className="import-remove-button"
                          onClick={() => removeFromCart(item.product_id)}
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p style={{ textAlign: "right", fontSize: 20, fontWeight: 700, marginBottom: 16 }}>
            Total: {fmtMoney(total, "fixed")}
          </p>

          <div className="form-group">
            <label>Cliente (opcional)</label>
            <select
              value={customerId}
              onChange={(event) => chooseCustomer(event.target.value)}
            >
              <option value="">Consumidor final</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>
          </div>

          {quote?.list && (
            <div className="vx-note is-info vx-inline-note">
              <span>
                <strong>Lista: {quote.list.name}</strong>
                {quote.list.kind === "PERCENT" && quote.list.percent !== 0
                  ? ` · ${quote.list.percent > 0 ? "+" : "−"}${Math.abs(quote.list.percent)}%`
                  : ""}
                . El carrito ya tiene los precios de este cliente.
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
                {" "}Podés venderle igual.
              </span>
            </div>
          )}

          {sellerOptions.enabled && (
            <div className="form-group">
              <label>Vendedor</label>
              <select value={sellerId} onChange={(event) => setSellerId(event.target.value)}>
                <option value="">Sin vendedor</option>
                {sellerOptions.sellers.map((seller) => (
                  <option key={seller.id} value={seller.id}>{seller.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="form-group">
            <label>Depósito</label>
            <select
              value={warehouseId}
              onChange={(event) => setWarehouseId(event.target.value)}
            >
              {warehouses.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>
                  {warehouse.name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Forma de pago</label>
            <div className="product-actions" style={{ justifyContent: "flex-start" }}>
              {["EFECTIVO", "TARJETA", "TRANSFERENCIA"].map((method) => (
                <button
                  key={method}
                  type="button"
                  className={
                    paymentMethod === method ? "primary-button" : "secondary-button"
                  }
                  onClick={() => setPaymentMethod(method)}
                >
                  {method}
                </button>
                
              ))}
              
              <button
                type="button"
                className={paymentMethod === "POSNET" ? "primary-button" : "secondary-button"}
                onClick={() => setPaymentMethod("POSNET")}
              >
                Posnet
              </button>

              {paymentMethod === "POSNET" && (
  <label style={{ display: "flex", gap: 6, fontSize: 12, margin: "10px 0" }}>
    <input type="checkbox" checked={posnetConfirmed} onChange={(e) => setPosnetConfirmed(e.target.checked)} />
    Confirmo que el cobro se realizó en el posnet
  </label>
)}
            </div>
          </div>

          <button
            type="button"
            className="primary-button"
            onClick={checkout}
            disabled={charging || cart.length === 0}
            style={{ width: "100%", marginTop: 10 }}
          >
            {charging ? "Cobrando..." : `Cobrar ${fmtMoney(total, "fixed")}`}
          </button>
          
        </div>
      </div>
    </section>
  );
}

export default POS;