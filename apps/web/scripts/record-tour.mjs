// Records the README walkthrough: a scripted session against the running
// application, captured frame by frame with an overlay (captions, cursor,
// spotlight, scene wipes) drawn on top of the real interface.
//
//   node scripts/record-tour.mjs <frames-dir> [base-url]
//   python3 ../../scripts/make-tour-gif.py <frames-dir> ../../docs/assets/tour.gif
//
// Every number shown in a caption is read from the running app or passed in
// from the recorded benchmark; nothing on screen is mocked.
import { chromium } from "@playwright/test";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(process.argv[2] ?? "tour-frames");
const base = process.argv[3] ?? "http://127.0.0.1:3000";
const FPS = 12;
const VIEW = { width: 1280, height: 800 };
const CLOTHS = ["#8E2A2B", "#0F6860", "#2A2623", "#2450B8", "#8A5E10"];

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const benchmark = JSON.parse(readFileSync(path.resolve(here, "../../../docs/evidence/benchmarks/benchmark.json"), "utf8"));
const tenK = benchmark.sizes.find((size) => size.size === 10001);
const httpMean = (tenK.trials.reduce((sum, trial) => sum + trial.load.find((run) => run.concurrency === 1).httpMs.mean, 0) / tenK.trials.length).toFixed(1);

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 1, colorScheme: "light" });
await context.addInitScript(() => localStorage.setItem("devdocs-theme", "light"));
const page = await context.newPage();
// Frames are taken straight from the browser's compositor, which keeps
// capture time steady while the page is animating.
const cdp = await context.newCDPSession(page);

// Overlay state, redrawn before every frame.
const state = { cursor: { x: 640, y: 420 }, ripple: 0, caption: null, captionIn: 0, spotlight: null, spotlightIn: 0, wipe: 0, wipeColor: CLOTHS[0], progress: 0 };
let frame = 0;
const TOTAL_FRAMES = 470;

const ease = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

function draw(s) {
  let root = document.getElementById("__tour");
  if (!root) {
    root = document.createElement("div");
    root.id = "__tour";
    root.setAttribute("aria-hidden", "true");
    root.style.cssText = "position:fixed;inset:0;z-index:2147483647;pointer-events:none;font-family:var(--font-sans),system-ui,sans-serif";
    root.innerHTML = `
      <div data-k="spot" style="position:fixed;border-radius:4px"></div>
      <div data-k="caption" style="position:fixed;left:40px;bottom:44px;max-width:640px;background:#1B1714;color:#F4EFE6;padding:18px 22px 18px 26px;box-shadow:0 18px 50px -12px rgba(0,0,0,.55)">
        <div data-k="bar" style="position:absolute;left:0;top:0;bottom:0;width:6px"></div>
        <div data-k="title" style="font-family:var(--font-display),Georgia,serif;font-size:30px;line-height:1.1;font-weight:500;letter-spacing:-.015em"></div>
        <div data-k="sub" style="margin-top:8px;font-size:16px;line-height:1.4;color:#D8CFBF"></div>
      </div>
      <div data-k="ripple" style="position:fixed;border-radius:50%;border:2px solid #1B4DC4"></div>
      <svg data-k="cursor" width="26" height="26" viewBox="0 0 26 26" style="position:fixed;filter:drop-shadow(0 2px 3px rgba(0,0,0,.45))"><path d="M4 2l16 9-7 2-3 8z" fill="#fff" stroke="#1B1714" stroke-width="1.6" stroke-linejoin="round"/></svg>
      <div data-k="progress" style="position:fixed;left:0;bottom:0;height:6px;display:flex;width:100%"></div>
      <div data-k="wipe" style="position:fixed;top:0;bottom:0;left:0;width:100%"></div>`;
    document.documentElement.appendChild(root);
  }
  const el = (key) => root.querySelector(`[data-k="${key}"]`);

  const spot = el("spot");
  if (s.spotlight && s.spotlightIn > 0) {
    const pad = 8;
    spot.style.cssText += `;display:block;left:${s.spotlight.x - pad}px;top:${s.spotlight.y - pad}px;width:${s.spotlight.width + pad * 2}px;height:${s.spotlight.height + pad * 2}px;box-shadow:0 0 0 9999px rgba(20,16,12,${0.42 * s.spotlightIn}),0 0 0 2px rgba(247,220,132,${s.spotlightIn})`;
  } else spot.style.display = "none";

  const caption = el("caption");
  if (s.caption && s.captionIn > 0) {
    caption.style.display = "block";
    caption.style.opacity = String(s.captionIn);
    caption.style.transform = `translateY(${(1 - s.captionIn) * 26}px)`;
    el("bar").style.background = s.caption.color;
    el("title").textContent = s.caption.title;
    el("sub").textContent = s.caption.sub ?? "";
    el("sub").style.display = s.caption.sub ? "block" : "none";
  } else caption.style.display = "none";

  const ripple = el("ripple");
  if (s.ripple > 0) {
    const size = 14 + (1 - s.ripple) * 46;
    ripple.style.cssText += `;display:block;left:${s.cursor.x - size / 2}px;top:${s.cursor.y - size / 2}px;width:${size}px;height:${size}px;opacity:${s.ripple}`;
  } else ripple.style.display = "none";

  const cursor = el("cursor");
  cursor.style.left = `${s.cursor.x - 3}px`;
  cursor.style.top = `${s.cursor.y - 2}px`;

  const progress = el("progress");
  if (!progress.childElementCount) {
    for (const color of s.cloths) {
      const segment = document.createElement("div");
      segment.style.cssText = `height:100%;background:${color};flex:0 0 0%`;
      progress.appendChild(segment);
    }
  }
  [...progress.children].forEach((segment, index) => {
    const share = Math.min(1, Math.max(0, s.progress * s.cloths.length - index));
    segment.style.flexBasis = `${(share * 100) / s.cloths.length}%`;
  });

  const wipe = el("wipe");
  // 0..1 covers from the left; 1..2 uncovers toward the right.
  if (s.wipe > 0 && s.wipe < 2) {
    wipe.style.display = "block";
    wipe.style.background = s.wipeColor;
    wipe.style.transform = s.wipe <= 1 ? `translateX(${-(1 - s.wipe) * 100}%)` : `translateX(${(s.wipe - 1) * 100}%)`;
  } else wipe.style.display = "none";
}

