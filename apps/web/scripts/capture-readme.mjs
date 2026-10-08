// Captures the README screenshots from the running application.
//   node scripts/capture-readme.mjs ../../docs/assets [base-url]
import { chromium } from "@playwright/test";

const out = process.argv[2] ?? "../../docs/assets";
const base = process.argv[3] ?? "http://127.0.0.1:3000";
const browser = await chromium.launch();

async function shot(name, path, { theme = "light", viewport = { width: 1440, height: 900 }, prepare } = {}) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion: "reduce", colorScheme: theme });
  await context.addInitScript((value) => localStorage.setItem("devdocs-theme", value), theme);
  const page = await context.newPage();
  await page.goto(base + path, { waitUntil: "networkidle" });
  if (prepare) await prepare(page);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/${name}.png` });
  await context.close();
}

await shot("home", "/");
await shot("home-dark", "/", { theme: "dark" });
await shot("search", "/search?q=useEffect+cleanup", { prepare: (page) => page.getByRole("button", { name: "Provenance" }).first().click() });
await shot("workspace", "/sources/postgresql?q=window+functions", { theme: "dark" });
await shot("sources", "/sources");
await shot("insights", "/insights?period=7d");
await shot("mobile-search", "/search?q=promise", { viewport: { width: 390, height: 844 } });
await shot("mobile-home-dark", "/", { theme: "dark", viewport: { width: 390, height: 844 } });
await browser.close();
