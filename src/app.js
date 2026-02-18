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
  RESTOCK: "restock",
  SETTINGS: "settings",
};
const DELETE_UNDO_MS = 8000;
const TOAST_AUTO_HIDE_MS = 2600;

const VALID_VIEWS = new Set(Object.values(VIEWS));

const {
  searchInput,
  quickAddForm,
  quickAddNameInput,
  syncStatusChip,
  listToolbar,
  inventoryView,
  settingsView,
  itemList,
  summaryLine,
  restockAllButton,
  emptyState,
  navTabs,
  restockBadge,
  undoToast,
  undoMessage,
  undoButton,
  defaultThresholdInput,
  syncStatusDetail,
  syncLastSynced,
  linkSyncButton,
  syncNowButton,
  clearSyncLinkButton,
  settingsMessage,
} = dom;

const initialState = loadState();
const state = {
  items: initialState.items,
  settings: initialState.settings,
  updatedAt: initialState.updatedAt || new Date().toISOString(),
  query: "",
  activeView: VIEWS.ALL,
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
    updatedAt: state.updatedAt || new Date().toISOString(),
  };
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

function adoptSnapshot(snapshot) {
  clearPendingDelete();
  state.items = snapshot.items;
  state.settings = snapshot.settings;
  state.updatedAt = snapshot.updatedAt || new Date().toISOString();
  saveState({
    items: state.items,
    settings: state.settings,
    updatedAt: state.updatedAt,
  });
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
  const canBulkRestock =
    state.activeView === VIEWS.RESTOCK && visibleItems.length > 0;
  restockAllButton.classList.toggle("hidden", !canBulkRestock);

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

  renderInventoryPanel(visibleItems, lowCount);
}

function persistAndRender({ touchUpdatedAt = true, queueSync = true } = {}) {
  if (touchUpdatedAt) {
    state.updatedAt = new Date().toISOString();
  }

  saveState({
    items: state.items,
    settings: state.settings,
    updatedAt: state.updatedAt,
  });

  if (queueSync) {
    queueAutoSyncToFile();
  }
  render();
}

function setQuantity(itemId, nextQuantity) {
  state.items = updateItemQuantity(state.items, itemId, nextQuantity);
  persistAndRender();
}

function getRestockTargetQuantity(item) {
  return Math.max(item.quantity, item.lowThreshold + 1);
}

function restockItemById(itemId) {
  const item = state.items.find((entry) => entry.id === itemId);
  if (!item) {
    return;
  }

  const targetQuantity = getRestockTargetQuantity(item);
  if (targetQuantity === item.quantity) {
    return;
  }

  state.items = updateItemQuantity(state.items, itemId, targetQuantity);
  showToast(`Restocked ${item.name}.`, "success");
  setSettingsNotice("", "");
  persistAndRender();
}

function restockVisibleLowItems() {
  const visibleLowIds = new Set(
    getVisibleItems().filter(isLowStock).map((item) => item.id)
  );
  if (visibleLowIds.size === 0) {
    return;
  }

  const now = new Date().toISOString();
  let restockedCount = 0;
  state.items = state.items.map((item) => {
    if (!visibleLowIds.has(item.id)) {
      return item;
    }

    const targetQuantity = getRestockTargetQuantity(item);
    if (targetQuantity === item.quantity) {
      return item;
    }

    restockedCount += 1;
    return {
      ...item,
      quantity: targetQuantity,
      updatedAt: now,
    };
  });

  if (restockedCount === 0) {
    return;
  }

  const noun = restockedCount === 1 ? "item" : "items";
  showToast(`Restocked ${restockedCount} ${noun}.`, "success");
  setSettingsNotice("", "");
  persistAndRender({ touchUpdatedAt: true });
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
    state.updatedAt = imported.updatedAt || new Date().toISOString();
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
  state.items = defaults.items;
  state.settings = defaults.settings;
  state.updatedAt = defaults.updatedAt || new Date().toISOString();
  state.query = "";
  searchInput.value = "";
  setSettingsNotice("Local data reset to starter defaults.", "success");
  persistAndRender({ touchUpdatedAt: false });
}

bindAppEvents({
  dom,
  state,
  validViews: VALID_VIEWS,
  clampQuantity,
  render,
  persistAndRender,
  setSettingsNotice,
  addItemFromQuickForm,
  exportBackup,
  importBackupFile,
  resetLocalData,
  linkSyncFile,
  syncWithLinkedFile,
  restockVisibleLowItems,
  clearSyncLink,
  decodeItemId,
  setQuantity,
  restockItemById,
  deleteItemById,
  commitQuantityFromInput,
  undoDelete,
  updateViewportOffsetBottom,
});

updateViewportOffsetBottom();
render();
void restoreSyncLinkFromStorage();
