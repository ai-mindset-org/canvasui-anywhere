// Ассеты страницы на apps.aimindset.org: social.png, favicon.svg/32/180, снимки эффектов в jpg. Установка идёт из репозитория, zip не публикуется.
// Запуск: node scripts/site-assets.mjs "<путь к lab-sites>/sites/apps/canvas-ui-anywhere"
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import path from "node:path";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync, rmSync, readdirSync } from "node:fs";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const puppeteer = require(path.join(execSync("npm root -g").toString().trim(), "puppeteer"));
const target = path.resolve(process.argv[2]);
const apps = path.resolve(target, "..");
const assets = path.join(apps, "assets");

// favicon.svg через AIMVoxel.mark, как знак строки меню у остальных продуктов
await import(pathToFileURL(path.join(assets, "aim-voxel.js")).href);
const models = JSON.parse(readFileSync(path.join(assets, "voxel-models.json"), "utf8")).models;
const favicon = globalThis.AIMVoxel.mark(models.canvas, { size: 32 });
writeFileSync(path.join(target, "favicon.svg"), favicon);

// zip на витрину не кладётся (решение 12.10: установка из репозитория, как у Aside Tweaks); старые архивы убираем
for (const old of readdirSync(target).filter((f) => f.endsWith(".zip") || f === "SHA256SUMS.txt")) rmSync(path.join(target, old));
const zipName = "repository";

const browser = await puppeteer.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  args: ["--no-first-run", "--allow-file-access-from-files"],
});
const page = await browser.newPage();

// social 1200×630
await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(path.join(target, "social-source.html")).href, { waitUntil: "load", timeout: 20000 });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: path.join(target, "social.png"), clip: { x: 0, y: 0, width: 1200, height: 630 } });

// favicon png 32 и apple-touch 180 из favicon.svg
for (const [size, name] of [
  [32, "favicon-32.png"],
  [180, "apple-touch-icon.png"],
]) {
  await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
  await page.setContent(
    `<!doctype html><body style="margin:0;background:${size === 180 ? "#fff" : "transparent"}"><img src="${pathToFileURL(path.join(target, "favicon.svg")).href}" style="display:block;width:${size}px;height:${size}px"></body>`,
    { waitUntil: "load", timeout: 20000 },
  );
  await page.screenshot({ path: path.join(target, name), omitBackground: size === 32, clip: { x: 0, y: 0, width: size, height: size } });
}

// снимки эффектов: png из scripts/out/sheet → jpg шириной 1200
mkdirSync(path.join(target, "shots"), { recursive: true });
for (const slug of ["liquid", "shatter", "hex-float", "frost"]) {
  const src = path.resolve("scripts/out/sheet", `${slug}.png`);
  const { w, h } = (() => {
    const b = readFileSync(src);
    return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  })();
  const width = 1200;
  const height = Math.round((h / w) * width);
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  await page.setContent(
    `<!doctype html><body style="margin:0"><img src="${pathToFileURL(src).href}" style="display:block;width:${width}px;height:${height}px"></body>`,
    { waitUntil: "load", timeout: 20000 },
  );
  await page.screenshot({ path: path.join(target, "shots", `${slug}.jpg`), type: "jpeg", quality: 82, clip: { x: 0, y: 0, width, height } });
  console.log(slug, `${width}x${height}`);
}
await browser.close();
console.log("assets ready:", zipName);
