import { color, hexToRgb, radio, scrub } from "../controls.js";
import { createCloth } from "../vendor/lib/Cloth/ClothVanilla.ts";

// Перенос canvas-ui/src/demos/cloth-demo.tsx.
// Демо оборачивает контент в доп. слои (спейсер высоты, pointer-events-none
// wrapper, max-w контейнер) только чтобы ограничить ширину внутри плейграунда —
// это структура хоста, не опции эффекта.
const AUTO_COLOR = "auto";

const CONTROLS = {
  pin: radio("Pinned edge", "top", [
    { value: "top", label: "Top" },
    { value: "bottom", label: "Bottom" },
    { value: "left", label: "Left" },
    { value: "right", label: "Right" },
  ]),
  backing: color("Backing", AUTO_COLOR, { auto: { label: "Auto" } }),
  wind: scrub("Wind", 3, { min: 0, max: 5, step: 0.05 }),
  speed: scrub("Speed", 0.5, { min: 0, max: 3, step: 0.05 }),
  amplitude: scrub("Fold height", 30, {
    min: 0,
    max: 60,
    step: 1,
    decimals: 0,
  }),
  drape: scrub("Billow", 40, { min: 0, max: 50, step: 1, decimals: 0 }),
  brush: scrub("Brush", 2.05, { min: 0, max: 3, step: 0.05 }),
  brushSize: scrub("Brush size", 150, {
    min: 30,
    max: 260,
    step: 5,
    decimals: 0,
  }),
  damping: scrub("Settle", 1, { min: 0.2, max: 4, step: 0.05 }),
  light: scrub("Lighting", 0.5, { min: 0, max: 1, step: 0.05 }),
  sheen: scrub("Sheen", 0.1, { min: 0, max: 1, step: 0.05 }),
  shadow: scrub("Shadow", 0.25, { min: 0, max: 1, step: 0.05 }),
  cornerRadius: scrub("Corners", 20, {
    min: 0,
    max: 160,
    step: 2,
    decimals: 0,
  }),
  perspective: scrub("Perspective", 1200, {
    min: 400,
    max: 4000,
    step: 50,
    decimals: 0,
  }),
};

export default {
  slug: "cloth",
  name: "Cloth",
  component: "Cloth",
  description: "Hangs the page on rippling fabric.",
  controls: CONTROLS,
  toOptions(values) {
    const { pin, backing, ...rest } = values;
    return {
      ...rest,
      pin,
      backing: backing === AUTO_COLOR ? "auto" : hexToRgb(backing),
    };
  },
  create: createCloth,
};
