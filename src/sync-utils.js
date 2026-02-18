import { normalizeState } from "./store.js";

const SYNC_SCHEMA_VERSION = 1;
const SYNC_STRATEGY = "last-write-wins-full";
const SYNC_HANDLE_DB_NAME = "reorder-or-buy-again.sync";
const SYNC_HANDLE_STORE_NAME = "handles";
const SYNC_HANDLE_RECORD_KEY = "active";

export const AUTO_SYNC_DELAY_MS = 900;

export const SYNC_STATUS = {
  OFFLINE: "offline",
  SYNCING: "syncing",
  SYNCED: "synced",
  CONFLICT: "conflict",
};

export const STATUS_LABELS = {
  [SYNC_STATUS.OFFLINE]: "Offline",
  [SYNC_STATUS.SYNCING]: "Syncing",
  [SYNC_STATUS.SYNCED]: "Synced",
  [SYNC_STATUS.CONFLICT]: "Conflict",
};

export const supportsOfflineFileSync =
  typeof window.showSaveFilePicker === "function";

export const supportsPersistentSyncHandleStore =
  typeof window.indexedDB !== "undefined";

export function isAbortError(error) {
  return Boolean(
    error && typeof error === "object" && error.name === "AbortError"
  );
}

export function isPermissionError(error) {
  return Boolean(
    error && typeof error === "object" && error.name === "NotAllowedError"
  );
}

function openSyncHandleDb() {
  return new Promise((resolve, reject) => {
    if (!supportsPersistentSyncHandleStore) {
      resolve(null);
      return;
    }

    const request = window.indexedDB.open(SYNC_HANDLE_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SYNC_HANDLE_STORE_NAME)) {
        db.createObjectStore(SYNC_HANDLE_STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error || new Error("Failed to open sync handle storage."));
  });
}

export async function loadStoredSyncHandle() {
  const db = await openSyncHandleDb();
  if (!db) {
    return null;
  }

  try {
    const handle = await new Promise((resolve, reject) => {
      const transaction = db.transaction(SYNC_HANDLE_STORE_NAME, "readonly");
      const request = transaction
        .objectStore(SYNC_HANDLE_STORE_NAME)
        .get(SYNC_HANDLE_RECORD_KEY);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () =>
        reject(request.error || new Error("Failed to load sync handle."));
    });

    return handle;
  } finally {
    db.close();
  }
}

export async function saveSyncHandleToStorage(handle) {
  const db = await openSyncHandleDb();
  if (!db) {
    return;
  }

  try {
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(SYNC_HANDLE_STORE_NAME, "readwrite");
      transaction.objectStore(SYNC_HANDLE_STORE_NAME).put(
        handle,
        SYNC_HANDLE_RECORD_KEY
      );
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(transaction.error || new Error("Failed to persist sync handle."));
    });
  } finally {
    db.close();
  }
}

export async function clearStoredSyncHandle() {
  const db = await openSyncHandleDb();
  if (!db) {
    return;
  }

  try {
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(SYNC_HANDLE_STORE_NAME, "readwrite");
      transaction.objectStore(SYNC_HANDLE_STORE_NAME).delete(SYNC_HANDLE_RECORD_KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(transaction.error || new Error("Failed to clear sync handle."));
    });
  } finally {
    db.close();
  }
}

export async function querySyncHandlePermission(handle) {
  if (!handle || typeof handle.queryPermission !== "function") {
    return "granted";
  }

  try {
    return await handle.queryPermission({ mode: "readwrite" });
  } catch {
    return "prompt";
  }
}

export function parseTimestamp(value) {
  const parsed = Date.parse(String(value || ""));
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function formatSyncTime(value) {
  const timestamp = parseTimestamp(value);
  if (!timestamp) {
    return "";
  }

  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function snapshotHash(snapshot) {
  return JSON.stringify({
    items: snapshot.items,
    settings: snapshot.settings,
    shopping: snapshot.shopping,
  });
}

export function buildSyncFilePayload(snapshot) {
  return JSON.stringify(
    {
      schemaVersion: SYNC_SCHEMA_VERSION,
      strategy: SYNC_STRATEGY,
      updatedAt: snapshot.updatedAt,
      state: {
        items: snapshot.items,
        settings: snapshot.settings,
        shopping: snapshot.shopping,
        updatedAt: snapshot.updatedAt,
      },
    },
    null,
    2
  );
}

export function parseSyncFilePayload(rawText) {
  const text = String(rawText || "").trim();
  if (!text) {
    return null;
  }

  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Sync file is not valid JSON.");
  }

  if (
    parsed &&
    typeof parsed === "object" &&
    parsed.state &&
    Array.isArray(parsed.state.items)
  ) {
    return normalizeState(parsed.state);
  }

  if (parsed && typeof parsed === "object" && Array.isArray(parsed.items)) {
    return normalizeState(parsed);
  }

  throw new Error("Sync file must contain a valid inventory snapshot.");
}

export function mergeSnapshotsByUpdatedAt(localSnapshot, remoteSnapshot) {
  const localMap = new Map(localSnapshot.items.map((item) => [item.id, item]));
  const remoteMap = new Map(remoteSnapshot.items.map((item) => [item.id, item]));
  const mergedItems = [];
  const allIds = new Set([...localMap.keys(), ...remoteMap.keys()]);

  for (const id of allIds) {
    const localItem = localMap.get(id);
    const remoteItem = remoteMap.get(id);

    if (!localItem) {
      mergedItems.push(remoteItem);
      continue;
    }

    if (!remoteItem) {
      mergedItems.push(localItem);
      continue;
    }

    const localTime = parseTimestamp(localItem.updatedAt);
    const remoteTime = parseTimestamp(remoteItem.updatedAt);
    mergedItems.push(localTime >= remoteTime ? localItem : remoteItem);
  }

  const localSnapshotTime = parseTimestamp(localSnapshot.updatedAt);
  const remoteSnapshotTime = parseTimestamp(remoteSnapshot.updatedAt);
  const mergedSettings =
    localSnapshotTime >= remoteSnapshotTime
      ? localSnapshot.settings
      : remoteSnapshot.settings;
  const mergedShopping =
    localSnapshotTime >= remoteSnapshotTime
      ? localSnapshot.shopping
      : remoteSnapshot.shopping;

  return normalizeState({
    items: mergedItems,
    settings: mergedSettings,
    shopping: mergedShopping,
    updatedAt: new Date().toISOString(),
  });
}
