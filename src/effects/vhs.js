import { scrub } from "../controls.js";
import { createVHS } from "../vendor/lib/VHS/VHSVanilla.ts";

// Перенос canvas-ui/src/demos/vhs-demo.tsx.
const CONTROLS = {
  speed: scrub("Speed", 0.5, { min: 0, max: 4, step: 0.1, decimals: 1 }),
  wave: scrub("Wave", 1, { min: 0, max: 3, step: 0.05 }),
  jitter: scrub("Jitter", 0.25, { min: 0, max: 3, step: 0.05 }),
  crease: scrub("Crease", 0.1, { min: 0, max: 3, step: 0.05 }),
  switching: scrub("Switching", 0.05, { min: 0, max: 3, step: 0.05 }),
  switchingHeight: scrub("Switch height", 0.02, {
    min: 0,
    max: 0.2,
    step: 0.005,
    decimals: 3,
  }),
  bloom: scrub("Bloom", 0.4, { min: 0, max: 1, step: 0.05 }),
  aberration: scrub("Aberration", 2, {
    min: 0,
    max: 12,
    step: 0.5,
    decimals: 1,
  }),
  acBeat: scrub("AC beat", 1, { min: 0, max: 3, step: 0.05 }),
  grain: scrub("Grain", 0.1, { min: 0, max: 0.5, step: 0.01 }),
  scanlines: scrub("Scanlines", 0.1, { min: 0, max: 1, step: 0.05 }),
  vignette: scrub("Vignette", 0, { min: 0, max: 1, step: 0.05 }),
  barrel: scrub("Barrel", 0, { min: 0, max: 1, step: 0.05 }),
  saturation: scrub("Saturation", 1, { min: 0, max: 2, step: 0.05 }),
  exposure: scrub("Exposure", 1, { min: 0.5, max: 2, step: 0.05 }),
};

export default {
  slug: "vhs",
  name: "VHS",
  component: "VHS",
  description: "Analog tape artifacts over the live page.",
  controls: CONTROLS,
  toOptions(values) {
    return { ...values };
  },
  create: createVHS,
};
