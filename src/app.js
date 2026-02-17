import {
  compareByUrgencyThenName,
  isLowStock,
  matchesSearch,
  clampQuantity,
} from "./logic.js";
import { loadItems, saveItems, updateItemQuantity } from "./store.js";
import { renderList, renderSummary, toggleEmptyState } from "./ui.js";

const VIEWS = {
  ALL: "all",
  RESTOCK: "restock",
  SETTINGS: "settings",
};

const searchInput = document.querySelector("#search-input");
const listToolbar = document.querySelector("#list-toolbar");
const inventoryView = document.querySelector("#inventory-view");
const settingsView = document.querySelector("#settings-view");
const itemList = document.querySelector("#item-list");
const summaryLine = document.querySelector("#summary-line");
const emptyState = document.querySelector("#empty-state");
const navTabs = document.querySelectorAll(".nav-tab");
const restockBadge = document.querySelector("#restock-badge");

const state = {
  items: loadItems(),
  query: "",
  activeView: VIEWS.ALL,
};

function getVisibleItems() {
  const sourceItems =
    state.activeView === VIEWS.RESTOCK
      ? state.items.filter(isLowStock)
      : state.items;

  return sourceItems
    .filter((item) => matchesSearch(item, state.query))
    .sort(compareByUrgencyThenName);
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

  if (isSettings) {
    return;
  }

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

function persistAndRender() {
  saveItems(state.items);
  render();
}

function setQuantity(itemId, nextQuantity) {
  state.items = updateItemQuantity(state.items, itemId, nextQuantity);
  persistAndRender();
}

searchInput.addEventListener("input", (event) => {
  state.query = event.target.value;
  render();
});

navTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    const { view } = tab.dataset;
    if (!view || !Object.values(VIEWS).includes(view)) {
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

  let itemId = "";
  try {
    itemId = decodeURIComponent(row.dataset.itemId || "");
  } catch {
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
  }
});

render();
