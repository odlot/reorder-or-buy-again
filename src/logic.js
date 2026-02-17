export function clampQuantity(value) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    return 0;
  }

  return Math.max(0, parsed);
}

export function isLowStock(item) {
  return item.quantity <= item.lowThreshold;
}

export function compareByUrgencyThenName(a, b) {
  const aLow = isLowStock(a);
  const bLow = isLowStock(b);

  if (aLow !== bLow) {
    return aLow ? -1 : 1;
  }

  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}

export function matchesSearch(item, query) {
  return item.name.toLowerCase().includes(query.trim().toLowerCase());
}

export function selectVisibleItems(items, query, restockOnly = false) {
  const sourceItems = restockOnly ? items.filter(isLowStock) : items;

  return sourceItems
    .filter((item) => matchesSearch(item, query))
    .sort(compareByUrgencyThenName);
}
