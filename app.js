"use strict";

const databaseName = "elColoradoCatalogo";
const databaseVersion = 2;
const storeName = "productos";
const configStoreName = "configuracion";
const passwordIterations = 180000;
const currency = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  minimumFractionDigits: 2,
});

const form = document.querySelector("#product-form");
const nameInput = document.querySelector("#name");
const tablePriceInput = document.querySelector("#table-price");
const boxPriceInput = document.querySelector("#box-price");
const productList = document.querySelector("#product-list");
const emptyState = document.querySelector("#empty-state");
const noResults = document.querySelector("#no-results");
const searchInput = document.querySelector("#search");
const message = document.querySelector("#message");
const editButton = document.querySelector("#edit-button");
const deleteButton = document.querySelector("#delete-button");
const cancelButton = document.querySelector("#cancel-button");
const saveButton = document.querySelector("#save-button");
const formTitle = document.querySelector("#form-title");
const selectedName = document.querySelector("#selected-name");
const selectedTablePrice = document.querySelector("#selected-table-price");
const selectedBoxPrice = document.querySelector("#selected-box-price");
const productCount = document.querySelector("#product-count");
const adminPanel = document.querySelector("#admin-panel");
const detailActions = document.querySelector("#detail-actions");
const roleLabel = document.querySelector("#role-label");
const adminLoginButton = document.querySelector("#admin-login-button");
const logoutButton = document.querySelector("#logout-button");
const adminDialog = document.querySelector("#admin-dialog");
const adminAccessForm = document.querySelector("#admin-access-form");
const dialogTitle = document.querySelector("#dialog-title");
const dialogDescription = document.querySelector("#dialog-description");
const adminPasswordInput = document.querySelector("#admin-password");
const confirmPasswordField = document.querySelector("#confirm-password-field");
const adminPasswordConfirmInput = document.querySelector("#admin-password-confirm");
const authError = document.querySelector("#auth-error");
const authSubmitButton = document.querySelector("#auth-submit-button");
const cancelLoginButton = document.querySelector("#cancel-login-button");

let database;
let products = [];
let selectedId = null;
let editingId = null;
let isAdmin = false;
let needsPasswordSetup = false;

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("Este navegador no permite guardar productos localmente."));
      return;
    }

    const request = indexedDB.open(databaseName, databaseVersion);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(storeName)) {
        db.createObjectStore(storeName, { keyPath: "id", autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(configStoreName)) {
        db.createObjectStore(configStoreName, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("No se pudo abrir la base de datos."));
    request.onblocked = () => reject(new Error("Cierra otras pestañas del catálogo e inténtalo de nuevo."));
  });
}

function readProducts() {
  return new Promise((resolve, reject) => {
    const request = database.transaction(storeName, "readonly").objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("No se pudieron leer los productos."));
  });
}

function writeProduct(product, id) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);
    const request = id === undefined ? store.add(product) : store.put({ ...product, id });
    let savedId = id;
    request.onsuccess = () => {
      if (id === undefined) savedId = request.result;
    };
    transaction.oncomplete = () => resolve(savedId);
    transaction.onerror = () => reject(transaction.error || new Error("No se pudo guardar el producto."));
    transaction.onabort = () => reject(transaction.error || new Error("Se canceló el guardado del producto."));
  });
}

function removeProduct(id) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).delete(id);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error || new Error("No se pudo eliminar el producto."));
    transaction.onabort = () => reject(transaction.error || new Error("Se canceló la eliminación del producto."));
  });
}

function getAdminCredential() {
  return new Promise((resolve, reject) => {
    const request = database.transaction(configStoreName, "readonly")
      .objectStore(configStoreName)
      .get("adminPassword");
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error || new Error("No se pudo consultar la configuración de administrador."));
  });
}

function saveAdminCredential(credential) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(configStoreName, "readwrite");
    transaction.objectStore(configStoreName).put({ ...credential, id: "adminPassword" });
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error || new Error("No se pudo guardar la contraseña."));
    transaction.onabort = () => reject(transaction.error || new Error("Se canceló el guardado de la contraseña."));
  });
}

async function derivePasswordHash(password, salt) {
  if (!crypto.subtle) {
    throw new Error("Este navegador no permite proteger la contraseña. Abre el catálogo en un navegador compatible.");
  }
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: passwordIterations },
    key,
    256
  );
  return Array.from(new Uint8Array(bits));
}

