import { initializeApp } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-app.js";
import {
  getAuth,
  EmailAuthProvider,
  onAuthStateChanged,
  reauthenticateWithCredential,
  signInWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getFirestore,
  onSnapshot,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-functions.js";

const firebaseConfig = {
  apiKey: "AIzaSyDQTVIkmO3dxTWAx_qswMqSoNMPg7J_Tsc",
  authDomain: "precios-c2e83.firebaseapp.com",
  projectId: "precios-c2e83",
  storageBucket: "precios-c2e83.firebasestorage.app",
  messagingSenderId: "902212746662",
  appId: "1:902212746662:web:63ba2d403110e6cba86367",
};
const adminEmail = "ppomberl@gmail.com";
const adminUsername = "CSC";
const customerAuthDomain = "clientes.precios-c2e83.firebaseapp.com";
const categories = [
  { id: "congelado", label: "Congelado" },
  { id: "fresco", label: "Fresco" },
  { id: "embutidos", label: "Embutidos" },
  { id: "res", label: "Res" },
  { id: "pollo", label: "Pollo" },
  { id: "pescado", label: "Pescado" },
  { id:"papas", label: "Papas"},
];
const categoryOrder = new Map(categories.map((category, index) => [category.id, index]));
const currency = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  minimumFractionDigits: 2,
});

const form = document.querySelector("#product-form");
const nameInput = document.querySelector("#name");
const categoryInput = document.querySelector("#category");
const tablePriceInput = document.querySelector("#table-price");
const boxPriceInput = document.querySelector("#box-price");
const productList = document.querySelector("#product-list");
const emptyState = document.querySelector("#empty-state");
const noResults = document.querySelector("#no-results");
const catalogStatus = document.querySelector("#catalog-status");
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
const customerPanel = document.querySelector("#customer-panel");
const categoryTabs = document.querySelector("#category-tabs");
const customerForm = document.querySelector("#customer-form");
const customerUsernameInput = document.querySelector("#customer-username");
const customerPasswordInput = document.querySelector("#customer-password");
const createCustomerButton = document.querySelector("#create-customer-button");
const customerStatus = document.querySelector("#customer-status");
const detailActions = document.querySelector("#detail-actions");
const roleLabel = document.querySelector("#role-label");
const connectionLabel = document.querySelector("#connection-label");
const adminLoginButton = document.querySelector("#admin-login-button");
const customerViewButton = document.querySelector("#customer-view-button");
const signedOutLoginButton = document.querySelector("#signed-out-login-button");
const logoutButton = document.querySelector("#logout-button");
const signedOutView = document.querySelector("#signed-out-view");
const authenticatedContent = document.querySelector("#authenticated-content");
const setupMessage = document.querySelector("#setup-message");
const adminIntro = document.querySelector("#admin-intro");
const customerIntro = document.querySelector("#customer-intro");
const adminDialog = document.querySelector("#admin-dialog");
const adminAccessForm = document.querySelector("#admin-access-form");
const loginIdentityInput = document.querySelector("#login-identity");
const loginPasswordInput = document.querySelector("#login-password");
const authError = document.querySelector("#auth-error");
const authSubmitButton = document.querySelector("#auth-submit-button");
const cancelLoginButton = document.querySelector("#cancel-login-button");
const previewExitDialog = document.querySelector("#preview-exit-dialog");
const previewExitForm = document.querySelector("#preview-exit-form");
const previewExitPassword = document.querySelector("#preview-exit-password");
const previewExitError = document.querySelector("#preview-exit-error");
const confirmPreviewExitButton = document.querySelector("#confirm-preview-exit");
const cancelPreviewExitButton = document.querySelector("#cancel-preview-exit");

let auth;
let database;
let createCustomerAccount;
let currentUser = null;
let products = [];
let selectedId = null;
let editingId = null;
let isAdmin = false;
let isCustomerPreview = false;
let selectedCategory = "todas";
let unsubscribeProducts = null;

function showMessage(target, text, isError = false) {
  target.textContent = text;
  target.classList.toggle("error", isError);
}

function makeCell(text, className) {
  const cell = document.createElement("td");
  cell.textContent = text;
  if (className) cell.className = className;
  return cell;
}

