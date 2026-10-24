import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import PriceLists from "./PriceLists";
import BulkPrices from "./BulkPrices";
import { currentRole } from "../extras";
import { API_URL } from "../apiBase";
import { fmtMoney } from "../money";

interface Product {
  id: number;
  company_id: number;
  name: string;
  sku: string | null;
  description: string | null;
  price: number;
  stock: number;
  active: boolean;
  barcode?: string | null;
  cost?: number | null;
  category?: string | null;
  supplier_id?: number | null;
}

interface SupplierLite {
  id: number;
  name: string;
}

type ProductsTab = "productos" | "listas" | "masiva";

function Products() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  // pestañas: Productos · Listas de precios · Actualizar precios
  const [params, setParams] = useSearchParams();
  const tabParam = params.get("tab");
  const tab: ProductsTab = tabParam === "listas" || tabParam === "masiva" ? tabParam : "productos";
  function setTab(next: ProductsTab) {
    setParams(next === "productos" ? {} : { tab: next }, { replace: true });
  }
  // cambiar precios / listas: administrador o encargado (otros roles solo miran)
  const role = currentRole();
  const canEditPrices = !["VENDEDOR", "CAJERO", "DEPOSITO"].includes(role);

  const [suppliers, setSuppliers] = useState<SupplierLite[]>([]);
  const [cost, setCost] = useState("");
  const [category, setCategory] = useState("");
  const [supplierId, setSupplierId] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState("");

  const [showImport, setShowImport] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [importing, setImporting] = useState(false);

  const [importFile, setImportFile] = useState<File | null>(null);

  const [importProducts, setImportProducts] = useState<Product[]>([]);
  const [importWarnings, setImportWarnings] = useState<
  { row: number; messages: string[] }[]
>([]);

  const [editingProduct, setEditingProduct] =
    useState<Product | null>(null);

  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("");

  const [barcode, setBarcode] = useState("");


  async function analyzeExcel(file: File) {
  setImportLoading(true);
  setImportFile(file);

  try {
    const token =
      localStorage.getItem("velora_token");

    const formData = new FormData();

    formData.append("file", file);

    const response = await fetch(
      `${API_URL}/products/import/analyze`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.detail ||
        "No se pudo analizar el Excel."
      );
    }

    setImportProducts(
      data.products.map(
        (product: any) => ({
          id: product.temp_id,
          company_id: 0,
          name: product.name,
          sku: product.sku,
          description: product.description,
          price: product.price,
          stock: product.stock,
          active: true,
        })
      )
    );

    setImportWarnings(
      data.warnings || []
    );

  } catch (error) {
    console.error(
      "Error analizando Excel:",
      error
    );

    alert(
      error instanceof Error
        ? error.message
        : "No se pudo analizar el Excel."
    );

    setImportFile(null);
  } finally {
    setImportLoading(false);
  }
}


function updateImportProduct(
  index: number,
  field: keyof Product,
  value: string
) {
  setImportProducts(
    current =>
      current.map(
        (product, productIndex) => {

          if (productIndex !== index) {
            return product;
          }

          if (
            field === "price" ||
            field === "stock"
          ) {
            return {
              ...product,
              [field]: Number(value),
            };
          }

          return {
            ...product,
            [field]: value,
          };
        }
      )
  );
}


function removeImportProduct(
  index: number
) {
  setImportProducts(
    current =>
      current.filter(
        (_, productIndex) =>
          productIndex !== index
      )
  );
}


function closeImport() {
  setShowImport(false);
  setImportFile(null);
  setImportProducts([]);
  setImportWarnings([]);
  setImportLoading(false);
  setImporting(false);
}


