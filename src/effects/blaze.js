import { color, hexToRgb, scrub } from "../controls.js";
import { createBlaze } from "../vendor/lib/Blaze/BlazeVanilla.ts";

// Перенос canvas-ui/src/demos/blaze-demo.tsx.
const CONTROLS = {
  height: scrub("Height", 0.97, { min: 0.1, max: 1, step: 0.01 }),
  distortion: scrub("Distortion", 0.6, {
    min: 0,
    max: 3,
    step: 0.1,
    decimals: 1,
  }),
  distortionScale: scrub("Heat scale", 0.5, { min: 0.3, max: 3, step: 0.05 }),
  speed: scrub("Speed", 1, { min: 0, max: 3, step: 0.1, decimals: 1 }),
  sparks: scrub("Sparks", 0.5, { min: 0, max: 2, step: 0.05 }),
  sparkDensity: scrub("Spark density", 1.5, { min: 0.3, max: 3, step: 0.05 }),
  sparkSize: scrub("Spark size", 1, { min: 0.5, max: 3, step: 0.05 }),
  layers: scrub("Layers", 4, { min: 1, max: 10, step: 1, decimals: 0 }),
  smoke: scrub("Smoke", 0.5, { min: 0, max: 2, step: 0.05 }),
  glow: scrub("Glow", 1.5, { min: 0, max: 3, step: 0.1, decimals: 1 }),
  spark: color("Spark", "#ff660d"),
  smokeColor: color("Smoke", "#ff6e1a"),
};

export default {
  slug: "blaze",
  name: "Blaze",
  component: "Blaze",
  description: "Fire, smoke, and heat rising over the page.",
  controls: CONTROLS,
  toOptions(values) {
    const { spark, smokeColor, ...rest } = values;
    return {
      ...rest,
      sparkColor: hexToRgb(spark),
      smokeColor: hexToRgb(smokeColor),
    };
  },
  create: createBlaze,
};
