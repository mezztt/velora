import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { api, downloadCsv, errorText, money, shortDate } from "../extras";

// ============================================================
// VENDEDORES Y COMISIONES  (/sellers) — módulo extra "vendedores"
// ============================================================

interface SellerRow {
  id: number;
  name: string;
  user_id: number | null;
  user_name: string | null;
  commission_percent: number;
  commission_base: "VENTA" | "COBRADO";
  active: boolean;
  operations_count: number;
  sales_total: number;
  commission_total: number;
  settled_commission: number;
  pending_commission: number;
  pending_operations: number;
  uncollected_total: number;
  rank: number;
}

interface Report {
  period: string;
  can_manage: boolean;
  sellers: SellerRow[];
  totals: { operations_count: number; sales_total: number; commission_total: number; pending_commission: number };
}

interface Operation {
  kind: "PEDIDO" | "VENTA";
  ref_id: number;
  date: string;
  customer_name: string;
  detail: string;
  amount: number;
  collected: boolean;
  eligible: boolean;
  commission: number;
  settled: boolean;
}

interface Settlement {
  id: number;
  seller_id: number;
  seller_name: string | null;
  period: string;
  operations_count: number;
  sales_total: number;
  commission_percent: number;
  commission_amount: number;
  paid: boolean;
  paid_at: string | null;
  created_at: string;
}

interface Detail { period: string; seller: SellerRow; operations: Operation[]; settlements: Settlement[] }
interface UserLite { id: number; name: string; email: string; role: string }

const BASE_LABEL: Record<string, string> = { VENTA: "Al vender", COBRADO: "Al cobrar" };
const EMPTY_FORM = { name: "", user_id: "", commission_percent: "", commission_base: "VENTA", active: true };

