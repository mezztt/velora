import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, loadModules, moduleOn, money, shortDate } from "../extras";
import type { CustomerDebt, SellerOptions } from "../extras";
import { API_URL } from "../apiBase";

type PriceListLite = {
  id: number;
  name: string;
  active: boolean;
  is_default: boolean;
};

type DebtFilter = "todos" | "deuda" | "vencida";

const PAYMENT_TERMS: [string, string][] = [
  ["cash", "Contado"],
  ["7_days", "7 días"],
  ["15_days", "15 días"],
  ["30_days", "30 días"],
  ["60_days", "60 días"],
  ["90_days", "90 días"],
];

type Customer = {
  id: number;
  company_id: number;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  tax_id: string | null;
  notes: string | null;
  active: boolean;
  payment_terms?: string;
  credit_limit?: number;
  price_list_id?: number | null;
  seller_id?: number | null;
};

type CustomerForm = {
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  tax_id: string;
  notes: string;
  payment_terms: string;
  credit_limit: string;
  price_list_id: string;
  seller_id: string;
};

const emptyForm: CustomerForm = {
  name: "",
  email: "",
  phone: "",
  address: "",
  city: "",
  tax_id: "",
  notes: "",
  payment_terms: "cash",
  credit_limit: "",
  price_list_id: "",
  seller_id: "",
};

