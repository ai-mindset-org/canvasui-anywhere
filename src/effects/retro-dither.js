import { color, hexToRgb, radio, scrub } from "../controls.js";
import { createRetroDither } from "../vendor/lib/RetroDither/RetroDitherVanilla.ts";

// Перенос canvas-ui/src/demos/retro-dither-demo.tsx.
const CONTROLS = {
  radius: scrub("Radius", 0.5, { min: 0.1, max: 0.8, step: 0.01 }),
  softness: scrub("Softness", 1, { min: 0, max: 1, step: 0.05 }),
  pixelSize: scrub("Pixel size", 2, { min: 1, max: 12, step: 1, decimals: 0 }),
  levels: scrub("Levels", 4, { min: 1, max: 8, step: 1, decimals: 0 }),
  colorize: scrub("Colorize", 0.1, { min: 0, max: 1, step: 0.05 }),
  contrast: scrub("Contrast", 0.6, { min: 0.5, max: 2, step: 0.05 }),
  brightness: scrub("Brightness", 0, { min: -0.5, max: 0.5, step: 0.05 }),
  strength: scrub("Strength", 0.75, { min: 0, max: 1, step: 0.05 }),
  baseStrength: scrub("Base strength", 0, { min: 0, max: 1, step: 0.05 }),
  invert: scrub("Invert", 0, { min: 0, max: 1, step: 0.05 }),
  scanlines: scrub("Scanlines", 0, { min: 0, max: 1, step: 0.05 }),
  pattern: radio("Pattern", "bayer", [
    { value: "bayer", label: "Bayer" },
    { value: "halftone", label: "Halftone" },
    { value: "hatch", label: "Hatch" },
    { value: "dash", label: "Dash" },
  ]),
  trail: scrub("Trail", 0.4, { min: 0, max: 1, step: 0.05 }),
  degauss: scrub("Degauss", 0.8, { min: 0, max: 1, step: 0.05 }),
  followSpeed: scrub("Follow speed", 3, {
    min: 1,
    max: 20,
    step: 0.5,
    decimals: 1,
  }),
  dark: color("Dark", "#000000"),
  light: color("Light", "#ffffff"),
};

export default {
  slug: "retro-dither",
  name: "Retro Dither",
  component: "RetroDither",
  description: "A retro dithered pass over the live page.",
  controls: CONTROLS,
  toOptions(values) {
    const { dark, light, ...rest } = values;
    return {
      ...rest,
      darkColor: hexToRgb(dark),
      lightColor: hexToRgb(light),
    };
  },
  create: createRetroDither,
};