async function shoot() {
  state.progress = frame / TOTAL_FRAMES;
  await page.evaluate(draw, { ...state, cloths: CLOTHS });
  const { data } = await cdp.send("Page.captureScreenshot", { format: "png" });
  writeFileSync(path.join(out, `f${String(frame).padStart(4, "0")}.png`), Buffer.from(data, "base64"));
  frame++;
  if (state.ripple > 0) state.ripple = Math.max(0, state.ripple - 0.25);
  if (state.caption && state.captionIn < 1) state.captionIn = Math.min(1, state.captionIn + 0.25);
  if (state.spotlight && state.spotlightIn < 1) state.spotlightIn = Math.min(1, state.spotlightIn + 0.25);
}

const hold = async (seconds) => {
  for (let i = 0; i < Math.round(seconds * FPS); i++) await shoot();
};

function caption(title, sub, color = CLOTHS[frame % CLOTHS.length]) {
  state.caption = { title, sub, color };
  state.captionIn = 0;
}

async function hideCaption() {
  for (let i = 0; i < 3 && state.caption; i++) {
    state.captionIn = Math.max(0, state.captionIn - 0.34);
    await shoot();
  }
  state.caption = null;
}

async function moveTo(x, y, seconds = 0.6, real = true) {
  const from = { ...state.cursor };
  const steps = Math.max(2, Math.round(seconds * FPS));
  for (let i = 1; i <= steps; i++) {
    const t = ease(i / steps);
    state.cursor = { x: from.x + (x - from.x) * t, y: from.y + (y - from.y) * t };
    if (real) await page.mouse.move(state.cursor.x, state.cursor.y);
    await shoot();
  }
}

async function center(locator) {
  const box = await locator.boundingBox();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, box };
}

async function moveToLocator(locator, seconds) {
  const target = await center(locator);
  await moveTo(target.x, target.y, seconds);
  return target;
}

async function click(locator, seconds) {
  await moveToLocator(locator, seconds);
  state.ripple = 1;
  await locator.click();
  await shoot();
}

async function spotlight(locator) {
  state.spotlight = await locator.boundingBox();
  state.spotlightIn = 0;
}

async function clearSpotlight() {
  for (let i = 0; i < 3 && state.spotlight; i++) {
    state.spotlightIn = Math.max(0, state.spotlightIn - 0.34);
    await shoot();
  }
  state.spotlight = null;
}

async function type(locator, text) {
  for (const char of text) {
    await locator.pressSequentially(char);
    await shoot();
  }
}

// A cloth-colored panel sweeps across, the page changes underneath, and the
// panel sweeps off.
async function wipeTo(action, color) {
  state.wipeColor = color;
  state.caption = null;
  state.spotlight = null;
  for (const value of [0.2, 0.5, 0.8, 1]) {
    state.wipe = value;
    await shoot();
  }
  await action();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(250);
  for (const value of [1.0, 1.25, 1.55, 1.85]) {
    state.wipe = value;
    await shoot();
  }
  state.wipe = 0;
}

const count = (value) => value.toLocaleString("en-US");

