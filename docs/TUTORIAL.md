# ricdom TUTORIAL

Ten short chapters, each with runnable code. This tutorial only uses a `<script>` tag —
no build step, no `npm install` — so you can copy any snippet into an `.html` file and
open it in a browser. For the full contract behind everything shown here, see
[SPEC.md](SPEC.md).

1. [Setup](#1-setup)
2. [Writing a tree](#2-writing-a-tree)
3. [Changing state re-renders — and the one trap](#3-changing-state-re-renders--and-the-one-trap)
4. [Wiring up inputs](#4-wiring-up-inputs)
5. [Components and `use()`](#5-components-and-use)
6. [Theme and CSS](#6-theme-and-css)
7. [Dialog and popup](#7-dialog-and-popup)
8. [The tweak panel](#8-the-tweak-panel)
9. [Islands: coexisting with a `<canvas>`](#9-islands-coexisting-with-a-canvas)
10. [Next steps](#10-next-steps)

---

## 1. Setup

One `<script>` tag is enough:

```html
<script src="https://cdn.jsdelivr.net/npm/ricdom@2/dist/ricdom.iife.min.js"></script>
<script>
  ricdom.createApp('#app', { count: 0 }, (s) => ({
    tag: 'div',
    children: [`count: ${s.count}`],
  }));
</script>
<div id="app"></div>
```

While developing, load `dist/ricdom.iife.js` instead — the unminified build with dev-mode
warnings (deep-assignment misses, duplicate keys, invalid theme names) enabled. Ship
`.iife.min.js`, which has that code removed. The same pair exists for `ricdom-ui`.

Or, with a bundler / native ESM:

```js
import { createApp } from 'https://esm.sh/ricdom@2';
```

Both forms give you exactly the same API — `ricdom` (the global) and the module's default
export are the same object. Everything below is written as ESM `import`s; swap in the
`ricdom.` / `ricdomUI.` global prefix if you're using the `<script>` tags instead.

---

## 2. Writing a tree

A ricdom tree is plain JavaScript objects and arrays — no JSX, no template syntax.

```js
import { createApp } from 'ricdom';

createApp('#app', {}, () => ({
  tag: 'ul',
  children: [
    { tag: 'li', children: ['one'] },
    { tag: 'li', children: ['two'] },
    { tag: 'li', children: ['three'] },
  ],
}));
```

- `tag` picks the element (any HTML or SVG tag name).
- `children` is a node or array of nodes: strings/numbers become text, `null`/`false`/
  `undefined` render as nothing, arrays are flattened.
- Anything else you put on the object becomes an attribute, a property, or (for `on*`
  keys) an event handler:

```js
{ tag: 'button', class: 'primary', disabled: false, onclick: () => alert('hi'), children: ['Click'] }
```

---

## 3. Changing state re-renders — and the one trap

`createApp(target, state, render)` returns an **app handle**. Assigning to a property of
that handle schedules a re-render:

```js
import { createApp } from 'ricdom';

const app = createApp('#app', { count: 0 }, (s) => ({
  tag: 'div',
  children: [
    { tag: 'button', onclick: () => { app.count -= 1; }, children: ['-'] },
    { tag: 'output', children: [String(s.count)] },
    { tag: 'button', onclick: () => { app.count += 1; }, children: ['+'] },
  ],
}));
```

Notice the render callback's own parameter, `s`, and the outer `app` handle refer to the
**same reactive object** — you can write to either one (`s.count = 1` inside an event
handler works exactly like `app.count = 1`). What does *not* work is writing to the plain
object you originally passed in:

```js
const state = { count: 0 };
const app = createApp('#app', state, (s) => ({ tag: 'div', children: [s.count] }));

state.count = 1;   // ❌ nothing happens — `state` was never made reactive, only wrapped
app.count = 1;      // ✅ this is the reactive handle — re-renders
```

This is the single most common thing people trip on, so it's worth internalizing early:
**`createApp` wraps your object, it does not mutate it.** Only the returned handle (and
the `s` your render function receives) is reactive. Once you're in the habit of reading
and writing through `app`/`s`, this never comes up again.

### One more rule: shallow

The reactive wrapper only tracks the state object's own top-level properties, plus one
level into any object-valued property:

```js
app.user = { name: 'x' };      // ✅ tracked (top level)
app.user.name = 'y';            // ✅ tracked (one level in)
app.user.address.city = 'z';    // ❌ not tracked (two levels in)
```

To update something nested two or more levels deep, shallow-copy the level that changed:

```js
app.user = { ...app.user, address: { ...app.user.address, city: 'z' } };
```

In a development build, writing to an untracked nested path like that still writes the
value — it just won't re-render on its own. If you write the nested value and then, in the
same synchronous task, trigger a render some other way (e.g. `app.user = { ...app.user }`,
matching the shallow-copy pattern above), nothing is logged — the render picks up your
nested write along with everything else. Only if nothing ends up triggering a render does
`console.warn` fire, once per path, at the end of that task — that's the actual bug this
warning is for.

---

## 4. Wiring up inputs

`ricdom/ui` ships plain-function form controls plus `bind*` helpers for the common
two-way case. Add the UI package:

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/ricdom@2/dist/ricdom-ui.css">
<script src="https://cdn.jsdelivr.net/npm/ricdom@2/dist/ricdom.iife.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/ricdom@2/dist/ricdom-ui.iife.min.js"></script>
```

Put the `ricdom-ui.css` `<link>` **before your own stylesheet**. The sheet is a base layer:
it styles inputs, textareas, buttons and selects too (`.ric-textarea { font-family: inherit }`,
`.ric-select { width: 100% }`, …) at single-class specificity, so an app rule of the same
specificity wins only if it comes later. `injectStyles()` appends a `<style>` at the end of
`<head>`, so if you use it instead of a `<link>`, call it before your own stylesheets load.

```js
import { createApp } from 'ricdom';
import { bindInput, uiText } from 'ricdom/ui';

createApp('#app', { name: '' }, (s) => ({
  tag: 'div',
  children: [
    bindInput(s, 'name', { placeholder: 'Your name' }),
    uiText({ children: [`Hello, ${s.name || 'stranger'}!`] }),
  ],
}));
```

`bindInput(s, 'name', options)` is shorthand for wiring `value`/`oninput` yourself:

```js
uiInput({
  value: s.name,
  oninput: (ev) => { s.name = ev.target.value; },
});
```

`bindTextarea`, `bindCheckbox`, `bindSelect`, and `bindRange` follow the same pattern for
their respective controls. Reach for the plain `uiInput`/`uiCheckbox`/… functions directly
whenever you need custom logic in the handler instead of a straight assignment.

---

## 5. Components and `use()`

Stateless components (everything in the previous chapter) are just functions you call.
Stateful components — ones that hold their own open/closed state and need somewhere to
render into, like a dialog — are different: you register them once with `app.use()`, and
call the returned handle inside `render` every time. `createApp` renders synchronously
before it returns, so register the part in the `setup` option — it runs right before that
first render, so the part is already usable on the very first call:

```js
import { createApp } from 'ricdom';
import { createToast, uiButton } from 'ricdom/ui';

let toast;
const app = createApp(
  '#app',
  {},
  () => {
    toast(); // registers this render cycle's portal content — call it every render
    return uiButton({
      children: ['Save'],
      onclick: () => toast.show('Saved!', { type: 'success' }),
    });
  },
  { setup: (a) => { toast = a.use(createToast()); } },
);
```

(Without `setup`, you'd have to make `render` return a placeholder until `use()` has run,
then trigger another render — `setup` exists so you don't have to.)

There's a second sanctioned way to untangle the same circular dependency (the part needs
the app handle; the render function needs the part): pass a render function that renders
nothing yet, and assign the real one to `app.render` once you have what you need. This is
useful when building the render function itself is involved enough that you'd rather do it
outside `createApp`'s call site:

```js
const app = createApp('#app', {}, () => null); // nothing to render yet
const toast = app.use(createToast());
app.render = () => { toast(); return uiButton({ children: ['Save'], onclick: () => toast.show('Saved!') }); };
```

Assigning to `app.render` re-renders synchronously right away, same as assigning to any
other property on the handle — there's no lenient mode where a missing/placeholder render
function skips the first paint.

**Pitfall (a pilot migration, 2.0.0-alpha.9): `createApp` runs its first render
synchronously, during the call itself** — so if the render function you pass closes over
a `const` declared *after* that `createApp(...)` call in the same module, you hit a
temporal-dead-zone `ReferenceError`, not a `console.error`-and-NOOP like the `use()`
mistake above:

```js
// ❌ ReferenceError: Cannot access 'CONFIG' before initialization.
// createApp's synchronous first render calls the render function immediately,
// and CONFIG's `const` declaration hasn't executed yet at that point.
const app = createApp('#app', {}, () => uiText({ children: [CONFIG.title] }));
const CONFIG = { title: 'Settings' };
```

The fix is the same shape as the two patterns above: either declare `CONFIG` before the
`createApp(...)` call, or use the `() => null` + `app.render = ...` pattern shown above so
the *real* render function (the one referencing `CONFIG`) isn't wired up — and therefore
never executed — until after `CONFIG` exists. This is the same underlying reason v1 code
that assigned `handle.render = render` after building up its dependencies never hit this:
the real render function simply wasn't called until you attached it, same as the `app.render`
pattern above.

If you forget the `app.use(...)` step and call `createToast()()` directly, nothing
crashes — `ricdom/ui` logs one `console.error` explaining the fix and renders nothing.
There's no implicit wiring to get subtly wrong: either a part is registered with `use()`,
or it visibly isn't.

---

## 6. Theme and CSS

`applyTheme` sets a family of `--ric-*` CSS variables (plus the native `color-scheme`
property) as inline style on whatever element you give it — themes are per-element, not
global, so different parts of a page can carry different themes at once:

```js
import { applyTheme } from 'ricdom/ui';

applyTheme(document.getElementById('app'), { theme: 'dark', density: 'compact' });
```

Built-in themes: `light`, `dark`, `teal`, `cyber`, `aqua`, `glass`, `glass-dark`. Densities:
`comfortable` (default), `compact`, `tight`. You can also pass your own
`{ '--ric-color-accent': '#e91e8c', ... }` object as `theme` for a fully custom palette, or
`createTheme('teal', { ... })` to start from a bundled theme and override just a few
variables.

`applyTheme` also paints `background`/`color`/`font-size` on the element itself
(background/color since 2.0.0-alpha.3, font-size added in alpha.6) — with v1's
`create_ui_page` gone, this is what makes the element you called it on actually look
themed, not just its descendants (which pick up the `--ric-*` variables through normal CSS
inheritance either way).

If you skipped the `<link rel="stylesheet">` in chapter 4 (e.g. a pure `<script>`-only
page), call `ricdomUI.injectStyles()` once instead — it inserts the same stylesheet at
runtime and is safe to call more than once.

### Frosted glass over the desktop (Electron)

`glass`/`glass-dark` (`2.0.0-alpha.18`) model Windows 11 Acrylic / iOS translucency:
floating surfaces (dialog, popup, dropdown, toast, tooltip, panel, the tweak panel) get a
`backdrop-filter` blur via the `--ric-surface-blur` token, and controls (`uiInput` etc.)
stay translucent (`rgba()` backgrounds) without the blur itself — see SPEC.md §8 for which
surfaces get it and why controls don't.

In a plain browser, `glass` looks right out of the box because its `--ric-color-bg` is a
built-in gradient. In an Electron app with a transparent window, you want the *real*
desktop behind your UI instead of that gradient — override `--ric-color-bg` to
`'transparent'`:

```js
// main process
const win = new BrowserWindow({
  backgroundMaterial: 'acrylic', // or 'mica' | 'tabbed' — Windows 11 22H2+, Electron 22+
  // macOS: vibrancy: 'under-window' (or 'sidebar') instead of backgroundMaterial
  // Linux / other: best effort — transparent: true, frame: false
});
```

```js
// renderer, after the window is created with the options above
document.documentElement.style.background = 'transparent';
document.body.style.background = 'transparent';
applyTheme(document.getElementById('app'), {
  theme: createTheme('glass', { '--ric-color-bg': 'transparent' }),
});
```

The OS-level window material (`backgroundMaterial`/`vibrancy`/`transparent`) supplies the
blur of the *desktop* behind your whole window; `--ric-surface-blur` adds a second,
per-surface blur on top of that for dialogs/popups/etc., the same way it would over any
other background. Performance note: `backdrop-filter` is not applied to controls
specifically because its cost scales with the number of elements using it — a handful of
floating surfaces is fine, hundreds of inputs would not be.

`prefers-reduced-transparency` is checked once, when `applyTheme` runs — not a live
subscription (SPEC.md §8). To track the setting live, re-apply the theme on change:

```js
matchMedia('(prefers-reduced-transparency: reduce)').addEventListener('change', () => {
  applyTheme(document.getElementById('app'), { theme: 'glass' });
});
```

Be honest about scope: this is a look, not a guarantee — your app still owns its own
background wherever the window itself is transparent (e.g. behind content `glass`'s
surfaces don't cover).

---

## 7. Dialog and popup

Accessibility (focus trap, `Escape` handling, ARIA roles) is the library's job, not yours
— you just supply content. For the common "click a button to open" case, `createDialog`
can render its own trigger button for you:

```js
import { createApp } from 'ricdom';
import { createDialog, uiButton } from 'ricdom/ui';

let dlg;
const app = createApp(
  '#app',
  {},
  () =>
    dlg({
      triggerChildren: ['Delete item'],
      title: 'Are you sure?',
      children: ['This cannot be undone.'],
      actions: [uiButton({ children: ['Delete'], variant: 'primary', onclick: () => { /* ... */ dlg.close(); } })],
    }),
  { setup: (a) => { dlg = a.use(createDialog()); } },
);
```

This is *uncontrolled* mode: the dialog manages its own open/closed state. For a dialog
driven entirely by your own state (`controlled` mode), pass `open`/`onClose` instead of
`triggerChildren`:

```js
dlg({
  open: s.showDialog,
  onClose: (reason) => { s.showDialog = false; }, // reason: 'overlay' | 'close-button' | 'escape' | 'api'
  title: 'Are you sure?',
  children: ['This cannot be undone.'],
});
```

**A trap when the dialog body starts with an input (LCP, pilot 8)**: a dialog's default
initial focus (SPEC.md §10.3.1c) can land on the first focusable element in the body, so if
that's a `textarea`/`input`/`select`, the editing guard (§2.4's FACT) is active from the
moment the dialog opens — a button elsewhere in the dialog that writes that field's value
back from state will silently do nothing while the field is still focused. This bites E2E
tests specifically: a plain `el.click()` never moves focus, so a test that opens the dialog
and immediately `.click()`s a "reset from state" button *appears* to pass the guard (the
field was never focused by the test), while a real user's mouse click on that same button
does move focus away from the input first, un-blocking the write. Write the test the way a
real click behaves: `resetBtn.focus(); resetBtn.click();`.

`createPopup` follows the same `use()`-then-call pattern for a `role="menu"` dropdown menu
with arrow-key navigation built in:

```js
let menu;
const app = createApp(
  '#app',
  {},
  () =>
    menu({
      trigger: ['⋯'],
      children: [
        uiButton({ children: ['Rename'], onclick: () => { /* ... */ } }),
        uiButton({ children: ['Delete'], onclick: () => { /* ... */ } }),
      ],
    }),
  { setup: (a) => { menu = a.use(createPopup()); } },
);
```

`Escape`, focus trapping/restoration, and outside-click dismissal all work without any
further code on your part. Selecting a menuitem also closes the menu by default (pass
`closeOnSelect: false` for a checkbox-style menu that should stay open).

One naming difference worth remembering: `createPopup`'s trigger look (icon/ghost/size) is
configured *inside* the `trigger` object (`trigger: { icon, ghost, size }`), while
`createDropdown`'s equivalent look is a set of **top-level props** (`label`/`icon`/`ghost`)
passed alongside `children` — the two components don't share a `trigger` shape.

`createAccordion` follows the same controlled/uncontrolled split as `createTabs`: leave
`open` out and it manages itself, or pass `open` to drive it from your own state — for
example, a "Close all" button that no header click could express on its own:

```js
import { createApp } from 'ricdom';
import { createAccordion, uiButton, uiCol } from 'ricdom/ui';

let acc;
const app = createApp(
  '#app',
  { acc: { a: true, b: false } },
  (s) =>
    uiCol({
      children: [
        uiButton({ children: ['Close all'], onclick: () => { s.acc = { a: false, b: false }; } }),
        acc({
          items: [
            { id: 'a', title: 'Section A', children: ['...'] },
            { id: 'b', title: 'Section B', children: ['...'] },
          ],
          open: s.acc,
          // Derive from the live state. `nextMap` (3rd arg) is computed from the `open`
          // of the last render, so a click that lands before a heavy re-render finishes
          // would be lost if you assigned it directly (see SPEC §10.3.3a).
          onToggle: (id, next) => { s.acc = { ...s.acc, [id]: next }; },
        }),
      ],
    }),
  { setup: (a) => { acc = a.use(createAccordion()); } },
);
```

---

## 8. The tweak panel

For quickly exposing a set of parameters to adjust live — useful for prototyping visual
effects, calibrating a simulation, or building an internal debug panel —
`createTweakPanel` turns a plain data object into a full parameter panel automatically:

```js
import { createApp } from 'ricdom';
import { createTweakPanel } from 'ricdom/ui';

let tweak;
const app = createApp(
  '#app',
  { params: { size: 10, color: '#ff0000', spin: true } },
  (s) => tweak({ title: 'Params', data: s.params }),
  { setup: (a) => { tweak = a.use(createTweakPanel()); } },
);
```

This alone produces a number field for `size`, a color picker for `color`, and a checkbox
for `spin` — the row type is inferred from the value's type (booleans → checkbox, numbers
→ number input, hex/`rgba()` strings → color picker, everything else → text). Nest a plain
object to get a collapsible folder. Override individual rows (min/max/step/options/type)
with the `keys` prop, or append your own hand-built rows with `rows` — see
[SPEC.md §10](SPEC.md#10-components) or `examples/tweak.html` for the full three-tier API.

A row doesn't have to come from `data`: give a `keys` entry a `get` (and optionally `set`)
function and it renders as its own row without ever reading or writing `data[key]` —
useful for a derived/read-only value (e.g. an area computed from `size`). A folder's
`keys` entry can also carry its own `rows` array, appended at the end of that folder
specifically (the top-level `rows` prop only ever appends to the end of the whole panel).

---

## 9. Islands: coexisting with a `<canvas>`

Sometimes part of your page is driven by something other than ricdom's own diffing — an
animation loop drawing to a `<canvas>`, a third-party widget. Mark that subtree
`island: true` and ricdom will build it once and never touch its descendants again on any
later render:

```js
createApp('#app', { fps: 0 }, (s) => ({
  tag: 'div',
  children: [
    { tag: 'output', children: [`${s.fps} fps`] },
    { tag: 'canvas', island: true, width: 400, height: 300, ref: 'canvas' },
  ],
}));
```

Grab the canvas element yourself via `app.refs.get('canvas')` and drive it however you
like — ricdom's diffing will never fight you for control of anything inside an island.

### Migrating from v1: the second trap — omitting `children` no longer means "leave this alone"

If you're porting a v1 tree, this is the mirror image of chapter 3's trap and just as easy
to miss. In v1, an element that omitted `ctx` (v1's `children`) was implicitly an island —
ricdom never touched its descendants. In v2, omitting `children` just means **an empty
element** (`island` must be requested explicitly, above). A v1 element that relied on the
old implicit behavior renders correctly on the first paint (it happens to already be
correct DOM) and then goes quietly wrong on the *next* render, when v2 diffs it against an
empty `children` and clears out whatever was there.

Before migrating, grep the v1 codebase for the two shapes most likely to be relying on this
implicit behavior (pilot 5-7 = Rancha's report; this doesn't show up as an error, so it has
to be found by inspection, not by running the app):

1. **Elements that carry only a `ref`, no `ctx`/`children`** — almost always a hand-off
   point, e.g. `{ tag: 'canvas', ref: 'chart' }` for a chart library that draws into it
   later. Add `island: true`.
2. **Any host element that some other piece of code writes into directly** — `el.innerHTML
   = ...` from a rich-text editor, a third-party widget's own `.mount(el)`, a canvas
   animation loop — reached via `app.refs.get(name)` or a raw `document.querySelector`.
   Add `island: true` to that element in the tree, not just to the code that touches it
   afterwards.

---

## 10. Markdown-colored textarea

`ricdom/md-editor` is a separate, opt-in subpath — importing `ricdom/ui` alone never pulls
it in. It gives you `createMdEditor()`, which behaves exactly like `uiTextarea` (§4) but
colors the Markdown syntax as you type, VS Code-style:

```js
import { createApp } from 'ricdom';
import { createTweakPanel } from 'ricdom/ui'; // unrelated, just showing ricdom/ui still works
import { createMdEditor } from 'ricdom/md-editor';

let md;
const app = createApp(
  '#app',
  { body: '# Notes\n\nWrite **Markdown** here.' },
  (s) => md({ value: s.body, oninput: (ev) => { s.body = ev.target.value; } }),
  { setup: (a) => { md = a.use(createMdEditor()); } },
);
```

The element you actually get in the DOM is a real `<textarea>` — `ref`, `onkeydown`,
`autoResize`, everything from §4 still works unchanged, because a transparent copy of the
textarea sits on top of a colored, invisible `<pre>` mirror behind it (see
[SPEC.md §13](SPEC.md#13-ricdommd-editor-opt-in-subpath) for the mechanism and every FACT).
Pass `highlight: 'none'` to fall back to a plain, undecorated `uiTextarea` — useful for a
"plain text mode" toggle.

With the IIFE build (no bundler), load it as a third `<script>` tag alongside the core and
`ricdom/ui`:

```html
<script src="https://cdn.jsdelivr.net/npm/ricdom@2/dist/ricdom.iife.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/ricdom@2/dist/ricdom-ui.iife.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/ricdom@2/dist/ricdom-md-editor.iife.min.js"></script>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/ricdom@2/dist/ricdom-ui.css">
```

`ricdomMdEditor.createMdEditor` is then available as its own global — see
`examples/md-editor.html` for a full working page.

---

## 11. Next steps

- [SPEC.md](SPEC.md) — the full contract: diffing rules, reactivity, the scheduler,
  `use()`, portals, themes, every component's props and ARIA behavior.
- `examples/` — six build-free demo pages you can open directly in a browser
  (`examples/index.html` is the index).
- [CHANGELOG.md](../CHANGELOG.md) — what changed release to release, and the breaking
  changes from v1 if you're migrating an existing RicDOM v1 app.
- [CONTRIBUTING.md](../CONTRIBUTING.md) — if you want to work on ricdom itself.