function currentPeriod() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function periodLabel(period: string) {
  const [y, m] = period.split("-").map(Number);
  const text = new Date(y, (m || 1) - 1, 1).toLocaleDateString("es-AR", { month: "long", year: "numeric" });
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export default function Vendedores() {
  const [params, setParams] = useSearchParams();
  const paramPeriod = params.get("periodo") || "";
  const period = /^\d{4}-\d{2}$/.test(paramPeriod) ? paramPeriod : currentPeriod();
  function setPeriod(next: string) {
    if (/^\d{4}-\d{2}$/.test(next)) setParams({ periodo: next }, { replace: true });
  }

  const [tab, setTab] = useState<"resumen" | "liquidaciones">("resumen");
  const [report, setReport] = useState<Report | null>(null);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<{ text: string; tone: "ok" | "error" } | null>(null);
  const [busy, setBusy] = useState(false);

  const [detail, setDetail] = useState<Detail | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<SellerRow | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [users, setUsers] = useState<UserLite[]>([]);

  function notify(text: string, tone: "ok" | "error" = "ok") {
    setToast({ text, tone });
    window.setTimeout(() => setToast(null), 3400);
  }

  async function load() {
    setLoading(true);
    try {
      const [rep, sets] = await Promise.all([
        api<Report>(`/sellers/report?period=${period}`),
        api<Settlement[]>(`/sellers/settlements?period=${period}`),
      ]);
      setReport(rep);
      setSettlements(sets);
      setError("");
      if (rep.can_manage) api<UserLite[]>("/sellers/users").then(setUsers).catch(() => setUsers([]));
    } catch (e) {
      setError(errorText(e, "No se pudieron cargar los vendedores"));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  const canManage = !!report?.can_manage;

  // ---------------- ABM ----------------
  function openCreate() {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    setShowForm(true);
  }
  function openEdit(s: SellerRow) {
    setEditing(s);
    setForm({
      name: s.name, user_id: s.user_id ? String(s.user_id) : "", commission_percent: String(s.commission_percent),
      commission_base: s.commission_base, active: s.active,
    });
    setShowForm(true);
  }
  async function saveSeller(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const body = {
        name: form.name, user_id: form.user_id ? Number(form.user_id) : null,
        commission_percent: Number(form.commission_percent || 0), commission_base: form.commission_base, active: form.active,
      };
      if (editing) await api(`/sellers/${editing.id}`, "PUT", body);
      else await api("/sellers", "POST", body);
      setShowForm(false);
      notify(editing ? "Vendedor actualizado" : "Vendedor creado");
      await load();
    } catch (err) {
      notify(errorText(err, "No se pudo guardar el vendedor"), "error");
    } finally {
      setBusy(false);
    }
  }

  // ---------------- detalle / liquidar ----------------
  async function openDetail(s: SellerRow) {
    try {
      setDetail(await api<Detail>(`/sellers/${s.id}/operations?period=${period}`));
    } catch (e) {
      notify(errorText(e, "No se pudo cargar el detalle"), "error");
    }
  }

  async function settle(s: { id: number; name: string; pending_commission: number; pending_operations: number }) {
    if (!window.confirm(`¿Liquidar las comisiones de ${s.name} de ${periodLabel(period)}?\n\n${s.pending_operations} operaciones · comisión ${money(s.pending_commission)}\n\nEsas operaciones quedan liquidadas y no se vuelven a liquidar.`)) return;
    setBusy(true);
    try {
      await api(`/sellers/${s.id}/settle`, "POST", { period });
      notify(`Comisiones de ${s.name} liquidadas`);
      await load();
      if (detail && detail.seller.id === s.id) setDetail(await api<Detail>(`/sellers/${s.id}/operations?period=${period}`));
    } catch (e) {
      notify(errorText(e, "No se pudo liquidar"), "error");
    } finally {
      setBusy(false);
    }
  }

  async function setPaid(st: Settlement, paid: boolean) {
    setBusy(true);
    try {
      await api(`/sellers/settlements/${st.id}/paid`, "PUT", { paid });
      notify(paid ? "Liquidación marcada como pagada" : "Se quitó la marca de pagada");
      await load();
      if (detail) setDetail(await api<Detail>(`/sellers/${detail.seller.id}/operations?period=${period}`));
    } catch (e) {
      notify(errorText(e), "error");
    } finally {
      setBusy(false);
    }
  }

  async function cancelSettlement(st: Settlement) {
    if (!window.confirm("¿Anular esta liquidación? Sus operaciones vuelven a quedar sin liquidar.")) return;
    setBusy(true);
    try {
      await api(`/sellers/settlements/${st.id}`, "DELETE");
      notify("Liquidación anulada");
      await load();
      if (detail) setDetail(await api<Detail>(`/sellers/${detail.seller.id}/operations?period=${period}`));
    } catch (e) {
      notify(errorText(e), "error");
    } finally {
      setBusy(false);
    }
  }

  // ---------------- CSV ----------------
  function exportSummary() {
    if (!report) return;
    downloadCsv(`vendedores-${period}.csv`, [
      ["Puesto", "Vendedor", "Comisiona", "% comisión", "Operaciones", "Ventas sin IVA", "Comisión", "Liquidado", "Por liquidar"],
      ...report.sellers.map((s) => [s.rank, s.name, BASE_LABEL[s.commission_base], s.commission_percent, s.operations_count, s.sales_total, s.commission_total, s.settled_commission, s.pending_commission]),
    ]);
  }
  function exportDetail() {
    if (!detail) return;
    downloadCsv(`ventas-${detail.seller.name.replace(/\s+/g, "-").toLowerCase()}-${period}.csv`, [
      ["Fecha", "Operación", "Cliente", "Monto sin IVA", "Cobrada", "Comisión", "Estado"],
      ...detail.operations.map((o) => [shortDate(o.date), o.detail, o.customer_name, o.amount, o.collected ? "Sí" : "No", o.commission, opState(o)]),
    ]);
  }

  function opState(o: Operation) {
    if (o.settled) return "Liquidada";
    if (!o.eligible) return "Espera el cobro";
    return "Por liquidar";
  }

  const detailPending = detail ? detail.operations.filter((o) => o.eligible && !o.settled) : [];

  return (
    <section className="products-page">
      <div className="products-header">
        <div>
          <span className="dashboard-eyebrow">GESTIÓN</span>
          <h1>Vendedores</h1>
          <p>{canManage ? "Ventas por vendedor, comisiones y liquidaciones del mes." : "Tus ventas y tu comisión del mes."}</p>
        </div>
        <div className="products-header-actions">
          <div className="vx-field">
            <label htmlFor="vx-period">Mes</label>
            <input id="vx-period" type="month" value={period} onChange={(e) => setPeriod(e.target.value)} />
          </div>
          <button className="secondary-button" type="button" onClick={exportSummary} disabled={!report || report.sellers.length === 0}>Exportar CSV</button>
          {canManage && <button className="primary-button" type="button" onClick={openCreate}>+ Nuevo vendedor</button>}
        </div>
      </div>

      {toast && <div className={`vx-toast is-${toast.tone}`} role="status">{toast.text}</div>}
      {error && <div className="vx-note is-bad" role="alert"><span>{error}</span></div>}

      {loading && !report ? (
        <div className="products-loading"><div className="products-loading-spinner" /><span>Cargando...</span></div>
      ) : report && (
        <>
          <div className="vx-kpis">
            <div className="vx-kpi"><span>Ventas de {periodLabel(period)}</span><strong>{money(report.totals.sales_total)}</strong><small>Sin IVA · {report.totals.operations_count} operaciones</small></div>
            <div className="vx-kpi"><span>Comisiones del mes</span><strong>{money(report.totals.commission_total)}</strong><small>Según la base de cada vendedor</small></div>
            <div className={`vx-kpi ${report.totals.pending_commission > 0 ? "is-bad" : "is-ok"}`}><span>Sin liquidar</span><strong>{money(report.totals.pending_commission)}</strong><small>{report.totals.pending_commission > 0 ? "Falta liquidar" : "Todo liquidado"}</small></div>
          </div>

          <div className="vx-tabs" role="tablist">
            <button type="button" className={tab === "resumen" ? "is-on" : ""} onClick={() => setTab("resumen")}>{canManage ? "Ranking y comisiones" : "Mi resumen"}</button>
            <button type="button" className={tab === "liquidaciones" ? "is-on" : ""} onClick={() => setTab("liquidaciones")}>Liquidaciones ({settlements.length})</button>
          </div>

          {tab === "resumen" && (
            report.sellers.length === 0 ? (
              <div className="vx-panel">
                <div className="vx-empty">
                  <strong>{canManage ? "Todavía no cargaste vendedores" : "Tu usuario no está vinculado a un vendedor"}</strong>
                  {canManage
                    ? "Creá los vendedores con su porcentaje de comisión. Después los elegís al cargar un pedido o una venta."
                    : "Pedile al administrador que te vincule desde Vendedores."}
                  {canManage && <div><button className="primary-button" onClick={openCreate}>+ Nuevo vendedor</button></div>}
                </div>
              </div>
            ) : (
              <div className="vx-table-wrap">
                <table className="vx-table">
                  <thead>
                    <tr>
                      <th>#</th><th>Vendedor</th><th>Comisiona</th><th className="vx-r">Operaciones</th>
                      <th className="vx-r">Ventas sin IVA</th><th className="vx-r">Comisión</th><th className="vx-r">Por liquidar</th><th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.sellers.map((s) => (
                      <tr key={s.id}>
                        <td>{s.rank}</td>
                        <td>
                          {s.name}
                          <small>{s.user_name ? `Usuario: ${s.user_name}` : "Sin usuario vinculado"}{!s.active ? " · desactivado" : ""}</small>
                        </td>
                        <td>{s.commission_percent}% · {BASE_LABEL[s.commission_base]}</td>
                        <td className="vx-r">{s.operations_count}</td>
                        <td className="vx-r">
                          {money(s.sales_total)}
                          {s.uncollected_total > 0 && <small>{money(s.uncollected_total)} sin cobrar</small>}
                        </td>
                        <td className="vx-r">{money(s.commission_total)}</td>
                        <td className="vx-r">
                          {s.pending_commission > 0
                            ? <span className="vx-badge is-warn">{money(s.pending_commission)}</span>
                            : s.settled_commission > 0 ? <span className="vx-badge is-ok">Liquidado</span> : "—"}
                        </td>
                        <td>
                          <div className="vx-row-end">
                            <button type="button" className="product-action-edit" onClick={() => openDetail(s)}>Ver ventas</button>
                            {canManage && s.pending_operations > 0 && <button type="button" className="primary-button" onClick={() => settle(s)} disabled={busy}>Liquidar</button>}
                            {canManage && <button type="button" className="product-action-edit" onClick={() => openEdit(s)}>Editar</button>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}

          {tab === "liquidaciones" && (
            settlements.length === 0 ? (
              <div className="vx-panel"><div className="vx-empty"><strong>No hay liquidaciones en {periodLabel(period)}</strong>{canManage ? "Liquidá a un vendedor desde la pestaña Ranking y comisiones." : ""}</div></div>
            ) : (
              <SettlementsTable settlements={settlements} canManage={canManage} busy={busy} onPaid={setPaid} onCancel={cancelSettlement} showSeller />
            )
          )}
        </>
      )}

      {/* ---------- detalle de operaciones ---------- */}
      {detail && (
        <div className="modal-overlay" onClick={() => setDetail(null)}>
          <div className="product-modal vx-modal-wide" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <span className="dashboard-eyebrow">{periodLabel(detail.period).toUpperCase()} · {detail.seller.commission_percent}% {BASE_LABEL[detail.seller.commission_base].toLowerCase()}</span>
                <h2>{detail.seller.name}</h2>
              </div>
              <button className="modal-close" type="button" onClick={() => setDetail(null)}>×</button>
            </div>
            <div className="product-form">
              {detail.seller.commission_base === "COBRADO" && (
                <div className="vx-note is-info"><span>Este vendedor comisiona <strong>al cobrar</strong>: las ventas que todavía no están cobradas no suman comisión hasta que se cobren.</span></div>
              )}
              {detail.operations.length === 0 ? (
                <div className="vx-empty">No tiene ventas en este mes.</div>
              ) : (
                <div className="vx-table-wrap vx-table-scroll">
                  <table className="vx-table">
                    <thead><tr><th>Fecha</th><th>Operación</th><th>Cliente</th><th className="vx-r">Monto sin IVA</th><th>Cobrada</th><th className="vx-r">Comisión</th><th>Estado</th></tr></thead>
                    <tbody>
                      {detail.operations.map((o) => (
                        <tr key={`${o.kind}-${o.ref_id}`}>
                          <td>{shortDate(o.date)}</td>
                          <td>{o.detail}</td>
                          <td>{o.customer_name}</td>
                          <td className="vx-r">{money(o.amount)}</td>
                          <td>{o.collected ? "Sí" : "No"}</td>
                          <td className="vx-r">{money(o.commission)}</td>
                          <td><span className={`vx-badge ${o.settled ? "is-ok" : o.eligible ? "is-warn" : ""}`}>{opState(o)}</span></td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={3}>Total del mes</td>
                        <td className="vx-r">{money(detail.operations.reduce((a, o) => a + o.amount, 0))}</td>
                        <td></td>
                        <td className="vx-r">{money(detail.operations.reduce((a, o) => a + o.commission, 0))}</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              {detail.settlements.length > 0 && (
                <>
                  <h3 style={{ marginTop: 6 }}>Liquidaciones de este mes</h3>
                  <SettlementsTable settlements={detail.settlements} canManage={canManage} busy={busy} onPaid={setPaid} onCancel={cancelSettlement} />
                </>
              )}

              <div className="modal-actions">
                <button type="button" className="secondary-button" onClick={exportDetail} disabled={detail.operations.length === 0}>Exportar CSV</button>
                {canManage && detailPending.length > 0 && (
                  <button type="button" className="primary-button" disabled={busy}
                    onClick={() => settle({ id: detail.seller.id, name: detail.seller.name, pending_operations: detailPending.length, pending_commission: detailPending.reduce((a, o) => a + o.commission, 0) })}>
                    Liquidar {money(detailPending.reduce((a, o) => a + o.commission, 0))}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---------- alta / edición ---------- */}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="product-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div><span className="dashboard-eyebrow">VENDEDORES</span><h2>{editing ? "Editar vendedor" : "Nuevo vendedor"}</h2></div>
              <button className="modal-close" type="button" onClick={() => setShowForm(false)}>×</button>
            </div>
            <form className="product-form" onSubmit={saveSeller}>
              <div className="form-group">
                <label>Nombre</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required maxLength={150} autoFocus />
              </div>
              <div className="form-group">
                <label>Usuario del sistema (opcional)</label>
                <select value={form.user_id} onChange={(e) => setForm({ ...form, user_id: e.target.value })}>
                  <option value="">Sin usuario</option>
                  {users.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}
                </select>
                <small className="vx-hint">Si lo vinculás, cuando ese usuario carga un pedido o una venta queda como vendedor. Con rol Vendedor, además ve solo sus ventas.</small>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Comisión (%)</label>
                  <input type="number" min={0} max={100} step="0.01" value={form.commission_percent} onChange={(e) => setForm({ ...form, commission_percent: e.target.value })} placeholder="Ej. 5" />
                </div>
                <div className="form-group">
                  <label>¿Cuándo comisiona?</label>
                  <select value={form.commission_base} onChange={(e) => setForm({ ...form, commission_base: e.target.value })}>
                    <option value="VENTA">Al vender</option>
                    <option value="COBRADO">Recién cuando se cobra</option>
                  </select>
                </div>
              </div>
              {editing && (
                <label className="vx-check">
                  <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
                  Vendedor activo (aparece para elegir en pedidos y ventas)
                </label>
              )}
              <div className="modal-actions">
                <button type="button" className="secondary-button" onClick={() => setShowForm(false)}>Cancelar</button>
                <button type="submit" className="primary-button" disabled={busy}>{busy ? "Guardando..." : editing ? "Guardar cambios" : "Crear vendedor"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}

function SettlementsTable({ settlements, canManage, busy, onPaid, onCancel, showSeller }: {
  settlements: Settlement[]; canManage: boolean; busy: boolean;
  onPaid: (s: Settlement, paid: boolean) => void; onCancel: (s: Settlement) => void; showSeller?: boolean;
}) {
  return (
    <div className="vx-table-wrap">
      <table className="vx-table">
        <thead>
          <tr>
            <th>Liquidada el</th>{showSeller && <th>Vendedor</th>}<th className="vx-r">Operaciones</th><th className="vx-r">Ventas sin IVA</th>
            <th className="vx-r">Comisión</th><th>Pago</th>{canManage && <th></th>}
          </tr>
        </thead>
        <tbody>
          {settlements.map((st) => (
            <tr key={st.id}>
              <td>{shortDate(st.created_at)}</td>
              {showSeller && <td>{st.seller_name || "—"}</td>}
              <td className="vx-r">{st.operations_count}</td>
              <td className="vx-r">{money(st.sales_total)}</td>
              <td className="vx-r"><strong>{money(st.commission_amount)}</strong></td>
              <td>{st.paid ? <span className="vx-badge is-ok">Pagada el {shortDate(st.paid_at)}</span> : <span className="vx-badge is-warn">Sin pagar</span>}</td>
              {canManage && (
                <td>
                  <div className="vx-row-end">
                    {st.paid
                      ? <button type="button" className="product-action-edit" onClick={() => onPaid(st, false)} disabled={busy}>Quitar pago</button>
                      : <>
                          <button type="button" className="primary-button" onClick={() => onPaid(st, true)} disabled={busy}>Marcar como pagada</button>
                          <button type="button" className="product-action-delete" onClick={() => onCancel(st)} disabled={busy}>Anular</button>
                        </>}
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
