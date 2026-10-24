import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, FormEvent, ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ApiError, assetUrl, igLink, money, readableOn, storeApi, textSafe, waLink,
} from "./api";
import type { CartQuote, CheckRow, ShippingZonePublic, StoreProductPublic, StorePublic } from "./api";
import { useStoreTheme, PolicySheet, SellerInfo, StoreFooter, StoreState } from "./StoreShell";
import type { PolicyKind } from "./StoreShell";
import "./tienda.css";

type Cart = Record<number, number>;

function loadCart(slug: string): Cart {
  try { return JSON.parse(localStorage.getItem(`velora_cart_${slug}`) || "{}") || {}; } catch { return {}; }
}
function saveCart(slug: string, cart: Cart) {
  try { localStorage.setItem(`velora_cart_${slug}`, JSON.stringify(cart)); } catch { /* sin almacenamiento */ }
}

/** Texto corto del costo de envío de la tienda (con zonas: "desde $X"). */
function shippingSummary(store: StorePublic): string {
  const zones = store.delivery.zones || [];
  if (zones.length === 0) return store.delivery.shipping_cost > 0 ? `Envíos ${money(store.delivery.shipping_cost)}` : "Envíos sin cargo";
  const min = Math.min(...zones.map((z) => z.price));
  return min > 0 ? `Envíos desde ${money(min)}` : "Envíos sin cargo";
}

