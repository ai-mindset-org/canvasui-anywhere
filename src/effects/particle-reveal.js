import { scrub } from "../controls.js";
import { createParticleReveal } from "../vendor/lib/ParticleReveal/ParticleRevealVanilla.ts";

// Перенос canvas-ui/src/components/playground/entries/particle-reveal-entry.tsx.
const CONTROLS = {
  radius: scrub("Radius", 500, { min: 60, max: 900, step: 10, decimals: 0 }),
  softness: scrub("Softness", 0.75, { min: 0.05, max: 1, step: 0.05 }),
  size: scrub("Size", 1, { min: 0.5, max: 3, step: 0.25 }),
  scatter: scrub("Scatter", 25, { min: 0, max: 200, step: 5, decimals: 0 }),
  drift: scrub("Drift", 1, { min: 0, max: 2, step: 0.1, decimals: 1 }),
  aberration: scrub("Aberration", 40, {
    min: 0,
    max: 80,
    step: 2,
    decimals: 0,
  }),
  bend: scrub("Bend", 50, { min: 0, max: 240, step: 10, decimals: 0 }),
  fade: scrub("Fade", 0.85, { min: 0, max: 1, step: 0.05 }),
  threshold: scrub("Threshold", 0.1, { min: 0, max: 0.3, step: 0.01 }),
  smoothing: scrub("Smoothing", 0.25, { min: 0, max: 1, step: 0.05 }),
};

export default {
  slug: "particle-reveal",
  name: "Particle Reveal",
  component: "ParticleReveal",
  description: "UI revealed from fine particles by the cursor.",
  controls: CONTROLS,
  // В плейграунде entry читает фон страницы через getComputedStyle(document.body)
  // и следит за сменой темы через MutationObserver на classList <html>. Тут просто
  // берём текущий css-цвет фона хоста из ctx — ParticleRevealVanilla сам парсит
  // произвольную css-строку цвета (options.background, см. parseColor в vendor).
  toOptions(values, ctx) {
    return {
      ...values,
      background: ctx.background,
    };
  },
  create: createParticleReveal,
};
