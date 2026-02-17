import {
  isLowStock,
  compareByUrgencyThenName,
  selectVisibleItems,
  clampQuantity,
} from "./logic.js";
import {
  loadState,
  saveState,
  updateItemQuantity,
  upsertItem,
  removeItem,
  createDefaultState,
  serializeState,
  deserializeState,
} from "./store.js";
import {
  renderList,
  renderSummary,
  toggleEmptyState,
  renderSettingsItemList,
} from "./ui.js";

const VIEWS = {
  ALL: "all",
  RESTOCK: "restock",
  SETTINGS: "settings",
};

const VALID_VIEWS = new Set(Object.values(VIEWS));

const searchInput = document.querySelector("#search-input");
const quickAddForm = document.querySelector("#quick-add-form");
const quickAddNameInput = document.querySelector("#quick-add-name");
const quickAddQuantityInput = document.querySelector("#quick-add-quantity");
const quickAddMessage = document.querySelector("#quick-add-message");
const listToolbar = document.querySelector("#list-toolbar");
const inventoryView = document.querySelector("#inventory-view");
const settingsView = document.querySelector("#settings-view");
const itemList = document.querySelector("#item-list");
const summaryLine = document.querySelector("#summary-line");
const emptyState = document.querySelector("#empty-state");
const navTabs = document.querySelectorAll(".nav-tab");
const restockBadge = document.querySelector("#restock-badge");

const defaultThresholdInput = document.querySelector("#default-threshold-input");
const settingsItemList = document.querySelector("#settings-item-list");
const settingsCount = document.querySelector("#settings-count");
const settingsMessage = document.querySelector("#settings-message");
const exportDataButton = document.querySelector("#export-data-button");
const importDataInput = document.querySelector("#import-data-input");
const resetDataButton = document.querySelector("#reset-data-button");

const initialState = loadState();
const state = {
  items: initialState.items,
  settings: initialState.settings,
  query: "",
  activeView: VIEWS.ALL,
  quickAddNotice: {
    text: "",
    tone: "",
  },
  settingsNotice: {
    text: "",
    tone: "",
  },
};

function getVisibleItems() {
  return selectVisibleItems(
    state.items,
    state.query,
    state.activeView === VIEWS.RESTOCK
  );
}

function setSettingsNotice(text, tone = "") {
  state.settingsNotice = { text, tone };
}

function setQuickAddNotice(text, tone = "") {
  state.quickAddNotice = { text, tone };
}

function renderSettingsPanel() {
  defaultThresholdInput.value = String(state.settings.defaultLowThreshold);

  const sortedItems = [...state.items].sort(compareByUrgencyThenName);
  renderSettingsItemList(settingsItemList, sortedItems);
  settingsCount.textContent = `${state.items.length} total`;

  settingsMessage.textContent = state.settingsNotice.text;
  settingsMessage.classList.toggle(
    "is-error",
    state.settingsNotice.tone === "error"
  );
  settingsMessage.classList.toggle(
    "is-success",
    state.settingsNotice.tone === "success"
  );
}

function renderInventoryPanel(visibleItems, lowCount) {
  renderList(itemList, visibleItems);

  if (state.activeView === VIEWS.ALL) {
    renderSummary(summaryLine, state.items.length, lowCount);
  } else {
    summaryLine.textContent = `${visibleItems.length} shown • ${lowCount} low stock total`;
  }

  if (visibleItems.length > 0) {
    toggleEmptyState(emptyState, false);
    return;
  }

  if (state.activeView === VIEWS.RESTOCK && !state.query.trim()) {
    emptyState.textContent = "No low-stock items right now.";
  } else {
    emptyState.textContent = "No items match your search.";
  }
  toggleEmptyState(emptyState, true);
}

function render() {
  const isSettings = state.activeView === VIEWS.SETTINGS;
  const visibleItems = getVisibleItems();
  const lowCount = state.items.filter(isLowStock).length;

  listToolbar.classList.toggle("hidden", isSettings);
  inventoryView.classList.toggle("hidden", isSettings);
  settingsView.classList.toggle("hidden", !isSettings);

  navTabs.forEach((tab) => {
    const isActive = tab.dataset.view === state.activeView;
    tab.classList.toggle("is-active", isActive);
    if (isActive) {
      tab.setAttribute("aria-current", "page");
    } else {
      tab.removeAttribute("aria-current");
    }
  });

  restockBadge.textContent = lowCount > 99 ? "99+" : String(lowCount);
  restockBadge.classList.toggle("hidden", lowCount === 0);

  quickAddMessage.textContent = state.quickAddNotice.text;
  quickAddMessage.classList.toggle(
    "is-error",
    state.quickAddNotice.tone === "error"
  );
  quickAddMessage.classList.toggle(
    "is-success",
    state.quickAddNotice.tone === "success"
  );

  if (isSettings) {
    renderSettingsPanel();
    return;
  }

  renderInventoryPanel(visibleItems, lowCount);
}

function persistAndRender() {
  saveState({
    items: state.items,
    settings: state.settings,
  });
  render();
}

function setQuantity(itemId, nextQuantity) {
  state.items = updateItemQuantity(state.items, itemId, nextQuantity);
  persistAndRender();
}

function addItem(input) {
  const name = String(input.name || "").trim();
  if (!name) {
    return {
      ok: false,
      error: "Item name is required.",
    };
  }

  const nextItems = upsertItem(
    state.items,
    {
      name,
      quantity: input.quantity,
      lowThreshold: input.lowThreshold,
      category: input.category,
    },
    state.settings
  );

  if (nextItems.length === state.items.length) {
    return {
      ok: false,
      error: "Could not add item. Check your input.",
    };
  }

  state.items = nextItems;
  return {
    ok: true,
    name,
  };
}