function updateRoleView() {
  const isCustomerView = Boolean(currentUser) && (!isAdmin || isCustomerPreview);
  document.body.classList.toggle("admin-mode", isAdmin);
  document.body.classList.toggle("customer-view", isCustomerView);
  roleLabel.textContent = !currentUser ? "Sin sesión" : isCustomerPreview ? "Cliente" : isAdmin ? "Administrador" : "Cliente";
  adminLoginButton.hidden = Boolean(currentUser);
  customerViewButton.hidden = !isAdmin;
  customerViewButton.textContent = isCustomerPreview ? "Volver al administrador" : "Vista cliente";
  customerViewButton.setAttribute("aria-label", isCustomerPreview
    ? "Volver al panel de administrador; se solicitará la contraseña"
    : "Previsualizar la vista de cliente");
  logoutButton.hidden = !currentUser || isCustomerPreview;
  signedOutView.hidden = Boolean(currentUser);
  authenticatedContent.hidden = !currentUser;
  adminIntro.hidden = isCustomerView;
  customerIntro.hidden = !isCustomerView;
  adminPanel.hidden = !isAdmin || isCustomerPreview;
  customerPanel.hidden = !isAdmin || isCustomerPreview;
  detailActions.hidden = !isAdmin || isCustomerPreview;
  categoryTabs.hidden = !isCustomerView;
}

function renderCategoryTabs() {
  const tabOrder = ["fresco", "pollo", "congelado", "embutidos", "res", "pescado", "papas"];
  const sections = [
    { id: "todas", label: "Todas" },
    ...tabOrder.map((id) => categories.find((category) => category.id === id)).filter(Boolean),
  ];

  if (categoryTabs.childElementCount !== sections.length) {
    categoryTabs.replaceChildren();
    for (const section of sections) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "category-tab";
      button.id = `category-tab-${section.id}`;
      button.setAttribute("role", "tab");
      button.setAttribute("aria-controls", "product-panel");
      button.addEventListener("click", () => {
        selectedCategory = section.id;
        render();
      });
      button.addEventListener("keydown", (event) => {
        const currentIndex = sections.findIndex((item) => item.id === section.id);
        let nextIndex = currentIndex;
        if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % sections.length;
        else if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + sections.length) % sections.length;
        else if (event.key === "Home") nextIndex = 0;
        else if (event.key === "End") nextIndex = sections.length - 1;
        else return;

        event.preventDefault();
        selectedCategory = sections[nextIndex].id;
        render();
        categoryTabs.children[nextIndex].focus();
      });
      categoryTabs.append(button);
    }
  }

  sections.forEach((section, index) => {
    const button = categoryTabs.children[index];
    const isSelected = selectedCategory === section.id;
    button.setAttribute("aria-selected", String(isSelected));
    button.tabIndex = isSelected ? 0 : -1;
    button.textContent = section.label;
  });
  document.querySelector("#product-panel").setAttribute("aria-labelledby", `category-tab-${selectedCategory}`);
}


function selectProduct(id) {
  selectedId = id;
  render();
}

function render() {
  const isCustomerView = Boolean(currentUser) && (!isAdmin || isCustomerPreview);
  const query = searchInput.value.trim().toLocaleLowerCase("es-MX");
  const visibleProducts = products.filter((product) =>
    product.name.toLocaleLowerCase("es-MX").includes(query) &&
    (!isCustomerView || selectedCategory === "todas" || product.category === selectedCategory)
  );
  renderCategoryTabs();
  const sortedProducts = [...visibleProducts].sort((first, second) => {
    const firstCategoryOrder = categoryOrder.get(first.category) ?? categories.length;
    const secondCategoryOrder = categoryOrder.get(second.category) ?? categories.length;
    const categoryDifference = firstCategoryOrder - secondCategoryOrder;
    return categoryDifference || first.name.localeCompare(second.name, "es-MX", { sensitivity: "base" });
  });
  productList.replaceChildren();

  let currentCategory = null;
  for (const product of sortedProducts) {
    if (product.category !== currentCategory && (!isCustomerView || selectedCategory === "todas")) {
      currentCategory = product.category;
      const heading = document.createElement("tr");
      heading.className = "category-heading";
      const headingCell = document.createElement("th");
      headingCell.colSpan = 3;
      headingCell.scope = "rowgroup";
      headingCell.textContent = categories.find((category) => category.id === currentCategory)?.label ?? "Otros";
      heading.append(headingCell);
      productList.append(heading);
    }

    const row = document.createElement("tr");
    row.tabIndex = isCustomerView ? -1 : 0;
    row.setAttribute("aria-selected", String(!isCustomerView && product.id === selectedId));
    if (!isCustomerView && product.id === selectedId) row.classList.add("selected");
    row.append(
      makeCell(product.name, "product-name-cell"),
      makeCell(currency.format(product.tablePrice), "price-cell"),
      makeCell(currency.format(product.boxPrice), "price-cell")
    );
    if (!isCustomerView) {
      row.addEventListener("click", () => selectProduct(product.id));
      row.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          selectProduct(product.id);
        }
      });
    }
    productList.append(row);
  }

  emptyState.hidden = products.length > 0;
  noResults.hidden = products.length === 0 || visibleProducts.length > 0;
  productCount.textContent = String(isCustomerView ? visibleProducts.length : products.length);

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
}

