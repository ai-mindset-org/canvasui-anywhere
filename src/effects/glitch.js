import { scrub } from "../controls.js";
import { createGlitch } from "../vendor/lib/Glitch/GlitchVanilla.ts";

// Перенос canvas-ui/src/demos/glitch-demo.tsx.
const CONTROLS = {
  intensity: scrub("Intensity", 1, { min: 0, max: 2, step: 0.05 }),
  interval: scrub("Interval", 3, { min: 0, max: 8, step: 0.25 }),
  duration: scrub("Duration", 0.4, { min: 0.1, max: 2, step: 0.05 }),
  slices: scrub("Slices", 24, { min: 4, max: 80, step: 1, decimals: 0 }),
  shift: scrub("Shift", 30, { min: 0, max: 120, step: 2, decimals: 0 }),
  rgbShift: scrub("RGB Shift", 4, { min: 0, max: 20, step: 0.5, decimals: 1 }),
  blocks: scrub("Blocks", 0.5, { min: 0, max: 1, step: 0.02 }),
  noise: scrub("Noise", 0.35, { min: 0, max: 1, step: 0.02 }),
};

export default {
  slug: "glitch",
  name: "Glitch",
  component: "Glitch",
  description: "Broadcast glitch bursts over the live page.",
  controls: CONTROLS,
  toOptions(values) {
    return { ...values };
  },
  create: createGlitch,
};