function bytesToBase64(bytes) {
  return btoa(String.fromCharCode(...bytes));
}

function base64ToBytes(value) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

function hashesMatch(first, second) {
  if (first.length !== second.length) return false;
  let difference = 0;
  for (let index = 0; index < first.length; index += 1) {
    difference |= first[index] ^ second[index];
  }
  return difference === 0;
}

function updateRoleView() {
  document.body.classList.toggle("admin-mode", isAdmin);
  roleLabel.textContent = isAdmin ? "Modo administrador" : "Vista cliente";
  adminLoginButton.hidden = isAdmin;
  logoutButton.hidden = !isAdmin;
  adminPanel.hidden = !isAdmin;
  detailActions.hidden = !isAdmin;
}

function showMessage(text, isError = false) {
  message.textContent = text;
  message.classList.toggle("error", isError);
}

function makeCell(text, className) {
  const cell = document.createElement("td");
  cell.textContent = text;
  if (className) cell.className = className;
  return cell;
}

function selectProduct(id) {
  selectedId = id;
  render();
}

function render() {
  const query = searchInput.value.trim().toLocaleLowerCase("es-MX");
  const visibleProducts = products.filter((product) =>
    product.name.toLocaleLowerCase("es-MX").includes(query)
  );
  productList.replaceChildren();

  for (const product of visibleProducts) {
    const row = document.createElement("tr");
    row.tabIndex = 0;
    row.setAttribute("aria-selected", String(product.id === selectedId));
    if (product.id === selectedId) row.classList.add("selected");
    row.append(
      makeCell(product.name, "product-name-cell"),
      makeCell(currency.format(product.tablePrice), "price-cell"),
      makeCell(currency.format(product.boxPrice), "price-cell")
    );
    row.addEventListener("click", () => selectProduct(product.id));
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectProduct(product.id);
      }
    });
    productList.append(row);
  }

  emptyState.hidden = products.length > 0;
  noResults.hidden = products.length === 0 || visibleProducts.length > 0;
  productCount.textContent = String(products.length);

  const selectedProduct = products.find((product) => product.id === selectedId);
  if (selectedProduct) {
    selectedName.textContent = selectedProduct.name;
    selectedTablePrice.textContent = currency.format(selectedProduct.tablePrice);
    selectedBoxPrice.textContent = currency.format(selectedProduct.boxPrice);
  } else {
    selectedName.textContent = "Selecciona un producto";
    selectedTablePrice.textContent = "—";
    selectedBoxPrice.textContent = "—";
  }
  editButton.disabled = !selectedProduct;
  deleteButton.disabled = !selectedProduct;
  updateRoleView();
}

function resetForm() {
  form.reset();
  editingId = null;
  formTitle.textContent = "Agregar producto";
  saveButton.textContent = "Guardar producto";
  cancelButton.hidden = true;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!isAdmin) return;
  if (!form.reportValidity()) return;

  const name = nameInput.value.trim();
  const tablePrice = Number(tablePriceInput.value);
  const boxPrice = Number(boxPriceInput.value);
  if (!name || !Number.isFinite(tablePrice) || !Number.isFinite(boxPrice) || tablePrice < 0 || boxPrice < 0) {
    showMessage("Escribe un nombre y precios válidos, iguales o mayores a cero.", true);
    return;
  }

  saveButton.disabled = true;
  showMessage("");
  const wasEditing = editingId !== null;
  try {
    const id = await writeProduct({ name, tablePrice, boxPrice }, editingId === null ? undefined : editingId);
    await refreshProducts();
    selectedId = id;
    resetForm();
    render();
    showMessage(wasEditing ? "Producto actualizado correctamente." : "Producto guardado correctamente.");
  } catch (error) {
    showMessage(error.message || "Ocurrió un error al guardar el producto.", true);
  } finally {
    saveButton.disabled = false;
  }
});

editButton.addEventListener("click", () => {
  if (!isAdmin) return;
  const product = products.find((item) => item.id === selectedId);
  if (!product) return;
  editingId = product.id;
  nameInput.value = product.name;
  tablePriceInput.value = String(product.tablePrice);
  boxPriceInput.value = String(product.boxPrice);
  formTitle.textContent = "Editar producto";
  saveButton.textContent = "Guardar cambios";
  cancelButton.hidden = false;
  showMessage("");
  nameInput.focus();
});

