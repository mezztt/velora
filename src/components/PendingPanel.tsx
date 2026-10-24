import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../extras";

// ============================================================
// PENDIENTES — lo que requiere acción hoy (arriba del Inicio)
// ============================================================

interface PendingItem {
  key: string;
  label: string;
  count: number;
  path: string;
  tone: "warn" | "bad" | "info";
  hint: string | null;
}

export default function PendingPanel() {
  const navigate = useNavigate();
  const [items, setItems] = useState<PendingItem[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    api<{ items: PendingItem[] }>("/dashboard/pending")
      .then((data) => setItems(data.items))
      .catch(() => setFailed(true));
  }, []);

  if (failed) return null; // si no se pudo cargar, el Inicio se ve igual que siempre

  return (
    <section className="vx-pending" aria-label="Pendientes">
      <div className="vx-pending-head">
        <h2>Pendientes</h2>
        {items && items.length > 0 && <span>Tocá cada uno para ir a resolverlo</span>}
      </div>
      {items === null ? (
        <span className="vx-muted">Revisando…</span>
      ) : items.length === 0 ? (
        <div className="vx-pending-ok"><span aria-hidden="true">✓</span> Todo al día</div>
      ) : (
        <div className="vx-pending-grid">
          {items.map((item) => (
            <button key={item.key} type="button" className={`vx-pending-item is-${item.tone}`} onClick={() => navigate(item.path)}>
              <span className="vx-pending-count">{item.count}</span>
              <span className="vx-pending-text">
                <strong>{item.label}</strong>
                {item.hint && <small>{item.hint}</small>}
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
