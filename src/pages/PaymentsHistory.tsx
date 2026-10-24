import { useEffect, useState } from "react";
import { API_URL } from "../apiBase";
import { fmtMoney } from "../money";

interface PaymentItem {
  id: number;
  company_id: number;
  amount: number;
  payment_date: string;
  method: string | null;
  notes: string | null;
}

interface SystemLite {
  id: number;
  name: string;
}

function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem("velora_admin_token")}` };
}

function PaymentsHistory() {
  const [payments, setPayments] = useState<PaymentItem[]>([]);
  const [systems, setSystems] = useState<SystemLite[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const [paymentsRes, systemsRes] = await Promise.all([
        fetch(`${API_URL}/admin/payments`, { headers: authHeaders() }),
        fetch(`${API_URL}/admin/systems`, { headers: authHeaders() }),
      ]);
      if (paymentsRes.ok) setPayments(await paymentsRes.json());
      if (systemsRes.ok) setSystems(await systemsRes.json());
    } catch {
      console.error("No se pudo cargar el historial");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function systemName(id: number) {
    return systems.find((s) => s.id === id)?.name || `Sistema #${id}`;
  }

  const total = payments.reduce((sum, p) => sum + p.amount, 0);

  return (
    <section className="products-page">
      <div className="products-header">
        <div>
          <span className="dashboard-eyebrow">MEZZTT</span>
          <h1>Historial de pagos</h1>
          <p>Todo lo que te pagaron tus clientes, de todos los sistemas.</p>
        </div>
      </div>

      <div className="dashboard-cards" style={{ marginBottom: 20 }}>
        <div className="dashboard-card">
          <span>Total cobrado</span>
          <strong>{fmtMoney(total)}</strong>
        </div>
        <div className="dashboard-card">
          <span>Pagos registrados</span>
          <strong>{payments.length}</strong>
        </div>
      </div>

      <div className="products-table-container">
        {loading ? (
          <div className="products-loading"><div className="products-loading-spinner" /><span>Cargando...</span></div>
        ) : payments.length === 0 ? (
          <div className="products-empty"><p>Todavía no hay pagos registrados.</p></div>
        ) : (
          <div className="products-table-wrapper">
            <table className="products-table">
              <thead>
                <tr><th>Fecha</th><th>Sistema</th><th>Monto</th><th>Método</th><th>Notas</th></tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td>{new Date(p.payment_date).toLocaleDateString("es-AR")}</td>
                    <td>{systemName(p.company_id)}</td>
                    <td><span className="product-price">{fmtMoney(p.amount)}</span></td>
                    <td>{p.method || "—"}</td>
                    <td>{p.notes || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

export default PaymentsHistory;