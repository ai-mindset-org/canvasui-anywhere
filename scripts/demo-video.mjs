// Демо-ролик: расширение поверх живой страницы, запись через puppeteer screencast, сборка ffmpeg.
//   node scripts/demo-video.mjs <url> [--assets=<lab-sites>/sites/apps/assets] [--out=store/demo]
// Результат: <out>/canvas-ui-anywhere-demo.mp4 (1600×900, h264), рядом raw.webm и кадры подписей.
import { createRequire } from "node:module";
import { execFileSync, execSync } from "node:child_process";
import path from "node:path";
import { mkdirSync, readFileSync, rmSync, writeFile, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { clickAt, installCursor, moveTo, raiseCursor, setPressed } from "./lib/cursor.mjs";

const require = createRequire(import.meta.url);
const puppeteer = require(path.join(execSync("npm root -g").toString().trim(), "puppeteer"));
const args = process.argv.slice(2);
const url = args.find((a) => !a.startsWith("--")) ?? "https://unsplash.com/";
const opt = (k, d) => (args.find((a) => a.startsWith(`--${k}=`)) ?? `--${k}=${d}`).slice(k.length + 3);
const assets = path.resolve(opt("assets", "E:/AI MINDSET/Tools/lab-sites-apps-canvas/sites/apps/assets"));
const out = path.resolve(opt("out", "store/demo"));
const W = 1600;
const H = 900;
const ext = path.resolve("dist");
const profile = path.resolve(`scripts/out/profile-demo-${process.pid}`);
rmSync(profile, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const assembleOnly = args.includes("--assemble-only");
const rec = path.join(out, "_rec");
// ---------- запись ----------
let marks = [];
if (!assembleOnly) {
const browser = await puppeteer.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: false,
  userDataDir: profile,
  defaultViewport: { width: W, height: H, deviceScaleFactor: 1 },
  enableExtensions: true,
  protocolTimeout: 30000,
  args: ["--enable-blink-features=CanvasDrawElement", `--window-size=${W + 40},${H + 120}`, "--no-first-run", "--allow-file-access-from-files"],
});
await browser.installExtension(ext);
const page = await browser.newPage();
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
await sleep(4000);
await page.mouse.move(W * 0.55, H * 0.45);

let t0 = 0;
let cur = { x: W * 0.55, y: H * 0.45 };
const mark = (label) => marks.push({ t: (Date.now() - t0) / 1000, label });
const sr = () => page.evaluate(() => Boolean(document.querySelector('[data-cua="panel"]')?.shadowRoot));
const pick = (slug) =>
  page.evaluate((s) => {
    const root = document.querySelector('[data-cua="panel"]').shadowRoot;
    const sel = root.querySelector("select");
    sel.value = s;
    sel.dispatchEvent(new Event("change", { bubbles: true }));
  }, slug);
const rowRect = (label) =>
  page.evaluate((l) => {
    const root = document.querySelector('[data-cua="panel"]').shadowRoot;
    const row = [...root.querySelectorAll(".row.scrub")].find((r) => r.querySelector(".scrub-label")?.textContent === l);
    if (!row) return null;
    row.scrollIntoView({ block: "center" });
    const r = row.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  }, label);
const btnRect = (text) =>
  page.evaluate((t) => {
    const root = document.querySelector('[data-cua="panel"]').shadowRoot;
    const b = [...root.querySelectorAll("button")].find((x) => x.textContent.trim() === t);
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, text);
const selectRect = () =>
  page.evaluate(() => {
    const r = document.querySelector('[data-cua="panel"]').shadowRoot.querySelector("select").getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
const installPicker = () =>
  page.evaluate(() => {
    const sr = document.querySelector('[data-cua="panel"]').shadowRoot;
    const st = document.createElement("style");
    st.textContent = `select, select::picker(select){appearance:base-select}
select::picker(select){border:1px solid rgba(0,0,0,.14);border-radius:10px;padding:4px;background:#fff;box-shadow:0 12px 36px rgba(0,0,0,.18);margin-top:4px;max-height:none}
select option{padding:3px 10px;border-radius:6px;font:inherit;font-size:13px;line-height:18px}
select option:hover{background:#f0f0f0} select option:checked{background:#e8e8e8;font-weight:600}
select option::checkmark{display:none}`;
    sr.appendChild(st);
  });
const optionRect = (slug) =>
  page.evaluate((v) => {
    const o = [...document.querySelector('[data-cua="panel"]').shadowRoot.querySelector("select").options].find((o) => o.value === v);
    if (!o) return null;
    const r = o.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, slug);
/** Открыть список панели кликом, при browse провести курсором по всем пунктам, кликнуть нужный. */
const pickViaMenu = async (slug, { browse = false } = {}) => {
  const sel = await selectRect();
  cur = await moveTo(page, sel.x, sel.y, { steps: 22, from: cur });
  await sleep(250);
  await clickAt(page, sel.x, sel.y, { hold: 90 });
  await sleep(300);
  await raiseCursor(page);
  await sleep(200);
  let target = await optionRect(slug);
  if (!target) {
    await pick(slug);
    return;
  }
  if (browse) {
    const first = await optionRect("asciify");
    const last = await optionRect("vhs");
    cur = await moveTo(page, first.x, first.y, { steps: 10, from: cur });
    await sleep(350);
    cur = await moveTo(page, last.x, last.y, { steps: 70, from: cur });
    await sleep(500);
    target = await optionRect(slug);
  }
  cur = await moveTo(page, target.x, target.y, { steps: 18, from: cur });
  await sleep(220);
  await clickAt(page, target.x, target.y, { hold: 90 });
  await sleep(350);
  const v = await page.evaluate(() => document.querySelector('[data-cua="panel"]').shadowRoot.querySelector("select").value);
  if (v !== slug) await pick(slug);
};
const clickBtn = async (text) => {
  const p = await btnRect(text);
  if (!p) return false;
  cur = await moveTo(page, p.x, p.y, { steps: 22, from: cur });
  await sleep(250);
  await clickAt(page, p.x, p.y);
  return true;
};
const swirl = async (ms, cx = W * 0.58, cy = H * 0.5, rx = W * 0.26, ry = H * 0.3, speed = 1) => {
  const start = Date.now();
  let i = 0;
  while (Date.now() - start < ms) {
    const a = (i++ / 14) * speed;
    cur = await moveTo(page, cx + Math.sin(a) * rx, cy + Math.cos(a * 0.7) * ry, { steps: 3 });
    await sleep(33);
  }
};
const strokes = async (ms) => {
  const start = Date.now();
  let k = 0;
  while (Date.now() - start < ms) {
    const y = H * 0.22 + (k % 5) * H * 0.14;
    cur = await moveTo(page, W * 0.3, y, { steps: 10, from: cur });
    cur = await moveTo(page, W * 0.95, y + 40, { steps: 28, from: cur });
    k++;
  }
};
const dragSlider = async (label, from, to, ms = 1400) => {
  const r = await rowRect(label);
  if (!r) return false;
  const y = r.y + r.h / 2;
  const x1 = r.x + r.w * from;
  const x2 = r.x + r.w * to;
  cur = await moveTo(page, x1, y, { steps: 18, from: cur });
  await sleep(250);
  await setPressed(page, true);
  await page.mouse.down();
  const steps = 30;
  for (let i = 1; i <= steps; i++) {
    cur = await moveTo(page, x1 + ((x2 - x1) * i) / steps, y);
    await sleep(ms / steps);
  }
  await page.mouse.up();
  await setPressed(page, false);
  await sleep(300);
  return true;
};

// Запись через CDP с реальными таймстемпами кадров: кадры в jpg, длительности в concat-лист ffmpeg.
rmSync(rec, { recursive: true, force: true });
mkdirSync(rec, { recursive: true });
const frames = [];
const cdp = await page.createCDPSession();
cdp.on("Page.screencastFrame", ({ data, sessionId, metadata }) => {
  const i = frames.length;
  frames.push(metadata.timestamp);
  writeFile(path.join(rec, `f${String(i).padStart(5, "0")}.jpg`), Buffer.from(data, "base64"), () => {});
  cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
});
await cdp.send("Page.startScreencast", { format: "jpeg", quality: 82, maxWidth: W, maxHeight: H, everyNthFrame: 2 });
await sleep(300);
t0 = Date.now();
mark("page");
await sleep(1600);

// панель и первый эффект
await page.addScriptTag({ path: path.join(ext, "content.js") });
await sleep(900);
if (!(await sr())) throw new Error("panel did not open");
await installCursor(page, cur.x, cur.y);
await installPicker();
mark("liquid");
await swirl(4200);

// слайдеры как в плейграунде
mark("sliders");
await dragSlider("Force", 0.25, 0.85);
await swirl(1200, W * 0.6, H * 0.5, W * 0.2, H * 0.25, 1.6);
await dragSlider("Swirl", 0.2, 0.9);
await swirl(1800, W * 0.6, H * 0.5, W * 0.22, H * 0.28, 1.6);

// смена эффектов
for (const [slug, ms, how] of [
  ["shatter", 4000, "swirl"],
  ["frost", 4200, "strokes"],
  ["hex-float", 3600, "swirl"],
  ["glitch", 3000, "swirl"],
  ["vhs", 2600, "swirl"],
]) {
  if (slug === "shatter") mark("menu");
  await pickViaMenu(slug, { browse: slug === "shatter" });
  mark(slug);
  cur = await moveTo(page, W * 0.6, H * 0.45, { steps: 16, from: cur });
  if (how === "strokes") await strokes(ms);
  else await swirl(ms);
}

// страница живая: прокрутка под эффектом
await pickViaMenu("bend");
await sleep(300);
mark("scroll");
cur = await moveTo(page, W * 0.6, H * 0.5, { steps: 12, from: cur });
for (let i = 0; i < 10; i++) {
  await page.mouse.wheel({ deltaY: 160 });
  await sleep(130);
}
await sleep(900);
for (let i = 0; i < 10; i++) {
  await page.mouse.wheel({ deltaY: -160 });
  await sleep(130);
}
await sleep(700);

// copy props
mark("copy");
await clickBtn("Copy props");
await sleep(2000);

// stop
mark("stop");
await clickBtn("Stop");
await sleep(2400);
mark("end");

await cdp.send("Page.stopScreencast");
await sleep(300);
await browser.close();
// метки в секундах от первого кадра: Date.now()/1000 и metadata.timestamp идут по одним часам (epoch)
const first = frames[0];
for (const m of marks) m.t = Math.max(0, m.t + (t0 / 1000 - first));
const list = frames
  .map((t, i) => {
    const file = path.join(rec, `f${String(i).padStart(5, "0")}.jpg`).split("\\").join("/");
    // последний кадр держится до метки end: после Stop страница статична и новых кадров не приходит
    const d = i + 1 < frames.length ? frames[i + 1] - t : Math.max(0.5, marks.at(-1).t - (t - first));
    return "file '" + file + "'\nduration " + d.toFixed(4);
  })
  .join("\n");
writeFileSync(path.join(out, "frames.txt"), list + "\n");
console.log("frames", frames.length, "span", (frames.at(-1) - first).toFixed(1) + "s");
rmSync(profile, { recursive: true, force: true });
writeFileSync(path.join(out, "marks.json"), JSON.stringify(marks, null, 2));
console.log("recorded", marks.map((m) => `${m.label}@${m.t.toFixed(1)}`).join(" "));
} else {
  marks = JSON.parse(readFileSync(path.join(out, "marks.json"), "utf8"));
}

// ---------- подписи и карточки ----------
const font = (w) => pathToFileURL(path.join(assets, `aim-plex-${w}.woff2`)).href;
const voxel = pathToFileURL(path.join(assets, "voxel-canvas.svg")).href;
const css = `@font-face{font-family:AIMPlex;src:url(${font(600)}) format("woff2");font-weight:600}
@font-face{font-family:AIMPlex;src:url(${font(400)}) format("woff2");font-weight:400}
body{margin:0;width:${W}px;height:${H}px;font-family:AIMPlex,"IBM Plex Mono",Menlo,monospace;color:#202124;overflow:hidden}`;
const card = (eyebrow, title, sub, foot) => `<!doctype html><html><head><meta charset="utf-8"><style>${css}
body{background:#fff;display:grid;grid-template-columns:1fr 600px;align-items:center}
.l{padding-left:110px}.e{font-size:20px;letter-spacing:.12em;text-transform:uppercase;color:#6b6e75}
h1{font-size:88px;line-height:1.02;letter-spacing:-.04em;margin:22px 0;font-weight:600}
p{font-size:30px;line-height:1.3;margin:0;max-width:700px}
.f{margin-top:26px;font-size:20px;color:#6b6e75}.f b{color:#db303d;font-weight:600}
.r{display:grid;place-items:center;height:${H}px;background:#f4f4f6;border-left:2px solid #e3e4e8}.r img{width:380px}
</style></head><body><div class="l"><div class="e">${eyebrow}</div><h1>${title}</h1><p>${sub}</p>${foot ? `<div class="f">${foot}</div>` : ""}</div><div class="r"><img src="${voxel}"></div></body></html>`;
const caption = (text, small) => `<!doctype html><html><head><meta charset="utf-8"><style>${css}
body{background:transparent}
.c{position:absolute;left:300px;bottom:44px;display:flex;align-items:center;gap:14px;padding:12px 18px 12px 14px;background:rgba(255,255,255,.92);border:1px solid #e3e4e8;border-radius:10px;box-shadow:0 8px 30px rgba(0,0,0,.12)}
.c i{display:block;width:10px;height:10px;background:#db303d}
.c b{font-size:22px;font-weight:600;letter-spacing:-.01em}.c span{font-size:16px;color:#6b6e75}
</style></head><body><div class="c"><i></i><b>${text}</b>${small ? `<span>${small}</span>` : ""}</div></body></html>`;

const CAPS = {
  liquid: ["Liquid", "the real page, the playground's effect"],
  sliders: ["same sliders as the playground", "presets, colours, defaults"],
  menu: ["28 effects in the menu", "the whole playground list"],
  shatter: ["Shatter", ""],
  frost: ["Frost", ""],
  "hex-float": ["Hex Float", ""],
  glitch: ["Glitch", ""],
  vhs: ["VHS", ""],
  scroll: ["Bend · the page stays live", "scrolling, links and buttons go through"],
  copy: ["Copy props", "the component and its props as JSON, for your agent"],
  stop: ["Stop", "the page comes back as it was"],
};

const r = await puppeteer.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  args: ["--no-first-run", "--allow-file-access-from-files"],
});
const p = await r.newPage();
await p.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
const render = async (name, html, transparent) => {
  const file = path.join(out, `${name}.html`);
  writeFileSync(file, html);
  await p.goto(pathToFileURL(file).href, { waitUntil: "load", timeout: 20000 });
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: path.join(out, `${name}.png`), omitBackground: transparent, clip: { x: 0, y: 0, width: W, height: H } });
  rmSync(file);
};
await render("intro", card("AIM mindset apps · chrome extension", "canvas ui<br>anywhere", "the canvasui.dev playground on any live page.", "28 effects · live page · props for your agent <b>■</b>"), false);
await render("outro", card("free · chrome", "try it on<br>your site", "apps.aimindset.org/canvas-ui-anywhere", "needs chrome://flags/#canvas-draw-element <b>■</b>"), false);
for (const [k, v] of Object.entries(CAPS)) await render(`cap-${k}`, caption(v[0], v[1]), true);
await r.close();

