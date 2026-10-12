// Ассеты листинга Chrome Web Store в store/: скриншоты 1280×800 (jpeg) с эффектами поверх живой страницы,
// промо-плитка 440×280, marquee 1400×560, иконка 128. Шрифты и воксель берутся из assets витрины lab-sites.
//   node scripts/store-assets.mjs [url] [--assets=<lab-sites>/sites/apps/assets]
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import path from "node:path";
import { copyFileSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { installCursor, moveTo } from "./lib/cursor.mjs";

const require = createRequire(import.meta.url);
const puppeteer = require(path.join(execSync("npm root -g").toString().trim(), "puppeteer"));
const args = process.argv.slice(2);
const url = args.find((a) => !a.startsWith("--")) ?? "https://aimindset.org";
const assets = path.resolve((args.find((a) => a.startsWith("--assets=")) ?? "--assets=E:/AI MINDSET/Tools/lab-sites-apps-canvas/sites/apps/assets").slice(9));
const ext = path.resolve("dist");
const out = path.resolve("store");
const src = path.join(out, "_src");
mkdirSync(path.join(out, "screenshots"), { recursive: true });
mkdirSync(src, { recursive: true });
const profile = path.resolve(`scripts/out/profile-store-${process.pid}`);
rmSync(profile, { recursive: true, force: true });

//   --effects=shatter,frost,glitch,retro-dither,magnify  (порядок = порядок скриншотов)
const effectsArg = (args.find((a) => a.startsWith("--effects=")) ?? "--effects=shatter,frost,glitch,retro-dither,magnify").slice(10);
const SHOTS = effectsArg.split(",").map((slug, i) => [slug, `${String(i + 1).padStart(2, "0")}-${slug}`]);

const browser = await puppeteer.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: false,
  userDataDir: profile,
  defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 1 },
  enableExtensions: true,
  args: ["--enable-blink-features=CanvasDrawElement", "--window-size=1320,920", "--no-first-run", "--allow-file-access-from-files"],
});
await browser.installExtension(ext);
const worker = await browser.waitForTarget((t) => t.type() === "service_worker", { timeout: 15000 }).catch(() => null);
const page = await browser.newPage();
await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 }).catch(() => {});

// Инжект как по клику на иконку: через service worker, иначе прямо в страницу.
let injected = false;
const sw = worker ? await worker.worker().catch(() => null) : null;
if (sw) {
  injected = await sw
    .evaluate(async () => {
      const [tab] = await self.chrome.tabs.query({ active: true, currentWindow: true });
      await self.chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
      return true;
    })
    .catch(() => false);
}
if (!injected) await page.addScriptTag({ path: path.join(ext, "content.js") });
await new Promise((r) => setTimeout(r, 1800));
await installCursor(page, 700, 400);
for (const old of readdirSync(path.join(out, "screenshots"))) rmSync(path.join(out, "screenshots", old));

const pick = (slug) =>
  page.evaluate((s) => {
    const sr = document.querySelector('[data-cua="panel"]').shadowRoot;
    const select = sr.querySelector("select");
    select.value = s;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    return { effect: select.value, status: sr.querySelector(".status")?.hidden ? "" : sr.querySelector(".status")?.textContent };
  }, slug);

for (const [slug, name] of SHOTS) {
  const info = await pick(slug);
  await new Promise((r) => setTimeout(r, 1200));
  if (slug === "bend") {
    // bend складывает края при прокрутке: без скролла виден только нижний загиб
    await page.mouse.wheel({ deltaY: 420 });
    await new Promise((r) => setTimeout(r, 900));
  }
  for (let i = 0; i < 30; i++) {
    await moveTo(page, 700 + Math.sin(i / 3) * 260, 400 + Math.cos(i / 2) * 200, { steps: 4 });
    await new Promise((r) => setTimeout(r, 40));
  }
  await new Promise((r) => setTimeout(r, 700));
  await page.screenshot({ path: path.join(out, "screenshots", `${name}.jpg`), type: "jpeg", quality: 90 });
  console.log(name, JSON.stringify(info));
}

// Промо-плитка и marquee: та же композиция, что social.png витрины.
const font = (w) => pathToFileURL(path.join(assets, `aim-plex-${w}.woff2`)).href;
const voxel = pathToFileURL(path.join(assets, "voxel-canvas.svg")).href;
const tpl = (W, H, s) => `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:AIMPlex;src:url(${font(600)}) format("woff2");font-weight:600}
@font-face{font-family:AIMPlex;src:url(${font(400)}) format("woff2");font-weight:400}
body{margin:0;width:${W}px;height:${H}px;background:#fff;font-family:AIMPlex,"IBM Plex Mono",Menlo,monospace;color:#202124;display:grid;grid-template-columns:1fr ${s.right}px;align-items:center;overflow:hidden}
.l{padding-left:${s.pad}px}.e{font-size:${s.eye}px;letter-spacing:.12em;text-transform:uppercase;color:#6b6e75}
h1{font-size:${s.h1}px;line-height:1.02;letter-spacing:-.04em;margin:${s.gap}px 0;font-weight:600}
p{font-size:${s.p}px;line-height:1.3;margin:0;max-width:${s.pw}px}
.f{margin-top:${s.gap}px;font-size:${s.eye}px;color:#6b6e75}.f b{color:#db303d;font-weight:600}
.r{display:grid;place-items:center;height:${H}px;background:#f4f4f6;border-left:2px solid #e3e4e8}.r img{width:${s.img}px}
</style></head><body><div class="l"><div class="e">AIM mindset apps · chrome extension</div><h1>canvas ui<br>anywhere</h1><p>the canvasui.dev playground on any live page.</p>${s.foot ? '<div class="f">28 effects · live page · props for your agent <b>■</b></div>' : ""}</div><div class="r"><img src="${voxel}"></div></body></html>`;

const promo = {
  "promo-440x280.png": [440, 280, { right: 150, pad: 26, eye: 9, h1: 34, gap: 8, p: 12, pw: 230, img: 104, foot: false }],
  "marquee-1400x560.png": [1400, 560, { right: 520, pad: 90, eye: 18, h1: 76, gap: 20, p: 28, pw: 640, img: 320, foot: true }],
};
for (const [name, [W, H, s]] of Object.entries(promo)) {
  const file = path.join(src, name.replace(".png", ".html"));
  writeFileSync(file, tpl(W, H, s));
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(file).href, { waitUntil: "load", timeout: 20000 });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(out, name), clip: { x: 0, y: 0, width: W, height: H } });
  console.log(name);
}
copyFileSync(path.join(ext, "icons", "128.png"), path.join(out, "icon-128.png"));
await browser.close();
rmSync(profile, { recursive: true, force: true });
console.log("store assets ready:", out);
