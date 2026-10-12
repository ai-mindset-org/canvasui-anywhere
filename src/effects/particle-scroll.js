import { scrub } from "../controls.js";
import { createParticleScroll } from "../vendor/lib/ParticleScroll/ParticleScrollVanilla.ts";

// Перенос canvas-ui/src/demos/particle-scroll-demo.tsx.
const CONTROLS = {
  point: scrub("Point", 0.68, { min: 0.2, max: 1, step: 0.01 }),
  band: scrub("Band", 420, { min: 60, max: 800, step: 20, decimals: 0 }),
  density: scrub("Density", 2, { min: 1.5, max: 8, step: 0.25 }),
  size: scrub("Size", 1.25, { min: 0.5, max: 4, step: 0.25 }),
  spread: scrub("Spread", 220, { min: 0, max: 800, step: 20, decimals: 0 }),
  gravity: scrub("Gravity", 0.35, { min: -1, max: 1, step: 0.05 }),
  drift: scrub("Drift", 0.7, { min: 0, max: 1, step: 0.05 }),
  swirl: scrub("Swirl", 60, { min: 0, max: 300, step: 10, decimals: 0 }),
  stagger: scrub("Stagger", 0.7, { min: 0, max: 1, step: 0.05 }),
  fade: scrub("Fade", 0.85, { min: 0, max: 1, step: 0.05 }),
  settle: scrub("Settle", 1.2, { min: 0.2, max: 3, step: 0.05 }),
  smoothing: scrub("Smoothing", 0.6, { min: 0, max: 1.5, step: 0.05 }),
};

export default {
  slug: "particle-scroll",
  name: "Particle Scroll",
  component: "ParticleScroll",
  description: "The page dissolves into sand below a line.",
  controls: CONTROLS,
  // Фон читается движком напрямую с элемента (getComputedStyle backgroundColor
  // внутри ParticleScrollVanilla), поэтому ctx.background тут не нужен.
  toOptions(values) {
    return { ...values };
  },
  create: createParticleScroll,
};
