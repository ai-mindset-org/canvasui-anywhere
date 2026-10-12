// Проба страниц для скриншотов витрины и Store: несколько сайтов × несколько эффектов, jpg в scripts/out/probe/.
//   node scripts/probe-pages.mjs
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import path from "node:path";
import { mkdirSync, rmSync } from "node:fs";
import { installCursor, moveTo } from "./lib/cursor.mjs";

const require = createRequire(import.meta.url);
const puppeteer = require(path.join(execSync("npm root -g").toString().trim(), "puppeteer"));
const ext = path.resolve("dist");
const out = path.resolve("scripts/out/probe");
mkdirSync(out, { recursive: true });
const profile = path.resolve(`scripts/out/profile-probe-${process.pid}`);
rmSync(profile, { recursive: true, force: true });

//   node scripts/probe-pages.mjs --pages=name=url,name=url --effects=liquid,shatter
const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) ?? `--${k}=${d}`).slice(k.length + 3);
const PAGES = Object.fromEntries(arg("pages", "unsplash=https://unsplash.com/,wiki=https://en.wikipedia.org/wiki/Aurora,canvasui=https://canvasui.dev/").split(",").map((p) => p.split(/=(.*)/s).slice(0, 2)));
const EFFECTS = arg("effects", "liquid,shatter,frost").split(",");

const browser = await puppeteer.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: false,
  userDataDir: profile,
  defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 1 },
  enableExtensions: true,
  args: ["--enable-blink-features=CanvasDrawElement", "--window-size=1320,920", "--no-first-run"],
});
await browser.installExtension(ext);

for (const [name, url] of Object.entries(PAGES)) {
  const page = await browser.newPage();
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 4000));
    await page.addScriptTag({ path: path.join(ext, "content.js") });
    await new Promise((r) => setTimeout(r, 1800));
    await installCursor(page, 700, 400);
    for (const slug of EFFECTS) {
      await page.evaluate((s) => {
        const sel = document.querySelector('[data-cua="panel"]').shadowRoot.querySelector("select");
        sel.value = s;
        sel.dispatchEvent(new Event("change", { bubbles: true }));
      }, slug);
      await new Promise((r) => setTimeout(r, 1000));
      for (let i = 0; i < 30; i++) {
        await moveTo(page, 700 + Math.sin(i / 3) * 300, 400 + Math.cos(i / 2) * 220, { steps: 4 });
        await new Promise((r) => setTimeout(r, 40));
      }
      await new Promise((r) => setTimeout(r, 600));
      await page.screenshot({ path: path.join(out, `${name}-${slug}.jpg`), type: "jpeg", quality: 80 });
      console.log(name, slug);
    }
  } catch (e) {
    console.log(name, "FAIL", e.message.split("\n")[0]);
  }
  await page.close();
}
await browser.close();
rmSync(profile, { recursive: true, force: true });
console.log("probe done");
