// Прогон всех эффектов на одной странице: один запуск Chrome, переключение
// через select панели, скриншот и ошибки консоли по каждому эффекту.
//
//   node scripts/sheet.mjs https://example.com [--only=liquid,vhs] [--keep]
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const puppeteer = require(path.join(execSync("npm root -g").toString().trim(), "puppeteer"));

const args = process.argv.slice(2);
const url = args.find((a) => !a.startsWith("--")) ?? "https://example.com";
const only = args.find((a) => a.startsWith("--only="))?.slice(7).split(",").filter(Boolean);
const keepOpen = args.includes("--keep");
const ext = path.resolve("dist");
const outDir = path.resolve("scripts/out/sheet");
mkdirSync(outDir, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: false,
  userDataDir: path.resolve("scripts/out/profile-sheet"),
  defaultViewport: null,
  enableExtensions: true,
  args: ["--enable-blink-features=CanvasDrawElement", "--window-size=1400,900", "--no-first-run", "--no-default-browser-check"],
});
try {
  await browser.installExtension(ext);
} catch (e) {
  console.log("installExtension failed:", e.message.split("\n")[0]);
}

const page = await browser.newPage();
const errors = [];
page.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warn") errors.push(`${m.type()}: ${m.text()}`);
});
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 }).catch((e) => console.log("goto:", e.message));
await page.addScriptTag({ path: path.join(ext, "content.js") });
await new Promise((r) => setTimeout(r, 1200));

const slugs = await page.evaluate(() => {
  const select = document.querySelector('[data-cua="panel"]')?.shadowRoot?.querySelector("select");
  return select ? [...select.options].map((o) => o.value) : [];
});
console.log("effects:", slugs.length);

const results = [];
for (const slug of slugs) {
  if (only && !only.includes(slug)) continue;
  errors.length = 0;
  await page.evaluate((s) => {
    const select = document.querySelector('[data-cua="panel"]')?.shadowRoot?.querySelector("select");
    select.value = s;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }, slug);
  await new Promise((r) => setTimeout(r, 900));
  // Курсор, клик и скролл, чтобы проявились эффекты, завязанные на взаимодействие.
  for (let i = 0; i < 30; i++) {
    await page.mouse.move(600 + Math.sin(i / 3) * 300, 400 + Math.cos(i / 2) * 220, { steps: 3 });
    await new Promise((r) => setTimeout(r, 30));
  }
  await page.mouse.click(820, 420);
  await page.mouse.wheel({ deltaY: 300 });
  await new Promise((r) => setTimeout(r, 700));
  const state = await page.evaluate(() => {
    const sr = document.querySelector('[data-cua="panel"]')?.shadowRoot;
    const status = sr?.querySelector(".status");
    return {
      power: sr?.querySelector(".power")?.textContent,
      status: status && !status.hidden ? status.textContent : "",
      rows: sr?.querySelectorAll(".row:not([hidden])").length,
      scrollTop: document.querySelector('[data-cua="content"]')?.scrollTop,
    };
  });
  const filtered = errors.filter((e) => !/ERR_NAME_NOT_RESOLVED|mc\.yandex|Failed to load resource|WebSocket/.test(e));
  const shot = path.join(outDir, `${slug}.png`);
  await page.screenshot({ path: shot });
  results.push({ slug, ...state, errors: filtered.slice(0, 5) });
  console.log(slug.padEnd(16), state.power, `rows=${state.rows}`, state.status ? `status="${state.status.slice(0, 80)}"` : "", filtered.length ? `errors=${filtered.length}` : "");
  await page.mouse.wheel({ deltaY: -300 });
}

writeFileSync(path.join(outDir, "report.json"), JSON.stringify(results, null, 2));
console.log("report:", path.join(outDir, "report.json"));
if (!keepOpen) await browser.close();
