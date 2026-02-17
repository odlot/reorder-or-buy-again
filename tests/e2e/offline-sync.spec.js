import { test, expect } from "@playwright/test";

function itemRow(page, name) {
  return page.locator(".item-row").filter({
    has: page.locator(".item-name", {
      hasText: new RegExp(`^${name}$`),
    }),
  });
}

async function installMockFileSync(page) {
  await page.addInitScript(() => {
    let fileText = "";

    const handle = {
      async getFile() {
        return {
          async text() {
            return fileText;
          },
        };
      },
      async createWritable() {
        let nextText = fileText;
        return {
          async write(chunk) {
            nextText = typeof chunk === "string" ? chunk : String(chunk ?? "");
          },
          async close() {
            fileText = nextText;
          },
        };
      },
    };

    window.__syncMock = {
      get text() {
        return fileText;
      },
      set text(value) {
        fileText = String(value ?? "");
      },
    };

    Object.defineProperty(window, "showSaveFilePicker", {
      configurable: true,
      writable: true,
      value: async () => handle,
    });
  });
}

test("offline file sync writes local changes to linked file", async ({ page }) => {
  await installMockFileSync(page);
  await page.goto("/");

  await page.getByRole("button", { name: "Settings" }).click();
  await page.click("#link-sync-button");

  await expect(page.locator("#sync-status-chip")).toHaveText("Synced");
  await expect(page.locator("#sync-last-synced")).not.toHaveText(
    "Last synced: never"
  );

  await page.getByRole("button", { name: "All" }).click();
  await page.fill("#quick-add-name", "Sync Test Item");
  await page.click('#quick-add-form button[type="submit"]');

  await expect
    .poll(async () => {
      return page.evaluate(() => window.__syncMock.text.includes("Sync Test Item"));
    })
    .toBe(true);
});

test("offline file sync pulls newer snapshot from linked file", async ({ page }) => {
  await installMockFileSync(page);
  await page.goto("/");

  await page.getByRole("button", { name: "Settings" }).click();
  await page.click("#link-sync-button");
  await expect(page.locator("#sync-status-chip")).toHaveText("Synced");

  await page.evaluate(() => {
    const payload = window.__syncMock.text
      ? JSON.parse(window.__syncMock.text)
      : null;
    const baseState =
      payload && payload.state && Array.isArray(payload.state.items)
        ? payload.state
        : {
            items: [],
            settings: { defaultLowThreshold: 1 },
            updatedAt: new Date().toISOString(),
          };

    const nextState = {
      ...baseState,
      items: [...baseState.items],
    };

    nextState.items.push({
      id: "remote-only-item",
      name: "Remote Only Item",
      quantity: 4,
      lowThreshold: 1,
      category: "Sync",
      updatedAt: "2099-01-01T00:00:00.000Z",
    });
    nextState.updatedAt = "2099-01-01T00:00:00.000Z";

    window.__syncMock.text = JSON.stringify({
      schemaVersion: 1,
      strategy: "last-write-wins-full",
      updatedAt: nextState.updatedAt,
      state: nextState,
    });
  });

  await page.click("#sync-now-button");
  await expect(page.locator("#sync-status-chip")).toHaveText("Synced");

  await page.getByRole("button", { name: "All" }).click();
  await expect(page.locator(".item-name", { hasText: "Remote Only Item" })).toBeVisible();
});

test("offline file sync detects same-timestamp conflict and resolves on demand", async ({
  page,
}) => {
  await installMockFileSync(page);
  await page.goto("/");

  await page.getByRole("button", { name: "Settings" }).click();
  await page.click("#link-sync-button");
  await expect(page.locator("#sync-status-chip")).toHaveText("Synced");

  await page.evaluate(() => {
    const payload = JSON.parse(window.__syncMock.text);
    const baseState = payload.state;
    const nextState = {
      ...baseState,
      items: baseState.items.map((item) => ({ ...item })),
      updatedAt: baseState.updatedAt,
    };

    const dishSoap = nextState.items.find((item) => item.id === "dish-soap");
    if (dishSoap) {
      dishSoap.quantity = 9;
      dishSoap.updatedAt = "2099-01-01T00:00:00.000Z";
    }

    nextState.items.push({
      id: "conflict-remote-item",
      name: "Conflict Remote Item",
      quantity: 2,
      lowThreshold: 1,
      category: "Sync",
      updatedAt: "2099-01-01T00:00:00.000Z",
    });

    window.__syncMock.text = JSON.stringify({
      schemaVersion: payload.schemaVersion,
      strategy: payload.strategy,
      updatedAt: payload.updatedAt,
      state: nextState,
    });
  });

  await page.click("#sync-now-button");
  await expect(page.locator("#sync-status-chip")).toHaveText("Conflict");
  await expect(page.locator("#sync-now-button")).toHaveText("Resolve Conflict");

  await page.click("#sync-now-button");
  await expect(page.locator("#sync-status-chip")).toHaveText("Synced");

  await page.getByRole("button", { name: "All" }).click();
  await expect(itemRow(page, "Conflict Remote Item")).toHaveCount(1);
  await expect(itemRow(page, "Dish Soap").locator(".qty-input")).toHaveValue("9");
});

test("offline file sync link can be cleared from settings", async ({ page }) => {
  await installMockFileSync(page);
  await page.goto("/");

  await page.getByRole("button", { name: "Settings" }).click();
  await page.click("#link-sync-button");
  await expect(page.locator("#sync-status-chip")).toHaveText("Synced");

  await page.click("#clear-sync-link-button");
  await expect(page.locator("#sync-status-chip")).toHaveText("Offline");
  await expect(page.locator("#sync-last-synced")).toHaveText("Last synced: never");
  await expect(page.locator("#sync-now-button")).toBeDisabled();
});
