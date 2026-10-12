import { color, hexToRgb, scrub } from "../controls.js";
import { createGrid } from "../vendor/lib/Grid/GridVanilla.ts";

// Перенос canvas-ui/src/demos/grid-demo.tsx.
const CONTROLS = {
  tileSize: scrub("Tile size", 150, {
    min: 16,
    max: 160,
    step: 2,
    decimals: 0,
  }),
  gap: scrub("Gap", 0, { min: 0, max: 12, step: 0.5, decimals: 1 }),
  cornerRadius: scrub("Corner radius", 0, {
    min: 0,
    max: 24,
    step: 1,
    decimals: 0,
  }),
  amplitude: scrub("Amplitude", 2.5, { min: 0, max: 3, step: 0.05 }),
  waveSpeed: scrub("Wave speed", 0.5, { min: 0.1, max: 3, step: 0.05 }),
  frequency: scrub("Frequency", 12, {
    min: 1,
    max: 40,
    step: 0.5,
    decimals: 1,
  }),
  waveWidth: scrub("Wave width", 0.05, { min: 0.02, max: 0.5, step: 0.01 }),
  fadeTime: scrub("Fade time", 0.2, {
    min: 0.2,
    max: 6,
    step: 0.1,
    decimals: 1,
  }),
  maxLift: scrub("Max lift", 1, { min: 0.1, max: 1, step: 0.05 }),
  jitter: scrub("Jitter", 0, { min: 0, max: 1, step: 0.05 }),
  liftHeight: scrub("Lift height", 60, {
    min: 0,
    max: 160,
    step: 2,
    decimals: 0,
  }),
  perspective: scrub("Perspective", 1200, {
    min: 300,
    max: 4000,
    step: 50,
    decimals: 0,
  }),
  tilt: scrub("Tilt", 1, { min: 0, max: 1, step: 0.05 }),
  shading: scrub("Shading", 0.05, { min: 0, max: 2, step: 0.05 }),
  tintStrength: scrub("Tint strength", 0.1, { min: 0, max: 1, step: 0.05 }),
  idleRipples: scrub("Idle ripples", 0, {
    min: 0,
    max: 6,
    step: 0.5,
    decimals: 1,
  }),
  tint: color("Tint", "#0055ff"),
};

export default {
  slug: "grid",
  name: "Grid",
  component: "Grid",
  description: "3D tiles rippling around the cursor.",
  controls: CONTROLS,
  toOptions(values) {
    const { tint, ...rest } = values;
    return {
      ...rest,
      tint: hexToRgb(tint),
    };
  },
  create: createGrid,
};