function Customers() {
  const [customers, setCustomers] = useState<Customer[]>([]);

  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");

  const [modalOpen, setModalOpen] = useState(false);

  const [editingCustomer, setEditingCustomer] =
    useState<Customer | null>(null);

  const [form, setForm] =
    useState<CustomerForm>(emptyForm);

  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");

  // ---- deuda, listas de precios y vendedores ----
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const debtParam = params.get("deuda");
  const debtFilter: DebtFilter =
    debtParam === "vencida" || debtParam === "deuda" ? debtParam : "todos";

  function setDebtFilter(next: DebtFilter) {
    setParams(next === "todos" ? {} : { deuda: next }, { replace: true });
  }

  const [sortBy, setSortBy] = useState<"nombre" | "deuda">("nombre");
  const [debts, setDebts] = useState<Record<number, CustomerDebt>>({});
  const [priceLists, setPriceLists] = useState<PriceListLite[]>([]);
  const [sellerOptions, setSellerOptions] = useState<SellerOptions>({
    enabled: false,
    sellers: [],
    my_seller_id: null,
  });
  const [modules, setModules] = useState<string[] | null>(null);
  const [debtDetail, setDebtDetail] = useState<CustomerDebt | null>(null);

  async function loadExtras() {
    try {
      const list = await api<CustomerDebt[]>("/customers/debts");
      const map: Record<number, CustomerDebt> = {};
      list.forEach(item => {
        map[item.customer_id] = item;
      });
      setDebts(map);
    } catch {
      setDebts({});
    }

    api<PriceListLite[]>("/pricing/lists")
      .then(setPriceLists)
      .catch(() => setPriceLists([]));

    api<SellerOptions>("/sellers/options")
      .then(setSellerOptions)
      .catch(() => undefined);

    loadModules().then(setModules);
  }

  function priceListName(id: number | null | undefined) {
    if (!id) return null;
    const list = priceLists.find(item => item.id === id);
    return list && list.active ? list.name : null;
  }

  // ============================================================
  // CARGAR CLIENTES
  // ============================================================

  async function loadCustomers() {
    try {
      setLoading(true);
      setError("");

      const token =
        localStorage.getItem("velora_token");

      const response = await fetch(
        `${API_URL}/customers`,
        {
          method: "GET",

          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail ||
          "No se pudieron cargar los clientes."
        );
      }

      setCustomers(data);

    } catch (err) {
      console.error(
        "Error cargando clientes:",
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : "No se pudieron cargar los clientes."
      );

    } finally {
      setLoading(false);
    }
  }

  // ============================================================
  // CARGAR AL ENTRAR
  // ============================================================

  useEffect(() => {
    loadCustomers();
    loadExtras();
  }, []);

  // ============================================================
  // ABRIR CREACIÓN
  // ============================================================

  function openCreateForm() {
    setEditingCustomer(null);

    setForm({
      ...emptyForm,
    });

    setDebtDetail(null);

    setError("");

    setModalOpen(true);
  }

  // ============================================================
  // ABRIR EDICIÓN
  // ============================================================

  function openEditForm(
    customer: Customer
  ) {
    setEditingCustomer(customer);

    setForm({
      name: customer.name || "",
      email: customer.email || "",
      phone: customer.phone || "",
      address: customer.address || "",
      city: customer.city || "",
      tax_id: customer.tax_id || "",
      notes: customer.notes || "",
      payment_terms: customer.payment_terms || "cash",
      credit_limit: customer.credit_limit
        ? String(customer.credit_limit)
        : "",
      price_list_id: customer.price_list_id
        ? String(customer.price_list_id)
        : "",
      seller_id: customer.seller_id
        ? String(customer.seller_id)
        : "",
    });

    setError("");

    setModalOpen(true);

    // saldo y detalle de lo impago (para la ficha)
    setDebtDetail(null);

    api<CustomerDebt>(`/customers/${customer.id}/debt`)
      .then(setDebtDetail)
      .catch(() => setDebtDetail(null));
  }

  // ============================================================
  // CERRAR MODAL
  // ============================================================

  function closeModal() {
    if (saving) {
      return;
    }

    setModalOpen(false);

    setEditingCustomer(null);

    setForm({
      ...emptyForm,
    });

    setError("");
  }

  // ============================================================
  // CAMBIAR CAMPO
  // ============================================================

  function updateField(
    field: keyof CustomerForm,
    value: string
  ) {
    setForm(current => ({
      ...current,
      [field]: value,
    }));
  }

  // ============================================================
  // GUARDAR CLIENTE
  // ============================================================

  async function saveCustomer(
    event: FormEvent
  ) {
    event.preventDefault();

    if (!form.name.trim()) {
      setError(
        "El nombre del cliente es obligatorio."
      );

      return;
    }

    try {
      setSaving(true);

      setError("");

      const token =
        localStorage.getItem("velora_token");

      const isEditing =
        editingCustomer !== null;

      const url = isEditing
        ? `${API_URL}/customers/${editingCustomer.id}`
        : `${API_URL}/customers`;

      const response = await fetch(
        url,
        {
          method: isEditing
            ? "PUT"
            : "POST",

          headers: {
            "Content-Type":
              "application/json",

            Authorization:
              `Bearer ${token}`,
          },

          body: JSON.stringify({
            name: form.name.trim(),
            email:
              form.email.trim() || null,
            phone:
              form.phone.trim() || null,
            address:
              form.address.trim() || null,
            city:
              form.city.trim() || null,
            tax_id:
              form.tax_id.trim() || null,
            notes:
              form.notes.trim() || null,
            payment_terms: form.payment_terms,
            credit_limit: Number(form.credit_limit || 0),
            price_list_id: form.price_list_id
              ? Number(form.price_list_id)
              : null,
            ...(sellerOptions.enabled
              ? {
                  seller_id: form.seller_id
                    ? Number(form.seller_id)
                    : null,
                }
              : {}),
          }),
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail ||
          "No se pudo guardar el cliente."
        );
      }

      closeModal();

      await loadCustomers();

    } catch (err) {
      console.error(
        "Error guardando cliente:",
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : "No se pudo guardar el cliente."
      );

    } finally {
      setSaving(false);
    }
  }

  // ============================================================
  // ELIMINAR CLIENTE
  // ============================================================

  async function deleteCustomer(
    customer: Customer
  ) {
    const confirmed =
      window.confirm(
        `¿Eliminar a ${customer.name}?`
      );

    if (!confirmed) {
      return;
    }

    try {
      const token =
        localStorage.getItem("velora_token");

      const response = await fetch(
        `${API_URL}/customers/${customer.id}`,
        {
          method: "DELETE",

          headers: {
            Authorization:
              `Bearer ${token}`,
          },
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail ||
          "No se pudo eliminar el cliente."
        );
      }

      await loadCustomers();

    } catch (err) {
      console.error(
        "Error eliminando cliente:",
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : "No se pudo eliminar el cliente."
      );
    }
  }

  // ============================================================
  // FILTRO
  // ============================================================

  const withDebt = customers.filter(
    customer => (debts[customer.id]?.balance || 0) > 0
  ).length;

  const withOverdue = customers.filter(
    customer => (debts[customer.id]?.overdue_amount || 0) > 0
  ).length;

  const filteredCustomers =
    customers.filter(customer => {
      const debt = debts[customer.id];

      if (
        debtFilter === "deuda" &&
        !(debt && debt.balance > 0)
      ) {
        return false;
      }

      if (
        debtFilter === "vencida" &&
        !(debt && debt.overdue_amount > 0)
      ) {
        return false;
      }

      const searchText =
        search
          .toLowerCase()
          .trim();

      if (!searchText) {
        return true;
      }

      return (
        customer.name
          .toLowerCase()
          .includes(searchText) ||

        customer.email
          ?.toLowerCase()
          .includes(searchText) ||

        customer.phone
          ?.toLowerCase()
          .includes(searchText) ||

        customer.tax_id
          ?.toLowerCase()
          .includes(searchText) ||

        customer.city
          ?.toLowerCase()
          .includes(searchText)
      );
    });

  if (sortBy === "deuda") {
    filteredCustomers.sort(
      (a, b) =>
        (debts[b.id]?.balance || 0) -
        (debts[a.id]?.balance || 0)
    );
  }

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <section className="customers-page">

      <div className="customers-header">

        <div>

          <span className="dashboard-eyebrow">
            RELACIONES
          </span>

          <h1>
            Clientes
          </h1>

          <p>
            Administrá los clientes de tu
            distribuidora.
          </p>

        </div>

        <button
          className="primary-button"
          type="button"
          onClick={openCreateForm}
        >
          + Nuevo cliente
        </button>

      </div>


      {/* ======================================================
          ERROR
      ====================================================== */}

      {error && !modalOpen && (
        <div className="customers-error">
          {error}
        </div>
      )}


      {/* ======================================================
          TOOLBAR
      ====================================================== */}

      <div className="customers-toolbar">

        <div className="customers-search">

          <span>
            ⌕
          </span>

          <input
            type="text"
            value={search}
            onChange={event =>
              setSearch(
                event.target.value
              )
            }
            placeholder="Buscar cliente, teléfono, CUIT..."
          />

          {search && (
            <button
              type="button"
              onClick={() =>
                setSearch("")
              }
            >
              ×
            </button>
          )}

        </div>

        <div className="customers-count">

          {filteredCustomers.length}{" "}

          {filteredCustomers.length === 1
            ? "cliente"
            : "clientes"}

        </div>

      </div>


      {/* ======================================================
          FILTRO Y ORDEN POR DEUDA
      ====================================================== */}

      <div className="vx-row" style={{ marginBottom: 14 }}>

        <div className="vx-tabs" role="tablist" style={{ marginBottom: 0 }}>
          <button
            type="button"
            className={debtFilter === "todos" ? "is-on" : ""}
            onClick={() => setDebtFilter("todos")}
          >
            Todos
          </button>
          <button
            type="button"
            className={debtFilter === "deuda" ? "is-on" : ""}
            onClick={() => setDebtFilter("deuda")}
          >
            Con deuda ({withDebt})
          </button>
          <button
            type="button"
            className={debtFilter === "vencida" ? "is-on" : ""}
            onClick={() => setDebtFilter("vencida")}
          >
            Con deuda vencida
            {withOverdue > 0 && (
              <span className="vx-tab-count">{withOverdue}</span>
            )}
          </button>
        </div>

        <label className="vx-check">
          Ordenar por
          <select
            className="vx-input"
            style={{ width: "auto" }}
            value={sortBy}
            onChange={event =>
              setSortBy(
                event.target.value === "deuda"
                  ? "deuda"
                  : "nombre"
              )
            }
          >
            <option value="nombre">Nombre</option>
            <option value="deuda">Mayor deuda primero</option>
          </select>
        </label>

      </div>


      {/* ======================================================
          TABLA
      ====================================================== */}

      <div className="customers-table-container">

        {loading ? (

          <div className="customers-loading">

            <div className="customers-loading-spinner" />

            <span>
              Cargando clientes...
            </span>

          </div>

        ) : filteredCustomers.length === 0 ? (

          <div className="customers-empty">

            <div className="customers-empty-icon">
              ◯
            </div>

            <h3>
              {customers.length === 0
                ? "No hay clientes"
                : "No encontramos clientes"}
            </h3>

            <p>
              {customers.length === 0
                ? "Cuando agregues clientes aparecerán aquí."
                : "Probá con otro nombre, teléfono o CUIT."}
            </p>

            {customers.length === 0 && (
              <button
                className="secondary-button"
                type="button"
                onClick={openCreateForm}
              >
                Crear primer cliente
              </button>
            )}

          </div>

        ) : (

          <div className="customers-table-wrapper">

            <table className="customers-table">

              <thead>

                <tr>

                  <th>
                    Cliente
                  </th>

                  <th>
                    Contacto
                  </th>

                  <th>
                    Ubicación
                  </th>

                  <th>
                    Identificación
                  </th>

                  <th>
                    Estado
                  </th>

                  <th>
                    Acciones
                  </th>

                </tr>

              </thead>

              <tbody>

                {filteredCustomers.map(
                  customer => (

                    <tr
                      key={customer.id}
                    >

                      <td>

                        <div className="customer-name">
                          {customer.name}
                        </div>

                        {customer.notes && (
                          <div className="customer-notes">
                            {customer.notes}
                          </div>
                        )}

                        {(() => {
                          const debt = debts[customer.id];
                          const listName = priceListName(
                            customer.price_list_id
                          );

                          if (
                            !(debt && debt.balance > 0) &&
                            !listName
                          ) {
                            return null;
                          }

                          return (
                            <div className="vx-badges">
                              {debt && debt.balance > 0 && (
                                <span className="vx-badge is-warn">
                                  Debe {money(debt.balance)}
                                </span>
                              )}
                              {debt && debt.overdue_amount > 0 && (
                                <span className="vx-badge is-bad">
                                  Vencida hace {debt.overdue_days}{" "}
                                  {debt.overdue_days === 1
                                    ? "día"
                                    : "días"}
                                </span>
                              )}
                              {debt && debt.over_limit && (
                                <span className="vx-badge is-bad">
                                  Supera su límite
                                </span>
                              )}
                              {listName && (
                                <span className="vx-badge is-info">
                                  Lista: {listName}
                                </span>
                              )}
                            </div>
                          );
                        })()}

                      </td>


                      <td>

                        <div className="customer-contact">

                          {customer.phone && (
                            <span>
                              {customer.phone}
                            </span>
                          )}

                          {customer.email && (
                            <span>
                              {customer.email}
                            </span>
                          )}

                          {!customer.phone &&
                            !customer.email && (
                              <span>
                                —
                              </span>
                            )}

                        </div>

                      </td>


                      <td>

                        {customer.city ||
                          customer.address ||
                          "—"}

                      </td>


                      <td>

                        {customer.tax_id ||
                          "—"}

                      </td>


                      <td>

                        <span className="status-active">

                          <span className="status-dot" />

                          Activo

                        </span>

                      </td>


                      <td>

                        <div className="customer-actions">

                          <button
                            type="button"
                            className="customer-action-edit"
                            onClick={() =>
                              openEditForm(
                                customer
                              )
                            }
                          >
                            Editar
                          </button>

                          <button
                            type="button"
                            className="customer-action-delete"
                            onClick={() =>
                              deleteCustomer(
                                customer
                              )
                            }
                          >
                            Eliminar
                          </button>

                        </div>

                      </td>

                    </tr>

                  )
                )}

              </tbody>

            </table>

          </div>

        )}

      </div>


      {/* ======================================================
          MODAL
      ====================================================== */}

      {modalOpen && (

        <div
          className="modal-overlay"
          onClick={closeModal}
        >

          <div
            className="customer-modal"
            onClick={event =>
              event.stopPropagation()
            }
          >

            <div className="modal-header">

              <div>

                <span className="dashboard-eyebrow">
                  CLIENTES
                </span>

                <h2>
                  {editingCustomer
                    ? "Editar cliente"
                    : "Nuevo cliente"}
                </h2>

              </div>

              <button
                type="button"
                className="modal-close"
                onClick={closeModal}
                disabled={saving}
              >
                ×
              </button>

            </div>


            {error && (
              <div className="customers-modal-error">
                {error}
              </div>
            )}


            {editingCustomer &&
              debtDetail &&
              debtDetail.balance > 0 && (
                <div
                  className={`vx-note ${
                    debtDetail.overdue_amount > 0 ||
                    debtDetail.over_limit
                      ? "is-bad"
                      : "is-warn"
                  }`}
                  style={{ flexDirection: "column" }}
                >
                  <span>
                    <strong>
                      Debe {money(debtDetail.balance)}
                    </strong>
                    {debtDetail.overdue_amount > 0 && (
                      <>
                        {" · "}
                        {money(debtDetail.overdue_amount)} vencido
                        hace {debtDetail.overdue_days}{" "}
                        {debtDetail.overdue_days === 1
                          ? "día"
                          : "días"}
                      </>
                    )}
                    {debtDetail.over_limit && (
                      <>
                        {" · "}supera su límite de crédito (
                        {money(debtDetail.credit_limit)})
                      </>
                    )}
                  </span>

                  {(debtDetail.open_invoices || []).length > 0 && (
                    <div
                      className="vx-table-wrap"
                      style={{ width: "100%" }}
                    >
                      <table className="vx-table">
                        <thead>
                          <tr>
                            <th>Factura</th>
                            <th>Fecha</th>
                            <th>Vence</th>
                            <th className="vx-r">Falta pagar</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(debtDetail.open_invoices || []).map(
                            invoice => (
                              <tr key={invoice.invoice_id}>
                                <td>
                                  {invoice.invoice_type}{" "}
                                  {invoice.formatted_number}
                                </td>
                                <td>
                                  {shortDate(invoice.issue_date)}
                                </td>
                                <td>
                                  {shortDate(invoice.due_date)}
                                  {invoice.overdue && (
                                    <small className="vx-neg">
                                      Vencida hace{" "}
                                      {invoice.overdue_days} d
                                    </small>
                                  )}
                                </td>
                                <td className="vx-r">
                                  {money(invoice.pending)}
                                </td>
                              </tr>
                            )
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {moduleOn(modules, "cuentas") && (
                    <button
                      type="button"
                      className="vx-linkbtn"
                      onClick={() =>
                        navigate(
                          `/accounts?cliente=${editingCustomer.id}`
                        )
                      }
                    >
                      Ver la cuenta corriente y registrar un pago →
                    </button>
                  )}
                </div>
              )}

            {editingCustomer &&
              debtDetail &&
              debtDetail.balance <= 0 && (
                <div className="vx-note is-ok">
                  <span>Este cliente no tiene deuda.</span>
                </div>
              )}

            <form
              className="customer-form"
              onSubmit={saveCustomer}
            >

              <div className="form-row">

                <div className="form-group">

                  <label>
                    Nombre *
                  </label>

                  <input
                    type="text"
                    value={form.name}
                    onChange={event =>
                      updateField(
                        "name",
                        event.target.value
                      )
                    }
                    placeholder="Nombre o razón social"
                    autoFocus
                  />

                </div>


                <div className="form-group">

                  <label>
                    CUIT / Identificación
                  </label>

                  <input
                    type="text"
                    value={form.tax_id}
                    onChange={event =>
                      updateField(
                        "tax_id",
                        event.target.value
                      )
                    }
                    placeholder="Ej. 20-12345678-9"
                  />

                </div>

              </div>


              <div className="form-row">

                <div className="form-group">

                  <label>
                    Teléfono
                  </label>

                  <input
                    type="text"
                    value={form.phone}
                    onChange={event =>
                      updateField(
                        "phone",
                        event.target.value
                      )
                    }
                    placeholder="+54 9..."
                  />

                </div>


                <div className="form-group">

                  <label>
                    Email
                  </label>

                  <input
                    type="email"
                    value={form.email}
                    onChange={event =>
                      updateField(
                        "email",
                        event.target.value
                      )
                    }
                    placeholder="cliente@email.com"
                  />

                </div>

              </div>


              <div className="form-row">

                <div className="form-group">

                  <label>
                    Dirección
                  </label>

                  <input
                    type="text"
                    value={form.address}
                    onChange={event =>
                      updateField(
                        "address",
                        event.target.value
                      )
                    }
                    placeholder="Dirección"
                  />

                </div>


                <div className="form-group">

                  <label>
                    Ciudad
                  </label>

                  <input
                    type="text"
                    value={form.city}
                    onChange={event =>
                      updateField(
                        "city",
                        event.target.value
                      )
                    }
                    placeholder="Ciudad"
                  />

                </div>

              </div>


              <div className="form-row">

                <div className="form-group">

                  <label>
                    Condición de pago
                  </label>

                  <select
                    value={form.payment_terms}
                    onChange={event =>
                      updateField(
                        "payment_terms",
                        event.target.value
                      )
                    }
                  >
                    {PAYMENT_TERMS.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                    {!PAYMENT_TERMS.some(
                      ([value]) => value === form.payment_terms
                    ) && (
                      <option value={form.payment_terms}>
                        {form.payment_terms}
                      </option>
                    )}
                  </select>

                </div>


                <div className="form-group">

                  <label>
                    Límite de crédito
                  </label>

                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.credit_limit}
                    onChange={event =>
                      updateField(
                        "credit_limit",
                        event.target.value
                      )
                    }
                    placeholder="0 = sin límite"
                  />

                </div>

              </div>


              <div className="form-row">

                <div className="form-group">

                  <label>
                    Lista de precios
                  </label>

                  <select
                    value={form.price_list_id}
                    onChange={event =>
                      updateField(
                        "price_list_id",
                        event.target.value
                      )
                    }
                  >
                    <option value="">
                      {priceLists.some(
                        list => list.is_default && list.active
                      )
                        ? "La lista por defecto"
                        : "Precio base (sin lista)"}
                    </option>
                    {priceLists
                      .filter(
                        list =>
                          list.active ||
                          String(list.id) === form.price_list_id
                      )
                      .map(list => (
                        <option key={list.id} value={list.id}>
                          {list.name}
                          {list.active ? "" : " (desactivada)"}
                        </option>
                      ))}
                  </select>

                </div>


                {sellerOptions.enabled && (
                  <div className="form-group">

                    <label>
                      Vendedor asignado
                    </label>

                    <select
                      value={form.seller_id}
                      onChange={event =>
                        updateField(
                          "seller_id",
                          event.target.value
                        )
                      }
                    >
                      <option value="">Sin vendedor fijo</option>
                      {sellerOptions.sellers.map(seller => (
                        <option
                          key={seller.id}
                          value={seller.id}
                        >
                          {seller.name}
                        </option>
                      ))}
                    </select>

                  </div>
                )}

              </div>


              <div className="form-group">

                <label>
                  Notas
                </label>

                <textarea
                  value={form.notes}
                  onChange={event =>
                    updateField(
                      "notes",
                      event.target.value
                    )
                  }
                  placeholder="Información adicional del cliente..."
                  rows={3}
                />

              </div>


              <div className="modal-actions">

                <button
                  type="button"
                  className="secondary-button"
                  onClick={closeModal}
                  disabled={saving}
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  className="primary-button"
                  disabled={saving}
                >
                  {saving
                    ? "Guardando..."
                    : editingCustomer
                      ? "Guardar cambios"
                      : "Crear cliente"}
                </button>

              </div>

            </form>

          </div>

        </div>

      )}

    </section>
  );
}

export default Customers;