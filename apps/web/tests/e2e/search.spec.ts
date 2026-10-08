import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const ROUTES = ["/", "/search", "/search?q=hook", "/sources", "/sources/react", "/sources/postgresql?q=window", "/insights", "/no-such-page"];
const searchBox = (page: Page) => page.getByRole("combobox").first();

async function expectNoHorizontalOverflow(page: Page) {
  const { client, scroll } = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  expect(scroll).toBeLessThanOrEqual(client);
}

test("every route renders without horizontal overflow", async ({ page }) => {
  for (const path of ROUTES) {
    await page.goto(path);
    await expect(page.locator("main")).toBeVisible();
    await expectNoHorizontalOverflow(page);
  }
});

test("long queries and narrow screens do not overflow", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto(`/search?q=${"supercalifragilistic".repeat(8)}`);
  await expect(page.getByRole("heading", { name: /Nothing on the shelves/ })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("home search submits to the search page and shows live results", async ({ page }) => {
  await page.goto("/");
  await searchBox(page).fill("useState");
  await searchBox(page).press("Enter");
  await expect(page).toHaveURL(/\/search\?q=useState/);
  await expect(page.getByRole("link", { name: /useState – React/ })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Demo mode")).toHaveCount(0);
});

test("typing alone does not search; autocomplete can be chosen from the keyboard", async ({ page }) => {
  await page.goto("/search");
  const searches: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/search")) searches.push(request.url());
  });
  await searchBox(page).fill("usee");
  await expect(page.getByRole("option", { name: "useEffect – React" })).toBeVisible();
  expect(searches).toEqual([]);
  await searchBox(page).press("ArrowDown");
  await searchBox(page).press("Enter");
  await expect(page).toHaveURL(/q=useEffect/);
  await expect(page.getByRole("link", { name: /useEffect – React/ })).toBeVisible();
});

test("back and forward move through queries, filters, and pages", async ({ page }) => {
  await page.goto("/search?q=hook");
  await expect(page.getByRole("heading", { level: 2, name: /25 results/ })).toBeVisible();

  await page.getByRole("button", { name: "Next page" }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(page.getByText("Page 2 of 3")).toBeVisible();

  await searchBox(page).fill("window");
  await searchBox(page).press("Enter");
  await expect(page.getByRole("link", { name: /Window Functions/ })).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/q=hook&page=2|page=2&q=hook/);
  await expect(page.getByText("Page 2 of 3")).toBeVisible();
  await page.goBack();
  await expect(page.getByText("Page 1 of 3")).toBeVisible();
  await page.goForward();
  await page.goForward();
  await expect(searchBox(page)).toHaveValue("window");
});

test("a source workspace stays locked to its source", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/search?")) requests.push(new URL(request.url()).search);
  });
  // The URL asks for other sources; the workspace must ignore them.
  await page.goto("/sources/postgresql?q=state&source=react&source=mdn");
  await expect(page.getByRole("heading", { name: /Nothing on the shelves/ })).toBeVisible();
  expect(requests.every((search) => new URLSearchParams(search).getAll("source").join() === "postgresql")).toBe(true);

  await searchBox(page).fill("window");
  await searchBox(page).press("Enter");
  await expect(page.getByRole("link", { name: /Window Functions/ })).toBeVisible();
  expect(new URLSearchParams(requests.at(-1)).getAll("source")).toEqual(["postgresql"]);
});

test("an unknown source shows the designed 404", async ({ page }) => {
  await page.goto("/sources/not-a-source");
  await expect(page.getByRole("heading", { name: "This page isn’t in the catalog." })).toBeVisible();
});

test("opening a result reports the click with its search id", async ({ page }) => {
  await page.goto("/search?q=useState");
  const link = page.getByRole("link", { name: /useState – React/ });
  await expect(link).toBeVisible();
  // Keep the test on this page instead of following the external link.
  await link.evaluate((element) => element.addEventListener("click", (event) => event.preventDefault()));

  await page.getByRole("button", { name: "Provenance" }).first().click();
  const [request] = await Promise.all([page.waitForRequest((candidate) => candidate.url().includes("/api/analytics")), link.click()]);
  expect(request.postDataJSON()).toMatchObject({ clickedDocumentId: "00000000-0000-4000-8000-000000000001", resultRank: 1 });
  expect(request.postDataJSON().searchId).toMatch(/^[0-9a-f-]{36}$/);
});

