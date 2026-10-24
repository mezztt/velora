import { useRef, useState } from "react";
import { API_URL } from "../apiBase";
import { fmtMoney } from "../money";


function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem("velora_token")}` };
}
function jsonHeaders() {
  return { "Content-Type": "application/json", ...authHeaders() };
}

interface ChatMessage {
  from: "user" | "bot";
  text: string;
}

interface Intent {
  id: string;
  keywords: string[];
  handler: (rawMessage: string) => Promise<string>;
}

function normalize(text: string) {
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function stripTriggers(message: string, triggers: string[]): string {
  let text = normalize(message);
  // más largos primero, para no dejar restos de frases cortas incluidas en otras
  const sorted = [...triggers].sort((a, b) => b.length - a.length);
  for (const t of sorted) text = text.replace(t, " ");
  return text.replace(/[¿?¡!.,]/g, "").replace(/\s+/g, " ").trim();
}

function extractNumber(text: string): number | null {
  const match = text.match(/(\d+(?:[.,]\d+)?)/);
  if (!match) return null;
  return Number(match[1].replace(",", "."));
}

// ============================================================
// CONSULTAS
// ============================================================

async function handleStockProducto(rawMessage: string): Promise<string> {
  const term = stripTriggers(rawMessage, [
    "cuanto stock tengo de", "cuanto tengo de", "hay stock de", "tengo stock de",
    "stock de", "queda de", "cuanto queda de", "stock", "inventario de",
  ]);
  if (!term) return "¿De qué producto querés saber el stock? Decime el nombre.";

  const res = await fetch(`${API_URL}/products?search=${encodeURIComponent(term)}`, { headers: authHeaders() });
  if (!res.ok) return "No pude consultar los productos ahora mismo.";
  const products = await res.json();
  if (!products.length) return `No encontré ningún producto que coincida con "${term}".`;
  if (products.length === 1) {
    const p = products[0];
    return `${p.name} tiene ${p.stock} unidades (campo general del producto — para el detalle exacto por depósito, mirá Stock).`;
  }
  return "Encontré varios:\n" + products.slice(0, 6).map((p: any) => `• ${p.name}: ${p.stock} u.`).join("\n");
}

async function handleStockBajo(): Promise<string> {
  const res = await fetch(`${API_URL}/reports/low-stock`, { headers: authHeaders() });
  if (!res.ok) return "No pude consultar el stock bajo ahora mismo.";
  const items = await res.json();
  if (!items.length) return "Ningún producto está bajo su mínimo. Todo en orden. 👍";
  return `Productos en stock bajo:\n` + items.slice(0, 8).map((i: any) =>
    `• ${i.product_name} (${i.warehouse_name}): ${i.quantity} / mín. ${i.min_stock}`
  ).join("\n");
}

async function handleVentasHoy(): Promise<string> {
  const res = await fetch(`${API_URL}/dashboard/stats`, { headers: authHeaders() });
  if (!res.ok) return "No pude consultar las ventas ahora mismo.";
  const d = await res.json();
  return `Hoy vendiste ${fmtMoney(d.sales_today)} en total (facturado ${fmtMoney(d.invoiced_today)} + POS ${fmtMoney(d.pos_today)}).`;
}

async function handleResumenVentas(): Promise<string> {
  const res = await fetch(`${API_URL}/reports/sales-summary`, { headers: authHeaders() });
  if (!res.ok) return "No pude traer el resumen de ventas.";
  const d = await res.json();
  return `En los últimos 30 días facturaste ${fmtMoney(Number(d.total_invoiced))} en ${d.invoice_count} comprobantes, y ${fmtMoney(Number(d.total_pos))} en ${d.pos_count} ventas de mostrador.`;
}

async function handlePedidosPendientes(): Promise<string> {
  const res = await fetch(`${API_URL}/dashboard/stats`, { headers: authHeaders() });
  if (!res.ok) return "No pude consultar los pedidos ahora mismo.";
  const d = await res.json();
  if (d.pending_orders === 0) return "No tenés pedidos pendientes. 🎉";
  return `Tenés ${d.pending_orders} pedido${d.pending_orders === 1 ? "" : "s"} pendiente${d.pending_orders === 1 ? "" : "s"} (sin confirmar, confirmados, programados o en camino).`;
}

async function handleEntregasPendientes(): Promise<string> {
  const res = await fetch(`${API_URL}/dashboard/stats`, { headers: authHeaders() });
  if (!res.ok) return "No pude consultar las entregas ahora mismo.";
  const d = await res.json();
  if (d.pending_deliveries === 0) return "No tenés entregas pendientes.";
  return `Tenés ${d.pending_deliveries} entrega${d.pending_deliveries === 1 ? "" : "s"} pendiente${d.pending_deliveries === 1 ? "" : "s"} de envío.`;
}

async function handleCajaEstado(): Promise<string> {
  const res = await fetch(`${API_URL}/dashboard/stats`, { headers: authHeaders() });
  if (!res.ok) return "No pude consultar la caja ahora mismo.";
  const d = await res.json();
  if (!d.cash_session_open) return "La caja está cerrada ahora mismo.";
  return `La caja está abierta. Apertura: ${fmtMoney(Number(d.cash_session.opening_amount))}, ventas en efectivo hoy: ${fmtMoney(Number(d.cash_session.cash_sales_so_far))}.`;
}

async function handleCuentasPorCobrar(): Promise<string> {
  const res = await fetch(`${API_URL}/reports/accounts-receivable`, { headers: authHeaders() });
  if (!res.ok) return "No pude consultar las cuentas por cobrar.";
  const items = await res.json();
  if (!items.length) return "Ningún cliente tiene saldo pendiente. 👍";
  const total = items.reduce((s: number, i: any) => s + Number(i.balance), 0);
  const top = items.slice(0, 5).map((i: any) => `• ${i.customer_name}: ${fmtMoney(Number(i.balance))}`).join("\n");
  return `Hay ${fmtMoney(total)} pendientes de cobro en total.\n${top}`;
}

async function handleComprasPendientes(): Promise<string> {
  const res = await fetch(`${API_URL}/dashboard/stats`, { headers: authHeaders() });
  if (!res.ok) return "No pude consultar las compras ahora mismo.";
  const d = await res.json();
  if (d.pending_purchases === 0) return "No tenés compras esperando recepción.";
  return `Tenés ${d.pending_purchases} compra${d.pending_purchases === 1 ? "" : "s"} pendiente${d.pending_purchases === 1 ? "" : "s"} de recibir.`;
}

async function handleBuscarCliente(rawMessage: string): Promise<string> {
  const term = stripTriggers(rawMessage, [
    "buscar cliente", "datos de cliente", "datos del cliente", "telefono de", "cliente",
  ]);
  if (!term) return "¿Qué cliente buscás? Decime el nombre.";
  const res = await fetch(`${API_URL}/customers?search=${encodeURIComponent(term)}`, { headers: authHeaders() });
  if (!res.ok) return "No pude consultar los clientes ahora mismo.";
  const customers = await res.json();
  if (!customers.length) return `No encontré ningún cliente que coincida con "${term}".`;
  if (customers.length === 1) {
    const c = customers[0];
    return `${c.name}${c.phone ? ` — tel: ${c.phone}` : ""}${c.email ? ` — ${c.email}` : ""}${c.credit_limit ? ` — límite de crédito: $${c.credit_limit}` : ""}`;
  }
  return "Encontré varios:\n" + customers.slice(0, 6).map((c: any) => `• ${c.name}`).join("\n");
}

async function handleBuscarProducto(rawMessage: string): Promise<string> {
  const term = stripTriggers(rawMessage, [
    "precio de", "cuanto cuesta", "cuanto sale", "buscar producto", "producto",
  ]);
  if (!term) return "¿Qué producto buscás?";
  const res = await fetch(`${API_URL}/products?search=${encodeURIComponent(term)}`, { headers: authHeaders() });
  if (!res.ok) return "No pude consultar los productos ahora mismo.";
  const products = await res.json();
  if (!products.length) return `No encontré ningún producto que coincida con "${term}".`;
  if (products.length === 1) {
    const p = products[0];
    return `${p.name}: ${fmtMoney(p.price)} — ${p.stock} unidades en stock.`;
  }
  return "Encontré varios:\n" + products.slice(0, 6).map((p: any) => `• ${p.name}: ${fmtMoney(p.price)}`).join("\n");
}

async function handleTopProductos(): Promise<string> {
  const res = await fetch(`${API_URL}/reports/top-products?limit=5`, { headers: authHeaders() });
  if (!res.ok) return "No pude traer el ranking de productos.";
  const items = await res.json();
  if (!items.length) return "Todavía no hay datos de ventas suficientes.";
  return "Los más vendidos (últimos 30 días):\n" + items.map((i: any, idx: number) =>
    `${idx + 1}. ${i.product_name} — ${i.quantity_sold} u.`
  ).join("\n");
}

async function handleTopClientes(): Promise<string> {
  const res = await fetch(`${API_URL}/reports/top-customers?limit=5`, { headers: authHeaders() });
  if (!res.ok) return "No pude traer el ranking de clientes.";
  const items = await res.json();
  if (!items.length) return "Todavía no hay datos suficientes.";
  return "Tus mejores clientes (últimos 30 días):\n" + items.map((i: any, idx: number) =>
    `${idx + 1}. ${i.customer_name} — ${fmtMoney(Number(i.total_invoiced))}`
  ).join("\n");
}

async function handleFacturacionHoy(): Promise<string> {
  const res = await fetch(`${API_URL}/dashboard/stats`, { headers: authHeaders() });
  if (!res.ok) return "No pude consultar la facturación.";
  const d = await res.json();
  return `Facturaste ${fmtMoney(Number(d.invoiced_today))} hoy.`;
}

// ============================================================
// ACCIONES (simples, no sensibles)
// ============================================================

async function handleAbrirCaja(rawMessage: string): Promise<string> {
  const amount = extractNumber(rawMessage);
  if (amount === null) return "¿Con cuánto querés abrir la caja? Decime un monto, ej: 'abrir caja con 5000'.";
  const res = await fetch(`${API_URL}/cash-sessions`, {
    method: "POST", headers: jsonHeaders(), body: JSON.stringify({ opening_amount: amount }),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => null);
    return `No pude abrir la caja${d?.detail ? `: ${d.detail}` : ""}.`;
  }
  return `Caja abierta con ${fmtMoney(amount)}.`;
}

async function handleCerrarCaja(rawMessage: string): Promise<string> {
  const amount = extractNumber(rawMessage);
  if (amount === null) return "¿Con cuánto contaste la caja al cerrar? Decime un monto, ej: 'cerrar caja con 12000'.";

  const current = await fetch(`${API_URL}/cash-sessions/current`, { headers: authHeaders() });
  if (!current.ok) return "No hay ninguna caja abierta ahora mismo.";
  const session = await current.json();

  const res = await fetch(`${API_URL}/cash-sessions/${session.id}/close`, {
    method: "POST", headers: jsonHeaders(), body: JSON.stringify({ closing_amount: amount }),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => null);
    return `No pude cerrar la caja${d?.detail ? `: ${d.detail}` : ""}.`;
  }
  const data = await res.json();
  const diff = Number(data.difference ?? 0);
  return `Caja cerrada. Diferencia: ${diff === 0 ? "sin diferencia" : `${fmtMoney(diff)}`}.`;
}

async function handleRegistrarPago(rawMessage: string): Promise<string> {
  const amount = extractNumber(rawMessage);
  if (amount === null) return "¿Cuánto pagó el cliente? Decime, ej: 'registrar pago de 5000 a Juan Pérez'.";

  let nameText = stripTriggers(rawMessage, [
    "registrar pago de", "registrar pago", "cobrar pago de", "cobre", "cobrar", "pago de", "pesos",
  ]);
  nameText = nameText.replace(extractNumber(nameText)?.toString() ?? "", "").replace(/^\s*(a|de)\s+/, "").trim();

  if (!nameText) return "Decime también a qué cliente, ej: 'registrar pago de 5000 a Juan Pérez'.";

  const res = await fetch(`${API_URL}/customers?search=${encodeURIComponent(nameText)}`, { headers: authHeaders() });
  if (!res.ok) return "No pude buscar al cliente ahora mismo.";
  const customers = await res.json();
  if (!customers.length) return `No encontré ningún cliente que coincida con "${nameText}".`;
  if (customers.length > 1) {
    return `Encontré varios clientes con ese nombre, sé más específico:\n` + customers.slice(0, 5).map((c: any) => `• ${c.name}`).join("\n");
  }

  const customer = customers[0];
  const payRes = await fetch(`${API_URL}/payments`, {
    method: "POST", headers: jsonHeaders(),
    body: JSON.stringify({ customer_id: customer.id, amount, payment_method: "EFECTIVO" }),
  });
  if (!payRes.ok) {
    const d = await payRes.json().catch(() => null);
    return `No pude registrar el pago${d?.detail ? `: ${d.detail}` : ""}.`;
  }
  return `Listo, registré un pago de ${fmtMoney(amount)} de ${customer.name}.`;
}

// ============================================================
// AYUDA
// ============================================================

const HELP_TEXT = `Puedo ayudarte con:

