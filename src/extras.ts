// ============================================================
// Helpers compartidos de las pantallas nuevas (listas de precios, reposición,
// vendedores, rentabilidad, pendientes). Misma URL de API que el resto del panel.
// ============================================================
import { API_URL } from "./store/api";

export { API_URL };

export function authHeaders(json = false): Record<string, string> {
  return {
    Authorization: `Bearer ${localStorage.getItem("velora_token")}`,
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

/** Pedido a la API con el token del usuario. Si falla, lanza Error con el mensaje del servidor. */
export async function api<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: authHeaders(body !== undefined),
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error("No hay conexión con el servidor. Probá de nuevo en un momento.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const d = (data as { detail?: unknown }).detail;
    throw new Error(typeof d === "string" ? d : "No se pudo completar la acción");
  }
  return data as T;
}

export function errorText(e: unknown, fallback = "Algo salió mal. Probá de nuevo."): string {
  return e instanceof Error && e.message ? e.message : fallback;
}

export function money(value: number | string | null | undefined): string {
  const n = Number(value || 0);
  return (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("es-AR", { maximumFractionDigits: 2 });
}

export function num(value: number | string | null | undefined, digits = 2): string {
  return Number(value || 0).toLocaleString("es-AR", { maximumFractionDigits: digits });
}

export function shortDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? iso + "T12:00:00" : iso);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("es-AR");
}

/** Módulos contratados por la empresa. null = sin restricción (todo habilitado). */
export async function loadModules(): Promise<string[] | null> {
  try {
    const company = await api<{ enabled_modules?: string | null }>("/company");
    return company.enabled_modules ? company.enabled_modules.split(",").map((m) => m.trim()).filter(Boolean) : null;
  } catch {
    return null;
  }
}

export function moduleOn(modules: string[] | null, id: string): boolean {
  return modules === null || modules.includes(id);
}

export function currentRole(): string {
  try {
    return JSON.parse(localStorage.getItem("velora_user") || "{}").role || "";
  } catch {
    return "";
  }
}

type CsvCell = string | number | null | undefined;

/** Descarga un CSV que Excel abre bien en Argentina (separador ; y decimales con coma). */
export function downloadCsv(filename: string, rows: CsvCell[][]): void {
  const cell = (v: CsvCell) => {
    if (v === null || v === undefined) return "";
    const text = typeof v === "number" ? String(Math.round(v * 100) / 100).replace(".", ",") : String(v);
    return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const csv = "﻿" + rows.map((r) => r.map(cell).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------- tipos compartidos ----------

export interface PriceQuote {
  customer_id: number | null;
  list: { id: number; name: string; kind: "PERCENT" | "CUSTOM"; percent: number } | null;
  prices: Record<string, number>;
}

export interface CustomerDebt {
  customer_id: number;
  customer_name: string;
  balance: number;
  overdue_amount: number;
  overdue_days: number;
  credit_limit: number;
  over_limit: boolean;
  payment_terms: string;
  open_invoices_count?: number;
  open_invoices?: {
    invoice_id: number; formatted_number: string; invoice_type: string; issue_date: string; due_date: string;
    total: number; pending: number; overdue: boolean; overdue_days: number;
  }[];
}

export interface SellerOptions {
  enabled: boolean;
  sellers: { id: number; name: string }[];
  my_seller_id: number | null;
}

/** Texto prolijo para un estado guardado en mayúsculas: "EN_CAMINO" → "En camino". */
export function statusLabel(value: string | null | undefined): string {
  const text = String(value || "").replace(/_/g, " ").toLowerCase();
  const fixes: Record<string, string> = { debito: "Débito", credito: "Crédito", "nota credito": "Nota de crédito", active: "Activa", inactive: "Inactiva" };
  return fixes[text] || (text ? text.charAt(0).toUpperCase() + text.slice(1) : "—");
}
