import {
  isLowStock,
  selectVisibleItems,
  clampQuantity,
  getNextCheckTimestamp,
  isCheckOverdue,
} from "./logic.js";
import {
  STORAGE_KEY,
  loadState,
  normalizeState,
  saveState,
  updateItemQuantity,
  upsertItem,
  removeItem,
  UNASSIGNED_PRESET,
  createDefaultState,
  serializeState,
  deserializeState,
  upsertPresetValue,
  removePresetValue,
  remapItemsAfterSourceCategoryPresetRemoval,
  remapItemsAfterRoomPresetRemoval,
} from "./store.js";
import {
  renderList,
  renderShoppingList,
  renderSummary,
  toggleEmptyState,
} from "./ui.js";
import { dom } from "./dom.js";
import { bindAppEvents } from "./events.js";
import { updateViewportOffsetBottom } from "./viewport.js";
import {
  AUTO_SYNC_DELAY_MS,
  SYNC_STATUS,
  STATUS_LABELS,
  supportsOfflineFileSync,
  supportsPersistentSyncHandleStore,
  isAbortError,
  isPermissionError,
  loadStoredSyncHandle,
  saveSyncHandleToStorage,
  clearStoredSyncHandle,
  querySyncHandlePermission,
  parseTimestamp,
  formatSyncTime,
  snapshotHash,
  buildSyncFilePayload,
  parseSyncFilePayload,
  mergeSnapshotsByUpdatedAt,
} from "./sync-utils.js";

const VIEWS = {
  ALL: "all",
  SHOPPING: "shopping",
  SETTINGS: "settings",
};
const THEME_MODES = {
  LIGHT: "light",
  DARK: "dark",
};
const SUPPORTS_WEB_SHARE =
  typeof navigator !== "undefined" &&
  typeof navigator.share === "function";
const DELETE_UNDO_MS = 8000;
const TOAST_AUTO_HIDE_MS = 2600;
const DAY_MS = 24 * 60 * 60 * 1000;

const VALID_VIEWS = new Set(Object.values(VIEWS));

const {
  searchInput,
  allSourceFilterInput,
  allRoomFilterInput,
  statusFilterAllButton,
  statusFilterDueButton,
  bulkEditToggleButton,
  quickAddForm,
  quickAddNameInput,
  checkReminderChip,
  checkReminderPanel,
  checkReminderText,
  confirmAllDueButton,
  syncStatusChip,
  listToolbar,
  inventoryView,
  shoppingView,
  settingsView,
  itemList,
  shoppingList,
  shoppingSourceFilterInput,
  summaryLine,
  shoppingSummaryLine,
  copyShoppingButton,
  shareShoppingButton,
  applyPurchasedButton,
  emptyState,
  bulkEditPanel,
  bulkEditSelectionSummary,
  bulkEditSourceList,
  bulkEditRoomSelect,
  bulkEditCheckIntervalInput,
  bulkEditClearSelectionButton,
  bulkEditApplyButton,
  shoppingEmptyState,
  navTabs,
  shoppingBadge,
  undoToast,
  undoMessage,
  undoButton,
  defaultThresholdInput,
  defaultCheckIntervalInput,
  themeModeInput,
  sourceCategoryPresetList,
  syncStatusDetail,
  syncLastSynced,
  linkSyncButton,
  syncNowButton,
  clearSyncLinkButton,
  roomPresetList,
  settingsMessage,
} = dom;

const initialState = loadState();
const state = {
  items: initialState.items,
  settings: initialState.settings,
  shopping: initialState.shopping,
  updatedAt: initialState.updatedAt || new Date().toISOString(),
  revision: Number.isInteger(initialState.revision) ? initialState.revision : 0,
  query: "",
  filters: {
    allSourceCategory: "",
    allRoom: "",
    allStatus: "all",
    shoppingSourceCategory: "",
  },
  activeView: VIEWS.ALL,
  editingItemId: "",
  bulkEdit: {
    isActive: false,
    selectedItemIds: [],
    draft: {
      sourceCategories: [],
      room: "",
      checkIntervalDays: "",
    },
  },
  toast: {
    text: "",
    tone: "",
    timerId: null,
  },
  settingsNotice: {
    text: "",
    tone: "",
  },
  pendingDelete: null,
  sync: {
    status: SYNC_STATUS.OFFLINE,
    detail: supportsOfflineFileSync
      ? "Local only. Link a file to sync snapshots."
      : "Offline. This browser does not support file sync.",
    fileHandle: null,
    autoSyncTimerId: null,
    isSyncing: false,
    autoSyncEnabled: false,
    conflictRemoteSnapshot: null,
    lastSyncedAt: "",
  },
};

function normalizeLabel(value) {
  return String(value || "").trim();
}

function normalizeSourceCategories(sourceCategories) {
  const source = Array.isArray(sourceCategories)
    ? sourceCategories
    : sourceCategories
      ? [sourceCategories]
      : [];
  const normalized = [];
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
    normalized.push(label);
  }

  if (normalized.length === 0) {
    return [UNASSIGNED_PRESET];
  }

  const withoutUnassigned = normalized.filter(
    (value) => value.toLocaleLowerCase() !== UNASSIGNED_PRESET.toLocaleLowerCase()
  );
  return withoutUnassigned.length > 0 ? withoutUnassigned : [UNASSIGNED_PRESET];
}

function normalizeRoom(room) {
  return normalizeLabel(room) || UNASSIGNED_PRESET;
}

function labelsEqual(left, right) {
  return normalizeLabel(left).toLocaleLowerCase() ===
    normalizeLabel(right).toLocaleLowerCase();
}

