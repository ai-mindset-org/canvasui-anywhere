// Скриншоты панели в двух языках на живой странице: scripts/out/panel-en.png и panel-ru.png.
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import path from "node:path";
import { rmSync } from "node:fs";

const require = createRequire(import.meta.url);
const puppeteer = require(path.join(execSync("npm root -g").toString().trim(), "puppeteer"));
const url = process.argv[2] || "https://aimindset.org";
const ext = path.resolve("dist");
const profile = path.resolve("scripts/out/profile-panel");
rmSync(profile, { recursive: true, force: true });

const browser = await puppeteer.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: false,
  userDataDir: profile,
  defaultViewport: null,
  enableExtensions: true,
  args: ["--enable-blink-features=CanvasDrawElement", "--window-size=1400,900", "--no-first-run"],
});
await browser.installExtension(ext);
const page = await browser.newPage();
await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 }).catch(() => {});
await page.addScriptTag({ path: path.join(ext, "content.js") });
await new Promise((r) => setTimeout(r, 1800));
const read = () =>
  page.evaluate(() => {
    const sr = document.querySelector('[data-cua="panel"]').shadowRoot;
    return {
      lang: sr.querySelector(".panel").lang,
      power: sr.querySelector(".power").textContent,
      labels: [...sr.querySelectorAll(".label")].map((n) => n.textContent),
      buttons: [...sr.querySelectorAll(".actions .btn")].map((n) => n.textContent),
      toggle: sr.querySelector(".lang")?.textContent,
    };
  });
console.log("en:", JSON.stringify(await read()));
await page.screenshot({ path: "scripts/out/panel-en.png" });
await page.evaluate(() => document.querySelector('[data-cua="panel"]').shadowRoot.querySelector(".lang").click());
await new Promise((r) => setTimeout(r, 300));
console.log("ru:", JSON.stringify(await read()));
await page.screenshot({ path: "scripts/out/panel-ru.png" });
// язык переживает перезагрузку панели
await page.reload({ waitUntil: "networkidle2" }).catch(() => {});
await page.addScriptTag({ path: path.join(ext, "content.js") });
await new Promise((r) => setTimeout(r, 1500));
console.log("after reload:", JSON.stringify(await read()));
await browser.close();
rmSync(profile, { recursive: true, force: true });
