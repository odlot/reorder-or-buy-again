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
          </div>
          <div class="controls">
            <button class="step-button" type="button" data-action="step" data-step="-1" aria-label="Decrease ${safeName}">
              -
            </button>
            <button class="qty-button" type="button" data-action="edit" aria-label="Set quantity for ${safeName}">
              ${item.quantity}
            </button>
            <button class="step-button" type="button" data-action="step" data-step="1" aria-label="Increase ${safeName}">
              +
            </button>
          </div>
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
