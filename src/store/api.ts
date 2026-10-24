// ============================================================
// TIENDA ONLINE — helpers compartidos (página pública + panel)
// ============================================================

export const API_URL: string =
  (typeof window !== "undefined" && (window as any).mezzttApp?.apiUrl) || (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") || "http://127.0.0.1:8000";

export function assetUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return path.startsWith("http") || path.startsWith("data:") ? path : `${API_URL}${path}`;
}

export function money(value: number): string {
  const n = Math.round(value || 0);
  return (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("es-AR");
}

export class ApiError extends Error {
  status: number;
  data: unknown;
  constructor(message: string, status: number, data: unknown) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

export async function storeApi<T>(path: string, options: { method?: string; body?: unknown; auth?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.auth) headers.Authorization = `Bearer ${localStorage.getItem("velora_token")}`;
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: options.method || "GET",
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiError("No hay conexión con el servidor. Probá de nuevo en un momento.", 0, null);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = (data as { detail?: unknown }).detail;
    const message = typeof detail === "string" ? detail : "Algo salió mal. Probá de nuevo.";
    throw new ApiError(message, response.status, data);
  }
  return data as T;
}

/** Achica una imagen en el navegador antes de subirla (máx. `max` px, JPEG). */
export function compressImage(file: File, max = 900, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("Elegí un archivo de imagen (JPG, PNG o WEBP)."));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("No se pudo leer la imagen."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("No se pudo abrir la imagen."));
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) { reject(new Error("No se pudo procesar la imagen.")); return; }
        const keepAlpha = file.type === "image/png";
        if (!keepAlpha) { ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height); }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL(keepAlpha ? "image/png" : "image/jpeg", quality));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

/** Elige texto blanco o casi negro según qué se lea mejor sobre `hex` (contraste WCAG). */
export function readableOn(hex: string): string {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const withWhite = 1.05 / (L + 0.05);
  const withDark = (L + 0.05) / (0.0175 + 0.05); // #1c1712 aprox
  return withWhite >= withDark ? "#ffffff" : "#1c1712";
}

/** Oscurece un color hasta que tenga contraste ≥ 4.5 sobre blanco (para usarlo como texto). */
export function textSafe(hex: string): string {
  let [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.replace("#", "").slice(i, i + 2), 16));
  const lum = (x: number[]) => {
    const [a, c, d] = x.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * a + 0.7152 * c + 0.0722 * d;
  };
  for (let i = 0; i < 30 && 1.05 / (lum([r, g, b]) + 0.05) < 4.6; i++) {
    r = Math.round(r * 0.9); g = Math.round(g * 0.9); b = Math.round(b * 0.9);
  }
  return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
}

export function waLink(phone: string | null | undefined, text: string): string | null {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, "");
  if (!digits) return null;
  if (!digits.startsWith("54") && digits.length <= 11) digits = "549" + digits.replace(/^0/, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export function igLink(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.startsWith("http")) return value;
  return `https://instagram.com/${value.replace(/^@/, "")}`;
}

// ---------- tipos de la tienda pública ----------
export type StockState = "ok" | "low" | "out";

export interface StoreProductPublic {
  id: number;
  name: string;
  description: string;
  price: number;
  category: string | null;
  featured: boolean;
  image: string | null;
  available: number;
  stock: StockState;
}

export interface StorePublic {
  slug: string;
  name: string;
  company: string;
  tagline: string | null;
  about: string | null;
  accent: string;
  logo: string | null;
  hero: string | null;
  contact: { whatsapp: string | null; instagram: string | null; email: string | null; address: string | null; hours: string | null };
  mode: "landing" | "ecommerce" | "both";
  landing: boolean;
  ecommerce: boolean;
  show_stock_qty: boolean;
  min_order: number;
  delivery: {
    shipping: boolean; shipping_cost: number; shipping_note: string | null; pickup: boolean; pickup_note: string | null;
    zones?: ShippingZonePublic[];   // si hay zonas, el cliente elige una y el costo sale de ahí
  };
  coupons?: boolean;                // la tienda tiene cupones activos: se muestra el campo en el carrito
  deposit: { enabled: boolean; percent: number; hold_minutes: number; policy?: string | null };
  // datos del vendedor, políticas y aclaración de precios (Defensa del Consumidor)
  legal?: StoreLegal;
  policies?: StorePolicies;
  prices_final?: boolean;
  withdrawal_days?: number;
  ready: boolean;
  categories: string[];
  products: StoreProductPublic[];
}

/** Datos del vendedor que se muestran en el pie y en el checkout. */
export interface StoreLegal {
  name: string | null;
  cuit: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
}

export interface StorePolicies {
  returns: string;
  shipping: string;
}

/** Respuesta del Botón de arrepentimiento. */
export interface WithdrawalReceipt {
  code: string;
  status: string;
  created_at: string;
  order_code: string | null;
  already: boolean;
}

export interface ShippingZonePublic {
  id: number;
  name: string;
  price: number;
  free_from: number | null;
  estimated_days: string | null;
}

/** Resumen del pedido calculado por el servidor (precios del cliente, cupón, envío, total y seña). */
export interface CartQuote {
  ok: boolean;
  items: CheckRow[];
  price_list: string | null;
  items_total: number;
  coupon: { code: string; ok: boolean; message: string | null; discount: number } | null;
  discount: number;
  shipping: number;
  shipping_zone: string | null;
  shipping_error: string | null;
  grand_total: number;
  deposit_amount: number;
}

export interface CheckRow {
  product_id: number;
  name: string;
  price: number;
  requested: number;
  available: number;
  ok: boolean;
  message: string | null;
}

export interface WebOrderPublic {
  code: string;
  order_id: number;
  status: string;
  status_label: string;
  cancel_reason: string | null;
  created_at: string;
  store: { name: string; whatsapp: string | null; accent: string; address: string | null; pickup_note: string | null; shipping_note: string | null; deposit_policy?: string | null; legal?: StoreLegal };
  items: { product_id: number; name: string; quantity: number; unit_price: number; subtotal: number; image: string | null }[];
  pay_url: string | null;
  customer_name: string;
  phone: string;
  email: string | null;
  delivery_type: "ENVIO" | "RETIRO";
  address: string | null;
  notes: string | null;
  items_total: number;
  shipping_cost: number;
  grand_total: number;
  deposit_status: "NO_APLICA" | "PENDIENTE" | "PAGADA" | "VENCIDA";
  deposit_percent: number;
  deposit_amount: number;
  remaining: number;
  hold_expires_at: string | null;
  coupon_code?: string | null;
  discount_amount?: number;
  shipping_zone_name?: string | null;
  price_list_name?: string | null;
}
