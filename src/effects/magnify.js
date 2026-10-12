import { color, hexToRgb, radio, scrub, toggle } from "../controls.js";
import { createMagnify } from "../vendor/lib/Magnify/MagnifyVanilla.ts";

// Перенос canvas-ui/src/demos/magnify-demo.tsx.
const CONTROLS = {
  color: color("Accent", "#cccccc"),
  ring: toggle("Ring", true),
  crosshair: toggle("Crosshair", true),
  ticks: toggle("Ticks", true),
  brackets: toggle("Brackets", true),
  dot: toggle("Center dot", true),
  grid: toggle("Grid", false),
  readout: toggle("Readout", true),
  ripples: toggle("Click ripples", true),
  scrollZoom: toggle("Scroll zoom", false),
  zoomModifier: radio(
    "Hold",
    "shift",
    [
      { value: "shift", label: "Shift" },
      { value: "alt", label: "Alt" },
      { value: "ctrl", label: "Ctrl" },
      { value: "none", label: "None" },
    ],
    { when: (values) => values.scrollZoom === true },
  ),
  size: scrub("Size", 140, { min: 60, max: 260, step: 4, decimals: 0 }),
  zoom: scrub("Zoom", 1.5, { min: 1, max: 4, step: 0.05 }),
  follow: scrub("Follow", 0.25, { min: 0.02, max: 1, step: 0.02 }),
  hud: scrub("HUD", 0.8, { min: 0, max: 1, step: 0.02 }),
  aberration: scrub("Aberration", 0.8, { min: 0, max: 3, step: 0.05 }),
  haze: scrub("Haze", 0.2, { min: 0, max: 1, step: 0.02 }),
  rippleSpeed: scrub("Ripple speed", 900, {
    min: 200,
    max: 2400,
    step: 50,
    decimals: 0,
  }),
  rippleWidth: scrub("Ripple width", 2, {
    min: 0.5,
    max: 24,
    step: 0.5,
    decimals: 1,
  }),
  rippleBendWidth: scrub("Bend width", 100, {
    min: 10,
    max: 240,
    step: 5,
    decimals: 0,
  }),
  rippleBend: scrub("Ripple bend", 20, {
    min: 0,
    max: 120,
    step: 2,
    decimals: 0,
  }),
  rippleGlow: scrub("Ripple glow", 1, { min: 0, max: 2, step: 0.05 }),
};

export default {
  slug: "magnify",
  name: "Magnify",
  component: "Magnify",
  description: "A sci-fi scanner lens with click ripples.",
  controls: CONTROLS,
  toOptions(values) {
    const { color, ...rest } = values;
    return {
      ...rest,
      color: hexToRgb(color),
    };
  },
  create: createMagnify,
};
