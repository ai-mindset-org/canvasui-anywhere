import { color, hexToRgb, radio, scrub, toggle } from "../controls.js";
import { createLiquid } from "../vendor/lib/Liquid/LiquidVanilla.ts";

// Перенос canvas-ui/src/demos/liquid-demo.tsx.
const CONTROLS = {
  quality: radio("Quality", "medium", [
    { value: "low", label: "Low" },
    { value: "medium", label: "Medium" },
    { value: "high", label: "High" },
  ]),
  force: scrub("Force", 1.1, { min: 0, max: 5, step: 0.1, decimals: 1 }),
  radius: scrub("Radius", 0.3, { min: 0.05, max: 1.5, step: 0.05 }),
  curl: scrub("Curl", 1.9, { min: 0, max: 10, step: 0.1, decimals: 1 }),
  pressureIterations: scrub("Swirl", 4, {
    min: 1,
    max: 10,
    step: 1,
    decimals: 0,
  }),
  pressure: scrub("Pressure", 0.8, { min: 0, max: 1, step: 0.05 }),
  intensity: scrub("Intensity", 2, { min: 0, max: 10, step: 0.1, decimals: 1 }),
  distortion: scrub("Distortion", 0.4, { min: 0, max: 2, step: 0.05 }),
  blend: scrub("Blend", 5, { min: 0, max: 20, step: 0.5, decimals: 1 }),
  densityDissipation: scrub("Trail fade", 0.96, {
    min: 0.85,
    max: 1,
    step: 0.005,
    decimals: 3,
  }),
  velocityDissipation: scrub("Motion fade", 1, {
    min: 0.85,
    max: 1,
    step: 0.005,
    decimals: 3,
  }),
  color: color("Color", "#425bff"),
  rainbow: toggle("Rainbow", false),
};

const RESOLUTION_PRESETS = {
  low: { simResolution: 32, dyeResolution: 128 },
  medium: { simResolution: 128, dyeResolution: 512 },
  high: { simResolution: 256, dyeResolution: 1024 },
};

export default {
  slug: "liquid",
  name: "Liquid",
  component: "Liquid",
  description: "A fluid simulation over the live page.",
  controls: CONTROLS,
  toOptions(values) {
    const { color, rainbow, quality, ...rest } = values;
    return {
      ...rest,
      ...RESOLUTION_PRESETS[quality],
      color: hexToRgb(color),
      rainbow,
    };
  },
  create: createLiquid,
};
