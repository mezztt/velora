import { useEffect } from "react";
import type { ReactNode } from "react";
import { BrandFooter, BrandLockup, MezzttLink, useBrandLinks } from "../components/Brand";
import { APP_NAME } from "../config";

// ============================================================
// PÁGINAS LEGALES PÚBLICAS  /legal/terminos  ·  /legal/privacidad
// Texto informativo: no reemplaza el asesoramiento de un profesional (ver LEGAL.md).
// ============================================================

const UPDATED = "octubre de 2026";

/** Leyenda obligatoria de la Ley 25.326 (texto literal). */
const AAIP_NOTICE =
  "La AGENCIA DE ACCESO A LA INFORMACIÓN PÚBLICA, en su carácter de Órgano de Control de la Ley N° 25.326, " +
  "tiene la atribución de atender las denuncias y reclamos que interpongan quienes resulten afectados en sus " +
  "derechos por incumplimiento de las normas vigentes en materia de protección de datos personales.";

function Shell({ title, lead, other, children }: { title: string; lead: string; other: { href: string; label: string }; children: ReactNode }) {
  useEffect(() => {
    const previous = document.title;
    document.title = `${title} · ${APP_NAME}`;
    return () => { document.title = previous; };
  }, [title]);

  return (
    <main className="lg-page">
      <header className="lg-top">
        <BrandLockup size={40} />
        <a className="secondary-button lg-back" href="/">← Volver al inicio</a>
      </header>

      <article className="lg-card">
        <span className="dashboard-eyebrow">LEGAL</span>
        <h1>{title}</h1>
        <p className="lg-lead">{lead}</p>
        <p className="lg-updated">Última actualización: {UPDATED}</p>
        {children}
        <p className="lg-other">
          También podés leer: <a href={other.href}>{other.label}</a>.
        </p>
      </article>

      <footer className="lg-foot">
        <BrandFooter />
      </footer>
    </main>
  );
}

