// Tipos de negocio de Velora. Mismos datos que backend/rubros.py (fuente: specs/rubros.json).
export interface Rubro {
  key: string;
  label: string;
  icon: string;
  tagline: string;
  modules: string[];
}

export const RUBROS: Rubro[] = [
  {
    "key": "KIOSCO_ALMACEN",
    "label": "Kiosco o almacén",
    "icon": "🛒",
    "tagline": "Venta rápida, stock y proveedores",
    "modules": [
      "productos",
      "stock",
      "pos",
      "caja",
      "clientes",
      "proveedores",
      "compras",
      "reportes"
    ]
  },
  {
    "key": "FERRETERIA",
    "label": "Ferretería y corralón",
    "icon": "🔧",
    "tagline": "Cuentas corrientes, entregas y facturación",
    "modules": [
      "productos",
      "stock",
      "pos",
      "caja",
      "clientes",
      "cuentas",
      "proveedores",
      "compras",
      "facturacion",
      "entregas",
      "reportes"
    ]
  },
  {
    "key": "INDUMENTARIA",
    "label": "Ropa y calzado",
    "icon": "👕",
    "tagline": "Local y tienda online con vendedores",
    "modules": [
      "productos",
      "stock",
      "pos",
      "caja",
      "clientes",
      "ecommerce",
      "landing",
      "vendedores",
      "facturacion",
      "reportes"
    ]
  },
  {
    "key": "LIBRERIA_REGALERIA",
    "label": "Librería y regalería",
    "icon": "🎁",
    "tagline": "Catálogo online y pedidos",
    "modules": [
      "productos",
      "stock",
      "pos",
      "caja",
      "ecommerce",
      "pedidos",
      "proveedores",
      "reportes"
    ]
  },
  {
    "key": "PERFUMERIA",
    "label": "Perfumería y cosmética",
    "icon": "💄",
    "tagline": "Mostrador, tienda y comisiones",
    "modules": [
      "productos",
      "stock",
      "pos",
      "caja",
      "clientes",
      "ecommerce",
      "vendedores",
      "reportes"
    ]
  },
  {
    "key": "ELECTRO_HOGAR",
    "label": "Electro, tecnología y hogar",
    "icon": "📺",
    "tagline": "Ventas en cuotas, entregas y tienda",
    "modules": [
      "productos",
      "stock",
      "pos",
      "caja",
      "clientes",
      "cuentas",
      "facturacion",
      "ecommerce",
      "vendedores",
      "entregas",
      "reportes"
    ]
  },
  {
    "key": "DISTRIBUIDORA",
    "label": "Distribuidora o mayorista",
    "icon": "🚚",
    "tagline": "Pedidos, reparto y cuentas corrientes",
    "modules": [
      "productos",
      "stock",
      "clientes",
      "cuentas",
      "pedidos",
      "entregas",
      "facturacion",
      "compras",
      "proveedores",
      "vendedores",
      "reportes"
    ]
  },
  {
    "key": "MASCOTAS",
    "label": "Pet shop y veterinaria",
    "icon": "🐾",
    "tagline": "Mostrador, pedidos y envíos",
    "modules": [
      "productos",
      "stock",
      "pos",
      "caja",
      "clientes",
      "pedidos",
      "entregas",
      "ecommerce"
    ]
  },
  {
    "key": "VERDULERIA_CARNICERIA",
    "label": "Verdulería, carnicería y fiambrería",
    "icon": "🥩",
    "tagline": "Venta al mostrador y compras diarias",
    "modules": [
      "productos",
      "stock",
      "pos",
      "caja",
      "proveedores",
      "compras",
      "entregas"
    ]
  },
  {
    "key": "OTRO",
    "label": "Otro comercio",
    "icon": "🏪",
    "tagline": "Lo básico para empezar",
    "modules": [
      "productos",
      "stock",
      "pos",
      "caja",
      "clientes"
    ]
  }
];

export const rubroLabel = (key?: string | null) => RUBROS.find((r) => r.key === key)?.label ?? "";

