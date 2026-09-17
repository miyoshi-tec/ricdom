# ricdom

[![CI](https://github.com/miyoshi-tec/ricdom/actions/workflows/ci.yml/badge.svg)](https://github.com/miyoshi-tec/ricdom/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**Write UI as plain objects. Assign to state. The real DOM updates.**

- **Plain-object UI tree.** No JSX, no template compiler, no DSL to learn — a component is
  just an object literal (`{ tag: 'div', children: [...] }`), typed end to end.
- **Proxy state, no ceremony.** `app.count += 1` re-renders. No store, no reducer, no
  subscription to wire up by hand.
- **No build step, ever, for consumers.** One `<script>` tag or one `import` and it runs —
  TypeScript is how *ricdom itself* is built, not something you're required to adopt.

日本語版: [README.ja.md](README.ja.md)

## Quick start

```html
<script src="https://cdn.jsdelivr.net/npm/ricdom@2/dist/ricdom.iife.min.js"></script>
<div id="app"></div>
<script>
  ricdom.createApp('#app', { count: 0 }, (s) => ({
    tag: 'div',
    children: [
      { tag: 'button', onclick: () => { s.count -= 1; }, children: ['-'] },
      { tag: 'output', children: [String(s.count)] },
      { tag: 'button', onclick: () => { s.count += 1; }, children: ['+'] },
    ],
  }));
</script>
```

Or with native ESM / a bundler:

```js
import { createApp } from 'https://esm.sh/ricdom@2';
```

While developing, use `dist/ricdom.iife.js` (unminified, dev-mode warnings enabled) instead
of `dist/ricdom.iife.min.js`; ship `.iife.min.js`.

## Where ricdom sits

| | UI tree | Reactivity | gzip | No build step | TS types | Distribution |
|---|---|---|---|---|---|---|
| VanJS | function calls (`tags.div(...)`) | own state (`.val`) | ~1KB | yes | yes | npm/CDN |
| Alpine.js | HTML attributes (`x-data`) | Proxy | 7–15KB | yes | partial | CDN-first |
| petite-vue | HTML attributes (`v-`/`@`/`:`) | Vue 3-style Proxy | ~6KB | yes | yes | CDN |
| htmx | HTML attributes (`hx-*`) | none (server-driven) | ~14KB | yes | partial | CDN/npm |
| Lit | tagged templates + Web Components | `@property` decls | 5–6KB | mostly | first-class | npm/CDN |
| Preact + htm | tagged templates | VDOM diff (+ Signals) | ~4KB | yes | yes | npm/CDN |
| Solid.js | JSX | signals (no VDOM) | ~7.6KB | **no** | first-class | npm |
| Mithril | `m(sel, attrs, children)` → vnode | VDOM diff, manual redraw | ~8.8KB | yes | bundled | npm/CDN |
| **ricdom** | **hand-written plain objects** | **Proxy (shallow + dev warnings)** | **≤ 5.1KB (core)** | yes | first-class | npm/jsDelivr |

Nothing else in this space combines a hand-written plain-object tree, Proxy-driven
re-rendering, and zero required build step for the consumer.

## What's in the box

- **`ricdom`** — the core: plain-object tree → real DOM, shallow-Proxy reactivity, a
  render scheduler with an rAF+timeout backstop, islands for externally-managed subtrees.
  Core bundle is ≤ 5,200B gzipped.
- **`ricdom/ui`** — 29 components (buttons, inputs, layout, markdown/code display, dialog,
  popup, toast, tooltip, dropdown, splitter, tabs, accordion, a dat.GUI-style tweak panel,
  and more), each with a real WAI-ARIA APG accessibility contract (focus trap, roving
  tabindex, keyboard navigation — not bolted on after the fact), distributed as one CSS
  file (`ricdom-ui.css`). 7 themes, incl. frosted glass for transparent Electron windows.
- **`ricdom/icons`** + `ricdom-icon` CLI — a small bundled icon set as tree-shakable
  named exports, plus a CLI that fetches and converts any [Lucide](https://lucide.dev/)
  icon on demand. Icon path data is never meant to be hand-written.
- **`ricdom/md-editor`** — opt-in, own IIFE, adds nothing to `ricdom/ui`'s bundle.
  `createMdEditor()` is a `uiTextarea` that colors Markdown syntax as you type.
- Not in the box: an LZ self-extracting build. For single-file distribution
  without gzip, use the separate MIT tool
  [ricdom-lz](https://github.com/miyoshi-tec/ricdom-lz) (needs `'unsafe-eval'` in CSP;
  the IIFE bundles assign `globalThis.ricdom`/`ricdomUI` explicitly so they survive
  function-scoped `eval`).

## Status

`2.0.0-alpha` — API-complete and under active testing, not yet published to npm. Every alpha
is tagged (`v2.0.0-alpha.N`, annotated); pin a tag and build `dist/` with
`npm ci && npm run build` until the npm release.

This is the successor to [RicDOM v1](https://github.com/miyoshi-tec/RicDOM-v1) (now in
maintenance mode), rebuilt in TypeScript with camelCase APIs, real accessibility, and a
browser-tested CI pipeline. It is not source-compatible with v1 — see
[CHANGELOG.md](CHANGELOG.md) for the breaking changes if you're migrating an existing v1
app.

License: [MIT](LICENSE). A few bundled icons derive from Lucide (ISC); see
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Learn more

- [TUTORIAL.md](docs/TUTORIAL.md) — a 10-chapter, code-first walkthrough
- [SPEC.md](docs/SPEC.md) — the full contract: diffing rules, reactivity, every
  component's props and ARIA behavior
- [examples/](examples/index.html) — 7 build-free demo pages
- [CHANGELOG.md](CHANGELOG.md) — release history
- [CONTRIBUTING.md](CONTRIBUTING.md) — developing ricdom itself
