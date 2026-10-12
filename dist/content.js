(() => {
  // src/controls.js
  function scrub(label, defaultValue, range) {
    return {
      kind: "scrub",
      label,
      defaultValue,
      min: range.min,
      max: range.max,
      step: range.step,
      decimals: range.decimals ?? 2,
      when: range.when
    };
  }
  function toggle(label, defaultValue, opts = {}) {
    return { kind: "toggle", label, defaultValue, when: opts.when };
  }
  function color(label, defaultValue, opts = {}) {
    return {
      kind: "color",
      label,
      defaultValue,
      auto: opts.auto && {
        label: opts.auto.label,
        swatch: opts.auto.swatch ?? "#ffffff"
      },
      when: opts.when
    };
  }
  function radio(label, defaultValue, options, opts = {}) {
    return { kind: "radio", label, defaultValue, options, when: opts.when };
  }
  function hexToRgb(hex) {
    const value = parseInt(hex.slice(1), 16);
    return [
      (value >> 16 & 255) / 255,
      (value >> 8 & 255) / 255,
      (value & 255) / 255
    ];
  }
  function schemaDefaults(schema) {
    const out = {};
    for (const [key, control] of Object.entries(schema)) {
      out[key] = control.defaultValue;
    }
    return out;
  }
  function isVisible(control, values) {
    if (control.kind === "custom") return false;
    return control.when ? Boolean(control.when(values)) : true;
  }

  // src/vendor/lib/canvas-viewport.ts
  var canvasDimensionLimits = /* @__PURE__ */ new WeakMap();
  function getCanvasPixelRatio(element, context) {
    const scale = window.visualViewport?.scale || 1;
    const requested = Math.min(window.devicePixelRatio || 1, 2) * scale;
    const width = Math.max(element.clientWidth, 1);
    const height = Math.max(element.clientHeight, 1);
    let maxDimension = 8192;
    if (context) {
      let limit = canvasDimensionLimits.get(context);
      if (limit === void 0) {
        limit = Math.min(
          maxDimension,
          context.getParameter(context.MAX_TEXTURE_SIZE),
          context.getParameter(context.MAX_RENDERBUFFER_SIZE)
        );
        canvasDimensionLimits.set(context, limit);
      }
      maxDimension = limit;
    }
    return Math.min(
      requested,
      maxDimension / Math.max(width, height),
      Math.sqrt(16777216 / (width * height))
    );
  }
  function createCanvasResizeObserver(onResize) {
    const viewport = window.visualViewport;
    let frame = 0;
    let disconnected = false;
    const schedule = () => {
      if (frame || disconnected) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        onResize();
      });
    };
    const observer = new ResizeObserver(schedule);
    window.addEventListener("resize", schedule, { passive: true });
    viewport?.addEventListener("resize", schedule, { passive: true });
    return {
      observe(element, options) {
        observer.observe(element, options);
      },
      unobserve(element) {
        observer.unobserve(element);
      },
      disconnect() {
        disconnected = true;
        observer.disconnect();
        cancelAnimationFrame(frame);
        window.removeEventListener("resize", schedule);
        viewport?.removeEventListener("resize", schedule);
      }
    };
  }

  // src/vendor/lib/html-in-canvas.ts
  function prepareHtmlInCanvas(source, content) {
    if ("content" in source) {
      source.setAttribute("content", "drawable");
      content.setAttribute("drawable", "");
    } else {
      source.setAttribute("layoutsubtree", "");
    }
  }
  function drawHtmlInCanvas(source, context, content) {
    const transform = context.drawElementImage(content, 0, 0);
    const canvas = source;
    if (transform && typeof canvas.updateElementGeometry === "function") {
      canvas.updateElementGeometry(content, { canvasTransform: transform });
    }
  }

  // src/vendor/lib/Asciify/AsciifyVanilla.ts
  var CHARSETS = {
    ascii: [
      0,
      128,
      131200,
      14336,
      459200,
      469440,
      4357252,
      18157905,
      11512810,
      15724526
    ],
    blocks: [0, 328e3, 22041621, 22369621, 11512810, 33554431],
    binary: [0, 4591758, 15324974]
  };
  var MAX_GLYPHS = 16;
  var FALLBACK_CAPTURE_DELAY = 500;
  var DEFAULTS = {
    radius: 0.4,
    softness: 1,
    scale: 2,
    spacing: 1,
    charset: "ascii",
    glyphs: [],
    background: [0, 0, 0],
    backgroundOpacity: 0,
    contrast: 1,
    brightness: 0,
    invert: 0,
    strength: 1,
    baseStrength: 0,
    followSpeed: 3,
    glow: 0.75,
    aberration: 0.75
  };
  var VERT = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPos;
out vec2 vUv;
void main () {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;
  var FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uContent;
uniform vec2 uContentOffset;
uniform vec2 uResolution;
uniform float uGlyphPx;
uniform float uSpacing;
uniform uint uGlyphs[${MAX_GLYPHS}];
uniform int uGlyphCount;
uniform float uRadius;
uniform float uSoftness;
uniform vec2 uPointer;
uniform float uActive;
uniform vec3 uBg;
uniform float uBackingLum;
uniform float uBgOpacity;
uniform float uLod;
uniform float uContrast;
uniform float uBrightness;
uniform float uInvert;
uniform float uStrength;
uniform float uBase;
uniform float uMaxX;
uniform sampler2D uTextMask;
uniform float uDotPx;
uniform float uDotLod;
uniform float uGlowAmt;
uniform float uAberration;

#define S(a, b, t) smoothstep(a, b, t)

float glyphBit (int index, ivec2 p) {
  if (p.x < 0 || p.x > 4 || p.y < 0 || p.y > 4) return 0.0;
  uint bits = uGlyphs[index];
  return float((bits >> uint((4 - p.x) + 5 * p.y)) & 1u);
}

float hash21 (vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

vec4 sampleFringe (vec2 uv, float lod, vec2 off) {
  vec4 c = textureLod(uContent, uv, lod);
  c.r = textureLod(uContent, uv + off, lod).r;
  c.b = textureLod(uContent, uv - off, lod).b;
  return c;
}

void main () {
  vec2 uv = vUv;

  if (uv.x > uMaxX) {
    outColor = vec4(0.0);
    return;
  }

  float cellPx = (5.0 + 2.0 * uSpacing) * uGlyphPx;
  vec2 frag = uv * uResolution;
  vec2 cell = floor(frag / cellPx);
  vec2 cellUv = (cell + 0.5) * cellPx / uResolution;

  float aspect = uResolution.x / uResolution.y;
  float dist = length((cellUv - uPointer) * vec2(aspect, 1.0));
  float radius = max(uRadius * uActive, 1e-4);
  float inner = radius * (1.0 - clamp(uSoftness, 0.0, 1.0));
  float lens = (1.0 - S(inner, radius, dist)) * uActive;
  float mask = clamp(max(lens, clamp(uBase, 0.0, 1.0)), 0.0, 1.0)
    * clamp(uStrength, 0.0, 1.0);

  float apply = mask < 0.003 ? 0.0 : step(hash21(cell), mask);

  if (apply < 0.5) {
    outColor = vec4(0.0);
    return;
  }

  vec2 textureUv = vec2(cellUv.x, 1.0 - cellUv.y) + uContentOffset;
  if (textureUv.x < 0.001 || textureUv.x > uMaxX - 0.002 ||
      textureUv.y < 0.001 || textureUv.y > 0.999) {
    outColor = vec4(0.0);
    return;
  }

  vec2 lensDir = (cellUv - uPointer) * vec2(aspect, 1.0);
  float fringeAmp = max(uActive, S(0.0, 0.25, uBase));
  vec2 fringe = normalize(lensDir + 1e-5)
    * clamp(uAberration, 0.0, 1.0) * 0.005
    * S(uRadius * 0.15, uRadius, dist) * fringeAmp;
  fringe = vec2(fringe.x / aspect, -fringe.y);

  float textness = texture(uTextMask, vec2(cellUv.x, 1.0 - cellUv.y)).r;

  if (textness > 0.4) {
    vec2 dotIdx = floor(frag / uDotPx);
    vec2 dotUv = (dotIdx + 0.5) * uDotPx / uResolution;
    vec2 flippedUv = clamp(
      vec2(dotUv.x, 1.0 - dotUv.y) + uContentOffset,
      vec2(0.001), vec2(uMaxX - 0.002, 0.999));
    vec4 ink = sampleFringe(flippedUv, uDotLod, fringe);
    float inkLum = dot(ink.rgb, vec3(0.299, 0.587, 0.114));
    float density = abs(inkLum - uBackingLum);
    density = clamp((density - 0.5) * uContrast + 0.5 + uBrightness, 0.0, 1.0);
    density = mix(density, 1.0 - density, clamp(uInvert, 0.0, 1.0));
    float d = length(frag - (dotIdx + 0.5) * uDotPx) / (uDotPx * 0.5);
    float reach = sqrt(density);
    float on = (1.0 - S(reach - 0.3, reach + 0.2, d)) * step(0.03, density);
    vec3 inkColor = clamp(
      uBg + (ink.rgb - uBg) / max(abs(inkLum - uBackingLum), 0.2),
      0.0, 1.0);
    vec4 soft = sampleFringe(flippedUv, uDotLod + 2.5, fringe);
    float softLum = dot(soft.rgb, vec3(0.299, 0.587, 0.114));
    float halo = clamp(abs(softLum - uBackingLum) * 2.2, 0.0, 1.0)
      * clamp(uGlowAmt, 0.0, 1.0) * 0.55;
    vec3 haloColor = clamp(
      uBg + (soft.rgb - uBg) / max(abs(softLum - uBackingLum), 0.2),
      0.0, 1.0);
    vec3 col = mix(haloColor, inkColor, on);
    float alpha = ink.a
      * max(mix(clamp(uBgOpacity, 0.0, 1.0), 1.0, on), halo * (1.0 - on));
    outColor = vec4(col * alpha, alpha);
    return;
  }

  vec4 pixel = sampleFringe(textureUv, uLod, fringe);

  float lum = dot(pixel.rgb, vec3(0.299, 0.587, 0.114));
  float amount = abs(lum - uBackingLum);
  amount = clamp((amount - 0.5) * uContrast + 0.5 + uBrightness, 0.0, 1.0);
  amount = mix(amount, 1.0 - amount, clamp(uInvert, 0.0, 1.0));

  int index = min(int(amount * float(uGlyphCount)), uGlyphCount - 1);

  ivec2 local = ivec2(floor((frag - cell * cellPx) / uGlyphPx));
  int pad = int(uSpacing);
  float on = glyphBit(index, ivec2(local.x - pad, local.y - pad));

  vec3 glyphColor = clamp(
    uBg + (pixel.rgb - uBg) / max(abs(lum - uBackingLum), 0.2),
    0.0, 1.0);
  vec3 col = mix(uBg, glyphColor, on);
  float alpha = pixel.a * mix(clamp(uBgOpacity, 0.0, 1.0), 1.0, on);
  outColor = vec4(col * alpha, alpha);
}`;
  function intersectFallbackRects(first, second) {
    return {
      left: Math.max(first.left, second.left),
      top: Math.max(first.top, second.top),
      right: Math.min(first.right, second.right),
      bottom: Math.min(first.bottom, second.bottom)
    };
  }
  function paintFallbackSnapshot(content, canvas, dpr) {
    const rootRect = content.getBoundingClientRect();
    const width = Math.max(1, Math.round(rootRect.width * dpr));
    const height = Math.max(1, Math.round(rootRect.height * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas is unavailable");
    ctx.resetTransform();
    ctx.clearRect(0, 0, width, height);
    ctx.scale(dpr, dpr);
    const rootClip = {
      left: rootRect.left,
      top: rootRect.top,
      right: rootRect.right,
      bottom: rootRect.bottom
    };
    const states = /* @__PURE__ */ new WeakMap();
    function resolveState(element) {
      const cached = states.get(element);
      if (cached) return cached;
      const parent = element.parentElement;
      const parentState = parent && content.contains(parent) ? resolveState(parent) : null;
      const style = getComputedStyle(element);
      const ownOpacity = Number.parseFloat(style.opacity);
      const opacity = (parentState?.opacity ?? 1) * (Number.isFinite(ownOpacity) ? ownOpacity : 1);
      const visible = (parentState?.visible ?? true) && style.display !== "none" && style.visibility !== "hidden" && style.visibility !== "collapse" && opacity > 0;
      const clip = parentState?.childrenClip ?? rootClip;
      const rect = element.getBoundingClientRect();
      const childrenClip = { ...clip };
      if (style.overflowX !== "visible") {
        childrenClip.left = Math.max(childrenClip.left, rect.left);
        childrenClip.right = Math.min(childrenClip.right, rect.right);
      }
      if (style.overflowY !== "visible") {
        childrenClip.top = Math.max(childrenClip.top, rect.top);
        childrenClip.bottom = Math.min(childrenClip.bottom, rect.bottom);
      }
      const state = { style, visible, opacity, clip, childrenClip };
      states.set(element, state);
      return state;
    }
    const walker = document.createTreeWalker(content, NodeFilter.SHOW_ELEMENT);
    let current = walker.currentNode;
    while (current) {
      const element = current;
      const rect = element.getBoundingClientRect();
      const state = resolveState(element);
      const visibleRect = intersectFallbackRects(rect, state.clip);
      if (state.visible && visibleRect.right > visibleRect.left && visibleRect.bottom > visibleRect.top) {
        const { style } = state;
        ctx.save();
        ctx.beginPath();
        ctx.rect(
          state.clip.left - rootRect.left,
          state.clip.top - rootRect.top,
          state.clip.right - state.clip.left,
          state.clip.bottom - state.clip.top
        );
        ctx.clip();
        ctx.globalAlpha = state.opacity;
        const x = rect.left - rootRect.left;
        const y = rect.top - rootRect.top;
        if (style.backgroundColor !== "transparent") {
          ctx.fillStyle = style.backgroundColor;
          ctx.fillRect(x, y, rect.width, rect.height);
        }
        paintFallbackMedia(ctx, element, style, rect, rootRect);
        paintFallbackText(ctx, element, style, rootRect);
        paintFallbackBorders(ctx, style, rect, rootRect);
        ctx.restore();
      }
      current = walker.nextNode();
    }
    ctx.globalAlpha = 1;
  }
  function paintFallbackMedia(ctx, element, style, rect, rootRect) {
    const drawable = element instanceof HTMLImageElement ? element.complete && element.naturalWidth > 0 ? element : null : element instanceof HTMLCanvasElement ? element : element instanceof HTMLVideoElement && element.readyState >= 2 ? element : null;
    if (!drawable) return;
    if (!isFallbackMediaOriginClean(drawable)) return;
    const sourceWidth = drawable instanceof HTMLImageElement ? drawable.naturalWidth : drawable instanceof HTMLVideoElement ? drawable.videoWidth : drawable.width;
    const sourceHeight = drawable instanceof HTMLImageElement ? drawable.naturalHeight : drawable instanceof HTMLVideoElement ? drawable.videoHeight : drawable.height;
    if (!(sourceWidth > 0 && sourceHeight > 0)) return;
    let sourceX = 0;
    let sourceY = 0;
    let cropWidth = sourceWidth;
    let cropHeight = sourceHeight;
    let targetX = rect.left - rootRect.left;
    let targetY = rect.top - rootRect.top;
    let targetWidth = rect.width;
    let targetHeight = rect.height;
    const [positionX, positionY] = resolveObjectPosition(style.objectPosition);
    if (style.objectFit === "cover") {
      const scale = Math.max(
        rect.width / sourceWidth,
        rect.height / sourceHeight
      );
      cropWidth = rect.width / scale;
      cropHeight = rect.height / scale;
      sourceX = (sourceWidth - cropWidth) * positionX;
      sourceY = (sourceHeight - cropHeight) * positionY;
    } else if (style.objectFit === "contain" || style.objectFit === "scale-down") {
      const containScale = Math.min(
        rect.width / sourceWidth,
        rect.height / sourceHeight,
        style.objectFit === "scale-down" ? 1 : Number.POSITIVE_INFINITY
      );
      targetWidth = sourceWidth * containScale;
      targetHeight = sourceHeight * containScale;
      targetX += (rect.width - targetWidth) * positionX;
      targetY += (rect.height - targetHeight) * positionY;
    }
    try {
      ctx.drawImage(
        drawable,
        sourceX,
        sourceY,
        cropWidth,
        cropHeight,
        targetX,
        targetY,
        targetWidth,
        targetHeight
      );
    } catch {
    }
  }
  function isFallbackMediaOriginClean(drawable) {
    const probe = document.createElement("canvas");
    probe.width = probe.height = 1;
    const ctx = probe.getContext("2d", { willReadFrequently: true });
    if (!ctx) return false;
    try {
      ctx.drawImage(drawable, 0, 0, 1, 1);
      ctx.getImageData(0, 0, 1, 1);
      return true;
    } catch {
      return false;
    }
  }
  function resolveObjectPosition(position) {
    const [x = "50%", y = "50%"] = position.split(/\s+/);
    return [
      resolvePositionValue(x, "left", "right"),
      resolvePositionValue(y, "top", "bottom")
    ];
  }
  function resolvePositionValue(value, start, end) {
    if (value === start) return 0;
    if (value === end) return 1;
    if (value === "center") return 0.5;
    if (value.endsWith("%")) {
      return Math.min(1, Math.max(0, Number.parseFloat(value) / 100));
    }
    return 0.5;
  }
  function paintFallbackText(ctx, element, style, rootRect) {
    const textNodes = Array.from(element.childNodes).filter(
      (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim()
    );
    if (textNodes.length === 0) return;
    ctx.fillStyle = style.color;
    ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    ctx.textBaseline = "alphabetic";
    if ("letterSpacing" in ctx) {
      ctx.letterSpacing = style.letterSpacing === "normal" ? "0px" : style.letterSpacing;
    }
    const textAlign = style.textAlign === "center" || style.textAlign === "right" || style.textAlign === "start" || style.textAlign === "end" ? style.textAlign : "left";
    const direction = style.direction === "rtl" ? "rtl" : "ltr";
    ctx.textAlign = textAlign;
    ctx.direction = direction;
    const whiteSpace = style.whiteSpace;
    const preservesNewlines = whiteSpace === "pre" || whiteSpace === "pre-wrap" || whiteSpace === "pre-line" || whiteSpace === "break-spaces";
    const preservesSpaces = preservesNewlines && whiteSpace !== "pre-line";
    const anchor = textAlign === "center" ? 0.5 : textAlign === "right" || textAlign === "end" && direction === "ltr" || textAlign === "start" && direction === "rtl" ? 1 : 0;
    function transform(text) {
      if (style.textTransform === "uppercase") return text.toUpperCase();
      if (style.textTransform === "lowercase") return text.toLowerCase();
      return text;
    }
    function drawAcrossRects(text, rects) {
      const visible = rects.filter(
        (rect) => rect.right > rootRect.left && rect.left < rootRect.right && rect.bottom > rootRect.top && rect.top < rootRect.bottom
      );
      if (visible.length === 0) return;
      const totalWidth = visible.reduce((sum, rect) => sum + rect.width, 0);
      let offset = 0;
      for (let index = 0; index < visible.length; index++) {
        const rect = visible[index];
        const remaining = text.length - offset;
        if (remaining <= 0) break;
        const count = index === visible.length - 1 ? remaining : Math.min(
          remaining,
          Math.max(1, Math.round(text.length * rect.width / totalWidth))
        );
        const slice = text.slice(offset, offset + count);
        offset += count;
        const line = preservesSpaces ? slice : slice.trim();
        if (!line.trim()) continue;
        const x = rect.left - rootRect.left + rect.width * anchor;
        const metrics = ctx.measureText(line);
        const ascent = metrics.fontBoundingBoxAscent ?? 0;
        const descent = metrics.fontBoundingBoxDescent ?? 0;
        const y = ascent > 0 ? rect.top - rootRect.top + (rect.height - ascent - descent) / 2 + ascent : rect.bottom - rootRect.top - rect.height * 0.2;
        ctx.fillText(line, x, y, Math.max(rect.width, 1));
      }
    }
    for (const node of textNodes) {
      const raw = node.textContent ?? "";
      const range = document.createRange();
      if (preservesNewlines) {
        let position = 0;
        for (const part of raw.split("\n")) {
          const start = position;
          position += part.length + 1;
          if (!part.trim()) continue;
          range.setStart(node, start);
          range.setEnd(node, start + part.length);
          const text2 = transform(
            preservesSpaces ? part : part.replace(/\s+/g, " ").trim()
          );
          drawAcrossRects(text2, Array.from(range.getClientRects()));
        }
        continue;
      }
      const text = transform(raw.replace(/\s+/g, " ").trim());
      if (!text) continue;
      range.selectNodeContents(node);
      drawAcrossRects(text, Array.from(range.getClientRects()));
    }
  }
  function paintFallbackBorders(ctx, style, rect, rootRect) {
    const x = rect.left - rootRect.left;
    const y = rect.top - rootRect.top;
    const top = Number.parseFloat(style.borderTopWidth);
    const right = Number.parseFloat(style.borderRightWidth);
    const bottom = Number.parseFloat(style.borderBottomWidth);
    const left = Number.parseFloat(style.borderLeftWidth);
    if (top > 0) {
      ctx.fillStyle = style.borderTopColor;
      ctx.fillRect(x, y, rect.width, top);
    }
    if (right > 0) {
      ctx.fillStyle = style.borderRightColor;
      ctx.fillRect(x + rect.width - right, y, right, rect.height);
    }
    if (bottom > 0) {
      ctx.fillStyle = style.borderBottomColor;
      ctx.fillRect(x, y + rect.height - bottom, rect.width, bottom);
    }
    if (left > 0) {
      ctx.fillStyle = style.borderLeftColor;
      ctx.fillRect(x, y, left, rect.height);
    }
  }
  function createAsciify(elements, options = {}) {
    try {
      return initializeAsciify(elements, options);
    } catch (error) {
      console.error("Asciify initialization failed:", error);
      return null;
    }
  }
  function initializeAsciify(elements, options) {
    const config = { ...DEFAULTS, ...options };
    const { source, content, output } = elements;
    const gl = output.getContext("webgl2", {
      alpha: true,
      depth: false,
      stencil: false,
      antialias: false,
      premultipliedAlpha: true
    });
    if (!gl || gl.isContextLost()) return null;
    const sourceCtx = source.getContext("2d");
    const paintable = source;
    const htmlInCanvas = Boolean(
      sourceCtx && typeof sourceCtx.drawElementImage === "function" && typeof paintable.requestPaint === "function"
    );
    if (htmlInCanvas) prepareHtmlInCanvas(source, content);
    let destroyed = false;
    let contentDirty = false;
    let wake = () => {
    };
    let fallbackSource = null;
    let fallbackCaptureTimer = 0;
    let fallbackCaptureDeadline = 0;
    let fallbackScrollCaptureTimer = 0;
    let capturedScrollLeft = 0;
    let capturedScrollTop = 0;
    let fallbackErrorLogged = false;
    let textureUploadErrorLogged = false;
    if (htmlInCanvas) {
      paintable.onpaint = () => {
        try {
          sourceCtx.reset();
          drawHtmlInCanvas(source, sourceCtx, content);
          contentDirty = true;
          scheduleTextMask();
          wake();
        } catch {
        }
      };
    }
    function queueFallbackCapture(immediate = false) {
      if (htmlInCanvas || destroyed) return;
      const delay = immediate ? 0 : FALLBACK_CAPTURE_DELAY;
      const deadline = performance.now() + delay;
      if (fallbackCaptureTimer && fallbackCaptureDeadline <= deadline) return;
      window.clearTimeout(fallbackCaptureTimer);
      fallbackCaptureDeadline = deadline;
      fallbackCaptureTimer = window.setTimeout(captureFallback, delay);
    }
    function captureFallback() {
      window.clearTimeout(fallbackCaptureTimer);
      window.clearTimeout(fallbackScrollCaptureTimer);
      fallbackCaptureTimer = 0;
      fallbackScrollCaptureTimer = 0;
      try {
        paintFallbackSnapshot(content, source, getCanvasPixelRatio(output, gl));
        if (destroyed) return;
        fallbackSource = source;
        capturedScrollLeft = content.scrollLeft;
        capturedScrollTop = content.scrollTop;
        contentDirty = true;
        fallbackErrorLogged = false;
        scheduleTextMask();
        wake();
      } catch (error) {
        if (!destroyed && !fallbackErrorLogged) {
          fallbackErrorLogged = true;
          console.warn("Asciify could not capture its HTML fallback:", error);
        }
      }
    }
    function compile(type, text) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, text);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const message = gl.getShaderInfoLog(shader) || "Unknown shader error";
        gl.deleteShader(shader);
        throw new Error(message);
      }
      return shader;
    }
    const vertexShader = compile(gl.VERTEX_SHADER, VERT);
    const fragmentShader = compile(gl.FRAGMENT_SHADER, FRAG);
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const message = gl.getProgramInfoLog(program) || "Unknown program link error";
      gl.deleteProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      throw new Error(message);
    }
    const uniforms = {};
    const uniformCount = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < uniformCount; i++) {
      const info = gl.getActiveUniform(program, i);
      uniforms[info.name] = gl.getUniformLocation(program, info.name);
    }
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const contentTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, contentTexture);
    gl.texParameteri(
      gl.TEXTURE_2D,
      gl.TEXTURE_MIN_FILTER,
      gl.LINEAR_MIPMAP_LINEAR
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([0, 0, 0, 0])
    );
    let contentMaxX = 1;
    const textMaskTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, textMaskTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([0, 0, 0, 0])
    );
    const MASK_SCALE = 0.25;
    const maskCanvas = document.createElement("canvas");
    const maskCtx = maskCanvas.getContext("2d");
    let maskDirty = false;
    let maskTimer = 0;
    let maskStamp = 0;
    function buildTextMask() {
      if (!maskCtx) return;
      const bounds = output.getBoundingClientRect();
      const width = Math.max(1, Math.round(bounds.width * MASK_SCALE));
      const height = Math.max(1, Math.round(bounds.height * MASK_SCALE));
      if (maskCanvas.width !== width || maskCanvas.height !== height) {
        maskCanvas.width = width;
        maskCanvas.height = height;
      }
      maskCtx.clearRect(0, 0, width, height);
      maskCtx.fillStyle = "#fff";
      const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
      const range = document.createRange();
      let node;
      while (node = walker.nextNode()) {
        if (!node.textContent?.trim()) continue;
        const parent = node.parentElement;
        if (!parent || parent.checkVisibility && !parent.checkVisibility()) {
          continue;
        }
        range.selectNodeContents(node);
        const rects = range.getClientRects();
        for (let i = 0; i < rects.length; i++) {
          const r = rects[i];
          if (r.width < 1 || r.height < 1) continue;
          if (r.bottom < bounds.top || r.top > bounds.bottom) continue;
          maskCtx.fillRect(
            (r.left - bounds.left - 1) * MASK_SCALE,
            (r.top - bounds.top - 1) * MASK_SCALE,
            (r.width + 2) * MASK_SCALE,
            (r.height + 2) * MASK_SCALE
          );
        }
      }
      const fields = content.querySelectorAll("input, textarea, select");
      for (let i = 0; i < fields.length; i++) {
        const r = fields[i].getBoundingClientRect();
        if (r.width < 1 || r.height < 1) continue;
        if (r.bottom < bounds.top || r.top > bounds.bottom) continue;
        maskCtx.fillRect(
          (r.left - bounds.left) * MASK_SCALE,
          (r.top - bounds.top) * MASK_SCALE,
          r.width * MASK_SCALE,
          r.height * MASK_SCALE
        );
      }
      maskDirty = true;
    }
    function scheduleTextMask() {
      if (maskTimer) return;
      const wait = Math.max(0, 120 - (performance.now() - maskStamp));
      maskTimer = window.setTimeout(() => {
        maskTimer = 0;
        maskStamp = performance.now();
        buildTextMask();
        start();
      }, wait);
    }
    function syncCanvasSize() {
      let changed = false;
      const dpr = getCanvasPixelRatio(output, gl);
      const width = Math.max(1, Math.round(output.clientWidth * dpr));
      const height = Math.max(1, Math.round(output.clientHeight * dpr));
      if (output.width !== width || output.height !== height) {
        output.width = width;
        output.height = height;
        changed = true;
      }
      contentMaxX = Math.min(
        1,
        Math.max(0.05, content.clientWidth / Math.max(output.clientWidth, 1))
      );
      if (htmlInCanvas) {
        const sourceWidth = Math.max(1, Math.round(source.clientWidth * dpr));
        const sourceHeight = Math.max(1, Math.round(source.clientHeight * dpr));
        if (source.width !== sourceWidth || source.height !== sourceHeight) {
          source.width = sourceWidth;
          source.height = sourceHeight;
          changed = true;
        }
        paintable.requestPaint();
      }
      return changed;
    }
    syncCanvasSize();
    let backingRgb = [1, 1, 1];
    let backingLum = 1;
    const probe = document.createElement("canvas");
    probe.width = probe.height = 1;
    const probeCtx = probe.getContext("2d", { willReadFrequently: true });
    function syncBacking() {
      backingRgb = [1, 1, 1];
      if (probeCtx) {
        let el = content;
        while (el) {
          const bg = getComputedStyle(el).backgroundColor;
          if (bg && bg !== "transparent") {
            probeCtx.clearRect(0, 0, 1, 1);
            probeCtx.fillStyle = bg;
            probeCtx.fillRect(0, 0, 1, 1);
            const [r, g, b, a] = probeCtx.getImageData(0, 0, 1, 1).data;
            if (a > 0) {
              backingRgb = [r / 255, g / 255, b / 255];
              break;
            }
          }
          el = el.parentElement;
        }
      }
      backingLum = 0.299 * backingRgb[0] + 0.587 * backingRgb[1] + 0.114 * backingRgb[2];
    }
    syncBacking();
    const pointer = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5, active: 0, target: 0 };
    const glyphData = new Uint32Array(MAX_GLYPHS);
    function resolveGlyphs() {
      const ramp = config.glyphs.length > 1 ? config.glyphs : CHARSETS[config.charset] ?? CHARSETS.ascii;
      const count = Math.min(ramp.length, MAX_GLYPHS);
      glyphData.fill(0);
      for (let i = 0; i < count; i++) glyphData[i] = ramp[i] >>> 0;
      return count;
    }
    function uploadContent() {
      const bitmap = htmlInCanvas ? source : fallbackSource;
      if (!bitmap || !contentDirty) return;
      contentDirty = false;
      try {
        gl.bindTexture(gl.TEXTURE_2D, contentTexture);
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          bitmap
        );
        gl.generateMipmap(gl.TEXTURE_2D);
        textureUploadErrorLogged = false;
      } catch (error) {
        if (!textureUploadErrorLogged) {
          textureUploadErrorLogged = true;
          console.warn("Asciify could not upload its content texture:", error);
        }
      }
    }
    function uploadMask() {
      if (!maskDirty) return;
      maskDirty = false;
      gl.bindTexture(gl.TEXTURE_2D, textMaskTexture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        maskCanvas
      );
    }
    function render() {
      uploadContent();
      uploadMask();
      gl.useProgram(program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, contentTexture);
      gl.uniform1i(uniforms.uContent, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, textMaskTexture);
      gl.uniform1i(uniforms.uTextMask, 1);
      gl.uniform2f(
        uniforms.uContentOffset,
        htmlInCanvas ? 0 : (content.scrollLeft - capturedScrollLeft) / Math.max(content.clientWidth, 1),
        htmlInCanvas ? 0 : (content.scrollTop - capturedScrollTop) / Math.max(content.clientHeight, 1)
      );
      gl.uniform2f(uniforms.uResolution, output.width, output.height);
      const dpr = output.width / Math.max(output.clientWidth, 1);
      const glyphCss = Math.max(config.scale, 0.5);
      const dotCss = Math.max(1.25, glyphCss * 0.75);
      const texelsPerCss = htmlInCanvas ? dpr : source.width / Math.max(content.clientWidth, 1);
      gl.uniform1f(uniforms.uDotPx, dotCss * dpr);
      gl.uniform1f(
        uniforms.uDotLod,
        Math.max(0, Math.log2(dotCss * Math.max(texelsPerCss, 0.25) / dpr) - 1)
      );
      gl.uniform1f(uniforms.uGlowAmt, config.glow);
      gl.uniform1f(uniforms.uAberration, config.aberration);
      const spacing = Math.round(Math.min(Math.max(config.spacing, 0), 3));
      gl.uniform1f(uniforms.uGlyphPx, glyphCss * dpr);
      gl.uniform1f(uniforms.uSpacing, spacing);
      gl.uniform1f(
        uniforms.uLod,
        Math.max(0, Math.log2((5 + 2 * spacing) * glyphCss) - 1)
      );
      const glyphCount = resolveGlyphs();
      gl.uniform1uiv(uniforms["uGlyphs[0]"], glyphData);
      gl.uniform1i(uniforms.uGlyphCount, glyphCount);
      gl.uniform1f(uniforms.uRadius, Math.max(config.radius, 0.01));
      gl.uniform1f(uniforms.uSoftness, config.softness);
      gl.uniform2f(uniforms.uPointer, pointer.x, pointer.y);
      gl.uniform1f(uniforms.uActive, pointer.active);
      const bg = config.background === "auto" ? backingRgb : config.background;
      gl.uniform3f(uniforms.uBg, bg[0], bg[1], bg[2]);
      gl.uniform1f(uniforms.uBackingLum, backingLum);
      gl.uniform1f(uniforms.uBgOpacity, config.backgroundOpacity);
      gl.uniform1f(uniforms.uContrast, Math.max(config.contrast, 0));
      gl.uniform1f(uniforms.uBrightness, config.brightness);
      gl.uniform1f(uniforms.uInvert, config.invert);
      gl.uniform1f(uniforms.uStrength, config.strength);
      gl.uniform1f(uniforms.uBase, config.baseStrength);
      gl.uniform1f(uniforms.uMaxX, contentMaxX);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, output.width, output.height);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    let raf = 0;
    let lastTime = performance.now();
    let running = false;
    let visible = true;
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reducedMotion = motionQuery.matches;
    function frame(now) {
      if (destroyed) return;
      if (!visible) {
        running = false;
        return;
      }
      const delta = Math.min((now - lastTime) / 1e3, 1 / 30);
      lastTime = now;
      const ease = reducedMotion ? 1 : 1 - Math.exp(-delta * Math.max(config.followSpeed, 0.5));
      pointer.x += (pointer.tx - pointer.x) * ease;
      pointer.y += (pointer.ty - pointer.y) * ease;
      pointer.active += (pointer.target - pointer.active) * ease;
      const settled = Math.abs(pointer.tx - pointer.x) < 5e-4 && Math.abs(pointer.ty - pointer.y) < 5e-4 && Math.abs(pointer.target - pointer.active) < 1e-3;
      if (settled) {
        pointer.x = pointer.tx;
        pointer.y = pointer.ty;
        pointer.active = pointer.target;
      }
      render();
      if (settled && !contentDirty) {
        running = false;
        return;
      }
      raf = requestAnimationFrame(frame);
    }
    function start() {
      if (destroyed || running || !visible) return;
      running = true;
      lastTime = performance.now();
      raf = requestAnimationFrame(frame);
    }
    wake = start;
    queueFallbackCapture(true);
    start();
    function onMotionChange() {
      reducedMotion = motionQuery.matches;
      start();
    }
    motionQuery.addEventListener("change", onMotionChange);
    let themeTimer = 0;
    function onThemeShift() {
      syncBacking();
      start();
      window.clearTimeout(themeTimer);
      themeTimer = window.setTimeout(() => {
        syncBacking();
        queueFallbackCapture();
        start();
      }, 300);
    }
    const themeObserver = new MutationObserver(onThemeShift);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style", "data-theme"]
    });
    const schemeQuery = window.matchMedia("(prefers-color-scheme: dark)");
    schemeQuery.addEventListener("change", onThemeShift);
    let outputRect = output.getBoundingClientRect();
    const refreshOutputRect = () => {
      outputRect = output.getBoundingClientRect();
    };
    const observer = createCanvasResizeObserver(() => {
      refreshOutputRect();
      if (syncCanvasSize()) queueFallbackCapture();
      start();
    });
    observer.observe(output);
    observer.observe(content);
    window.addEventListener("resize", refreshOutputRect, { passive: true });
    window.addEventListener("scroll", refreshOutputRect, {
      capture: true,
      passive: true
    });
    const intersection = new IntersectionObserver((entries) => {
      visible = entries[entries.length - 1]?.isIntersecting ?? true;
      if (visible) start();
    });
    intersection.observe(output);
    const listenTarget = output.parentElement ?? output;
    const contentObserver = htmlInCanvas ? null : new MutationObserver(() => queueFallbackCapture());
    contentObserver?.observe(content, {
      attributes: true,
      attributeFilter: ["class", "hidden", "src", "srcset", "style"],
      characterData: true,
      childList: true,
      subtree: true
    });
    function onContentScroll() {
      if (htmlInCanvas || destroyed) return;
      window.clearTimeout(fallbackScrollCaptureTimer);
      fallbackScrollCaptureTimer = window.setTimeout(
        captureFallback,
        FALLBACK_CAPTURE_DELAY
      );
      start();
    }
    function onFallbackVisualChange() {
      queueFallbackCapture();
    }
    if (!htmlInCanvas) {
      content.addEventListener("scroll", onContentScroll, {
        capture: true,
        passive: true
      });
      content.addEventListener("load", onFallbackVisualChange, true);
      content.addEventListener("loadeddata", onFallbackVisualChange, true);
      content.addEventListener("focusin", onFallbackVisualChange, true);
      content.addEventListener("focusout", onFallbackVisualChange, true);
      content.addEventListener("input", onFallbackVisualChange, true);
      content.addEventListener("change", onFallbackVisualChange, true);
      content.addEventListener("transitionend", onFallbackVisualChange, true);
      content.addEventListener("transitioncancel", onFallbackVisualChange, true);
      content.addEventListener("animationend", onFallbackVisualChange, true);
      document.fonts?.addEventListener("loadingdone", onFallbackVisualChange);
    }
    function onPointerMove(event) {
      pointer.tx = (event.clientX - outputRect.left) / Math.max(outputRect.width, 1);
      pointer.ty = 1 - (event.clientY - outputRect.top) / Math.max(outputRect.height, 1);
      pointer.target = 1;
      queueFallbackCapture();
      start();
    }
    function onPointerLeave() {
      pointer.target = 0;
      queueFallbackCapture();
      start();
    }
    listenTarget.addEventListener("pointermove", onPointerMove, { passive: true });
    listenTarget.addEventListener("pointerleave", onPointerLeave, { passive: true });
    content.addEventListener("scroll", scheduleTextMask, {
      capture: true,
      passive: true
    });
    return {
      setOptions(next) {
        let changed = false;
        for (const [key, value] of Object.entries(next)) {
          const prev = config[key];
          if (Array.isArray(value) && Array.isArray(prev)) {
            if (value.length !== prev.length || value.some((item, i) => item !== prev[i])) {
              changed = true;
              break;
            }
          } else if (prev !== value) {
            changed = true;
            break;
          }
        }
        if (!changed) {
          Object.assign(config, next);
          return;
        }
        Object.assign(config, next);
        syncBacking();
        scheduleTextMask();
        start();
      },
      resize() {
        syncCanvasSize();
        syncBacking();
        queueFallbackCapture();
        scheduleTextMask();
        start();
      },
      destroy() {
        destroyed = true;
        cancelAnimationFrame(raf);
        window.clearTimeout(themeTimer);
        window.clearTimeout(fallbackCaptureTimer);
        window.clearTimeout(fallbackScrollCaptureTimer);
        window.clearTimeout(maskTimer);
        observer.disconnect();
        window.removeEventListener("resize", refreshOutputRect);
        window.removeEventListener("scroll", refreshOutputRect, true);
        intersection.disconnect();
        themeObserver.disconnect();
        contentObserver?.disconnect();
        schemeQuery.removeEventListener("change", onThemeShift);
        motionQuery.removeEventListener("change", onMotionChange);
        listenTarget.removeEventListener("pointermove", onPointerMove);
        listenTarget.removeEventListener("pointerleave", onPointerLeave);
        content.removeEventListener("scroll", onContentScroll, true);
        content.removeEventListener("scroll", scheduleTextMask, {
          capture: true
        });
        content.removeEventListener("load", onFallbackVisualChange, true);
        content.removeEventListener("loadeddata", onFallbackVisualChange, true);
        content.removeEventListener("focusin", onFallbackVisualChange, true);
        content.removeEventListener("focusout", onFallbackVisualChange, true);
        content.removeEventListener("input", onFallbackVisualChange, true);
        content.removeEventListener("change", onFallbackVisualChange, true);
        content.removeEventListener(
          "transitionend",
          onFallbackVisualChange,
          true
        );
        content.removeEventListener(
          "transitioncancel",
          onFallbackVisualChange,
          true
        );
        content.removeEventListener("animationend", onFallbackVisualChange, true);
        document.fonts?.removeEventListener(
          "loadingdone",
          onFallbackVisualChange
        );
        gl.deleteTexture(contentTexture);
        gl.deleteTexture(textMaskTexture);
        gl.deleteProgram(program);
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
        gl.deleteBuffer(quad);
        if (htmlInCanvas) paintable.onpaint = null;
      }
    };
  }

  // src/effects/asciify.js
  var CONTROLS = {
    charset: radio("Charset", "ascii", [
      { value: "ascii", label: "Ascii" },
      { value: "blocks", label: "Blocks" },
      { value: "binary", label: "Binary" }
    ]),
    radius: scrub("Radius", 0.4, { min: 0.1, max: 0.8, step: 0.01 }),
    softness: scrub("Softness", 1, { min: 0, max: 1, step: 0.05 }),
    scale: scrub("Scale", 2, { min: 1, max: 6, step: 0.5, decimals: 1 }),
    spacing: scrub("Spacing", 1, { min: 0, max: 3, step: 1, decimals: 0 }),
    backgroundOpacity: scrub("Bg opacity", 0, { min: 0, max: 1, step: 0.05 }),
    contrast: scrub("Contrast", 1, { min: 0.5, max: 2, step: 0.05 }),
    brightness: scrub("Brightness", 0, { min: -0.5, max: 0.5, step: 0.05 }),
    invert: scrub("Invert", 0, { min: 0, max: 1, step: 0.05 }),
    glow: scrub("Text glow", 0.75, { min: 0, max: 1, step: 0.05 }),
    aberration: scrub("Color fringe", 0.75, { min: 0, max: 1, step: 0.05 }),
    strength: scrub("Strength", 1, { min: 0, max: 1, step: 0.05 }),
    baseStrength: scrub("Base strength", 0, { min: 0, max: 1, step: 0.05 }),
    followSpeed: scrub("Follow speed", 3, {
      min: 1,
      max: 20,
      step: 0.5,
      decimals: 1
    }),
    background: color("Background", "#000000")
  };
  var asciify_default = {
    slug: "asciify",
    name: "Asciify",
    component: "Asciify",
    description: "An ascii lens that follows your cursor.",
    controls: CONTROLS,
    toOptions(values) {
      const { charset, background, ...rest } = values;
      return {
        ...rest,
        charset,
        background: hexToRgb(background)
      };
    },
    create: createAsciify
  };

  // src/vendor/lib/rect-cache.ts
  function createRectCache(element) {
    let current = element.getBoundingClientRect();
    const refresh = () => {
      current = element.getBoundingClientRect();
    };
    const observer = new ResizeObserver(refresh);
    observer.observe(element);
    window.addEventListener("resize", refresh, { passive: true });
    window.addEventListener("scroll", refresh, {
      capture: true,
      passive: true
    });
    return {
      get current() {
        return current;
      },
      destroy() {
        observer.disconnect();
        window.removeEventListener("resize", refresh);
        window.removeEventListener("scroll", refresh, true);
      }
    };
  }

  // src/vendor/lib/Bend/BendVanilla.ts
  var DEFAULTS2 = {
    zone: 240,
    angle: 80,
    rounding: 150,
    perspective: 700,
    direction: "in",
    ease: 240,
    smoothing: 0.1,
    top: true,
    bottom: true,
    tumble: 0.5,
    tilt: 0.5,
    interactionRotation: 0
  };
  var VERT2 = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPos;
out vec2 vUv;
void main () {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;
  var FRAG2 = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uContent;
uniform float uZone;
uniform float uAngle;
uniform float uPersp;
uniform float uDir;
uniform float uTopAmt;
uniform float uBotAmt;
uniform float uMaxX;
uniform float uPxY;
uniform float uPxX;
uniform float uCover;
uniform vec3 uBg;
uniform float uTiltX;
uniform float uTiltY;
uniform float uPhi;
uniform float uRound;

vec3 foldEdge (float sy, float amt) {
  float yf = 1.0 - uZone;
  if (amt < 1e-4) return vec3(sy, 0.0, 1.0);
  float theta = uAngle * amt;
  if (uRound < 1e-4) {
    float s = sin(theta) * uDir;
    float c = cos(theta);
    float denom = max(c * uPersp + s * (0.5 - sy), 1e-5);
    float tRaw = uPersp * (sy - yf) / denom;
    float t = clamp(tRaw, 0.0, uZone);
    float z = max(t * s, -0.85 * uPersp);
    float alpha = 1.0 - smoothstep(uZone, uZone + 2.0 * uPxY, tRaw);
    return vec3(yf + t, z, alpha);
  }
  if (sy <= yf) return vec3(sy, 0.0, 1.0);
  float R = min(uRound, uZone);
  float r = R / theta;
  float ca = cos(theta);
  float sa = sin(theta);
  float yA = r * sa;
  float zA = r * (1.0 - ca);
  float prevSy = yf;
  float prevZ = 0.0;
  float prevU = 0.0;
  float bestU = -1.0;
  float bestZ = 0.0;
  float maxSy = yf;
  float du = uZone / 40.0;
  for (int i = 1; i <= 40; i++) {
    float u = du * float(i);
    float Y;
    float Zm;
    if (u <= R) {
      float a = u / r;
      Y = r * sin(a);
      Zm = r * (1.0 - cos(a));
    } else {
      Y = yA + (u - R) * ca;
      Zm = zA + (u - R) * sa;
    }
    Y += yf;
    float Z = max(Zm * uDir, -0.85 * uPersp);
    float scr = 0.5 + (Y - 0.5) * uPersp / (uPersp + Z);
    if ((prevSy - sy) * (scr - sy) <= 0.0 && abs(scr - prevSy) > 1e-7) {
      float f = clamp((sy - prevSy) / (scr - prevSy), 0.0, 1.0);
      bestU = mix(prevU, u, f);
      bestZ = mix(prevZ, Z, f);
      if (uDir > 0.0) break;
    }
    maxSy = max(maxSy, scr);
    prevSy = scr;
    prevZ = Z;
    prevU = u;
  }
  if (bestU < 0.0) {
    float alpha = 1.0 - smoothstep(maxSy - uPxY, maxSy + uPxY, sy);
    return vec3(1.0, prevZ, alpha);
  }
  return vec3(yf + bestU, bestZ, 1.0);
}

vec2 tipPlane (float sy, float phi) {
  float s = sin(phi);
  float c = cos(phi);
  float denom = max(c * uPersp + s * (sy - 0.5), 1e-4);
  float t = uPersp * (1.0 - sy) / denom;
  return vec2(1.0 - t, t * s);
}

void main () {
  vec2 uv = vUv;
  float cx = uMaxX * 0.5;
  float zSum = 0.0;

  if (abs(uPhi) > 1e-4) {
    if (uPhi > 0.0) {
      vec2 r = tipPlane(uv.y, uPhi);
      uv.y = r.x;
      zSum += r.y;
    } else {
      vec2 r = tipPlane(1.0 - uv.y, -uPhi);
      uv.y = 1.0 - r.x;
      zSum += r.y;
    }
  }

  float zG = uTiltX * (uv.x - cx) + uTiltY * (uv.y - 0.5);
  zSum += zG;
  uv.y = 0.5 + (uv.y - 0.5) * (uPersp + zG) / uPersp;

  float inTop = step(1.0 - uZone, uv.y);
  float inBot = step(uv.y, uZone);

  vec3 top = foldEdge(uv.y, uTopAmt);
  vec3 bot = foldEdge(1.0 - uv.y, uBotAmt);

  float srcY = uv.y;
  srcY = mix(srcY, top.x, inTop);
  srcY = mix(srcY, 1.0 - bot.x, inBot);

  zSum += inTop * top.y + inBot * bot.y;
  float alpha = mix(1.0, top.z, inTop) * mix(1.0, bot.z, inBot);

  float srcX = cx + (uv.x - cx) * (uPersp + zSum) / uPersp;

  alpha *= smoothstep(-2.0 * uPxX, 0.0, srcX);
  alpha *= 1.0 - smoothstep(uMaxX, uMaxX + 2.0 * uPxX, srcX);
  alpha *= smoothstep(-2.0 * uPxY, 0.0, srcY);
  alpha *= 1.0 - smoothstep(1.0, 1.0 + 2.0 * uPxY, srcY);

  vec2 p = vec2(
    clamp(srcX, 0.0005, uMaxX - 0.0005),
    clamp(srcY, 0.0005, 0.9995)
  );
  vec4 base = texture(uContent, vec2(p.x, 1.0 - p.y));

  outColor = vec4(mix(uBg, base.rgb, alpha * base.a), uCover);
}`;
  var HOVER_ATTR = "data-canvasui-hover";
  var CONTENT_ATTR = "data-canvasui-content";
  var CURSOR_ATTR = "data-canvasui-cursor";
  var HOVER_REWRITE = `:is([${HOVER_ATTR}], :hover:where(:not([${CONTENT_ATTR}], [${CONTENT_ATTR}] *)))`;
  function patchHoverRules() {
    if (typeof document === "undefined") return;
    if (document.documentElement.dataset.canvasuiHoverRules === "") return;
    document.documentElement.dataset.canvasuiHoverRules = "";
    const walk = (rules) => {
      for (const rule of Array.from(rules)) {
        if (rule instanceof CSSStyleRule) {
          if (rule.selectorText.includes(":hover")) {
            try {
              rule.selectorText = rule.selectorText.replace(
                /:hover\b/g,
                HOVER_REWRITE
              );
            } catch {
            }
          }
          if (rule.cssRules.length) walk(rule.cssRules);
        } else if ("cssRules" in rule) {
          try {
            walk(rule.cssRules);
          } catch {
          }
        }
      }
    };
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        walk(sheet.cssRules);
      } catch {
      }
    }
    const style = document.createElement("style");
    style.textContent = `[${CONTENT_ATTR}][${CURSOR_ATTR}], [${CONTENT_ATTR}][${CURSOR_ATTR}] * { cursor: var(--canvasui-cursor) !important; }`;
    document.head.appendChild(style);
  }
  function createBend(elements, options = {}) {
    const config = { ...DEFAULTS2, ...options };
    const { source, content, output } = elements;
    const gl = output.getContext("webgl2", {
      alpha: true,
      depth: false,
      stencil: false,
      antialias: false,
      premultipliedAlpha: false
    });
    if (!gl || gl.isContextLost()) return null;
    const sourceCtx = source.getContext("2d");
    const paintable = source;
    const htmlInCanvas = Boolean(
      sourceCtx && typeof sourceCtx.drawElementImage === "function" && typeof paintable.requestPaint === "function"
    );
    if (htmlInCanvas) prepareHtmlInCanvas(source, content);
    let contentDirty = false;
    let wake = () => {
    };
    if (htmlInCanvas) {
      paintable.onpaint = () => {
        try {
          sourceCtx.reset();
          drawHtmlInCanvas(source, sourceCtx, content);
          contentDirty = true;
          wake();
        } catch {
        }
      };
    }
    function compile(type, text) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, text);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error("Bend shader error:", gl.getShaderInfoLog(shader));
      }
      return shader;
    }
    const vertexShader = compile(gl.VERTEX_SHADER, VERT2);
    const fragmentShader = compile(gl.FRAGMENT_SHADER, FRAG2);
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    const uniforms = {};
    const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < count; i++) {
      const info = gl.getActiveUniform(program, i);
      uniforms[info.name] = gl.getUniformLocation(program, info.name);
    }
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const contentTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, contentTexture);
    gl.texParameteri(
      gl.TEXTURE_2D,
      gl.TEXTURE_MIN_FILTER,
      gl.LINEAR_MIPMAP_LINEAR
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([0, 0, 0, 0])
    );
    gl.generateMipmap(gl.TEXTURE_2D);
    let contentMaxX = 1;
    let bg = [0, 0, 0];
    const bgProbe = document.createElement("canvas");
    bgProbe.width = bgProbe.height = 1;
    const bgCtx = bgProbe.getContext("2d", { willReadFrequently: true });
    function syncBgColor() {
      if (!bgCtx) return;
      let el = content;
      while (el) {
        const css = getComputedStyle(el).backgroundColor;
        if (css && css !== "transparent") {
          bgCtx.clearRect(0, 0, 1, 1);
          bgCtx.fillStyle = css;
          bgCtx.fillRect(0, 0, 1, 1);
          const [r, g, b, a] = bgCtx.getImageData(0, 0, 1, 1).data;
          if (a > 0) {
            bg = [r / 255, g / 255, b / 255];
            return;
          }
        }
        el = el.parentElement;
      }
      bg = [0, 0, 0];
    }
    function syncCanvasSize() {
      const dpr = getCanvasPixelRatio(output, gl);
      const width = Math.max(1, Math.round(output.clientWidth * dpr));
      const height = Math.max(1, Math.round(output.clientHeight * dpr));
      if (output.width !== width || output.height !== height) {
        output.width = width;
        output.height = height;
      }
      contentMaxX = Math.min(
        1,
        Math.max(0.05, content.clientWidth / Math.max(output.clientWidth, 1))
      );
      if (htmlInCanvas) {
        const sourceWidth = Math.max(1, Math.round(source.clientWidth * dpr));
        const sourceHeight = Math.max(1, Math.round(source.clientHeight * dpr));
        if (source.width !== sourceWidth || source.height !== sourceHeight) {
          source.width = sourceWidth;
          source.height = sourceHeight;
        }
        paintable.requestPaint();
      }
    }
    let topTarget = 0;
    let bottomTarget = 0;
    let topCurrent = 0;
    let bottomCurrent = 0;
    let over = 0;
    let phiCurrent = 0;
    let tiltXTarget = 0;
    let tiltYTarget = 0;
    let tiltXCurrent = 0;
    let tiltYCurrent = 0;
    function syncScroll() {
      const max = content.scrollHeight - content.clientHeight;
      const t = content.scrollTop;
      const e = Math.max(config.ease, 1);
      const ramp = (v) => {
        const x = Math.min(Math.max(v / e, 0), 1);
        return x * x * (3 - 2 * x);
      };
      topTarget = max > 1 && config.top ? ramp(t) : 0;
      bottomTarget = max > 1 && config.bottom ? ramp(max - t) : 0;
    }
    syncCanvasSize();
    syncScroll();
    syncBgColor();
    function uploadContent() {
      if (!htmlInCanvas || !contentDirty) return;
      contentDirty = false;
      syncBgColor();
      gl.bindTexture(gl.TEXTURE_2D, contentTexture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        source
      );
      gl.generateMipmap(gl.TEXTURE_2D);
    }
    function render() {
      uploadContent();
      const h = Math.max(output.clientHeight, 1);
      const w = Math.max(output.clientWidth, 1);
      const zoneFrac = Math.min(Math.max(config.zone, 8) / h, 0.49);
      gl.useProgram(program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, contentTexture);
      gl.uniform1i(uniforms.uContent, 0);
      gl.uniform1f(uniforms.uZone, zoneFrac);
      gl.uniform1f(
        uniforms.uAngle,
        Math.min(Math.max(config.angle, 1), 160) * (Math.PI / 180)
      );
      gl.uniform1f(uniforms.uPersp, Math.max(config.perspective, 50) / h);
      gl.uniform1f(uniforms.uDir, config.direction === "in" ? -1 : 1);
      gl.uniform1f(uniforms.uTopAmt, topCurrent);
      gl.uniform1f(uniforms.uBotAmt, bottomCurrent);
      gl.uniform1f(uniforms.uMaxX, contentMaxX);
      gl.uniform1f(uniforms.uPxY, 1.5 / h);
      gl.uniform1f(uniforms.uPxX, 1.5 / w);
      gl.uniform1f(uniforms.uCover, htmlInCanvas ? 1 : 0);
      gl.uniform3f(uniforms.uBg, bg[0], bg[1], bg[2]);
      gl.uniform1f(uniforms.uTiltX, tiltXCurrent);
      gl.uniform1f(uniforms.uTiltY, tiltYCurrent);
      gl.uniform1f(uniforms.uPhi, phiCurrent);
      gl.uniform1f(
        uniforms.uRound,
        Math.min(Math.max(config.rounding, 0) / h, zoneFrac)
      );
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, output.width, output.height);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    let raf = 0;
    let lastTime = performance.now();
    let destroyed = false;
    let running = false;
    let visible = true;
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reducedMotion = motionQuery.matches;
    function frame(now) {
      if (destroyed) return;
      if (!visible) {
        running = false;
        return;
      }
      const delta = Math.min((now - lastTime) / 1e3, 1 / 30);
      lastTime = now;
      const tau = config.smoothing;
      const k = reducedMotion || tau <= 0 ? 1 : 1 - Math.exp(-delta / Math.max(tau, 1e-4));
      topCurrent += (topTarget - topCurrent) * k;
      bottomCurrent += (bottomTarget - bottomCurrent) * k;
      if (Math.abs(topTarget - topCurrent) < 1e-3) topCurrent = topTarget;
      if (Math.abs(bottomTarget - bottomCurrent) < 1e-3)
        bottomCurrent = bottomTarget;
      over *= Math.exp(-delta / 0.22);
      if (Math.abs(over) < 0.5) over = 0;
      const phiTarget = reducedMotion || config.tumble <= 0 ? 0 : Math.tanh(over / 500) * 0.4 * Math.min(config.tumble, 1);
      phiCurrent += (phiTarget - phiCurrent) * Math.min(delta / 0.09, 1);
      if (phiTarget === 0 && Math.abs(phiCurrent) < 1e-4) phiCurrent = 0;
      if (reducedMotion || config.tilt <= 0) {
        tiltXTarget = 0;
        tiltYTarget = 0;
      }
      const kT = Math.min(delta / 0.15, 1);
      tiltXCurrent += (tiltXTarget - tiltXCurrent) * kT;
      tiltYCurrent += (tiltYTarget - tiltYCurrent) * kT;
      if (Math.abs(tiltXTarget - tiltXCurrent) < 1e-4) tiltXCurrent = tiltXTarget;
      if (Math.abs(tiltYTarget - tiltYCurrent) < 1e-4) tiltYCurrent = tiltYTarget;
      render();
      if (!contentDirty && topCurrent === topTarget && bottomCurrent === bottomTarget && over === 0 && phiCurrent === 0 && tiltXCurrent === tiltXTarget && tiltYCurrent === tiltYTarget) {
        running = false;
        return;
      }
      raf = requestAnimationFrame(frame);
    }
    function start() {
      if (destroyed || running || !visible) return;
      running = true;
      lastTime = performance.now();
      raf = requestAnimationFrame(frame);
    }
    wake = start;
    start();
    function onScroll() {
      syncScroll();
      if (htmlInCanvas) paintable.requestPaint();
      if (hoverOn) updateHover(hoverClientX, hoverClientY);
      start();
    }
    content.addEventListener("scroll", onScroll, { passive: true });
    function onWheel(event) {
      if (config.tumble <= 0 || reducedMotion) return;
      const max = content.scrollHeight - content.clientHeight;
      if (max <= 1) return;
      const st = content.scrollTop;
      if (event.deltaY > 0 && st >= max - 1) {
        over = Math.min(over + event.deltaY, 900);
      } else if (event.deltaY < 0 && st <= 1) {
        over = Math.max(over + event.deltaY, -900);
      } else {
        return;
      }
      start();
    }
    content.addEventListener("wheel", onWheel, { passive: true });
    const rectCache = createRectCache(output);
    function onPointerMove(event) {
      if (!event.isPrimary) return;
      hoverClientX = event.clientX;
      hoverClientY = event.clientY;
      hoverOn = true;
      updateHover(event.clientX, event.clientY);
      if (config.tilt > 0 && !reducedMotion) {
        const rect = rectCache.current;
        if (rect.width > 0 && rect.height > 0) {
          const nx = (event.clientX - rect.left) / rect.width - 0.5;
          const ny = 0.5 - (event.clientY - rect.top) / rect.height;
          const amp = Math.min(config.tilt, 1) * 0.14;
          tiltXTarget = -nx * amp;
          tiltYTarget = -ny * amp;
          start();
        }
      }
    }
    content.addEventListener("pointermove", onPointerMove, { passive: true });
    function onPointerLeave() {
      hoverOn = false;
      setHoverTarget(null);
      tiltXTarget = 0;
      tiltYTarget = 0;
      start();
    }
    content.addEventListener("pointerleave", onPointerLeave);
    function mapPoint(px, py) {
      const w = Math.max(output.clientWidth, 1);
      const h = Math.max(output.clientHeight, 1);
      const persp = Math.max(config.perspective, 50) / h;
      const zone = Math.min(Math.max(config.zone, 8) / h, 0.49);
      const round = Math.min(Math.max(config.rounding, 0) / h, zone);
      const angle = Math.min(Math.max(config.angle, 1), 160) * (Math.PI / 180);
      const dirSign = config.direction === "in" ? -1 : 1;
      const cx = contentMaxX * 0.5;
      const x = px / w;
      let y = 1 - py / h;
      let zSum = 0;
      if (Math.abs(phiCurrent) > 1e-4) {
        const tip = (sy, phi) => {
          const s = Math.sin(phi);
          const c = Math.cos(phi);
          const denom = Math.max(c * persp + s * (sy - 0.5), 1e-4);
          const t = persp * (1 - sy) / denom;
          return [1 - t, t * s];
        };
        if (phiCurrent > 0) {
          const tipped = tip(y, phiCurrent);
          y = tipped[0];
          zSum += tipped[1];
        } else {
          const tipped = tip(1 - y, -phiCurrent);
          y = 1 - tipped[0];
          zSum += tipped[1];
        }
      }
      const zG = tiltXCurrent * (x - cx) + tiltYCurrent * (y - 0.5);
      zSum += zG;
      y = 0.5 + (y - 0.5) * ((persp + zG) / persp);
      const fold = (sy, amt) => {
        const yf = 1 - zone;
        if (amt < 1e-4) return [sy, 0, 1];
        const theta = angle * amt;
        if (round < 1e-4) {
          const s = Math.sin(theta) * dirSign;
          const c = Math.cos(theta);
          const denom = Math.max(c * persp + s * (0.5 - sy), 1e-5);
          const tRaw = persp * (sy - yf) / denom;
          const t = Math.min(Math.max(tRaw, 0), zone);
          const z = Math.max(t * s, -0.85 * persp);
          return [yf + t, z, tRaw > zone ? 0 : 1];
        }
        if (sy <= yf) return [sy, 0, 1];
        const R = Math.min(round, zone);
        const r = R / theta;
        const ca = Math.cos(theta);
        const sa = Math.sin(theta);
        const yA = r * sa;
        const zA = r * (1 - ca);
        let prevSy = yf;
        let prevZ = 0;
        let prevU = 0;
        let bestU = -1;
        let bestZ = 0;
        const du = zone / 40;
        for (let i = 1; i <= 40; i++) {
          const u = du * i;
          let py2;
          let zm;
          if (u <= R) {
            const a = u / r;
            py2 = r * Math.sin(a);
            zm = r * (1 - Math.cos(a));
          } else {
            py2 = yA + (u - R) * ca;
            zm = zA + (u - R) * sa;
          }
          const worldY = yf + py2;
          const worldZ = Math.max(zm * dirSign, -0.85 * persp);
          const scr = 0.5 + (worldY - 0.5) * persp / (persp + worldZ);
          if ((prevSy - sy) * (scr - sy) <= 0 && Math.abs(scr - prevSy) > 1e-7) {
            const f = Math.min(Math.max((sy - prevSy) / (scr - prevSy), 0), 1);
            bestU = prevU + (u - prevU) * f;
            bestZ = prevZ + (worldZ - prevZ) * f;
            if (dirSign > 0) break;
          }
          prevSy = scr;
          prevZ = worldZ;
          prevU = u;
        }
        if (bestU < 0) return [1, prevZ, 0];
        return [yf + bestU, bestZ, 1];
      };
      let srcY = y;
      let alpha = 1;
      if (y >= 1 - zone) {
        const folded = fold(y, topCurrent);
        srcY = folded[0];
        zSum += folded[1];
        alpha *= folded[2];
      } else if (y <= zone) {
        const folded = fold(1 - y, bottomCurrent);
        srcY = 1 - folded[0];
        zSum += folded[1];
        alpha *= folded[2];
      }
      const srcX = cx + (x - cx) * ((persp + zSum) / persp);
      if (srcX < 0 || srcX > contentMaxX || srcY < 0 || srcY > 1) alpha = 0;
      return { x: srcX * w, y: (1 - srcY) * h, alpha };
    }
    let forwarding = false;
    let hoverChain = [];
    let hoverTarget = null;
    let hoverClientX = 0;
    let hoverClientY = 0;
    let hoverOn = false;
    if (htmlInCanvas) {
      patchHoverRules();
      content.setAttribute(CONTENT_ATTR, "");
    }
    function setHoverTarget(target) {
      if (target === hoverTarget) return;
      hoverTarget = target;
      const next = /* @__PURE__ */ new Set();
      for (let el = target; el; el = el.parentElement) {
        next.add(el);
        if (el === content) break;
      }
      for (const el of hoverChain) {
        if (!next.has(el)) el.removeAttribute(HOVER_ATTR);
      }
      for (const el of next) el.setAttribute(HOVER_ATTR, "");
      hoverChain = Array.from(next);
      content.removeAttribute(CURSOR_ATTR);
      content.style.removeProperty("--canvasui-cursor");
      if (target) {
        content.style.setProperty(
          "--canvasui-cursor",
          getComputedStyle(target).cursor
        );
        content.setAttribute(CURSOR_ATTR, "");
      }
    }
    function clientToLocal(clientX, clientY) {
      const rect = output.getBoundingClientRect();
      const width = Math.max(output.clientWidth, 1);
      const height = Math.max(output.clientHeight, 1);
      const dx = clientX - rect.left;
      const dy = clientY - rect.top;
      if (config.interactionRotation === -90) {
        return {
          rect,
          x: width - dy / (rect.height / width),
          y: dx / (rect.width / height)
        };
      }
      if (config.interactionRotation === 90) {
        return {
          rect,
          x: dy / (rect.height / width),
          y: height - dx / (rect.width / height)
        };
      }
      return {
        rect,
        x: dx / (rect.width / width),
        y: dy / (rect.height / height)
      };
    }
    function localToClient(x, y, rect) {
      const width = Math.max(output.clientWidth, 1);
      const height = Math.max(output.clientHeight, 1);
      if (config.interactionRotation === -90) {
        return {
          x: rect.left + y * (rect.width / height),
          y: rect.top + (width - x) * (rect.height / width)
        };
      }
      if (config.interactionRotation === 90) {
        return {
          x: rect.left + (height - y) * (rect.width / height),
          y: rect.top + x * (rect.height / width)
        };
      }
      return {
        x: rect.left + x * (rect.width / width),
        y: rect.top + y * (rect.height / height)
      };
    }
    function updateHover(clientX, clientY) {
      if (!htmlInCanvas) return;
      const local = clientToLocal(clientX, clientY);
      const { rect } = local;
      if (rect.width === 0 || rect.height === 0) return;
      const mapped = mapPoint(local.x, local.y);
      if (mapped.alpha < 0.5) {
        setHoverTarget(null);
        return;
      }
      const point = localToClient(mapped.x, mapped.y, rect);
      const target = document.elementFromPoint(point.x, point.y);
      setHoverTarget(target && content.contains(target) ? target : null);
    }
    function onClick(event) {
      if (forwarding || !htmlInCanvas || event.button !== 0) return;
      const local = clientToLocal(event.clientX, event.clientY);
      const { rect } = local;
      if (rect.width === 0 || rect.height === 0) return;
      const mapped = mapPoint(local.x, local.y);
      if (mapped.alpha < 0.5) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      const point = localToClient(mapped.x, mapped.y, rect);
      if (Math.hypot(point.x - event.clientX, point.y - event.clientY) < 1.5)
        return;
      event.preventDefault();
      event.stopPropagation();
      const target = document.elementFromPoint(point.x, point.y);
      if (!target) return;
      forwarding = true;
      try {
        target.dispatchEvent(
          new MouseEvent("click", {
            bubbles: true,
            cancelable: true,
            composed: true,
            view: window,
            detail: event.detail,
            clientX: point.x,
            clientY: point.y,
            screenX: event.screenX,
            screenY: event.screenY,
            ctrlKey: event.ctrlKey,
            shiftKey: event.shiftKey,
            altKey: event.altKey,
            metaKey: event.metaKey,
            button: event.button
          })
        );
        if (target instanceof HTMLElement && target.matches("input, textarea, select, [contenteditable]")) {
          target.focus();
        }
      } finally {
        forwarding = false;
      }
    }
    content.addEventListener("click", onClick, true);
    function caretAt(x, y) {
      const doc = document;
      if (typeof doc.caretPositionFromPoint === "function") {
        const c = doc.caretPositionFromPoint(x, y);
        return c ? { node: c.offsetNode, offset: c.offset } : null;
      }
      const r = doc.caretRangeFromPoint?.(x, y);
      return r ? { node: r.startContainer, offset: r.startOffset } : null;
    }
    function remapped(event) {
      const local = clientToLocal(event.clientX, event.clientY);
      const { rect } = local;
      if (rect.width === 0 || rect.height === 0) return null;
      const mapped = mapPoint(local.x, local.y);
      if (mapped.alpha < 0.5) return null;
      const point = localToClient(mapped.x, mapped.y, rect);
      const tx = point.x;
      const ty = point.y;
      if (Math.hypot(tx - event.clientX, ty - event.clientY) < 1.5) return null;
      return { x: tx, y: ty };
    }
    let selecting = false;
    function onMouseDown(event) {
      if (forwarding || !htmlInCanvas || event.button !== 0) return;
      const m = remapped(event);
      if (!m) return;
      event.preventDefault();
      const caret = caretAt(m.x, m.y);
      if (!caret || !content.contains(caret.node)) return;
      const sel = window.getSelection();
      if (!sel) return;
      sel.removeAllRanges();
      sel.collapse(caret.node, caret.offset);
      selecting = true;
    }
    function onSelMove(event) {
      if (!selecting) return;
      if (!(event.buttons & 1)) {
        selecting = false;
        return;
      }
      const m = remapped(event);
      const caret = m ? caretAt(m.x, m.y) : null;
      const sel = window.getSelection();
      if (caret && sel && sel.anchorNode && content.contains(caret.node)) {
        sel.extend(caret.node, caret.offset);
      }
    }
    function onSelEnd() {
      selecting = false;
    }
    content.addEventListener("mousedown", onMouseDown, true);
    window.addEventListener("mousemove", onSelMove, true);
    window.addEventListener("mouseup", onSelEnd, true);
    function onMotionChange() {
      reducedMotion = motionQuery.matches;
      start();
    }
    motionQuery.addEventListener("change", onMotionChange);
    const observer = createCanvasResizeObserver(() => {
      syncCanvasSize();
      syncScroll();
      start();
    });
    observer.observe(output);
    observer.observe(content);
    const intersection = new IntersectionObserver((entries) => {
      visible = entries[entries.length - 1]?.isIntersecting ?? true;
      if (visible) start();
    });
    intersection.observe(output);
    return {
      setOptions(next) {
        if (!Object.entries(next).some(
          ([key, value]) => config[key] !== value
        ))
          return;
        Object.assign(config, next);
        syncScroll();
        start();
      },
      resize() {
        syncCanvasSize();
        syncScroll();
        start();
      },
      destroy() {
        destroyed = true;
        rectCache.destroy();
        cancelAnimationFrame(raf);
        setHoverTarget(null);
        content.removeAttribute(CONTENT_ATTR);
        content.removeAttribute(CURSOR_ATTR);
        content.removeEventListener("scroll", onScroll);
        content.removeEventListener("wheel", onWheel);
        content.removeEventListener("pointermove", onPointerMove);
        content.removeEventListener("pointerleave", onPointerLeave);
        content.removeEventListener("click", onClick, true);
        content.removeEventListener("mousedown", onMouseDown, true);
        window.removeEventListener("mousemove", onSelMove, true);
        window.removeEventListener("mouseup", onSelEnd, true);
        observer.disconnect();
        intersection.disconnect();
        motionQuery.removeEventListener("change", onMotionChange);
        gl.deleteTexture(contentTexture);
        gl.deleteProgram(program);
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
        gl.deleteBuffer(quad);
        if (htmlInCanvas) paintable.onpaint = null;
      }
    };
  }

  // src/effects/bend.js
  var DIRECTIONS = [
    { value: "out", label: "Outward" },
    { value: "in", label: "Inward" }
  ];
  var CONTROLS2 = {
    direction: radio("Bend direction", "in", DIRECTIONS),
    top: toggle("Top", true),
    bottom: toggle("Bottom", true),
    zone: scrub("Zone", 240, { min: 60, max: 480, step: 10, decimals: 0 }),
    angle: scrub("Angle", 80, { min: 10, max: 160, step: 5, decimals: 0 }),
    rounding: scrub("Rounding", 150, { min: 0, max: 480, step: 10, decimals: 0 }),
    perspective: scrub("Perspective", 700, {
      min: 200,
      max: 2400,
      step: 50,
      decimals: 0
    }),
    ease: scrub("Ease", 240, { min: 40, max: 800, step: 20, decimals: 0 }),
    smoothing: scrub("Smoothing", 0.1, { min: 0, max: 0.5, step: 0.01 }),
    tumble: scrub("Tumble", 0.5, { min: 0, max: 1, step: 0.05 }),
    tilt: scrub("Tilt", 0.5, { min: 0, max: 1, step: 0.05 })
  };
  var bend_default = {
    slug: "bend",
    name: "Bend",
    component: "Bend",
    description: "Folds the page over virtual edges as you scroll.",
    controls: CONTROLS2,
    toOptions(values) {
      return { ...values };
    },
    create: createBend
  };

  // src/vendor/lib/Blaze/BlazeVanilla.ts
  var DEFAULTS3 = {
    height: 0.97,
    distortion: 0.6,
    distortionScale: 0.5,
    speed: 1,
    sparks: 0.5,
    sparkDensity: 1.5,
    sparkSize: 1,
    layers: 4,
    smoke: 0.5,
    glow: 1.5,
    sparkColor: [1, 0.4, 0.05],
    smokeColor: [1, 0.43, 0.1]
  };
  var VERT3 = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPos;
out vec2 vUv;
void main () {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;
  var NOISE = `
float hash1_2 (vec2 x) {
  return fract(sin(dot(x, vec2(52.127, 61.2871))) * 521.582);
}

vec2 hash2_2 (vec2 x) {
  return fract(sin(x * mat2(20.52, 24.1994, 70.291, 80.171)) * 492.194);
}

vec2 noise2_2 (vec2 uv) {
  vec2 f = smoothstep(0.0, 1.0, fract(uv));
  vec2 uv00 = floor(uv);
  vec2 v00 = hash2_2(uv00);
  vec2 v01 = hash2_2(uv00 + vec2(0.0, 1.0));
  vec2 v10 = hash2_2(uv00 + vec2(1.0, 0.0));
  vec2 v11 = hash2_2(uv00 + 1.0);
  return mix(mix(v00, v01, f.y), mix(v10, v11, f.y), f.x);
}

vec3 permute (vec3 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }

float snoise (vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
    -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}`;
  var FIRE_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform vec2 uResolution;
uniform float uTime;
uniform float uHeight;
uniform float uSparks;
uniform float uSparkDensity;
uniform float uSparkSize;
uniform int uLayers;
uniform float uSmoke;
uniform float uGlow;
uniform vec3 uSparkColor;
uniform vec3 uSmokeColor;

#define MOVE_DIR vec2(0.0, -1.0)
#define MOVE_SPEED 0.5
${NOISE}

float fbm (vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 3; i++) {
    v += a * snoise(p);
    p = mat2(1.6, 1.2, -1.2, 1.6) * p + 11.7;
    a *= 0.5;
  }
  return v * 0.5 + 0.5;
}

float smokeField (vec2 p, float t) {
  vec2 rise = vec2(-t * 0.03, -t * 0.22);
  vec2 q = vec2(
    fbm(p + rise),
    fbm(p + rise * 0.85 + vec2(5.2, 1.3)));
  return fbm(p + 0.55 * q + rise);
}

vec2 rotate2 (vec2 point, float deg) {
  float s = sin(deg);
  float c = cos(deg);
  return mat2(s, c, -c, s) * point;
}

vec2 voronoiPoint (vec2 root, float deg) {
  vec2 point = hash2_2(root) - 0.5;
  float s = sin(deg);
  float c = cos(deg);
  point = mat2(s, c, -c, s) * point * 0.66;
  point += root + 0.5;
  return point;
}

vec2 randomAround (vec2 point, vec2 range, vec2 uv) {
  return point + (hash2_2(uv) - 0.5) * range;
}

vec3 fireParticles (vec2 uv, vec2 originalUV) {
  vec3 particles = vec3(0.0);
  vec2 rootUV = floor(uv);
  float deg = uTime * 0.6 * (hash1_2(rootUV) - 0.5) * 2.0;
  vec2 pointUV = voronoiPoint(rootUV, deg);
  float size = 0.002 * uSparkSize;

  vec2 tempUV = uv + vec2(
    snoise(uv * 1.8 + uTime * 0.55),
    snoise(uv * 1.8 - uTime * 0.4 + 7.3)) * 0.06;

  float dist = length(rotate2(tempUV - pointUV, 0.7)
    * randomAround(vec2(0.5, 1.6), vec2(0.25, 0.2), rootUV));
  float distBloom = length(rotate2(tempUV - pointUV, 0.7)
    * randomAround(vec2(0.5, 0.8), vec2(0.3, 0.1), rootUV));

  particles += (1.0 - smoothstep(size * 0.6, size * 3.0, dist)) * uSparkColor * 1.5;
  particles += pow(1.0 - smoothstep(0.0, size * 6.0, distBloom), 3.0) * uSparkColor * 0.8;

  float border = (hash1_2(rootUV) - 0.5) * 2.0;
  float disappear = 1.0 - smoothstep(border, border + 0.5, originalUV.y);
  border = (hash1_2(rootUV + 0.214) - 1.8) * 0.7;
  float appear = smoothstep(border, border + 0.4, originalUV.y);

  return particles * disappear * appear;
}

vec3 layeredParticles (vec2 uv, float sizeMod, float alphaMod, int layers, float smoke) {
  vec3 particles = vec3(0.0);
  float size = 1.0;
  float alpha = 1.0;
  vec2 offset = vec2(0.0);
  for (int i = 0; i < layers; i++) {
    vec2 noiseOffset = (noise2_2(uv * size * 2.0 + 0.5) - 0.5) * 0.15;
    vec2 bokehUV = (uv * size * uSparkDensity + uTime * MOVE_DIR * MOVE_SPEED)
      + offset + noiseOffset;
    particles += fireParticles(bokehUV, uv) * alpha
      * (1.0 - smoothstep(0.0, 1.0, smoke) * (float(i) / float(layers)));
    offset += hash2_2(vec2(alpha, alpha)) * 10.0;
    alpha *= alphaMod;
    size *= sizeMod;
  }
  return particles;
}

void main () {
  vec2 uv = vUv;

  float zone = clamp(uHeight, 0.02, 1.0);
  float fy = uv.y / zone;

  if (fy > 1.0) {
    outColor = vec4(0.0);
    return;
  }

  float aspect = uResolution.x / uResolution.y;
  vec2 fireUv = vec2((uv.x - 0.5) * aspect * 3.2, mix(-0.7, 1.6, fy));

  float smokeIntensity = 0.0;
  if (uSmoke > 0.001) {
    smokeIntensity = smokeField(fireUv * vec2(0.4, 0.55), uTime);
    smokeIntensity = smoothstep(0.42, 1.15, smokeIntensity);
    smokeIntensity *= pow(1.0 - smoothstep(-1.0, 1.6, fireUv.y), 1.5);
  }
  vec3 smoke = smokeIntensity * uSmokeColor * 0.8 * uSmoke;

  vec3 particles = vec3(0.0);
  if (uSparks > 0.001) {
    particles = layeredParticles(fireUv, 1.01, 0.9, uLayers, smokeIntensity) * uSparks;
  }

  float fade = 1.0 - smoothstep(0.55, 1.0, fy);
  vec3 glow = uSmokeColor * 0.05 * uGlow * pow(1.0 - fy, 2.0);
  vec3 fire = (particles + smoke) * fade + glow;

  outColor = vec4(fire, max(fire.r, max(fire.g, fire.b)));
}`;
  var FRAG3 = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uContent;
uniform sampler2D uFire;
uniform float uTime;
uniform float uHeight;
uniform float uDistortion;
uniform float uDistortionScale;
uniform float uMaxX;
uniform float uHasContent;
${NOISE}

float snoiseOctaves (vec2 uv, int octaves, float alpha, float beta, vec2 gamma, float delta) {
  vec2 pos = uv;
  float t = 1.0;
  float s = 1.0;
  vec2 q = gamma;
  float r = 0.0;
  for (int i = 0; i < octaves; i++) {
    r += s * snoise(pos + q);
    pos += t * uv;
    t *= beta;
    s *= alpha;
    q *= delta;
  }
  return r;
}

void main () {
  vec2 uv = vUv;

  if (uv.x > uMaxX) {
    outColor = vec4(0.0);
    return;
  }

  float zone = clamp(uHeight, 0.02, 1.0);
  float fy = uv.y / zone;

  if (uHasContent < 0.5) {
    if (fy > 1.0) {
      outColor = vec4(0.0);
      return;
    }
    vec4 fire = texture(uFire, uv);
    outColor = vec4(fire.rgb, clamp(fire.a * 0.85, 0.0, 1.0));
    return;
  }

  if (fy > 1.0) {
    vec4 c = texture(uContent, vec2(uv.x, 1.0 - uv.y));
    outColor = vec4(c.rgb * c.a, c.a);
    return;
  }

  float heat = uDistortion * pow(1.0 - smoothstep(0.0, 1.0, fy), 1.5);
  vec2 uv1 = uv;
  if (heat > 0.0005) {
    vec2 nUv = uv * 2.0 * uDistortionScale;
    float dx = 0.005 * snoiseOctaves(nUv + uTime * vec2(0.00323, 0.00345),
      4, 0.85, -3.0, uTime * vec2(-0.0323, -0.345), 1.203);
    float dy = 0.0035 * snoiseOctaves(nUv + 3.0 + uTime * vec2(-0.00323, 0.00345),
      4, 0.85, -3.0, uTime * vec2(-0.0323, -0.345), 1.203);
    uv1 = clamp(uv + vec2(dx, dy) * heat, vec2(0.001), vec2(uMaxX - 0.004, 0.999));
  }
  vec4 content = texture(uContent, vec2(uv1.x, 1.0 - uv1.y));

  vec4 fire = texture(uFire, uv);

  float luma = dot(content.rgb, vec3(0.299, 0.587, 0.114)) * content.a;
  vec3 col = content.rgb * content.a * (1.0 - fire.a * luma) + fire.rgb;
  float alpha = clamp(content.a + fire.a, 0.0, 1.0);
  outColor = vec4(col, alpha);
}`;
  function createBlaze(elements, options = {}) {
    const config = { ...DEFAULTS3, ...options };
    const { source, content, output } = elements;
    const gl = output.getContext("webgl2", {
      alpha: true,
      depth: false,
      stencil: false,
      antialias: false,
      premultipliedAlpha: true
    });
    if (!gl || gl.isContextLost()) return null;
    const sourceCtx = source.getContext("2d");
    const paintable = source;
    const htmlInCanvas = Boolean(
      sourceCtx && typeof sourceCtx.drawElementImage === "function" && typeof paintable.requestPaint === "function"
    );
    if (htmlInCanvas) prepareHtmlInCanvas(source, content);
    let contentDirty = false;
    let wake = () => {
    };
    if (htmlInCanvas) {
      paintable.onpaint = () => {
        try {
          sourceCtx.reset();
          drawHtmlInCanvas(source, sourceCtx, content);
          contentDirty = true;
          wake();
        } catch {
        }
      };
    }
    function compile(type, text) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, text);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error("Blaze shader error:", gl.getShaderInfoLog(shader));
      }
      return shader;
    }
    function link(fragText) {
      const vertexShader = compile(gl.VERTEX_SHADER, VERT3);
      const fragmentShader = compile(gl.FRAGMENT_SHADER, fragText);
      const program = gl.createProgram();
      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);
      const uniforms = {};
      const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < count; i++) {
        const info = gl.getActiveUniform(program, i);
        uniforms[info.name] = gl.getUniformLocation(program, info.name);
      }
      return { program, uniforms, vertexShader, fragmentShader };
    }
    const mainPass = link(FRAG3);
    const firePass = link(FIRE_FRAG);
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const contentTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, contentTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([0, 0, 0, 0])
    );
    let contentMaxX = 1;
    let fireTexture = null;
    let fireFbo = null;
    let fireWidth = 0;
    let fireHeight = 0;
    function ensureFireTarget() {
      const width = Math.max(1, Math.floor(output.width / 2));
      const height = Math.max(1, Math.floor(output.height / 2));
      if (fireTexture && width === fireWidth && height === fireHeight) return;
      fireWidth = width;
      fireHeight = height;
      if (fireTexture) gl.deleteTexture(fireTexture);
      if (fireFbo) gl.deleteFramebuffer(fireFbo);
      fireTexture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, fireTexture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        width,
        height,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        null
      );
      fireFbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fireFbo);
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D,
        fireTexture,
        0
      );
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    function syncCanvasSize() {
      const dpr = getCanvasPixelRatio(output, gl);
      const width = Math.max(1, Math.round(output.clientWidth * dpr));
      const height = Math.max(1, Math.round(output.clientHeight * dpr));
      if (output.width !== width || output.height !== height) {
        output.width = width;
        output.height = height;
      }
      contentMaxX = Math.min(
        1,
        Math.max(0.05, content.clientWidth / Math.max(output.clientWidth, 1))
      );
      if (htmlInCanvas) {
        const sourceWidth = Math.max(1, Math.round(source.clientWidth * dpr));
        const sourceHeight = Math.max(1, Math.round(source.clientHeight * dpr));
        if (source.width !== sourceWidth || source.height !== sourceHeight) {
          source.width = sourceWidth;
          source.height = sourceHeight;
        }
        paintable.requestPaint();
      }
    }
    syncCanvasSize();
    function uploadContent() {
      if (!htmlInCanvas || !contentDirty) return;
      contentDirty = false;
      gl.bindTexture(gl.TEXTURE_2D, contentTexture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        source
      );
    }
    let time = 0;
    function render() {
      uploadContent();
      ensureFireTarget();
      gl.useProgram(firePass.program);
      gl.uniform2f(firePass.uniforms.uResolution, output.width, output.height);
      gl.uniform1f(firePass.uniforms.uTime, time);
      gl.uniform1f(firePass.uniforms.uHeight, config.height);
      gl.uniform1f(firePass.uniforms.uSparks, config.sparks);
      gl.uniform1f(
        firePass.uniforms.uSparkDensity,
        Math.max(config.sparkDensity, 0.05)
      );
      gl.uniform1f(
        firePass.uniforms.uSparkSize,
        Math.max(config.sparkSize, 0.05)
      );
      gl.uniform1i(
        firePass.uniforms.uLayers,
        Math.min(Math.max(Math.round(config.layers), 1), 10)
      );
      gl.uniform1f(firePass.uniforms.uSmoke, config.smoke);
      gl.uniform1f(firePass.uniforms.uGlow, config.glow);
      gl.uniform3f(
        firePass.uniforms.uSparkColor,
        config.sparkColor[0],
        config.sparkColor[1],
        config.sparkColor[2]
      );
      gl.uniform3f(
        firePass.uniforms.uSmokeColor,
        config.smokeColor[0],
        config.smokeColor[1],
        config.smokeColor[2]
      );
      gl.bindFramebuffer(gl.FRAMEBUFFER, fireFbo);
      gl.viewport(0, 0, fireWidth, fireHeight);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.useProgram(mainPass.program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, contentTexture);
      gl.uniform1i(mainPass.uniforms.uContent, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, fireTexture);
      gl.uniform1i(mainPass.uniforms.uFire, 1);
      gl.activeTexture(gl.TEXTURE0);
      gl.uniform1f(mainPass.uniforms.uTime, time);
      gl.uniform1f(mainPass.uniforms.uHeight, config.height);
      gl.uniform1f(mainPass.uniforms.uDistortion, config.distortion);
      gl.uniform1f(
        mainPass.uniforms.uDistortionScale,
        Math.max(config.distortionScale, 0.05)
      );
      gl.uniform1f(mainPass.uniforms.uMaxX, contentMaxX);
      gl.uniform1f(mainPass.uniforms.uHasContent, htmlInCanvas ? 1 : 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, output.width, output.height);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    let raf = 0;
    let lastTime = performance.now();
    let destroyed = false;
    let running = false;
    let visible = true;
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reducedMotion = motionQuery.matches;
    function frame(now) {
      if (destroyed) return;
      if (!visible) {
        running = false;
        return;
      }
      const delta = Math.min((now - lastTime) / 1e3, 1 / 30);
      lastTime = now;
      if (!reducedMotion) time += delta * config.speed;
      render();
      if (reducedMotion && !contentDirty) {
        running = false;
        return;
      }
      raf = requestAnimationFrame(frame);
    }
    function start() {
      if (destroyed || running || !visible) return;
      running = true;
      lastTime = performance.now();
      raf = requestAnimationFrame(frame);
    }
    wake = start;
    start();
    function onMotionChange() {
      reducedMotion = motionQuery.matches;
      start();
    }
    motionQuery.addEventListener("change", onMotionChange);
    const observer = createCanvasResizeObserver(() => {
      syncCanvasSize();
      start();
    });
    observer.observe(output);
    observer.observe(content);
    const intersection = new IntersectionObserver((entries) => {
      visible = entries[entries.length - 1]?.isIntersecting ?? true;
      if (visible) start();
    });
    intersection.observe(output);
    return {
      setOptions(next) {
        if (!Object.entries(next).some(
          ([key, value]) => config[key] !== value
        ))
          return;
        Object.assign(config, next);
        start();
      },
      resize() {
        syncCanvasSize();
        start();
      },
      destroy() {
        destroyed = true;
        cancelAnimationFrame(raf);
        observer.disconnect();
        intersection.disconnect();
        motionQuery.removeEventListener("change", onMotionChange);
        gl.deleteTexture(contentTexture);
        if (fireTexture) gl.deleteTexture(fireTexture);
        if (fireFbo) gl.deleteFramebuffer(fireFbo);
        for (const pass of [mainPass, firePass]) {
          gl.deleteProgram(pass.program);
          gl.deleteShader(pass.vertexShader);
          gl.deleteShader(pass.fragmentShader);
        }
        gl.deleteBuffer(quad);
        if (htmlInCanvas) paintable.onpaint = null;
      }
    };
  }

  // src/effects/blaze.js
  var CONTROLS3 = {
    height: scrub("Height", 0.97, { min: 0.1, max: 1, step: 0.01 }),
    distortion: scrub("Distortion", 0.6, {
      min: 0,
      max: 3,
      step: 0.1,
      decimals: 1
    }),
    distortionScale: scrub("Heat scale", 0.5, { min: 0.3, max: 3, step: 0.05 }),
    speed: scrub("Speed", 1, { min: 0, max: 3, step: 0.1, decimals: 1 }),
    sparks: scrub("Sparks", 0.5, { min: 0, max: 2, step: 0.05 }),
    sparkDensity: scrub("Spark density", 1.5, { min: 0.3, max: 3, step: 0.05 }),
    sparkSize: scrub("Spark size", 1, { min: 0.5, max: 3, step: 0.05 }),
    layers: scrub("Layers", 4, { min: 1, max: 10, step: 1, decimals: 0 }),
    smoke: scrub("Smoke", 0.5, { min: 0, max: 2, step: 0.05 }),
    glow: scrub("Glow", 1.5, { min: 0, max: 3, step: 0.1, decimals: 1 }),
    spark: color("Spark", "#ff660d"),
    smokeColor: color("Smoke", "#ff6e1a")
  };
  var blaze_default = {
    slug: "blaze",
    name: "Blaze",
    component: "Blaze",
    description: "Fire, smoke, and heat rising over the page.",
    controls: CONTROLS3,
    toOptions(values) {
      const { spark, smokeColor, ...rest } = values;
      return {
        ...rest,
        sparkColor: hexToRgb(spark),
        smokeColor: hexToRgb(smokeColor)
      };
    },
    create: createBlaze
  };

  // src/vendor/lib/Bubble/BubbleVanilla.ts
  var DEFAULTS4 = {
    size: 30,
    trail: 24,
    follow: 0.5,
    blend: 14,
    speed: 2,
    refraction: 80,
    dispersion: 1,
    frost: 0,
    shine: 0.25,
    rim: 0.5,
    iridescence: 1,
    intensity: 0.9,
    tint: [1, 1, 1],
    tintStrength: 0,
    colorA: [0.2902, 0.4549, 0.7216],
    colorB: [0.4118, 0.4118, 0.4157],
    fallbackOpacity: 1
  };
  var MAX_TRAIL = 24;
  var VERT4 = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPos;
void main () {
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;
  var FRAG4 = `#version 300 es
precision highp float;
out vec4 outColor;
uniform sampler2D uContent;
uniform vec2 uResolution;
uniform float uMaxX;
uniform float uDpr;
uniform float uTime;
uniform float uHasContent;
uniform int uCount;
uniform vec2 uTrail[${MAX_TRAIL}];
uniform float uBaseRadius;
uniform float uBlend;
uniform float uRefraction;
uniform float uDispersion;
uniform float uFrost;
uniform float uShine;
uniform float uRim;
uniform float uIridescence;
uniform float uIntensity;
uniform vec3 uTint;
uniform float uTintStrength;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform float uFallbackAlpha;

const float EPS = 1e-4;
const int ITR = 16;

vec3 page (vec2 px, float lod) {
  vec2 uv = px / uResolution;
  uv.x = clamp(uv.x, 0.0005, uMaxX - 0.0005);
  uv.y = clamp(uv.y, 0.0005, 0.9995);
  return pow(textureLod(uContent, vec2(uv.x, 1.0 - uv.y), lod).rgb, vec3(2.2));
}

float rnd3D (vec3 p) {
  return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453123);
}

float noise3D (vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);

  float a000 = rnd3D(i);
  float a100 = rnd3D(i + vec3(1.0, 0.0, 0.0));
  float a010 = rnd3D(i + vec3(0.0, 1.0, 0.0));
  float a110 = rnd3D(i + vec3(1.0, 1.0, 0.0));
  float a001 = rnd3D(i + vec3(0.0, 0.0, 1.0));
  float a101 = rnd3D(i + vec3(1.0, 0.0, 1.0));
  float a011 = rnd3D(i + vec3(0.0, 1.0, 1.0));
  float a111 = rnd3D(i + vec3(1.0, 1.0, 1.0));

  vec3 u = f * f * (3.0 - 2.0 * f);

  float k0 = a000;
  float k1 = a100 - a000;
  float k2 = a010 - a000;
  float k3 = a001 - a000;
  float k4 = a000 - a100 - a010 + a110;
  float k5 = a000 - a010 - a001 + a011;
  float k6 = a000 - a100 - a001 + a101;
  float k7 = -a000 + a100 + a010 - a110 + a001 - a101 - a011 + a111;

  return k0 + k1 * u.x + k2 * u.y + k3 * u.z + k4 * u.x * u.y +
    k5 * u.y * u.z + k6 * u.z * u.x + k7 * u.x * u.y * u.z;
}

float smoothMin (float d1, float d2, float k) {
  float h = exp(-k * d1) + exp(-k * d2);
  return -log(max(h, 1e-12)) / k;
}

float map (vec3 p) {
  float radius = uBaseRadius * float(uCount);
  float d = 1e5;
  for (int i = 0; i < ${MAX_TRAIL}; i++) {
    if (i >= uCount) break;
    float sphere = length(p - vec3(uTrail[i], 0.0)) -
      (radius - uBaseRadius * float(i));
    d = smoothMin(d, sphere, uBlend);
  }
  return d;
}

vec3 generateNormal (vec3 p) {
  return normalize(vec3(
    map(p + vec3(EPS, 0.0, 0.0)) - map(p + vec3(-EPS, 0.0, 0.0)),
    map(p + vec3(0.0, EPS, 0.0)) - map(p + vec3(0.0, -EPS, 0.0)),
    map(p + vec3(0.0, 0.0, EPS)) - map(p + vec3(0.0, 0.0, -EPS))));
}

vec3 dropletColor (vec3 normal, vec3 rayDir) {
  vec3 reflectDir = reflect(rayDir, normal);
  float noisePosTime = noise3D(reflectDir * 2.0 + uTime);
  float noiseNegTime = noise3D(reflectDir * 2.0 - uTime);
  vec3 color0 = uColorA * noisePosTime;
  vec3 color1 = uColorB * noiseNegTime;
  return (color0 + color1) * uIntensity;
}

void main () {
  vec2 frag = gl_FragCoord.xy;
  float minRes = min(uResolution.x, uResolution.y);
  vec2 p = (frag * 2.0 - uResolution) / minRes;

  vec3 ray = vec3(p, 1.0);
  vec3 rayDir = vec3(0.0, 0.0, -1.0);
  float dist = 0.0;

  for (int i = 0; i < ITR; ++i) {
    dist = map(ray);
    ray += rayDir * dist;
    if (dist < EPS || dist > 8.0) break;
  }

  float cov = 1.0 - smoothstep(0.0, 3.0 / minRes, dist);
  if (!(cov > 0.001)) {
    outColor = vec4(0.0);
    return;
  }

  vec3 n = generateNormal(ray);
  vec3 glints = pow(max(dropletColor(n, rayDir), 0.0), vec3(7.0));
  vec3 L = normalize(vec3(-0.5, 0.7, 0.6));
  float spec = pow(max(dot(reflect(-L, n), vec3(0.0, 0.0, 1.0)), 0.0), 60.0);

  vec3 color;
  float alpha = cov;
  if (uHasContent > 0.5) {
    float depth = uRefraction * uDpr;
    float ca = uDispersion * 0.03;
    vec3 rvR = refract(rayDir, n, 1.0 / (1.33 - ca));
    vec3 rvG = refract(rayDir, n, 1.0 / 1.33);
    vec3 rvB = refract(rayDir, n, 1.0 / (1.33 + ca));
    vec2 offR = rvR.xy * (depth / max(abs(rvR.z), 0.35));
    vec2 offG = rvG.xy * (depth / max(abs(rvG.z), 0.35));
    vec2 offB = rvB.xy * (depth / max(abs(rvB.z), 0.35));
    float lod = max(uFrost * 5.0, log2(1.0 + length(offG) * 0.05 / uDpr));
    vec3 refr = vec3(
      page(frag + offR, lod).r,
      page(frag + offG, lod).g,
      page(frag + offB, lod).b);
    refr *= mix(vec3(1.0), uTint, clamp(uTintStrength, 0.0, 1.0));
    float edge = pow(1.0 - clamp(n.z, 0.0, 1.0), 1.5);
    refr *= 1.0 - 0.35 * uRim * edge;
    color = pow(max(refr, 0.0), vec3(1.0 / 2.2));
    color += glints * uIridescence;
    color += vec3(spec * uShine * 0.9);
  } else {
    float edge = pow(1.0 - clamp(n.z, 0.0, 1.0), 1.5);
    vec3 filmTint = mix(vec3(0.9), uTint, clamp(uTintStrength, 0.0, 1.0));
    float fade = cov * clamp(uFallbackAlpha, 0.0, 1.0);
    vec3 light = glints * uIridescence * 0.65 + vec3(spec * uShine * 1.5) +
      filmTint * (0.55 * max(uRim, 0.4) * edge + 0.03);
    float a = fade * clamp(0.08 + 0.4 * edge, 0.0, 1.0);
    outColor = vec4(light * fade, a);
    return;
  }
  outColor = vec4(color * alpha, alpha);
}`;
  function createBubble(elements, options = {}) {
    const config = { ...DEFAULTS4, ...options };
    const { source, content, output } = elements;
    const gl = output.getContext("webgl2", {
      alpha: true,
      depth: false,
      stencil: false,
      antialias: false,
      premultipliedAlpha: true
    });
    if (!gl || gl.isContextLost()) return null;
    const sourceCtx = source.getContext("2d");
    const paintable = source;
    const htmlInCanvas = Boolean(
      sourceCtx && typeof sourceCtx.drawElementImage === "function" && typeof paintable.requestPaint === "function"
    );
    if (htmlInCanvas) prepareHtmlInCanvas(source, content);
    let contentDirty = false;
    let wake = () => {
    };
    if (htmlInCanvas) {
      paintable.onpaint = () => {
        try {
          sourceCtx.reset();
          drawHtmlInCanvas(source, sourceCtx, content);
          contentDirty = true;
          wake();
        } catch {
        }
      };
    }
    function compile(type, text) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, text);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error("Bubble shader error:", gl.getShaderInfoLog(shader));
      }
      return shader;
    }
    const vertexShader = compile(gl.VERTEX_SHADER, VERT4);
    const fragmentShader = compile(gl.FRAGMENT_SHADER, FRAG4);
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    const uniforms = {};
    const uniformCount = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < uniformCount; i++) {
      const info = gl.getActiveUniform(program, i);
      uniforms[info.name] = gl.getUniformLocation(program, info.name);
    }
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const contentTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, contentTexture);
    gl.texParameteri(
      gl.TEXTURE_2D,
      gl.TEXTURE_MIN_FILTER,
      gl.LINEAR_MIPMAP_LINEAR
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([0, 0, 0, 0])
    );
    gl.generateMipmap(gl.TEXTURE_2D);
    let contentMaxX = 1;
    function syncCanvasSize() {
      const dpr = getCanvasPixelRatio(output, gl);
      const width = Math.max(1, Math.round(output.clientWidth * dpr));
      const height = Math.max(1, Math.round(output.clientHeight * dpr));
      if (output.width !== width || output.height !== height) {
        output.width = width;
        output.height = height;
      }
      contentMaxX = Math.min(
        1,
        Math.max(0.05, content.clientWidth / Math.max(output.clientWidth, 1))
      );
      if (htmlInCanvas) {
        const sourceWidth = Math.max(1, Math.round(source.clientWidth * dpr));
        const sourceHeight = Math.max(1, Math.round(source.clientHeight * dpr));
        if (source.width !== sourceWidth || source.height !== sourceHeight) {
          source.width = sourceWidth;
          source.height = sourceHeight;
        }
        paintable.requestPaint();
      }
    }
    syncCanvasSize();
    function uploadContent() {
      if (!htmlInCanvas || !contentDirty) return;
      contentDirty = false;
      gl.bindTexture(gl.TEXTURE_2D, contentTexture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        source
      );
      gl.generateMipmap(gl.TEXTURE_2D);
    }
    const trailX = new Float32Array(MAX_TRAIL);
    const trailY = new Float32Array(MAX_TRAIL);
    const trailData = new Float32Array(MAX_TRAIL * 2);
    let headX = output.clientWidth / 2;
    let headY = output.clientHeight / 2;
    let targetX = headX;
    let targetY = headY;
    trailX.fill(headX);
    trailY.fill(headY);
    let presence = 0;
    let presenceTarget = 0;
    let hasPointer = false;
    let time = 0;
    function activeCount() {
      return Math.min(Math.max(Math.round(config.trail), 1), MAX_TRAIL);
    }
    function render() {
      uploadContent();
      const dpr = output.width / Math.max(output.clientWidth, 1);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, output.width, output.height);
      gl.disable(gl.SCISSOR_TEST);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (presence <= 4e-3) return;
      const count = activeCount();
      const minRes = Math.min(output.width, output.height);
      const headRadius = Math.max(config.size, 4) * dpr * presence;
      const baseRadius = headRadius * 2 / (minRes * count);
      const blend = Math.max(config.blend, 0.5);
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (let i = 0; i < count; i++) {
        const dx = trailX[i] * dpr;
        const dy = output.height - trailY[i] * dpr;
        trailData[i * 2] = (dx * 2 - output.width) / minRes;
        trailData[i * 2 + 1] = (dy * 2 - output.height) / minRes;
        minX = Math.min(minX, dx);
        maxX = Math.max(maxX, dx);
        minY = Math.min(minY, dy);
        maxY = Math.max(maxY, dy);
      }
      const pad = headRadius + Math.log(count + 1) / blend * minRes / 2 + Math.abs(config.refraction) * dpr * 0.5 + 32 * dpr;
      const sx = Math.max(0, Math.floor(minX - pad));
      const sy = Math.max(0, Math.floor(minY - pad));
      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(
        sx,
        sy,
        Math.min(output.width - sx, Math.ceil(maxX - minX + pad * 2)),
        Math.min(output.height - sy, Math.ceil(maxY - minY + pad * 2))
      );
      gl.useProgram(program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, contentTexture);
      gl.uniform1i(uniforms.uContent, 0);
      gl.uniform2f(uniforms.uResolution, output.width, output.height);
      gl.uniform1f(uniforms.uMaxX, contentMaxX);
      gl.uniform1f(uniforms.uDpr, dpr);
      gl.uniform1f(uniforms.uTime, time);
      gl.uniform1f(uniforms.uHasContent, htmlInCanvas ? 1 : 0);
      gl.uniform1i(uniforms.uCount, count);
      gl.uniform2fv(uniforms["uTrail[0]"], trailData);
      gl.uniform1f(uniforms.uBaseRadius, baseRadius);
      gl.uniform1f(uniforms.uBlend, blend);
      gl.uniform1f(uniforms.uRefraction, config.refraction);
      gl.uniform1f(uniforms.uDispersion, Math.max(config.dispersion, 0));
      gl.uniform1f(uniforms.uFrost, Math.min(Math.max(config.frost, 0), 1));
      gl.uniform1f(uniforms.uShine, Math.max(config.shine, 0));
      gl.uniform1f(uniforms.uRim, Math.min(Math.max(config.rim, 0), 2));
      gl.uniform1f(uniforms.uIridescence, Math.max(config.iridescence, 0));
      gl.uniform1f(uniforms.uIntensity, Math.max(config.intensity, 0));
      gl.uniform3f(
        uniforms.uTint,
        config.tint[0],
        config.tint[1],
        config.tint[2]
      );
      gl.uniform1f(
        uniforms.uTintStrength,
        Math.min(Math.max(config.tintStrength, 0), 1)
      );
      gl.uniform3f(
        uniforms.uColorA,
        config.colorA[0],
        config.colorA[1],
        config.colorA[2]
      );
      gl.uniform3f(
        uniforms.uColorB,
        config.colorB[0],
        config.colorB[1],
        config.colorB[2]
      );
      gl.uniform1f(
        uniforms.uFallbackAlpha,
        Math.min(Math.max(config.fallbackOpacity, 0), 1)
      );
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.disable(gl.SCISSOR_TEST);
    }
    let raf = 0;
    let lastTime = performance.now();
    let destroyed = false;
    let running = false;
    let visible = true;
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reducedMotion = motionQuery.matches;
    function frame(now) {
      if (destroyed) return;
      if (!visible) {
        running = false;
        return;
      }
      const delta = Math.min((now - lastTime) / 1e3, 1 / 30);
      lastTime = now;
      if (!reducedMotion) time += delta * Math.max(config.speed, 0);
      const follow = Math.min(Math.max(config.follow, 0.02), 1);
      const kHead = reducedMotion || follow >= 1 ? 1 : 1 - Math.exp(-delta * (3 + follow * 30));
      const kScale = reducedMotion ? 1 : 1 - Math.exp(-delta * 10);
      headX += (targetX - headX) * kHead;
      headY += (targetY - headY) * kHead;
      for (let i = MAX_TRAIL - 1; i > 0; i--) {
        trailX[i] = trailX[i - 1];
        trailY[i] = trailY[i - 1];
      }
      trailX[0] = headX;
      trailY[0] = headY;
      let moved = Math.abs(targetX - headX) + Math.abs(targetY - headY);
      for (let i = 1; i < MAX_TRAIL; i++) {
        moved = Math.max(
          moved,
          Math.abs(trailX[i] - trailX[i - 1]) + Math.abs(trailY[i] - trailY[i - 1])
        );
      }
      presence += (presenceTarget - presence) * kScale;
      render();
      const settled = reducedMotion ? moved < 0.1 && Math.abs(presenceTarget - presence) < 2e-3 && !contentDirty : presence < 4e-3 && presenceTarget === 0 && !contentDirty;
      if (settled) {
        presence = presenceTarget;
        running = false;
        return;
      }
      raf = requestAnimationFrame(frame);
    }
    function start() {
      if (destroyed || running || !visible) return;
      running = true;
      lastTime = performance.now();
      raf = requestAnimationFrame(frame);
    }
    wake = start;
    start();
    const rectCache = createRectCache(output);
    function onPointerMove(event) {
      const rect = rectCache.current;
      targetX = event.clientX - rect.left;
      targetY = event.clientY - rect.top;
      if (!hasPointer) {
        headX = targetX;
        headY = targetY;
        trailX.fill(targetX);
        trailY.fill(targetY);
        hasPointer = true;
      }
      presenceTarget = 1;
      start();
    }
    function onPointerLeave() {
      presenceTarget = 0;
      hasPointer = false;
      start();
    }
    content.addEventListener("pointermove", onPointerMove, { passive: true });
    content.addEventListener("pointerleave", onPointerLeave, { passive: true });
    function onScroll() {
      start();
    }
    content.addEventListener("scroll", onScroll, { passive: true });
    function onMotionChange() {
      reducedMotion = motionQuery.matches;
      start();
    }
    motionQuery.addEventListener("change", onMotionChange);
    const observer = createCanvasResizeObserver(() => {
      syncCanvasSize();
      start();
    });
    observer.observe(output);
    observer.observe(content);
    const intersection = new IntersectionObserver((entries) => {
      visible = entries[entries.length - 1]?.isIntersecting ?? true;
      if (visible) start();
    });
    intersection.observe(output);
    return {
      setOptions(next) {
        if (!Object.entries(next).some(
          ([key, value]) => config[key] !== value
        ))
          return;
        Object.assign(config, next);
        start();
      },
      resize() {
        syncCanvasSize();
        start();
      },
      destroy() {
        destroyed = true;
        rectCache.destroy();
        cancelAnimationFrame(raf);
        content.removeEventListener("pointermove", onPointerMove);
        content.removeEventListener("pointerleave", onPointerLeave);
        content.removeEventListener("scroll", onScroll);
        observer.disconnect();
        intersection.disconnect();
        motionQuery.removeEventListener("change", onMotionChange);
        gl.deleteTexture(contentTexture);
        gl.deleteProgram(program);
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
        gl.deleteBuffer(quad);
        if (htmlInCanvas) paintable.onpaint = null;
      }
    };
  }

  // src/effects/bubble.js
  var CONTROLS4 = {
    tint: color("Tint", "#ffffff"),
    colorA: color("Sheen A", "#4a74b8"),
    colorB: color("Sheen B", "#69696a"),
    size: scrub("Size", 30, { min: 12, max: 140, step: 2, decimals: 0 }),
    trail: scrub("Trail", 24, { min: 1, max: 24, step: 1, decimals: 0 }),
    follow: scrub("Follow", 0.5, { min: 0.02, max: 1, step: 0.02 }),
    blend: scrub("Blend", 14, { min: 1, max: 24, step: 0.5, decimals: 1 }),
    speed: scrub("Speed", 2, { min: 0, max: 6, step: 0.1, decimals: 1 }),
    refraction: scrub("Refraction", 80, {
      min: -120,
      max: 120,
      step: 2,
      decimals: 0
    }),
    dispersion: scrub("Dispersion", 1, { min: 0, max: 3, step: 0.05 }),
    frost: scrub("Frost", 0, { min: 0, max: 1, step: 0.02 }),
    shine: scrub("Shine", 0.25, { min: 0, max: 2, step: 0.05 }),
    rim: scrub("Rim", 0.5, { min: 0, max: 2, step: 0.05 }),
    iridescence: scrub("Iridescence", 1, { min: 0, max: 2, step: 0.05 }),
    intensity: scrub("Intensity", 0.9, {
      min: 0,
      max: 5,
      step: 0.1,
      decimals: 1
    }),
    tintStrength: scrub("Tint strength", 0, { min: 0, max: 1, step: 0.02 })
  };
  var bubble_default = {
    slug: "bubble",
    name: "Bubble",
    component: "Bubble",
    description: "A glassy droplet trailing the cursor.",
    controls: CONTROLS4,
    toOptions(values) {
      const { tint, colorA, colorB, ...rest } = values;
      return {
        ...rest,
        tint: hexToRgb(tint),
        colorA: hexToRgb(colorA),
        colorB: hexToRgb(colorB)
      };
    },
    create: createBubble
  };

  // src/vendor/lib/Canvas/CanvasVanilla.ts
  var DEFAULTS5 = {
    threadSize: 2,
    threadWidth: 0.2,
    texture: 1,
    tint: [0.84, 0.81, 0.75],
    tintStrength: 0,
    grain: 0.5,
    halftone: 0.1,
    dotSize: 6,
    strength: 1,
    relief: 0.45,
    gloss: 0.35,
    bristle: 0.4,
    dry: 2.5,
    radius: 0.08,
    intro: 1.6,
    followSpeed: 3
  };
  var VERT5 = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPos;
out vec2 vUv;
void main () {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;
  var FRAG_PAINT = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uState;
uniform vec2 uTexel;
uniform vec2 uShift;
uniform vec2 uPoint;
uniform vec2 uPrevPoint;
uniform float uAspect;
uniform float uRadius;
uniform float uDeposit;
uniform float uBristle;
uniform float uLevel;
uniform float uDecay;
uniform float uDryRate;

float sdSegment (vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  return length(pa - ba * h);
}

void main () {
  vec2 src = vUv + uShift;
  float inside =
    step(0.0, src.x) * step(src.x, 1.0) *
    step(0.0, src.y) * step(src.y, 1.0);
  vec4 prev = texture(uState, src);
  float h = prev.r * inside;
  float wet = prev.g * inside;

  float around =
    texture(uState, src + vec2(uTexel.x, 0.0)).r +
    texture(uState, src - vec2(uTexel.x, 0.0)).r +
    texture(uState, src + vec2(0.0, uTexel.y)).r +
    texture(uState, src - vec2(0.0, uTexel.y)).r;
  around *= 0.25 * inside;

  h = mix(h, around, uLevel * (0.15 + 0.85 * wet));
  h *= uDecay;
  wet *= uDryRate;

  vec2 p = vUv * vec2(uAspect, 1.0);
  vec2 a = uPrevPoint * vec2(uAspect, 1.0);
  vec2 b = uPoint * vec2(uAspect, 1.0);
  float r = max(uRadius, 1e-4);
  float d = sdSegment(p, a, b);

  float dome = 1.0 - smoothstep(r * 0.2, r, d);
  dome *= dome;
  float lip = (1.0 - smoothstep(r * 0.55, r, d)) * smoothstep(r * 0.1, r * 0.6, d);

  vec2 travel = b - a;
  float len = length(travel);
  vec2 axis = len > 1e-5 ? travel / len : vec2(1.0, 0.0);
  vec2 perp = vec2(-axis.y, axis.x);
  float across = dot(p - a, perp) / r;
  float comb = 0.5 + 0.5 * cos(across * 18.0);
  float bristle = mix(1.0, 0.3 + 0.7 * comb, clamp(uBristle, 0.0, 1.0));

  float add = (dome + lip * 0.55) * bristle * uDeposit;
  h = clamp(h + add, 0.0, 1.0);
  wet = clamp(max(wet, add * 5.0), 0.0, 1.0);

  outColor = vec4(h, wet, 0.0, 1.0);
}`;
  var FRAG5 = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uContent;
uniform sampler2D uTextMask;
uniform vec2 uResolution;
uniform float uThreadSize;
uniform float uThreadWidth;
uniform float uTexture;
uniform vec3 uTint;
uniform float uTintStrength;
uniform float uGrain;
uniform float uHalftone;
uniform float uDotSize;
uniform float uStrength;
uniform sampler2D uPaint;
uniform vec2 uPaintTexel;
uniform float uRelief;
uniform float uGloss;
uniform float uIntro;
uniform float uMaxX;
uniform vec2 uScroll;

#define S(a, b, t) smoothstep(a, b, t)

float hash (vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float threadedEdges (vec2 st, float width) {
  return 1.0 - S(0.0, width, st.x) + S(1.0 - width, 1.0, st.x);
}

float ovalGradient (vec2 st, float radius) {
  return S(radius - 0.1, radius + 0.9, 1.0 - length(st - 0.5));
}

vec2 weave (vec2 frag) {
  vec2 st = frag / max(uThreadSize, 1.0);
  st.x *= 0.5;
  if (mod(floor(st.y), 2.0) == 1.0) {
    st.x -= 0.5;
  }
  vec2 f = fract(st);
  float edges = threadedEdges(f, max(uThreadWidth, 0.001));
  float bump = ovalGradient(f, 0.5);
  float shade = clamp(1.0 - edges * 0.4 + bump * 0.22, 0.45, 1.3);
  return vec2(shade, bump);
}

void main () {
  vec2 uv = vUv;

  if (uv.x > uMaxX) {
    outColor = vec4(0.0);
    return;
  }

  float textness = texture(uTextMask, vec2(uv.x, 1.0 - uv.y)).r;

  vec2 paintState = texture(uPaint, uv).rg;
  float thickness = paintState.r;
  float wetness = paintState.g;
  float hL = texture(uPaint, uv - vec2(uPaintTexel.x, 0.0)).r;
  float hR = texture(uPaint, uv + vec2(uPaintTexel.x, 0.0)).r;
  float hD = texture(uPaint, uv - vec2(0.0, uPaintTexel.y)).r;
  float hU = texture(uPaint, uv + vec2(0.0, uPaintTexel.y)).r;
  vec2 slope = vec2(hR - hL, hU - hD) * 0.5;

  float relief = clamp(uRelief, 0.0, 1.0);
  vec2 parallax = -slope * relief * 0.08 * (1.0 - textness);
  vec2 contentUv = vec2(uv.x + parallax.x, 1.0 - uv.y - parallax.y);
  contentUv.x = clamp(contentUv.x, 0.0, uMaxX);
  contentUv.y = clamp(contentUv.y, 0.0, 1.0);

  vec4 content = texture(uContent, contentUv);
  vec2 frag = uv * uResolution;
  vec2 cloth = frag + uScroll;

  vec2 fiber = weave(cloth);
  float grainN = hash(floor(cloth));

  float dotPx = max(uDotSize, 2.0);
  mat2 rot = mat2(0.7071, -0.7071, 0.7071, 0.7071);
  mat2 inv = mat2(0.7071, 0.7071, -0.7071, 0.7071);
  vec2 hFrag = rot * cloth;
  vec2 hCenter = (floor(hFrag / dotPx) + 0.5) * dotPx;
  vec2 hLocal = (hFrag - hCenter) / dotPx;
  vec2 hUv = (inv * hCenter - uScroll) / uResolution;
  hUv = clamp(hUv, vec2(0.001), vec2(uMaxX - 0.002, 0.999));
  vec4 cellPix = texture(uContent, vec2(hUv.x, 1.0 - hUv.y));
  float cellLum = dot(cellPix.rgb, vec3(0.299, 0.587, 0.114));

  float crisp = 0.0;
  if (textness > 0.4) {
    float fineLum = dot(content.rgb, vec3(0.299, 0.587, 0.114));
    if (abs(fineLum - cellLum) > 0.08) {
      crisp = 1.0;
    }
  }

  float dotR = (1.0 - cellLum) * 0.55 + (grainN - 0.5) * uGrain * 0.12;
  float dotMask = 1.0 - S(dotR - 0.12, dotR + 0.12, length(hLocal));
  vec3 ink = cellPix.rgb * 0.35;
  vec3 between = mix(cellPix.rgb, vec3(1.0), 0.55);
  vec3 screened = mix(between, ink, dotMask);

  vec3 paint = content.rgb;
  float halftoneAmt = clamp(uHalftone, 0.0, 1.0) * (1.0 - 0.85 * crisp);
  paint = mix(paint, screened, halftoneAmt);

  float texAmt = clamp(uTexture, 0.0, 1.0) * (1.0 - 0.6 * crisp);
  texAmt *= 1.0 - 0.55 * thickness * relief;
  paint *= mix(1.0, fiber.x, texAmt);

  float tintMax = max(uTint.r, max(uTint.g, uTint.b));
  vec3 tintMul = uTint / max(tintMax, 0.001);
  float tintAmt = clamp(uTintStrength, 0.0, 1.0) * (1.0 - 0.5 * crisp);
  paint *= mix(vec3(1.0), tintMul, tintAmt);

  paint *= 1.0 + (grainN - 0.5) * uGrain * (0.35 - 0.25 * crisp);

  vec3 nrm = normalize(vec3(-slope * relief * 18.0, 1.0));
  vec3 lightDir = normalize(vec3(-0.55, 0.62, 0.56));
  float presence = S(0.0, 0.12, thickness);
  float diffuse = clamp(dot(nrm, lightDir), 0.0, 1.0);
  float shade = (diffuse - lightDir.z) * 1.15 * (1.0 - 0.45 * crisp);
  paint *= clamp(1.0 + shade, 0.55, 1.7);

  vec3 halfVec = normalize(lightDir + vec3(0.0, 0.0, 1.0));
  float spec = pow(clamp(dot(nrm, halfVec), 0.0, 1.0), 48.0);
  spec = max(spec - pow(clamp(halfVec.z, 0.0, 1.0), 48.0), 0.0);
  float sheen = clamp(uGloss, 0.0, 1.0) * (0.3 + 0.7 * wetness) * presence;
  paint += spec * sheen * 1.6 * (1.0 - 0.5 * crisp);

  float amt = clamp(uStrength, 0.0, 1.0) * clamp(uIntro, 0.0, 1.0);
  vec3 col = mix(content.rgb, paint, amt);
  float alpha = mix(content.a, 1.0, amt);
  outColor = vec4(col, alpha);
}`;
  function createCanvas(elements, options = {}) {
    const config = { ...DEFAULTS5, ...options };
    const { source, content, output } = elements;
    const gl = output.getContext("webgl2", {
      alpha: true,
      depth: false,
      stencil: false,
      antialias: false,
      premultipliedAlpha: false
    });
    if (!gl || gl.isContextLost()) return null;
    const sourceCtx = source.getContext("2d");
    const paintable = source;
    const htmlInCanvas = Boolean(
      sourceCtx && typeof sourceCtx.drawElementImage === "function" && typeof paintable.requestPaint === "function"
    );
    if (htmlInCanvas) prepareHtmlInCanvas(source, content);
    let contentDirty = false;
    let wake = () => {
    };
    if (htmlInCanvas) {
      paintable.onpaint = () => {
        try {
          sourceCtx.reset();
          drawHtmlInCanvas(source, sourceCtx, content);
          contentDirty = true;
          scheduleTextMask();
          wake();
        } catch {
        }
      };
    }
    function compile(type, text) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, text);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error("Canvas shader error:", gl.getShaderInfoLog(shader));
      }
      return shader;
    }
    const vertexShader = compile(gl.VERTEX_SHADER, VERT5);
    const fragmentShader = compile(gl.FRAGMENT_SHADER, FRAG5);
    const paintShader = compile(gl.FRAGMENT_SHADER, FRAG_PAINT);
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    const uniforms = {};
    const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < count; i++) {
      const info = gl.getActiveUniform(program, i);
      uniforms[info.name] = gl.getUniformLocation(program, info.name);
    }
    const paintProgram = gl.createProgram();
    gl.attachShader(paintProgram, vertexShader);
    gl.attachShader(paintProgram, paintShader);
    gl.linkProgram(paintProgram);
    const paintUniforms = {};
    const paintCount = gl.getProgramParameter(paintProgram, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < paintCount; i++) {
      const info = gl.getActiveUniform(paintProgram, i);
      paintUniforms[info.name] = gl.getUniformLocation(paintProgram, info.name);
    }
    const halfFloat = Boolean(gl.getExtension("EXT_color_buffer_float"));
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const contentTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, contentTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([0, 0, 0, 0])
    );
    const textMaskTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, textMaskTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([0, 0, 0, 0])
    );
    const MASK_SCALE = 0.25;
    const PAINT_SCALE = 0.5;
    const PAINT_MAX = 1024;
    function createTarget(width, height) {
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        halfFloat ? gl.RGBA16F : gl.RGBA8,
        width,
        height,
        0,
        gl.RGBA,
        halfFloat ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE,
        null
      );
      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D,
        texture,
        0
      );
      gl.viewport(0, 0, width, height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return { fbo, texture };
    }
    function releaseTarget(target) {
      if (!target) return;
      gl.deleteFramebuffer(target.fbo);
      gl.deleteTexture(target.texture);
    }
    let paintRead = null;
    let paintWrite = null;
    let paintWidth = 0;
    let paintHeight = 0;
    function syncPaintTargets() {
      const scale = Math.min(
        1,
        PAINT_MAX / Math.max(output.clientWidth, output.clientHeight, 1)
      );
      const width = Math.max(
        1,
        Math.round(output.clientWidth * PAINT_SCALE * scale)
      );
      const height = Math.max(
        1,
        Math.round(output.clientHeight * PAINT_SCALE * scale)
      );
      if (width === paintWidth && height === paintHeight) return;
      releaseTarget(paintRead);
      releaseTarget(paintWrite);
      paintWidth = width;
      paintHeight = height;
      paintRead = createTarget(width, height);
      paintWrite = createTarget(width, height);
    }
    const maskCanvas = document.createElement("canvas");
    const maskCtx = maskCanvas.getContext("2d");
    let maskDirty = false;
    let maskTimer = 0;
    let maskStamp = 0;
    function buildTextMask() {
      if (!maskCtx) return;
      const bounds = output.getBoundingClientRect();
      const width = Math.max(1, Math.round(bounds.width * MASK_SCALE));
      const height = Math.max(1, Math.round(bounds.height * MASK_SCALE));
      if (maskCanvas.width !== width || maskCanvas.height !== height) {
        maskCanvas.width = width;
        maskCanvas.height = height;
      }
      maskCtx.clearRect(0, 0, width, height);
      maskCtx.fillStyle = "#fff";
      const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
      const range = document.createRange();
      let node;
      while (node = walker.nextNode()) {
        if (!node.textContent?.trim()) continue;
        const parent = node.parentElement;
        if (!parent || parent.checkVisibility && !parent.checkVisibility()) {
          continue;
        }
        range.selectNodeContents(node);
        const rects = range.getClientRects();
        for (let i = 0; i < rects.length; i++) {
          const r = rects[i];
          if (r.width < 1 || r.height < 1) continue;
          if (r.bottom < bounds.top || r.top > bounds.bottom) continue;
          maskCtx.fillRect(
            (r.left - bounds.left - 1) * MASK_SCALE,
            (r.top - bounds.top - 1) * MASK_SCALE,
            (r.width + 2) * MASK_SCALE,
            (r.height + 2) * MASK_SCALE
          );
        }
      }
      const fields = content.querySelectorAll("input, textarea, select");
      for (let i = 0; i < fields.length; i++) {
        const r = fields[i].getBoundingClientRect();
        if (r.width < 1 || r.height < 1) continue;
        if (r.bottom < bounds.top || r.top > bounds.bottom) continue;
        maskCtx.fillRect(
          (r.left - bounds.left) * MASK_SCALE,
          (r.top - bounds.top) * MASK_SCALE,
          r.width * MASK_SCALE,
          r.height * MASK_SCALE
        );
      }
      maskDirty = true;
    }
    function scheduleTextMask() {
      if (maskTimer) return;
      const wait = Math.max(0, 120 - (performance.now() - maskStamp));
      maskTimer = window.setTimeout(() => {
        maskTimer = 0;
        maskStamp = performance.now();
        buildTextMask();
        start();
      }, wait);
    }
    let contentMaxX = 1;
    function syncCanvasSize() {
      const dpr = getCanvasPixelRatio(output, gl);
      const width = Math.max(1, Math.round(output.clientWidth * dpr));
      const height = Math.max(1, Math.round(output.clientHeight * dpr));
      if (output.width !== width || output.height !== height) {
        output.width = width;
        output.height = height;
      }
      contentMaxX = Math.min(
        1,
        Math.max(0.05, content.clientWidth / Math.max(output.clientWidth, 1))
      );
      if (htmlInCanvas) {
        const sourceWidth = Math.max(1, Math.round(source.clientWidth * dpr));
        const sourceHeight = Math.max(1, Math.round(source.clientHeight * dpr));
        if (source.width !== sourceWidth || source.height !== sourceHeight) {
          source.width = sourceWidth;
          source.height = sourceHeight;
        }
        paintable.requestPaint();
      }
      syncPaintTargets();
    }
    syncCanvasSize();
    const pointer = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5, active: 0, target: 0 };
    let prevPaintX = 0.5;
    let prevPaintY = 0.5;
    let lastPaintScrollX = 0;
    let lastPaintScrollY = 0;
    let paintSeeded = false;
    let activeUntil = 0;
    let introStart = -1;
    let contentReady = false;
    let introDone = false;
    function introProgress(now) {
      if (!contentReady) {
        introDone = !htmlInCanvas;
        return 0;
      }
      if (config.intro <= 0 || reducedMotion) {
        introDone = true;
        return 1;
      }
      const p = Math.min((now - introStart) / (config.intro * 1e3), 1);
      if (p >= 1) introDone = true;
      return p * p * (3 - 2 * p);
    }
    function uploadContent() {
      if (!htmlInCanvas || !contentDirty) return;
      contentDirty = false;
      gl.bindTexture(gl.TEXTURE_2D, contentTexture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        source
      );
      if (!contentReady) {
        contentReady = true;
        introStart = performance.now();
      }
    }
    function uploadMask() {
      if (!maskDirty) return;
      maskDirty = false;
      gl.bindTexture(gl.TEXTURE_2D, textMaskTexture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        maskCanvas
      );
    }
    function stepPaint(delta, now) {
      if (!paintRead || !paintWrite) return;
      const cssW = Math.max(output.clientWidth, 1);
      const cssH = Math.max(output.clientHeight, 1);
      const scrollX = content.scrollLeft;
      const scrollY = content.scrollTop;
      if (!paintSeeded) {
        lastPaintScrollX = scrollX;
        lastPaintScrollY = scrollY;
        prevPaintX = pointer.x;
        prevPaintY = pointer.y;
        paintSeeded = true;
      }
      const dry = Math.max(config.dry, 0.05);
      const travel = Math.hypot(pointer.x - prevPaintX, pointer.y - prevPaintY);
      const stroke = Math.min(travel / Math.max(config.radius * 0.6, 1e-4), 1.5);
      const painting = pointer.active > 0.02 && config.relief > 1e-3 && !reducedMotion;
      const deposit = painting ? Math.min(stroke * 0.32, 0.45) : 0;
      if (deposit > 1e-4) activeUntil = now + dry * 1e3 + 400;
      gl.useProgram(paintProgram);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, paintRead.texture);
      gl.uniform1i(paintUniforms.uState, 0);
      gl.uniform2f(paintUniforms.uTexel, 1 / paintWidth, 1 / paintHeight);
      gl.uniform2f(
        paintUniforms.uShift,
        (scrollX - lastPaintScrollX) / cssW,
        -(scrollY - lastPaintScrollY) / cssH
      );
      gl.uniform2f(paintUniforms.uPoint, pointer.x, pointer.y);
      gl.uniform2f(paintUniforms.uPrevPoint, prevPaintX, prevPaintY);
      gl.uniform1f(paintUniforms.uAspect, cssW / cssH);
      gl.uniform1f(paintUniforms.uRadius, Math.max(config.radius, 5e-3));
      gl.uniform1f(paintUniforms.uDeposit, deposit);
      gl.uniform1f(paintUniforms.uBristle, config.bristle);
      gl.uniform1f(paintUniforms.uLevel, 1 - Math.exp(-delta * 2));
      gl.uniform1f(paintUniforms.uDecay, Math.exp(-delta / dry * 3));
      gl.uniform1f(paintUniforms.uDryRate, Math.exp(-delta / (dry * 0.6) * 3));
      gl.bindFramebuffer(gl.FRAMEBUFFER, paintWrite.fbo);
      gl.viewport(0, 0, paintWidth, paintHeight);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      const swap = paintRead;
      paintRead = paintWrite;
      paintWrite = swap;
      lastPaintScrollX = scrollX;
      lastPaintScrollY = scrollY;
      prevPaintX = pointer.x;
      prevPaintY = pointer.y;
    }
    function render(now) {
      uploadContent();
      uploadMask();
      gl.useProgram(program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, contentTexture);
      gl.uniform1i(uniforms.uContent, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, textMaskTexture);
      gl.uniform1i(uniforms.uTextMask, 1);
      gl.uniform2f(uniforms.uResolution, output.width, output.height);
      const dpr = output.width / Math.max(output.clientWidth, 1);
      gl.uniform1f(uniforms.uThreadSize, Math.max(config.threadSize, 1) * dpr);
      gl.uniform1f(uniforms.uThreadWidth, config.threadWidth);
      gl.uniform1f(uniforms.uTexture, config.texture);
      gl.uniform3f(
        uniforms.uTint,
        config.tint[0],
        config.tint[1],
        config.tint[2]
      );
      gl.uniform1f(uniforms.uTintStrength, config.tintStrength);
      gl.uniform1f(uniforms.uGrain, config.grain);
      gl.uniform1f(uniforms.uHalftone, config.halftone);
      gl.uniform1f(uniforms.uDotSize, Math.max(config.dotSize, 1.5) * dpr);
      gl.uniform1f(uniforms.uStrength, config.strength);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, paintRead ? paintRead.texture : null);
      gl.uniform1i(uniforms.uPaint, 2);
      gl.uniform2f(
        uniforms.uPaintTexel,
        1 / Math.max(paintWidth, 1),
        1 / Math.max(paintHeight, 1)
      );
      gl.uniform1f(uniforms.uRelief, config.relief);
      gl.uniform1f(uniforms.uGloss, config.gloss);
      gl.uniform1f(uniforms.uIntro, introProgress(now));
      gl.uniform1f(uniforms.uMaxX, contentMaxX);
      gl.uniform2f(
        uniforms.uScroll,
        content.scrollLeft * dpr,
        -content.scrollTop * dpr
      );
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, output.width, output.height);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    let raf = 0;
    let lastTime = performance.now();
    let destroyed = false;
    let running = false;
    let visible = true;
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reducedMotion = motionQuery.matches;
    function frame(now) {
      if (destroyed) return;
      if (!visible) {
        running = false;
        return;
      }
      const delta = Math.min((now - lastTime) / 1e3, 1 / 30);
      lastTime = now;
      const ease = reducedMotion ? 1 : 1 - Math.exp(-delta * Math.max(config.followSpeed, 0.5));
      pointer.x += (pointer.tx - pointer.x) * ease;
      pointer.y += (pointer.ty - pointer.y) * ease;
      pointer.active += (pointer.target - pointer.active) * ease;
      stepPaint(delta, now);
      render(now);
      const drying = now < activeUntil;
      const settled = Math.abs(pointer.tx - pointer.x) < 5e-4 && Math.abs(pointer.ty - pointer.y) < 5e-4 && Math.abs(pointer.target - pointer.active) < 1e-3 && introDone && !drying;
      if (settled && !contentDirty) {
        pointer.x = pointer.tx;
        pointer.y = pointer.ty;
        pointer.active = pointer.target;
        running = false;
        return;
      }
      raf = requestAnimationFrame(frame);
    }
    function start() {
      if (destroyed || running || !visible) return;
      running = true;
      lastTime = performance.now();
      raf = requestAnimationFrame(frame);
    }
    wake = start;
    start();
    function onMotionChange() {
      reducedMotion = motionQuery.matches;
      start();
    }
    motionQuery.addEventListener("change", onMotionChange);
    const observer = createCanvasResizeObserver(() => {
      syncCanvasSize();
      scheduleTextMask();
      start();
    });
    observer.observe(output);
    observer.observe(content);
    const intersection = new IntersectionObserver((entries) => {
      visible = entries[entries.length - 1]?.isIntersecting ?? true;
      if (visible) start();
    });
    intersection.observe(output);
    const listenTarget = output.parentElement ?? output;
    const rectCache = createRectCache(output);
    function onPointerMove(event) {
      const rect = rectCache.current;
      pointer.tx = (event.clientX - rect.left) / Math.max(rect.width, 1);
      pointer.ty = 1 - (event.clientY - rect.top) / Math.max(rect.height, 1);
      pointer.target = 1;
      start();
    }
    function onPointerLeave() {
      pointer.target = 0;
      start();
    }
    function onScroll() {
      scheduleTextMask();
      start();
    }
    listenTarget.addEventListener("pointermove", onPointerMove, { passive: true });
    listenTarget.addEventListener("pointerleave", onPointerLeave, { passive: true });
    content.addEventListener("scroll", onScroll, {
      capture: true,
      passive: true
    });
    scheduleTextMask();
    return {
      setOptions(next) {
        let changed = false;
        for (const [key, value] of Object.entries(next)) {
          const prev = config[key];
          if (Array.isArray(value) && Array.isArray(prev)) {
            if (value.length !== prev.length || value.some((item, i) => item !== prev[i])) {
              changed = true;
              break;
            }
          } else if (prev !== value) {
            changed = true;
            break;
          }
        }
        Object.assign(config, next);
        if (!changed) return;
        scheduleTextMask();
        start();
      },
      resize() {
        syncCanvasSize();
        start();
      },
      destroy() {
        destroyed = true;
        rectCache.destroy();
        cancelAnimationFrame(raf);
        window.clearTimeout(maskTimer);
        observer.disconnect();
        intersection.disconnect();
        motionQuery.removeEventListener("change", onMotionChange);
        listenTarget.removeEventListener("pointermove", onPointerMove);
        listenTarget.removeEventListener("pointerleave", onPointerLeave);
        content.removeEventListener("scroll", onScroll, {
          capture: true
        });
        gl.deleteTexture(contentTexture);
        gl.deleteTexture(textMaskTexture);
        releaseTarget(paintRead);
        releaseTarget(paintWrite);
        paintRead = null;
        paintWrite = null;
        gl.deleteProgram(program);
        gl.deleteProgram(paintProgram);
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
        gl.deleteShader(paintShader);
        gl.deleteBuffer(quad);
        if (htmlInCanvas) paintable.onpaint = null;
      }
    };
  }

  // src/effects/canvas.js
  var CONTROLS5 = {
    threadSize: scrub("Thread size", 2, {
      min: 2,
      max: 12,
      step: 1,
      decimals: 0
    }),
    threadWidth: scrub("Thread width", 0.2, { min: 0, max: 0.4, step: 0.01 }),
    texture: scrub("Texture", 1, { min: 0, max: 1, step: 0.05 }),
    tintStrength: scrub("Tint strength", 0, { min: 0, max: 1, step: 0.05 }),
    grain: scrub("Grain", 0.5, { min: 0, max: 1, step: 0.05 }),
    halftone: scrub("Halftone", 0.1, { min: 0, max: 1, step: 0.05 }),
    dotSize: scrub("Dot size", 6, { min: 2, max: 10, step: 0.5, decimals: 1 }),
    strength: scrub("Strength", 1, { min: 0, max: 1, step: 0.05 }),
    relief: scrub("Relief", 0.45, { min: 0, max: 1, step: 0.05 }),
    gloss: scrub("Gloss", 0.35, { min: 0, max: 1, step: 0.05 }),
    bristle: scrub("Bristle", 0.4, { min: 0, max: 1, step: 0.05 }),
    dry: scrub("Dry", 2.5, { min: 0.3, max: 8, step: 0.1, decimals: 1 }),
    radius: scrub("Brush radius", 0.08, { min: 0.02, max: 0.25, step: 0.01 }),
    followSpeed: scrub("Follow speed", 3, {
      min: 1,
      max: 20,
      step: 0.5,
      decimals: 1
    }),
    tint: color("Tint", "#d6cec0")
  };
  var canvas_default = {
    slug: "canvas",
    name: "Canvas",
    component: "Canvas",
    description: "The page painted onto canvas, with a brush for a cursor.",
    controls: CONTROLS5,
    toOptions(values) {
      const { tint, ...rest } = values;
      return {
        ...rest,
        tint: hexToRgb(tint)
      };
    },
    create: createCanvas
  };

  // src/vendor/lib/Cloth/ClothVanilla.ts
  var DEFAULTS6 = {
    pin: "top",
    wind: 3,
    speed: 0.5,
    amplitude: 30,
    drape: 40,
    brush: 2.05,
    brushSize: 150,
    damping: 1,
    light: 0.5,
    sheen: 0.1,
    shadow: 0.25,
    cornerRadius: 20,
    backing: "auto",
    perspective: 1200
  };
  var CLOTH_VERT = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aGrid;
layout(location = 1) in vec4 aData;
layout(location = 2) in vec2 aOffset;
uniform vec2 uRes;
uniform vec2 uOut;
uniform float uBleed;
uniform float uFocal;
out vec2 vUv;
out vec3 vNormal;
out float vFold;
out vec2 vLocal;

void main () {
  vUv = aGrid;
  float z = aData.x;
  vec2 nxy = aData.yz;
  vNormal = vec3(nxy, sqrt(max(1.0 - dot(nxy, nxy), 0.04)));
  vFold = aData.w;

  vLocal = aGrid * uRes;
  vec2 px = vLocal + aOffset + vec2(uBleed);
  vec2 ndc = (px / uOut) * 2.0 - 1.0;
  ndc.y = -ndc.y;
  float w = (uFocal - z) / uFocal;
  gl_Position = vec4(ndc, -z / uFocal, w);
}`;
  var SDF_SNIPPET = `
float fabricDist (vec2 p, vec2 size, float radius) {
  vec2 half_ = size * 0.5;
  float r = min(radius, min(half_.x, half_.y));
  vec2 q = abs(p - half_) - (half_ - vec2(r));
  return length(max(q, vec2(0.0))) + min(max(q.x, q.y), 0.0) - r;
}`;
  var CLOTH_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
in vec3 vNormal;
in float vFold;
in vec2 vLocal;
out vec4 outColor;
uniform sampler2D uContent;
uniform float uMaxX;
uniform float uLight;
uniform float uSheen;
uniform vec3 uBacking;
uniform vec2 uRes;
uniform float uRadius;
uniform float uDark;
${SDF_SNIPPET}

void main () {
  vec2 uv = clamp(vUv, vec2(0.001), vec2(uMaxX - 0.001, 0.999));
  vec4 tex = texture(uContent, uv);
  vec3 fabric = mix(uBacking, tex.rgb, tex.a);

  vec3 n = normalize(vNormal);
  vec3 lightDir = normalize(vec3(-0.3, 0.42, 0.86));
  float diffFlat = 0.58 + 0.42 * lightDir.z;
  float diff = 0.58 + 0.42 * dot(n, lightDir);
  float shade = mix(1.0, (diff / diffFlat) * vFold, uLight);
  vec3 lit = fabric * shade;

  vec3 halfway = normalize(lightDir + vec3(0.0, 0.0, 1.0));
  float specFlat = pow(halfway.z, 34.0);
  float spec =
    max(pow(max(dot(n, halfway), 0.0), 34.0) - specFlat, 0.0) /
    (1.0 - specFlat);
  lit += uSheen * spec * mix(vec3(1.0), fabric, 0.35);

  float broadFlat = pow(halfway.z, 6.0);
  float broad =
    max(pow(max(dot(n, halfway), 0.0), 6.0) - broadFlat, 0.0) /
    (1.0 - broadFlat);
  lit += uDark * uLight * 0.3 * broad * vec3(1.0);

  float d = fabricDist(vLocal, uRes, uRadius);

  float hemT = smoothstep(0.0, 6.0, -d);
  lit *= mix(1.0, mix(0.93, 1.0, hemT), uLight * (1.0 - uDark));
  lit += vec3(uDark * uLight * 0.08 * (1.0 - hemT));

  float alpha = clamp(0.5 - d, 0.0, 1.0);
  outColor = vec4(clamp(lit, 0.0, 1.0), 1.0) * alpha;
}`;
  var SHADOW_VERT = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aGrid;
layout(location = 1) in vec4 aData;
layout(location = 2) in vec2 aOffset;
uniform vec2 uRes;
uniform vec2 uOut;
uniform float uBleed;
out vec2 vLocal;
out float vLift;

void main () {
  float z = aData.x;
  vLift = z;
  vLocal = aGrid * uRes;
  vec2 px =
    vLocal + aOffset + vec2(uBleed) + vec2(10.0, 14.0) + vec2(0.3, 0.42) * z;
  vec2 ndc = (px / uOut) * 2.0 - 1.0;
  ndc.y = -ndc.y;
  gl_Position = vec4(ndc, 0.0, 1.0);
}`;
  var SHADOW_FRAG = `#version 300 es
precision highp float;
in vec2 vLocal;
in float vLift;
out vec4 outColor;
uniform float uShadow;
uniform vec2 uRes;
uniform float uRadius;
uniform float uDark;
${SDF_SNIPPET}

void main () {
  float d = fabricDist(vLocal, uRes, uRadius);
  float a = uShadow * smoothstep(0.0, 30.0, -d);

  a *= mix(1.0, 0.55, clamp(vLift / 50.0, 0.0, 1.0));

  a *= mix(1.0, 0.55, uDark);
  vec3 tint = vec3(uDark);
  outColor = vec4(tint * a, a);
}`;
  var SEG = 96;
  var NODES = SEG + 1;
  var DT = 1 / 120;
  var WAVE_SPEED = 30;
  var STIFFNESS = 0.55;
  var FORCE_GAIN = 5;
  var BLEED = 48;
  function createCloth(elements, options = {}) {
    const config = { ...DEFAULTS6, ...options };
    const { source, content, output } = elements;
    const wrapper = output.parentElement ?? output;
    output.style.top = `${-BLEED}px`;
    output.style.left = `${-BLEED}px`;
    output.style.right = `${-BLEED}px`;
    output.style.bottom = `${-BLEED}px`;
    output.style.width = `calc(100% + ${BLEED * 2}px)`;
    output.style.height = `calc(100% + ${BLEED * 2}px)`;
    const gl = output.getContext("webgl2", {
      alpha: true,
      depth: false,
      stencil: false,
      antialias: true,
      premultipliedAlpha: true
    });
    if (!gl || gl.isContextLost()) return null;
    const sourceCtx = source.getContext("2d");
    const paintable = source;
    const htmlInCanvas = Boolean(
      sourceCtx && typeof sourceCtx.drawElementImage === "function" && typeof paintable.requestPaint === "function"
    );
    if (htmlInCanvas) prepareHtmlInCanvas(source, content);
    let wake = () => {
    };
    let capture = () => {
    };
    if (htmlInCanvas) {
      paintable.onpaint = () => capture();
    }
    function compile(type, text) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, text);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error("Cloth shader error:", gl.getShaderInfoLog(shader));
      }
      return shader;
    }
    function link(vertText, fragText) {
      const vert = compile(gl.VERTEX_SHADER, vertText);
      const frag = compile(gl.FRAGMENT_SHADER, fragText);
      const program = gl.createProgram();
      gl.attachShader(program, vert);
      gl.attachShader(program, frag);
      gl.linkProgram(program);
      const uniforms = {};
      const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < count; i++) {
        const info = gl.getActiveUniform(program, i);
        uniforms[info.name] = gl.getUniformLocation(program, info.name);
      }
      return { program, vert, frag, uniforms };
    }
    const cloth = link(CLOTH_VERT, CLOTH_FRAG);
    const shadow = link(SHADOW_VERT, SHADOW_FRAG);
    const gridVerts = new Float32Array(NODES * NODES * 2);
    for (let y = 0; y < NODES; y++) {
      for (let x = 0; x < NODES; x++) {
        const i = (y * NODES + x) * 2;
        gridVerts[i] = x / SEG;
        gridVerts[i + 1] = y / SEG;
      }
    }
    const gridIndices = new Uint32Array(SEG * SEG * 6);
    let offset = 0;
    for (let y = 0; y < SEG; y++) {
      for (let x = 0; x < SEG; x++) {
        const a = y * NODES + x;
        const b = a + 1;
        const c = a + NODES;
        const d = c + 1;
        gridIndices[offset++] = a;
        gridIndices[offset++] = c;
        gridIndices[offset++] = b;
        gridIndices[offset++] = b;
        gridIndices[offset++] = c;
        gridIndices[offset++] = d;
      }
    }
    const clothVao = gl.createVertexArray();
    gl.bindVertexArray(clothVao);
    const gridBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, gridBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, gridVerts, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const dataBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, dataBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, NODES * NODES * 4 * 4, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 0, 0);
    const offsetBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, offsetBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, NODES * NODES * 2 * 4, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 0, 0);
    const indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, gridIndices, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    const contentTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, contentTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([0, 0, 0, 0])
    );
    let contentMaxX = 1;
    capture = () => {
      if (!htmlInCanvas) return;
      try {
        sourceCtx.reset();
        drawHtmlInCanvas(source, sourceCtx, content);
        gl.bindTexture(gl.TEXTURE_2D, contentTexture);
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          source
        );
        sourceCtx.reset();
        wake();
      } catch {
      }
    };
    function syncCanvasSize() {
      const dpr = getCanvasPixelRatio(output, gl);
      const width = Math.max(1, Math.round(output.clientWidth * dpr));
      const height = Math.max(1, Math.round(output.clientHeight * dpr));
      if (output.width !== width || output.height !== height) {
        output.width = width;
        output.height = height;
      }
      contentMaxX = Math.min(
        1,
        Math.max(0.05, content.clientWidth / Math.max(wrapper.clientWidth, 1))
      );
      if (htmlInCanvas) {
        const sourceWidth = Math.max(1, Math.round(source.clientWidth * dpr));
        const sourceHeight = Math.max(1, Math.round(source.clientHeight * dpr));
        if (source.width !== sourceWidth || source.height !== sourceHeight) {
          source.width = sourceWidth;
          source.height = sourceHeight;
        }
        paintable.requestPaint();
      }
    }
    let hCur = new Float32Array(NODES * NODES);
    let hPrev = new Float32Array(NODES * NODES);
    let hNext = new Float32Array(NODES * NODES);
    const vertexData = new Float32Array(NODES * NODES * 4);
    const offsetData = new Float32Array(NODES * NODES * 2);
    const zField = new Float32Array(NODES * NODES);
    const rowForce = new Float32Array(NODES);
    const colForce = new Float32Array(NODES);
    const hangCurve = new Float32Array(NODES);
    for (let a = 0; a < NODES; a++) {
      hangCurve[a] = Math.pow(a / SEG, 1.3);
    }
    let simTime = Math.random() * 60;
    let gust = 0.5;
    let fieldEnergy = 1;
    const pointer = { x: -1e5, y: -1e5, inside: false };
    const touch = { x: -1e5, y: -1e5, vx: 0, vy: 0, s: 0 };
    function axisFor(x, y) {
      if (config.pin === "top") return [y, x];
      if (config.pin === "bottom") return [SEG - y, x];
      if (config.pin === "left") return [x, y];
      return [SEG - x, y];
    }
    function stepSim(dt) {
      const speed = Math.max(config.speed, 0);
      simTime += dt * speed;
      const t = simTime;
      const windAmp = FORCE_GAIN * Math.max(config.wind, 0) * gust;
      const kb1 = Math.PI * 2 / (SEG / 1.5);
      const kb2 = Math.PI * 2 / (SEG / 3.8);
      const ka = Math.PI * 2 / (SEG / 2.2);
      const w1 = WAVE_SPEED * kb1;
      const w2 = WAVE_SPEED * kb2;
      const drift = 1.8 * Math.sin(0.23 * t);
      for (let b = 0; b < NODES; b++) {
        rowForce[b] = Math.sin(kb1 * b - w1 * t + drift) + 0.45 * Math.sin(kb2 * b + w2 * t * 0.8 + 3);
      }
      for (let a = 0; a < NODES; a++) {
        colForce[a] = (0.7 + 0.3 * Math.sin(ka * a - 1.7 * t)) * hangCurve[a];
      }
      const c2 = WAVE_SPEED * WAVE_SPEED;
      const dt2 = dt * dt;
      const decay = Math.exp(-Math.min(Math.max(config.damping, 0.05), 8) * dt);
      for (let y = 0; y < NODES; y++) {
        const up = Math.max(y - 1, 0) * NODES;
        const down = Math.min(y + 1, SEG) * NODES;
        const row = y * NODES;
        for (let x = 0; x < NODES; x++) {
          const i = row + x;
          const l = row + Math.max(x - 1, 0);
          const r = row + Math.min(x + 1, SEG);
          const h = hCur[i];
          const lap = hCur[l] + hCur[r] + hCur[up + x] + hCur[down + x] - 4 * h;
          const [a, b] = axisFor(x, y);
          const force = windAmp * rowForce[b] * colForce[a];
          const acc = c2 * lap - STIFFNESS * h + force;
          const next = 2 * h - hPrev[i] + dt2 * acc;
          let value = h + (next - h) * decay;
          if (value > 3.5) value = 3.5;
          else if (value < -3.5) value = -3.5;
          hNext[i] = value;
        }
      }
      for (let b = 0; b < NODES; b++) {
        let x = b;
        let y = 0;
        if (config.pin === "bottom") y = SEG;
        else if (config.pin === "left") {
          x = 0;
          y = b;
        } else if (config.pin === "right") {
          x = SEG;
          y = b;
        }
        hNext[y * NODES + x] = 0;
      }
      const spent = hPrev;
      hPrev = hCur;
      hCur = hNext;
      hNext = spent;
    }
    function touchImprint(delta, width, height) {
      if (config.brush <= 0 || touch.s < 0.01) return;
      const cellW = width / SEG;
      const cellH = height / SEG;
      const radius = Math.max(config.brushSize, 12);
      const rx = radius / cellW;
      const ry = radius / cellH;
      const gx = touch.x / cellW;
      const gy = touch.y / cellH;
      const bx0 = Math.max(Math.ceil(gx - 2.5 * rx), 0);
      const bx1 = Math.min(Math.floor(gx + 2.5 * rx), SEG);
      const by0 = Math.max(Math.ceil(gy - 2.5 * ry), 0);
      const by1 = Math.min(Math.floor(gy + 2.5 * ry), SEG);
      const lift = 1.1 * Math.min(config.brush, 3) * touch.s;
      const rate = Math.min(delta * 4, 1);
      for (let y = by0; y <= by1; y++) {
        const oy = (y - gy) / ry;
        const row = y * NODES;
        for (let x = bx0; x <= bx1; x++) {
          const ox = (x - gx) / rx;
          const g = Math.exp(-(ox * ox + oy * oy));
          if (g < 0.02) continue;
          const i = row + x;
          const pull = rate * g;
          const goal = lift * g;
          hCur[i] += (goal - hCur[i]) * pull;
          hPrev[i] += (goal - hPrev[i]) * pull;
        }
      }
    }
    function foreshorten(axisStride, lineStride, ds, anchor, comp) {
      const ds2 = ds * ds;
      for (let l = 0; l < NODES; l++) {
        const base = l * lineStride;
        offsetData[(base + anchor * axisStride) * 2 + comp] = 0;
        let cum = 0;
        for (let k = anchor + 1; k < NODES; k++) {
          const i = base + k * axisStride;
          const dz = zField[i] - zField[i - axisStride];
          cum += ds - Math.sqrt(Math.max(ds2 - dz * dz, 0));
          offsetData[i * 2 + comp] = -cum;
        }
        cum = 0;
        for (let k = anchor - 1; k >= 0; k--) {
          const i = base + k * axisStride;
          const dz = zField[i] - zField[i + axisStride];
          cum += ds - Math.sqrt(Math.max(ds2 - dz * dz, 0));
          offsetData[i * 2 + comp] = cum;
        }
      }
    }
    function composeOffsets(width, height) {
      const cellW = width / SEG;
      const cellH = height / SEG;
      const mid = SEG >> 1;
      if (config.pin === "top" || config.pin === "bottom") {
        foreshorten(NODES, 1, cellH, config.pin === "top" ? 0 : SEG, 1);
        foreshorten(1, NODES, cellW, mid, 0);
      } else {
        foreshorten(1, NODES, cellW, config.pin === "left" ? 0 : SEG, 0);
        foreshorten(NODES, 1, cellH, mid, 1);
      }
    }
    function composeVertices(width, height) {
      const amp = Math.max(config.amplitude, 0);
      const drape = config.drape * (0.3 + 0.7 * gust);
      const cellW = width / SEG;
      const cellH = height / SEG;
      let energy = 0;
      for (let y = 0; y < NODES; y++) {
        const row = y * NODES;
        for (let x = 0; x < NODES; x++) {
          const i = row + x;
          const h = hCur[i];
          energy = Math.max(energy, Math.abs(h));
          const [a] = axisFor(x, y);
          zField[i] = amp * Math.tanh(h) + drape * hangCurve[a];
        }
      }
      fieldEnergy = energy;
      for (let y = 0; y < NODES; y++) {
        const up = Math.max(y - 1, 0) * NODES;
        const down = Math.min(y + 1, SEG) * NODES;
        const row = y * NODES;
        for (let x = 0; x < NODES; x++) {
          const i = row + x;
          const l = row + Math.max(x - 1, 0);
          const r = row + Math.min(x + 1, SEG);
          const dzdx = (zField[r] - zField[l]) / (2 * cellW);
          const dzdy = (zField[down + x] - zField[up + x]) / (2 * cellH);
          const inv = 1 / Math.hypot(dzdx, dzdy, 1);
          const curve = zField[l] + zField[r] + zField[up + x] + zField[down + x] - 4 * zField[i];
          let fold = 1 - curve * 0.01;
          if (fold < 0.86) fold = 0.86;
          else if (fold > 1.06) fold = 1.06;
          const o = i * 4;
          vertexData[o] = zField[i];
          vertexData[o + 1] = -dzdx * inv;
          vertexData[o + 2] = -dzdy * inv;
          vertexData[o + 3] = fold;
        }
      }
      composeOffsets(width, height);
    }
    let backingRgb = [1, 1, 1];
    const probe = document.createElement("canvas");
    probe.width = probe.height = 1;
    const probeCtx = probe.getContext("2d", { willReadFrequently: true });
    function syncBacking() {
      if (config.backing !== "auto") {
        backingRgb = config.backing;
        return;
      }
      backingRgb = [1, 1, 1];
      if (probeCtx) {
        let el = content;
        while (el) {
          const bg = getComputedStyle(el).backgroundColor;
          if (bg && bg !== "transparent") {
            probeCtx.clearRect(0, 0, 1, 1);
            probeCtx.fillStyle = bg;
            probeCtx.fillRect(0, 0, 1, 1);
            const [r, g, b, a] = probeCtx.getImageData(0, 0, 1, 1).data;
            if (a > 0) {
              backingRgb = [r / 255, g / 255, b / 255];
              break;
            }
          }
          el = el.parentElement;
        }
      }
    }
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reducedMotion = motionQuery.matches;
    syncCanvasSize();
    syncBacking();
    function render() {
      const resW = Math.max(wrapper.clientWidth, 1);
      const resH = Math.max(wrapper.clientHeight, 1);
      const outW = Math.max(output.clientWidth, 1);
      const outH = Math.max(output.clientHeight, 1);
      const light = Math.min(Math.max(config.light, 0), 1);
      const radius = Math.max(config.cornerRadius, 0);
      const shadowAlpha = Math.min(Math.max(config.shadow, 0), 1);
      const lum = 0.299 * backingRgb[0] + 0.587 * backingRgb[1] + 0.114 * backingRgb[2];
      const dark = Math.min(Math.max((0.5 - lum) / 0.35, 0), 1);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, output.width, output.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.bindVertexArray(clothVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, dataBuffer);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, vertexData);
      gl.bindBuffer(gl.ARRAY_BUFFER, offsetBuffer);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, offsetData);
      gl.useProgram(shadow.program);
      gl.uniform2f(shadow.uniforms.uRes, resW, resH);
      gl.uniform2f(shadow.uniforms.uOut, outW, outH);
      gl.uniform1f(shadow.uniforms.uBleed, BLEED);
      gl.uniform1f(shadow.uniforms.uShadow, shadowAlpha);
      gl.uniform1f(shadow.uniforms.uRadius, radius);
      gl.uniform1f(shadow.uniforms.uDark, dark);
      gl.drawElements(gl.TRIANGLES, gridIndices.length, gl.UNSIGNED_INT, 0);
      gl.useProgram(cloth.program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, contentTexture);
      gl.uniform1i(cloth.uniforms.uContent, 0);
      gl.uniform2f(cloth.uniforms.uRes, resW, resH);
      gl.uniform2f(cloth.uniforms.uOut, outW, outH);
      gl.uniform1f(cloth.uniforms.uBleed, BLEED);
      gl.uniform1f(cloth.uniforms.uFocal, Math.max(config.perspective, 200));
      gl.uniform1f(cloth.uniforms.uMaxX, contentMaxX);
      gl.uniform1f(cloth.uniforms.uLight, light);
      gl.uniform1f(cloth.uniforms.uSheen, Math.max(config.sheen, 0));
      gl.uniform1f(cloth.uniforms.uRadius, radius);
      gl.uniform1f(cloth.uniforms.uDark, dark);
      gl.uniform3f(
        cloth.uniforms.uBacking,
        backingRgb[0],
        backingRgb[1],
        backingRgb[2]
      );
      gl.drawElements(gl.TRIANGLES, gridIndices.length, gl.UNSIGNED_INT, 0);
      gl.bindVertexArray(null);
    }
    let raf = 0;
    let lastTime = performance.now();
    let simDebt = 0;
    let destroyed = false;
    let running = false;
    let visible = true;
    function frame(now) {
      if (destroyed) return;
      if (!visible) {
        running = false;
        return;
      }
      const delta = Math.min((now - lastTime) / 1e3, 1 / 20);
      lastTime = now;
      const width = Math.max(wrapper.clientWidth, 1);
      const height = Math.max(wrapper.clientHeight, 1);
      if (!reducedMotion) {
        const t = simTime;
        const target = Math.max(
          0.55 + 0.35 * Math.sin(t * 0.31 + 1.3) + 0.25 * Math.sin(t * 0.83) * (0.5 + 0.5 * Math.sin(t * 0.17)),
          0.15
        );
        gust += (target - gust) * Math.min(delta * 2, 1);
        const sTarget = pointer.inside && config.brush > 0 ? 1 : 0;
        const sRate = pointer.inside ? 8 : 2.5;
        touch.s += (sTarget - touch.s) * Math.min(delta * sRate, 1);
        const omega = 14;
        touch.vx += ((pointer.x - touch.x) * omega * omega - 2 * omega * touch.vx) * delta;
        touch.vy += ((pointer.y - touch.y) * omega * omega - 2 * omega * touch.vy) * delta;
        touch.x += touch.vx * delta;
        touch.y += touch.vy * delta;
        touchImprint(delta, width, height);
        simDebt = Math.min(simDebt + delta, DT * 5);
        while (simDebt >= DT) {
          stepSim(DT);
          simDebt -= DT;
        }
      }
      composeVertices(width, height);
      render();
      if (reducedMotion || config.wind <= 1e-3 && fieldEnergy < 4e-3 && touch.s < 0.01) {
        running = false;
        return;
      }
      raf = requestAnimationFrame(frame);
    }
    function start() {
      if (!htmlInCanvas) return;
      if (destroyed || running || !visible) return;
      running = true;
      lastTime = performance.now();
      raf = requestAnimationFrame(frame);
    }
    wake = start;
    start();
    function onMotionChange() {
      reducedMotion = motionQuery.matches;
      start();
    }
    motionQuery.addEventListener("change", onMotionChange);
    let themeTimer = 0;
    function onThemeShift() {
      syncBacking();
      start();
      window.clearTimeout(themeTimer);
      themeTimer = window.setTimeout(() => {
        syncBacking();
        start();
      }, 300);
    }
    const themeObserver = new MutationObserver(onThemeShift);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style", "data-theme"]
    });
    const schemeQuery = window.matchMedia("(prefers-color-scheme: dark)");
    schemeQuery.addEventListener("change", onThemeShift);
    const observer = createCanvasResizeObserver(() => {
      syncCanvasSize();
      start();
    });
    observer.observe(output);
    observer.observe(content);
    const intersection = new IntersectionObserver((entries) => {
      visible = entries[entries.length - 1]?.isIntersecting ?? true;
      if (visible) start();
    });
    intersection.observe(output);
    const listenTarget = wrapper;
    const rectCache = createRectCache(wrapper);
    function onPointerMove(event) {
      if (!htmlInCanvas) return;
      const rect = rectCache.current;
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      if (touch.s < 0.01) {
        touch.x = x;
        touch.y = y;
        touch.vx = 0;
        touch.vy = 0;
      }
      pointer.x = x;
      pointer.y = y;
      pointer.inside = true;
      start();
    }
    function onPointerLeave() {
      pointer.inside = false;
    }
    listenTarget.addEventListener("pointermove", onPointerMove);
    listenTarget.addEventListener("pointerleave", onPointerLeave);
    return {
      setOptions(next) {
        if (!Object.entries(next).some(
          ([key, value]) => config[key] !== value
        ))
          return;
        Object.assign(config, next);
        syncBacking();
        start();
      },
      resize() {
        syncCanvasSize();
        start();
      },
      destroy() {
        destroyed = true;
        rectCache.destroy();
        cancelAnimationFrame(raf);
        observer.disconnect();
        intersection.disconnect();
        themeObserver.disconnect();
        schemeQuery.removeEventListener("change", onThemeShift);
        window.clearTimeout(themeTimer);
        motionQuery.removeEventListener("change", onMotionChange);
        listenTarget.removeEventListener("pointermove", onPointerMove);
        listenTarget.removeEventListener("pointerleave", onPointerLeave);
        gl.deleteTexture(contentTexture);
        gl.deleteProgram(cloth.program);
        gl.deleteShader(cloth.vert);
        gl.deleteShader(cloth.frag);
        gl.deleteProgram(shadow.program);
        gl.deleteShader(shadow.vert);
        gl.deleteShader(shadow.frag);
        gl.deleteBuffer(gridBuffer);
        gl.deleteBuffer(dataBuffer);
        gl.deleteBuffer(offsetBuffer);
        gl.deleteBuffer(indexBuffer);
        gl.deleteVertexArray(clothVao);
        if (htmlInCanvas) paintable.onpaint = null;
      }
    };
  }

  // src/effects/cloth.js
  var AUTO_COLOR = "auto";
  var CONTROLS6 = {
    pin: radio("Pinned edge", "top", [
      { value: "top", label: "Top" },
      { value: "bottom", label: "Bottom" },
      { value: "left", label: "Left" },
      { value: "right", label: "Right" }
    ]),
    backing: color("Backing", AUTO_COLOR, { auto: { label: "Auto" } }),
    wind: scrub("Wind", 3, { min: 0, max: 5, step: 0.05 }),
    speed: scrub("Speed", 0.5, { min: 0, max: 3, step: 0.05 }),
    amplitude: scrub("Fold height", 30, {
      min: 0,
      max: 60,
      step: 1,
      decimals: 0
    }),
    drape: scrub("Billow", 40, { min: 0, max: 50, step: 1, decimals: 0 }),
    brush: scrub("Brush", 2.05, { min: 0, max: 3, step: 0.05 }),
    brushSize: scrub("Brush size", 150, {
      min: 30,
      max: 260,
      step: 5,
      decimals: 0
    }),
    damping: scrub("Settle", 1, { min: 0.2, max: 4, step: 0.05 }),
    light: scrub("Lighting", 0.5, { min: 0, max: 1, step: 0.05 }),
    sheen: scrub("Sheen", 0.1, { min: 0, max: 1, step: 0.05 }),
    shadow: scrub("Shadow", 0.25, { min: 0, max: 1, step: 0.05 }),
    cornerRadius: scrub("Corners", 20, {
      min: 0,
      max: 160,
      step: 2,
      decimals: 0
    }),
    perspective: scrub("Perspective", 1200, {
      min: 400,
      max: 4e3,
      step: 50,
      decimals: 0
    })
  };
  var cloth_default = {
    slug: "cloth",
    name: "Cloth",
    component: "Cloth",
    description: "Hangs the page on rippling fabric.",
    controls: CONTROLS6,
    toOptions(values) {
      const { pin, backing, ...rest } = values;
      return {
        ...rest,
        pin,
        backing: backing === AUTO_COLOR ? "auto" : hexToRgb(backing)
      };
    },
    create: createCloth
  };

  // src/vendor/lib/Clouds/CloudsVanilla.ts
  var DEFAULTS7 = {
    scale: 1,
    speed: 0.6,
    cover: 0.1,
    density: 2.5,
    shading: 0.1,
    color: "auto",
    opacity: 0.64,
    shadow: 0.06,
    shadowOffsetX: 200,
    shadowOffsetY: -10,
    shadowSoftness: 1,
    wind: 0.6,
    windRadius: 350,
    refraction: 0,
    fogBlur: 0,
    quality: 1
  };
  var VERT6 = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPos;
void main () {
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;
  var FIELD_FRAG = `#version 300 es
precision highp float;
out vec4 outColor;
uniform vec2 uResolution;
uniform vec2 uOffset;
uniform float uTime;
uniform float uScale;
uniform float uCover;
uniform float uDensity;

const mat2 m = mat2(1.6, 1.2, -1.2, 1.6);

vec2 hash (vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}

float noise (vec2 p) {
  const float K1 = 0.366025404;
  const float K2 = 0.211324865;
  vec2 i = floor(p + (p.x + p.y) * K1);
  vec2 a = p - i + (i.x + i.y) * K2;
  vec2 o = (a.x > a.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec2 b = a - o + K2;
  vec2 c = a - 1.0 + 2.0 * K2;
  vec3 h = max(0.5 - vec3(dot(a, a), dot(b, b), dot(c, c)), 0.0);
  vec3 n = h * h * h * h
    * vec3(dot(a, hash(i)), dot(b, hash(i + o)), dot(c, hash(i + 1.0)));
  return dot(n, vec3(70.0));
}

float fbm (vec2 n) {
  float total = 0.0;
  float amplitude = 0.1;
  for (int i = 0; i < 7; i++) {
    total += noise(n) * amplitude;
    n = m * n;
    amplitude *= 0.4;
  }
  return total;
}

void main () {
  vec2 p = gl_FragCoord.xy / uResolution + uOffset;
  vec2 asp = vec2(uResolution.x / uResolution.y, 1.0);
  float q = fbm(p * asp * uScale * 0.5);

  float r = 0.0;
  vec2 uv = p * asp * uScale;
  uv -= q - uTime;
  float weight = 0.8;
  for (int i = 0; i < 8; i++) {
    r += abs(weight * noise(uv));
    uv = m * uv + uTime;
    weight *= 0.7;
  }

  float f = 0.0;
  uv = p * asp * uScale;
  uv -= q - uTime;
  weight = 0.7;
  for (int i = 0; i < 8; i++) {
    f += weight * noise(uv);
    uv = m * uv + uTime;
    weight *= 0.6;
  }
  f *= r + f;

  float c = 0.0;
  float t2 = uTime * 2.0;
  uv = p * asp * uScale * 2.0;
  uv -= q - t2;
  weight = 0.4;
  for (int i = 0; i < 7; i++) {
    c += weight * noise(uv);
    uv = m * uv + t2;
    weight *= 0.6;
  }

  float c1 = 0.0;
  float t3 = uTime * 3.0;
  uv = p * asp * uScale * 3.0;
  uv -= q - t3;
  weight = 0.4;
  for (int i = 0; i < 7; i++) {
    c1 += abs(weight * noise(uv));
    uv = m * uv + t3;
    weight *= 0.6;
  }
  c += c1;

  float coverage = clamp(uCover + uDensity * f * r + c, 0.0, 1.0);
  outColor = vec4(coverage, clamp(c, 0.0, 1.0), 0.0, 1.0);
}`;
  var WIND_FRAG = `#version 300 es
precision highp float;
out vec4 outColor;
uniform sampler2D uPrev;
uniform vec2 uResolution;
uniform float uDecay;
uniform vec2 uA;
uniform vec2 uB;
uniform float uRadius;
uniform float uStrength;

void main () {
  vec2 uv = gl_FragCoord.xy / uResolution;
  float prev = texture(uPrev, uv).r * uDecay;
  vec2 asp = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 p = uv * asp;
  vec2 a = uA * asp;
  vec2 b = uB * asp;
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  float d = length(pa - ba * h) / max(uRadius, 1e-4);
  float stamp = exp(-d * d * 3.0) * uStrength;
  outColor = vec4(clamp(prev + stamp, 0.0, 1.0), 0.0, 0.0, 1.0);
}`;
  var COMPOSITE_FRAG = `#version 300 es
precision highp float;
out vec4 outColor;
uniform sampler2D uField;
uniform sampler2D uContent;
uniform sampler2D uWind;
uniform vec2 uResolution;
uniform vec2 uContentScale;
uniform vec3 uBase;
uniform float uShading;
uniform float uOpacity;
uniform float uShadow;
uniform vec2 uShadowShift;
uniform float uShadowLod;
uniform float uWindAmt;
uniform float uRefraction;
uniform float uFogBlur;
uniform float uHasContent;

void main () {
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec2 field = texture(uField, uv).rg;
  float wind = texture(uWind, uv).r * uWindAmt;
  float cov = field.r - wind;
  float mist = smoothstep(0.04, 0.9, cov);
  float cloudA = mist * uOpacity;

  float lum = dot(uBase, vec3(0.299, 0.587, 0.114));
  float sh = clamp(field.g, 0.0, 1.0);
  float k = uShading * 0.35;
  vec3 cloudRGB = lum > 0.5
    ? uBase - vec3((1.0 - sh) * k)
    : uBase + vec3(sh * k);
  cloudRGB = clamp(cloudRGB, 0.0, 1.0);

  vec2 sUv = uv + uShadowShift;
  float s = textureLod(uField, sUv, uShadowLod).r
    - texture(uWind, sUv).r * uWindAmt;
  float shadowA = smoothstep(0.35, 1.0, s) * uShadow * (1.0 - mist);

  float a;
  vec3 rgb;
  if (uHasContent > 0.5) {
    vec2 e = vec2(8.0) / uResolution;
    float gx = texture(uField, uv + vec2(e.x, 0.0)).r
      - texture(uField, uv - vec2(e.x, 0.0)).r;
    float gy = texture(uField, uv + vec2(0.0, e.y)).r
      - texture(uField, uv - vec2(0.0, e.y)).r;
    vec2 rUv = uv + vec2(gx, gy) * uRefraction * mist;
    vec3 fogged = textureLod(
      uContent, vec2(rUv.x, 1.0 - rUv.y) * uContentScale, mist * uFogBlur * 5.0
    ).rgb;
    vec3 layer = mix(fogged, cloudRGB, cloudA) * (1.0 - shadowA);
    float aF = smoothstep(0.02, 0.2, mist);
    a = aF + shadowA * (1.0 - aF);
    rgb = layer * aF;
  } else {
    a = cloudA + shadowA * (1.0 - cloudA);
    rgb = cloudRGB * cloudA;
  }
  outColor = vec4(rgb, a);
}`;
  function createClouds(elements, options = {}) {
    const config = { ...DEFAULTS7, ...options };
    const { source, content, output } = elements;
    const gl = output.getContext("webgl2", {
      alpha: true,
      depth: false,
      stencil: false,
      antialias: false,
      premultipliedAlpha: true
    });
    if (!gl || gl.isContextLost()) return null;
    const sourceCtx = source.getContext("2d");
    const paintable = source;
    const htmlInCanvas = Boolean(
      sourceCtx && typeof sourceCtx.drawElementImage === "function" && typeof paintable.requestPaint === "function"
    );
    if (htmlInCanvas) prepareHtmlInCanvas(source, content);
    let contentDirty = false;
    let wake = () => {
    };
    if (htmlInCanvas) {
      paintable.onpaint = () => {
        try {
          sourceCtx.reset();
          drawHtmlInCanvas(source, sourceCtx, content);
          contentDirty = true;
          wake();
        } catch {
        }
      };
    }
    function compile(type, text) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, text);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error("Clouds shader error:", gl.getShaderInfoLog(shader));
      }
      return shader;
    }
    function link(fragSource) {
      const vs = compile(gl.VERTEX_SHADER, VERT6);
      const fs = compile(gl.FRAGMENT_SHADER, fragSource);
      const program = gl.createProgram();
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.linkProgram(program);
      const uniforms = {};
      const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < count; i++) {
        const info = gl.getActiveUniform(program, i);
        uniforms[info.name] = gl.getUniformLocation(program, info.name);
      }
      return { program, vs, fs, uniforms };
    }
    const field = link(FIELD_FRAG);
    const windPass = link(WIND_FRAG);
    const composite = link(COMPOSITE_FRAG);
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const fieldTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, fieldTexture);
    gl.texParameteri(
      gl.TEXTURE_2D,
      gl.TEXTURE_MIN_FILTER,
      gl.LINEAR_MIPMAP_LINEAR
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const contentTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, contentTexture);
    gl.texParameteri(
      gl.TEXTURE_2D,
      gl.TEXTURE_MIN_FILTER,
      gl.LINEAR_MIPMAP_LINEAR
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([0, 0, 0, 255])
    );
    gl.generateMipmap(gl.TEXTURE_2D);
    function makeWindTexture() {
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return texture;
    }
    const windTextures = [makeWindTexture(), makeWindTexture()];
    let windIndex = 0;
    const fbo = gl.createFramebuffer();
    let fieldW = 0;
    let fieldH = 0;
    let contentScaleX = 1;
    let contentScaleY = 1;
    let baseColor = [1, 1, 1];
    const probe = document.createElement("canvas");
    probe.width = probe.height = 1;
    const probeCtx = probe.getContext("2d", { willReadFrequently: true });
    function syncBaseColor() {
      if (config.color !== "auto") {
        baseColor = config.color;
        return;
      }
      if (!probeCtx) return;
      let el = content;
      while (el) {
        const bg = getComputedStyle(el).backgroundColor;
        if (bg && bg !== "transparent") {
          probeCtx.clearRect(0, 0, 1, 1);
          probeCtx.fillStyle = bg;
          probeCtx.fillRect(0, 0, 1, 1);
          const [r, g, b, a] = probeCtx.getImageData(0, 0, 1, 1).data;
          if (a > 0) {
            baseColor = [r / 255, g / 255, b / 255];
            return;
          }
        }
        el = el.parentElement;
      }
      baseColor = [1, 1, 1];
    }
    function syncCanvasSize() {
      const cw = content.clientWidth;
      const ch = content.clientHeight;
      if (cw > 0 && ch > 0) {
        const wpx = `${cw}px`;
        const hpx = `${ch}px`;
        if (output.style.width !== wpx) output.style.width = wpx;
        if (output.style.height !== hpx) output.style.height = hpx;
      }
      const dpr = getCanvasPixelRatio(output, gl);
      const width = Math.max(1, Math.round(output.clientWidth * dpr));
      const height = Math.max(1, Math.round(output.clientHeight * dpr));
      if (output.width !== width || output.height !== height) {
        output.width = width;
        output.height = height;
      }
      contentScaleX = htmlInCanvas ? Math.min(1, cw / Math.max(source.clientWidth, 1)) : 1;
      contentScaleY = htmlInCanvas ? Math.min(1, ch / Math.max(source.clientHeight, 1)) : 1;
      const quality = Math.min(Math.max(config.quality, 0.2), 1);
      const cap = 1440 / Math.max(output.clientWidth, 1);
      const q = Math.min(quality, cap);
      const nextW = Math.max(16, Math.round(output.clientWidth * q));
      const nextH = Math.max(16, Math.round(output.clientHeight * q));
      if (nextW !== fieldW || nextH !== fieldH) {
        fieldW = nextW;
        fieldH = nextH;
        gl.bindTexture(gl.TEXTURE_2D, fieldTexture);
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          fieldW,
          fieldH,
          0,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          null
        );
        gl.generateMipmap(gl.TEXTURE_2D);
        for (const texture of windTextures) {
          gl.bindTexture(gl.TEXTURE_2D, texture);
          gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA,
            fieldW,
            fieldH,
            0,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            null
          );
        }
      }
      if (htmlInCanvas) {
        const sourceWidth = Math.max(1, Math.round(source.clientWidth * dpr));
        const sourceHeight = Math.max(1, Math.round(source.clientHeight * dpr));
        if (source.width !== sourceWidth || source.height !== sourceHeight) {
          source.width = sourceWidth;
          source.height = sourceHeight;
        }
        paintable.requestPaint();
      }
    }
    syncCanvasSize();
    syncBaseColor();
    function uploadContent() {
      if (!htmlInCanvas || !contentDirty) return;
      contentDirty = false;
      gl.bindTexture(gl.TEXTURE_2D, contentTexture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        source
      );
      gl.generateMipmap(gl.TEXTURE_2D);
    }
    let pointerX = 0.5;
    let pointerY = 0.5;
    let prevPointerX = 0.5;
    let prevPointerY = 0.5;
    let hasPointer = false;
    let lastPointerMove = 0;
    let time = Math.random() * 64;
    function render(delta) {
      uploadContent();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D,
        fieldTexture,
        0
      );
      gl.viewport(0, 0, fieldW, fieldH);
      gl.useProgram(field.program);
      gl.uniform2f(field.uniforms.uResolution, fieldW, fieldH);
      gl.uniform2f(
        field.uniforms.uOffset,
        content.scrollLeft / Math.max(content.clientWidth, 1),
        -content.scrollTop / Math.max(content.clientHeight, 1)
      );
      gl.uniform1f(field.uniforms.uTime, time);
      gl.uniform1f(field.uniforms.uScale, Math.max(config.scale, 0.05));
      gl.uniform1f(field.uniforms.uCover, Math.max(config.cover, 0));
      gl.uniform1f(field.uniforms.uDensity, Math.max(config.density, 0));
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      const prevWind = windTextures[windIndex];
      const nextWind = windTextures[1 - windIndex];
      windIndex = 1 - windIndex;
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D,
        nextWind,
        0
      );
      gl.useProgram(windPass.program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, prevWind);
      gl.uniform1i(windPass.uniforms.uPrev, 0);
      gl.uniform2f(windPass.uniforms.uResolution, fieldW, fieldH);
      gl.uniform1f(windPass.uniforms.uDecay, Math.pow(0.5, delta / 0.7));
      const moved = Math.hypot(pointerX - prevPointerX, pointerY - prevPointerY);
      const stamping = hasPointer && moved > 0;
      gl.uniform2f(windPass.uniforms.uA, prevPointerX, prevPointerY);
      gl.uniform2f(windPass.uniforms.uB, pointerX, pointerY);
      gl.uniform1f(
        windPass.uniforms.uRadius,
        Math.max(config.windRadius, 1) / Math.max(output.clientHeight, 1)
      );
      gl.uniform1f(
        windPass.uniforms.uStrength,
        stamping ? Math.min(0.2 + moved * 12, 1) * 0.5 : 0
      );
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      prevPointerX = pointerX;
      prevPointerY = pointerY;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.bindTexture(gl.TEXTURE_2D, fieldTexture);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.viewport(0, 0, output.width, output.height);
      gl.useProgram(composite.program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, fieldTexture);
      gl.uniform1i(composite.uniforms.uField, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, contentTexture);
      gl.uniform1i(composite.uniforms.uContent, 1);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, nextWind);
      gl.uniform1i(composite.uniforms.uWind, 2);
      gl.uniform2f(composite.uniforms.uResolution, output.width, output.height);
      gl.uniform2f(
        composite.uniforms.uContentScale,
        contentScaleX,
        contentScaleY
      );
      gl.uniform3f(
        composite.uniforms.uBase,
        baseColor[0],
        baseColor[1],
        baseColor[2]
      );
      gl.uniform1f(
        composite.uniforms.uOpacity,
        Math.min(Math.max(config.opacity, 0), 1)
      );
      gl.uniform1f(composite.uniforms.uShading, Math.max(config.shading, 0));
      gl.uniform1f(
        composite.uniforms.uShadow,
        Math.min(Math.max(config.shadow, 0), 1)
      );
      gl.uniform2f(
        composite.uniforms.uShadowShift,
        -config.shadowOffsetX / Math.max(output.clientWidth, 1),
        config.shadowOffsetY / Math.max(output.clientHeight, 1)
      );
      gl.uniform1f(
        composite.uniforms.uShadowLod,
        Math.min(Math.max(config.shadowSoftness, 0), 1) * 4
      );
      gl.uniform1f(
        composite.uniforms.uWindAmt,
        Math.min(Math.max(config.wind, 0), 1)
      );
      gl.uniform1f(
        composite.uniforms.uRefraction,
        Math.max(config.refraction, 0) / Math.max(output.clientWidth, 1)
      );
      gl.uniform1f(
        composite.uniforms.uFogBlur,
        Math.min(Math.max(config.fogBlur, 0), 1)
      );
      gl.uniform1f(composite.uniforms.uHasContent, htmlInCanvas ? 1 : 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    let raf = 0;
    let lastTime = performance.now();
    let destroyed = false;
    let running = false;
    let visible = true;
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reducedMotion = motionQuery.matches;
    function frame(now) {
      if (destroyed) return;
      if (!visible) {
        running = false;
        return;
      }
      const delta = Math.min((now - lastTime) / 1e3, 1 / 30);
      lastTime = now;
      if (!reducedMotion) time += delta * config.speed * 0.03;
      render(delta);
      const windActive = now - lastPointerMove < 3e3;
      if (reducedMotion && !windActive && !contentDirty) {
        running = false;
        return;
      }
      raf = requestAnimationFrame(frame);
    }
    function start() {
      if (destroyed || running || !visible) return;
      running = true;
      lastTime = performance.now();
      raf = requestAnimationFrame(frame);
    }
    wake = start;
    start();
    function onMotionChange() {
      reducedMotion = motionQuery.matches;
      start();
    }
    motionQuery.addEventListener("change", onMotionChange);
    const observer = createCanvasResizeObserver(() => {
      syncCanvasSize();
      start();
    });
    observer.observe(output);
    observer.observe(content);
    const intersection = new IntersectionObserver((entries) => {
      visible = entries[entries.length - 1]?.isIntersecting ?? true;
      if (visible) start();
    });
    intersection.observe(output);
    const rectCache = createRectCache(output);
    function onPointerMove(event) {
      const rect = rectCache.current;
      const x = (event.clientX - rect.left) / Math.max(rect.width, 1);
      const y = 1 - (event.clientY - rect.top) / Math.max(rect.height, 1);
      if (!hasPointer) {
        prevPointerX = x;
        prevPointerY = y;
        hasPointer = true;
      }
      pointerX = x;
      pointerY = y;
      lastPointerMove = performance.now();
      start();
    }
    function onPointerLeave() {
      hasPointer = false;
    }
    content.addEventListener("pointermove", onPointerMove, { passive: true });
    content.addEventListener("pointerleave", onPointerLeave, { passive: true });
    content.addEventListener("scroll", start, { passive: true });
    let themeTimer = 0;
    function onThemeShift() {
      syncBaseColor();
      start();
      window.clearTimeout(themeTimer);
      themeTimer = window.setTimeout(() => {
        syncBaseColor();
        start();
      }, 300);
    }
    const themeObserver = new MutationObserver(onThemeShift);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style", "data-theme"]
    });
    const schemeQuery = window.matchMedia("(prefers-color-scheme: dark)");
    schemeQuery.addEventListener("change", onThemeShift);
    return {
      setOptions(next) {
        if (!Object.entries(next).some(
          ([key, value]) => config[key] !== value
        ))
          return;
        Object.assign(config, next);
        syncCanvasSize();
        syncBaseColor();
        start();
      },
      resize() {
        syncCanvasSize();
        start();
      },
      destroy() {
        destroyed = true;
        rectCache.destroy();
        cancelAnimationFrame(raf);
        observer.disconnect();
        intersection.disconnect();
        themeObserver.disconnect();
        schemeQuery.removeEventListener("change", onThemeShift);
        window.clearTimeout(themeTimer);
        motionQuery.removeEventListener("change", onMotionChange);
        content.removeEventListener("pointermove", onPointerMove);
        content.removeEventListener("pointerleave", onPointerLeave);
        content.removeEventListener("scroll", start);
        if (htmlInCanvas) paintable.onpaint = null;
        gl.deleteTexture(fieldTexture);
        gl.deleteTexture(contentTexture);
        gl.deleteTexture(windTextures[0]);
        gl.deleteTexture(windTextures[1]);
        gl.deleteFramebuffer(fbo);
        gl.deleteProgram(field.program);
        gl.deleteProgram(windPass.program);
        gl.deleteProgram(composite.program);
        gl.deleteShader(field.vs);
        gl.deleteShader(field.fs);
        gl.deleteShader(windPass.vs);
        gl.deleteShader(windPass.fs);
        gl.deleteShader(composite.vs);
        gl.deleteShader(composite.fs);
        gl.deleteBuffer(quad);
      }
    };
  }

  // src/effects/clouds.js
  var AUTO_COLOR2 = "auto";
  var CONTROLS7 = {
    color: color("Color", AUTO_COLOR2, { auto: { label: "Auto" } }),
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
      decimals: 0
    }),
    shadowOffsetY: scrub("Shadow Y", -10, {
      min: -300,
      max: 300,
      step: 10,
      decimals: 0
    }),
    shadowSoftness: scrub("Softness", 1, { min: 0, max: 1, step: 0.02 }),
    wind: scrub("Wind", 0.6, { min: 0, max: 1, step: 0.02 }),
    windRadius: scrub("Wind radius", 350, {
      min: 40,
      max: 400,
      step: 10,
      decimals: 0
    }),
    refraction: scrub("Refraction", 0, { min: 0, max: 80, step: 1, decimals: 0 }),
    fogBlur: scrub("Fog blur", 0, { min: 0, max: 1, step: 0.02 }),
    quality: scrub("Quality", 1, { min: 0.2, max: 1, step: 0.05 })
  };
  var clouds_default = {
    slug: "clouds",
    name: "Clouds",
    component: "Clouds",
    description: "Theme-aware mist parted by cursor wind.",
    controls: CONTROLS7,
    toOptions(values) {
      const { color: colorValue, ...rest } = values;
      return {
        ...rest,
        color: colorValue === AUTO_COLOR2 ? "auto" : hexToRgb(colorValue)
      };
    },
    create: createClouds
  };

  // src/vendor/lib/DecryptReveal/DecryptRevealVanilla.ts
  var PRINTABLE_ASCII = Array.from(
    { length: 95 },
    (_, i) => String.fromCharCode(32 + i)
  ).join("");
  var DEFAULTS8 = {
    radius: 400,
    softness: 0.5,
    cell: 10,
    aspect: 0.75,
    charset: PRINTABLE_ASCII,
    colored: 1,
    color: "#4ade80",
    brightness: 1,
    legibility: 1,
    contrast: 1,
    exposure: 1,
    scramble: 0.1,
    scrambleSpeed: 6,
    edgeWidth: 0.2,
    edgeFlicker: 1,
    edgeGlow: 2,
    edgeTint: 0.75,
    aberration: 10,
    passthrough: 0.15,
    threshold: 0.025,
    background: "#000000",
    smoothing: 0.2
  };
  var ATLAS_CELL = 64;
  var ATLAS_PAD = 8;
  var MAX_GLYPHS2 = 255;
  var INNER_CIRCLES = [
    [0.28, 0.26],
    [0.72, 0.14],
    [0.28, 0.56],
    [0.72, 0.44],
    [0.28, 0.86],
    [0.72, 0.74]
  ];
  var VERT7 = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPos;
out vec2 vUv;
void main () {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;
  var CELL_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uContent;
uniform sampler2D uShapes;
uniform vec2 uContentRes;
uniform vec2 uCellPx;
uniform int uGlyphCount;
uniform float uContrast;
uniform float uExposure;
uniform float uThreshold;
uniform vec3 uBg;

const vec2 INNER[6] = vec2[6](
  vec2(0.28, 0.26), vec2(0.72, 0.14),
  vec2(0.28, 0.56), vec2(0.72, 0.44),
  vec2(0.28, 0.86), vec2(0.72, 0.74)
);
const vec2 OUTER[10] = vec2[10](
  vec2(0.28, -0.2), vec2(0.72, -0.2),
  vec2(-0.22, 0.25), vec2(1.22, 0.25),
  vec2(-0.22, 0.5), vec2(1.22, 0.5),
  vec2(-0.22, 0.75), vec2(1.22, 0.75),
  vec2(0.28, 1.2), vec2(0.72, 1.2)
);
const vec2 RING[6] = vec2[6](
  vec2(1.0, 0.0), vec2(0.5, 0.8660254), vec2(-0.5, 0.8660254),
  vec2(-1.0, 0.0), vec2(-0.5, -0.8660254), vec2(0.5, -0.8660254)
);

vec2 cellBase;

vec4 fetchTap (vec2 p) {
  vec2 uv = p / uContentRes;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return vec4(0.0);
  return texture(uContent, uv);
}

vec4 sampleCircle (vec2 c) {
  vec2 middle = cellBase + c * uCellPx;
  float r = uCellPx.y * 0.161;
  vec4 acc = fetchTap(middle);
  for (int k = 0; k < 6; k++) acc += fetchTap(middle + RING[k] * r);
  return acc / 7.0;
}

float tapLevel (vec4 t) {
  vec3 straight = t.rgb / max(t.a, 1e-4);
  return dot(abs(straight - uBg), vec3(0.299, 0.587, 0.114)) * t.a;
}

float circleSig (vec4 acc) {
  return clamp(tapLevel(acc) * uExposure, 0.0, 1.0);
}

float dirContrast (float value, float ext) {
  float peak = max(value, ext);
  if (peak < 1e-4) return value;
  return pow(value / peak, uContrast) * peak;
}

void main () {
  cellBase = floor(gl_FragCoord.xy) * uCellPx;
  float v[6];
  vec3 colAcc = vec3(0.0);
  float alphaAcc = 0.0;
  for (int i = 0; i < 6; i++) {
    vec4 acc = sampleCircle(INNER[i]);
    v[i] = circleSig(acc);
    colAcc += acc.rgb;
    alphaAcc += acc.a;
  }
  float e[10];
  for (int i = 0; i < 10; i++) e[i] = circleSig(sampleCircle(OUTER[i]));
  v[0] = dirContrast(v[0], max(max(e[0], e[1]), max(e[2], e[4])));
  v[1] = dirContrast(v[1], max(max(e[0], e[1]), max(e[3], e[5])));
  v[2] = dirContrast(v[2], max(e[2], max(e[4], e[6])));
  v[3] = dirContrast(v[3], max(e[3], max(e[5], e[7])));
  v[4] = dirContrast(v[4], max(max(e[4], e[6]), max(e[8], e[9])));
  v[5] = dirContrast(v[5], max(max(e[5], e[7]), max(e[8], e[9])));
  float gm[6];
  for (int i = 0; i < 6; i++) gm[i] = 0.0;
  float levSum = 0.0;
  float inkLev = 0.0;
  vec3 inkCol = vec3(0.0);
  int nx = int(clamp(uCellPx.x, 6.0, 20.0));
  int ny = int(clamp(uCellPx.y, 8.0, 32.0));
  float fx = float(nx - 1);
  float fy = float(ny - 1);
  for (int gy = 0; gy < ny; gy++) {
    for (int gx = 0; gx < nx; gx++) {
      vec2 p = vec2(float(gx) / fx, float(gy) / fy);
      vec4 t = fetchTap(cellBase + p * uCellPx);
      float lev = tapLevel(t);
      int idx = (p.y < 0.41 ? 0 : (p.y < 0.71 ? 2 : 4)) + (p.x < 0.5 ? 0 : 1);
      gm[idx] = max(gm[idx], lev);
      levSum += lev;
      if (lev > inkLev) {
        inkLev = lev;
        inkCol = t.rgb / max(t.a, 1e-4);
      }
    }
  }
  inkLev *= uExposure;
  for (int i = 0; i < 6; i++)
    v[i] = max(v[i], clamp(gm[i] * uExposure, 0.0, 1.0));
  float peak = max(max(max(v[0], v[1]), max(v[2], v[3])), max(v[4], v[5]));
  vec3 avgCol = colAcc / max(alphaAcc, 1e-4);
  if (peak < uThreshold) {
    outColor = vec4(avgCol, 0.0);
    return;
  }
  float mean = levSum * uExposure / float(nx * ny);
  float sharp = inkLev / max(mean, 1e-4);
  float solid = smoothstep(uThreshold, uThreshold * 1.6, inkLev);
  float lift = smoothstep(1.5, 3.0, sharp) * solid;
  float lifted = mix(peak, 1.0, lift);
  for (int i = 0; i < 6; i++)
    v[i] = pow(min(v[i] / max(peak, 1e-4), 1.0), uContrast) * lifted;
  vec3 cellCol = mix(avgCol, inkCol, lift);
  int best = 0;
  float bestD = 1e9;
  for (int g = 0; g < uGlyphCount; g++) {
    float d = 0.0;
    for (int i = 0; i < 6; i++) {
      float diff = v[i] - texelFetch(uShapes, ivec2(i, g), 0).r;
      d += diff * diff;
    }
    if (d < bestD) {
      bestD = d;
      best = g;
    }
  }
  outColor = vec4(cellCol, float(best) / 255.0);
}`;
  var MAIN_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uContent;
uniform sampler2D uCells;
uniform sampler2D uAtlas;
uniform vec2 uRes;
uniform float uDpr;
uniform vec2 uCellPx;
uniform vec2 uGrid;
uniform vec2 uAtlasGrid;
uniform vec2 uAtlasPad;
uniform vec2 uAtlasInner;
uniform int uGlyphCount;
uniform vec2 uPointer;
uniform float uActive;
uniform float uRadius;
uniform float uSoftness;
uniform float uColored;
uniform vec3 uColor;
uniform float uBrightness;
uniform float uLegibility;
uniform float uScramble;
uniform float uScrambleSpeed;
uniform float uEdgeWidth;
uniform float uEdgeFlicker;
uniform float uEdgeGlow;
uniform float uEdgeTint;
uniform float uAberration;
uniform float uPassthrough;
uniform vec3 uBg;
uniform float uTime;
uniform float uMaxX;
uniform float uCrisp;

float hash (vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec4 samp (vec2 p) {
  vec2 uv = p / uRes;
  uv = clamp(uv, vec2(0.001), vec2(uMaxX - 0.001, 0.999));
  return texture(uContent, uv);
}

void main () {
  vec2 pc = vec2(vUv.x, 1.0 - vUv.y) * uRes;
  if (pc.x > uMaxX * uRes.x) {
    outColor = vec4(0.0);
    return;
  }
  if (uCrisp > 0.5) {
    outColor = samp(pc);
    return;
  }

  float dist = length(pc - uPointer);
  float radius = max(uRadius, 1.0);
  float inner = radius * (1.0 - clamp(uSoftness, 0.02, 1.0));
  float e = (1.0 - smoothstep(inner, radius, dist)) * uActive;

  float bandW = max(radius * clamp(uEdgeWidth, 0.0, 1.0) * 0.5, 6.0);
  float bandD = dist - mix(inner, radius, 0.5);
  float ring = exp(-bandD * bandD / (2.0 * bandW * bandW)) * uActive;

  vec2 dir = (pc - uPointer) / max(dist, 1e-3);
  float ca = uAberration * ring;
  vec4 rC = samp(pc);
  vec3 real = vec3(samp(pc + dir * ca).r, rC.g, samp(pc - dir * ca).b);

  vec2 cellPos = pc * uDpr / uCellPx;
  vec2 cell = clamp(floor(cellPos), vec2(0.0), uGrid - 1.0);
  vec4 info = texelFetch(uCells, ivec2(cell), 0);
  float glyph = floor(info.a * 255.0 + 0.5);

  float rerollP = clamp(uScramble * 0.35 + ring * uEdgeFlicker, 0.0, 1.0);
  float speed = max(uScrambleSpeed, 0.001) * (1.0 + ring * 2.5);
  float ft = floor(uTime * speed);
  float swap = step(1.0 - rerollP, hash(cell * 3.3 + vec2(ft * 0.717, ft * 0.523)))
    * step(0.5, glyph);
  float pick = hash(cell + vec2(ft * 0.613, ft * 0.831));
  glyph = mix(glyph, floor(pick * float(uGlyphCount - 1)) + 1.0, swap);

  vec2 local = clamp(cellPos - cell, 0.0, 1.0);
  float gx = mod(glyph, uAtlasGrid.x);
  float gy = floor(glyph / uAtlasGrid.x);
  vec2 atlasUv = vec2(
    (gx + uAtlasPad.x + local.x * uAtlasInner.x) / uAtlasGrid.x,
    (gy + uAtlasPad.y + local.y * uAtlasInner.y) / uAtlasGrid.y
  );
  vec2 atlasStep = uAtlasInner / uAtlasGrid;
  float mask = textureGrad(
    uAtlas,
    atlasUv,
    dFdx(cellPos) * atlasStep,
    dFdy(cellPos) * atlasStep
  ).a * step(0.5, glyph);

  vec3 cellCol = info.rgb;
  vec3 lw = vec3(0.299, 0.587, 0.114);
  vec3 dev = cellCol - uBg;
  float mag = dot(abs(dev), lw);
  float target = clamp(uLegibility, 0.0, 1.0) * 0.75;
  float boost = clamp(target / max(mag, 0.01), 1.0, 32.0);
  vec3 vivid = clamp(uBg + dev * boost, 0.0, 1.0);
  float vividMag = dot(abs(vivid - uBg), lw);
  vec3 ink = mix(vec3(1.0), vec3(0.06), step(0.5, dot(uBg, lw)));
  vivid = mix(vivid, ink, clamp((target - vividMag) / max(target, 1e-3), 0.0, 1.0));
  float cellSig = clamp(mag * 1.6, 0.0, 1.0);
  vec3 mono = uColor * mix(0.35, 1.2, cellSig);
  vec3 glyphColor = mix(mono, vivid, clamp(uColored, 0.0, 1.0));
  glyphColor = clamp(uBg + (glyphColor - uBg) * uBrightness, 0.0, 1.0);
  float cellLum = dot(vivid, lw);
  glyphColor = mix(
    glyphColor,
    uColor * max(uBrightness, 1.0) * (0.6 + cellLum),
    ring * clamp(uEdgeTint, 0.0, 1.0)
  );
  glyphColor = clamp(
    uBg + (glyphColor - uBg) * (1.0 + ring * uEdgeGlow * 1.6),
    0.0,
    1.0
  );

  vec3 base = mix(uBg, real, clamp(uPassthrough, 0.0, 1.0));
  vec3 encrypted = mix(base, glyphColor, mask);
  vec3 col = mix(encrypted, real, e);
  float alpha = mix(max(rC.a, mask), rC.a, e);
  outColor = vec4(col, alpha);
}`;
  var colorProbe = null;
  function parseColor(input) {
    if (typeof document === "undefined") return [0, 0, 0];
    if (!colorProbe) {
      const probe = document.createElement("canvas");
      probe.width = 1;
      probe.height = 1;
      colorProbe = probe.getContext("2d", { willReadFrequently: true });
    }
    if (!colorProbe) return [0, 0, 0];
    colorProbe.fillStyle = "#000000";
    colorProbe.fillStyle = input;
    colorProbe.clearRect(0, 0, 1, 1);
    colorProbe.fillRect(0, 0, 1, 1);
    const data = colorProbe.getImageData(0, 0, 1, 1).data;
    return [data[0] / 255, data[1] / 255, data[2] / 255];
  }
  function buildGlyphList(charset) {
    const seen = /* @__PURE__ */ new Set([" "]);
    const glyphs = [" "];
    for (const ch of charset) {
      if (glyphs.length >= MAX_GLYPHS2) break;
      if (ch === "\n" || ch === "\r" || ch === "	" || seen.has(ch)) continue;
      seen.add(ch);
      glyphs.push(ch);
    }
    return glyphs;
  }
  function glyphShapes(image, cols, cellW, cellH, count) {
    const vectors = new Float32Array(count * 6);
    const radius = cellH * 0.26;
    const padW = cellW + ATLAS_PAD * 2;
    const padH = cellH + ATLAS_PAD * 2;
    for (let g = 0; g < count; g++) {
      const originX = g % cols * padW + ATLAS_PAD;
      const originY = Math.floor(g / cols) * padH + ATLAS_PAD;
      for (let c = 0; c < 6; c++) {
        const cx = INNER_CIRCLES[c][0] * cellW;
        const cy = INNER_CIRCLES[c][1] * cellH;
        let sum = 0;
        let total = 0;
        for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y++) {
          for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++) {
            const dx = x + 0.5 - cx;
            const dy = y + 0.5 - cy;
            if (dx * dx + dy * dy > radius * radius) continue;
            total += 1;
            if (x < -ATLAS_PAD || y < -ATLAS_PAD || x >= cellW + ATLAS_PAD || y >= cellH + ATLAS_PAD)
              continue;
            sum += image.data[((originY + y) * image.width + originX + x) * 4 + 3];
          }
        }
        vectors[g * 6 + c] = total ? sum / (total * 255) : 0;
      }
    }
    for (let c = 0; c < 6; c++) {
      let peak = 0;
      for (let g = 0; g < count; g++) {
        peak = Math.max(peak, vectors[g * 6 + c]);
      }
      if (peak > 0) {
        for (let g = 0; g < count; g++) vectors[g * 6 + c] /= peak;
      }
    }
    return vectors;
  }
  function clampAspect(aspect) {
    return Math.min(Math.max(aspect || DEFAULTS8.aspect, 0.35), 1.25);
  }
  function createDecryptReveal(elements, options = {}) {
    const config = { ...DEFAULTS8, ...options };
    const { source, content, output } = elements;
    const gl = output.getContext("webgl2", {
      alpha: true,
      depth: false,
      stencil: false,
      antialias: false,
      premultipliedAlpha: false
    });
    if (!gl || gl.isContextLost()) return null;
    const sourceCtx = source.getContext("2d");
    const paintable = source;
    const htmlInCanvas = Boolean(
      sourceCtx && typeof sourceCtx.drawElementImage === "function" && typeof paintable.requestPaint === "function"
    );
    if (htmlInCanvas) prepareHtmlInCanvas(source, content);
    let contentDirty = false;
    let cellsDirty = true;
    let wake = () => {
    };
    if (htmlInCanvas) {
      paintable.onpaint = () => {
        try {
          sourceCtx.reset();
          drawHtmlInCanvas(source, sourceCtx, content);
          contentDirty = true;
          wake();
        } catch {
        }
      };
    }
    function compile(type, text) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, text);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error(
          "DecryptReveal shader error:",
          gl.getShaderInfoLog(shader)
        );
      }
      return shader;
    }
    function link(frag) {
      const vs = compile(gl.VERTEX_SHADER, VERT7);
      const fs = compile(gl.FRAGMENT_SHADER, frag);
      const program = gl.createProgram();
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.linkProgram(program);
      const uniforms = {};
      const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < count; i++) {
        const info = gl.getActiveUniform(program, i);
        uniforms[info.name] = gl.getUniformLocation(program, info.name);
      }
      return { program, vs, fs, uniforms };
    }
    const cellPass = link(CELL_FRAG);
    const mainPass = link(MAIN_FRAG);
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    function makeTexture(filter) {
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return texture;
    }
    const contentTexture = makeTexture(gl.LINEAR);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([0, 0, 0, 0])
    );
    const cellTexture = makeTexture(gl.NEAREST);
    const cellFbo = gl.createFramebuffer();
    let cellCols = 0;
    let cellRows = 0;
    const shapeTexture = makeTexture(gl.NEAREST);
    const atlasTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, atlasTexture);
    gl.texParameteri(
      gl.TEXTURE_2D,
      gl.TEXTURE_MIN_FILTER,
      gl.LINEAR_MIPMAP_LINEAR
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    let glyphCount = 0;
    let atlasCols = 1;
    let atlasRows = 1;
    let atlasPad = [0, 0];
    let atlasInner = [1, 1];
    let builtCharset = "";
    let builtAspect = 0;
    function rebuildAtlas() {
      const aspect = clampAspect(config.aspect);
      if (builtCharset === config.charset && builtAspect === aspect) return;
      const glyphs = buildGlyphList(config.charset);
      const cellH = ATLAS_CELL;
      const cellW = Math.max(Math.round(cellH * aspect), 8);
      const padW = cellW + ATLAS_PAD * 2;
      const padH = cellH + ATLAS_PAD * 2;
      const cols = Math.ceil(Math.sqrt(glyphs.length));
      const rows = Math.ceil(glyphs.length / cols);
      const surface = document.createElement("canvas");
      surface.width = cols * padW;
      surface.height = rows * padH;
      const ctx = surface.getContext("2d");
      if (!ctx) return;
      builtCharset = config.charset;
      builtAspect = aspect;
      ctx.clearRect(0, 0, surface.width, surface.height);
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const fontPx = Math.floor(Math.min(cellH * 0.92, cellW / 0.58));
      ctx.font = `600 ${fontPx}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
      for (let g = 0; g < glyphs.length; g++) {
        ctx.fillText(
          glyphs[g],
          g % cols * padW + padW / 2,
          Math.floor(g / cols) * padH + padH / 2
        );
      }
      const image = ctx.getImageData(0, 0, surface.width, surface.height);
      const vectors = glyphShapes(image, cols, cellW, cellH, glyphs.length);
      gl.bindTexture(gl.TEXTURE_2D, atlasTexture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        surface
      );
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.bindTexture(gl.TEXTURE_2D, shapeTexture);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.R32F,
        6,
        glyphs.length,
        0,
        gl.RED,
        gl.FLOAT,
        vectors
      );
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
      glyphCount = glyphs.length;
      atlasCols = cols;
      atlasRows = rows;
      atlasPad = [ATLAS_PAD / padW, ATLAS_PAD / padH];
      atlasInner = [cellW / padW, cellH / padH];
      cellsDirty = true;
    }
    let contentMaxX = 1;
    function cellSizePx(dpr) {
      const h = Math.min(Math.max(config.cell, 4), 40) * dpr;
      return [h * clampAspect(config.aspect), h];
    }
    function syncCanvasSize() {
      const dpr = getCanvasPixelRatio(output, gl);
      const width = Math.max(1, Math.round(output.clientWidth * dpr));
      const height = Math.max(1, Math.round(output.clientHeight * dpr));
      if (output.width !== width || output.height !== height) {
        output.width = width;
        output.height = height;
      }
      contentMaxX = Math.min(
        1,
        Math.max(0.05, content.clientWidth / Math.max(output.clientWidth, 1))
      );
      if (htmlInCanvas) {
        const sourceWidth = Math.max(1, Math.round(source.clientWidth * dpr));
        const sourceHeight = Math.max(1, Math.round(source.clientHeight * dpr));
        if (source.width !== sourceWidth || source.height !== sourceHeight) {
          source.width = sourceWidth;
          source.height = sourceHeight;
        }
        paintable.requestPaint();
      }
      cellsDirty = true;
    }
    function syncCellGrid() {
      const dpr = output.width / Math.max(output.clientWidth, 1);
      const [cw, ch] = cellSizePx(dpr);
      const cols = Math.max(Math.ceil(output.width / cw), 1);
      const rows = Math.max(Math.ceil(output.height / ch), 1);
      if (cols === cellCols && rows === cellRows) return;
      cellCols = cols;
      cellRows = rows;
      gl.bindTexture(gl.TEXTURE_2D, cellTexture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        cols,
        rows,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        null
      );
      gl.bindFramebuffer(gl.FRAMEBUFFER, cellFbo);
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D,
        cellTexture,
        0
      );
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      cellsDirty = true;
    }
    const pointer = {
      x: -1e5,
      y: -1e5,
      tx: -1e5,
      ty: -1e5,
      active: 0,
      target: 0
    };
    let time = 0;
    let bgKey = "";
    let bg = [0, 0, 0];
    let colorKey = "";
    let fg = [0.29, 0.87, 0.5];
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reducedMotion = motionQuery.matches;
    rebuildAtlas();
    syncCanvasSize();
    function uploadContent() {
      if (!htmlInCanvas || !contentDirty) return;
      contentDirty = false;
      cellsDirty = true;
      gl.bindTexture(gl.TEXTURE_2D, contentTexture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        source
      );
    }
    function renderCells() {
      if (!cellsDirty) return;
      cellsDirty = false;
      const dpr = output.width / Math.max(output.clientWidth, 1);
      const [cw, ch] = cellSizePx(dpr);
      const u = cellPass.uniforms;
      gl.useProgram(cellPass.program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, contentTexture);
      gl.uniform1i(u.uContent, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, shapeTexture);
      gl.uniform1i(u.uShapes, 1);
      gl.uniform2f(u.uContentRes, output.width, output.height);
      gl.uniform2f(u.uCellPx, cw, ch);
      gl.uniform1i(u.uGlyphCount, glyphCount);
      gl.uniform1f(u.uContrast, Math.min(Math.max(config.contrast, 0.3), 3));
      gl.uniform1f(u.uExposure, Math.min(Math.max(config.exposure, 0.2), 3));
      gl.uniform1f(u.uThreshold, Math.max(config.threshold, 5e-3));
      gl.uniform3f(u.uBg, bg[0], bg[1], bg[2]);
      gl.bindFramebuffer(gl.FRAMEBUFFER, cellFbo);
      gl.viewport(0, 0, cellCols, cellRows);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    function render() {
      uploadContent();
      if (config.background !== bgKey) {
        bgKey = config.background;
        bg = parseColor(config.background);
        cellsDirty = true;
      }
      if (config.color !== colorKey) {
        colorKey = config.color;
        fg = parseColor(config.color);
      }
      rebuildAtlas();
      syncCellGrid();
      renderCells();
      const w = Math.max(output.clientWidth, 1);
      const h = Math.max(output.clientHeight, 1);
      const dpr = output.width / w;
      const [cw, ch] = cellSizePx(dpr);
      const u = mainPass.uniforms;
      gl.useProgram(mainPass.program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, contentTexture);
      gl.uniform1i(u.uContent, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, cellTexture);
      gl.uniform1i(u.uCells, 1);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, atlasTexture);
      gl.uniform1i(u.uAtlas, 2);
      gl.uniform2f(u.uRes, w, h);
      gl.uniform1f(u.uDpr, dpr);
      gl.uniform2f(u.uCellPx, cw, ch);
      gl.uniform2f(u.uGrid, cellCols, cellRows);
      gl.uniform2f(u.uAtlasGrid, atlasCols, atlasRows);
      gl.uniform2f(u.uAtlasPad, atlasPad[0], atlasPad[1]);
      gl.uniform2f(u.uAtlasInner, atlasInner[0], atlasInner[1]);
      gl.uniform1i(u.uGlyphCount, glyphCount);
      gl.uniform2f(u.uPointer, pointer.x, pointer.y);
      gl.uniform1f(u.uActive, pointer.active);
      gl.uniform1f(u.uRadius, Math.max(config.radius, 1));
      gl.uniform1f(u.uSoftness, config.softness);
      gl.uniform1f(u.uColored, config.colored);
      gl.uniform3f(u.uColor, fg[0], fg[1], fg[2]);
      gl.uniform1f(u.uBrightness, Math.min(Math.max(config.brightness, 0.2), 3));
      gl.uniform1f(u.uLegibility, Math.min(Math.max(config.legibility, 0), 1));
      gl.uniform1f(u.uScramble, Math.min(Math.max(config.scramble, 0), 1));
      gl.uniform1f(
        u.uScrambleSpeed,
        Math.min(Math.max(config.scrambleSpeed, 0), 30)
      );
      gl.uniform1f(u.uEdgeWidth, config.edgeWidth);
      gl.uniform1f(u.uEdgeFlicker, Math.min(Math.max(config.edgeFlicker, 0), 1));
      gl.uniform1f(u.uEdgeGlow, Math.min(Math.max(config.edgeGlow, 0), 3));
      gl.uniform1f(u.uEdgeTint, config.edgeTint);
      gl.uniform1f(u.uAberration, Math.max(config.aberration, 0));
      gl.uniform1f(u.uPassthrough, config.passthrough);
      gl.uniform3f(u.uBg, bg[0], bg[1], bg[2]);
      gl.uniform1f(u.uTime, time);
      gl.uniform1f(u.uMaxX, contentMaxX);
      gl.uniform1f(u.uCrisp, reducedMotion || !htmlInCanvas ? 1 : 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, output.width, output.height);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    let raf = 0;
    let lastTime = performance.now();
    let destroyed = false;
    let running = false;
    let visible = true;
    function frame(now) {
      if (destroyed) return;
      if (!visible) {
        running = false;
        return;
      }
      const delta = Math.min((now - lastTime) / 1e3, 1 / 30);
      lastTime = now;
      time += delta;
      const tau = Math.max(config.smoothing, 1e-4);
      const k = reducedMotion ? 1 : 1 - Math.exp(-delta / tau);
      pointer.x += (pointer.tx - pointer.x) * k;
      pointer.y += (pointer.ty - pointer.y) * k;
      pointer.active += (pointer.target - pointer.active) * k;
      render();
      const settled = Math.abs(pointer.tx - pointer.x) < 0.1 && Math.abs(pointer.ty - pointer.y) < 0.1 && Math.abs(pointer.target - pointer.active) < 1e-3;
      const churning = config.scramble > 0 && config.scrambleSpeed > 0 || pointer.active > 1e-3 && config.edgeFlicker > 0;
      if (settled && !contentDirty && (reducedMotion || !htmlInCanvas || !churning)) {
        pointer.x = pointer.tx;
        pointer.y = pointer.ty;
        pointer.active = pointer.target;
        running = false;
        return;
      }
      raf = requestAnimationFrame(frame);
    }
    function start() {
      if (destroyed || running || !visible) return;
      running = true;
      lastTime = performance.now();
      raf = requestAnimationFrame(frame);
    }
    wake = start;
    start();
    function onMotionChange() {
      reducedMotion = motionQuery.matches;
      start();
    }
    motionQuery.addEventListener("change", onMotionChange);
    const observer = createCanvasResizeObserver(() => {
      syncCanvasSize();
      start();
    });
    observer.observe(output);
    observer.observe(content);
    const intersection = new IntersectionObserver((entries) => {
      visible = entries[entries.length - 1]?.isIntersecting ?? true;
      if (visible) start();
    });
    intersection.observe(output);
    const listenTarget = output.parentElement ?? output;
    const rectCache = createRectCache(output);
    function onPointerMove(event) {
      const rect = rectCache.current;
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      if (pointer.target === 0 && pointer.active < 1e-3) {
        pointer.x = x;
        pointer.y = y;
      }
      pointer.tx = x;
      pointer.ty = y;
      pointer.target = 1;
      start();
    }
    function onPointerLeave() {
      pointer.target = 0;
      start();
    }
    listenTarget.addEventListener("pointermove", onPointerMove, { passive: true });
    listenTarget.addEventListener("pointerleave", onPointerLeave, { passive: true });
    return {
      setOptions(next) {
        let changed = false;
        for (const [key, value] of Object.entries(next)) {
          if (typeof value === "function") continue;
          if (config[key] !== value) {
            changed = true;
            break;
          }
        }
        if (!changed) {
          Object.assign(config, next);
          return;
        }
        const prev = {
          cell: config.cell,
          aspect: config.aspect,
          contrast: config.contrast,
          exposure: config.exposure,
          threshold: config.threshold
        };
        Object.assign(config, next);
        if (config.cell !== prev.cell || config.aspect !== prev.aspect || config.contrast !== prev.contrast || config.exposure !== prev.exposure || config.threshold !== prev.threshold) {
          cellsDirty = true;
        }
        start();
      },
      resize() {
        syncCanvasSize();
        start();
      },
      destroy() {
        destroyed = true;
        rectCache.destroy();
        cancelAnimationFrame(raf);
        observer.disconnect();
        intersection.disconnect();
        motionQuery.removeEventListener("change", onMotionChange);
        listenTarget.removeEventListener("pointermove", onPointerMove);
        listenTarget.removeEventListener("pointerleave", onPointerLeave);
        gl.deleteTexture(contentTexture);
        gl.deleteTexture(cellTexture);
        gl.deleteTexture(shapeTexture);
        gl.deleteTexture(atlasTexture);
        gl.deleteFramebuffer(cellFbo);
        gl.deleteProgram(cellPass.program);
        gl.deleteShader(cellPass.vs);
        gl.deleteShader(cellPass.fs);
        gl.deleteProgram(mainPass.program);
        gl.deleteShader(mainPass.vs);
        gl.deleteShader(mainPass.fs);
        gl.deleteBuffer(quad);
        if (htmlInCanvas) paintable.onpaint = null;
      }
    };
  }

  // src/effects/decrypt-reveal.js
  var CONTROLS8 = {
    radius: scrub("Radius", 400, { min: 60, max: 900, step: 10, decimals: 0 }),
    softness: scrub("Softness", 0.5, { min: 0.05, max: 1, step: 0.05 }),
    cell: scrub("Cell size", 10, { min: 6, max: 32, step: 1, decimals: 0 }),
    aspect: scrub("Cell aspect", 0.75, { min: 0.35, max: 1.25, step: 0.05 }),
    colored: scrub("Colored", 1, { min: 0, max: 1, step: 0.05 }),
    brightness: scrub("Brightness", 1, { min: 0.2, max: 3, step: 0.05 }),
    legibility: scrub("Legibility", 1, { min: 0, max: 1, step: 0.05 }),
    contrast: scrub("Contrast", 1, { min: 0.3, max: 3, step: 0.05 }),
    exposure: scrub("Exposure", 1, { min: 0.2, max: 3, step: 0.05 }),
    scramble: scrub("Scramble", 0.1, { min: 0, max: 1, step: 0.02 }),
    scrambleSpeed: scrub("Scramble speed", 6, {
      min: 0,
      max: 30,
      step: 0.5,
      decimals: 1
    }),
    edgeWidth: scrub("Edge width", 0.2, { min: 0, max: 1, step: 0.02 }),
    edgeFlicker: scrub("Edge flicker", 1, { min: 0, max: 1, step: 0.02 }),
    edgeGlow: scrub("Edge glow", 2, { min: 0, max: 3, step: 0.05 }),
    edgeTint: scrub("Edge tint", 0.75, { min: 0, max: 1, step: 0.02 }),
    aberration: scrub("Aberration", 10, { min: 0, max: 24, step: 0.5 }),
    passthrough: scrub("Passthrough", 0.15, { min: 0, max: 1, step: 0.02 }),
    threshold: scrub("Threshold", 0.025, { min: 5e-3, max: 0.3, step: 5e-3 }),
    smoothing: scrub("Smoothing", 0.2, { min: 0, max: 1, step: 0.05 }),
    color: color("Cipher color", "#4ade80")
  };
  var decrypt_reveal_default = {
    slug: "decrypt-reveal",
    name: "Decrypt Reveal",
    component: "DecryptReveal",
    description: "UI encrypted into ASCII, decoded by the cursor.",
    controls: CONTROLS8,
    toOptions(values, ctx) {
      return {
        ...values,
        background: ctx.background
      };
    },
    create: createDecryptReveal
  };

  // src/vendor/lib/Displacement/DisplacementVanilla.ts
  var DEFAULTS9 = {
    grid: 50,
    cellAspect: 1,
    radius: 0.1,
    strength: 0.1,
    threshold: 1e3,
    relaxation: 0.9,
    shift: 1,
    aberration: 1.5,
    grain: 0.1,
    grainSize: 1,
    grainSpeed: 1,
    scramble: 1
  };
  var VERT8 = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPos;
out vec2 vUv;
void main () {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;
  var FRAG6 = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uContent;
uniform sampler2D uField;
uniform vec2 uResolution;
uniform float uShift;
uniform float uAberration;
uniform float uGrain;
uniform float uGrainPx;
uniform float uGrainTick;

float hash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}

void main () {
  vec2 cuv = vec2(vUv.x, 1.0 - vUv.y);
  vec2 offset = texture(uField, cuv).rg;
  vec2 push = offset * 0.02 * uShift;
  float ab = uAberration * 0.08;
  vec2 lo = vec2(0.001);
  vec2 hi = vec2(0.999);
  vec4 cr = texture(uContent, clamp(cuv - push * (1.0 + ab), lo, hi));
  vec4 cg = texture(uContent, clamp(cuv - push, lo, hi));
  vec4 cb = texture(uContent, clamp(cuv - push * (1.0 - ab), lo, hi));
  float alpha = (cr.a + cg.a + cb.a) / 3.0;
  vec3 col = vec3(cr.r * cr.a, cg.g * cg.a, cb.b * cb.a);
  col = min(col, vec3(alpha));
  float pushPx = length(push * uResolution);
  float gate = smoothstep(1.5, 18.0, pushPx);
  vec2 cell = floor(gl_FragCoord.xy / max(uGrainPx, 1.0));
  float gn = hash(cell + vec2(uGrainTick * 0.37, uGrainTick * 0.113));
  col += (gn - 0.5) * 0.3 * uGrain * gate * alpha;
  col = clamp(col, vec3(0.0), vec3(alpha));
  outColor = vec4(col, alpha);
}`;
  function createDisplacement(elements, options = {}) {
    const config = { ...DEFAULTS9, ...options };
    const { source, content, output } = elements;
    const gl = output.getContext("webgl2", {
      alpha: true,
      depth: false,
      stencil: false,
      antialias: false,
      premultipliedAlpha: true
    });
    if (!gl || gl.isContextLost()) return null;
    const sourceCtx = source.getContext("2d");
    const paintable = source;
    const htmlInCanvas = Boolean(
      sourceCtx && typeof sourceCtx.drawElementImage === "function" && typeof paintable.requestPaint === "function"
    );
    if (htmlInCanvas) prepareHtmlInCanvas(source, content);
    let contentDirty = false;
    let wake = () => {
    };
    if (htmlInCanvas) {
      paintable.onpaint = () => {
        try {
          sourceCtx.reset();
          drawHtmlInCanvas(source, sourceCtx, content);
          contentDirty = true;
          wake();
        } catch {
        }
      };
    }
    function compile(type, text) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, text);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error("Displacement shader error:", gl.getShaderInfoLog(shader));
      }
      return shader;
    }
    const vertexShader = compile(gl.VERTEX_SHADER, VERT8);
    const fragmentShader = compile(gl.FRAGMENT_SHADER, FRAG6);
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    const uniforms = {};
    const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < count; i++) {
      const info = gl.getActiveUniform(program, i);
      uniforms[info.name] = gl.getUniformLocation(program, info.name);
    }
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const contentTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, contentTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([0, 0, 0, 0])
    );
    const fieldTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, fieldTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reducedMotion = motionQuery.matches;
    let cols = 0;
    let rows = 0;
    let rowScale = 1;
    let outW = 1;
    let outH = 1;
    let scrambled = false;
    let field = new Float32Array(0);
    let fieldDirty = false;
    function syncGrid() {
      const nextCols = Math.round(Math.min(Math.max(config.grid, 4), 100));
      const aspect = Math.min(Math.max(config.cellAspect, 0.25), 4);
      const nextRows = Math.max(
        2,
        Math.min(Math.round(nextCols * outH * aspect / outW), 200)
      );
      if (nextCols === cols && nextRows === rows) {
        rowScale = outH * cols / (outW * rows);
        return;
      }
      cols = nextCols;
      rows = nextRows;
      rowScale = outH * cols / (outW * rows);
      field = new Float32Array(cols * rows * 2);
      if (!scrambled && !reducedMotion && config.scramble > 0) {
        const amp = 40 * Math.min(config.scramble, 3);
        for (let i = 0; i < field.length; i++) {
          field[i] = (Math.random() * 2 - 1) * amp;
        }
      }
      scrambled = true;
      gl.bindTexture(gl.TEXTURE_2D, fieldTexture);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RG32F,
        cols,
        rows,
        0,
        gl.RG,
        gl.FLOAT,
        field
      );
      fieldDirty = false;
    }
    let dpr = 1;
    function syncCanvasSize() {
      dpr = getCanvasPixelRatio(output, gl);
      outW = Math.max(1, output.clientWidth);
      outH = Math.max(1, output.clientHeight);
      const width = Math.max(1, Math.round(outW * dpr));
      const height = Math.max(1, Math.round(outH * dpr));
      if (output.width !== width || output.height !== height) {
        output.width = width;
        output.height = height;
      }
      if (htmlInCanvas) {
        const sourceWidth = Math.max(1, Math.round(source.clientWidth * dpr));
        const sourceHeight = Math.max(1, Math.round(source.clientHeight * dpr));
        if (source.width !== sourceWidth || source.height !== sourceHeight) {
          source.width = sourceWidth;
          source.height = sourceHeight;
        }
        paintable.requestPaint();
      }
      syncGrid();
    }
    syncCanvasSize();
    function uploadContent() {
      if (!htmlInCanvas || !contentDirty) return;
      contentDirty = false;
      gl.bindTexture(gl.TEXTURE_2D, contentTexture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        source
      );
      sourceCtx.clearRect(0, 0, source.width, source.height);
    }
    function uploadField() {
      if (!fieldDirty) return;
      fieldDirty = false;
      gl.bindTexture(gl.TEXTURE_2D, fieldTexture);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,
        0,
        0,
        cols,
        rows,
        gl.RG,
        gl.FLOAT,
        field
      );
    }
    const mouse = {
      x: 0,
      y: 0,
      prevX: 0,
      prevY: 0,
      vX: 0,
      vY: 0,
      speed: 0,
      gate: 0,
      lastT: 0
    };
    let tracking = false;
    function stepSimulation(delta) {
      const relaxation = Math.min(Math.max(config.relaxation, 0.5), 0.995);
      const decay = Math.pow(relaxation, delta * 60);
      let maxAbs = 0;
      for (let i = 0; i < field.length; i++) {
        const value = field[i] * decay;
        field[i] = value;
        const abs = Math.abs(value);
        if (abs > maxAbs) maxAbs = abs;
      }
      const injecting = tracking && (mouse.vX !== 0 || mouse.vY !== 0);
      if (injecting) {
        const gridX = mouse.x * cols;
        const gridY = mouse.y * rows;
        const maxDist = cols * Math.min(Math.max(config.radius, 0.02), 1);
        const maxSq = maxDist * maxDist;
        const gain = Math.min(Math.max(config.strength, 0), 1) * 100 * mouse.gate;
        for (let j = 0; j < rows; j++) {
          const dy = (gridY - j) * rowScale;
          for (let i = 0; i < cols; i++) {
            const dx = gridX - i;
            const distSq = dx * dx + dy * dy;
            if (distSq < maxSq) {
              const power = Math.min(maxDist / Math.sqrt(distSq), 10);
              const idx = 2 * (i + cols * j);
              field[idx] += gain * mouse.vX * power;
              field[idx + 1] += gain * mouse.vY * power;
            }
          }
        }
      }
      const vDecay = Math.pow(0.9, delta * 60);
      mouse.vX *= vDecay;
      mouse.vY *= vDecay;
      if (Math.abs(mouse.vX) < 1e-4) mouse.vX = 0;
      if (Math.abs(mouse.vY) < 1e-4) mouse.vY = 0;
      fieldDirty = true;
      const alive = injecting || mouse.vX !== 0 || mouse.vY !== 0 || maxAbs > 0.03;
      if (!alive && maxAbs > 0) field.fill(0);
      return alive;
    }
    let time = 0;
    function render() {
      uploadContent();
      uploadField();
      gl.useProgram(program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, contentTexture);
      gl.uniform1i(uniforms.uContent, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, fieldTexture);
      gl.uniform1i(uniforms.uField, 1);
      gl.uniform2f(uniforms.uResolution, output.width, output.height);
      gl.uniform1f(uniforms.uShift, Math.min(Math.max(config.shift, 0), 4));
      gl.uniform1f(
        uniforms.uAberration,
        Math.min(Math.max(config.aberration, 0), 3)
      );
      gl.uniform1f(uniforms.uGrain, Math.min(Math.max(config.grain, 0), 1));
      gl.uniform1f(
        uniforms.uGrainPx,
        Math.max(1, Math.min(Math.max(config.grainSize, 0.5), 4) * dpr * 1.5)
      );
      gl.uniform1f(
        uniforms.uGrainTick,
        Math.floor(time * Math.min(Math.max(config.grainSpeed, 0), 4) * 18)
      );
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, output.width, output.height);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    let raf = 0;
    let lastTime = performance.now();
    let destroyed = false;
    let running = false;
    let visible = true;
    function frame(now) {
      if (destroyed) return;
      if (!visible) {
        running = false;
        return;
      }
      const delta = Math.min((now - lastTime) / 1e3, 1 / 30);
      lastTime = now;
      time += delta;
      let alive = false;
      if (!reducedMotion) alive = stepSimulation(delta);
      render();
      if (!alive && !contentDirty) {
        running = false;
        return;
      }
      raf = requestAnimationFrame(frame);
    }
    function start() {
      if (destroyed || running || !visible) return;
      running = true;
      lastTime = performance.now();
      raf = requestAnimationFrame(frame);
    }
    wake = start;
    start();
    function onMotionChange() {
      reducedMotion = motionQuery.matches;
      if (reducedMotion) {
        field.fill(0);
        mouse.vX = 0;
        mouse.vY = 0;
        fieldDirty = true;
      }
      start();
    }
    motionQuery.addEventListener("change", onMotionChange);
    const pointerHost = output.parentElement ?? output;
    const rectCache = createRectCache(output);
    function onPointerMove(event) {
      if (reducedMotion) return;
      const box = rectCache.current;
      if (box.width < 1 || box.height < 1) return;
      const x = (event.clientX - box.left) / box.width;
      const y = (event.clientY - box.top) / box.height;
      const now = performance.now();
      if (!tracking) {
        tracking = true;
        mouse.prevX = x;
        mouse.prevY = y;
        mouse.speed = 0;
        mouse.gate = 0;
        mouse.lastT = now;
      }
      mouse.vX = x - mouse.prevX;
      mouse.vY = y - mouse.prevY;
      const dt = Math.max((now - mouse.lastT) / 1e3, 1e-3);
      mouse.lastT = now;
      const distPx = Math.hypot(mouse.vX * box.width, mouse.vY * box.height);
      const instSpeed = distPx / dt;
      mouse.speed += (instSpeed - mouse.speed) * Math.min(dt * 25, 1);
      const threshold = Math.max(config.threshold, 0);
      if (threshold <= 0) {
        mouse.gate = 1;
      } else {
        const ramp = (mouse.speed - threshold) / threshold;
        const step = Math.min(Math.max(ramp, 0), 1);
        mouse.gate = step * step * (3 - 2 * step);
      }
      mouse.prevX = x;
      mouse.prevY = y;
      mouse.x = x;
      mouse.y = y;
      start();
    }
    function onPointerLeave() {
      tracking = false;
      mouse.vX = 0;
      mouse.vY = 0;
      mouse.speed = 0;
      mouse.gate = 0;
    }
    pointerHost.addEventListener("pointermove", onPointerMove, { passive: true });
    pointerHost.addEventListener("pointerleave", onPointerLeave, { passive: true });
    pointerHost.addEventListener("pointercancel", onPointerLeave, { passive: true });
    const observer = createCanvasResizeObserver(() => {
      syncCanvasSize();
      start();
    });
    observer.observe(output);
    observer.observe(content);
    const intersection = new IntersectionObserver((entries) => {
      visible = entries[entries.length - 1]?.isIntersecting ?? true;
      if (visible) start();
    });
    intersection.observe(output);
    return {
      setOptions(next) {
        let changed = false;
        for (const [key, value] of Object.entries(next)) {
          const prev = config[key];
          if (prev !== value) {
            changed = true;
            break;
          }
        }
        Object.assign(config, next);
        if (!changed) return;
        syncGrid();
        syncCanvasSize();
        start();
      },
      resize() {
        syncCanvasSize();
        start();
      },
      destroy() {
        destroyed = true;
        rectCache.destroy();
        cancelAnimationFrame(raf);
        observer.disconnect();
        intersection.disconnect();
        motionQuery.removeEventListener("change", onMotionChange);
        pointerHost.removeEventListener("pointermove", onPointerMove);
        pointerHost.removeEventListener("pointerleave", onPointerLeave);
        pointerHost.removeEventListener("pointercancel", onPointerLeave);
        gl.deleteTexture(contentTexture);
        gl.deleteTexture(fieldTexture);
        gl.deleteProgram(program);
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
        gl.deleteBuffer(quad);
        if (htmlInCanvas) paintable.onpaint = null;
      }
    };
  }

  // src/effects/displacement.js
  var CONTROLS9 = {
    grid: scrub("Grid cells", 50, { min: 4, max: 60, step: 1, decimals: 0 }),
    cellAspect: scrub("Cell aspect", 1, { min: 0.25, max: 4, step: 0.05 }),
    radius: scrub("Radius", 0.1, { min: 0.02, max: 0.6, step: 0.01 }),
    strength: scrub("Strength", 0.1, { min: 0, max: 1, step: 0.01 }),
    threshold: scrub("Speed threshold", 1e3, {
      min: 0,
      max: 3e3,
      step: 50,
      decimals: 0
    }),
    relaxation: scrub("Relaxation", 0.9, { min: 0.5, max: 0.99, step: 5e-3 }),
    shift: scrub("Shift", 1, { min: 0, max: 4, step: 0.05 }),
    aberration: scrub("Color fringe", 1.5, { min: 0, max: 3, step: 0.05 }),
    grain: scrub("Grain", 0.1, { min: 0, max: 1, step: 0.05 }),
    grainSize: scrub("Grain size", 1, { min: 0.5, max: 4, step: 0.1 }),
    grainSpeed: scrub("Grain speed", 1, { min: 0, max: 4, step: 0.1 }),
    scramble: scrub("Scramble", 1, { min: 0, max: 3, step: 0.1 })
  };
  var displacement_default = {
    slug: "displacement",
    name: "Displacement",
    component: "Displacement",
    description: "Grid cells shearing the page apart under the cursor.",
    controls: CONTROLS9,
    toOptions(values) {
      return { ...values };
    },
    create: createDisplacement
  };

  // src/vendor/lib/Droplets/DropletsVanilla.ts
  var DEFAULTS10 = {
    intensity: 0.5,
    speed: 1,
    scale: 0.4,
    dropWidth: 1,
    dropLength: 1,
    refraction: 0.2,
    blur: 0,
    vignette: 0,
    fallSpeed: 1,
    wiggle: 1,
    staticDrops: 0.2,
    interactive: true,
    interactionRadius: 0.3,
    interactionStrength: 0.6,
    interactionDistortion: 3,
    tint: [1, 1, 1],
    tintStrength: 0
  };
  var VERT9 = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPos;
out vec2 vUv;
void main () {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;
  var FRAG7 = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uContent;
uniform vec2 uResolution;
uniform vec2 uOffset;
uniform float uTime;
uniform float uIntensity;
uniform float uScale;
uniform float uDropWidth;
uniform float uDropLength;
uniform float uRefraction;
uniform float uBlur;
uniform float uVignette;
uniform float uFallSpeed;
uniform float uWiggle;
uniform float uStaticDrops;
uniform float uMaxX;
uniform sampler2D uTrail;
uniform float uWipe;
uniform float uWipeDistort;
uniform vec3 uTint;
uniform float uTintStrength;
uniform float uHasContent;

#define S(a, b, t) smoothstep(a, b, t)

vec3 N13 (float p) {
  vec3 p3 = fract(vec3(p) * vec3(0.1031, 0.11369, 0.13787));
  p3 += dot(p3, p3.yzx + 19.19);
  return fract(vec3(
    (p3.x + p3.y) * p3.z,
    (p3.x + p3.z) * p3.y,
    (p3.y + p3.z) * p3.x
  ));
}

float N (float t) {
  return fract(sin(t * 12345.564) * 7658.76);
}

float Saw (float b, float t) {
  return S(0.0, b, t) * S(1.0, b, t);
}

float sdEgg (vec2 p, float ra, float rb) {
  const float k = 1.7320508;
  p.x = abs(p.x);
  float r = ra - rb;
  return ((p.y < 0.0) ? length(vec2(p.x, p.y)) - r :
          (k * (p.x + r) < p.y) ? length(vec2(p.x, p.y - k * r)) :
          length(vec2(p.x + r, p.y)) - 2.0 * r) - rb;
}

vec2 DropLayer (vec2 uv, float t) {
  vec2 UV = uv;
  vec2 a = vec2(6.0, 1.0);
  vec2 grid = a * 2.0;

  vec2 id = floor(uv * grid);
  float gridFall = N(id.x) / 3.0 + 0.5;
  uv.y += t * gridFall / a.y;
  id = floor(uv * grid);
  uv.y += N(id.x);

  id = floor(uv * grid);
  vec2 st = fract(uv * grid) - vec2(0.5, 0.0);
  vec3 n = N13(id.x * 35.2 + id.y * 2376.1);

  float x = n.x - 0.5;
  float lambda = UV.y * 20.0;
  float wiggle = sin(lambda + sin(lambda));
  x += wiggle * (0.5 - abs(x)) * (n.z - 0.5) * uWiggle;
  x *= 0.6;

  float slowStart = 0.85;
  float ti = fract(t * (gridFall + 0.1) + n.z);
  float y = (Saw(slowStart, ti) - 0.5) * 0.9 + 0.5;
  vec2 p = vec2(x, y);

  float dropShape = (ti > slowStart)
    ? -sin(6.2831853 * ti / (1.0 - slowStart)) * 0.5 - 0.5
    : 0.0;
  float d = sdEgg((st - p) * a.yx / vec2(uDropWidth, uDropLength), 0.0, dropShape);
  float diameter = N(id.x + id.y) / 7.0 + 0.2;
  float mainDrop = S(diameter / 1.5, 0.0, d);

  float r2 = S(1.0, y, st.y);
  float r = sqrt(r2);
  float cd = abs(st.x - x);
  float thickness = diameter * 0.95 * uDropWidth;
  float trail = S(thickness * r, 0.0, cd);
  float trailFront = S(-0.02, 0.02, st.y - y);
  trail *= r2 * trailFront * 0.5;

  y = UV.y;
  float trail2 = S((thickness - 0.15) * r, 0.0, cd);
  trail2 *= trailFront * n.z;
  float rndX = N(id.x) / 1.5 + 0.5;
  float rndY = N(st.y) / 40.0 + 0.05;
  y = fract(y * 11.0 * rndX) + (st.y - 0.5);
  float dd = length(st - vec2(x, y));
  float droplets = S(trail2 + rndY, 0.0, dd);

  float m = mainDrop + droplets * r * trailFront;
  return vec2(m, trail);
}

float StaticDrops (vec2 uv, float t) {
  uv *= 40.0;

  vec2 id = floor(uv);
  vec3 n = N13(id.x * 107.45 + id.y * 3543.654);
  vec2 p = (n.xy - 0.5) * 0.6;
  uv = fract(uv) - 0.5;

  float d = length(uv - p);
  float drop = S(0.3 * clamp(uDropWidth, 0.4, 1.4), 0.0, d);

  float fade = Saw(0.1, fract(t + n.y));
  float intensity = fract(n.x * 27.0);
  return drop * fade * intensity;
}

vec2 Drops (vec2 uv, float t, float tFall, float l0, float l1, float l2, float wipe) {
  float s = StaticDrops(uv, t) * l0 * (1.0 - wipe);
  vec2 m1 = DropLayer(uv, tFall) * (l1 * (1.0 - wipe * 0.8));
  vec2 m2 = DropLayer(uv * 1.85, tFall) * (l2 * (1.0 - wipe * 0.8));

  float c = s + m1.x + m2.x;
  c = S(0.3, 1.0, c);

  return vec2(c, m1.y + m2.y);
}

void main () {
  vec2 uv = vUv;

  if (uv.x > uMaxX) {
    outColor = vec4(0.0);
    return;
  }

  vec2 aspectUv = (uv + uOffset - 0.5) * vec2(uResolution.x / uResolution.y, 1.0);
  float t = uTime * 0.2;
  float dropScale = clamp(min(uResolution.x, uResolution.y) / 900.0, 0.75, 1.35) * uScale;
  vec2 scaledUv = aspectUv * dropScale;

  float rainAmount = clamp(uIntensity, 0.0, 1.25);

  float staticDrops = S(-0.5, 1.0, rainAmount) * 2.0 * uStaticDrops;
  float layer1 = S(0.25, 0.75, rainAmount);
  float layer2 = S(0.0, 0.5, rainAmount);
  float tFall = t * uFallSpeed;

  float wipeMask = texture(uTrail, uv).r;
  float wipe = wipeMask * clamp(uWipe, 0.0, 1.0);

  vec2 c = Drops(scaledUv, t, tFall, staticDrops, layer1, layer2, wipe);

  vec2 e = vec2(0.001, 0.0);
  float cx = Drops(scaledUv + e, t, tFall, staticDrops, layer1, layer2, wipe).x;
  float cy = Drops(scaledUv + e.yx, t, tFall, staticDrops, layer1, layer2, wipe).x;
  vec2 normal = vec2(cx - c.x, cy - c.x);

  vec2 e2 = vec2(0.012, 0.0);
  float wx = texture(uTrail, uv + e2).r;
  float wy = texture(uTrail, uv + e2.yx).r;
  normal += vec2(wipeMask - wx, wipeMask - wy) * 0.05 * uWipeDistort * clamp(uWipe, 0.0, 1.0);

  vec2 refractedUv = clamp(uv + normal * uRefraction, vec2(0.001), vec2(uMaxX - 0.004, 0.999));
  float fog = clamp(uBlur, 0.0, 8.0) * mix(0.7, 1.0, rainAmount);
  float back = fog * (1.0 - clamp(c.y * 2.0, 0.0, 1.0)) * (1.0 - wipe);
  float focus = mix(back, 0.0, S(0.1, 0.2, c.x));

  if (uHasContent < 0.5) {
    float mask = S(0.02, 0.14, c.x);
    vec3 n3 = normalize(vec3(normal * 42.0, 1.0));
    vec3 L = normalize(vec3(-0.35, 0.75, 0.55));
    float spec = pow(max(dot(reflect(vec3(0.0, 0.0, -1.0), n3), L), 0.0), 34.0);
    float rim = clamp(length(normal) * 26.0, 0.0, 1.0);
    vec3 dropCol = mix(vec3(0.72), uTint, clamp(uTintStrength, 0.0, 1.0));
    vec3 colF = dropCol * (0.12 + 0.5 * rim) + vec3(spec);
    float alphaF = mask * clamp(0.1 + rim * 0.5 + spec * 0.9, 0.0, 1.0);
    outColor = vec4(clamp(colF, 0.0, 1.0) * alphaF, alphaF);
    return;
  }

  vec4 content = textureLod(uContent, vec2(refractedUv.x, 1.0 - refractedUv.y), focus);
  vec3 col = content.rgb;

  col = mix(col, uTint, clamp(uTintStrength, 0.0, 1.0) * 0.35);

  vec2 vignetteUv = uv - 0.5;
  col *= 1.0 - dot(vignetteUv, vignetteUv) * clamp(uVignette, 0.0, 1.0) * 2.0;

  outColor = vec4(col * content.a, content.a);
}`;
  var TRAIL_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uPrev;
uniform vec2 uFrom;
uniform vec2 uTo;
uniform float uAspect;
uniform float uRadius;
uniform float uDecay;
uniform float uDrain;
uniform float uSplat;

float capsule (vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  return length(pa - ba * h);
}

void main () {
  float prev = max(texture(uPrev, vUv).r * uDecay - uDrain, 0.0);
  vec2 p = vec2(vUv.x * uAspect, vUv.y);
  vec2 a = vec2(uFrom.x * uAspect, uFrom.y);
  vec2 b = vec2(uTo.x * uAspect, uTo.y);
  float d = capsule(p, a, b);
  float m = smoothstep(uRadius, uRadius * 0.5, d) * uSplat;
  outColor = vec4(max(prev, m), 0.0, 0.0, 1.0);
}`;
  function createDroplets(elements, options = {}) {
    const config = { ...DEFAULTS10, ...options };
    const { source, content, output } = elements;
    const gl = output.getContext("webgl2", {
      alpha: true,
      depth: false,
      stencil: false,
      antialias: false,
      premultipliedAlpha: true
    });
    if (!gl || gl.isContextLost()) return null;
    const sourceCtx = source.getContext("2d");
    const paintable = source;
    const htmlInCanvas = Boolean(
      sourceCtx && typeof sourceCtx.drawElementImage === "function" && typeof paintable.requestPaint === "function"
    );
    if (htmlInCanvas) prepareHtmlInCanvas(source, content);
    let contentDirty = false;
    let wake = () => {
    };
    if (htmlInCanvas) {
      paintable.onpaint = () => {
        try {
          sourceCtx.reset();
          drawHtmlInCanvas(source, sourceCtx, content);
          contentDirty = true;
          wake();
        } catch {
        }
      };
    }
    function compile(type, text) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, text);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error("Droplets shader error:", gl.getShaderInfoLog(shader));
      }
      return shader;
    }
    const vertexShader = compile(gl.VERTEX_SHADER, VERT9);
    const fragmentShader = compile(gl.FRAGMENT_SHADER, FRAG7);
    const trailShader = compile(gl.FRAGMENT_SHADER, TRAIL_FRAG);
    function link(fragment) {
      const prog = gl.createProgram();
      gl.attachShader(prog, vertexShader);
      gl.attachShader(prog, fragment);
      gl.linkProgram(prog);
      const locations = {};
      const total = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < total; i++) {
        const info = gl.getActiveUniform(prog, i);
        locations[info.name] = gl.getUniformLocation(prog, info.name);
      }
      return { program: prog, uniforms: locations };
    }
    const { program, uniforms } = link(fragmentShader);
    const { program: trailProgram, uniforms: trailUniforms } = link(trailShader);
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const contentTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, contentTexture);
    gl.texParameteri(
      gl.TEXTURE_2D,
      gl.TEXTURE_MIN_FILTER,
      gl.LINEAR_MIPMAP_LINEAR
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([0, 0, 0, 0])
    );
    gl.generateMipmap(gl.TEXTURE_2D);
    let contentMaxX = 1;
    function syncCanvasSize() {
      const dpr = getCanvasPixelRatio(output, gl);
      const width = Math.max(1, Math.round(output.clientWidth * dpr));
      const height = Math.max(1, Math.round(output.clientHeight * dpr));
      if (output.width !== width || output.height !== height) {
        output.width = width;
        output.height = height;
      }
      contentMaxX = Math.min(
        1,
        Math.max(0.05, content.clientWidth / Math.max(output.clientWidth, 1))
      );
      if (htmlInCanvas) {
        const sourceWidth = Math.max(1, Math.round(source.clientWidth * dpr));
        const sourceHeight = Math.max(1, Math.round(source.clientHeight * dpr));
        if (source.width !== sourceWidth || source.height !== sourceHeight) {
          source.width = sourceWidth;
          source.height = sourceHeight;
        }
        paintable.requestPaint();
      }
    }
    syncCanvasSize();
    let trailWidth = 0;
    let trailHeight = 0;
    const trailTextures = [];
    const trailFramebuffers = [];
    let trailIndex = 0;
    function ensureTrailTargets() {
      const width = Math.max(1, Math.round(output.width / 4));
      const height = Math.max(1, Math.round(output.height / 4));
      if (width === trailWidth && height === trailHeight && trailTextures.length)
        return;
      trailWidth = width;
      trailHeight = height;
      for (const texture of trailTextures) gl.deleteTexture(texture);
      for (const framebuffer of trailFramebuffers)
        gl.deleteFramebuffer(framebuffer);
      trailTextures.length = 0;
      trailFramebuffers.length = 0;
      for (let i = 0; i < 2; i++) {
        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          width,
          height,
          0,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          null
        );
        const framebuffer = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        gl.framebufferTexture2D(
          gl.FRAMEBUFFER,
          gl.COLOR_ATTACHMENT0,
          gl.TEXTURE_2D,
          texture,
          0
        );
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        trailTextures.push(texture);
        trailFramebuffers.push(framebuffer);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    const pointer = {
      x: 0.5,
      y: 0.5,
      px: 0.5,
      py: 0.5,
      seen: false,
      moved: false
    };
    function updateTrail(delta) {
      ensureTrailTargets();
      gl.useProgram(trailProgram);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, trailTextures[trailIndex]);
      gl.uniform1i(trailUniforms.uPrev, 0);
      gl.uniform1f(trailUniforms.uDecay, Math.exp(-delta * 0.5));
      gl.uniform1f(trailUniforms.uDrain, delta * 0.3);
      gl.uniform1f(
        trailUniforms.uAspect,
        output.width / Math.max(output.height, 1)
      );
      gl.uniform2f(trailUniforms.uFrom, pointer.px, pointer.py);
      gl.uniform2f(trailUniforms.uTo, pointer.x, pointer.y);
      gl.uniform1f(
        trailUniforms.uRadius,
        Math.max(config.interactionRadius, 0.01)
      );
      gl.uniform1f(
        trailUniforms.uSplat,
        config.interactive && pointer.moved ? 1 : 0
      );
      gl.bindFramebuffer(gl.FRAMEBUFFER, trailFramebuffers[1 - trailIndex]);
      gl.viewport(0, 0, trailWidth, trailHeight);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      trailIndex = 1 - trailIndex;
      pointer.px = pointer.x;
      pointer.py = pointer.y;
      pointer.moved = false;
    }
    function uploadContent() {
      if (!htmlInCanvas || !contentDirty) return;
      contentDirty = false;
      gl.bindTexture(gl.TEXTURE_2D, contentTexture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        source
      );
      gl.generateMipmap(gl.TEXTURE_2D);
    }
    function render(timeSec) {
      uploadContent();
      gl.useProgram(program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, contentTexture);
      gl.uniform1i(uniforms.uContent, 0);
      gl.uniform1f(uniforms.uHasContent, htmlInCanvas ? 1 : 0);
      gl.uniform2f(uniforms.uResolution, output.width, output.height);
      gl.uniform2f(
        uniforms.uOffset,
        content.scrollLeft / Math.max(content.clientWidth, 1),
        -content.scrollTop / Math.max(content.clientHeight, 1)
      );
      gl.uniform1f(uniforms.uTime, timeSec);
      gl.uniform1f(uniforms.uIntensity, config.intensity);
      gl.uniform1f(uniforms.uScale, Math.max(config.scale, 0.01));
      gl.uniform1f(uniforms.uDropWidth, Math.max(config.dropWidth, 0.05));
      gl.uniform1f(uniforms.uDropLength, Math.max(config.dropLength, 0.05));
      gl.uniform1f(uniforms.uRefraction, config.refraction);
      gl.uniform1f(uniforms.uBlur, Math.max(config.blur, 0));
      gl.uniform1f(uniforms.uVignette, config.vignette);
      gl.uniform1f(uniforms.uFallSpeed, config.fallSpeed);
      gl.uniform1f(uniforms.uWiggle, config.wiggle);
      gl.uniform1f(uniforms.uStaticDrops, config.staticDrops);
      gl.uniform1f(uniforms.uMaxX, contentMaxX);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, trailTextures[trailIndex]);
      gl.uniform1i(uniforms.uTrail, 1);
      gl.uniform1f(
        uniforms.uWipe,
        config.interactive ? Math.min(Math.max(config.interactionStrength, 0), 1) : 0
      );
      gl.uniform1f(
        uniforms.uWipeDistort,
        Math.max(config.interactionDistortion, 0)
      );
      gl.uniform3f(
        uniforms.uTint,
        config.tint[0],
        config.tint[1],
        config.tint[2]
      );
      gl.uniform1f(uniforms.uTintStrength, config.tintStrength);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, output.width, output.height);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    let raf = 0;
    let lastTime = performance.now();
    let elapsed = 0;
    let destroyed = false;
    let running = false;
    let visible = true;
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reducedMotion = motionQuery.matches;
    function frame(now) {
      if (destroyed) return;
      if (!visible) {
        running = false;
        return;
      }
      const delta = Math.min((now - lastTime) / 1e3, 1 / 30);
      lastTime = now;
      elapsed += delta * config.speed;
      updateTrail(delta);
      render(elapsed);
      if (reducedMotion && !contentDirty) {
        running = false;
        return;
      }
      raf = requestAnimationFrame(frame);
    }
    function start() {
      if (destroyed || running || !visible) return;
      running = true;
      lastTime = performance.now();
      raf = requestAnimationFrame(frame);
    }
    wake = start;
    start();
    function onMotionChange() {
      reducedMotion = motionQuery.matches;
      start();
    }
    motionQuery.addEventListener("change", onMotionChange);
    const observer = createCanvasResizeObserver(() => {
      syncCanvasSize();
      start();
    });
    observer.observe(output);
    observer.observe(content);
    const intersection = new IntersectionObserver((entries) => {
      visible = entries[entries.length - 1]?.isIntersecting ?? true;
      if (visible) start();
    });
    intersection.observe(output);
    const listenTarget = output.parentElement ?? output;
    const rectCache = createRectCache(output);
    function onPointerMove(event) {
      if (!config.interactive || reducedMotion) return;
      const rect = rectCache.current;
      const x = (event.clientX - rect.left) / Math.max(rect.width, 1);
      const y = 1 - (event.clientY - rect.top) / Math.max(rect.height, 1);
      if (!pointer.seen) {
        pointer.seen = true;
        pointer.px = x;
        pointer.py = y;
      }
      pointer.x = x;
      pointer.y = y;
      pointer.moved = true;
      start();
    }
    function onPointerLeave() {
      pointer.seen = false;
    }
    listenTarget.addEventListener("pointermove", onPointerMove, { passive: true });
    listenTarget.addEventListener("pointerleave", onPointerLeave, { passive: true });
    content.addEventListener("scroll", start, { passive: true });
    return {
      setOptions(next) {
        if (!Object.entries(next).some(
          ([key, value]) => config[key] !== value
        ))
          return;
        Object.assign(config, next);
        start();
      },
      resize() {
        syncCanvasSize();
        start();
      },
      destroy() {
        destroyed = true;
        rectCache.destroy();
        cancelAnimationFrame(raf);
        observer.disconnect();
        intersection.disconnect();
        motionQuery.removeEventListener("change", onMotionChange);
        listenTarget.removeEventListener("pointermove", onPointerMove);
        listenTarget.removeEventListener("pointerleave", onPointerLeave);
        content.removeEventListener("scroll", start);
        gl.deleteTexture(contentTexture);
        for (const texture of trailTextures) gl.deleteTexture(texture);
        for (const framebuffer of trailFramebuffers)
          gl.deleteFramebuffer(framebuffer);
        gl.deleteProgram(program);
        gl.deleteProgram(trailProgram);
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
        gl.deleteShader(trailShader);
        gl.deleteBuffer(quad);
        if (htmlInCanvas) paintable.onpaint = null;
      }
    };
  }

  // src/effects/droplets.js
  var CONTROLS10 = {
    intensity: scrub("Intensity", 0.5, { min: 0, max: 1.25, step: 0.05 }),
    speed: scrub("Speed", 1, { min: 0, max: 3, step: 0.1, decimals: 1 }),
    scale: scrub("Scale", 0.4, { min: 0.4, max: 2.5, step: 0.05 }),
    dropWidth: scrub("Drop width", 1, { min: 0.4, max: 1.5, step: 0.05 }),
    dropLength: scrub("Drop length", 1, { min: 0.4, max: 2.5, step: 0.05 }),
    refraction: scrub("Refraction", 0.2, {
      min: 0,
      max: 3,
      step: 0.1,
      decimals: 1
    }),
    blur: scrub("Blur", 0, { min: 0, max: 4, step: 0.1, decimals: 1 }),
    vignette: scrub("Vignette", 0, { min: 0, max: 1, step: 0.05 }),
    fallSpeed: scrub("Fall speed", 1, { min: 0, max: 3, step: 0.1, decimals: 1 }),
    wiggle: scrub("Wiggle", 1, { min: 0, max: 2, step: 0.1, decimals: 1 }),
    staticDrops: scrub("Static drops", 0.2, {
      min: 0,
      max: 3,
      step: 0.1,
      decimals: 1
    }),
    interactionRadius: scrub("Wipe radius", 0.3, {
      min: 0.02,
      max: 0.4,
      step: 0.01
    }),
    interactionStrength: scrub("Wipe strength", 0.6, {
      min: 0,
      max: 1,
      step: 0.05
    }),
    interactionDistortion: scrub("Wipe distort", 3, {
      min: 0,
      max: 3,
      step: 0.1,
      decimals: 1
    }),
    tintStrength: scrub("Tint strength", 0, { min: 0, max: 1, step: 0.05 }),
    tint: color("Tint", "#8fb4ff")
  };
  var droplets_default = {
    slug: "droplets",
    name: "Droplets",
    component: "Droplets",
    description: "Rain droplets refracting the page.",
    controls: CONTROLS10,
    toOptions(values) {
      const { tint, ...rest } = values;
      return {
        ...rest,
        tint: hexToRgb(tint)
      };
    },
    create: createDroplets
  };

  // src/vendor/lib/FlameWrap/FlameWrapVanilla.ts
  var DEFAULTS11 = {
    color: [0.31, 0.54, 1],
    intensity: 0.5,
    height: 170,
    spread: 8,
    radius: 40,
    speed: 0.25,
    scale: 0.75,
    turbulence: 0.5,
    turbulenceScale: 0.5,
    turbulenceReach: 25,
    sparks: 1.5,
    sparkSize: 0.35,
    sparkDensity: 1,
    sparkSpeed: 1,
    rim: 2.5,
    melt: 4.5,
    distortion: 10,
    smoke: 1.5,
    ember: 2,
    scorch: 0
  };
  var VERT10 = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPos;
out vec2 vUv;
void main () {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;
  var FRAG8 = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uContent;
uniform vec2 uResolution;
uniform float uTime;
uniform vec2 uRectCenter;
uniform vec2 uRectHalf;
uniform float uCorner;
uniform vec3 uColor;
uniform float uIntensity;
uniform float uHeight;
uniform float uSpread;
uniform float uScale;
uniform float uTurbulence;
uniform float uTurbScale;
uniform float uTurbReach;
uniform float uSparks;
uniform float uSparkSize;
uniform float uSparkDensity;
uniform float uSparkSpeed;
uniform float uRim;
uniform float uMelt;
uniform float uDistortion;
uniform float uSmoke;
uniform float uEmber;
uniform float uScorch;
uniform float uHasContent;

#define S(a, b, t) smoothstep(a, b, t)

vec3 permute (vec3 x) {
  return mod(((x * 34.0) + 1.0) * x, 289.0);
}

float snoise (vec2 v) {
  const vec4 C = vec4(
    0.211324865405187, 0.366025403784439,
    -0.577350269189626, 0.024390243902439
  );
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute(
    permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0)
  );
  vec3 m = max(
    0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)),
    0.0
  );
  m = m * m;
  m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

float fbm (vec2 p) {
  mat2 m = mat2(0.8, -0.6, 0.6, 0.8);
  float v = 0.5 * snoise(p);
  p = m * p * 2.03 + vec2(11.3, 7.1);
  v += 0.27 * snoise(p);
  p = m * p * 1.97 + vec2(3.7, 19.1);
  v += 0.15 * snoise(p);
  p = m * p * 2.01 + vec2(8.3, 2.9);
  v += 0.08 * snoise(p);
  return v * 0.5 + 0.5;
}

float fbm2 (vec2 p) {
  float v = 0.62 * snoise(p);
  v += 0.31 * snoise(mat2(0.8, -0.6, 0.6, 0.8) * p * 2.13 + vec2(5.2, 1.3));
  return v * 0.54 + 0.5;
}

vec2 turbulence (vec2 p) {
  float freq = 12.0 * clamp(uScale, 0.05, 1.0) * clamp(uTurbScale, 0.2, 3.0);
  mat2 rot = mat2(0.6, -0.8, 0.8, 0.6);
  for (float i = 0.0; i < 7.0; i++) {
    float phase = freq * (p * rot).y + 6.0 * uTime + i;
    p += uTurbulence * rot[0] * sin(phase) / freq;
    rot *= mat2(0.6, -0.8, 0.8, 0.6);
    freq *= 1.2;
  }
  return p;
}

vec3 hash3 (vec2 p) {
  vec3 q = vec3(
    dot(p, vec2(127.1, 311.7)),
    dot(p, vec2(269.5, 183.3)),
    dot(p, vec2(419.2, 371.9))
  );
  return fract(sin(q) * 43758.5453);
}

float sdRoundRect (vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

void main () {
  vec2 frag = vUv * uResolution;
  vec2 rel = frag - uRectCenter;
  float unit = max(uHeight, 24.0);
  float corner = min(uCorner, min(uRectHalf.x, uRectHalf.y));
  float spreadPx = max(uSpread, 8.0);
  float t = uTime;
  float detail = clamp(uScale, 0.05, 1.0);

  float d0 = sdRoundRect(rel, uRectHalf, corner);
  float px = rel.x / unit;
  float py = rel.y / unit;

  float yA = max(rel.y - uRectHalf.y, 0.0) / unit;
  float sway = snoise(vec2(px * 1.1, t * 0.5)) * 0.55
    + snoise(vec2(px * 2.4, t * 0.9 + 41.0)) * 0.25;
  float sx = px + yA * sway;
  float env = fbm2(vec2(sx * 1.6 * detail + 3.7, t * 0.55 - yA * 0.4));
  float env2 = fbm2(vec2(sx * 3.6 * detail, t * 0.85 + 17.0 - yA * 0.6));
  float tongue = clamp(
    0.75 * S(0.3, 0.9, env) + 0.5 * S(0.4, 0.95, env2),
    0.0,
    1.0
  );

  float meltPx = max(uMelt, 1.0);
  float biteTop = (3.0 + meltPx * 1.4) * (0.35 + 0.65 * tongue)
    + 2.0 * snoise(vec2(px * 5.0 * detail, t * 1.1 + 5.0));
  float yF = uRectHalf.y - biteTop;
  float frontTop = rel.y - yF;

  float perim = fbm2(rel * (1.9 / unit) * detail + vec2(0.0, t * 0.4) + 31.0);
  float biteSB = 3.0 + meltPx * (0.25 + 0.75 * perim);
  float frontSB = d0 + biteSB;

  float wTop = S(-0.62 * unit, -0.1 * unit, rel.y - uRectHalf.y)
    * S(10.0, -30.0, abs(rel.x) - (uRectHalf.x - corner));
  float front = mix(frontSB, frontTop, wTop);

  float reach = mix(
    spreadPx * 0.9,
    unit * (0.2 + 0.45 * tongue),
    wTop
  );
  float q = front / reach;

  vec2 np = vec2(px * 2.3, py * 1.25 - t * 1.85) * detail;
  np = turbulence(np);
  float n = fbm(np);

  float win = S(-0.08, 0.02, q);
  float root = exp(-abs(q) * 5.0);
  float ridge = 1.0 - abs(2.0 * n - 1.0);
  float flameH = mix(1.0, 0.5 + 0.6 * tongue, wTop);
  float g = max(q, 0.0) / flameH;
  float shred = fbm2(np * 1.9 + 63.0);
  g *= 1.0 + 0.7 * (shred - 0.5) * S(0.2, 0.8, g);
  float dens = n * 0.95 + ridge * 0.45 - 0.18
    + (1.0 - min(g, 1.0)) * 0.3
    - g * (0.9 + 0.25 * n);
  dens = clamp(dens * 2.4, 0.0, 1.0) * win;
  dens *= mix(1.0 - S(0.32, 1.05, q), 1.0 - S(0.9, 1.2, g), wTop);
  float body = dens * dens * (3.0 - 2.0 * dens);
  float emis = clamp(uIntensity, 0.0, 2.0);
  float e = body * (0.55 + 0.75 * root) * (0.45 + 0.55 * n)
    + win * root * (0.1 + 0.4 * n);
  e *= mix(0.45, 1.0, wTop) * max(emis, 0.001);

  vec3 hot = mix(uColor, vec3(1.0), 0.35);
  vec3 deep = mix(uColor, uColor * uColor, 0.5) * 0.9;
  float ramp = 1.0 - exp(-e * 2.4);
  vec3 fireCol = mix(deep, uColor, S(0.0, 0.55, ramp));
  float core = ramp * (0.45 + 0.55 * exp(-g * 2.2)) * (0.5 + 0.5 * n);
  fireCol = mix(fireCol, hot, S(0.7, 1.05, core));
  fireCol *= 0.8 + 0.4 * ramp;
  float fireA = clamp(1.0 - exp(-e * 3.4), 0.0, 1.0);

  float halo = exp(-max(front, 0.0) / (spreadPx * 1.2)) * S(0.0, 3.0, front)
    * (0.5 + 0.5 * n) * 0.3 * clamp(uRim, 0.0, 2.0) * mix(1.0, 0.45, wTop);
  vec3 glow = uColor * halo * clamp(uIntensity, 0.0, 2.0);

  if (uSparks > 0.001) {
    float sSpeed = max(uSparkSpeed, 0.05);
    float sCells = 5.0 * clamp(uSparkDensity, 0.3, 2.5);
    float sSize = clamp(uSparkSize, 0.2, 3.0);
    float gate = S(-0.05, 0.1, q) * (1.0 - S(1.3, 2.2, q)) * wTop;
    float spark = 0.0;
    for (float L = 0.0; L < 2.0; L++) {
      float speed = 1.5 * sSpeed * (0.75 + 0.5 * L);
      vec2 ps = vec2(px, py - t * speed);
      ps.x += 0.08 * snoise(vec2(py * 0.9 + L * 5.0, t * 0.5));
      float cells = sCells * (1.0 + 0.6 * L);
      vec2 cl = floor(ps * cells) + L * 19.0;
      vec2 fr = fract(ps * cells);
      vec3 rnd = hash3(cl);
      vec3 rnd2 = hash3(cl + 7.3);
      float on = step(rnd2.x, 0.42);
      float life = fract(rnd.z + t * sSpeed * (0.3 + 0.5 * rnd2.x));
      vec2 ppos = vec2(0.5) + 0.56 * (rnd.xy - 0.5);
      ppos.x += 0.14 * sin(t * (0.7 + rnd.z * 2.8) + rnd.y * 6.2832)
        + 0.1 * snoise(vec2(t * 0.6 + rnd.x * 9.0, cl.y * 0.7))
        + (life - 0.5) * 0.5 * (rnd2.y - 0.5);
      ppos.y += (life - 0.5) * 0.3 * rnd2.y;
      float tw = S(0.02, 0.2, life) * S(1.0, 0.55, life);
      tw *= 0.75 + 0.25 * sin(t * (6.0 + rnd2.z * 9.0) + rnd.x * 6.2832);
      vec2 pd = (fr - ppos) / cells * unit;
      pd.y *= 0.55 + 0.3 * rnd2.z;
      float dp = length(pd);
      float r = (0.004 + 0.014 * rnd.y * rnd.y) * unit * sSize
        * mix(1.15, 0.55, life);
      float bmask = S(0.5, 0.32, max(abs(fr.x - 0.5), abs(fr.y - 0.5)));
      float sbody = exp(-dp * dp / (r * r));
      float sbloom = exp(-dp * dp / (r * r * 6.0)) * 0.3;
      spark += (sbody + sbloom) * tw * tw * on * bmask * (1.0 - 0.35 * L);
    }
    spark *= gate * uSparks;
    fireCol += mix(uColor, vec3(1.0), 0.55) * spark * 1.6;
    fireA = clamp(fireA + spark * 0.85, 0.0, 1.0);
  }

  vec2 edgePx = min(frag, uResolution - frag);
  float fadeW = max(24.0, spreadPx * 0.75);
  float fade = S(0.0, fadeW, edgePx.x) * S(0.0, fadeW, edgePx.y);
  fireA *= fade;
  glow *= fade;
  halo *= fade;

  float wisp = S(0.45, 0.9, fbm2(np * 0.55 + vec2(0.0, 17.0)));
  float smoke = S(1.55, 1.05, g) * S(0.85, 1.15, g)
    * (1.0 - body) * wTop
    * wisp * 0.055 * clamp(uSmoke, 0.0, 2.0) * fade;
  vec3 smokeCol = mix(vec3(0.5), uColor, 0.5);

  if (uHasContent < 0.5) {
    float sA = clamp(smoke, 0.0, 1.0);
    float a = clamp(fireA + sA * (1.0 - fireA), 0.0, 1.0);
    outColor = vec4(
      fireCol * fireA + glow + smokeCol * sA * (1.0 - fireA),
      clamp(a + halo * 0.6, 0.0, 1.0)
    );
    return;
  }

  vec2 cUv = (rel + uRectHalf) / (2.0 * uRectHalf);
  float inRect = step(abs(cUv.x - 0.5), 0.5) * step(abs(cUv.y - 0.5), 0.5);

  float heatBand = exp(-abs(front) / max(uTurbReach, 4.0));
  vec2 wob = vec2(
    snoise(np * 1.7 + 9.0),
    snoise(np * 1.7 + 27.0)
  );
  vec2 disp = wob * min(uDistortion, 32.0) * heatBand;
  vec2 cUvD = clamp(cUv + disp / (2.0 * uRectHalf), vec2(0.002), vec2(0.998));
  vec4 content = texture(uContent, vec2(cUvD.x, 1.0 - cUvD.y));

  float burn = clamp(uIntensity, 0.0, 1.0);
  float depth = max(-front, 0.0);
  float charPatch = 0.5 + 0.5 * fbm2(rel * (2.6 / unit) * detail + 57.0);
  float charW = mix(4.0, 6.0 + meltPx * 1.6, wTop) * charPatch;
  float charT = (1.0 - S(charW, charW * 2.4, depth));
  content.rgb = mix(
    content.rgb,
    content.rgb * vec3(0.22, 0.19, 0.17),
    clamp(charT * 0.85 * burn * clamp(uScorch, 0.0, 2.0), 0.0, 1.0)
  );

  float emberW = mix(2.5, 5.5, wTop);
  float emberN = 0.3 + 0.7 * fbm2(np * 2.2 + 73.0);
  float emberK = clamp(uEmber, 0.0, 2.0);
  float ember = exp(-depth / emberW) * emberN * emberK;
  float whiteHot = exp(-depth / (emberW * 0.4)) * emberN * emberN * emberK;
  content.rgb = mix(content.rgb, uColor * 1.2, clamp(ember, 0.0, 1.0) * burn);
  content.rgb = mix(
    content.rgb,
    mix(uColor, vec3(1.0), 0.3) * 1.2,
    clamp(whiteHot, 0.0, 1.0) * burn
  );

  float dn = fbm2(rel * (3.2 / unit) * detail + vec2(0.0, t * 0.5) + 91.0);
  float dw = mix(2.0, 5.0, wTop);
  float dissolve = S(-dw, dw, front + (dn - 0.5) * dw * 2.5);
  float cA = content.a * (1.0 - dissolve) * inRect;
  float smk = smoke * (1.0 - cA);
  float baseA = min(cA + smk, 1.0);
  vec3 base = content.rgb * cA + smokeCol * smk;
  vec3 col = fireCol * fireA + base * (1.0 - fireA) + glow;
  float alpha = clamp(fireA + baseA * (1.0 - fireA) + halo * 0.5, 0.0, 1.0);
  outColor = vec4(col, alpha);
}`;
  function createFlameWrap(elements, options = {}) {
    const config = { ...DEFAULTS11, ...options };
    const { source, content, output } = elements;
    const gl = output.getContext("webgl2", {
      alpha: true,
      depth: false,
      stencil: false,
      antialias: false,
      premultipliedAlpha: true
    });
    if (!gl || gl.isContextLost()) return null;
    const sourceCtx = source.getContext("2d");
    const paintable = source;
    const htmlInCanvas = Boolean(
      sourceCtx && typeof sourceCtx.drawElementImage === "function" && typeof paintable.requestPaint === "function"
    );
    if (htmlInCanvas) prepareHtmlInCanvas(source, content);
    let contentDirty = false;
    let wake = () => {
    };
    if (htmlInCanvas) {
      paintable.onpaint = () => {
        try {
          sourceCtx.reset();
          drawHtmlInCanvas(source, sourceCtx, content);
          contentDirty = true;
          wake();
        } catch {
        }
      };
    }
    function compile(type, text) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, text);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error("FlameWrap shader error:", gl.getShaderInfoLog(shader));
      }
      return shader;
    }
    const vertexShader = compile(gl.VERTEX_SHADER, VERT10);
    const fragmentShader = compile(gl.FRAGMENT_SHADER, FRAG8);
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    const uniforms = {};
    const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < count; i++) {
      const info = gl.getActiveUniform(program, i);
      uniforms[info.name] = gl.getUniformLocation(program, info.name);
    }
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const contentTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, contentTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([0, 0, 0, 0])
    );
    const rect = { cx: 0, cy: 0, hx: 1, hy: 1 };
    let dpr = 1;
    function syncCanvasSize() {
      dpr = getCanvasPixelRatio(output, gl);
      const width = Math.max(1, Math.round(output.clientWidth * dpr));
      const height = Math.max(1, Math.round(output.clientHeight * dpr));
      if (output.width !== width || output.height !== height) {
        output.width = width;
        output.height = height;
      }
      const box = htmlInCanvas ? source : content;
      const outRect = output.getBoundingClientRect();
      const boxRect = box.getBoundingClientRect();
      if (outRect.width > 0 && boxRect.width > 0) {
        rect.cx = (boxRect.left + boxRect.right) / 2 - outRect.left;
        rect.cy = outRect.bottom - (boxRect.top + boxRect.bottom) / 2;
        rect.hx = boxRect.width / 2;
        rect.hy = boxRect.height / 2;
      }
      if (htmlInCanvas) {
        const sourceWidth = Math.max(1, Math.round(source.clientWidth * dpr));
        const sourceHeight = Math.max(1, Math.round(source.clientHeight * dpr));
        if (source.width !== sourceWidth || source.height !== sourceHeight) {
          source.width = sourceWidth;
          source.height = sourceHeight;
        }
        paintable.requestPaint();
      }
    }
    syncCanvasSize();
    function uploadContent() {
      if (!htmlInCanvas || !contentDirty) return;
      contentDirty = false;
      gl.bindTexture(gl.TEXTURE_2D, contentTexture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        source
      );
      sourceCtx.clearRect(0, 0, source.width, source.height);
    }
    let time = 0;
    function render() {
      uploadContent();
      gl.useProgram(program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, contentTexture);
      gl.uniform1i(uniforms.uContent, 0);
      gl.uniform2f(uniforms.uResolution, output.width, output.height);
      gl.uniform1f(uniforms.uTime, time);
      gl.uniform2f(uniforms.uRectCenter, rect.cx * dpr, rect.cy * dpr);
      gl.uniform2f(
        uniforms.uRectHalf,
        Math.max(rect.hx * dpr, 1),
        Math.max(rect.hy * dpr, 1)
      );
      gl.uniform1f(uniforms.uCorner, Math.max(config.radius, 0) * dpr);
      gl.uniform3f(
        uniforms.uColor,
        config.color[0],
        config.color[1],
        config.color[2]
      );
      gl.uniform1f(uniforms.uIntensity, Math.max(config.intensity, 0));
      gl.uniform1f(uniforms.uHeight, Math.max(config.height, 24) * dpr);
      gl.uniform1f(uniforms.uSpread, Math.max(config.spread, 8) * dpr);
      gl.uniform1f(uniforms.uScale, Math.max(config.scale, 0.05));
      gl.uniform1f(uniforms.uTurbulence, Math.max(config.turbulence, 0));
      gl.uniform1f(uniforms.uTurbScale, Math.max(config.turbulenceScale, 0.2));
      gl.uniform1f(
        uniforms.uTurbReach,
        Math.max(config.turbulenceReach, 4) * dpr
      );
      gl.uniform1f(uniforms.uSparks, Math.max(config.sparks, 0));
      gl.uniform1f(uniforms.uSparkSize, Math.max(config.sparkSize, 0.2));
      gl.uniform1f(uniforms.uSparkDensity, Math.max(config.sparkDensity, 0.3));
      gl.uniform1f(uniforms.uSparkSpeed, Math.max(config.sparkSpeed, 0.05));
      gl.uniform1f(uniforms.uRim, Math.max(config.rim, 0));
      gl.uniform1f(uniforms.uMelt, Math.max(config.melt, 0) * dpr);
      gl.uniform1f(uniforms.uDistortion, Math.max(config.distortion, 0) * dpr);
      gl.uniform1f(uniforms.uSmoke, Math.max(config.smoke, 0));
      gl.uniform1f(uniforms.uEmber, Math.max(config.ember, 0));
      gl.uniform1f(uniforms.uScorch, Math.max(config.scorch, 0));
      gl.uniform1f(uniforms.uHasContent, htmlInCanvas ? 1 : 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, output.width, output.height);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    let raf = 0;
    let lastTime = performance.now();
    let destroyed = false;
    let running = false;
    let visible = true;
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reducedMotion = motionQuery.matches;
    function frame(now) {
      if (destroyed) return;
      if (!visible) {
        running = false;
        return;
      }
      const delta = Math.min((now - lastTime) / 1e3, 1 / 30);
      lastTime = now;
      if (!reducedMotion) time += delta * config.speed;
      render();
      if (reducedMotion && !contentDirty) {
        running = false;
        return;
      }
      raf = requestAnimationFrame(frame);
    }
    function start() {
      if (destroyed || running || !visible) return;
      running = true;
      lastTime = performance.now();
      raf = requestAnimationFrame(frame);
    }
    wake = start;
    start();
    function onMotionChange() {
      reducedMotion = motionQuery.matches;
      start();
    }
    motionQuery.addEventListener("change", onMotionChange);
    const observer = createCanvasResizeObserver(() => {
      syncCanvasSize();
      start();
    });
    observer.observe(output);
    observer.observe(content);
    const intersection = new IntersectionObserver((entries) => {
      visible = entries[entries.length - 1]?.isIntersecting ?? true;
      if (visible) start();
    });
    intersection.observe(output);
    return {
      setOptions(next) {
        let changed = false;
        for (const [key, value] of Object.entries(next)) {
          const prev = config[key];
          if (Array.isArray(value) && Array.isArray(prev)) {
            if (value.length !== prev.length || value.some((item, i) => item !== prev[i])) {
              changed = true;
              break;
            }
          } else if (prev !== value) {
            changed = true;
            break;
          }
        }
        Object.assign(config, next);
        if (!changed) return;
        syncCanvasSize();
        start();
      },
      resize() {
        syncCanvasSize();
        start();
      },
      destroy() {
        destroyed = true;
        cancelAnimationFrame(raf);
        observer.disconnect();
        intersection.disconnect();
        motionQuery.removeEventListener("change", onMotionChange);
        gl.deleteTexture(contentTexture);
        gl.deleteProgram(program);
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
        gl.deleteBuffer(quad);
        if (htmlInCanvas) paintable.onpaint = null;
      }
    };
  }

  // src/effects/flame-wrap.js
  var CONTROLS11 = {
    flame: color("Color", "#4e89ff"),
    intensity: scrub("Intensity", 0.5, { min: 0, max: 3, step: 0.05 }),
    height: scrub("Flame height", 170, {
      min: 40,
      max: 200,
      step: 2,
      decimals: 0
    }),
    spread: scrub("Glow spread", 8, { min: 8, max: 96, step: 1, decimals: 0 }),
    radius: scrub("Corner radius", 40, { min: 0, max: 48, step: 1, decimals: 0 }),
    speed: scrub("Speed", 0.25, { min: 0, max: 3, step: 0.05 }),
    scale: scrub("Detail", 0.75, { min: 0.05, max: 1, step: 0.01 }),
    turbulence: scrub("Turbulence", 0.5, { min: 0, max: 1, step: 0.01 }),
    turbulenceScale: scrub("Turbulence scale", 0.5, {
      min: 0.2,
      max: 3,
      step: 0.05
    }),
    turbulenceReach: scrub("Turbulence reach", 25, {
      min: 4,
      max: 80,
      step: 1,
      decimals: 0
    }),
    sparks: scrub("Sparks", 1.5, { min: 0, max: 3, step: 0.05 }),
    sparkSize: scrub("Spark size", 0.35, { min: 0.2, max: 2.5, step: 0.05 }),
    sparkDensity: scrub("Spark density", 1, { min: 0.3, max: 2.5, step: 0.05 }),
    sparkSpeed: scrub("Spark speed", 1, { min: 0.1, max: 3, step: 0.05 }),
    rim: scrub("Molten rim", 2.5, { min: 0, max: 3, step: 0.05 }),
    melt: scrub("Edge melt", 4.5, { min: 0, max: 24, step: 0.5, decimals: 1 }),
    distortion: scrub("Heat shimmer", 10, {
      min: 0,
      max: 16,
      step: 0.5,
      decimals: 1
    }),
    smoke: scrub("Smoke", 1.5, { min: 0, max: 2, step: 0.05 }),
    ember: scrub("Ember glow", 2, { min: 0, max: 2, step: 0.05 }),
    scorch: scrub("Scorch", 0, { min: 0, max: 2, step: 0.05 })
  };
  var flame_wrap_default = {
    slug: "flame-wrap",
    name: "Flame Wrap",
    component: "FlameWrap",
    description: "A card wrapped in a border of fire.",
    controls: CONTROLS11,
    toOptions(values) {
      const { flame, ...rest } = values;
      return {
        ...rest,
        color: hexToRgb(flame)
      };
    },
    create: createFlameWrap
  };

  // src/vendor/lib/ForceField/ForceFieldVanilla.ts
  var MAX_HITS = 10;
  var DEFAULTS12 = {
    shape: "hexagon",
    color: [0.15, 0.68, 1],
    edgeColor: [0.5, 0.8, 1],
    opacity: 0.9,
    cellScale: 16,
    lineWidth: 0.03,
    gridOpacity: 0.15,
    gridReveal: "click",
    gridRevealStrength: 1.5,
    gridRevealRadius: 250,
    gridFade: 0.35,
    flashSpeed: 0.6,
    flashIntensity: 0.1,
    flowScale: 3,
    flowSpeed: 0.5,
    flowIntensity: 0,
    edgeGlow: 0.2,
    edgeFalloff: 0.18,
    reveal: 1,
    dissolveScale: 3.5,
    dissolveWidth: 0.05,
    dissolveGlow: 6,
    rippleSpeed: 0.5,
    rippleWidth: 0.045,
    rippleBlend: 1,
    rippleDuration: 1.6,
    rippleIntensity: 0.1,
    rippleMaxRadius: 0.85,
    impactRadius: 0.16,
    refraction: 30,
    aberration: 2.5,
    haze: 0.5,
    pageReact: 0,
    tint: 0.1,
    hoverGlow: 0.25,
    hoverRadius: 350,
    hoverCharge: 1.6,
    hideOnHover: false,
    dim: 0,
    bloom: 1,
    bloomThreshold: 0.3,
    grain: 0.2,
    clickRipples: true,
    onHit: null
  };
  var VERT11 = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPos;
out vec2 vUv;
void main () {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;
  var FIELD_FRAG2 = `#version 300 es
precision highp float;
in vec2 vUv;
layout(location = 0) out vec4 outColor;
layout(location = 1) out vec4 outEmission;
uniform sampler2D uContent;
uniform vec2 uResolution;
uniform float uTime;
uniform float uShape;
uniform vec3 uColor;
uniform vec3 uEdgeColor;
uniform float uOpacity;
uniform float uCellScale;
uniform float uLineWidth;
uniform float uGridOpacity;
uniform float uGridRevealMode;
uniform float uGridRevealStrength;
uniform float uGridRevealRadius;
uniform float uGridFade;
uniform float uFlashSpeed;
uniform float uFlashIntensity;
uniform float uFlowScale;
uniform float uFlowSpeed;
uniform float uFlowIntensity;
uniform float uEdgeGlow;
uniform float uEdgeFalloff;
uniform float uReveal;
uniform float uDissolveScale;
uniform float uDissolveWidth;
uniform float uDissolveGlow;
uniform vec2 uHitPos[10];
uniform float uHitTime[10];
uniform float uRippleSpeed;
uniform float uRippleWidth;
uniform float uRippleDuration;
uniform float uRippleIntensity;
uniform float uRippleMaxRadius;
uniform float uImpactRadius;
uniform float uRippleBlend;
uniform float uRefraction;
uniform float uAberration;
uniform vec2 uMouse;
uniform float uHoverGlow;
uniform float uHoverRadius;
uniform float uHoverCharge;
uniform float uHideOnHover;
uniform float uScroll;
uniform float uHaze;
uniform float uPageReact;
uniform float uTint;
uniform float uDim;
uniform float uHasContent;
uniform float uPageLum;

vec3 mod289v3(vec3 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289v4(vec4 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x){ return mod289v4(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v){
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289v3(i);
  vec4 p = permute(permute(permute(
    i.z + vec4(0.0, i1.z, i2.z, 1.0))
    + i.y + vec4(0.0, i1.y, i2.y, 1.0))
    + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

float hash21(vec2 p){
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

vec4 hexCell(vec2 p){
  const vec2 s = vec2(1.0, 1.7320508);
  vec4 hC = floor(vec4(p, p - vec2(0.5, 1.0)) / s.xyxy) + 0.5;
  vec4 h = vec4(p - hC.xy * s, p - (hC.zw + 0.5) * s);
  bool first = dot(h.xy, h.xy) < dot(h.zw, h.zw);
  vec2 local = first ? h.xy : h.zw;
  vec2 id = first ? hC.xy : hC.zw + 0.5;
  vec2 cell = abs(local);
  float d = max(dot(cell, s * 0.5), cell.x);
  return vec4(d, 0.5, id);
}

vec4 triCell(vec2 p){
  vec2 l = vec2(p.x - p.y * 0.57735027, p.y * 1.15470054);
  vec2 id = floor(l);
  vec2 f = l - id;
  float upper = step(1.0, f.x + f.y);
  vec2 w = vec2(f.x + f.y * 0.5, f.y * 0.8660254);
  w = mix(w, vec2(1.5, 0.8660254) - w, upper);
  float d = min(
    w.y,
    min(
      dot(w, vec2(0.8660254, -0.5)),
      dot(w - vec2(1.0, 0.0), vec2(-0.8660254, -0.5))
    )
  );
  return vec4(0.2886751 - d, 0.2886751, id * 2.0 + vec2(upper, 0.0));
}

vec4 squareCell(vec2 p){
  vec2 id = floor(p);
  vec2 f = fract(p) - 0.5;
  vec2 a = abs(f);
  float d = max(a.x, a.y);
  return vec4(d, 0.5, id);
}

vec4 cellInfo(vec2 p){
  if (uShape < 0.5) return hexCell(p);
  if (uShape < 1.5) return triCell(p);
  return squareCell(p);
}

float cellFlash(vec2 id){
  float rnd = hash21(id);
  float phase = rnd * 6.2831;
  float speed = 0.5 + rnd * 1.5;
  return smoothstep(0.6, 1.0, sin(uTime * uFlashSpeed * speed + phase)) * uFlashIntensity;
}

void main(){
  vec2 frag = vUv * uResolution;
  float minAxis = min(uResolution.x, uResolution.y);
  vec2 pageFrag = vec2(frag.x, frag.y - uScroll);
  vec2 st = pageFrag / minAxis;

  float dissolve = 0.0;
  float revealMask = 1.0;
  float dissolveEdge = 0.0;
  if (uReveal < 0.999) {
    dissolve = snoise(vec3(st * uDissolveScale, 3.7)) * 0.5 + 0.5;
    float revealGate = uReveal * (1.0 + uDissolveWidth * 2.0) - uDissolveWidth;
    revealMask = smoothstep(revealGate - uDissolveWidth, revealGate, 1.0 - dissolve);
    revealMask = 1.0 - revealMask;
    float edgeLow = smoothstep(revealGate - uDissolveWidth, revealGate - uDissolveWidth * 0.2, 1.0 - dissolve);
    float edgeHigh = smoothstep(revealGate - uDissolveWidth * 0.15, revealGate, 1.0 - dissolve);
    dissolveEdge = edgeLow * (1.0 - edgeHigh) * step(0.001, uReveal);
  }

  float ringContrib = 0.0;
  float impactBoost = 0.0;
  vec2 pushVec = vec2(0.0);
  float sigma = uRippleWidth * mix(0.6, 2.6, uRippleBlend);
  for (int i = 0; i < 10; i++) {
    float ht = uHitTime[i];
    float elapsed = uTime - ht;
    float isActive = step(0.0, ht) * step(0.0, elapsed) * step(elapsed, uRippleDuration);
    if (isActive < 0.5) continue;
    vec2 toHit = (pageFrag - uHitPos[i]) / minAxis;
    float dist = length(toHit);
    float ringR = min(elapsed * uRippleSpeed, uRippleMaxRadius);
    float noiseD = snoise(vec3(st * 5.0, elapsed * 2.0 + float(i))) * 0.03 * (1.0 - uRippleBlend * 0.7);
    float band = dist + noiseD - ringR;
    float g = exp(-band * band / (2.0 * sigma * sigma));
    float fade = 1.0 - smoothstep(uRippleDuration * 0.4, uRippleDuration, elapsed);
    fade *= fade;
    float radialFade = 1.0 - smoothstep(uRippleMaxRadius * 0.75, uRippleMaxRadius, ringR);
    float contrib = g * fade * radialFade;
    ringContrib += contrib;
    float zone = smoothstep(uImpactRadius, 0.0, dist);
    float zoneFade = 1.0 - smoothstep(0.0, uRippleDuration * 0.35, elapsed);
    impactBoost += zone * zoneFade;
    vec2 dir = dist > 0.0001 ? toHit / dist : vec2(0.0);
    float core = smoothstep(0.0, sigma * 2.5, dist) * smoothstep(0.0, sigma * 1.5, ringR);
    pushVec += dir * g * fade * radialFade * core;
  }
  ringContrib = min(ringContrib, 1.5);
  impactBoost = min(impactBoost, 1.0);

  vec2 fieldSt = st - pushVec * (uRefraction * 1.4 / minAxis);
  vec4 info = cellInfo(fieldSt * uCellScale);
  float lineDist = info.x;
  float halfSize = info.y;
  vec2 cellId = info.zw;
  float line = smoothstep(halfSize - uLineWidth, halfSize, lineDist);
  float flash = cellFlash(cellId);

  float flowNoise = 0.0;
  vec2 hazeVec = vec2(0.0);
  if (uFlowIntensity > 0.001 || uHaze > 0.001) {
    float t = uTime * uFlowSpeed;
    float fn1 = snoise(vec3(st * uFlowScale, t * 0.5));
    float fn2 = snoise(vec3(st * uFlowScale * 2.1 + 7.3, -t * 0.35));
    flowNoise = (fn1 * 0.6 + fn2 * 0.4) * 0.5 + 0.5;
    hazeVec = vec2(fn1, fn2) * uHaze;
  }

  vec2 bp = min(frag, uResolution - frag) / minAxis;
  float rr = max(uEdgeFalloff, 0.02);
  float hmix = clamp(0.5 + 0.5 * (bp.y - bp.x) / rr, 0.0, 1.0);
  float edgeDist = mix(bp.y, bp.x, hmix) - rr * hmix * (1.0 - hmix);
  float fresnel = pow(1.0 - smoothstep(0.0, uEdgeFalloff, edgeDist), 1.6) * uEdgeGlow;

  vec2 pageMouse = vec2(uMouse.x, uMouse.y - uScroll);
  vec2 mouseSt = pageMouse / minAxis;
  float mouseD = distance(pageFrag, pageMouse);
  float hover = exp(-mouseD * mouseD / (uHoverRadius * uHoverRadius * 0.5)) * uHoverGlow;
  vec2 hoverCell = cellInfo(mouseSt * uCellScale).zw;
  float sameCell = 1.0 - step(0.5, distance(hoverCell, cellId));
  float charge = sameCell * uHoverCharge;
  hover *= 1.0 - uHideOnHover;
  charge *= 1.0 - uHideOnHover;

  float revealHover = (uGridRevealMode == 1.0 || uGridRevealMode == 3.0) ? 1.0 : 0.0;
  float revealClick = (uGridRevealMode == 2.0 || uGridRevealMode == 3.0) ? 1.0 : 0.0;
  float allowHover = max(revealHover, uGridRevealMode == 0.0 ? 1.0 : 0.0);
  charge *= allowHover;
  float hoverMask = 1.0 - smoothstep(uGridRevealRadius * (1.0 - uGridFade), uGridRevealRadius, mouseD);
  hoverMask *= 1.0 - uHideOnHover;
  float gridBoost = (revealHover * hoverMask + revealClick * impactBoost) * uGridRevealStrength;

  float gridEnergy = line * (uGridOpacity + gridBoost + charge + flash + ringContrib * uRippleIntensity * 5.0);
  float energy = gridEnergy * (0.35 + fresnel * 0.4)
    + fresnel * 0.5
    + flash * 0.5
    + flowNoise * uFlowIntensity * (0.12 + fresnel * 0.25 + line * 0.15)
    + hover * (0.25 + line * 0.75 * allowHover)
    + ringContrib * uRippleIntensity;

  float hide = 1.0 - uHideOnHover * (1.0 - smoothstep(uHoverRadius * 0.35, uHoverRadius * 1.4, mouseD));

  vec2 warp = (-pushVec * uRefraction * 0.7 + hazeVec * 6.0) * revealMask * hide;
  vec2 refr = warp;
  vec2 cuv = vec2(vUv.x, 1.0 - vUv.y);
  vec2 texel = 1.0 / uResolution;
  vec2 baseUv = clamp(cuv + refr * texel * vec2(1.0, -1.0), 0.0, 1.0);
  vec4 content;
  if (uHasContent > 0.5) {
    content = texture(uContent, baseUv);
    float ab = uAberration * min(length(warp), 24.0) / 24.0;
    if (ab > 0.01) {
      vec2 abOff = normalize(warp + vec2(1e-5)) * ab * texel * 3.0;
      content.r = texture(uContent, clamp(baseUv + abOff, 0.0, 1.0)).r;
      content.b = texture(uContent, clamp(baseUv - abOff, 0.0, 1.0)).b;
    }
    if (uPageReact > 0.001) {
      float pageL = dot(content.rgb, vec3(0.2126, 0.7152, 0.0722));
      energy *= mix(1.0, 0.3 + pageL * 1.6, uPageReact * revealMask);
    }
  } else {
    content = vec4(0.0);
  }

  energy *= revealMask * hide;

  float dimEff = uDim * revealMask * (1.0 - hover * 0.5);
  vec3 col = content.rgb * (1.0 - dimEff);
  if (uTint > 0.001) {
    vec3 membrane = uColor / max(max(uColor.r, max(uColor.g, uColor.b)), 0.001);
    col *= mix(vec3(1.0), membrane * 0.92 + 0.08, uTint * revealMask);
  }

  vec3 fieldGlow = uColor * energy * uOpacity;
  vec3 dissolveGlow = uEdgeColor * dissolveEdge * uDissolveGlow * hide;

  float dark = 1.0 - uPageLum;
  float darkMix = clamp(dark * 1.4 - 0.2, 0.0, 1.0);
  vec3 rawAdd = fieldGlow + dissolveGlow;
  vec3 additive = rawAdd / (1.0 + 0.45 * max(max(rawAdd.r, rawAdd.g), rawAdd.b));
  float aMax = max(max(additive.r, additive.g), additive.b);
  vec3 inked = col * exp(-(vec3(aMax) - additive) * 1.7) * (1.0 - 0.18 * min(aMax, 1.0));
  col = mix(inked, col + additive, darkMix);

  float alpha = max(content.a, clamp(energy * uOpacity + dissolveEdge, 0.0, 1.0));
  col = clamp(col, vec3(0.0), vec3(max(alpha, 0.001)));
  outColor = vec4(col, alpha);
  outEmission = vec4(rawAdd, 1.0);
}`;
  var BRIGHT_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uScene;
uniform float uThreshold;
void main(){
  vec4 c = texture(uScene, vUv);
  float lum = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
  float gate = smoothstep(uThreshold, uThreshold + 0.25, lum);
  outColor = vec4(c.rgb * gate, 1.0);
}`;
  var KAWASE_DOWN_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uScene;
uniform vec2 uTexel;
void main(){
  vec2 o = uTexel;
  vec4 sum = texture(uScene, vUv) * 4.0;
  sum += texture(uScene, vUv - o);
  sum += texture(uScene, vUv + o);
  sum += texture(uScene, vUv + vec2(o.x, -o.y));
  sum += texture(uScene, vUv - vec2(o.x, -o.y));
  outColor = sum * 0.125;
}`;
  var KAWASE_UP_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uScene;
uniform sampler2D uBase;
uniform vec2 uTexel;
void main(){
  vec2 o = uTexel;
  vec4 sum = texture(uScene, vUv + vec2(-o.x * 2.0, 0.0));
  sum += texture(uScene, vUv + vec2(-o.x, o.y)) * 2.0;
  sum += texture(uScene, vUv + vec2(0.0, o.y * 2.0));
  sum += texture(uScene, vUv + vec2(o.x, o.y)) * 2.0;
  sum += texture(uScene, vUv + vec2(o.x * 2.0, 0.0));
  sum += texture(uScene, vUv + vec2(o.x, -o.y)) * 2.0;
  sum += texture(uScene, vUv + vec2(0.0, -o.y * 2.0));
  sum += texture(uScene, vUv + vec2(-o.x, -o.y)) * 2.0;
  outColor = mix(texture(uBase, vUv), sum / 12.0, 0.62);
}`;
  var COMPOSITE_FRAG2 = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform float uBloomStrength;
uniform float uGrain;
uniform float uTime;
uniform float uPageLum;
float grainNoise(vec2 p, float t){
  vec3 v = fract(vec3(p.xyx) * vec3(443.897, 441.423, 437.195) + t);
  v += dot(v, v.yzx + 19.19);
  return fract((v.x + v.y) * v.z) - 0.5;
}
void main(){
  vec4 scene = texture(uScene, vUv);
  vec3 bloom = texture(uBloom, vUv).rgb * uBloomStrength;
  float darkMix = clamp((1.0 - uPageLum) * 1.4 - 0.2, 0.0, 1.0);
  float bMax = max(max(bloom.r, bloom.g), bloom.b);
  vec3 inked = scene.rgb * exp(-(vec3(bMax) - bloom) * 1.1) * (1.0 - 0.1 * min(bMax, 1.0));
  vec3 col = mix(inked, scene.rgb + bloom, darkMix);
  float bloomLum = dot(bloom, vec3(0.2126, 0.7152, 0.0722));
  float alpha = clamp(scene.a + bloomLum, 0.0, 1.0);
  float g = grainNoise(gl_FragCoord.xy, fract(uTime) + 0.1);
  col += g * uGrain * (0.15 + alpha * 0.25);
  col = clamp(col, vec3(0.0), vec3(max(alpha, 0.001)));
  outColor = vec4(col, alpha);
}`;
  var SHAPE_INDEX = {
    hexagon: 0,
    triangle: 1,
    square: 2
  };
  var REVEAL_INDEX = {
    always: 0,
    hover: 1,
    click: 2,
    both: 3
  };
  function createForceField(elements, options = {}) {
    const config = { ...DEFAULTS12, ...options };
    const { source, content, output } = elements;
    const gl = output.getContext("webgl2", {
      alpha: true,
      depth: false,
      stencil: false,
      antialias: false,
      premultipliedAlpha: true
    });
    if (!gl || gl.isContextLost()) return null;
    const hdr = Boolean(
      gl.getExtension("EXT_color_buffer_float") || gl.getExtension("EXT_color_buffer_half_float")
    );
    const sourceCtx = source.getContext("2d");
    const paintable = source;
    const htmlInCanvas = Boolean(
      sourceCtx && typeof sourceCtx.drawElementImage === "function" && typeof paintable.requestPaint === "function"
    );
    if (htmlInCanvas) prepareHtmlInCanvas(source, content);
    let contentDirty = false;
    let pageLum = 0;
    let wake = () => {
    };
    function readPageLum() {
      try {
        const probe = document.createElement("canvas");
        probe.width = probe.height = 1;
        const pctx = probe.getContext("2d", { willReadFrequently: true });
        if (!pctx) return 0;
        let el = content;
        while (el instanceof Element) {
          const bgColor = getComputedStyle(el).backgroundColor;
          if (bgColor && bgColor !== "transparent") {
            pctx.clearRect(0, 0, 1, 1);
            pctx.fillStyle = bgColor;
            pctx.fillRect(0, 0, 1, 1);
            const d = pctx.getImageData(0, 0, 1, 1).data;
            if (d[3] > 128) {
              return (0.2126 * d[0] + 0.7152 * d[1] + 0.0722 * d[2]) / 255;
            }
          }
          el = el.parentElement;
        }
      } catch {
      }
      return 0;
    }
    if (htmlInCanvas) {
      paintable.onpaint = () => {
        try {
          sourceCtx.reset();
          drawHtmlInCanvas(source, sourceCtx, content);
          contentDirty = true;
          wake();
        } catch {
        }
      };
    }
    function compile(type, text) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, text);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error("ForceField shader error:", gl.getShaderInfoLog(shader));
      }
      return shader;
    }
    function link(frag) {
      const vs = compile(gl.VERTEX_SHADER, VERT11);
      const fs = compile(gl.FRAGMENT_SHADER, frag);
      const program = gl.createProgram();
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.linkProgram(program);
      const uniforms = {};
      const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < count; i++) {
        const info = gl.getActiveUniform(program, i);
        const name = info.name.replace(/\[0\]$/, "");
        uniforms[name] = gl.getUniformLocation(program, info.name);
      }
      return { program, uniforms, shaders: [vs, fs] };
    }
    const fieldPass = link(FIELD_FRAG2);
    const brightPass = link(BRIGHT_FRAG);
    const downPass = link(KAWASE_DOWN_FRAG);
    const upPass = link(KAWASE_UP_FRAG);
    const compositePass = link(COMPOSITE_FRAG2);
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    function makeTexture() {
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return texture;
    }
    const contentTexture = makeTexture();
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([0, 0, 0, 0])
    );
    function allocPixels(width, height, float) {
      if (float && hdr) {
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA16F,
          width,
          height,
          0,
          gl.RGBA,
          gl.HALF_FLOAT,
          null
        );
      } else {
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          width,
          height,
          0,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          null
        );
      }
    }
    function makeTarget(width, height, emission = false, float = false) {
      const texture = makeTexture();
      allocPixels(width, height, float);
      let emissionTexture = null;
      if (emission) {
        emissionTexture = makeTexture();
        allocPixels(width, height, true);
      }
      const framebuffer = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D,
        texture,
        0
      );
      if (emissionTexture) {
        gl.framebufferTexture2D(
          gl.FRAMEBUFFER,
          gl.COLOR_ATTACHMENT1,
          gl.TEXTURE_2D,
          emissionTexture,
          0
        );
        gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return { texture, emissionTexture, framebuffer, width, height, float };
    }
    function resizeTarget(target, width, height) {
      if (target.width === width && target.height === height) return;
      target.width = width;
      target.height = height;
      gl.bindTexture(gl.TEXTURE_2D, target.texture);
      allocPixels(width, height, target.float);
      if (target.emissionTexture) {
        gl.bindTexture(gl.TEXTURE_2D, target.emissionTexture);
        allocPixels(width, height, true);
      }
    }
    const MIPS = 4;
    const sceneTarget = makeTarget(2, 2, true);
    const brightTarget = makeTarget(2, 2, false, true);
    const downTargets = [];
    const upTargets = [];
    for (let i = 0; i < MIPS; i++) {
      downTargets.push(makeTarget(2, 2, false, true));
      upTargets.push(makeTarget(2, 2, false, true));
    }
    const hitPos = new Float32Array(MAX_HITS * 2);
    const hitTime = new Float32Array(MAX_HITS).fill(-999);
    let hitIndex = 0;
    let mouseX = -9999;
    let mouseY = -9999;
    let dpr = 1;
    function syncCanvasSize() {
      dpr = getCanvasPixelRatio(output, gl);
      const width = Math.max(1, Math.round(output.clientWidth * dpr));
      const height = Math.max(1, Math.round(output.clientHeight * dpr));
      if (output.width !== width || output.height !== height) {
        output.width = width;
        output.height = height;
      }
      resizeTarget(sceneTarget, width, height);
      let bw = Math.max(1, width >> 1);
      let bh = Math.max(1, height >> 1);
      resizeTarget(brightTarget, bw, bh);
      for (let i = 0; i < MIPS; i++) {
        bw = Math.max(1, bw >> 1);
        bh = Math.max(1, bh >> 1);
        resizeTarget(downTargets[i], bw, bh);
      }
      for (let i = MIPS - 1; i >= 0; i--) {
        const up = i === 0 ? { width: brightTarget.width, height: brightTarget.height } : downTargets[i - 1];
        resizeTarget(upTargets[i], up.width, up.height);
      }
      if (htmlInCanvas) {
        const sourceWidth = Math.max(1, Math.round(source.clientWidth * dpr));
        const sourceHeight = Math.max(1, Math.round(source.clientHeight * dpr));
        if (source.width !== sourceWidth || source.height !== sourceHeight) {
          source.width = sourceWidth;
          source.height = sourceHeight;
        }
        paintable.requestPaint();
      }
    }
    syncCanvasSize();
    function uploadContent() {
      if (!htmlInCanvas || !contentDirty) return;
      contentDirty = false;
      pageLum = readPageLum();
      gl.bindTexture(gl.TEXTURE_2D, contentTexture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        source
      );
      sourceCtx.clearRect(0, 0, source.width, source.height);
    }
    function drawQuad() {
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    function bindTargetTexture(unit, texture) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, texture);
    }
    const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
    let time = 3.7;
    function render() {
      uploadContent();
      const width = output.width;
      const height = output.height;
      gl.bindFramebuffer(gl.FRAMEBUFFER, sceneTarget.framebuffer);
      gl.viewport(0, 0, width, height);
      gl.useProgram(fieldPass.program);
      const fu = fieldPass.uniforms;
      bindTargetTexture(0, contentTexture);
      gl.uniform1i(fu.uContent, 0);
      gl.uniform2f(fu.uResolution, width, height);
      gl.uniform1f(fu.uTime, time);
      gl.uniform1f(fu.uShape, SHAPE_INDEX[config.shape] ?? 0);
      gl.uniform3f(fu.uColor, config.color[0], config.color[1], config.color[2]);
      gl.uniform3f(
        fu.uEdgeColor,
        config.edgeColor[0],
        config.edgeColor[1],
        config.edgeColor[2]
      );
      gl.uniform1f(fu.uOpacity, clamp(config.opacity, 0, 1));
      gl.uniform1f(fu.uCellScale, clamp(config.cellScale, 4, 80));
      gl.uniform1f(fu.uLineWidth, clamp(config.lineWidth, 5e-3, 0.2));
      gl.uniform1f(fu.uGridOpacity, clamp(config.gridOpacity, 0, 1));
      gl.uniform1f(fu.uGridRevealMode, REVEAL_INDEX[config.gridReveal] ?? 2);
      gl.uniform1f(
        fu.uGridRevealStrength,
        clamp(config.gridRevealStrength, 0, 3)
      );
      gl.uniform1f(
        fu.uGridRevealRadius,
        clamp(config.gridRevealRadius, 60, 800) * dpr
      );
      gl.uniform1f(fu.uGridFade, clamp(config.gridFade, 0.02, 1));
      gl.uniform1f(fu.uFlashSpeed, clamp(config.flashSpeed, 0, 4));
      gl.uniform1f(fu.uFlashIntensity, clamp(config.flashIntensity, 0, 1));
      gl.uniform1f(fu.uFlowScale, clamp(config.flowScale, 0.5, 12));
      gl.uniform1f(fu.uFlowSpeed, clamp(config.flowSpeed, 0, 4));
      gl.uniform1f(fu.uFlowIntensity, clamp(config.flowIntensity, 0, 4));
      gl.uniform1f(fu.uEdgeGlow, clamp(config.edgeGlow, 0, 4));
      gl.uniform1f(fu.uEdgeFalloff, clamp(config.edgeFalloff, 0.02, 0.6));
      gl.uniform1f(fu.uReveal, clamp(config.reveal, 0, 1));
      gl.uniform1f(fu.uDissolveScale, clamp(config.dissolveScale, 0.5, 12));
      gl.uniform1f(fu.uDissolveWidth, clamp(config.dissolveWidth, 5e-3, 0.2));
      gl.uniform1f(fu.uDissolveGlow, clamp(config.dissolveGlow, 0, 12));
      gl.uniform2fv(fu.uHitPos, hitPos);
      gl.uniform1fv(fu.uHitTime, hitTime);
      gl.uniform1f(fu.uRippleSpeed, clamp(config.rippleSpeed, 0.1, 4));
      gl.uniform1f(fu.uRippleWidth, clamp(config.rippleWidth, 0.01, 0.4));
      gl.uniform1f(fu.uRippleBlend, clamp(config.rippleBlend, 0, 1));
      gl.uniform1f(fu.uRippleDuration, clamp(config.rippleDuration, 0.3, 5));
      gl.uniform1f(fu.uRippleIntensity, clamp(config.rippleIntensity, 0, 8));
      gl.uniform1f(fu.uRippleMaxRadius, clamp(config.rippleMaxRadius, 0.1, 2));
      gl.uniform1f(fu.uImpactRadius, clamp(config.impactRadius, 0, 0.5));
      gl.uniform1f(fu.uRefraction, clamp(config.refraction, 0, 60));
      gl.uniform1f(fu.uAberration, clamp(config.aberration, 0, 8));
      gl.uniform1f(fu.uHaze, clamp(config.haze, 0, 2));
      gl.uniform1f(fu.uPageReact, clamp(config.pageReact, 0, 1));
      gl.uniform1f(fu.uTint, clamp(config.tint, 0, 1));
      gl.uniform2f(fu.uMouse, mouseX * dpr, height - mouseY * dpr);
      gl.uniform1f(fu.uHoverGlow, clamp(config.hoverGlow, 0, 3));
      gl.uniform1f(fu.uHoverRadius, clamp(config.hoverRadius, 40, 600) * dpr);
      gl.uniform1f(fu.uHoverCharge, clamp(config.hoverCharge, 0, 2));
      gl.uniform1f(fu.uHideOnHover, config.hideOnHover ? 1 : 0);
      gl.uniform1f(fu.uScroll, content.scrollTop * dpr);
      gl.uniform1f(fu.uDim, clamp(config.dim, 0, 1));
      gl.uniform1f(fu.uHasContent, htmlInCanvas ? 1 : 0);
      gl.uniform1f(fu.uPageLum, pageLum);
      drawQuad();
      const bloomOn = config.bloom > 1e-3;
      if (bloomOn) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, brightTarget.framebuffer);
        gl.viewport(0, 0, brightTarget.width, brightTarget.height);
        gl.useProgram(brightPass.program);
        bindTargetTexture(0, sceneTarget.emissionTexture);
        gl.uniform1i(brightPass.uniforms.uScene, 0);
        gl.uniform1f(
          brightPass.uniforms.uThreshold,
          clamp(config.bloomThreshold, 0, 1)
        );
        drawQuad();
        let src = brightTarget;
        for (let i = 0; i < MIPS; i++) {
          gl.bindFramebuffer(gl.FRAMEBUFFER, downTargets[i].framebuffer);
          gl.viewport(0, 0, downTargets[i].width, downTargets[i].height);
          gl.useProgram(downPass.program);
          bindTargetTexture(0, src.texture);
          gl.uniform1i(downPass.uniforms.uScene, 0);
          gl.uniform2f(
            downPass.uniforms.uTexel,
            0.5 / src.width,
            0.5 / src.height
          );
          drawQuad();
          src = downTargets[i];
        }
        for (let i = MIPS - 1; i >= 0; i--) {
          const base = i === 0 ? brightTarget : downTargets[i - 1];
          gl.bindFramebuffer(gl.FRAMEBUFFER, upTargets[i].framebuffer);
          gl.viewport(0, 0, upTargets[i].width, upTargets[i].height);
          gl.useProgram(upPass.program);
          bindTargetTexture(0, src.texture);
          gl.uniform1i(upPass.uniforms.uScene, 0);
          bindTargetTexture(1, base.texture);
          gl.uniform1i(upPass.uniforms.uBase, 1);
          gl.uniform2f(upPass.uniforms.uTexel, 1 / src.width, 1 / src.height);
          drawQuad();
          src = upTargets[i];
        }
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, width, height);
      gl.useProgram(compositePass.program);
      bindTargetTexture(0, sceneTarget.texture);
      gl.uniform1i(compositePass.uniforms.uScene, 0);
      bindTargetTexture(1, bloomOn ? upTargets[0].texture : sceneTarget.texture);
      gl.uniform1i(compositePass.uniforms.uBloom, 1);
      gl.uniform1f(
        compositePass.uniforms.uBloomStrength,
        bloomOn ? clamp(config.bloom, 0, 3) : 0
      );
      gl.uniform1f(compositePass.uniforms.uGrain, clamp(config.grain, 0, 1));
      gl.uniform1f(compositePass.uniforms.uTime, time);
      gl.uniform1f(compositePass.uniforms.uPageLum, pageLum);
      drawQuad();
    }
    let raf = 0;
    let lastTime = performance.now();
    let lastDraw = 0;
    let lastInput = 0;
    let destroyed = false;
    let running = false;
    let visible = true;
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reducedMotion = motionQuery.matches;
    function frame(now) {
      if (destroyed) return;
      if (!visible) {
        running = false;
        return;
      }
      const delta = Math.min((now - lastTime) / 1e3, 1 / 30);
      lastTime = now;
      if (!reducedMotion) time += delta;
      let ripplesLive = false;
      for (let i = 0; i < MAX_HITS; i++) {
        if (hitTime[i] > -900 && time - hitTime[i] < config.rippleDuration + 0.3) {
          ripplesLive = true;
          break;
        }
      }
      const active = ripplesLive || now - lastInput < 500 || reducedMotion || contentDirty;
      if (active || now - lastDraw >= 31) {
        render();
        lastDraw = now;
      }
      if (reducedMotion && !contentDirty) {
        running = false;
        return;
      }
      raf = requestAnimationFrame(frame);
    }
    function start() {
      if (destroyed || running || !visible) return;
      running = true;
      lastTime = performance.now();
      raf = requestAnimationFrame(frame);
    }
    wake = start;
    start();
    function spawnHit(x, y) {
      const idx = hitIndex % MAX_HITS;
      hitIndex++;
      hitPos[idx * 2] = x * dpr;
      hitPos[idx * 2 + 1] = output.height - y * dpr - content.scrollTop * dpr;
      hitTime[idx] = time;
      lastInput = performance.now();
      start();
    }
    function onPointerDown(event) {
      if (!config.clickRipples) return;
      const rect = output.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      spawnHit(x, y);
      config.onHit?.(x, y);
    }
    const rectCache = createRectCache(output);
    function onPointerMove(event) {
      const rect = rectCache.current;
      mouseX = event.clientX - rect.left;
      mouseY = event.clientY - rect.top;
      lastInput = performance.now();
      start();
    }
    function onPointerLeave() {
      mouseX = -9999;
      mouseY = -9999;
    }
    content.addEventListener("pointerdown", onPointerDown);
    content.addEventListener("pointermove", onPointerMove, { passive: true });
    content.addEventListener("pointerleave", onPointerLeave);
    function onMotionChange() {
      reducedMotion = motionQuery.matches;
      start();
    }
    motionQuery.addEventListener("change", onMotionChange);
    function onScroll() {
      lastInput = performance.now();
      start();
    }
    content.addEventListener("scroll", onScroll, { passive: true });
    const observer = createCanvasResizeObserver(() => {
      syncCanvasSize();
      start();
    });
    observer.observe(output);
    observer.observe(content);
    const intersection = new IntersectionObserver((entries) => {
      visible = entries[entries.length - 1]?.isIntersecting ?? true;
      if (visible) start();
    });
    intersection.observe(output);
    return {
      setOptions(next) {
        let changed = false;
        for (const [key, value] of Object.entries(next)) {
          if (typeof value === "function") continue;
          const prev = config[key];
          if (Array.isArray(value) && Array.isArray(prev)) {
            if (value.length !== prev.length || value.some((item, i) => item !== prev[i])) {
              changed = true;
              break;
            }
          } else if (prev !== value) {
            changed = true;
            break;
          }
        }
        Object.assign(config, next);
        if (!changed) return;
        syncCanvasSize();
        start();
      },
      impact(x, y) {
        spawnHit(x, y);
      },
      resize() {
        syncCanvasSize();
        start();
      },
      destroy() {
        destroyed = true;
        rectCache.destroy();
        cancelAnimationFrame(raf);
        observer.disconnect();
        intersection.disconnect();
        motionQuery.removeEventListener("change", onMotionChange);
        content.removeEventListener("scroll", onScroll);
        content.removeEventListener("pointerdown", onPointerDown);
        content.removeEventListener("pointermove", onPointerMove);
        content.removeEventListener("pointerleave", onPointerLeave);
        gl.deleteTexture(contentTexture);
        gl.deleteTexture(sceneTarget.texture);
        if (sceneTarget.emissionTexture)
          gl.deleteTexture(sceneTarget.emissionTexture);
        gl.deleteFramebuffer(sceneTarget.framebuffer);
        gl.deleteTexture(brightTarget.texture);
        gl.deleteFramebuffer(brightTarget.framebuffer);
        for (const target of [...downTargets, ...upTargets]) {
          gl.deleteTexture(target.texture);
          gl.deleteFramebuffer(target.framebuffer);
        }
        for (const pass of [
          fieldPass,
          brightPass,
          downPass,
          upPass,
          compositePass
        ]) {
          gl.deleteProgram(pass.program);
          for (const shader of pass.shaders) gl.deleteShader(shader);
        }
        gl.deleteBuffer(quad);
        if (htmlInCanvas) paintable.onpaint = null;
      }
    };
  }

  // src/effects/force-field.js
  var CONTROLS12 = {
    shape: radio("Shape", "hexagon", [
      { value: "hexagon", label: "Hexagon" },
      { value: "triangle", label: "Triangle" },
      { value: "square", label: "Square" }
    ]),
    cellScale: scrub("Cell scale", 16, { min: 6, max: 60, step: 1, decimals: 0 }),
    lineWidth: scrub("Line width", 0.03, { min: 0.01, max: 0.2, step: 5e-3 }),
    gridOpacity: scrub("Grid opacity", 0.15, { min: 0, max: 1, step: 0.05 }),
    gridReveal: radio("Grid reveal", "click", [
      { value: "always", label: "Always" },
      { value: "hover", label: "Hover" },
      { value: "click", label: "Click" },
      { value: "both", label: "Both" }
    ]),
    gridRevealStrength: scrub("Reveal strength", 1.5, {
      min: 0,
      max: 3,
      step: 0.05
    }),
    gridRevealRadius: scrub("Reveal radius", 250, {
      min: 60,
      max: 800,
      step: 10,
      decimals: 0
    }),
    gridFade: scrub("Reveal fade", 0.35, { min: 0.02, max: 1, step: 0.01 }),
    flowIntensity: scrub("Energy flow", 0, { min: 0, max: 4, step: 0.05 }),
    flowSpeed: scrub("Flow speed", 0.5, { min: 0, max: 4, step: 0.05 }),
    flashIntensity: scrub("Cell flash", 0.1, { min: 0, max: 1, step: 0.02 }),
    edgeGlow: scrub("Edge glow", 0.2, { min: 0, max: 4, step: 0.05 }),
    hoverGlow: scrub("Hover glow", 0.25, { min: 0, max: 3, step: 0.05 }),
    hoverRadius: scrub("Hover radius", 350, {
      min: 40,
      max: 600,
      step: 10,
      decimals: 0
    }),
    hoverCharge: scrub("Hover charge", 1.6, { min: 0, max: 2, step: 0.05 }),
    hideOnHover: toggle("Hide on hover", false),
    rippleIntensity: scrub("Ripple power", 0.1, { min: 0, max: 8, step: 0.1 }),
    rippleSpeed: scrub("Ripple speed", 0.5, { min: 0.1, max: 4, step: 0.05 }),
    rippleBlend: scrub("Ripple blend", 1, { min: 0, max: 1, step: 0.02 }),
    refraction: scrub("Refraction", 30, {
      min: 0,
      max: 60,
      step: 1,
      decimals: 0
    }),
    aberration: scrub("Color fringe", 2.5, { min: 0, max: 8, step: 0.1 }),
    haze: scrub("Heat haze", 0.5, { min: 0, max: 2, step: 0.05 }),
    pageReact: scrub("Page react", 0, { min: 0, max: 1, step: 0.02 }),
    tint: scrub("Page tint", 0.1, { min: 0, max: 1, step: 0.02 }),
    reveal: scrub("Reveal", 1, { min: 0, max: 1, step: 0.01 }),
    dim: scrub("Page dim", 0, { min: 0, max: 1, step: 0.02 }),
    bloom: scrub("Bloom", 1, { min: 0, max: 3, step: 0.05 }),
    grain: scrub("Grain", 0.2, { min: 0, max: 1, step: 0.02 }),
    color: color("Field color", "#26aeff"),
    edgeColor: color("Edge color", "#80ccff")
  };
  var force_field_default = {
    slug: "force-field",
    name: "Force Field",
    component: "ForceField",
    description: "An energy shield where clicks detonate shockwaves.",
    controls: CONTROLS12,
    toOptions(values) {
      const { color: fieldColor, edgeColor, ...rest } = values;
      return {
        ...rest,
        color: hexToRgb(fieldColor),
        edgeColor: hexToRgb(edgeColor)
      };
    },
    create: createForceField
  };

  // src/vendor/lib/Frost/FrostVanilla.ts
  var DEFAULTS13 = {
    frost: 0.05,
    strength: 0.7,
    contrast: 3,
    crispness: 1,
    highlight: 0.3,
    highlightStrength: 0.8,
    haze: 0.5,
    tintThin: [0.82, 0.86, 1.05],
    tintThick: [0.92, 0.96, 1.1],
    tintStrength: 0.3,
    saturation: 1.2,
    brightness: 0.85,
    refraction: 1,
    ior: 1.31,
    detail: 2,
    textureScale: 2,
    fresnel: 0.8,
    meltRadius: 0.25,
    meltNoise: 0.25,
    meltStrength: 0.75,
    refreeze: 2,
    edgeFade: 0.1,
    meltEdges: true,
    introDuration: 2.5,
    opacity: 0.6,
    shimmer: 0,
    quality: 1
  };
  var BLUR_KERNEL = 10;
  var HEIGHT_RES = 512;
  var NOISE_RES = 1024;
  var VERT12 = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPos;
out vec2 vUv;
void main () {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;
  var FRAG_NOISE = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
float prnd (vec2 n, float period) {
  n = mod(n, period);
  float dt = dot(n, vec2(0.129898, 0.78233));
  return fract(sin(mod(dt, 3.14159265)) * 437.585453);
}
float pnoise (vec2 p, float period) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = prnd(i, period);
  float b = prnd(i + vec2(1.0, 0.0), period);
  float c = prnd(i + vec2(0.0, 1.0), period);
  float d = prnd(i + vec2(1.0, 1.0), period);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float pfbm (vec2 p, float period, int octaves) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    if (i >= octaves) break;
    v += a * pnoise(p, period);
    p = p * 2.0 + vec2(17.0, 31.0);
    period *= 2.0;
    a *= 0.5;
  }
  return v;
}
float pwarp (vec2 p, float period, float g) {
  float val = 0.0;
  for (int i = 0; i < 2; i++) {
    val = pfbm(
      p + g * vec2(cos(6.28318 * val), sin(6.28318 * val)), period, 4);
  }
  return val;
}
void main () {
  float pattern = pwarp(vUv * 20.0, 20.0, 4.0);
  float mottle = pfbm(vUv * 26.0, 26.0, 3);
  float sparkle =
    smoothstep(0.8, 0.95, pnoise(vUv * 200.0, 200.0)) *
    (0.35 + 0.65 * pnoise(vUv * 50.0, 50.0));
  float meltEdge = pfbm(vUv * 9.0, 9.0, 3);
  outColor = vec4(pattern, mottle, sparkle, meltEdge);
}`;
  var FRAG_HEIGHT = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
float prnd (vec2 n, float period) {
  n = mod(n, period);
  float dt = dot(n, vec2(0.129898, 0.78233));
  return fract(sin(mod(dt, 3.14159265)) * 437.585453);
}
float pnoise (vec2 p, float period) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = prnd(i, period);
  float b = prnd(i + vec2(1.0, 0.0), period);
  float c = prnd(i + vec2(0.0, 1.0), period);
  float d = prnd(i + vec2(1.0, 1.0), period);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float pfbm (vec2 p, float period, int octaves) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    if (i >= octaves) break;
    v += a * pnoise(p, period);
    p *= 2.0;
    period *= 2.0;
    a *= 0.5;
  }
  return v;
}
void main () {
  float broad = pfbm(vUv * 6.0, 6.0, 4);
  broad = broad * broad * 1.4;
  float fine = pfbm(vUv * 28.0, 28.0, 3);
  outColor = vec4(broad, fine, 0.0, 1.0);
}`;
  var FRAG_BLUR = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uScene;
uniform vec2 uTexelSize;
uniform vec2 uStep;
uniform float uFlipY;
WEIGHTS_PLACEHOLDER
vec2 srcUv (vec2 uv) {
  return uFlipY > 0.5 ? vec2(uv.x, 1.0 - uv.y) : uv;
}
void main () {
  vec4 sum = texture(uScene, srcUv(vUv)) * WEIGHT_CENTER;
  for (int i = 1; i < KERNEL_SIZE; i++) {
    vec2 delta = float(i) * uTexelSize * uStep;
    sum += texture(uScene, srcUv(clamp(vUv + delta, 0.0, 1.0))) * WEIGHTS[i - 1];
    sum += texture(uScene, srcUv(clamp(vUv - delta, 0.0, 1.0))) * WEIGHTS[i - 1];
  }
  outColor = sum;
}`;
  var FRAG_POINTER = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uBack;
uniform sampler2D uNoise;
uniform vec2 uPoint;
uniform vec2 uPrevPoint;
uniform vec2 uBackShift;
uniform vec2 uScroll;
uniform float uAspect;
uniform float uTextureScale;
uniform float uDecay;
uniform float uMeltNoise;
uniform float uMeltStrength;
uniform float uRadius;
uniform float uEdgeFade;
uniform float uTouching;
float sdSegment (vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  return length(pa - ba * h);
}
void main () {
  vec2 backUv = vUv + uBackShift;
  vec4 back = texture(uBack, backUv);
  float inside =
    step(0.0, backUv.x) * step(backUv.x, 1.0) *
    step(0.0, backUv.y) * step(backUv.y, 1.0);
  float melt = clamp(back.r * inside - uDecay, 0.0, 1.0);

  vec2 nUv = (vUv + uScroll) * vec2(uAspect, 1.0)
    / max(uTextureScale, 0.05);
  float n = texture(uNoise, nUv).a - 0.5;

  vec2 p = vUv * vec2(uAspect, 1.0);
  vec2 a = uPrevPoint * vec2(uAspect, 1.0);
  vec2 b = uPoint * vec2(uAspect, 1.0);
  float d = sdSegment(p, a, b) + n * uMeltNoise;

  float m =
    (1.0 - smoothstep(uRadius * 0.35, uRadius, d)) * uMeltStrength;
  vec2 dSide = min(vUv, 1.0 - vUv);
  float side = smoothstep(0.0, max(uEdgeFade, 1e-4), min(dSide.x, dSide.y));
  m *= mix(1.0, side, step(1e-3, uEdgeFade));
  m *= uTouching;

  melt = clamp(melt + m, 0.0, 1.0);
  outColor = vec4(vec3(melt), 1.0);
}`;
  var FRAG_FROST = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uContent;
uniform sampler2D uBlur;
uniform sampler2D uNoise;
uniform sampler2D uPointer;
uniform vec2 uScroll;
uniform float uAspect;
uniform float uTextureScale;
uniform float uMeltEdges;
uniform float uIntro;
uniform float uHighlight;
uniform float uStrength;
uniform float uFrost;
uniform float uContrast;
uniform float uCrispness;
uniform float uHaze;
uniform vec3 uTintThin;
uniform vec3 uTintThick;
uniform float uTintStrength;
uniform float uHighlightStrength;
uniform float uSaturation;
uniform float uBrightness;
uniform float uShimmer;
uniform float uTime;
uniform float uOpacity;
uniform float uHasContent;
float contrastFn (float x, float strength) {
  return clamp((x - 0.5) * strength + 0.5, 0.0, 1.0);
}
float rand2 (vec2 uv) {
  uv = floor(uv * 5000.0) / 5000.0;
  float a = dot(uv, vec2(92.0, 80.0));
  float b = dot(uv, vec2(41.0, 62.0));
  return fract(sin(a) + cos(b) * 51.0);
}
vec3 hsv2rgb (vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}
vec3 rgb2hsv (vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}
void main () {
  vec2 nUv = (vUv + uScroll) * vec2(uAspect, 1.0)
    / max(uTextureScale, 0.05);
  vec4 noise = texture(uNoise, nUv);
  float warpN = noise.r;

  float meltRaw = texture(uPointer, vUv).r;

  vec2 edgeDist = min(vUv, 1.0 - vUv);
  float edgeBoost =
    (1.0 - smoothstep(0.0, 0.4, min(edgeDist.x, edgeDist.y)))
    * (1.0 - uMeltEdges * smoothstep(0.0, 0.5, meltRaw));
  float strength = uStrength * (0.62 + 0.65 * edgeBoost);

  float ed = min(edgeDist.x, edgeDist.y)
    + (0.5 - warpN) * 0.34 + (0.5 - noise.g) * 0.16;
  float local = clamp((uIntro * 3.0 - ed * 2.0 - 0.3) / 1.1, 0.0, 1.0);
  strength *= local;

  float body = contrastFn(warpN * strength + uFrost * local, uContrast);

  vec2 gUv = vUv + uScroll;
  float h = rand2(gUv + warpN * 0.05);
  float grain = h * warpN;
  float glint = smoothstep(0.85, 1.0, h);
  glint *= mix(
    1.0,
    0.5 + 0.5 * sin(uTime * 2.4 + h * 6.28),
    clamp(uShimmer, 0.0, 1.0)
  );
  float micro = mix(grain, glint, uHighlight);

  float m = clamp(meltRaw * (1.1 + (noise.a - 0.5) * 0.9), 0.0, 1.0);

  float d = body - m * (0.9 + 0.35 * body);
  float frozen = smoothstep(0.0, 0.22, d);
  float wet = (1.0 - frozen) * (1.0 - smoothstep(0.0, 0.55, -d));
  wet *= smoothstep(0.01, 0.1, m);

  float cover = smoothstep(0.03, 0.35, body);
  float ice = clamp(
    contrastFn(micro * cover * frozen + body, uCrispness), 0.0, 1.0);
  float frostMask = ice * frozen;

  vec2 wobble = vec2(noise.a - 0.5, noise.g - 0.5) * wet * 0.018;

  vec3 icy = mix(uTintThin, uTintThick, body);
  vec4 base;
  vec4 blur;
  if (uHasContent > 0.5) {
    vec2 cUv = clamp(vUv + wobble, 0.0, 1.0);
    base = texture(uContent, vec2(cUv.x, 1.0 - cUv.y));
    blur = texture(uBlur, cUv);
  } else {
    base = vec4(icy, 1.0);
    blur = base;
  }
  float blurMix = clamp(
    frostMask + uHaze * max(frozen, wet * 0.5), 0.0, 1.0);
  vec4 color = mix(base, blur, blurMix);

  vec3 hsv = rgb2hsv(color.rgb);
  hsv.y = clamp(hsv.y * uSaturation, 0.0, 1.0);
  hsv.z = clamp(hsv.z * uBrightness, 0.0, 1.0);
  vec3 adjusted = hsv2rgb(hsv);
  color.rgb = mix(color.rgb, adjusted, frostMask);

  vec3 frostTint = mix(uTintThin, uTintThick, body);
  vec3 frostColor = mix(color.rgb, frostTint, uTintStrength);
  frostColor = mix(
    frostColor,
    vec3(1.0),
    glint * uHighlightStrength * step(0.001, uHighlight));

  color.rgb = mix(color.rgb, frostColor, frostMask);
  color.rgb += wet * glint * 0.25;

  float op = clamp(uOpacity, 0.0, 1.0);
  color.rgb = mix(base.rgb, color.rgb, op);
  outColor = vec4(clamp(color.rgb, 0.0, 1.0), frostMask * op);
}`;
  var FRAG_OUTPUT = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uFrost;
uniform sampler2D uHeights;
uniform float uIor;
uniform float uRefraction;
uniform float uDetail;
uniform float uTextureScale;
uniform float uFresnel;
uniform vec2 uScrollPx;
uniform float uHasContent;
uniform float uFallbackAlpha;

const float TEXEL = 1.0 / ${HEIGHT_RES}.0;

vec3 heightNormal (float channel, vec2 mapUv, float bump) {
  vec2 hx = vec2(TEXEL, 0.0);
  vec2 hy = vec2(0.0, TEXEL);
  vec2 c = texture(uHeights, mapUv).rg;
  vec2 x = texture(uHeights, mapUv + hx).rg;
  vec2 y = texture(uHeights, mapUv + hy).rg;
  float dx = channel < 0.5 ? x.r - c.r : x.g - c.g;
  float dy = channel < 0.5 ? y.r - c.r : y.g - c.g;
  return normalize(vec3(-dx * bump, -dy * bump, 1.0));
}

void main () {
  vec2 baseUv = vUv;
  float frostMask = texture(uFrost, baseUv).a;

  vec3 V = vec3(0.0, 0.0, 1.0);

  float mainScale = max(uTextureScale, 0.05) * 900.0;
  float subScale = max(uTextureScale, 0.05) * 260.0;
  vec2 mapCoord = gl_FragCoord.xy + uScrollPx;
  vec2 mainUv = mapCoord / mainScale;
  vec2 subUv = mapCoord / subScale;

  vec3 nMain = heightNormal(0.0, mainUv, 14.0);
  vec3 nSub = heightNormal(1.0, subUv, 8.0);

  float heightW = smoothstep(0.1, 0.95, texture(uHeights, mainUv).r);

  vec3 R1 = refract(-V, nMain, 1.0 / uIor);
  vec3 R2 = refract(-V, nSub, 1.0 / uIor);
  vec2 offset = (R1.xy * 0.3 + R2.xy * uDetail * heightW * 0.5)
    * uRefraction * 0.2;

  vec2 refractedUv = clamp(baseUv + offset, 0.0, 1.0);

  vec4 baseColor = texture(uFrost, vUv);
  vec4 refractedColor = texture(uFrost, refractedUv);

  float cosTheta = clamp(dot(-V, nMain), 0.0, 1.0);
  float F0 = pow((uIor - 1.0) / (uIor + 1.0), 2.0);
  float fresnel = F0 + (1.0 - F0) * pow(1.0 - cosTheta, 5.0);

  float refractionMix = frostMask;
  refractionMix = clamp(refractionMix * (1.0 + fresnel * uFresnel), 0.0, 1.0);

  vec4 mixed = mix(baseColor, refractedColor, refractionMix);
  if (uHasContent > 0.5) {
    outColor = vec4(mixed.rgb, 1.0);
  } else {
    float alpha = clamp(mixed.a * uFallbackAlpha, 0.0, 1.0);
    outColor = vec4(mixed.rgb * alpha, alpha);
  }
}`;
  function buildBlurWeights(kernel) {
    const weights = [];
    let total = 0;
    for (let i = 0; i < kernel; i++) {
      const w = Math.exp(-0.5 * (i * i) / (kernel * kernel * 0.25));
      weights.push(w);
      total += i === 0 ? w : w * 2;
    }
    const normalized = weights.map((w) => (w / total).toFixed(6));
    return [
      `#define KERNEL_SIZE ${kernel}`,
      `#define WEIGHT_CENTER ${normalized[0]}`,
      `const float WEIGHTS[KERNEL_SIZE - 1] = float[KERNEL_SIZE - 1](${normalized.slice(1).join(", ")});`
    ].join("\n");
  }
  function createFrost(elements, options = {}) {
    const config = { ...DEFAULTS13, ...options };
    const { source, content, output } = elements;
    const gl = output.getContext("webgl2", {
      alpha: true,
      depth: false,
      stencil: false,
      antialias: false,
      premultipliedAlpha: true
    });
    if (!gl || gl.isContextLost()) return null;
    const sourceCtx = source.getContext("2d");
    const paintable = source;
    const htmlInCanvas = Boolean(
      sourceCtx && typeof sourceCtx.drawElementImage === "function" && typeof paintable.requestPaint === "function"
    );
    if (htmlInCanvas) prepareHtmlInCanvas(source, content);
    let contentDirty = false;
    let contentReady = !htmlInCanvas;
    let wake = () => {
    };
    function captureContent() {
      try {
        sourceCtx.reset();
        drawHtmlInCanvas(source, sourceCtx, content);
        contentDirty = true;
        wake();
      } catch {
      }
    }
    if (htmlInCanvas) {
      paintable.onpaint = captureContent;
    }
    const halfFloat = Boolean(gl.getExtension("EXT_color_buffer_float"));
    const shaders = [];
    const programs = [];
    function compile(type, text) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, text);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error("Frost shader error:", gl.getShaderInfoLog(shader));
      }
      shaders.push(shader);
      return shader;
    }
    const vertexShader = compile(gl.VERTEX_SHADER, VERT12);
    function createProgram(fragSource) {
      const program = gl.createProgram();
      gl.attachShader(program, vertexShader);
      gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragSource));
      gl.linkProgram(program);
      programs.push(program);
      const uniforms = {};
      const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < count; i++) {
        const info = gl.getActiveUniform(program, i);
        uniforms[info.name] = gl.getUniformLocation(program, info.name);
      }
      return { program, uniforms };
    }
    const noiseProgram = createProgram(FRAG_NOISE);
    const heightProgram = createProgram(FRAG_HEIGHT);
    const blurProgram = createProgram(
      FRAG_BLUR.replace("WEIGHTS_PLACEHOLDER", buildBlurWeights(BLUR_KERNEL))
    );
    const pointerProgram = createProgram(FRAG_POINTER);
    const frostProgram = createProgram(FRAG_FROST);
    const outputProgram = createProgram(FRAG_OUTPUT);
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    function createTarget(width, height, useHalfFloat, wrap) {
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        useHalfFloat ? gl.RGBA16F : gl.RGBA8,
        width,
        height,
        0,
        gl.RGBA,
        useHalfFloat ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE,
        null
      );
      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D,
        texture,
        0
      );
      gl.viewport(0, 0, width, height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      return { fbo, texture, width, height };
    }
    function releaseTarget(target) {
      if (!target) return;
      gl.deleteFramebuffer(target.fbo);
      gl.deleteTexture(target.texture);
    }
    function createDoubleTarget(width, height, useHalfFloat) {
      let read = createTarget(width, height, useHalfFloat, gl.CLAMP_TO_EDGE);
      let write = createTarget(width, height, useHalfFloat, gl.CLAMP_TO_EDGE);
      return {
        get read() {
          return read;
        },
        get write() {
          return write;
        },
        swap() {
          const t = read;
          read = write;
          write = t;
        }
      };
    }
    let frostTarget = null;
    let blurA = null;
    let blurB = null;
    let pointer = null;
    const heightTarget = createTarget(HEIGHT_RES, HEIGHT_RES, false, gl.REPEAT);
    const noiseTarget = createTarget(NOISE_RES, NOISE_RES, false, gl.REPEAT);
    function blit(target) {
      if (target) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
        gl.viewport(0, 0, target.width, target.height);
      } else {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, output.width, output.height);
      }
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    function bindTexture(texture, unit) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      return unit;
    }
    gl.useProgram(heightProgram.program);
    blit(heightTarget);
    gl.useProgram(noiseProgram.program);
    blit(noiseTarget);
    const contentTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, contentTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([0, 0, 0, 0])
    );
    let blurDirty = true;
    let targetsReady = false;
    function rebuildTargets() {
      const width = Math.max(output.width, 1);
      const height = Math.max(output.height, 1);
      const blurScale = 0.35 * Math.min(Math.max(config.quality, 0.25), 1);
      const bw = Math.max(1, Math.round(width * blurScale));
      const bh = Math.max(1, Math.round(height * blurScale));
      releaseTarget(frostTarget);
      releaseTarget(blurA);
      releaseTarget(blurB);
      if (pointer) {
        releaseTarget(pointer.read);
        releaseTarget(pointer.write);
      }
      frostTarget = createTarget(width, height, false, gl.CLAMP_TO_EDGE);
      blurA = createTarget(bw, bh, false, gl.CLAMP_TO_EDGE);
      blurB = createTarget(bw, bh, false, gl.CLAMP_TO_EDGE);
      pointer = createDoubleTarget(
        Math.max(1, Math.round(width * 0.5)),
        Math.max(1, Math.round(height * 0.5)),
        halfFloat
      );
      targetsReady = true;
      blurDirty = true;
    }
    function syncCanvasSize() {
      const dpr = getCanvasPixelRatio(output, gl);
      const width = Math.max(1, Math.round(output.clientWidth * dpr));
      const height = Math.max(1, Math.round(output.clientHeight * dpr));
      if (output.width !== width || output.height !== height) {
        output.width = width;
        output.height = height;
        rebuildTargets();
      } else if (!targetsReady) {
        rebuildTargets();
      }
      if (htmlInCanvas) {
        const sourceWidth = Math.max(1, Math.round(source.clientWidth * dpr));
        const sourceHeight = Math.max(1, Math.round(source.clientHeight * dpr));
        if (source.width !== sourceWidth || source.height !== sourceHeight) {
          source.width = sourceWidth;
          source.height = sourceHeight;
        }
        paintable.requestPaint();
      }
    }
    syncCanvasSize();
    if (htmlInCanvas) captureContent();
    function uploadContent() {
      if (!htmlInCanvas || !contentDirty) return;
      contentDirty = false;
      blurDirty = true;
      gl.bindTexture(gl.TEXTURE_2D, contentTexture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        source
      );
      if (!contentReady) {
        contentReady = true;
        introStart = performance.now();
      }
    }
    function renderBlur() {
      if (!blurDirty || !htmlInCanvas || !blurA || !blurB) return;
      blurDirty = false;
      gl.useProgram(blurProgram.program);
      gl.uniform2f(
        blurProgram.uniforms.uTexelSize,
        1 / blurA.width,
        1 / blurA.height
      );
      gl.uniform1i(blurProgram.uniforms.uScene, bindTexture(contentTexture, 0));
      gl.uniform2f(blurProgram.uniforms.uStep, 0, 1);
      gl.uniform1f(blurProgram.uniforms.uFlipY, 1);
      blit(blurA);
      gl.uniform1i(blurProgram.uniforms.uScene, bindTexture(blurA.texture, 0));
      gl.uniform2f(blurProgram.uniforms.uStep, 1, 0);
      gl.uniform1f(blurProgram.uniforms.uFlipY, 0);
      blit(blurB);
    }
    let pointerOn = false;
    let pointerX = 0.5;
    let pointerY = 0.5;
    let prevPointerX = 0.5;
    let prevPointerY = 0.5;
    let lastScrollX = 0;
    let lastScrollY = 0;
    const MAX_PENDING_MELTS = 32;
    const MAX_MELTS_PER_FRAME = 4;
    const queuedMelts = [];
    function renderPointer() {
      if (!pointer) {
        queuedMelts.length = 0;
        return;
      }
      const cssW = Math.max(output.clientWidth, 1);
      const cssH = Math.max(output.clientHeight, 1);
      const sx = content.scrollLeft;
      const sy = content.scrollTop;
      gl.useProgram(pointerProgram.program);
      gl.uniform1i(
        pointerProgram.uniforms.uBack,
        bindTexture(pointer.read.texture, 0)
      );
      gl.uniform1i(
        pointerProgram.uniforms.uNoise,
        bindTexture(noiseTarget.texture, 1)
      );
      gl.uniform1f(
        pointerProgram.uniforms.uAspect,
        output.width / Math.max(output.height, 1)
      );
      gl.uniform2f(
        pointerProgram.uniforms.uBackShift,
        (sx - lastScrollX) / cssW,
        -(sy - lastScrollY) / cssH
      );
      gl.uniform2f(pointerProgram.uniforms.uScroll, sx / cssW, -sy / cssH);
      gl.uniform1f(pointerProgram.uniforms.uTextureScale, config.textureScale);
      gl.uniform1f(pointerProgram.uniforms.uDecay, config.refreeze * 1e-3);
      gl.uniform1f(pointerProgram.uniforms.uMeltNoise, config.meltNoise);
      gl.uniform1f(
        pointerProgram.uniforms.uMeltStrength,
        config.meltStrength * 0.2
      );
      gl.uniform1f(pointerProgram.uniforms.uRadius, config.meltRadius);
      gl.uniform1f(
        pointerProgram.uniforms.uEdgeFade,
        config.meltEdges ? 0 : config.edgeFade
      );
      if (queuedMelts.length > 0) {
        const count = Math.min(queuedMelts.length, MAX_MELTS_PER_FRAME);
        for (let i = 0; i < count; i++) {
          const [mx, my] = queuedMelts.shift();
          gl.uniform2f(pointerProgram.uniforms.uPoint, mx, 1 - my);
          gl.uniform2f(pointerProgram.uniforms.uPrevPoint, mx, 1 - my);
          gl.uniform1f(pointerProgram.uniforms.uTouching, 1);
          blit(pointer.write);
          pointer.swap();
          gl.uniform1i(
            pointerProgram.uniforms.uBack,
            bindTexture(pointer.read.texture, 0)
          );
          gl.uniform2f(pointerProgram.uniforms.uBackShift, 0, 0);
        }
      } else {
        gl.uniform2f(pointerProgram.uniforms.uPoint, pointerX, 1 - pointerY);
        gl.uniform2f(
          pointerProgram.uniforms.uPrevPoint,
          prevPointerX,
          1 - prevPointerY
        );
        gl.uniform1f(pointerProgram.uniforms.uTouching, pointerOn ? 1 : 0);
        blit(pointer.write);
        pointer.swap();
      }
      lastScrollX = sx;
      lastScrollY = sy;
      prevPointerX = pointerX;
      prevPointerY = pointerY;
    }
    function renderFrost(now) {
      if (!frostTarget || !pointer || !blurB) return;
      const cssW = Math.max(output.clientWidth, 1);
      const cssH = Math.max(output.clientHeight, 1);
      gl.useProgram(frostProgram.program);
      gl.uniform1i(
        frostProgram.uniforms.uContent,
        bindTexture(contentTexture, 0)
      );
      gl.uniform1i(frostProgram.uniforms.uBlur, bindTexture(blurB.texture, 1));
      gl.uniform1i(
        frostProgram.uniforms.uNoise,
        bindTexture(noiseTarget.texture, 2)
      );
      gl.uniform1i(
        frostProgram.uniforms.uPointer,
        bindTexture(pointer.read.texture, 3)
      );
      gl.uniform2f(
        frostProgram.uniforms.uScroll,
        content.scrollLeft / cssW,
        -content.scrollTop / cssH
      );
      gl.uniform1f(
        frostProgram.uniforms.uAspect,
        output.width / Math.max(output.height, 1)
      );
      gl.uniform1f(frostProgram.uniforms.uTextureScale, config.textureScale);
      gl.uniform1f(frostProgram.uniforms.uMeltEdges, config.meltEdges ? 1 : 0);
      gl.uniform1f(frostProgram.uniforms.uIntro, introProgress(now));
      gl.uniform1f(frostProgram.uniforms.uHighlight, config.highlight);
      gl.uniform1f(frostProgram.uniforms.uStrength, config.strength);
      gl.uniform1f(frostProgram.uniforms.uFrost, config.frost);
      gl.uniform1f(frostProgram.uniforms.uContrast, config.contrast);
      gl.uniform1f(frostProgram.uniforms.uCrispness, config.crispness);
      gl.uniform1f(frostProgram.uniforms.uHaze, config.haze);
      gl.uniform3f(
        frostProgram.uniforms.uTintThin,
        config.tintThin[0],
        config.tintThin[1],
        config.tintThin[2]
      );
      gl.uniform3f(
        frostProgram.uniforms.uTintThick,
        config.tintThick[0],
        config.tintThick[1],
        config.tintThick[2]
      );
      gl.uniform1f(frostProgram.uniforms.uTintStrength, config.tintStrength);
      gl.uniform1f(
        frostProgram.uniforms.uHighlightStrength,
        config.highlightStrength
      );
      gl.uniform1f(frostProgram.uniforms.uSaturation, config.saturation);
      gl.uniform1f(frostProgram.uniforms.uBrightness, config.brightness);
      gl.uniform1f(frostProgram.uniforms.uShimmer, config.shimmer);
      gl.uniform1f(frostProgram.uniforms.uTime, now / 1e3);
      gl.uniform1f(
        frostProgram.uniforms.uOpacity,
        Math.min(Math.max(config.opacity, 0), 1)
      );
      gl.uniform1f(frostProgram.uniforms.uHasContent, htmlInCanvas ? 1 : 0);
      blit(frostTarget);
    }
    function renderOutput() {
      if (!frostTarget) return;
      const dpr = output.width / Math.max(output.clientWidth, 1);
      gl.useProgram(outputProgram.program);
      gl.uniform1i(
        outputProgram.uniforms.uFrost,
        bindTexture(frostTarget.texture, 0)
      );
      gl.uniform1i(
        outputProgram.uniforms.uHeights,
        bindTexture(heightTarget.texture, 2)
      );
      gl.uniform1f(outputProgram.uniforms.uIor, Math.max(config.ior, 1.01));
      gl.uniform1f(outputProgram.uniforms.uRefraction, config.refraction);
      gl.uniform1f(outputProgram.uniforms.uDetail, config.detail);
      gl.uniform1f(outputProgram.uniforms.uTextureScale, config.textureScale);
      gl.uniform1f(outputProgram.uniforms.uFresnel, config.fresnel);
      gl.uniform2f(
        outputProgram.uniforms.uScrollPx,
        content.scrollLeft * dpr,
        -content.scrollTop * dpr
      );
      gl.uniform1f(outputProgram.uniforms.uHasContent, htmlInCanvas ? 1 : 0);
      gl.uniform1f(outputProgram.uniforms.uFallbackAlpha, 0.85);
      blit(null);
    }
    let raf = 0;
    let destroyed = false;
    let running = false;
    let visible = true;
    let activeUntil = 0;
    let introStart = performance.now();
    function introProgress(now) {
      const introMs = Math.max(config.introDuration, 0) * 1e3;
      if (introMs <= 0 || reducedMotion) return 1;
      const t = Math.min(Math.max((now - introStart) / introMs, 0), 1);
      return t * t * (3 - 2 * t);
    }
    function refreezeDelayMs() {
      const decay = Math.max(config.refreeze * 1e-3, 1e-5);
      return 1 / decay / 60 * 1e3 + 500;
    }
    function frame(now) {
      if (destroyed) return;
      if (!visible || document.hidden) {
        running = false;
        return;
      }
      gl.disable(gl.BLEND);
      uploadContent();
      if (!contentReady) {
        running = false;
        return;
      }
      renderBlur();
      if (queuedMelts.length > 0) activeUntil = now + refreezeDelayMs();
      renderPointer();
      renderFrost(now);
      renderOutput();
      const animating = pointerOn || now < activeUntil || now < introStart + Math.max(config.introDuration, 0) * 1e3 + 120 || contentDirty || config.shimmer > 1e-3 || queuedMelts.length > 0;
      if (!animating) {
        running = false;
        return;
      }
      raf = requestAnimationFrame(frame);
    }
    function start() {
      if (destroyed || running || !visible || document.hidden) return;
      running = true;
      raf = requestAnimationFrame(frame);
    }
    wake = start;
    start();
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reducedMotion = motionQuery.matches;
    function onMotionChange() {
      reducedMotion = motionQuery.matches;
      if (!reducedMotion) start();
    }
    motionQuery.addEventListener("change", onMotionChange);
    const rectCache = createRectCache(output);
    function suspend() {
      cancelAnimationFrame(raf);
      running = false;
      pointerOn = false;
      prevPointerX = pointerX;
      prevPointerY = pointerY;
    }
    function onVisibilityChange() {
      if (document.hidden) suspend();
      else start();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    function onPointerMove(event) {
      if (destroyed || reducedMotion || !visible || document.hidden) return;
      const rect = rectCache.current;
      pointerX = (event.clientX - rect.left) / Math.max(rect.width, 1);
      pointerY = (event.clientY - rect.top) / Math.max(rect.height, 1);
      pointerOn = true;
      activeUntil = performance.now() + refreezeDelayMs();
      start();
    }
    function onPointerLeave() {
      pointerOn = false;
      activeUntil = performance.now() + refreezeDelayMs();
      start();
    }
    const listenTarget = output.parentElement ?? output;
    listenTarget.addEventListener("pointermove", onPointerMove, { passive: true });
    listenTarget.addEventListener("pointerdown", onPointerMove, { passive: true });
    listenTarget.addEventListener(
      "pointerleave",
      onPointerLeave
    );
    listenTarget.addEventListener(
      "pointercancel",
      onPointerLeave
    );
    function onScroll() {
      activeUntil = Math.max(activeUntil, performance.now() + 400);
      if (htmlInCanvas) paintable.requestPaint?.();
      start();
    }
    content.addEventListener("scroll", onScroll, { passive: true });
    const observer = createCanvasResizeObserver(() => {
      if (destroyed) return;
      syncCanvasSize();
      start();
    });
    observer.observe(output);
    const intersection = new IntersectionObserver((entries) => {
      visible = entries[entries.length - 1]?.isIntersecting ?? true;
      if (destroyed) return;
      if (visible) start();
      else suspend();
    });
    intersection.observe(output);
    return {
      melt(x, y) {
        if (destroyed || reducedMotion) return;
        if (queuedMelts.length >= MAX_PENDING_MELTS) queuedMelts.shift();
        queuedMelts.push([x, y]);
        activeUntil = performance.now() + refreezeDelayMs();
        start();
      },
      setOptions(next) {
        if (destroyed) return;
        if (!Object.entries(next).some(
          ([key, value]) => config[key] !== value
        ))
          return;
        const { quality, ...rest } = next;
        const qualityChanged = quality !== void 0 && quality !== config.quality;
        Object.assign(config, rest);
        if (qualityChanged) {
          config.quality = quality;
          rebuildTargets();
        }
        activeUntil = Math.max(activeUntil, performance.now() + 100);
        start();
      },
      resize() {
        if (destroyed) return;
        syncCanvasSize();
        start();
      },
      destroy() {
        if (destroyed) return;
        destroyed = true;
        queuedMelts.length = 0;
        suspend();
        document.removeEventListener("visibilitychange", onVisibilityChange);
        rectCache.destroy();
        cancelAnimationFrame(raf);
        observer.disconnect();
        intersection.disconnect();
        motionQuery.removeEventListener("change", onMotionChange);
        releaseTarget(noiseTarget);
        releaseTarget(frostTarget);
        releaseTarget(blurA);
        releaseTarget(blurB);
        if (pointer) {
          releaseTarget(pointer.read);
          releaseTarget(pointer.write);
        }
        releaseTarget(heightTarget);
        gl.deleteTexture(contentTexture);
        programs.forEach((program) => gl.deleteProgram(program));
        shaders.forEach((shader) => gl.deleteShader(shader));
        gl.deleteBuffer(quad);
        if (htmlInCanvas) paintable.onpaint = null;
        content.removeEventListener("scroll", onScroll);
        listenTarget.removeEventListener(
          "pointermove",
          onPointerMove
        );
        listenTarget.removeEventListener(
          "pointerdown",
          onPointerMove
        );
        listenTarget.removeEventListener(
          "pointerleave",
          onPointerLeave
        );
        listenTarget.removeEventListener(
          "pointercancel",
          onPointerLeave
        );
      }
    };
  }

  // src/effects/frost.js
  var CONTROLS13 = {
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
    tintThick: color("Tint thick", "#eaf5ff")
  };
  var frost_default = {
    slug: "frost",
    name: "Frost",
    component: "Frost",
    description: "A frozen pane that melts under the cursor.",
    controls: CONTROLS13,
    toOptions(values) {
      const { tintThin, tintThick, meltEdges, ...rest } = values;
      return {
        ...rest,
        meltEdges,
        tintThin: hexToRgb(tintThin),
        tintThick: hexToRgb(tintThick)
      };
    },
    create: createFrost
  };

  // src/vendor/lib/Glass/GlassVanilla.ts
  var DEFAULTS14 = {
    shape: "circle",
    size: 120,
    aspect: 1.7,
    corner: 32,
    ior: 1.5,
    edge: 0.7,
    bevel: 4,
    depth: 250,
    aberration: 1,
    blur: 0,
    reflection: 1,
    shine: 0.01,
    zoom: 1.5,
    targets: "[data-glass-target]",
    follow: 0.2
  };
  var VERT13 = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPos;
void main () {
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;
  var FRAG9 = `#version 300 es
precision highp float;
out vec4 outColor;
uniform sampler2D uContent;
uniform vec2 uResolution;
uniform float uMaxX;
uniform float uHasContent;
uniform vec2 uCenter;
uniform vec2 uHalf;
uniform float uCorner;
uniform float uEdge;
uniform float uBevel;
uniform float uIor;
uniform float uDepth;
uniform float uAberration;
uniform float uBlur;
uniform float uReflect;
uniform float uShine;
uniform float uZoom;
uniform float uAlpha;

const float PI = 3.14159265358979;
const float AIR_IOR = 1.0003;
const vec3 INCIDENT = vec3(0.0, 0.0, 1.0);

float pow2 (float x) { return x * x; }
float pow5 (float x) { float x2 = x * x; return x2 * x2 * x; }
float linearStep (float e0, float e1, float x) {
  return clamp((x - e0) / (e1 - e0), 0.0, 1.0);
}

float sdf (vec2 p) {
  vec2 q = abs(p) - (uHalf - vec2(uCorner));
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - uCorner;
}

float ign (vec2 v) {
  return fract(52.9829189 * fract(0.06711056 * v.x + 0.00583715 * v.y));
}

vec3 page (vec2 px, float lod) {
  vec2 uv = px / uResolution;
  uv.x = clamp(uv.x, 0.0005, uMaxX - 0.0005);
  uv.y = clamp(uv.y, 0.0005, 0.9995);
  return pow(textureLod(uContent, vec2(uv.x, 1.0 - uv.y), lod).rgb, vec3(2.2));
}

float iorForWavelength (float wavelength) {
  float ab = uAberration * 0.1;
  return mix(uIor + ab, uIor - ab,
    1.0 - pow(1.0 - linearStep(450.0, 650.0, wavelength), 4.0));
}

vec3 pageAA (vec2 px, float minLod) {
  float footprint = max(length(fwidth(px)), 1.0);
  return page(px, max(minLod, log2(footprint)));
}

vec3 sampleRefraction (vec2 basePx, float rim, vec3 normal, float glassIor) {
  vec3 rv = refract(INCIDENT, normal, AIR_IOR / glassIor);
  rv /= abs(rv.z) / uDepth;

  return pageAA(basePx + rv.xy, uBlur * (1.0 + rim));
}

float fresnelSchlick (float cosTheta, float f0) {
  return f0 + (1.0 - f0) * pow5(1.0 - cosTheta);
}

float smithSchlickDenom (float cosTheta, float k) {
  return cosTheta * (1.0 - k) + k;
}

float ggx (float roughness, float NDotL, float NDotV, float NDotH) {
  if (NDotL <= 0.0) return 0.0;
  float a2 = pow2(roughness);
  float d = a2 / (PI * pow2(pow2(NDotH) * (a2 - 1.0) + 1.0));
  float k = roughness * 0.5;
  float v = 1.0 / (smithSchlickDenom(NDotL, k)
    * smithSchlickDenom(clamp(NDotV, 0.0, 1.0), k));
  return NDotL * d * v;
}

void main () {
  vec2 fragPx = gl_FragCoord.xy;
  vec2 p = fragPx - uCenter;
  float sd = sdf(p);

  float aa = 1.5;
  float mask = 1.0 - smoothstep(-aa, 0.0, sd);
  float alpha = mask * uAlpha
    * (1.0 - step(uMaxX, fragPx.x / uResolution.x));

  float minHalf = min(uHalf.x, uHalf.y);
  float edgeW = max(minHalf * (1.0 - clamp(uEdge, 0.0, 0.98)), 1.0);
  float rim = pow(linearStep(-edgeW, 0.0, sd), uBevel);

  float scatter = min(uBlur, 1.0) * 0.02;
  float randAngle = ign(fragPx) * PI * 2.0;
  vec3 flatNormal = normalize(
    vec3(sin(randAngle) * scatter, cos(randAngle) * scatter, -1.0));
  float e = 1.0;
  vec2 grad = vec2(
    sdf(p + vec2(e, 0.0)) - sdf(p - vec2(e, 0.0)),
    sdf(p + vec2(0.0, e)) - sdf(p - vec2(0.0, e)));
  vec3 rimNormal = vec3(normalize(grad + vec2(1e-5)), 0.0);
  vec3 normal = normalize(mix(flatNormal, rimNormal, rim));

  if (uHasContent < 0.5) {
    float ldot = dot(rimNormal.xy, normalize(vec2(-0.6, 0.8)));
    float band = pow(rim, 1.8);
    float arcs = pow(abs(ldot), 3.0) * (ldot > 0.0 ? 0.5 : 0.28);
    float shine = band * (0.04 + arcs) * max(uShine, 0.5);
    float a = alpha * clamp(0.06 + 0.12 * rim, 0.0, 1.0);
    outColor = vec4(vec3(shine * 1.6) * alpha, a);
    return;
  }

  vec2 basePx = uCenter + p / uZoom;

  vec3 refracted;
  if (uAberration > 0.001) {
    refracted = sampleRefraction(basePx, rim, normal, iorForWavelength(611.4))
      * vec3(1.0, 0.0, 0.0);
    refracted += sampleRefraction(basePx, rim, normal, iorForWavelength(570.5))
      * vec3(1.0, 1.0, 0.0);
    refracted += sampleRefraction(basePx, rim, normal, iorForWavelength(549.1))
      * vec3(0.0, 1.0, 0.0);
    refracted += sampleRefraction(basePx, rim, normal, iorForWavelength(491.4))
      * vec3(0.0, 1.0, 1.0);
    refracted += sampleRefraction(basePx, rim, normal, iorForWavelength(464.2))
      * vec3(0.0, 0.0, 1.0);
    refracted += sampleRefraction(basePx, rim, normal, iorForWavelength(374.0))
      * vec3(1.0, 0.0, 1.0);
    refracted /= 3.0;
  } else {
    refracted = sampleRefraction(basePx, rim, normal, uIor);
  }

  vec3 glass = refracted;
  if (uReflect > 0.001) {
    const vec3 V = vec3(0.0, 0.0, -1.0);
    float NDotV = clamp(dot(V, normal), 0.0, 1.0);
    float f0 = pow2((uIor - AIR_IOR) / (uIor + AIR_IOR));
    float fresnelV = fresnelSchlick(NDotV, f0) * uReflect;

    vec3 reflectVector = reflect(INCIDENT, normal);
    vec3 L = reflectVector;
    vec3 H = normalize(L + V);
    reflectVector /= abs(reflectVector.z) / uDepth;
    vec3 reflected = page(basePx + reflectVector.xy, 2.5 + uBlur);
    reflected *= ggx(0.5, dot(normal, L), NDotV, dot(normal, H));
    glass = mix(refracted, reflected, clamp(fresnelV, 0.0, 1.0));
  }

  if (uShine > 0.001) {
    float ldot = dot(rimNormal.xy, normalize(vec2(-0.6, 0.8)));
    float band = pow(rim, 1.8);
    float arcs = pow(abs(ldot), 3.0) * (ldot > 0.0 ? 0.5 : 0.28);
    glass += band * (0.04 + arcs) * uShine;
  }

  outColor = vec4(pow(glass, vec3(1.0 / 2.2)) * alpha, alpha);
}`;
  function createGlass(elements, options = {}) {
    const config = { ...DEFAULTS14, ...options };
    const { source, content, output } = elements;
    const gl = output.getContext("webgl2", {
      alpha: true,
      depth: false,
      stencil: false,
      antialias: false,
      premultipliedAlpha: true
    });
    if (!gl || gl.isContextLost()) return null;
    const sourceCtx = source.getContext("2d");
    const paintable = source;
    const htmlInCanvas = Boolean(
      sourceCtx && typeof sourceCtx.drawElementImage === "function" && typeof paintable.requestPaint === "function"
    );
    if (htmlInCanvas) prepareHtmlInCanvas(source, content);
    let contentDirty = false;
    let wake = () => {
    };
    if (htmlInCanvas) {
      paintable.onpaint = () => {
        try {
          sourceCtx.reset();
          drawHtmlInCanvas(source, sourceCtx, content);
          contentDirty = true;
          wake();
        } catch {
        }
      };
    }
    function compile(type, text) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, text);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error("Glass shader error:", gl.getShaderInfoLog(shader));
      }
      return shader;
    }
    const vertexShader = compile(gl.VERTEX_SHADER, VERT13);
    const fragmentShader = compile(gl.FRAGMENT_SHADER, FRAG9);
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    const uniforms = {};
    const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < count; i++) {
      const info = gl.getActiveUniform(program, i);
      uniforms[info.name] = gl.getUniformLocation(program, info.name);
    }
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const contentTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, contentTexture);
    gl.texParameteri(
      gl.TEXTURE_2D,
      gl.TEXTURE_MIN_FILTER,
      gl.LINEAR_MIPMAP_LINEAR
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([0, 0, 0, 0])
    );
    gl.generateMipmap(gl.TEXTURE_2D);
    let contentMaxX = 1;
    function syncCanvasSize() {
      const dpr = getCanvasPixelRatio(output, gl);
      const width = Math.max(1, Math.round(output.clientWidth * dpr));
      const height = Math.max(1, Math.round(output.clientHeight * dpr));
      if (output.width !== width || output.height !== height) {
        output.width = width;
        output.height = height;
      }
      contentMaxX = Math.min(
        1,
        Math.max(0.05, content.clientWidth / Math.max(output.clientWidth, 1))
      );
      if (htmlInCanvas) {
        const sourceWidth = Math.max(1, Math.round(source.clientWidth * dpr));
        const sourceHeight = Math.max(1, Math.round(source.clientHeight * dpr));
        if (source.width !== sourceWidth || source.height !== sourceHeight) {
          source.width = sourceWidth;
          source.height = sourceHeight;
        }
        paintable.requestPaint();
      }
    }
    syncCanvasSize();
    function uploadContent() {
      if (!htmlInCanvas || !contentDirty) return;
      contentDirty = false;
      gl.bindTexture(gl.TEXTURE_2D, contentTexture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        source
      );
      gl.generateMipmap(gl.TEXTURE_2D);
    }
    let posX = output.clientWidth / 2;
    let posY = output.clientHeight / 2;
    let presence = 0;
    let presenceTarget = 0;
    let targetX = posX;
    let targetY = posY;
    let zoom = 1;
    let zoomTarget = 1;
    let hasPointer = false;
    function halfExtents() {
      const size = Math.max(config.size, 8);
      if (config.shape === "rectangle") {
        return [size * Math.min(Math.max(config.aspect, 1), 4), size];
      }
      return [size, size];
    }
    function render() {
      uploadContent();
      const dpr = output.width / Math.max(output.clientWidth, 1);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, output.width, output.height);
      gl.disable(gl.SCISSOR_TEST);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (presence <= 4e-3) return;
      const [baseHalfW, baseHalfH] = halfExtents();
      const halfW = baseHalfW * presence;
      const halfH = baseHalfH * presence;
      const alpha = Math.min(presence * 5, 1);
      const cx = posX * dpr;
      const cy = output.height - posY * dpr;
      const margin = 4 * dpr;
      const sx = Math.max(0, Math.floor(cx - halfW * dpr - margin));
      const sy = Math.max(0, Math.floor(cy - halfH * dpr - margin));
      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(
        sx,
        sy,
        Math.min(output.width - sx, Math.ceil(halfW * dpr * 2 + margin * 2)),
        Math.min(output.height - sy, Math.ceil(halfH * dpr * 2 + margin * 2))
      );
      gl.useProgram(program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, contentTexture);
      gl.uniform1i(uniforms.uContent, 0);
      gl.uniform2f(uniforms.uResolution, output.width, output.height);
      gl.uniform1f(uniforms.uMaxX, contentMaxX);
      gl.uniform1f(uniforms.uHasContent, htmlInCanvas ? 1 : 0);
      gl.uniform2f(uniforms.uCenter, cx, cy);
      gl.uniform2f(uniforms.uHalf, halfW * dpr, halfH * dpr);
      const corner = config.shape === "circle" ? Math.min(halfW, halfH) : Math.min(Math.max(config.corner, 0), Math.min(halfW, halfH));
      gl.uniform1f(uniforms.uCorner, corner * dpr);
      gl.uniform1f(uniforms.uEdge, Math.min(Math.max(config.edge, 0), 0.98));
      gl.uniform1f(uniforms.uBevel, Math.max(config.bevel, 0.5));
      gl.uniform1f(uniforms.uIor, Math.min(Math.max(config.ior, 1.01), 2.5));
      gl.uniform1f(uniforms.uDepth, Math.max(config.depth, 0) * dpr);
      gl.uniform1f(uniforms.uAberration, Math.max(config.aberration, 0));
      gl.uniform1f(uniforms.uBlur, Math.max(config.blur, 0));
      gl.uniform1f(uniforms.uReflect, Math.max(config.reflection, 0));
      gl.uniform1f(uniforms.uShine, Math.max(config.shine, 0));
      gl.uniform1f(uniforms.uZoom, Math.max(zoom, 1));
      gl.uniform1f(uniforms.uAlpha, alpha);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.disable(gl.SCISSOR_TEST);
    }
    let raf = 0;
    let lastTime = performance.now();
    let destroyed = false;
    let running = false;
    let visible = true;
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reducedMotion = motionQuery.matches;
    function frame(now) {
      if (destroyed) return;
      if (!visible) {
        running = false;
        return;
      }
      const delta = Math.min((now - lastTime) / 1e3, 1 / 30);
      lastTime = now;
      const follow = Math.min(Math.max(config.follow, 0.02), 1);
      const kPos = reducedMotion || follow >= 1 ? 1 : 1 - Math.exp(-delta * (4 + follow * 26));
      const kZoom = reducedMotion ? 1 : 1 - Math.exp(-delta * 7);
      const kScale = reducedMotion ? 1 : 1 - Math.exp(-delta * 11);
      posX += (targetX - posX) * kPos;
      posY += (targetY - posY) * kPos;
      zoom += (zoomTarget - zoom) * kZoom;
      presence += (presenceTarget - presence) * kScale;
      render();
      const settled = Math.abs(targetX - posX) < 0.1 && Math.abs(targetY - posY) < 0.1 && Math.abs(zoomTarget - zoom) < 2e-3 && Math.abs(presenceTarget - presence) < 2e-3;
      if (settled && !contentDirty) {
        posX = targetX;
        posY = targetY;
        zoom = zoomTarget;
        presence = presenceTarget;
        running = false;
        return;
      }
      raf = requestAnimationFrame(frame);
    }
    function start() {
      if (destroyed || running || !visible) return;
      running = true;
      lastTime = performance.now();
      raf = requestAnimationFrame(frame);
    }
    wake = start;
    start();
    const rectCache = createRectCache(output);
    function onPointerMove(event) {
      const rect = rectCache.current;
      targetX = event.clientX - rect.left;
      targetY = event.clientY - rect.top;
      if (!hasPointer) {
        posX = targetX;
        posY = targetY;
        hasPointer = true;
      }
      presenceTarget = 1;
      const target = event.target;
      zoomTarget = config.zoom > 1 && target?.closest?.(config.targets) ? Math.min(Math.max(config.zoom, 1), 4) : 1;
      start();
    }
    function onPointerLeave() {
      presenceTarget = 0;
      zoomTarget = 1;
      hasPointer = false;
      start();
    }
    content.addEventListener("pointermove", onPointerMove, { passive: true });
    content.addEventListener("pointerleave", onPointerLeave, { passive: true });
    function onScroll() {
      start();
    }
    content.addEventListener("scroll", onScroll, { passive: true });
    function onMotionChange() {
      reducedMotion = motionQuery.matches;
      start();
    }
    motionQuery.addEventListener("change", onMotionChange);
    const observer = createCanvasResizeObserver(() => {
      syncCanvasSize();
      start();
    });
    observer.observe(output);
    observer.observe(content);
    const intersection = new IntersectionObserver((entries) => {
      visible = entries[entries.length - 1]?.isIntersecting ?? true;
      if (visible) start();
    });
    intersection.observe(output);
    return {
      setOptions(next) {
        if (!Object.entries(next).some(
          ([key, value]) => config[key] !== value
        ))
          return;
        Object.assign(config, next);
        start();
      },
      resize() {
        syncCanvasSize();
        start();
      },
      destroy() {
        destroyed = true;
        rectCache.destroy();
        cancelAnimationFrame(raf);
        content.removeEventListener("pointermove", onPointerMove);
        content.removeEventListener("pointerleave", onPointerLeave);
        content.removeEventListener("scroll", onScroll);
        observer.disconnect();
        intersection.disconnect();
        motionQuery.removeEventListener("change", onMotionChange);
        gl.deleteTexture(contentTexture);
        gl.deleteProgram(program);
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
        gl.deleteBuffer(quad);
        if (htmlInCanvas) paintable.onpaint = null;
      }
    };
  }

  // src/effects/glass.js
  var CONTROLS14 = {
    shape: radio("Lens shape", "circle", [
      { value: "circle", label: "Circle" },
      { value: "square", label: "Square" },
      { value: "rectangle", label: "Rectangle" }
    ]),
    size: scrub("Size", 120, { min: 40, max: 280, step: 4, decimals: 0 }),
    aspect: scrub("Aspect", 1.7, { min: 1, max: 3, step: 0.05 }),
    corner: scrub("Corner", 32, { min: 0, max: 120, step: 2, decimals: 0 }),
    ior: scrub("IOR", 1.5, { min: 1.05, max: 2, step: 0.01 }),
    edge: scrub("Edge", 0.7, { min: 0, max: 0.95, step: 0.01 }),
    bevel: scrub("Bevel", 4, { min: 1, max: 10, step: 0.25 }),
    depth: scrub("Depth", 250, { min: 20, max: 800, step: 10, decimals: 0 }),
    aberration: scrub("Aberration", 1, { min: 0, max: 3, step: 0.05 }),
    blur: scrub("Blur", 0, { min: 0, max: 4, step: 0.1, decimals: 1 }),
    reflection: scrub("Reflection", 1, { min: 0, max: 2, step: 0.05 }),
    shine: scrub("Shine", 0.01, { min: 0, max: 2, step: 0.05 }),
    zoom: scrub("Zoom", 1.5, { min: 1, max: 3, step: 0.05 }),
    follow: scrub("Follow", 0.2, { min: 0.02, max: 1, step: 0.02 })
  };
  var TARGETS = "h1, h2, h3, a, button, code";
  var glass_default = {
    slug: "glass",
    name: "Glass",
    component: "Glass",
    description: "A crystal-ball lens that zooms on targets.",
    controls: CONTROLS14,
    toOptions(values) {
      return {
        ...values,
        targets: TARGETS
      };
    },
    create: createGlass
  };

  // src/vendor/lib/Glitch/GlitchVanilla.ts
  var DEFAULTS15 = {
    intensity: 1,
    interval: 3,
    duration: 0.4,
    slices: 24,
    shift: 30,
    rgbShift: 4,
    blocks: 0.5,
    noise: 0.35
  };
  var VERT14 = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPos;
out vec2 vUv;
void main () {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;
  var FRAG10 = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uContent;
uniform vec2 uResolution;
uniform float uSeed;
uniform float uAmp;
uniform float uSlices;
uniform float uShift;
uniform float uRgbShift;
uniform float uBlocks;
uniform float uNoise;
uniform float uMaxX;

float hash12 (vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec4 page (vec2 p) {
  p.x = clamp(p.x, 0.0005, uMaxX - 0.0005);
  p.y = clamp(p.y, 0.0005, 0.9995);
  return texture(uContent, vec2(p.x, 1.0 - p.y));
}

void main () {
  vec2 uv = vUv;
  if (uv.x > uMaxX) {
    outColor = vec4(0.0);
    return;
  }

  float e = uAmp;
  vec2 guv = uv;

  if (e > 0.001) {
    float band = floor(uv.y * uSlices);
    float pick = hash12(vec2(band, uSeed));
    float tear = step(1.0 - 0.3 * min(e, 1.0), pick);
    float dir = hash12(vec2(band, uSeed + 13.0)) * 2.0 - 1.0;
    guv.x += tear * dir * e * uShift / uResolution.x;

    float sub = floor(uv.y * uSlices * 7.0);
    float micro = hash12(vec2(sub, uSeed + 29.0));
    guv.x += (micro - 0.5) * e * uNoise * 3.0 / uResolution.x;

    vec2 cell = floor(guv * vec2(10.0, uSlices * 0.5));
    float br = hash12(cell + uSeed * 0.0173);
    if (br > 1.0 - 0.14 * uBlocks * min(e, 1.0)) {
      vec2 jump = vec2(
        hash12(cell + uSeed + 3.1) - 0.5,
        hash12(cell + uSeed + 7.7) - 0.5
      );
      guv += jump * vec2(0.08, 0.02) * e;
    }
  }

  float split = uRgbShift * e / uResolution.x;
  vec4 c = page(guv);
  float r = page(guv + vec2(split, 0.0)).r;
  float b = page(guv - vec2(split, 0.0)).b;
  vec4 col = vec4(r, c.g, b, c.a);

  if (e > 0.001 && uNoise > 0.001) {
    float grain = hash12(vUv * uResolution + uSeed * 5.3) - 0.5;
    float row = floor(vUv.y * uResolution.y);
    float flicker = hash12(vec2(row, uSeed + 41.0));
    float lines = step(0.985 - 0.01 * uNoise * e, flicker);
    col.rgb += (grain * 0.22 + lines * 0.35) * uNoise * min(e, 1.0) * col.a;
  }

  outColor = vec4(clamp(col.rgb, 0.0, 1.0) * col.a, col.a);
}`;
  function createGlitch(elements, options = {}) {
    const config = { ...DEFAULTS15, ...options };
    const { source, content, output } = elements;
    const gl = output.getContext("webgl2", {
      alpha: true,
      depth: false,
      stencil: false,
      antialias: false,
      premultipliedAlpha: true
    });
    if (!gl || gl.isContextLost()) return null;
    const sourceCtx = source.getContext("2d");
    const paintable = source;
    const htmlInCanvas = Boolean(
      sourceCtx && typeof sourceCtx.drawElementImage === "function" && typeof paintable.requestPaint === "function"
    );
    if (htmlInCanvas) prepareHtmlInCanvas(source, content);
    let contentDirty = false;
    let wake = () => {
    };
    if (htmlInCanvas) {
      paintable.onpaint = () => {
        try {
          sourceCtx.reset();
          drawHtmlInCanvas(source, sourceCtx, content);
          contentDirty = true;
          wake();
        } catch {
        }
      };
    }
    function compile(type, text) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, text);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error("Glitch shader error:", gl.getShaderInfoLog(shader));
      }
      return shader;
    }
    const vertexShader = compile(gl.VERTEX_SHADER, VERT14);
    const fragmentShader = compile(gl.FRAGMENT_SHADER, FRAG10);
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    const uniforms = {};
    const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < count; i++) {
      const info = gl.getActiveUniform(program, i);
      uniforms[info.name] = gl.getUniformLocation(program, info.name);
    }
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const contentTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, contentTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([0, 0, 0, 0])
    );
    let contentMaxX = 1;
    function syncCanvasSize() {
      const dpr = getCanvasPixelRatio(output, gl);
      const width = Math.max(1, Math.round(output.clientWidth * dpr));
      const height = Math.max(1, Math.round(output.clientHeight * dpr));
      if (output.width !== width || output.height !== height) {
        output.width = width;
        output.height = height;
      }
      contentMaxX = Math.min(
        1,
        Math.max(0.05, content.clientWidth / Math.max(output.clientWidth, 1))
      );
      if (htmlInCanvas) {
        const sourceWidth = Math.max(1, Math.round(source.clientWidth * dpr));
        const sourceHeight = Math.max(1, Math.round(source.clientHeight * dpr));
        if (source.width !== sourceWidth || source.height !== sourceHeight) {
          source.width = sourceWidth;
          source.height = sourceHeight;
        }
        paintable.requestPaint();
      }
    }
    syncCanvasSize();
    function uploadContent() {
      if (!htmlInCanvas || !contentDirty) return;
      contentDirty = false;
      gl.bindTexture(gl.TEXTURE_2D, contentTexture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        source
      );
    }
    let time = 0;
    let burstAt = 0.6;
    let burstSeed = 1;
    let envelope = 0;
    function advanceTimeline(delta) {
      time += delta;
      if (config.interval <= 0) {
        envelope = 1;
        return;
      }
      const sinceBurst = time - burstAt;
      const duration = Math.max(config.duration, 0.05);
      if (sinceBurst >= 0 && sinceBurst < duration) {
        const tail = 1 - Math.pow(sinceBurst / duration, 2);
        envelope = tail * (0.7 + 0.3 * hash(burstSeed + Math.floor(time * 24)));
      } else {
        envelope = 0;
        if (sinceBurst >= duration) {
          burstAt = time + Math.max(config.interval, 0.3) * (0.75 + 0.5 * Math.random());
          burstSeed = Math.floor(Math.random() * 1e3);
        }
      }
    }
    function hash(n) {
      const s = Math.sin(n * 127.1) * 43758.5453;
      return s - Math.floor(s);
    }
    function render() {
      uploadContent();
      const dpr = output.width / Math.max(output.clientWidth, 1);
      const amp = envelope * Math.max(config.intensity, 0);
      gl.useProgram(program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, contentTexture);
      gl.uniform1i(uniforms.uContent, 0);
      gl.uniform2f(uniforms.uResolution, output.width, output.height);
      gl.uniform1f(uniforms.uSeed, Math.floor(time * 24) + burstSeed);
      gl.uniform1f(uniforms.uAmp, amp);
      gl.uniform1f(uniforms.uSlices, Math.max(config.slices, 3));
      gl.uniform1f(uniforms.uShift, Math.max(config.shift, 0) * dpr);
      gl.uniform1f(uniforms.uRgbShift, Math.max(config.rgbShift, 0) * dpr);
      gl.uniform1f(uniforms.uBlocks, Math.min(Math.max(config.blocks, 0), 1));
      gl.uniform1f(uniforms.uNoise, Math.min(Math.max(config.noise, 0), 1));
      gl.uniform1f(uniforms.uMaxX, contentMaxX);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, output.width, output.height);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    let raf = 0;
    let lastTime = performance.now();
    let destroyed = false;
    let running = false;
    let visible = true;
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reducedMotion = motionQuery.matches;
    function frame(now) {
      if (destroyed) return;
      if (!visible) {
        running = false;
        return;
      }
      const delta = Math.min(Math.max((now - lastTime) / 1e3, 0), 1 / 30);
      lastTime = now;
      const wasActive = envelope > 0;
      if (!reducedMotion) advanceTimeline(delta);
      else envelope = 0;
      if (envelope > 0 || wasActive || contentDirty) render();
      if (reducedMotion && !contentDirty) {
        running = false;
        return;
      }
      raf = requestAnimationFrame(frame);
    }
    function start() {
      if (destroyed || running || !visible) return;
      running = true;
      lastTime = performance.now();
      raf = requestAnimationFrame(frame);
    }
    wake = start;
    start();
    function onMotionChange() {
      reducedMotion = motionQuery.matches;
      start();
    }
    motionQuery.addEventListener("change", onMotionChange);
    const observer = createCanvasResizeObserver(() => {
      syncCanvasSize();
      start();
    });
    observer.observe(output);
    observer.observe(content);
    const intersection = new IntersectionObserver((entries) => {
      visible = entries[entries.length - 1]?.isIntersecting ?? true;
      if (visible) start();
    });
    intersection.observe(output);
    return {
      setOptions(next) {
        if (!Object.entries(next).some(
          ([key, value]) => config[key] !== value
        ))
          return;
        Object.assign(config, next);
        start();
      },
      burst() {
        burstAt = time;
        burstSeed = Math.floor(Math.random() * 1e3);
        start();
      },
      resize() {
        syncCanvasSize();
        start();
      },
      destroy() {
        destroyed = true;
        cancelAnimationFrame(raf);
        observer.disconnect();
        intersection.disconnect();
        motionQuery.removeEventListener("change", onMotionChange);
        gl.deleteTexture(contentTexture);
        gl.deleteProgram(program);
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
        gl.deleteBuffer(quad);
        if (htmlInCanvas) paintable.onpaint = null;
      }
    };
  }

  // src/effects/glitch.js
  var CONTROLS15 = {
    intensity: scrub("Intensity", 1, { min: 0, max: 2, step: 0.05 }),
    interval: scrub("Interval", 3, { min: 0, max: 8, step: 0.25 }),
    duration: scrub("Duration", 0.4, { min: 0.1, max: 2, step: 0.05 }),
    slices: scrub("Slices", 24, { min: 4, max: 80, step: 1, decimals: 0 }),
    shift: scrub("Shift", 30, { min: 0, max: 120, step: 2, decimals: 0 }),
    rgbShift: scrub("RGB Shift", 4, { min: 0, max: 20, step: 0.5, decimals: 1 }),
    blocks: scrub("Blocks", 0.5, { min: 0, max: 1, step: 0.02 }),
    noise: scrub("Noise", 0.35, { min: 0, max: 1, step: 0.02 })
  };
  var glitch_default = {
    slug: "glitch",
    name: "Glitch",
    component: "Glitch",
    description: "Broadcast glitch bursts over the live page.",
    controls: CONTROLS15,
    toOptions(values) {
      return { ...values };
    },
    create: createGlitch
  };

  // src/vendor/lib/GlyphRain/GlyphRainVanilla.ts
  var DEFAULT_CHARSET = "\uFF71\uFF72\uFF73\uFF74\uFF75\uFF76\uFF77\uFF78\uFF79\uFF7A\uFF7B\uFF7C\uFF7D\uFF7E\uFF7F\uFF80\uFF81\uFF82\uFF83\uFF84\uFF85\uFF86\uFF87\uFF88\uFF89\uFF8A\uFF8B\uFF8C\uFF8D\uFF8E\uFF8F\uFF90\uFF91\uFF92\uFF93\uFF94\uFF95\uFF96\uFF97\uFF98\uFF99\uFF9A\uFF9B\uFF9C\uFF9D0123456789Z*+-<>\xA6=:.";
  var DEFAULTS16 = {
    charset: DEFAULT_CHARSET,
    cell: 15,
    color: [0.267, 0.455, 1],
    headColor: [0.169, 0.416, 1],
    speed: 0.2,
    speedVariance: 0.5,
    density: 0.15,
    trail: 0.65,
    glow: 1.75,
    mutate: 0,
    flicker: 0,
    layers: 2,
    dim: 0.5,
    light: 2.8,
    lightRadius: 240,
    lightHeight: 172,
    relief: 0.05,
    stir: 0.7,
    stirRadius: 260,
    settle: 0.9
  };
  var VERT15 = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPos;
out vec2 vUv;
void main () {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;
  var FRAG11 = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uContent;
uniform sampler2D uAtlas;
uniform sampler2D uWake;
uniform vec2 uResolution;
uniform float uTime;
uniform float uCell;
uniform float uGlyphCount;
uniform float uAtlasGrid;
uniform vec3 uColor;
uniform vec3 uHeadColor;
uniform float uSpeed;
uniform float uSpeedVar;
uniform float uDensity;
uniform float uTrail;
uniform float uGlow;
uniform float uMutate;
uniform float uFlicker;
uniform float uLayers;
uniform float uDim;
uniform float uLight;
uniform float uLightRadius;
uniform float uLightHeight;
uniform float uRelief;
uniform float uStir;
uniform float uScroll;
uniform float uPageLum;
uniform float uHasContent;

float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}

float hash21(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}

float glyphMask(vec2 px, float cell, float seed) {
  vec2 id = floor(px / cell);
  vec2 f = fract(px / cell);
  f = f * 0.74 + 0.13;
  f.x = 1.0 - f.x;
  float tick = floor(uTime * uMutate * 1.6 + hash21(id + seed) * 9.0);
  float idx = floor(
    hash21(id * 1.71 + vec2(seed + tick * 7.31, tick * 0.613)) * uGlyphCount
  );
  float gx = mod(idx, uAtlasGrid);
  float gy = floor(idx / uAtlasGrid);
  vec2 auv = (vec2(gx, gy) + f) / uAtlasGrid;
  return texture(uAtlas, auv).a;
}

float colSpeed(float col, float seed) {
  float variance = mix(0.35, 1.0, hash11(col * 0.37 + seed + 3.1));
  return uSpeed * mix(1.0, variance, uSpeedVar) * 0.5;
}

float colOffset(float col, float seed) {
  return hash11(col * 1.713 + seed) * 9.0;
}

vec2 wakeAt(float xpx) {
  float u = clamp(xpx / max(uResolution.x, 1.0), 0.0, 1.0);
  return texture(uWake, vec2(u, 0.5)).rg;
}

float lum(vec3 c) {
  return dot(c, vec3(0.299, 0.587, 0.114));
}

void main () {
  vec2 frag = vec2(gl_FragCoord.x, uResolution.y - gl_FragCoord.y + uScroll);
  vec2 cuv = vec2(vUv.x, 1.0 - vUv.y);
  float yn = 1.0 - frag.y / uResolution.y;

  const float scales[3] = float[3](1.0, 1.5, 2.2);
  const float weights[3] = float[3](1.0, 0.45, 0.22);
  const float seeds[3] = float[3](0.0, 19.7, 41.3);

  float g = 0.0;
  float headG = 0.0;
  for (int l = 0; l < 3; l++) {
    if (float(l) >= uLayers) break;
    float cell = uCell * scales[l];
    float col = floor(frag.x / cell);
    float sp = colSpeed(col, seeds[l]);
    float off = colOffset(col, seeds[l]);
    vec2 wk = uStir > 0.0 ? wakeAt((col + 0.5) * cell) : vec2(0.0);
    float exc = uStir * wk.y;
    float T = uTime * sp + off + sp * wk.x;
    float phase = fract(yn + T);
    float cyc = floor(yn + T);
    float gate = step(hash21(vec2(col, cyc) + seeds[l]), uDensity);
    float b = clamp(uTrail / (phase * 22.0), 0.0, 1.3) - 0.04;
    if (b <= 0.0 || gate < 0.5) continue;
    float flick = 1.0 + uFlicker * 0.6 *
      sin(uTime * 14.0 + hash21(vec2(col, cyc)) * 40.0 + phase * 30.0);
    float m = glyphMask(frag, cell, seeds[l] + cyc * 0.173);
    float cellYn = cell / uResolution.y;
    float head = 1.0 - smoothstep(0.0, cellYn * 1.2, phase);
    g += m * b * flick * weights[l] * (1.0 + head * uGlow * 1.4) *
      (1.0 + exc * 1.6);
    headG += m * head * weights[l] * uGlow * (1.0 + exc * 1.1);
  }
  g = max(g, 0.0);

  if (uHasContent < 0.5) {
    vec3 rainCol = mix(uColor, uHeadColor, clamp(headG, 0.0, 1.0));
    float a = clamp(g, 0.0, 1.0);
    outColor = vec4(rainCol * a, a);
    return;
  }

  vec2 e = vec2(3.0, 0.0) / uResolution;
  vec4 content = texture(uContent, cuv);
  float lC = lum(content.rgb);
  float lX1 = lum(texture(uContent, clamp(cuv - e.xy, 0.0, 1.0)).rgb);
  float lX2 = lum(texture(uContent, clamp(cuv + e.xy, 0.0, 1.0)).rgb);
  float lY1 = lum(texture(uContent, clamp(cuv - e.yx, 0.0, 1.0)).rgb);
  float lY2 = lum(texture(uContent, clamp(cuv + e.yx, 0.0, 1.0)).rgb);
  vec3 N = normalize(vec3(
    -(lX2 - lX1) * uRelief * 4.0,
    -(lY2 - lY1) * uRelief * 4.0,
    1.0
  ));
  float reliefMix = clamp(uRelief, 0.0, 1.0);
  vec2 e2 = vec2(30.0, 0.0) / uResolution;
  float bgL = (lC
    + lum(texture(uContent, clamp(cuv - e2.xy, 0.0, 1.0)).rgb)
    + lum(texture(uContent, clamp(cuv + e2.xy, 0.0, 1.0)).rgb)
    + lum(texture(uContent, clamp(cuv - e2.yx, 0.0, 1.0)).rgb)
    + lum(texture(uContent, clamp(cuv + e2.yx, 0.0, 1.0)).rgb)) * 0.2;
  float bright = smoothstep(0.55, 0.8, uPageLum) * smoothstep(0.2, 0.45, bgL);

  float lightSum = 0.0;
  float sigma2 = uLightRadius * uLightRadius * 0.5;
  float reach = uLightRadius * 1.6;
  float stride = max(1.0, ceil((uLightRadius * 1.7) / (uCell * 12.0)));
  float baseCol = floor(floor(frag.x / uCell) / stride);
  for (int o = -12; o <= 12; o++) {
    float c = (baseCol + float(o)) * stride;
    if (c < 0.0) continue;
    float dx = (c + 0.5) * uCell - frag.x;
    float wx = 1.0 - smoothstep(reach * 0.7, reach, abs(dx));
    if (wx <= 0.0) continue;
    float sp = colSpeed(c, 0.0);
    float off = colOffset(c, 0.0);
    vec2 wk = uStir > 0.0 ? wakeAt((c + 0.5) * uCell) : vec2(0.0);
    float lampBoost = 1.0 + uStir * wk.y * 1.4;
    float T = uTime * sp + off + sp * wk.x;
    float s = 1.0 - frag.y / uResolution.y + T;
    float k0 = floor(s);
    for (int h = 0; h < 2; h++) {
      float k = k0 + float(h);
      float gate = step(hash21(vec2(c, k)), uDensity);
      if (gate < 0.5) continue;
      float lamp = 0.6 + 0.4 * hash11(c * 3.97 + k * 0.713);
      float headDocY = (1.0 - (k - T)) * uResolution.y;
      vec3 dv = vec3(dx, headDocY - frag.y, uLightHeight);
      float d2 = dot(dv, dv);
      float att = exp(-d2 / sigma2);
      vec3 L = dv * inversesqrt(max(d2, 1.0));
      float dif = mix(1.0, 0.25 + 0.75 * max(dot(N, L), 0.0), reliefMix);
      lightSum += att * dif * wx * lamp * lampBoost;
    }
  }
  float ls = lightSum * uLight * (0.6 + 0.4 * uGlow);
  float lit = 2.2 * ls / (ls + 1.1);

  float dimEff = uDim * (1.0 - bright);
  float shade = mix(
    clamp(1.0 - dimEff, 0.0, 1.0),
    1.0,
    smoothstep(0.0, 1.0, lit)
  );
  vec3 col = content.rgb * shade;
  col += uColor * lit * 0.14 * (1.0 - lC * 0.75) * (1.0 - bright);
  col += uColor * clamp(lit - 1.0, 0.0, 1.0) * 0.1 * (1.0 - bright);

  vec3 glyphCol = mix(uColor, uColor * 0.24 + vec3(0.02), lC * (1.0 - bright));
  glyphCol = mix(glyphCol, uHeadColor, clamp(headG, 0.0, 1.0));
  glyphCol = mix(glyphCol, vec3(1.0), bright * clamp(headG - 0.6, 0.0, 0.4));
  float gA = clamp(g, 0.0, 1.0);
  float knock = gA * mix(mix(0.3, 0.88, lC), 1.0, bright);
  float paint = min(g, 1.5) * mix(1.0, mix(0.92, 1.0, bright), lC);
  col = col * (1.0 - knock) + glyphCol * paint;

  float alpha = max(content.a, gA);
  col = clamp(col, vec3(0.0), vec3(alpha));
  outColor = vec4(col, alpha);
}`;
  function buildAtlas(charset) {
    const glyphs = Array.from(new Set(Array.from(charset))).filter(
      (g) => g.trim().length > 0
    );
    if (glyphs.length === 0) glyphs.push("0", "1");
    const count = glyphs.length;
    const grid = Math.max(Math.ceil(Math.sqrt(count)), 1);
    const cellPx = 64;
    const canvas = document.createElement("canvas");
    canvas.width = grid * cellPx;
    canvas.height = grid * cellPx;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `600 ${Math.round(cellPx * 0.72)}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    for (let i = 0; i < count; i++) {
      const x = (i % grid + 0.5) * cellPx;
      const y = (Math.floor(i / grid) + 0.5) * cellPx;
      ctx.fillText(glyphs[i], x, y);
    }
    return { canvas, count, grid };
  }
  function createGlyphRain(elements, options = {}) {
    const config = { ...DEFAULTS16, ...options };
    const { source, content, output } = elements;
    const gl = output.getContext("webgl2", {
      alpha: true,
      depth: false,
      stencil: false,
      antialias: false,
      premultipliedAlpha: true
    });
    if (!gl || gl.isContextLost()) return null;
    const sourceCtx = source.getContext("2d");
    const paintable = source;
    const htmlInCanvas = Boolean(
      sourceCtx && typeof sourceCtx.drawElementImage === "function" && typeof paintable.requestPaint === "function"
    );
    if (htmlInCanvas) prepareHtmlInCanvas(source, content);
    let contentDirty = false;
    let pageLum = 0;
    let wake = () => {
    };
    function readPageLum() {
      try {
        const probe = document.createElement("canvas");
        probe.width = probe.height = 1;
        const pctx = probe.getContext("2d", { willReadFrequently: true });
        if (!pctx) return 0;
        let el = content;
        while (el instanceof Element) {
          const bgColor = getComputedStyle(el).backgroundColor;
          if (bgColor && bgColor !== "transparent") {
            pctx.clearRect(0, 0, 1, 1);
            pctx.fillStyle = bgColor;
            pctx.fillRect(0, 0, 1, 1);
            const d = pctx.getImageData(0, 0, 1, 1).data;
            if (d[3] > 128) {
              return (0.2126 * d[0] + 0.7152 * d[1] + 0.0722 * d[2]) / 255;
            }
          }
          el = el.parentElement;
        }
      } catch {
      }
      return 0;
    }
    if (htmlInCanvas) {
      paintable.onpaint = () => {
        try {
          sourceCtx.reset();
          drawHtmlInCanvas(source, sourceCtx, content);
          contentDirty = true;
          wake();
        } catch {
        }
      };
    }
    function compile(type, text) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, text);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error("GlyphRain shader error:", gl.getShaderInfoLog(shader));
      }
      return shader;
    }
    const vertexShader = compile(gl.VERTEX_SHADER, VERT15);
    const fragmentShader = compile(gl.FRAGMENT_SHADER, FRAG11);
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    const uniforms = {};
    const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < count; i++) {
      const info = gl.getActiveUniform(program, i);
      uniforms[info.name] = gl.getUniformLocation(program, info.name);
    }
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const contentTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, contentTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([0, 0, 0, 0])
    );
    const atlasTexture = gl.createTexture();
    let atlasCount = 1;
    let atlasGrid = 1;
    let atlasCharset = "";
    function syncAtlas() {
      if (config.charset === atlasCharset) return;
      atlasCharset = config.charset;
      const atlas = buildAtlas(config.charset);
      atlasCount = atlas.count;
      atlasGrid = atlas.grid;
      gl.bindTexture(gl.TEXTURE_2D, atlasTexture);
      gl.texParameteri(
        gl.TEXTURE_2D,
        gl.TEXTURE_MIN_FILTER,
        gl.LINEAR_MIPMAP_LINEAR
      );
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        atlas.canvas
      );
      gl.generateMipmap(gl.TEXTURE_2D);
    }
    syncAtlas();
    let dpr = 1;
    function syncCanvasSize() {
      dpr = getCanvasPixelRatio(output, gl);
      const width = Math.max(1, Math.round(output.clientWidth * dpr));
      const height = Math.max(1, Math.round(output.clientHeight * dpr));
      if (output.width !== width || output.height !== height) {
        output.width = width;
        output.height = height;
      }
      if (htmlInCanvas) {
        const sourceWidth = Math.max(1, Math.round(source.clientWidth * dpr));
        const sourceHeight = Math.max(1, Math.round(source.clientHeight * dpr));
        if (source.width !== sourceWidth || source.height !== sourceHeight) {
          source.width = sourceWidth;
          source.height = sourceHeight;
        }
        paintable.requestPaint();
      }
    }
    syncCanvasSize();
    function uploadContent() {
      if (!htmlInCanvas || !contentDirty) return;
      contentDirty = false;
      pageLum = readPageLum();
      gl.bindTexture(gl.TEXTURE_2D, contentTexture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        source
      );
      sourceCtx.clearRect(0, 0, source.width, source.height);
    }
    let time = 7.3;
    const WAKE_RES = 256;
    const wakeCharge = new Float32Array(WAKE_RES);
    const wakeField = new Float32Array(WAKE_RES * 2);
    let wakeLive = false;
    let wakeTouched = false;
    let pointerX = 0;
    let tracking = false;
    const wakeTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, wakeTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RG32F,
      WAKE_RES,
      1,
      0,
      gl.RG,
      gl.FLOAT,
      wakeField
    );
    function stirAmount() {
      return Math.min(Math.max(config.stir, 0), 1);
    }
    function wakeSpan() {
      const width = Math.max(output.clientWidth, 1);
      const px = Math.min(Math.max(config.stirRadius, 8), 2e3);
      return Math.max(px / width, 1 / WAKE_RES);
    }
    function stepWake(delta) {
      const stir = stirAmount();
      const settleT = Math.min(Math.max(config.settle, 0.05), 8);
      const decay = Math.exp(-delta / settleT);
      const span = wakeSpan();
      const drive = stir > 1e-3 && !reducedMotion;
      const track = drive && tracking;
      let live = false;
      for (let i = 0; i < WAKE_RES; i++) {
        let charge = wakeCharge[i] * decay;
        if (track) {
          const d = Math.abs((i + 0.5) / WAKE_RES - pointerX) / span;
          if (d < 1) {
            const t = 1 - d;
            const target = t * t * (3 - 2 * t);
            if (target > charge) charge = target;
          }
        }
        if (charge < 1e-4) charge = 0;
        wakeCharge[i] = charge;
        if (charge > 0) {
          live = true;
          if (drive) {
            wakeField[i * 2] += delta * stir * 2.2 * charge;
            wakeTouched = true;
          }
        }
        wakeField[i * 2 + 1] = charge;
      }
      if (!live && !wakeLive) return;
      wakeLive = live;
      gl.bindTexture(gl.TEXTURE_2D, wakeTexture);
      gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,
        0,
        0,
        WAKE_RES,
        1,
        gl.RG,
        gl.FLOAT,
        wakeField
      );
    }
    function render() {
      uploadContent();
      gl.useProgram(program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, contentTexture);
      gl.uniform1i(uniforms.uContent, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, atlasTexture);
      gl.uniform1i(uniforms.uAtlas, 1);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, wakeTexture);
      gl.uniform1i(uniforms.uWake, 2);
      gl.uniform2f(uniforms.uResolution, output.width, output.height);
      gl.uniform1f(uniforms.uTime, time);
      gl.uniform1f(uniforms.uCell, Math.min(Math.max(config.cell, 8), 64) * dpr);
      gl.uniform1f(uniforms.uGlyphCount, atlasCount);
      gl.uniform1f(uniforms.uAtlasGrid, atlasGrid);
      gl.uniform3f(
        uniforms.uColor,
        config.color[0],
        config.color[1],
        config.color[2]
      );
      gl.uniform3f(
        uniforms.uHeadColor,
        config.headColor[0],
        config.headColor[1],
        config.headColor[2]
      );
      gl.uniform1f(uniforms.uSpeed, Math.min(Math.max(config.speed, 0.05), 3));
      gl.uniform1f(
        uniforms.uSpeedVar,
        Math.min(Math.max(config.speedVariance, 0), 1)
      );
      gl.uniform1f(uniforms.uDensity, Math.min(Math.max(config.density, 0), 1));
      gl.uniform1f(uniforms.uTrail, Math.min(Math.max(config.trail, 0.2), 3));
      gl.uniform1f(uniforms.uGlow, Math.min(Math.max(config.glow, 0), 3));
      gl.uniform1f(uniforms.uMutate, Math.min(Math.max(config.mutate, 0), 4));
      gl.uniform1f(uniforms.uFlicker, Math.min(Math.max(config.flicker, 0), 1));
      gl.uniform1f(
        uniforms.uLayers,
        Math.round(Math.min(Math.max(config.layers, 1), 3))
      );
      gl.uniform1f(uniforms.uDim, Math.min(Math.max(config.dim, 0), 1));
      gl.uniform1f(uniforms.uLight, Math.min(Math.max(config.light, 0), 3));
      gl.uniform1f(
        uniforms.uLightRadius,
        Math.min(Math.max(config.lightRadius, 20), 600) * dpr
      );
      gl.uniform1f(uniforms.uLightHeight, Math.max(config.lightHeight, 4) * dpr);
      gl.uniform1f(uniforms.uRelief, Math.min(Math.max(config.relief, 0), 2));
      gl.uniform1f(uniforms.uStir, wakeTouched ? stirAmount() : 0);
      gl.uniform1f(uniforms.uScroll, content.scrollTop * dpr);
      gl.uniform1f(uniforms.uPageLum, pageLum);
      gl.uniform1f(uniforms.uHasContent, htmlInCanvas ? 1 : 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, output.width, output.height);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    let raf = 0;
    let lastTime = performance.now();
    let destroyed = false;
    let running = false;
    let visible = true;
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reducedMotion = motionQuery.matches;
    function frame(now) {
      if (destroyed) return;
      if (!visible) {
        running = false;
        return;
      }
      const delta = Math.min((now - lastTime) / 1e3, 1 / 30);
      lastTime = now;
      if (!reducedMotion) time += delta;
      stepWake(delta);
      render();
      if (reducedMotion && !contentDirty) {
        running = false;
        return;
      }
      raf = requestAnimationFrame(frame);
    }
    function start() {
      if (destroyed || running || !visible) return;
      running = true;
      lastTime = performance.now();
      raf = requestAnimationFrame(frame);
    }
    wake = start;
    start();
    function onMotionChange() {
      reducedMotion = motionQuery.matches;
      if (reducedMotion) {
        tracking = false;
        wakeCharge.fill(0);
        for (let i = 0; i < WAKE_RES; i++) wakeField[i * 2 + 1] = 0;
        wakeLive = true;
      }
      start();
    }
    motionQuery.addEventListener("change", onMotionChange);
    content.addEventListener("scroll", start, { passive: true });
    const pointerHost = output.parentElement ?? output;
    function pointerNorm(event) {
      const box = output.getBoundingClientRect();
      if (box.width < 1) return -1;
      return (event.clientX - box.left) / box.width;
    }
    function onPointerMove(event) {
      if (reducedMotion) return;
      const x = pointerNorm(event);
      if (x < 0) return;
      pointerX = x;
      tracking = true;
      start();
    }
    function onPointerLeave() {
      tracking = false;
    }
    function onPointerDown(event) {
      if (reducedMotion || stirAmount() <= 1e-3) return;
      const x = pointerNorm(event);
      if (x < 0) return;
      pointerX = x;
      tracking = true;
      const span = wakeSpan() * 1.8;
      for (let i = 0; i < WAKE_RES; i++) {
        const d = Math.abs((i + 0.5) / WAKE_RES - x) / span;
        if (d >= 1) continue;
        const t = 1 - d;
        const burst = t * t * (3 - 2 * t);
        if (burst > wakeCharge[i]) wakeCharge[i] = burst;
      }
      start();
    }
    pointerHost.addEventListener("pointermove", onPointerMove, { passive: true });
    pointerHost.addEventListener("pointerleave", onPointerLeave, { passive: true });
    pointerHost.addEventListener("pointercancel", onPointerLeave, { passive: true });
    pointerHost.addEventListener("pointerdown", onPointerDown, { passive: true });
    const observer = createCanvasResizeObserver(() => {
      syncCanvasSize();
      start();
    });
    observer.observe(output);
    observer.observe(content);
    const intersection = new IntersectionObserver((entries) => {
      visible = entries[entries.length - 1]?.isIntersecting ?? true;
      if (visible) start();
    });
    intersection.observe(output);
    return {
      setOptions(next) {
        let changed = false;
        for (const [key, value] of Object.entries(next)) {
          const prev = config[key];
          if (Array.isArray(value) && Array.isArray(prev)) {
            if (value.length !== prev.length || value.some((item, i) => item !== prev[i])) {
              changed = true;
              break;
            }
          } else if (prev !== value) {
            changed = true;
            break;
          }
        }
        Object.assign(config, next);
        if (!changed) return;
        syncAtlas();
        syncCanvasSize();
        start();
      },
      resize() {
        syncCanvasSize();
        start();
      },
      destroy() {
        destroyed = true;
        cancelAnimationFrame(raf);
        observer.disconnect();
        intersection.disconnect();
        motionQuery.removeEventListener("change", onMotionChange);
        content.removeEventListener("scroll", start);
        pointerHost.removeEventListener("pointermove", onPointerMove);
        pointerHost.removeEventListener("pointerleave", onPointerLeave);
        pointerHost.removeEventListener("pointercancel", onPointerLeave);
        pointerHost.removeEventListener("pointerdown", onPointerDown);
        gl.deleteTexture(contentTexture);
        gl.deleteTexture(atlasTexture);
        gl.deleteTexture(wakeTexture);
        gl.deleteProgram(program);
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
        gl.deleteBuffer(quad);
        if (htmlInCanvas) paintable.onpaint = null;
      }
    };
  }

  // src/effects/glyph-rain.js
  var CONTROLS16 = {
    cell: scrub("Glyph size", 15, { min: 8, max: 48, step: 1, decimals: 0 }),
    speed: scrub("Speed", 0.2, { min: 0.05, max: 3, step: 0.05 }),
    speedVariance: scrub("Speed variance", 0.5, { min: 0, max: 1, step: 0.05 }),
    density: scrub("Density", 0.15, { min: 0, max: 1, step: 0.05 }),
    trail: scrub("Trail", 0.65, { min: 0.2, max: 3, step: 0.05 }),
    glow: scrub("Glow", 1.75, { min: 0, max: 3, step: 0.05 }),
    mutate: scrub("Mutation", 0, { min: 0, max: 4, step: 0.1 }),
    flicker: scrub("Flicker", 0, { min: 0, max: 1, step: 0.05 }),
    layers: scrub("Layers", 2, { min: 1, max: 3, step: 1, decimals: 0 }),
    dim: scrub("Page dim", 0.5, { min: 0, max: 1, step: 0.05 }),
    light: scrub("Light", 2.8, { min: 0, max: 3, step: 0.05 }),
    lightRadius: scrub("Light radius", 240, {
      min: 20,
      max: 600,
      step: 10,
      decimals: 0
    }),
    lightHeight: scrub("Light height", 172, {
      min: 4,
      max: 300,
      step: 2,
      decimals: 0
    }),
    relief: scrub("Relief", 0.05, { min: 0, max: 2, step: 0.05 }),
    stir: scrub("Stir", 0.7, { min: 0, max: 1, step: 0.05 }),
    stirRadius: scrub("Stir radius", 260, {
      min: 40,
      max: 900,
      step: 10,
      decimals: 0
    }),
    settle: scrub("Settle", 0.9, { min: 0.1, max: 4, step: 0.05 }),
    color: color("Rain color", "#4474ff"),
    headColor: color("Head color", "#2b6aff")
  };
  var glyph_rain_default = {
    slug: "glyph-rain",
    name: "Glyph Rain",
    component: "GlyphRain",
    description: "Falling glyphs that light up the page, and surge under the cursor.",
    controls: CONTROLS16,
    toOptions(values) {
      const { color: rainColor, headColor, ...rest } = values;
      return {
        ...rest,
        color: hexToRgb(rainColor),
        headColor: hexToRgb(headColor)
      };
    },
    create: createGlyphRain
  };

  // src/vendor/lib/Grid/GridVanilla.ts
  var DEFAULTS17 = {
    tileSize: 150,
    gap: 0,
    cornerRadius: 0,
    amplitude: 2.5,
    waveSpeed: 0.5,
    frequency: 12,
    waveWidth: 0.05,
    fadeTime: 0.2,
    maxLift: 1,
    jitter: 0,
    liftHeight: 60,
    perspective: 1200,
    tilt: 1,
    shading: 0.05,
    tint: [0, 0.33, 1],
    tintStrength: 0.1,
    idleRipples: 0
  };
  var MAX_TRAIL2 = 64;
  var TRAIL_SPACING = 0.03;
  var IDLE_DELAY = 3;
  var VERT16 = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPos;
out vec2 vUv;
void main () {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;
  var TILE_FRAG = `#version 300 es
precision highp float;
out vec4 outColor;
uniform sampler2D uTrail;
uniform int uTrailCount;
uniform float uWorldPerTile;
uniform float uWaveSpeed;
uniform float uFrequency;
uniform float uWaveWidth;
uniform float uFadeTime;
uniform float uAmplitude;
uniform float uJitter;
uniform float uMaxLift;

vec2 hash2 (vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453123) - 0.5;
}

void main () {
  vec2 tile = floor(gl_FragCoord.xy);
  vec2 world = (tile + 0.5) * uWorldPerTile + hash2(tile) * uJitter * 0.12;

  float waveHeight = 0.0;
  float totalWeight = 0.0;

  for (int i = 0; i < 64; i++) {
    if (i >= uTrailCount) break;

    vec4 td = texelFetch(uTrail, ivec2(i, 0), 0);
    vec2 delta = world - td.xy;
    float dist = length(delta);
    float relDist = dist - uWaveSpeed * td.z;

    float window = exp(-(relDist * relDist) / (uWaveWidth * uWaveWidth));

    float fade = exp(-td.z / uFadeTime);
    float atten = 1.0 / (1.0 + dist * 3.0);
    float weight = fade * window * atten * td.w;
    waveHeight += weight * cos(uFrequency * relDist);
    totalWeight += weight;
  }

  float lift = clamp(
    waveHeight / max(totalWeight, 1.0) * uAmplitude, -uMaxLift, uMaxLift
  );

  outColor = vec4(lift * 0.5 + 0.5, 0.0, 0.0, 1.0);
}`;
  var FRAG12 = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uContent;
uniform sampler2D uTiles;
uniform vec2 uResolution;
uniform ivec2 uGridTiles;
uniform float uTilePx;
uniform float uGapPx;
uniform float uCornerPx;
uniform float uLiftPx;
uniform float uPersp;
uniform vec2 uVanish;
uniform float uShading;
uniform vec3 uTint;
uniform float uTintStrength;
uniform float uMaxX;
uniform float uHasContent;

float tileLift (ivec2 idx) {
  idx = clamp(idx, ivec2(0), uGridTiles - 1);
  return texelFetch(uTiles, idx, 0).r * 2.0 - 1.0;
}

float roundedBox (vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

float tileSd (vec2 w, ivec2 idx, float halfSize) {
  vec2 center = (vec2(idx) + 0.5) * uTilePx;
  return roundedBox(w - center, vec2(halfSize), min(uCornerPx, halfSize));
}

vec2 unproject (vec2 p, float z) {
  return uVanish + (p - uVanish) * (uPersp - z) / uPersp;
}

void main () {
  if (vUv.x > uMaxX) {
    outColor = vec4(0.0);
    return;
  }

  vec2 pos = vUv * uResolution;
  float halfSize = uTilePx * 0.5 - uGapPx * 0.5;

  float bestZ = -1e6;
  float edgeSd = 1.0;
  ivec2 bestIdx = ivec2(-1);
  vec2 bestW = pos;
  float bestLift = 0.0;
  bool bestIsWall = false;
  vec2 wallN = vec2(0.0);
  ivec2 lastIdx = ivec2(-9999);

  for (int k = 0; k < 8; k++) {
    float probeZ = (float(k) / 3.5 - 1.0) * uLiftPx;
    ivec2 idx = clamp(
      ivec2(floor(unproject(pos, probeZ) / uTilePx)),
      ivec2(0), uGridTiles - 1
    );
    if (all(equal(idx, lastIdx))) continue;
    lastIdx = idx;

    float lift = tileLift(idx);
    float h = lift * uLiftPx;

    if (h <= bestZ) continue;

    vec2 wh = unproject(pos, h);
    float sdTop = tileSd(wh, idx, halfSize);

    if (sdTop < 0.75) {
      bestZ = h;
      edgeSd = sdTop;
      bestIdx = idx;
      bestW = wh;
      bestLift = lift;
      bestIsWall = false;
    } else if (h > 0.0) {
      float sd0 = tileSd(pos, idx, halfSize);
      if (sd0 < 0.75) {
        float za = 0.0;
        float zb = h;
        for (int r = 0; r < 3; r++) {
          float zm = (za + zb) * 0.5;
          float sm = tileSd(unproject(pos, zm), idx, halfSize);
          if (sm < 0.0) { za = zm; } else { zb = zm; }
        }
        float zStar = (za + zb) * 0.5;
        if (zStar > bestZ) {
          vec2 wz = unproject(pos, zStar);
          vec2 e = vec2(0.75, 0.0);
          wallN = normalize(vec2(
            tileSd(wz + e.xy, idx, halfSize) - tileSd(wz - e.xy, idx, halfSize),
            tileSd(wz + e.yx, idx, halfSize) - tileSd(wz - e.yx, idx, halfSize)
          ) + 1e-5);
          bestZ = zStar;
          edgeSd = sd0;
          bestIdx = idx;
          bestW = wz;
          bestLift = lift;
          bestIsWall = true;
        }
      }
    }
  }

  if (bestIdx.x < 0) {
    outColor = vec4(0.0);
    return;
  }
  float mask = 1.0 - smoothstep(-0.75, 0.75, edgeSd);
  if (mask <= 0.0) {
    outColor = vec4(0.0);
    return;
  }

  vec2 tileOrigin = vec2(bestIdx) * uTilePx;
  vec2 samplePos = clamp(bestW, tileOrigin + 0.5, tileOrigin + uTilePx - 0.5);
  vec2 sampleUv = samplePos / uResolution;
  sampleUv.x = min(sampleUv.x, uMaxX - 0.002);
  vec4 content;
  if (uHasContent > 0.5) {
    content = texture(uContent, vec2(sampleUv.x, 1.0 - sampleUv.y));
  } else {
    float liftAmt = clamp(abs(bestLift), 0.0, 1.0);
    content = vec4(
      mix(vec3(0.62), uTint, clamp(uTintStrength, 0.0, 1.0)),
      liftAmt * 0.55);
  }

  float t = clamp(bestLift, 0.0, 1.0) * uTintStrength;
  vec3 col;
  float alpha;

  if (bestIsWall) {
    vec2 lightDir = normalize(vec2(-0.55, 0.8));
    float facing = dot(wallN, lightDir);
    float shade = 1.0 - (0.5 - 0.32 * facing) * uShading;
    col = content.rgb * shade;

    alpha = uHasContent > 0.5 ? max(content.a, 0.85) : min(content.a * 1.5, 0.85);
  } else {
    float gx = tileLift(bestIdx + ivec2(1, 0)) - tileLift(bestIdx - ivec2(1, 0));
    float gy = tileLift(bestIdx + ivec2(0, 1)) - tileLift(bestIdx - ivec2(0, 1));
    float shade = (gy - gx) * 0.25 * uShading;
    shade += clamp(bestLift, -1.0, 1.0) * 0.1 * uShading;
    col = content.rgb * (1.0 + shade * 0.85) + shade * 0.12;
    alpha = clamp(content.a + t + abs(shade) * 0.5, 0.0, 1.0);
  }

  col = mix(col, uTint, t);
  float aOut = alpha * mask;
  outColor = vec4(col * aOut, aOut);
}`;
  function createGrid(elements, options = {}) {
    const config = { ...DEFAULTS17, ...options };
    const { source, content, output } = elements;
    const gl = output.getContext("webgl2", {
      alpha: true,
      depth: false,
      stencil: false,
      antialias: false,
      premultipliedAlpha: true
    });
    if (!gl || gl.isContextLost()) return null;
    const sourceCtx = source.getContext("2d");
    const paintable = source;
    const htmlInCanvas = Boolean(
      sourceCtx && typeof sourceCtx.drawElementImage === "function" && typeof paintable.requestPaint === "function"
    );
    if (htmlInCanvas) prepareHtmlInCanvas(source, content);
    let contentDirty = false;
    let wake = () => {
    };
    if (htmlInCanvas) {
      paintable.onpaint = () => {
        try {
          sourceCtx.reset();
          drawHtmlInCanvas(source, sourceCtx, content);
          contentDirty = true;
          wake();
        } catch {
        }
      };
    }
    function compile(type, text) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, text);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error("Grid shader error:", gl.getShaderInfoLog(shader));
      }
      return shader;
    }
    function link(fragText) {
      const vertexShader = compile(gl.VERTEX_SHADER, VERT16);
      const fragmentShader = compile(gl.FRAGMENT_SHADER, fragText);
      const program = gl.createProgram();
      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);
      const uniforms = {};
      const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < count; i++) {
        const info = gl.getActiveUniform(program, i);
        uniforms[info.name] = gl.getUniformLocation(program, info.name);
      }
      return { program, uniforms, vertexShader, fragmentShader };
    }
    const mainPass = link(FRAG12);
    const tilePass = link(TILE_FRAG);
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const contentTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, contentTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([0, 0, 0, 0])
    );
    const trailData = new Float32Array(MAX_TRAIL2 * 4);
    const trailTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, trailTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA32F,
      MAX_TRAIL2,
      1,
      0,
      gl.RGBA,
      gl.FLOAT,
      trailData
    );
    function dpr() {
      return getCanvasPixelRatio(output, gl);
    }
    let tileTexture = null;
    let tileFbo = null;
    let tilesX = 0;
    let tilesY = 0;
    function ensureTileTarget() {
      const tilePx = Math.max(config.tileSize, 8) * dpr();
      const nx = Math.max(1, Math.ceil(output.width / tilePx));
      const ny = Math.max(1, Math.ceil(output.height / tilePx));
      if (tileTexture && nx === tilesX && ny === tilesY) return;
      tilesX = nx;
      tilesY = ny;
      if (tileTexture) gl.deleteTexture(tileTexture);
      if (tileFbo) gl.deleteFramebuffer(tileFbo);
      tileTexture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tileTexture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        tilesX,
        tilesY,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        null
      );
      tileFbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, tileFbo);
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D,
        tileTexture,
        0
      );
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    let contentMaxX = 1;
    function syncCanvasSize() {
      const scale = dpr();
      const width = Math.max(1, Math.round(output.clientWidth * scale));
      const height = Math.max(1, Math.round(output.clientHeight * scale));
      if (output.width !== width || output.height !== height) {
        output.width = width;
        output.height = height;
      }
      contentMaxX = Math.min(
        1,
        Math.max(0.05, content.clientWidth / Math.max(output.clientWidth, 1))
      );
      if (htmlInCanvas) {
        const cssWidth = Math.max(1, Math.round(source.clientWidth));
        const cssHeight = Math.max(1, Math.round(source.clientHeight));
        if (source.width !== cssWidth * scale || source.height !== cssHeight * scale) {
          source.width = cssWidth * scale;
          source.height = cssHeight * scale;
        }
        paintable.requestPaint();
      }
    }
    syncCanvasSize();
    function uploadContent() {
      if (!htmlInCanvas || !contentDirty) return;
      contentDirty = false;
      gl.bindTexture(gl.TEXTURE_2D, contentTexture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        source
      );
    }
    const trail = [];
    let lastPoint = null;
    let timeSinceMove = IDLE_DELAY;
    let idleTimer = 0;
    function addTrailPoint(point) {
      if (trail.length >= MAX_TRAIL2) trail.shift();
      trail.push(point);
    }
    function updateTrail(delta) {
      const expiry = Math.max(config.fadeTime, 0.1) * 4;
      for (let i = trail.length - 1; i >= 0; i--) {
        trail[i].age += delta;
        if (trail[i].age > expiry) trail.splice(i, 1);
      }
      timeSinceMove += delta;
      if (config.idleRipples > 0 && timeSinceMove >= IDLE_DELAY) {
        idleTimer += delta;
        if (idleTimer >= config.idleRipples) {
          idleTimer = 0;
          const aspect = Math.max(output.clientWidth, 1) / Math.max(output.clientHeight, 1);
          addTrailPoint({
            x: (0.2 + Math.random() * 0.6) * aspect,
            y: 0.2 + Math.random() * 0.6,
            age: 0,
            strength: 0.8 + Math.random() * 0.3
          });
        }
      }
      const count = Math.min(trail.length, MAX_TRAIL2);
      for (let i = 0; i < count; i++) {
        const ti = i * 4;
        trailData[ti] = trail[i].x;
        trailData[ti + 1] = trail[i].y;
        trailData[ti + 2] = trail[i].age;
        trailData[ti + 3] = trail[i].strength;
      }
      gl.bindTexture(gl.TEXTURE_2D, trailTexture);
      gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,
        0,
        0,
        MAX_TRAIL2,
        1,
        gl.RGBA,
        gl.FLOAT,
        trailData
      );
      return count;
    }
    let vanishX = 0.5;
    let vanishY = 0.5;
    let vanishTargetX = 0.5;
    let vanishTargetY = 0.5;
    function render(trailCount, delta) {
      uploadContent();
      ensureTileTarget();
      const scale = output.width / Math.max(output.clientWidth, 1);
      const tilePx = Math.max(config.tileSize, 8) * scale;
      const ease = 1 - Math.exp(-delta * 4);
      vanishX += (vanishTargetX - vanishX) * ease;
      vanishY += (vanishTargetY - vanishY) * ease;
      gl.useProgram(tilePass.program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, trailTexture);
      gl.uniform1i(tilePass.uniforms.uTrail, 0);
      gl.uniform1i(tilePass.uniforms.uTrailCount, trailCount);
      gl.uniform1f(tilePass.uniforms.uWorldPerTile, tilePx / output.height);
      gl.uniform1f(
        tilePass.uniforms.uWaveSpeed,
        Math.max(config.waveSpeed, 0.01)
      );
      gl.uniform1f(tilePass.uniforms.uFrequency, config.frequency);
      gl.uniform1f(
        tilePass.uniforms.uWaveWidth,
        Math.max(config.waveWidth, 0.01)
      );
      gl.uniform1f(tilePass.uniforms.uFadeTime, Math.max(config.fadeTime, 0.1));
      gl.uniform1f(tilePass.uniforms.uAmplitude, config.amplitude);
      gl.uniform1f(tilePass.uniforms.uJitter, config.jitter);
      gl.uniform1f(tilePass.uniforms.uMaxLift, Math.max(config.maxLift, 0.01));
      gl.bindFramebuffer(gl.FRAMEBUFFER, tileFbo);
      gl.viewport(0, 0, tilesX, tilesY);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.useProgram(mainPass.program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, contentTexture);
      gl.uniform1i(mainPass.uniforms.uContent, 0);
      gl.uniform1f(mainPass.uniforms.uHasContent, htmlInCanvas ? 1 : 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, tileTexture);
      gl.uniform1i(mainPass.uniforms.uTiles, 1);
      gl.activeTexture(gl.TEXTURE0);
      gl.uniform2f(mainPass.uniforms.uResolution, output.width, output.height);
      gl.uniform2i(mainPass.uniforms.uGridTiles, tilesX, tilesY);
      gl.uniform1f(mainPass.uniforms.uTilePx, tilePx);
      gl.uniform1f(mainPass.uniforms.uGapPx, Math.max(config.gap, 0) * scale);
      gl.uniform1f(
        mainPass.uniforms.uCornerPx,
        Math.max(config.cornerRadius, 0) * scale
      );
      gl.uniform1f(
        mainPass.uniforms.uLiftPx,
        Math.max(config.liftHeight, 0) * scale
      );
      gl.uniform1f(
        mainPass.uniforms.uPersp,
        Math.max(config.perspective, 100) * scale
      );
      gl.uniform2f(
        mainPass.uniforms.uVanish,
        (0.5 + (vanishX - 0.5) * config.tilt) * output.width,
        (0.5 + (0.5 - vanishY) * config.tilt) * output.height
      );
      gl.uniform1f(mainPass.uniforms.uShading, config.shading);
      gl.uniform3f(
        mainPass.uniforms.uTint,
        config.tint[0],
        config.tint[1],
        config.tint[2]
      );
      gl.uniform1f(mainPass.uniforms.uTintStrength, config.tintStrength);
      gl.uniform1f(mainPass.uniforms.uMaxX, contentMaxX);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, output.width, output.height);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    let raf = 0;
    let lastTime = performance.now();
    let destroyed = false;
    let running = false;
    let visible = true;
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reducedMotion = motionQuery.matches;
    function frame(now) {
      if (destroyed) return;
      if (!visible) {
        running = false;
        return;
      }
      const delta = Math.min((now - lastTime) / 1e3, 1 / 30);
      lastTime = now;
      const trailCount = reducedMotion ? 0 : updateTrail(delta);
      render(trailCount, delta);
      const settling = Math.abs(vanishX - vanishTargetX) + Math.abs(vanishY - vanishTargetY) > 1e-3;
      const animating = !reducedMotion && (trailCount > 0 || config.idleRipples > 0 || settling);
      if (!animating && !contentDirty) {
        running = false;
        return;
      }
      raf = requestAnimationFrame(frame);
    }
    function start() {
      if (destroyed || running || !visible) return;
      running = true;
      lastTime = performance.now();
      raf = requestAnimationFrame(frame);
    }
    wake = start;
    start();
    function onMotionChange() {
      reducedMotion = motionQuery.matches;
      if (reducedMotion) trail.length = 0;
      start();
    }
    motionQuery.addEventListener("change", onMotionChange);
    const observer = createCanvasResizeObserver(() => {
      syncCanvasSize();
      start();
    });
    observer.observe(output);
    observer.observe(content);
    const intersection = new IntersectionObserver((entries) => {
      visible = entries[entries.length - 1]?.isIntersecting ?? true;
      if (visible) start();
    });
    intersection.observe(output);
    const listenTarget = output.parentElement ?? output;
    const rectCache = createRectCache(output);
    function onPointerMove(event) {
      if (reducedMotion) return;
      const rect = rectCache.current;
      const aspect = Math.max(rect.width, 1) / Math.max(rect.height, 1);
      const fx = (event.clientX - rect.left) / Math.max(rect.width, 1);
      const fy = (event.clientY - rect.top) / Math.max(rect.height, 1);
      vanishTargetX = fx;
      vanishTargetY = fy;
      const x = fx * aspect;
      const y = 1 - fy;
      let distDelta = 0.2;
      if (lastPoint) {
        const dx = x - lastPoint.x;
        const dy = y - lastPoint.y;
        distDelta = Math.hypot(dx, dy);
        if (distDelta < TRAIL_SPACING) {
          start();
          return;
        }
      }
      addTrailPoint({
        x,
        y,
        age: 0,
        strength: Math.min(Math.max(distDelta * 6, 0.25), 1.2)
      });
      lastPoint = { x, y };
      timeSinceMove = 0;
      idleTimer = 0;
      start();
    }
    function onPointerLeave() {
      vanishTargetX = 0.5;
      vanishTargetY = 0.5;
      start();
    }
    listenTarget.addEventListener("pointermove", onPointerMove, { passive: true });
    listenTarget.addEventListener("pointerleave", onPointerLeave, { passive: true });
    return {
      setOptions(next) {
        if (!Object.entries(next).some(
          ([key, value]) => config[key] !== value
        ))
          return;
        Object.assign(config, next);
        start();
      },
      resize() {
        syncCanvasSize();
        start();
      },
      destroy() {
        destroyed = true;
        rectCache.destroy();
        cancelAnimationFrame(raf);
        observer.disconnect();
        intersection.disconnect();
        motionQuery.removeEventListener("change", onMotionChange);
        listenTarget.removeEventListener("pointermove", onPointerMove);
        listenTarget.removeEventListener("pointerleave", onPointerLeave);
        gl.deleteTexture(contentTexture);
        gl.deleteTexture(trailTexture);
        if (tileTexture) gl.deleteTexture(tileTexture);
        if (tileFbo) gl.deleteFramebuffer(tileFbo);
        for (const pass of [mainPass, tilePass]) {
          gl.deleteProgram(pass.program);
          gl.deleteShader(pass.vertexShader);
          gl.deleteShader(pass.fragmentShader);
        }
        gl.deleteBuffer(quad);
        if (htmlInCanvas) paintable.onpaint = null;
      }
    };
  }

  // src/effects/grid.js
  var CONTROLS17 = {
    tileSize: scrub("Tile size", 150, {
      min: 16,
      max: 160,
      step: 2,
      decimals: 0
    }),
    gap: scrub("Gap", 0, { min: 0, max: 12, step: 0.5, decimals: 1 }),
    cornerRadius: scrub("Corner radius", 0, {
      min: 0,
      max: 24,
      step: 1,
      decimals: 0
    }),
    amplitude: scrub("Amplitude", 2.5, { min: 0, max: 3, step: 0.05 }),
    waveSpeed: scrub("Wave speed", 0.5, { min: 0.1, max: 3, step: 0.05 }),
    frequency: scrub("Frequency", 12, {
      min: 1,
      max: 40,
      step: 0.5,
      decimals: 1
    }),
    waveWidth: scrub("Wave width", 0.05, { min: 0.02, max: 0.5, step: 0.01 }),
    fadeTime: scrub("Fade time", 0.2, {
      min: 0.2,
      max: 6,
      step: 0.1,
      decimals: 1
    }),
    maxLift: scrub("Max lift", 1, { min: 0.1, max: 1, step: 0.05 }),
    jitter: scrub("Jitter", 0, { min: 0, max: 1, step: 0.05 }),
    liftHeight: scrub("Lift height", 60, {
      min: 0,
      max: 160,
      step: 2,
      decimals: 0
    }),
    perspective: scrub("Perspective", 1200, {
      min: 300,
      max: 4e3,
      step: 50,
      decimals: 0
    }),
    tilt: scrub("Tilt", 1, { min: 0, max: 1, step: 0.05 }),
    shading: scrub("Shading", 0.05, { min: 0, max: 2, step: 0.05 }),
    tintStrength: scrub("Tint strength", 0.1, { min: 0, max: 1, step: 0.05 }),
    idleRipples: scrub("Idle ripples", 0, {
      min: 0,
      max: 6,
      step: 0.5,
      decimals: 1
    }),
    tint: color("Tint", "#0055ff")
  };
  var grid_default = {
    slug: "grid",
    name: "Grid",
    component: "Grid",
    description: "3D tiles rippling around the cursor.",
    controls: CONTROLS17,
    toOptions(values) {
      const { tint, ...rest } = values;
      return {
        ...rest,
        tint: hexToRgb(tint)
      };
    },
    create: createGrid
  };

  // src/vendor/lib/HexFloat/HexFloatVanilla.ts
  var DEFAULTS18 = {
    size: 160,
    gap: 0,
    bevel: 1.5,
    tilt: 24,
    perspective: 0.5,
    float: 0,
    speed: 1,
    shine: 0.5,
    lift: 0.1,
    radius: 1200,
    flow: 0,
    swirl: 0,
    trail: 0,
    iridescence: 1,
    bloom: 0,
    grain: 0.8,
    gapColor: "auto"
  };
  var VERT17 = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPos;
out vec2 vUv;
void main () {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;
  var FRAG13 = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uContent;
uniform vec2 uRes;
uniform float uSize;
uniform float uGap;
uniform float uBevel;
uniform float uTilt;
uniform float uDist;
uniform float uFloat;
uniform float uShine;
uniform float uLift;
uniform float uIrid;
uniform sampler2D uFlow;
uniform vec2 uScroll;
uniform float uTime;
uniform float uHasContent;
uniform float uMaxX;
uniform vec3 uBg;
uniform vec3 uGapColor;

const float TAU = 6.2831853;
const float SQ3 = 1.7320508;

float hash12 (vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec2 hextile (inout vec2 p) {
  const vec2 sz = vec2(1.0, SQ3);
  const vec2 hsz = 0.5 * sz;
  vec2 p1 = mod(p, sz) - hsz;
  vec2 p2 = mod(p - hsz, sz) - hsz;
  vec2 p3 = dot(p1, p1) < dot(p2, p2) ? p1 : p2;
  vec2 n = (p3 - p + hsz) / sz;
  p = p3;
  n -= vec2(0.5);
  return round(n * 2.0) * 0.5;
}

float hexDist (vec2 p) {
  p = abs(p);
  return max(dot(p, vec2(0.5, 0.8660254)), p.x);
}

float flowAt (vec2 xy) {
  vec2 uv = (xy * uSize - uScroll) / uRes;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 0.0;
  return clamp(texture(uFlow, uv).r, 0.0, 4.0);
}

float tileZ (vec2 center, float f) {
  vec2 id = center * vec2(1.0, 1.0 / SQ3);
  float h = hash12(id * 7.31 + 3.7);
  float focus = smoothstep(0.18, 0.85, f);
  float ring = smoothstep(0.02, 0.14, f) * (1.0 - smoothstep(0.14, 0.6, f));
  float bob = uFloat * 0.4 * sin(uTime * 1.4 + h * TAU) * (1.0 - focus);
  float lift = uLift * ring;
  return -(bob + lift * 1.2);
}

vec4 page (vec2 px) {
  vec2 p = px / uRes;
  if (p.x < 0.0 || p.x > uMaxX || p.y < 0.0 || p.y > 1.0) return vec4(0.0);
  return texture(uContent, p);
}

vec4 shade (vec2 sUv) {
  float cell = max(uSize, 8.0);
  float hw = max(0.5 - (uGap / cell) * 0.5, 0.15);
  float bevW = clamp(uBevel / cell, 0.0, hw - 0.1);
  float th = 0.09;

  float aspect = uRes.x / uRes.y;
  vec2 ndc = vec2((sUv.x * 2.0 - 1.0) * aspect, sUv.y * 2.0 - 1.0);

  float sa = sin(uTilt);
  float ca = cos(uTilt);
  vec3 fwd = vec3(0.0, -sa, ca);
  vec3 upv = vec3(0.0, ca, sa);
  float H = uRes.y / cell;
  float D = H * uDist;
  float focal = (D + sqrt(D * D + H * H * sa * sa)) / (H * ca);
  float dy = 0.5 * H - sa * D
    - ca * D * (ca - focal * sa) / (sa + focal * ca);
  vec3 la = vec3(uScroll.x / cell + 0.5 * uRes.x / cell,
                 uScroll.y / cell + 0.5 * H + dy, 0.0);
  vec3 ro = la - fwd * D;
  vec3 rd = normalize(vec3(ndc.x, 0.0, 0.0) + ndc.y * upv + focal * fwd);

  vec3 seam = uGapColor;

  if (rd.z < 0.02) {
    return uHasContent > 0.5 ? vec4(uBg, 1.0) : vec4(0.0);
  }

  float maxUp = uFloat * 0.4 + uLift * 1.2 + th;
  float floorZ = th + 0.06;
  float tFloor = (floorZ - ro.z) / rd.z;
  float t0 = max((-maxUp - ro.z) / rd.z, 0.0);

  vec2 oxy = ro.xy;
  vec2 rxy = rd.xy;
  vec2 sp = oxy + rxy * t0;
  vec2 local = sp;
  hextile(local);
  vec2 center = sp - local;

  vec2 N0 = vec2(1.0, 0.0);
  vec2 N1 = vec2(0.5, 0.8660254);
  vec2 N2 = vec2(-0.5, 0.8660254);

  bool hit = false;
  bool onTop = false;
  float tHit = 0.0;
  vec3 n = vec3(0.0, 0.0, -1.0);
  float zc = 0.0;

  float hwc = hw;
  float fCell = 0.0;
  for (int i = 0; i < 64; i++) {
    fCell = flowAt(center);
    zc = tileZ(center, fCell);
    hwc = mix(hw, 0.502, smoothstep(0.18, 0.85, fCell));
    float zTop = zc - th;
    float tZin = (zTop - ro.z) / rd.z;
    float tZout = (zc + th - ro.z) / rd.z;

    float tIn = -1.0e9;
    float tOut = 1.0e9;
    vec2 inN = vec2(0.0);
    bool empty = false;
    for (int k = 0; k < 3; k++) {
      vec2 Nk = k == 0 ? N0 : (k == 1 ? N1 : N2);
      float d = dot(rxy, Nk);
      float o = dot(oxy - center, Nk);
      if (abs(d) < 1.0e-6) {
        if (abs(o) > hwc) { empty = true; break; }
      } else {
        float ta = (-hwc - o) / d;
        float tb = (hwc - o) / d;
        float lo = min(ta, tb);
        float hi = max(ta, tb);
        if (lo > tIn) { tIn = lo; inN = -sign(d) * Nk; }
        tOut = min(tOut, hi);
      }
    }

    if (!empty) {
      float lo = max(tIn, tZin);
      float hi = min(tOut, tZout);
      if (lo <= hi && hi > 0.0) {
        tHit = max(lo, 0.0);
        onTop = tZin >= tIn;
        n = onTop ? vec3(0.0, 0.0, -1.0) : vec3(inN, 0.0);
        hit = true;
        break;
      }
    }

    float tExit = 1.0e9;
    vec2 step2 = vec2(0.0);
    for (int k = 0; k < 3; k++) {
      vec2 Nk = k == 0 ? N0 : (k == 1 ? N1 : N2);
      float d = dot(rxy, Nk);
      if (abs(d) < 1.0e-6) continue;
      float o = dot(oxy - center, Nk);
      float te = (0.5 * sign(d) - o) / d;
      if (te < tExit) { tExit = te; step2 = sign(d) * Nk; }
    }
    if (tExit >= tFloor || step2 == vec2(0.0)) break;
    center += step2;
  }

  vec3 Ld = normalize(vec3(-0.35, -0.5, -0.78));

  if (!hit) {
    vec2 fl = (oxy + rxy * tFloor);
    vec2 fLocal = fl;
    hextile(fLocal);
    float open = smoothstep(hw, hw + 0.22, hexDist(fLocal));
    if (uHasContent < 0.5) {
      return vec4(0.0, 0.0, 0.0, 0.4 - 0.25 * open);
    }
    return vec4(seam * mix(0.6, 1.0, open), 1.0);
  }

  vec3 p = ro + rd * tHit;

  float fc = smoothstep(0.18, 0.85, fCell);

  if (onTop) {
    vec2 lp = p.xy - center;
    float e = hwc - hexDist(lp);
    if (e < bevW) {
      float ax = abs(lp.x);
      float a1 = abs(dot(lp, N1));
      float a2 = abs(dot(lp, N2));
      vec2 dir = ax > a1 && ax > a2 ? N0 : (a1 > a2 ? N1 : N2);
      dir *= sign(dot(lp, dir));
      float k = (1.0 - smoothstep(0.0, max(bevW, 1.0e-4), e)) * (1.0 - fc);
      n = normalize(mix(vec3(0.0, 0.0, -1.0), vec3(dir * 0.85, -0.6), k));
    }
  }

  float diff = max(dot(n, Ld), 0.0);
  vec3 refl = reflect(rd, n);
  vec3 Ld2 = normalize(vec3(0.55, -0.25, -0.8));
  float glintL = pow(max(dot(refl, Ld), 0.0), 120.0);
  float sheenL = pow(max(dot(refl, Ld2), 0.0), 8.0) * 0.35;
  float spec = (glintL + sheenL) * uShine * (1.0 - fc);
  float fres = pow(1.0 - max(dot(n, -rd), 0.0), 3.0) * (1.0 - fc);
  float iridPh = dot(n, -rd) * 2.2 + (p.x + p.y) * 0.22;
  vec3 iridTint = 1.0 + uIrid * 0.3 * cos(vec3(0.0, 2.094, 4.188) + iridPh * 3.5);
  vec3 specCol = spec * iridTint;
  float raised = clamp(-zc, -0.6, 1.4);

  if (uHasContent < 0.5) {
    float glint = spec * (0.4 + 0.6 * (onTop ? 0.4 : 1.0)) + fres * 0.2 * uShine;
    float shadeSide = onTop ? 0.0 : 0.3;
    float a = clamp(glint * 0.85 + shadeSide, 0.0, 0.85) * (1.0 - fc);
    return vec4(vec3(min(glint, a)), a);
  }

  if (onTop) {
    vec4 c = page(p.xy * cell - uScroll);
    vec3 face = mix(uBg, c.rgb, c.a);
    vec3 lit = face * (0.86 + 0.14 * diff + raised * 0.06)
      + specCol * 0.9 + fres * iridTint * 0.12 * uShine;
    return vec4(mix(lit, face, fc), 1.0);
  }

  float wallAo = 1.0 - smoothstep(zc - th, floorZ, p.z) * 0.4;
  vec3 wallCol = seam * mix(0.55, 1.0, diff) * wallAo
    + specCol * 1.3 + fres * iridTint * 0.28 * uShine;
  return vec4(wallCol, 1.0);
}

void main () {
  vec2 sUv = vec2(vUv.x, 1.0 - vUv.y);
  vec2 px = 1.0 / uRes;
  vec4 a = shade(sUv + vec2( 0.125,  0.375) * px);
  vec4 b = shade(sUv + vec2(-0.125, -0.375) * px);
  vec4 c = a + b;
  if (dot(abs(a - b), vec4(1.0)) > 0.02) {
    c += shade(sUv + vec2(-0.375,  0.125) * px)
       + shade(sUv + vec2( 0.375, -0.125) * px);
    outColor = c * 0.25;
  } else {
    outColor = c * 0.5;
  }
}`;
  var SIM_VERT = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPos;
out vec2 vUv;
out vec2 vL;
out vec2 vR;
out vec2 vT;
out vec2 vB;
uniform vec2 texelSize;
void main () {
  vUv = aPos * 0.5 + 0.5;
  vL = vUv - vec2(texelSize.x, 0.0);
  vR = vUv + vec2(texelSize.x, 0.0);
  vT = vUv + vec2(0.0, texelSize.y);
  vB = vUv - vec2(0.0, texelSize.y);
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;
  var FRAG_SPLAT = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uTarget;
uniform float uAspect;
uniform vec3 uColor;
uniform vec2 uPoint;
uniform float uRadius;
void main () {
  vec2 p = vUv - uPoint;
  p.x *= uAspect;
  vec3 splat = exp(-dot(p, p) / uRadius) * uColor;
  vec3 base = texture(uTarget, vUv).xyz;
  outColor = vec4(base + splat, 1.0);
}`;
  var FRAG_ADVECT = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uVelocity;
uniform sampler2D uSource;
uniform vec2 texelSize;
uniform float uDt;
uniform float uDissipation;
void main () {
  vec2 coord = vUv - uDt * texture(uVelocity, vUv).xy * texelSize;
  outColor = uDissipation * texture(uSource, coord);
  outColor.a = 1.0;
}`;
  var FRAG_CLEAR = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uTexture;
uniform float uValue;
void main () {
  outColor = uValue * texture(uTexture, vUv);
}`;
  var FRAG_DIVERGENCE = `#version 300 es
precision highp float;
in vec2 vUv;
in vec2 vL;
in vec2 vR;
in vec2 vT;
in vec2 vB;
out vec4 outColor;
uniform sampler2D uVelocity;
void main () {
  float L = texture(uVelocity, vL).x;
  float R = texture(uVelocity, vR).x;
  float T = texture(uVelocity, vT).y;
  float B = texture(uVelocity, vB).y;
  vec2 C = texture(uVelocity, vUv).xy;
  if (vL.x < 0.0) { L = -C.x; }
  if (vR.x > 1.0) { R = -C.x; }
  if (vT.y > 1.0) { T = -C.y; }
  if (vB.y < 0.0) { B = -C.y; }
  float div = 0.5 * (R - L + T - B);
  outColor = vec4(div, 0.0, 0.0, 1.0);
}`;
  var FRAG_CURL = `#version 300 es
precision highp float;
in vec2 vUv;
in vec2 vL;
in vec2 vR;
in vec2 vT;
in vec2 vB;
out vec4 outColor;
uniform sampler2D uVelocity;
void main () {
  float L = texture(uVelocity, vL).y;
  float R = texture(uVelocity, vR).y;
  float T = texture(uVelocity, vT).x;
  float B = texture(uVelocity, vB).x;
  float vorticity = R - L - T + B;
  outColor = vec4(vorticity, 0.0, 0.0, 1.0);
}`;
  var FRAG_VORTICITY = `#version 300 es
precision highp float;
in vec2 vUv;
in vec2 vL;
in vec2 vR;
in vec2 vT;
in vec2 vB;
out vec4 outColor;
uniform sampler2D uVelocity;
uniform sampler2D uCurl;
uniform float uCurlStrength;
uniform float uDt;
void main () {
  float L = texture(uCurl, vL).x;
  float R = texture(uCurl, vR).x;
  float T = texture(uCurl, vT).x;
  float B = texture(uCurl, vB).x;
  float C = texture(uCurl, vUv).x;
  vec2 force = vec2(abs(T) - abs(B), abs(R) - abs(L)) * 0.5;
  force /= length(force) + 1.0;
  force *= uCurlStrength * C;
  force.y *= -1.0;
  vec2 velocity = texture(uVelocity, vUv).xy;
  outColor = vec4(velocity + force * uDt, 0.0, 1.0);
}`;
  var FRAG_PRESSURE = `#version 300 es
precision highp float;
in vec2 vUv;
in vec2 vL;
in vec2 vR;
in vec2 vT;
in vec2 vB;
out vec4 outColor;
uniform sampler2D uPressure;
uniform sampler2D uDivergence;
void main () {
  float L = texture(uPressure, vL).x;
  float R = texture(uPressure, vR).x;
  float T = texture(uPressure, vT).x;
  float B = texture(uPressure, vB).x;
  float divergence = texture(uDivergence, vUv).x;
  float pressure = (L + R + B + T - divergence) * 0.25;
  outColor = vec4(pressure, 0.0, 0.0, 1.0);
}`;
  var FRAG_GRADIENT = `#version 300 es
precision highp float;
in vec2 vUv;
in vec2 vL;
in vec2 vR;
in vec2 vT;
in vec2 vB;
out vec4 outColor;
uniform sampler2D uPressure;
uniform sampler2D uVelocity;
void main () {
  float L = texture(uPressure, vL).x;
  float R = texture(uPressure, vR).x;
  float T = texture(uPressure, vT).x;
  float B = texture(uPressure, vB).x;
  vec2 velocity = texture(uVelocity, vUv).xy;
  velocity.xy -= vec2(R - L, T - B);
  outColor = vec4(velocity, 0.0, 1.0);
}`;
  var FRAG_BRIGHT = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uScene;
void main () {
  vec3 c = texture(uScene, vUv).rgb;
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  outColor = vec4(c * smoothstep(0.55, 0.95, l), 1.0);
}`;
  var FRAG_BLUR2 = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uScene;
uniform vec2 uDir;
void main () {
  vec3 c = texture(uScene, vUv).rgb * 0.227027;
  c += texture(uScene, vUv + uDir * 1.3846154).rgb * 0.3162162;
  c += texture(uScene, vUv - uDir * 1.3846154).rgb * 0.3162162;
  c += texture(uScene, vUv + uDir * 3.2307692).rgb * 0.0702703;
  c += texture(uScene, vUv - uDir * 3.2307692).rgb * 0.0702703;
  outColor = vec4(c, 1.0);
}`;
  var FRAG_COMPOSITE = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uScene;
uniform sampler2D uBloomTex;
uniform float uBloomAmt;
uniform float uGrainAmt;
uniform float uTime;
void main () {
  vec4 scene = texture(uScene, vUv);
  vec3 bloom = texture(uBloomTex, vUv).rgb * uBloomAmt;
  vec3 col = scene.rgb + bloom;
  float g = fract(sin(dot(gl_FragCoord.xy + vec2(uTime * 61.7, uTime * 123.4),
    vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
  col += g * uGrainAmt * 0.14;
  float ba = dot(bloom, vec3(0.333));
  outColor = vec4(col, clamp(scene.a + ba, 0.0, 1.0));
}`;
  var SIM_RES = 96;
  var FLOW_RES = 256;
  var SIM_DT = 1 / 60;
  var VELOCITY_DISSIPATION = 0.985;
  var PRESSURE_DECAY = 0.8;
  var PRESSURE_ITERATIONS = 4;
  var HOVER_ATTR2 = "data-canvasui-hover";
  var CONTENT_ATTR2 = "data-canvasui-content";
  var HOVER_REWRITE2 = `:is([${HOVER_ATTR2}], :hover:where(:not([${CONTENT_ATTR2}], [${CONTENT_ATTR2}] *)))`;
  function patchHoverRules2() {
    if (typeof document === "undefined") return;
    if (document.documentElement.dataset.canvasuiHoverRules === "") return;
    document.documentElement.dataset.canvasuiHoverRules = "";
    const walk = (rules) => {
      for (const rule of Array.from(rules)) {
        if (rule instanceof CSSStyleRule) {
          if (rule.selectorText.includes(":hover")) {
            try {
              rule.selectorText = rule.selectorText.replace(
                /:hover\b/g,
                HOVER_REWRITE2
              );
            } catch {
            }
          }
          if (rule.cssRules.length) walk(rule.cssRules);
        } else if ("cssRules" in rule) {
          try {
            walk(rule.cssRules);
          } catch {
          }
        }
      }
    };
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        walk(sheet.cssRules);
      } catch {
      }
    }
    const style = document.createElement("style");
    style.textContent = `[${CONTENT_ATTR2}], [${CONTENT_ATTR2}] * { cursor: var(--canvasui-cursor, auto) !important; }`;
    document.head.appendChild(style);
  }
  function createHexFloat(elements, options = {}) {
    const config = { ...DEFAULTS18, ...options };
    const { source, content, output } = elements;
    const gl = output.getContext("webgl2", {
      alpha: true,
      depth: false,
      stencil: false,
      antialias: false,
      premultipliedAlpha: true
    });
    if (!gl || gl.isContextLost()) return null;
    const supportsFloatTargets = Boolean(
      gl.getExtension("EXT_color_buffer_float") || gl.getExtension("EXT_color_buffer_half_float")
    );
    if (!supportsFloatTargets) return null;
    const sourceCtx = source.getContext("2d");
    const paintable = source;
    const htmlInCanvas = Boolean(
      sourceCtx && typeof sourceCtx.drawElementImage === "function" && typeof paintable.requestPaint === "function"
    );
    if (htmlInCanvas) prepareHtmlInCanvas(source, content);
    let contentDirty = false;
    let wake = () => {
    };
    if (htmlInCanvas) {
      paintable.onpaint = () => {
        try {
          sourceCtx.reset();
          drawHtmlInCanvas(source, sourceCtx, content);
          contentDirty = true;
          wake();
        } catch {
        }
      };
    }
    function compile(type, text) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, text);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error("HexFloat shader error:", gl.getShaderInfoLog(shader));
      }
      return shader;
    }
    const vertexShader = compile(gl.VERTEX_SHADER, VERT17);
    const fragmentShader = compile(gl.FRAGMENT_SHADER, FRAG13);
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    const uniforms = {};
    const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < count; i++) {
      const info = gl.getActiveUniform(program, i);
      uniforms[info.name.replace("[0]", "")] = gl.getUniformLocation(
        program,
        info.name
      );
    }
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const supportsLinear = Boolean(gl.getExtension("OES_texture_float_linear"));
    const filtering = supportsLinear ? gl.LINEAR : gl.NEAREST;
    const simShaders = [];
    const simPrograms = [];
    function compileSim(type, text) {
      const shader = compile(type, text);
      simShaders.push(shader);
      return shader;
    }
    const simVertexShader = compileSim(gl.VERTEX_SHADER, SIM_VERT);
    function createSimProgram(fragSource) {
      const prog = gl.createProgram();
      gl.attachShader(prog, simVertexShader);
      gl.attachShader(prog, compileSim(gl.FRAGMENT_SHADER, fragSource));
      gl.linkProgram(prog);
      simPrograms.push(prog);
      const u = {};
      const n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < n; i++) {
        const info = gl.getActiveUniform(prog, i);
        u[info.name] = gl.getUniformLocation(prog, info.name);
      }
      return { program: prog, uniforms: u };
    }
    const splatProgram = createSimProgram(FRAG_SPLAT);
    const advectProgram = createSimProgram(FRAG_ADVECT);
    const clearProgram = createSimProgram(FRAG_CLEAR);
    const divergenceProgram = createSimProgram(FRAG_DIVERGENCE);
    const curlProgram = createSimProgram(FRAG_CURL);
    const vorticityProgram = createSimProgram(FRAG_VORTICITY);
    const pressureProgram = createSimProgram(FRAG_PRESSURE);
    const gradientProgram = createSimProgram(FRAG_GRADIENT);
    function createTarget(size, internalFormat, format, filter) {
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        internalFormat,
        size,
        size,
        0,
        format,
        gl.HALF_FLOAT,
        null
      );
      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D,
        texture,
        0
      );
      gl.viewport(0, 0, size, size);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      return { fbo, texture, width: size, height: size };
    }
    function createDoubleTarget(size, internalFormat, format, filter) {
      let read = createTarget(size, internalFormat, format, filter);
      let write = createTarget(size, internalFormat, format, filter);
      return {
        get read() {
          return read;
        },
        get write() {
          return write;
        },
        swap() {
          const t = read;
          read = write;
          write = t;
        }
      };
    }
    const velocity = createDoubleTarget(SIM_RES, gl.RG16F, gl.RG, filtering);
    const flow = createDoubleTarget(FLOW_RES, gl.R16F, gl.RED, filtering);
    const divergence = createTarget(SIM_RES, gl.R16F, gl.RED, gl.NEAREST);
    const curl = createTarget(SIM_RES, gl.R16F, gl.RED, gl.NEAREST);
    const pressure = createDoubleTarget(SIM_RES, gl.R16F, gl.RED, gl.NEAREST);
    const simTexel = 1 / SIM_RES;
    function releaseSim() {
      [
        velocity.read,
        velocity.write,
        flow.read,
        flow.write,
        pressure.read,
        pressure.write,
        divergence,
        curl
      ].forEach((t) => {
        gl.deleteFramebuffer(t.fbo);
        gl.deleteTexture(t.texture);
      });
      simPrograms.forEach((p) => gl.deleteProgram(p));
      simShaders.forEach((s) => gl.deleteShader(s));
    }
    function blit(target) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
      gl.viewport(0, 0, target.width, target.height);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    function bindSimTexture(texture, unit) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      return unit;
    }
    function applySplat(x, y, dx, dy, dye) {
      const aspect = output.clientWidth / Math.max(output.clientHeight, 1);
      const rUv = Math.max(config.radius, 40) / Math.max(output.clientHeight, 1);
      const radius = rUv * rUv * 0.28;
      gl.useProgram(splatProgram.program);
      gl.uniform1f(splatProgram.uniforms.uAspect, aspect);
      gl.uniform2f(splatProgram.uniforms.uPoint, x, y);
      gl.uniform1f(splatProgram.uniforms.uRadius, radius);
      gl.uniform1i(
        splatProgram.uniforms.uTarget,
        bindSimTexture(velocity.read.texture, 0)
      );
      gl.uniform3f(splatProgram.uniforms.uColor, dx, dy, 0);
      blit(velocity.write);
      velocity.swap();
      gl.uniform1i(
        splatProgram.uniforms.uTarget,
        bindSimTexture(flow.read.texture, 0)
      );
      gl.uniform3f(splatProgram.uniforms.uColor, dye, 0, 0);
      blit(flow.write);
      flow.swap();
    }
    function stepSim(delta) {
      gl.disable(gl.BLEND);
      gl.useProgram(curlProgram.program);
      gl.uniform2f(curlProgram.uniforms.texelSize, simTexel, simTexel);
      gl.uniform1i(
        curlProgram.uniforms.uVelocity,
        bindSimTexture(velocity.read.texture, 0)
      );
      blit(curl);
      gl.useProgram(vorticityProgram.program);
      gl.uniform2f(vorticityProgram.uniforms.texelSize, simTexel, simTexel);
      gl.uniform1i(
        vorticityProgram.uniforms.uVelocity,
        bindSimTexture(velocity.read.texture, 0)
      );
      gl.uniform1i(
        vorticityProgram.uniforms.uCurl,
        bindSimTexture(curl.texture, 1)
      );
      gl.uniform1f(
        vorticityProgram.uniforms.uCurlStrength,
        Math.max(config.swirl, 0)
      );
      gl.uniform1f(vorticityProgram.uniforms.uDt, SIM_DT);
      blit(velocity.write);
      velocity.swap();
      gl.useProgram(divergenceProgram.program);
      gl.uniform2f(divergenceProgram.uniforms.texelSize, simTexel, simTexel);
      gl.uniform1i(
        divergenceProgram.uniforms.uVelocity,
        bindSimTexture(velocity.read.texture, 0)
      );
      blit(divergence);
      gl.useProgram(clearProgram.program);
      gl.uniform1i(
        clearProgram.uniforms.uTexture,
        bindSimTexture(pressure.read.texture, 0)
      );
      gl.uniform1f(
        clearProgram.uniforms.uValue,
        Math.pow(PRESSURE_DECAY, delta * 60)
      );
      blit(pressure.write);
      pressure.swap();
      gl.useProgram(pressureProgram.program);
      gl.uniform2f(pressureProgram.uniforms.texelSize, simTexel, simTexel);
      gl.uniform1i(
        pressureProgram.uniforms.uDivergence,
        bindSimTexture(divergence.texture, 0)
      );
      for (let i = 0; i < PRESSURE_ITERATIONS; i++) {
        gl.uniform1i(
          pressureProgram.uniforms.uPressure,
          bindSimTexture(pressure.read.texture, 1)
        );
        blit(pressure.write);
        pressure.swap();
      }
      gl.useProgram(gradientProgram.program);
      gl.uniform2f(gradientProgram.uniforms.texelSize, simTexel, simTexel);
      gl.uniform1i(
        gradientProgram.uniforms.uPressure,
        bindSimTexture(pressure.read.texture, 0)
      );
      gl.uniform1i(
        gradientProgram.uniforms.uVelocity,
        bindSimTexture(velocity.read.texture, 1)
      );
      blit(velocity.write);
      velocity.swap();
      gl.useProgram(advectProgram.program);
      gl.uniform2f(advectProgram.uniforms.texelSize, simTexel, simTexel);
      gl.uniform1i(
        advectProgram.uniforms.uVelocity,
        bindSimTexture(velocity.read.texture, 0)
      );
      gl.uniform1i(
        advectProgram.uniforms.uSource,
        bindSimTexture(velocity.read.texture, 0)
      );
      gl.uniform1f(advectProgram.uniforms.uDt, SIM_DT);
      gl.uniform1f(
        advectProgram.uniforms.uDissipation,
        Math.pow(VELOCITY_DISSIPATION, delta * 60)
      );
      blit(velocity.write);
      velocity.swap();
      gl.uniform1i(
        advectProgram.uniforms.uVelocity,
        bindSimTexture(velocity.read.texture, 0)
      );
      gl.uniform1i(
        advectProgram.uniforms.uSource,
        bindSimTexture(flow.read.texture, 1)
      );
      const flowDissipation = 0.9 + Math.min(Math.max(config.trail, 0), 1) * 0.08;
      gl.uniform1f(
        advectProgram.uniforms.uDissipation,
        Math.pow(flowDissipation, delta * 60)
      );
      blit(flow.write);
      flow.swap();
    }
    function createPostProgram(fragSource) {
      const prog = gl.createProgram();
      gl.attachShader(prog, vertexShader);
      gl.attachShader(prog, compileSim(gl.FRAGMENT_SHADER, fragSource));
      gl.linkProgram(prog);
      simPrograms.push(prog);
      const u = {};
      const n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < n; i++) {
        const info = gl.getActiveUniform(prog, i);
        u[info.name] = gl.getUniformLocation(prog, info.name);
      }
      return { program: prog, uniforms: u };
    }
    const brightProgram = createPostProgram(FRAG_BRIGHT);
    const blurProgram = createPostProgram(FRAG_BLUR2);
    const compositeProgram = createPostProgram(FRAG_COMPOSITE);
    let sceneTarget = null;
    let bloomA = null;
    let bloomB = null;
    function createPostTarget(width, height) {
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA8,
        width,
        height,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        null
      );
      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D,
        texture,
        0
      );
      return { fbo, texture, width, height };
    }
    function releasePost() {
      [sceneTarget, bloomA, bloomB].forEach((t) => {
        if (!t) return;
        gl.deleteFramebuffer(t.fbo);
        gl.deleteTexture(t.texture);
      });
      sceneTarget = null;
      bloomA = null;
      bloomB = null;
    }
    function ensurePost() {
      const w = output.width;
      const h = output.height;
      if (sceneTarget && sceneTarget.width === w && sceneTarget.height === h) {
        return;
      }
      releasePost();
      sceneTarget = createPostTarget(w, h);
      const bw = Math.max(1, w >> 2);
      const bh = Math.max(1, h >> 2);
      bloomA = createPostTarget(bw, bh);
      bloomB = createPostTarget(bw, bh);
    }
    const contentTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, contentTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([0, 0, 0, 0])
    );
    let contentMaxX = 1;
    let bg = [1, 1, 1];
    const bgProbe = document.createElement("canvas");
    bgProbe.width = bgProbe.height = 1;
    const bgCtx = bgProbe.getContext("2d", { willReadFrequently: true });
    function syncBgColor() {
      if (!bgCtx) return;
      let el = content;
      while (el) {
        const css = getComputedStyle(el).backgroundColor;
        if (css && css !== "transparent") {
          bgCtx.clearRect(0, 0, 1, 1);
          bgCtx.fillStyle = css;
          bgCtx.fillRect(0, 0, 1, 1);
          const [r, g, b, a] = bgCtx.getImageData(0, 0, 1, 1).data;
          if (a > 0) {
            bg = [r / 255, g / 255, b / 255];
            return;
          }
        }
        el = el.parentElement;
      }
      bg = [1, 1, 1];
    }
    function syncCanvasSize() {
      const dpr = getCanvasPixelRatio(output, gl);
      const width = Math.max(1, Math.round(output.clientWidth * dpr));
      const height = Math.max(1, Math.round(output.clientHeight * dpr));
      if (output.width !== width || output.height !== height) {
        output.width = width;
        output.height = height;
      }
      contentMaxX = Math.min(
        1,
        Math.max(0.05, content.clientWidth / Math.max(output.clientWidth, 1))
      );
      if (htmlInCanvas) {
        const sourceWidth = Math.max(1, Math.round(source.clientWidth * dpr));
        const sourceHeight = Math.max(1, Math.round(source.clientHeight * dpr));
        if (source.width !== sourceWidth || source.height !== sourceHeight) {
          source.width = sourceWidth;
          source.height = sourceHeight;
        }
        paintable.requestPaint();
      }
    }
    syncBgColor();
    syncCanvasSize();
    function uploadContent() {
      if (!htmlInCanvas || !contentDirty) return;
      contentDirty = false;
      gl.bindTexture(gl.TEXTURE_2D, contentTexture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        source
      );
    }
    let time = 0;
    let pointerOn = false;
    let pointerClientX = 0;
    let pointerClientY = 0;
    let prevFlowX = 0;
    let prevFlowY = 0;
    let hasPrevFlow = false;
    let simActiveUntil = 0;
    function gapColor() {
      if (config.gapColor !== "auto") return config.gapColor;
      const lum = 0.2126 * bg[0] + 0.7152 * bg[1] + 0.0722 * bg[2];
      const k = lum > 0.5 ? 0.55 : 0.35;
      return [bg[0] * k, bg[1] * k, bg[2] * k];
    }
    function render() {
      uploadContent();
      const dpr = output.width / Math.max(output.clientWidth, 1);
      const seam = gapColor();
      gl.useProgram(program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, contentTexture);
      gl.uniform1i(uniforms.uContent, 0);
      gl.uniform2f(uniforms.uRes, output.width, output.height);
      gl.uniform1f(uniforms.uSize, Math.max(config.size, 8) * dpr);
      gl.uniform1f(uniforms.uGap, Math.max(config.gap, 0) * dpr);
      gl.uniform1f(uniforms.uBevel, Math.max(config.bevel, 0) * dpr);
      gl.uniform1f(
        uniforms.uTilt,
        Math.min(Math.max(config.tilt, -30), 30) * Math.PI / 180
      );
      gl.uniform1f(
        uniforms.uDist,
        2.6 - Math.min(Math.max(config.perspective, 0), 1) * 2.2
      );
      gl.uniform1f(uniforms.uFloat, Math.max(config.float, 0));
      gl.uniform1f(uniforms.uShine, Math.max(config.shine, 0));
      gl.uniform1f(uniforms.uLift, Math.max(config.lift, 0));
      gl.uniform1f(uniforms.uIrid, Math.max(config.iridescence, 0));
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, flow.read.texture);
      gl.uniform1i(uniforms.uFlow, 1);
      gl.uniform2f(
        uniforms.uScroll,
        content.scrollLeft * dpr,
        content.scrollTop * dpr
      );
      gl.uniform1f(uniforms.uTime, time);
      gl.uniform1f(uniforms.uHasContent, htmlInCanvas ? 1 : 0);
      gl.uniform1f(uniforms.uMaxX, contentMaxX);
      gl.uniform3f(uniforms.uBg, bg[0], bg[1], bg[2]);
      gl.uniform3f(uniforms.uGapColor, seam[0], seam[1], seam[2]);
      const bloomOn = config.bloom > 1e-3;
      const usePost = bloomOn || config.grain > 1e-3;
      if (!usePost) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, output.width, output.height);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        return;
      }
      ensurePost();
      blit(sceneTarget);
      if (bloomOn) {
        gl.useProgram(brightProgram.program);
        gl.uniform1i(
          brightProgram.uniforms.uScene,
          bindSimTexture(sceneTarget.texture, 0)
        );
        blit(bloomA);
        gl.useProgram(blurProgram.program);
        gl.uniform1i(
          blurProgram.uniforms.uScene,
          bindSimTexture(bloomA.texture, 0)
        );
        gl.uniform2f(blurProgram.uniforms.uDir, 1 / bloomA.width, 0);
        blit(bloomB);
        gl.uniform1i(
          blurProgram.uniforms.uScene,
          bindSimTexture(bloomB.texture, 0)
        );
        gl.uniform2f(blurProgram.uniforms.uDir, 0, 1 / bloomA.height);
        blit(bloomA);
      }
      gl.useProgram(compositeProgram.program);
      gl.uniform1i(
        compositeProgram.uniforms.uScene,
        bindSimTexture(sceneTarget.texture, 0)
      );
      gl.uniform1i(
        compositeProgram.uniforms.uBloomTex,
        bindSimTexture((bloomA ?? sceneTarget).texture, 1)
      );
      gl.uniform1f(
        compositeProgram.uniforms.uBloomAmt,
        bloomOn ? Math.min(Math.max(config.bloom, 0), 1) * 1.4 : 0
      );
      gl.uniform1f(
        compositeProgram.uniforms.uGrainAmt,
        Math.min(Math.max(config.grain, 0), 1)
      );
      gl.uniform1f(compositeProgram.uniforms.uTime, time);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, output.width, output.height);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    let raf = 0;
    let lastTime = performance.now();
    let destroyed = false;
    let running = false;
    let visible = true;
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reducedMotion = motionQuery.matches;
    function animating() {
      if (reducedMotion) return false;
      if (config.float > 0) return true;
      if (config.grain > 1e-3) return true;
      if (pointerOn) return true;
      if (performance.now() < simActiveUntil) return true;
      return false;
    }
    function frame(now) {
      if (destroyed) return;
      if (!visible) {
        running = false;
        return;
      }
      const delta = Math.min(Math.max((now - lastTime) / 1e3, 0), 1 / 30);
      lastTime = now;
      if (!reducedMotion) {
        time += delta * Math.max(config.speed, 0);
        if (pointerOn) {
          const p = contentPoint(pointerClientX, pointerClientY);
          if (p) {
            const w = Math.max(output.clientWidth, 1);
            const h = Math.max(output.clientHeight, 1);
            const fx = p.x / w;
            const fy = p.y / h;
            const dx = hasPrevFlow ? (fx - prevFlowX) * w : 0;
            const dy = hasPrevFlow ? (fy - prevFlowY) * h : 0;
            const push = 1.6 * Math.max(config.flow, 0);
            applySplat(fx, fy, dx * push, dy * push, 10 * delta);
            prevFlowX = fx;
            prevFlowY = fy;
            hasPrevFlow = true;
            simActiveUntil = now + 4e3;
          }
        }
        if (now < simActiveUntil || pointerOn) stepSim(delta);
      }
      render();
      if (!animating() && !contentDirty) {
        running = false;
        return;
      }
      raf = requestAnimationFrame(frame);
    }
    function start() {
      if (destroyed || running || !visible) return;
      running = true;
      lastTime = performance.now();
      raf = requestAnimationFrame(frame);
    }
    wake = start;
    start();
    function onPointerMove(event) {
      pointerClientX = event.clientX;
      pointerClientY = event.clientY;
      pointerOn = true;
      simActiveUntil = performance.now() + 4e3;
      updateHover(event.clientX, event.clientY);
      start();
    }
    function onPointerLeave() {
      pointerOn = false;
      hasPrevFlow = false;
      setHoverTarget(null);
      start();
    }
    content.addEventListener("pointermove", onPointerMove, { passive: true });
    content.addEventListener("pointerleave", onPointerLeave, { passive: true });
    function onScroll() {
      if (pointerOn) updateHover(pointerClientX, pointerClientY);
      start();
    }
    content.addEventListener("scroll", onScroll, { passive: true });
    function contentPoint(clientX, clientY) {
      const rect = output.getBoundingClientRect();
      const dpr = output.width / Math.max(output.clientWidth, 1);
      const w = output.width;
      const hPx = output.height;
      if (w < 1 || hPx < 1) return null;
      const sx = (clientX - rect.left) * dpr;
      const sy = (clientY - rect.top) * dpr;
      const aspect = w / hPx;
      const ndcX = (sx / w * 2 - 1) * aspect;
      const ndcY = sy / hPx * 2 - 1;
      const tilt = Math.min(Math.max(config.tilt, -30), 30) * Math.PI / 180;
      const sa = Math.sin(tilt);
      const ca = Math.cos(tilt);
      const cell = Math.max(config.size, 8) * dpr;
      const h = hPx / cell;
      const dist = 2.6 - Math.min(Math.max(config.perspective, 0), 1) * 2.2;
      const d = h * dist;
      const focal = (d + Math.sqrt(d * d + h * h * sa * sa)) / (h * ca);
      const dy = 0.5 * h - sa * d - ca * d * (ca - focal * sa) / (sa + focal * ca);
      const scrollX = content.scrollLeft * dpr;
      const scrollY = content.scrollTop * dpr;
      const roX = scrollX / cell + 0.5 * w / cell;
      const roY = scrollY / cell + 0.5 * h + dy + sa * d;
      const roZ = -ca * d;
      const rdX = ndcX;
      const rdY = ndcY * ca - focal * sa;
      const rdZ = ndcY * sa + focal * ca;
      if (rdZ < 1e-6) return null;
      const t = -roZ / rdZ;
      const px = (roX + rdX * t) * cell - scrollX;
      const py = (roY + rdY * t) * cell - scrollY;
      return { x: px / dpr, y: py / dpr };
    }
    let forwarding = false;
    let hoverChain = [];
    let hoverTarget = null;
    if (htmlInCanvas) {
      patchHoverRules2();
      content.setAttribute(CONTENT_ATTR2, "");
    }
    function setHoverTarget(target) {
      if (target === hoverTarget) return;
      hoverTarget = target;
      const next = /* @__PURE__ */ new Set();
      for (let el = target; el; el = el.parentElement) {
        next.add(el);
        if (el === content) break;
      }
      for (const el of hoverChain) {
        if (!next.has(el)) el.removeAttribute(HOVER_ATTR2);
      }
      for (const el of next) el.setAttribute(HOVER_ATTR2, "");
      hoverChain = Array.from(next);
      if (target) {
        content.style.setProperty(
          "--canvasui-cursor",
          getComputedStyle(target).cursor
        );
      } else {
        content.style.removeProperty("--canvasui-cursor");
      }
    }
    function updateHover(clientX, clientY) {
      if (!htmlInCanvas) return;
      const p = contentPoint(clientX, clientY);
      if (!p) {
        setHoverTarget(null);
        return;
      }
      const rect = content.getBoundingClientRect();
      const target = document.elementFromPoint(rect.left + p.x, rect.top + p.y);
      setHoverTarget(target && content.contains(target) ? target : null);
    }
    function onClick(event) {
      if (forwarding || !htmlInCanvas) return;
      const p = contentPoint(event.clientX, event.clientY);
      if (!p) return;
      const rect = content.getBoundingClientRect();
      const tx = rect.left + p.x;
      const ty = rect.top + p.y;
      if (Math.hypot(tx - event.clientX, ty - event.clientY) < 1.5) return;
      event.preventDefault();
      event.stopPropagation();
      const target = document.elementFromPoint(tx, ty);
      if (!target || !content.contains(target)) return;
      const focusable = target.closest(
        "a, button, input, select, textarea, [tabindex]"
      );
      forwarding = true;
      try {
        focusable?.focus?.();
        target.dispatchEvent(
          new MouseEvent("click", {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX: tx,
            clientY: ty,
            button: event.button,
            ctrlKey: event.ctrlKey,
            shiftKey: event.shiftKey,
            altKey: event.altKey,
            metaKey: event.metaKey
          })
        );
      } finally {
        forwarding = false;
      }
    }
    content.addEventListener("click", onClick, true);
    function caretAt(x, y) {
      const doc = document;
      if (typeof doc.caretPositionFromPoint === "function") {
        const c = doc.caretPositionFromPoint(x, y);
        return c ? { node: c.offsetNode, offset: c.offset } : null;
      }
      const r = doc.caretRangeFromPoint?.(x, y);
      return r ? { node: r.startContainer, offset: r.startOffset } : null;
    }
    function remapped(event) {
      const p = contentPoint(event.clientX, event.clientY);
      if (!p) return null;
      const rect = content.getBoundingClientRect();
      const tx = rect.left + p.x;
      const ty = rect.top + p.y;
      if (Math.hypot(tx - event.clientX, ty - event.clientY) < 1.5) return null;
      return { x: tx, y: ty };
    }
    let selecting = false;
    function onMouseDown(event) {
      if (forwarding || !htmlInCanvas || event.button !== 0) return;
      const m = remapped(event);
      if (!m) return;
      event.preventDefault();
      const caret = caretAt(m.x, m.y);
      if (!caret || !content.contains(caret.node)) return;
      const sel = window.getSelection();
      if (!sel) return;
      sel.removeAllRanges();
      sel.collapse(caret.node, caret.offset);
      selecting = true;
    }
    function onSelMove(event) {
      if (!selecting) return;
      if (!(event.buttons & 1)) {
        selecting = false;
        return;
      }
      const m = remapped(event);
      const caret = m ? caretAt(m.x, m.y) : null;
      const sel = window.getSelection();
      if (caret && sel && sel.anchorNode && content.contains(caret.node)) {
        sel.extend(caret.node, caret.offset);
      }
    }
    function onSelEnd() {
      selecting = false;
    }
    content.addEventListener("mousedown", onMouseDown, true);
    window.addEventListener("mousemove", onSelMove, true);
    window.addEventListener("mouseup", onSelEnd, true);
    function onMotionChange() {
      reducedMotion = motionQuery.matches;
      if (reducedMotion) {
        pointerOn = false;
        hasPrevFlow = false;
        simActiveUntil = 0;
      }
      start();
    }
    motionQuery.addEventListener("change", onMotionChange);
    const observer = createCanvasResizeObserver(() => {
      syncCanvasSize();
      start();
    });
    observer.observe(output);
    observer.observe(content);
    const intersection = new IntersectionObserver((entries) => {
      visible = entries[entries.length - 1]?.isIntersecting ?? true;
      if (visible) start();
    });
    intersection.observe(output);
    const mutation = new MutationObserver(() => {
      syncBgColor();
      start();
    });
    mutation.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style", "data-theme"]
    });
    return {
      setOptions(next) {
        if (!Object.entries(next).some(
          ([key, value]) => config[key] !== value
        ))
          return;
        Object.assign(config, next);
        start();
      },
      resize() {
        syncCanvasSize();
        start();
      },
      destroy() {
        destroyed = true;
        cancelAnimationFrame(raf);
        setHoverTarget(null);
        content.removeAttribute(CONTENT_ATTR2);
        content.removeEventListener("pointermove", onPointerMove);
        content.removeEventListener("pointerleave", onPointerLeave);
        content.removeEventListener("scroll", onScroll);
        content.removeEventListener("click", onClick, true);
        content.removeEventListener("mousedown", onMouseDown, true);
        window.removeEventListener("mousemove", onSelMove, true);
        window.removeEventListener("mouseup", onSelEnd, true);
        observer.disconnect();
        intersection.disconnect();
        mutation.disconnect();
        motionQuery.removeEventListener("change", onMotionChange);
        gl.deleteTexture(contentTexture);
        releaseSim();
        releasePost();
        gl.deleteProgram(program);
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
        gl.deleteBuffer(quad);
        if (htmlInCanvas) paintable.onpaint = null;
      }
    };
  }

  // src/effects/hex-float.js
  var CONTROLS18 = {
    size: scrub("Size", 160, { min: 24, max: 160, step: 2, decimals: 0 }),
    gap: scrub("Gap", 0, { min: 0, max: 12, step: 0.5, decimals: 1 }),
    bevel: scrub("Bevel", 1.5, { min: 0, max: 20, step: 0.5, decimals: 1 }),
    tilt: scrub("Tilt", 24, { min: -30, max: 30, step: 1, decimals: 0 }),
    perspective: scrub("Perspective", 0.5, { min: 0, max: 1, step: 0.02 }),
    float: scrub("Float", 0, { min: 0, max: 1, step: 0.02 }),
    speed: scrub("Speed", 1, { min: 0.1, max: 3, step: 0.05 }),
    shine: scrub("Shine", 0.5, { min: 0, max: 2, step: 0.05 }),
    lift: scrub("Lift", 0.1, { min: 0, max: 1, step: 0.02 }),
    radius: scrub("Radius", 1200, { min: 60, max: 1400, step: 20, decimals: 0 }),
    flow: scrub("Flow", 0, { min: 0, max: 3, step: 0.05 }),
    swirl: scrub("Swirl", 0, { min: 0, max: 15, step: 0.5, decimals: 1 }),
    trail: scrub("Trail", 0, { min: 0, max: 1, step: 0.02 }),
    iridescence: scrub("Iridescence", 1, { min: 0, max: 2, step: 0.05 }),
    bloom: scrub("Bloom", 0, { min: 0, max: 1, step: 0.02 }),
    grain: scrub("Grain", 0.8, { min: 0, max: 1, step: 0.02 }),
    gapMode: radio("Seam", "auto", [
      { value: "auto", label: "Auto" },
      { value: "custom", label: "Custom" }
    ]),
    gapHex: color("Seam color", "#101014", {
      when: (values) => values.gapMode === "custom"
    })
  };
  var hex_float_default = {
    slug: "hex-float",
    name: "Hex Float",
    component: "HexFloat",
    description: "The page on shiny floating hex tiles.",
    controls: CONTROLS18,
    toOptions(values) {
      const { gapMode, gapHex, ...rest } = values;
      const gapColor = gapMode === "auto" ? "auto" : hexToRgb(gapHex);
      return {
        ...rest,
        gapColor
      };
    },
    create: createHexFloat
  };

  // src/vendor/lib/Laser/LaserVanilla.ts
  var DEFAULTS19 = {
    speed: 0.3,
    offset: 140,
    color: [0.05, 0.35, 1],
    thickness: 6,
    core: 1,
    radius: 20,
    glow: 2,
    wave: 10,
    width: 0.55,
    flicker: 0.2,
    reveal: 400,
    heat: 1.5,
    shimmer: 12,
    sparkle: 0.25,
    reactivity: 1
  };
  var VERT18 = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPos;
out vec2 vUv;
void main () {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;
  var FRAG14 = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uContent;
uniform vec2 uResolution;
uniform float uTime;
uniform float uBeamY;
uniform float uWaveAmp;
uniform float uBeamCX;
uniform float uBeamHalfW;
uniform float uHalfCore;
uniform float uCore;
uniform float uRadius;
uniform float uGlow;
uniform vec3 uColor;
uniform float uBright;
uniform float uRevealH;
uniform float uHeat;
uniform float uShimmer;
uniform float uSparkle;
uniform vec3 uBezel;
uniform float uMaxX;
uniform float uHasContent;

float hash (vec2 v) {
  return fract(sin(dot(v, vec2(89.44, 19.36))) * 22189.22);
}

float iHash (vec2 v, vec2 r) {
  float h00 = hash(floor(v * r + vec2(0.0, 0.0)) / r);
  float h10 = hash(floor(v * r + vec2(1.0, 0.0)) / r);
  float h01 = hash(floor(v * r + vec2(0.0, 1.0)) / r);
  float h11 = hash(floor(v * r + vec2(1.0, 1.0)) / r);
  vec2 ip = smoothstep(vec2(0.0), vec2(1.0), mod(v * r, 1.0));
  return (h00 * (1.0 - ip.x) + h10 * ip.x) * (1.0 - ip.y)
    + (h01 * (1.0 - ip.x) + h11 * ip.x) * ip.y;
}

float noise (vec2 v) {
  float sum = 0.0;
  float s = 2.0;
  for (int i = 1; i < 7; i++) {
    sum += iHash(v + vec2(i), vec2(2.0 * s)) / s;
    s *= 2.0;
  }
  return sum;
}

vec3 permute (vec3 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }

float snoise (vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
    -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

float fbm (vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 3; i++) {
    v += a * snoise(p);
    p = mat2(1.6, 1.2, -1.2, 1.6) * p + 11.7;
    a *= 0.5;
  }
  return v * 0.5 + 0.5;
}

float smokeField (vec2 p, float t) {
  vec2 rise = vec2(t * 0.04, -t * 0.35);
  vec2 q = vec2(
    fbm(p + rise),
    fbm(p + rise * 0.85 + vec2(5.2, 1.3)));
  return fbm(p + 0.55 * q + rise);
}

vec4 page (vec2 p) {
  p.x = clamp(p.x, 0.0005, uMaxX - 0.0005);
  p.y = clamp(p.y, 0.0005, 0.9995);
  return texture(uContent, vec2(p.x, 1.0 - p.y));
}

void main () {
  vec2 uv = vUv;
  if (uv.x > uMaxX) {
    outColor = vec4(0.0);
    return;
  }
  float t = uTime;

  float nx = (uv.x - uBeamCX) / max(uBeamHalfW, 1e-4);

  float env = pow(max(1.0 - nx * nx, 0.0), 1.5);

  float bend = 0.0;
  if (uWaveAmp > 0.0) {
    bend = (noise(vec2(uv.x * 2.5 + t * 0.6, t * 0.4)) - 0.5) * 2.0 * uWaveAmp;
  }
  float yb = uBeamY + bend;
  float dy = uv.y - yb;
  float pxd = abs(dy) * uResolution.y;

  vec3 col;
  float alpha;
  if (dy < 0.0 && uHasContent > 0.5) {
    col = uBezel;
    alpha = 1.0;
  } else {
    col = vec3(0.0);
    alpha = 0.0;
  }

  if (dy >= 0.0 && dy < uRevealH && uRevealH > 0.0) {
    float k = dy / uRevealH;
    float w = exp(-3.0 * k) * (1.0 - smoothstep(0.55, 1.0, k));

    vec2 sp = uv * uResolution / uResolution.y;
    if (uShimmer > 0.0 && env > 0.0 && uHasContent > 0.5) {
      float dx = snoise(vec2(sp.x * 5.0, sp.y * 12.0 - t * 1.3))
        * uShimmer * w * env;
      float sa = w * env;
      col = page(vec2(uv.x + dx, uv.y)).rgb * sa;
      alpha = sa;
    }
    if (uHeat > 0.0 && env > 0.0) {
      float s = smoothstep(0.3, 1.05, smokeField(sp * vec2(2.4, 3.4), t));
      float heat = w * uHeat * env * (0.4 + 0.9 * s);
      if (uSparkle > 0.0) {
        float f = fbm(sp * vec2(9.0, 13.0) + vec2(0.0, -t * 1.4));
        heat *= 1.0 + uSparkle * (f - 0.5) * 1.3;
      }
      heat = max(heat, 0.0);
      vec3 emission = uColor * heat * uBright + vec3(heat * heat * 0.35);

      vec3 toned = (1.0 - exp(-emission)) * env;
      float ea = max(max(toned.r, toned.g), toned.b);

      col = toned + col * (1.0 - ea);
      alpha = ea + alpha * (1.0 - ea);
    }
  }

  vec3 beam = vec3(0.0);
  if (env > 0.0) {
    float pd = pxd / max(env, 0.18);
    if (uCore > 0.0) {
      beam += 10.0 * uCore * smoothstep(uHalfCore, uHalfCore * 0.3, pd) * vec3(1.0);
    }
    if (uGlow > 0.0) {
      float g = pow(uRadius / max(pd, 0.75), 0.9) * exp(-0.55 * pd / uRadius);
      beam += uGlow * g * uColor;
    }
    beam *= uBright;
  }

  vec3 beamToned = (1.0 - exp(-beam)) * env;
  float ba = max(max(beamToned.r, beamToned.g), beamToned.b);
  if (ba > 0.003) {
    col = beamToned + col * (1.0 - ba);
    alpha = ba + alpha * (1.0 - ba);
  }

  outColor = vec4(col, clamp(alpha, 0.0, 1.0));
}`;
  function createLaser(elements, options = {}) {
    const config = { ...DEFAULTS19, ...options };
    const { source, content, output } = elements;
    const gl = output.getContext("webgl2", {
      alpha: true,
      depth: false,
      stencil: false,
      antialias: false,
      premultipliedAlpha: true
    });
    if (!gl || gl.isContextLost()) return null;
    const sourceCtx = source.getContext("2d");
    const paintable = source;
    const htmlInCanvas = Boolean(
      sourceCtx && typeof sourceCtx.drawElementImage === "function" && typeof paintable.requestPaint === "function"
    );
    if (htmlInCanvas) prepareHtmlInCanvas(source, content);
    let contentDirty = false;
    let wake = () => {
    };
    if (htmlInCanvas) {
      paintable.onpaint = () => {
        try {
          sourceCtx.reset();
          drawHtmlInCanvas(source, sourceCtx, content);
          contentDirty = true;
          wake();
        } catch {
        }
      };
    }
    function compile(type, text) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, text);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error("Laser shader error:", gl.getShaderInfoLog(shader));
      }
      return shader;
    }
    const vertexShader = compile(gl.VERTEX_SHADER, VERT18);
    const fragmentShader = compile(gl.FRAGMENT_SHADER, FRAG14);
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    const uniforms = {};
    const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < count; i++) {
      const info = gl.getActiveUniform(program, i);
      uniforms[info.name] = gl.getUniformLocation(program, info.name);
    }
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const contentTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, contentTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([0, 0, 0, 0])
    );
    let contentMaxX = 1;
    let beamCX = 0.5;
    let beamSpan = 1;
    let bezel = [0, 0, 0];
    const bezelProbe = document.createElement("canvas");
    bezelProbe.width = bezelProbe.height = 1;
    const bezelCtx = bezelProbe.getContext("2d", { willReadFrequently: true });
    function syncBezelColor() {
      if (!bezelCtx) return;
      let el = content;
      while (el) {
        const bg = getComputedStyle(el).backgroundColor;
        if (bg && bg !== "transparent") {
          bezelCtx.clearRect(0, 0, 1, 1);
          bezelCtx.fillStyle = bg;
          bezelCtx.fillRect(0, 0, 1, 1);
          const [r, g, b, a] = bezelCtx.getImageData(0, 0, 1, 1).data;
          if (a > 0) {
            bezel = [r / 255, g / 255, b / 255];
            return;
          }
        }
        el = el.parentElement;
      }
      bezel = [0, 0, 0];
    }
    function syncCanvasSize() {
      const dpr = getCanvasPixelRatio(output, gl);
      const width = Math.max(1, Math.round(output.clientWidth * dpr));
      const height = Math.max(1, Math.round(output.clientHeight * dpr));
      if (output.width !== width || output.height !== height) {
        output.width = width;
        output.height = height;
      }
      contentMaxX = Math.min(
        1,
        Math.max(0.05, content.clientWidth / Math.max(output.clientWidth, 1))
      );
      const viewW = Math.max(output.clientWidth, 1);
      beamCX = contentMaxX * 0.5;
      beamSpan = contentMaxX;
      const child = content.firstElementChild;
      if (child instanceof HTMLElement) {
        const childRect = child.getBoundingClientRect();
        const outputRect = output.getBoundingClientRect();
        const style = getComputedStyle(child);
        const left = childRect.left - outputRect.left + (parseFloat(style.paddingLeft) || 0);
        const right = childRect.right - outputRect.left - (parseFloat(style.paddingRight) || 0);
        if (right - left > 48) {
          beamCX = (left + right) * 0.5 / viewW;
          beamSpan = (right - left) / viewW;
        }
      }
      if (htmlInCanvas) {
        const sourceWidth = Math.max(1, Math.round(source.clientWidth * dpr));
        const sourceHeight = Math.max(1, Math.round(source.clientHeight * dpr));
        if (source.width !== sourceWidth || source.height !== sourceHeight) {
          source.width = sourceWidth;
          source.height = sourceHeight;
        }
        paintable.requestPaint();
      }
    }
    syncCanvasSize();
    syncBezelColor();
    function uploadContent() {
      if (!htmlInCanvas || !contentDirty) return;
      contentDirty = false;
      syncBezelColor();
      gl.bindTexture(gl.TEXTURE_2D, contentTexture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        source
      );
    }
    let time = 0;
    let activity = 0;
    const fract = (x) => x - Math.floor(x);
    const hash2 = (x, y) => fract(Math.sin(x * 89.44 + y * 19.36) * 22189.22);
    const smooth01 = (x) => x * x * (3 - 2 * x);
    function iHashCpu(vx, vy, r) {
      const fx = Math.floor(vx * r);
      const fy = Math.floor(vy * r);
      const h00 = hash2(fx / r, fy / r);
      const h10 = hash2((fx + 1) / r, fy / r);
      const h01 = hash2(fx / r, (fy + 1) / r);
      const h11 = hash2((fx + 1) / r, (fy + 1) / r);
      const ix = smooth01(fract(vx * r));
      const iy = smooth01(fract(vy * r));
      return (h00 * (1 - ix) + h10 * ix) * (1 - iy) + (h01 * (1 - ix) + h11 * ix) * iy;
    }
    function noiseCpu(vx, vy) {
      let sum = 0;
      let s = 2;
      for (let i = 1; i < 7; i++) {
        sum += iHashCpu(vx + i, vy + i, 2 * s) / s;
        s *= 2;
      }
      return sum;
    }
    function render() {
      uploadContent();
      gl.useProgram(program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, contentTexture);
      gl.uniform1i(uniforms.uContent, 0);
      gl.uniform2f(uniforms.uResolution, output.width, output.height);
      gl.uniform1f(uniforms.uTime, time);
      const dpr = output.width / Math.max(output.clientWidth, 1);
      const clientH = Math.max(output.clientHeight, 1);
      gl.uniform1f(
        uniforms.uBeamY,
        Math.min(Math.max(config.offset, 0) / clientH, 0.95)
      );
      gl.uniform1f(uniforms.uWaveAmp, Math.max(config.wave, 0) / clientH);
      gl.uniform1f(uniforms.uBeamCX, beamCX);
      gl.uniform1f(
        uniforms.uBeamHalfW,
        Math.min(Math.max(config.width, 0.05), 1) * beamSpan * 0.5
      );
      gl.uniform1f(
        uniforms.uHalfCore,
        Math.max(config.thickness, 0.5) * dpr * 0.5
      );
      gl.uniform1f(uniforms.uCore, Math.max(config.core, 0));
      gl.uniform1f(uniforms.uRadius, Math.max(config.radius, 0.5) * dpr);
      gl.uniform1f(uniforms.uGlow, Math.max(config.glow, 0));
      gl.uniform3f(
        uniforms.uColor,
        config.color[0],
        config.color[1],
        config.color[2]
      );
      const flick = 1 - Math.min(Math.max(config.flicker, 0), 1) * noiseCpu(time * 1.8, 3.7);
      const boost = 1 + Math.max(config.reactivity, 0) * activity * 1.6;
      gl.uniform1f(uniforms.uBright, flick * boost);
      gl.uniform1f(uniforms.uRevealH, Math.max(config.reveal, 0) / clientH);
      gl.uniform1f(
        uniforms.uHeat,
        Math.max(config.heat, 0) * (0.3 + 0.7 * activity)
      );
      gl.uniform1f(
        uniforms.uShimmer,
        Math.max(config.shimmer, 0) / Math.max(output.clientWidth, 1) * (0.25 + 0.75 * activity)
      );
      gl.uniform1f(uniforms.uSparkle, Math.max(config.sparkle, 0));
      gl.uniform3f(uniforms.uBezel, bezel[0], bezel[1], bezel[2]);
      gl.uniform1f(uniforms.uMaxX, contentMaxX);
      gl.uniform1f(uniforms.uHasContent, htmlInCanvas ? 1 : 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, output.width, output.height);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    let raf = 0;
    let lastTime = performance.now();
    let destroyed = false;
    let running = false;
    let visible = true;
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reducedMotion = motionQuery.matches;
    function frame(now) {
      if (destroyed) return;
      if (!visible) {
        running = false;
        return;
      }
      const delta = Math.min((now - lastTime) / 1e3, 1 / 30);
      lastTime = now;
      if (!reducedMotion) {
        time += delta * config.speed;
        activity *= Math.exp(-delta * 2.4);
      }
      render();
      if (reducedMotion && !contentDirty) {
        running = false;
        return;
      }
      raf = requestAnimationFrame(frame);
    }
    function start() {
      if (destroyed || running || !visible) return;
      running = true;
      lastTime = performance.now();
      raf = requestAnimationFrame(frame);
    }
    wake = start;
    start();
    let lastScrollTop = content.scrollTop;
    function onScroll() {
      const top = content.scrollTop;
      if (!reducedMotion) {
        activity = Math.min(1, activity + Math.abs(top - lastScrollTop) / 600);
      }
      lastScrollTop = top;
      start();
    }
    content.addEventListener("scroll", onScroll, { passive: true });
    function onMotionChange() {
      reducedMotion = motionQuery.matches;
      if (reducedMotion) activity = 0;
      start();
    }
    motionQuery.addEventListener("change", onMotionChange);
    const observer = createCanvasResizeObserver(() => {
      syncCanvasSize();
      start();
    });
    observer.observe(output);
    observer.observe(content);
    const intersection = new IntersectionObserver((entries) => {
      visible = entries[entries.length - 1]?.isIntersecting ?? true;
      if (visible) start();
    });
    intersection.observe(output);
    return {
      setOptions(next) {
        if (!Object.entries(next).some(
          ([key, value]) => config[key] !== value
        ))
          return;
        Object.assign(config, next);
        start();
      },
      resize() {
        syncCanvasSize();
        start();
      },
      destroy() {
        destroyed = true;
        cancelAnimationFrame(raf);
        content.removeEventListener("scroll", onScroll);
        observer.disconnect();
        intersection.disconnect();
        motionQuery.removeEventListener("change", onMotionChange);
        gl.deleteTexture(contentTexture);
        gl.deleteProgram(program);
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
        gl.deleteBuffer(quad);
        if (htmlInCanvas) paintable.onpaint = null;
      }
    };
  }

  // src/effects/laser.js
  var CONTROLS19 = {
    speed: scrub("Speed", 0.3, { min: 0, max: 4, step: 0.1, decimals: 1 }),
    offset: scrub("Offset", 140, { min: 0, max: 400, step: 4, decimals: 0 }),
    thickness: scrub("Thickness", 6, {
      min: 0.5,
      max: 12,
      step: 0.5,
      decimals: 1
    }),
    core: scrub("Core", 1, { min: 0, max: 2, step: 0.05 }),
    radius: scrub("Radius", 20, { min: 1, max: 60, step: 1, decimals: 0 }),
    glow: scrub("Glow", 2, { min: 0, max: 3, step: 0.05 }),
    wave: scrub("Wave", 10, { min: 0, max: 24, step: 0.5, decimals: 1 }),
    width: scrub("Width", 0.55, { min: 0.1, max: 1, step: 0.05 }),
    flicker: scrub("Flicker", 0.2, { min: 0, max: 1, step: 0.05 }),
    reveal: scrub("Reveal", 400, { min: 0, max: 480, step: 8, decimals: 0 }),
    heat: scrub("Heat", 1.5, { min: 0, max: 1.5, step: 0.05 }),
    shimmer: scrub("Shimmer", 12, { min: 0, max: 12, step: 0.5, decimals: 1 }),
    sparkle: scrub("Sparkle", 0.25, { min: 0, max: 2, step: 0.05 }),
    reactivity: scrub("Reactivity", 1, {
      min: 0,
      max: 3,
      step: 0.1,
      decimals: 1
    }),
    color: color("Color", "#0d59ff")
  };
  var laser_default = {
    slug: "laser",
    name: "Laser",
    component: "Laser",
    description: "A beam that reveals the page on scroll.",
    controls: CONTROLS19,
    toOptions(values) {
      const { color: color2, ...rest } = values;
      return {
        ...rest,
        color: hexToRgb(color2)
      };
    },
    create: createLaser
  };

  // src/vendor/lib/Liquid/LiquidVanilla.ts
  var DEFAULTS20 = {
    simResolution: 128,
    dyeResolution: 512,
    densityDissipation: 0.96,
    velocityDissipation: 1,
    pressure: 0.8,
    pressureIterations: 4,
    curl: 1.9,
    radius: 0.3,
    force: 1.1,
    intensity: 2,
    distortion: 0.4,
    blend: 5,
    color: [0.145, 0.239, 0.867],
    rainbow: false
  };
  var DT2 = 1 / 60;
  function srgbToLinear(value) {
    return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
  }
  var VERT19 = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPos;
out vec2 vUv;
out vec2 vL;
out vec2 vR;
out vec2 vT;
out vec2 vB;
uniform vec2 texelSize;
void main () {
  vUv = aPos * 0.5 + 0.5;
  vL = vUv - vec2(texelSize.x, 0.0);
  vR = vUv + vec2(texelSize.x, 0.0);
  vT = vUv + vec2(0.0, texelSize.y);
  vB = vUv - vec2(0.0, texelSize.y);
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;
  var FRAG_DISPLAY = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uContent;
uniform sampler2D uFluid;
uniform vec3 uColor;
uniform float uDistortion;
uniform float uIntensity;
uniform float uBlend;
uniform float uRainbow;
uniform float uHasContent;
vec3 toLinear (vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
}
vec3 toSrgb (vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
void main () {
  vec3 fluid = texture(uFluid, vUv).rgb;
  if (uHasContent < 0.5) {
    float mag = length(fluid);
    vec3 tint = uRainbow == 1.0
      ? clamp(fluid / max(mag, 1e-3), 0.0, 1.0)
      : uColor;
    float overlay = (1.0 - exp(-mag * uIntensity * 0.5)) * 0.82;
    outColor = vec4(toSrgb(clamp(tint, 0.0, 1.0)) * overlay, overlay);
    return;
  }
  vec2 uv = vUv - fluid.rg * uDistortion * 0.001;
  vec4 content = texture(uContent, vec2(uv.x, 1.0 - uv.y));
  content.rgb = toLinear(content.rgb);
  vec3 tint = uRainbow == 1.0 ? fluid : uColor * length(fluid);
  vec4 fluidColor = vec4(tint, 1.0);
  vec4 blended = mix(content, fluidColor, uBlend * 0.01 * clamp(length(fluid), 0.0, 1.0));
  vec4 final = mix(blended, vec4(0.0), 1.0 - content.a);
  outColor = vec4(toSrgb(clamp(final.rgb, 0.0, 1.0)), final.a);
}`;
  var FRAG_SPLAT2 = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uTarget;
uniform float uAspect;
uniform vec3 uColor;
uniform vec2 uPoint;
uniform float uRadius;
void main () {
  vec2 p = vUv - uPoint;
  p.x *= uAspect;
  vec3 splat = exp(-dot(p, p) / uRadius) * uColor;
  vec3 base = texture(uTarget, vUv).xyz;
  outColor = vec4(base + splat, 1.0);
}`;
  var FRAG_ADVECT2 = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uVelocity;
uniform sampler2D uSource;
uniform vec2 texelSize;
uniform float uDt;
uniform float uDissipation;
void main () {
  vec2 coord = vUv - uDt * texture(uVelocity, vUv).xy * texelSize;
  outColor = uDissipation * texture(uSource, coord);
  outColor.a = 1.0;
}`;
  var FRAG_CLEAR2 = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uTexture;
uniform float uValue;
void main () {
  outColor = uValue * texture(uTexture, vUv);
}`;
  var FRAG_DIVERGENCE2 = `#version 300 es
precision highp float;
in vec2 vUv;
in vec2 vL;
in vec2 vR;
in vec2 vT;
in vec2 vB;
out vec4 outColor;
uniform sampler2D uVelocity;
void main () {
  float L = texture(uVelocity, vL).x;
  float R = texture(uVelocity, vR).x;
  float T = texture(uVelocity, vT).y;
  float B = texture(uVelocity, vB).y;
  vec2 C = texture(uVelocity, vUv).xy;
  if (vL.x < 0.0) { L = -C.x; }
  if (vR.x > 1.0) { R = -C.x; }
  if (vT.y > 1.0) { T = -C.y; }
  if (vB.y < 0.0) { B = -C.y; }
  float div = 0.5 * (R - L + T - B);
  outColor = vec4(div, 0.0, 0.0, 1.0);
}`;
  var FRAG_CURL2 = `#version 300 es
precision highp float;
in vec2 vUv;
in vec2 vL;
in vec2 vR;
in vec2 vT;
in vec2 vB;
out vec4 outColor;
uniform sampler2D uVelocity;
void main () {
  float L = texture(uVelocity, vL).y;
  float R = texture(uVelocity, vR).y;
  float T = texture(uVelocity, vT).x;
  float B = texture(uVelocity, vB).x;
  float vorticity = R - L - T + B;
  outColor = vec4(vorticity, 0.0, 0.0, 1.0);
}`;
  var FRAG_VORTICITY2 = `#version 300 es
precision highp float;
in vec2 vUv;
in vec2 vL;
in vec2 vR;
in vec2 vT;
in vec2 vB;
out vec4 outColor;
uniform sampler2D uVelocity;
uniform sampler2D uCurl;
uniform float uCurlStrength;
uniform float uDt;
void main () {
  float L = texture(uCurl, vL).x;
  float R = texture(uCurl, vR).x;
  float T = texture(uCurl, vT).x;
  float B = texture(uCurl, vB).x;
  float C = texture(uCurl, vUv).x;
  vec2 force = vec2(abs(T) - abs(B), abs(R) - abs(L)) * 0.5;
  force /= length(force) + 1.0;
  force *= uCurlStrength * C;
  force.y *= -1.0;
  vec2 velocity = texture(uVelocity, vUv).xy;
  outColor = vec4(velocity + force * uDt, 0.0, 1.0);
}`;
  var FRAG_PRESSURE2 = `#version 300 es
precision highp float;
in vec2 vUv;
in vec2 vL;
in vec2 vR;
in vec2 vT;
in vec2 vB;
out vec4 outColor;
uniform sampler2D uPressure;
uniform sampler2D uDivergence;
void main () {
  float L = texture(uPressure, vL).x;
  float R = texture(uPressure, vR).x;
  float T = texture(uPressure, vT).x;
  float B = texture(uPressure, vB).x;
  float divergence = texture(uDivergence, vUv).x;
  float pressure = (L + R + B + T - divergence) * 0.25;
  outColor = vec4(pressure, 0.0, 0.0, 1.0);
}`;
  var FRAG_GRADIENT2 = `#version 300 es
precision highp float;
in vec2 vUv;
in vec2 vL;
in vec2 vR;
in vec2 vT;
in vec2 vB;
out vec4 outColor;
uniform sampler2D uPressure;
uniform sampler2D uVelocity;
void main () {
  float L = texture(uPressure, vL).x;
  float R = texture(uPressure, vR).x;
  float T = texture(uPressure, vT).x;
  float B = texture(uPressure, vB).x;
  vec2 velocity = texture(uVelocity, vUv).xy;
  velocity.xy -= vec2(R - L, T - B);
  outColor = vec4(velocity, 0.0, 1.0);
}`;
  function supportsHtmlInCanvas() {
    if (typeof document === "undefined") return false;
    const probe = document.createElement("canvas");
    const ctx = probe.getContext("2d");
    return Boolean(
      ctx && typeof ctx.drawElementImage === "function" && typeof probe.requestPaint === "function"
    );
  }
  function createLiquid(elements, options = {}) {
    const config = { ...DEFAULTS20, ...options };
    const { source, content, output } = elements;
    const gl = output.getContext("webgl2", {
      alpha: true,
      depth: false,
      stencil: false,
      antialias: false,
      premultipliedAlpha: true
    });
    if (!gl || gl.isContextLost()) return null;
    const supportsFloatTargets = Boolean(
      gl.getExtension("EXT_color_buffer_float") || gl.getExtension("EXT_color_buffer_half_float")
    );
    if (!supportsFloatTargets) return null;
    const sourceCtx = source.getContext("2d");
    const paintable = source;
    const htmlInCanvas = Boolean(
      sourceCtx && typeof sourceCtx.drawElementImage === "function" && typeof paintable.requestPaint === "function"
    );
    if (htmlInCanvas) prepareHtmlInCanvas(source, content);
    let contentDirty = false;
    let wake = () => {
    };
    if (htmlInCanvas) {
      paintable.onpaint = () => {
        try {
          sourceCtx.reset();
          drawHtmlInCanvas(source, sourceCtx, content);
          contentDirty = true;
          wake();
        } catch {
        }
      };
    }
    const supportsLinear = Boolean(gl.getExtension("OES_texture_float_linear"));
    const filtering = supportsLinear ? gl.LINEAR : gl.NEAREST;
    const shaders = [];
    function compile(type, source2) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source2);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error("Liquid shader error:", gl.getShaderInfoLog(shader));
      }
      shaders.push(shader);
      return shader;
    }
    const vertexShader = compile(gl.VERTEX_SHADER, VERT19);
    const programs = [];
    function createProgram(fragSource) {
      const program = gl.createProgram();
      gl.attachShader(program, vertexShader);
      gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragSource));
      gl.linkProgram(program);
      programs.push(program);
      const uniforms = {};
      const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < count; i++) {
        const info = gl.getActiveUniform(program, i);
        uniforms[info.name] = gl.getUniformLocation(program, info.name);
      }
      return { program, uniforms };
    }
    const displayProgram = createProgram(FRAG_DISPLAY);
    const splatProgram = createProgram(FRAG_SPLAT2);
    const advectProgram = createProgram(FRAG_ADVECT2);
    const clearProgram = createProgram(FRAG_CLEAR2);
    const divergenceProgram = createProgram(FRAG_DIVERGENCE2);
    const curlProgram = createProgram(FRAG_CURL2);
    const vorticityProgram = createProgram(FRAG_VORTICITY2);
    const pressureProgram = createProgram(FRAG_PRESSURE2);
    const gradientProgram = createProgram(FRAG_GRADIENT2);
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    function createTarget(size, internalFormat, format, filter) {
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        internalFormat,
        size,
        size,
        0,
        format,
        gl.HALF_FLOAT,
        null
      );
      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D,
        texture,
        0
      );
      gl.viewport(0, 0, size, size);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      return { fbo, texture, width: size, height: size };
    }
    function createDoubleTarget(size, internalFormat, format, filter) {
      let read = createTarget(size, internalFormat, format, filter);
      let write = createTarget(size, internalFormat, format, filter);
      return {
        get read() {
          return read;
        },
        get write() {
          return write;
        },
        swap() {
          const t = read;
          read = write;
          write = t;
        }
      };
    }
    function createFluidTargets(simResolution, dyeResolution) {
      return {
        velocity: createDoubleTarget(
          simResolution,
          gl.RG16F,
          gl.RG,
          filtering
        ),
        dye: createDoubleTarget(
          dyeResolution,
          gl.RGBA16F,
          gl.RGBA,
          filtering
        ),
        divergence: createTarget(
          simResolution,
          gl.R16F,
          gl.RED,
          gl.NEAREST
        ),
        curl: createTarget(
          simResolution,
          gl.R16F,
          gl.RED,
          gl.NEAREST
        ),
        pressure: createDoubleTarget(
          simResolution,
          gl.R16F,
          gl.RED,
          gl.NEAREST
        )
      };
    }
    let fluidTargets = createFluidTargets(
      config.simResolution,
      config.dyeResolution
    );
    function releaseTargets(targets) {
      [
        targets.velocity.read,
        targets.velocity.write,
        targets.dye.read,
        targets.dye.write,
        targets.pressure.read,
        targets.pressure.write,
        targets.divergence,
        targets.curl
      ].forEach((t) => {
        gl.deleteFramebuffer(t.fbo);
        gl.deleteTexture(t.texture);
      });
    }
    function rebuildFluidTargets(simResolution, dyeResolution) {
      const next = createFluidTargets(simResolution, dyeResolution);
      const previous = fluidTargets;
      fluidTargets = next;
      releaseTargets(previous);
    }
    let texelX = 0;
    let texelY = 0;
    function updateTexelSize() {
      const width = Math.max(output.clientWidth, 1);
      const height = Math.max(output.clientHeight, 1);
      texelX = 1 / (config.simResolution * (width / (height + 400)));
      texelY = 1 / config.simResolution;
    }
    function syncCanvasSize() {
      const dpr = getCanvasPixelRatio(output, gl);
      const width = Math.max(1, Math.round(output.clientWidth * dpr));
      const height = Math.max(1, Math.round(output.clientHeight * dpr));
      if (output.width !== width || output.height !== height) {
        output.width = width;
        output.height = height;
      }
      if (htmlInCanvas) {
        const sourceWidth = Math.max(1, Math.round(source.clientWidth * dpr));
        const sourceHeight = Math.max(1, Math.round(source.clientHeight * dpr));
        if (source.width !== sourceWidth || source.height !== sourceHeight) {
          source.width = sourceWidth;
          source.height = sourceHeight;
        }
        paintable.requestPaint();
      }
      updateTexelSize();
    }
    syncCanvasSize();
    const contentTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, contentTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([0, 0, 0, 0])
    );
    function uploadContent() {
      if (!htmlInCanvas || !contentDirty) return;
      contentDirty = false;
      gl.bindTexture(gl.TEXTURE_2D, contentTexture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        source
      );
    }
    function blit(target) {
      if (target) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
        gl.viewport(0, 0, target.width, target.height);
      } else {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, output.width, output.height);
      }
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    function bindTexture(texture, unit) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      return unit;
    }
    function applySplat(x, y, dx, dy) {
      const aspect = output.clientWidth / Math.max(output.clientHeight, 1);
      const radius = config.radius / 100;
      gl.useProgram(splatProgram.program);
      gl.uniform1i(
        splatProgram.uniforms.uTarget,
        bindTexture(fluidTargets.velocity.read.texture, 0)
      );
      gl.uniform1f(splatProgram.uniforms.uAspect, aspect);
      gl.uniform2f(splatProgram.uniforms.uPoint, x, y);
      gl.uniform3f(splatProgram.uniforms.uColor, dx, dy, 10);
      gl.uniform1f(splatProgram.uniforms.uRadius, radius);
      blit(fluidTargets.velocity.write);
      fluidTargets.velocity.swap();
      gl.uniform1i(
        splatProgram.uniforms.uTarget,
        bindTexture(fluidTargets.dye.read.texture, 0)
      );
      blit(fluidTargets.dye.write);
      fluidTargets.dye.swap();
    }
    function step(delta) {
      gl.disable(gl.BLEND);
      gl.useProgram(curlProgram.program);
      gl.uniform2f(curlProgram.uniforms.texelSize, texelX, texelY);
      gl.uniform1i(
        curlProgram.uniforms.uVelocity,
        bindTexture(fluidTargets.velocity.read.texture, 0)
      );
      blit(fluidTargets.curl);
      gl.useProgram(vorticityProgram.program);
      gl.uniform2f(vorticityProgram.uniforms.texelSize, texelX, texelY);
      gl.uniform1i(
        vorticityProgram.uniforms.uVelocity,
        bindTexture(fluidTargets.velocity.read.texture, 0)
      );
      gl.uniform1i(
        vorticityProgram.uniforms.uCurl,
        bindTexture(fluidTargets.curl.texture, 1)
      );
      gl.uniform1f(vorticityProgram.uniforms.uCurlStrength, config.curl);
      gl.uniform1f(vorticityProgram.uniforms.uDt, DT2);
      blit(fluidTargets.velocity.write);
      fluidTargets.velocity.swap();
      gl.useProgram(divergenceProgram.program);
      gl.uniform2f(divergenceProgram.uniforms.texelSize, texelX, texelY);
      gl.uniform1i(
        divergenceProgram.uniforms.uVelocity,
        bindTexture(fluidTargets.velocity.read.texture, 0)
      );
      blit(fluidTargets.divergence);
      gl.useProgram(clearProgram.program);
      gl.uniform1i(
        clearProgram.uniforms.uTexture,
        bindTexture(fluidTargets.pressure.read.texture, 0)
      );
      gl.uniform1f(
        clearProgram.uniforms.uValue,
        Math.pow(config.pressure, delta * 60)
      );
      blit(fluidTargets.pressure.write);
      fluidTargets.pressure.swap();
      gl.useProgram(pressureProgram.program);
      gl.uniform2f(pressureProgram.uniforms.texelSize, texelX, texelY);
      gl.uniform1i(
        pressureProgram.uniforms.uDivergence,
        bindTexture(fluidTargets.divergence.texture, 0)
      );
      for (let i = 0; i < config.pressureIterations; i++) {
        gl.uniform1i(
          pressureProgram.uniforms.uPressure,
          bindTexture(fluidTargets.pressure.read.texture, 1)
        );
        blit(fluidTargets.pressure.write);
        fluidTargets.pressure.swap();
      }
      gl.useProgram(gradientProgram.program);
      gl.uniform2f(gradientProgram.uniforms.texelSize, texelX, texelY);
      gl.uniform1i(
        gradientProgram.uniforms.uPressure,
        bindTexture(fluidTargets.pressure.read.texture, 0)
      );
      gl.uniform1i(
        gradientProgram.uniforms.uVelocity,
        bindTexture(fluidTargets.velocity.read.texture, 1)
      );
      blit(fluidTargets.velocity.write);
      fluidTargets.velocity.swap();
      gl.useProgram(advectProgram.program);
      gl.uniform2f(advectProgram.uniforms.texelSize, texelX, texelY);
      gl.uniform1i(
        advectProgram.uniforms.uVelocity,
        bindTexture(fluidTargets.velocity.read.texture, 0)
      );
      gl.uniform1i(
        advectProgram.uniforms.uSource,
        bindTexture(fluidTargets.velocity.read.texture, 0)
      );
      gl.uniform1f(advectProgram.uniforms.uDt, DT2);
      gl.uniform1f(
        advectProgram.uniforms.uDissipation,
        Math.pow(config.velocityDissipation, delta * 60)
      );
      blit(fluidTargets.velocity.write);
      fluidTargets.velocity.swap();
      gl.uniform1i(
        advectProgram.uniforms.uVelocity,
        bindTexture(fluidTargets.velocity.read.texture, 0)
      );
      gl.uniform1i(
        advectProgram.uniforms.uSource,
        bindTexture(fluidTargets.dye.read.texture, 1)
      );
      gl.uniform1f(
        advectProgram.uniforms.uDissipation,
        Math.pow(config.densityDissipation, delta * 60)
      );
      blit(fluidTargets.dye.write);
      fluidTargets.dye.swap();
    }
    function render() {
      uploadContent();
      gl.useProgram(displayProgram.program);
      gl.uniform1i(
        displayProgram.uniforms.uContent,
        bindTexture(contentTexture, 0)
      );
      gl.uniform1i(
        displayProgram.uniforms.uFluid,
        bindTexture(fluidTargets.dye.read.texture, 1)
      );
      gl.uniform3f(
        displayProgram.uniforms.uColor,
        srgbToLinear(config.color[0]),
        srgbToLinear(config.color[1]),
        srgbToLinear(config.color[2])
      );
      gl.uniform1f(displayProgram.uniforms.uDistortion, config.distortion);
      gl.uniform1f(displayProgram.uniforms.uIntensity, config.intensity);
      gl.uniform1f(displayProgram.uniforms.uBlend, config.blend);
      gl.uniform1f(displayProgram.uniforms.uRainbow, config.rainbow ? 1 : 0);
      gl.uniform1f(displayProgram.uniforms.uHasContent, htmlInCanvas ? 1 : 0);
      blit(null);
    }
    const MAX_PENDING_SPLATS = 64;
    const MAX_SPLATS_PER_FRAME = 8;
    const queued = [];
    const pointerSplats = /* @__PURE__ */ new Map();
    let raf = 0;
    let lastTime = performance.now();
    let destroyed = false;
    let running = false;
    let visible = true;
    let idleAt = 0;
    function idleDelayMs() {
      const dissipation = Math.min(config.densityDissipation, 0.999);
      const frames = Math.log(1e-7) / Math.log(dissipation);
      return frames / 60 * 1e3;
    }
    function frame(now) {
      if (destroyed) return;
      if (!visible || document.hidden) {
        running = false;
        return;
      }
      const delta = Math.min((now - lastTime) / 1e3, 1 / 30);
      lastTime = now;
      if (queued.length > 0 || pointerSplats.size > 0) {
        idleAt = now + idleDelayMs();
        let remaining = MAX_SPLATS_PER_FRAME;
        const pointerBudget = remaining - (queued.length > 0 ? 1 : 0);
        let appliedPointers = 0;
        for (const [id, splat] of pointerSplats) {
          if (appliedPointers >= pointerBudget) break;
          pointerSplats.delete(id);
          applySplat(...splat);
          appliedPointers++;
          remaining--;
        }
        const count = Math.min(queued.length, remaining);
        for (let i = 0; i < count; i++) applySplat(...queued.shift());
      }
      step(delta);
      render();
      if (now >= idleAt && !contentDirty && queued.length === 0 && pointerSplats.size === 0) {
        running = false;
        return;
      }
      raf = requestAnimationFrame(frame);
    }
    function start() {
      if (destroyed || running || !visible || document.hidden) return;
      running = true;
      lastTime = performance.now();
      raf = requestAnimationFrame(frame);
    }
    wake = start;
    start();
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reducedMotion = motionQuery.matches;
    function onMotionChange() {
      reducedMotion = motionQuery.matches;
      if (!reducedMotion) start();
    }
    motionQuery.addEventListener("change", onMotionChange);
    const pointers = /* @__PURE__ */ new Map();
    function enqueueSplat(splat) {
      if (queued.length >= MAX_PENDING_SPLATS) queued.shift();
      queued.push(splat);
    }
    function enqueuePointerSplat(id, splat) {
      const previous = pointerSplats.get(id);
      if (previous) {
        splat[2] += previous[2];
        splat[3] += previous[3];
      } else if (pointerSplats.size >= MAX_SPLATS_PER_FRAME) {
        pointerSplats.delete(pointerSplats.keys().next().value);
      }
      pointerSplats.set(id, splat);
    }
    function suspend() {
      cancelAnimationFrame(raf);
      running = false;
      pointers.clear();
      pointerSplats.clear();
    }
    function onVisibilityChange() {
      if (document.hidden) suspend();
      else start();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    const rectCache = createRectCache(output);
    function onPointerMove(event) {
      if (destroyed || reducedMotion || !visible || document.hidden) return;
      const rect = rectCache.current;
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      if (px < 0 || px > rect.width || py < 0 || py > rect.height) {
        pointers.delete(event.pointerId);
        return;
      }
      const previous = pointers.get(event.pointerId);
      pointers.set(event.pointerId, { x: px, y: py });
      if (!previous) return;
      const dx = (px - previous.x) * config.force;
      const dy = -(py - previous.y) * config.force;
      enqueuePointerSplat(event.pointerId, [px / rect.width, 1 - py / rect.height, dx, dy]);
      start();
    }
    function onPointerDown(event) {
      if (destroyed || reducedMotion || !visible || document.hidden) return;
      const rect = output.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      if (x < 0 || x > rect.width || y < 0 || y > rect.height) return;
      pointers.set(event.pointerId, { x, y });
      enqueuePointerSplat(event.pointerId, [x / rect.width, 1 - y / rect.height, 1, 1]);
      start();
    }
    function onPointerLeave(event) {
      pointers.delete(event.pointerId);
    }
    const listenTarget = window;
    listenTarget.addEventListener("pointerdown", onPointerDown, {
      passive: true
    });
    listenTarget.addEventListener("pointermove", onPointerMove, { passive: true });
    listenTarget.addEventListener(
      "pointerup",
      onPointerLeave,
      { passive: true }
    );
    listenTarget.addEventListener(
      "pointerleave",
      onPointerLeave
    );
    listenTarget.addEventListener(
      "pointercancel",
      onPointerLeave
    );
    const observer = createCanvasResizeObserver(() => {
      if (destroyed) return;
      syncCanvasSize();
      start();
    });
    observer.observe(output);
    const intersection = new IntersectionObserver((entries) => {
      visible = entries[entries.length - 1]?.isIntersecting ?? true;
      if (destroyed) return;
      if (visible) start();
      else suspend();
    });
    intersection.observe(output);
    return {
      splat(x, y, dx, dy) {
        if (destroyed || reducedMotion) return;
        enqueueSplat([x, y, dx, dy]);
        start();
      },
      setOptions(next) {
        if (destroyed) return;
        if (!Object.entries(next).some(
          ([key, value]) => config[key] !== value
        ))
          return;
        const simResolution = next.simResolution ?? config.simResolution;
        const dyeResolution = next.dyeResolution ?? config.dyeResolution;
        const resolutionChanged = simResolution !== config.simResolution || dyeResolution !== config.dyeResolution;
        if (resolutionChanged) {
          rebuildFluidTargets(simResolution, dyeResolution);
          config.simResolution = simResolution;
          config.dyeResolution = dyeResolution;
          updateTexelSize();
        }
        Object.assign(config, next);
        start();
      },
      resize() {
        if (destroyed) return;
        syncCanvasSize();
        start();
      },
      destroy() {
        if (destroyed) return;
        destroyed = true;
        queued.length = 0;
        suspend();
        document.removeEventListener("visibilitychange", onVisibilityChange);
        rectCache.destroy();
        cancelAnimationFrame(raf);
        observer.disconnect();
        intersection.disconnect();
        motionQuery.removeEventListener("change", onMotionChange);
        releaseTargets(fluidTargets);
        gl.deleteTexture(contentTexture);
        programs.forEach((program) => gl.deleteProgram(program));
        shaders.forEach((shader) => gl.deleteShader(shader));
        gl.deleteBuffer(quad);
        if (htmlInCanvas) paintable.onpaint = null;
        listenTarget.removeEventListener(
          "pointerdown",
          onPointerDown
        );
        listenTarget.removeEventListener(
          "pointermove",
          onPointerMove
        );
        listenTarget.removeEventListener(
          "pointerup",
          onPointerLeave
        );
        listenTarget.removeEventListener(
          "pointerleave",
          onPointerLeave
        );
        listenTarget.removeEventListener(
          "pointercancel",
          onPointerLeave
        );
      }
    };
  }

  // src/effects/liquid.js
  var CONTROLS20 = {
    quality: radio("Quality", "medium", [
      { value: "low", label: "Low" },
      { value: "medium", label: "Medium" },
      { value: "high", label: "High" }
    ]),
    force: scrub("Force", 1.1, { min: 0, max: 5, step: 0.1, decimals: 1 }),
    radius: scrub("Radius", 0.3, { min: 0.05, max: 1.5, step: 0.05 }),
    curl: scrub("Curl", 1.9, { min: 0, max: 10, step: 0.1, decimals: 1 }),
    pressureIterations: scrub("Swirl", 4, {
      min: 1,
      max: 10,
      step: 1,
      decimals: 0
    }),
    pressure: scrub("Pressure", 0.8, { min: 0, max: 1, step: 0.05 }),
    intensity: scrub("Intensity", 2, { min: 0, max: 10, step: 0.1, decimals: 1 }),
    distortion: scrub("Distortion", 0.4, { min: 0, max: 2, step: 0.05 }),
    blend: scrub("Blend", 5, { min: 0, max: 20, step: 0.5, decimals: 1 }),
    densityDissipation: scrub("Trail fade", 0.96, {
      min: 0.85,
      max: 1,
      step: 5e-3,
      decimals: 3
    }),
    velocityDissipation: scrub("Motion fade", 1, {
      min: 0.85,
      max: 1,
      step: 5e-3,
      decimals: 3
    }),
    color: color("Color", "#425bff"),
    rainbow: toggle("Rainbow", false)
  };
  var RESOLUTION_PRESETS = {
    low: { simResolution: 32, dyeResolution: 128 },
    medium: { simResolution: 128, dyeResolution: 512 },
    high: { simResolution: 256, dyeResolution: 1024 }
  };
  var liquid_default = {
    slug: "liquid",
    name: "Liquid",
    component: "Liquid",
    description: "A fluid simulation over the live page.",
    controls: CONTROLS20,
    toOptions(values) {
      const { color: color2, rainbow, quality, ...rest } = values;
      return {
        ...rest,
        ...RESOLUTION_PRESETS[quality],
        color: hexToRgb(color2),
        rainbow
      };
    },
    create: createLiquid
  };

  // src/vendor/lib/Magnify/MagnifyVanilla.ts
  var DEFAULTS21 = {
    size: 140,
    zoom: 1.5,
    scrollZoom: false,
    zoomModifier: "shift",
    color: [0.8, 0.8, 0.8],
    follow: 0.25,
    hud: 0.8,
    ring: true,
    crosshair: true,
    ticks: true,
    brackets: true,
    dot: true,
    grid: false,
    readout: true,
    aberration: 0.8,
    haze: 0.2,
    ripples: true,
    rippleSpeed: 900,
    rippleWidth: 2,
    rippleBendWidth: 100,
    rippleBend: 20,
    rippleGlow: 1,
    rippleLife: 1.4
  };
  var MAX_RIPPLES = 6;
  var MIN_ZOOM = 1;
  var MAX_ZOOM = 4;
  var WHEEL_LINE = 16;
  var ZOOM_SENSITIVITY = 22e-4;
  function clampZoom(value) {
    return Math.min(Math.max(value, MIN_ZOOM), MAX_ZOOM);
  }
  var MODIFIER_HELD = {
    shift: (event) => event.shiftKey,
    alt: (event) => event.altKey,
    ctrl: (event) => event.ctrlKey,
    meta: (event) => event.metaKey,
    none: () => true
  };
  var VERT20 = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPos;
void main () {
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;
  var FRAG15 = `#version 300 es
precision highp float;
out vec4 outColor;
uniform sampler2D uContent;
uniform vec2 uResolution;
uniform float uMaxX;
uniform float uHasContent;
uniform float uDpr;
uniform vec2 uCenter;
uniform float uRadius;
uniform float uZoom;
uniform float uAlpha;
uniform vec3 uColor;
uniform float uHud;
uniform float uRing;
uniform float uCross;
uniform float uTicks;
uniform float uBrackets;
uniform float uDot;
uniform float uGrid;
uniform float uAberration;
uniform float uHaze;
uniform vec4 uRipples[${MAX_RIPPLES}];
uniform float uRippleWidth;
uniform float uRippleBendWidth;
uniform float uRippleBend;
uniform float uRippleGlow;

const float PI = 3.14159265358979;

float pow2 (float x) { return x * x; }

vec3 page (vec2 px, float lod) {
  vec2 uv = px / uResolution;
  uv.x = clamp(uv.x, 0.0005, uMaxX - 0.0005);
  uv.y = clamp(uv.y, 0.0005, 0.9995);
  return pow(textureLod(uContent, vec2(uv.x, 1.0 - uv.y), lod).rgb, vec3(2.2));
}

vec3 pageAA (vec2 px, float minLod) {
  float footprint = max(length(fwidth(px)), 1.0);
  return page(px, max(minLod, log2(footprint)));
}

float line (float d, float halfWidth) {
  return 1.0 - smoothstep(halfWidth - 0.75, halfWidth + 0.75, abs(d));
}

void main () {
  vec2 fragPx = gl_FragCoord.xy;
  vec2 p = fragPx - uCenter;
  float d = length(p);
  float R = uRadius;
  float w = 1.1 * uDpr;

  vec2 rippleOffset = vec2(0.0);
  float crest = 0.0;
  float bendVis = 0.0;
  for (int i = 0; i < ${MAX_RIPPLES}; i++) {
    vec4 rp = uRipples[i];
    vec2 rd = fragPx - rp.xy;
    float rl = max(length(rd), 1.0);
    float bendBand = exp(-pow2((rl - rp.z) / max(uRippleBendWidth * uDpr, 1.0)));
    float crestBand = exp(-pow2((rl - rp.z) / max(uRippleWidth * uDpr, 1.0)));
    rippleOffset += (rd / rl) * bendBand * rp.w * uRippleBend * uDpr;
    crest = max(crest, crestBand * rp.w);
    bendVis = max(bendVis, bendBand * rp.w);
  }

  float inContent = 1.0 - smoothstep(
    uMaxX * uResolution.x - 2.0, uMaxX * uResolution.x, fragPx.x);
  crest *= inContent;
  float rippleCover = smoothstep(0.001, 0.03, bendVis) * inContent;

  float lensMask = 1.0 - smoothstep(R - 1.5, R, d);
  vec2 lensPx = uCenter + p / max(uZoom, 1.0) - rippleOffset;
  float rimT = pow2(clamp(d / max(R, 1.0), 0.0, 1.0));
  vec2 dir = p / max(d, 0.5);
  float caPx = uAberration * 5.0 * rimT * uDpr;
  float hazeLod = uHaze * 3.0 * (0.3 + 0.7 * rimT);
  vec3 inside;
  inside.r = pageAA(lensPx + dir * caPx, hazeLod).r;
  inside.g = pageAA(lensPx, hazeLod).g;
  inside.b = pageAA(lensPx - dir * caPx, hazeLod).b;

  vec3 soft = page(lensPx, 4.5);
  inside = mix(
    inside,
    soft * (1.0 + 0.4 * uHaze) + uColor * 0.06 * uHaze,
    clamp(uHaze, 0.0, 1.0) * 0.45);

  vec3 bent = pageAA(fragPx - rippleOffset, 0.0);

  float hud = 0.0;

  hud += uRing * line(d - R, 1.3 * uDpr);

  float angle = atan(p.y, p.x);
  float sector = PI / 4.0;
  float da = abs(angle - (floor(angle / sector + 0.5) * sector)) * max(d, 1.0);
  float tickBand = smoothstep(R + 4.0 * uDpr, R + 6.0 * uDpr, d)
    * (1.0 - smoothstep(R + 12.0 * uDpr, R + 14.0 * uDpr, d));
  hud += uTicks * line(da, w) * tickBand;

  float reach = R * 1.14;
  float crossLine = max(
    line(p.x, w) * step(abs(p.y), reach),
    line(p.y, w) * step(abs(p.x), reach));
  hud += uCross * crossLine * smoothstep(6.0 * uDpr, 10.0 * uDpr, d) * 0.75;

  vec2 q = abs(p);
  float c = R * 0.64;
  float len = R * 0.2;
  float arm1 = line(q.x - c, w) * step(c - len, q.y) * step(q.y, c + w);
  float arm2 = line(q.y - c, w) * step(c - len, q.x) * step(q.x, c + w);
  hud += uBrackets * max(arm1, arm2);

  hud += uDot * (1.0 - smoothstep(1.6 * uDpr, 2.6 * uDpr, d));
  hud += uDot * line(d - 5.5 * uDpr, 0.9 * uDpr) * 0.6;

  float spacing = max(R * 0.25, 8.0);
  float gx = line(mod(p.x + spacing * 0.5, spacing) - spacing * 0.5, 0.6 * uDpr);
  float gy = line(mod(p.y + spacing * 0.5, spacing) - spacing * 0.5, 0.6 * uDpr);
  hud += uGrid * max(gx, gy) * lensMask * 0.16;

  hud = clamp(hud, 0.0, 1.0) * uHud;

  if (uHasContent < 0.5) {
    vec3 hudCol = pow(max(uColor, 0.0), vec3(1.0 / 2.2));
    float hudA = hud * uAlpha;
    float glow = clamp(pow(crest, 1.5) * uRippleGlow, 0.0, 1.0) * inContent;
    float a = max(hudA, lensMask * uAlpha * 0.08);
    a = max(a, glow * 0.7);
    outColor = vec4(hudCol * clamp(hudA + glow * 0.7, 0.0, 1.0), a);
    return;
  }

  vec3 base = mix(bent, inside, lensMask * uAlpha);
  base += uColor * pow(crest, 1.5) * uRippleGlow * 0.7;
  float hudA = hud * uAlpha;
  base = mix(base, uColor, hudA);

  float alpha = max(lensMask * uAlpha, rippleCover);
  alpha = max(alpha, clamp(pow(crest, 1.5) * uRippleGlow, 0.0, 1.0));
  alpha = max(alpha, hudA);

  outColor = vec4(pow(max(base, 0.0), vec3(1.0 / 2.2)) * alpha, alpha);
}`;
  function createMagnify(elements, options = {}) {
    const config = { ...DEFAULTS21, ...options };
    const { source, content, output } = elements;
    const gl = output.getContext("webgl2", {
      alpha: true,
      depth: false,
      stencil: false,
      antialias: false,
      premultipliedAlpha: true
    });
    if (!gl || gl.isContextLost()) return null;
    const sourceCtx = source.getContext("2d");
    const paintable = source;
    const htmlInCanvas = Boolean(
      sourceCtx && typeof sourceCtx.drawElementImage === "function" && typeof paintable.requestPaint === "function"
    );
    if (htmlInCanvas) prepareHtmlInCanvas(source, content);
    let contentDirty = false;
    let wake = () => {
    };
    if (htmlInCanvas) {
      paintable.onpaint = () => {
        try {
          sourceCtx.reset();
          drawHtmlInCanvas(source, sourceCtx, content);
          contentDirty = true;
          wake();
        } catch {
        }
      };
    }
    function compile(type, text) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, text);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error("Magnify shader error:", gl.getShaderInfoLog(shader));
      }
      return shader;
    }
    const vertexShader = compile(gl.VERTEX_SHADER, VERT20);
    const fragmentShader = compile(gl.FRAGMENT_SHADER, FRAG15);
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    const uniforms = {};
    const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < count; i++) {
      const info = gl.getActiveUniform(program, i);
      uniforms[info.name] = gl.getUniformLocation(program, info.name);
    }
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const contentTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, contentTexture);
    gl.texParameteri(
      gl.TEXTURE_2D,
      gl.TEXTURE_MIN_FILTER,
      gl.LINEAR_MIPMAP_LINEAR
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([0, 0, 0, 0])
    );
    gl.generateMipmap(gl.TEXTURE_2D);
    let contentMaxX = 1;
    const readout = document.createElement("div");
    readout.setAttribute("aria-hidden", "true");
    Object.assign(readout.style, {
      position: "absolute",
      left: "0",
      top: "0",
      pointerEvents: "none",
      whiteSpace: "pre",
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
      fontSize: "10px",
      lineHeight: "1.8",
      letterSpacing: "0.14em",
      opacity: "0",
      zIndex: "1",
      willChange: "transform, opacity"
    });
    (output.parentElement ?? output.ownerDocument.body).appendChild(readout);
    function accentCss() {
      const [r, g, b] = config.color;
      return `rgb(${Math.round(r * 255)} ${Math.round(g * 255)} ${Math.round(b * 255)})`;
    }
    function syncCanvasSize() {
      const dpr = getCanvasPixelRatio(output, gl);
      const width = Math.max(1, Math.round(output.clientWidth * dpr));
      const height = Math.max(1, Math.round(output.clientHeight * dpr));
      if (output.width !== width || output.height !== height) {
        output.width = width;
        output.height = height;
      }
      contentMaxX = Math.min(
        1,
        Math.max(0.05, content.clientWidth / Math.max(output.clientWidth, 1))
      );
      if (htmlInCanvas) {
        const sourceWidth = Math.max(1, Math.round(source.clientWidth * dpr));
        const sourceHeight = Math.max(1, Math.round(source.clientHeight * dpr));
        if (source.width !== sourceWidth || source.height !== sourceHeight) {
          source.width = sourceWidth;
          source.height = sourceHeight;
        }
        paintable.requestPaint();
      }
    }
    syncCanvasSize();
    function uploadContent() {
      if (!htmlInCanvas || !contentDirty) return;
      contentDirty = false;
      gl.bindTexture(gl.TEXTURE_2D, contentTexture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        source
      );
      gl.generateMipmap(gl.TEXTURE_2D);
    }
    let posX = output.clientWidth / 2;
    let posY = output.clientHeight / 2;
    let targetX = posX;
    let targetY = posY;
    let presence = 0;
    let presenceTarget = 0;
    let hasPointer = false;
    let zoomTarget = clampZoom(config.zoom);
    let zoomValue = zoomTarget;
    const ripples = [];
    const rippleData = new Float32Array(MAX_RIPPLES * 4);
    function syncReadout(now) {
      const show = config.readout && config.hud > 0.01 && presence > 0.05;
      readout.style.opacity = show ? String(Math.min(presence, 1) * Math.min(config.hud, 1)) : "0";
      if (!show) return;
      const R = Math.max(config.size, 8) * presence;
      const width = output.clientWidth;
      const boxW = 120;
      let rx = posX + R + 18;
      if (rx + boxW > width - 8) rx = posX - R - 18 - boxW;
      const ry = Math.min(
        Math.max(posY - 34, 8),
        Math.max(output.clientHeight - 90, 8)
      );
      readout.style.transform = `translate(${Math.round(rx)}px, ${Math.round(ry)}px)`;
      readout.style.color = accentCss();
      const blink = Math.floor(now / 600) % 2 === 0 ? "\u25CF" : "\u25CB";
      readout.textContent = `X ${String(Math.round(posX)).padStart(4, " ")}
Y ${String(Math.round(posY)).padStart(4, " ")}
${zoomValue.toFixed(1)}X MAG
R ${Math.round(config.size)}PX ${blink}`;
    }
    function render() {
      uploadContent();
      const dpr = output.width / Math.max(output.clientWidth, 1);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, output.width, output.height);
      gl.disable(gl.SCISSOR_TEST);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (presence <= 4e-3 && ripples.length === 0) return;
      const R = Math.max(config.size, 8) * presence;
      const alpha = Math.min(presence * 5, 1);
      const cx = posX * dpr;
      const cy = output.height - posY * dpr;
      if (ripples.length === 0) {
        const margin = (R * 0.25 + 160) * dpr;
        const sx = Math.max(0, Math.floor(cx - R * dpr - margin));
        const sy = Math.max(0, Math.floor(cy - R * dpr - margin));
        gl.enable(gl.SCISSOR_TEST);
        gl.scissor(
          sx,
          sy,
          Math.min(output.width - sx, Math.ceil((R * dpr + margin) * 2)),
          Math.min(output.height - sy, Math.ceil((R * dpr + margin) * 2))
        );
      }
      rippleData.fill(0);
      for (let i = 0; i < Math.min(ripples.length, MAX_RIPPLES); i++) {
        const ripple = ripples[i];
        const t = ripple.age / Math.max(config.rippleLife, 0.1);
        rippleData[i * 4] = ripple.x * dpr;
        rippleData[i * 4 + 1] = output.height - ripple.y * dpr;
        rippleData[i * 4 + 2] = (ripple.r0 + Math.max(config.rippleSpeed, 1) * ripple.age) * dpr;
        rippleData[i * 4 + 3] = Math.pow(Math.max(1 - t, 0), 2);
      }
      gl.useProgram(program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, contentTexture);
      gl.uniform1i(uniforms.uContent, 0);
      gl.uniform2f(uniforms.uResolution, output.width, output.height);
      gl.uniform1f(uniforms.uMaxX, contentMaxX);
      gl.uniform1f(uniforms.uHasContent, htmlInCanvas ? 1 : 0);
      gl.uniform1f(uniforms.uDpr, dpr);
      gl.uniform2f(uniforms.uCenter, cx, cy);
      gl.uniform1f(uniforms.uRadius, R * dpr);
      gl.uniform1f(uniforms.uZoom, zoomValue);
      gl.uniform1f(uniforms.uAlpha, alpha);
      gl.uniform3f(
        uniforms.uColor,
        config.color[0],
        config.color[1],
        config.color[2]
      );
      gl.uniform1f(uniforms.uHud, Math.min(Math.max(config.hud, 0), 1));
      gl.uniform1f(uniforms.uRing, config.ring ? 1 : 0);
      gl.uniform1f(uniforms.uCross, config.crosshair ? 1 : 0);
      gl.uniform1f(uniforms.uTicks, config.ticks ? 1 : 0);
      gl.uniform1f(uniforms.uBrackets, config.brackets ? 1 : 0);
      gl.uniform1f(uniforms.uDot, config.dot ? 1 : 0);
      gl.uniform1f(uniforms.uGrid, config.grid ? 1 : 0);
      gl.uniform1f(uniforms.uAberration, Math.max(config.aberration, 0));
      gl.uniform1f(uniforms.uHaze, Math.min(Math.max(config.haze, 0), 1));
      gl.uniform4fv(uniforms["uRipples[0]"], rippleData);
      gl.uniform1f(uniforms.uRippleWidth, Math.max(config.rippleWidth, 0.5));
      gl.uniform1f(
        uniforms.uRippleBendWidth,
        Math.max(config.rippleBendWidth, 1)
      );
      gl.uniform1f(uniforms.uRippleBend, Math.max(config.rippleBend, 0));
      gl.uniform1f(uniforms.uRippleGlow, Math.max(config.rippleGlow, 0));
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.disable(gl.SCISSOR_TEST);
    }
    let raf = 0;
    let lastTime = performance.now();
    let destroyed = false;
    let running = false;
    let visible = true;
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reducedMotion = motionQuery.matches;
    function frame(now) {
      if (destroyed) return;
      if (!visible) {
        running = false;
        return;
      }
      const delta = Math.min((now - lastTime) / 1e3, 1 / 30);
      lastTime = now;
      const follow = Math.min(Math.max(config.follow, 0.02), 1);
      const kPos = reducedMotion || follow >= 1 ? 1 : 1 - Math.exp(-delta * (4 + follow * 26));
      const kScale = reducedMotion ? 1 : 1 - Math.exp(-delta * 11);
      posX += (targetX - posX) * kPos;
      posY += (targetY - posY) * kPos;
      presence += (presenceTarget - presence) * kScale;
      zoomValue += (zoomTarget - zoomValue) * kScale;
      for (const ripple of ripples) ripple.age += delta;
      for (let i = ripples.length - 1; i >= 0; i--) {
        if (ripples[i].age > Math.max(config.rippleLife, 0.1)) {
          ripples.splice(i, 1);
        }
      }
      render();
      syncReadout(now);
      const settled = Math.abs(targetX - posX) < 0.1 && Math.abs(targetY - posY) < 0.1 && Math.abs(presenceTarget - presence) < 2e-3 && Math.abs(zoomTarget - zoomValue) < 2e-3;
      if (settled && !contentDirty && ripples.length === 0) {
        posX = targetX;
        posY = targetY;
        presence = presenceTarget;
        zoomValue = zoomTarget;
        running = false;
        return;
      }
      raf = requestAnimationFrame(frame);
    }
    function start() {
      if (destroyed || running || !visible) return;
      running = true;
      lastTime = performance.now();
      raf = requestAnimationFrame(frame);
    }
    wake = start;
    start();
    const rectCache = createRectCache(output);
    function onPointerMove(event) {
      const rect = rectCache.current;
      targetX = event.clientX - rect.left;
      targetY = event.clientY - rect.top;
      if (!hasPointer) {
        posX = targetX;
        posY = targetY;
        hasPointer = true;
      }
      presenceTarget = 1;
      start();
    }
    function onPointerLeave() {
      presenceTarget = 0;
      hasPointer = false;
      start();
    }
    function onPointerDown(event) {
      if (!config.ripples || event.button > 0 || reducedMotion) return;
      if (ripples.length >= MAX_RIPPLES) ripples.shift();
      ripples.push({
        x: posX,
        y: posY,
        r0: Math.max(config.size, 8) * presence,
        age: 0
      });
      start();
    }
    content.addEventListener("pointermove", onPointerMove, { passive: true });
    content.addEventListener("pointerleave", onPointerLeave, { passive: true });
    content.addEventListener("pointerdown", onPointerDown, { passive: true });
    function onWheel(event) {
      const held = MODIFIER_HELD[config.zoomModifier] ?? MODIFIER_HELD.shift;
      if (!held(event)) return;
      const rect = output.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) {
        return;
      }
      event.preventDefault();
      const unit = event.deltaMode === 1 ? WHEEL_LINE : event.deltaMode === 2 ? output.clientHeight : 1;
      const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
      zoomTarget = clampZoom(
        zoomTarget * Math.exp(-delta * unit * ZOOM_SENSITIVITY)
      );
      start();
    }
    const WHEEL_OPTIONS = {
      passive: false,
      capture: true
    };
    let wheelBound = false;
    function syncWheel() {
      if (config.scrollZoom === wheelBound) return;
      wheelBound = config.scrollZoom;
      if (wheelBound) window.addEventListener("wheel", onWheel, WHEEL_OPTIONS);
      else window.removeEventListener("wheel", onWheel, WHEEL_OPTIONS);
    }
    syncWheel();
    function onScroll() {
      start();
    }
    content.addEventListener("scroll", onScroll, { passive: true });
    function onMotionChange() {
      reducedMotion = motionQuery.matches;
      start();
    }
    motionQuery.addEventListener("change", onMotionChange);
    const observer = createCanvasResizeObserver(() => {
      syncCanvasSize();
      start();
    });
    observer.observe(output);
    observer.observe(content);
    const intersection = new IntersectionObserver((entries) => {
      visible = entries[entries.length - 1]?.isIntersecting ?? true;
      if (visible) start();
    });
    intersection.observe(output);
    return {
      setOptions(next) {
        if (!Object.entries(next).some(
          ([key, value]) => config[key] !== value
        ))
          return;
        const previousZoom = config.zoom;
        Object.assign(config, next);
        if (!config.scrollZoom || config.zoom !== previousZoom) {
          zoomTarget = clampZoom(config.zoom);
        }
        syncWheel();
        start();
      },
      resize() {
        syncCanvasSize();
        start();
      },
      destroy() {
        destroyed = true;
        rectCache.destroy();
        cancelAnimationFrame(raf);
        content.removeEventListener("pointermove", onPointerMove);
        content.removeEventListener("pointerleave", onPointerLeave);
        content.removeEventListener("pointerdown", onPointerDown);
        window.removeEventListener("wheel", onWheel, WHEEL_OPTIONS);
        content.removeEventListener("scroll", onScroll);
        observer.disconnect();
        intersection.disconnect();
        motionQuery.removeEventListener("change", onMotionChange);
        readout.remove();
        gl.deleteTexture(contentTexture);
        gl.deleteProgram(program);
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
        gl.deleteBuffer(quad);
        if (htmlInCanvas) paintable.onpaint = null;
      }
    };
  }

  // src/effects/magnify.js
  var CONTROLS21 = {
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
        { value: "none", label: "None" }
      ],
      { when: (values) => values.scrollZoom === true }
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
      decimals: 0
    }),
    rippleWidth: scrub("Ripple width", 2, {
      min: 0.5,
      max: 24,
      step: 0.5,
      decimals: 1
    }),
    rippleBendWidth: scrub("Bend width", 100, {
      min: 10,
      max: 240,
      step: 5,
      decimals: 0
    }),
    rippleBend: scrub("Ripple bend", 20, {
      min: 0,
      max: 120,
      step: 2,
      decimals: 0
    }),
    rippleGlow: scrub("Ripple glow", 1, { min: 0, max: 2, step: 0.05 })
  };
  var magnify_default = {
    slug: "magnify",
    name: "Magnify",
    component: "Magnify",
    description: "A sci-fi scanner lens with click ripples.",
    controls: CONTROLS21,
    toOptions(values) {
      const { color: color2, ...rest } = values;
      return {
        ...rest,
        color: hexToRgb(color2)
      };
    },
    create: createMagnify
  };

  // src/vendor/lib/ParticleReveal/ParticleRevealVanilla.ts
  var DEFAULTS22 = {
    radius: 500,
    softness: 0.75,
    size: 1,
    scatter: 25,
    drift: 1,
    aberration: 40,
    bend: 50,
    fade: 0.85,
    threshold: 0.1,
    background: "#000000",
    smoothing: 0.25
  };
  var VERT21 = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPos;
out vec2 vUv;
void main () {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;
  var FRAG16 = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uContent;
uniform vec2 uRes;
uniform float uDpr;
uniform vec2 uPointer;
uniform float uActive;
uniform float uRadius;
uniform float uSoftness;
uniform float uSize;
uniform float uScatter;
uniform float uDrift;
uniform float uAberration;
uniform float uBend;
uniform float uFade;
uniform float uThreshold;
uniform vec3 uBg;
uniform float uTime;
uniform float uMaxX;
uniform float uCrisp;

float hash (vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec4 samp (vec2 p) {
  vec2 uv = p / uRes;
  uv = clamp(uv, vec2(0.001), vec2(uMaxX - 0.001, 0.999));
  return texture(uContent, uv);
}

void main () {
  vec2 pc = vec2(vUv.x, 1.0 - vUv.y) * uRes;
  if (pc.x > uMaxX * uRes.x) {
    outColor = vec4(0.0);
    return;
  }
  if (uCrisp > 0.5) {
    outColor = samp(pc);
    return;
  }

  float dist = length(pc - uPointer);
  float radius = max(uRadius, 1.0);
  float inner = radius * (1.0 - clamp(uSoftness, 0.02, 1.0));
  float e = (1.0 - smoothstep(inner, radius, dist)) * uActive;

  float band = radius * 0.9;
  float ring = smoothstep(inner, radius, dist)
    * (1.0 - smoothstep(radius, radius + band, dist))
    * uActive;

  vec2 dir = (pc - uPointer) / max(dist, 1e-3);
  vec2 tang = vec2(-dir.y, dir.x);
  vec2 warp = (dir * -1.0 + tang * 0.6) * uBend * ring;
  float ca = uAberration * ring;

  float cellPx = max(uSize, 0.5) * uDpr;
  vec2 cell = floor(gl_FragCoord.xy / cellPx);
  float n1 = hash(cell);
  float n2 = hash(cell + vec2(3.1, 7.7));
  float n3 = hash(cell + vec2(9.3, 1.3));
  float ft = floor(uTime * (2.0 + uDrift * 6.0));
  float n4 = hash(cell + vec2(ft * 0.613, ft * 0.831));

  float g0 = uThreshold * 0.6;
  float g1 = uThreshold * 1.6 + 0.01;
  vec3 lw = vec3(0.299, 0.587, 0.114);

  vec2 bp = pc + warp;
  vec4 bR = samp(bp + dir * ca);
  vec4 bC = samp(bp);
  vec4 bB = samp(bp - dir * ca);
  vec3 baseRgb = vec3(bR.r, bC.g, bB.b);
  float uiHome = smoothstep(g0, g1, dot(abs(baseRgb - uBg), lw));

  float rad = uScatter * pow(n1, 2.5) * (1.0 - e);
  float ang = n2 * 6.2832 + uTime * uDrift * (0.5 + n3 * 1.5);
  vec2 dustP = bp + vec2(cos(ang), sin(ang)) * rad;

  vec4 dR = samp(dustP + dir * ca);
  vec4 dC = samp(dustP);
  vec4 dB = samp(dustP - dir * ca);
  vec3 dustRgb = vec3(dR.r, dC.g, dB.b);
  float lumD = dot(dustRgb, lw);
  float dDust = dot(abs(dustRgb - uBg), lw);

  float gate = smoothstep(g0, g1, dDust);
  float falloff = 1.0 - 0.7 * rad / max(uScatter, 1.0);
  float prob = clamp(gate * (0.15 + 1.2 * sqrt(dDust)) * falloff, 0.0, 1.0) * uiHome;
  float speck = step(n4 * 0.999, prob);

  float shade = pow(lumD, 0.4) * (0.8 + 0.4 * n3);
  vec3 dustCol = mix(uBg, vec3(shade), clamp(uFade, 0.0, 1.0));

  vec3 unrevealed = mix(mix(baseRgb, uBg, uiHome), dustCol, speck);
  vec3 col = mix(unrevealed, baseRgb, e);
  float alpha = mix(bC.a, dC.a, speck * (1.0 - e));
  outColor = vec4(col, alpha);
}`;
  var colorProbe2 = null;
  function parseColor2(input) {
    if (typeof document === "undefined") return [0, 0, 0];
    if (!colorProbe2) {
      const probe = document.createElement("canvas");
      probe.width = 1;
      probe.height = 1;
      colorProbe2 = probe.getContext("2d", { willReadFrequently: true });
    }
    if (!colorProbe2) return [0, 0, 0];
    colorProbe2.fillStyle = "#000000";
    colorProbe2.fillStyle = input;
    colorProbe2.clearRect(0, 0, 1, 1);
    colorProbe2.fillRect(0, 0, 1, 1);
    const data = colorProbe2.getImageData(0, 0, 1, 1).data;
    return [data[0] / 255, data[1] / 255, data[2] / 255];
  }
  function createParticleReveal(elements, options = {}) {
    const config = { ...DEFAULTS22, ...options };
    const { source, content, output } = elements;
    const gl = output.getContext("webgl2", {
      alpha: true,
      depth: false,
      stencil: false,
      antialias: false,
      premultipliedAlpha: false
    });
    if (!gl || gl.isContextLost()) return null;
    const sourceCtx = source.getContext("2d");
    const paintable = source;
    const htmlInCanvas = Boolean(
      sourceCtx && typeof sourceCtx.drawElementImage === "function" && typeof paintable.requestPaint === "function"
    );
    if (htmlInCanvas) prepareHtmlInCanvas(source, content);
    let contentDirty = false;
    let wake = () => {
    };
    if (htmlInCanvas) {
      paintable.onpaint = () => {
        try {
          sourceCtx.reset();
          drawHtmlInCanvas(source, sourceCtx, content);
          contentDirty = true;
          wake();
        } catch {
        }
      };
    }
    function compile(type, text) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, text);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error(
          "ParticleReveal shader error:",
          gl.getShaderInfoLog(shader)
        );
      }
      return shader;
    }
    const vertexShader = compile(gl.VERTEX_SHADER, VERT21);
    const fragmentShader = compile(gl.FRAGMENT_SHADER, FRAG16);
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    const uniforms = {};
    const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < count; i++) {
      const info = gl.getActiveUniform(program, i);
      uniforms[info.name] = gl.getUniformLocation(program, info.name);
    }
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const contentTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, contentTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([0, 0, 0, 0])
    );
    let contentMaxX = 1;
    function syncCanvasSize() {
      const dpr = getCanvasPixelRatio(output, gl);
      const width = Math.max(1, Math.round(output.clientWidth * dpr));
      const height = Math.max(1, Math.round(output.clientHeight * dpr));
      if (output.width !== width || output.height !== height) {
        output.width = width;
        output.height = height;
      }
      contentMaxX = Math.min(
        1,
        Math.max(0.05, content.clientWidth / Math.max(output.clientWidth, 1))
      );
      if (htmlInCanvas) {
        const sourceWidth = Math.max(1, Math.round(source.clientWidth * dpr));
        const sourceHeight = Math.max(1, Math.round(source.clientHeight * dpr));
        if (source.width !== sourceWidth || source.height !== sourceHeight) {
          source.width = sourceWidth;
          source.height = sourceHeight;
        }
        paintable.requestPaint();
      }
    }
    const pointer = {
      x: -1e5,
      y: -1e5,
      tx: -1e5,
      ty: -1e5,
      active: 0,
      target: 0
    };
    let time = 0;
    let bgKey = "";
    let bg = [0, 0, 0];
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reducedMotion = motionQuery.matches;
    syncCanvasSize();
    function uploadContent() {
      if (!htmlInCanvas || !contentDirty) return;
      contentDirty = false;
      gl.bindTexture(gl.TEXTURE_2D, contentTexture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        source
      );
    }
    function render() {
      uploadContent();
      const w = Math.max(output.clientWidth, 1);
      const h = Math.max(output.clientHeight, 1);
      const dpr = output.width / w;
      gl.useProgram(program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, contentTexture);
      gl.uniform1i(uniforms.uContent, 0);
      gl.uniform2f(uniforms.uRes, w, h);
      gl.uniform1f(uniforms.uDpr, dpr);
      gl.uniform2f(uniforms.uPointer, pointer.x, pointer.y);
      gl.uniform1f(uniforms.uActive, pointer.active);
      gl.uniform1f(uniforms.uRadius, Math.max(config.radius, 1));
      gl.uniform1f(uniforms.uSoftness, config.softness);
      gl.uniform1f(uniforms.uSize, Math.max(config.size, 0.5));
      gl.uniform1f(uniforms.uScatter, Math.max(config.scatter, 0));
      gl.uniform1f(uniforms.uDrift, Math.max(config.drift, 0));
      gl.uniform1f(uniforms.uAberration, Math.max(config.aberration, 0));
      gl.uniform1f(uniforms.uBend, Math.max(config.bend, 0));
      gl.uniform1f(uniforms.uFade, config.fade);
      gl.uniform1f(uniforms.uThreshold, Math.max(config.threshold, 0));
      if (config.background !== bgKey) {
        bgKey = config.background;
        bg = parseColor2(config.background);
      }
      gl.uniform3f(uniforms.uBg, bg[0], bg[1], bg[2]);
      gl.uniform1f(uniforms.uTime, time);
      gl.uniform1f(uniforms.uMaxX, contentMaxX);
      gl.uniform1f(uniforms.uCrisp, reducedMotion || !htmlInCanvas ? 1 : 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, output.width, output.height);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    let raf = 0;
    let lastTime = performance.now();
    let destroyed = false;
    let running = false;
    let visible = true;
    function frame(now) {
      if (destroyed) return;
      if (!visible) {
        running = false;
        return;
      }
      const delta = Math.min((now - lastTime) / 1e3, 1 / 30);
      lastTime = now;
      time += delta;
      const tau = Math.max(config.smoothing, 1e-4);
      const k = reducedMotion ? 1 : 1 - Math.exp(-delta / tau);
      pointer.x += (pointer.tx - pointer.x) * k;
      pointer.y += (pointer.ty - pointer.y) * k;
      pointer.active += (pointer.target - pointer.active) * k;
      render();
      const settled = Math.abs(pointer.tx - pointer.x) < 0.1 && Math.abs(pointer.ty - pointer.y) < 0.1 && Math.abs(pointer.target - pointer.active) < 1e-3;
      if (settled && !contentDirty && (reducedMotion || !htmlInCanvas || config.drift <= 0)) {
        pointer.x = pointer.tx;
        pointer.y = pointer.ty;
        pointer.active = pointer.target;
        running = false;
        return;
      }
      raf = requestAnimationFrame(frame);
    }
    function start() {
      if (destroyed || running || !visible) return;
      running = true;
      lastTime = performance.now();
      raf = requestAnimationFrame(frame);
    }
    wake = start;
    start();
    function onMotionChange() {
      reducedMotion = motionQuery.matches;
      start();
    }
    motionQuery.addEventListener("change", onMotionChange);
    const observer = createCanvasResizeObserver(() => {
      syncCanvasSize();
      start();
    });
    observer.observe(output);
    observer.observe(content);
    const intersection = new IntersectionObserver((entries) => {
      visible = entries[entries.length - 1]?.isIntersecting ?? true;
      if (visible) start();
    });
    intersection.observe(output);
    const listenTarget = output.parentElement ?? output;
    const rectCache = createRectCache(output);
    function onPointerMove(event) {
      const rect = rectCache.current;
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      if (pointer.target === 0 && pointer.active < 1e-3) {
        pointer.x = x;
        pointer.y = y;
      }
      pointer.tx = x;
      pointer.ty = y;
      pointer.target = 1;
      start();
    }
    function onPointerLeave() {
      pointer.target = 0;
      start();
    }
    listenTarget.addEventListener("pointermove", onPointerMove, { passive: true });
    listenTarget.addEventListener("pointerleave", onPointerLeave, { passive: true });
    return {
      setOptions(next) {
        if (!Object.entries(next).some(
          ([key, value]) => config[key] !== value
        ))
          return;
        Object.assign(config, next);
        start();
      },
      resize() {
        syncCanvasSize();
        start();
      },
      destroy() {
        destroyed = true;
        rectCache.destroy();
        cancelAnimationFrame(raf);
        observer.disconnect();
        intersection.disconnect();
        motionQuery.removeEventListener("change", onMotionChange);
        listenTarget.removeEventListener("pointermove", onPointerMove);
        listenTarget.removeEventListener("pointerleave", onPointerLeave);
        gl.deleteTexture(contentTexture);
        gl.deleteProgram(program);
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
        gl.deleteBuffer(quad);
        if (htmlInCanvas) paintable.onpaint = null;
      }
    };
  }

  // src/effects/particle-reveal.js
  var CONTROLS22 = {
    radius: scrub("Radius", 500, { min: 60, max: 900, step: 10, decimals: 0 }),
    softness: scrub("Softness", 0.75, { min: 0.05, max: 1, step: 0.05 }),
    size: scrub("Size", 1, { min: 0.5, max: 3, step: 0.25 }),
    scatter: scrub("Scatter", 25, { min: 0, max: 200, step: 5, decimals: 0 }),
    drift: scrub("Drift", 1, { min: 0, max: 2, step: 0.1, decimals: 1 }),
    aberration: scrub("Aberration", 40, {
      min: 0,
      max: 80,
      step: 2,
      decimals: 0
    }),
    bend: scrub("Bend", 50, { min: 0, max: 240, step: 10, decimals: 0 }),
    fade: scrub("Fade", 0.85, { min: 0, max: 1, step: 0.05 }),
    threshold: scrub("Threshold", 0.1, { min: 0, max: 0.3, step: 0.01 }),
    smoothing: scrub("Smoothing", 0.25, { min: 0, max: 1, step: 0.05 })
  };
  var particle_reveal_default = {
    slug: "particle-reveal",
    name: "Particle Reveal",
    component: "ParticleReveal",
    description: "UI revealed from fine particles by the cursor.",
    controls: CONTROLS22,
    // В плейграунде entry читает фон страницы через getComputedStyle(document.body)
    // и следит за сменой темы через MutationObserver на classList <html>. Тут просто
    // берём текущий css-цвет фона хоста из ctx — ParticleRevealVanilla сам парсит
    // произвольную css-строку цвета (options.background, см. parseColor в vendor).
    toOptions(values, ctx) {
      return {
        ...values,
        background: ctx.background
      };
    },
    create: createParticleReveal
  };

  // src/vendor/lib/ParticleScroll/ParticleScrollVanilla.ts
  var DEFAULTS23 = {
    point: 0.68,
    band: 420,
    density: 2,
    size: 1.25,
    spread: 220,
    gravity: 0.35,
    drift: 0.7,
    swirl: 60,
    stagger: 0.7,
    fade: 0.85,
    settle: 1.2,
    smoothing: 0.6
  };
  var HASH = `
float hash (vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}`;
  var QUAD_VERT = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPos;
out vec2 vUv;
void main () {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;
  var BASE_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uContent;
uniform sampler2D uRowTex;
uniform vec2 uRes;
uniform float uDensity;
uniform float uRowCount;
uniform float uStagger;
uniform float uMaxX;
uniform float uCover;
uniform float uScroll;
uniform float uWinStart;
uniform vec3 uBg;
${HASH}
void main () {
  vec2 px = vec2(vUv.x, 1.0 - vUv.y) * uRes;
  vec2 cell = floor(vec2(px.x, px.y + uScroll) / uDensity);
  float h1 = hash(cell);
  float d = h1 * uStagger;
  int row = int(clamp(cell.y - uWinStart, 0.0, uRowCount - 1.0));
  float p = texelFetch(uRowTex, ivec2(row, 0), 0).r;
  float t = clamp((p - d) / max(1.0 - d, 1e-3), 0.0, 1.0);
  float vis = step(0.9995, t) * step(px.x, uMaxX * uRes.x);
  vec4 tex = texture(uContent, vec2(vUv.x, 1.0 - vUv.y));
  outColor = vec4(mix(uBg, tex.rgb, vis * tex.a), uCover);
}`;
  var POINT_VERT = `#version 300 es
precision highp float;
uniform sampler2D uRowTex;
uniform vec2 uRes;
uniform vec2 uGrid;
uniform float uDensity;
uniform float uStagger;
uniform float uSpread;
uniform float uGravity;
uniform float uDrift;
uniform float uSwirl;
uniform float uTime;
uniform float uFade;
uniform float uSize;
uniform float uDpr;
uniform float uMaxX;
uniform float uLag;
uniform float uScroll;
uniform float uWinStart;
out vec2 vCenter;
out float vSize;
out float vAlpha;
out float vLod;
out float vMerge;
${HASH}
void main () {
  float fid = float(gl_VertexID);
  vec2 local = vec2(mod(fid, uGrid.x), floor(fid / uGrid.x));
  vec2 cell = vec2(local.x, local.y + uWinStart);
  float h1 = hash(cell);
  float h2 = hash(cell + vec2(1.7, 9.1));
  float h3 = hash(cell + vec2(5.5, 2.9));
  float h4 = hash(cell + vec2(8.4, 4.2));
  float d = h1 * uStagger;
  vec2 home = vec2(
    (cell.x + 0.5) * uDensity,
    (cell.y + 0.5) * uDensity - uScroll
  );
  int row = int(clamp(local.y, 0.0, uGrid.y - 1.0));
  float p = texelFetch(uRowTex, ivec2(row, 0), 0).r;
  float t = clamp((p - d) / max(1.0 - d, 1e-3), 0.0, 1.0);
  float e = 1.0 - pow(1.0 - t, 3.0);
  float vis = (1.0 - step(0.9995, t))
    * step(home.x, uMaxX * uRes.x)
    * step(home.y, uRes.y)
    * step(-uDensity, home.y);
  if (vis < 0.5) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    vCenter = vec2(0.0);
    vSize = 0.0;
    vAlpha = 0.0;
    vLod = 0.0;
    vMerge = 0.0;
    return;
  }
  vec2 dir = normalize(vec2(h2 - 0.5, h3 - 0.5) + vec2(1e-4, 0.0));
  float reach = 0.08 + 0.92 * pow(h4, 2.4);
  vec2 off = dir * uSpread * reach;
  off.y += uGravity * uSpread * (0.25 + 0.75 * h4);
  vec2 scat = home + off;
  vec2 pos = mix(scat, home, e);
  vec2 perp = vec2(-dir.y, dir.x);
  pos += perp * (h2 - 0.5) * 2.0 * uSwirl * sin(e * 3.14159);
  float tt = uTime * uDrift;
  float amp = (1.0 - e) * (uSpread * 0.05 + 2.5);
  pos += vec2(
    sin(tt * (4.0 + 5.0 * h2) + h3 * 40.0),
    cos(tt * (3.5 + 5.5 * h3) + h2 * 40.0)
  ) * amp;
  pos.y += uLag * (1.0 - e) * (0.5 + 0.5 * h4);
  pos += vec2(h4 - 0.5, h1 - 0.5) * uDensity * 3.0
    * (1.0 - smoothstep(0.5, 0.85, t));
  float grow = smoothstep(0.55, 1.0, e);
  float sizeCss = mix(uSize, uDensity * 1.3, grow);
  vCenter = home;
  vSize = sizeCss;
  vAlpha = mix(uFade, 1.0, e);
  vLod = (1.0 - e) * 1.5;
  vMerge = smoothstep(0.75, 0.97, t);
  gl_Position = vec4(
    pos.x / uRes.x * 2.0 - 1.0,
    1.0 - pos.y / uRes.y * 2.0,
    0.0,
    1.0
  );
  gl_PointSize = max(sizeCss * uDpr, 1.0);
}`;
  var POINT_FRAG = `#version 300 es
precision highp float;
uniform sampler2D uContent;
uniform vec2 uRes;
in vec2 vCenter;
in float vSize;
in float vAlpha;
in float vLod;
in float vMerge;
out vec4 outColor;
void main () {
  vec2 o = gl_PointCoord - 0.5;
  vec2 uv = clamp((vCenter + o * vSize) / uRes, 0.0, 1.0);
  vec4 tex = textureLod(uContent, uv, vLod);
  float circle = 1.0 - smoothstep(0.25, 0.5, length(o));
  float mask = mix(circle, 1.0, vMerge);
  float a = vAlpha * mask * tex.a;
  if (a < 0.01) discard;
  outColor = vec4(tex.rgb, a);
}`;
  function createParticleScroll(elements, options = {}) {
    const config = { ...DEFAULTS23, ...options };
    const { source, content, output } = elements;
    const sourceCtx = source.getContext("2d");
    const paintable = source;
    const htmlInCanvas = Boolean(
      source.contains(content) && sourceCtx && typeof sourceCtx.drawElementImage === "function" && typeof paintable.requestPaint === "function"
    );
    if (!htmlInCanvas) return null;
    const gl = output.getContext("webgl2", {
      alpha: true,
      depth: false,
      stencil: false,
      antialias: false,
      premultipliedAlpha: false
    });
    if (!gl || gl.isContextLost()) return null;
    prepareHtmlInCanvas(source, content);
    let contentDirty = false;
    let wake = () => {
    };
    if (htmlInCanvas) {
      paintable.onpaint = () => {
        try {
          sourceCtx.reset();
          drawHtmlInCanvas(source, sourceCtx, content);
          contentDirty = true;
          wake();
        } catch {
        }
      };
    }
    function compile(type, text) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, text);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error(
          "ParticleScroll shader error:",
          gl.getShaderInfoLog(shader)
        );
      }
      return shader;
    }
    function link(vertText, fragText) {
      const vert = compile(gl.VERTEX_SHADER, vertText);
      const frag = compile(gl.FRAGMENT_SHADER, fragText);
      const program = gl.createProgram();
      gl.attachShader(program, vert);
      gl.attachShader(program, frag);
      gl.linkProgram(program);
      const uniforms = {};
      const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < count; i++) {
        const info = gl.getActiveUniform(program, i);
        uniforms[info.name] = gl.getUniformLocation(program, info.name);
      }
      return { program, vert, frag, uniforms };
    }
    const base = link(QUAD_VERT, BASE_FRAG);
    const points = link(POINT_VERT, POINT_FRAG);
    const quadVao = gl.createVertexArray();
    gl.bindVertexArray(quadVao);
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const pointVao = gl.createVertexArray();
    const contentTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, contentTexture);
    gl.texParameteri(
      gl.TEXTURE_2D,
      gl.TEXTURE_MIN_FILTER,
      gl.LINEAR_MIPMAP_LINEAR
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([0, 0, 0, 0])
    );
    gl.generateMipmap(gl.TEXTURE_2D);
    let contentMaxX = 1;
    const rowTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, rowTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    let rowProgress = new Float32Array(0);
    let rowWindow = new Float32Array(0);
    let rowsAnimating = false;
    let rowsAssembled = false;
    let bg = [0, 0, 0];
    const bgProbe = document.createElement("canvas");
    bgProbe.width = bgProbe.height = 1;
    const bgCtx = bgProbe.getContext("2d", { willReadFrequently: true });
    function syncBgColor() {
      if (!bgCtx) return;
      let el = content;
      while (el) {
        const css = getComputedStyle(el).backgroundColor;
        if (css && css !== "transparent") {
          bgCtx.clearRect(0, 0, 1, 1);
          bgCtx.fillStyle = css;
          bgCtx.fillRect(0, 0, 1, 1);
          const [r, g, b, a] = bgCtx.getImageData(0, 0, 1, 1).data;
          if (a > 0) {
            bg = [r / 255, g / 255, b / 255];
            return;
          }
        }
        el = el.parentElement;
      }
      bg = [0, 0, 0];
    }
    function syncCanvasSize() {
      const dpr = getCanvasPixelRatio(output, gl);
      const width = Math.max(1, Math.round(output.clientWidth * dpr));
      const height = Math.max(1, Math.round(output.clientHeight * dpr));
      if (output.width !== width || output.height !== height) {
        output.width = width;
        output.height = height;
      }
      contentMaxX = Math.min(
        1,
        Math.max(0.05, content.clientWidth / Math.max(output.clientWidth, 1))
      );
      if (htmlInCanvas) {
        const sourceWidth = Math.max(1, Math.round(source.clientWidth * dpr));
        const sourceHeight = Math.max(1, Math.round(source.clientHeight * dpr));
        if (source.width !== sourceWidth || source.height !== sourceHeight) {
          source.width = sourceWidth;
          source.height = sourceHeight;
        }
        paintable.requestPaint();
      }
    }
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reducedMotion = motionQuery.matches;
    let time = 0;
    let introDone = false;
    let introWait = 0;
    let introReady = false;
    let scrollSmooth = content.scrollTop;
    syncCanvasSize();
    syncBgColor();
    function uploadContent() {
      if (!htmlInCanvas || !contentDirty) return;
      contentDirty = false;
      introReady = true;
      syncBgColor();
      gl.bindTexture(gl.TEXTURE_2D, contentTexture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        source
      );
      gl.generateMipmap(gl.TEXTURE_2D);
    }
    function rowTargetFor(docRowY) {
      if (reducedMotion || !introDone) return 1;
      const h = Math.max(output.clientHeight, 1);
      const band = Math.max(config.band, 1);
      const max = content.scrollHeight - content.clientHeight;
      let line = Math.min(Math.max(config.point, 0), 1) * h;
      if (max <= 1) {
        line = h + band;
      } else {
        const endP = Math.min(
          Math.max((scrollSmooth - (max - h * 0.5)) / (h * 0.5), 0),
          1
        );
        line += (h + band - line) * endP * endP;
      }
      const vy = docRowY - scrollSmooth;
      return Math.min(Math.max((line + band - vy) / band, 0), 1);
    }
    function updateRows(dt, density, winStart, winLen) {
      const docRows = Math.max(1, Math.ceil(content.scrollHeight / density));
      if (rowProgress.length !== docRows) {
        const next = new Float32Array(docRows);
        for (let i = 0; i < docRows; i++) {
          next[i] = rowTargetFor((i + 0.5) * density);
        }
        rowProgress = next;
      }
      if (rowWindow.length !== winLen) rowWindow = new Float32Array(winLen);
      rowsAnimating = false;
      let minP = 1;
      const settle = Math.max(config.settle, 0.05);
      for (let i = 0; i < docRows; i++) {
        const target = rowTargetFor((i + 0.5) * density);
        let p = rowProgress[i];
        const inWin = i >= winStart - 4 && i < winStart + winLen + 4;
        if (p !== target) {
          if (reducedMotion || !inWin) {
            p = target;
          } else {
            if (p < target) p = Math.min(p + dt / settle, target);
            else p = Math.max(p - dt / (settle * 0.6), target);
            if (p !== target) rowsAnimating = true;
          }
          rowProgress[i] = p;
        }
        if (inWin && p < minP) minP = p;
      }
      rowsAssembled = minP >= 0.9995;
      rowWindow.fill(1);
      const from = Math.min(Math.max(winStart, 0), docRows);
      const to = Math.min(winStart + winLen, docRows);
      if (to > from)
        rowWindow.set(rowProgress.subarray(from, to), from - winStart);
      gl.bindTexture(gl.TEXTURE_2D, rowTex);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.R32F,
        winLen,
        1,
        0,
        gl.RED,
        gl.FLOAT,
        rowWindow
      );
    }
    function render(dt) {
      uploadContent();
      const w = Math.max(output.clientWidth, 1);
      const h = Math.max(output.clientHeight, 1);
      const dpr = output.width / w;
      const density = Math.max(
        Math.max(config.density, 1),
        Math.sqrt(w * h / 8e5)
      );
      const scrollTop = content.scrollTop;
      const gridX = Math.ceil(w / density);
      const winStart = Math.floor(scrollTop / density);
      const winLen = Math.ceil(h / density) + 2;
      const stagger = Math.min(Math.max(config.stagger, 0), 0.95);
      updateRows(dt, density, winStart, winLen);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, output.width, output.height);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, rowTex);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, contentTexture);
      gl.disable(gl.BLEND);
      gl.useProgram(base.program);
      gl.bindVertexArray(quadVao);
      gl.uniform1i(base.uniforms.uContent, 0);
      gl.uniform1i(base.uniforms.uRowTex, 1);
      gl.uniform2f(base.uniforms.uRes, w, h);
      gl.uniform1f(base.uniforms.uDensity, density);
      gl.uniform1f(base.uniforms.uRowCount, winLen);
      gl.uniform1f(base.uniforms.uStagger, stagger);
      gl.uniform1f(base.uniforms.uMaxX, contentMaxX);
      gl.uniform1f(base.uniforms.uCover, htmlInCanvas ? 1 : 0);
      gl.uniform1f(base.uniforms.uScroll, scrollTop);
      gl.uniform1f(base.uniforms.uWinStart, winStart);
      gl.uniform3f(base.uniforms.uBg, bg[0], bg[1], bg[2]);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      if (!htmlInCanvas || rowsAssembled) return;
      gl.enable(gl.BLEND);
      gl.blendFuncSeparate(
        gl.SRC_ALPHA,
        gl.ONE_MINUS_SRC_ALPHA,
        gl.ZERO,
        gl.ONE
      );
      gl.useProgram(points.program);
      gl.bindVertexArray(pointVao);
      gl.uniform1i(points.uniforms.uRowTex, 1);
      gl.uniform2f(points.uniforms.uRes, w, h);
      gl.uniform2f(points.uniforms.uGrid, gridX, winLen);
      gl.uniform1f(points.uniforms.uDensity, density);
      gl.uniform1f(points.uniforms.uStagger, stagger);
      gl.uniform1f(points.uniforms.uSpread, Math.max(config.spread, 0));
      gl.uniform1f(
        points.uniforms.uGravity,
        Math.min(Math.max(config.gravity, -1), 1)
      );
      gl.uniform1f(points.uniforms.uDrift, Math.max(config.drift, 0));
      gl.uniform1f(points.uniforms.uSwirl, Math.max(config.swirl, 0));
      gl.uniform1f(points.uniforms.uTime, time);
      gl.uniform1f(points.uniforms.uFade, Math.min(Math.max(config.fade, 0), 1));
      gl.uniform1f(points.uniforms.uSize, Math.max(config.size, 0.5));
      gl.uniform1f(points.uniforms.uDpr, dpr);
      gl.uniform1f(points.uniforms.uMaxX, contentMaxX);
      gl.uniform1i(points.uniforms.uContent, 0);
      gl.uniform1f(points.uniforms.uLag, lag);
      gl.uniform1f(points.uniforms.uScroll, scrollTop);
      gl.uniform1f(points.uniforms.uWinStart, winStart);
      gl.drawArrays(gl.POINTS, 0, gridX * winLen);
      gl.bindVertexArray(quadVao);
      gl.disable(gl.BLEND);
    }
    let raf = 0;
    let lastTime = performance.now();
    let destroyed = false;
    let running = false;
    let visible = true;
    let lag = 0;
    let lastScrollTop = content.scrollTop;
    function frame(now) {
      if (destroyed) return;
      if (!visible) {
        running = false;
        return;
      }
      const delta = Math.min((now - lastTime) / 1e3, 1 / 30);
      lastTime = now;
      time += delta;
      const scrollTop = content.scrollTop;
      lag += scrollTop - lastScrollTop;
      lastScrollTop = scrollTop;
      lag *= Math.exp(-delta / 0.22);
      lag = Math.min(Math.max(lag, -400), 400);
      if (reducedMotion || Math.abs(lag) < 0.1) lag = 0;
      if (!introDone) {
        if (reducedMotion || !htmlInCanvas) introDone = true;
        else if (introReady) {
          introWait += delta;
          if (introWait >= 1) introDone = true;
        }
      }
      const tau = config.smoothing;
      const k = reducedMotion || tau <= 0 ? 1 : 1 - Math.exp(-delta / Math.max(tau, 1e-4));
      scrollSmooth += (scrollTop - scrollSmooth) * k;
      if (Math.abs(scrollTop - scrollSmooth) < 0.5) scrollSmooth = scrollTop;
      render(delta);
      if (!contentDirty && scrollSmooth === scrollTop && !rowsAnimating && rowsAssembled && introDone && lag === 0) {
        running = false;
        return;
      }
      raf = requestAnimationFrame(frame);
    }
    function start() {
      if (destroyed || running || !visible) return;
      running = true;
      lastTime = performance.now();
      raf = requestAnimationFrame(frame);
    }
    wake = start;
    start();
    function onScroll() {
      if (htmlInCanvas) paintable.requestPaint();
      start();
    }
    content.addEventListener("scroll", onScroll, { passive: true });
    function onMotionChange() {
      reducedMotion = motionQuery.matches;
      start();
    }
    motionQuery.addEventListener("change", onMotionChange);
    const observer = createCanvasResizeObserver(() => {
      syncCanvasSize();
      start();
    });
    observer.observe(output);
    observer.observe(content);
    const intersection = new IntersectionObserver((entries) => {
      visible = entries[entries.length - 1]?.isIntersecting ?? true;
      if (visible) start();
    });
    intersection.observe(output);
    return {
      setOptions(next) {
        if (!Object.entries(next).some(
          ([key, value]) => config[key] !== value
        ))
          return;
        Object.assign(config, next);
        start();
      },
      resize() {
        syncCanvasSize();
        start();
      },
      destroy() {
        destroyed = true;
        cancelAnimationFrame(raf);
        content.removeEventListener("scroll", onScroll);
        observer.disconnect();
        intersection.disconnect();
        motionQuery.removeEventListener("change", onMotionChange);
        gl.deleteTexture(contentTexture);
        gl.deleteTexture(rowTex);
        gl.deleteProgram(base.program);
        gl.deleteProgram(points.program);
        gl.deleteShader(base.vert);
        gl.deleteShader(base.frag);
        gl.deleteShader(points.vert);
        gl.deleteShader(points.frag);
        gl.deleteBuffer(quad);
        gl.deleteVertexArray(quadVao);
        gl.deleteVertexArray(pointVao);
        if (htmlInCanvas) paintable.onpaint = null;
      }
    };
  }

  // src/effects/particle-scroll.js
  var CONTROLS23 = {
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
    smoothing: scrub("Smoothing", 0.6, { min: 0, max: 1.5, step: 0.05 })
  };
  var particle_scroll_default = {
    slug: "particle-scroll",
    name: "Particle Scroll",
    component: "ParticleScroll",
    description: "The page dissolves into sand below a line.",
    controls: CONTROLS23,
    // Фон читается движком напрямую с элемента (getComputedStyle backgroundColor
    // внутри ParticleScrollVanilla), поэтому ctx.background тут не нужен.
    toOptions(values) {
      return { ...values };
    },
    create: createParticleScroll
  };

  // src/vendor/lib/Peel/PeelVanilla.ts
  var DEFAULTS24 = {
    side: "left",
    mode: "cursor",
    reveal: 250,
    zone: 200,
    curl: 300,
    bow: 75,
    shade: 0.25,
    shine: 1,
    shineDistance: 1200,
    shineColor: "auto",
    bulge: 50,
    perspective: 2e3,
    smoothing: 0.3
  };
  var SIDE_INDEX = {
    left: 0,
    right: 1,
    top: 2,
    bottom: 3
  };
  var SHEET_VERT = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aGrid;
uniform vec2 uRes;
uniform float uSide;
uniform float uPeel;
uniform float uReveal;
uniform float uCurl;
uniform float uBow;
uniform float uFocal;
uniform float uZone;
uniform float uBulge;
uniform vec2 uPointer;
out vec2 vUv;
out float vShade;
out vec2 vSide;

const float PI = 3.1415926;

void main () {
  vUv = aGrid;
  vec2 p = aGrid * uRes;
  float crossLen = (uSide < 1.5) ? uRes.y : uRes.x;
  float u; float v;
  if (uSide < 0.5) { u = p.x; v = p.y; }
  else if (uSide < 1.5) { u = uRes.x - p.x; v = p.y; }
  else if (uSide < 2.5) { u = p.y; v = p.x; }
  else { u = uRes.y - p.y; v = p.x; }

  float A = clamp(uPeel, 0.0, 1.0);
  float f = A * uReveal;
  float R = max(uCurl * A, 0.001);
  float c0 = f + R;

  float dvB = (uPointer.y - v) / max(crossLen * 0.28, 1.0);
  float prox = clamp(1.0 - uPointer.x / max(c0 + uZone, 1.0), 0.0, 1.0);
  float c = c0 + uBulge * A * prox * prox * exp(-dvB * dvB);

  float x = u;
  float z = 0.0;
  float sh = 0.0;
  if (A > 0.001 && u < c) {
    float theta = (c - u) / R;
    if (theta <= PI) {
      x = c - R * sin(theta);
      z = R * (1.0 - cos(theta));
    } else {
      x = c + (theta - PI) * R;
      z = 2.0 * R;
    }
    sh = sin(clamp(theta, 0.0, PI));
  }
  z += uBow * A * sin(PI * v / max(crossLen, 1.0)) * clamp(z / max(R, 1.0), 0.0, 1.5);
  z = clamp(z, -uFocal * 0.2, uFocal * 0.45);
  vShade = sh * smoothstep(0.0, 0.08, A);
  vSide = vec2(u, v);

  vec2 q;
  if (uSide < 0.5) q = vec2(x, v);
  else if (uSide < 1.5) q = vec2(uRes.x - x, v);
  else if (uSide < 2.5) q = vec2(v, x);
  else q = vec2(v, uRes.y - x);

  vec2 ndc = (q / uRes) * 2.0 - 1.0;
  ndc.y = -ndc.y;
  float w = (uFocal - z) / uFocal;
  gl_Position = vec4(ndc, -z / uFocal, w);
}`;
  var SHEET_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
in float vShade;
in vec2 vSide;
out vec4 outColor;
uniform sampler2D uContent;
uniform float uShade;
uniform float uMaxX;
uniform float uShine;
uniform vec3 uShineColor;
uniform float uCross;
uniform float uSpan;
uniform vec2 uPointer;

void main () {
  vec2 uv = clamp(vUv, vec2(0.001), vec2(uMaxX - 0.001, 0.999));
  vec4 tex = texture(uContent, uv);
  float sh = 1.0 - clamp(uShade, 0.0, 1.0) * 0.7 * pow(max(vShade, 0.0), 1.3);
  float du = max(vSide.x, 0.0);
  float line = exp(-du / 2.5) + exp(-du / 18.0) * 0.25;
  float dv = (vSide.y - uPointer.y) / max(uCross * 0.45, 1.0);
  float prox = clamp(1.0 - uPointer.x / max(uSpan, 1.0), 0.0, 1.0);
  float shine = uShine * line * exp(-dv * dv) * prox * prox;
  vec3 rgb = mix(tex.rgb * sh, uShineColor, clamp(shine, 0.0, 1.0));
  outColor = vec4(rgb * tex.a, tex.a);
}`;
  var SEG2 = 96;
  function createPeel(elements, options = {}) {
    const config = { ...DEFAULTS24, ...options };
    const { source, content, output, under } = elements;
    const gl = output.getContext("webgl2", {
      alpha: true,
      depth: true,
      stencil: false,
      antialias: true,
      premultipliedAlpha: true
    });
    if (!gl || gl.isContextLost()) return null;
    const sourceCtx = source.getContext("2d");
    const paintable = source;
    const htmlInCanvas = Boolean(
      sourceCtx && typeof sourceCtx.drawElementImage === "function" && typeof paintable.requestPaint === "function"
    );
    if (htmlInCanvas) prepareHtmlInCanvas(source, content);
    let wake = () => {
    };
    let capture = () => {
    };
    if (htmlInCanvas) {
      paintable.onpaint = () => capture();
    }
    function compile(type, text) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, text);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error("Peel shader error:", gl.getShaderInfoLog(shader));
      }
      return shader;
    }
    function link(vertText, fragText) {
      const vert = compile(gl.VERTEX_SHADER, vertText);
      const frag = compile(gl.FRAGMENT_SHADER, fragText);
      const program = gl.createProgram();
      gl.attachShader(program, vert);
      gl.attachShader(program, frag);
      gl.linkProgram(program);
      const uniforms = {};
      const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < count; i++) {
        const info = gl.getActiveUniform(program, i);
        uniforms[info.name] = gl.getUniformLocation(program, info.name);
      }
      return { program, vert, frag, uniforms };
    }
    const sheet = link(SHEET_VERT, SHEET_FRAG);
    const gridVerts = new Float32Array((SEG2 + 1) * (SEG2 + 1) * 2);
    for (let y = 0; y <= SEG2; y++) {
      for (let x = 0; x <= SEG2; x++) {
        const i = (y * (SEG2 + 1) + x) * 2;
        gridVerts[i] = x / SEG2;
        gridVerts[i + 1] = y / SEG2;
      }
    }
    const gridIndices = new Uint32Array(SEG2 * SEG2 * 6);
    let offset = 0;
    for (let y = 0; y < SEG2; y++) {
      for (let x = 0; x < SEG2; x++) {
        const a = y * (SEG2 + 1) + x;
        const b = a + 1;
        const c = a + SEG2 + 1;
        const d = c + 1;
        gridIndices[offset++] = a;
        gridIndices[offset++] = c;
        gridIndices[offset++] = b;
        gridIndices[offset++] = b;
        gridIndices[offset++] = c;
        gridIndices[offset++] = d;
      }
    }
    const sheetVao = gl.createVertexArray();
    gl.bindVertexArray(sheetVao);
    const gridBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, gridBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, gridVerts, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, gridIndices, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    const contentTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, contentTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([0, 0, 0, 0])
    );
    let contentMaxX = 1;
    let hasTexture = false;
    if (under && htmlInCanvas) under.style.visibility = "hidden";
    capture = () => {
      if (!htmlInCanvas) return;
      try {
        sourceCtx.reset();
        drawHtmlInCanvas(source, sourceCtx, content);
        gl.bindTexture(gl.TEXTURE_2D, contentTexture);
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          source
        );
        sourceCtx.reset();
        hasTexture = true;
        wake();
      } catch {
      }
    };
    function syncCanvasSize() {
      const dpr = getCanvasPixelRatio(output, gl);
      const width = Math.max(1, Math.round(output.clientWidth * dpr));
      const height = Math.max(1, Math.round(output.clientHeight * dpr));
      if (output.width !== width || output.height !== height) {
        output.width = width;
        output.height = height;
      }
      contentMaxX = Math.min(
        1,
        Math.max(0.05, content.clientWidth / Math.max(output.clientWidth, 1))
      );
      if (htmlInCanvas) {
        const sourceWidth = Math.max(1, Math.round(source.clientWidth * dpr));
        const sourceHeight = Math.max(1, Math.round(source.clientHeight * dpr));
        if (source.width !== sourceWidth || source.height !== sourceHeight) {
          source.width = sourceWidth;
          source.height = sourceHeight;
        }
        paintable.requestPaint();
      }
    }
    const peel = { a: 0, target: 0 };
    const FAR = 1e4;
    const pointer = { u: FAR, v: 0, su: FAR, sv: 0 };
    let shineRgb = [1, 1, 1];
    const probe = document.createElement("canvas");
    probe.width = probe.height = 1;
    const probeCtx = probe.getContext("2d", { willReadFrequently: true });
    function syncShineColor() {
      if (config.shineColor !== "auto") {
        shineRgb = config.shineColor;
        return;
      }
      let luminance = 1;
      if (probeCtx) {
        let el = content;
        while (el) {
          const bg = getComputedStyle(el).backgroundColor;
          if (bg && bg !== "transparent") {
            probeCtx.clearRect(0, 0, 1, 1);
            probeCtx.fillStyle = bg;
            probeCtx.fillRect(0, 0, 1, 1);
            const [r, g, b, a] = probeCtx.getImageData(0, 0, 1, 1).data;
            if (a > 0) {
              luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
              break;
            }
          }
          el = el.parentElement;
        }
      }
      shineRgb = luminance > 0.5 ? [0, 0, 0] : [1, 1, 1];
    }
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reducedMotion = motionQuery.matches;
    syncCanvasSize();
    syncShineColor();
    function render() {
      if (under && hasTexture && under.style.visibility === "hidden") {
        under.style.visibility = "";
      }
      const w = Math.max(output.clientWidth, 1);
      const h = Math.max(output.clientHeight, 1);
      const side = SIDE_INDEX[config.side] ?? 0;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, output.width, output.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clearDepth(1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.useProgram(sheet.program);
      gl.bindVertexArray(sheetVao);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, contentTexture);
      gl.uniform1i(sheet.uniforms.uContent, 0);
      gl.uniform2f(sheet.uniforms.uRes, w, h);
      gl.uniform1f(sheet.uniforms.uSide, side);
      gl.uniform1f(sheet.uniforms.uPeel, peel.a);
      gl.uniform1f(sheet.uniforms.uReveal, Math.max(config.reveal, 0));
      gl.uniform1f(sheet.uniforms.uCurl, Math.max(config.curl, 1));
      gl.uniform1f(sheet.uniforms.uBow, config.bow);
      gl.uniform1f(sheet.uniforms.uFocal, Math.max(config.perspective, 200));
      gl.uniform1f(sheet.uniforms.uShade, config.shade);
      gl.uniform1f(sheet.uniforms.uZone, Math.max(config.zone, 1));
      gl.uniform1f(sheet.uniforms.uBulge, Math.max(config.bulge, 0));
      gl.uniform1f(sheet.uniforms.uShine, Math.max(config.shine, 0));
      gl.uniform3f(
        sheet.uniforms.uShineColor,
        shineRgb[0],
        shineRgb[1],
        shineRgb[2]
      );
      gl.uniform1f(sheet.uniforms.uCross, side < 1.5 ? h : w);
      gl.uniform1f(
        sheet.uniforms.uSpan,
        config.shineDistance > 0 ? config.shineDistance : side < 1.5 ? w : h
      );
      gl.uniform2f(sheet.uniforms.uPointer, pointer.su, pointer.sv);
      gl.uniform1f(sheet.uniforms.uMaxX, contentMaxX);
      gl.drawElements(gl.TRIANGLES, gridIndices.length, gl.UNSIGNED_INT, 0);
      gl.bindVertexArray(null);
      gl.disable(gl.DEPTH_TEST);
    }
    function syncContentEvents() {
      const A = peel.a;
      const R = Math.max(config.curl * A, 1e-3);
      const c = A * config.reveal + R + Math.max(config.bulge, 0) * A;
      const tailEnd = Math.max(c, 2 * c - Math.PI * R);
      const blocked = A > 0.02 && pointer.u < tailEnd;
      const next = blocked ? "none" : "auto";
      if (content.style.pointerEvents !== next) {
        content.style.pointerEvents = next;
      }
    }
    let raf = 0;
    let lastTime = performance.now();
    let destroyed = false;
    let running = false;
    let visible = true;
    function updateTarget() {
      if (config.mode === "hover") {
        const open = peel.target > 0.5;
        const limit = open ? peel.a * config.reveal + config.zone : config.zone;
        peel.target = pointer.u < limit ? 1 : 0;
        return;
      }
      const span = Math.max(config.zone + peel.a * config.reveal, 1);
      peel.target = Math.min(1, Math.max(0, 1 - pointer.u / span));
    }
    function frame(now) {
      if (destroyed) return;
      if (!visible) {
        running = false;
        return;
      }
      const delta = Math.min((now - lastTime) / 1e3, 1 / 30);
      lastTime = now;
      const tau = Math.max(config.smoothing, 1e-4);
      const k = reducedMotion ? 1 : 1 - Math.exp(-delta / tau);
      const kp = reducedMotion ? 1 : 1 - Math.exp(-delta / (tau * 0.45));
      pointer.su += (pointer.u - pointer.su) * kp;
      pointer.sv += (pointer.v - pointer.sv) * kp;
      updateTarget();
      peel.a += (peel.target - peel.a) * k;
      syncContentEvents();
      render();
      const settle = 0.5 / Math.max(config.reveal + config.curl, 1);
      if (Math.abs(peel.target - peel.a) < settle && Math.abs(pointer.u - pointer.su) < 0.5 && Math.abs(pointer.v - pointer.sv) < 0.5) {
        peel.a = peel.target;
        pointer.su = pointer.u;
        pointer.sv = pointer.v;
        running = false;
        return;
      }
      raf = requestAnimationFrame(frame);
    }
    function start() {
      if (destroyed || running || !visible) return;
      running = true;
      lastTime = performance.now();
      raf = requestAnimationFrame(frame);
    }
    wake = start;
    start();
    function onMotionChange() {
      reducedMotion = motionQuery.matches;
      start();
    }
    motionQuery.addEventListener("change", onMotionChange);
    let themeTimer = 0;
    function onThemeShift() {
      syncShineColor();
      start();
      window.clearTimeout(themeTimer);
      themeTimer = window.setTimeout(() => {
        syncShineColor();
        start();
      }, 300);
    }
    const themeObserver = new MutationObserver(onThemeShift);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style", "data-theme"]
    });
    const schemeQuery = window.matchMedia("(prefers-color-scheme: dark)");
    schemeQuery.addEventListener("change", onThemeShift);
    const observer = createCanvasResizeObserver(() => {
      syncCanvasSize();
      start();
    });
    observer.observe(output);
    observer.observe(content);
    const intersection = new IntersectionObserver((entries) => {
      visible = entries[entries.length - 1]?.isIntersecting ?? true;
      if (visible) start();
    });
    intersection.observe(output);
    const listenTarget = output.parentElement ?? output;
    function sideDistance(x, y, rect) {
      if (config.side === "right") return rect.width - x;
      if (config.side === "top") return y;
      if (config.side === "bottom") return rect.height - y;
      return x;
    }
    const rectCache = createRectCache(output);
    function onPointerMove(event) {
      if (!htmlInCanvas) return;
      const rect = rectCache.current;
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      pointer.u = sideDistance(x, y, rect);
      pointer.v = config.side === "top" || config.side === "bottom" ? x : y;
      updateTarget();
      start();
    }
    function onPointerLeave() {
      pointer.u = FAR;
      peel.target = 0;
      start();
    }
    listenTarget.addEventListener("pointermove", onPointerMove, { passive: true });
    listenTarget.addEventListener("pointerleave", onPointerLeave, { passive: true });
    return {
      setOptions(next) {
        if (!Object.entries(next).some(
          ([key, value]) => config[key] !== value
        ))
          return;
        Object.assign(config, next);
        syncShineColor();
        start();
      },
      resize() {
        syncCanvasSize();
        start();
      },
      destroy() {
        destroyed = true;
        rectCache.destroy();
        cancelAnimationFrame(raf);
        observer.disconnect();
        intersection.disconnect();
        themeObserver.disconnect();
        schemeQuery.removeEventListener("change", onThemeShift);
        window.clearTimeout(themeTimer);
        motionQuery.removeEventListener("change", onMotionChange);
        listenTarget.removeEventListener("pointermove", onPointerMove);
        listenTarget.removeEventListener("pointerleave", onPointerLeave);
        content.style.pointerEvents = "";
        if (under) under.style.visibility = "";
        gl.deleteTexture(contentTexture);
        gl.deleteProgram(sheet.program);
        gl.deleteShader(sheet.vert);
        gl.deleteShader(sheet.frag);
        gl.deleteBuffer(gridBuffer);
        gl.deleteBuffer(indexBuffer);
        gl.deleteVertexArray(sheetVao);
        if (htmlInCanvas) paintable.onpaint = null;
      }
    };
  }

  // src/effects/peel.js
  var CONTROLS24 = {
    mode: radio("Mode", "hover", [
      { value: "hover", label: "Hover" },
      { value: "cursor", label: "Cursor" }
    ]),
    side: radio("Side", "left", [
      { value: "left", label: "Left" },
      { value: "right", label: "Right" },
      { value: "top", label: "Top" },
      { value: "bottom", label: "Bottom" }
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
      decimals: 0
    }),
    bulge: scrub("Bulge", 50, { min: 0, max: 200, step: 10, decimals: 0 }),
    perspective: scrub("Perspective", 2e3, {
      min: 400,
      max: 3e3,
      step: 50,
      decimals: 0
    }),
    smoothing: scrub("Smoothing", 0.3, { min: 0.05, max: 1, step: 0.05 })
  };
  var peel_default = {
    slug: "peel",
    name: "Peel",
    component: "Peel",
    description: "Peels the page back from an edge in 3D.",
    controls: CONTROLS24,
    // В плейграунде peel-entry жёстко фиксирует shineColor="auto" (контрола цвета
    // в CONTROLS нет — это entry-версия, не demo-версия с цветовым свотчем), поэтому
    // здесь тоже не заводим color-контрол и всегда просим "auto": Peel сам решает
    // светлый/тёмный блик по теме страницы (см. PeelVanilla shineColor: "auto").
    toOptions(values) {
      return {
        ...values,
        shineColor: "auto"
      };
    },
    create: createPeel
  };

  // src/vendor/lib/RetroDither/RetroDitherVanilla.ts
  var DEFAULTS25 = {
    radius: 0.5,
    softness: 1,
    pixelSize: 2,
    levels: 4,
    darkColor: [0, 0, 0],
    lightColor: [1, 1, 1],
    colorize: 0.1,
    contrast: 0.6,
    brightness: 0,
    strength: 0.75,
    baseStrength: 0,
    invert: 0,
    scanlines: 0,
    pattern: "bayer",
    trail: 0.4,
    degauss: 0.8,
    followSpeed: 3
  };
  var PATTERNS = { bayer: 0, halftone: 1, hatch: 2, dash: 3 };
  var VERT22 = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPos;
out vec2 vUv;
void main () {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;
  var TRAIL_N = 24;
  var RIPPLE_N = 3;
  var FRAG17 = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uContent;
uniform vec2 uResolution;
uniform float uPixelSize;
uniform float uLevels;
uniform float uRadius;
uniform float uSoftness;
uniform vec2 uPointer;
uniform float uActive;
uniform vec3 uDark;
uniform vec3 uLight;
uniform float uColorize;
uniform float uContrast;
uniform float uBrightness;
uniform float uStrength;
uniform float uBase;
uniform float uInvert;
uniform float uScanlines;
uniform float uMaxX;
uniform sampler2D uTextMask;
uniform int uPattern;
uniform vec3 uTrail[${TRAIL_N}];
uniform vec4 uRipples[${RIPPLE_N}];

#define S(a, b, t) smoothstep(a, b, t)

float bayer (ivec2 p) {
  int b[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
  return (float(b[(p.y % 4) * 4 + (p.x % 4)]) + 0.5) / 16.0;
}

float patternThreshold (ivec2 cell) {
  if (uPattern == 1) {
    vec2 p = vec2(cell % 4) - 1.5;
    return clamp(length(p) / 2.6, 0.03, 0.97);
  }
  if (uPattern == 2) {
    return fract(float(cell.x + cell.y) * 0.25 + 0.125);
  }
  if (uPattern == 3) {
    return fract(float(cell.x) * 0.25 + float(cell.y % 2) * 0.5 + 0.125);
  }
  return bayer(cell);
}

float ditherQuant (float v, ivec2 cell) {
  float x = v * uLevels;
  return floor(x + step(patternThreshold(cell), fract(x))) / uLevels;
}

void main () {
  vec2 uv = vUv;

  if (uv.x > uMaxX) {
    outColor = vec4(0.0);
    return;
  }

  float aspect = uResolution.x / uResolution.y;

  float rippleReveal = 0.0;
  vec2 rippleWarp = vec2(0.0);
  for (int i = 0; i < ${RIPPLE_N}; i++) {
    float amp = uRipples[i].w;
    if (amp <= 0.001) continue;
    vec2 toUv = (uv - uRipples[i].xy) * vec2(aspect, 1.0);
    float d = length(toUv);
    float band = exp(-pow((d - uRipples[i].z) / 0.07, 2.0)) * amp;
    rippleReveal = max(rippleReveal, band);
    rippleWarp += normalize(toUv + 1e-5) * band * 0.012 / vec2(aspect, 1.0);
  }
  uv = clamp(uv + rippleWarp, vec2(0.0), vec2(uMaxX, 1.0));

  vec4 content = texture(uContent, vec2(uv.x, 1.0 - uv.y));

  vec2 frag = uv * uResolution;
  vec2 cell = floor(frag / uPixelSize);
  vec2 cellUv = (cell + 0.5) * uPixelSize / uResolution;
  cellUv = clamp(cellUv, vec2(0.001), vec2(uMaxX - 0.002, 0.999));
  vec4 pixel = texture(uContent, vec2(cellUv.x, 1.0 - cellUv.y));
  float rawLum = dot(pixel.rgb, vec3(0.299, 0.587, 0.114));

  float textness = texture(uTextMask, vec2(uv.x, 1.0 - uv.y)).r;
  float crisp = 0.0;
  if (textness > 0.4) {
    float px = max(uPixelSize * 0.25, 1.0);
    vec2 fineUv = (floor(frag / px) + 0.5) * px / uResolution;
    fineUv = clamp(fineUv, vec2(0.001), vec2(uMaxX - 0.002, 0.999));
    vec4 fine = texture(uContent, vec2(fineUv.x, 1.0 - fineUv.y));
    float fineLum = dot(fine.rgb, vec3(0.299, 0.587, 0.114));
    if (abs(fineLum - rawLum) > 0.1) {
      crisp = 1.0;
      pixel = fine;
      rawLum = fineLum;
    }
  }

  float contrastAmt = mix(uContrast, max(uContrast, 0.5), crisp);
  float brightAmt = uBrightness * mix(1.0, 0.3, crisp);
  float lum = clamp((rawLum - 0.5) * contrastAmt + 0.5 + brightAmt, 0.0, 1.0);
  lum = mix(lum, 1.0 - lum, clamp(uInvert, 0.0, 1.0));
  float q = crisp > 0.5
    ? clamp(floor(lum * uLevels + 0.5) / uLevels, 0.0, 1.0)
    : ditherQuant(lum, ivec2(cell));

  vec3 palette = mix(uDark, uLight, q);
  vec3 keepHue = pixel.rgb * (q / max(lum, 0.001));
  vec3 dithered = mix(keepHue, palette, clamp(uColorize, 0.0, 1.0));
  float scanAmp = mix(0.45, 0.15, crisp);
  dithered *= 1.0 - uScanlines * scanAmp * mod(cell.y, 2.0);
  dithered *= 1.0 + rippleReveal * vec3(0.22, -0.06, 0.3);

  float dist = length((uv - uPointer) * vec2(aspect, 1.0));
  float radius = max(uRadius * uActive, 1e-4);
  float inner = radius * (1.0 - clamp(uSoftness, 0.0, 1.0));
  float lens = (1.0 - S(inner, radius, dist)) * uActive;

  float ghost = 0.0;
  for (int i = 0; i < ${TRAIL_N}; i++) {
    float amp = uTrail[i].z;
    if (amp <= 0.001) continue;
    float td = length((uv - uTrail[i].xy) * vec2(aspect, 1.0));
    float tr = max(uRadius * 0.8, 1e-4);
    ghost = max(ghost, (1.0 - S(tr * 0.2, tr, td)) * amp);
  }

  float mask = clamp(max(max(lens, ghost), clamp(uBase, 0.0, 1.0)), 0.0, 1.0)
    * clamp(uStrength, 0.0, 1.0);
  mask = clamp(max(mask, rippleReveal), 0.0, 1.0);

  float apply = step(bayer(ivec2(cell)), mask);

  vec3 col = mix(content.rgb, dithered, apply);
  float alpha = mix(content.a, pixel.a, apply);
  outColor = vec4(col, alpha);
}`;
  function createRetroDither(elements, options = {}) {
    const config = { ...DEFAULTS25, ...options };
    const { source, content, output } = elements;
    const gl = output.getContext("webgl2", {
      alpha: true,
      depth: false,
      stencil: false,
      antialias: false,
      premultipliedAlpha: false
    });
    if (!gl || gl.isContextLost()) return null;
    const sourceCtx = source.getContext("2d");
    const paintable = source;
    const htmlInCanvas = Boolean(
      sourceCtx && typeof sourceCtx.drawElementImage === "function" && typeof paintable.requestPaint === "function"
    );
    if (htmlInCanvas) prepareHtmlInCanvas(source, content);
    let contentDirty = false;
    let wake = () => {
    };
    if (htmlInCanvas) {
      paintable.onpaint = () => {
        try {
          sourceCtx.reset();
          drawHtmlInCanvas(source, sourceCtx, content);
          contentDirty = true;
          scheduleTextMask();
          wake();
        } catch {
        }
      };
    }
    function compile(type, text) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, text);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error("RetroDither shader error:", gl.getShaderInfoLog(shader));
      }
      return shader;
    }
    const vertexShader = compile(gl.VERTEX_SHADER, VERT22);
    const fragmentShader = compile(gl.FRAGMENT_SHADER, FRAG17);
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    const uniforms = {};
    const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < count; i++) {
      const info = gl.getActiveUniform(program, i);
      uniforms[info.name] = gl.getUniformLocation(program, info.name);
    }
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const contentTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, contentTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([0, 0, 0, 0])
    );
    const textMaskTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, textMaskTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([0, 0, 0, 0])
    );
    const MASK_SCALE = 0.25;
    const maskCanvas = document.createElement("canvas");
    const maskCtx = maskCanvas.getContext("2d");
    let maskDirty = false;
    let maskTimer = 0;
    let maskStamp = 0;
    function buildTextMask() {
      if (!maskCtx) return;
      const bounds = output.getBoundingClientRect();
      const width = Math.max(1, Math.round(bounds.width * MASK_SCALE));
      const height = Math.max(1, Math.round(bounds.height * MASK_SCALE));
      if (maskCanvas.width !== width || maskCanvas.height !== height) {
        maskCanvas.width = width;
        maskCanvas.height = height;
      }
      maskCtx.clearRect(0, 0, width, height);
      maskCtx.fillStyle = "#fff";
      const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
      const range = document.createRange();
      let node;
      while (node = walker.nextNode()) {
        if (!node.textContent?.trim()) continue;
        const parent = node.parentElement;
        if (!parent || parent.checkVisibility && !parent.checkVisibility()) {
          continue;
        }
        range.selectNodeContents(node);
        const rects = range.getClientRects();
        for (let i = 0; i < rects.length; i++) {
          const r = rects[i];
          if (r.width < 1 || r.height < 1) continue;
          if (r.bottom < bounds.top || r.top > bounds.bottom) continue;
          maskCtx.fillRect(
            (r.left - bounds.left - 1) * MASK_SCALE,
            (r.top - bounds.top - 1) * MASK_SCALE,
            (r.width + 2) * MASK_SCALE,
            (r.height + 2) * MASK_SCALE
          );
        }
      }
      const fields = content.querySelectorAll("input, textarea, select");
      for (let i = 0; i < fields.length; i++) {
        const r = fields[i].getBoundingClientRect();
        if (r.width < 1 || r.height < 1) continue;
        if (r.bottom < bounds.top || r.top > bounds.bottom) continue;
        maskCtx.fillRect(
          (r.left - bounds.left) * MASK_SCALE,
          (r.top - bounds.top) * MASK_SCALE,
          r.width * MASK_SCALE,
          r.height * MASK_SCALE
        );
      }
      maskDirty = true;
    }
    function scheduleTextMask() {
      if (maskTimer) return;
      const wait = Math.max(0, 120 - (performance.now() - maskStamp));
      maskTimer = window.setTimeout(() => {
        maskTimer = 0;
        maskStamp = performance.now();
        buildTextMask();
        start();
      }, wait);
    }
    let contentMaxX = 1;
    function syncCanvasSize() {
      const dpr = getCanvasPixelRatio(output, gl);
      const width = Math.max(1, Math.round(output.clientWidth * dpr));
      const height = Math.max(1, Math.round(output.clientHeight * dpr));
      if (output.width !== width || output.height !== height) {
        output.width = width;
        output.height = height;
      }
      contentMaxX = Math.min(
        1,
        Math.max(0.05, content.clientWidth / Math.max(output.clientWidth, 1))
      );
      if (htmlInCanvas) {
        const sourceWidth = Math.max(1, Math.round(source.clientWidth * dpr));
        const sourceHeight = Math.max(1, Math.round(source.clientHeight * dpr));
        if (source.width !== sourceWidth || source.height !== sourceHeight) {
          source.width = sourceWidth;
          source.height = sourceHeight;
        }
        paintable.requestPaint();
      }
    }
    syncCanvasSize();
    const pointer = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5, active: 0, target: 0 };
    const trailData = new Float32Array(TRAIL_N * 3);
    const trailPts = [];
    const rippleData = new Float32Array(RIPPLE_N * 4);
    const ripples = [];
    let fxAlive = false;
    function updateEffects(nowS) {
      fxAlive = false;
      if (config.trail > 1e-3 && pointer.active > 0.1 && !reducedMotion) {
        const last = trailPts[trailPts.length - 1];
        if (!last || nowS - last.t >= 0.04) {
          trailPts.push({ x: pointer.x, y: pointer.y, t: nowS });
          if (trailPts.length > TRAIL_N) trailPts.shift();
        }
      }
      trailData.fill(0);
      for (let i = trailPts.length - 1; i >= 0; i--) {
        const p = trailPts[i];
        const age = nowS - p.t;
        const fade = Math.min(Math.max((0.95 - age) / 0.25, 0), 1);
        const s = config.trail * Math.exp(-age * 2.2) * fade;
        if (s < 5e-3) {
          trailPts.splice(0, i + 1);
          break;
        }
        trailData[i * 3] = p.x;
        trailData[i * 3 + 1] = p.y;
        trailData[i * 3 + 2] = s;
        fxAlive = true;
      }
      rippleData.fill(0);
      for (let i = ripples.length - 1; i >= 0; i--) {
        if (nowS - ripples[i].t > 0.9) ripples.splice(i, 1);
      }
      for (let i = 0; i < ripples.length && i < RIPPLE_N; i++) {
        const age = nowS - ripples[i].t;
        rippleData[i * 4] = ripples[i].x;
        rippleData[i * 4 + 1] = ripples[i].y;
        rippleData[i * 4 + 2] = age * 1.2;
        rippleData[i * 4 + 3] = config.degauss * (1 - age / 0.9);
        fxAlive = true;
      }
    }
    function uploadContent() {
      if (!htmlInCanvas || !contentDirty) return;
      contentDirty = false;
      gl.bindTexture(gl.TEXTURE_2D, contentTexture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        source
      );
    }
    function uploadMask() {
      if (!maskDirty) return;
      maskDirty = false;
      gl.bindTexture(gl.TEXTURE_2D, textMaskTexture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        maskCanvas
      );
    }
    function render() {
      uploadContent();
      uploadMask();
      gl.useProgram(program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, contentTexture);
      gl.uniform1i(uniforms.uContent, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, textMaskTexture);
      gl.uniform1i(uniforms.uTextMask, 1);
      gl.uniform2f(uniforms.uResolution, output.width, output.height);
      const dpr = output.width / Math.max(output.clientWidth, 1);
      gl.uniform1f(uniforms.uPixelSize, Math.max(config.pixelSize, 1) * dpr);
      gl.uniform1f(uniforms.uLevels, Math.max(config.levels, 1));
      gl.uniform1f(uniforms.uRadius, Math.max(config.radius, 0.01));
      gl.uniform1f(uniforms.uSoftness, config.softness);
      gl.uniform2f(uniforms.uPointer, pointer.x, pointer.y);
      gl.uniform1f(uniforms.uActive, pointer.active);
      gl.uniform3f(
        uniforms.uDark,
        config.darkColor[0],
        config.darkColor[1],
        config.darkColor[2]
      );
      gl.uniform3f(
        uniforms.uLight,
        config.lightColor[0],
        config.lightColor[1],
        config.lightColor[2]
      );
      gl.uniform1f(uniforms.uColorize, config.colorize);
      gl.uniform1f(uniforms.uContrast, Math.max(config.contrast, 0));
      gl.uniform1f(uniforms.uBrightness, config.brightness);
      gl.uniform1f(uniforms.uStrength, config.strength);
      gl.uniform1f(uniforms.uBase, config.baseStrength);
      gl.uniform1f(uniforms.uInvert, config.invert);
      gl.uniform1f(uniforms.uScanlines, config.scanlines);
      gl.uniform1i(uniforms.uPattern, PATTERNS[config.pattern] ?? 0);
      gl.uniform3fv(uniforms["uTrail[0]"], trailData);
      gl.uniform4fv(uniforms["uRipples[0]"], rippleData);
      gl.uniform1f(uniforms.uMaxX, contentMaxX);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, output.width, output.height);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    let raf = 0;
    let lastTime = performance.now();
    let destroyed = false;
    let running = false;
    let visible = true;
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reducedMotion = motionQuery.matches;
    function frame(now) {
      if (destroyed) return;
      if (!visible) {
        running = false;
        return;
      }
      const delta = Math.min((now - lastTime) / 1e3, 1 / 30);
      lastTime = now;
      const ease = reducedMotion ? 1 : 1 - Math.exp(-delta * Math.max(config.followSpeed, 0.5));
      pointer.x += (pointer.tx - pointer.x) * ease;
      pointer.y += (pointer.ty - pointer.y) * ease;
      pointer.active += (pointer.target - pointer.active) * ease;
      updateEffects(now / 1e3);
      render();
      const settled = Math.abs(pointer.tx - pointer.x) < 5e-4 && Math.abs(pointer.ty - pointer.y) < 5e-4 && Math.abs(pointer.target - pointer.active) < 1e-3 && !fxAlive;
      if (settled && !contentDirty) {
        pointer.x = pointer.tx;
        pointer.y = pointer.ty;
        pointer.active = pointer.target;
        running = false;
        return;
      }
      raf = requestAnimationFrame(frame);
    }
    function start() {
      if (destroyed || running || !visible) return;
      running = true;
      lastTime = performance.now();
      raf = requestAnimationFrame(frame);
    }
    wake = start;
    start();
    function onMotionChange() {
      reducedMotion = motionQuery.matches;
      start();
    }
    motionQuery.addEventListener("change", onMotionChange);
    const observer = createCanvasResizeObserver(() => {
      syncCanvasSize();
      scheduleTextMask();
      start();
    });
    observer.observe(output);
    observer.observe(content);
    const intersection = new IntersectionObserver((entries) => {
      visible = entries[entries.length - 1]?.isIntersecting ?? true;
      if (visible) start();
    });
    intersection.observe(output);
    const listenTarget = output.parentElement ?? output;
    const rectCache = createRectCache(output);
    function onPointerMove(event) {
      const rect = rectCache.current;
      pointer.tx = (event.clientX - rect.left) / Math.max(rect.width, 1);
      pointer.ty = 1 - (event.clientY - rect.top) / Math.max(rect.height, 1);
      pointer.target = 1;
      start();
    }
    function onPointerLeave() {
      pointer.target = 0;
      start();
    }
    function onPointerDown(event) {
      if (reducedMotion || config.degauss <= 1e-3) return;
      const rect = rectCache.current;
      ripples.push({
        x: (event.clientX - rect.left) / Math.max(rect.width, 1),
        y: 1 - (event.clientY - rect.top) / Math.max(rect.height, 1),
        t: performance.now() / 1e3
      });
      if (ripples.length > RIPPLE_N) ripples.shift();
      start();
    }
    listenTarget.addEventListener("pointermove", onPointerMove, { passive: true });
    listenTarget.addEventListener("pointerleave", onPointerLeave, { passive: true });
    listenTarget.addEventListener("pointerdown", onPointerDown, { passive: true });
    content.addEventListener("scroll", scheduleTextMask, {
      capture: true,
      passive: true
    });
    scheduleTextMask();
    return {
      setOptions(next) {
        let changed = false;
        for (const [key, value] of Object.entries(next)) {
          const prev = config[key];
          if (Array.isArray(value) && Array.isArray(prev)) {
            if (value.length !== prev.length || value.some((item, i) => item !== prev[i])) {
              changed = true;
              break;
            }
          } else if (prev !== value) {
            changed = true;
            break;
          }
        }
        Object.assign(config, next);
        if (!changed) return;
        scheduleTextMask();
        start();
      },
      resize() {
        syncCanvasSize();
        start();
      },
      destroy() {
        destroyed = true;
        rectCache.destroy();
        cancelAnimationFrame(raf);
        window.clearTimeout(maskTimer);
        observer.disconnect();
        intersection.disconnect();
        motionQuery.removeEventListener("change", onMotionChange);
        listenTarget.removeEventListener("pointermove", onPointerMove);
        listenTarget.removeEventListener("pointerleave", onPointerLeave);
        listenTarget.removeEventListener("pointerdown", onPointerDown);
        content.removeEventListener("scroll", scheduleTextMask, {
          capture: true
        });
        gl.deleteTexture(contentTexture);
        gl.deleteTexture(textMaskTexture);
        gl.deleteProgram(program);
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
        gl.deleteBuffer(quad);
        if (htmlInCanvas) paintable.onpaint = null;
      }
    };
  }

  // src/effects/retro-dither.js
  var CONTROLS25 = {
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
      { value: "dash", label: "Dash" }
    ]),
    trail: scrub("Trail", 0.4, { min: 0, max: 1, step: 0.05 }),
    degauss: scrub("Degauss", 0.8, { min: 0, max: 1, step: 0.05 }),
    followSpeed: scrub("Follow speed", 3, {
      min: 1,
      max: 20,
      step: 0.5,
      decimals: 1
    }),
    dark: color("Dark", "#000000"),
    light: color("Light", "#ffffff")
  };
  var retro_dither_default = {
    slug: "retro-dither",
    name: "Retro Dither",
    component: "RetroDither",
    description: "A retro dithered pass over the live page.",
    controls: CONTROLS25,
    toOptions(values) {
      const { dark, light, ...rest } = values;
      return {
        ...rest,
        darkColor: hexToRgb(dark),
        lightColor: hexToRgb(light)
      };
    },
    create: createRetroDither
  };

  // src/vendor/lib/Ripple/RippleVanilla.ts
  var DEFAULTS26 = {
    amplitude: 0.5,
    speed: 0.65,
    wavelength: 80,
    rings: 2,
    decay: 1,
    refraction: 100,
    dispersion: 0.5,
    shine: 0.5,
    trigger: "click",
    interval: 0
  };
  var MAX_RIPPLES2 = 12;
  var BASE_SPEED = 340;
  var VERT23 = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPos;
out vec2 vUv;
void main () {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;
  var FRAG18 = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uContent;
uniform vec2 uResolution;
uniform vec4 uRipples[12];
uniform int uCount;
uniform float uSpeed;
uniform float uWavelength;
uniform float uWidth;
uniform float uDecay;
uniform float uRefraction;
uniform float uDispersion;
uniform float uShine;
uniform float uHasContent;
uniform float uMaxX;

vec4 page (vec2 p) {
  p.x = clamp(p.x, 0.0005, uMaxX - 0.0005);
  p.y = clamp(p.y, 0.0005, 0.9995);
  return texture(uContent, p);
}

void main () {
  vec2 pUv = vec2(vUv.x, 1.0 - vUv.y);
  vec2 frag = pUv * uResolution;

  vec2 grad = vec2(0.0);
  float k = 6.28318530718 / uWavelength;
  float w2 = uWidth * uWidth;

  for (int i = 0; i < 12; i++) {
    if (i >= uCount) break;
    vec4 rp = uRipples[i];
    vec2 dv = frag - rp.xy;
    float r = length(dv);
    float front = uSpeed * rp.z;
    float s = r - front;
    float env = exp(-s * s / w2) * exp(-uDecay * rp.z) * rp.w;
    env *= smoothstep(0.0, 0.08, rp.z);
    env *= inversesqrt(1.0 + front / max(uWavelength, 1.0) * 0.2);
    if (env < 0.0015) continue;
    float dh = (k * cos(s * k) - 2.0 * s / w2 * sin(s * k)) * env;
    grad += dv / max(r, 1.0) * dh * uWavelength * 0.16;
  }

  float g = dot(grad, vec2(-0.55, -0.8));
  float glint = pow(clamp(g * 2.2, 0.0, 1.0), 2.0) * uShine;
  float shade = pow(clamp(-g * 1.6, 0.0, 1.0), 2.0) * uShine * 0.3;

  if (uHasContent < 0.5) {
    float a = clamp(glint * 0.9 + shade * 0.5, 0.0, 0.85);
    outColor = vec4(vec3(glint * 0.9), a);
    return;
  }

  vec2 offs = grad * uRefraction / uResolution;
  vec3 col;
  if (uDispersion > 0.001) {
    float d = uDispersion * 0.35;
    col = vec3(
      page(pUv + offs * (1.0 + d)).r,
      page(pUv + offs).g,
      page(pUv + offs * (1.0 - d)).b
    );
  } else {
    col = page(pUv + offs).rgb;
  }
  col += glint;
  col *= 1.0 - shade;
  outColor = vec4(col, 1.0);
}`;
  function createRipple(elements, options = {}) {
    const config = { ...DEFAULTS26, ...options };
    const { source, content, output } = elements;
    const gl = output.getContext("webgl2", {
      alpha: true,
      depth: false,
      stencil: false,
      antialias: false,
      premultipliedAlpha: true
    });
    if (!gl || gl.isContextLost()) return null;
    const sourceCtx = source.getContext("2d");
    const paintable = source;
    const htmlInCanvas = Boolean(
      sourceCtx && typeof sourceCtx.drawElementImage === "function" && typeof paintable.requestPaint === "function"
    );
    if (htmlInCanvas) prepareHtmlInCanvas(source, content);
    let contentDirty = false;
    let wake = () => {
    };
    if (htmlInCanvas) {
      paintable.onpaint = () => {
        try {
          sourceCtx.reset();
          drawHtmlInCanvas(source, sourceCtx, content);
          contentDirty = true;
          wake();
        } catch {
        }
      };
    }
    function compile(type, text) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, text);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error("Ripple shader error:", gl.getShaderInfoLog(shader));
      }
      return shader;
    }
    const vertexShader = compile(gl.VERTEX_SHADER, VERT23);
    const fragmentShader = compile(gl.FRAGMENT_SHADER, FRAG18);
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    const uniforms = {};
    const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < count; i++) {
      const info = gl.getActiveUniform(program, i);
      uniforms[info.name.replace("[0]", "")] = gl.getUniformLocation(
        program,
        info.name
      );
    }
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const contentTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, contentTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([0, 0, 0, 0])
    );
    let contentMaxX = 1;
    function syncCanvasSize() {
      const dpr = getCanvasPixelRatio(output, gl);
      const width = Math.max(1, Math.round(output.clientWidth * dpr));
      const height = Math.max(1, Math.round(output.clientHeight * dpr));
      if (output.width !== width || output.height !== height) {
        output.width = width;
        output.height = height;
      }
      contentMaxX = Math.min(
        1,
        Math.max(0.05, content.clientWidth / Math.max(output.clientWidth, 1))
      );
      if (htmlInCanvas) {
        const sourceWidth = Math.max(1, Math.round(source.clientWidth * dpr));
        const sourceHeight = Math.max(1, Math.round(source.clientHeight * dpr));
        if (source.width !== sourceWidth || source.height !== sourceHeight) {
          source.width = sourceWidth;
          source.height = sourceHeight;
        }
        paintable.requestPaint();
      }
    }
    syncCanvasSize();
    function uploadContent() {
      if (!htmlInCanvas || !contentDirty) return;
      contentDirty = false;
      gl.bindTexture(gl.TEXTURE_2D, contentTexture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        source
      );
    }
    const ripples = [];
    const rippleData = new Float32Array(MAX_RIPPLES2 * 4);
    function splash(x, y, strength = 1) {
      if (reducedMotion) return;
      if (ripples.length >= MAX_RIPPLES2) ripples.shift();
      ripples.push({ x, y, age: 0, amp: strength });
      start();
    }
    function pruneRipples(delta) {
      const diag = Math.hypot(output.clientWidth, output.clientHeight);
      const speedPx = BASE_SPEED * Math.max(config.speed, 0.05);
      const width = config.wavelength * Math.max(config.rings, 1) * 0.5;
      for (let i = ripples.length - 1; i >= 0; i--) {
        const rp = ripples[i];
        rp.age += delta;
        const gone = rp.age * speedPx > diag + width * 3 || Math.exp(-Math.max(config.decay, 0.05) * rp.age) * rp.amp < 0.012;
        if (gone) ripples.splice(i, 1);
      }
    }
    function render() {
      uploadContent();
      const dpr = output.width / Math.max(output.clientWidth, 1);
      gl.useProgram(program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, contentTexture);
      gl.uniform1i(uniforms.uContent, 0);
      gl.uniform2f(uniforms.uResolution, output.width, output.height);
      for (let i = 0; i < MAX_RIPPLES2; i++) {
        const rp = ripples[i];
        rippleData[i * 4] = rp ? rp.x * dpr : 0;
        rippleData[i * 4 + 1] = rp ? rp.y * dpr : 0;
        rippleData[i * 4 + 2] = rp ? rp.age : 0;
        rippleData[i * 4 + 3] = rp ? rp.amp * Math.max(config.amplitude, 0) : 0;
      }
      gl.uniform4fv(uniforms.uRipples, rippleData);
      gl.uniform1i(uniforms.uCount, ripples.length);
      gl.uniform1f(uniforms.uSpeed, BASE_SPEED * Math.max(config.speed, 0.05) * dpr);
      gl.uniform1f(uniforms.uWavelength, Math.max(config.wavelength, 4) * dpr);
      gl.uniform1f(
        uniforms.uWidth,
        Math.max(config.wavelength, 4) * Math.max(config.rings, 1) * 0.5 * dpr
      );
      gl.uniform1f(uniforms.uDecay, Math.max(config.decay, 0.05));
      gl.uniform1f(uniforms.uRefraction, Math.max(config.refraction, 0) * dpr);
      gl.uniform1f(uniforms.uDispersion, Math.max(config.dispersion, 0));
      gl.uniform1f(uniforms.uShine, Math.max(config.shine, 0));
      gl.uniform1f(uniforms.uHasContent, htmlInCanvas ? 1 : 0);
      gl.uniform1f(uniforms.uMaxX, contentMaxX);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, output.width, output.height);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    function renderIdle() {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, output.width, output.height);
      if (htmlInCanvas) {
        render();
      } else {
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
      }
    }
    let raf = 0;
    let lastTime = performance.now();
    let destroyed = false;
    let running = false;
    let visible = true;
    let ambientTimer = 0;
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reducedMotion = motionQuery.matches;
    function spawnAmbient() {
      const w = output.clientWidth;
      const h = output.clientHeight;
      if (w < 10 || h < 10) return;
      splash(
        w * (0.15 + Math.random() * 0.7),
        h * (0.15 + Math.random() * 0.7),
        0.6 + Math.random() * 0.5
      );
    }
    function frame(now) {
      if (destroyed) return;
      if (!visible) {
        running = false;
        return;
      }
      const delta = Math.min(Math.max((now - lastTime) / 1e3, 0), 1 / 30);
      lastTime = now;
      if (!reducedMotion) {
        pruneRipples(delta);
        if (config.interval > 0) {
          ambientTimer += delta;
          if (ambientTimer >= config.interval) {
            ambientTimer = 0;
            spawnAmbient();
          }
        }
      }
      if (ripples.length > 0) {
        render();
      } else {
        renderIdle();
        if (!contentDirty && (config.interval <= 0 || reducedMotion)) {
          running = false;
          return;
        }
      }
      raf = requestAnimationFrame(frame);
    }
    function start() {
      if (destroyed || running || !visible) return;
      running = true;
      lastTime = performance.now();
      raf = requestAnimationFrame(frame);
    }
    wake = start;
    start();
    function localPoint(event) {
      const rect = output.getBoundingClientRect();
      return [event.clientX - rect.left, event.clientY - rect.top];
    }
    let hoverX = -1e5;
    let hoverY = -1e5;
    function onPointerDown(event) {
      if (config.trigger === "none") return;
      const [x, y] = localPoint(event);
      splash(x, y, 1);
    }
    function onPointerMove(event) {
      if (config.trigger !== "hover") return;
      const [x, y] = localPoint(event);
      if (Math.hypot(x - hoverX, y - hoverY) < 56) return;
      hoverX = x;
      hoverY = y;
      splash(x, y, 0.3);
    }
    content.addEventListener("pointerdown", onPointerDown, { passive: true });
    content.addEventListener("pointermove", onPointerMove, { passive: true });
    function onMotionChange() {
      reducedMotion = motionQuery.matches;
      if (reducedMotion) ripples.length = 0;
      start();
    }
    motionQuery.addEventListener("change", onMotionChange);
    const observer = createCanvasResizeObserver(() => {
      syncCanvasSize();
      start();
    });
    observer.observe(output);
    observer.observe(content);
    const intersection = new IntersectionObserver((entries) => {
      visible = entries[entries.length - 1]?.isIntersecting ?? true;
      if (visible) start();
    });
    intersection.observe(output);
    return {
      setOptions(next) {
        if (!Object.entries(next).some(
          ([key, value]) => config[key] !== value
        ))
          return;
        Object.assign(config, next);
        start();
      },
      splash,
      resize() {
        syncCanvasSize();
        start();
      },
      destroy() {
        destroyed = true;
        cancelAnimationFrame(raf);
        content.removeEventListener("pointerdown", onPointerDown);
        content.removeEventListener("pointermove", onPointerMove);
        observer.disconnect();
        intersection.disconnect();
        motionQuery.removeEventListener("change", onMotionChange);
        gl.deleteTexture(contentTexture);
        gl.deleteProgram(program);
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
        gl.deleteBuffer(quad);
        if (htmlInCanvas) paintable.onpaint = null;
      }
    };
  }

  // src/effects/ripple.js
  var CONTROLS26 = {
    trigger: radio("Trigger", "click", [
      { value: "click", label: "Click" },
      { value: "hover", label: "Hover" },
      { value: "none", label: "None" }
    ]),
    amplitude: scrub("Amplitude", 0.5, { min: 0, max: 3, step: 0.05 }),
    speed: scrub("Speed", 0.65, { min: 0.2, max: 3, step: 0.05 }),
    wavelength: scrub("Wavelength", 80, {
      min: 8,
      max: 80,
      step: 1,
      decimals: 0
    }),
    rings: scrub("Rings", 2, { min: 1, max: 8, step: 1, decimals: 0 }),
    decay: scrub("Decay", 1, { min: 0.2, max: 3, step: 0.05 }),
    refraction: scrub("Refraction", 100, {
      min: 0,
      max: 160,
      step: 2,
      decimals: 0
    }),
    dispersion: scrub("Dispersion", 0.5, { min: 0, max: 1, step: 0.02 }),
    shine: scrub("Shine", 0.5, { min: 0, max: 2, step: 0.05 }),
    interval: scrub("Interval", 0, { min: 0, max: 5, step: 0.25 })
  };
  var ripple_default = {
    slug: "ripple",
    name: "Ripple",
    component: "Ripple",
    description: "Click to send water ripples across the page.",
    controls: CONTROLS26,
    toOptions(values) {
      return { ...values };
    },
    create: createRipple
  };

  // src/vendor/lib/Shatter/ShatterVanilla.ts
  var DEFAULTS27 = {
    radius: 0.4,
    softness: 0.6,
    tileSize: 125,
    shards: 1,
    corner: 0,
    lift: 30,
    tilt: 2,
    scatter: 5,
    perspective: 1500,
    gapColor: [0, 0, 0],
    shadow: 0.5,
    shading: 0.5,
    refraction: 1.5,
    dispersion: 0.3,
    floatSpeed: 2,
    strength: 1,
    baseStrength: 0,
    followSpeed: 3
  };
  var TIME_WRAP = Math.PI * 800;
  var VERT24 = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPos;
void main () {
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;
  var FRAG19 = `#version 300 es
precision highp float;
uniform sampler2D uContent;
uniform vec2 uResolution;
uniform vec2 uPointer;
uniform float uActive;
uniform float uRadius;
uniform float uSoftness;
uniform float uStrength;
uniform float uBase;
uniform float uTile;
uniform float uShards;
uniform float uCorner;
uniform float uLift;
uniform float uTilt;
uniform float uScatter;
uniform float uPersp;
uniform vec3 uGap;
uniform float uShadow;
uniform float uShading;
uniform float uRefract;
uniform float uDispersion;
uniform float uTime;
uniform float uMaxX;
uniform vec2 uScroll;
out vec4 outColor;

const float TAU = 6.28318530718;
const vec2 LIGHT = vec2(-0.514495755, 0.857492926);

vec2 hash22 (vec2 p) {
  vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  q += dot(q, q.yzx + 33.33);
  return fract((q.xx + q.yz) * q.zy);
}

float smin (float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

float shardD (vec2 q, vec2 cell, float k) {
  float jit = uTile * 0.8 * clamp(uShards, 0.0, 1.0);
  vec2 s0 = (hash22(cell) - 0.5) * jit;
  float d = uTile;
  for (int i = 0; i < 9; i++) {
    if (i == 4) continue;
    vec2 g = vec2(float(i % 3 - 1), float(i / 3 - 1));
    vec2 sn = g * uTile + (hash22(cell + g) - 0.5) * jit;
    vec2 diff = sn - s0;
    float e = -dot(q - s0 - diff * 0.5, normalize(diff));
    d = smin(d, e, k);
  }
  return d;
}

vec3 pick (vec2 uv) {
  vec2 c = vec2(
    clamp(uv.x, 0.0005, uMaxX - 0.0005),
    clamp(uv.y, 0.0005, 0.9995));
  return texture(uContent, vec2(c.x, 1.0 - c.y)).rgb;
}

float cellAct (vec2 cell, out vec2 sxy) {
  sxy = hash22(cell + 13.13);
  vec2 center = (cell + 0.5) * uTile;
  float aspect = uResolution.x / uResolution.y;
  vec2 cuv = (center - vec2(uScroll.x, -uScroll.y)) / uResolution;
  vec2 dv = vec2((cuv.x - uPointer.x) * aspect, cuv.y - uPointer.y);
  float radius = max(uRadius * uActive, 1e-4);
  float inner = radius * (1.0 - clamp(uSoftness, 0.0, 1.0));
  float lens = (1.0 - smoothstep(inner, radius, length(dv))) * uActive;
  float mask = clamp(max(lens, clamp(uBase, 0.0, 1.0)), 0.0, 1.0)
    * clamp(uStrength, 0.0, 1.0);
  float th = sxy.x * 0.6;
  return smoothstep(th, th + 0.4, mask);
}

void cellDyn (
  vec2 cell,
  vec2 sxy,
  float act,
  out mat3 R,
  out float lift,
  out vec2 anchor,
  out float k
) {
  vec2 center = (cell + 0.5) * uTile;
  vec4 seed = vec4(sxy, hash22(cell + 27.7));

  float wob = sin(uTime + seed.z * TAU);
  float maxT = 0.2 * clamp(uTilt, 0.0, 3.0) * act;
  float rx = (seed.y - 0.5) * 2.0 * maxT
    * (0.75 + 0.25 * wob);
  float ry = (seed.z - 0.5) * 2.0 * maxT
    * (0.75 + 0.25 * cos(uTime * 0.7 + seed.w * TAU));
  float rz = (seed.w - 0.5) * 1.2 * maxT * (0.85 + 0.15 * wob);
  float cx = cos(rx); float sx = sin(rx);
  float cy = cos(ry); float sy = sin(ry);
  float cz = cos(rz); float sz = sin(rz);
  R = mat3(cz, sz, 0.0, -sz, cz, 0.0, 0.0, 0.0, 1.0)
    * mat3(cy, 0.0, -sy, 0.0, 1.0, 0.0, sy, 0.0, cy)
    * mat3(1.0, 0.0, 0.0, 0.0, cx, sx, 0.0, -sx, cx);

  lift = uLift * act * (0.72 + 0.36 * seed.y)
    * (0.86 + 0.14 * sin(uTime * 0.9 + seed.w * TAU));
  vec2 shift = (seed.zw - 0.5) * 2.0 * uScatter * act * (0.85 + 0.15 * wob);
  anchor = center + shift;
  k = max(min(uCorner * act, uTile * 0.45), 1e-2);
}

bool invMap (
  vec2 P,
  mat3 R,
  float lift,
  vec2 anchor,
  out vec2 q
) {
  vec2 w = P - anchor;
  float m11 = uPersp * R[0][0] + w.x * R[0][2];
  float m12 = uPersp * R[1][0] + w.x * R[1][2];
  float m21 = uPersp * R[0][1] + w.y * R[0][2];
  float m22 = uPersp * R[1][1] + w.y * R[1][2];
  float det = m11 * m22 - m12 * m21;
  if (abs(det) < 1e-4) return false;
  vec2 b = w * (uPersp - lift);
  q = vec2(m22 * b.x - m12 * b.y, m11 * b.y - m21 * b.x) / det;
  return true;
}

void main () {
  vec2 P = gl_FragCoord.xy;
  vec2 Pc = P + vec2(uScroll.x, -uScroll.y);
  vec2 uvR = P / uResolution;

  float aspect = uResolution.x / uResolution.y;
  float radius = max(uRadius * uActive, 1e-4);
  vec2 duv = vec2((uvR.x - uPointer.x) * aspect, uvR.y - uPointer.y);
  float slack = 3.0 * uTile / uResolution.y;
  float inner = radius * (1.0 - clamp(uSoftness, 0.0, 1.0));
  float lensB = (1.0
    - smoothstep(inner, radius, max(length(duv) - slack, 0.0))) * uActive;
  float maskB = max(lensB, clamp(uBase, 0.0, 1.0))
    * clamp(uStrength, 0.0, 1.0);
  if (maskB < 1e-4) {
    outColor = vec4(0.0);
    return;
  }

  vec2 cuvR = vec2(
    clamp(uvR.x, 0.0005, uMaxX - 0.0005),
    clamp(uvR.y, 0.0005, 0.9995));
  vec4 tex = texture(uContent, vec2(cuvR.x, 1.0 - cuvR.y));
  float guard = step(uvR.x, uMaxX) * tex.a;
  if (guard < 1e-4) {
    outColor = vec4(0.0);
    return;
  }

  vec2 baseCell = floor(Pc / uTile);
  float act; mat3 R; float lift; vec2 anchor; float k;
  vec2 sxy; vec2 q;

  float shadowGain = clamp(uShadow, 0.0, 2.0) * 0.5;
  float shadowA = 0.0;
  float shadowZ = 0.0;
  vec2 shadowCell = vec2(1e6);

  float sumA = 0.0;
  float maxAct = 0.0;
  float k1 = -1e9; float a1 = 0.0; vec3 c1 = vec3(0.0);
  vec2 cell1 = vec2(1e6);
  float k2 = -1e9; float a2 = 0.0; vec3 c2 = vec3(0.0);
  vec2 cell2 = vec2(1e6);

  float restReach = uTile * 0.95 + 3.0;
  float reach = uTile * 1.8 + uScatter + uLift * 0.4;
  float rr = max(reach, uTile + uScatter + uLift);

  for (int j = -2; j <= 2; j++) {
    for (int i = -2; i <= 2; i++) {
      vec2 cell = baseCell + vec2(float(i), float(j));
      vec2 center = (cell + 0.5) * uTile;
      vec2 cp = center - Pc;
      float cd = dot(cp, cp);
      if (cd > rr * rr) continue;
      act = cellAct(cell, sxy);
      maxAct = max(maxAct, act);

      if (act < 1e-3) {
        if (cd > restReach * restReach) continue;
        float d = shardD(Pc - center, cell, 1e-2);
        float a = 1.0 - smoothstep(-1.5, 1.5, -d);
        if (a < 0.003) continue;
        sumA += a;
        if (0.0 > k1) {
          k2 = k1; a2 = a1; c2 = c1; cell2 = cell1;
          k1 = 0.0; a1 = a; c1 = tex.rgb; cell1 = cell;
        } else if (0.0 > k2) {
          k2 = 0.0; a2 = a; c2 = tex.rgb; cell2 = cell;
        }
        continue;
      }

      cellDyn(cell, sxy, act, R, lift, anchor, k);

      if (shadowGain > 1e-3 && lift > 0.5) {
        vec2 qs = Pc + LIGHT * lift * 0.5 - anchor;
        float blur = max(lift * 0.4, 1.0);
        float srad = uTile * 0.95 + blur;
        if (dot(qs, qs) < srad * srad) {
          float sA = 1.0 - smoothstep(-blur, blur, -shardD(qs, cell, k));
          sA *= shadowGain * act * act;
          if (sA > shadowA) {
            shadowA = sA;
            shadowZ = lift;
            shadowCell = cell;
          }
        }
      }

      if (cd > reach * reach) continue;
      if (!invMap(Pc, R, lift, anchor, q)) continue;
      float d = shardD(q, cell, k);
      float a = 1.0 - smoothstep(-1.5, 1.5, -d);
      if (a < 0.003) continue;
      vec2 uvS = (center + q - vec2(uScroll.x, -uScroll.y)) / uResolution;
      vec3 n = R * vec3(0.0, 0.0, 1.0);
      float rA = uRefract * act * act;
      vec3 col;
      if (rA < 1e-3) {
        col = pick(uvS);
      } else {
        vec2 refr = -n.xy * (rA * uTile * 0.25) / uResolution;
        float spread = uDispersion * 0.6;
        if (spread < 1e-3) {
          col = pick(uvS + refr);
        } else {
          col = vec3(
            pick(uvS + refr * (1.0 + spread)).r,
            pick(uvS + refr).g,
            pick(uvS + refr * (1.0 - spread)).b);
        }
      }
      col *= clamp(
        1.0 + clamp(uShading, 0.0, 2.0) * act * dot(n.xy, LIGHT) * 0.6,
        0.0, 2.0);
      sumA += a;
      if (lift > k1) {
        k2 = k1; a2 = a1; c2 = c1; cell2 = cell1;
        k1 = lift; a1 = a; c1 = col; cell1 = cell;
      } else if (lift > k2) {
        k2 = lift; a2 = a; c2 = col; cell2 = cell;
      }
    }
  }

  if (maxAct < 1e-3 && shadowA < 1e-3) {
    outColor = vec4(0.0);
    return;
  }

  if (shadowA > 1e-3) {
    if (any(notEqual(cell1, shadowCell))) {
      c1 *= 1.0 - shadowA * clamp((shadowZ - k1) / (uTile * 0.2), 0.0, 1.0);
    }
    if (any(notEqual(cell2, shadowCell))) {
      c2 *= 1.0 - shadowA * clamp((shadowZ - k2) / (uTile * 0.2), 0.0, 1.0);
    }
  }

  float cover = clamp(sumA, 0.0, 1.0);
  float sep = max(uLift * 0.25, 2.0);
  float f = clamp((k1 - k2) / sep, 0.0, 1.0);
  float w1 = a1 * (0.5 + 0.5 * f);
  float w2 = a2 * (1.0 - w1);
  float layered = w1 + w2;
  vec3 shardCol = layered > 1e-6
    ? (c1 * w1 + c2 * w2) / layered
    : uGap;
  float bgRecv = shadowA * clamp(shadowZ / (uTile * 0.2), 0.0, 1.0);
  vec3 bg = uGap * (1.0 - bgRecv);
  outColor = vec4(mix(bg, shardCol, cover), guard);
}`;
  function createShatter(elements, options = {}) {
    const config = { ...DEFAULTS27, ...options };
    const { source, content, output } = elements;
    const gl = output.getContext("webgl2", {
      alpha: true,
      depth: false,
      stencil: false,
      antialias: true,
      premultipliedAlpha: false
    });
    if (!gl || gl.isContextLost()) return null;
    const sourceCtx = source.getContext("2d");
    const paintable = source;
    const htmlInCanvas = Boolean(
      sourceCtx && typeof sourceCtx.drawElementImage === "function" && typeof paintable.requestPaint === "function"
    );
    if (htmlInCanvas) prepareHtmlInCanvas(source, content);
    let contentDirty = false;
    let wake = () => {
    };
    if (htmlInCanvas) {
      paintable.onpaint = () => {
        try {
          sourceCtx.reset();
          drawHtmlInCanvas(source, sourceCtx, content);
          contentDirty = true;
          wake();
        } catch {
        }
      };
    }
    function compile(type, text) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, text);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error("Shatter shader error:", gl.getShaderInfoLog(shader));
      }
      return shader;
    }
    const vertexShader = compile(gl.VERTEX_SHADER, VERT24);
    const fragmentShader = compile(gl.FRAGMENT_SHADER, FRAG19);
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error("Shatter link error:", gl.getProgramInfoLog(program));
    }
    const uniforms = {};
    const uniformCount = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < uniformCount; i++) {
      const info = gl.getActiveUniform(program, i);
      uniforms[info.name] = gl.getUniformLocation(program, info.name);
    }
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const contentTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, contentTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([0, 0, 0, 0])
    );
    let contentMaxX = 1;
    function syncCanvasSize() {
      const dpr = getCanvasPixelRatio(output, gl);
      const width = Math.max(1, Math.round(output.clientWidth * dpr));
      const height = Math.max(1, Math.round(output.clientHeight * dpr));
      if (output.width !== width || output.height !== height) {
        output.width = width;
        output.height = height;
      }
      contentMaxX = Math.min(
        1,
        Math.max(0.05, content.clientWidth / Math.max(output.clientWidth, 1))
      );
      if (htmlInCanvas) {
        const sourceWidth = Math.max(1, Math.round(source.clientWidth * dpr));
        const sourceHeight = Math.max(1, Math.round(source.clientHeight * dpr));
        if (source.width !== sourceWidth || source.height !== sourceHeight) {
          source.width = sourceWidth;
          source.height = sourceHeight;
        }
        paintable.requestPaint();
      }
    }
    syncCanvasSize();
    const pointer = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5, active: 0, target: 0 };
    let time = 0;
    function uploadContent() {
      if (!htmlInCanvas || !contentDirty) return;
      contentDirty = false;
      gl.bindTexture(gl.TEXTURE_2D, contentTexture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        source
      );
    }
    function render() {
      uploadContent();
      gl.useProgram(program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, contentTexture);
      gl.uniform1i(uniforms.uContent, 0);
      gl.uniform2f(uniforms.uResolution, output.width, output.height);
      const dpr = output.width / Math.max(output.clientWidth, 1);
      const tilePx = Math.max(config.tileSize, 24) * dpr;
      gl.uniform1f(uniforms.uTile, tilePx);
      gl.uniform1f(uniforms.uCorner, Math.max(config.corner, 0) * dpr);
      gl.uniform1f(uniforms.uLift, Math.max(config.lift, 0) * dpr);
      gl.uniform1f(uniforms.uTilt, config.tilt);
      gl.uniform1f(uniforms.uScatter, Math.max(config.scatter, 0) * dpr);
      gl.uniform1f(uniforms.uPersp, Math.max(config.perspective, 200) * dpr);
      gl.uniform3f(
        uniforms.uGap,
        config.gapColor[0],
        config.gapColor[1],
        config.gapColor[2]
      );
      gl.uniform1f(uniforms.uShadow, config.shadow);
      gl.uniform1f(uniforms.uShading, config.shading);
      gl.uniform1f(uniforms.uShards, Math.min(Math.max(config.shards, 0), 1));
      gl.uniform1f(uniforms.uRefract, Math.max(config.refraction, 0));
      gl.uniform1f(
        uniforms.uDispersion,
        Math.min(Math.max(config.dispersion, 0), 1)
      );
      gl.uniform1f(uniforms.uTime, time);
      gl.uniform2f(uniforms.uPointer, pointer.x, pointer.y);
      gl.uniform1f(uniforms.uActive, pointer.active);
      gl.uniform1f(uniforms.uRadius, Math.max(config.radius, 0.01));
      gl.uniform1f(uniforms.uSoftness, config.softness);
      gl.uniform1f(uniforms.uStrength, config.strength);
      gl.uniform1f(uniforms.uBase, config.baseStrength);
      gl.uniform1f(uniforms.uMaxX, contentMaxX);
      gl.uniform2f(
        uniforms.uScroll,
        content.scrollLeft * dpr,
        content.scrollTop * dpr
      );
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, output.width, output.height);
      gl.disable(gl.BLEND);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    let raf = 0;
    let lastTime = performance.now();
    let destroyed = false;
    let running = false;
    let visible = true;
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reducedMotion = motionQuery.matches;
    function frame(now) {
      if (destroyed) return;
      if (!visible) {
        running = false;
        return;
      }
      const delta = Math.min((now - lastTime) / 1e3, 1 / 30);
      lastTime = now;
      const ease = reducedMotion ? 1 : 1 - Math.exp(-delta * Math.max(config.followSpeed, 0.5));
      pointer.x += (pointer.tx - pointer.x) * ease;
      pointer.y += (pointer.ty - pointer.y) * ease;
      pointer.active += (pointer.target - pointer.active) * ease;
      const floating = !reducedMotion && config.floatSpeed > 1e-3 && Math.min(config.strength, 1) > 1e-3 && (pointer.active > 1e-3 || Math.min(config.baseStrength, 1) > 1e-3);
      if (floating) {
        time += delta * config.floatSpeed;
        if (time >= TIME_WRAP) time -= TIME_WRAP;
      }
      const settled = !floating && Math.abs(pointer.tx - pointer.x) < 5e-4 && Math.abs(pointer.ty - pointer.y) < 5e-4 && Math.abs(pointer.target - pointer.active) < 1e-3;
      if (settled) {
        pointer.x = pointer.tx;
        pointer.y = pointer.ty;
        pointer.active = pointer.target;
      }
      render();
      if (settled && !contentDirty) {
        running = false;
        return;
      }
      raf = requestAnimationFrame(frame);
    }
    function start() {
      if (destroyed || running || !visible) return;
      running = true;
      lastTime = performance.now();
      raf = requestAnimationFrame(frame);
    }
    wake = start;
    start();
    function onMotionChange() {
      reducedMotion = motionQuery.matches;
      start();
    }
    motionQuery.addEventListener("change", onMotionChange);
    const observer = createCanvasResizeObserver(() => {
      syncCanvasSize();
      start();
    });
    observer.observe(output);
    observer.observe(content);
    const intersection = new IntersectionObserver((entries) => {
      visible = entries[entries.length - 1]?.isIntersecting ?? true;
      if (visible) start();
    });
    intersection.observe(output);
    const listenTarget = output.parentElement ?? output;
    const rectCache = createRectCache(output);
    function onPointerMove(event) {
      const rect = rectCache.current;
      pointer.tx = (event.clientX - rect.left) / Math.max(rect.width, 1);
      pointer.ty = 1 - (event.clientY - rect.top) / Math.max(rect.height, 1);
      pointer.target = 1;
      start();
    }
    function onPointerLeave() {
      pointer.target = 0;
      start();
    }
    listenTarget.addEventListener("pointermove", onPointerMove, { passive: true });
    listenTarget.addEventListener("pointerleave", onPointerLeave, { passive: true });
    content.addEventListener("scroll", start, { passive: true });
    return {
      setOptions(next) {
        if (!Object.entries(next).some(
          ([key, value]) => config[key] !== value
        ))
          return;
        Object.assign(config, next);
        start();
      },
      resize() {
        syncCanvasSize();
        start();
      },
      destroy() {
        destroyed = true;
        rectCache.destroy();
        cancelAnimationFrame(raf);
        observer.disconnect();
        intersection.disconnect();
        motionQuery.removeEventListener("change", onMotionChange);
        listenTarget.removeEventListener("pointermove", onPointerMove);
        listenTarget.removeEventListener("pointerleave", onPointerLeave);
        content.removeEventListener("scroll", start);
        gl.deleteTexture(contentTexture);
        gl.deleteProgram(program);
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
        gl.deleteBuffer(quad);
        if (htmlInCanvas) paintable.onpaint = null;
      }
    };
  }

  // src/effects/shatter.js
  var LIGHT_GAP = "#ffffff";
  var DARK_GAP = "#0a0a0a";
  var CONTROLS27 = {
    radius: scrub("Radius", 0.4, { min: 0.1, max: 0.8, step: 0.01 }),
    softness: scrub("Softness", 0.6, { min: 0, max: 1, step: 0.05 }),
    tileSize: scrub("Tile size", 125, {
      min: 40,
      max: 220,
      step: 5,
      decimals: 0
    }),
    shards: scrub("Shards", 1, { min: 0, max: 1, step: 0.05 }),
    corner: scrub("Corner", 0, { min: 0, max: 30, step: 1, decimals: 0 }),
    lift: scrub("Lift", 30, { min: 0, max: 120, step: 2, decimals: 0 }),
    tilt: scrub("Tilt", 2, { min: 0, max: 3, step: 0.05 }),
    scatter: scrub("Scatter", 5, { min: 0, max: 30, step: 1, decimals: 0 }),
    perspective: scrub("Perspective", 1500, {
      min: 300,
      max: 2e3,
      step: 50,
      decimals: 0
    }),
    shadow: scrub("Shadow", 0.5, { min: 0, max: 2, step: 0.05 }),
    shading: scrub("Shading", 0.5, { min: 0, max: 2, step: 0.05 }),
    refraction: scrub("Refraction", 1.5, { min: 0, max: 2, step: 0.05 }),
    dispersion: scrub("Dispersion", 0.3, { min: 0, max: 1, step: 0.05 }),
    floatSpeed: scrub("Float speed", 2, {
      min: 0,
      max: 4,
      step: 0.1,
      decimals: 1
    }),
    strength: scrub("Strength", 1, { min: 0, max: 1, step: 0.05 }),
    baseStrength: scrub("Base strength", 0, { min: 0, max: 1, step: 0.05 }),
    followSpeed: scrub("Follow speed", 3, {
      min: 1,
      max: 20,
      step: 0.5,
      decimals: 1
    }),
    gap: color("Gap color", "", { auto: { label: "Auto" } })
  };
  function parseCssColor(css) {
    if (!css) return [255, 255, 255];
    const match = css.match(/[\d.]+/g);
    if (!match) return [255, 255, 255];
    const [r, g, b] = match.map(Number);
    return [r ?? 255, g ?? 255, b ?? 255];
  }
  function isDarkBackground(background) {
    const [r, g, b] = parseCssColor(background);
    const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    return luminance < 0.5;
  }
  var shatter_default = {
    slug: "shatter",
    name: "Shatter",
    component: "Shatter",
    description: "Shatters the page into glass shards.",
    controls: CONTROLS27,
    toOptions(values, ctx) {
      const { gap, ...rest } = values;
      const themeGap = isDarkBackground(ctx.background) ? DARK_GAP : LIGHT_GAP;
      const effectiveGap = gap === "" ? themeGap : gap;
      return {
        ...rest,
        gapColor: hexToRgb(effectiveGap)
      };
    },
    create: createShatter
  };

  // src/vendor/lib/VHS/VHSVanilla.ts
  var DEFAULTS28 = {
    speed: 0.5,
    wave: 1,
    jitter: 0.25,
    crease: 0.1,
    switching: 0.05,
    switchingHeight: 0.02,
    bloom: 0.4,
    aberration: 2,
    acBeat: 1,
    grain: 0.1,
    scanlines: 0.1,
    vignette: 0,
    barrel: 0,
    saturation: 1,
    exposure: 1
  };
  var VERT25 = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPos;
out vec2 vUv;
void main () {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;
  var FRAG20 = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uContent;
uniform vec2 uResolution;
uniform float uTime;
uniform float uWave;
uniform float uJitter;
uniform float uCrease;
uniform float uSwitching;
uniform float uSwitchHeight;
uniform float uBloom;
uniform float uAberration;
uniform float uAcBeat;
uniform float uGrain;
uniform float uScanlines;
uniform float uVignette;
uniform float uSaturation;
uniform float uExposure;
uniform float uBarrel;
uniform vec3 uBezel;
uniform float uCreaseNoise;
uniform float uMaxX;

#define PI 3.14159265

float hash (vec2 v) {
  return fract(sin(dot(v, vec2(89.44, 19.36))) * 22189.22);
}

float iHash (vec2 v, vec2 r) {
  float h00 = hash(floor(v * r + vec2(0.0, 0.0)) / r);
  float h10 = hash(floor(v * r + vec2(1.0, 0.0)) / r);
  float h01 = hash(floor(v * r + vec2(0.0, 1.0)) / r);
  float h11 = hash(floor(v * r + vec2(1.0, 1.0)) / r);
  vec2 ip = smoothstep(vec2(0.0), vec2(1.0), mod(v * r, 1.0));
  return (h00 * (1.0 - ip.x) + h10 * ip.x) * (1.0 - ip.y)
    + (h01 * (1.0 - ip.x) + h11 * ip.x) * ip.y;
}

float noise (vec2 v) {
  float sum = 0.0;
  float s = 2.0;
  for (int i = 1; i < 7; i++) {
    sum += iHash(v + vec2(i), vec2(2.0 * s)) / s;
    s *= 2.0;
  }
  return sum;
}

vec4 tape (vec2 p) {
  p.x = clamp(p.x, 0.0005, uMaxX - 0.0005);
  p.y = clamp(p.y, 0.0005, 0.9995);
  return texture(uContent, vec2(p.x, 1.0 - p.y));
}

void main () {
  vec2 uv = vUv;
  if (uv.x > uMaxX) {
    outColor = vec4(0.0);
    return;
  }

  float edgeMask = 1.0;
  if (uBarrel > 0.0) {
    vec2 c = vec2(uv.x / uMaxX, uv.y) * 2.0 - 1.0;
    c *= 1.0 + uBarrel * 0.15 * dot(c, c);
    float m = max(abs(c.x), abs(c.y));
    edgeMask = 1.0 - smoothstep(1.0 - 0.12 * uBarrel, 1.0, m);
    if (edgeMask <= 0.0) {
      outColor = vec4(uBezel, 1.0);
      return;
    }
    uv = vec2((c.x * 0.5 + 0.5) * uMaxX, c.y * 0.5 + 0.5);
  }

  vec2 uvn = uv;
  float t = uTime;

  float lineNoise = 0.0;
  if (uJitter + uCrease + uSwitching > 0.0) {
    lineNoise = noise(vec2(uvn.y * 100.0, t * 10.0));
  }

  if (uWave > 0.0) {
    uvn.x += (noise(vec2(uvn.y, t)) - 0.5) * 0.005 * uWave;
  }
  uvn.x += (lineNoise - 0.5) * 0.01 * uJitter;

  float tcPhase = clamp(
    (sin(uvn.y * 8.0 - t * PI * 1.2) - 0.92) * uCreaseNoise,
    0.0, 0.01
  ) * 10.0 * uCrease;
  float tcNoise = max(lineNoise - 0.5, 0.0);
  uvn.x -= tcNoise * tcPhase;

  float snPhase = smoothstep(max(uSwitchHeight, 1e-4), 0.0, uvn.y) * uSwitching;
  uvn.y += snPhase * 0.3;
  uvn.x += snPhase * ((lineNoise - 0.5) * 0.2);

  vec4 base = tape(uvn);
  vec3 col = base.rgb;
  col *= 1.0 - tcPhase;

  col = mix(col, col.yzx, clamp(snPhase, 0.0, 1.0));

  if (uBloom > 0.0) {
    float px = uAberration / max(uResolution.x, 1.0);
    vec3 bloomSum = vec3(0.0);
    for (int i = -8; i <= 2; i++) {
      vec3 s = tape(uvn + vec2(float(i) * px, 0.0)).rgb;
      if (i >= -4) bloomSum.r += s.r;
      if (i >= -6 && i <= 0) bloomSum.g += s.g;
      if (i <= -2) bloomSum.b += s.b;
    }
    bloomSum *= 0.1;

    col = mix(col, (col + bloomSum) / 1.7, clamp(uBloom, 0.0, 1.0));
  }

  if (uAcBeat > 0.0) {
    col *= 1.0 + clamp(
      noise(vec2(0.0, uv.y + t * 0.2)) * 0.6 - 0.25, 0.0, 0.1
    ) * uAcBeat;
  }

  float g = hash(uv * uResolution + fract(t) * vec2(127.1, 311.7)) - 0.5;
  col += g * uGrain;

  float scan = sin(uv.y * uResolution.y * PI) * 0.5;
  col *= 1.0 - uScanlines * 0.35 * scan;

  vec2 vd = (uv - 0.5) * vec2(uResolution.x / max(uResolution.y, 1.0), 1.0);
  col *= 1.0 - uVignette * smoothstep(0.4, 1.1, length(vd));

  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(lum), col, clamp(uSaturation, 0.0, 2.0));

  col *= uExposure;

  float alpha = max(base.a, clamp(snPhase + tcPhase, 0.0, 1.0));

  if (uBarrel > 0.0) {
    col = mix(uBezel, col, edgeMask);
    alpha = 1.0;
  }
  outColor = vec4(col, alpha);
}`;
  function createVHS(elements, options = {}) {
    const config = { ...DEFAULTS28, ...options };
    const { source, content, output } = elements;
    const gl = output.getContext("webgl2", {
      alpha: true,
      depth: false,
      stencil: false,
      antialias: false,
      premultipliedAlpha: false
    });
    if (!gl || gl.isContextLost()) return null;
    const sourceCtx = source.getContext("2d");
    const paintable = source;
    const htmlInCanvas = Boolean(
      sourceCtx && typeof sourceCtx.drawElementImage === "function" && typeof paintable.requestPaint === "function"
    );
    if (htmlInCanvas) prepareHtmlInCanvas(source, content);
    let contentDirty = false;
    let wake = () => {
    };
    if (htmlInCanvas) {
      paintable.onpaint = () => {
        try {
          sourceCtx.reset();
          drawHtmlInCanvas(source, sourceCtx, content);
          contentDirty = true;
          wake();
        } catch {
        }
      };
    }
    function compile(type, text) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, text);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error("VHS shader error:", gl.getShaderInfoLog(shader));
      }
      return shader;
    }
    const vertexShader = compile(gl.VERTEX_SHADER, VERT25);
    const fragmentShader = compile(gl.FRAGMENT_SHADER, FRAG20);
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    const uniforms = {};
    const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < count; i++) {
      const info = gl.getActiveUniform(program, i);
      uniforms[info.name] = gl.getUniformLocation(program, info.name);
    }
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const contentTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, contentTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([0, 0, 0, 0])
    );
    let contentMaxX = 1;
    let bezel = [0, 0, 0];
    const bezelProbe = document.createElement("canvas");
    bezelProbe.width = bezelProbe.height = 1;
    const bezelCtx = bezelProbe.getContext("2d", { willReadFrequently: true });
    function syncBezelColor() {
      if (!bezelCtx) return;
      let el = content;
      while (el) {
        const bg = getComputedStyle(el).backgroundColor;
        if (bg && bg !== "transparent") {
          bezelCtx.clearRect(0, 0, 1, 1);
          bezelCtx.fillStyle = bg;
          bezelCtx.fillRect(0, 0, 1, 1);
          const [r, g, b, a] = bezelCtx.getImageData(0, 0, 1, 1).data;
          if (a > 0) {
            bezel = [r / 255, g / 255, b / 255];
            return;
          }
        }
        el = el.parentElement;
      }
      bezel = [0, 0, 0];
    }
    function syncCanvasSize() {
      const dpr = getCanvasPixelRatio(output, gl);
      const width = Math.max(1, Math.round(output.clientWidth * dpr));
      const height = Math.max(1, Math.round(output.clientHeight * dpr));
      if (output.width !== width || output.height !== height) {
        output.width = width;
        output.height = height;
      }
      contentMaxX = Math.min(
        1,
        Math.max(0.05, content.clientWidth / Math.max(output.clientWidth, 1))
      );
      if (htmlInCanvas) {
        const sourceWidth = Math.max(1, Math.round(source.clientWidth * dpr));
        const sourceHeight = Math.max(1, Math.round(source.clientHeight * dpr));
        if (source.width !== sourceWidth || source.height !== sourceHeight) {
          source.width = sourceWidth;
          source.height = sourceHeight;
        }
        paintable.requestPaint();
      }
    }
    syncCanvasSize();
    syncBezelColor();
    function uploadContent() {
      if (!htmlInCanvas || !contentDirty) return;
      contentDirty = false;
      syncBezelColor();
      gl.bindTexture(gl.TEXTURE_2D, contentTexture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        source
      );
    }
    let time = 0;
    const fract = (x) => x - Math.floor(x);
    const hash2 = (x, y) => fract(Math.sin(x * 89.44 + y * 19.36) * 22189.22);
    const smooth01 = (x) => x * x * (3 - 2 * x);
    function iHashCpu(vx, vy, r) {
      const fx = Math.floor(vx * r);
      const fy = Math.floor(vy * r);
      const h00 = hash2(fx / r, fy / r);
      const h10 = hash2((fx + 1) / r, fy / r);
      const h01 = hash2(fx / r, (fy + 1) / r);
      const h11 = hash2((fx + 1) / r, (fy + 1) / r);
      const ix = smooth01(fract(vx * r));
      const iy = smooth01(fract(vy * r));
      return (h00 * (1 - ix) + h10 * ix) * (1 - iy) + (h01 * (1 - ix) + h11 * ix) * iy;
    }
    function noiseCpu(vx, vy) {
      let sum = 0;
      let s = 2;
      for (let i = 1; i < 7; i++) {
        sum += iHashCpu(vx + i, vy + i, 2 * s) / s;
        s *= 2;
      }
      return sum;
    }
    function render() {
      uploadContent();
      gl.useProgram(program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, contentTexture);
      gl.uniform1i(uniforms.uContent, 0);
      gl.uniform2f(uniforms.uResolution, output.width, output.height);
      gl.uniform1f(uniforms.uTime, time);
      gl.uniform1f(uniforms.uWave, Math.max(config.wave, 0));
      gl.uniform1f(uniforms.uJitter, Math.max(config.jitter, 0));
      gl.uniform1f(uniforms.uCrease, Math.max(config.crease, 0));
      gl.uniform1f(uniforms.uSwitching, Math.max(config.switching, 0));
      gl.uniform1f(uniforms.uSwitchHeight, Math.max(config.switchingHeight, 0));
      gl.uniform1f(uniforms.uBloom, config.bloom);
      const dpr = output.width / Math.max(output.clientWidth, 1);
      gl.uniform1f(uniforms.uAberration, Math.max(config.aberration, 0) * dpr);
      gl.uniform1f(uniforms.uAcBeat, Math.max(config.acBeat, 0));
      gl.uniform1f(uniforms.uGrain, Math.max(config.grain, 0));
      gl.uniform1f(uniforms.uScanlines, Math.max(config.scanlines, 0));
      gl.uniform1f(uniforms.uVignette, Math.max(config.vignette, 0));
      gl.uniform1f(
        uniforms.uBarrel,
        htmlInCanvas ? Math.max(config.barrel, 0) : 0
      );
      gl.uniform3f(uniforms.uBezel, bezel[0], bezel[1], bezel[2]);
      gl.uniform1f(uniforms.uCreaseNoise, noiseCpu(time, time));
      gl.uniform1f(uniforms.uSaturation, config.saturation);
      gl.uniform1f(uniforms.uExposure, Math.max(config.exposure, 0));
      gl.uniform1f(uniforms.uMaxX, contentMaxX);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, output.width, output.height);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    let raf = 0;
    let lastTime = performance.now();
    let destroyed = false;
    let running = false;
    let visible = true;
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reducedMotion = motionQuery.matches;
    function frame(now) {
      if (destroyed) return;
      if (!visible) {
        running = false;
        return;
      }
      const delta = Math.min((now - lastTime) / 1e3, 1 / 30);
      lastTime = now;
      if (!reducedMotion) time += delta * config.speed;
      render();
      if (reducedMotion && !contentDirty) {
        running = false;
        return;
      }
      raf = requestAnimationFrame(frame);
    }
    function start() {
      if (destroyed || running || !visible) return;
      running = true;
      lastTime = performance.now();
      raf = requestAnimationFrame(frame);
    }
    wake = start;
    start();
    function onMotionChange() {
      reducedMotion = motionQuery.matches;
      start();
    }
    motionQuery.addEventListener("change", onMotionChange);
    const observer = createCanvasResizeObserver(() => {
      syncCanvasSize();
      start();
    });
    observer.observe(output);
    observer.observe(content);
    const intersection = new IntersectionObserver((entries) => {
      visible = entries[entries.length - 1]?.isIntersecting ?? true;
      if (visible) start();
    });
    intersection.observe(output);
    return {
      setOptions(next) {
        if (!Object.entries(next).some(
          ([key, value]) => config[key] !== value
        ))
          return;
        Object.assign(config, next);
        start();
      },
      resize() {
        syncCanvasSize();
        start();
      },
      destroy() {
        destroyed = true;
        cancelAnimationFrame(raf);
        observer.disconnect();
        intersection.disconnect();
        motionQuery.removeEventListener("change", onMotionChange);
        gl.deleteTexture(contentTexture);
        gl.deleteProgram(program);
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
        gl.deleteBuffer(quad);
        if (htmlInCanvas) paintable.onpaint = null;
      }
    };
  }

  // src/effects/vhs.js
  var CONTROLS28 = {
    speed: scrub("Speed", 0.5, { min: 0, max: 4, step: 0.1, decimals: 1 }),
    wave: scrub("Wave", 1, { min: 0, max: 3, step: 0.05 }),
    jitter: scrub("Jitter", 0.25, { min: 0, max: 3, step: 0.05 }),
    crease: scrub("Crease", 0.1, { min: 0, max: 3, step: 0.05 }),
    switching: scrub("Switching", 0.05, { min: 0, max: 3, step: 0.05 }),
    switchingHeight: scrub("Switch height", 0.02, {
      min: 0,
      max: 0.2,
      step: 5e-3,
      decimals: 3
    }),
    bloom: scrub("Bloom", 0.4, { min: 0, max: 1, step: 0.05 }),
    aberration: scrub("Aberration", 2, {
      min: 0,
      max: 12,
      step: 0.5,
      decimals: 1
    }),
    acBeat: scrub("AC beat", 1, { min: 0, max: 3, step: 0.05 }),
    grain: scrub("Grain", 0.1, { min: 0, max: 0.5, step: 0.01 }),
    scanlines: scrub("Scanlines", 0.1, { min: 0, max: 1, step: 0.05 }),
    vignette: scrub("Vignette", 0, { min: 0, max: 1, step: 0.05 }),
    barrel: scrub("Barrel", 0, { min: 0, max: 1, step: 0.05 }),
    saturation: scrub("Saturation", 1, { min: 0, max: 2, step: 0.05 }),
    exposure: scrub("Exposure", 1, { min: 0.5, max: 2, step: 0.05 })
  };
  var vhs_default = {
    slug: "vhs",
    name: "VHS",
    component: "VHS",
    description: "Analog tape artifacts over the live page.",
    controls: CONTROLS28,
    toOptions(values) {
      return { ...values };
    },
    create: createVHS
  };

  // src/effects/index.js
  var EFFECTS = [
    asciify_default,
    bend_default,
    blaze_default,
    bubble_default,
    canvas_default,
    cloth_default,
    clouds_default,
    decrypt_reveal_default,
    displacement_default,
    droplets_default,
    flame_wrap_default,
    force_field_default,
    frost_default,
    glass_default,
    glitch_default,
    glyph_rain_default,
    grid_default,
    hex_float_default,
    laser_default,
    liquid_default,
    magnify_default,
    particle_reveal_default,
    particle_scroll_default,
    peel_default,
    retro_dither_default,
    ripple_default,
    shatter_default,
    vhs_default
  ];

  // src/panel.css.js
  var PANEL_CSS = `
:host { all: initial; }
* { box-sizing: border-box; }
.panel {
  position: fixed; top: 16px; bottom: 16px; left: 16px; width: 240px;
  display: flex; flex-direction: column;
  border-radius: 16px; border: 1px solid rgba(0,0,0,.12);
  background: rgba(255,255,255,.86); backdrop-filter: blur(18px) saturate(1.5);
  color: #0a0a0a; font: 500 13px/1.35 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Inter, sans-serif;
  box-shadow: 0 10px 30px rgba(0,0,0,.08);
  overflow: hidden;
}
.panel.right { left: auto; right: 16px; }
.head { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 18px 12px 14px; }
.brand { display: flex; align-items: center; gap: 8px; font-weight: 600; font-size: 14px; }
.logo { width: 20px; height: 20px; border-radius: 5px; background: #0a0a0a; display: inline-block; position: relative; }
.logo::after { content: ""; position: absolute; inset: 5px; border: 2px solid #fff; border-radius: 2px; }
.head-right { display: flex; align-items: center; gap: 6px; }
.tag { border: 1px solid rgba(0,0,0,.15); border-radius: 999px; padding: 4px 10px; font-size: 12px; font-weight: 600; color: #737373; }
.lang { border: 1px solid rgba(0,0,0,.15); border-radius: 999px; padding: 4px 9px; font: inherit; font-size: 11px; font-weight: 600; color: #737373; background: transparent; cursor: pointer; }
.lang:hover { background: rgba(0,0,0,.05); color: #0a0a0a; }
.section { padding: 0 12px 10px; }
.label { margin: 0 0 6px; font-size: 12px; font-weight: 500; color: rgba(115,115,115,.8); }
.card { border: 1px solid rgba(0,0,0,.1); background: rgba(0,0,0,.03); border-radius: 12px; padding: 8px; }
.select { width: 100%; font: inherit; font-weight: 600; color: inherit; background: #fff; border: 1px solid rgba(0,0,0,.12); border-radius: 8px; padding: 6px 8px; cursor: pointer; }
.desc { margin: 6px 4px 0; font-size: 11.5px; color: #737373; font-weight: 500; }
.actions { display: grid; grid-template-columns: 1fr 1fr auto auto; gap: 6px; padding: 0 12px 10px; }
.btn, .power, .reset, .seg { font: inherit; cursor: pointer; border-radius: 8px; border: 1px solid rgba(0,0,0,.12); background: rgba(255,255,255,.7); color: inherit; padding: 6px 8px; font-weight: 500; }
.btn:hover, .seg:hover { background: rgba(0,0,0,.05); }
.power { font-weight: 600; }
.power.on { background: #0a0a0a; color: #fff; border-color: #0a0a0a; }
.scroll { flex: 1; overflow-y: auto; padding: 4px 12px 12px; scrollbar-width: thin; }
.controls-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; }
.controls-head .label { margin: 0; }
.reset { border: none; background: none; padding: 2px 4px; font-size: 12px; color: #737373; }
.reset:disabled { opacity: .4; cursor: default; }
.rows { display: flex; flex-direction: column; gap: 4px; }
.row { display: flex; align-items: center; justify-content: space-between; min-height: 32px; border-radius: 8px; }
.row[hidden] { display: none; }
.row-label { font-size: 12.5px; }
.scrub { position: relative; background: rgba(0,0,0,.05); overflow: hidden; cursor: ew-resize; user-select: none; touch-action: none; }
.scrub .fill { position: absolute; left: 0; top: 0; bottom: 0; background: rgba(0,0,0,.09); pointer-events: none; transition: width .04s linear; }
.scrub.dragging .fill { transition: none; background: rgba(0,0,0,.14); }
.scrub-label { position: relative; padding-left: 10px; font-size: 12.5px; pointer-events: none; }
.scrub-value { position: relative; padding-right: 10px; font-size: 12px; font-variant-numeric: tabular-nums; color: #404040; pointer-events: none; }
.radio { flex-direction: column; align-items: stretch; gap: 4px; }
.seg-group { display: flex; gap: 2px; background: rgba(0,0,0,.05); border-radius: 8px; padding: 2px; }
.seg { flex: 1; border: none; background: none; padding: 5px 6px; font-size: 12px; border-radius: 6px; color: #525252; white-space: nowrap; }
.seg.active { background: #fff; color: #0a0a0a; box-shadow: 0 1px 2px rgba(0,0,0,.08); font-weight: 600; }
.toggle { cursor: pointer; padding: 0 2px 0 10px; background: rgba(0,0,0,.03); }
.switch { width: 34px; height: 20px; border-radius: 999px; background: rgba(0,0,0,.18); position: relative; transition: background .15s; margin-right: 6px; }
.switch::after { content: ""; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: #fff; transition: transform .15s; box-shadow: 0 1px 2px rgba(0,0,0,.2); }
.switch.on { background: #0a0a0a; }
.switch.on::after { transform: translateX(14px); }
.color { padding: 0 6px 0 10px; background: rgba(0,0,0,.03); }
.color-right { display: flex; align-items: center; gap: 6px; }
.hex { font-size: 12px; font-family: ui-monospace, Menlo, Consolas, monospace; color: #404040; }
.swatch { width: 22px; height: 22px; border-radius: 6px; border: 1px solid rgba(0,0,0,.15); overflow: hidden; cursor: pointer; position: relative; display: block; }
.color-input { position: absolute; inset: -8px; width: 40px; height: 40px; border: none; padding: 0; cursor: pointer; opacity: 0; }
.seg.auto { flex: none; padding: 3px 8px; border: 1px solid rgba(0,0,0,.12); }
.seg.auto.active { background: #0a0a0a; color: #fff; }
.status { margin: 0 12px 12px; padding: 8px 10px; border-radius: 10px; background: rgba(0,0,0,.05); font-size: 11.5px; color: #404040; }
.status.warn { background: #fff4d6; color: #6b4a00; }
.status[hidden] { display: none; }
`;

  // src/content.js
  var STORAGE_KEY = "cua:v1";
  var Z_HOST = 2147483e3;
  var Z_PANEL = 2147483001;
  if (window.__cuaApp) {
    window.__cuaApp.togglePanel();
  } else {
    window.__cuaApp = createApp();
  }
  var I18N = {
    en: {
      power: "Start or stop the effect",
      run: "Run",
      stop: "Stop",
      copy: "Copy props",
      copyTitle: "Copy the component's current props as JSON",
      side: "Move the panel to the other side",
      hide: "Hide",
      hideTitle: "Hide the panel (the extension icon or Ctrl+Shift+Y brings it back)",
      component: "Component",
      controls: "Controls",
      reset: "Reset",
      scrub: "Drag or scroll, double-click resets",
      langTitle: "\u041F\u0435\u0440\u0435\u043A\u043B\u044E\u0447\u0438\u0442\u044C \u043D\u0430 \u0440\u0443\u0441\u0441\u043A\u0438\u0439",
      copied: "Copied",
      clipboard: "Clipboard unavailable, the JSON is in the console",
      noFlag: "HTML-in-canvas is off: enable chrome://flags/#canvas-draw-element and restart Chrome. Until then the effect renders without the page content.",
      noWebgl: "WebGL2 is unavailable: check chrome://gpu and \u201CUse hardware acceleration\u201D in Chrome settings, then restart the browser.",
      noFloat: (r) => `The GPU has no float render targets (EXT_color_buffer_float), this effect cannot run here. Renderer: ${r}`,
      nullInstance: (r) => `The effect returned null with working WebGL2 (${r}). Press Run again; if it repeats, the details are in the console (F12).`
    },
    ru: {
      power: "\u0412\u043A\u043B\u044E\u0447\u0438\u0442\u044C \u0438\u043B\u0438 \u0432\u044B\u043A\u043B\u044E\u0447\u0438\u0442\u044C \u044D\u0444\u0444\u0435\u043A\u0442",
      run: "\u0417\u0430\u043F\u0443\u0441\u0442\u0438\u0442\u044C",
      stop: "\u0421\u0442\u043E\u043F",
      copy: "\u041A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u0442\u044C props",
      copyTitle: "\u0421\u043A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0442\u0435\u043A\u0443\u0449\u0438\u0435 props \u043A\u043E\u043C\u043F\u043E\u043D\u0435\u043D\u0442\u0430 \u0432 JSON",
      side: "\u041F\u0435\u0440\u0435\u043D\u0435\u0441\u0442\u0438 \u043F\u0430\u043D\u0435\u043B\u044C \u043D\u0430 \u0434\u0440\u0443\u0433\u0443\u044E \u0441\u0442\u043E\u0440\u043E\u043D\u0443",
      hide: "\u0421\u043A\u0440\u044B\u0442\u044C",
      hideTitle: "\u0421\u043A\u0440\u044B\u0442\u044C \u043F\u0430\u043D\u0435\u043B\u044C (\u0438\u043A\u043E\u043D\u043A\u0430 \u0440\u0430\u0441\u0448\u0438\u0440\u0435\u043D\u0438\u044F \u0438\u043B\u0438 Ctrl+Shift+Y \u0432\u0435\u0440\u043D\u0451\u0442)",
      component: "\u041A\u043E\u043C\u043F\u043E\u043D\u0435\u043D\u0442",
      controls: "\u041D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438",
      reset: "\u0421\u0431\u0440\u043E\u0441",
      scrub: "\u0422\u044F\u043D\u0438 \u043C\u044B\u0448\u044C\u044E \u0438\u043B\u0438 \u043A\u043E\u043B\u0435\u0441\u043E\u043C, \u0434\u0432\u043E\u0439\u043D\u043E\u0439 \u043A\u043B\u0438\u043A \u0441\u0431\u0440\u0430\u0441\u044B\u0432\u0430\u0435\u0442",
      langTitle: "Switch to English",
      copied: "\u0421\u043A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u043D\u043E",
      clipboard: "\u0411\u0443\u0444\u0435\u0440 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D, JSON \u0432 \u043A\u043E\u043D\u0441\u043E\u043B\u0438",
      noFlag: "HTML-in-canvas \u0432\u044B\u043A\u043B\u044E\u0447\u0435\u043D: \u0432\u043A\u043B\u044E\u0447\u0438 chrome://flags/#canvas-draw-element \u0438 \u043F\u0435\u0440\u0435\u0437\u0430\u043F\u0443\u0441\u0442\u0438 Chrome. \u041F\u043E\u043A\u0430 \u044D\u0444\u0444\u0435\u043A\u0442 \u0440\u0438\u0441\u0443\u0435\u0442\u0441\u044F \u0431\u0435\u0437 \u0441\u043E\u0434\u0435\u0440\u0436\u0438\u043C\u043E\u0433\u043E \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u044B.",
      noWebgl: "WebGL2 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D: \u043F\u0440\u043E\u0432\u0435\u0440\u044C chrome://gpu \u0438 \xAB\u0418\u0441\u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u044C \u0430\u043F\u043F\u0430\u0440\u0430\u0442\u043D\u043E\u0435 \u0443\u0441\u043A\u043E\u0440\u0435\u043D\u0438\u0435\xBB \u0432 \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0430\u0445 Chrome, \u0437\u0430\u0442\u0435\u043C \u043F\u0435\u0440\u0435\u0437\u0430\u043F\u0443\u0441\u0442\u0438 \u0431\u0440\u0430\u0443\u0437\u0435\u0440.",
      noFloat: (r) => `GPU \u043D\u0435 \u0434\u0430\u0451\u0442 float-\u0440\u0435\u043D\u0434\u0435\u0440-\u0442\u0430\u0440\u0433\u0435\u0442\u044B (EXT_color_buffer_float), \u044D\u0444\u0444\u0435\u043A\u0442 \u0437\u0434\u0435\u0441\u044C \u043D\u0435 \u0437\u0430\u043F\u0443\u0441\u0442\u0438\u0442\u0441\u044F. Renderer: ${r}`,
      nullInstance: (r) => `\u042D\u0444\u0444\u0435\u043A\u0442 \u0432\u0435\u0440\u043D\u0443\u043B null \u043F\u0440\u0438 \u0440\u0430\u0431\u043E\u0447\u0435\u043C WebGL2 (${r}). \u041D\u0430\u0436\u043C\u0438 Run \u0435\u0449\u0451 \u0440\u0430\u0437; \u0435\u0441\u043B\u0438 \u043F\u043E\u0432\u0442\u043E\u0440\u044F\u0435\u0442\u0441\u044F, \u043F\u043E\u0434\u0440\u043E\u0431\u043D\u043E\u0441\u0442\u0438 \u0432 \u043A\u043E\u043D\u0441\u043E\u043B\u0438 (F12).`
    }
  };
  function createApp() {
    const state = {
      slug: EFFECTS.find((e) => e.slug === "liquid")?.slug ?? EFFECTS[0].slug,
      values: {},
      running: false,
      instance: null,
      error: "",
      panelVisible: true,
      side: "left",
      lang: "en",
      supported: supportsHtmlInCanvas()
    };
    const page = {
      host: null,
      source: null,
      content: null,
      inner: null,
      output: null,
      observer: null,
      prevOverflow: null,
      background: "#ffffff"
    };
    function t(key, ...args) {
      const v = (I18N[state.lang] ?? I18N.en)[key] ?? I18N.en[key];
      return typeof v === "function" ? v(...args) : v;
    }
    function pickBackground() {
      const isClear = (c) => !c || c === "transparent" || c === "rgba(0, 0, 0, 0)";
      const body = getComputedStyle(document.body).backgroundColor;
      const html = getComputedStyle(document.documentElement).backgroundColor;
      if (!isClear(body)) return body;
      if (!isClear(html)) return html;
      return "#ffffff";
    }
    function isOurs(node) {
      return node.nodeType === 1 && node.hasAttribute("data-cua");
    }
    function wrapPage() {
      if (page.host) return;
      const body = document.body;
      const html = document.documentElement;
      const bodyStyle = getComputedStyle(body);
      page.background = pickBackground();
      const host = document.createElement("div");
      host.setAttribute("data-cua", "host");
      host.style.cssText = `position:fixed;inset:0;z-index:${Z_HOST};background:${page.background};overflow:hidden;`;
      const source = document.createElement("canvas");
      source.setAttribute("layoutsubtree", "true");
      source.setAttribute("data-cua", "source");
      source.style.cssText = "position:absolute;inset:0;width:100%;height:100%;";
      const content = document.createElement("div");
      content.setAttribute("data-cua", "content");
      content.style.cssText = "position:relative;width:100%;height:100%;overflow:auto;";
      const inner = document.createElement("div");
      inner.setAttribute("data-cua", "inner");
      inner.style.cssText = `min-height:100%;box-sizing:border-box;position:relative;background:${page.background};`;
      for (const prop of [
        "display",
        "flexDirection",
        "alignItems",
        "justifyContent",
        "gap",
        "font",
        "color",
        "lineHeight",
        "letterSpacing"
      ]) {
        inner.style[prop] = bodyStyle[prop];
      }
      inner.style.padding = bodyStyle.margin === "0px" ? bodyStyle.padding : bodyStyle.margin;
      if (state.supported) {
        source.appendChild(content);
        host.append(source);
      } else {
        source.style.display = "none";
        host.append(source, content);
      }
      content.appendChild(inner);
      const scrollY = window.scrollY;
      const moved = [...body.childNodes].filter((n) => !isOurs(n));
      for (const node of moved) inner.appendChild(node);
      body.appendChild(host);
      page.prevOverflow = [html.style.overflow, body.style.overflow];
      html.style.setProperty("overflow", "hidden", "important");
      body.style.setProperty("overflow", "hidden", "important");
      content.scrollTop = scrollY;
      page.observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
          for (const node of m.addedNodes) {
            if (node.parentNode === body && !isOurs(node)) inner.appendChild(node);
          }
        }
      });
      page.observer.observe(body, { childList: true });
      Object.assign(page, { host, source, content, inner });
      bindScrollForwarding();
    }
    function scrollableFor(target) {
      let el = target instanceof Element ? target : null;
      while (el && el !== page.content) {
        const cs = getComputedStyle(el);
        const y = /(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1;
        const x = /(auto|scroll)/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 1;
        if (y || x) return el;
        el = el.parentElement;
      }
      return page.content;
    }
    function onWheel(e) {
      if (!page.content || e.ctrlKey || e.defaultPrevented) return;
      if (!page.host.contains(e.target) || e.composedPath().includes(ui.panel)) return;
      const el = scrollableFor(e.target);
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? el.clientHeight : 1;
      const before = el.scrollTop + el.scrollLeft;
      el.scrollBy({ top: e.deltaY * unit, left: e.deltaX * unit, behavior: "auto" });
      if (el !== page.content && el.scrollTop + el.scrollLeft === before) {
        page.content.scrollBy({ top: e.deltaY * unit, left: e.deltaX * unit, behavior: "auto" });
      }
      e.preventDefault();
    }
    function onKeyScroll(e) {
      if (!page.content || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      const a = document.activeElement;
      if (a && a !== document.body && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))) return;
      if (e.composedPath().includes(ui.panel)) return;
      const c = page.content;
      const pageStep = c.clientHeight * 0.875;
      const map = {
        ArrowDown: [0, 40],
        ArrowUp: [0, -40],
        ArrowRight: [40, 0],
        ArrowLeft: [-40, 0],
        PageDown: [0, pageStep],
        PageUp: [0, -pageStep],
        " ": [0, e.shiftKey ? -pageStep : pageStep],
        Home: [0, -c.scrollTop],
        End: [0, c.scrollHeight]
      };
      const d = map[e.key];
      if (!d) return;
      c.scrollBy({ left: d[0], top: d[1], behavior: e.key === "Home" || e.key === "End" ? "auto" : "smooth" });
      e.preventDefault();
    }
    let scrollBound = false;
    function bindScrollForwarding() {
      if (scrollBound) return;
      scrollBound = true;
      window.addEventListener("wheel", onWheel, { passive: false, capture: true });
      window.addEventListener("keydown", onKeyScroll, { capture: true });
    }
    function unbindScrollForwarding() {
      if (!scrollBound) return;
      scrollBound = false;
      window.removeEventListener("wheel", onWheel, { capture: true });
      window.removeEventListener("keydown", onKeyScroll, { capture: true });
    }
    function unwrapPage() {
      if (!page.host) return;
      page.observer?.disconnect();
      unbindScrollForwarding();
      const body = document.body;
      const html = document.documentElement;
      const scrollY = page.content.scrollTop;
      for (const node of [...page.inner.childNodes]) body.insertBefore(node, page.host);
      page.host.remove();
      html.style.overflow = page.prevOverflow[0];
      body.style.overflow = page.prevOverflow[1];
      window.scrollTo(0, scrollY);
      Object.assign(page, {
        host: null,
        source: null,
        content: null,
        inner: null,
        output: null,
        observer: null
      });
    }
    function releaseContext(canvas) {
      if (!canvas) return;
      for (const type of ["webgl2", "webgl"]) {
        try {
          canvas.getContext(type)?.getExtension("WEBGL_lose_context")?.loseContext();
        } catch {
        }
      }
    }
    function diagnose() {
      const probe = document.createElement("canvas");
      let gl = null;
      try {
        gl = probe.getContext("webgl2");
      } catch {
      }
      if (!gl) {
        return t("noWebgl");
      }
      const floatTargets = Boolean(
        gl.getExtension("EXT_color_buffer_float") || gl.getExtension("EXT_color_buffer_half_float")
      );
      const renderer = (() => {
        try {
          const info = gl.getExtension("WEBGL_debug_renderer_info");
          return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
        } catch {
          return "";
        }
      })();
      releaseContext(probe);
      if (!floatTargets) {
        return t("noFloat", renderer);
      }
      return t("nullInstance", renderer);
    }
    function freshOutput() {
      releaseContext(page.output);
      page.output?.remove();
      const output = document.createElement("canvas");
      output.setAttribute("data-cua", "output");
      output.setAttribute("aria-hidden", "true");
      output.style.cssText = "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;";
      page.host.appendChild(output);
      page.output = output;
      return output;
    }
    const currentDef = () => EFFECTS.find((e) => e.slug === state.slug) ?? EFFECTS[0];
    function currentValues() {
      const def = currentDef();
      if (!state.values[def.slug]) state.values[def.slug] = schemaDefaults(def.controls);
      return state.values[def.slug];
    }
    function context() {
      return { background: page.background, supported: state.supported };
    }
    function startEffect() {
      stopEffect(false);
      wrapPage();
      const def = currentDef();
      const output = freshOutput();
      const elements = { source: page.source, content: page.content, output };
      let instance = null;
      state.error = "";
      try {
        instance = def.create(elements, def.toOptions(currentValues(), context()));
      } catch (error) {
        console.error("[canvasui-anywhere]", error);
        state.error = String(error?.message ?? error);
      }
      if (!instance && !state.error) {
        state.error = diagnose();
        console.warn("[canvasui-anywhere]", def.slug, "create() returned null:", state.error);
      }
      if (!instance) {
        releaseContext(output);
        output.remove();
        page.output = null;
      }
      state.instance = instance;
      state.running = Boolean(instance);
      renderStatus();
    }
    function stopEffect(unwrap = true) {
      if (state.instance) {
        try {
          state.instance.destroy();
        } catch {
        }
      }
      state.instance = null;
      state.running = false;
      releaseContext(page.output);
      if (unwrap) unwrapPage();
      renderStatus();
    }
    function pushOptions() {
      if (!state.instance) return;
      const def = currentDef();
      try {
        state.instance.setOptions(def.toOptions(currentValues(), context()));
      } catch (error) {
        console.error("[canvasui-anywhere] setOptions", error);
      }
    }
    async function load() {
      try {
        const raw = (await chrome.storage.local.get(STORAGE_KEY))[STORAGE_KEY];
        if (!raw) return;
        if (raw.slug && EFFECTS.some((e) => e.slug === raw.slug)) state.slug = raw.slug;
        if (raw.values) {
          for (const def of EFFECTS) {
            const saved = raw.values[def.slug];
            if (!saved) continue;
            state.values[def.slug] = { ...schemaDefaults(def.controls), ...saved };
          }
        }
        if (raw.side === "left" || raw.side === "right") state.side = raw.side;
        if (raw.lang === "en" || raw.lang === "ru") state.lang = raw.lang;
      } catch {
      }
    }
    let saveTimer = 0;
    function save() {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        try {
          chrome.storage.local.set({
            [STORAGE_KEY]: { slug: state.slug, values: state.values, side: state.side, lang: state.lang }
          });
        } catch {
        }
      }, 150);
    }
    const panelHost = document.createElement("div");
    panelHost.setAttribute("data-cua", "panel");
    panelHost.style.cssText = `position:fixed;top:0;left:0;z-index:${Z_PANEL};width:0;height:0;`;
    const shadow = panelHost.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = PANEL_CSS;
    shadow.appendChild(style);
    const root = document.createElement("aside");
    root.className = "panel";
    shadow.appendChild(root);
    document.body.appendChild(panelHost);
    const ui = {};
    let rows = [];
    function h(tag, attrs = {}, ...children) {
      const el = document.createElement(tag);
      for (const [k, v] of Object.entries(attrs)) {
        if (k === "class") el.className = v;
        else if (k === "text") el.textContent = v;
        else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
        else if (v !== void 0 && v !== null) el.setAttribute(k, v);
      }
      for (const c of children) if (c) el.append(c);
      return el;
    }
    function buildPanel() {
      root.innerHTML = "";
      root.classList.toggle("right", state.side === "right");
      root.lang = state.lang;
      const def = currentDef();
      ui.power = h("button", {
        class: "power",
        type: "button",
        title: t("power"),
        onclick: () => state.running ? stopEffect() : startEffect()
      });
      const header = h(
        "div",
        { class: "head" },
        h("div", { class: "brand" }, h("span", { class: "logo" }), h("span", { text: "Canvas UI" })),
        h(
          "div",
          { class: "head-right" },
          h("span", { class: "tag", text: "Anywhere" }),
          h("button", {
            class: "lang",
            type: "button",
            text: "en \u21C4 \u0440\u0443",
            title: t("langTitle"),
            "aria-label": t("langTitle"),
            onclick: () => {
              state.lang = state.lang === "en" ? "ru" : "en";
              save();
              buildPanel();
            }
          })
        )
      );
      ui.select = h("select", {
        class: "select",
        onchange: (e) => selectEffect(e.target.value)
      });
      for (const e of EFFECTS) {
        const opt = h("option", { value: e.slug, text: e.name });
        if (e.slug === def.slug) opt.selected = true;
        ui.select.appendChild(opt);
      }
      ui.desc = h("p", { class: "desc", text: def.description });
      const picker = h(
        "div",
        { class: "section" },
        h("p", { class: "label", text: t("component") }),
        h("div", { class: "card" }, ui.select, ui.desc)
      );
      const actions = h(
        "div",
        { class: "actions" },
        ui.power,
        h("button", {
          class: "btn",
          type: "button",
          text: t("copy"),
          title: t("copyTitle"),
          onclick: copyProps
        }),
        h("button", {
          class: "btn",
          type: "button",
          text: state.side === "left" ? "\u2192" : "\u2190",
          title: t("side"),
          onclick: () => {
            state.side = state.side === "left" ? "right" : "left";
            save();
            buildPanel();
          }
        }),
        h("button", {
          class: "btn",
          type: "button",
          text: t("hide"),
          title: t("hideTitle"),
          onclick: () => setPanelVisible(false)
        })
      );
      ui.reset = h("button", {
        class: "reset",
        type: "button",
        text: t("reset"),
        onclick: () => {
          state.values[def.slug] = schemaDefaults(def.controls);
          save();
          pushOptions();
          refreshRows();
        }
      });
      const controlsHead = h(
        "div",
        { class: "controls-head" },
        h("p", { class: "label", text: t("controls") }),
        ui.reset
      );
      ui.list = h("div", { class: "rows" });
      rows = Object.entries(def.controls).map(([key, control]) => buildRow(key, control));
      for (const row of rows) if (row.el) ui.list.appendChild(row.el);
      ui.status = h("div", { class: "status" });
      const scroll = h("div", { class: "scroll" }, controlsHead, ui.list);
      root.append(header, picker, actions, scroll, ui.status);
      refreshRows();
      renderStatus();
    }
    function clamp(control, value) {
      return Number(Math.min(control.max, Math.max(control.min, value)).toFixed(6));
    }
    function buildRow(key, control) {
      const def = currentDef();
      const set = (value) => {
        state.values[def.slug][key] = value;
        save();
        pushOptions();
        refreshRows();
      };
      if (control.kind === "scrub") {
        const fill = h("span", { class: "fill" });
        const label = h("span", { class: "scrub-label", text: control.label });
        const value = h("span", { class: "scrub-value" });
        const el = h(
          "div",
          { class: "row scrub", title: t("scrub") },
          fill,
          label,
          value
        );
        const span = control.max - control.min;
        const fromX = (clientX) => {
          const r = el.getBoundingClientRect();
          const t2 = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
          const raw = control.min + t2 * span;
          return clamp(control, Math.round(raw / control.step) * control.step);
        };
        el.addEventListener("pointerdown", (e) => {
          if (e.button !== 0) return;
          try {
            el.setPointerCapture(e.pointerId);
          } catch {
          }
          el.classList.add("dragging");
          set(fromX(e.clientX));
        });
        el.addEventListener("pointermove", (e) => {
          if (!el.classList.contains("dragging")) return;
          set(fromX(e.clientX));
        });
        const end = (e) => {
          el.classList.remove("dragging");
          try {
            el.releasePointerCapture(e.pointerId);
          } catch {
          }
        };
        el.addEventListener("pointerup", end);
        el.addEventListener("pointercancel", end);
        el.addEventListener("dblclick", () => set(control.defaultValue));
        el.addEventListener(
          "wheel",
          (e) => {
            e.preventDefault();
            const v = state.values[def.slug][key];
            set(clamp(control, v + (e.deltaY < 0 ? control.step : -control.step)));
          },
          { passive: false }
        );
        return {
          el,
          control,
          update(values) {
            const v = values[key];
            fill.style.width = `${(v - control.min) / span * 100}%`;
            value.textContent = Number(v).toFixed(control.decimals);
          }
        };
      }
      if (control.kind === "radio") {
        const buttons = control.options.map(
          (o) => h("button", { class: "seg", type: "button", text: o.label, onclick: () => set(o.value) })
        );
        const el = h(
          "div",
          { class: "row radio" },
          control.label ? h("span", { class: "row-label", text: control.label }) : null,
          h("div", { class: "seg-group" }, ...buttons)
        );
        return {
          el,
          control,
          update(values) {
            buttons.forEach(
              (b, i) => b.classList.toggle("active", control.options[i].value === values[key])
            );
          }
        };
      }
      if (control.kind === "toggle") {
        const knob = h("span", { class: "switch" });
        const el = h(
          "div",
          { class: "row toggle", onclick: () => set(!state.values[def.slug][key]) },
          h("span", { class: "row-label", text: control.label }),
          knob
        );
        return {
          el,
          control,
          update(values) {
            knob.classList.toggle("on", Boolean(values[key]));
          }
        };
      }
      if (control.kind === "color") {
        const input = h("input", {
          type: "color",
          class: "color-input",
          oninput: (e) => set(e.target.value.toLowerCase())
        });
        const hex = h("span", { class: "hex" });
        const swatch = h("label", { class: "swatch" }, input);
        const autoBtn = control.auto ? h("button", {
          class: "seg auto",
          type: "button",
          text: control.auto.label,
          onclick: () => set(control.defaultValue)
        }) : null;
        const el = h(
          "div",
          { class: "row color" },
          h("span", { class: "row-label", text: control.label }),
          h("div", { class: "color-right" }, autoBtn, hex, swatch)
        );
        return {
          el,
          control,
          update(values) {
            const v = values[key];
            const isAuto = Boolean(control.auto) && v === control.defaultValue;
            hex.textContent = isAuto ? "" : v;
            if (!isAuto) input.value = v;
            swatch.style.background = isAuto ? control.auto.swatch : v;
            if (autoBtn) autoBtn.classList.toggle("active", isAuto);
          }
        };
      }
      return { el: null, control, update() {
      } };
    }
    function refreshRows() {
      const values = currentValues();
      const def = currentDef();
      for (const row of rows) {
        if (!row.el) continue;
        row.el.hidden = !isVisible(row.control, values);
        row.update(values);
      }
      const defaults = schemaDefaults(def.controls);
      ui.reset.disabled = Object.keys(defaults).every((k) => values[k] === defaults[k]);
    }
    function renderStatus() {
      if (!ui.power) return;
      ui.power.textContent = state.running ? t("stop") : t("run");
      ui.power.classList.toggle("on", state.running);
      const parts = [];
      if (!state.supported) {
        parts.push(t("noFlag"));
      }
      if (state.error) parts.push(state.error);
      ui.status.textContent = parts.join(" ");
      ui.status.hidden = parts.length === 0;
      ui.status.classList.toggle("warn", !state.supported);
    }
    function selectEffect(slug) {
      if (!EFFECTS.some((e) => e.slug === slug)) return;
      const wasRunning = state.running;
      if (wasRunning) stopEffect(false);
      state.slug = slug;
      save();
      buildPanel();
      if (wasRunning) startEffect();
    }
    async function copyProps() {
      const def = currentDef();
      const props = def.toOptions(currentValues(), context());
      const text = JSON.stringify({ component: def.component ?? def.name, props }, null, 2);
      try {
        await navigator.clipboard.writeText(text);
        flash(t("copied"));
      } catch {
        console.log(text);
        flash(t("clipboard"));
      }
    }
    function flash(message) {
      const prev = ui.status.textContent;
      const prevHidden = ui.status.hidden;
      ui.status.hidden = false;
      ui.status.textContent = message;
      setTimeout(() => {
        ui.status.textContent = prev;
        ui.status.hidden = prevHidden;
      }, 1400);
    }
    function setPanelVisible(visible) {
      state.panelVisible = visible;
      panelHost.style.display = visible ? "" : "none";
    }
    function togglePanel() {
      setPanelVisible(!state.panelVisible);
    }
    try {
      chrome.runtime.onMessage.addListener((message) => {
        if (message?.type === "cua:toggle") togglePanel();
      });
    } catch {
    }
    load().then(() => {
      buildPanel();
      startEffect();
    });
    return { togglePanel, startEffect, stopEffect, selectEffect, state, page };
  }
})();
