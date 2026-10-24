import { useEffect, useState } from "react";
import { statusLabel } from "../extras";
import { useSearchParams } from "react-router-dom";
import { API_URL } from "../apiBase";
import { fmtMoney } from "../money";

// ============================================================
// TIPOS
// ============================================================

interface CustomerLite {
  id: number;
  name: string;
  credit_limit: number;
}

interface AccountMovement {
  id: number;
  customer_id: number;
  movement_type: "DEBITO" | "CREDITO";
  amount: number;
  invoice_id: number | null;
  payment_id: number | null;
  description: string | null;
  balance_after: number;
  created_at: string;
}

interface OpenInvoiceItem {
  invoice_id: number;
  formatted_number: string;
  issue_date: string;
  total: number;
  paid_amount: number;
  pending_amount: number;
}

interface AccountStatement {
  customer_id: number;
  customer_name: string;
  credit_limit: number;
  balance: number;
  available: number;
  movements: AccountMovement[];
  open_invoices: OpenInvoiceItem[];
}


function authHeaders() {
  const token = localStorage.getItem("velora_token");
  return { Authorization: `Bearer ${token}` };
}

// ============================================================
// COMPONENTE
// ============================================================

function CuentasCorrientes() {
  const [customers, setCustomers] = useState<CustomerLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [balances, setBalances] = useState<Record<number, number>>({});

  const [statement, setStatement] = useState<AccountStatement | null>(null);
  const [loadingStatement, setLoadingStatement] = useState(false);

  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("EFECTIVO");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [applications, setApplications] = useState<Record<number, string>>({});
  const [savingPayment, setSavingPayment] = useState(false);

  // ------------------------------------------------------------
  // CARGA
  // ------------------------------------------------------------

  async function loadCustomers() {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/customers`, {
        headers: authHeaders(),
      });
      if (!response.ok) throw new Error("No se pudieron cargar los clientes");
      const data: CustomerLite[] = await response.json();
      setCustomers(data);

      const results = await Promise.all(
        data.map(async (customer) => {
          try {
            const res = await fetch(`${API_URL}/accounts/${customer.id}`, {
              headers: authHeaders(),
            });
            if (!res.ok) return [customer.id, 0] as const;
            const stmt: AccountStatement = await res.json();
            return [customer.id, stmt.balance] as const;
          } catch {
            return [customer.id, 0] as const;
          }
        })
      );
      setBalances(Object.fromEntries(results));
    } catch (error) {
      console.error("Error cargando clientes:", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCustomers();
  }, []);

  // Desde Clientes se llega con ?cliente=ID: abre directo la cuenta de ese cliente
  const [linkParams] = useSearchParams();
  const linkedCustomer = Number(linkParams.get("cliente") || 0);
  useEffect(() => {
    if (linkedCustomer > 0) openAccount(linkedCustomer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedCustomer]);

  const filteredCustomers = customers.filter((customer) => {
    const searchText = search.toLowerCase().trim();
    if (!searchText) return true;
    return customer.name.toLowerCase().includes(searchText);
  });

  // ------------------------------------------------------------
  // ESTADO DE CUENTA
  // ------------------------------------------------------------

  async function openAccount(customerId: number) {
    setLoadingStatement(true);
    setShowPaymentForm(false);
    setApplications({});
    setPaymentAmount("");
    setPaymentNotes("");

    try {
      const response = await fetch(`${API_URL}/accounts/${customerId}`, {
        headers: authHeaders(),
      });
      if (!response.ok) throw new Error("No se pudo cargar el estado de cuenta");
      setStatement(await response.json());
    } catch (error) {
      console.error("Error cargando cuenta:", error);
      alert("No se pudo cargar el estado de cuenta.");
    } finally {
      setLoadingStatement(false);
    }
  }

  function closeAccount() {
    setStatement(null);
  }

  function updateApplication(invoiceId: number, value: string) {
    setApplications((current) => ({ ...current, [invoiceId]: value }));
  }

  const totalApplied = Object.values(applications).reduce(
    (sum, value) => sum + (Number(value) || 0),
    0
  );

  async function savePayment() {
    if (!statement) return;
    const amount = Number(paymentAmount);
    if (!amount || amount <= 0) {
      alert("Ingresá un monto válido.");
      return;
    }
    if (totalApplied > amount) {
      alert("Lo aplicado a facturas no puede superar el monto del pago.");
      return;
    }

    setSavingPayment(true);
    try {
      const applicationsPayload = Object.entries(applications)
        .filter(([, value]) => Number(value) > 0)
        .map(([invoiceId, value]) => ({
          invoice_id: Number(invoiceId),
          amount_applied: Number(value),
        }));

      const response = await fetch(`${API_URL}/payments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify({
          customer_id: statement.customer_id,
          amount,
          payment_method: paymentMethod,
          notes: paymentNotes || null,
          applications: applicationsPayload.length > 0 ? applicationsPayload : null,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "No se pudo registrar el pago");
      }

      setShowPaymentForm(false);
      await openAccount(statement.customer_id);
      await loadCustomers();
    } catch (error) {
      console.error("Error registrando pago:", error);
      alert(error instanceof Error ? error.message : "No se pudo registrar el pago.");
    } finally {
      setSavingPayment(false);
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
          <span className="dashboard-eyebrow">FISCAL</span>
          <h1>Cuentas Corrientes</h1>
          <p>Saldo, historial de movimientos y pagos por cliente.</p>
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
            placeholder="Buscar cliente..."
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
          {filteredCustomers.length}{" "}
          {filteredCustomers.length === 1 ? "cliente" : "clientes"}
        </div>
      </div>

      {/* TABLA */}
      <div className="products-table-container">
        {loading ? (
          <div className="products-loading">
            <div className="products-loading-spinner" />
            <span>Cargando cuentas...</span>
          </div>
        ) : filteredCustomers.length === 0 ? (
          <div className="products-empty">
            <div className="products-empty-icon">◯</div>
            <h3>No hay clientes</h3>
          </div>
        ) : (
          <div className="products-table-wrapper">
            <table className="products-table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Límite de crédito</th>
                  <th>Saldo actual</th>
                  <th>Disponible</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredCustomers.map((customer) => {
                  const balance = balances[customer.id] ?? 0;
                  const available = customer.credit_limit
                    ? customer.credit_limit - balance
                    : 0;
                  const overLimit =
                    customer.credit_limit > 0 && balance > customer.credit_limit;

                  return (
                    <tr key={customer.id}>
                      <td>
                        <div className="product-name">{customer.name}</div>
                      </td>
                      <td>{fmtMoney(customer.credit_limit)}</td>
                      <td>
                        <span className={overLimit ? "stock-low" : "stock-normal"}>
                          {fmtMoney(balance)}
                        </span>
                      </td>
                      <td>{fmtMoney(available)}</td>
                      <td>
                        <div className="product-actions">
                          <button
                            type="button"
                            className="product-action-edit"
                            onClick={() => openAccount(customer.id)}
                          >
                            Ver cuenta
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

      {/* MODAL: ESTADO DE CUENTA */}
      {statement && (
        <div className="modal-overlay" onClick={closeAccount}>
          <div
            className="product-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <span className="dashboard-eyebrow">CUENTA CORRIENTE</span>
                <h2>{statement.customer_name}</h2>
              </div>
              <button className="modal-close" type="button" onClick={closeAccount}>
                ×
              </button>
            </div>

            {loadingStatement ? (
              <div className="products-loading">
                <div className="products-loading-spinner" />
                <span>Cargando...</span>
              </div>
            ) : (
              <div className="product-form">
                <div className="form-row">
                  <div className="form-group">
                    <label>Saldo actual</label>
                    <p style={{ fontSize: 18, fontWeight: 700 }}>
                      {fmtMoney(statement.balance)}
                    </p>
                  </div>
                  <div className="form-group">
                    <label>Disponible</label>
                    <p style={{ fontSize: 18, fontWeight: 700 }}>
                      {fmtMoney(statement.available)}
                    </p>
                  </div>
                </div>

                {statement.credit_limit > 0 && statement.balance > statement.credit_limit && (
                  <div className="import-warning">
                    <strong>Supera el límite de crédito</strong>
                    <span>
                      Límite: {fmtMoney(statement.credit_limit)}
                    </span>
                  </div>
                )}

                {!showPaymentForm ? (
                  <button
                    type="button"
                    className="primary-button"
                    onClick={() => setShowPaymentForm(true)}
                  >
                    + Registrar pago
                  </button>
                ) : (
                  <div
                    className="form-group"
                    style={{
                      border: "1px solid #e4dbd0",
                      borderRadius: 15,
                      padding: 16,
                    }}
                  >
                    <label>Nuevo pago</label>

                    <div className="form-row" style={{ marginTop: 8 }}>
                      <div className="form-group">
                        <label>Monto</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={paymentAmount}
                          onChange={(event) => setPaymentAmount(event.target.value)}
                        />
                      </div>
                      <div className="form-group">
                        <label>Forma de pago</label>
                        <select
                          value={paymentMethod}
                          onChange={(event) => setPaymentMethod(event.target.value)}
                        >
                          <option value="EFECTIVO">Efectivo</option>
                          <option value="TRANSFERENCIA">Transferencia</option>
                          <option value="CHEQUE">Cheque</option>
                          <option value="TARJETA">Tarjeta</option>
                          <option value="OTRO">Otro</option>
                        </select>
                      </div>
                    </div>

                    {statement.open_invoices.length > 0 && (
                      <div className="form-group">
                        <label>Aplicar a facturas pendientes (opcional)</label>
                        <div className="import-table-wrapper">
                          <table className="import-table">
                            <thead>
                              <tr>
                                <th>Factura</th>
                                <th>Pendiente</th>
                                <th>Aplicar</th>
                              </tr>
                            </thead>
                            <tbody>
                              {statement.open_invoices.map((invoice) => (
                                <tr key={invoice.invoice_id}>
                                  <td>{invoice.formatted_number}</td>
                                  <td>${invoice.pending_amount}</td>
                                  <td>
                                    <input
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      max={invoice.pending_amount}
                                      value={applications[invoice.invoice_id] || ""}
                                      onChange={(event) =>
                                        updateApplication(
                                          invoice.invoice_id,
                                          event.target.value
                                        )
                                      }
                                    />
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <p style={{ fontSize: 11, color: "#9a8b7d", marginTop: 6 }}>
                          Total aplicado: ${fmtMoney(totalApplied, "fixed")}. Lo que no se
                          aplique queda como saldo a favor general.
                        </p>
                      </div>
                    )}

                    <div className="form-group">
                      <label>Notas</label>
                      <input
                        type="text"
                        value={paymentNotes}
                        onChange={(event) => setPaymentNotes(event.target.value)}
                        placeholder="Opcional"
                      />
                    </div>

                    <div className="modal-actions">
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => setShowPaymentForm(false)}
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        className="primary-button"
                        onClick={savePayment}
                        disabled={savingPayment}
                      >
                        {savingPayment ? "Guardando..." : "Registrar pago"}
                      </button>
                    </div>
                  </div>
                )}

                {statement.open_invoices.length > 0 && (
                  <div className="form-group">
                    <label>Facturas con saldo pendiente</label>
                    <div className="import-table-wrapper">
                      <table className="import-table">
                        <thead>
                          <tr>
                            <th>Factura</th>
                            <th>Fecha</th>
                            <th>Total</th>
                            <th>Pagado</th>
                            <th>Pendiente</th>
                          </tr>
                        </thead>
                        <tbody>
                          {statement.open_invoices.map((invoice) => (
                            <tr key={invoice.invoice_id}>
                              <td>{invoice.formatted_number}</td>
                              <td>
                                {new Date(invoice.issue_date).toLocaleDateString("es-AR")}
                              </td>
                              <td>${invoice.total}</td>
                              <td>${invoice.paid_amount}</td>
                              <td>${invoice.pending_amount}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <div className="form-group">
                  <label>Historial de movimientos</label>
                  <div className="import-table-wrapper">
                    <table className="import-table">
                      <thead>
                        <tr>
                          <th>Fecha</th>
                          <th>Tipo</th>
                          <th>Descripción</th>
                          <th>Monto</th>
                          <th>Saldo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {statement.movements.map((movement) => (
                          <tr key={movement.id}>
                            <td>
                              {new Date(movement.created_at).toLocaleDateString("es-AR")}
                            </td>
                            <td><span className="status-active" data-status={movement.movement_type}><span className="status-dot" />{statusLabel(movement.movement_type)}</span></td>
                            <td>{movement.description || "—"}</td>
                            <td>
                              {movement.movement_type === "DEBITO" ? "+" : "-"}$
                              {movement.amount}
                            </td>
                            <td>${movement.balance_after}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

export default CuentasCorrientes;