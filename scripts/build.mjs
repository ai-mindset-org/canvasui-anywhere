import { build } from "esbuild";
import { mkdirSync, copyFileSync, writeFileSync, readFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { createHash } from "node:crypto";
import { zipDirectory } from "./zip.mjs";

mkdirSync("dist/icons", { recursive: true });

await build({
  entryPoints: ["src/content.js", "src/background.js"],
  bundle: true,
  format: "iife",
  target: "chrome120",
  outdir: "dist",
  logLevel: "info",
  legalComments: "none",
  minify: process.argv.includes("--min"),
});

copyFileSync("src/manifest.json", "dist/manifest.json");

// Иконка: чёрный скруглённый квадрат с белой рамкой, PNG без зависимостей.
function crc32(buf) {
  let crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    let c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function icon(size) {
  const stride = size * 4 + 1;
  const raw = Buffer.alloc(stride * size);
  const r = size * 0.22;
  const inner = size * 0.28;
  const border = Math.max(1, size * 0.09);
  for (let y = 0; y < size; y++) {
    raw[y * stride] = 0;
    for (let x = 0; x < size; x++) {
      const i = y * stride + 1 + x * 4;
      const cx = Math.max(r - x, 0, x - (size - 1 - r));
      const cy = Math.max(r - y, 0, y - (size - 1 - r));
      const outside = cx * cx + cy * cy > r * r;
      const inFrame = x >= inner && x < size - inner && y >= inner && y < size - inner;
      const inHole =
        x >= inner + border &&
        x < size - inner - border &&
        y >= inner + border &&
        y < size - inner - border;
      const white = inFrame && !inHole;
      const v = white ? 255 : 10;
      raw[i] = v;
      raw[i + 1] = v;
      raw[i + 2] = v;
      raw[i + 3] = outside ? 0 : 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

for (const size of [16, 48, 128]) writeFileSync(`dist/icons/${size}.png`, icon(size));
// Релиз: zip для «загрузить распакованное» и SHA256SUMS в формате витрины apps.aimindset.org.
const manifest = JSON.parse(readFileSync("src/manifest.json", "utf8"));
mkdirSync("release", { recursive: true });
const zipName = `Canvas-UI-Anywhere-${manifest.version}-chrome.zip`;
const zip = zipDirectory("dist", "canvas-ui-anywhere/");
writeFileSync(`release/${zipName}`, zip);
const sha = createHash("sha256").update(zip).digest("hex");
writeFileSync("release/SHA256SUMS.txt", `${sha}  ${zipName}
`);
// Chrome Web Store принимает manifest только в корне архива: отдельный zip без подпапки.
const storeZipName = `Canvas-UI-Anywhere-${manifest.version}-webstore.zip`;
const storeZip = zipDirectory("dist", "");
writeFileSync(`release/${storeZipName}`, storeZip);
console.log("dist ready ·", zipName, (zip.length / 1024).toFixed(0) + "kb", sha.slice(0, 12), "·", storeZipName);
