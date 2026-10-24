import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";

import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Products from "./pages/Products";
import ProtectedRoute from "./components/ProtectedRoute";
import DashboardLayout from "./components/DashboardLayout";
import Customers from "./pages/Customers";
import Stock from "./pages/Stock";
import Pedidos from "./pages/Pedidos";
import Entregas from "./pages/Entregas";
import Facturacion from "./pages/Facturacion";
import CuentasCorrientes from "./pages/Cuentascorrientes";
import Proveedores from "./pages/Proveedores";
import Compras from "./pages/Compras";
import Caja from "./pages/Caja";
import POS from "./pages/POS";
import Reportes from "./pages/Reportes";
import Configuracion from "./pages/Configuracion";
import Usuarios from "./pages/Usuarios";
import Vendedores from "./pages/Vendedores";
import { useEffect } from "react"
import AdminLayout from "./pages/AdminLayout";
import Sistemas from "./pages/Sistemas";
import PaymentsHistory from "./pages/PaymentsHistory";
import AdminSettings from "./pages/AdminSettings";
import MailCenter from "./pages/MailCenter";
import AdminBilling from "./pages/AdminBilling";
import Tienda from "./store/Tienda";
import Pedido from "./store/Pedido";
import TiendaAdmin from "./store/TiendaAdmin";
import { Terminos, Privacidad } from "./pages/Legal";

function App() {
  useEffect(() => {
    // la tienda pública tiene su propio diseño (no usa el modo oscuro del panel)
    if (window.location.pathname.startsWith("/tienda/")) return;
    const saved = localStorage.getItem("velora_theme") || "light";
    document.documentElement.setAttribute("data-theme", saved);
  }, []);

  return (
    <BrowserRouter>

      <Routes>

        {/* LOGIN */}

        <Route
          path="/"
          element={<Login />}
        />


        {/* APP (Velora - tenant) */}

        <Route
          element={
            <ProtectedRoute>
              <DashboardLayout />
            </ProtectedRoute>
          }
        >

          <Route
            path="/dashboard"
            element={<Dashboard />}
          />

          <Route
            path="/products"
            element={<Products />}
          />

          <Route
            path="/customers"
            element={<Customers />}
          />

          <Route
            path="/stock"
            element={<Stock />}
          />

          <Route
            path="/orders"
            element={<Pedidos />}
          />

          <Route
            path="/deliveries"
            element={<Entregas />}
          />

          <Route
            path="/invoices"
            element={<Facturacion />}
          />

          <Route
            path="/accounts"
            element={<CuentasCorrientes />}
          />

          <Route path="/cash" element={<Caja />} />
          <Route path="/pos" element={<POS />} />

          <Route path="/suppliers" element={<Proveedores />} />
          <Route path="/purchases" element={<Compras />} />
          <Route path="/reports" element={<Reportes />} />
          <Route path="/sellers" element={<Vendedores />} />
          <Route path="/settings" element={<Configuracion />} />
          <Route path="/users" element={<Usuarios />} />
          <Route path="/online-store" element={<TiendaAdmin />} />

        </Route>


        {/* PANEL DE CONTROL (Mezztt - separado, su propio layout) */}

        <Route element={<AdminLayout />}>
          <Route path="/admin/systems" element={<Sistemas />} />
          <Route path="/admin/payments" element={<PaymentsHistory />} />
          <Route path="/admin/mail" element={<MailCenter />} />
          <Route path="/admin/settings" element={<AdminSettings />} />
          <Route path="/admin/billing" element={<AdminBilling />} />
        </Route>


        {/* TIENDA ONLINE PÚBLICA (clientes del negocio, sin login) */}

        <Route path="/tienda/:slug" element={<Tienda />} />
        <Route path="/tienda/:slug/pedido/:code" element={<Pedido />} />


        {/* PÁGINAS LEGALES (públicas, sin login) */}

        <Route path="/legal/terminos" element={<Terminos />} />
        <Route path="/legal/privacidad" element={<Privacidad />} />


        {/* DEFAULT */}

        <Route
          path="*"
          element={
            <Navigate
              to="/dashboard"
              replace
            />
          }
        />

      </Routes>

    </BrowserRouter>
  );
}

export default App;