async function importProductsToVelora() {
  if (!importProducts.length) {
    return;
  }

  setImporting(true);

  try {
    const token =
      localStorage.getItem("velora_token");

    const response = await fetch(
      `${API_URL}/products/import`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(
          importProducts.map(
            product => ({
              name: product.name,
              sku: product.sku,
              description:
                product.description,
              price: product.price,
              stock: product.stock,
              active: true,
            })
          )
        ),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.detail?.message ||
        data.detail ||
        "No se pudieron importar los productos."
      );
    }

    closeImport();

    await loadProducts();

    alert(
      `${data.total} productos importados correctamente.`
    );

  } catch (error) {
    console.error(
      "Error importando productos:",
      error
    );

    alert(
      error instanceof Error
        ? error.message
        : "No se pudieron importar los productos."
    );

  } finally {
    setImporting(false);
  }
}

  async function loadProducts() {
    setLoading(true);

    try {
      const token =
        localStorage.getItem("velora_token");

      const response = await fetch(
        `${API_URL}/products`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (response.status === 401) {
        throw new Error(
          "Sesión no válida o expirada"
        );
      }

      if (!response.ok) {
        throw new Error(
          `No se pudieron cargar los productos (${response.status})`
        );
      }

      const data: Product[] =
        await response.json();

      setProducts(data);
    } catch (error) {
      console.error(
        "Error cargando productos:",
        error
      );
    } finally {
      setLoading(false);
    }
  }

  async function loadSuppliers() {
    try {
      const response = await fetch(
        `${API_URL}/suppliers`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("velora_token")}`,
          },
        }
      );
      if (response.ok) {
        setSuppliers(await response.json());
      }
    } catch {
      // sin proveedores cargados: el selector queda vacío
    }
  }

  // categorías sugeridas para el tipo de negocio de la empresa (solo lectura; si falla, se ignora)
  const [suggestedCategories, setSuggestedCategories] = useState<string[]>([]);
  async function loadSuggestedCategories() {
    try {
      const response = await fetch(`${API_URL}/company/rubro-sugerencias`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("velora_token")}` },
      });
      if (response.ok) {
        const data = await response.json();
        setSuggestedCategories(Array.isArray(data.categories) ? data.categories : []);
      }
    } catch {
      // sin sugerencias: el campo funciona igual
    }
  }

  useEffect(() => {
    loadProducts();
    loadSuppliers();
    loadSuggestedCategories();
  }, []);

  const categoryOptions = Array.from(
    new Set(
      [...products.map((product) => product.category || ""), ...suggestedCategories]
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b, "es"));

  function resetForm() {
    setName("");
    setSku("");
    setDescription("");
    setPrice("");
    setStock("");
    setBarcode("");
    setCost("");
    setCategory("");
    setSupplierId("");
    setEditingProduct(null);
  }

  function closeForm() {
    resetForm();
    setShowForm(false);
  }

  function openCreateForm() {
    resetForm();
    setShowForm(true);
  }

  function openEditForm(product: Product) {
    setEditingProduct(product);

    setName(product.name);
    setSku(product.sku || "");
    setDescription(
      product.description || ""
    );
    setPrice(String(product.price));
    setStock(String(product.stock));
    setBarcode(product.barcode || "");
    setCost(
      product.cost === null || product.cost === undefined
        ? ""
        : String(product.cost)
    );
    setCategory(product.category || "");
    setSupplierId(
      product.supplier_id ? String(product.supplier_id) : ""
    );

    setShowForm(true);
  }

  async function saveProduct(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setSaving(true);

    try {
      const token =
        localStorage.getItem("velora_token");

      const isEditing =
        editingProduct !== null;

      const url = isEditing
        ? `${API_URL}/products/${editingProduct.id}`
        : `${API_URL}/products`;

      const response = await fetch(url, {
        method: isEditing
          ? "PUT"
          : "POST",

        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },

        body: JSON.stringify({
          name,
          sku: sku || null,
          description:
            description || null,
          price: Number(price),
          stock: Number(stock),
          active: true,
          barcode: barcode.trim() || null,
          cost: cost.trim() === "" ? null : Number(cost),
          category: category.trim() || null,
          supplier_id: supplierId ? Number(supplierId) : null,
        }),
      });

      if (!response.ok) {
        throw new Error(
          isEditing
            ? `No se pudo actualizar el producto (${response.status})`
            : `No se pudo crear el producto (${response.status})`
        );
      }

      closeForm();

      await loadProducts();
    } catch (error) {
      console.error(
        "Error guardando producto:",
        error
      );

      alert(
        editingProduct
          ? "No se pudo actualizar el producto."
          : "No se pudo crear el producto."
      );
    } finally {
      setSaving(false);
    }
  }

  async function deleteProduct(
    product: Product
  ) {
    const confirmed = window.confirm(
      `¿Querés eliminar "${product.name}"?`
    );

    if (!confirmed) {
      return;
    }

    try {
      const token =
        localStorage.getItem("velora_token");

      const response = await fetch(
        `${API_URL}/products/${product.id}`,
        {
          method: "DELETE",

          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error(
          `No se pudo eliminar el producto (${response.status})`
        );
      }

      await loadProducts();
    } catch (error) {
      console.error(
        "Error eliminando producto:",
        error
      );

      alert(
        "No se pudo eliminar el producto."
      );
    }
  }

  const filteredProducts =
    products.filter((product) => {
      const searchText =
        search.toLowerCase().trim();

      if (!searchText) {
        return true;
      }

      return (
        product.name
          .toLowerCase()
          .includes(searchText) ||
        product.sku
          ?.toLowerCase()
          .includes(searchText) ||
        product.description
          ?.toLowerCase()
          .includes(searchText)
      );
    });

  return (
    <section className="products-page">

      {/* HEADER */}

      <div className="products-header">

        <div>

          <span className="dashboard-eyebrow">
            CATÁLOGO
          </span>

          <h1>
            Productos
          </h1>

          <p>
            Administrá los productos y el
            stock de tu distribuidora.
          </p>

        </div>

      <div className="products-header-actions">

  <button
    className="secondary-button products-import-button"
    type="button"
    onClick={() => setShowImport(true)}
  >
    Cargar productos ↓
  </button>

  <button
    className="primary-button"
    onClick={openCreateForm}
  >
    + Nuevo producto
  </button>

</div>

      </div>


      {/* PESTAÑAS */}

      <div className="vx-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "productos"} className={tab === "productos" ? "is-on" : ""} onClick={() => setTab("productos")}>Productos</button>
        <button type="button" role="tab" aria-selected={tab === "listas"} className={tab === "listas" ? "is-on" : ""} onClick={() => setTab("listas")}>Listas de precios</button>
        <button type="button" role="tab" aria-selected={tab === "masiva"} className={tab === "masiva" ? "is-on" : ""} onClick={() => setTab("masiva")}>Actualizar precios</button>
      </div>

      {tab === "listas" && <PriceLists canEdit={canEditPrices} />}

      {tab === "masiva" && (
        <BulkPrices products={products} canEdit={canEditPrices} onApplied={loadProducts} />
      )}

      {tab === "productos" && (
      <>

      {/* SEARCH */}

      <div className="products-toolbar">

        <div className="products-search">

          <span className="products-search-icon">
            ⌕
          </span>

          <input
            type="text"
            value={search}
            onChange={(event) =>
              setSearch(
                event.target.value
              )
            }
            placeholder="Buscar producto, SKU..."
          />

          {search && (

            <button
              className="products-search-clear"
              onClick={() =>
                setSearch("")
              }
              type="button"
            >
              ×
            </button>

          )}

        </div>

        <div className="products-count">

          {filteredProducts.length}{" "}
          {filteredProducts.length === 1
            ? "producto"
            : "productos"}

        </div>

      </div>


      {/* TABLE */}

      <div className="products-table-container">

        {loading ? (

          <div className="products-loading">

            <div className="products-loading-spinner" />

            <span>
              Cargando productos...
            </span>

          </div>

        ) : filteredProducts.length === 0 ? (

          <div className="products-empty">

            <div className="products-empty-icon">
              ◯
            </div>

            <h3>
              {products.length === 0
                ? "No hay productos"
                : "No encontramos productos"}
            </h3>

            <p>
              {products.length === 0
                ? "Cuando agregues productos aparecerán aquí."
                : "Probá con otro nombre o SKU."}
            </p>

            {search && (

              <button
                className="secondary-button"
                onClick={() =>
                  setSearch("")
                }
              >
                Limpiar búsqueda
              </button>

            )}

          </div>

        ) : (

          <div className="products-table-wrapper">

            <table className="products-table">

              <thead>

                <tr>

                  <th>
                    Producto
                  </th>

                  <th>
                    SKU
                  </th>

                  <th>
                    Costo
                  </th>

                  <th>
                    Precio
                  </th>

                  <th>
                    Stock
                  </th>

                  <th>
                    Estado
                  </th>

                  <th>
                    Acciones
                  </th>

                </tr>

              </thead>

              <tbody>

                {filteredProducts.map(
                  (product) => (

                    <tr
                      key={product.id}
                    >

                      <td>

                        <div className="product-name">
                          {product.name}
                        </div>

                        {product.description && (

                          <div className="product-description">
                            {product.description}
                          </div>

                        )}

                        {product.category && (
                          <div className="vx-badges">
                            <span className="vx-badge">
                              {product.category}
                            </span>
                          </div>
                        )}

                      </td>

                      <td>
                        {product.sku || "—"}
                      </td>

                      <td>
                        {product.cost === null ||
                        product.cost === undefined
                          ? "—"
                          : fmtMoney(product.cost)}
                      </td>

                      <td>

                        <span className="product-price">
                          {fmtMoney(product.price)}
                        </span>

                      </td>

                      <td>

                        <span
                          className={
                            product.stock <= 5
                              ? "stock-low"
                              : "stock-normal"
                          }
                        >
                          {product.stock}
                        </span>

                      </td>

                      <td>

                        <span className="status-active">

                          <span className="status-dot" />

                          Activo

                        </span>

                      </td>

                      <td>

                        <div className="product-actions">

                          <button
                            type="button"
                            className="product-action-edit"
                            onClick={() =>
                              openEditForm(product)
                            }
                          >
                            Editar
                          </button>

                          <button
                            type="button"
                            className="product-action-delete"
                            onClick={() =>
                              deleteProduct(product)
                            }
                          >
                            Eliminar
                          </button>

                        </div>

                      </td>

                    </tr>

                  )
                )}

              </tbody>

            </table>

          </div>

        )}

      </div>

      </>
      )}


      {/* MODAL */}

      {showForm && (

        <div
          className="modal-overlay"
          onClick={closeForm}
        >

          <div
            className="product-modal"
            onClick={(event) =>
              event.stopPropagation()
            }
          >

            <div className="modal-header">

              <div>

                <span className="dashboard-eyebrow">
                  CATÁLOGO
                </span>

                <h2>
                  {editingProduct
                    ? "Editar producto"
                    : "Nuevo producto"}
                </h2>

              </div>

              <button
                className="modal-close"
                onClick={closeForm}
                type="button"
              >
                ×
              </button>

            </div>


            <form
              onSubmit={saveProduct}
              className="product-form"
            >

              <div className="form-group">

                <label>
                  Nombre
                </label>

                <input
                  type="text"
                  value={name}
                  onChange={(event) =>
                    setName(
                      event.target.value
                    )
                  }
                  placeholder="Ej. Coca Cola 2.25L"
                  required
                />

              </div>


              <div className="form-row">

                <div className="form-group">

                  <label>
                    SKU
                  </label>

                  <input
                    type="text"
                    value={sku}
                    onChange={(event) =>
                      setSku(
                        event.target.value
                      )
                    }
                    placeholder="Ej. CC225"
                  />

                </div>


                <div className="form-group">

                  <label>
                    Precio
                  </label>

                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={price}
                    onChange={(event) =>
                      setPrice(
                        event.target.value
                      )
                    }
                    placeholder="2500"
                    required
                  />

                </div>

              </div>


              <div className="form-row">

                <div className="form-group">
                  <label>Costo</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={cost}
                    onChange={(event) =>
                      setCost(event.target.value)
                    }
                    placeholder="Lo que te cuesta a vos"
                  />
                </div>

                <div className="form-group">
                  <label>Categoría</label>
                  <input
                    type="text"
                    list="vx-product-categories"
                    value={category}
                    onChange={(event) =>
                      setCategory(event.target.value)
                    }
                    placeholder="Ej. Bebidas"
                    maxLength={80}
                  />
                  <datalist id="vx-product-categories">
                    {categoryOptions.map((option) => (
                      <option key={option} value={option} />
                    ))}
                  </datalist>
                </div>

              </div>

              <div className="form-group">
                <label>Proveedor habitual</label>
                <select
                  value={supplierId}
                  onChange={(event) =>
                    setSupplierId(event.target.value)
                  }
                >
                  <option value="">Sin proveedor asignado</option>
                  {suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Código de barras</label>
                <input
                  value={barcode}
                  onChange={(event) =>
                    setBarcode(event.target.value)
                  }
                  placeholder="Escaneá o escribí el código"
                />
              </div>


              <div className="form-group">

                <label>
                  Stock inicial
                </label>

                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={stock}
                  onChange={(event) =>
                    setStock(
                      event.target.value
                    )
                  }
                  placeholder="20"
                  required
                />

              </div>


              <div className="form-group">

                <label>
                  Descripción
                </label>

                <textarea
                  value={description}
                  onChange={(event) =>
                    setDescription(
                      event.target.value
                    )
                  }
                  placeholder="Descripción del producto..."
                  rows={4}
                />

              </div>


              <div className="modal-actions">

                <button
                  type="button"
                  className="secondary-button"
                  onClick={closeForm}
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  className="primary-button"
                  disabled={saving}
                >
                  {saving
                    ? "Guardando..."
                    : editingProduct
                    ? "Guardar cambios"
                    : "Guardar producto"}
                </button>

              </div>

            </form>

          </div>

        </div>

      )}

{showImport && (

  <div
    className="modal-overlay products-import-overlay"
    onClick={closeImport}
  >

    <div
      className="product-import-modal"
      onClick={(event) =>
        event.stopPropagation()
      }
    >

      <div className="modal-header">

        <div>

          <span className="dashboard-eyebrow">
            IMPORTACIÓN
          </span>

          <h2>
            Cargar productos
          </h2>

          <p className="import-description">
            Importá productos desde un archivo Excel
            y revisalos antes de agregarlos a Velora.
          </p>

        </div>

        <button
          className="modal-close"
          onClick={closeImport}
          type="button"
        >
          ×
        </button>

      </div>


      {!importFile && !importLoading && (

        <div className="excel-upload-area">

          <div className="excel-upload-icon">
            XLS
          </div>

          <h3>
            Cargá tu archivo Excel
          </h3>

          <p>
            Velora analizará automáticamente
            las columnas y preparará los productos.
          </p>

          <label className="excel-upload-button">

            Seleccionar Excel

            <input
              type="file"
              accept=".xlsx,.xlsm"
              hidden
              onChange={(event) => {

                const file =
                  event.target.files?.[0];

                if (file) {
                  analyzeExcel(file);
                }

              }}
            />

          </label>

          <span className="excel-upload-hint">
            Formato recomendado: .xlsx
          </span>

        </div>

      )}


      {importLoading && (

        <div className="import-loading">

          <div className="products-loading-spinner" />

          <h3>
            Analizando productos...
          </h3>

          <p>
            Velora está leyendo el Excel
            y preparando la vista previa.
          </p>

        </div>

      )}


      {!importLoading &&
        importFile &&
        importProducts.length > 0 && (

        <div className="import-preview">

          <div className="import-success-header">

            <div>

              <span className="import-success-icon">
                ✓
              </span>

              <div>

                <h3>
                  Productos listos
                </h3>

                <p>
                  {importProducts.length} productos
                  detectados desde{" "}
                  <strong>
                    {importFile.name}
                  </strong>
                </p>

              </div>

            </div>

          </div>


          {importWarnings.length > 0 && (

            <div className="import-warning">

              <strong>
                Revisá algunos datos
              </strong>

              <span>
                Se detectaron
                {" "}
                {importWarnings.length}
                {" "}
                filas con advertencias.
              </span>

            </div>

          )}


          <div className="import-table-wrapper">

            <table className="import-table">

              <thead>

                <tr>

                  <th>Producto</th>
                  <th>SKU</th>
                  <th>Precio</th>
                  <th>Stock</th>
                  <th>Descripción</th>
                  <th></th>

                </tr>

              </thead>

              <tbody>

                {importProducts.map(
                  (product, index) => (

                    <tr key={product.id}>

                      <td>

                        <input
                          value={product.name}
                          onChange={(event) =>
                            updateImportProduct(
                              index,
                              "name",
                              event.target.value
                            )
                          }
                        />

                      </td>

                      <td>

                        <input
                          value={product.sku || ""}
                          onChange={(event) =>
                            updateImportProduct(
                              index,
                              "sku",
                              event.target.value
                            )
                          }
                        />

                      </td>

                      <td>

                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={product.price}
                          onChange={(event) =>
                            updateImportProduct(
                              index,
                              "price",
                              event.target.value
                            )
                          }
                        />

                      </td>

                      <td>

                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={product.stock}
                          onChange={(event) =>
                            updateImportProduct(
                              index,
                              "stock",
                              event.target.value
                            )
                          }
                        />

                      </td>

                      <td>

                        <input
                          value={
                            product.description || ""
                          }
                          onChange={(event) =>
                            updateImportProduct(
                              index,
                              "description",
                              event.target.value
                            )
                          }
                        />

                      </td>

                      <td>

                        <button
                          type="button"
                          className="import-remove-button"
                          onClick={() =>
                            removeImportProduct(index)
                          }
                          title="Quitar producto"
                        >
                          ×
                        </button>

                      </td>

                    </tr>

                  )
                )}

              </tbody>

            </table>

          </div>


          <div className="import-footer">

            <span>
              {importProducts.length} productos
              preparados para importar
            </span>

            <div>

              <button
                type="button"
                className="secondary-button"
                onClick={closeImport}
              >
                Cancelar
              </button>

              <button
                type="button"
                className="primary-button"
                onClick={importProductsToVelora}
                disabled={
                  importing ||
                  importProducts.length === 0
                }
              >
                {importing
                  ? "Importando..."
                  : "Importar productos"}
              </button>

            </div>

          </div>

        </div>

      )}

    </div>

  </div>

)}

    </section>
  );
}

export default Products;