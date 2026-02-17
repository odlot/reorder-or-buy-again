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

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("quick add creates an item with default quantity 1", async ({ page }) => {
  await page.fill("#quick-add-name", "Sponges");
  await page.click('#quick-add-form button[type="submit"]');

  const row = itemRow(page, "Sponges");
  await expect(row).toHaveCount(1);
  await expect(row.locator(".qty-input")).toHaveValue("1");
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

  await page.click("#undo-button");
  await expect(itemRow(page, "Dish Scrubber")).toHaveCount(1);
});

test("restock view only shows low-stock items", async ({ page }) => {
  await page.getByRole("button", { name: /Restock/ }).click();

  await expect(itemRow(page, "Dish Soap")).toHaveCount(1);
  await expect(itemRow(page, "Laundry Detergent")).toHaveCount(1);
  await expect(itemRow(page, "Paper Towels")).toHaveCount(1);
  await expect(itemRow(page, "Toothpaste")).toHaveCount(0);
  await expect(itemRow(page, "Trash Bags")).toHaveCount(0);
});
