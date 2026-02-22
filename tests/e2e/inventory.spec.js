import { test, expect } from "@playwright/test";

const STORAGE_KEY = "reorder-or-buy-again.state";

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function itemRow(page, name) {
  return page.locator(".item-row").filter({
    has: page.locator(".item-name", {
      hasText: new RegExp(`^${escapeRegExp(name)}$`),
    }),
  });
}

function shoppingRow(page, name) {
  return page.locator(".shopping-row").filter({
    has: page.locator(".shopping-name", {
      hasText: new RegExp(`^${escapeRegExp(name)}$`),
    }),
  });
}

async function expectTapTarget(locator, minSize = 44) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box.width).toBeGreaterThanOrEqual(minSize);
  expect(box.height).toBeGreaterThanOrEqual(minSize);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("quick add creates an item with default quantity 1", async ({ page }) => {
  await page.fill("#quick-add-name", "Sponges");
  await page.click('#quick-add-form button[type="submit"]');

  const row = itemRow(page, "Sponges");
  await expect(row).toHaveCount(1);
  await expect(row.locator(".qty-input")).toHaveValue("1");
  await expect(page.locator("#undo-toast")).toBeVisible();
  await expect(page.locator("#undo-message")).toContainText("Added Sponges");
  await expect(page.locator("#undo-button")).toBeHidden();
});

test("action controls expose labels and finger-sized tap targets", async ({
  page,
}) => {
  const addItemButton = page.getByRole("button", {
    name: "Add item to inventory",
  });
  const allTab = page.getByRole("button", { name: "Open all items view" });
  const shoppingTab = page.getByRole("button", { name: "Open shopping view" });
  const settingsTab = page.getByRole("button", { name: "Open settings view" });

  await expect(addItemButton).toBeVisible();
  await expect(allTab).toBeVisible();
  await expect(shoppingTab).toBeVisible();
  await expect(settingsTab).toBeVisible();

  await expectTapTarget(addItemButton);
  await expectTapTarget(allTab);
  await expectTapTarget(shoppingTab);
  await expectTapTarget(settingsTab);
  await expectTapTarget(page.locator("#status-filter-all"));
  await expectTapTarget(page.locator("#status-filter-due"));
  await expectTapTarget(page.locator("#bulk-edit-toggle-button"));

  const decreaseDishSoap = page.getByRole("button", {
    name: "Decrease Dish Soap",
  });
  const increaseDishSoap = page.getByRole("button", {
    name: "Increase Dish Soap",
  });
  const removeDishSoap = page.getByRole("button", { name: "Remove Dish Soap" });
  const editDishSoap = page.getByRole("button", { name: "Edit Dish Soap" });
  const confirmDishSoap = page.getByRole("button", {
    name: "Confirm quantity for Dish Soap",
  });

  await expect(decreaseDishSoap).toBeVisible();
  await expect(increaseDishSoap).toBeVisible();
  await expect(removeDishSoap).toBeVisible();
  await expect(editDishSoap).toBeVisible();
  await expect(confirmDishSoap).toBeVisible();

  await expectTapTarget(decreaseDishSoap);
  await expectTapTarget(increaseDishSoap);
  await expectTapTarget(removeDishSoap);
  await expectTapTarget(editDishSoap);
  await expectTapTarget(confirmDishSoap);

  await shoppingTab.click();
  const shoppingStepDown = page.getByRole("button", {
    name: "Decrease planned quantity for Dish Soap",
  });
  const shoppingStepUp = page.getByRole("button", {
    name: "Increase planned quantity for Dish Soap",
  });
  const shoppingMax = page.getByRole("button", {
    name: "Set planned quantity for Dish Soap to needed amount",
  });
  const copyShopping = page.getByRole("button", { name: "Copy shopping list" });
  const shareShopping = page.getByRole("button", { name: "Share shopping list" });
  await expect(shoppingStepDown).toBeVisible();
  await expect(shoppingStepUp).toBeVisible();
  await expect(shoppingMax).toBeVisible();
  await expect(copyShopping).toBeVisible();
  await expect(shareShopping).toBeVisible();
  await expectTapTarget(shoppingStepDown);
  await expectTapTarget(shoppingStepUp);
  await expectTapTarget(shoppingMax);
  await expectTapTarget(copyShopping);
  await expectTapTarget(shareShopping);
});

