// Правки lab-sites для карточки на apps.aimindset.org: воксель, знак, запись каталога. Повторный запуск безопасен.
// node scripts/site-apply.mjs "<путь к чекауту lab-sites>"
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(process.argv[2]);
const apps = path.join(root, "sites/apps");
const system = path.join(root, "internal-sites/aim-product-system");
const read = (p) => readFileSync(p, "utf8");
const write = (p, s) => writeFileSync(p, s.replace(/\r\n/g, "\n"));

// 1. Воксель «canvas»: лист страницы (рамка ink) и линза (кольцо mid), красный сигнал в правом верхнем углу рамки.
const rows = [
  "########r",
  "#.......#",
  "#..mmm..#",
  "#.m...m.#",
  "#.m...m.#",
  "#.m...m.#",
  "#..mmm..#",
  "#.......#",
  "#.......#",
  "#########",
];
const COLOR = { "#": "ink", m: "mid", r: "red" };
const ys = [5, 6];
const front = 6;
const voxels = [];
rows.forEach((row, i) => {
  const z = rows.length - i;
  [...row].forEach((ch, x) => {
    if (!COLOR[ch]) return;
    for (const y of ys) voxels.push([x + 1, y, z, ch === "r" && y !== front ? "mid" : COLOR[ch]]);
  });
});
const modelsPath = path.join(apps, "assets/voxel-models.json");
const modelsRaw = read(modelsPath);
const models = JSON.parse(modelsRaw);
models.models.canvas = {
  name: "canvas",
  label: "canvas ui anywhere · voxel lens",
  note: "a page frame in ink with a lens ring in mid; the red voxel sits on the top-right corner of the frame, the one dirty accent",
  count: voxels.length,
  gesture: { type: "flash", cells: [[4, 6, 8], [5, 6, 8], [6, 6, 8], [3, 6, 7], [7, 6, 7]], color: "light", hold: 160 },
  voxels,
};
// формат файла: шапка одной строкой, затем каждая модель с новой строки
const names = Object.keys(models.models);
let json = JSON.stringify(models);
json = json.replace(/,"models":\{/, ',"models":{\n');
for (const n of names) json = json.replace(new RegExp(`\\],"${n}":`), `],\n"${n}":`);
write(modelsPath, json + "\n");
console.log("voxel canvas:", voxels.length, "voxels");

// 2. Знак в aim-app-marks.svg и список MARKS в build-marks.mjs.
const marksPath = path.join(system, "assets/aim-app-marks.svg");
let marks = read(marksPath);
if (!marks.includes('id="canvas"')) {
  marks = marks.replace(
    "</defs>",
    '<symbol id="canvas" viewBox="0 0 48 48"><rect x="5" y="5" width="38" height="38" rx="8" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="22" cy="22" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="M27 27l7 7" fill="none" stroke="currentColor" stroke-width="2"/><rect x="32" y="5" width="6" height="4" fill="#db303d"/></symbol>\n</defs>',
  );
  write(marksPath, marks);
}
const buildMarksPath = path.join(system, "build-marks.mjs");
let buildMarks = read(buildMarksPath);
if (!buildMarks.includes("name: 'canvas'")) {
  buildMarks = buildMarks
    .replace(
      "  { name: 'style', symbol: 'style', label: 'style os' },",
      "  { name: 'style', symbol: 'style', label: 'style os' },\n  { name: 'canvas', symbol: 'canvas', label: 'canvas ui anywhere' },",
    )
    .replace("The family and six shipped products", "The family and seven shipped products");
  write(buildMarksPath, buildMarks);
}
console.log("mark canvas: ok");

// 3. Запись каталога.
const catalogPath = path.join(apps, "assets/apps-catalog.json");
const catalogRaw = read(catalogPath);
const catalog = JSON.parse(catalogRaw);
const entry = {
  id: "canvas",
  name: "Canvas UI Anywhere",
  path: "canvas-ui-anywhere/",
  kind: "Chrome extension",
  version: "0.1.0",
  mark: "canvas",
  summary: [
    "The canvasui.dev playground over any page you have open: 28 effects, the playground's controls, Copy props as JSON for your agent.",
    "Плейграунд canvasui.dev поверх любой открытой страницы: 28 эффектов, контролы плейграунда, Copy props в JSON для агента.",
  ],
  preview: "canvas-ui-anywhere/social.png",
  previewVersion: "0.1.0",
  previewKind: "cover",
  installAnchor: "install",
  adoption: [
    "N1 storefront page · the extension panel keeps the playground's own look",
    "Страница витрины N1 · панель расширения сохраняет вид плейграунда",
  ],
  releaseNotes: "canvas-ui-anywhere/release-notes.txt",
};
const i = catalog.products.findIndex((p) => p.id === "canvas");
if (i >= 0) catalog.products[i] = entry;
else catalog.products.push(entry);
catalog.reviewedAt = "2026-10-07";
const indent = catalogRaw.match(/\n(\s+)"schemaVersion"/)?.[1]?.length ?? 2;
write(catalogPath, JSON.stringify(catalog, null, indent) + "\n");
console.log("catalog: canvas entry, products", catalog.products.length);
