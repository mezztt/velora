// ============================================================
// Datos de marca de Velora (nombre, versión y enlaces por defecto).
// Los enlaces se pueden cambiar desde el panel de Mezztt (Configuración > Marca y redes);
// acá quedan los valores que se usan mientras tanto o si el servidor no responde.
// ============================================================
export { API_URL } from "./store/api";

export const APP_NAME = "Velora";
export const APP_VERSION = "1.0.0";
export const APP_BRAND = "Mezztt";
export const APP_TAGLINE = "Gestión inteligente";

export interface BrandLinks {
  system_instagram_url: string;
  mezztt_instagram_url: string;
  mezztt_site_url: string;
}

export const BRAND_DEFAULTS: BrandLinks = {
  system_instagram_url: "https://instagram.com/velora.mezztt",
  mezztt_instagram_url: "https://instagram.com/mezzttofficial",
  mezztt_site_url: "https://mezztt.site",
};
