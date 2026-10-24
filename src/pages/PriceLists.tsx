import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { api, errorText, money } from "../extras";

// ============================================================
// LISTAS DE PRECIOS (pestaña dentro de Productos)
// ============================================================

interface PriceList {
  id: number;
  name: string;
  kind: "PERCENT" | "CUSTOM";
  percent: number;
  is_default: boolean;
  active: boolean;
  customers_count: number;
  items_count: number;
}

interface ListItem {
  product_id: number;
  name: string;
  sku: string | null;
  base_price: number;
  price: number | null;
  final_price: number;
}

interface ImportResult { saved: number; not_found: string[]; not_found_count: number; bad_lines: number[] }

const EMPTY_FORM = { name: "", kind: "PERCENT" as "PERCENT" | "CUSTOM", sign: "-", percent: "", is_default: false, active: true };

function describe(pl: PriceList): string {
  if (pl.kind === "CUSTOM") return `Precios propios · ${pl.items_count} producto${pl.items_count === 1 ? "" : "s"} cargado${pl.items_count === 1 ? "" : "s"}`;
  if (pl.percent === 0) return "Igual al precio base";
  return `${pl.percent > 0 ? "+" : "−"}${Math.abs(pl.percent)}% sobre el precio base`;
}

export default function PriceLists({ canEdit }: { canEdit: boolean }) {
  const [lists, setLists] = useState<PriceList[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [toast, setToast] = useState<{ text: string; tone: "ok" | "error" } | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<PriceList | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);

  const [items, setItems] = useState<ListItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [search, setSearch] = useState("");
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [onlyOwn, setOnlyOwn] = useState(false);

  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  function notify(text: string, tone: "ok" | "error" = "ok") {
    setToast({ text, tone });
    window.setTimeout(() => setToast(null), 3200);
  }

  async function loadLists(keep?: number | null) {
    try {
      const data = await api<PriceList[]>("/pricing/lists");
      setLists(data);
      const wanted = keep !== undefined ? keep : selectedId;
      if (wanted && data.some((l) => l.id === wanted)) setSelectedId(wanted);
      else setSelectedId(data.find((l) => l.active)?.id ?? data[0]?.id ?? null);
    } catch (e) {
      notify(errorText(e, "No se pudieron cargar las listas"), "error");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { loadLists(); }, []);

  const selected = lists.find((l) => l.id === selectedId) || null;

  async function loadItems(listId: number) {
    setLoadingItems(true);
    try {
      const data = await api<{ items: ListItem[] }>(`/pricing/lists/${listId}/items`);
      setItems(data.items);
      setDrafts({});
    } catch (e) {
      notify(errorText(e, "No se pudieron cargar los precios"), "error");
    } finally {
      setLoadingItems(false);
    }
  }
  useEffect(() => {
    if (selectedId) loadItems(selectedId); else setItems([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  function openCreate() {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    setShowForm(true);
  }
  function openEdit(pl: PriceList) {
    setEditing(pl);
    setForm({
      name: pl.name, kind: pl.kind, sign: pl.percent > 0 ? "+" : "-",
      percent: pl.percent ? String(Math.abs(pl.percent)) : "", is_default: pl.is_default, active: pl.active,
    });
    setShowForm(true);
  }

  async function saveList(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const pct = Number(form.percent || 0) * (form.sign === "-" ? -1 : 1);
      const body = { name: form.name, kind: form.kind, percent: form.kind === "PERCENT" ? pct : 0, is_default: form.is_default, active: form.active };
      const saved = editing
        ? await api<PriceList>(`/pricing/lists/${editing.id}`, "PUT", body)
        : await api<PriceList>("/pricing/lists", "POST", body);
      setShowForm(false);
      await loadLists(saved.id);
      if (saved.id === selectedId) await loadItems(saved.id);
      notify(editing ? "Lista actualizada" : `Lista "${saved.name}" creada`);
    } catch (err) {
      notify(errorText(err, "No se pudo guardar la lista"), "error");
    } finally {
      setSaving(false);
    }
  }

  async function deactivate(pl: PriceList) {
    if (!window.confirm(`¿Desactivar la lista "${pl.name}"? Los clientes que la tienen pasan al precio base.`)) return;
    try {
      await api(`/pricing/lists/${pl.id}`, "DELETE");
      await loadLists(pl.id);
      notify("Lista desactivada");
    } catch (err) {
      notify(errorText(err), "error");
    }
  }

  const dirtyCount = Object.keys(drafts).length;

  async function saveDrafts() {
    if (!selected || !dirtyCount) return;
    setSaving(true);
    try {
      const body = {
        items: Object.entries(drafts).map(([id, v]) => ({
          product_id: Number(id),
          price: v.trim() === "" ? null : Number(v.replace(",", ".")),
        })),
      };
      if (body.items.some((i) => i.price !== null && (isNaN(i.price) || i.price < 0))) {
        throw new Error("Hay precios mal escritos. Usá solo números.");
      }
      await api(`/pricing/lists/${selected.id}/items`, "PUT", body);
      await loadItems(selected.id);
      await loadLists(selected.id);
      notify("Precios guardados");
    } catch (err) {
      notify(errorText(err, "No se pudieron guardar los precios"), "error");
    } finally {
      setSaving(false);
    }
  }

  async function runImport() {
    if (!selected || !importText.trim()) return;
    setSaving(true);
    try {
      const res = await api<ImportResult>(`/pricing/lists/${selected.id}/import`, "POST", { text: importText });
      setImportResult(res);
      await loadItems(selected.id);
      await loadLists(selected.id);
    } catch (err) {
      notify(errorText(err, "No se pudo importar"), "error");
    } finally {
      setSaving(false);
    }
  }

  const visibleItems = useMemo(() => {
    const t = search.trim().toLowerCase();
    return items.filter((i) =>
      (!onlyOwn || i.price !== null || drafts[i.product_id] !== undefined) &&
      (!t || i.name.toLowerCase().includes(t) || (i.sku || "").toLowerCase().includes(t)));
  }, [items, search, onlyOwn, drafts]);

  return (
    <div>
      {toast && <div className={`vx-toast is-${toast.tone}`} role="status">{toast.text}</div>}

      <div className="vx-note is-info">
        <span>
          Cada cliente puede tener una lista asignada (se elige en <strong>Clientes</strong>). Al cargarle un pedido o una venta,
          el sistema usa solo el precio de su lista. Sin lista, se usa el precio base del producto.
        </span>
      </div>

      {loading ? (
        <div className="products-loading"><div className="products-loading-spinner" /><span>Cargando listas...</span></div>
      ) : lists.length === 0 ? (
        <div className="vx-panel">
          <div className="vx-empty">
            <strong>Todavía no tenés listas de precios</strong>
            Creá una, por ejemplo “Mayorista −15%”, y asignásela a tus clientes.
            {canEdit && <div><button className="primary-button" onClick={openCreate}>+ Nueva lista</button></div>}
          </div>
        </div>
      ) : (
        <div className="vx-split">
          <div className="vx-panel">
            <div className="vx-panel-head">
              <h2>Listas</h2>
              {canEdit && <button className="primary-button" onClick={openCreate}>+ Nueva lista</button>}
            </div>
            <div className="vx-list">
              {lists.map((pl) => (
                <button key={pl.id} type="button" className={`vx-list-item ${selectedId === pl.id ? "is-on" : ""}`} onClick={() => setSelectedId(pl.id)}>
                  <span>
                    <strong>{pl.name}</strong>
                    <small>{describe(pl)}</small>
                    <small>{pl.customers_count} cliente{pl.customers_count === 1 ? "" : "s"}</small>
                  </span>
                  <span className="vx-badges">
                    {pl.is_default && <span className="vx-badge is-info">Por defecto</span>}
                    {!pl.active && <span className="vx-badge">Desactivada</span>}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {selected && (
            <div className="vx-panel">
              <div className="vx-panel-head">
                <div>
                  <h2>{selected.name}</h2>
                  <p className="vx-sub">
                    {describe(selected)}
                    {selected.is_default && " · se usa para los clientes que no tienen otra lista asignada"}
                  </p>
                </div>
                {canEdit && (
                  <div className="vx-row">
                    <button className="secondary-button" onClick={() => openEdit(selected)}>Editar lista</button>
                    {selected.active && <button className="product-action-delete" onClick={() => deactivate(selected)}>Desactivar</button>}
                  </div>
                )}
              </div>

              <div className="vx-row" style={{ marginBottom: 12 }}>
                <div className="products-search" style={{ flex: 1, minWidth: 220 }}>
                  <span className="products-search-icon">⌕</span>
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar producto o SKU..." />
                </div>
                {selected.kind === "CUSTOM" && (
                  <>
                    <label className="vx-check">
                      <input type="checkbox" checked={onlyOwn} onChange={(e) => setOnlyOwn(e.target.checked)} />
                      Solo con precio propio
                    </label>
                    {canEdit && <button className="secondary-button" onClick={() => { setImportText(""); setImportResult(null); setShowImport(true); }}>Pegar desde Excel</button>}
                  </>
                )}
              </div>

              {selected.kind === "CUSTOM" && (
                <p className="vx-hint" style={{ marginBottom: 10 }}>
                  Escribí el precio de esta lista en cada producto. Si lo dejás vacío, ese producto usa el precio base.
                </p>
              )}

              {loadingItems ? (
                <div className="products-loading"><div className="products-loading-spinner" /><span>Cargando precios...</span></div>
              ) : visibleItems.length === 0 ? (
                <div className="vx-empty">No hay productos con ese filtro.</div>
              ) : (
                <div className="vx-table-wrap vx-table-scroll">
                  <table className="vx-table">
                    <thead>
                      <tr>
                        <th>Producto</th>
                        <th>SKU</th>
                        <th className="vx-r">Precio base</th>
                        <th className="vx-r">{selected.kind === "CUSTOM" ? "Precio en esta lista" : "Precio con la lista"}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleItems.slice(0, 300).map((i) => (
                        <tr key={i.product_id}>
                          <td>{i.name}</td>
                          <td>{i.sku || "—"}</td>
                          <td className="vx-r">{money(i.base_price)}</td>
                          <td className="vx-r">
                            {selected.kind === "CUSTOM" && canEdit ? (
                              <input
                                className="vx-input vx-input-sm"
                                inputMode="decimal"
                                aria-label={`Precio de ${i.name} en ${selected.name}`}
                                placeholder={String(i.base_price)}
                                value={drafts[i.product_id] !== undefined ? drafts[i.product_id] : i.price !== null ? String(i.price) : ""}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  setDrafts((d) => {
                                    const next = { ...d };
                                    const original = i.price !== null ? String(i.price) : "";
                                    if (v === original) delete next[i.product_id]; else next[i.product_id] = v;
                                    return next;
                                  });
                                }}
                              />
                            ) : (
                              <strong>{money(i.final_price)}</strong>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {visibleItems.length > 300 && <p className="vx-hint" style={{ marginTop: 8 }}>Se muestran los primeros 300. Usá el buscador para encontrar el resto.</p>}

              {selected.kind === "CUSTOM" && canEdit && (
                <div className="vx-row-end" style={{ marginTop: 14 }}>
                  <span className="vx-hint">{dirtyCount ? `${dirtyCount} precio${dirtyCount === 1 ? "" : "s"} sin guardar` : "Todo guardado"}</span>
                  {dirtyCount > 0 && <button className="secondary-button" onClick={() => setDrafts({})}>Descartar</button>}
                  <button className="primary-button" onClick={saveDrafts} disabled={!dirtyCount || saving}>{saving ? "Guardando..." : "Guardar precios"}</button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ---------- nueva / editar lista ---------- */}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="product-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div><span className="dashboard-eyebrow">LISTAS DE PRECIOS</span><h2>{editing ? "Editar lista" : "Nueva lista"}</h2></div>
              <button className="modal-close" type="button" onClick={() => setShowForm(false)}>×</button>
            </div>
            <form className="product-form" onSubmit={saveList}>
              <div className="form-group">
                <label>Nombre</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ej. Mayorista, Minorista, Revendedor" maxLength={80} required autoFocus />
              </div>
              <div className="form-group">
                <label>¿Cómo se calculan los precios?</label>
                <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as "PERCENT" | "CUSTOM" })} disabled={!!editing && editing.items_count > 0}>
                  <option value="PERCENT">Un porcentaje sobre el precio base</option>
                  <option value="CUSTOM">Precio propio por producto</option>
                </select>
                {!!editing && editing.items_count > 0 && <small className="vx-hint">Esta lista ya tiene precios cargados por producto.</small>}
              </div>
              {form.kind === "PERCENT" && (
                <div className="form-row">
                  <div className="form-group">
                    <label>Ajuste</label>
                    <select value={form.sign} onChange={(e) => setForm({ ...form, sign: e.target.value })}>
                      <option value="-">Descuento (más barato)</option>
                      <option value="+">Recargo (más caro)</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Porcentaje</label>
                    <input type="number" min={0} max={form.sign === "-" ? 99 : 1000} step="0.01" value={form.percent} onChange={(e) => setForm({ ...form, percent: e.target.value })} placeholder="15" />
                  </div>
                </div>
              )}
              <label className="vx-check">
                <input type="checkbox" checked={form.is_default} onChange={(e) => setForm({ ...form, is_default: e.target.checked })} />
                Usar esta lista para los clientes que no tienen ninguna asignada
              </label>
              {editing && (
                <label className="vx-check">
                  <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
                  Lista activa
                </label>
              )}
              <div className="modal-actions">
                <button type="button" className="secondary-button" onClick={() => setShowForm(false)}>Cancelar</button>
                <button type="submit" className="primary-button" disabled={saving}>{saving ? "Guardando..." : editing ? "Guardar cambios" : "Crear lista"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ---------- pegar desde Excel ---------- */}
      {showImport && selected && (
        <div className="modal-overlay" onClick={() => setShowImport(false)}>
          <div className="product-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div><span className="dashboard-eyebrow">{selected.name.toUpperCase()}</span><h2>Pegar precios desde Excel</h2></div>
              <button className="modal-close" type="button" onClick={() => setShowImport(false)}>×</button>
            </div>
            <div className="product-form">
              <p className="vx-sub">
                En Excel seleccioná dos columnas —el <strong>código o SKU</strong> y el <strong>precio</strong>—, copialas y pegalas acá.
                También sirve escribir un producto por renglón: <code>CODIGO; 1250,50</code>
              </p>
              <div className="vx-field">
                <label htmlFor="vx-import-text">Códigos y precios</label>
                <textarea id="vx-import-text" value={importText} onChange={(e) => setImportText(e.target.value)} placeholder={"YER001\t4500\nACE150\t3200"} rows={8} />
              </div>
              {importResult && (
                <div className={`vx-note ${importResult.not_found_count || importResult.bad_lines.length ? "is-warn" : "is-ok"}`}>
                  <span>
                    <strong>{importResult.saved} precio{importResult.saved === 1 ? "" : "s"} cargado{importResult.saved === 1 ? "" : "s"}.</strong>
                    {importResult.not_found_count > 0 && <> No encontramos {importResult.not_found_count} código{importResult.not_found_count === 1 ? "" : "s"}: {importResult.not_found.join(", ")}{importResult.not_found_count > importResult.not_found.length ? "…" : ""}.</>}
                    {importResult.bad_lines.length > 0 && <> Renglones que no se pudieron leer: {importResult.bad_lines.join(", ")}.</>}
                  </span>
                </div>
              )}
              <div className="modal-actions">
                <button type="button" className="secondary-button" onClick={() => setShowImport(false)}>Cerrar</button>
                <button type="button" className="primary-button" onClick={runImport} disabled={saving || !importText.trim()}>{saving ? "Cargando..." : "Cargar precios"}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
