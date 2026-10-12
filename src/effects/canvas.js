import { color, hexToRgb, scrub } from "../controls.js";
import { createCanvas } from "../vendor/lib/Canvas/CanvasVanilla.ts";

// Перенос canvas-ui/src/demos/canvas-demo.tsx.
const CONTROLS = {
  threadSize: scrub("Thread size", 2, {
    min: 2,
    max: 12,
    step: 1,
    decimals: 0,
  }),
  threadWidth: scrub("Thread width", 0.2, { min: 0, max: 0.4, step: 0.01 }),
  texture: scrub("Texture", 1, { min: 0, max: 1, step: 0.05 }),
  tintStrength: scrub("Tint strength", 0, { min: 0, max: 1, step: 0.05 }),
  grain: scrub("Grain", 0.5, { min: 0, max: 1, step: 0.05 }),
  halftone: scrub("Halftone", 0.1, { min: 0, max: 1, step: 0.05 }),
  dotSize: scrub("Dot size", 6, { min: 2, max: 10, step: 0.5, decimals: 1 }),
  strength: scrub("Strength", 1, { min: 0, max: 1, step: 0.05 }),
  relief: scrub("Relief", 0.45, { min: 0, max: 1, step: 0.05 }),
  gloss: scrub("Gloss", 0.35, { min: 0, max: 1, step: 0.05 }),
  bristle: scrub("Bristle", 0.4, { min: 0, max: 1, step: 0.05 }),
  dry: scrub("Dry", 2.5, { min: 0.3, max: 8, step: 0.1, decimals: 1 }),
  radius: scrub("Brush radius", 0.08, { min: 0.02, max: 0.25, step: 0.01 }),
  followSpeed: scrub("Follow speed", 3, {
    min: 1,
    max: 20,
    step: 0.5,
    decimals: 1,
  }),
  tint: color("Tint", "#d6cec0"),
};

export default {
  slug: "canvas",
  name: "Canvas",
  component: "Canvas",
  description: "The page painted onto canvas, with a brush for a cursor.",
  controls: CONTROLS,
  toOptions(values) {
    const { tint, ...rest } = values;
    return {
      ...rest,
      tint: hexToRgb(tint),
    };
  },
  create: createCanvas,
};