test("settings can add and remove source and room presets", async ({ page }) => {
  await page.getByRole("button", { name: "Open settings view" }).click();

  const sourceInput = page.locator("#source-category-preset-input");
  await sourceInput.fill("Farmer Market");
  await page.getByRole("button", { name: "Add source category preset" }).click();
  await expect(page.locator("#source-category-preset-list")).toContainText(
    "Farmer Market"
  );

  await page
    .locator(
      '#source-category-preset-list [data-action="remove-source-category-preset"][data-preset="Farmer Market"]'
    )
    .click();
  await expect(page.locator("#source-category-preset-list")).not.toContainText(
    "Farmer Market"
  );

  const roomInput = page.locator("#room-preset-input");
  await roomInput.fill("Guest Room");
  await page.getByRole("button", { name: "Add room preset" }).click();
  await expect(page.locator("#room-preset-list")).toContainText("Guest Room");

  await page
    .locator(
      '#room-preset-list [data-action="remove-room-preset"][data-preset="Guest Room"]'
    )
    .click();
  await expect(page.locator("#room-preset-list")).not.toContainText("Guest Room");
});

test("all view filters by source category and room", async ({ page }) => {
  const soapRow = itemRow(page, "Dish Soap");
  await soapRow.getByRole("button", { name: "Edit Dish Soap" }).click();
  const editForm = page.locator('.item-edit-form[aria-label="Edit Dish Soap"]');

  await editForm.getByLabel("Online").check();
  await editForm.getByLabel("Room for Dish Soap").selectOption("Pantry");
  await editForm.getByRole("button", { name: "Save edits for Dish Soap" }).click();

  await expect(soapRow.locator(".item-context")).toContainText("Online");
  await expect(soapRow.locator(".item-context")).toContainText("Room: Pantry");

  await page.selectOption("#all-source-filter-input", "Online");
  await expect(itemRow(page, "Dish Soap")).toHaveCount(1);
  await expect(itemRow(page, "Toothpaste")).toHaveCount(0);

  await page.selectOption("#all-room-filter-input", "Pantry");
  await expect(itemRow(page, "Dish Soap")).toHaveCount(1);

  await page.selectOption("#all-room-filter-input", "Bathroom");
  await expect(itemRow(page, "Dish Soap")).toHaveCount(0);
});

test("bulk edit mode applies source, room, and check interval to selected items", async ({
  page,
}) => {
  await page.locator("#bulk-edit-toggle-button").click();
  await expect(page.locator("#bulk-edit-panel")).toBeVisible();
  await expect(page.locator("#quick-add-form")).toBeHidden();

  await itemRow(page, "Dish Soap")
    .getByRole("button", { name: "Select Dish Soap" })
    .click();
  await itemRow(page, "Toothpaste")
    .getByRole("button", { name: "Select Toothpaste" })
    .click();
  await expect(page.locator("#bulk-edit-selection-summary")).toContainText(
    "2 items selected"
  );

  await page.locator('#bulk-edit-source-list input[value="Online"]').check();
  await page.selectOption("#bulk-edit-room-select", "Pantry");
  await page.fill("#bulk-edit-check-interval-input", "21");
  await page.locator("#bulk-edit-apply-button").click();

  await expect(page.locator("#undo-message")).toContainText("Updated 2 items");
  await expect(page.locator("#bulk-edit-panel")).toBeHidden();
  await expect(page.locator("#quick-add-form")).toBeVisible();

  const state = await page.evaluate((storageKey) => {
    const raw = window.localStorage.getItem(storageKey);
    return raw ? JSON.parse(raw) : null;
  }, STORAGE_KEY);
  expect(state).not.toBeNull();

  const dishSoap = state.items.find((item) => item.id === "dish-soap");
  const toothpaste = state.items.find((item) => item.id === "toothpaste");
  const paperTowels = state.items.find((item) => item.id === "paper-towels");

  expect(dishSoap.room).toBe("Pantry");
  expect(toothpaste.room).toBe("Pantry");
  expect(dishSoap.sourceCategories).toEqual(["Online"]);
  expect(toothpaste.sourceCategories).toEqual(["Online"]);
  expect(dishSoap.checkIntervalDays).toBe(21);
  expect(toothpaste.checkIntervalDays).toBe(21);

  expect(paperTowels.room).toBe("Kitchen");
  expect(paperTowels.sourceCategories).toEqual(["Grocery"]);
  expect(paperTowels.checkIntervalDays).toBe(14);
});

