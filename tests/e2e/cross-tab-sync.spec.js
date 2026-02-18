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

test("same-device tabs sync with storage events and ignore stale revisions", async ({
  page,
}) => {
  const peerPage = await page.context().newPage();
  await page.goto("/");
  await peerPage.goto("/");

  await expect(itemRow(peerPage, "Dish Soap").locator(".qty-input")).toHaveValue("1");

  await itemRow(page, "Dish Soap")
    .locator('[data-action="step"][data-step="1"]')
    .click();
  await expect(itemRow(peerPage, "Dish Soap").locator(".qty-input")).toHaveValue("2");

  const staleSnapshot = await page.evaluate((storageKey) => {
    return window.localStorage.getItem(storageKey);
  }, STORAGE_KEY);
  expect(staleSnapshot).not.toBeNull();

  await page.fill("#quick-add-name", "Cross Tab Item");
  await page.click('#quick-add-form button[type="submit"]');
  await expect(itemRow(peerPage, "Cross Tab Item")).toHaveCount(1);

  await peerPage.evaluate(
    ({ storageKey, snapshotText }) => {
      const staleEvent = new StorageEvent("storage", {
        key: storageKey,
        newValue: snapshotText,
        storageArea: window.localStorage,
      });
      window.dispatchEvent(staleEvent);
    },
    {
      storageKey: STORAGE_KEY,
      snapshotText: staleSnapshot,
    }
  );

  await expect(itemRow(peerPage, "Cross Tab Item")).toHaveCount(1);
  await peerPage.close();
});