function mergeLabels(...collections) {
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

function getSourceCategoryOptions() {
  const sourceCategoriesFromItems = state.items.flatMap((item) =>
    normalizeSourceCategories(item.sourceCategories)
  );
  return mergeLabels(
    [UNASSIGNED_PRESET],
    state.settings.sourceCategoryPresets,
    sourceCategoriesFromItems
  );
}

function getRoomOptions() {
  const roomsFromItems = state.items.map((item) => normalizeRoom(item.room));
  return mergeLabels([UNASSIGNED_PRESET], state.settings.roomPresets, roomsFromItems);
}

function createDefaultBulkDraft() {
  return {
    sourceCategories: [],
    room: "",
    checkIntervalDays: "",
  };
}

function resetBulkEditState() {
  state.bulkEdit = {
    isActive: false,
    selectedItemIds: [],
    draft: createDefaultBulkDraft(),
  };
}

function setBulkSelection(ids) {
  const seen = new Set();
  const selected = [];
  for (const rawId of ids || []) {
    const itemId = String(rawId || "").trim();
    if (!itemId || seen.has(itemId)) {
      continue;
    }
    seen.add(itemId);
    selected.push(itemId);
  }
  state.bulkEdit.selectedItemIds = selected;
}

function getExistingBulkSelection() {
  const existingIds = new Set(state.items.map((item) => item.id));
  return state.bulkEdit.selectedItemIds.filter((itemId) => existingIds.has(itemId));
}

function itemMatchesSourceCategory(item, sourceCategoryFilterValue) {
  const selected = normalizeLabel(sourceCategoryFilterValue);
  if (!selected) {
    return true;
  }

  const itemSourceCategories = normalizeSourceCategories(item.sourceCategories);
  return itemSourceCategories.some((sourceCategory) =>
    labelsEqual(sourceCategory, selected)
  );
}

function itemMatchesRoom(item, roomFilterValue) {
  const selected = normalizeLabel(roomFilterValue);
  if (!selected) {
    return true;
  }

  return labelsEqual(normalizeRoom(item.room), selected);
}

function getPrimarySourceCategory(item) {
  const sourceCategories = normalizeSourceCategories(item.sourceCategories);
  return sourceCategories[0] || UNASSIGNED_PRESET;
}

function getVisibleItems(nowTimestamp = Date.now()) {
  return selectVisibleItems(state.items, state.query, false).filter((item) => {
    const matchesStatus =
      state.filters.allStatus !== "due" ||
      isCheckOverdue(item, nowTimestamp, state.settings.defaultCheckIntervalDays);
    return (
      matchesStatus &&
      itemMatchesSourceCategory(item, state.filters.allSourceCategory) &&
      itemMatchesRoom(item, state.filters.allRoom)
    );
  });
}

function getShoppingItems() {
  return selectVisibleItems(state.items, "", true).filter((item) => {
    return itemMatchesSourceCategory(item, state.filters.shoppingSourceCategory);
  });
}

function getGroupedShoppingItems(items) {
  if (items.length === 0) {
    return [];
  }

  const groupOrder = mergeLabels(
    state.settings.sourceCategoryPresets,
    items.map((item) => getPrimarySourceCategory(item)),
    [UNASSIGNED_PRESET]
  );
  const groups = new Map(groupOrder.map((sourceCategory) => [sourceCategory, []]));

  for (const item of items) {
    const sourceCategory = getPrimarySourceCategory(item);
    const groupItems = groups.get(sourceCategory);
    if (!groupItems) {
      groups.set(sourceCategory, [item]);
      continue;
    }
    groupItems.push(item);
  }

  return Array.from(groups.entries())
    .filter(([, groupItems]) => groupItems.length > 0)
    .map(([sourceCategory, groupItems]) => ({
      sourceCategory,
      items: groupItems,
    }));
}

function renderFilterSelect(selectNode, options, allLabel, selectedValue) {
  if (!selectNode) {
    return "";
  }

  const normalizedSelected = normalizeLabel(selectedValue);
  const hasSelection = options.some((option) => labelsEqual(option, normalizedSelected));
  const effectiveValue = hasSelection ? normalizedSelected : "";

  selectNode.replaceChildren();

  const allOption = document.createElement("option");
  allOption.value = "";
  allOption.textContent = allLabel;
  selectNode.appendChild(allOption);

  for (const optionLabel of options) {
    const optionNode = document.createElement("option");
    optionNode.value = optionLabel;
    optionNode.textContent = optionLabel;
    selectNode.appendChild(optionNode);
  }

  selectNode.value = effectiveValue;
  return effectiveValue;
}

function renderFilterControls() {
  const sourceCategoryOptions = getSourceCategoryOptions();
  const roomOptions = getRoomOptions();

  state.filters.allSourceCategory = renderFilterSelect(
    allSourceFilterInput,
    sourceCategoryOptions,
    "All sources",
    state.filters.allSourceCategory
  );
  state.filters.allRoom = renderFilterSelect(
    allRoomFilterInput,
    roomOptions,
    "All rooms",
    state.filters.allRoom
  );
  state.filters.shoppingSourceCategory = renderFilterSelect(
    shoppingSourceFilterInput,
    sourceCategoryOptions,
    "All sources",
    state.filters.shoppingSourceCategory
  );
}

function renderStatusFilterControls(overdueCount) {
  if (!statusFilterAllButton || !statusFilterDueButton) {
    return;
  }

  if (state.filters.allStatus === "due" && overdueCount === 0) {
    state.filters.allStatus = "all";
  }

  const dueLabel = overdueCount === 1 ? "Due check (1)" : `Due checks (${overdueCount})`;
  statusFilterDueButton.textContent = dueLabel;
  statusFilterDueButton.disabled = overdueCount === 0;

  const allActive = state.filters.allStatus !== "due";
  statusFilterAllButton.classList.toggle("is-active", allActive);
  statusFilterAllButton.setAttribute("aria-pressed", allActive ? "true" : "false");

  statusFilterDueButton.classList.toggle("is-active", !allActive);
  statusFilterDueButton.setAttribute("aria-pressed", allActive ? "false" : "true");
}

function renderBulkSourceDraftOptions(sourceCategoryOptions) {
  if (!bulkEditSourceList) {
    return;
  }

  bulkEditSourceList.replaceChildren();
  const draftSourceCategoryKeys = new Set(
    state.bulkEdit.draft.sourceCategories.map((value) =>
      normalizeLabel(value).toLocaleLowerCase()
    )
  );

  for (const sourceCategory of sourceCategoryOptions) {
    const optionKey = sourceCategory.toLocaleLowerCase();
    const optionId = `bulk-source-${encodeURIComponent(optionKey)}`;
    const chip = document.createElement("label");
    chip.className = "bulk-edit-source-chip";
    chip.setAttribute("for", optionId);

    const input = document.createElement("input");
    input.id = optionId;
    input.type = "checkbox";
    input.value = sourceCategory;
    input.dataset.sourceCategory = sourceCategory;
    input.checked = draftSourceCategoryKeys.has(optionKey);

    const text = document.createElement("span");
    text.textContent = sourceCategory;

    chip.append(input, text);
    bulkEditSourceList.appendChild(chip);
  }
}

function renderBulkEditPanel({
  isSettings = false,
  isShopping = false,
  visibleItems = [],
  sourceCategoryOptions = [],
  roomOptions = [],
} = {}) {
  const canShowBulkPanel = !isSettings && !isShopping;
  if (!canShowBulkPanel) {
    bulkEditPanel.classList.add("hidden");
    if (bulkEditToggleButton) {
      bulkEditToggleButton.classList.add("hidden");
    }
    return;
  }

  if (bulkEditToggleButton) {
    bulkEditToggleButton.classList.remove("hidden");
  }

  const visibleIdSet = new Set(visibleItems.map((item) => item.id));
  const selectedVisibleIds = getExistingBulkSelection().filter((itemId) =>
    visibleIdSet.has(itemId)
  );
  setBulkSelection(selectedVisibleIds);
  const selectedCount = selectedVisibleIds.length;

  if (!state.bulkEdit.isActive) {
    bulkEditPanel.classList.add("hidden");
    if (bulkEditToggleButton) {
      bulkEditToggleButton.textContent = "Bulk edit";
      bulkEditToggleButton.setAttribute("aria-pressed", "false");
    }
    return;
  }

  if (bulkEditToggleButton) {
    bulkEditToggleButton.textContent = "Exit bulk edit";
    bulkEditToggleButton.setAttribute("aria-pressed", "true");
  }

  bulkEditPanel.classList.remove("hidden");
  const itemNoun = selectedCount === 1 ? "item" : "items";
  bulkEditSelectionSummary.textContent = `${selectedCount} ${itemNoun} selected`;

  renderBulkSourceDraftOptions(sourceCategoryOptions);

  if (bulkEditRoomSelect) {
    const options = [""];
    options.push(...roomOptions);
    bulkEditRoomSelect.replaceChildren();
    for (const roomOption of options) {
      const optionNode = document.createElement("option");
      optionNode.value = roomOption;
      optionNode.textContent = roomOption || "No change";
      bulkEditRoomSelect.appendChild(optionNode);
    }
    bulkEditRoomSelect.value = state.bulkEdit.draft.room;
  }

  bulkEditCheckIntervalInput.value = state.bulkEdit.draft.checkIntervalDays;

  const hasDraftChanges =
    state.bulkEdit.draft.sourceCategories.length > 0 ||
    Boolean(normalizeLabel(state.bulkEdit.draft.room)) ||
    Boolean(normalizeLabel(state.bulkEdit.draft.checkIntervalDays));
  bulkEditApplyButton.disabled = selectedCount === 0 || !hasDraftChanges;
  bulkEditClearSelectionButton.disabled = selectedCount === 0;
}

function getNeededQuantity(item) {
  return Math.max(0, item.targetQuantity - item.quantity);
}

function getShoppingShareEntries() {
  const shoppingItems = getShoppingItems();
  const buyQuantityByItemId = getPrunedBuyQuantityByItemId(
    state.items,
    state.shopping.buyQuantityByItemId
  );

  return shoppingItems
    .map((item) => {
      const neededQuantity = getNeededQuantity(item);
      const plannedQuantity = clampQuantity(buyQuantityByItemId[item.id]);
      const quantityToBuy = plannedQuantity > 0 ? plannedQuantity : neededQuantity;
      return {
        name: item.name,
        quantityToBuy,
        neededQuantity,
      };
    })
    .filter((entry) => entry.quantityToBuy > 0);
}

function buildShoppingListText(entries = getShoppingShareEntries()) {
  const generatedAt = new Date().toLocaleDateString();
  const lines = entries.map(
    (entry) =>
      `- ${entry.name}: ${entry.quantityToBuy} (${entry.neededQuantity} needed)`
  );
  return [`Shopping list - ${generatedAt}`, "", ...lines].join("\n");
}

async function copyTextToClipboard(text) {
  if (
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === "function"
  ) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to legacy copy path.
    }
  }

  const copyBuffer = document.createElement("textarea");
  copyBuffer.value = text;
  copyBuffer.setAttribute("readonly", "");
  copyBuffer.style.position = "fixed";
  copyBuffer.style.opacity = "0";
  copyBuffer.style.pointerEvents = "none";
  document.body.appendChild(copyBuffer);
  copyBuffer.focus();
  copyBuffer.select();
  copyBuffer.setSelectionRange(0, copyBuffer.value.length);

  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  } finally {
    copyBuffer.remove();
  }

  return copied;
}