// ---- Scene 1: the shelf --------------------------------------------------
await page.goto(base, { waitUntil: "networkidle" });
const status = await (await fetch(`${base}/api/status`)).json();
const documents = status.searchEngine.numberOfDocuments;
await page.waitForTimeout(400);
state.wipeColor = CLOTHS[0];
for (const value of [1.0, 1.3, 1.6, 1.9]) {
  state.wipe = value;
  await shoot();
}
state.wipe = 0;
caption("Five official manuals, one index", `${count(documents)} pages crawled from MDN, React, Next.js, TypeScript and PostgreSQL`, CLOTHS[0]);
await hold(1.2);
const spines = page.getByRole("list", { name: "Indexed sources" }).getByRole("link");
for (const index of [1, 2, 3, 4, 0]) {
  await moveToLocator(spines.nth(index), 0.45);
  await hold(0.35);
}
await hold(0.5);
await hideCaption();

// ---- Scene 2: autocomplete ----------------------------------------------
const homeSearch = page.getByRole("combobox").first();
await click(homeSearch, 0.6);
caption("Autocomplete over document titles", "Prefix lookup against the index, as you type", CLOTHS[1]);
await type(homeSearch, "useEff");
await page.getByRole("option").first().waitFor();
await hold(1.1);
await type(homeSearch, "ect cleanup");
await hold(0.4);
await hideCaption();

// ---- Scene 3: ranked results ---------------------------------------------
await wipeTo(() => homeSearch.press("Enter").then(() => page.locator("article").first().waitFor()), CLOTHS[1]);
const timing = (await page.locator("section[aria-label='Search results'] p .font-mono").first().textContent())?.trim();
caption("Ranked by a BM25 engine written for this project", `Engine time for this query: ${timing}. Mean full HTTP latency at 10,001 documents: ${httpMean} ms`, CLOTHS[3]);
await spotlight(page.locator("article").first());
await hold(2.2);
await clearSpotlight();
await hideCaption();

// ---- Scene 4: provenance --------------------------------------------------
const provenance = page.getByRole("button", { name: "Provenance" }).first();
await click(provenance, 0.6);
await hold(0.2);
caption("Every result shows its working", "Matched fields, relevance score, freshness, and the exact index revision", CLOTHS[4]);
await spotlight(page.locator("article").first().locator("dl"));
await hold(2.2);
await clearSpotlight();
await hideCaption();

// ---- Scene 5: filters in the URL ------------------------------------------
const reference = page.getByRole("complementary", { name: "Search filters" }).getByRole("checkbox", { name: /Reference/ });
await click(reference, 0.7);
await page.waitForURL(/contentType=reference/);
await page.waitForTimeout(350);
caption("Filters live in the URL", "Shareable, and Back returns to the previous query", CLOTHS[2]);
await hold(2.2);
await hideCaption();

// ---- Scene 6: typo recovery -----------------------------------------------
const searchBox = page.getByRole("combobox").first();
await click(searchBox, 0.5);
await searchBox.fill("");
await shoot();
await type(searchBox, "usestaet");
await searchBox.press("Enter");
await page.waitForURL(/q=usestaet/);
await page.locator("article mark").first().waitFor();
await page.waitForTimeout(300);
caption("Bounded typo recovery", "“usestaet” is not in the index, so it is corrected to the nearest term that is", CLOTHS[0]);
await spotlight(page.locator("article").first().locator("h3"));
await hold(2.2);
await clearSpotlight();
await hideCaption();

// ---- Scene 7: a source workspace -------------------------------------------
await wipeTo(() => page.goto(`${base}/sources/postgresql?q=window+functions`), CLOTHS[4]);
await page.locator("article").first().waitFor();
caption("A workspace for each source", "Locked to PostgreSQL: a crafted URL cannot widen the search", CLOTHS[4]);
await moveTo(360, 330, 0.5);
await hold(1.6);
await page.mouse.wheel(0, 420);
await hold(1.4);
await hideCaption();

// ---- Scene 8: insights -----------------------------------------------------
await wipeTo(() => page.goto(`${base}/insights?period=7d`), CLOTHS[3]);
caption("Insights from real searches", "UTC daily buckets; percentiles computed from the underlying events", CLOTHS[3]);
// The pointer is drawn only: hovering the live chart would open its tooltip.
await moveTo(900, 330, 0.6, false);
await hold(2.4);
await hideCaption();

// ---- Scene 9: the reading room at night -----------------------------------
await wipeTo(() => page.goto(base), CLOTHS[2]);
await click(page.getByRole("button", { name: "Theme" }), 0.7);
await hold(0.3);
await click(page.getByRole("menuitemradio", { name: "Dark" }), 0.4);
await hold(0.3);
caption("And the same room at night", "DevDocs Search — custom index, real corpus, measured results", "#DDD3C4");
const finalSpines = page.getByRole("list", { name: "Indexed sources" }).getByRole("link");
for (const index of [0, 2, 4]) {
  await moveToLocator(finalSpines.nth(index), 0.5);
  await hold(0.4);
}
await hold(1.6);

await browser.close();
console.log(`${frame} frames at ${FPS} fps (${(frame / FPS).toFixed(1)} s) in ${out}`);
