// App de escritorio de Mezztt: cuando el servidor corta el sistema por falta de pago (HTTP 402 SISTEMA_DETENIDO) o por baja, en cualquier
// pantalla (web o app) se muestra solo «Sistema detenido por falta de pago». Los datos no se tocan: al pagar, «Reintentar» vuelve a entrar.
// Se activa una sola vez al cargar (import "./desktopApp" en main.tsx) y envuelve fetch: sirve para todas las llamadas del sistema.

function showStopped(message?: string) {
  if (typeof document === "undefined" || document.getElementById("mz-stopped")) return;
  const box = document.createElement("div");
  box.id = "mz-stopped";
  box.setAttribute("role", "alert");
  box.style.cssText = "position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:#0b0b0c;color:#f4f4f5;font-family:Inter,system-ui,sans-serif;padding:24px;text-align:center";
  const title = document.createElement("h1");
  title.textContent = message || "Sistema detenido por falta de pago";
  title.style.cssText = "font-size:26px;margin:0 0 10px";
  const text = document.createElement("p");
  text.textContent = "Tus datos están a salvo. Cuando se regularice el pago, el sistema vuelve a funcionar solo. Escribile a Mezztt si ya pagaste.";
  text.style.cssText = "max-width:420px;margin:0 auto 18px;line-height:1.5;color:#a1a1aa";
  const btn = document.createElement("button");
  btn.textContent = "Reintentar";
  btn.style.cssText = "border:0;border-radius:10px;padding:10px 18px;font-weight:700;cursor:pointer;background:#f4f4f5;color:#0b0b0c";
  btn.onclick = () => window.location.reload();
  const wrap = document.createElement("div");
  wrap.append(title, text, btn);
  box.append(wrap);
  document.body.append(box);
}

if (typeof window !== "undefined" && !(window as any).__mzFetchPatched) {
  (window as any).__mzFetchPatched = true;
  const original = window.fetch.bind(window);
  window.fetch = async (...args: Parameters<typeof fetch>) => {
    const response = await original(...args);
    if (response.status === 402) {
      try {
        const data = await response.clone().json();
        const d = data?.detail;
        if (d && typeof d === "object" && d.code === "SISTEMA_DETENIDO") showStopped(d.message);
        else if (typeof d === "string" && d.startsWith("Sistema detenido")) showStopped("Sistema detenido por falta de pago");
      } catch { /* no era JSON */ }
    }
    return response;
  };
}

export {};
