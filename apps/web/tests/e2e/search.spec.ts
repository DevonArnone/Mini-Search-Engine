import { test, expect } from "@playwright/test";

test("search page loads", async ({ page }) => {
  await page.goto("/search");
  await expect(page.getByRole("heading", { name: /Fast retrieval/i })).toBeVisible();
});
