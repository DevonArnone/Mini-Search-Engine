import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("core pages render without horizontal overflow", async ({ page }) => {
  for (const path of ["/", "/search", "/sources", "/sources/react", "/insights"]) {
    await page.goto(path);
    await expect(page.locator("main")).toBeVisible();
    const dimensions = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
    expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client);
  }
});

test("home search opens the workbench with results", async ({ page }) => {
  await page.goto("/");
  const search = page.getByRole("combobox", { name: "Search developer documentation" });
  await search.fill("useState");
  await search.press("Enter");
  await expect(page).toHaveURL(/\/search\?q=useState/);
  await expect(page.getByRole("link", { name: /useState/ }).first()).toBeVisible({
    timeout: 10_000,
  });
});

test("mobile filters open as a dialog", async ({ page, isMobile }) => {
  test.skip(!isMobile, "Mobile-only workflow");
  await page.goto("/search?q=useState");
  await page.getByRole("button", { name: /Filters/ }).click();
  await expect(page.getByRole("dialog", { name: "Search filters" })).toBeVisible();
  await page.getByRole("button", { name: "Close filters" }).last().click();
  await expect(page.getByRole("dialog", { name: "Search filters" })).toBeHidden();
});

test("primary pages have no serious accessibility violations", async ({ page }) => {
  for (const path of ["/", "/search", "/sources", "/insights"]) {
    await page.goto(path);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(results.violations.filter((violation) => ["serious", "critical"].includes(violation.impact ?? ""))).toEqual([]);
  }
});
