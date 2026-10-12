import { radio, scrub, toggle } from "../controls.js";
import { createBend } from "../vendor/lib/Bend/BendVanilla.ts";

// Перенос canvas-ui/src/demos/bend-demo.tsx.
const DIRECTIONS = [
  { value: "out", label: "Outward" },
  { value: "in", label: "Inward" },
];

const CONTROLS = {
  direction: radio("Bend direction", "in", DIRECTIONS),
  top: toggle("Top", true),
  bottom: toggle("Bottom", true),
  zone: scrub("Zone", 240, { min: 60, max: 480, step: 10, decimals: 0 }),
  angle: scrub("Angle", 80, { min: 10, max: 160, step: 5, decimals: 0 }),
  rounding: scrub("Rounding", 150, { min: 0, max: 480, step: 10, decimals: 0 }),
  perspective: scrub("Perspective", 700, {
    min: 200,
    max: 2400,
    step: 50,
    decimals: 0,
  }),
  ease: scrub("Ease", 240, { min: 40, max: 800, step: 20, decimals: 0 }),
  smoothing: scrub("Smoothing", 0.1, { min: 0, max: 0.5, step: 0.01 }),
  tumble: scrub("Tumble", 0.5, { min: 0, max: 1, step: 0.05 }),
  tilt: scrub("Tilt", 0.5, { min: 0, max: 1, step: 0.05 }),
};

export default {
  slug: "bend",
  name: "Bend",
  component: "Bend",
  description: "Folds the page over virtual edges as you scroll.",
  controls: CONTROLS,
  toOptions(values) {
    return { ...values };
  },
  create: createBend,
};
