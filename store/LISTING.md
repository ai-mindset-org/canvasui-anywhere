# Chrome Web Store – листинг Canvas UI Anywhere 0.1.0

Всё, что вводится в Developer Dashboard, лежит здесь готовыми блоками. Файлы рядом: `../release/Canvas-UI-Anywhere-0.1.0-webstore.zip` (manifest в корне архива, это и грузится в Store), `screenshots/01…05.jpg` (1280×800), `promo-440x280.png`, `marquee-1400x560.png`, `icon-128.png`. Пересобрать: `npm run build`, затем `node scripts/store-assets.mjs https://developer.chrome.com/ --effects=shatter,frost,decrypt-reveal,magnify,particle-reveal`. Демо-ролик для YouTube (поле Global promo video) и показа: `node scripts/demo-video.mjs https://www.apple.com/` → `store/demo/canvas-ui-anywhere-demo.mp4`, 1600×900, около 61 с, с курсором и подписями; весь список из 28 эффектов виден в раскрытом меню панели, дальше каждый эффект выбирается из меню. Сжатая копия для чатов `canvas-ui-anywhere-demo-web.mp4` (crf 24).

## Шаги в кабинете

1. https://chrome.google.com/webstore/devconsole – войти Google-аккаунтом, от которого будет публикация. Разовая регистрация разработчика $5 (карта), подтверждение почты.
2. Account → заполнить публичный email разработчика и подтвердить его (без этого кнопка Submit неактивна). Контакт для пользователей: тот же адрес.
3. New item → загрузить `Canvas-UI-Anywhere-0.1.0-webstore.zip`.
4. Store listing → блоки ниже: описание, категория, язык, скриншоты, промо, иконка.
5. Privacy → single purpose, обоснования разрешений, «remote code: no», data usage – ничего не собирается, ссылка на политику.
6. Distribution → Visibility: Public, Regions: all, бесплатно.
7. Submit for review. Ревью обычно 1–3 дня, у расширений с `scripting` бывает до недели. Статус приходит на email разработчика.

Ссылку на листинг после публикации (`https://chromewebstore.google.com/detail/<id>`) добавить на страницу витрины рядом с zip и в карточку каталога.

## Store listing

**Name** (из manifest): Canvas UI Anywhere

**Summary** (из manifest, 126/132):

```text
The canvasui.dev playground on any website: pick an effect, tune it, watch it on the live page, copy the props for your agent.
```

