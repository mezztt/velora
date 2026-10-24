import { useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import Icon from "../components/Icons";
import { VeloraLogo, SidebarSignature } from "../components/Brand";
import Tour from "../components/tour/Tour";
import type { TourStep } from "../components/tour/Tour";

const ADMIN_TOUR: TourStep[] = [
  { title: "Panel de Mezztt", text: "Desde acá administrás los sistemas de tus clientes. Te hacemos un recorrido corto; podés omitirlo." },
  { selector: '[data-tour="menu"]', title: "Tu menú", text: "Cuatro secciones: sistemas, pagos, facturación y configuración." },
  { selector: '[data-tour="nav-admin-systems"]', title: "Sistemas", text: "Creá clientes, elegí sus módulos y mirá si están al día." },
  { selector: '[data-tour="nav-admin-payments"]', title: "Pagos", text: "El historial de pagos que fuiste registrando." },
  { selector: '[data-tour="nav-admin-billing"]', title: "Facturación", text: "Cotizaciones con pago inicial, abono mensual y planes trimestral y anual, y las facturas de cada mes." },
  { selector: '[data-tour="nav-admin-settings"]', title: "Configuración", text: "Precios, marca, copia de seguridad y contraseña. Para ver este recorrido de nuevo, tocá \"¿Cómo funcionamos?\"." },
];

const ITEMS: { section: string; path: string; label: string; icon: string }[] = [
  { section: "Gestión", path: "/admin/systems", label: "Sistemas", icon: "systems" },
  { section: "Gestión", path: "/admin/payments", label: "Pagos", icon: "cash" },
  { section: "Gestión", path: "/admin/billing", label: "Facturación", icon: "invoice" },
  { section: "Gestión", path: "/admin/mail", label: "Correos", icon: "mail" },
  { section: "Sistema", path: "/admin/settings", label: "Configuración", icon: "settings" },
];

function AdminLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  // en el celular el menú se abre encima de la pantalla
  const [menuOpen, setMenuOpen] = useState(false);

  function logout() {
    localStorage.removeItem("velora_admin_token");
    window.location.href = "/";
  }

  function go(path: string) {
    setMenuOpen(false);
    navigate(path);
  }

  const sections = Array.from(new Set(ITEMS.map((i) => i.section)));

  return (
    <div className={`app-layout vl-admin ${menuOpen ? "menu-open" : ""}`}>
      <Tour steps={ADMIN_TOUR} storageKey="velora_admin_x" />
      <div className="vl-backdrop" onClick={() => setMenuOpen(false)} aria-hidden="true" />

      <aside className="sidebar" aria-label="Menú del panel">
        <div className="sidebar-brand">
          <VeloraLogo size={40} />
          <div className="sidebar-brand-text">
            <strong>Velora</strong>
            <span>Panel general · Mezztt</span>
          </div>
          <button className="vl-menu-close" type="button" onClick={() => setMenuOpen(false)} aria-label="Cerrar menú">
            <Icon name="close" size={18} />
          </button>
        </div>

        <nav className="sidebar-nav" data-tour="menu">
          {sections.map((section) => (
            <div className="vl-nav-group" key={section}>
              <div className="nav-section">{section}</div>
              {ITEMS.filter((i) => i.section === section).map((item) => (
                <button
                  key={item.path}
                  data-tour={`nav-${item.path.slice(1).replace("/", "-")}`}
                  type="button"
                  className={`nav-item ${location.pathname === item.path ? "active" : ""}`}
                  onClick={() => go(item.path)}
                  aria-current={location.pathname === item.path ? "page" : undefined}
                >
                  <span className="nav-item-icon"><Icon name={item.icon} /></span>
                  <span className="nav-item-text">{item.label}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button className="logout-button" type="button" onClick={logout}>
            <Icon name="logout" size={16} />
            <span className="nav-item-text">Cerrar sesión</span>
          </button>
          <SidebarSignature />
        </div>
      </aside>

      <div className="main-area">
        <header className="vl-mobile-bar">
          <button className="vl-menu-button" type="button" onClick={() => setMenuOpen(true)} aria-label="Abrir menú">
            <Icon name="menu" size={20} />
          </button>
          <strong>Mezztt · Panel de control</strong>
        </header>
        <main className="page-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default AdminLayout;
