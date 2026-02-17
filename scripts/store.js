import { clampQuantity } from "./logic.js";

const STORAGE_KEY = "reorder-or-buy-again.items.v1";

const STARTER_ITEMS = [
  {
    id: "dish-soap",
    name: "Dish Soap",
    quantity: 1,
    unit: "bottle",
    lowThreshold: 1,
    category: "Kitchen",
    updatedAt: new Date().toISOString(),
  },
  {
    id: "toothpaste",
    name: "Toothpaste",
    quantity: 2,
    unit: "tube",
    lowThreshold: 1,
    category: "Bathroom",
    updatedAt: new Date().toISOString(),
  },
  {
    id: "trash-bags",
    name: "Trash Bags",
    quantity: 6,
    unit: "bags",
    lowThreshold: 3,
    category: "Kitchen",
    updatedAt: new Date().toISOString(),
  },
  {
    id: "paper-towels",
    name: "Paper Towels",
    quantity: 2,
    unit: "rolls",
    lowThreshold: 2,
    category: "Kitchen",
    updatedAt: new Date().toISOString(),
  },
  {
    id: "laundry-detergent",
    name: "Laundry Detergent",
    quantity: 1,
    unit: "bottle",
    lowThreshold: 1,
    category: "Laundry",
    updatedAt: new Date().toISOString(),
  },
];

function normalizeItem(item) {
  const name = String(item.name || "").trim();
  if (!name) {
    return null;
  }

  return {
    id: String(item.id || crypto.randomUUID()),
    name,
    quantity: clampQuantity(item.quantity),
    unit: String(item.unit || "units").trim() || "units",
    lowThreshold: clampQuantity(item.lowThreshold),
    category: String(item.category || "").trim(),
    updatedAt: String(item.updatedAt || new Date().toISOString()),
  };
}

export function loadItems() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return STARTER_ITEMS.map((item) => ({ ...item }));
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return STARTER_ITEMS.map((item) => ({ ...item }));
    }

    const normalized = parsed.map(normalizeItem).filter(Boolean);
    return normalized.length > 0
      ? normalized
      : STARTER_ITEMS.map((item) => ({ ...item }));
  } catch {
    return STARTER_ITEMS.map((item) => ({ ...item }));
  }
}

export function saveItems(items) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function updateItemQuantity(items, itemId, nextQuantity) {
  const quantity = clampQuantity(nextQuantity);
  const now = new Date().toISOString();

  return items.map((item) =>
    item.id === itemId ? { ...item, quantity, updatedAt: now } : item
  );
}
