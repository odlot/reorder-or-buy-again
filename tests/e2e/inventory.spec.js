import { test, expect } from "@playwright/test";

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
  const restockTab = page.getByRole("button", { name: "Open restock view" });
  const settingsTab = page.getByRole("button", { name: "Open settings view" });

  await expect(addItemButton).toBeVisible();
  await expect(allTab).toBeVisible();
  await expect(restockTab).toBeVisible();
  await expect(settingsTab).toBeVisible();

  await expectTapTarget(addItemButton);
  await expectTapTarget(allTab);
  await expectTapTarget(restockTab);
  await expectTapTarget(settingsTab);

  const decreaseDishSoap = page.getByRole("button", {
    name: "Decrease Dish Soap",
  });
  const increaseDishSoap = page.getByRole("button", {
    name: "Increase Dish Soap",
  });
  const removeDishSoap = page.getByRole("button", { name: "Remove Dish Soap" });

  await expect(decreaseDishSoap).toBeVisible();
  await expect(increaseDishSoap).toBeVisible();
  await expect(removeDishSoap).toBeVisible();

  await expectTapTarget(decreaseDishSoap);
  await expectTapTarget(increaseDishSoap);
  await expectTapTarget(removeDishSoap);

  await restockTab.click();
  const restockDishSoap = page.getByRole("button", { name: "Restock Dish Soap" });
  const restockShown = page.getByRole("button", {
    name: "Restock all shown low-stock items",
  });

  await expect(restockDishSoap).toBeVisible();
  await expect(restockShown).toBeVisible();
  await expectTapTarget(restockDishSoap);
  await expectTapTarget(restockShown);
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

test("restock view only shows low-stock items", async ({ page }) => {
  await page.locator('.nav-tab[data-view="restock"]').click();

  await expect(itemRow(page, "Dish Soap")).toHaveCount(1);
  await expect(itemRow(page, "Laundry Detergent")).toHaveCount(1);
  await expect(itemRow(page, "Paper Towels")).toHaveCount(1);
  await expect(itemRow(page, "Toothpaste")).toHaveCount(0);
  await expect(itemRow(page, "Trash Bags")).toHaveCount(0);
});

test("restock quick action updates item and removes it from restock list", async ({
  page,
}) => {
  await page.locator('.nav-tab[data-view="restock"]').click();
  await expect(itemRow(page, "Dish Soap")).toHaveCount(1);

  await itemRow(page, "Dish Soap").locator('[data-action="restock"]').click();

  await expect(itemRow(page, "Dish Soap")).toHaveCount(0);
  await expect(page.locator("#undo-toast")).toBeVisible();
  await expect(page.locator("#undo-message")).toContainText("Restocked Dish Soap");
  await expect(page.locator("#undo-button")).toBeHidden();
});

test("restock shown bulk action clears current restock list", async ({ page }) => {
  await page.locator('.nav-tab[data-view="restock"]').click();
  await expect(page.locator("#restock-all-button")).toBeVisible();

  await page.click("#restock-all-button");

  await expect(page.locator("#summary-line")).toContainText("0 shown");
  await expect(page.locator("#empty-state")).toContainText(
    "No low-stock items right now."
  );
  await expect(page.locator("#undo-toast")).toBeVisible();
  await expect(page.locator("#undo-message")).toContainText("Restocked");
  await expect(page.locator("#undo-button")).toBeHidden();
});
