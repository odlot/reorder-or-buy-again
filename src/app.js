import {
  isLowStock,
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
} from "./ui.js";

const VIEWS = {
  ALL: "all",
  RESTOCK: "restock",
  SETTINGS: "settings",
};
const DELETE_UNDO_MS = 8000;
const VIEWPORT_OFFSET_VAR = "--viewport-offset-bottom";

const VALID_VIEWS = new Set(Object.values(VIEWS));

const searchInput = document.querySelector("#search-input");
const quickAddForm = document.querySelector("#quick-add-form");
const quickAddNameInput = document.querySelector("#quick-add-name");
const quickAddMessage = document.querySelector("#quick-add-message");
const listToolbar = document.querySelector("#list-toolbar");
const inventoryView = document.querySelector("#inventory-view");
const settingsView = document.querySelector("#settings-view");
const itemList = document.querySelector("#item-list");
const summaryLine = document.querySelector("#summary-line");
const emptyState = document.querySelector("#empty-state");
const navTabs = document.querySelectorAll(".nav-tab");
const restockBadge = document.querySelector("#restock-badge");
const undoToast = document.querySelector("#undo-toast");
const undoMessage = document.querySelector("#undo-message");
const undoButton = document.querySelector("#undo-button");

const defaultThresholdInput = document.querySelector("#default-threshold-input");
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
  pendingDelete: null,
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

function updateViewportOffsetBottom() {
  const root = document.documentElement;
  const viewport = window.visualViewport;

  if (!viewport) {
    root.style.setProperty(VIEWPORT_OFFSET_VAR, "0px");
    return;
  }

  const keyboardHeight = Math.max(
    0,
    window.innerHeight - (viewport.height + viewport.offsetTop)
  );
  root.style.setProperty(VIEWPORT_OFFSET_VAR, `${keyboardHeight}px`);
}

function clearPendingDelete() {
  if (!state.pendingDelete) {
    return;
  }

  clearTimeout(state.pendingDelete.timerId);
  state.pendingDelete = null;
}

function scheduleUndo(item, index) {
  clearPendingDelete();

  const timerId = setTimeout(() => {
    state.pendingDelete = null;
    render();
  }, DELETE_UNDO_MS);

  state.pendingDelete = {
    item,
    index,
    timerId,
  };
}

function renderSettingsPanel() {
  defaultThresholdInput.value = String(state.settings.defaultLowThreshold);

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

  if (state.pendingDelete) {
    undoMessage.textContent = `"${state.pendingDelete.item.name}" removed.`;
    undoToast.classList.remove("hidden");
  } else {
    undoToast.classList.add("hidden");
  }

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
    quantity: 1,
    lowThreshold: "",
    category: "",
  });

  if (!result.ok) {
    setQuickAddNotice(result.error, "error");
    render();
    return;
  }

  quickAddForm.reset();
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

function commitQuantityFromInput(input, itemId) {
  const item = state.items.find((entry) => entry.id === itemId);
  if (!item) {
    return;
  }

  const previous = input.dataset.previousValue;
  const restoreQuantity = () => {
    if (previous && /^\d+$/.test(previous)) {
      input.value = String(clampQuantity(previous));
      return;
    }

    input.value = String(item.quantity);
  };

  const raw = input.value.trim();
  if (!/^\d+$/.test(raw)) {
    restoreQuantity();
    return;
  }

  const nextQuantity = clampQuantity(raw);
  if (nextQuantity === item.quantity) {
    input.value = String(item.quantity);
    return;
  }

  setQuantity(itemId, nextQuantity);
}

function deleteItemById(itemId) {
  const index = state.items.findIndex((entry) => entry.id === itemId);
  if (index === -1) {
    return;
  }

  const item = state.items[index];
  if (!item) {
    return;
  }

  const itemName = item.name;
  const snapshot = { ...item };

  const shouldDelete = window.confirm(`Delete "${itemName}"?`);
  if (!shouldDelete) {
    return;
  }

  scheduleUndo(snapshot, index);
  state.items = removeItem(state.items, itemId);
  setQuickAddNotice(`Deleted ${itemName}.`, "success");
  setSettingsNotice("", "");
  persistAndRender();
}

function undoDelete() {
  if (!state.pendingDelete) {
    return;
  }

  const { item, index, timerId } = state.pendingDelete;
  clearTimeout(timerId);
  state.pendingDelete = null;

  if (state.items.some((entry) => entry.id === item.id)) {
    render();
    return;
  }

  const targetIndex = Math.min(Math.max(index, 0), state.items.length);
  state.items = [
    ...state.items.slice(0, targetIndex),
    item,
    ...state.items.slice(targetIndex),
  ];
  setQuickAddNotice(`Restored ${item.name}.`, "success");
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

    clearPendingDelete();
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
  clearPendingDelete();
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

  if (action === "delete") {
    deleteItemById(itemId);
  }
});

itemList.addEventListener("focusout", (event) => {
  const input = event.target.closest(".qty-input");
  if (!input) {
    return;
  }

  const row = input.closest("[data-item-id]");
  if (!row) {
    return;
  }

  const itemId = decodeItemId(row.dataset.itemId);
  if (!itemId) {
    return;
  }

  commitQuantityFromInput(input, itemId);
  delete input.dataset.previousValue;
});

itemList.addEventListener("keydown", (event) => {
  const input = event.target.closest(".qty-input");
  if (!input) {
    return;
  }

  if (event.key === "Enter") {
    event.preventDefault();
    input.blur();
    return;
  }

  if (event.key === "Escape") {
    event.preventDefault();
    const previous = input.dataset.previousValue;
    if (previous) {
      input.value = previous;
    }
    input.blur();
  }
});

itemList.addEventListener("focusin", (event) => {
  const input = event.target.closest(".qty-input");
  if (!input) {
    return;
  }

  input.dataset.previousValue = input.value;
});

undoButton.addEventListener("click", () => {
  undoDelete();
});

window.addEventListener("resize", updateViewportOffsetBottom);
if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", updateViewportOffsetBottom);
  window.visualViewport.addEventListener("scroll", updateViewportOffsetBottom);
}

updateViewportOffsetBottom();
render();
