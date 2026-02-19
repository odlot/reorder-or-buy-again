import test from "node:test";
import assert from "node:assert/strict";

import {
  clampQuantity,
  isLowStock,
  matchesSearch,
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