📦 Stock
• "¿hay stock de [producto]?"
• "stock bajo" / "qué productos están bajos"

💰 Ventas y facturación
• "¿cómo van las ventas de hoy?"
• "resumen de ventas"
• "facturación de hoy"
• "productos más vendidos"
• "mejores clientes"

📋 Pedidos y entregas
• "¿tengo pedidos pendientes?"
• "¿hay entregas pendientes?"

💵 Caja
• "¿cómo está la caja?"
• "abrir caja con [monto]"
• "cerrar caja con [monto]"

💳 Clientes y cobros
• "buscar cliente [nombre]"
• "¿quién me debe?" / "cuentas por cobrar"
• "registrar pago de [monto] a [cliente]"

📦 Compras y productos
• "compras pendientes"
• "precio de [producto]"

Lo que NO hago (por seguridad, eso lo hacés vos a mano): cambiar contraseñas, gestionar usuarios y roles, o crear facturas fiscales con ARCA.`;

// ============================================================
// REGISTRO DE INTENCIONES
// ============================================================

const INTENTS: Intent[] = [
  { id: "baja-servicio", keywords: ["dar de baja el servicio", "dar de baja el sistema", "baja del servicio", "baja del sistema", "darme de baja", "cancelar el servicio", "cancelar mi cuenta", "dejar de usar el sistema", "retirar la baja", "constancia de baja"], handler: async () => "Para dar de baja el servicio entrá a Configuración y tocá «Dar de baja el servicio» (también está al pie de la pantalla de ingreso). Lo hace el administrador, sin motivo y en dos pasos, y te da una constancia BAJA-AAAA-NNNN con fecha y hora para copiar o imprimir. El sistema NO se corta ese día: sigue funcionando hasta el final del período que ya pagaste, y antes de esa fecha podés «Retirar la baja». Después se desactiva y tus datos se conservan." },
  { id: "ayuda", keywords: ["ayuda", "que podes hacer", "que sabes hacer", "help", "opciones"], handler: async () => HELP_TEXT },

  { id: "stock_producto", keywords: ["stock de", "hay stock", "tengo stock", "queda de", "unidades de"], handler: handleStockProducto },
  { id: "stock_bajo", keywords: ["stock bajo", "productos bajos", "alerta de stock", "bajo minimo"], handler: handleStockBajo },

  { id: "ventas_hoy", keywords: ["ventas de hoy", "vendi hoy", "como van las ventas", "cuanto vendi"], handler: handleVentasHoy },
  { id: "resumen_ventas", keywords: ["resumen de ventas", "ventas del mes", "como van las ventas en general"], handler: handleResumenVentas },
  { id: "facturacion_hoy", keywords: ["facturacion de hoy", "cuanto facture", "facture hoy"], handler: handleFacturacionHoy },
  { id: "top_productos", keywords: ["mas vendidos", "productos mas vendidos", "que se vende mas"], handler: handleTopProductos },
  { id: "top_clientes", keywords: ["mejores clientes", "que cliente compra mas", "top clientes"], handler: handleTopClientes },

  { id: "pedidos_pendientes", keywords: ["pedido pendiente", "pedidos pendientes", "que pedidos tengo", "hay pedidos"], handler: handlePedidosPendientes },
  { id: "entregas_pendientes", keywords: ["entrega pendiente", "entregas pendientes", "que hay que entregar"], handler: handleEntregasPendientes },

  { id: "caja_estado", keywords: ["como esta la caja", "la caja esta abierta", "estado de caja"], handler: handleCajaEstado },
  { id: "abrir_caja", keywords: ["abrir caja", "abrir la caja"], handler: handleAbrirCaja },
  { id: "cerrar_caja", keywords: ["cerrar caja", "cerrar la caja"], handler: handleCerrarCaja },

  { id: "cuentas_por_cobrar", keywords: ["cuentas por cobrar", "quien me debe", "saldo de clientes", "deudas"], handler: handleCuentasPorCobrar },
  { id: "registrar_pago", keywords: ["registrar pago", "cobre a", "cobrar a", "pago de"], handler: handleRegistrarPago },
  { id: "buscar_cliente", keywords: ["buscar cliente", "datos de cliente", "telefono de"], handler: handleBuscarCliente },

  { id: "compras_pendientes", keywords: ["compras pendientes", "que compras faltan", "falta recibir"], handler: handleComprasPendientes },
  { id: "buscar_producto", keywords: ["precio de", "cuanto cuesta", "cuanto sale", "buscar producto"], handler: handleBuscarProducto },
];

function matchIntent(message: string): Intent | null {
  const text = normalize(message);
  let best: { intent: Intent; score: number } | null = null;
  for (const intent of INTENTS) {
    const score = intent.keywords.filter((k) => text.includes(k)).length;
    if (score > 0 && (!best || score > best.score)) best = { intent, score };
  }
  return best ? best.intent : null;
}

const FALLBACK = 'No entendí bien eso. Escribí "ayuda" para ver todo lo que puedo hacer.';

function VeloriaChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { from: "bot", text: 'Hola, soy VelorIA 👋 Escribí "ayuda" para ver todo lo que puedo hacer.' },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  function scrollToBottom() {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }

  async function send() {
    const message = input.trim();
    if (!message || loading) return;

    setMessages((m) => [...m, { from: "user", text: message }]);
    setInput("");
    setLoading(true);
    scrollToBottom();

    try {
      const intent = matchIntent(message);
      const reply = intent ? await intent.handler(message) : FALLBACK;
      setMessages((m) => [...m, { from: "bot", text: reply }]);
    } catch {
      setMessages((m) => [...m, { from: "bot", text: "Tuve un problema procesando eso. Probá de nuevo." }]);
    } finally {
      setLoading(false);
      scrollToBottom();
    }
  }

  return (
    <div data-tour="asistente" style={{ position: "fixed", bottom: 24, right: 24, zIndex: 300 }}>
      {open && (
        <div
          style={{
            width: 360, height: 480, background: "#fffdf9", border: "1px solid #e4dbd0",
            borderRadius: 18, boxShadow: "0 24px 60px -20px rgba(36,31,27,0.35)",
            display: "flex", flexDirection: "column", marginBottom: 12, overflow: "hidden",
          }}
        >
          <div style={{ padding: "14px 16px", borderBottom: "1px solid #eee7df", display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: 9, background: "#80654d", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13 }}>V</div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#241f1b" }}>VelorIA</div>
              <div style={{ fontSize: 10, color: "#9a8b7d" }}>Asistente de Velora</div>
            </div>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
            {messages.map((m, i) => (
              <div
                key={i}
                style={{
                  alignSelf: m.from === "user" ? "flex-end" : "flex-start",
                  background: m.from === "user" ? "#80654d" : "#f4efe7",
                  color: m.from === "user" ? "#fff" : "#241f1b",
                  borderRadius: 12, padding: "8px 12px", fontSize: 12.5,
                  maxWidth: "88%", whiteSpace: "pre-line",
                }}
              >
                {m.text}
              </div>
            ))}
            {loading && <div style={{ alignSelf: "flex-start", fontSize: 12, color: "#9a8b7d" }}>Pensando...</div>}
            <div ref={bottomRef} />
          </div>

          <div style={{ padding: 10, borderTop: "1px solid #eee7df", display: "flex", gap: 6 }}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="Escribí tu pregunta..."
              style={{ flex: 1, border: "1px solid #e4dbd0", borderRadius: 10, padding: "8px 10px", fontSize: 12.5, outline: "none" }}
            />
            <button
              onClick={send}
              style={{ background: "#80654d", color: "#fff", border: "none", borderRadius: 10, padding: "0 14px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}
            >
              Enviar
            </button>
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: 54, height: 54, borderRadius: "50%", background: "#241f1b", color: "#fff",
          border: "none", fontSize: 20, cursor: "pointer", boxShadow: "0 14px 30px -10px rgba(36,31,27,0.5)", float: "right",
        }}
      >
        {open ? "×" : "💬"}
      </button>
    </div>
  );
}

export default VeloriaChat;