deleteButton.addEventListener("click", async () => {
  if (!isAdmin) return;
  const product = products.find((item) => item.id === selectedId);
  if (!product || !window.confirm(`¿Eliminar "${product.name}" del catálogo?`)) return;

  deleteButton.disabled = true;
  try {
    await removeProduct(product.id);
    await refreshProducts();
    selectedId = products[0]?.id ?? null;
    if (editingId === product.id) resetForm();
    render();
    showMessage("Producto eliminado.");
  } catch (error) {
    showMessage(error.message || "Ocurrió un error al eliminar el producto.", true);
  } finally {
    deleteButton.disabled = !products.some((item) => item.id === selectedId);
  }
});

cancelButton.addEventListener("click", () => {
  resetForm();
  showMessage("");
});
searchInput.addEventListener("input", render);

function openAdminDialog() {
  authError.textContent = "";
  adminAccessForm.reset();
  needsPasswordSetup = false;
  getAdminCredential().then((credential) => {
    needsPasswordSetup = credential === null;
    dialogTitle.textContent = needsPasswordSetup ? "Crear contraseña de administrador" : "Acceso de administrador";
    dialogDescription.textContent = needsPasswordSetup
      ? "Configura una contraseña de al menos 8 caracteres para proteger la edición de productos."
      : "Ingresa la contraseña para administrar el catálogo.";
    confirmPasswordField.hidden = !needsPasswordSetup;
    adminPasswordConfirmInput.required = needsPasswordSetup;
    adminPasswordInput.autocomplete = needsPasswordSetup ? "new-password" : "current-password";
    authSubmitButton.textContent = needsPasswordSetup ? "Crear contraseña y entrar" : "Entrar";
    adminDialog.showModal();
    adminPasswordInput.focus();
  }).catch((error) => {
    showMessage(error.message || "No se pudo consultar la configuración de administrador.", true);
  });
}

adminLoginButton.addEventListener("click", openAdminDialog);
cancelLoginButton.addEventListener("click", () => adminDialog.close());
logoutButton.addEventListener("click", () => {
  isAdmin = false;
  if (editingId !== null) resetForm();
  showMessage("");
  render();
});

adminAccessForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  authError.textContent = "";
  authSubmitButton.disabled = true;
  try {
    const password = adminPasswordInput.value;
    if (password.length < 8) {
      authError.textContent = "La contraseña debe tener al menos 8 caracteres.";
      return;
    }

    if (needsPasswordSetup) {
      if (password !== adminPasswordConfirmInput.value) {
        authError.textContent = "Las contraseñas no coinciden.";
        return;
      }
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const hash = await derivePasswordHash(password, salt);
      await saveAdminCredential({
        salt: bytesToBase64(salt),
        hash: bytesToBase64(hash),
        iterations: passwordIterations,
      });
    } else {
      const credential = await getAdminCredential();
      if (!credential) {
        authError.textContent = "No se encontró la contraseña. Cierra y vuelve a abrir el catálogo.";
        return;
      }
      const hash = await derivePasswordHash(password, base64ToBytes(credential.salt));
      if (!hashesMatch(hash, Array.from(base64ToBytes(credential.hash)))) {
        authError.textContent = "La contraseña es incorrecta.";
        adminPasswordInput.select();
        return;
      }
    }

    isAdmin = true;
    adminDialog.close();
    updateRoleView();
    showMessage(needsPasswordSetup ? "Contraseña configurada. Ya puedes administrar los productos." : "Sesión de administrador iniciada.");
  } catch (error) {
    authError.textContent = error.message || "No se pudo validar la contraseña.";
  } finally {
    authSubmitButton.disabled = false;
  }
});

async function refreshProducts() {
  products = await readProducts();
  if (!products.some((product) => product.id === selectedId)) {
    selectedId = products[0]?.id ?? null;
  }
}

async function initialize() {
  try {
    database = await openDatabase();
    database.onversionchange = () => database.close();
    await refreshProducts();
    render();
    updateRoleView();
  } catch (error) {
    showMessage(error.message || "No se pudo iniciar el catálogo.", true);
    form.querySelectorAll("input, button").forEach((control) => { control.disabled = true; });
  }
}

initialize();