**Category:** Developer Tools
**Language:** English (United States)
**Homepage URL:** [apps.aimindset.org/canvas-ui-anywhere](https://apps.aimindset.org/canvas-ui-anywhere/?utm_source=website&utm_medium=article&utm_campaign=start&utm_content=github-canvasui-anywhere)
**Support URL:** [apps.aimindset.org/canvas-ui-anywhere](https://apps.aimindset.org/canvas-ui-anywhere/?utm_source=website&utm_medium=article&utm_campaign=start&utm_content=github-canvasui-anywhere)
**Privacy policy URL:** [apps.aimindset.org/canvas-ui-anywhere/privacy.html](https://apps.aimindset.org/canvas-ui-anywhere/privacy.html?utm_source=website&utm_medium=article&utm_campaign=start&utm_content=github-canvasui-anywhere)

**Detailed description** (v2, после отказа Yellow Argon 10.10: список 28 названий убран как keyword spam):

```text
Canvas UI Anywhere puts the canvasui.dev playground over the page you have open.

canvasui.dev shows its effects on a mock page. This extension runs the same html-in-canvas effects on a real site: your own landing, a competitor's page, a draft on localhost. Same sliders, presets and defaults as the playground, so you can try an effect on the actual design before anyone writes a line of it.

HOW IT WORKS
• Click the icon or press Ctrl+Shift+Y on any tab. The panel appears and the first effect starts.
• Pick a component from the menu, drag the sliders, switch presets and colours. The control schema is copied from the playground one to one.
• The page stays alive under the effect: links, buttons, wheel and keyboard scrolling keep working. Stop puts everything back, scroll position included.
• Copy props puts the component name and its current props in the clipboard as JSON: colours as RGB, presets expanded, auto values resolved. Paste it to your agent or straight into the React component from canvas-ui.
• Settings per effect, the last effect, the panel side and the panel language (English or Russian) are remembered.

All 28 effects of the playground are included, from liquid distortion and glass shatter to frost, glitch and retro video looks. The full list is in the panel menu.

REQUIREMENTS
The effects read the page through Chrome's experimental HTML-in-canvas API. Turn it on once:
1. open chrome://flags/#canvas-draw-element
2. set it to Enabled
3. relaunch Chrome
Without the flag the extension still opens, but the effect draws over an empty canvas and the panel tells you so. The API is in Chrome's origin trial through Chrome 160; a trial token is bound to one domain, and an extension that works on every domain has none to bind to, so the flag stays until the API ships. The engines need WebGL2 with float render targets (any current GPU).

WHAT IT DOES NOT DO
No account, no analytics, no network requests of its own. The extension gets access to a tab only when you invoke it there (activeTab) and has no host permissions. Nothing is sent anywhere.

KNOWN EDGES
• While an effect runs the page scrolls inside a wrapper; site scripts that read window.scrollY pause their tricks until Stop. Iframes reload when the page is wrapped.
• The peel effect lifts the page off an empty background instead of the playground's second layout; the flame effect wraps the whole window.
• Images served from another domain (a CDN, another host) and cross-origin iframes come out blank under the effect: html-in-canvas paints same-origin content only, by the API's privacy rule. Text, layout and same-origin images render in full.
• The 3D object scenes and the two-panel ASCII sweep from the playground are not included: they draw a model or need two content panels.

CREDITS
Effects are the vanilla engines of canvas-ui by David Haz (github.com/DavidHDev/canvas-ui, MIT with Commons Clause), bundled unchanged. The panel, the page wrapper and this build are by AI Mindset. Free, no upsell.
```

Строка «Product page, release notes and the unpacked build: [apps.aimindset.org/canvas-ui-anywhere/»](https://apps.aimindset.org/canvas-ui-anywhere/»?utm_source=website&utm_medium=article&utm_campaign=start&utm_content=github-canvasui-anywhere) вернётся в конец описания вместе с Homepage/Support/Privacy URL после мержа PR #168.

**Screenshots** (по порядку): `screenshots/01-shatter.jpg`, `02-frost.jpg`, `03-decrypt-reveal.jpg`, `04-magnify.jpg`, `05-particle-reveal.jpg` – все 1280×800, сняты расширением поверх developer.chrome.com с нарисованным курсором (системный в снимок не попадает). Только явные эффекты: Liquid, Hex Float, VHS, Glitch, Bend, Peel, Asciify, Cloth, Grid в статике читаются слабо. Чужие бренды вроде Apple в скриншоты Store не берём.
**Small promo tile:** `promo-440x280.png`. **Marquee:** `marquee-1400x560.png`. **Store icon:** `icon-128.png` (та же, что в manifest).

## Privacy practices

**Single purpose description:**

```text
Preview the visual effects of the canvas-ui library (canvasui.dev) over the page the user has open: show a settings panel, draw the chosen effect on top of the page, and copy the chosen settings as JSON. Nothing else.
```

**Permission justifications:**

```text
activeTab: the extension acts only on the tab where the user clicks the icon or presses the keyboard shortcut. It needs that tab to draw the effect over the page and to return the page to its original state on Stop. No host permissions are requested; no access to any site until the user invokes the extension on it.

scripting: injects the bundled content script (panel + effect engine) into the active tab after the user's click or shortcut. The code is packaged with the extension; nothing is fetched or executed from a remote source.

storage: keeps the user's effect settings (slider, toggle and colour values per effect), the last chosen effect, the panel side and the panel language in chrome.storage.local, so the panel opens the way the user left it. Stored locally only.
```

**Remote code:** No, I am not using remote code.

**Data usage:** ни один пункт не отмечен (personally identifiable information, health, financial, authentication, personal communications, location, web history, user activity, website content – всё «no»). Три подтверждения (не продаём, не используем вне назначения, не для кредитоспособности) – отметить.

## Notes for reviewer (поле Review notes)

```text
The effects rely on Chrome's HTML-in-canvas API (canvas.layoutsubtree / drawElementImage), currently behind a flag. To test:
1. open chrome://flags/#canvas-draw-element, set Enabled, relaunch Chrome
2. open any site, e.g. https://aimindset.org
3. click the extension icon or press Ctrl+Shift+Y: the panel opens on the left and the Liquid effect starts over the live page
4. change the component in the dropdown, move sliders, click links on the page, scroll, press Stop
Without the flag the panel opens and explains that the flag is needed; the effect then draws without the page content. The extension makes no network requests; all code is bundled. Test account is not needed.
```

## Состояние подачи – 2026-10-14

**Опубликовано 14.10.2026:** `https://chromewebstore.google.com/detail/canvas-ui-anywhere/lgpkfmjhigjnjhkpjeoakdkakolajodl`. Осталось вписать в листинг Homepage, Support, Privacy policy URL и вернуть строку со ссылкой на страницу в конец описания (все адреса живые с 12.10).

### История

Подано 10.10.2026, в тот же день отказ Yellow Argon (keyword spam: перечисление 28 названий эффектов в описании). Описание переписано (v2 выше), повторная подача 12.10, автопубликация после одобрения включена. Item ID `lgpkfmjhigjnjhkpjeoakdkakolajodl`, публичная ссылка после одобрения `https://chromewebstore.google.com/detail/lgpkfmjhigjnjhkpjeoakdkakolajodl`.

Что заполнено: описание, категория Developer Tools, язык English, иконка, 5 скриншотов (developer.chrome.com), small promo, marquee, Global promo video (YouTube, доступ по ссылке, залита web-копия ролика), Privacy (single purpose, три justification, remote code No, data usage пусто, три сертификации), Distribution Free/Public/All regions, Test instructions.

Что пусто намеренно: Homepage URL, Support URL, Privacy policy URL – дашборд проверяет досягаемость ссылок при подаче, а `https://apps.aimindset.org/canvas-ui-anywhere/` оживёт после мержа lab-sites PR #168. Упоминание этой ссылки в конце описания оставлено, текст на досягаемость не проверяется.

12.10 PR #168 слит, страница `https://apps.aimindset.org/canvas-ui-anywhere/` и `privacy.html` живы. По решению синка 12.10 установка с витрины идёт из репозитория `https://github.com/ai-mindset-org/canvasui-anywhere` (папка `dist`), zip не публикуется; на странице строка о статусе проверки Store. Пока подача на ревью, листинг не трогать (правка снимает подачу). После вердикта: вписать Homepage, Support, Privacy policy URL и вернуть строку со ссылкой в описание; на странице витрины заменить строку статуса на ссылку установки из Store.

## После публикации

- ссылка на листинг → `sites/apps/canvas-ui-anywhere/index.html` (кнопка «add to Chrome» рядом с download), `apps-catalog.json` (installAnchor), `release-notes.txt`
- в `store/` ничего не коммитить в lab-sites: это вход для кабинета Store, не для витрины
- новая версия: поднять `version` в `src/manifest.json`, `npm run build`, загрузить новый `-webstore.zip` в кабинет, обновить скриншоты только если изменилась панель

## Риск ревью

Политика Store требует, чтобы расширение работало как описано. Без флага эффект рисует пустой холст, и ревьюер может прислать отказ «broken functionality». Описание, блок REQUIREMENTS и Review notes говорят про флаг прямо; если отказ придёт, ответ в Appeal – те же шаги плюс ссылка на страницу витрины с инструкцией.

Лицензия canvas-ui (MIT + Commons Clause) разрешает распространение движков как части продукта и запрещает продажу или перепродажу компонентов самих по себе. Расширение бесплатное, атрибуция стоит в описании, на странице витрины и в `src/vendor/LICENSE.md` внутри сборки.
