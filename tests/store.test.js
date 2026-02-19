import test from "node:test";
import assert from "node:assert/strict";

import {
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
  assert.equal(state.settings.themeMode, "light");
  assert.deepEqual(state.shopping, { buyQuantityByItemId: {} });
  assert.equal(state.revision, 0);
  assert.ok(state.items.every((item) => item.targetQuantity >= item.lowThreshold + 1));
});

test("loadState falls back to defaults for invalid stored payloads", () => {
  const storage = createMemoryStorage({
    [STORAGE_KEY]: JSON.stringify({ foo: "bar" }),
  });

  const state = loadState(storage);
  assert.ok(state.items.length > 0);
  assert.equal(state.settings.defaultLowThreshold, 1);
  assert.equal(state.settings.themeMode, "light");
  assert.deepEqual(state.shopping, { buyQuantityByItemId: {} });
  assert.equal(state.revision, 0);
});

test("saveState writes current schema and round-trips through loadState", () => {
  const storage = createMemoryStorage();
  const state = {
    items: [
      {
        id: "a",
        name: "Trash Bags",
        quantity: 4,
        lowThreshold: 2,
        targetQuantity: 7,
      },
    ],
    settings: { defaultLowThreshold: 3, themeMode: "dark" },
    shopping: { buyQuantityByItemId: { a: 3 } },
  };

  saveState(state, storage);
  const reloaded = loadState(storage);

  assert.equal(reloaded.items.length, 1);
  assert.equal(reloaded.items[0].name, "Trash Bags");
  assert.equal(reloaded.settings.defaultLowThreshold, 3);
  assert.equal(reloaded.settings.themeMode, "dark");
  assert.equal(reloaded.items[0].targetQuantity, 7);
  assert.deepEqual(reloaded.shopping, { buyQuantityByItemId: { a: 3 } });
  assert.equal(reloaded.revision, 1);
  assert.ok(storage.getItem(STORAGE_KEY));
});

test("saveState increments revision with storage snapshot guard", () => {
  const storage = createMemoryStorage();
  const first = saveState(
    {
      items: [{ id: "a", name: "Soap", quantity: 1, lowThreshold: 1 }],
      settings: { defaultLowThreshold: 1 },
      revision: 0,
    },
    storage
  );
  assert.equal(first.revision, 1);

  const second = saveState(
    {
      items: [{ id: "a", name: "Soap", quantity: 2, lowThreshold: 1 }],
      settings: { defaultLowThreshold: 1 },
      revision: 0,
    },
    storage
  );
  assert.equal(second.revision, 2);
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
  assert.equal(updated[0].targetQuantity, 6);
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
    items: [
      {
        id: "x",
        name: "Toothpaste",
        quantity: 2,
        lowThreshold: 1,
        targetQuantity: 4,
      },
    ],
    settings: { defaultLowThreshold: 2, themeMode: "dark" },
    shopping: { buyQuantityByItemId: { x: 2 } },
  });

  const text = serializeState(state);
  const parsed = deserializeState(text);

  assert.equal(parsed.items.length, 1);
  assert.equal(parsed.items[0].name, "Toothpaste");
  assert.equal(parsed.settings.defaultLowThreshold, 2);
  assert.equal(parsed.settings.themeMode, "dark");
  assert.equal(parsed.items[0].targetQuantity, 4);
  assert.deepEqual(parsed.shopping, { buyQuantityByItemId: { x: 2 } });
});

test("normalizeState falls back to light theme for invalid theme values", () => {
  const state = normalizeState({
    items: [],
    settings: { defaultLowThreshold: 1, themeMode: "nope" },
  });

  assert.equal(state.settings.themeMode, "light");
});

test("normalizeState keeps only positive buy quantities", () => {
  const state = normalizeState({
    items: [
      {
        id: "soap",
        name: "Soap",
        quantity: 1,
        lowThreshold: 1,
        targetQuantity: 3,
      },
    ],
    shopping: {
      buyQuantityByItemId: {
        soap: 2,
        towels: 0,
        "": 3,
      },
    },
  });

  assert.deepEqual(state.shopping, {
    buyQuantityByItemId: {
      soap: 2,
    },
  });
});

test("normalizeState migrates legacy purchased flags to buy quantity map", () => {
  const state = normalizeState({
    items: [{ id: "soap", name: "Soap", quantity: 1, lowThreshold: 1 }],
    shopping: {
      purchasedByItemId: {
        soap: true,
      },
    },
  });

  assert.deepEqual(state.shopping, {
    buyQuantityByItemId: {
      soap: 1,
    },
  });
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
