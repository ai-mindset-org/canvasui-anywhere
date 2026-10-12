import { scrub } from "../controls.js";
import { createDisplacement } from "../vendor/lib/Displacement/DisplacementVanilla.ts";

// Перенос canvas-ui/src/demos/displacement-demo.tsx.
const CONTROLS = {
  grid: scrub("Grid cells", 50, { min: 4, max: 60, step: 1, decimals: 0 }),
  cellAspect: scrub("Cell aspect", 1, { min: 0.25, max: 4, step: 0.05 }),
  radius: scrub("Radius", 0.1, { min: 0.02, max: 0.6, step: 0.01 }),
  strength: scrub("Strength", 0.1, { min: 0, max: 1, step: 0.01 }),
  threshold: scrub("Speed threshold", 1000, {
    min: 0,
    max: 3000,
    step: 50,
    decimals: 0,
  }),
  relaxation: scrub("Relaxation", 0.9, { min: 0.5, max: 0.99, step: 0.005 }),
  shift: scrub("Shift", 1, { min: 0, max: 4, step: 0.05 }),
  aberration: scrub("Color fringe", 1.5, { min: 0, max: 3, step: 0.05 }),
  grain: scrub("Grain", 0.1, { min: 0, max: 1, step: 0.05 }),
  grainSize: scrub("Grain size", 1, { min: 0.5, max: 4, step: 0.1 }),
  grainSpeed: scrub("Grain speed", 1, { min: 0, max: 4, step: 0.1 }),
  scramble: scrub("Scramble", 1, { min: 0, max: 3, step: 0.1 }),
};

export default {
  slug: "displacement",
  name: "Displacement",
  component: "Displacement",
  description: "Grid cells shearing the page apart under the cursor.",
  controls: CONTROLS,
  toOptions(values) {
    return { ...values };
  },
  create: createDisplacement,
};
