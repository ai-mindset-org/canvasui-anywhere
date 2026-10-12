import { color, hexToRgb, scrub } from "../controls.js";
import { createFlameWrap } from "../vendor/lib/FlameWrap/FlameWrapVanilla.ts";

// Перенос canvas-ui/src/components/playground/entries/flame-wrap-entry.tsx
// (контролы FLAME_WRAP_CONTROLS определены в canvas-ui/src/demos/flame-wrap-demo.tsx).
const CONTROLS = {
  flame: color("Color", "#4e89ff"),
  intensity: scrub("Intensity", 0.5, { min: 0, max: 3, step: 0.05 }),
  height: scrub("Flame height", 170, {
    min: 40,
    max: 200,
    step: 2,
    decimals: 0,
  }),
  spread: scrub("Glow spread", 8, { min: 8, max: 96, step: 1, decimals: 0 }),
  radius: scrub("Corner radius", 40, { min: 0, max: 48, step: 1, decimals: 0 }),
  speed: scrub("Speed", 0.25, { min: 0, max: 3, step: 0.05 }),
  scale: scrub("Detail", 0.75, { min: 0.05, max: 1, step: 0.01 }),
  turbulence: scrub("Turbulence", 0.5, { min: 0, max: 1, step: 0.01 }),
  turbulenceScale: scrub("Turbulence scale", 0.5, {
    min: 0.2,
    max: 3,
    step: 0.05,
  }),
  turbulenceReach: scrub("Turbulence reach", 25, {
    min: 4,
    max: 80,
    step: 1,
    decimals: 0,
  }),
  sparks: scrub("Sparks", 1.5, { min: 0, max: 3, step: 0.05 }),
  sparkSize: scrub("Spark size", 0.35, { min: 0.2, max: 2.5, step: 0.05 }),
  sparkDensity: scrub("Spark density", 1, { min: 0.3, max: 2.5, step: 0.05 }),
  sparkSpeed: scrub("Spark speed", 1, { min: 0.1, max: 3, step: 0.05 }),
  rim: scrub("Molten rim", 2.5, { min: 0, max: 3, step: 0.05 }),
  melt: scrub("Edge melt", 4.5, { min: 0, max: 24, step: 0.5, decimals: 1 }),
  distortion: scrub("Heat shimmer", 10, {
    min: 0,
    max: 16,
    step: 0.5,
    decimals: 1,
  }),
  smoke: scrub("Smoke", 1.5, { min: 0, max: 2, step: 0.05 }),
  ember: scrub("Ember glow", 2, { min: 0, max: 2, step: 0.05 }),
  scorch: scrub("Scorch", 0, { min: 0, max: 2, step: 0.05 }),
};

export default {
  slug: "flame-wrap",
  name: "Flame Wrap",
  component: "FlameWrap",
  description: "A card wrapped in a border of fire.",
  controls: CONTROLS,
  toOptions(values) {
    const { flame, ...rest } = values;
    return {
      ...rest,
      color: hexToRgb(flame),
    };
  },
  create: createFlameWrap,
};