function getPrunedBuyQuantityByItemId(items, buyQuantityByItemId) {
  const lowStockItemMap = new Map(
    items.filter(isLowStock).map((item) => [item.id, item])
  );
  const source =
    buyQuantityByItemId && typeof buyQuantityByItemId === "object"
      ? buyQuantityByItemId
      : {};
  const nextBuyQuantityByItemId = {};

  for (const [itemId, buyQuantity] of Object.entries(source)) {
    const item = lowStockItemMap.get(itemId);
    if (!item) {
      continue;
    }

    const neededQuantity = getNeededQuantity(item);
    if (neededQuantity <= 0) {
      continue;
    }

    const normalizedBuyQuantity = clampQuantity(buyQuantity);
    if (normalizedBuyQuantity <= 0) {
      continue;
    }

    nextBuyQuantityByItemId[itemId] = Math.min(normalizedBuyQuantity, neededQuantity);
  }

  return nextBuyQuantityByItemId;
}

function reconcileShoppingPlan() {
  const buyQuantityByItemId =
    state.shopping && typeof state.shopping === "object"
      ? state.shopping.buyQuantityByItemId
      : {};
  state.shopping = {
    buyQuantityByItemId: getPrunedBuyQuantityByItemId(state.items, buyQuantityByItemId),
  };
}

function setSettingsNotice(text, tone = "") {
  state.settingsNotice = { text, tone };
}

function clearToastTimer() {
  if (!state.toast.timerId) {
    return;
  }

  clearTimeout(state.toast.timerId);
  state.toast.timerId = null;
}

function clearToast() {
  clearToastTimer();
  state.toast.text = "";
  state.toast.tone = "";
}

function showToast(text, tone = "success", { autoHideMs = TOAST_AUTO_HIDE_MS } = {}) {
  clearToastTimer();
  state.toast.text = text;
  state.toast.tone = tone;

  if (autoHideMs <= 0) {
    return;
  }

  state.toast.timerId = setTimeout(() => {
    state.toast.timerId = null;
    clearToast();
    render();
  }, autoHideMs);
}

function snapshotFromState() {
  return {
    items: state.items,
    settings: state.settings,
    shopping: state.shopping,
    updatedAt: state.updatedAt || new Date().toISOString(),
    revision: state.revision,
  };
}

function normalizeThemeMode(themeMode) {
  return themeMode === THEME_MODES.DARK ? THEME_MODES.DARK : THEME_MODES.LIGHT;
}

function applyThemeMode(themeMode) {
  const normalizedTheme = normalizeThemeMode(themeMode);
  document.documentElement.setAttribute("data-theme", normalizedTheme);
}

function setSyncStatus(status, detail = "") {
  state.sync.status = status;
  state.sync.detail = detail;
}

function renderSyncStatus() {
  if (
    !syncStatusChip ||
    !syncStatusDetail ||
    !syncLastSynced ||
    !linkSyncButton ||
    !syncNowButton ||
    !clearSyncLinkButton
  ) {
    return;
  }

  syncStatusChip.textContent = STATUS_LABELS[state.sync.status];
  syncStatusChip.classList.remove(
    "is-synced",
    "is-syncing",
    "is-offline",
    "is-conflict"
  );
  syncStatusChip.classList.add(`is-${state.sync.status}`);

  syncStatusDetail.textContent = state.sync.detail;
  const formattedLastSynced = formatSyncTime(state.sync.lastSyncedAt);
  syncLastSynced.textContent = formattedLastSynced
    ? `Last synced: ${formattedLastSynced}`
    : "Last synced: never";
  syncNowButton.disabled = !state.sync.fileHandle || state.sync.isSyncing;
  syncNowButton.textContent =
    state.sync.status === SYNC_STATUS.CONFLICT ? "Resolve Conflict" : "Sync Now";
  clearSyncLinkButton.disabled = !state.sync.fileHandle || state.sync.isSyncing;

  if (!supportsOfflineFileSync) {
    linkSyncButton.disabled = true;
    linkSyncButton.textContent = "Unsupported";
    clearSyncLinkButton.disabled = true;
    return;
  }

  linkSyncButton.disabled = state.sync.isSyncing;
  linkSyncButton.textContent = state.sync.fileHandle
    ? "Re-link Sync File"
    : "Link Sync File";
}

async function readSnapshotFromLinkedFile() {
  if (!state.sync.fileHandle) {
    return null;
  }

  const file = await state.sync.fileHandle.getFile();
  const text = await file.text();
  return parseSyncFilePayload(text);
}

async function writeSnapshotToLinkedFile(snapshot) {
  if (!state.sync.fileHandle) {
    return;
  }

  const writable = await state.sync.fileHandle.createWritable();
  await writable.write(buildSyncFilePayload(snapshot));
  await writable.close();
  state.sync.lastSyncedAt = snapshot.updatedAt;
}

function adoptSnapshot(snapshot, { persist = true } = {}) {
  clearPendingDelete();
  clearToast();
  state.editingItemId = "";
  resetBulkEditState();
  state.items = snapshot.items;
  state.settings = snapshot.settings;
  state.shopping = snapshot.shopping;
  reconcileShoppingPlan();
  state.updatedAt = snapshot.updatedAt || new Date().toISOString();
  state.revision = Number.isInteger(snapshot.revision)
    ? snapshot.revision
    : state.revision;

  if (!persist) {
    return;
  }

  const persistedSnapshot = saveState(snapshotFromState());
  if (persistedSnapshot && Number.isInteger(persistedSnapshot.revision)) {
    state.revision = persistedSnapshot.revision;
  }
}

function clearAutoSyncTimer() {
  if (!state.sync.autoSyncTimerId) {
    return;
  }

  clearTimeout(state.sync.autoSyncTimerId);
  state.sync.autoSyncTimerId = null;
}