test("a failing search service shows an error with a working retry", async ({ page }) => {
  let fail = true;
  await page.route("**/api/search?**", (route) => (fail ? route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { code: "search_unavailable", message: "Search is temporarily unavailable. Please try again." } }) }) : route.continue()));
  await page.goto("/search?q=useState");
  await expect(page.locator("main").getByRole("alert")).toContainText("Search is temporarily unavailable");
  fail = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("link", { name: /useState – React/ })).toBeVisible();
  await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
});

test("database-backed surfaces say when the database is unavailable", async ({ page }) => {
  await page.goto("/insights");
  await expect(page.locator("main").getByRole("alert")).toContainText("Analytics are unavailable");
  await page.goto("/sources");
  await expect(page.locator("main").getByRole("alert")).toContainText("Coverage and crawl health are unavailable");
  await page.goto("/insights?period=14d");
  await expect(page.getByText("That reporting period is not available")).toBeVisible();
});

test("the keyboard shortcut focuses search, but not while typing elsewhere", async ({ page, isMobile }) => {
  test.skip(isMobile, "Hardware keyboard shortcut");
  await page.goto("/sources");
  await page.keyboard.press("/");
  await expect(page).toHaveURL(/\/search$/);
  await expect(searchBox(page)).toBeFocused();

  await searchBox(page).fill("a/b");
  await expect(searchBox(page)).toHaveValue("a/b");

  await page.goto("/");
  await page.keyboard.press("Control+k");
  await expect(searchBox(page)).toBeFocused();
});

test("the whole search flow works from the keyboard", async ({ page, isMobile }) => {
  test.skip(isMobile, "Hardware keyboard flow");
  await page.goto("/search?q=hook");
  await expect(page.getByRole("heading", { level: 2, name: /25 results/ })).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.getByRole("button", { name: "Provenance" }).first().focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Provenance" }).first()).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("button", { name: "Next page" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Page 2 of 3")).toBeVisible();
  // Focus moves to the results summary so the new page is announced.
  await expect(page.getByRole("heading", { level: 2, name: /25 results/ })).toBeFocused();
});

test("mobile filters open in a dialog that traps and restores focus", async ({ page, isMobile }) => {
  test.skip(!isMobile, "Mobile-only workflow");
  await page.goto("/search?q=hook");
  const trigger = page.getByRole("button", { name: /^Filters/ });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Search filters" });
  await expect(dialog).toBeVisible();

  // Focus stays inside the dialog however far Tab is pressed.
  for (let presses = 0; presses < 25; presses++) {
    await page.keyboard.press("Tab");
    expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  }

  await dialog.getByRole("checkbox", { name: /Guide/ }).click();
  await expect(page).toHaveURL(/contentType=guide/);
  await expect(dialog).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(trigger).toContainText("1");
});

test("the theme choice persists across reloads", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Theme" }).click();
  await page.getByRole("menuitemradio", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(background).toBe("rgb(21, 18, 16)");
});

test("reduced motion removes the ambient animation and its control", async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "How a page becomes a result" })).toBeVisible();
  await expect(page.getByRole("button", { name: /the animation/ })).toHaveCount(0);
  await context.close();

  const moving = await browser.newContext({ reducedMotion: "no-preference" });
  const movingPage = await moving.newPage();
  await movingPage.goto("/");
  const pause = movingPage.getByRole("button", { name: "Pause the animation" });
  await expect(pause).toBeVisible();
  await pause.click();
  await expect(movingPage.getByRole("button", { name: "Play the animation" })).toHaveAttribute("aria-pressed", "true");
  await moving.close();
});

for (const theme of ["light", "dark"] as const) {
  test(`no serious accessibility violations (${theme})`, async ({ browser }) => {
    test.slow();
    const context = await browser.newContext({ colorScheme: theme, reducedMotion: "reduce" });
    await context.addInitScript((value) => localStorage.setItem("devdocs-theme", value), theme);
    const page = await context.newPage();
    for (const path of ROUTES) {
      await page.goto(path);
      await expect(page.locator("main")).toBeVisible();
      if (path.includes("q=")) await expect(page.locator("article").first()).toBeVisible();
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
      const failures = results.violations
        .filter((violation) => ["serious", "critical"].includes(violation.impact ?? ""))
        .map((violation) => `${path}: ${violation.id} — ${violation.nodes.map((node) => node.target.join(" ")).slice(0, 3).join(" | ")}`);
      expect(failures).toEqual([]);
    }
    await context.close();
  });
}