function zoneCost(zone: ShippingZonePublic, subtotal: number): number {
  return zone.free_from !== null && subtotal >= zone.free_from ? 0 : zone.price;
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

// ============================================================
// PÁGINA PÚBLICA DE LA TIENDA  /tienda/:slug
// ============================================================

export default function Tienda() {
  const { slug = "" } = useParams();
  const navigate = useNavigate();
  const [store, setStore] = useState<StorePublic | null>(null);
  const [error, setError] = useState("");
  const [cart, setCart] = useState<Cart>(() => loadCart(slug));
  const [cartOpen, setCartOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; tone: "ok" | "warn" } | null>(null);
  const [preview, setPreview] = useState<StoreProductPublic | null>(null);
  const toastTimer = useRef<number>(0);

  useStoreTheme();

  const load = useCallback(async () => {
    try {
      const data = await storeApi<StorePublic>(`/public/store/${encodeURIComponent(slug)}`);
      setStore(data);
      setError("");
      document.title = `${data.name} · Tienda`;
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar la tienda");
    }
  }, [slug]);

  useEffect(() => {
    load();
    const t = window.setInterval(load, 60000); // el stock se actualiza solo
    return () => window.clearInterval(t);
  }, [load]);

  useEffect(() => { saveCart(slug, cart); }, [slug, cart]);

  const productsById = useMemo(() => {
    const m = new Map<number, StoreProductPublic>();
    store?.products.forEach((p) => m.set(p.id, p));
    return m;
  }, [store]);

  // Si un producto del carrito ya no existe en la tienda, se saca solo
  useEffect(() => {
    if (!store) return;
    setCart((prev) => {
      const next: Cart = {};
      let changed = false;
      for (const [id, q] of Object.entries(prev)) {
        if (productsById.has(Number(id))) next[Number(id)] = q; else changed = true;
      }
      return changed ? next : prev;
    });
  }, [store, productsById]);

  function flash(text: string, tone: "ok" | "warn" = "ok") {
    setToast({ text, tone });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
  }

  /** Cambia la cantidad respetando el stock disponible. Devuelve false si se pidió de más. */
  function setQty(p: StoreProductPublic, qty: number): boolean {
    if (qty > p.available) {
      flash(p.available === 0 ? `${p.name}: sin stock` : `Solo hay ${p.available} de ${p.name}`, "warn");
      setCart((c) => {
        const next = { ...c };
        if (p.available <= 0) delete next[p.id]; else next[p.id] = p.available;
        return next;
      });
      return false;
    }
    setCart((c) => {
      const next = { ...c };
      if (qty <= 0) delete next[p.id]; else next[p.id] = qty;
      return next;
    });
    return true;
  }

  function add(p: StoreProductPublic) {
    const current = cart[p.id] || 0;
    if (setQty(p, current + 1) && current === 0) flash(`Agregaste ${p.name}`);
  }

  const cartCount = Object.values(cart).reduce((a, b) => a + b, 0);
  const cartTotal = Object.entries(cart).reduce((sum, [id, q]) => sum + (productsById.get(Number(id))?.price || 0) * q, 0);

  const [sort, setSort] = useState<"featured" | "price-asc" | "price-desc" | "az">("featured");
  const [onlyStock, setOnlyStock] = useState(false);

  const filtered = useMemo(() => {
    if (!store) return [];
    const q = query.trim().toLowerCase();
    const list = store.products.filter((p) =>
      (!category || p.category === category) &&
      (!onlyStock || p.stock !== "out") &&
      (!q || p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)));
    if (sort === "price-asc") return [...list].sort((a, b) => a.price - b.price);
    if (sort === "price-desc") return [...list].sort((a, b) => b.price - a.price);
    if (sort === "az") return [...list].sort((a, b) => a.name.localeCompare(b.name, "es"));
    return list;
  }, [store, query, category, sort, onlyStock]);

  if (error && !store) return <StoreState title="Tienda no disponible" text={error} />;
  if (!store) return <StoreState loading />;

  const accent = store.accent || "#b07a46";
  const style = {
    "--st-accent": accent,
    "--st-on-accent": readableOn(accent),
    "--st-accent-text": textSafe(accent),
  } as CSSProperties;

  const wa = waLink(store.contact.whatsapp, `Hola ${store.name}! Les escribo desde la tienda online.`);
  const ig = igLink(store.contact.instagram);
  const shop = store.ecommerce;
  const featured = store.products.filter((p) => p.featured && p.stock !== "out").slice(0, 4);
  const withImg = store.products.filter((p) => p.image && p.stock !== "out");
  const collage = (featured.filter((p) => p.image).length >= 2 ? featured.filter((p) => p.image) : withImg).slice(0, 3);
  const categoryTiles = store.categories.map((c) => {
    const items = store.products.filter((p) => p.category === c);
    return { name: c, count: items.length, image: items.find((p) => p.image) || null };
  });
  const perks: { icon: ReactNode; title: string; text: string }[] = [];
  if (shop && store.delivery.shipping) perks.push({ icon: <TruckIcon />, title: "Envíos a domicilio", text: store.delivery.shipping_note || ((store.delivery.zones || []).length > 0 ? shippingSummary(store) : store.delivery.shipping_cost > 0 ? `Costo fijo ${money(store.delivery.shipping_cost)}` : "Sin cargo") });
  if (shop && store.delivery.pickup) perks.push({ icon: <StoreIcon />, title: "Retiro en el local", text: store.delivery.pickup_note || store.contact.address || "Sin cargo" });
  if (shop && store.deposit.enabled) perks.push({ icon: <LockIcon />, title: `Reservás con ${store.deposit.percent}%`, text: "Pagás la seña con Mercado Pago y el resto al recibir" });
  if (shop) perks.push({ icon: <CheckIcon />, title: "Stock real", text: "Lo que ves es lo que hay: se actualiza al instante" });
  if (!shop && store.contact.hours) perks.push({ icon: <ClockIcon />, title: "Horarios", text: store.contact.hours });
  if (!shop && store.contact.address) perks.push({ icon: <PinIcon />, title: "Dónde estamos", text: store.contact.address });
  if (!shop && wa) perks.push({ icon: <ChatIcon />, title: "Atención por WhatsApp", text: "Consultá precios y disponibilidad" });

  const announce = shop
    ? [store.delivery.shipping && shippingSummary(store),
       store.delivery.pickup && "Retiro en el local",
       store.deposit.enabled && `Reservá con ${store.deposit.percent}% de seña`].filter(Boolean).join("  ·  ")
    : [store.contact.hours, store.contact.address].filter(Boolean).join("  ·  ");

  function goTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className={`st-root ${shop ? "is-shop" : "is-landing"}`} style={style}>
      {announce && <div className="st-announce"><div className="st-wrap">{announce}</div></div>}

      {/* ======== BARRA SUPERIOR ======== */}
      <header className="st-top">
        <div className="st-wrap st-top-in">
          <a className="st-brand" href="#inicio" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
            {store.logo ? <img src={assetUrl(store.logo)!} alt="" /> : <span className="st-brand-mark">{initials(store.name)}</span>}
            <strong>{store.name}</strong>
          </a>
          <nav className="st-nav">
            <button onClick={() => goTo("productos")}>{shop ? "Tienda" : "Productos"}</button>
            {store.landing && store.about && <button onClick={() => goTo("nosotros")}>Nosotros</button>}
            <button onClick={() => goTo("contacto")}>Contacto</button>
          </nav>
          {shop ? (
            <button className="st-cart-btn" onClick={() => setCartOpen(true)} aria-label={`Ver carrito, ${cartCount} productos`}>
              <CartIcon />
              <span className="st-cart-btn-text">{cartCount > 0 ? money(cartTotal) : "Carrito"}</span>
              {cartCount > 0 && <span key={cartCount} className="st-cart-count">{cartCount}</span>}
            </button>
          ) : wa ? (
            <a className="st-btn st-btn-accent st-btn-sm" href={wa} target="_blank" rel="noopener"><ChatIcon /> Escribinos</a>
          ) : null}
        </div>
      </header>

      {/* ======== PORTADA ======== */}
      <section id="inicio" className="st-hero">
        <div className="st-wrap st-hero-in">
          <div className="st-hero-copy">
            <span className="st-eyebrow">{shop ? "Tienda online" : "Bienvenidos"}</span>
            <h1>{store.name}</h1>
            {store.tagline && <p className="st-hero-lead">{store.tagline}</p>}
            <div className="st-hero-actions">
              <button className="st-btn st-btn-accent st-btn-lg" onClick={() => goTo("productos")}>{shop ? "Ver productos y comprar" : "Ver productos"}</button>
              {wa && <a className="st-btn st-btn-outline st-btn-lg" href={wa} target="_blank" rel="noopener"><ChatIcon /> WhatsApp</a>}
            </div>
            {store.products.length > 0 && (
              <p className="st-hero-note">
                <CheckIcon /> {store.products.filter((p) => p.stock !== "out").length} productos disponibles
                {store.categories.length > 0 && ` en ${store.categories.length} categorías`}
              </p>
            )}
          </div>
          <div className="st-hero-art" aria-hidden="true">
            {store.hero ? (
              <div className="st-hero-photo"><img src={assetUrl(store.hero)!} alt="" /></div>
            ) : collage.length >= 2 ? (
              <div className={`st-collage n${collage.length}`}>
                {collage.map((p) => <div key={p.id}><img src={assetUrl(p.image)!} alt="" /></div>)}
              </div>
            ) : (
              <div className="st-hero-mono"><span>{initials(store.name)}</span></div>
            )}
            {featured[0] && (
              <button className="st-hero-float" onClick={() => setPreview(featured[0])} tabIndex={-1}>
                <ProductImage p={featured[0]} />
                <span><small>Destacado</small><strong>{featured[0].name}</strong><b>{money(featured[0].price)}</b></span>
              </button>
            )}
          </div>
        </div>
      </section>

      {/* ======== BENEFICIOS ======== */}
      {perks.length > 0 && (
        <section className="st-perks-band">
          <div className="st-wrap st-perks">
            {perks.slice(0, 4).map((pk) => (
              <div key={pk.title} className="st-perk">
                <span className="st-perk-icon">{pk.icon}</span>
                <span><strong>{pk.title}</strong><small>{pk.text}</small></span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ======== CATEGORÍAS ======== */}
      {categoryTiles.length >= 2 && (
        <section className="st-section st-cats-section">
          <div className="st-wrap">
            <div className="st-section-head"><div><span className="st-eyebrow">Explorá</span><h2>Categorías</h2></div></div>
            <div className="st-cats">
              {categoryTiles.map((c) => (
                <button key={c.name} className="st-cat-tile" onClick={() => { setCategory(c.name); goTo("productos"); }}>
                  {c.image ? <ProductImage p={c.image} /> : <span className="st-img st-img-ph">{initials(c.name)}</span>}
                  <span className="st-cat-label"><strong>{c.name}</strong><small>{c.count} producto{c.count === 1 ? "" : "s"}</small></span>
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ======== DESTACADOS (landing) ======== */}
      {store.landing && featured.length > 0 && (
        <section className="st-section st-featured">
          <div className="st-wrap">
            <div className="st-section-head"><div><span className="st-eyebrow">Lo más elegido</span><h2>Destacados</h2></div></div>
            <div className="st-featured-grid">
              {featured.map((p) => (
                <button key={p.id} className="st-featured-card" onClick={() => setPreview(p)}>
                  <ProductImage p={p} />
                  <span className="st-featured-info"><strong>{p.name}</strong><span>{money(p.price)}</span></span>
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ======== PRODUCTOS ======== */}
      <section id="productos" className="st-section st-products">
        <div className="st-wrap">
          <div className="st-section-head">
            <div>
              <span className="st-eyebrow">{shop ? "Elegí y sumá al carrito" : "Precios actualizados"}</span>
              <h2>{category || (shop ? "Todos los productos" : "Productos")}</h2>
            </div>
            <div className="st-tools">
              <label className="st-search">
                <SearchIcon />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar productos" aria-label="Buscar productos" />
                {query && <button type="button" onClick={() => setQuery("")} aria-label="Borrar búsqueda">×</button>}
              </label>
              <select className="st-select" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="Ordenar">
                <option value="featured">Destacados primero</option>
                <option value="price-asc">Menor precio</option>
                <option value="price-desc">Mayor precio</option>
                <option value="az">Nombre A–Z</option>
              </select>
            </div>
          </div>

          <div className="st-filters">
            {store.categories.length > 0 && (
              <div className="st-chips" role="tablist">
                <button className={!category ? "is-on" : ""} onClick={() => setCategory(null)}>Todo</button>
                {store.categories.map((c) => (
                  <button key={c} className={category === c ? "is-on" : ""} onClick={() => setCategory(category === c ? null : c)}>{c}</button>
                ))}
              </div>
            )}
            <label className="st-toggle">
              <input type="checkbox" checked={onlyStock} onChange={(e) => setOnlyStock(e.target.checked)} />
              <span aria-hidden="true" />
              Solo con stock
            </label>
          </div>

          {!store.ready && shop && (
            <div className="st-note st-note-warn">Estamos preparando la tienda: todavía no se pueden hacer pedidos.</div>
          )}

          {filtered.length === 0 ? (
            <div className="st-empty">
              <strong>{store.products.length === 0 ? "Pronto vas a ver los productos acá" : "No encontramos productos con ese filtro"}</strong>
              {(query || category || onlyStock) && <button className="st-link" onClick={() => { setQuery(""); setCategory(null); setOnlyStock(false); }}>Ver todos</button>}
            </div>
          ) : (
            <div className="st-grid">
              {filtered.map((p) => (
                <ProductCard
                  key={p.id}
                  p={p}
                  store={store}
                  qty={cart[p.id] || 0}
                  onAdd={() => add(p)}
                  onQty={(q) => setQty(p, q)}
                  onOpen={() => setPreview(p)}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ======== NOSOTROS (landing) ======== */}
      {store.landing && store.about && (
        <section id="nosotros" className="st-section st-about">
          <div className="st-wrap st-about-in">
            <div className="st-about-text">
              <span className="st-eyebrow">Quiénes somos</span>
              <h2>Sobre {store.name}</h2>
              <p>{store.about}</p>
              {wa && <a className="st-btn st-btn-accent" href={wa} target="_blank" rel="noopener"><ChatIcon /> Hablemos por WhatsApp</a>}
            </div>
            <div className="st-about-side">
              {store.hero
                ? <img src={assetUrl(store.hero)!} alt="" />
                : collage[0] ? <img src={assetUrl(collage[0].image)!} alt="" /> : <div className="st-hero-mono"><span>{initials(store.name)}</span></div>}
            </div>
          </div>
        </section>
      )}

      {/* ======== CTA ======== */}
      {wa && (
        <section className="st-cta">
          <div className="st-wrap st-cta-in">
            <div>
              <h2>¿Tenés alguna consulta?</h2>
              <p>Escribinos y te respondemos a la brevedad.</p>
            </div>
            <a className="st-btn st-btn-light st-btn-lg" href={wa} target="_blank" rel="noopener"><ChatIcon /> Escribir por WhatsApp</a>
          </div>
        </section>
      )}

      {/* ======== CONTACTO ======== */}
      <section id="contacto" className="st-section st-contact">
        <div className="st-wrap">
          <div className="st-section-head"><div><span className="st-eyebrow">Estamos para ayudarte</span><h2>Contacto</h2></div></div>
          <div className="st-contact-grid">
            {wa && <a className="st-contact-card" href={wa} target="_blank" rel="noopener"><span className="st-perk-icon"><ChatIcon /></span><span><small>WhatsApp</small><strong>{store.contact.whatsapp}</strong></span></a>}
            {ig && <a className="st-contact-card" href={ig} target="_blank" rel="noopener"><span className="st-perk-icon"><CameraIcon /></span><span><small>Instagram</small><strong>{store.contact.instagram?.startsWith("http") ? "Ver perfil" : `@${store.contact.instagram?.replace(/^@/, "")}`}</strong></span></a>}
            {store.contact.email && <a className="st-contact-card" href={`mailto:${store.contact.email}`}><span className="st-perk-icon"><MailIcon /></span><span><small>Email</small><strong>{store.contact.email}</strong></span></a>}
            {store.contact.address && <a className="st-contact-card" href={`https://maps.google.com/?q=${encodeURIComponent(store.contact.address)}`} target="_blank" rel="noopener"><span className="st-perk-icon"><PinIcon /></span><span><small>Dirección</small><strong>{store.contact.address}</strong></span></a>}
            {store.contact.hours && <div className="st-contact-card"><span className="st-perk-icon"><ClockIcon /></span><span><small>Horarios</small><strong>{store.contact.hours}</strong></span></div>}
          </div>
        </div>
      </section>

      <StoreFooter name={store.name} slug={store.slug} legal={store.legal} policies={store.policies} withdrawal={shop} withdrawalDays={store.withdrawal_days} />

      {/* WhatsApp flotante */}
      {wa && !(shop && cartCount > 0) && (
        <a className="st-wa-fab" href={wa} target="_blank" rel="noopener" aria-label="Escribir por WhatsApp"><ChatIcon /></a>
      )}

      {/* barra fija del carrito en el celular */}
      {shop && cartCount > 0 && !cartOpen && (
        <button className="st-mobile-bar" onClick={() => setCartOpen(true)}>
          <span><CartIcon /> {cartCount} {cartCount === 1 ? "producto" : "productos"}</span>
          <strong>Ver carrito · {money(cartTotal)}</strong>
        </button>
      )}

      {toast && <div className={`st-toast is-${toast.tone}`} role="status">{toast.text}</div>}

      {preview && (
        <ProductModal
          p={productsById.get(preview.id) || preview}
          store={store}
          qty={cart[preview.id] || 0}
          onClose={() => setPreview(null)}
          onAdd={() => add(productsById.get(preview.id) || preview)}
          onQty={(q) => setQty(productsById.get(preview.id) || preview, q)}
        />
      )}

      {cartOpen && shop && (
        <CartDrawer
          store={store}
          cart={cart}
          productsById={productsById}
          onClose={() => setCartOpen(false)}
          onQty={(p, q) => setQty(p, q)}
          onSetRaw={(id, q) => setCart((c) => { const n = { ...c }; if (q <= 0) delete n[id]; else n[id] = q; return n; })}
          onStockChanged={load}
          onDone={(code, payUrl) => {
            setCart({});
            saveCart(slug, {});
            if (payUrl) window.location.href = payUrl;
            else navigate(`/tienda/${slug}/pedido/${code}`);
          }}
        />
      )}
    </div>
  );
}

// ============================================================
// TARJETA DE PRODUCTO
// ============================================================

function StockBadge({ p, store }: { p: StoreProductPublic; store: StorePublic }) {
  if (p.stock === "out") return <span className="st-stock is-out">Sin stock</span>;
  if (p.stock === "low") return <span className="st-stock is-low">{store.show_stock_qty ? `¡Quedan ${p.available}!` : "Últimas unidades"}</span>;
  return <span className="st-stock is-ok">Disponible</span>;
}

function ProductImage({ p }: { p: StoreProductPublic }) {
  const [broken, setBroken] = useState(false);
  if (p.image && !broken) return <img className="st-img" src={assetUrl(p.image)!} alt={p.name} loading="lazy" onError={() => setBroken(true)} />;
  return <span className="st-img st-img-ph" aria-hidden="true">{initials(p.name)}</span>;
}

function Stepper({ qty, max, onQty, small }: { qty: number; max: number; onQty: (q: number) => void; small?: boolean }) {
  return (
    <div className={`st-stepper ${small ? "is-small" : ""}`}>
      <button type="button" onClick={() => onQty(qty - 1)} aria-label="Quitar uno">−</button>
      <input
        inputMode="numeric"
        value={qty}
        aria-label="Cantidad"
        onChange={(e) => { const v = parseInt(e.target.value.replace(/\D/g, "") || "0", 10); onQty(v); }}
      />
      <button type="button" onClick={() => onQty(qty + 1)} aria-label="Sumar uno" className={qty >= max ? "is-max" : ""}>+</button>
    </div>
  );
}

function ProductCard({ p, store, qty, onAdd, onQty, onOpen }: {
  p: StoreProductPublic; store: StorePublic; qty: number;
  onAdd: () => void; onQty: (q: number) => boolean; onOpen: () => void;
}) {
  const shop = store.ecommerce && store.ready;
  const wa = waLink(store.contact.whatsapp, `Hola! Quería consultar por ${p.name} (${money(p.price)}).`);
  return (
    <article className={`st-card ${p.stock === "out" ? "is-out" : ""} ${qty > 0 ? "is-in-cart" : ""}`}>
      <button className="st-card-media" onClick={onOpen} aria-label={`Ver ${p.name}`}>
        <ProductImage p={p} />
        <span className="st-card-badges">
          {p.featured && <span className="st-ribbon">Destacado</span>}
          {p.stock !== "ok" && <StockBadge p={p} store={store} />}
        </span>
        {qty > 0 && <span className="st-card-incart"><CheckIcon /> {qty} en el carrito</span>}
      </button>
      <div className="st-card-body">
        {p.category && <span className="st-cat">{p.category}</span>}
        <h3 onClick={onOpen}>{p.name}</h3>
        {p.description && <p className="st-desc">{p.description}</p>}
        <div className="st-card-foot">
          <span className="st-price">{money(p.price)}</span>
          {shop ? (
            p.stock === "out" ? (
              <span className="st-btn st-btn-disabled" aria-disabled="true">Sin stock</span>
            ) : qty > 0 ? (
              <Stepper qty={qty} max={p.available} onQty={onQty} small />
            ) : (
              <button className="st-add" onClick={onAdd} aria-label={`Agregar ${p.name} al carrito`}><PlusIcon /><span>Agregar</span></button>
            )
          ) : wa ? (
            <a className="st-btn st-btn-outline st-btn-sm" href={wa} target="_blank" rel="noopener">Consultar</a>
          ) : p.stock === "ok" ? <StockBadge p={p} store={store} /> : null}
        </div>
      </div>
    </article>
  );
}

function ProductModal({ p, store, qty, onClose, onAdd, onQty }: {
  p: StoreProductPublic; store: StorePublic; qty: number; onClose: () => void; onAdd: () => void; onQty: (q: number) => boolean;
}) {
  const shop = store.ecommerce && store.ready;
  const wa = waLink(store.contact.whatsapp, `Hola! Quería consultar por ${p.name} (${money(p.price)}).`);
  useEscape(onClose);
  return (
    <div className="st-overlay" onClick={onClose}>
      <div className="st-modal" role="dialog" aria-modal="true" aria-label={p.name} onClick={(e) => e.stopPropagation()}>
        <button className="st-close" onClick={onClose} aria-label="Cerrar">×</button>
        <div className="st-modal-media"><ProductImage p={p} /></div>
        <div className="st-modal-body">
          <div className="st-card-top"><StockBadge p={p} store={store} />{p.category && <span className="st-cat">{p.category}</span>}</div>
          <h3>{p.name}</h3>
          <span className="st-price st-price-lg">{money(p.price)}</span>
          {p.description && <p className="st-desc-full">{p.description}</p>}
          {shop && p.stock !== "out" && (
            <div className="st-modal-actions">
              {qty > 0 ? (
                <>
                  <Stepper qty={qty} max={p.available} onQty={onQty} />
                  <span className="st-in-cart">En tu carrito</span>
                </>
              ) : (
                <button className="st-btn st-btn-accent" onClick={onAdd}><PlusIcon /> Agregar al carrito</button>
              )}
            </div>
          )}
          {!shop && wa && <a className="st-btn st-btn-accent" href={wa} target="_blank" rel="noopener">Consultar por WhatsApp</a>}
        </div>
      </div>
    </div>
  );
}

function useEscape(fn: () => void) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") fn(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [fn]);
}

// ============================================================
// CARRITO + CHECKOUT
// ============================================================

function CartDrawer({ store, cart, productsById, onClose, onQty, onSetRaw, onStockChanged, onDone }: {
  store: StorePublic;
  cart: Cart;
  productsById: Map<number, StoreProductPublic>;
  onClose: () => void;
  onQty: (p: StoreProductPublic, q: number) => boolean;
  onSetRaw: (id: number, q: number) => void;
  onStockChanged: () => void;
  onDone: (code: string, payUrl: string | null) => void;
}) {
  const [step, setStep] = useState<"cart" | "checkout">("cart");
  const [rows, setRows] = useState<Record<number, CheckRow>>({});
  const [checking, setChecking] = useState(false);
  const [raceMsg, setRaceMsg] = useState("");
  const [sending, setSending] = useState(false);
  const [formError, setFormError] = useState("");
  const [delivery, setDelivery] = useState<"RETIRO" | "ENVIO">(store.delivery.pickup ? "RETIRO" : "ENVIO");
  const [form, setForm] = useState(() => {
    try { return { name: "", phone: "", email: "", address: "", ...JSON.parse(localStorage.getItem("velora_checkout") || "{}"), notes: "" }; }
    catch { return { name: "", phone: "", email: "", address: "", notes: "" }; }
  });
  useEscape(() => { if (!policy) onClose(); });

  // zona de envío y cupón
  const zones = store.delivery.zones || [];
  const [zoneId, setZoneId] = useState<number | null>(zones.length === 1 ? zones[0].id : null);
  const [couponInput, setCouponInput] = useState("");
  const [couponCode, setCouponCode] = useState("");          // cupón que el cliente pidió aplicar
  const [quote, setQuote] = useState<CartQuote | null>(null); // totales calculados por el servidor
  const [quoting, setQuoting] = useState(false);
  const [policy, setPolicy] = useState<PolicyKind | null>(null);   // política abierta desde el checkout

  const entries = Object.entries(cart).map(([id, q]) => ({ p: productsById.get(Number(id)), q })).filter((x) => x.p) as { p: StoreProductPublic; q: number }[];
  const zone = zones.find((z) => z.id === zoneId) || null;
  const needsZone = delivery === "ENVIO" && zones.length > 0;
  const useQuote = step === "checkout" && quote !== null;

  // Los totales los calcula el servidor (/quote). Mientras responde, se muestra la cuenta local.
  const quoteRows: Record<number, CheckRow> = {};
  if (useQuote) quote.items.forEach((r) => { quoteRows[r.product_id] = r; });
  const unitPrice = (p: StoreProductPublic) => (quoteRows[p.id] ? quoteRows[p.id].price : p.price);
  const localItemsTotal = entries.reduce((s, x) => s + x.p.price * x.q, 0);
  const itemsTotal = useQuote ? quote.items_total : localItemsTotal;
  const discount = useQuote ? quote.discount : 0;
  const localShipping = delivery !== "ENVIO" ? 0 : zones.length > 0 ? (zone ? zoneCost(zone, localItemsTotal) : 0) : store.delivery.shipping_cost;
  const shipping = useQuote ? quote.shipping : localShipping;
  const total = useQuote ? quote.grand_total : itemsTotal + shipping;
  const deposit = !store.deposit.enabled ? 0 : useQuote ? quote.deposit_amount : Math.round(total * store.deposit.percent) / 100;
  const problems = Object.values(rows).filter((r) => !r.ok && cart[r.product_id]);
  const belowMin = store.min_order > 0 && localItemsTotal < store.min_order;
  const couponOk = !!(useQuote && quote.coupon && quote.coupon.ok);
  const couponMessage = useQuote && quote.coupon && !quote.coupon.ok ? quote.coupon.message : null;

  // Chequeo de stock en el servidor cada vez que cambia el carrito
  const cartKey = JSON.stringify(cart);
  useEffect(() => {
    if (!entries.length) { setRows({}); return; }
    setChecking(true);
    const t = window.setTimeout(async () => {
      try {
        const res = await storeApi<{ ok: boolean; items: CheckRow[] }>(`/public/store/${store.slug}/check`, {
          method: "POST",
          body: { items: entries.map((x) => ({ product_id: x.p.id, quantity: x.q })) },
        });
        const m: Record<number, CheckRow> = {};
        res.items.forEach((r) => { m[r.product_id] = r; });
        setRows(m);
      } catch { /* si falla, el pedido igual se vuelve a chequear al confirmar */ }
      finally { setChecking(false); }
    }, 350);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartKey, store.slug]);

  // Resumen del pedido en el servidor: precios del cliente, cupón, envío, total y seña
  useEffect(() => {
    if (step !== "checkout" || !entries.length) { setQuote(null); return; }
    let cancelled = false;
    setQuoting(true);
    const t = window.setTimeout(async () => {
      try {
        const res = await storeApi<CartQuote>(`/public/store/${store.slug}/quote`, {
          method: "POST",
          body: {
            items: entries.map((x) => ({ product_id: x.p.id, quantity: x.q })),
            delivery_type: delivery,
            shipping_zone_id: delivery === "ENVIO" ? zoneId : null,
            coupon_code: couponCode || null,
            phone: form.phone || null,
            email: form.email || null,
          },
        });
        if (!cancelled) setQuote(res);
      } catch {
        if (!cancelled) setQuote(null); // si falla, igual se recalcula todo al confirmar
      } finally {
        if (!cancelled) setQuoting(false);
      }
    }, 450);
    return () => { cancelled = true; window.clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, cartKey, delivery, zoneId, couponCode, form.phone, form.email, store.slug]);

  function applyCoupon() {
    setCouponCode(couponInput.trim().toUpperCase().replace(/\s+/g, ""));
  }

  function removeCoupon() {
    setCouponCode("");
    setCouponInput("");
  }

  function fixAll() {
    problems.forEach((r) => onSetRaw(r.product_id, r.available));
    setRaceMsg("");
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError("");
    if (problems.length) { setStep("cart"); return; }
    if (needsZone && !zone) { setFormError("Elegí la zona de envío."); return; }
    setSending(true);
    try {
      localStorage.setItem("velora_checkout", JSON.stringify({ name: form.name, phone: form.phone, email: form.email, address: form.address }));
    } catch { /* nada */ }
    try {
      const res = await storeApi<{ code: string; pay_url: string | null }>(`/public/store/${store.slug}/orders`, {
        method: "POST",
        body: {
          name: form.name, phone: form.phone, email: form.email || null,
          delivery_type: delivery, address: delivery === "ENVIO" ? form.address : null,
          notes: form.notes || null, site_url: window.location.origin,
          items: entries.map((x) => ({ product_id: x.p.id, quantity: x.q })),
          // el servidor vuelve a validar el cupón y a calcular el envío
          coupon_code: couponOk ? couponCode : null,
          shipping_zone_id: needsZone && zone ? zone.id : null,
        },
      });
      onDone(res.code, res.pay_url);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const items = (err.data as { items?: CheckRow[] }).items || [];
        const m: Record<number, CheckRow> = {};
        items.forEach((r) => { m[r.product_id] = r; });
        setRows(m);
        setRaceMsg("Mientras completabas tus datos, alguien compró algunas unidades. Revisá lo marcado y seguimos.");
        setStep("cart");
        onStockChanged();
      } else {
        setFormError(err instanceof Error ? err.message : "No se pudo hacer el pedido");
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="st-overlay st-overlay-drawer" onClick={onClose}>
      <aside className="st-drawer" role="dialog" aria-modal="true" aria-label="Carrito" onClick={(e) => e.stopPropagation()}>
        <div className="st-drawer-head">
          {step === "checkout" ? (
            <button className="st-back" onClick={() => setStep("cart")}>‹ Carrito</button>
          ) : <h3>Tu carrito</h3>}
          <ol className="st-steps" aria-label="Pasos">
            <li className={step === "cart" ? "is-on" : "is-done"}>1 · Productos</li>
            <li className={step === "checkout" ? "is-on" : ""}>2 · Datos</li>
          </ol>
          <button className="st-close st-close-inline" onClick={onClose} aria-label="Cerrar">×</button>
        </div>

        {entries.length === 0 ? (
          <div className="st-drawer-empty">
            <CartIcon />
            <strong>Tu carrito está vacío</strong>
            <p>Sumá productos desde la tienda.</p>
            <button className="st-btn st-btn-accent" onClick={onClose}>Ver productos</button>
          </div>
        ) : step === "cart" ? (
          <>
            <div className="st-drawer-body">
              {raceMsg && <div className="st-note st-note-warn">{raceMsg}</div>}
              {problems.length > 0 && (
                <div className="st-note st-note-warn st-note-row">
                  <span><strong>No hay stock suficiente</strong> para {problems.length === 1 ? "un producto" : `${problems.length} productos`}.</span>
                  <button className="st-btn st-btn-sm st-btn-outline" onClick={fixAll}>Ajustar al stock</button>
                </div>
              )}
              <ul className="st-lines">
                {entries.map(({ p, q }) => {
                  const r = rows[p.id];
                  const bad = r && !r.ok;
                  return (
                    <li key={p.id} className={bad ? "is-bad" : ""}>
                      <ProductImage p={p} />
                      <div className="st-line-main">
                        <strong>{p.name}</strong>
                        <span className="st-line-unit">{money(p.price)} c/u</span>
                        {bad && (
                          <span className="st-line-warn">
                            {r.available === 0 ? "Sin stock" : `Solo quedan ${r.available}`}
                            {" · "}
                            <button className="st-link" onClick={() => onSetRaw(p.id, r.available)}>
                              {r.available === 0 ? "Quitar" : `Dejar ${r.available}`}
                            </button>
                          </span>
                        )}
                        <div className="st-line-foot">
                          <Stepper qty={q} max={r ? r.available : p.available} onQty={(nq) => onQty(p, nq)} small />
                          <span className="st-line-total">{money(p.price * q)}</span>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
            <div className="st-drawer-foot">
              <div className="st-sum"><span>Subtotal</span><strong>{money(itemsTotal)}</strong></div>
              {belowMin && <div className="st-note st-note-info">La compra mínima es de {money(store.min_order)}.</div>}
              <button
                className="st-btn st-btn-accent st-btn-block"
                disabled={problems.length > 0 || belowMin || checking || !store.ready}
                onClick={() => setStep("checkout")}
              >
                {checking ? "Revisando stock…" : problems.length ? "Ajustá el carrito para seguir" : "Continuar"}
              </button>
              <p className="st-fine"><CheckIcon /> El stock se confirma en el momento: si algo se agota, te avisamos antes de pagar.</p>
            </div>
          </>
        ) : (
          <form className="st-checkout" onSubmit={submit}>
            <div className="st-drawer-body">
              <fieldset>
                <legend>¿Cómo lo recibís?</legend>
                <div className="st-options">
                  {store.delivery.pickup && (
                    <label className={`st-option ${delivery === "RETIRO" ? "is-on" : ""}`}>
                      <input type="radio" name="delivery" checked={delivery === "RETIRO"} onChange={() => setDelivery("RETIRO")} />
                      <StoreIcon />
                      <span><strong>Retiro en el local</strong><small>{store.delivery.pickup_note || store.contact.address || "Sin cargo"}</small></span>
                    </label>
                  )}
                  {store.delivery.shipping && (
                    <label className={`st-option ${delivery === "ENVIO" ? "is-on" : ""}`}>
                      <input type="radio" name="delivery" checked={delivery === "ENVIO"} onChange={() => setDelivery("ENVIO")} />
                      <TruckIcon />
                      <span>
                        <strong>
                          Envío a domicilio
                          {zones.length === 0 && ` · ${store.delivery.shipping_cost > 0 ? money(store.delivery.shipping_cost) : "sin cargo"}`}
                        </strong>
                        <small>{store.delivery.shipping_note || (zones.length > 0 ? "El costo depende de tu zona" : "Coordinamos el horario por WhatsApp")}</small>
                      </span>
                    </label>
                  )}
                </div>
              </fieldset>

              {needsZone && (
                <fieldset>
                  <legend>¿A qué zona te lo enviamos?</legend>
                  <div className="st-options">
                    {zones.map((z) => {
                      const cost = zoneCost(z, itemsTotal - discount);
                      return (
                        <label key={z.id} className={`st-option ${zoneId === z.id ? "is-on" : ""}`}>
                          <input type="radio" name="zone" checked={zoneId === z.id} onChange={() => setZoneId(z.id)} />
                          <PinIcon />
                          <span>
                            <strong>{z.name} · {cost > 0 ? money(cost) : "envío gratis"}</strong>
                            <small>
                              {[z.estimated_days,
                                z.free_from !== null && cost > 0 ? `Gratis comprando desde ${money(z.free_from)}` : null,
                              ].filter(Boolean).join(" · ") || "Coordinamos el horario por WhatsApp"}
                            </small>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              )}

              <fieldset>
                <legend>Tus datos</legend>
                <div className="st-field"><label htmlFor="st-name">Nombre y apellido</label>
                  <input id="st-name" required minLength={2} autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                <div className="st-field-row">
                  <div className="st-field"><label htmlFor="st-phone">Celular / WhatsApp</label>
                    <input id="st-phone" required minLength={6} inputMode="tel" autoComplete="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="261 555 1234" /></div>
                  <div className="st-field"><label htmlFor="st-email">Email <span>(opcional)</span></label>
                    <input id="st-email" type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                </div>
                {delivery === "ENVIO" && (
                  <div className="st-field"><label htmlFor="st-address">Dirección de entrega</label>
                    <input id="st-address" required autoComplete="street-address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Calle, número, depto, barrio" /></div>
                )}
                <div className="st-field"><label htmlFor="st-notes">Aclaraciones <span>(opcional)</span></label>
                  <textarea id="st-notes" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Ej: tocar timbre B, factura A…" /></div>
              </fieldset>

              {store.coupons && (
                <fieldset>
                  <legend>¿Tenés un cupón?</legend>
                  {couponOk ? (
                    <div className="st-coupon-applied">
                      <span><CheckIcon /> Cupón <strong>{couponCode}</strong> aplicado: ahorrás {money(discount)}</span>
                      <button type="button" className="st-link" onClick={removeCoupon}>Quitar</button>
                    </div>
                  ) : (
                    <>
                      <div className="st-coupon">
                        <input
                          value={couponInput}
                          onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyCoupon(); } }}
                          placeholder="Código del cupón"
                          aria-label="Código del cupón"
                          maxLength={40}
                          autoCapitalize="characters"
                        />
                        <button type="button" className="st-btn st-btn-outline" onClick={applyCoupon} disabled={!couponInput.trim() || quoting}>
                          {quoting && couponCode ? "Revisando…" : "Aplicar"}
                        </button>
                      </div>
                      {couponMessage && <p className="st-coupon-error" role="alert">{couponMessage}</p>}
                    </>
                  )}
                </fieldset>
              )}

              <div className="st-summary">
                {useQuote && quote.price_list && (
                  <div className="st-note st-note-info">Precios de tu lista <strong>{quote.price_list}</strong>.</div>
                )}
                {entries.map(({ p, q }) => (
                  <div key={p.id} className="st-sum st-sum-sm"><span>{q} × {p.name}</span><span>{money(unitPrice(p) * q)}</span></div>
                ))}
                {discount > 0 && <div className="st-sum st-sum-sm st-sum-ok"><span>Cupón {couponCode}</span><span>− {money(discount)}</span></div>}
                {delivery === "ENVIO" && (
                  <div className="st-sum st-sum-sm">
                    <span>Envío{zone ? ` · ${zone.name}` : ""}</span>
                    <span>{needsZone && !zone ? "Elegí tu zona" : shipping > 0 ? money(shipping) : "Sin cargo"}</span>
                  </div>
                )}
                <div className="st-sum st-sum-total"><span>Total final</span><strong>{money(total)}</strong></div>
                {store.prices_final && <p className="st-sum-note">Los precios publicados son finales.</p>}
                {store.deposit.enabled && (
                  <div className="st-deposit">
                    <div className="st-sum"><span>Seña para reservar ({store.deposit.percent}%)</span><strong>{money(deposit)}</strong></div>
                    <div className="st-sum st-sum-sm"><span>Pagás al recibir</span><span>{money(total - deposit)}</span></div>
                    <p>Pagás la seña con <strong>Mercado Pago</strong>. Te guardamos los productos {store.deposit.hold_minutes} minutos para completar el pago.</p>
                    {store.deposit.policy && <p className="st-deposit-policy"><strong>Si cancelás:</strong> {store.deposit.policy}</p>}
                  </div>
                )}
              </div>

              <SellerInfo legal={store.legal} compact />

              <p className="st-consent">
                Al confirmar aceptás la{" "}
                <a href="/legal/privacidad" target="_blank" rel="noopener noreferrer">Política de privacidad</a>
                {store.policies && (
                  <>
                    {" "}y las políticas de{" "}
                    <button type="button" className="st-link" onClick={() => setPolicy("returns")}>Cambios y devoluciones</button>
                    {" "}y{" "}
                    <button type="button" className="st-link" onClick={() => setPolicy("shipping")}>Envíos</button>
                    {" "}de {store.name}
                  </>
                )}
                . Tenés {store.withdrawal_days || 10} días corridos para arrepentirte de la compra.
              </p>
              {formError && <div className="st-note st-note-error" role="alert">{formError}</div>}
            </div>
            <div className="st-drawer-foot">
              <button className="st-btn st-btn-accent st-btn-block" type="submit" disabled={sending || quoting}>
                {sending ? "Confirmando stock…" : store.deposit.enabled ? `Pagar seña de ${money(deposit)}` : `Confirmar pedido · ${money(total)}`}
              </button>
              <p className="st-fine"><LockIcon /> {store.deposit.enabled ? "Te llevamos a Mercado Pago para pagar de forma segura." : "No pagás nada ahora: coordinamos el pago al entregar."}</p>
            </div>
          </form>
        )}
      </aside>
      {policy && store.policies && (
        <PolicySheet kind={policy} policies={store.policies} storeName={store.name} onClose={() => setPolicy(null)} />
      )}
    </div>
  );
}

// ============================================================
// ÍCONOS (trazo simple, heredan el color del texto)
// ============================================================
const ic = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
export const CartIcon = () => <svg {...ic}><circle cx="9" cy="20" r="1.4" /><circle cx="18" cy="20" r="1.4" /><path d="M2.5 3h3l2.6 12.2a1.6 1.6 0 0 0 1.6 1.3h8.1a1.6 1.6 0 0 0 1.6-1.2L21.5 8H6.4" /></svg>;
export const TruckIcon = () => <svg {...ic}><path d="M3 6h11v10H3zM14 9h4l3 3v4h-7" /><circle cx="7" cy="18" r="1.7" /><circle cx="17" cy="18" r="1.7" /></svg>;
export const StoreIcon = () => <svg {...ic}><path d="M4 9l1.5-5h13L20 9M4 9h16v11H4zM9 20v-6h6v6" /></svg>;
export const LockIcon = () => <svg {...ic}><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>;
export const CheckIcon = () => <svg {...ic}><path d="M5 12.5l4.2 4L19 7" /></svg>;
export const ClockIcon = () => <svg {...ic}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>;
const SearchIcon = () => <svg {...ic}><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2" /></svg>;
const PlusIcon = () => <svg {...ic} width={16} height={16}><path d="M12 5v14M5 12h14" /></svg>;
export const ChatIcon = () => <svg {...ic}><path d="M4 19.5l1.3-3.9A8 8 0 1 1 8.4 18.7z" /></svg>;
const CameraIcon = () => <svg {...ic}><rect x="3.5" y="3.5" width="17" height="17" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.3" cy="6.7" r=".8" fill="currentColor" /></svg>;
const MailIcon = () => <svg {...ic}><rect x="3" y="5.5" width="18" height="13" rx="2" /><path d="M3.5 7l8.5 6 8.5-6" /></svg>;
export const PinIcon = () => <svg {...ic}><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" /><circle cx="12" cy="10" r="2.3" /></svg>;