function resetForm() {
  form.reset();
  editingId = null;
  formTitle.textContent = "Agregar producto";
  saveButton.textContent = "Guardar producto";
  cancelButton.hidden = true;
}

function subscribeToProducts() {
  unsubscribeProducts?.();
  unsubscribeProducts = onSnapshot(
    collection(database, "productos"),
    (snapshot) => {
      catalogStatus.hidden = true;
      products = snapshot.docs.map((productDoc) => ({ id: productDoc.id, ...productDoc.data() }));
      if (!products.some((product) => product.id === selectedId)) {
        selectedId = products[0]?.id ?? null;
      }
      render();
    },
    (error) => {
      showMessage(catalogStatus, error.message || "No se pudo actualizar el catálogo.", true);
      catalogStatus.hidden = false;
    }
  );
}


function openLoginDialog() {
  authError.textContent = "";
  adminAccessForm.reset();
  adminDialog.showModal();
  loginIdentityInput.focus();
}

adminLoginButton.addEventListener("click", openLoginDialog);
signedOutLoginButton.addEventListener("click", openLoginDialog);
cancelLoginButton.addEventListener("click", () => adminDialog.close());
logoutButton.addEventListener("click", async () => {
  try {
    await signOut(auth);
  } catch (error) {
    showMessage(setupMessage, error.message || "No se pudo cerrar la sesión.", true);
  }
});

customerViewButton.addEventListener("click", () => {
  if (!isAdmin) return;
  if (!isCustomerPreview) {
    isCustomerPreview = true;
    selectedCategory = "todas";
    searchInput.value = "";
    updateRoleView();
    render();
    return;
  }

  previewExitError.textContent = "";
  previewExitForm.reset();
  previewExitDialog.showModal();
  previewExitPassword.focus();
});

cancelPreviewExitButton.addEventListener("click", () => previewExitDialog.close());

previewExitForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!isAdmin || !auth.currentUser) return;

  confirmPreviewExitButton.disabled = true;
  previewExitError.textContent = "";
  try {
    const credential = EmailAuthProvider.credential(adminEmail, previewExitPassword.value);
    await reauthenticateWithCredential(auth.currentUser, credential);
    isCustomerPreview = false;
    updateRoleView();
    render();
    previewExitDialog.close();
  } catch (error) {
    previewExitError.textContent = error.message || "No se pudo confirmar la contraseña del administrador.";
  } finally {
    confirmPreviewExitButton.disabled = false;
  }
});

adminAccessForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  authError.textContent = "";
  authSubmitButton.disabled = true;
  try {
    const identity = loginIdentityInput.value.trim();
    const normalizedIdentity = identity.toLocaleLowerCase("es-MX");
    const email = normalizedIdentity.toLocaleUpperCase("es-MX") === adminUsername
      ? adminEmail
      : normalizedIdentity.includes("@")
        ? normalizedIdentity
        : `${normalizedIdentity}@${customerAuthDomain}`;
    await signInWithEmailAndPassword(auth, email, loginPasswordInput.value);
    adminDialog.close();
  } catch (error) {
    authError.textContent = error.message || "No se pudo iniciar sesión.";
  } finally {
    authSubmitButton.disabled = false;
  }
});