function queueAutoSyncToFile() {
  if (
    !state.sync.fileHandle ||
    !state.sync.autoSyncEnabled ||
    state.sync.status === SYNC_STATUS.CONFLICT
  ) {
    return;
  }

  clearAutoSyncTimer();

  state.sync.autoSyncTimerId = setTimeout(() => {
    state.sync.autoSyncTimerId = null;
    void syncWithLinkedFile();
  }, AUTO_SYNC_DELAY_MS);
}

async function syncWithLinkedFile() {
  if (!state.sync.fileHandle) {
    setSyncStatus(
      SYNC_STATUS.OFFLINE,
      "Local only. Link a file to sync snapshots."
    );
    render();
    return;
  }

  if (state.sync.isSyncing) {
    return;
  }

  state.sync.isSyncing = true;
  setSyncStatus(SYNC_STATUS.SYNCING, "Syncing local snapshot...");
  render();

  try {
    if (state.sync.conflictRemoteSnapshot) {
      const mergedSnapshot = mergeSnapshotsByUpdatedAt(
        snapshotFromState(),
        state.sync.conflictRemoteSnapshot
      );

      adoptSnapshot(mergedSnapshot);
      await writeSnapshotToLinkedFile(mergedSnapshot);
      state.sync.autoSyncEnabled = true;
      state.sync.conflictRemoteSnapshot = null;
      setSyncStatus(
        SYNC_STATUS.SYNCED,
        `Synced ${formatSyncTime(mergedSnapshot.updatedAt)} (merged conflict)`
      );
      setSettingsNotice("Conflict merged and synced.", "success");
      render();
      return;
    }

    const localSnapshot = snapshotFromState();
    const localHash = snapshotHash(localSnapshot);
    const remoteSnapshot = await readSnapshotFromLinkedFile();

    if (!remoteSnapshot) {
      await writeSnapshotToLinkedFile(localSnapshot);
      state.sync.autoSyncEnabled = true;
      setSyncStatus(
        SYNC_STATUS.SYNCED,
        `Synced ${formatSyncTime(localSnapshot.updatedAt)}`
      );
      render();
      return;
    }

    const remoteHash = snapshotHash(remoteSnapshot);
    if (localHash === remoteHash) {
      const latestTimestamp =
        parseTimestamp(remoteSnapshot.updatedAt) > parseTimestamp(localSnapshot.updatedAt)
          ? remoteSnapshot.updatedAt
          : localSnapshot.updatedAt;
      state.sync.lastSyncedAt = latestTimestamp;
      setSyncStatus(
        SYNC_STATUS.SYNCED,
        `Synced ${formatSyncTime(latestTimestamp)}`
      );
      state.sync.autoSyncEnabled = true;
      render();
      return;
    }

    const localTime = parseTimestamp(localSnapshot.updatedAt);
    const remoteTime = parseTimestamp(remoteSnapshot.updatedAt);

    if (localTime > remoteTime) {
      await writeSnapshotToLinkedFile(localSnapshot);
      state.sync.autoSyncEnabled = true;
      setSyncStatus(
        SYNC_STATUS.SYNCED,
        `Synced ${formatSyncTime(localSnapshot.updatedAt)}`
      );
      render();
      return;
    }

    if (remoteTime > localTime) {
      adoptSnapshot(remoteSnapshot);
      state.sync.lastSyncedAt = remoteSnapshot.updatedAt;
      state.sync.autoSyncEnabled = true;
      setSyncStatus(
        SYNC_STATUS.SYNCED,
        `Synced ${formatSyncTime(remoteSnapshot.updatedAt)}`
      );
      setSettingsNotice("Applied newer snapshot from sync file.", "success");
      render();
      return;
    }

    state.sync.conflictRemoteSnapshot = remoteSnapshot;
    setSyncStatus(
      SYNC_STATUS.CONFLICT,
      "Conflict detected. Tap Resolve Conflict to merge by item updates."
    );
    setSettingsNotice("Conflict detected between local and file snapshots.", "error");
    render();
  } catch (error) {
    if (isPermissionError(error)) {
      state.sync.autoSyncEnabled = false;
      setSyncStatus(
        SYNC_STATUS.OFFLINE,
        "Permission required. Tap Sync Now to re-authorize this file."
      );
      setSettingsNotice("Sync permission is required for the linked file.", "error");
      render();
      return;
    }

    const message =
      error instanceof Error ? error.message : "Failed to sync with file.";
    setSyncStatus(SYNC_STATUS.OFFLINE, "Sync failed. Re-link sync file.");
    setSettingsNotice(message, "error");
    render();
  } finally {
    state.sync.isSyncing = false;
    render();
  }
}

async function linkSyncFile() {
  if (!supportsOfflineFileSync) {
    setSettingsNotice("Offline file sync is not supported in this browser.", "error");
    render();
    return;
  }

  try {
    const fileHandle = await window.showSaveFilePicker({
      suggestedName: "inventory-sync.json",
      types: [
        {
          description: "Inventory Sync JSON",
          accept: {
            "application/json": [".json"],
          },
        },
      ],
    });

    state.sync.fileHandle = fileHandle;
    state.sync.autoSyncEnabled = true;
    state.sync.conflictRemoteSnapshot = null;
    try {
      await saveSyncHandleToStorage(fileHandle);
    } catch {
      // Ignore persistence errors (e.g., non-clonable mocked handles in tests).
    }
    setSettingsNotice("Sync file linked.", "success");
    await syncWithLinkedFile();
  } catch (error) {
    if (isAbortError(error)) {
      return;
    }

    const message =
      error instanceof Error ? error.message : "Failed to link sync file.";
    setSettingsNotice(message, "error");
    render();
  }
}

async function clearSyncLink() {
  clearAutoSyncTimer();
  state.sync.fileHandle = null;
  state.sync.autoSyncEnabled = false;
  state.sync.conflictRemoteSnapshot = null;
  state.sync.lastSyncedAt = "";
  try {
    await clearStoredSyncHandle();
  } catch {
    // Keep clearing in-memory link even if persisted handle cleanup fails.
  }
  setSyncStatus(SYNC_STATUS.OFFLINE, "Local only. Link a file to sync snapshots.");
  setSettingsNotice("Sync link cleared.", "success");
  render();
}

