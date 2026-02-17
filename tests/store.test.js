import test from "node:test";
import assert from "node:assert/strict";

import {
  LEGACY_STORAGE_KEY,
  STORAGE_KEY,
  createDefaultState,
  deserializeState,
  loadState,
  normalizeState,
  removeItem,
  saveState,
  serializeState,
  updateItemQuantity,
  upsertItem,
} from "../src/store.js";

function createMemoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));

  return {
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      map.set(key, String(value));
    },
    removeItem(key) {
      map.delete(key);
    },
  };
}

test("createDefaultState returns starter items and default settings", () => {
  const state = createDefaultState();
  assert.equal(Array.isArray(state.items), true);
  assert.ok(state.items.length > 0);
  assert.equal(state.settings.defaultLowThreshold, 1);
});

test("loadState supports legacy array storage", () => {
  const legacyItems = [
    { id: "legacy-1", name: "Soap", quantity: 1, lowThreshold: 2 },
  ];
  const storage = createMemoryStorage({
    [LEGACY_STORAGE_KEY]: JSON.stringify(legacyItems),
  });

  const state = loadState(storage);
  assert.equal(state.items.length, 1);
  assert.equal(state.items[0].name, "Soap");
  assert.equal(state.settings.defaultLowThreshold, 1);
});

test("saveState writes current schema and clears legacy key", () => {
  const storage = createMemoryStorage({
    [LEGACY_STORAGE_KEY]: "[]",
  });

  const state = {
    items: [{ id: "a", name: "Trash Bags", quantity: 4, lowThreshold: 2 }],
    settings: { defaultLowThreshold: 3 },
  };

  saveState(state, storage);
  const reloaded = loadState(storage);

  assert.equal(reloaded.items.length, 1);
  assert.equal(reloaded.items[0].name, "Trash Bags");
  assert.equal(reloaded.settings.defaultLowThreshold, 3);
  assert.equal(storage.getItem(LEGACY_STORAGE_KEY), null);
  assert.ok(storage.getItem(STORAGE_KEY));
});

test("upsertItem uses default threshold when omitted", () => {
  const initial = [];
  const updated = upsertItem(
    initial,
    { name: "Sponges", quantity: 2, category: "Kitchen" },
    { defaultLowThreshold: 5 }
  );

  assert.equal(updated.length, 1);
  assert.equal(updated[0].lowThreshold, 5);
});

test("removeItem deletes matching id", () => {
  const items = [
    { id: "a", name: "Soap", quantity: 1, lowThreshold: 1 },
    { id: "b", name: "Towels", quantity: 2, lowThreshold: 1 },
  ];

  const next = removeItem(items, "a");
  assert.equal(next.length, 1);
  assert.equal(next[0].id, "b");
});

test("updateItemQuantity changes values and clamps at zero", () => {
  const items = [
    { id: "a", name: "Soap", quantity: 1, lowThreshold: 1, updatedAt: "old" },
  ];

  const lowered = updateItemQuantity(items, "a", -3);
  assert.equal(lowered[0].quantity, 0);
  assert.notEqual(lowered[0].updatedAt, "old");

  const raised = updateItemQuantity(lowered, "a", 7);
  assert.equal(raised[0].quantity, 7);
});

test("serializeState and deserializeState round-trip valid backups", () => {
  const state = normalizeState({
    items: [{ id: "x", name: "Toothpaste", quantity: 2, lowThreshold: 1 }],
    settings: { defaultLowThreshold: 2 },
  });

  const text = serializeState(state);
  const parsed = deserializeState(text);

  assert.equal(parsed.items.length, 1);
  assert.equal(parsed.items[0].name, "Toothpaste");
  assert.equal(parsed.settings.defaultLowThreshold, 2);
});

test("deserializeState rejects malformed backup payloads", () => {
  assert.throws(
    () => deserializeState("{not-json}"),
    /Backup file is not valid JSON/
  );

  assert.throws(
    () => deserializeState(JSON.stringify({ foo: "bar" })),
    /items array/
  );
});
