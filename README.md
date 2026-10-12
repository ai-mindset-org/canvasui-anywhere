# Canvas UI Anywhere

**EN.** A Chrome extension that runs the [canvasui.dev](https://canvasui.dev/playground) playground over any live page: pick one of the 28 effects, tune it with the playground's own sliders, copy the props as JSON for your agent. Install: enable `chrome://flags/#canvas-draw-element`, clone this repository, open `chrome://extensions`, turn on Developer mode, press Load unpacked and choose the `dist/` folder. Product page: [apps.aimindset.org/canvas-ui-anywhere](https://apps.aimindset.org/canvas-ui-anywhere/). Chrome Web Store listing is in review. MIT for the panel and wrapper; the engines keep canvas-ui's MIT + Commons Clause.

Chrome-расширение, которое повторяет плейграунд [canvasui.dev/playground](https://canvasui.dev/playground) поверх любого сайта: выбираешь эффект, крутишь те же настройки, что в плейграунде, и смотришь, как он выглядит на конкретной странице.

Внутри – vanilla-движки библиотеки [canvas-ui](https://github.com/DavidHDev/canvas-ui) (MIT + Commons Clause, `src/vendor/LICENSE.md`) без изменений; панель и обёртка страницы – свои.

## Как это работает

Библиотека рисует живую страницу через экспериментальный API HTML-in-canvas: содержимое кладётся внутрь `<canvas layoutsubtree>`, а WebGL-эффект берёт его как текстуру и рисует поверх. Расширение при запуске переносит всё содержимое `body` внутрь такого canvas, накрывает output-canvas с `pointer-events: none` и возвращает всё на место по Stop.

Для API нужен Chrome с флагом:

```text
chrome://flags/#canvas-draw-element
```

Включить, перезапустить Chrome. Без флага расширение работает, но эффект не видит содержимое страницы (панель предупредит).

## Установка

Собранное расширение лежит в репозитории, папка `dist/`:

```bash
git clone https://github.com/ai-mindset-org/canvasui-anywhere.git
```

Дальше `chrome://extensions` → «Режим разработчика» → «Загрузить распакованное расширение» → папка `dist/` из клона. Обновление: `git pull`, затем кнопка «Обновить» на `chrome://extensions`.

Пересобрать из исходников:

```bash
npm install
npm run build
```

Сборка кладёт рядом релиз: `release/Canvas-UI-Anywhere-<версия>-chrome.zip` (папка `canvas-ui-anywhere/` внутри) и `release/SHA256SUMS.txt` в формате витрины apps.aimindset.org, плюс `release/Canvas-UI-Anywhere-<версия>-webstore.zip` с manifest в корне архива для Chrome Web Store.

## Использование

Панель на английском, кнопка `en ⇄ ру` переключает на русский; выбор запоминается вместе с настройками эффектов. Имена эффектов и контролов остаются английскими, как в библиотеке.


- клик по иконке расширения или `Ctrl+Shift+Y` – показать / скрыть панель на текущей вкладке
- `Run` / `Stop` – включить эффект на странице или вернуть страницу как было
- `Copy props` – JSON с именем компонента и текущими props, чтобы перенести настройку в код
- `→` / `←` – перенести панель на другую сторону экрана
- слайдеры тянутся мышью и колесом, двойной клик сбрасывает к дефолту
- настройки каждого эффекта и последний выбранный эффект запоминаются в `chrome.storage`

## Эффекты

28 штук, те же, что в плейграунде: Asciify, Bend, Blaze, Bubble, Canvas, Cloth, Clouds, Decrypt Reveal, Displacement, Droplets, Flame Wrap, Force Field, Frost, Glass, Glitch, Glyph Rain, Grid, Hex Float, Laser, Liquid, Magnify, Particle Reveal, Particle Scroll, Peel, Retro Dither, Ripple, Shatter, VHS.

Отличия от плейграунда: Peel в плейграунде открывает под страницей второй макет, здесь под листом пусто; Flame Wrap обёрнут вокруг всего окна, а не карточки; Decrypt Reveal, Shatter и Particle Reveal берут фон страницы из `body`.

## Что важно знать

- Страница внутри обёртки скроллится своим контейнером, а не `window`: скрипты сайта, завязанные на `window.scrollY`, на время эффекта перестают реагировать на прокрутку.
- Модалки и порталы, которые сайт добавляет в `body` во время работы эффекта, автоматически переезжают внутрь обёртки.
- Iframe при переносе в обёртку перезагружаются (так устроен DOM).
- Картинки с чужого домена (CDN, другой хост) и кросс-доменные iframe под эффектом пустые: HTML-in-canvas по правилу приватности рисует только same-origin содержимое. Текст, вёрстка и свои картинки рендерятся целиком. Для скриншотов и демо брать страницы, где картинки отдаются с того же домена (`scripts/probe-pages.mjs` помогает выбрать).
- Эффектов с 3D-объектами (ASCII Object, Glass Object и др.) нет: они рисуют модель, а не страницу. ASCII Sweep не включён: ему нужны две панели содержимого.

## Разработка

```text
src/
  manifest.json      MV3-манифест
  background.js      клик по иконке / хоткей → инжект content.js
  content.js         обёртка страницы, запуск эффектов, панель (Shadow DOM)
  panel.css.js       стили панели
  controls.js        схема контролов, один в один с control-schema.ts библиотеки
  effects/<slug>.js  перенос демо плейграунда: контролы + маппинг в options
  effects/index.js   реестр эффектов
  vendor/lib/        vanilla-движки canvas-ui (WebGL), без правок
scripts/
  build.mjs          esbuild → dist/ (+ иконки)
  zip.mjs            упаковщик релиза без зависимостей
  site-apply.mjs     правки lab-sites для карточки на apps.aimindset.org (воксель, знак, каталог)
  site-assets.mjs    ассеты страницы: social.png, фавиконки, снимки в jpg, zip и суммы
  panel-shot.mjs     скриншоты панели EN/RU на живой странице
  probe-pages.mjs    проба страниц под скриншоты: несколько сайтов × эффектов в scripts/out/probe/
  demo-video.mjs     демо-ролик: кадры CDP-screencast с реальными таймстемпами поверх сайта, заставка, подписи и сборка ffmpeg;
                     эффекты переключаются через меню панели, список рисуется в странице (appearance: base-select)
  lib/cursor.mjs     нарисованный курсор для записей и скриншотов (системный в кадр не попадает); живёт в top layer, raiseCursor поднимает его над открытым списком
  store-assets.mjs   ассеты листинга Chrome Web Store: скриншоты 1280×800, промо 440×280, marquee 1400×560
  smoke.mjs          дымовой прогон в системном Chrome с флагом и скриншотом
```

Дымовой прогон (нужен глобальный puppeteer, Chrome в Program Files):

```bash
node scripts/smoke.mjs https://example.com liquid --system-chrome
```

Скриншот ложится в `scripts/out/`. Брендовый Chrome 137+ не принимает `--load-extension`, поэтому скрипт ставит распакованное расширение через CDP, а если не выходит, подмешивает `content.js` прямо в страницу.

Обновить движки из upstream: склонировать `DavidHDev/canvas-ui`, скопировать `src/lib/<Name>/*.ts` и общие `src/lib/{canvas-viewport,html-in-canvas,rect-cache,utils}.ts` в `src/vendor/lib/`, сверить `CONTROLS` в `src/demos/*-demo.tsx` с `src/effects/*.js`. Текущая копия – upstream a04a99b (2026-10-03): в Chrome 154 клики внутри обёрнутой страницы работают только с синхронизацией геометрии (`updateElementGeometry`), старые движки её не делали.

## Chrome Web Store

Всё для кабинета разработчика лежит в `store/`: `LISTING.md` с текстами, обоснованиями разрешений, шагами подачи и журналом ревью, скриншоты и промо из `node scripts/store-assets.mjs`. В Store грузится `release/Canvas-UI-Anywhere-<версия>-webstore.zip`. Состояние: подано 12.10.2026, ревью идёт; до одобрения установка только распакованной папкой из репозитория. Политика приватности – `https://apps.aimindset.org/canvas-ui-anywhere/privacy.html` (в lab-sites рядом со страницей продукта).

## Витрина apps.aimindset.org

Страница продукта живёт в `ai-mindset-org/lab-sites`, `sites/apps/canvas-ui-anywhere/`. Обновление версии: `npm run build`, затем в чекауте lab-sites (обязательно LF: `git config core.autocrlf false`, иначе плывут хеши receipt; при sparse-checkout сначала `git sparse-checkout disable`):

```bash
node scripts/site-apply.mjs <lab-sites>
node scripts/site-assets.mjs <lab-sites>/sites/apps/canvas-ui-anywhere
cd <lab-sites>/internal-sites/aim-product-system && node build-voxels.mjs --swift && node build-marks.mjs && node build-mini-apps.mjs && node build-catalog.mjs && node check.mjs
```

Версию и запись о релизе обновить в `site-apply.mjs`, `release-notes.txt` и в тексте кнопки github в `index.html`; zip на витрину не кладётся, установка идёт из репозитория. Пушит в `sites/apps/` координатор витрины, изменения идут PR.
