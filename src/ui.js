import {
  getCheckBaselineTimestamp,
  getNextCheckTimestamp,
  isCheckOverdue,
  isLowStock,
} from "./logic.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const UNASSIGNED_PRESET = "Unassigned";

function normalizeLabel(value) {
  return String(value || "").trim();
}

function normalizeSourceCategories(sourceCategories) {
  const source = Array.isArray(sourceCategories)
    ? sourceCategories
    : sourceCategories
      ? [sourceCategories]
      : [];
  const deduped = [];
  const seen = new Set();

  for (const rawValue of source) {
    const label = normalizeLabel(rawValue);
    if (!label) {
      continue;
    }

    const key = label.toLocaleLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(label);
  }

  if (deduped.length === 0) {
    return [UNASSIGNED_PRESET];
  }

  const withoutUnassigned = deduped.filter(
    (value) => value.toLocaleLowerCase() !== UNASSIGNED_PRESET.toLocaleLowerCase()
  );
  return withoutUnassigned.length > 0 ? withoutUnassigned : [UNASSIGNED_PRESET];
}

function mergeOptionValues(...collections) {
  const merged = [];
  const seen = new Set();

  for (const collection of collections) {
    if (!Array.isArray(collection)) {
      continue;
    }

    for (const rawValue of collection) {
      const label = normalizeLabel(rawValue);
      if (!label) {
        continue;
      }

      const key = label.toLocaleLowerCase();
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      merged.push(label);
    }
  }

  return merged;
}

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
  {
    editingItemId = "",
    defaultCheckIntervalDays = 14,
    sourceCategoryOptions = [],
    roomOptions = [],
  } = {}
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
      const itemSourceCategories = normalizeSourceCategories(item.sourceCategories);
      const sourceCategoryOptionsForItem = mergeOptionValues(
        [UNASSIGNED_PRESET],
        sourceCategoryOptions,
        itemSourceCategories
      );
      const roomOptionsForItem = mergeOptionValues(
        [UNASSIGNED_PRESET],
        roomOptions,
        [item.room]
      );
      const safeRoom = escapeHtml(normalizeLabel(item.room) || UNASSIGNED_PRESET);
      const sourceCategoryTagsMarkup = itemSourceCategories
        .map(
          (sourceCategory) =>
            `<span class="context-chip">${escapeHtml(sourceCategory)}</span>`
        )
        .join("");
      const sourceCategoryInputsMarkup = sourceCategoryOptionsForItem
        .map((sourceCategory, index) => {
          const safeSourceCategory = escapeHtml(sourceCategory);
          const sourceCategoryId = `edit-source-${safeItemId}-${index}`;
          const isChecked = itemSourceCategories.some(
            (value) => value.toLocaleLowerCase() === sourceCategory.toLocaleLowerCase()
          );

          return `
            <label class="item-edit-checkbox-chip" for="${sourceCategoryId}">
              <input
                id="${sourceCategoryId}"
                type="checkbox"
                name="sourceCategories"
                value="${safeSourceCategory}"
                ${isChecked ? "checked" : ""}
              />
              <span>${safeSourceCategory}</span>
            </label>
          `;
        })
        .join("");
      const roomOptionsMarkup = roomOptionsForItem
        .map((roomOption) => {
          const safeRoomOption = escapeHtml(roomOption);
          const isSelected =
            roomOption.toLocaleLowerCase() ===
            (normalizeLabel(item.room) || UNASSIGNED_PRESET).toLocaleLowerCase();
          return `<option value="${safeRoomOption}" ${isSelected ? "selected" : ""}>${safeRoomOption}</option>`;
        })
        .join("");

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
                <fieldset class="item-edit-fieldset">
                  <legend class="item-edit-field-label">Source categories</legend>
                  <div class="item-edit-chip-grid">
                    ${sourceCategoryInputsMarkup}
                  </div>
                </fieldset>
                <div class="item-edit-field">
                  <label class="item-edit-field-label" for="edit-room-${safeItemId}">
                    Room
                  </label>
                  <select
                    id="edit-room-${safeItemId}"
                    class="item-edit-room-select"
                    name="room"
                    aria-label="Room for ${safeName}"
                  >
                    ${roomOptionsMarkup}
                  </select>
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
              <p class="item-context">
                ${sourceCategoryTagsMarkup}
                <span class="context-chip context-chip-room">Room: ${safeRoom}</span>
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

export function renderShoppingList(
  container,
  groupedItems,
  buyQuantityByItemId = {}
) {
  const markup = groupedItems
    .map((group) => {
      const safeGroupLabel = escapeHtml(group.sourceCategory || UNASSIGNED_PRESET);
      const groupRowsMarkup = group.items
        .map((item) => {
          const safeName = escapeHtml(item.name);
          const safeItemId = encodeURIComponent(item.id);
          const neededQuantity = Math.max(0, item.targetQuantity - item.quantity);
          const plannedBuyQuantity = Math.min(
            Math.max(0, Number.parseInt(buyQuantityByItemId[item.id] || 0, 10) || 0),
            neededQuantity
          );
          const isPlanned = plannedBuyQuantity > 0;
          const sourceCategoryTags = normalizeSourceCategories(
            item.sourceCategories
          ).map(
            (sourceCategory) =>
              `<span class="context-chip">${escapeHtml(sourceCategory)}</span>`
          );

          return `
            <li class="shopping-row ${isPlanned ? "is-planned" : ""}" data-item-id="${safeItemId}">
              <p class="shopping-name">${safeName}</p>
              <p class="shopping-meta">
                Have: ${item.quantity} • Target: ${item.targetQuantity} • Need: ${neededQuantity}
              </p>
              <p class="shopping-tags">${sourceCategoryTags.join("")}</p>
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

      return `
        <section class="shopping-group">
          <h3 class="shopping-group-title">${safeGroupLabel}</h3>
          <ul class="shopping-group-list">
            ${groupRowsMarkup}
          </ul>
        </section>
      `;
    })
    .join("");

  container.innerHTML = markup;
}

export function renderSummary(target, totalItems, lowItems, dueItems = 0) {
  target.textContent = `${totalItems} items • ${lowItems} low stock • ${dueItems} due checks`;
}

export function toggleEmptyState(node, isVisible) {
  node.classList.toggle("hidden", !isVisible);
}
