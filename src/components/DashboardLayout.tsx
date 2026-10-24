import { useEffect, useMemo, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import VeloriaChat from "./VeloriaChat";
import NotificationsBell from "./NotificationsBell";
import Icon from "./Icons";
import { SidebarSignature, VeloraLogo } from "./Brand";
import { APP_NAME, APP_TAGLINE } from "../config";
import Tour from "./tour/Tour";
import type { TourStep } from "./tour/Tour";
import { API_URL } from "../apiBase";


function authHeaders() {
  const token = localStorage.getItem("velora_token");
  return { Authorization: `Bearer ${token}` };
}

function DashboardLayout() {
  const [collapsed, setCollapsed] = useState(false);
  // en el celular el menú se abre encima de la pantalla y se cierra al elegir una opción
  const [menuOpen, setMenuOpen] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const location = useLocation();
  const navigate = useNavigate();

  const userData = localStorage.getItem("velora_user");

  const user = userData
    ? JSON.parse(userData)
    : null;
  const [enabledModules, setEnabledModules] = useState<string[] | null>(null);

useEffect(() => {
  async function loadCompanyName() {
    try {
      const response = await fetch(`${API_URL}/company`, {
        headers: authHeaders(),
      });

      if (!response.ok) {
        throw new Error("No se pudo cargar la empresa");
      }

      const data = await response.json();

      setCompanyName(data.name || "");
    } catch (error) {
      console.error("Error cargando nombre de empresa:", error);
    }
  }
  
  loadCompanyName();
}, []);  

useEffect(() => {
  fetch(`${API_URL}/company`, {
    headers: { Authorization: `Bearer ${localStorage.getItem("velora_token")}` },
  })
    .then((res) => res.json())
    .then((data) => {
      if (data.enabled_modules) {
        setEnabledModules(data.enabled_modules.split(","));
      } else {
        setEnabledModules(null); // null = sin restricción (todo visible)
      }
    })
    .catch(() => setEnabledModules(null));
}, []);
  
  const PATH_TO_MODULE: Record<string, string> = {
  "/orders": "pedidos",
  "/deliveries": "entregas",
  "/pos": "pos",
  "/cash": "caja",
  "/invoices": "facturacion",
  "/accounts": "cuentas",
  "/products": "productos",
  "/customers": "clientes",
  "/stock": "stock",
  "/suppliers": "proveedores",
  "/purchases": "compras",
  "/reports": "reportes",
  "/sellers": "vendedores",
};

 
useEffect(() => {
  if (enabledModules === null) return; // todavía no cargó, no bloquear en falso
  const requiredModule = PATH_TO_MODULE[location.pathname];
  if (requiredModule && (!enabledModules.includes(requiredModule) || !hasRole(requiredModule))) {
  navigate("/dashboard", { replace: true });
}
}, [location.pathname, enabledModules]);
  
  
function hasModule(id: string) {
  return (enabledModules === null || enabledModules.includes(id)) && hasRole(id);
}
  function logout() {
    localStorage.removeItem("velora_token");
    localStorage.removeItem("velora_user");
    
    window.location.href = "/";
  }

const userRole = JSON.parse(localStorage.getItem("velora_user") || "{}").role;

const ROLE_MODULES: Record<string, string[]> = {
  ADMINISTRADOR: ["clientes","proveedores","productos","stock","pedidos","entregas","facturacion","cuentas","compras","pos","caja","reportes","vendedores","usuarios","configuracion"],
  ENCARGADO: ["clientes","proveedores","productos","stock","pedidos","entregas","facturacion","cuentas","compras","pos","caja","reportes","vendedores"],
  // el vendedor entra a Vendedores, pero ahí ve solo sus ventas y su comisión
  VENDEDOR: ["clientes","productos","pedidos","pos","reportes","vendedores"],
  CAJERO: ["pos","caja"],
  DEPOSITO: ["stock","productos","compras","proveedores"],
};

function hasRole(id: string) {
  return ROLE_MODULES[userRole]?.includes(id) ?? true;
}
  
  const canSeeStore =
    (enabledModules === null || enabledModules.includes("landing") || enabledModules.includes("ecommerce")) &&
    (userRole === "ADMINISTRADOR" || userRole === "ENCARGADO" || !ROLE_MODULES[userRole]);

  // menú lateral: cada sección solo se muestra si tiene al menos una opción visible
  const sections: { title: string; items: { path: string; label: string; icon: string; show: boolean }[] }[] = [
    { title: "Principal", items: [
      { path: "/dashboard", label: "Inicio", icon: "home", show: true },
    ] },
    { title: "Ventas", items: [
      { path: "/orders", label: "Pedidos", icon: "orders", show: hasModule("pedidos") },
      { path: "/deliveries", label: "Entregas", icon: "deliveries", show: hasModule("entregas") },
      { path: "/pos", label: "Vender", icon: "sell", show: hasModule("pos") },
      { path: "/online-store", label: "Tienda online", icon: "store", show: canSeeStore },
      { path: "/cash", label: "Caja", icon: "cash", show: hasModule("caja") },
    ] },
    { title: "Facturación", items: [
      { path: "/invoices", label: "Facturación", icon: "invoice", show: hasModule("facturacion") },
      { path: "/accounts", label: "Cuentas corrientes", icon: "accounts", show: hasModule("cuentas") },
    ] },
    { title: "Catálogo", items: [
      { path: "/products", label: "Productos", icon: "products", show: hasModule("productos") },
      { path: "/customers", label: "Clientes", icon: "customers", show: hasModule("clientes") },
      { path: "/stock", label: "Stock", icon: "stock", show: hasModule("stock") },
    ] },
    { title: "Abastecimiento", items: [
      { path: "/suppliers", label: "Proveedores", icon: "suppliers", show: hasModule("proveedores") },
      { path: "/purchases", label: "Compras", icon: "purchases", show: hasModule("compras") },
    ] },
    { title: "Gestión", items: [
      { path: "/reports", label: "Reportes", icon: "reports", show: hasModule("reportes") },
      { path: "/sellers", label: "Vendedores", icon: "sellers", show: hasModule("vendedores") },
    ] },
    { title: "Sistema", items: [
      { path: "/users", label: "Usuarios", icon: "users", show: true },
      { path: "/settings", label: "Configuración", icon: "settings", show: true },
    ] },
  ];

  function go(path: string) {
    setMenuOpen(false);
    navigate(path);
  }

  // Tutorial "¿Cómo funcionamos?": solo pasos de lo que el menú realmente muestra
  const visiblePaths = sections.flatMap((sec) => sec.items.filter((i) => i.show).map((i) => i.path)).join("|");
  const tourSteps = useMemo<TourStep[]>(() => {
    const has = (p: string) => visiblePaths.split("|").includes(p);
    const st: TourStep[] = [
      { title: "¡Bienvenido a Velora!", text: "Te mostramos en un minuto cómo moverte por el sistema. Podés omitir el recorrido cuando quieras." },
      { selector: '[data-tour="menu"]', title: "Tu menú", text: "Desde acá llegás a todas las pantallas. Solo ves lo que tu negocio tiene habilitado." },
      { selector: '[data-tour="nav-dashboard"]', title: "Inicio", text: "Arriba de todo aparecen los pendientes del día y un buscador para ir directo a lo que necesitás." },
    ];
    if (has("/pos")) st.push({ selector: '[data-tour="nav-pos"]', title: "Vender", text: "Cargá una venta en el mostrador: elegís productos, cobrás y listo." });
    else if (has("/orders")) st.push({ selector: '[data-tour="nav-orders"]', title: "Pedidos", text: "Acá registrás y seguís los pedidos de tus clientes." });
    if (has("/products")) st.push({ selector: '[data-tour="nav-products"]', title: "Productos", text: "Tu catálogo: precios, fotos y datos de cada producto." });
    else if (has("/stock")) st.push({ selector: '[data-tour="nav-stock"]', title: "Stock", text: "Controlá cuánto tenés de cada producto." });
    if (has("/cash")) st.push({ selector: '[data-tour="nav-cash"]', title: "Caja", text: "Abrí y cerrá la caja del día y mirá los movimientos." });
    else if (has("/invoices")) st.push({ selector: '[data-tour="nav-invoices"]', title: "Facturación", text: "Armá y consultá tus comprobantes internos." });
    st.push({ selector: '[data-tour="avisos"]', title: "Avisos", text: "La campana te muestra novedades, como stock bajo o pagos pendientes." });
    st.push({ selector: '[data-tour="asistente"]', title: "Asistente", text: "Si no sabés cómo hacer algo, preguntale al asistente." });
    st.push({ selector: '[data-tour="nav-settings"]', title: "Configuración", text: "Ahí cargás los datos de tu empresa y elegís el tema claro u oscuro. Para ver este recorrido de nuevo, tocá \"¿Cómo funcionamos?\"." });
    return st;
  }, [visiblePaths]);

  return (
    <div className={`app-layout ${collapsed ? "sidebar-collapsed" : ""} ${menuOpen ? "menu-open" : ""}`}>

      <Tour steps={tourSteps} storageKey={`velora_${userRole || "x"}_${user?.id ?? "x"}`} />

      {/* fondo oscuro detrás del menú en el celular */}
      <div className="vl-backdrop" onClick={() => setMenuOpen(false)} aria-hidden="true" />

      {/* =========================
          SIDEBAR
      ========================= */}

      <aside className="sidebar" aria-label="Menú principal">

        {/* BOTÓN CONTRAER / EXPANDIR (escritorio) */}
        <button
          className="sidebar-collapse-button"
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? "Expandir menú" : "Contraer menú"}
          aria-label={collapsed ? "Expandir menú" : "Contraer menú"}
          type="button"
        >
          <Icon name={collapsed ? "chevronRight" : "chevronLeft"} size={14} />
        </button>

        {/* MARCA */}
        <div className="sidebar-brand">
          <VeloraLogo size={40} />
          <div className="sidebar-brand-text">
            <strong>{APP_NAME}</strong>
            <span>{APP_TAGLINE}</span>
          </div>
          <button className="vl-menu-close" type="button" onClick={() => setMenuOpen(false)} aria-label="Cerrar menú">
            <Icon name="close" size={18} />
          </button>
        </div>

        {/* NAVEGACIÓN */}
        <nav className="sidebar-nav" data-tour="menu">
          {sections.filter((section) => section.items.some((item) => item.show)).map((section) => (
            <div className="vl-nav-group" key={section.title}>
              <div className="nav-section">{section.title}</div>
              {section.items.filter((item) => item.show).map((item) => (
                <button
                  key={item.path}
                  data-tour={`nav-${item.path.slice(1).replace("/", "-")}`}
                  type="button"
                  className={`nav-item ${location.pathname === item.path ? "active" : ""}`}
                  onClick={() => go(item.path)}
                  title={collapsed ? item.label : undefined}
                  aria-current={location.pathname === item.path ? "page" : undefined}
                >
                  <span className="nav-item-icon"><Icon name={item.icon} /></span>
                  <span className="nav-item-text">{item.label}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>

        {/* FOOTER DE SIDEBAR */}
        <div className="sidebar-footer">
          <SidebarSignature />
        </div>

      </aside>


      {/* =========================
          MAIN AREA
      ========================= */}

      <div className="main-area">

        <header className="topbar">

          {/* IZQUIERDA */}
          <div className="topbar-left">
            <button className="vl-menu-button" type="button" onClick={() => setMenuOpen(true)} aria-label="Abrir menú">
              <Icon name="menu" size={20} />
            </button>
            <div className="topbar-company-wrapper">
              <span className="topbar-company">Empresa</span>
              <strong>{companyName || "Empresa"}</strong>
            </div>
          </div>

          {/* DERECHA */}
          <div className="topbar-right">

            <span className="vl-tour-wrap" data-tour="avisos"><NotificationsBell /></span>

            <VeloriaChat />

            <div className="topbar-user">
              <div className="topbar-user-avatar">
                {user?.name?.charAt(0) || "U"}
              </div>
              <div className="topbar-user-info">
                <strong>{user?.name || "Usuario"}</strong>
                <span>{user?.email || ""}</span>
              </div>
            </div>

            <button
              className="topbar-logout"
              onClick={logout}
              title="Cerrar sesión"
              aria-label="Cerrar sesión"
              type="button"
            >
              <Icon name="logout" size={18} />
            </button>

          </div>

        </header>


        {/* =========================
            WORKSPACE
        ========================= */}

        <main className="page-content">

          <div
            key={location.pathname}
            className="workspace-transition"
          >
            <Outlet />
          </div>

        </main>

      </div>

    </div>
  );
}

export default DashboardLayout;