test("bulk edit mode can select and deselect all visible items", async ({ page }) => {
  await page.locator("#bulk-edit-toggle-button").click();
  await expect(page.locator("#bulk-edit-panel")).toBeVisible();

  const initialVisibleCount = await page.locator(".item-row").count();
  const initialSelectedLabel = `${initialVisibleCount} ${
    initialVisibleCount === 1 ? "item" : "items"
  } selected`;
  const selectVisibleButton = page.locator("#bulk-edit-select-visible-button");
  await expect(selectVisibleButton).toContainText(
    `Select visible (${initialVisibleCount})`
  );

  await selectVisibleButton.click();
  await expect(page.locator("#bulk-edit-selection-summary")).toContainText(initialSelectedLabel);
  await expect(selectVisibleButton).toContainText(
    `Deselect visible (${initialVisibleCount})`
  );

  await page.selectOption("#all-source-filter-input", "Grocery");
  const filteredVisibleCount = await page.locator(".item-row").count();
  const filteredSelectedLabel = `${filteredVisibleCount} ${
    filteredVisibleCount === 1 ? "item" : "items"
  } selected`;
  await expect(page.locator("#bulk-edit-selection-summary")).toContainText(
    filteredSelectedLabel
  );
  await expect(selectVisibleButton).toContainText(
    `Deselect visible (${filteredVisibleCount})`
  );

  await selectVisibleButton.click();
  await expect(page.locator("#bulk-edit-selection-summary")).toContainText(
    "0 items selected"
  );
  await expect(selectVisibleButton).toContainText(
    `Select visible (${filteredVisibleCount})`
  );
});

test("shopping view groups by source and supports source filtering", async ({
  page,
}) => {
  await page.evaluate((storageKey) => {
    const timestamp = "2026-02-20T00:00:00.000Z";
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        items: [
          {
            id: "dish-soap",
            name: "Dish Soap",
            quantity: 0,
            lowThreshold: 1,
            targetQuantity: 2,
            sourceCategories: ["Grocery", "Online"],
            room: "Kitchen",
            checkIntervalDays: 14,
            lastCheckedAt: timestamp,
            updatedAt: timestamp,
          },
          {
            id: "toothpaste",
            name: "Toothpaste",
            quantity: 0,
            lowThreshold: 1,
            targetQuantity: 3,
            sourceCategories: ["Pharmacy"],
            room: "Bathroom",
            checkIntervalDays: 14,
            lastCheckedAt: timestamp,
            updatedAt: timestamp,
          },
          {
            id: "paper-towels",
            name: "Paper Towels",
            quantity: 0,
            lowThreshold: 1,
            targetQuantity: 2,
            sourceCategories: ["Unassigned"],
            room: "Laundry",
            checkIntervalDays: 14,
            lastCheckedAt: timestamp,
            updatedAt: timestamp,
          },
        ],
        settings: {
          defaultLowThreshold: 1,
          themeMode: "light",
          defaultCheckIntervalDays: 14,
          sourceCategoryPresets: ["Grocery", "Pharmacy", "Online"],
          roomPresets: ["Kitchen", "Bathroom", "Laundry"],
        },
        shopping: { buyQuantityByItemId: {} },
        updatedAt: timestamp,
        revision: 1,
      })
    );
  }, STORAGE_KEY);
  await page.reload();

  await page.getByRole("button", { name: "Open shopping view" }).click();
  await expect(page.locator(".shopping-group-title")).toHaveText([
    "Grocery",
    "Pharmacy",
    "Unassigned",
  ]);
  await expect(shoppingRow(page, "Dish Soap").locator(".shopping-tags")).toContainText(
    "Online"
  );

  await page.selectOption("#shopping-source-filter-input", "Pharmacy");
  await expect(shoppingRow(page, "Toothpaste")).toHaveCount(1);
  await expect(shoppingRow(page, "Dish Soap")).toHaveCount(0);
  await expect(shoppingRow(page, "Paper Towels")).toHaveCount(0);
});

