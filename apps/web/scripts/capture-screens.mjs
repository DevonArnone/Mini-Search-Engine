// Captures every route at desktop and mobile widths in both themes.
//   node scripts/capture-screens.mjs <output-dir> [base-url]
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const out = process.argv[2] ?? "screens";
const base = process.argv[3] ?? "http://localhost:3000";
mkdirSync(out, { recursive: true });

const routes = [
  ["home", "/"],
  ["search", "/search?q=useEffect+cleanup"],
  ["search-empty", "/search"],
  ["search-none", "/search?q=zzzznotfound"],
  ["sources", "/sources"],
  ["source-react", "/sources/react?q=state"],
  ["source-postgresql", "/sources/postgresql"],
  ["insights", "/insights?period=7d"],
  ["not-found", "/no-such-page"],
];
const viewports = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } };

const browser = await chromium.launch();
for (const theme of ["light", "dark"]) {
  for (const [device, viewport] of Object.entries(viewports)) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion: "reduce", colorScheme: theme });
    await context.addInitScript((value) => localStorage.setItem("devdocs-theme", value), theme);
    const page = await context.newPage();
    for (const [name, path] of routes) {
      await page.goto(base + path, { waitUntil: "networkidle" });
      await page.waitForTimeout(250);
      await page.screenshot({ path: `${out}/${name}-${device}-${theme}.png`, fullPage: true });
    }
    await context.close();
  }
}
await browser.close();
