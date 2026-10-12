import { radio, scrub } from "../controls.js";
import { createPeel } from "../vendor/lib/Peel/PeelVanilla.ts";

// Перенос canvas-ui/src/components/playground/entries/peel-entry.tsx.
const CONTROLS = {
  mode: radio("Mode", "hover", [
    { value: "hover", label: "Hover" },
    { value: "cursor", label: "Cursor" },
  ]),
  side: radio("Side", "left", [
    { value: "left", label: "Left" },
    { value: "right", label: "Right" },
    { value: "top", label: "Top" },
    { value: "bottom", label: "Bottom" },
  ]),
  reveal: scrub("Reveal", 250, { min: 80, max: 480, step: 10, decimals: 0 }),
  zone: scrub("Zone", 200, { min: 40, max: 400, step: 10, decimals: 0 }),
  curl: scrub("Curl", 300, { min: 40, max: 400, step: 10, decimals: 0 }),
  bow: scrub("Bow", 75, { min: -150, max: 150, step: 5, decimals: 0 }),
  shade: scrub("Shade", 0.25, { min: 0, max: 1, step: 0.05 }),
  shine: scrub("Shine", 1, { min: 0, max: 1, step: 0.05 }),
  shineDistance: scrub("Shine distance", 1200, {
    min: 0,
    max: 1200,
    step: 50,
    decimals: 0,
  }),
  bulge: scrub("Bulge", 50, { min: 0, max: 200, step: 10, decimals: 0 }),
  perspective: scrub("Perspective", 2000, {
    min: 400,
    max: 3000,
    step: 50,
    decimals: 0,
  }),
  smoothing: scrub("Smoothing", 0.3, { min: 0.05, max: 1, step: 0.05 }),
};

export default {
  slug: "peel",
  name: "Peel",
  component: "Peel",
  description: "Peels the page back from an edge in 3D.",
  controls: CONTROLS,
  // В плейграунде peel-entry жёстко фиксирует shineColor="auto" (контрола цвета
  // в CONTROLS нет — это entry-версия, не demo-версия с цветовым свотчем), поэтому
  // здесь тоже не заводим color-контрол и всегда просим "auto": Peel сам решает
  // светлый/тёмный блик по теме страницы (см. PeelVanilla shineColor: "auto").
  toOptions(values) {
    return {
      ...values,
      shineColor: "auto",
    };
  },
  create: createPeel,
};
