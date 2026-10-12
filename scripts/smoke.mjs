// Дымовой прогон: системный Chrome с флагом HTML-in-canvas + распакованное
// расширение, страница из аргумента, скриншот в scripts/out/.
//
//   node scripts/smoke.mjs https://example.com [slug] [--flag=enable-blink-features=CanvasDrawElement]
//
// Требует глобальный puppeteer (npm i -g puppeteer) и Chrome в Program Files.
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const globalRoot = execSync("npm root -g").toString().trim();
const puppeteer = require(path.join(globalRoot, "puppeteer"));

const args = process.argv.slice(2);
const url = args.find((a) => !a.startsWith("--")) ?? "https://example.com";
const slug = args.filter((a) => !a.startsWith("--"))[1] ?? "";
const flagArg = args.find((a) => a.startsWith("--flag="));
const flag = flagArg ? `--${flagArg.slice(7)}` : "--enable-blink-features=CanvasDrawElement";
const keepOpen = args.includes("--keep");

const ext = path.resolve("dist");
// Брендовый Chrome 137+ игнорирует --load-extension, поэтому по умолчанию
// берём Chrome for Testing из кэша puppeteer; --system-chrome переключает.
const chrome = args.includes("--system-chrome")
  ? "C:/Program Files/Google/Chrome/Application/chrome.exe"
  : puppeteer.executablePath();
mkdirSync("scripts/out", { recursive: true });

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: false,
  userDataDir: path.resolve("scripts/out/profile"),
  defaultViewport: null,
  enableExtensions: true,
  args: [flag, "--window-size=1400,900", "--no-first-run", "--no-default-browser-check"],
});

// Chrome 137+ не грузит --load-extension; puppeteer ставит распакованное
// расширение через CDP Extensions.loadUnpacked. Если и это недоступно,
// content.js подмешивается прямо в страницу (без chrome.storage).
let extensionId = null;
try {
  extensionId = await browser.installExtension(ext);
  console.log("extension installed:", extensionId);
} catch (e) {
  console.log("installExtension failed, fallback to addScriptTag:", e.message.split("\n")[0]);
}

const page = await browser.newPage();
page.on("console", (m) => {
  if (m.type() === "error" || m.text().includes("canvasui")) console.log("[page]", m.type(), m.text());
});
page.on("pageerror", (e) => console.log("[pageerror]", e.message));

await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 }).catch((e) => console.log("goto:", e.message));

const supported = await page.evaluate(() => {
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d");
  return {
    drawElementImage: typeof ctx.drawElementImage,
    requestPaint: typeof c.requestPaint,
    ua: navigator.userAgent,
  };
});
console.log("html-in-canvas:", supported);

// Клик по иконке расширения эмулируем через service worker.
const worker = extensionId
  ? await browser.waitForTarget((t) => t.type() === "service_worker", { timeout: 15000 }).catch(() => null)
  : null;
if (!worker) {
  console.log("service worker not found, injecting content.js into main world");
  await page.addScriptTag({ path: path.join(ext, "content.js") });
} else {
  console.log("service worker:", worker.url());
  const sw = await worker.worker();
  try {
    const info = await sw.evaluate(async () => {
      const [tab] = await self.chrome.tabs.query({ active: true, currentWindow: true });
      await self.chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
      return { tabId: tab.id };
    });
    console.log("injected via service worker:", info);
  } catch (e) {
    console.log("service worker inject failed:", e.message.split("\n")[0]);
    const probe = await sw.evaluate(() => ({ chrome: typeof self.chrome, keys: Object.getOwnPropertyNames(self).slice(0, 15) })).catch((err) => err.message);
    console.log("sw probe:", JSON.stringify(probe));
    await page.addScriptTag({ path: path.join(ext, "content.js") });
  }
}

await new Promise((r) => setTimeout(r, 1500));

if (slug) {
  // Выбор эффекта через select в shadow DOM панели.
  await page.evaluate((s) => {
    const host = document.querySelector('[data-cua="panel"]');
    const select = host?.shadowRoot?.querySelector("select");
    if (!select) return;
    select.value = s;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }, slug);
  await new Promise((r) => setTimeout(r, 1500));
}

// Немного движения мыши, чтобы эффекты с курсором проявились.
for (let i = 0; i < 25; i++) {
  await page.mouse.move(500 + Math.sin(i / 3) * 250, 350 + Math.cos(i / 2) * 200, { steps: 4 });
  await new Promise((r) => setTimeout(r, 40));
}
await new Promise((r) => setTimeout(r, 800));

const report = await page.evaluate(() => {
  const host = document.querySelector('[data-cua="host"]');
  const output = document.querySelector('[data-cua="output"]');
  const panel = document.querySelector('[data-cua="panel"]');
  const status = panel?.shadowRoot?.querySelector(".status");
  const power = panel?.shadowRoot?.querySelector(".power");
  const select = panel?.shadowRoot?.querySelector("select");
  let nonBlank = null;
  if (output) {
    const gl = output.getContext("webgl2");
    if (gl) {
      const px = new Uint8Array(4 * 64);
      gl.readPixels(Math.floor(output.width / 2) - 4, Math.floor(output.height / 2) - 4, 8, 8, gl.RGBA, gl.UNSIGNED_BYTE, px);
      nonBlank = px.some((v, i) => i % 4 === 3 && v > 0);
    }
  }
  return {
    hostPresent: Boolean(host),
    innerChildren: document.querySelector('[data-cua="inner"]')?.childElementCount ?? null,
    outputSize: output ? [output.width, output.height] : null,
    outputHasAlpha: nonBlank,
    power: power?.textContent,
    effect: select?.value,
    status: status?.hidden ? "" : status?.textContent,
    bodyDirectChildren: [...document.body.children].map((e) => e.getAttribute("data-cua") ?? e.tagName),
  };
});
console.log("report:", JSON.stringify(report, null, 2));

const shot = `scripts/out/${(slug || "liquid")}-${new URL(url).hostname}.png`;
await page.screenshot({ path: shot });
console.log("screenshot:", path.resolve(shot));

if (!keepOpen) await browser.close();
