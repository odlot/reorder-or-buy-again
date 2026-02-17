import { clampQuantity } from "./logic.js";

export const STORAGE_KEY = "reorder-or-buy-again.state";
export const DEFAULT_SETTINGS = Object.freeze({
  defaultLowThreshold: 1,
});

const STARTER_ITEMS = [
  {
    id: "dish-soap",
    name: "Dish Soap",
    quantity: 1,
    lowThreshold: 1,
    category: "Kitchen",
    updatedAt: new Date().toISOString(),
  },
  {
    id: "toothpaste",
    name: "Toothpaste",
    quantity: 2,
    lowThreshold: 1,
    category: "Bathroom",
    updatedAt: new Date().toISOString(),
  },
  {
    id: "trash-bags",
    name: "Trash Bags",
    quantity: 6,
    lowThreshold: 3,
    category: "Kitchen",
    updatedAt: new Date().toISOString(),
  },
  {
    id: "paper-towels",
    name: "Paper Towels",
    quantity: 2,
    lowThreshold: 2,
    category: "Kitchen",
    updatedAt: new Date().toISOString(),
  },
  {
    id: "laundry-detergent",
    name: "Laundry Detergent",
    quantity: 1,
    lowThreshold: 1,
    category: "Laundry",
    updatedAt: new Date().toISOString(),
  },
];

function createId() {
  if (
    globalThis.crypto &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    return globalThis.crypto.randomUUID();
  }

  return `item-${Date.now()}-${Math.floor(Math.random() * 1_000_000_000)}`;
}

function cloneStarterItems() {
  return STARTER_ITEMS.map((item) => ({ ...item }));
}

function createDefaultSettings() {
  return {
    defaultLowThreshold: DEFAULT_SETTINGS.defaultLowThreshold,
  };
}

export function createDefaultState() {
  const now = new Date().toISOString();
  return {
    items: cloneStarterItems(),
    settings: createDefaultSettings(),
    updatedAt: now,
  };
}

function normalizeSettings(settings) {
  const source = settings && typeof settings === "object" ? settings : {};

  return {
    defaultLowThreshold: clampQuantity(
      source.defaultLowThreshold ?? DEFAULT_SETTINGS.defaultLowThreshold
    ),
  };
}

export function normalizeItem(item, settings = DEFAULT_SETTINGS) {
  const source = item && typeof item === "object" ? item : {};
  const name = String(source.name || "").trim();
  if (!name) {
    return null;
  }

  const fallbackThreshold = clampQuantity(
    settings.defaultLowThreshold ?? DEFAULT_SETTINGS.defaultLowThreshold
  );

  const hasExplicitThreshold =
    source.lowThreshold !== undefined &&
    source.lowThreshold !== null &&
    source.lowThreshold !== "";

  return {
    id: String(source.id || createId()),
    name,
    quantity: clampQuantity(source.quantity),
    lowThreshold: hasExplicitThreshold
      ? clampQuantity(source.lowThreshold)
      : fallbackThreshold,
    category: String(source.category || "").trim(),
    updatedAt: String(source.updatedAt || new Date().toISOString()),
  };
}

function dedupeItemsById(items) {
  const seen = new Set();
  const deduped = [];

  for (const item of items) {
    if (seen.has(item.id)) {
      continue;
    }

    seen.add(item.id);
    deduped.push(item);
  }

  return deduped;
}

export function normalizeState(candidateState) {
  if (!candidateState || typeof candidateState !== "object") {
    return createDefaultState();
  }

  if (!Array.isArray(candidateState.items)) {
    return createDefaultState();
  }

  const settings = normalizeSettings(candidateState.settings);
  const items = dedupeItemsById(
    candidateState.items
      .map((item) => normalizeItem(item, settings))
      .filter(Boolean)
  );
  const updatedAt = String(candidateState.updatedAt || new Date().toISOString());

  return { items, settings, updatedAt };
}

function parseJson(raw) {
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function loadState(storage = globalThis.localStorage) {
  if (!storage || typeof storage.getItem !== "function") {
    return createDefaultState();
  }

  const current = parseJson(storage.getItem(STORAGE_KEY));
  if (current === null) {
    return createDefaultState();
  }

  return normalizeState(current);
}

export function saveState(state, storage = globalThis.localStorage) {
  if (!storage || typeof storage.setItem !== "function") {
    return;
  }

  const normalized = normalizeState(state);
  const snapshot = {
    items: normalized.items,
    settings: normalized.settings,
    updatedAt: String(normalized.updatedAt || new Date().toISOString()),
  };

  storage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
}

export function updateItemQuantity(items, itemId, nextQuantity) {
  const quantity = clampQuantity(nextQuantity);
  const now = new Date().toISOString();

  return items.map((item) =>
    item.id === itemId ? { ...item, quantity, updatedAt: now } : item
  );
}

export function upsertItem(items, itemInput, settings = DEFAULT_SETTINGS) {
  const source = itemInput && typeof itemInput === "object" ? itemInput : {};
  const hasExplicitThreshold =
    source.lowThreshold !== undefined &&
    source.lowThreshold !== null &&
    source.lowThreshold !== "";

  const normalized = normalizeItem(
    {
      ...source,
      lowThreshold: hasExplicitThreshold
        ? source.lowThreshold
        : settings.defaultLowThreshold,
    },
    settings
  );

  if (!normalized) {
    return items;
  }

  const exists = items.some((item) => item.id === normalized.id);
  if (!exists) {
    return [...items, normalized];
  }

  return items.map((item) =>
    item.id === normalized.id ? { ...item, ...normalized } : item
  );
}

export function removeItem(items, itemId) {
  return items.filter((item) => item.id !== itemId);
}

export function serializeState(state) {
  const normalized = normalizeState(state);

  return JSON.stringify(
    {
      items: normalized.items,
      settings: normalized.settings,
      updatedAt: normalized.updatedAt,
      exportedAt: new Date().toISOString(),
    },
    null,
    2
  );
}

export function deserializeState(rawText) {
  let parsed = null;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error("Backup file is not valid JSON.");
  }

  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.items)) {
    throw new Error("Backup file must contain an items array.");
  }

  return normalizeState(parsed);
}