test("removing source and room presets remaps affected items to Unassigned", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Open settings view" }).click();
  await page.locator("#source-category-preset-input").fill("Corner Shop");
  await page.getByRole("button", { name: "Add source category preset" }).click();
  await page.locator("#room-preset-input").fill("Hall");
  await page.getByRole("button", { name: "Add room preset" }).click();

  await page.getByRole("button", { name: "Open all items view" }).click();
  const soapRow = itemRow(page, "Dish Soap");
  await soapRow.getByRole("button", { name: "Edit Dish Soap" }).click();
  const editForm = page.locator('.item-edit-form[aria-label="Edit Dish Soap"]');

  await editForm.getByLabel("Grocery").uncheck();
  await editForm.getByLabel("Corner Shop").check();
  await editForm.getByLabel("Room for Dish Soap").selectOption("Hall");
  await editForm.getByRole("button", { name: "Save edits for Dish Soap" }).click();

  await page.getByRole("button", { name: "Open settings view" }).click();
  await page
    .locator(
      '#source-category-preset-list [data-action="remove-source-category-preset"][data-preset="Corner Shop"]'
    )
    .click();
  await page
    .locator(
      '#room-preset-list [data-action="remove-room-preset"][data-preset="Hall"]'
    )
    .click();

  await page.getByRole("button", { name: "Open all items view" }).click();
  await itemRow(page, "Dish Soap").getByRole("button", { name: "Edit Dish Soap" }).click();
  const remappedForm = page.locator('.item-edit-form[aria-label="Edit Dish Soap"]');
  await expect(
    remappedForm.locator('input[name="sourceCategories"][value="Unassigned"]')
  ).toBeChecked();
  await expect(remappedForm.getByLabel("Room for Dish Soap")).toHaveValue(
    "Unassigned"
  );
});

test("overdue reminder appears and confirm quantity clears it", async ({ page }) => {
  await page.evaluate((storageKey) => {
    const now = Date.now();
    const staleTimestamp = new Date(now - 40 * 24 * 60 * 60 * 1000).toISOString();
    const freshTimestamp = new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString();

    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        items: [
          {
            id: "dish-soap",
            name: "Dish Soap",
            quantity: 1,
            lowThreshold: 1,
            targetQuantity: 2,
            sourceCategories: ["Grocery"],
            room: "Kitchen",
            checkIntervalDays: 14,
            lastCheckedAt: staleTimestamp,
            updatedAt: staleTimestamp,
          },
          {
            id: "toothpaste",
            name: "Toothpaste",
            quantity: 2,
            lowThreshold: 1,
            targetQuantity: 3,
            sourceCategories: ["Pharmacy"],
            room: "Bathroom",
            checkIntervalDays: 14,
            lastCheckedAt: freshTimestamp,
            updatedAt: freshTimestamp,
          },
        ],
        settings: {
          defaultLowThreshold: 1,
          themeMode: "light",
          defaultCheckIntervalDays: 14,
          sourceCategoryPresets: ["Grocery", "Pharmacy"],
          roomPresets: ["Kitchen", "Bathroom"],
        },
        shopping: {
          buyQuantityByItemId: {},
        },
        updatedAt: new Date(now).toISOString(),
        revision: 1,
      })
    );
  }, STORAGE_KEY);

  await page.reload();

  await expect(page.locator("#check-reminder-chip")).toBeVisible();
  await expect(page.locator("#check-reminder-text")).toContainText(
    "Dish Soap"
  );

  await page
    .getByRole("button", { name: "Confirm quantity for Dish Soap" })
    .click();
  await expect(page.locator("#undo-message")).toContainText(
    "Confirmed Dish Soap quantity."
  );
  await expect(page.locator("#check-reminder-panel")).toBeHidden();
});

