// Стили панели, повторяют сайдбар плейграунда canvasui.dev.
export const PANEL_CSS = `
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
