import { EFFECTS } from "./effects/index.js";
import { isVisible, schemaDefaults } from "./controls.js";
import { supportsHtmlInCanvas } from "./vendor/lib/Liquid/LiquidVanilla.ts";
import { PANEL_CSS } from "./panel.css.js";

const STORAGE_KEY = "cua:v1";
const Z_HOST = 2147483000;
const Z_PANEL = 2147483001;

if (window.__cuaApp) {
  window.__cuaApp.togglePanel();
} else {
  window.__cuaApp = createApp();
}

// Панель по умолчанию на английском, русский переключателем (как каталог apps.aimindset.org).
const I18N = {
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
    langTitle: "Переключить на русский",
    copied: "Copied",
    clipboard: "Clipboard unavailable, the JSON is in the console",
    noFlag:
      "HTML-in-canvas is off: enable chrome://flags/#canvas-draw-element and restart Chrome. Until then the effect renders without the page content.",
    noWebgl:
      "WebGL2 is unavailable: check chrome://gpu and “Use hardware acceleration” in Chrome settings, then restart the browser.",
    noFloat: (r) =>
      `The GPU has no float render targets (EXT_color_buffer_float), this effect cannot run here. Renderer: ${r}`,
    nullInstance: (r) =>
      `The effect returned null with working WebGL2 (${r}). Press Run again; if it repeats, the details are in the console (F12).`,
  },
  ru: {
    power: "Включить или выключить эффект",
    run: "Запустить",
    stop: "Стоп",
    copy: "Копировать props",
    copyTitle: "Скопировать текущие props компонента в JSON",
    side: "Перенести панель на другую сторону",
    hide: "Скрыть",
    hideTitle: "Скрыть панель (иконка расширения или Ctrl+Shift+Y вернёт)",
    component: "Компонент",
    controls: "Настройки",
    reset: "Сброс",
    scrub: "Тяни мышью или колесом, двойной клик сбрасывает",
    langTitle: "Switch to English",
    copied: "Скопировано",
    clipboard: "Буфер недоступен, JSON в консоли",
    noFlag:
      "HTML-in-canvas выключен: включи chrome://flags/#canvas-draw-element и перезапусти Chrome. Пока эффект рисуется без содержимого страницы.",
    noWebgl:
      "WebGL2 недоступен: проверь chrome://gpu и «Использовать аппаратное ускорение» в настройках Chrome, затем перезапусти браузер.",
    noFloat: (r) =>
      `GPU не даёт float-рендер-таргеты (EXT_color_buffer_float), эффект здесь не запустится. Renderer: ${r}`,
    nullInstance: (r) =>
      `Эффект вернул null при рабочем WebGL2 (${r}). Нажми Run ещё раз; если повторяется, подробности в консоли (F12).`,
  },
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
    supported: supportsHtmlInCanvas(),
  };

  // ------------------------------------------------------------ page wrap
  // Библиотека рисует страницу через <canvas layoutsubtree>, поэтому всё
  // содержимое body переезжает внутрь такого canvas, а поверх ложится
  // output-canvas с pointer-events:none. При выключении всё возвращается.
  const page = {
    host: null,
    source: null,
    content: null,
    inner: null,
    output: null,
    observer: null,
    prevOverflow: null,
    background: "#ffffff",
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
      "letterSpacing",
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

    // Порталы и модалки, которые сайт добавит в body позже, тоже уезжают внутрь.
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

  // В Chrome 154 колесо и клавиши доходят до элементов внутри обёртки,
  // но сам контейнер при этом не прокручивается (прокрутка внутри
  // layoutsubtree не доезжает до композитора). Крутим руками: ближайший
  // прокручиваемый предок цели, иначе контейнер страницы.
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
      ArrowDown: [0, 40], ArrowUp: [0, -40], ArrowRight: [40, 0], ArrowLeft: [-40, 0],
      PageDown: [0, pageStep], PageUp: [0, -pageStep],
      " ": [0, e.shiftKey ? -pageStep : pageStep],
      Home: [0, -c.scrollTop], End: [0, c.scrollHeight],
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
      observer: null,
    });
  }

  // У каждого эффекта свой WebGL-контекст, поэтому output-canvas пересоздаётся.
  // Движки не освобождают WebGL-контекст в destroy(), а у Chrome лимит
  // ~16 живых контекстов на страницу: без loseContext после серии
  // переключений getContext начинает возвращать null.
  function releaseContext(canvas) {
    if (!canvas) return;
    for (const type of ["webgl2", "webgl"]) {
      try {
        canvas.getContext(type)?.getExtension("WEBGL_lose_context")?.loseContext();
      } catch {}
    }
  }

  function diagnose() {
    const probe = document.createElement("canvas");
    let gl = null;
    try {
      gl = probe.getContext("webgl2");
    } catch {}
    if (!gl) {
      return t("noWebgl");
    }
    const floatTargets = Boolean(
      gl.getExtension("EXT_color_buffer_float") ||
        gl.getExtension("EXT_color_buffer_half_float"),
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
    output.style.cssText =
      "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;";
    page.host.appendChild(output);
    page.output = output;
    return output;
  }

  // ---------------------------------------------------------- effect run
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
      } catch {}
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

  // -------------------------------------------------------------- storage
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
    } catch {}
  }

  let saveTimer = 0;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        chrome.storage.local.set({
          [STORAGE_KEY]: { slug: state.slug, values: state.values, side: state.side, lang: state.lang },
        });
      } catch {}
    }, 150);
  }

  // ---------------------------------------------------------------- panel
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
      else if (v !== undefined && v !== null) el.setAttribute(k, v);
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
      onclick: () => (state.running ? stopEffect() : startEffect()),
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
          text: "en ⇄ ру",
          title: t("langTitle"),
          "aria-label": t("langTitle"),
          onclick: () => {
            state.lang = state.lang === "en" ? "ru" : "en";
            save();
            buildPanel();
          },
        }),
      ),
    );

    ui.select = h("select", {
      class: "select",
      onchange: (e) => selectEffect(e.target.value),
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
      h("div", { class: "card" }, ui.select, ui.desc),
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
        onclick: copyProps,
      }),
      h("button", {
        class: "btn",
        type: "button",
        text: state.side === "left" ? "→" : "←",
        title: t("side"),
        onclick: () => {
          state.side = state.side === "left" ? "right" : "left";
          save();
          buildPanel();
        },
      }),
      h("button", {
        class: "btn",
        type: "button",
        text: t("hide"),
        title: t("hideTitle"),
        onclick: () => setPanelVisible(false),
      }),
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
      },
    });
    const controlsHead = h(
      "div",
      { class: "controls-head" },
      h("p", { class: "label", text: t("controls") }),
      ui.reset,
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
        value,
      );
      const span = control.max - control.min;
      const fromX = (clientX) => {
        const r = el.getBoundingClientRect();
        const t = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
        const raw = control.min + t * span;
        return clamp(control, Math.round(raw / control.step) * control.step);
      };
      el.addEventListener("pointerdown", (e) => {
        if (e.button !== 0) return;
        try {
          el.setPointerCapture(e.pointerId);
        } catch {}
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
        } catch {}
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
        { passive: false },
      );
      return {
        el,
        control,
        update(values) {
          const v = values[key];
          fill.style.width = `${((v - control.min) / span) * 100}%`;
          value.textContent = Number(v).toFixed(control.decimals);
        },
      };
    }

    if (control.kind === "radio") {
      const buttons = control.options.map((o) =>
        h("button", { class: "seg", type: "button", text: o.label, onclick: () => set(o.value) }),
      );
      const el = h(
        "div",
        { class: "row radio" },
        control.label ? h("span", { class: "row-label", text: control.label }) : null,
        h("div", { class: "seg-group" }, ...buttons),
      );
      return {
        el,
        control,
        update(values) {
          buttons.forEach((b, i) =>
            b.classList.toggle("active", control.options[i].value === values[key]),
          );
        },
      };
    }

    if (control.kind === "toggle") {
      const knob = h("span", { class: "switch" });
      const el = h(
        "div",
        { class: "row toggle", onclick: () => set(!state.values[def.slug][key]) },
        h("span", { class: "row-label", text: control.label }),
        knob,
      );
      return {
        el,
        control,
        update(values) {
          knob.classList.toggle("on", Boolean(values[key]));
        },
      };
    }

    if (control.kind === "color") {
      const input = h("input", {
        type: "color",
        class: "color-input",
        oninput: (e) => set(e.target.value.toLowerCase()),
      });
      const hex = h("span", { class: "hex" });
      const swatch = h("label", { class: "swatch" }, input);
      const autoBtn = control.auto
        ? h("button", {
            class: "seg auto",
            type: "button",
            text: control.auto.label,
            onclick: () => set(control.defaultValue),
          })
        : null;
      const el = h(
        "div",
        { class: "row color" },
        h("span", { class: "row-label", text: control.label }),
        h("div", { class: "color-right" }, autoBtn, hex, swatch),
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
        },
      };
    }

    return { el: null, control, update() {} };
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

  // ---------------------------------------------------------------- init
  try {
    chrome.runtime.onMessage.addListener((message) => {
      if (message?.type === "cua:toggle") togglePanel();
    });
  } catch {}

  load().then(() => {
    buildPanel();
    startEffect();
  });

  return { togglePanel, startEffect, stopEffect, selectEffect, state, page };
}
