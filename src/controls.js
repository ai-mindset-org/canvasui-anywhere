// Схема контролов, один в один с canvas-ui/src/components/demos/control-schema.ts,
// чтобы демо из плейграунда переносились без правок значений.

export function scrub(label, defaultValue, range) {
  return {
    kind: "scrub",
    label,
    defaultValue,
    min: range.min,
    max: range.max,
    step: range.step,
    decimals: range.decimals ?? 2,
    when: range.when,
  };
}

export function toggle(label, defaultValue, opts = {}) {
  return { kind: "toggle", label, defaultValue, when: opts.when };
}

export function color(label, defaultValue, opts = {}) {
  return {
    kind: "color",
    label,
    defaultValue,
    auto: opts.auto && {
      label: opts.auto.label,
      swatch: opts.auto.swatch ?? "#ffffff",
    },
    when: opts.when,
  };
}

export function radio(label, defaultValue, options, opts = {}) {
  return { kind: "radio", label, defaultValue, options, when: opts.when };
}

export function custom(defaultValue) {
  return { kind: "custom", defaultValue };
}

export function hexToRgb(hex) {
  const value = parseInt(hex.slice(1), 16);
  return [
    ((value >> 16) & 255) / 255,
    ((value >> 8) & 255) / 255,
    (value & 255) / 255,
  ];
}

export function schemaDefaults(schema) {
  const out = {};
  for (const [key, control] of Object.entries(schema)) {
    out[key] = control.defaultValue;
  }
  return out;
}

export function isVisible(control, values) {
  if (control.kind === "custom") return false;
  return control.when ? Boolean(control.when(values)) : true;
}