/** Sugerencias de categorías y unidades por rubro (mismas que backend/rubros.py). Velora guarda la categoría como texto libre. */
export const RUBRO_STARTER: Record<string, { categories: string[]; units: string[] }> = {
  "KIOSCO_ALMACEN": {
    "categories": [
      "Golosinas",
      "Bebidas",
      "Cigarrillos",
      "Galletitas y snacks",
      "Almacén",
      "Lácteos y fiambres",
      "Limpieza",
      "Perfumería e higiene",
      "Varios"
    ],
    "units": [
      "unidad",
      "pack",
      "caja"
    ]
  },
  "FERRETERIA": {
    "categories": [
      "Herramientas manuales",
      "Herramientas eléctricas",
      "Pinturas",
      "Plomería",
      "Electricidad",
      "Tornillería y fijaciones",
      "Materiales de obra",
      "Jardín",
      "Seguridad",
      "Adhesivos y selladores"
    ],
    "units": [
      "unidad",
      "metro",
      "kg",
      "bolsa",
      "litro",
      "caja"
    ]
  },
  "INDUMENTARIA": {
    "categories": [
      "Remeras",
      "Pantalones y jeans",
      "Camperas y abrigos",
      "Vestidos y polleras",
      "Ropa interior",
      "Calzado",
      "Accesorios",
      "Deportivo",
      "Niños",
      "Ofertas"
    ],
    "units": [
      "unidad",
      "par",
      "combo"
    ]
  },
  "LIBRERIA_REGALERIA": {
    "categories": [
      "Cuadernos y carpetas",
      "Escritura",
      "Papelería",
      "Arte y manualidades",
      "Mochilas y cartucheras",
      "Libros",
      "Regalos",
      "Tarjetas y envoltorios",
      "Juguetes",
      "Útiles escolares"
    ],
    "units": [
      "unidad",
      "pack",
      "resma",
      "caja"
    ]
  },
  "PERFUMERIA": {
    "categories": [
      "Perfumes",
      "Maquillaje",
      "Cuidado de la piel",
      "Cuidado del cabello",
      "Higiene personal",
      "Accesorios",
      "Cuidado corporal",
      "Sets y regalos"
    ],
    "units": [
      "unidad",
      "ml",
      "set"
    ]
  },
  "ELECTRO_HOGAR": {
    "categories": [
      "Televisores y audio",
      "Celulares y tecnología",
      "Electrodomésticos chicos",
      "Electrodomésticos grandes",
      "Climatización",
      "Cocina",
      "Muebles",
      "Colchones y blanquería",
      "Accesorios y cables",
      "Iluminación"
    ],
    "units": [
      "unidad",
      "combo"
    ]
  },
  "DISTRIBUIDORA": {
    "categories": [
      "Bebidas",
      "Almacén",
      "Golosinas y snacks",
      "Lácteos y fiambres",
      "Limpieza",
      "Perfumería",
      "Congelados",
      "Descartables",
      "Varios"
    ],
    "units": [
      "unidad",
      "pack",
      "caja",
      "bulto",
      "pallet"
    ]
  },
  "MASCOTAS": {
    "categories": [
      "Alimento para perros",
      "Alimento para gatos",
      "Snacks y premios",
      "Higiene y cuidado",
      "Accesorios y juguetes",
      "Camas y transportadoras",
      "Acuarismo",
      "Pájaros y roedores",
      "Antiparasitarios",
      "Farmacia veterinaria"
    ],
    "units": [
      "unidad",
      "kg",
      "bolsa"
    ]
  },
  "VERDULERIA_CARNICERIA": {
    "categories": [
      "Frutas",
      "Verduras",
      "Carnes vacunas",
      "Pollo y cerdo",
      "Embutidos y fiambres",
      "Lácteos y quesos",
      "Huevos",
      "Almacén",
      "Bebidas",
      "Elaborados"
    ],
    "units": [
      "kg",
      "unidad",
      "docena",
      "atado",
      "gramo"
    ]
  },
  "OTRO": {
    "categories": [
      "General",
      "Ofertas",
      "Novedades"
    ],
    "units": [
      "unidad",
      "pack",
      "caja"
    ]
  }
};