// ---------- сборка ----------
const total = marks.at(-1).t;
const seg = (label) => {
  const i = marks.findIndex((m) => m.label === label);
  return [marks[i].t + 0.35, (marks[i + 1]?.t ?? total) - 0.15];
};
const inputs = ["-f", "concat", "-safe", "0", "-i", path.join(out, "frames.txt"), "-loop", "1", "-t", "1.8", "-i", path.join(out, "intro.png"), "-loop", "1", "-t", "2.6", "-i", path.join(out, "outro.png")];
const capKeys = Object.keys(CAPS).filter((k) => marks.some((m) => m.label === k));
for (const k of capKeys) inputs.push("-i", path.join(out, `cap-${k}.png`));
let fc = `[0:v]settb=AVTB,fps=30,scale=${W}:${H}:flags=lanczos,setsar=1,format=rgba[v0];`;
let cur = "v0";
capKeys.forEach((k, i) => {
  const [a, b] = seg(k);
  const next = `v${i + 1}`;
  fc += `[${cur}][${3 + i}:v]overlay=0:0:enable='between(t,${a.toFixed(2)},${b.toFixed(2)})':format=auto[${next}];`;
  cur = next;
});
fc += `[${cur}]format=yuv420p,fade=t=in:st=0:d=0.4,fade=t=out:st=${(total - 0.5).toFixed(2)}:d=0.5[main];`;
fc += `[1:v]fps=30,setsar=1,format=yuv420p,fade=t=out:st=1.4:d=0.4[intro];[2:v]fps=30,setsar=1,format=yuv420p,fade=t=in:st=0:d=0.4[outro];`;
fc += `[intro][main][outro]concat=n=3:v=1:a=0[outv]`;
const mp4 = path.join(out, "canvas-ui-anywhere-demo.mp4");
execFileSync("ffmpeg", ["-y", ...inputs, "-filter_complex", fc, "-map", "[outv]", "-c:v", "libx264", "-preset", "slow", "-crf", "19", "-movflags", "+faststart", mp4], { stdio: ["ignore", "ignore", "inherit"] });
rmSync(rec, { recursive: true, force: true });
console.log("demo ready:", mp4, `${(total + 4.4).toFixed(1)}s`);
