// Нарисованный курсор для записей и скриншотов: системный курсор в screencast и screenshot не попадает.
// Элемент висит на <html>, а не в <body>, поэтому обёртка расширения его не трогает и эффект его не искажает.
const CURSOR_ID = "cua-demo-cursor";

export async function installCursor(page, x = 0, y = 0) {
  await page.evaluate(
    (id, x, y) => {
      document.getElementById(id)?.remove();
      const el = document.createElement("div");
      el.id = id;
      el.innerHTML = `<div class="ring"></div><svg width="30" height="36" viewBox="0 0 30 36" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 2.5 L3 27 L9.6 20.8 L14.2 31.2 L18.6 29.3 L14 19.2 L23 19.2 Z" fill="#111" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></svg>`;
      const style = document.createElement("style");
      style.textContent = `#${id}{position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;transform:translate(${x}px,${y}px);will-change:transform;inset:0 auto auto 0;margin:0;padding:0;border:0;width:0;height:0;overflow:visible;background:transparent}
#${id}:popover-open{display:block}
#${id} svg{position:absolute;left:-3px;top:-2px;filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))}
#${id} .ring{position:absolute;left:-14px;top:-14px;width:28px;height:28px;border-radius:50%;background:rgba(219,48,61,.22);border:2px solid rgba(219,48,61,.7);opacity:0;transform:scale(.6);transition:opacity .12s,transform .12s}
#${id}.down .ring{opacity:1;transform:scale(1)}`;
      el.appendChild(style);
      document.documentElement.appendChild(el);
      // top layer: иначе курсор прячется под раскрытым списком (picker) и диалогами
      try {
        el.popover = "manual";
        el.showPopover();
      } catch {}
    },
    CURSOR_ID,
    x,
    y,
  );
}

async function place(page, x, y) {
  await page
    .evaluate(
      (id, x, y) => {
        const el = document.getElementById(id);
        if (el) el.style.transform = `translate(${x}px,${y}px)`;
      },
      CURSOR_ID,
      x,
      y,
    )
    .catch(() => {});
}

/** Двигает мышь и курсор; steps > 1 даёт плавный путь с обновлением курсора на каждом шаге. */
export async function moveTo(page, x, y, { steps = 1, from = null } = {}) {
  if (steps > 1 && from) {
    for (let i = 1; i <= steps; i++) {
      const px = from.x + ((x - from.x) * i) / steps;
      const py = from.y + ((y - from.y) * i) / steps;
      await page.mouse.move(px, py).catch(() => {});
      await place(page, px, py);
    }
  } else {
    await page.mouse.move(x, y, { steps }).catch(() => {});
    await place(page, x, y);
  }
  return { x, y };
}

export async function setPressed(page, down) {
  await page
    .evaluate(
      (id, down) => document.getElementById(id)?.classList.toggle("down", down),
      CURSOR_ID,
      down,
    )
    .catch(() => {});
}

/** Настоящий клик мышью с анимацией нажатия на курсоре. */
export async function clickAt(page, x, y, { hold = 140 } = {}) {
  await page.mouse.move(x, y).catch(() => {});
  await place(page, x, y);
  await setPressed(page, true);
  await page.mouse.down().catch(() => {});
  await new Promise((r) => setTimeout(r, hold));
  await page.mouse.up().catch(() => {});
  await setPressed(page, false);
}

/** Поднять курсор поверх только что открытого top-layer элемента (выпадающий список, диалог). */
export async function raiseCursor(page) {
  await page
    .evaluate((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      try {
        el.hidePopover();
        el.showPopover();
      } catch {}
    }, CURSOR_ID)
    .catch(() => {});
}
