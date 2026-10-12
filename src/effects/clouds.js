import { color, hexToRgb, scrub } from "../controls.js";
import { createClouds } from "../vendor/lib/Clouds/CloudsVanilla.ts";

// Перенос canvas-ui/src/demos/clouds-demo.tsx.
const AUTO_COLOR = "auto";

const CONTROLS = {
  color: color("Color", AUTO_COLOR, { auto: { label: "Auto" } }),
  scale: scrub("Scale", 1, { min: 0.3, max: 3, step: 0.05 }),
  speed: scrub("Speed", 0.6, { min: 0, max: 5, step: 0.1, decimals: 1 }),
  cover: scrub("Cover", 0.1, { min: 0, max: 1, step: 0.02 }),
  density: scrub("Density", 2.5, { min: 0, max: 16, step: 0.5, decimals: 1 }),
  shading: scrub("Shading", 0.1, { min: 0, max: 1, step: 0.02 }),
  opacity: scrub("Opacity", 0.64, { min: 0, max: 1, step: 0.02 }),
  shadow: scrub("Shadow", 0.06, { min: 0, max: 1, step: 0.02 }),
  shadowOffsetX: scrub("Shadow X", 200, {
    min: -300,
    max: 300,
    step: 10,
    decimals: 0,
  }),
  shadowOffsetY: scrub("Shadow Y", -10, {
    min: -300,
    max: 300,
    step: 10,
    decimals: 0,
  }),
  shadowSoftness: scrub("Softness", 1, { min: 0, max: 1, step: 0.02 }),
  wind: scrub("Wind", 0.6, { min: 0, max: 1, step: 0.02 }),
  windRadius: scrub("Wind radius", 350, {
    min: 40,
    max: 400,
    step: 10,
    decimals: 0,
  }),
  refraction: scrub("Refraction", 0, { min: 0, max: 80, step: 1, decimals: 0 }),
  fogBlur: scrub("Fog blur", 0, { min: 0, max: 1, step: 0.02 }),
  quality: scrub("Quality", 1, { min: 0.2, max: 1, step: 0.05 }),
};

export default {
  slug: "clouds",
  name: "Clouds",
  component: "Clouds",
  description: "Theme-aware mist parted by cursor wind.",
  controls: CONTROLS,
  toOptions(values) {
    const { color: colorValue, ...rest } = values;
    return {
      ...rest,
      color: colorValue === AUTO_COLOR ? "auto" : hexToRgb(colorValue),
    };
  },
  create: createClouds,
};
