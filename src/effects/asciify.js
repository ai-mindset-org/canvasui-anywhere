import { color, hexToRgb, radio, scrub } from "../controls.js";
import { createAsciify } from "../vendor/lib/Asciify/AsciifyVanilla.ts";

// Перенос canvas-ui/src/demos/asciify-demo.tsx.
const CONTROLS = {
  charset: radio("Charset", "ascii", [
    { value: "ascii", label: "Ascii" },
    { value: "blocks", label: "Blocks" },
    { value: "binary", label: "Binary" },
  ]),
  radius: scrub("Radius", 0.4, { min: 0.1, max: 0.8, step: 0.01 }),
  softness: scrub("Softness", 1, { min: 0, max: 1, step: 0.05 }),
  scale: scrub("Scale", 2, { min: 1, max: 6, step: 0.5, decimals: 1 }),
  spacing: scrub("Spacing", 1, { min: 0, max: 3, step: 1, decimals: 0 }),
  backgroundOpacity: scrub("Bg opacity", 0, { min: 0, max: 1, step: 0.05 }),
  contrast: scrub("Contrast", 1, { min: 0.5, max: 2, step: 0.05 }),
  brightness: scrub("Brightness", 0, { min: -0.5, max: 0.5, step: 0.05 }),
  invert: scrub("Invert", 0, { min: 0, max: 1, step: 0.05 }),
  glow: scrub("Text glow", 0.75, { min: 0, max: 1, step: 0.05 }),
  aberration: scrub("Color fringe", 0.75, { min: 0, max: 1, step: 0.05 }),
  strength: scrub("Strength", 1, { min: 0, max: 1, step: 0.05 }),
  baseStrength: scrub("Base strength", 0, { min: 0, max: 1, step: 0.05 }),
  followSpeed: scrub("Follow speed", 3, {
    min: 1,
    max: 20,
    step: 0.5,
    decimals: 1,
  }),
  background: color("Background", "#000000"),
};

export default {
  slug: "asciify",
  name: "Asciify",
  component: "Asciify",
  description: "An ascii lens that follows your cursor.",
  controls: CONTROLS,
  toOptions(values) {
    const { charset, background, ...rest } = values;
    return {
      ...rest,
      charset,
      background: hexToRgb(background),
    };
  },
  create: createAsciify,
};
