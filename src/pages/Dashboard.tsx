import { useEffect, useState } from "react";
import { statusLabel } from "../extras";
import { useNavigate } from "react-router-dom";
import PendingPanel from "../components/PendingPanel";
import { API_URL } from "../apiBase";
import { fmtMoney } from "../money";

interface DashboardStats {
  products: number;
  sales_today: number;
  invoiced_today: number;
  pos_today: number;
  pending_orders: number;
  pending_deliveries: number;
  low_stock_count: number;
  accounts_receivable: number;
  pending_purchases: number;
  cash_session_open: boolean;
  cash_session: {
    opening_amount: number;
    opening_at: string;
    cash_sales_so_far: number;
  } | null;
}

// Estados que manda el backend, traducidos para mostrar
const STATUS_ES: Record<string, string> = {
  pending: "Pendiente", completed: "Completado", issued: "Emitida", paid: "Pagado",
  cancelled: "Cancelado", canceled: "Cancelado", confirmed: "Confirmado", delivered: "Entregado",
  dispatched: "Despachado", draft: "Borrador", received: "Recibido", open: "Abierta", closed: "Cerrada",
};

interface ActivityItem {
  type: "order" | "invoice" | "payment" | "sale" | "purchase";
  title: string;
  description: string;
  status: string;
  created_at: string;
}


function authHeaders() {
  const token = localStorage.getItem("velora_token");
  return { Authorization: `Bearer ${token}` };
}

interface Command {
  title: string;
  description: string;
  path: string;
  icon: string;
  keywords: string;
}

const COMMANDS: Command[] = [
  {
    title: "Nueva factura",
    description: "Facturación",
    path: "/invoices",
    icon: "🧾",
    keywords: "factura facturar facturacion comprobante arca afip cae iva nota credito debito emitir cobrar",
  },
  {
    title: "Vender (POS)",
    description: "Punto de venta",
    path: "/pos",
    icon: "🛒",
    keywords: "vender venta pos mostrador cobrar caja registradora rapida ticket",
  },
  {
    title: "Caja",
    description: "Apertura, cierre y arqueo",
    path: "/cash",
    icon: "💵",
    keywords: "caja abrir cerrar arqueo efectivo apertura cierre ingreso egreso",
  },
  {
    title: "Nuevo pedido",
    description: "Pedidos",
    path: "/orders",
    icon: "▣",
    keywords: "pedido pedidos vender cliente reservar programar envio retiro",
  },
  {
    title: "Entregas",
    description: "Por enviar, en camino, entregados",
    path: "/deliveries",
    icon: "🚚",
    keywords: "entrega entregas envio reparto remito repartidor despachar",
  },
  {
    title: "Nueva compra",
    description: "Compras a proveedores",
    path: "/purchases",
    icon: "📦",
    keywords: "compra comprar proveedor reponer reposicion recibir mercaderia",
  },
  {
    title: "Proveedores",
    description: "Administrar proveedores",
    path: "/suppliers",
    icon: "🚚",
    keywords: "proveedor proveedores contacto abastecimiento",
  },
  {
    title: "Clientes",
    description: "Administrar clientes",
    path: "/customers",
    icon: "👥",
    keywords: "cliente clientes alta contacto",
  },
  {
    title: "Productos",
    description: "Catálogo de productos",
    path: "/products",
    icon: "◻",
    keywords: "producto productos catalogo precio sku importar excel",
  },
  {
    title: "Stock",
    description: "Depósitos, inventario y movimientos",
    path: "/stock",
    icon: "◈",
    keywords: "stock inventario deposito movimiento ajuste reserva entrada salida",
  },
  {
    title: "Cuentas corrientes",
    description: "Saldos y pagos",
    path: "/accounts",
    icon: "💳",
    keywords: "pago pagos cuenta corriente saldo cobrar deuda credito cliente debe",
  },
  {
    title: "Reportes",
    description: "Ventas, stock y clientes",
    path: "/reports",
    icon: "📊",
    keywords: "reporte reportes estadistica informe ventas stock bajo top productos clientes",
  },
  {
    title: "Configuración",
    description: "Datos de la empresa",
    path: "/settings",
    icon: "⚙",
    keywords: "configuracion empresa ajustes datos moneda",
  },
  {
    title: "Listas de precios",
    description: "Precios por cliente (mayorista, minorista…)",
    path: "/products?tab=listas",
    icon: "🏷",
    keywords: "lista listas precios mayorista minorista revendedor descuento cliente",
  },
  {
    title: "Actualizar precios",
    description: "Aumento o baja masiva con vista previa",
    path: "/products?tab=masiva",
    icon: "％",
    keywords: "actualizar aumentar subir bajar precios masivo masiva porcentaje inflacion costo redondeo",
  },
  {
    title: "Reposición",
    description: "Qué falta y cuánto comprar",
    path: "/stock?tab=reposicion",
    icon: "↻",
    keywords: "reposicion reponer minimo stock bajo falta comprar sugerido orden de compra",
  },
  {
    title: "Vendedores",
    description: "Ventas por vendedor y comisiones",
    path: "/sellers",
    icon: "🧑‍💼",
    keywords: "vendedor vendedores comision comisiones liquidacion liquidar ranking",
  },
];