test("due-only filter and confirm-all action clear all due reminders", async ({
  page,
}) => {
  await page.evaluate((storageKey) => {
    const now = Date.now();
    const staleTimestamp = new Date(now - 40 * 24 * 60 * 60 * 1000).toISOString();
    const alsoStaleTimestamp = new Date(now - 20 * 24 * 60 * 60 * 1000).toISOString();
    const freshTimestamp = new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString();

    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        items: [
          {
            id: "dish-soap",
            name: "Dish Soap",
            quantity: 1,
            lowThreshold: 1,
            targetQuantity: 2,
            sourceCategories: ["Grocery"],
            room: "Kitchen",
            checkIntervalDays: 14,
            lastCheckedAt: staleTimestamp,
            updatedAt: staleTimestamp,
          },
          {
            id: "toothpaste",
            name: "Toothpaste",
            quantity: 2,
            lowThreshold: 1,
            targetQuantity: 3,
            sourceCategories: ["Pharmacy"],
            room: "Bathroom",
            checkIntervalDays: 14,
            lastCheckedAt: alsoStaleTimestamp,
            updatedAt: alsoStaleTimestamp,
          },
          {
            id: "paper-towels",
            name: "Paper Towels",
            quantity: 2,
            lowThreshold: 1,
            targetQuantity: 3,
            sourceCategories: ["Grocery"],
            room: "Kitchen",
            checkIntervalDays: 14,
            lastCheckedAt: freshTimestamp,
            updatedAt: freshTimestamp,
          },
        ],
        settings: {
          defaultLowThreshold: 1,
          themeMode: "light",
          defaultCheckIntervalDays: 14,
          sourceCategoryPresets: ["Grocery", "Pharmacy"],
          roomPresets: ["Kitchen", "Bathroom"],
        },
        shopping: {
          buyQuantityByItemId: {},
        },
        updatedAt: new Date(now).toISOString(),
        revision: 1,
      })
    );
  }, STORAGE_KEY);

  await page.reload();

  await expect(page.locator("#status-filter-due")).toHaveText("Due checks (2)");
  await page.locator("#status-filter-due").click();
  await expect(itemRow(page, "Dish Soap")).toHaveCount(1);
  await expect(itemRow(page, "Toothpaste")).toHaveCount(1);
  await expect(itemRow(page, "Paper Towels")).toHaveCount(0);

  await page.locator("#confirm-all-due-button").click();
  await expect(page.locator("#undo-message")).toContainText("Confirmed 2 due items.");
  await expect(page.locator("#check-reminder-panel")).toBeHidden();
  await expect(page.locator("#status-filter-all")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#status-filter-due")).toHaveText("Due checks (0)");
  await expect(page.locator("#status-filter-due")).toBeDisabled();
});

test("plus/minus controls update quantity", async ({ page }) => {
  const row = itemRow(page, "Dish Soap");
  const quantityInput = row.locator(".qty-input");

  await expect(quantityInput).toHaveValue("1");
  await row.locator('[data-action="step"][data-step="1"]').click();
  await expect(quantityInput).toHaveValue("2");
  await row.locator('[data-action="step"][data-step="-1"]').click();
  await expect(quantityInput).toHaveValue("1");
});

test("inline quantity edit commits valid values and rejects invalid", async ({
  page,
}) => {
  const row = itemRow(page, "Toothpaste");
  const quantityInput = row.locator(".qty-input");

  await quantityInput.fill("7");
  await quantityInput.press("Enter");
  await expect(quantityInput).toHaveValue("7");

  await quantityInput.fill("abc");
  await quantityInput.press("Enter");
  await expect(quantityInput).toHaveValue("7");
});

