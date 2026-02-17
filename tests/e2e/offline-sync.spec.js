import { test, expect } from "@playwright/test";

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

  await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem("reorder-or-buy-again.state"));
    saved.items.push({
      id: "remote-only-item",
      name: "Remote Only Item",
      quantity: 4,
      lowThreshold: 1,
      category: "Sync",
      updatedAt: "2099-01-01T00:00:00.000Z",
    });
    saved.updatedAt = "2099-01-01T00:00:00.000Z";

    window.__syncMock.text = JSON.stringify({
      schemaVersion: 1,
      strategy: "last-write-wins-full",
      updatedAt: saved.updatedAt,
      state: saved,
    });
  });

  await page.click("#sync-now-button");
  await expect(page.locator("#sync-status-chip")).toHaveText("Synced");

  await page.getByRole("button", { name: "All" }).click();
  await expect(page.locator(".item-name", { hasText: "Remote Only Item" })).toBeVisible();
});
