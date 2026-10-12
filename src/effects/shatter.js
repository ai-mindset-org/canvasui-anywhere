import { color, hexToRgb, scrub } from "../controls.js";
import { createShatter } from "../vendor/lib/Shatter/ShatterVanilla.ts";

// Перенос canvas-ui/src/demos/shatter-demo.tsx.
const LIGHT_GAP = "#ffffff";
const DARK_GAP = "#0a0a0a";

const CONTROLS = {
  radius: scrub("Radius", 0.4, { min: 0.1, max: 0.8, step: 0.01 }),
  softness: scrub("Softness", 0.6, { min: 0, max: 1, step: 0.05 }),
  tileSize: scrub("Tile size", 125, {
    min: 40,
    max: 220,
    step: 5,
    decimals: 0,
  }),
  shards: scrub("Shards", 1, { min: 0, max: 1, step: 0.05 }),
  corner: scrub("Corner", 0, { min: 0, max: 30, step: 1, decimals: 0 }),
  lift: scrub("Lift", 30, { min: 0, max: 120, step: 2, decimals: 0 }),
  tilt: scrub("Tilt", 2, { min: 0, max: 3, step: 0.05 }),
  scatter: scrub("Scatter", 5, { min: 0, max: 30, step: 1, decimals: 0 }),
  perspective: scrub("Perspective", 1500, {
    min: 300,
    max: 2000,
    step: 50,
    decimals: 0,
  }),
  shadow: scrub("Shadow", 0.5, { min: 0, max: 2, step: 0.05 }),
  shading: scrub("Shading", 0.5, { min: 0, max: 2, step: 0.05 }),
  refraction: scrub("Refraction", 1.5, { min: 0, max: 2, step: 0.05 }),
  dispersion: scrub("Dispersion", 0.3, { min: 0, max: 1, step: 0.05 }),
  floatSpeed: scrub("Float speed", 2, {
    min: 0,
    max: 4,
    step: 0.1,
    decimals: 1,
  }),
  strength: scrub("Strength", 1, { min: 0, max: 1, step: 0.05 }),
  baseStrength: scrub("Base strength", 0, { min: 0, max: 1, step: 0.05 }),
  followSpeed: scrub("Follow speed", 3, {
    min: 1,
    max: 20,
    step: 0.5,
    decimals: 1,
  }),
  gap: color("Gap color", "", { auto: { label: "Auto" } }),
};

// Демо берёт тему через next-themes useTheme() (resolvedTheme) — в расширении
// такого хука нет, поэтому тему приходится вычислять из фона хост-страницы:
// парсим ctx.background (css color) и считаем relative luminance; тёмная тема,
// если luminance < 0.5. При "auto" (gap === "") это даёт тот же LIGHT_GAP/DARK_GAP,
// что и оригинальный демо-переключатель.
function parseCssColor(css) {
  if (!css) return [255, 255, 255];
  const match = css.match(/[\d.]+/g);
  if (!match) return [255, 255, 255];
  const [r, g, b] = match.map(Number);
  return [r ?? 255, g ?? 255, b ?? 255];
}

function isDarkBackground(background) {
  const [r, g, b] = parseCssColor(background);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance < 0.5;
}

export default {
  slug: "shatter",
  name: "Shatter",
  component: "Shatter",
  description: "Shatters the page into glass shards.",
  controls: CONTROLS,
  toOptions(values, ctx) {
    const { gap, ...rest } = values;
    const themeGap = isDarkBackground(ctx.background) ? DARK_GAP : LIGHT_GAP;
    const effectiveGap = gap === "" ? themeGap : gap;
    return {
      ...rest,
      gapColor: hexToRgb(effectiveGap),
    };
  },
  create: createShatter,
};