async function restoreSyncLinkFromStorage() {
  if (!supportsOfflineFileSync || !supportsPersistentSyncHandleStore) {
    return;
  }

  try {
    const storedHandle = await loadStoredSyncHandle();
    if (!storedHandle) {
      return;
    }

    if (
      typeof storedHandle.getFile !== "function" ||
      typeof storedHandle.createWritable !== "function"
    ) {
      await clearStoredSyncHandle();
      return;
    }

    state.sync.fileHandle = storedHandle;
    state.sync.conflictRemoteSnapshot = null;

    const permission = await querySyncHandlePermission(storedHandle);
    if (permission === "granted") {
      state.sync.autoSyncEnabled = true;
      await syncWithLinkedFile();
      return;
    }

    state.sync.autoSyncEnabled = false;
    setSyncStatus(
      SYNC_STATUS.OFFLINE,
      "Sync file restored. Tap Sync Now to re-authorize."
    );
    render();
  } catch {
    setSyncStatus(
      SYNC_STATUS.OFFLINE,
      "Local only. Link a file to sync snapshots."
    );
    render();
  }
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
  clearToast();

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

function renderPresetChipList(listNode, presets, { removeAction, removeLabel }) {
  listNode.replaceChildren();

  const unassignedChip = document.createElement("li");
  unassignedChip.className = "preset-chip preset-chip-static";
  const unassignedLabel = document.createElement("span");
  unassignedLabel.className = "preset-chip-label";
  unassignedLabel.textContent = UNASSIGNED_PRESET;
  unassignedChip.appendChild(unassignedLabel);
  listNode.appendChild(unassignedChip);

  for (const preset of presets) {
    const item = document.createElement("li");
    item.className = "preset-chip";

    const label = document.createElement("span");
    label.className = "preset-chip-label";
    label.textContent = preset;

    const removeButton = document.createElement("button");
    removeButton.className = "preset-chip-remove";
    removeButton.type = "button";
    removeButton.dataset.action = removeAction;
    removeButton.dataset.preset = preset;
    removeButton.setAttribute("aria-label", removeLabel);
    removeButton.textContent = "×";

    item.append(label, removeButton);
    listNode.appendChild(item);
  }
}

function renderSettingsPanel() {
  defaultThresholdInput.value = String(state.settings.defaultLowThreshold);
  defaultCheckIntervalInput.value = String(state.settings.defaultCheckIntervalDays);
  if (themeModeInput) {
    themeModeInput.value = normalizeThemeMode(state.settings.themeMode);
  }
  renderPresetChipList(sourceCategoryPresetList, state.settings.sourceCategoryPresets, {
    removeAction: "remove-source-category-preset",
    removeLabel: "Remove source category preset",
  });
  renderPresetChipList(roomPresetList, state.settings.roomPresets, {
    removeAction: "remove-room-preset",
    removeLabel: "Remove room preset",
  });

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

function getOverdueCheckItems(nowTimestamp = Date.now()) {
  const fallbackDays = state.settings.defaultCheckIntervalDays;
  return state.items
    .filter((item) => isCheckOverdue(item, nowTimestamp, fallbackDays))
    .sort((a, b) => {
      const aNext = getNextCheckTimestamp(a, fallbackDays);
      const bNext = getNextCheckTimestamp(b, fallbackDays);
      if (aNext !== bNext) {
        return aNext - bNext;
      }
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });
}

function renderCheckReminderState(overdueItems, nowTimestamp = Date.now()) {
  if (overdueItems.length === 0) {
    checkReminderChip.classList.add("hidden");
    checkReminderPanel.classList.add("hidden");
    checkReminderText.textContent = "";
    if (confirmAllDueButton) {
      confirmAllDueButton.disabled = true;
      confirmAllDueButton.textContent = "Confirm all due";
    }
    return;
  }

  const checkNoun = overdueItems.length === 1 ? "check" : "checks";
  checkReminderChip.textContent = `${overdueItems.length} ${checkNoun} due`;
  checkReminderChip.classList.remove("hidden");

  const mostOverdueItem = overdueItems[0];
  const oldestDueAt = getNextCheckTimestamp(
    mostOverdueItem,
    state.settings.defaultCheckIntervalDays
  );
  const oldestDaysOverdue = Math.max(
    0,
    Math.floor((nowTimestamp - oldestDueAt) / DAY_MS)
  );
  const overdueLabel =
    oldestDaysOverdue === 0 ? "due today" : `${oldestDaysOverdue}d overdue`;
  checkReminderText.textContent = `${overdueItems.length} items need quantity confirmation. Oldest: ${mostOverdueItem.name} (${overdueLabel}).`;
  if (confirmAllDueButton) {
    const itemNoun = overdueItems.length === 1 ? "item" : "items";
    confirmAllDueButton.disabled = false;
    confirmAllDueButton.textContent = `Confirm all due (${overdueItems.length} ${itemNoun})`;
  }
  checkReminderPanel.classList.toggle(
    "hidden",
    state.activeView !== VIEWS.ALL || overdueItems.length === 0
  );
}

function renderInventoryPanel(
  visibleItems,
  lowCount,
  overdueCount,
  sourceCategoryOptions,
  roomOptions
) {
  const hasBulkEdit = state.bulkEdit.isActive;
  if (!state.items.some((item) => item.id === state.editingItemId) || hasBulkEdit) {
    state.editingItemId = "";
  }
  if (
    state.editingItemId &&
    !visibleItems.some((item) => item.id === state.editingItemId)
  ) {
    state.editingItemId = "";
  }

  renderList(itemList, visibleItems, {
    editingItemId: state.editingItemId,
    defaultCheckIntervalDays: state.settings.defaultCheckIntervalDays,
    sourceCategoryOptions,
    roomOptions,
    bulkMode: hasBulkEdit,
    selectedItemIds: new Set(state.bulkEdit.selectedItemIds),
  });
  renderSummary(summaryLine, state.items.length, lowCount, overdueCount);

  if (visibleItems.length > 0) {
    toggleEmptyState(emptyState, false);
    return;
  }

  const hasFilter =
    Boolean(state.query.trim()) ||
    Boolean(state.filters.allSourceCategory) ||
    Boolean(state.filters.allRoom) ||
    state.filters.allStatus === "due" ||
    hasBulkEdit;
  emptyState.textContent = hasFilter
    ? "No items match your filters."
    : "No items yet. Add one above.";
  toggleEmptyState(emptyState, true);
}

function renderShoppingPanel() {
  const shoppingItems = getShoppingItems();
  const groupedShoppingItems = getGroupedShoppingItems(shoppingItems);
  const buyQuantityByItemId = getPrunedBuyQuantityByItemId(
    state.items,
    state.shopping.buyQuantityByItemId
  );
  const plannedUnits = Object.values(buyQuantityByItemId).reduce(
    (sum, value) => sum + value,
    0
  );
  const plannedItemCount = Object.keys(buyQuantityByItemId).length;

  state.shopping = { buyQuantityByItemId };
  renderShoppingList(shoppingList, groupedShoppingItems, buyQuantityByItemId);
  shoppingSummaryLine.textContent = `${shoppingItems.length} low stock • ${plannedUnits} planned (${plannedItemCount} items)`;
  copyShoppingButton.disabled = shoppingItems.length === 0;
  shareShoppingButton.disabled = shoppingItems.length === 0;
  shareShoppingButton.textContent = SUPPORTS_WEB_SHARE
    ? "Share list"
    : "Share/Copy";
  applyPurchasedButton.disabled = plannedUnits === 0;

  if (shoppingItems.length > 0) {
    toggleEmptyState(shoppingEmptyState, false);
    return;
  }

  shoppingEmptyState.textContent = state.filters.shoppingSourceCategory
    ? "No low-stock items in the selected source."
    : "No low-stock items to shop for.";
  toggleEmptyState(shoppingEmptyState, true);
}

function render() {
  const nowTimestamp = Date.now();
  const isSettings = state.activeView === VIEWS.SETTINGS;
  const isShopping = state.activeView === VIEWS.SHOPPING;
  const sourceCategoryOptions = getSourceCategoryOptions();
  const roomOptions = getRoomOptions();
  renderFilterControls();
  const overdueItems = getOverdueCheckItems(nowTimestamp);
  renderStatusFilterControls(overdueItems.length);
  const visibleItems = getVisibleItems(nowTimestamp);
  const lowCount = state.items.filter(isLowStock).length;
  applyThemeMode(state.settings.themeMode);

  listToolbar.classList.toggle("hidden", isSettings || isShopping);
  inventoryView.classList.toggle("hidden", isSettings || isShopping);
  shoppingView.classList.toggle("hidden", !isShopping);
  settingsView.classList.toggle("hidden", !isSettings);
  quickAddForm.classList.toggle("hidden", isSettings || isShopping || state.bulkEdit.isActive);

  renderBulkEditPanel({
    isSettings,
    isShopping,
    visibleItems,
    sourceCategoryOptions,
    roomOptions,
  });

  navTabs.forEach((tab) => {
    const isActive = tab.dataset.view === state.activeView;
    tab.classList.toggle("is-active", isActive);
    if (isActive) {
      tab.setAttribute("aria-current", "page");
    } else {
      tab.removeAttribute("aria-current");
    }
  });

  shoppingBadge.textContent = lowCount > 99 ? "99+" : String(lowCount);
  shoppingBadge.classList.toggle("hidden", lowCount === 0);
  renderCheckReminderState(overdueItems, nowTimestamp);
  renderSyncStatus();

  const hasUndo = Boolean(state.pendingDelete);
  const toastText = hasUndo
    ? `"${state.pendingDelete.item.name}" removed.`
    : state.toast.text;
  const toastTone = hasUndo ? "success" : state.toast.tone;
  if (toastText) {
    undoMessage.textContent = toastText;
    undoToast.classList.toggle("is-success", toastTone === "success");
    undoToast.classList.toggle("is-error", toastTone === "error");
    undoButton.classList.toggle("hidden", !hasUndo);
    undoToast.classList.remove("hidden");
  } else {
    undoToast.classList.remove("is-success", "is-error");
    undoButton.classList.add("hidden");
    undoToast.classList.add("hidden");
  }

  if (isSettings) {
    renderSettingsPanel();
    return;
  }

  if (isShopping) {
    renderShoppingPanel();
    return;
  }

  renderInventoryPanel(
    visibleItems,
    lowCount,
    overdueItems.length,
    sourceCategoryOptions,
    roomOptions
  );
}

function persistAndRender({ touchUpdatedAt = true, queueSync = true } = {}) {
  reconcileShoppingPlan();
  if (touchUpdatedAt) {
    state.updatedAt = new Date().toISOString();
  }

  const persistedSnapshot = saveState({
    items: state.items,
    settings: state.settings,
    shopping: state.shopping,
    updatedAt: state.updatedAt,
    revision: state.revision,
  });
  if (persistedSnapshot && Number.isInteger(persistedSnapshot.revision)) {
    state.revision = persistedSnapshot.revision;
  }

  if (queueSync) {
    queueAutoSyncToFile();
  }
  render();
}

function setQuantity(itemId, nextQuantity) {
  state.items = updateItemQuantity(state.items, itemId, nextQuantity);
  persistAndRender();
}

function confirmItemCheck(itemId) {
  const now = new Date().toISOString();
  let confirmedItemName = "";

  state.items = state.items.map((item) => {
    if (item.id !== itemId) {
      return item;
    }

    confirmedItemName = item.name;
    return {
      ...item,
      lastCheckedAt: now,
      updatedAt: now,
    };
  });

  if (!confirmedItemName) {
    return;
  }

  showToast(`Confirmed ${confirmedItemName} quantity.`, "success");
  setSettingsNotice("", "");
  persistAndRender({ touchUpdatedAt: true });
}

function startEditingItemById(itemId) {
  const item = state.items.find((entry) => entry.id === itemId);
  if (!item) {
    return;
  }

  state.editingItemId = itemId;
  render();

  window.requestAnimationFrame(() => {
    const input = itemList.querySelector(
      `[data-item-id="${encodeURIComponent(itemId)}"] .item-edit-name-input`
    );
    if (input instanceof HTMLInputElement) {
      input.focus();
      input.select();
    }
  });
}

function cancelEditingItem() {
  if (!state.editingItemId) {
    return;
  }

  state.editingItemId = "";
  render();
}

function saveItemEdits(itemId, input) {
  const name = String(input.name || "").trim();
  if (!name) {
    showToast("Description is required.", "error");
    render();
    return;
  }

  const lowThreshold = clampQuantity(input.lowThreshold);
  const targetQuantity = Math.max(
    clampQuantity(input.targetQuantity),
    lowThreshold + 1
  );
  const sourceCategories = normalizeSourceCategories(input.sourceCategories);
  const room = normalizeRoom(input.room);
  let changedName = false;
  let changedThreshold = false;
  let changedTarget = false;
  let changedSourceCategories = false;
  let changedRoom = false;
  let changed = false;

  state.items = state.items.map((item) => {
    if (item.id !== itemId) {
      return item;
    }

    changedName = item.name !== name;
    changedThreshold = item.lowThreshold !== lowThreshold;
    changedTarget = item.targetQuantity !== targetQuantity;
    const currentSourceCategories = normalizeSourceCategories(item.sourceCategories);
    changedSourceCategories =
      currentSourceCategories.length !== sourceCategories.length ||
      currentSourceCategories.some((sourceCategory, index) => {
        return !labelsEqual(sourceCategory, sourceCategories[index]);
      });
    changedRoom = !labelsEqual(normalizeRoom(item.room), room);
    changed =
      changedName ||
      changedThreshold ||
      changedTarget ||
      changedSourceCategories ||
      changedRoom;
    if (!changed) {
      return item;
    }

    return {
      ...item,
      name,
      lowThreshold,
      targetQuantity,
      sourceCategories,
      room,
    };
  });

  state.editingItemId = "";
  if (!changed) {
    render();
    return;
  }

  const changedParts = [];
  if (changedName) {
    changedParts.push("description");
  }
  if (changedThreshold) {
    changedParts.push("threshold");
  }
  if (changedTarget) {
    changedParts.push("target");
  }
  if (changedSourceCategories) {
    changedParts.push("source categories");
  }
  if (changedRoom) {
    changedParts.push("room");
  }

  showToast(`Updated ${changedParts.join(" and ")}.`, "success");
  setSettingsNotice("", "");
  persistAndRender({ touchUpdatedAt: true });
}

function setAllSourceFilter(value) {
  state.filters.allSourceCategory = normalizeLabel(value);
  render();
}

function setBulkEditMode(nextActive, { skipRender = false } = {}) {
  const shouldEnable = Boolean(nextActive);
  if (shouldEnable) {
    state.editingItemId = "";
    state.bulkEdit.isActive = true;
    setBulkSelection([]);
    state.bulkEdit.draft = createDefaultBulkDraft();
  } else {
    resetBulkEditState();
  }

  if (!skipRender) {
    render();
  }
}

function toggleBulkItemSelection(itemId) {
  if (!state.bulkEdit.isActive) {
    return;
  }

  const nextSelection = new Set(getExistingBulkSelection());
  if (nextSelection.has(itemId)) {
    nextSelection.delete(itemId);
  } else {
    nextSelection.add(itemId);
  }

  setBulkSelection(Array.from(nextSelection));
  render();
}

function clearBulkSelection() {
  if (!state.bulkEdit.isActive) {
    return;
  }

  setBulkSelection([]);
  render();
}

function setBulkDraftRoom(value) {
  if (!state.bulkEdit.isActive) {
    return;
  }

  state.bulkEdit.draft.room = normalizeLabel(value);
  render();
}

function setBulkDraftCheckInterval(value) {
  if (!state.bulkEdit.isActive) {
    return;
  }

  state.bulkEdit.draft.checkIntervalDays = normalizeLabel(value);
  render();
}

function toggleBulkDraftSourceCategory(value, checked) {
  if (!state.bulkEdit.isActive) {
    return;
  }

  const label = normalizeLabel(value);
  if (!label) {
    return;
  }

  const selected = mergeLabels(state.bulkEdit.draft.sourceCategories);
  const nextSourceCategories = checked
    ? [...selected, label]
    : selected.filter((sourceCategory) => !labelsEqual(sourceCategory, label));
  state.bulkEdit.draft.sourceCategories = mergeLabels(nextSourceCategories);
  render();
}

function applyBulkEdits() {
  if (!state.bulkEdit.isActive) {
    return;
  }

  const selectedIds = getExistingBulkSelection();
  if (selectedIds.length === 0) {
    showToast("Select at least one item for bulk edit.", "error");
    render();
    return;
  }

  const hasSourceCategories = state.bulkEdit.draft.sourceCategories.length > 0;
  const hasRoom = Boolean(normalizeLabel(state.bulkEdit.draft.room));
  const rawInterval = normalizeLabel(state.bulkEdit.draft.checkIntervalDays);
  const hasInterval = rawInterval.length > 0;
  if (!hasSourceCategories && !hasRoom && !hasInterval) {
    showToast("Pick at least one bulk change before applying.", "error");
    render();
    return;
  }

  let nextCheckIntervalDays = 0;
  if (hasInterval) {
    if (!/^\d+$/.test(rawInterval)) {
      showToast("Check interval must be a whole number.", "error");
      render();
      return;
    }
    nextCheckIntervalDays = Math.max(1, clampQuantity(rawInterval));
  }

  const selectedIdSet = new Set(selectedIds);
  const sourceCategories = hasSourceCategories
    ? normalizeSourceCategories(state.bulkEdit.draft.sourceCategories)
    : [];
  const room = hasRoom ? normalizeRoom(state.bulkEdit.draft.room) : "";
  let updatedCount = 0;
  state.items = state.items.map((item) => {
    if (!selectedIdSet.has(item.id)) {
      return item;
    }

    const nextItem = {
      ...item,
      ...(hasSourceCategories ? { sourceCategories } : {}),
      ...(hasRoom ? { room } : {}),
      ...(hasInterval ? { checkIntervalDays: nextCheckIntervalDays } : {}),
    };
    const changed =
      (hasSourceCategories &&
        (item.sourceCategories.length !== nextItem.sourceCategories.length ||
          item.sourceCategories.some((sourceCategory, index) => {
            return !labelsEqual(sourceCategory, nextItem.sourceCategories[index]);
          }))) ||
      (hasRoom && !labelsEqual(item.room, nextItem.room)) ||
      (hasInterval && item.checkIntervalDays !== nextItem.checkIntervalDays);
    if (changed) {
      updatedCount += 1;
    }
    return nextItem;
  });

  if (updatedCount === 0) {
    showToast("Selected items already match those values.", "error");
    render();
    return;
  }

  const changedParts = [];
  if (hasSourceCategories) {
    changedParts.push("source categories");
  }
  if (hasRoom) {
    changedParts.push("room");
  }
  if (hasInterval) {
    changedParts.push("check interval");
  }

  const itemNoun = updatedCount === 1 ? "item" : "items";
  showToast(`Updated ${updatedCount} ${itemNoun}: ${changedParts.join(", ")}.`, "success");
  setSettingsNotice("", "");
  resetBulkEditState();
  persistAndRender({ touchUpdatedAt: true });
}

function setAllStatusFilter(value) {
  const nextStatus = value === "due" ? "due" : "all";
  if (nextStatus === "due" && getOverdueCheckItems().length === 0) {
    state.filters.allStatus = "all";
    render();
    return;
  }

  state.filters.allStatus = nextStatus;
  render();
}

function setAllRoomFilter(value) {
  state.filters.allRoom = normalizeLabel(value);
  render();
}

function setShoppingSourceFilter(value) {
  state.filters.shoppingSourceCategory = normalizeLabel(value);
  render();
}

function confirmAllDueChecks() {
  const overdueItems = getOverdueCheckItems();
  if (overdueItems.length === 0) {
    showToast("No due checks to confirm.", "error");
    render();
    return;
  }

  const overdueIds = new Set(overdueItems.map((item) => item.id));
  const now = new Date().toISOString();
  state.items = state.items.map((item) => {
    if (!overdueIds.has(item.id)) {
      return item;
    }
    return {
      ...item,
      lastCheckedAt: now,
      updatedAt: now,
    };
  });

  if (state.filters.allStatus === "due") {
    state.filters.allStatus = "all";
  }

  const itemNoun = overdueItems.length === 1 ? "item" : "items";
  showToast(`Confirmed ${overdueItems.length} due ${itemNoun}.`, "success");
  setSettingsNotice("", "");
  persistAndRender({ touchUpdatedAt: true });
}

function addSourceCategoryPreset(value) {
  const nextPresets = upsertPresetValue(state.settings.sourceCategoryPresets, value);
  if (nextPresets.length === state.settings.sourceCategoryPresets.length) {
    setSettingsNotice("Source category already exists or is invalid.", "error");
    render();
    return;
  }

  state.settings = {
    ...state.settings,
    sourceCategoryPresets: nextPresets,
  };
  setSettingsNotice("Source category preset added.", "success");
  persistAndRender({ touchUpdatedAt: false });
}

function addRoomPreset(value) {
  const nextPresets = upsertPresetValue(state.settings.roomPresets, value);
  if (nextPresets.length === state.settings.roomPresets.length) {
    setSettingsNotice("Room preset already exists or is invalid.", "error");
    render();
    return;
  }

  state.settings = {
    ...state.settings,
    roomPresets: nextPresets,
  };
  setSettingsNotice("Room preset added.", "success");
  persistAndRender({ touchUpdatedAt: false });
}

function removeSourceCategoryPreset(value) {
  const nextPresets = removePresetValue(state.settings.sourceCategoryPresets, value);
  if (nextPresets.length === state.settings.sourceCategoryPresets.length) {
    return;
  }

  state.settings = {
    ...state.settings,
    sourceCategoryPresets: nextPresets,
  };
  state.items = remapItemsAfterSourceCategoryPresetRemoval(state.items, value);
  if (labelsEqual(state.filters.allSourceCategory, value)) {
    state.filters.allSourceCategory = "";
  }
  if (labelsEqual(state.filters.shoppingSourceCategory, value)) {
    state.filters.shoppingSourceCategory = "";
  }
  setSettingsNotice("Source category preset removed. Affected items moved to Unassigned.", "success");
  persistAndRender({ touchUpdatedAt: false });
}

function removeRoomPreset(value) {
  const nextPresets = removePresetValue(state.settings.roomPresets, value);
  if (nextPresets.length === state.settings.roomPresets.length) {
    return;
  }

  state.settings = {
    ...state.settings,
    roomPresets: nextPresets,
  };
  state.items = remapItemsAfterRoomPresetRemoval(state.items, value);
  if (labelsEqual(state.filters.allRoom, value)) {
    state.filters.allRoom = "";
  }
  setSettingsNotice("Room preset removed. Affected items moved to Unassigned.", "success");
  persistAndRender({ touchUpdatedAt: false });
}

function setShoppingBuyQuantity(itemId, nextBuyQuantity) {
  const item = state.items.find((entry) => entry.id === itemId);
  if (!item || !isLowStock(item)) {
    return;
  }

  const neededQuantity = getNeededQuantity(item);
  const buyQuantityByItemId = {
    ...state.shopping.buyQuantityByItemId,
  };
  const normalizedBuyQuantity = Math.min(
    clampQuantity(nextBuyQuantity),
    neededQuantity
  );

  if (normalizedBuyQuantity > 0) {
    buyQuantityByItemId[itemId] = normalizedBuyQuantity;
  } else {
    delete buyQuantityByItemId[itemId];
  }

  state.shopping = { buyQuantityByItemId };
  persistAndRender();
}

function stepShoppingBuyQuantity(itemId, step) {
  const increment = Number.parseInt(step, 10);
  if (Number.isNaN(increment)) {
    return;
  }

  const currentQuantity = clampQuantity(state.shopping.buyQuantityByItemId[itemId]);
  setShoppingBuyQuantity(itemId, currentQuantity + increment);
}

function commitShoppingBuyFromInput(input, itemId) {
  const item = state.items.find((entry) => entry.id === itemId);
  if (!item || !isLowStock(item)) {
    return;
  }

  const previous = input.dataset.previousValue;
  const restoreBuyQuantity = () => {
    if (previous && /^\d+$/.test(previous)) {
      setShoppingBuyQuantity(itemId, previous);
      return;
    }
    setShoppingBuyQuantity(itemId, 0);
  };

  const raw = input.value.trim();
  if (!/^\d+$/.test(raw)) {
    restoreBuyQuantity();
    return;
  }

  setShoppingBuyQuantity(itemId, raw);
}

function applyPurchasedItems() {
  const buyQuantityByItemId = getPrunedBuyQuantityByItemId(
    state.items,
    state.shopping.buyQuantityByItemId
  );
  const plannedEntries = Object.entries(buyQuantityByItemId);
  if (plannedEntries.length === 0) {
    return;
  }

  const plannedMap = new Map(plannedEntries);
  const now = new Date().toISOString();
  let appliedItemCount = 0;
  let appliedUnitCount = 0;
  state.items = state.items.map((item) => {
    const plannedBuyQuantity = plannedMap.get(item.id);
    if (!plannedBuyQuantity) {
      return item;
    }

    const neededQuantity = getNeededQuantity(item);
    const appliedQuantity = Math.min(plannedBuyQuantity, neededQuantity);
    if (appliedQuantity <= 0) {
      return item;
    }

    appliedItemCount += 1;
    appliedUnitCount += appliedQuantity;
    return {
      ...item,
      quantity: item.quantity + appliedQuantity,
      updatedAt: now,
    };
  });

  state.shopping = { buyQuantityByItemId: {} };

  if (appliedItemCount === 0) {
    persistAndRender();
    return;
  }

  const itemNoun = appliedItemCount === 1 ? "item" : "items";
  const unitNoun = appliedUnitCount === 1 ? "unit" : "units";
  showToast(
    `Applied ${appliedUnitCount} ${unitNoun} across ${appliedItemCount} ${itemNoun}.`,
    "success"
  );
  setSettingsNotice("", "");
  persistAndRender({ touchUpdatedAt: true });
}

async function copyShoppingList() {
  const shareEntries = getShoppingShareEntries();
  if (shareEntries.length === 0) {
    showToast("No shopping items to copy.", "error");
    render();
    return;
  }

  const copied = await copyTextToClipboard(buildShoppingListText(shareEntries));
  if (!copied) {
    showToast("Could not copy shopping list.", "error");
    render();
    return;
  }

  showToast("Shopping list copied.", "success");
  render();
}

async function shareShoppingList() {
  const shareEntries = getShoppingShareEntries();
  if (shareEntries.length === 0) {
    showToast("No shopping items to share.", "error");
    render();
    return;
  }

  const text = buildShoppingListText(shareEntries);
  if (SUPPORTS_WEB_SHARE) {
    try {
      await navigator.share({
        title: "Shopping List",
        text,
      });
      showToast("Shopping list shared.", "success");
      render();
      return;
    } catch (error) {
      if (isAbortError(error)) {
        return;
      }
      // Fall through and try copy as fallback.
    }
  }

  const copied = await copyTextToClipboard(text);
  if (!copied) {
    showToast("Share unavailable and copy failed.", "error");
    render();
    return;
  }

  showToast("Share unavailable. Shopping list copied instead.", "success");
  render();
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
      sourceCategories: input.sourceCategories,
      room: input.room,
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
    sourceCategories: [UNASSIGNED_PRESET],
    room: UNASSIGNED_PRESET,
    category: "",
  });

  if (!result.ok) {
    showToast(result.error, "error");
    render();
    return;
  }

  quickAddForm.reset();
  showToast(`Added ${result.name}.`, "success");
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
  setBulkSelection(
    state.bulkEdit.selectedItemIds.filter((selectedItemId) => selectedItemId !== itemId)
  );
  if (state.editingItemId === itemId) {
    state.editingItemId = "";
  }
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
  showToast(`Restored ${item.name}.`, "success");
  persistAndRender();
}