test("delete removes an item and undo restores it", async ({ page }) => {
  await page.fill("#quick-add-name", "Dish Scrubber");
  await page.click('#quick-add-form button[type="submit"]');
  await expect(itemRow(page, "Dish Scrubber")).toHaveCount(1);

  page.once("dialog", (dialog) => dialog.accept());
  await itemRow(page, "Dish Scrubber")
    .locator('[data-action="delete"]')
    .click();

  await expect(itemRow(page, "Dish Scrubber")).toHaveCount(0);
  await expect(page.locator("#undo-toast")).toBeVisible();
  await expect(page.locator("#undo-message")).toContainText("Dish Scrubber");
  await expect(page.locator("#undo-button")).toBeVisible();

  await page.click("#undo-button");
  await expect(itemRow(page, "Dish Scrubber")).toHaveCount(1);
  await expect(page.locator("#undo-message")).toContainText("Restored Dish Scrubber");
  await expect(page.locator("#undo-button")).toBeHidden();
});

test("in-place edit updates description, low threshold, and target", async ({
  page,
}) => {
  const soapRow = itemRow(page, "Dish Soap");
  await soapRow.getByRole("button", { name: "Edit Dish Soap" }).click();

  const editForm = page.locator('.item-edit-form[aria-label="Edit Dish Soap"]');
  await editForm.getByLabel("Description for Dish Soap").fill("Dish Soap Refill");
  await editForm.getByLabel("Low threshold for Dish Soap").fill("3");
  await editForm.getByLabel("Target quantity for Dish Soap").fill("6");
  await editForm.getByRole("button", { name: "Save edits for Dish Soap" }).click();

  await expect(itemRow(page, "Dish Soap Refill")).toHaveCount(1);
  await expect(itemRow(page, "Dish Soap Refill").locator(".item-meta")).toContainText(
    "Threshold: 3"
  );
  await expect(itemRow(page, "Dish Soap Refill").locator(".item-meta")).toContainText(
    "Target: 6"
  );
  await expect(page.locator("#undo-message")).toContainText(
    "Updated description and threshold and target."
  );
});

test("edit form shows visible labels for threshold and target fields", async ({
  page,
}) => {
  const soapRow = itemRow(page, "Dish Soap");
  await soapRow.getByRole("button", { name: "Edit Dish Soap" }).click();

  const editForm = page.locator('.item-edit-form[aria-label="Edit Dish Soap"]');
  await expect(editForm.getByText("Low threshold")).toBeVisible();
  await expect(editForm.getByText("Target quantity")).toBeVisible();
});

test("shopping view can plan quantities and apply purchases to inventory", async ({
  page,
}) => {
  await page.locator('.nav-tab[data-view="shopping"]').click();

  const dishSoapShoppingRow = shoppingRow(page, "Dish Soap");
  await expect(dishSoapShoppingRow).toHaveCount(1);

  const plannedQuantityInput = dishSoapShoppingRow.locator(".shopping-buy-input");
  await expect(plannedQuantityInput).toHaveValue("0");
  await dishSoapShoppingRow
    .locator('[data-action="shopping-step"][data-step="1"]')
    .click();
  await expect(plannedQuantityInput).toHaveValue("1");

  await expect(page.locator("#apply-purchased-button")).toBeEnabled();
  await page.click("#apply-purchased-button");

  await expect(page.locator("#undo-toast")).toBeVisible();
  await expect(page.locator("#undo-message")).toContainText(
    "Applied 1 unit across 1 item."
  );

  await page.locator('.nav-tab[data-view="all"]').click();
  await expect(itemRow(page, "Dish Soap").locator(".qty-input")).toHaveValue("2");

  await page.locator('.nav-tab[data-view="shopping"]').click();
  await expect(shoppingRow(page, "Dish Soap")).toHaveCount(0);
});
