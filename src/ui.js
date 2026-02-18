import { isLowStock } from "./logic.js";

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function renderList(container, items) {
  const markup = items
    .map((item) => {
      const low = isLowStock(item);
      const safeName = escapeHtml(item.name);
      const safeItemId = encodeURIComponent(item.id);

      return `
        <li class="item-row ${low ? "is-low" : ""}" data-item-id="${safeItemId}">
          <div class="item-main">
            <p class="item-name">${safeName}</p>
            <p class="item-meta">
              Threshold: ${item.lowThreshold}
              ${low ? '<span class="low-label">Low</span>' : ""}
            </p>
            ${
              low
                ? `<button class="restock-button" type="button" data-action="restock" aria-label="Restock ${safeName}">
              Restock
            </button>`
                : ""
            }
          </div>
          <div class="controls">
            <button class="step-button" type="button" data-action="step" data-step="-1" aria-label="Decrease ${safeName}">
              -
            </button>
            <input
              class="qty-input"
              type="text"
              inputmode="numeric"
              pattern="[0-9]*"
              value="${item.quantity}"
              aria-label="Quantity for ${safeName}"
            />
            <button class="step-button" type="button" data-action="step" data-step="1" aria-label="Increase ${safeName}">
              +
            </button>
            <button class="remove-button" type="button" data-action="delete" aria-label="Remove ${safeName}">
              Del
            </button>
          </div>
        </li>
      `;
    })
    .join("");

  container.innerHTML = markup;
}

export function renderShoppingList(container, items, purchasedByItemId = {}) {
  const markup = items
    .map((item) => {
      const safeName = escapeHtml(item.name);
      const safeItemId = encodeURIComponent(item.id);
      const isPurchased = Boolean(purchasedByItemId[item.id]);

      return `
        <li class="shopping-row ${isPurchased ? "is-purchased" : ""}" data-item-id="${safeItemId}">
          <label class="shopping-toggle">
            <input
              class="shopping-checkbox"
              type="checkbox"
              data-action="toggle-purchased"
              ${isPurchased ? "checked" : ""}
              aria-label="Mark ${safeName} as purchased"
            />
            <span class="shopping-name">${safeName}</span>
          </label>
          <p class="shopping-meta">
            Qty: ${item.quantity} • Threshold: ${item.lowThreshold}
          </p>
        </li>
      `;
    })
    .join("");

  container.innerHTML = markup;
}

export function renderSummary(target, totalItems, lowItems) {
  target.textContent = `${totalItems} items • ${lowItems} low stock`;
}

export function toggleEmptyState(node, isVisible) {
  node.classList.toggle("hidden", !isVisible);
}