function exportBackup() {
  const serialized = serializeState({
    items: state.items,
    settings: state.settings,
    shopping: state.shopping,
    updatedAt: state.updatedAt,
    revision: state.revision,
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
    state.editingItemId = "";
    resetBulkEditState();
    state.items = imported.items;
    state.settings = imported.settings;
    state.shopping = imported.shopping;
    state.updatedAt = imported.updatedAt || new Date().toISOString();
    state.revision = Number.isInteger(imported.revision) ? imported.revision : 0;
    setSettingsNotice("Backup imported successfully.", "success");
    persistAndRender({ touchUpdatedAt: false });
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
  state.editingItemId = "";
  resetBulkEditState();
  state.items = defaults.items;
  state.settings = defaults.settings;
  state.shopping = defaults.shopping;
  state.updatedAt = defaults.updatedAt || new Date().toISOString();
  state.revision = defaults.revision;
  state.query = "";
  state.filters = {
    allSourceCategory: "",
    allRoom: "",
    allStatus: "all",
    shoppingSourceCategory: "",
  };
  searchInput.value = "";
  setSettingsNotice("Local data reset to starter defaults.", "success");
  persistAndRender({ touchUpdatedAt: false });
}

function parseStorageSnapshot(rawValue) {
  if (typeof rawValue !== "string") {
    return null;
  }

  try {
    return normalizeState(JSON.parse(rawValue));
  } catch {
    return null;
  }
}

function handleStorageStateChange(event) {
  if (!event || event.key !== STORAGE_KEY) {
    return;
  }

  if (event.storageArea && event.storageArea !== window.localStorage) {
    return;
  }

  const incomingSnapshot = parseStorageSnapshot(event.newValue);
  if (!incomingSnapshot) {
    return;
  }

  if (incomingSnapshot.revision <= state.revision) {
    return;
  }

  adoptSnapshot(incomingSnapshot, { persist: false });
  queueAutoSyncToFile();
  render();
}

bindAppEvents({
  dom,
  state,
  validViews: VALID_VIEWS,
  clampQuantity,
  render,
  persistAndRender,
  setSettingsNotice,
  addSourceCategoryPreset,
  addRoomPreset,
  removeSourceCategoryPreset,
  removeRoomPreset,
  addItemFromQuickForm,
  exportBackup,
  importBackupFile,
  resetLocalData,
  linkSyncFile,
  syncWithLinkedFile,
  clearSyncLink,
  decodeItemId,
  setQuantity,
  confirmItemCheck,
  deleteItemById,
  startEditingItemById,
  cancelEditingItem,
  saveItemEdits,
  setShoppingBuyQuantity,
  stepShoppingBuyQuantity,
  commitShoppingBuyFromInput,
  applyPurchasedItems,
  copyShoppingList,
  shareShoppingList,
  commitQuantityFromInput,
  undoDelete,
  onStorageStateChange: handleStorageStateChange,
  updateViewportOffsetBottom,
  setAllSourceFilter,
  setBulkEditMode,
  toggleBulkItemSelection,
  clearBulkSelection,
  setBulkDraftRoom,
  setBulkDraftCheckInterval,
  toggleBulkDraftSourceCategory,
  applyBulkEdits,
  setAllStatusFilter,
  setAllRoomFilter,
  setShoppingSourceFilter,
  confirmAllDueChecks,
});

updateViewportOffsetBottom();
render();
void restoreSyncLinkFromStorage();
