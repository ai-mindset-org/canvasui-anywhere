import { color, hexToRgb, scrub } from "../controls.js";
import { createLaser } from "../vendor/lib/Laser/LaserVanilla.ts";

// Перенос canvas-ui/src/demos/laser-demo.tsx.
const CONTROLS = {
  speed: scrub("Speed", 0.3, { min: 0, max: 4, step: 0.1, decimals: 1 }),
  offset: scrub("Offset", 140, { min: 0, max: 400, step: 4, decimals: 0 }),
  thickness: scrub("Thickness", 6, {
    min: 0.5,
    max: 12,
    step: 0.5,
    decimals: 1,
  }),
  core: scrub("Core", 1, { min: 0, max: 2, step: 0.05 }),
  radius: scrub("Radius", 20, { min: 1, max: 60, step: 1, decimals: 0 }),
  glow: scrub("Glow", 2, { min: 0, max: 3, step: 0.05 }),
  wave: scrub("Wave", 10, { min: 0, max: 24, step: 0.5, decimals: 1 }),
  width: scrub("Width", 0.55, { min: 0.1, max: 1, step: 0.05 }),
  flicker: scrub("Flicker", 0.2, { min: 0, max: 1, step: 0.05 }),
  reveal: scrub("Reveal", 400, { min: 0, max: 480, step: 8, decimals: 0 }),
  heat: scrub("Heat", 1.5, { min: 0, max: 1.5, step: 0.05 }),
  shimmer: scrub("Shimmer", 12, { min: 0, max: 12, step: 0.5, decimals: 1 }),
  sparkle: scrub("Sparkle", 0.25, { min: 0, max: 2, step: 0.05 }),
  reactivity: scrub("Reactivity", 1, {
    min: 0,
    max: 3,
    step: 0.1,
    decimals: 1,
  }),
  color: color("Color", "#0d59ff"),
};

export default {
  slug: "laser",
  name: "Laser",
  component: "Laser",
  description: "A beam that reveals the page on scroll.",
  controls: CONTROLS,
  toOptions(values) {
    const { color, ...rest } = values;
    return {
      ...rest,
      color: hexToRgb(color),
    };
  },
  create: createLaser,
};
