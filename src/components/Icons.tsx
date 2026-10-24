// Íconos del menú y de la barra superior: trazo simple, todos del mismo tamaño y grosor,
// heredan el color del texto (se ven igual en claro y oscuro).
import type { ReactNode } from "react";

const PATHS: Record<string, ReactNode> = {
  mail: <><rect x="3.5" y="5.5" width="17" height="13" rx="2.5" /><path d="m4.2 8.2 7.8 5.6 7.8-5.6" /></>,
  home: <><path d="M4 11.5 12 4l8 7.5" /><path d="M6 10v9h12v-9" /><path d="M10 19v-5h4v5" /></>,
  orders: <><rect x="5" y="4" width="14" height="17" rx="2.5" /><path d="M9 4.5V3h6v1.5" /><path d="M9 10h6M9 14h6M9 18h3" /></>,
  deliveries: <><path d="M3 6.5h11v9.5H3z" /><path d="M14 9.5h3.5L21 13v3h-7" /><circle cx="7.5" cy="17.5" r="1.8" /><circle cx="17" cy="17.5" r="1.8" /></>,
  sell: <><circle cx="9" cy="19.5" r="1.4" /><circle cx="17.5" cy="19.5" r="1.4" /><path d="M3 4h2.6l2.3 11.2a1.5 1.5 0 0 0 1.5 1.2h7.9a1.5 1.5 0 0 0 1.5-1.1L20.5 8H6.6" /></>,
  store: <><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17" /><path d="M12 3.5c2.6 2.6 2.6 14.4 0 17M12 3.5c-2.6 2.6-2.6 14.4 0 17" /></>,
  cash: <><rect x="3" y="6.5" width="18" height="11" rx="2" /><circle cx="12" cy="12" r="2.6" /><path d="M6.5 10v4M17.5 10v4" /></>,
  invoice: <><path d="M6 3.5h12v17l-2.5-1.6L13 20.5l-2.5-1.6L8 20.5 6 19.2z" /><path d="M9 8h6M9 12h6" /></>,
  accounts: <><rect x="3" y="5.5" width="18" height="13" rx="2.5" /><path d="M3 10h18" /><path d="M7 14.5h4" /></>,
  products: <><path d="M12 3.5 20 8v8l-8 4.5L4 16V8z" /><path d="M4 8l8 4.5L20 8" /><path d="M12 12.5v8" /></>,
  customers: <><circle cx="9" cy="8.5" r="3.2" /><path d="M3.5 19.5c.4-3.3 2.6-5 5.5-5s5.1 1.7 5.5 5" /><path d="M15.5 5.6a3.2 3.2 0 0 1 0 5.8" /><path d="M17.5 14.8c1.7.6 2.7 2.2 3 4.7" /></>,
  stock: <><path d="M12 4 20.5 8.5 12 13 3.5 8.5z" /><path d="M3.5 12.5 12 17l8.5-4.5" /><path d="M3.5 16.2 12 20.7l8.5-4.5" /></>,
  suppliers: <><path d="M4 20.5V9l8-5 8 5v11.5" /><path d="M9 20.5v-6h6v6" /><path d="M9 10.5h6" /></>,
  purchases: <><path d="M5 8h14l-1 12.5H6z" /><path d="M9 8V6.5a3 3 0 0 1 6 0V8" /></>,
  reports: <><path d="M4 20.5h16" /><path d="M7 20.5v-7M12 20.5V5M17 20.5v-10" /></>,
  sellers: <><circle cx="12" cy="8" r="3.4" /><path d="M5 20.5c.5-3.8 3.2-5.8 7-5.8s6.5 2 7 5.8" /><path d="m9.8 17.6 1.6 1.6 3-3.2" /></>,
  users: <><circle cx="12" cy="8.2" r="3.6" /><path d="M5 20.5c.5-3.9 3.2-6 7-6s6.5 2.1 7 6" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 3.5v2.3M12 18.2v2.3M3.5 12h2.3M18.2 12h2.3M6 6l1.6 1.6M16.4 16.4 18 18M18 6l-1.6 1.6M7.6 16.4 6 18" /></>,
  systems: <><rect x="4" y="4" width="7" height="7" rx="1.8" /><rect x="13" y="4" width="7" height="7" rx="1.8" /><rect x="4" y="13" width="7" height="7" rx="1.8" /><rect x="13" y="13" width="7" height="7" rx="1.8" /></>,
  bell: <><path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 2h-14z" /><path d="M10 20.5a2.2 2.2 0 0 0 4 0" /></>,
  logout: <><path d="M14 4.5h4.5v15H14" /><path d="M4 12h10" /><path d="m10.5 8.5 3.5 3.5-3.5 3.5" /></>,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  chevronLeft: <path d="m14.5 6-6 6 6 6" />,
  chevronRight: <path d="m9.5 6 6 6-6 6" />,
};

export type IconName = keyof typeof PATHS;

export default function Icon({ name, size = 18 }: { name: string; size?: number }) {
  return (
    <svg className="vl-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name] || PATHS.home}
    </svg>
  );
}
