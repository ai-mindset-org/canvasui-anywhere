import { color, hexToRgb, scrub } from "../controls.js";
import { createGlyphRain } from "../vendor/lib/GlyphRain/GlyphRainVanilla.ts";

// Перенос canvas-ui/src/demos/glyph-rain-demo.tsx.
const CONTROLS = {
  cell: scrub("Glyph size", 15, { min: 8, max: 48, step: 1, decimals: 0 }),
  speed: scrub("Speed", 0.2, { min: 0.05, max: 3, step: 0.05 }),
  speedVariance: scrub("Speed variance", 0.5, { min: 0, max: 1, step: 0.05 }),
  density: scrub("Density", 0.15, { min: 0, max: 1, step: 0.05 }),
  trail: scrub("Trail", 0.65, { min: 0.2, max: 3, step: 0.05 }),
  glow: scrub("Glow", 1.75, { min: 0, max: 3, step: 0.05 }),
  mutate: scrub("Mutation", 0, { min: 0, max: 4, step: 0.1 }),
  flicker: scrub("Flicker", 0, { min: 0, max: 1, step: 0.05 }),
  layers: scrub("Layers", 2, { min: 1, max: 3, step: 1, decimals: 0 }),
  dim: scrub("Page dim", 0.5, { min: 0, max: 1, step: 0.05 }),
  light: scrub("Light", 2.8, { min: 0, max: 3, step: 0.05 }),
  lightRadius: scrub("Light radius", 240, {
    min: 20,
    max: 600,
    step: 10,
    decimals: 0,
  }),
  lightHeight: scrub("Light height", 172, {
    min: 4,
    max: 300,
    step: 2,
    decimals: 0,
  }),
  relief: scrub("Relief", 0.05, { min: 0, max: 2, step: 0.05 }),
  stir: scrub("Stir", 0.7, { min: 0, max: 1, step: 0.05 }),
  stirRadius: scrub("Stir radius", 260, {
    min: 40,
    max: 900,
    step: 10,
    decimals: 0,
  }),
  settle: scrub("Settle", 0.9, { min: 0.1, max: 4, step: 0.05 }),
  color: color("Rain color", "#4474ff"),
  headColor: color("Head color", "#2b6aff"),
};

export default {
  slug: "glyph-rain",
  name: "Glyph Rain",
  component: "GlyphRain",
  description:
    "Falling glyphs that light up the page, and surge under the cursor.",
  controls: CONTROLS,
  toOptions(values) {
    const { color: rainColor, headColor, ...rest } = values;
    return {
      ...rest,
      color: hexToRgb(rainColor),
      headColor: hexToRgb(headColor),
    };
  },
  create: createGlyphRain,
};
