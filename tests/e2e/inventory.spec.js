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

  const decreaseDishSoap = page.getByRole("button", {
    name: "Decrease Dish Soap",
  });
  const increaseDishSoap = page.getByRole("button", {
    name: "Increase Dish Soap",
  });
  const removeDishSoap = page.getByRole("button", { name: "Remove Dish Soap" });
  const editDishSoap = page.getByRole("button", { name: "Edit Dish Soap" });

  await expect(decreaseDishSoap).toBeVisible();
  await expect(increaseDishSoap).toBeVisible();
  await expect(removeDishSoap).toBeVisible();
  await expect(editDishSoap).toBeVisible();

  await expectTapTarget(decreaseDishSoap);
  await expectTapTarget(increaseDishSoap);
  await expectTapTarget(removeDishSoap);
  await expectTapTarget(editDishSoap);

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