function Contact() {
  const { mezztt_instagram_url } = useBrandLinks();
  return (
    <p>
      Para comunicarte con <MezzttLink /> escribinos por Instagram:{" "}
      <a href={mezztt_instagram_url} target="_blank" rel="noopener noreferrer">{mezztt_instagram_url.replace(/^https?:\/\//, "")}</a>.
    </p>
  );
}

export function Terminos() {
  return (
    <Shell
      title="Términos del servicio"
      lead={`Las reglas de uso de ${APP_NAME}, en palabras simples.`}
      other={{ href: "/legal/privacidad", label: "Política de privacidad" }}
    >
      <h2>1. Qué es {APP_NAME}</h2>
      <p>
        {APP_NAME} es un sistema de gestión comercial por internet: ventas, stock, clientes, punto de venta, compras,
        reportes y, si el negocio lo contrata, una tienda online. Cada negocio usa el sistema con sus propios datos y
        solo ve los suyos.
      </p>

      <h2>2. Quién presta el servicio</h2>
      <p>
        El servicio lo presta <MezzttLink />, que desarrolla y mantiene el sistema. El negocio que lo contrata (el
        “cliente”) es quien lo usa para llevar su actividad.
      </p>
      <Contact />

      <h2>3. Tu cuenta y tus contraseñas</h2>
      <ul>
        <li>Cada persona entra con su email y su contraseña. No las compartas.</li>
        <li>El administrador del negocio decide quién tiene usuario y qué puede hacer cada uno.</li>
        <li>Si creés que alguien entró con tu cuenta, cambiá la contraseña y avisanos.</li>
      </ul>

      <h2>4. Uso permitido</h2>
      <ul>
        <li>Usá el sistema para la gestión de tu negocio y con datos reales que tengas derecho a cargar.</li>
        <li>No está permitido usarlo para actividades ilegales, intentar entrar a datos de otros negocios, ni afectar el funcionamiento del servicio.</li>
        <li>Lo que cargás (productos, precios, clientes, textos e imágenes de la tienda) es responsabilidad del negocio.</li>
      </ul>

      <h2>5. Abono y baja del servicio</h2>
      <ul>
        <li>El servicio tiene un pago inicial y un abono mensual, que se acuerdan con cada negocio según los módulos contratados.</li>
        <li>Podés pedir la baja cuando quieras, por los mismos medios de contacto con los que contrataste, sin trámites extra ni trabas.</li>
        <li>Si el abono queda impago, el acceso puede suspenderse hasta regularizarlo. Antes de eso te avisamos.</li>
      </ul>

      <h2>6. Disponibilidad</h2>
      <p>
        Trabajamos para que el sistema esté disponible todo el tiempo, pero no podemos garantizar que funcione sin
        interrupciones: puede haber cortes por mantenimiento, por fallas de internet o de los proveedores técnicos.
        Cuando el mantenimiento es programado, tratamos de avisar antes.
      </p>

      <h2>7. Responsabilidad</h2>
      <ul>
        <li>El sistema es una herramienta: las decisiones comerciales, los precios, el stock que se carga y la relación con los clientes son del negocio.</li>
        <li>Mezztt responde por el funcionamiento del sistema dentro de lo razonable y hasta el monto de lo abonado por el servicio en los últimos tres meses, salvo que la ley disponga otra cosa.</li>
        <li>Nada de esto limita los derechos que las leyes argentinas les dan a los consumidores.</li>
      </ul>

      <h2>8. Los datos son del negocio</h2>
      <p>
        Todo lo que el negocio carga en el sistema le pertenece. Puede pedir una copia de sus datos en cualquier
        momento, también al darse de baja. Cómo se tratan los datos personales está explicado en la{" "}
        <a href="/legal/privacidad">Política de privacidad</a>.
      </p>

      <h2>9. Tienda online</h2>
      <ul>
        <li>En cada tienda online el vendedor es el negocio que la publica: él fija los precios, las políticas de cambios, devoluciones y envíos, y entrega los productos.</li>
        <li>Mezztt provee el software y no es parte de la compraventa.</li>
        <li>Si la tienda pide una seña, se paga por Mercado Pago y el dinero va directo a la cuenta del negocio.</li>
        <li>Quien compra tiene 10 días corridos para arrepentirse de la compra (Ley 24.240): cada tienda tiene su “Botón de arrepentimiento”.</li>
      </ul>

      <h2>10. Comprobantes</h2>
      <p>
        Los tickets, pedidos, remitos y presupuestos que imprime el sistema son comprobantes internos y no son válidos
        como factura. La factura electrónica solo es válida cuando el negocio conectó su propio certificado de ARCA y
        el comprobante tiene un CAE otorgado por ARCA.
      </p>

      <h2>11. Cambios en estos términos</h2>
      <p>
        Si cambiamos estos términos, publicamos la versión nueva en esta misma página con su fecha. Si el cambio es
        importante, se lo avisamos a los negocios que usan el sistema.
      </p>

      <h2>12. Ley aplicable</h2>
      <p>
        Estos términos se rigen por las leyes de la República Argentina.
      </p>
    </Shell>
  );
}

export function Privacidad() {
  return (
    <Shell
      title="Política de privacidad"
      lead="Qué datos personales se guardan en el sistema, para qué, y cómo ejercer tus derechos (Ley 25.326)."
      other={{ href: "/legal/terminos", label: "Términos del servicio" }}
    >
      <h2>1. Quién es responsable de tus datos</h2>
      <p>
        Cada negocio que usa {APP_NAME} es el <strong>responsable de su base de datos</strong>: decide qué datos de sus
        clientes carga y para qué los usa. <MezzttLink /> presta el software y trata esos datos{" "}
        <strong>por cuenta del negocio</strong>, solo para que el sistema funcione.
      </p>

      <h2>2. Qué datos se guardan</h2>
      <ul>
        <li><strong>Del negocio y sus usuarios:</strong> nombre del negocio, email, teléfono, CUIT, y de cada usuario su nombre, email y contraseña (guardada cifrada: nadie la puede leer).</li>
        <li><strong>De los clientes y proveedores que el negocio carga:</strong> nombre, teléfono, email, dirección, CUIT o DNI, y sus compras, pedidos, facturas, pagos y cuenta corriente.</li>
        <li><strong>De quienes compran en una tienda online:</strong> nombre y apellido, celular, email (opcional), dirección de entrega (si pide envío), las aclaraciones que escriba y el detalle del pedido.</li>
        <li><strong>De quienes usan el Botón de arrepentimiento:</strong> el código de pedido o el nombre y contacto que carguen, y el motivo si lo escriben.</li>
      </ul>
      <p>
        El sistema no guarda datos de tarjetas. Cuando una tienda pide una seña, el pago lo procesa Mercado Pago según
        sus propias condiciones.
      </p>

      <h2>3. Para qué se usan</h2>
      <ul>
        <li>Para que el negocio pueda vender, entregar, facturar y cobrar.</li>
        <li>Para avisarle al negocio de pedidos, pagos y solicitudes.</li>
        <li>Para dar soporte y mantener el sistema funcionando.</li>
      </ul>

      <h2>4. Con quién se comparten</h2>
      <p>
        Los datos <strong>no se venden ni se ceden</strong>. Solo los tratan los proveedores técnicos necesarios para
        que el sistema funcione (por ejemplo, el servidor donde está alojado) y Mercado Pago cuando se paga una seña.
        También pueden entregarse si lo exige una autoridad con una orden válida.
      </p>

      <h2>5. Tus derechos</h2>
      <p>
        Podés pedir en cualquier momento el <strong>acceso</strong> a tus datos, que se <strong>rectifiquen</strong>,
        se <strong>actualicen</strong> o se <strong>supriman</strong>. El pedido se hace ante el negocio al que le
        diste tus datos (sus datos de contacto están en su tienda o en sus comprobantes). Si no sabés a quién
        dirigirte o no te responden, escribinos y te ayudamos a canalizarlo.
      </p>
      <Contact />

      <h2>6. Seguridad</h2>
      <ul>
        <li>Se entra con usuario y contraseña, y cada negocio ve solamente sus datos.</li>
        <li>Las contraseñas se guardan cifradas.</li>
        <li>Se hacen copias de seguridad de la información.</li>
      </ul>
      <p>Ningún sistema es infalible: si detectamos un problema de seguridad que afecte tus datos, se lo avisamos al negocio.</p>

      <h2>7. Cookies y almacenamiento del navegador</h2>
      <p>
        {APP_NAME} no usa cookies de publicidad ni rastreadores de terceros. Guarda en tu navegador lo necesario para
        funcionar: la sesión iniciada, el modo claro u oscuro, y en la tienda online tu carrito y los datos que
        completaste para que no tengas que escribirlos de nuevo (podés borrarlos limpiando los datos del sitio). La
        tienda online descarga una tipografía desde Google Fonts: para entregarla, Google recibe la dirección IP de tu
        dispositivo.
      </p>

      <h2>8. Cuánto tiempo se guardan</h2>
      <p>
        Mientras el negocio use el sistema y durante el tiempo que le exijan las normas impositivas y comerciales.
        Cuando el negocio se da de baja, puede pedir una copia de sus datos y su eliminación.
      </p>

      <h2>9. Órgano de control</h2>
      <p className="lg-notice">{AAIP_NOTICE}</p>

      <h2>10. Cambios</h2>
      <p>Si cambiamos esta política, publicamos la versión nueva en esta misma página con su fecha.</p>
    </Shell>
  );
}
