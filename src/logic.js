export function clampQuantity(value) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    return 0;
  }

  return Math.max(0, parsed);
}

const DAY_MS = 24 * 60 * 60 * 1000;

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

export function selectVisibleItems(items, query, lowStockOnly = false) {
  const sourceItems = lowStockOnly ? items.filter(isLowStock) : items;

  return sourceItems
    .filter((item) => matchesSearch(item, query))
    .sort(compareByUrgencyThenName);
}

export function parseTimestamp(value) {
  const parsed = Date.parse(String(value || ""));
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function getCheckIntervalDays(item, fallbackDays = 14) {
  const value = clampQuantity(item?.checkIntervalDays);
  if (value > 0) {
    return value;
  }

  const fallback = clampQuantity(fallbackDays);
  return fallback > 0 ? fallback : 1;
}

export function getCheckBaselineTimestamp(item) {
  if (!item || typeof item !== "object") {
    return 0;
  }

  return parseTimestamp(item.lastCheckedAt) || parseTimestamp(item.updatedAt);
}

export function getNextCheckTimestamp(item, fallbackDays = 14) {
  const baseline = getCheckBaselineTimestamp(item);
  if (!baseline) {
    return 0;
  }

  return baseline + getCheckIntervalDays(item, fallbackDays) * DAY_MS;
}

export function isCheckOverdue(item, nowTimestamp = Date.now(), fallbackDays = 14) {
  const nextCheckTimestamp = getNextCheckTimestamp(item, fallbackDays);
  if (!nextCheckTimestamp) {
    return false;
  }

  return nowTimestamp >= nextCheckTimestamp;
}
