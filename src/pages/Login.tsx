import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { BrandFooter, BrandLockup } from "../components/Brand";
import { API_URL } from "../apiBase";
import { BajaLoginLink } from "../components/ServiceCancel";


function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError("");
    setLoading(true);
    
    try {
  const adminRes = await fetch(`${API_URL}/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (adminRes.ok) {
    const data = await adminRes.json();
    localStorage.setItem("velora_admin_token", data.access_token);
    navigate("/admin/systems");
    return;
  }
} catch {}

    try {
      const formData = new URLSearchParams();

      formData.append("username", email);
      formData.append("password", password);

      const response = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: formData.toString(),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail || "El email o la contraseña son incorrectos."
        );
      }

      localStorage.setItem("velora_token", data.access_token);
      localStorage.setItem(
        "velora_user",
        JSON.stringify(data.user)
      );

      window.location.href = "/dashboard";
    } catch (error) {
      setError(
        error instanceof TypeError
          ? "No se pudo conectar con el servidor."
          : error instanceof Error ? error.message : "No se pudo ingresar."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="login-brand">
          <BrandLockup size={46} />
        </div>

        <div className="login-heading">
          <h1>Bienvenido</h1>
          <p>
            Ingresá a tu cuenta para continuar.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="email">
              Email
            </label>

            <input
              id="email"
              type="email"
              placeholder="tu@email.com"
              value={email}
              onChange={(event) =>
                setEmail(event.target.value)
              }
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">
              Contraseña
            </label>

            <input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(event) =>
                setPassword(event.target.value)
              }
              required
            />
          </div>

          {error && (
            <div className="login-error">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="login-button"
            disabled={loading}
          >
            {loading ? "Ingresando..." : "Ingresar"}
          </button>
        </form>

        <div className="login-footer" style={{ flexDirection: "column" }}>
          <BrandFooter />
          <BajaLoginLink className="sc-link sc-login-link" />
        </div>
      </section>
    </main>
  );
}

export default Login;