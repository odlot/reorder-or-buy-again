import { isLowStock } from "./logic.js";

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatSettingsInfo(item) {
  const parts = [`Qty ${item.quantity}`, `Low ${item.lowThreshold}`];
  if (item.category) {
    parts.push(item.category);
  }

  return parts.join(" • ");
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

export function renderSummary(target, totalItems, lowItems) {
  target.textContent = `${totalItems} items • ${lowItems} low stock`;
}

export function toggleEmptyState(node, isVisible) {
  node.classList.toggle("hidden", !isVisible);
}

export function renderSettingsItemList(container, items) {
  const markup = items
    .map((item) => {
      const safeName = escapeHtml(item.name);
      const safeInfo = escapeHtml(formatSettingsInfo(item));
      const safeItemId = encodeURIComponent(item.id);

      return `
        <li class="settings-item" data-item-id="${safeItemId}">
          <div>
            <p class="settings-item-name">${safeName}</p>
            <p class="settings-item-info">${safeInfo}</p>
          </div>
          <div class="settings-item-actions">
            <button class="settings-item-button" type="button" data-action="edit-item">
              Edit
            </button>
            <button class="settings-item-button" type="button" data-action="delete-item">
              Delete
            </button>
          </div>
        </li>
      `;
    })
    .join("");

  container.innerHTML = markup;
}
