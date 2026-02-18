import { test, expect } from "@playwright/test";

test("theme mode can be switched and persists across reloads", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  await page.getByRole("button", { name: "Open settings view" }).click();
  await page.selectOption("#theme-mode-input", "dark");

  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await page.getByRole("button", { name: "Open settings view" }).click();
  await expect(page.locator("#theme-mode-input")).toHaveValue("dark");
});
