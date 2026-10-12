import { radio, scrub } from "../controls.js";
import { createRipple } from "../vendor/lib/Ripple/RippleVanilla.ts";

// Перенос canvas-ui/src/demos/ripple-demo.tsx.
const CONTROLS = {
  trigger: radio("Trigger", "click", [
    { value: "click", label: "Click" },
    { value: "hover", label: "Hover" },
    { value: "none", label: "None" },
  ]),
  amplitude: scrub("Amplitude", 0.5, { min: 0, max: 3, step: 0.05 }),
  speed: scrub("Speed", 0.65, { min: 0.2, max: 3, step: 0.05 }),
  wavelength: scrub("Wavelength", 80, {
    min: 8,
    max: 80,
    step: 1,
    decimals: 0,
  }),
  rings: scrub("Rings", 2, { min: 1, max: 8, step: 1, decimals: 0 }),
  decay: scrub("Decay", 1, { min: 0.2, max: 3, step: 0.05 }),
  refraction: scrub("Refraction", 100, {
    min: 0,
    max: 160,
    step: 2,
    decimals: 0,
  }),
  dispersion: scrub("Dispersion", 0.5, { min: 0, max: 1, step: 0.02 }),
  shine: scrub("Shine", 0.5, { min: 0, max: 2, step: 0.05 }),
  interval: scrub("Interval", 0, { min: 0, max: 5, step: 0.25 }),
};

export default {
  slug: "ripple",
  name: "Ripple",
  component: "Ripple",
  description: "Click to send water ripples across the page.",
  controls: CONTROLS,
  toOptions(values) {
    return { ...values };
  },
  create: createRipple,
};