async function handleAuthStateChange(user) {
  unsubscribeProducts?.();
  unsubscribeProducts = null;
  if (!user) {
    currentUser = null;
    isAdmin = false;
    isCustomerPreview = false;
    products = [];
    selectedId = null;
    updateRoleView();
    return;
  }

  try {
    const isAdminAccount = user.email?.toLocaleLowerCase("en-US") === adminEmail.toLocaleLowerCase("en-US");
    if (isAdminAccount && !user.emailVerified) {
      await signOut(auth);
      showMessage(setupMessage, "Verifica el correo del administrador desde Firebase antes de iniciar sesión.", true);
      return;
    }
    const accessSnapshot = await getDoc(doc(database, "configuracion", "acceso"));
    const access = accessSnapshot.exists() ? accessSnapshot.data() : {};
    const customerSnapshot = isAdminAccount
      ? null
      : await getDoc(doc(database, "clientes", user.uid));
    if (!isAdminAccount && !customerSnapshot.exists() && access.customerUid !== user.uid) {
      await signOut(auth);
      showMessage(setupMessage, "Esta cuenta no tiene acceso al catálogo. Contacta al administrador.", true);
      return;
    }

    currentUser = user;
    isAdmin = isAdminAccount;
    isCustomerPreview = false;
    updateRoleView();
    subscribeToProducts();
    if (isAdmin) {
      customerStatus.textContent = "Crea una cuenta para cada cliente; podrá ingresar con su usuario y contraseña.";
    }
  } catch (error) {
    showMessage(setupMessage, error.message || "No se pudo cargar el catálogo de Firebase.", true);
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!isAdmin || !form.reportValidity()) return;

  const name = nameInput.value.trim();
  const category = categoryInput.value;
  const tablePrice = Number(tablePriceInput.value);
  const boxPrice = Number(boxPriceInput.value);
  if (
    !name ||
    !categoryOrder.has(category) ||
    !Number.isFinite(tablePrice) ||
    !Number.isFinite(boxPrice) ||
    tablePrice < 0 ||
    boxPrice < 0
  ) {
    showMessage(message, "Escribe un nombre, tipo y precios válidos, iguales o mayores a cero.", true);
    return;
  }

  saveButton.disabled = true;
  showMessage(message, "");
  const wasEditing = editingId !== null;
  try {
    const product = { name, category, tablePrice, boxPrice };
    if (editingId === null) {
      const saved = await addDoc(collection(database, "productos"), product);
      selectedId = saved.id;
    } else {
      await updateDoc(doc(database, "productos", editingId), product);
    }
    resetForm();
    showMessage(message, wasEditing ? "Producto actualizado correctamente." : "Producto guardado correctamente.");
  } catch (error) {
    showMessage(message, error.message || "Ocurrió un error al guardar el producto.", true);
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
  categoryInput.value = product.category;
  tablePriceInput.value = String(product.tablePrice);
  boxPriceInput.value = String(product.boxPrice);
  formTitle.textContent = "Editar producto";
  saveButton.textContent = "Guardar cambios";
  cancelButton.hidden = false;
  showMessage(message, "");
  nameInput.focus();
});

deleteButton.addEventListener("click", async () => {
  if (!isAdmin) return;
  const product = products.find((item) => item.id === selectedId);
  if (!product || !window.confirm(`¿Eliminar "${product.name}" del catálogo?`)) return;

  deleteButton.disabled = true;
  try {
    await deleteDoc(doc(database, "productos", product.id));
    if (editingId === product.id) resetForm();
    showMessage(message, "Producto eliminado.");
  } catch (error) {
    showMessage(message, error.message || "Ocurrió un error al eliminar el producto.", true);
  } finally {
    deleteButton.disabled = !products.some((item) => item.id === selectedId);
  }
});

cancelButton.addEventListener("click", () => {
  resetForm();
  showMessage(message, "");
});
searchInput.addEventListener("input", render);

customerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!isAdmin || !customerForm.reportValidity()) return;

  createCustomerButton.disabled = true;
  showMessage(customerStatus, "");
  try {
    const result = await createCustomerAccount({
      username: customerUsernameInput.value.trim(),
      password: customerPasswordInput.value,
    });
    customerForm.reset();
    showMessage(customerStatus, `Usuario creado: ${result.data.username}`);
  } catch (error) {
    showMessage(customerStatus, error.message || "No se pudo crear la cuenta de cliente.", true);
  } finally {
    createCustomerButton.disabled = false;
  }
});

function disableAdminControls() {
  form.querySelectorAll("input, select, button").forEach((control) => { control.disabled = true; });
  customerForm.querySelectorAll("input, button").forEach((control) => { control.disabled = true; });
}

function disableLoginControls() {
  adminLoginButton.disabled = true;
  signedOutLoginButton.disabled = true;
}

function initialize() {
  try {
    const app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    database = getFirestore(app);
    createCustomerAccount = httpsCallable(getFunctions(app), "createCustomerAccount");
    connectionLabel.textContent = "Conectado a Firebase";
    onAuthStateChanged(auth, handleAuthStateChange, (error) => {
      showMessage(setupMessage, error.message || "No se pudo comprobar la sesión de Firebase.", true);
    });
  } catch (error) {
    connectionLabel.textContent = "Error de conexión";
    showMessage(setupMessage, error.message || "No se pudo iniciar Firebase.", true);
    disableAdminControls();
    disableLoginControls();
  }
}

renderCategoryTabs();
initialize();
