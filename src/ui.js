import {
  getCheckBaselineTimestamp,
  getNextCheckTimestamp,
  isCheckOverdue,
  isLowStock,
} from "./logic.js";

const DAY_MS = 24 * 60 * 60 * 1000;

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function renderList(
  container,
  items,
  { editingItemId = "", defaultCheckIntervalDays = 14 } = {}
) {
  const nowTimestamp = Date.now();

  const formatFreshnessText = (item) => {
    const baselineTimestamp = getCheckBaselineTimestamp(item);
    if (!baselineTimestamp) {
      return { text: "Check not recorded yet.", overdue: false };
    }

    const daysSinceCheck = Math.max(
      0,
      Math.floor((nowTimestamp - baselineTimestamp) / DAY_MS)
    );
    const checkedLabel =
      daysSinceCheck === 0
        ? "Checked today"
        : daysSinceCheck === 1
          ? "Checked 1 day ago"
          : `Checked ${daysSinceCheck} days ago`;
    const overdue = isCheckOverdue(item, nowTimestamp, defaultCheckIntervalDays);
    if (!overdue) {
      return { text: checkedLabel, overdue: false };
    }

    const nextCheckTimestamp = getNextCheckTimestamp(item, defaultCheckIntervalDays);
    const overdueDays = Math.max(
      0,
      Math.floor((nowTimestamp - nextCheckTimestamp) / DAY_MS)
    );
    const overdueLabel = overdueDays === 0 ? "Due today" : `${overdueDays}d overdue`;
    return {
      text: `${checkedLabel} • ${overdueLabel}`,
      overdue: true,
    };
  };

  const markup = items
    .map((item) => {
      const low = isLowStock(item);
      const safeName = escapeHtml(item.name);
      const safeItemId = encodeURIComponent(item.id);
      const isEditing = item.id === editingItemId;
      const freshness = formatFreshnessText(item);
      const safeFreshness = escapeHtml(freshness.text);

      return `
        <li class="item-row ${low ? "is-low" : ""}" data-item-id="${safeItemId}">
          <div class="item-main">
            ${
              isEditing
                ? `
              <form class="item-edit-form" aria-label="Edit ${safeName}">
                <label class="sr-only" for="edit-name-${safeItemId}">Description</label>
                <input
                  id="edit-name-${safeItemId}"
                  class="item-edit-name-input"
                  type="text"
                  name="name"
                  required
                  maxlength="80"
                  value="${safeName}"
                  aria-label="Description for ${safeName}"
                />
                <div class="item-edit-field">
                  <label class="item-edit-field-label" for="edit-threshold-${safeItemId}">
                    Low threshold
                  </label>
                  <input
                    id="edit-threshold-${safeItemId}"
                    class="item-edit-threshold-input"
                    type="text"
                    inputmode="numeric"
                    pattern="[0-9]*"
                    name="lowThreshold"
                    value="${item.lowThreshold}"
                    aria-label="Low threshold for ${safeName}"
                  />
                </div>
                <div class="item-edit-field">
                  <label class="item-edit-field-label" for="edit-target-${safeItemId}">
                    Target quantity
                  </label>
                  <input
                    id="edit-target-${safeItemId}"
                    class="item-edit-threshold-input"
                    type="text"
                    inputmode="numeric"
                    pattern="[0-9]*"
                    name="targetQuantity"
                    value="${item.targetQuantity}"
                    aria-label="Target quantity for ${safeName}"
                  />
                </div>
                <div class="item-edit-actions">
                  <button class="action-button primary-button" type="submit" aria-label="Save edits for ${safeName}">
                    Save
                  </button>
                  <button class="action-button" type="button" data-action="cancel-edit" aria-label="Cancel editing ${safeName}">
                    Cancel
                  </button>
                </div>
              </form>
            `
                : `
              <p class="item-name">${safeName}</p>
              <p class="item-meta">
                Threshold: ${item.lowThreshold} • Target: ${item.targetQuantity}
                ${low ? '<span class="low-label">Low</span>' : ""}
              </p>
              <p class="item-freshness ${freshness.overdue ? "is-overdue" : ""}">
                ${safeFreshness}
              </p>
            `
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
            <button class="confirm-button" type="button" data-action="confirm-check" aria-label="Confirm quantity for ${safeName}">
              Check
            </button>
            <button class="edit-button ${isEditing ? "hidden" : ""}" type="button" data-action="edit" aria-label="Edit ${safeName}">
              Edit
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

export function renderShoppingList(container, items, buyQuantityByItemId = {}) {
  const markup = items
    .map((item) => {
      const safeName = escapeHtml(item.name);
      const safeItemId = encodeURIComponent(item.id);
      const neededQuantity = Math.max(0, item.targetQuantity - item.quantity);
      const plannedBuyQuantity = Math.min(
        Math.max(0, Number.parseInt(buyQuantityByItemId[item.id] || 0, 10) || 0),
        neededQuantity
      );
      const isPlanned = plannedBuyQuantity > 0;

      return `
        <li class="shopping-row ${isPlanned ? "is-planned" : ""}" data-item-id="${safeItemId}">
          <p class="shopping-name">${safeName}</p>
          <p class="shopping-meta">
            Have: ${item.quantity} • Target: ${item.targetQuantity} • Need: ${neededQuantity}
          </p>
          <div class="shopping-controls">
            <button class="shopping-step-button" type="button" data-action="shopping-step" data-step="-1" aria-label="Decrease planned quantity for ${safeName}">
              -
            </button>
            <input
              class="shopping-buy-input"
              type="text"
              inputmode="numeric"
              pattern="[0-9]*"
              value="${plannedBuyQuantity}"
              aria-label="Planned purchase quantity for ${safeName}"
            />
            <button class="shopping-step-button" type="button" data-action="shopping-step" data-step="1" aria-label="Increase planned quantity for ${safeName}">
              +
            </button>
            <button class="shopping-max-button" type="button" data-action="shopping-max" aria-label="Set planned quantity for ${safeName} to needed amount">
              Max
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
