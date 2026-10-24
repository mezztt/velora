// Dirección del backend. Local: http://127.0.0.1:8000 · Online: se define VITE_API_URL al compilar (ver frontend/.env.example).
export const API_URL = (
  (typeof window !== "undefined" && (window as any).mezzttApp?.apiUrl) || (import.meta.env.VITE_API_URL as string | undefined) || "http://127.0.0.1:8000"
).replace(/\/$/, "");
