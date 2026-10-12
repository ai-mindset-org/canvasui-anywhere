import { color, hexToRgb, scrub, toggle } from "../controls.js";
import { createFrost } from "../vendor/lib/Frost/FrostVanilla.ts";

// Перенос canvas-ui/src/demos/frost-demo.tsx.
const CONTROLS = {
  frost: scrub("Frost", 0.05, { min: 0, max: 1, step: 0.05 }),
  strength: scrub("Strength", 0.7, { min: 0, max: 4, step: 0.1, decimals: 1 }),
  contrast: scrub("Contrast", 3, { min: 0.5, max: 4, step: 0.1, decimals: 1 }),
  crispness: scrub("Crispness", 1, { min: 0.5, max: 4, step: 0.1, decimals: 1 }),
  highlight: scrub("Highlight", 0.3, { min: 0, max: 1, step: 0.05 }),
  haze: scrub("Haze", 0.5, { min: 0, max: 1, step: 0.05 }),
  tintStrength: scrub("Tint", 0.3, { min: 0, max: 1, step: 0.05 }),
  refraction: scrub("Refraction", 1, { min: 0, max: 3, step: 0.1, decimals: 1 }),
  detail: scrub("Detail", 2, { min: 0, max: 6, step: 0.1, decimals: 1 }),
  textureScale: scrub("Texture scale", 2, { min: 0.3, max: 3, step: 0.05 }),
  meltRadius: scrub("Melt radius", 0.25, { min: 0.05, max: 0.5, step: 0.01 }),
  meltNoise: scrub("Melt noise", 0.25, { min: 0, max: 0.5, step: 0.01 }),
  meltStrength: scrub("Melt speed", 0.75, { min: 0.05, max: 1, step: 0.05 }),
  refreeze: scrub("Refreeze", 2, { min: 0, max: 10, step: 0.5, decimals: 1 }),
  opacity: scrub("Opacity", 0.6, { min: 0, max: 1, step: 0.05 }),
  shimmer: scrub("Shimmer", 0, { min: 0, max: 1, step: 0.05 }),
  meltEdges: toggle("Melt edges", true),
  tintThin: color("Tint thin", "#d1dbff"),
  tintThick: color("Tint thick", "#eaf5ff"),
};

export default {
  slug: "frost",
  name: "Frost",
  component: "Frost",
  description: "A frozen pane that melts under the cursor.",
  controls: CONTROLS,
  toOptions(values) {
    const { tintThin, tintThick, meltEdges, ...rest } = values;
    return {
      ...rest,
      meltEdges,
      tintThin: hexToRgb(tintThin),
      tintThick: hexToRgb(tintThick),
    };
  },
  create: createFrost,
};
