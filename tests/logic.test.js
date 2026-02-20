import test from "node:test";
import assert from "node:assert/strict";

import {
  clampQuantity,
  getCheckBaselineTimestamp,
  getCheckIntervalDays,
  getNextCheckTimestamp,
  isCheckOverdue,
  isLowStock,
  matchesSearch,
  parseTimestamp,
  selectVisibleItems,
} from "../src/logic.js";

test("clampQuantity enforces integers and non-negative values", () => {
  assert.equal(clampQuantity(3), 3);
  assert.equal(clampQuantity("4"), 4);
  assert.equal(clampQuantity("-2"), 0);
  assert.equal(clampQuantity("hello"), 0);
});

test("isLowStock compares quantity against low threshold", () => {
  assert.equal(isLowStock({ quantity: 2, lowThreshold: 3 }), true);
  assert.equal(isLowStock({ quantity: 3, lowThreshold: 3 }), true);
  assert.equal(isLowStock({ quantity: 4, lowThreshold: 3 }), false);
});

test("matchesSearch is case-insensitive and trims query", () => {
  const item = { name: "Paper Towels" };

  assert.equal(matchesSearch(item, "paper"), true);
  assert.equal(matchesSearch(item, "  towels "), true);
  assert.equal(matchesSearch(item, "soap"), false);
});

test("selectVisibleItems supports all/low-stock filtering and sorting", () => {
  const items = [
    { id: "a", name: "Toothpaste", quantity: 2, lowThreshold: 1 },
    { id: "b", name: "Dish Soap", quantity: 1, lowThreshold: 1 },
    { id: "c", name: "Batteries", quantity: 0, lowThreshold: 1 },
  ];

  const allNames = selectVisibleItems(items, "", false).map((item) => item.name);
  assert.deepEqual(allNames, ["Batteries", "Dish Soap", "Toothpaste"]);

  const lowStockNames = selectVisibleItems(items, "", true).map(
    (item) => item.name
  );
  assert.deepEqual(lowStockNames, ["Batteries", "Dish Soap"]);

  const filteredLowStock = selectVisibleItems(items, "dish", true).map(
    (item) => item.name
  );
  assert.deepEqual(filteredLowStock, ["Dish Soap"]);
});

test("parseTimestamp returns 0 for invalid dates", () => {
  assert.equal(parseTimestamp("2026-02-20T00:00:00.000Z") > 0, true);
  assert.equal(parseTimestamp("nope"), 0);
  assert.equal(parseTimestamp(""), 0);
});

test("getCheckIntervalDays uses item value and falls back safely", () => {
  assert.equal(getCheckIntervalDays({ checkIntervalDays: 21 }, 14), 21);
  assert.equal(getCheckIntervalDays({ checkIntervalDays: "7" }, 14), 7);
  assert.equal(getCheckIntervalDays({ checkIntervalDays: 0 }, 14), 14);
  assert.equal(getCheckIntervalDays({}, 0), 1);
});

test("getCheckBaselineTimestamp prefers lastCheckedAt then updatedAt", () => {
  const withLastChecked = {
    lastCheckedAt: "2026-02-10T00:00:00.000Z",
    updatedAt: "2026-02-01T00:00:00.000Z",
  };
  const withUpdatedOnly = {
    updatedAt: "2026-02-01T00:00:00.000Z",
  };
  const withInvalidLastChecked = {
    lastCheckedAt: "bad",
    updatedAt: "2026-02-01T00:00:00.000Z",
  };

  assert.equal(
    getCheckBaselineTimestamp(withLastChecked),
    parseTimestamp("2026-02-10T00:00:00.000Z")
  );
  assert.equal(
    getCheckBaselineTimestamp(withUpdatedOnly),
    parseTimestamp("2026-02-01T00:00:00.000Z")
  );
  assert.equal(
    getCheckBaselineTimestamp(withInvalidLastChecked),
    parseTimestamp("2026-02-01T00:00:00.000Z")
  );
  assert.equal(getCheckBaselineTimestamp({}), 0);
});

test("getNextCheckTimestamp and isCheckOverdue compute due status from baseline", () => {
  const baselineIso = "2026-02-01T00:00:00.000Z";
  const item = {
    lastCheckedAt: baselineIso,
    checkIntervalDays: 14,
  };

  const baseline = parseTimestamp(baselineIso);
  const dueTimestamp = baseline + 14 * 24 * 60 * 60 * 1000;
  assert.equal(getNextCheckTimestamp(item, 14), dueTimestamp);
  assert.equal(isCheckOverdue(item, dueTimestamp - 1, 14), false);
  assert.equal(isCheckOverdue(item, dueTimestamp, 14), true);

  const fallbackIntervalItem = {
    updatedAt: baselineIso,
    checkIntervalDays: 0,
  };
  assert.equal(
    getNextCheckTimestamp(fallbackIntervalItem, 10),
    baseline + 10 * 24 * 60 * 60 * 1000
  );
});
