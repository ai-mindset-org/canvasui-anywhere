import { color, hexToRgb, scrub } from "../controls.js";
import { createBubble } from "../vendor/lib/Bubble/BubbleVanilla.ts";

// Перенос canvas-ui/src/demos/bubble-demo.tsx.
const CONTROLS = {
  tint: color("Tint", "#ffffff"),
  colorA: color("Sheen A", "#4a74b8"),
  colorB: color("Sheen B", "#69696a"),
  size: scrub("Size", 30, { min: 12, max: 140, step: 2, decimals: 0 }),
  trail: scrub("Trail", 24, { min: 1, max: 24, step: 1, decimals: 0 }),
  follow: scrub("Follow", 0.5, { min: 0.02, max: 1, step: 0.02 }),
  blend: scrub("Blend", 14, { min: 1, max: 24, step: 0.5, decimals: 1 }),
  speed: scrub("Speed", 2, { min: 0, max: 6, step: 0.1, decimals: 1 }),
  refraction: scrub("Refraction", 80, {
    min: -120,
    max: 120,
    step: 2,
    decimals: 0,
  }),
  dispersion: scrub("Dispersion", 1, { min: 0, max: 3, step: 0.05 }),
  frost: scrub("Frost", 0, { min: 0, max: 1, step: 0.02 }),
  shine: scrub("Shine", 0.25, { min: 0, max: 2, step: 0.05 }),
  rim: scrub("Rim", 0.5, { min: 0, max: 2, step: 0.05 }),
  iridescence: scrub("Iridescence", 1, { min: 0, max: 2, step: 0.05 }),
  intensity: scrub("Intensity", 0.9, {
    min: 0,
    max: 5,
    step: 0.1,
    decimals: 1,
  }),
  tintStrength: scrub("Tint strength", 0, { min: 0, max: 1, step: 0.02 }),
};

export default {
  slug: "bubble",
  name: "Bubble",
  component: "Bubble",
  description: "A glassy droplet trailing the cursor.",
  controls: CONTROLS,
  toOptions(values) {
    const { tint, colorA, colorB, ...rest } = values;
    return {
      ...rest,
      tint: hexToRgb(tint),
      colorA: hexToRgb(colorA),
      colorB: hexToRgb(colorB),
    };
  },
  create: createBubble,
};
