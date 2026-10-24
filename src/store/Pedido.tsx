import { useCallback, useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { assetUrl, money, readableOn, storeApi, textSafe, waLink } from "./api";
import type { WebOrderPublic } from "./api";
import { StoreFooter, StoreState, useStoreTheme } from "./StoreShell";
import { CheckIcon, ChatIcon, LockIcon, PinIcon, StoreIcon, TruckIcon } from "./Tienda";
import "./tienda.css";

const FLOW_ENVIO = ["PENDIENTE", "CONFIRMADO", "PROGRAMADO", "EN_CAMINO", "ENTREGADO"];
const FLOW_RETIRO = ["PENDIENTE", "CONFIRMADO", "PROGRAMADO", "ENTREGADO"];
const STEP_LABEL: Record<string, string> = {
  PENDIENTE: "Recibido",
  CONFIRMADO: "Confirmado",
  PROGRAMADO: "Preparado",
  EN_CAMINO: "En camino",
  ENTREGADO: "Entregado",
};

function useCountdown(iso: string | null) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!iso) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [iso]);
  if (!iso) return null;
  const ms = Math.max(0, new Date(iso).getTime() - now);
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return { ms, text: `${m}:${String(s).padStart(2, "0")}` };
}

export default function Pedido() {
  const { slug = "", code = "" } = useParams();
  const [params] = useSearchParams();
  const [order, setOrder] = useState<WebOrderPublic | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  useStoreTheme();

  const paymentId = params.get("payment_id") || params.get("collection_id");

  const load = useCallback(async () => {
    try {
      const q = paymentId ? `?payment_id=${encodeURIComponent(paymentId)}` : "";
      setOrder(await storeApi<WebOrderPublic>(`/public/store/${encodeURIComponent(slug)}/orders/${encodeURIComponent(code)}${q}`));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar el pedido");
    }
  }, [slug, code, paymentId]);

  useEffect(() => { load(); }, [load]);

  // mientras se espera la seña, se revisa solo cada 8 segundos
  useEffect(() => {
    if (order?.deposit_status !== "PENDIENTE") return;
    const t = window.setInterval(load, 8000);
    return () => window.clearInterval(t);
  }, [order?.deposit_status, load]);

  const countdown = useCountdown(order?.deposit_status === "PENDIENTE" ? order.hold_expires_at : null);
  useEffect(() => { if (countdown && countdown.ms === 0) load(); }, [countdown?.ms === 0]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error && !order) return <StoreState title="No encontramos el pedido" text={error} />;
  if (!order) return <StoreState loading />;

  const accent = order.store.accent || "#b07a46";
  const style = { "--st-accent": accent, "--st-on-accent": readableOn(accent), "--st-accent-text": textSafe(accent) } as CSSProperties;
  const flow = order.delivery_type === "ENVIO" ? FLOW_ENVIO : FLOW_RETIRO;
  const cancelled = order.status === "CANCELADO";
  const idx = flow.indexOf(order.status);
  const waiting = order.deposit_status === "PENDIENTE";
  const wa = waLink(order.store.whatsapp, `Hola ${order.store.name}! Consulto por mi pedido ${order.code}.`);

  async function copyCode() {
    try { await navigator.clipboard.writeText(order!.code); setCopied(true); window.setTimeout(() => setCopied(false), 1500); } catch { /* nada */ }
  }

  async function cancel() {
    if (!window.confirm("¿Cancelar el pedido? Se liberan los productos reservados.")) return;
    setCancelling(true);
    try {
      await storeApi(`/public/store/${slug}/orders/${code}/cancel`, { method: "POST" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cancelar");
    } finally {
      setCancelling(false);
    }
  }

  let headline = "¡Gracias por tu compra!";
  let sub = "Recibimos tu pedido. Te vamos a escribir para coordinar.";
  if (waiting) { headline = "Falta pagar la seña"; sub = "Tus productos están reservados. Pagá la seña para confirmar el pedido."; }
  else if (order.deposit_status === "PAGADA" && order.status === "CONFIRMADO") { headline = "¡Pedido confirmado!"; sub = "Recibimos la seña. Ya estamos preparando tu pedido."; }
  else if (cancelled) { headline = "Pedido cancelado"; sub = order.cancel_reason || "Este pedido se canceló."; }
  else if (order.status === "ENTREGADO") { headline = "¡Pedido entregado!"; sub = "Gracias por elegirnos."; }

  return (
    <div className="st-root st-ticket-page" style={style}>
      <header className="st-top">
        <div className="st-wrap st-top-in">
          <Link className="st-brand" to={`/tienda/${slug}`}><span className="st-brand-mark">{order.store.name.slice(0, 1)}</span><strong>{order.store.name}</strong></Link>
          <Link className="st-btn st-btn-outline st-btn-sm" to={`/tienda/${slug}`}>Volver a la tienda</Link>
        </div>
      </header>

      <main className="st-wrap st-ticket">
        <section className={`st-ticket-hero ${cancelled ? "is-cancelled" : waiting ? "is-waiting" : "is-ok"}`}>
          <div className="st-ticket-icon">{cancelled ? "×" : waiting ? <LockIcon /> : <CheckIcon />}</div>
          <h1>{headline}</h1>
          <p>{sub}</p>
          <button className="st-code" onClick={copyCode} title="Copiar código">
            <small>Código de pedido</small>
            <strong>{order.code}</strong>
            <span>{copied ? "¡Copiado!" : "Tocá para copiar"}</span>
          </button>
        </section>

        {waiting && (
          <section className="st-card-box st-pay">
            <div>
              <strong>Seña de {money(order.deposit_amount)}</strong>
              <p>
                {countdown && countdown.ms > 0
                  ? <>Te guardamos los productos por <b className="st-timer">{countdown.text}</b> minutos.</>
                  : "Verificando…"}
              </p>
            </div>
            <div className="st-pay-actions">
              {order.pay_url && <a className="st-btn st-btn-accent" href={order.pay_url}>Pagar con Mercado Pago</a>}
              <button className="st-btn st-btn-outline" onClick={load}>Ya pagué</button>
              <button className="st-link st-link-danger" onClick={cancel} disabled={cancelling}>Cancelar pedido</button>
            </div>
            {order.store.deposit_policy && (
              <p className="st-deposit-policy st-pay-policy"><strong>Si cancelás:</strong> {order.store.deposit_policy}</p>
            )}
          </section>
        )}

        {!cancelled && (
          <section className="st-card-box">
            <ol className="st-track">
              {flow.map((st, i) => (
                <li key={st} className={i < idx ? "is-done" : i === idx ? "is-now" : ""}>
                  <span className="st-track-dot">{i < idx ? <CheckIcon /> : i + 1}</span>
                  <span>{st === "PROGRAMADO" && order.delivery_type === "RETIRO" ? "Listo para retirar" : STEP_LABEL[st]}</span>
                </li>
              ))}
            </ol>
          </section>
        )}

        <div className="st-ticket-grid">
          <section className="st-card-box">
            <h2>Tu pedido</h2>
            <ul className="st-lines st-lines-ro">
              {order.items.map((it) => (
                <li key={it.product_id}>
                  {it.image ? <img className="st-img" src={assetUrl(it.image)!} alt="" /> : <span className="st-img st-img-ph">{it.name.slice(0, 2).toUpperCase()}</span>}
                  <div className="st-line-main">
                    <strong>{it.name}</strong>
                    <span className="st-line-unit">{it.quantity} × {money(it.unit_price)}</span>
                  </div>
                  <span className="st-line-total">{money(it.subtotal)}</span>
                </li>
              ))}
            </ul>
            <div className="st-summary">
              <div className="st-sum st-sum-sm"><span>Productos{order.price_list_name ? ` (lista ${order.price_list_name})` : ""}</span><span>{money(order.items_total)}</span></div>
              {(order.discount_amount || 0) > 0 && <div className="st-sum st-sum-sm st-sum-ok"><span>Cupón {order.coupon_code}</span><span>− {money(order.discount_amount || 0)}</span></div>}
              {order.delivery_type === "ENVIO" && <div className="st-sum st-sum-sm"><span>Envío{order.shipping_zone_name ? ` · ${order.shipping_zone_name}` : ""}</span><span>{order.shipping_cost > 0 ? money(order.shipping_cost) : "Sin cargo"}</span></div>}
              <div className="st-sum st-sum-total"><span>Total</span><strong>{money(order.grand_total)}</strong></div>
              {order.deposit_status === "PAGADA" && (
                <>
                  <div className="st-sum st-sum-ok"><span>Seña pagada</span><span>− {money(order.deposit_amount)}</span></div>
                  <div className="st-sum"><span>Resta pagar</span><strong>{money(order.remaining)}</strong></div>
                </>
              )}
            </div>
          </section>

          <section className="st-card-box">
            <h2>{order.delivery_type === "ENVIO" ? "Envío" : "Retiro"}</h2>
            <div className="st-info-row">
              {order.delivery_type === "ENVIO" ? <TruckIcon /> : <StoreIcon />}
              <div>
                <strong>{order.delivery_type === "ENVIO" ? order.address : "Retirás en el local"}</strong>
                <small>{order.delivery_type === "ENVIO" ? order.store.shipping_note || "Te escribimos para coordinar el horario." : order.store.pickup_note || "Te avisamos cuando esté listo."}</small>
              </div>
            </div>
            {order.delivery_type === "RETIRO" && order.store.address && (
              <a className="st-info-row" href={`https://maps.google.com/?q=${encodeURIComponent(order.store.address)}`} target="_blank" rel="noopener">
                <PinIcon /><div><strong>{order.store.address}</strong><small>Ver en el mapa</small></div>
              </a>
            )}
            <div className="st-info-row">
              <ChatIcon />
              <div><strong>{order.customer_name}</strong><small>{order.phone}{order.email ? ` · ${order.email}` : ""}</small></div>
            </div>
            {order.notes && <p className="st-desc-full">“{order.notes}”</p>}
            {wa && <a className="st-btn st-btn-outline st-btn-block" href={wa} target="_blank" rel="noopener"><ChatIcon /> Consultar por WhatsApp</a>}
          </section>
        </div>
        <p className="st-fine st-center">Guardá este link o el código <strong>{order.code}</strong> para seguir tu pedido.</p>
      </main>

      <StoreFooter name={order.store.name} slug={slug} legal={order.store.legal} orderCode={order.code} />
    </div>
  );
}