function addItemFromQuickForm() {
  const result = addItem({
    name: quickAddNameInput.value,
    quantity: quickAddQuantityInput.value,
    lowThreshold: "",
    category: "",
  });

  if (!result.ok) {
    setQuickAddNotice(result.error, "error");
    render();
    return;
  }

  quickAddForm.reset();
  quickAddQuantityInput.value = "0";
  setQuickAddNotice(`Added ${result.name}.`, "success");
  setSettingsNotice("", "");
  persistAndRender();
}

function decodeItemId(rawId) {
  try {
    return decodeURIComponent(rawId || "");
  } catch {
    return "";
  }
}

function editItem(itemId) {
  const item = state.items.find((entry) => entry.id === itemId);
  if (!item) {
    return;
  }

  const nextNameRaw = window.prompt("Item name", item.name);
  if (nextNameRaw === null) {
    return;
  }

  const nextName = nextNameRaw.trim();
  if (!nextName) {
    setSettingsNotice("Item name cannot be empty.", "error");
    render();
    return;
  }

  const nextQuantity = window.prompt("Quantity", String(item.quantity));
  if (nextQuantity === null) {
    return;
  }

  const nextThreshold = window.prompt(
    "Low-stock threshold",
    String(item.lowThreshold)
  );
  if (nextThreshold === null) {
    return;
  }

  const nextCategory = window.prompt("Category (optional)", item.category);
  if (nextCategory === null) {
    return;
  }

  state.items = upsertItem(
    state.items,
    {
      id: item.id,
      name: nextName,
      quantity: nextQuantity,
      lowThreshold: nextThreshold,
      category: nextCategory,
    },
    state.settings
  );
  setSettingsNotice(`Updated ${nextName}.`, "success");
  persistAndRender();
}

function deleteItemById(itemId, source = "settings") {
  const item = state.items.find((entry) => entry.id === itemId);
  if (!item) {
    return;
  }

  const shouldDelete = window.confirm(`Delete "${item.name}"?`);
  if (!shouldDelete) {
    return;
  }

  state.items = removeItem(state.items, itemId);

  if (source === "main") {
    setQuickAddNotice(`Deleted ${item.name}.`, "success");
    setSettingsNotice("", "");
  } else {
    setSettingsNotice(`Deleted ${item.name}.`, "success");
    setQuickAddNotice("", "");
  }

  persistAndRender();
}

function exportBackup() {
  const serialized = serializeState({
    items: state.items,
    settings: state.settings,
  });

  const fileName = `inventory-backup-${new Date().toISOString().slice(0, 10)}.json`;
  const blob = new Blob([serialized], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);

  setSettingsNotice("Backup exported.", "success");
  render();
}

async function importBackupFile(file) {
  if (!file) {
    return;
  }

  try {
    const text = await file.text();
    const imported = deserializeState(text);

    state.items = imported.items;
    state.settings = imported.settings;
    setSettingsNotice("Backup imported successfully.", "success");
    persistAndRender();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to import backup.";
    setSettingsNotice(message, "error");
    render();
  }
}

function resetLocalData() {
  const shouldReset = window.confirm(
    "Reset all local data and restore starter items?"
  );
  if (!shouldReset) {
    return;
  }

  const defaults = createDefaultState();
  state.items = defaults.items;
  state.settings = defaults.settings;
  state.query = "";
  searchInput.value = "";
  setSettingsNotice("Local data reset to starter defaults.", "success");
  persistAndRender();
}

searchInput.addEventListener("input", (event) => {
  state.query = event.target.value;
  render();
});

defaultThresholdInput.addEventListener("change", (event) => {
  state.settings.defaultLowThreshold = clampQuantity(event.target.value);
  setSettingsNotice("Default threshold updated.", "success");
  persistAndRender();
});

quickAddForm.addEventListener("submit", (event) => {
  event.preventDefault();
  addItemFromQuickForm();
});

settingsItemList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) {
    return;
  }

  const row = button.closest("[data-item-id]");
  if (!row) {
    return;
  }

  const itemId = decodeItemId(row.dataset.itemId);
  if (!itemId) {
    return;
  }

  if (button.dataset.action === "edit-item") {
    editItem(itemId);
    return;
  }

  if (button.dataset.action === "delete-item") {
    deleteItemById(itemId, "settings");
  }
});

exportDataButton.addEventListener("click", () => {
  exportBackup();
});

importDataInput.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  await importBackupFile(file);
  event.target.value = "";
});

resetDataButton.addEventListener("click", () => {
  resetLocalData();
});

navTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    const { view } = tab.dataset;
    if (!view || !VALID_VIEWS.has(view)) {
      return;
    }

    state.activeView = view;
    render();
  });
});

itemList.addEventListener("click", (event) => {
  const actionTarget = event.target.closest("[data-action]");
  if (!actionTarget) {
    return;
  }

  const row = actionTarget.closest("[data-item-id]");
  if (!row) {
    return;
  }

  const itemId = decodeItemId(row.dataset.itemId);
  if (!itemId) {
    return;
  }

  const item = state.items.find((entry) => entry.id === itemId);
  if (!item) {
    return;
  }

  const action = actionTarget.dataset.action;

  if (action === "step") {
    const step = Number.parseInt(actionTarget.dataset.step, 10);
    if (Number.isNaN(step)) {
      return;
    }

    setQuantity(itemId, item.quantity + step);
    return;
  }

  if (action === "edit") {
    const userValue = window.prompt(`Set quantity for ${item.name}`, item.quantity);
    if (userValue === null) {
      return;
    }

    setQuantity(itemId, clampQuantity(userValue));
    return;
  }

  if (action === "delete") {
    deleteItemById(itemId, "main");
  }
});

render();
