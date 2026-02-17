import {
  compareByUrgencyThenName,
  isLowStock,
  matchesSearch,
  clampQuantity,
} from "./logic.js";
import { loadItems, saveItems, updateItemQuantity } from "./store.js";
import { renderList, renderSummary, toggleEmptyState } from "./ui.js";

const searchInput = document.querySelector("#search-input");
const itemList = document.querySelector("#item-list");
const summaryLine = document.querySelector("#summary-line");
const emptyState = document.querySelector("#empty-state");

const state = {
  items: loadItems(),
  query: "",
};

function getVisibleItems() {
  return state.items
    .filter((item) => matchesSearch(item, state.query))
    .sort(compareByUrgencyThenName);
}

function render() {
  const visibleItems = getVisibleItems();
  const lowCount = state.items.filter(isLowStock).length;

  renderList(itemList, visibleItems);
  renderSummary(summaryLine, state.items.length, lowCount);
  toggleEmptyState(emptyState, visibleItems.length === 0);
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
