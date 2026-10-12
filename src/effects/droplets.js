import { color, hexToRgb, scrub } from "../controls.js";
import { createDroplets } from "../vendor/lib/Droplets/DropletsVanilla.ts";

// Перенос canvas-ui/src/demos/droplets-demo.tsx.
const CONTROLS = {
  intensity: scrub("Intensity", 0.5, { min: 0, max: 1.25, step: 0.05 }),
  speed: scrub("Speed", 1, { min: 0, max: 3, step: 0.1, decimals: 1 }),
  scale: scrub("Scale", 0.4, { min: 0.4, max: 2.5, step: 0.05 }),
  dropWidth: scrub("Drop width", 1, { min: 0.4, max: 1.5, step: 0.05 }),
  dropLength: scrub("Drop length", 1, { min: 0.4, max: 2.5, step: 0.05 }),
  refraction: scrub("Refraction", 0.2, {
    min: 0,
    max: 3,
    step: 0.1,
    decimals: 1,
  }),
  blur: scrub("Blur", 0, { min: 0, max: 4, step: 0.1, decimals: 1 }),
  vignette: scrub("Vignette", 0, { min: 0, max: 1, step: 0.05 }),
  fallSpeed: scrub("Fall speed", 1, { min: 0, max: 3, step: 0.1, decimals: 1 }),
  wiggle: scrub("Wiggle", 1, { min: 0, max: 2, step: 0.1, decimals: 1 }),
  staticDrops: scrub("Static drops", 0.2, {
    min: 0,
    max: 3,
    step: 0.1,
    decimals: 1,
  }),
  interactionRadius: scrub("Wipe radius", 0.3, {
    min: 0.02,
    max: 0.4,
    step: 0.01,
  }),
  interactionStrength: scrub("Wipe strength", 0.6, {
    min: 0,
    max: 1,
    step: 0.05,
  }),
  interactionDistortion: scrub("Wipe distort", 3, {
    min: 0,
    max: 3,
    step: 0.1,
    decimals: 1,
  }),
  tintStrength: scrub("Tint strength", 0, { min: 0, max: 1, step: 0.05 }),
  tint: color("Tint", "#8fb4ff"),
};

export default {
  slug: "droplets",
  name: "Droplets",
  component: "Droplets",
  description: "Rain droplets refracting the page.",
  controls: CONTROLS,
  toOptions(values) {
    const { tint, ...rest } = values;
    return {
      ...rest,
      tint: hexToRgb(tint),
    };
  },
  create: createDroplets,
};
