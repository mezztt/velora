import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { API_URL } from "../apiBase";

interface UserItem {
  id: number;
  name: string;
  email: string;
  role: string;
  active: boolean;
}


function authHeaders() {
  const token = localStorage.getItem("velora_token");
  return { Authorization: `Bearer ${token}` };
}

const ROLES = ["ADMINISTRADOR", "ENCARGADO", "VENDEDOR", "CAJERO", "DEPOSITO"];

function Usuarios() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("VENDEDOR");
  const [saving, setSaving] = useState(false);

  async function loadUsers() {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/users`, { headers: authHeaders() });
      if (!response.ok) throw new Error("No se pudieron cargar los usuarios");
      setUsers(await response.json());
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
  }, []);

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await fetch(`${API_URL}/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ name, email, password, role }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "No se pudo crear el usuario");
      setShowForm(false);
      setName(""); setEmail(""); setPassword(""); setRole("VENDEDOR");
      await loadUsers();
    } catch (error) {
      alert(error instanceof Error ? error.message : "No se pudo crear el usuario.");
    } finally {
      setSaving(false);
    }
  }

  async function updateUser(id: number, changes: Partial<UserItem>) {
    try {
      const response = await fetch(`${API_URL}/users/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(changes),
      });
      if (!response.ok) throw new Error();
      await loadUsers();
    } catch {
      alert("No se pudo actualizar el usuario.");
    }
  }

  return (
    <section className="products-page">
      <div className="products-header">
        <div>
          <span className="dashboard-eyebrow">SISTEMA</span>
          <h1>Usuarios</h1>
          <p>Roles y permisos de acceso a Velora.</p>
        </div>
        <div className="products-header-actions">
          <button className="primary-button" onClick={() => setShowForm(true)}>+ Nuevo usuario</button>
        </div>
      </div>

      <div className="products-table-container">
        {loading ? (
          <div className="products-loading">
            <div className="products-loading-spinner" />
            <span>Cargando...</span>
          </div>
        ) : (
          <div className="products-table-wrapper">
            <table className="products-table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Email</th>
                  <th>Rol</th>
                  <th>Estado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td><div className="product-name">{user.name}</div></td>
                    <td>{user.email}</td>
                    <td>
                      <select
                        value={user.role}
                        onChange={(event) => updateUser(user.id, { role: event.target.value })}
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <span className="status-active" data-status={user.active ? "ACTIVO" : "INACTIVO"}>
                        <span className="status-dot" />
                        {user.active ? "Activo" : "Inactivo"}
                      </span>
                    </td>
                    <td>
                      <button
                        className="product-action-edit"
                        onClick={() => updateUser(user.id, { active: !user.active })}
                      >
                        {user.active ? "Desactivar" : "Activar"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="product-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <span className="dashboard-eyebrow">USUARIOS</span>
                <h2>Nuevo usuario</h2>
              </div>
              <button className="modal-close" onClick={() => setShowForm(false)}>×</button>
            </div>
            <form onSubmit={createUser} className="product-form">
              <div className="form-group">
                <label>Nombre</label>
                <input value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <div className="form-group">
                <label>Email</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div className="form-group">
                <label>Contraseña</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </div>
              <div className="form-group">
                <label>Rol</label>
                <select value={role} onChange={(e) => setRole(e.target.value)}>
                  {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div className="modal-actions">
                <button type="button" className="secondary-button" onClick={() => setShowForm(false)}>Cancelar</button>
                <button type="submit" className="primary-button" disabled={saving}>
                  {saving ? "Creando..." : "Crear usuario"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}

export default Usuarios;