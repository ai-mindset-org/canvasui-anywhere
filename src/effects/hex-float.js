import { color, hexToRgb, radio, scrub } from "../controls.js";
import { createHexFloat } from "../vendor/lib/HexFloat/HexFloatVanilla.ts";

// Перенос canvas-ui/src/demos/hex-float-demo.tsx.
const CONTROLS = {
  size: scrub("Size", 160, { min: 24, max: 160, step: 2, decimals: 0 }),
  gap: scrub("Gap", 0, { min: 0, max: 12, step: 0.5, decimals: 1 }),
  bevel: scrub("Bevel", 1.5, { min: 0, max: 20, step: 0.5, decimals: 1 }),
  tilt: scrub("Tilt", 24, { min: -30, max: 30, step: 1, decimals: 0 }),
  perspective: scrub("Perspective", 0.5, { min: 0, max: 1, step: 0.02 }),
  float: scrub("Float", 0, { min: 0, max: 1, step: 0.02 }),
  speed: scrub("Speed", 1, { min: 0.1, max: 3, step: 0.05 }),
  shine: scrub("Shine", 0.5, { min: 0, max: 2, step: 0.05 }),
  lift: scrub("Lift", 0.1, { min: 0, max: 1, step: 0.02 }),
  radius: scrub("Radius", 1200, { min: 60, max: 1400, step: 20, decimals: 0 }),
  flow: scrub("Flow", 0, { min: 0, max: 3, step: 0.05 }),
  swirl: scrub("Swirl", 0, { min: 0, max: 15, step: 0.5, decimals: 1 }),
  trail: scrub("Trail", 0, { min: 0, max: 1, step: 0.02 }),
  iridescence: scrub("Iridescence", 1, { min: 0, max: 2, step: 0.05 }),
  bloom: scrub("Bloom", 0, { min: 0, max: 1, step: 0.02 }),
  grain: scrub("Grain", 0.8, { min: 0, max: 1, step: 0.02 }),
  gapMode: radio("Seam", "auto", [
    { value: "auto", label: "Auto" },
    { value: "custom", label: "Custom" },
  ]),
  gapHex: color("Seam color", "#101014", {
    when: (values) => values.gapMode === "custom",
  }),
};

export default {
  slug: "hex-float",
  name: "Hex Float",
  component: "HexFloat",
  description: "The page on shiny floating hex tiles.",
  controls: CONTROLS,
  toOptions(values) {
    const { gapMode, gapHex, ...rest } = values;
    const gapColor = gapMode === "auto" ? "auto" : hexToRgb(gapHex);
    return {
      ...rest,
      gapColor,
    };
  },
  create: createHexFloat,
};
