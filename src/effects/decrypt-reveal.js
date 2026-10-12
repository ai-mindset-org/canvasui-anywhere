import { color, scrub } from "../controls.js";
import { createDecryptReveal } from "../vendor/lib/DecryptReveal/DecryptRevealVanilla.ts";

// Перенос canvas-ui/src/components/playground/entries/decrypt-reveal-entry.tsx.
// Демо читает цвет фона страницы через getComputedStyle(document.body).backgroundColor
// и передаёт его как `background` (raw CSS-цвет, не rgb-массив) — берём из ctx.background.
const CONTROLS = {
  radius: scrub("Radius", 400, { min: 60, max: 900, step: 10, decimals: 0 }),
  softness: scrub("Softness", 0.5, { min: 0.05, max: 1, step: 0.05 }),
  cell: scrub("Cell size", 10, { min: 6, max: 32, step: 1, decimals: 0 }),
  aspect: scrub("Cell aspect", 0.75, { min: 0.35, max: 1.25, step: 0.05 }),
  colored: scrub("Colored", 1, { min: 0, max: 1, step: 0.05 }),
  brightness: scrub("Brightness", 1, { min: 0.2, max: 3, step: 0.05 }),
  legibility: scrub("Legibility", 1, { min: 0, max: 1, step: 0.05 }),
  contrast: scrub("Contrast", 1, { min: 0.3, max: 3, step: 0.05 }),
  exposure: scrub("Exposure", 1, { min: 0.2, max: 3, step: 0.05 }),
  scramble: scrub("Scramble", 0.1, { min: 0, max: 1, step: 0.02 }),
  scrambleSpeed: scrub("Scramble speed", 6, {
    min: 0,
    max: 30,
    step: 0.5,
    decimals: 1,
  }),
  edgeWidth: scrub("Edge width", 0.2, { min: 0, max: 1, step: 0.02 }),
  edgeFlicker: scrub("Edge flicker", 1, { min: 0, max: 1, step: 0.02 }),
  edgeGlow: scrub("Edge glow", 2, { min: 0, max: 3, step: 0.05 }),
  edgeTint: scrub("Edge tint", 0.75, { min: 0, max: 1, step: 0.02 }),
  aberration: scrub("Aberration", 10, { min: 0, max: 24, step: 0.5 }),
  passthrough: scrub("Passthrough", 0.15, { min: 0, max: 1, step: 0.02 }),
  threshold: scrub("Threshold", 0.025, { min: 0.005, max: 0.3, step: 0.005 }),
  smoothing: scrub("Smoothing", 0.2, { min: 0, max: 1, step: 0.05 }),
  color: color("Cipher color", "#4ade80"),
};

export default {
  slug: "decrypt-reveal",
  name: "Decrypt Reveal",
  component: "DecryptReveal",
  description: "UI encrypted into ASCII, decoded by the cursor.",
  controls: CONTROLS,
  toOptions(values, ctx) {
    // `color` — raw CSS-цвет, компонент принимает строку напрямую (не rgb-массив).
    return {
      ...values,
      background: ctx.background,
    };
  },
  create: createDecryptReveal,
};