function searchCommands(query: string): Command[] {
  const q = query.toLowerCase().trim();
  if (!q) return [];
  const terms = q.split(/\s+/);

  return COMMANDS.map((cmd) => {
    const haystack = `${cmd.title} ${cmd.description} ${cmd.keywords}`.toLowerCase();
    const score = terms.filter((term) => haystack.includes(term)).length;
    return { cmd, score };
  })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((r) => r.cmd)
    .slice(0, 6);
}

const ACTIVITY_ICON: Record<string, string> = {
  order: "▣",
  invoice: "🧾",
  payment: "💳",
  sale: "🛒",
  purchase: "📦",
};

function Dashboard() {
  const navigate = useNavigate();

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const userData = localStorage.getItem("velora_user");
  const user = userData ? JSON.parse(userData) : null;

  function greeting() {
    const hour = new Date().getHours();
    if (hour < 12) return "Buenos días";
    if (hour < 19) return "Buenas tardes";
    return "Buenas noches";
  }

  async function loadDashboard() {
    setLoading(true);
    try {
      const [statsRes, activityRes] = await Promise.all([
        fetch(`${API_URL}/dashboard/stats`, { headers: authHeaders() }),
        fetch(`${API_URL}/dashboard/activity`, { headers: authHeaders() }),
      ]);
      if (statsRes.ok) setStats(await statsRes.json());
      if (activityRes.ok) setActivity(await activityRes.json());
    } catch (error) {
      console.error("Error cargando dashboard:", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDashboard();
  }, []);

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <div>
          <span className="dashboard-eyebrow">RESUMEN</span>
          <h1>{greeting()}, {user?.name || "Administrador"}</h1>
          <p>Esto es lo que está pasando hoy en tu negocio.</p>
        </div>
      </div>

      {/* PENDIENTES: lo que requiere acción hoy */}
      <PendingPanel />

      {/* BUSCADOR INTELIGENTE */}
      <div style={{ position: "relative", maxWidth: 520, marginBottom: 24 }}>
        <div className="products-search" style={{ width: "100%" }}>
          <span className="products-search-icon">⌕</span>
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                const results = searchCommands(search);
                if (results[0]) {
                  navigate(results[0].path);
                  setSearch("");
                }
              }
            }}
            placeholder='Buscá algo, ej: "hacer factura", "abrir caja", "stock bajo"...'
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
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 6px)",
              left: 0,
              right: 0,
              background: "#fffdf9",
              border: "1px solid #e4dbd0",
              borderRadius: 15,
              boxShadow: "0 20px 50px -20px rgba(36,31,27,0.25)",
              zIndex: 20,
              overflow: "hidden",
            }}
          >
            {searchCommands(search).length === 0 ? (
              <div style={{ padding: 16, fontSize: 12, color: "#9a8b7d" }}>
                No encontramos nada para "{search}".
              </div>
            ) : (
              searchCommands(search).map((cmd) => (
                <button
                  key={cmd.path}
                  type="button"
                  onClick={() => {
                    navigate(cmd.path);
                    setSearch("");
                  }}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "12px 16px",
                    border: "none",
                    borderBottom: "1px solid #eee7df",
                    background: "transparent",
                    textAlign: "left",
                    cursor: "pointer",
                  }}
                >
                  <span style={{ fontSize: 16 }}>{cmd.icon}</span>
                  <span>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#241f1b" }}>
                      {cmd.title}
                    </div>
                    <div style={{ fontSize: 11, color: "#9a8b7d" }}>{cmd.description}</div>
                  </span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {loading || !stats ? (
        <div className="products-loading">
          <div className="products-loading-spinner" />
          <span>Cargando...</span>
        </div>
      ) : (
        <>
          {/* ESTADO DE CAJA — lo primero, porque condiciona si se puede vender */}
          <div
            className="dashboard-section"
            style={{
              marginBottom: 20,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 14,
            }}
          >
            <div>
              <span className="dashboard-eyebrow">
                {stats.cash_session_open ? "CAJA ABIERTA" : "CAJA CERRADA"}
              </span>
              {stats.cash_session_open && stats.cash_session ? (
                <p style={{ marginTop: 6, fontSize: 13, color: "#5f554d" }}>
                  Apertura: {fmtMoney(stats.cash_session.opening_amount)} ·
                  {" "}Ventas en efectivo hoy: {fmtMoney(stats.cash_session.cash_sales_so_far)}
                </p>
              ) : (
                <p style={{ marginTop: 6, fontSize: 13, color: "#9a8b7d" }}>
                  Abrí la caja para poder vender desde el POS.
                </p>
              )}
            </div>
            <button className="primary-button" onClick={() => navigate("/cash")}>
              {stats.cash_session_open ? "Ir a Caja" : "Abrir caja"}
            </button>
          </div>

          {/* CARDS PRINCIPALES */}
          <div className="dashboard-cards">
            <div className="dashboard-card">
              <div className="dashboard-card-top">
                <span>Ventas de hoy</span>
                <div className="dashboard-card-icon">$</div>
              </div>
              <strong>{fmtMoney(stats.sales_today)}</strong>
              <small>Facturado {fmtMoney(stats.invoiced_today)} + POS {fmtMoney(stats.pos_today)}</small>
            </div>

            <div className="dashboard-card" style={{ cursor: "pointer" }} onClick={() => navigate("/orders")}>
              <div className="dashboard-card-top">
                <span>Pedidos pendientes</span>
                <div className="dashboard-card-icon">▣</div>
              </div>
              <strong>{stats.pending_orders}</strong>
              <small>Esperando confirmación, envío o entrega</small>
            </div>

            <div className="dashboard-card" style={{ cursor: "pointer" }} onClick={() => navigate("/deliveries")}>
              <div className="dashboard-card-top">
                <span>Entregas pendientes</span>
                <div className="dashboard-card-icon">🚚</div>
              </div>
              <strong>{stats.pending_deliveries}</strong>
              <small>Pedidos con envío por resolver</small>
            </div>

            <div className="dashboard-card">
              <div className="dashboard-card-top">
                <span>Productos activos</span>
                <div className="dashboard-card-icon">◈</div>
              </div>
              <strong>{stats.products}</strong>
            </div>
          </div>

          <div className="dashboard-cards">
            <div
              className="dashboard-card"
              style={{ cursor: "pointer" }}
              onClick={() => navigate("/reports")}
            >
              <div className="dashboard-card-top">
                <span>Stock bajo</span>
                <div className="dashboard-card-icon">⚠</div>
              </div>
              <strong style={{ color: stats.low_stock_count > 0 ? "#a05c50" : undefined }}>
                {stats.low_stock_count}
              </strong>
              <small>Productos en o bajo su mínimo</small>
            </div>

            <div
              className="dashboard-card"
              style={{ cursor: "pointer" }}
              onClick={() => navigate("/accounts")}
            >
              <div className="dashboard-card-top">
                <span>Cuentas por cobrar</span>
                <div className="dashboard-card-icon">💳</div>
              </div>
              <strong>{fmtMoney(stats.accounts_receivable)}</strong>
              <small>Saldo pendiente de clientes</small>
            </div>

            <div
              className="dashboard-card"
              style={{ cursor: "pointer" }}
              onClick={() => navigate("/purchases")}
            >
              <div className="dashboard-card-top">
                <span>Compras pendientes</span>
                <div className="dashboard-card-icon">📦</div>
              </div>
              <strong>{stats.pending_purchases}</strong>
              <small>Esperando recepción de mercadería</small>
            </div>

            <div
              className="dashboard-card"
              style={{ cursor: "pointer" }}
              onClick={() => navigate("/invoices")}
            >
              <div className="dashboard-card-top">
                <span>Facturación de hoy</span>
                <div className="dashboard-card-icon">🧾</div>
              </div>
              <strong>{fmtMoney(stats.invoiced_today)}</strong>
            </div>
          </div>

          {/* ACCESOS RÁPIDOS */}
          <div className="dashboard-section" style={{ marginBottom: 20 }}>
            <div className="section-heading">
              <h2>Accesos rápidos</h2>
            </div>
            <div className="product-actions" style={{ justifyContent: "flex-start", flexWrap: "wrap", gap: 10 }}>
              <button className="primary-button" onClick={() => navigate("/pos")}>+ Vender</button>
              <button className="secondary-button" onClick={() => navigate("/orders")}>+ Nuevo pedido</button>
              <button className="secondary-button" onClick={() => navigate("/invoices")}>+ Nueva factura</button>
              <button className="secondary-button" onClick={() => navigate("/purchases")}>+ Nueva compra</button>
              <button className="secondary-button" onClick={() => navigate("/reports")}>Ver reportes</button>
            </div>
          </div>

          {/* ACTIVIDAD RECIENTE */}
          <div className="dashboard-section">
            <div className="section-heading">
              <h2>Actividad reciente</h2>
              <p>Los últimos movimientos de tu negocio.</p>
            </div>

            {activity.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">◯</div>
                <h3>Todavía no hay actividad</h3>
                <p>Cuando registres pedidos, ventas o facturas, van a aparecer acá.</p>
              </div>
            ) : (
              <div className="activity-list">
                {activity.map((item, index) => (
                  <div className="activity-item" key={index}>
                    <span className="activity-indicator" />
                    <div className="activity-content">
                      <strong>
                        {ACTIVITY_ICON[item.type]} {item.title}
                      </strong>
                      <span>{item.description}</span>
                    </div>
                    <span className={`activity-status st-${String(item.status).toLowerCase()}`}>{STATUS_ES[String(item.status).toLowerCase()] || statusLabel(String(item.status))}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default Dashboard;