import { useEffect, useState } from "react";
import { statusLabel } from "../extras";
import { API_URL } from "../apiBase";
import { fmtMoney } from "../money";

interface CashMovement {
  id: number;
  cash_session_id: number;
  movement_type: "INGRESO" | "EGRESO";
  amount: number;
  description: string | null;
  created_at: string;
}

interface CashSession {
  id: number;
  company_id: number;
  user_id: number;
  opening_amount: number;
  opening_at: string;
  closing_amount: number | null;
  expected_amount: number | null;
  difference: number | null;
  closing_at: string | null;
  status: "ABIERTA" | "CERRADA";
  notes: string | null;
  movements: CashMovement[];
}


function authHeaders() {
  const token = localStorage.getItem("velora_token");
  return { Authorization: `Bearer ${token}` };
}

function Caja() {
  const [session, setSession] = useState<CashSession | null>(null);
  const [loading, setLoading] = useState(true);

  const [openingAmount, setOpeningAmount] = useState("");
  const [opening, setOpening] = useState(false);

  const [movementType, setMovementType] = useState<"INGRESO" | "EGRESO">("INGRESO");
  const [movementAmount, setMovementAmount] = useState("");
  const [movementDescription, setMovementDescription] = useState("");
  const [savingMovement, setSavingMovement] = useState(false);

  const [showClose, setShowClose] = useState(false);
  const [closingAmount, setClosingAmount] = useState("");
  const [closing, setClosing] = useState(false);
  const [closeResult, setCloseResult] = useState<CashSession | null>(null);

  async function loadCurrentSession() {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/cash-sessions/current`, {
        headers: authHeaders(),
      });
      if (response.status === 404) {
        setSession(null);
        return;
      }
      if (!response.ok) throw new Error("No se pudo cargar la caja");
      setSession(await response.json());
    } catch (error) {
      console.error("Error cargando caja:", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCurrentSession();
  }, []);

  async function openSession() {
    setOpening(true);
    try {
      const response = await fetch(`${API_URL}/cash-sessions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify({
          opening_amount: Number(openingAmount) || 0,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "No se pudo abrir la caja");
      setSession(data);
      setOpeningAmount("");
    } catch (error) {
      console.error("Error abriendo caja:", error);
      alert(error instanceof Error ? error.message : "No se pudo abrir la caja.");
    } finally {
      setOpening(false);
    }
  }

  async function saveMovement() {
    if (!session) return;
    const amount = Number(movementAmount);
    if (!amount || amount <= 0) {
      alert("Ingresá un monto válido.");
      return;
    }

    setSavingMovement(true);
    try {
      const response = await fetch(
        `${API_URL}/cash-sessions/${session.id}/movements`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...authHeaders(),
          },
          body: JSON.stringify({
            movement_type: movementType,
            amount,
            description: movementDescription || null,
          }),
        }
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "No se pudo registrar el movimiento");
      setSession(data);
      setMovementAmount("");
      setMovementDescription("");
    } catch (error) {
      console.error("Error registrando movimiento:", error);
      alert(error instanceof Error ? error.message : "No se pudo registrar el movimiento.");
    } finally {
      setSavingMovement(false);
    }
  }

  async function closeSession() {
    if (!session) return;
    const amount = Number(closingAmount);
    if (closingAmount === "" || isNaN(amount)) {
      alert("Ingresá el efectivo contado.");
      return;
    }

    setClosing(true);
    try {
      const response = await fetch(
        `${API_URL}/cash-sessions/${session.id}/close`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...authHeaders(),
          },
          body: JSON.stringify({ closing_amount: amount }),
        }
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "No se pudo cerrar la caja");
      setCloseResult(data);
      setSession(null);
      setShowClose(false);
      setClosingAmount("");
    } catch (error) {
      console.error("Error cerrando caja:", error);
      alert(error instanceof Error ? error.message : "No se pudo cerrar la caja.");
    } finally {
      setClosing(false);
    }
  }

  return (
    <section className="products-page">
      <div className="products-header">
        <div>
          <span className="dashboard-eyebrow">PUNTO DE VENTA</span>
          <h1>Caja</h1>
          <p>Apertura, movimientos y cierre con arqueo.</p>
        </div>
      </div>

      {loading ? (
        <div className="products-loading">
          <div className="products-loading-spinner" />
          <span>Cargando...</span>
        </div>
      ) : !session ? (
        <div className="dashboard-section">
          <div className="section-heading">
            <h2>La caja está cerrada</h2>
            <p>Ingresá el monto inicial en efectivo para abrirla.</p>
          </div>

          <div className="form-row" style={{ maxWidth: 420 }}>
            <div className="form-group">
              <label>Monto de apertura</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={openingAmount}
                onChange={(event) => setOpeningAmount(event.target.value)}
              />
            </div>
            <div className="form-group" style={{ justifyContent: "flex-end" }}>
              <button
                type="button"
                className="primary-button"
                onClick={openSession}
                disabled={opening}
              >
                {opening ? "Abriendo..." : "Abrir caja"}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="dashboard-cards">
            <div className="dashboard-card">
              <span>Apertura</span>
              <strong>{fmtMoney(session.opening_amount)}</strong>
              <small>{new Date(session.opening_at).toLocaleString("es-AR")}</small>
            </div>
            <div className="dashboard-card">
              <span>Ingresos manuales</span>
              <strong>
                {fmtMoney(
                  session.movements
                    .filter((m) => m.movement_type === "INGRESO")
                    .reduce((sum, m) => sum + m.amount, 0)
                )}
              </strong>
            </div>
            <div className="dashboard-card">
              <span>Egresos manuales</span>
              <strong>
                {fmtMoney(
                  session.movements
                    .filter((m) => m.movement_type === "EGRESO")
                    .reduce((sum, m) => sum + m.amount, 0)
                )}
              </strong>
            </div>
          </div>

          <div className="dashboard-section" style={{ marginBottom: 20 }}>
            <div className="section-heading">
              <h2>Registrar movimiento manual</h2>
              <p>Ingresos o egresos de efectivo que no son ventas (ej. cambio, retiro).</p>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Tipo</label>
                <select
                  value={movementType}
                  onChange={(event) =>
                    setMovementType(event.target.value as "INGRESO" | "EGRESO")
                  }
                >
                  <option value="INGRESO">Ingreso</option>
                  <option value="EGRESO">Egreso</option>
                </select>
              </div>
              <div className="form-group">
                <label>Monto</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={movementAmount}
                  onChange={(event) => setMovementAmount(event.target.value)}
                />
              </div>
            </div>
            <div className="form-group">
              <label>Descripción</label>
              <input
                type="text"
                value={movementDescription}
                onChange={(event) => setMovementDescription(event.target.value)}
                placeholder="Opcional"
              />
            </div>
            <button
              type="button"
              className="secondary-button"
              onClick={saveMovement}
              disabled={savingMovement}
            >
              {savingMovement ? "Guardando..." : "Registrar movimiento"}
            </button>
          </div>

          <div className="dashboard-section" style={{ marginBottom: 20 }}>
            <div className="section-heading">
              <h2>Movimientos de la sesión</h2>
            </div>
            {session.movements.length === 0 ? (
              <p style={{ color: "#9a8b7d", fontSize: 12 }}>Todavía no hay movimientos.</p>
            ) : (
              <div className="import-table-wrapper">
                <table className="import-table">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Tipo</th>
                      <th>Descripción</th>
                      <th>Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {session.movements.map((movement) => (
                      <tr key={movement.id}>
                        <td>{new Date(movement.created_at).toLocaleString("es-AR")}</td>
                        <td><span className="status-active" data-status={movement.movement_type}><span className="status-dot" />{statusLabel(movement.movement_type)}</span></td>
                        <td>{movement.description || "—"}</td>
                        <td>${movement.amount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {!showClose ? (
            <button
              type="button"
              className="product-action-delete"
              onClick={() => setShowClose(true)}
            >
              Cerrar caja
            </button>
          ) : (
            <div className="dashboard-section">
              <div className="section-heading">
                <h2>Cerrar caja</h2>
                <p>Contá el efectivo físico y registrá el monto para el arqueo.</p>
              </div>
              <div className="form-row" style={{ maxWidth: 420 }}>
                <div className="form-group">
                  <label>Efectivo contado</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={closingAmount}
                    onChange={(event) => setClosingAmount(event.target.value)}
                  />
                </div>
                <div className="form-group" style={{ justifyContent: "flex-end" }}>
                  <button
                    type="button"
                    className="primary-button"
                    onClick={closeSession}
                    disabled={closing}
                  >
                    {closing ? "Cerrando..." : "Confirmar cierre"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {closeResult && (
        <div className="modal-overlay" onClick={() => setCloseResult(null)}>
          <div className="product-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <span className="dashboard-eyebrow">ARQUEO</span>
                <h2>Caja cerrada</h2>
              </div>
              <button
                className="modal-close"
                type="button"
                onClick={() => setCloseResult(null)}
              >
                ×
              </button>
            </div>
            <div className="product-form">
              <div className="form-group">
                <label>Efectivo esperado</label>
                <p>${closeResult.expected_amount}</p>
              </div>
              <div className="form-group">
                <label>Efectivo contado</label>
                <p>${closeResult.closing_amount}</p>
              </div>
              <div className="form-group">
                <label>Diferencia</label>
                <p
                  style={{
                    fontWeight: 700,
                    color:
                      (closeResult.difference || 0) === 0
                        ? "#5e5144"
                        : (closeResult.difference || 0) > 0
                        ? "#5e5144"
                        : "#a05c50",
                  }}
                >
                  ${closeResult.difference}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default Caja;