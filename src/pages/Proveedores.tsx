import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { API_URL } from "../apiBase";

interface Supplier {
  id: number;
  company_id: number;
  name: string;
  tax_id: string | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  payment_terms: string;
  notes: string | null;
  active: boolean;
}


function authHeaders() {
  const token = localStorage.getItem("velora_token");
  return { Authorization: `Bearer ${token}` };
}

function Proveedores() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);

  const [name, setName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("cash");
  const [notes, setNotes] = useState("");

  async function loadSuppliers() {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/suppliers`, {
        headers: authHeaders(),
      });
      if (!response.ok) throw new Error(`No se pudieron cargar (${response.status})`);
      setSuppliers(await response.json());
    } catch (error) {
      console.error("Error cargando proveedores:", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSuppliers();
  }, []);

  function resetForm() {
    setName("");
    setTaxId("");
    setContactName("");
    setEmail("");
    setPhone("");
    setAddress("");
    setCity("");
    setPaymentTerms("cash");
    setNotes("");
    setEditingSupplier(null);
  }

  function openCreateForm() {
    resetForm();
    setShowForm(true);
  }

  function openEditForm(supplier: Supplier) {
    setEditingSupplier(supplier);
    setName(supplier.name);
    setTaxId(supplier.tax_id || "");
    setContactName(supplier.contact_name || "");
    setEmail(supplier.email || "");
    setPhone(supplier.phone || "");
    setAddress(supplier.address || "");
    setCity(supplier.city || "");
    setPaymentTerms(supplier.payment_terms);
    setNotes(supplier.notes || "");
    setShowForm(true);
  }

  function closeForm() {
    resetForm();
    setShowForm(false);
  }

  async function saveSupplier(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);

    try {
      const isEditing = editingSupplier !== null;
      const url = isEditing
        ? `${API_URL}/suppliers/${editingSupplier.id}`
        : `${API_URL}/suppliers`;

      const response = await fetch(url, {
        method: isEditing ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify({
          name,
          tax_id: taxId || null,
          contact_name: contactName || null,
          email: email || null,
          phone: phone || null,
          address: address || null,
          city: city || null,
          payment_terms: paymentTerms,
          notes: notes || null,
          active: true,
        }),
      });

      if (!response.ok) throw new Error("No se pudo guardar el proveedor");

      closeForm();
      await loadSuppliers();
    } catch (error) {
      console.error("Error guardando proveedor:", error);
      alert("No se pudo guardar el proveedor.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteSupplier(supplier: Supplier) {
    const confirmed = window.confirm(`¿Eliminar "${supplier.name}"?`);
    if (!confirmed) return;

    try {
      const response = await fetch(`${API_URL}/suppliers/${supplier.id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!response.ok) throw new Error("No se pudo eliminar");
      await loadSuppliers();
    } catch (error) {
      console.error("Error eliminando proveedor:", error);
      alert("No se pudo eliminar el proveedor.");
    }
  }

  const filteredSuppliers = suppliers.filter((supplier) => {
    const searchText = search.toLowerCase().trim();
    if (!searchText) return true;
    return (
      supplier.name.toLowerCase().includes(searchText) ||
      (supplier.tax_id || "").toLowerCase().includes(searchText)
    );
  });

  return (
    <section className="products-page">
      <div className="products-header">
        <div>
          <span className="dashboard-eyebrow">ABASTECIMIENTO</span>
          <h1>Proveedores</h1>
          <p>Administrá tus proveedores y datos de contacto.</p>
        </div>
        <div className="products-header-actions">
          <button className="primary-button" onClick={openCreateForm} type="button">
            + Nuevo proveedor
          </button>
        </div>
      </div>

      <div className="products-toolbar">
        <div className="products-search">
          <span className="products-search-icon">⌕</span>
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar proveedor, CUIT..."
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
          {filteredSuppliers.length}{" "}
          {filteredSuppliers.length === 1 ? "proveedor" : "proveedores"}
        </div>
      </div>

      <div className="products-table-container">
        {loading ? (
          <div className="products-loading">
            <div className="products-loading-spinner" />
            <span>Cargando proveedores...</span>
          </div>
        ) : filteredSuppliers.length === 0 ? (
          <div className="products-empty">
            <div className="products-empty-icon">◯</div>
            <h3>No hay proveedores</h3>
            <p>Cuando agregues proveedores aparecerán acá.</p>
          </div>
        ) : (
          <div className="products-table-wrapper">
            <table className="products-table">
              <thead>
                <tr>
                  <th>Proveedor</th>
                  <th>CUIT</th>
                  <th>Contacto</th>
                  <th>Teléfono</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredSuppliers.map((supplier) => (
                  <tr key={supplier.id}>
                    <td>
                      <div className="product-name">{supplier.name}</div>
                    </td>
                    <td>{supplier.tax_id || "—"}</td>
                    <td>{supplier.contact_name || "—"}</td>
                    <td>{supplier.phone || "—"}</td>
                    <td>
                      <div className="product-actions">
                        <button
                          type="button"
                          className="product-action-edit"
                          onClick={() => openEditForm(supplier)}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          className="product-action-delete"
                          onClick={() => deleteSupplier(supplier)}
                        >
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && (
        <div className="modal-overlay" onClick={closeForm}>
          <div className="product-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <span className="dashboard-eyebrow">PROVEEDORES</span>
                <h2>{editingSupplier ? "Editar proveedor" : "Nuevo proveedor"}</h2>
              </div>
              <button className="modal-close" onClick={closeForm} type="button">
                ×
              </button>
            </div>

            <form onSubmit={saveSupplier} className="product-form">
              <div className="form-group">
                <label>Razón social</label>
                <input
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>CUIT</label>
                  <input
                    type="text"
                    value={taxId}
                    onChange={(event) => setTaxId(event.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Contacto</label>
                  <input
                    type="text"
                    value={contactName}
                    onChange={(event) => setContactName(event.target.value)}
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Teléfono</label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Dirección</label>
                  <input
                    type="text"
                    value={address}
                    onChange={(event) => setAddress(event.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Ciudad</label>
                  <input
                    type="text"
                    value={city}
                    onChange={(event) => setCity(event.target.value)}
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Condiciones de pago</label>
                <select
                  value={paymentTerms}
                  onChange={(event) => setPaymentTerms(event.target.value)}
                >
                  <option value="cash">Contado</option>
                  <option value="15_days">15 días</option>
                  <option value="30_days">30 días</option>
                  <option value="60_days">60 días</option>
                </select>
              </div>

              <div className="form-group">
                <label>Notas</label>
                <textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  rows={3}
                />
              </div>

              <div className="modal-actions">
                <button type="button" className="secondary-button" onClick={closeForm}>
                  Cancelar
                </button>
                <button type="submit" className="primary-button" disabled={saving}>
                  {saving ? "Guardando..." : "Guardar proveedor"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}

export default Proveedores;