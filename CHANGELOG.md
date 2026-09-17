# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [2.0.0-alpha.16] — not yet published

### Added

- **`ricdom/md-editor` (new, opt-in subpath)**: `createMdEditor()`, a "`uiTextarea` with
  Markdown syntax colors," requested by Raccoon Memo (pilot #5, 2026-09-17). The DOM
  element the consumer touches is a real `<textarea>` with the exact same contract as
  `uiTextarea` (value/oninput/selectionStart/setSelectionRange/onpaste/ondrop/onscroll/
  scrollTop/scrollHeight/onkeydown/ref/class/placeholder/spellcheck/autoResize all keep
  working) — a transparent copy of the textarea sits in front of an `aria-hidden`, `island`
  `<pre>` mirror that renders the same text with colored `<span>`s behind it, so the caret,
  IME composition, undo, spellcheck, and screen-reader behavior are all the browser's own,
  untouched. `highlight: 'none'` (or a value over `maxHighlightLength`, default 200,000
  characters) returns byte-for-byte the same node `uiTextarea()` would. The mirror copies
  the textarea's computed font metrics (font/line-height/padding/border) — but **not** its
  `box-sizing`, which the mirror always pins to `border-box` regardless of the textarea's
  own (`.ric-textarea`'s CSS does not set `box-sizing`, so a plain textarea is `content-box`,
  the browser default) — so its line-wrapping stays pixel-identical to the textarea's, and
  re-syncs on `input`/`scroll`/`compositionend` (the last via
  `textarea.addEventListener('compositionend', …)`, not an `on*` prop — see the new core
  FACT below), after every render (rAF + 200ms backstop, like `createScrollPane`), and via a
  `ResizeObserver` on the textarea itself. Also exports
  `tokenizeMarkdown(src)`, the pure line-based tokenizer behind it (front matter, ATX
  headings, fenced code with a language hint passed through `window.hljs` when present,
  blockquotes, lists with task boxes, tables, horizontal rules, inline code/strong/em/
  strike/links/images/autolinks/raw HTML tags) — guaranteed to reconstruct its input
  exactly (`tokens.map(t => t.text).join('') === src`) for any text, including unterminated
  fences/emphasis, CRLF, and astral characters. Token color classes use only
  `color`/`background-color`/`text-decoration`/`text-shadow`/`opacity`/`border-radius` —
  never a property that changes glyph width — since the mirror's wrapping must stay in
  lockstep with the textarea's; `**strong**` is therefore a same-width "fake bold"
  (`text-shadow`) rather than a real `font-weight` change. Ships as its own IIFE
  (`dist/ricdom-md-editor.iife.min.js`, `globalName: ricdomMdEditor`) — importing
  `ricdom/ui` alone does not pull in `createMdEditor`/`tokenizeMarkdown` (verified: 0
  occurrences in `dist/ricdom-ui.iife.min.js`). Eight new `--ric-md-*` theme tokens
  (`--ric-md-heading`/`-emphasis`/`-link`/`-url`/`-code-bg`/`-quote`/`-marker`/`-meta`)
  defined for all five bundled themes, picked up automatically by `exportTheme`/
  `exportSettings`. New roles `md-editor`/`md-editor-mirror` in the `data-ricdom-role`
  registry (§11) — the inner `<textarea>` keeps the plain `textarea` role.

### Fixed

Two defects found in an independent real-Chromium review before this feature merged
(neither was caught by the unit/browser suite as first written — both are now covered by
strengthened `tests/browser/uiMdEditor.test.ts` assertions):

- **Mirror geometry was wrong whenever the textarea was `box-sizing: content-box`** (the
  default — `.ric-textarea`'s CSS never sets `box-sizing`). `applyLayout` copied the
  textarea's own `box-sizing` onto the mirror; with `content-box`, the mirror's declared
  `width` (`clientWidth` + border) was then used directly as its *content* width, instead
  of needing padding subtracted — over-wide by exactly the horizontal padding (measured: a
  233px-content-wide textarea produced a 262px-content-wide mirror, `mirror.scrollHeight`
  814 vs `textarea.scrollHeight` 793, rect width off by 19px+). The original wrapping-parity
  browser test passed anyway because it neither forced a scrollbar nor asserted content
  width directly, and it also never called `applyTheme` (leaving `--ric-pad-x`/
  `--ric-color-border` undefined, which zeroed out the very padding/border the bug depends
  on) — both gaps are now closed. Fixed by no longer copying `boxSizing` and instead pinning
  the mirror to `box-sizing: border-box` unconditionally (`applyLayout`, plus a static
  `box-sizing: border-box` in `MD_EDITOR_CSS` as a defense-in-depth default) — see the new
  SPEC.md FACT.
- **The `compositionend` safety net never fired.** It was wired as an `oncompositionend`
  prop on the textarea node, but browsers expose no IDL event-handler attribute for
  `compositionstart`/`compositionupdate`/`compositionend` (verified:
  `'oncompositionend' in document.createElement('textarea')` is `false` in Chromium), so
  `ricdom`'s `on*` → `el.onxxx = fn` property-assignment mechanism (`src/dom.ts`) created an
  inert expando that was never invoked. The existing IME test passed regardless, because
  Chromium's `input` event (which does work) already covers composing text — it just never
  exercised the `compositionend` path in isolation. Fixed by wiring
  `textarea.addEventListener('compositionend', …)` directly (attached/detached alongside the
  `ResizeObserver`, whenever the observed `<textarea>` element changes) instead of passing
  an `on*` prop; a consumer's own `oncompositionend` prop is no longer special-cased at all
  (it lands on the textarea exactly like any other prop, same as before — it was never
  `createMdEditor`'s to intercept). Documented as a new general core FACT in `docs/SPEC.md`
  §2 (`on*` only fires for events with a native IDL handler attribute), since this
  limitation applies to every `ricdom`/`ricdom/ui` component, not just this one.

### Changed

- **`dist/ricdom-ui.css` and `dist/ricdom-ui.iife.min.js` both grew slightly**, because the
  new component's CSS (`MD_EDITOR_CSS` in `src/ui/cssTemplates.ts`) and its two new
  `UI_ROLE` entries live in the shared `ricdom/ui` module per the existing "CSS ships as one
  file" policy (§9) — even though `createMdEditor`'s own JS is excluded from that bundle
  (see above). Measured: `dist/ricdom-ui.css` 34,778 → 36,271 bytes (uncompressed);
  `dist/ricdom-ui.iife.min.js` gzip 24,994 → 25,637 bytes (+643B, +2.6%). The core
  (`dist/ricdom.iife.min.js`, gzip 4,877B) is unaffected. `dist/ricdom-md-editor.iife.min.js`
  gzip: 4,535B.

## [2.0.0-alpha.15] — not yet published

Two core fixes reported by Raccoon Memo (pilot #5, alpha.14 report).

### Docs

- **Load `ricdom-ui.css` before the app's own stylesheet.** The sheet always carries base
  rules for inputs, textareas, buttons and selects at single-class specificity (v1's
  `css_for(...)` only injected the requested component families, so apps that never asked
  for those families had nothing to collide with). Placing the `<link>` after the app CSS
  lets equal-specificity library rules win by source order (Raccoon Memo: monospace body
  font and 14 other rules silently overridden). Documented in TUTORIAL §4, SPEC (FACT), and
  `docs/V1_VS_V2.ja.md`; `injectStyles()` appends to the end of `<head>` and has the same
  ordering caveat.

### Fixed

- **`<select>`'s `value` is now reapplied after the patch path grows `<option>`s, not just
  the build path.** `buildDomNode` already reapplied `el.value` once its children (the
  `<option>`s) had been appended, since a browser ignores a `value` assignment that names an
  option not yet in the DOM — but the patch path called `patchAttributes` (which force-
  reapplies `value` every render) *before* `patchChildren`, so a render that both grows the
  option list and points `value` at one of the new options had its assignment silently
  ignored, and nothing reapplied it afterward. Depending on prior selection state, the value
  either stayed stale or (per a jsdom quirk: appending options while nothing is selected
  re-triggers the browser's own "select the first option" default) snapped back to the first
  option — matching the reporter's exact symptom. Fixed by extracting the existing
  build-path logic into `reapplySelectValue(el, normalized)` (`src/dom.ts`) and calling it
  after `patchChildren` at both patch call sites (`patchChildrenByKey` and
  `patchChildrenByPosition`), still honoring the editing guard (`shouldSkipValueReapply`) so
  a `<select>` the user is actively interacting with is not force-corrected mid-edit.
- **A function value passed to a non-`on*` attribute now warns in dev and is never
  stringified into the DOM**, instead of silently becoming a useless `"function foo() {
  ... }"` attribute string. UI components pass unknown props straight through via
  rest-spread (SPEC §10.5); a consumer migrating from v1's snake_case naming (e.g.
  `transform_image_src` instead of `transformImageSrc`, or `on_resize_end`, which doesn't
  match the `/^on[a-z]/` event-handler pattern either) had the resulting prop silently
  routed to `applyPlainAttr`, which used to just `setAttribute(key, String(fn))` — the hook
  never fired, with no signal anything was wrong. A function is never a meaningful HTML
  attribute value, so `applyPlainAttr` receiving one is now treated as confirmed harm
  (design principle, `docs/DESIGN.ja.md` §29): in dev, `console.warn`s once per attribute
  key (deduped via a module-level `Set<string>` so re-renders don't spam); in both dev and
  production, the attribute is no longer set at all. The warning is baked out of production
  builds via the same `bakedDevMode ?? isDevMode()` dead-code-elimination convention as the
  rest of `src/dom.ts` (verified: 0 occurrences in `dist/ricdom.iife.min.js`, present in
  `dist/ricdom.iife.js`). Core min gzip: 4,831B → ~4,877B (+46B, still well under the
  5,200B ceiling).

## [2.0.0-alpha.14] — not yet published

Result of a v1→v2 parity bulk audit (`docs/V1_PARITY_AUDIT.ja.md`): a systematic,
mechanical cross-check of every v1 (`RicDOM-v1`) inline style, implicit behavior, and
official prop/export against v2, run after all ten pilot migrations completed, since past
gaps of this kind (missing z-index, missing position, missing paint, dropped props,
dropped variants) had only ever surfaced one pilot report at a time. The maintainer triaged
all 17 findings and decided to implement all 8 that were actionable now; the remaining 9
are documentation-only clarifications (see Docs below).

### Added

- **`bindRadiobutton(s, key, options?)` / `bindColor(s, key, options?)`** (`ricdom/ui`):
  the `uiRadiobutton`/`uiColor` counterparts of the existing `bindInput`/`bindCheckbox`/
  `bindSelect`/`bindRange`, restoring v1's `bind_radiobutton`/`bind_color`
  (`ric_ui/control/bind_*.js`), both of which were official v1 APIs that had no v2
  equivalent at all. `bindRadiobutton`'s `name` defaults to `key` (matching v1) and can be
  overridden via `options.name` for the case of two independent groups bound to the same
  `key` (radio inputs sharing a `name` are treated as one group by the browser regardless
  of which component rendered them — a plain HTML constraint, not fixable from userspace,
  documented on `uiRadiobutton` already).
- **`exportSettings(el)`** (`ricdom/ui`): the three-group counterpart of `exportTheme`,
  restoring v1's `export_settings` (`ric_ui/context.js`). Returns `{ theme, density,
  fontSize }` (each a `ThemeVars` object) instead of just the theme-only object
  `exportTheme` returns — `exportSettings(el).theme` always equals `exportTheme(el)`, since
  both use the same variable-name classification. Round-trips directly into
  `applyTheme(el2, exportSettings(el1))`.
- **`version` export** (`ricdom` and `ricdom/ui`): a `string` matching `package.json`'s
  `version` at publish time, restoring v1's `version` export from both `src/ricdom.js` and
  `ric_ui/index.js`. Baked in at build time via a new `__RICDOM_VERSION__` constant
  (`src/env.d.ts`), defined by `tsup.config.ts` for every entry (ESM, CJS, and all four
  IIFE builds) from `package.json`'s `version` field — unlike `__RICDOM_DEV__`, this
  constant is not a dev/prod switch, so it's defined unconditionally rather than left for
  the consumer's own bundler. `vitest.config.ts` defines the same constant (per test
  project, since `test.projects` entries don't inherit a root-level `define`) so
  `version === package.json.version` can be asserted directly in tests without a build
  step. Core min gzip: **4,803B → 4,831B** (+28B, well under the 5,200B ceiling).
- **`DialogProps.triggerVariant?: UiButtonVariant`**: restores v1's `trigger_variant`
  (`ric_ui/popup/create_ui_dialog.js`), applied to the auto-trigger button built from
  `triggerChildren` (the same `ric-button--${variant}` class naming `uiButton` already
  uses). Defaults to `'primary'`, matching v1. Has no effect in controlled mode or when
  `triggerChildren` is omitted (the consumer supplies their own trigger in both cases).
  **Visible change for `2.0.0-alpha.13` and earlier consumers**: the auto-trigger used to
  render as a plain `.ric-button` (v2 carried the v1 key as dead code and never applied
  it), so an existing `triggerChildren` dialog now shows a primary-styled trigger. Pass
  `triggerVariant: 'default'` to keep the plain look. The v1 default was kept on purpose
  (design doc §20: an official v1 behavior is restored by default) rather than freezing
  the accidental alpha look.

### Fixed

- **`createFocusWhen` no longer focuses a `disabled` element**, restoring a guard v1's
  `focus_when.js:45` had (`if (!el.disabled && ...) el.focus();`) that `createFocusWhen`
  never picked up when it was ported. When the `ref`'d element is found but `disabled`, the
  focus call is now skipped — silently, without the "ref not found" `console.warn`, since
  the ref *was* found; `disabled` is an ordinary, consumer-intended state, not a
  misconfiguration.
- **`UiInputProps` now declares `maxlength?: number`**, matching v1's `ui_input.js` (same
  lowercase attribute name, same as `UiTextareaProps.maxlength` already had). The attribute
  itself already worked at runtime (it passed through the existing rest-spread contract
  undeclared), so this is a type-only fix — `uiInput({ maxlength: 10 })` previously worked
  without type errors only because of the props interface's index signature, but wasn't
  discoverable from the type or documented.
- **`internal/hljs.ts`'s `warnHljsMissing` no longer assumes `console`/`console.warn`
  exist**, restoring a guard v1's `_factory_helpers.js:59-69` had
  (`typeof console === 'undefined' || typeof console.warn !== 'function'`) that was lost
  when the helper was ported to v2. In an environment without a usable `console`, the
  function now returns without marking the "already warned once" flag, so a
  `console.warn` still fires the first time it's called after `console` becomes usable
  (rather than a broken `console.warn` call throwing, or a real warning opportunity being
  permanently consumed by an environment that couldn't have received it anyway).

### Docs

- `src/ui/toast.ts`'s header comment claimed `role`/`aria-live` were "already implemented
  in v1, inherited as-is" — false; grepping v1's `create_ui_toast.js` in full confirms it
  has neither attribute. Corrected to state these are new in v2.
- `docs/V1_VS_V2.ja.md`: five clarifications from the audit — (1) `.ric-dropdown__trigger--label`'s
  CSS `width` is `auto` in v2 vs. `100%` in v1, an intentional change three pilots
  (Trend Guard, 線茶, Potopeta) have already confirmed doesn't affect their layouts; (2)
  `watch_outside_click` has no v2 equivalent (it was a five-line internal helper in v1;
  the one-line `document.addEventListener('pointerdown', ...)` replacement is now spelled
  out); (3) `create_ui_panel` (the stateful panel factory) is gone — express the same
  result as a stateless `uiPanel` plus `applyTheme` on the element (a themed "island");
  (4) `class` now additionally accepts a `Record<string, boolean>` truthy-key map, on top
  of the string/array forms v1 had; (5) there is no v2 equivalent of `bind_tabs` — it's
  unnecessary, since `createTabs` itself now handles both controlled and uncontrolled
  modes internally.
- `docs/SPEC.md`: four FACTs added — (1) no built-in mechanism keeps multiple
  `applyTheme`d roots in sync (no `ric-theme-change`-style event exists; the consumer
  calls `applyTheme` on every root itself); (2) popup/dropdown positioning is
  viewport-based only, with no containing-block search up the DOM tree (v1's
  `_get_portal_cb`/`_get_expand_ref` are not ported — could theoretically diverge inside a
  `cyber`/`aqua` `.ric-panel`'s `backdrop-filter`, unconfirmed in practice); (3) `on*`
  handling of `null`/`undefined` is subtle and phase-dependent (build vs. patch) but,
  after reading both `src/dom.ts` and v1's `src/ricdom.js`, turns out to be identical
  between v1 and v2 — documented so it isn't mistaken for v2-only behavior; (4) a tweak
  folder is a `<button aria-expanded>` + `<div role=region hidden>`, not v1's native
  `<details>` — functionally equivalent except for in-page find's automatic-expand
  behavior on closed `<details>`, which the `hidden` `<div>` doesn't reproduce (revisit
  with `hidden="until-found"` if requested).
- `docs/API_AUDIT.ja.md`: addendum for the five new/changed public API surfaces above
  (`bindRadiobutton`, `bindColor`, `exportSettings`, `version`, `DialogProps.triggerVariant`),
  confirming naming-convention compliance.
- `docs/V1_PARITY_AUDIT.ja.md`: table rows #1–#8 updated to record that all eight were
  implemented in this release.

## [2.0.0-alpha.13] — not yet published

A differential-experiment report from the ninth pilot (Potopeta), confirmed against the code
by the maintainer before implementation: 2.0.0-alpha.11's array dev-warning coverage (above)
broke the very canon pattern it was supposed to make silent.

### Fixed

- **The `app.pages = [...app.pages]` canon corrupted the raw state with dev-only Proxies, a
  2.0.0-alpha.11 regression.** Reading an array through reactive state in dev now returns it
  wrapped for the deep-assignment warning (2.0.0-alpha.11); spreading that wrapped array
  (`[...app.pages]`) reads each element through the wrapper's own `get` trap, which handed
  back a wrapper Proxy for every object element instead of the underlying raw object — and
  the fresh array built from that spread, containing those Proxies, was then written straight
  into the raw state on the top-level assignment. Pilot's differential experiment: before the
  spread, `util.types.isProxy(state.pages[0])` is `false`; after it, `true`. From there it
  compounded — reading `pages[0]` again wrapped an already-wrapped Proxy in a second one
  (`deepWarnProxies`'s cache is keyed by the raw object, so a Proxy passed back in got its own,
  separate cache entry), and the nine mutating array methods apply the real method to
  `target`, which by then was an inner Proxy rather than the raw array — so
  `app.pages[0].nodes.push({})`, which should record exactly one pending warning, recorded
  three (`push()`, plus `nodes[0]` and `nodes.length` from element writes happening *inside*
  `push` now going through that inner Proxy's own `set` trap instead of bypassing it). Spread
  three times in a row and the raw state object itself held nested Proxies deep enough that
  `structuredClone()` on the *raw* state (not a value read from it) started throwing
  `DataCloneError` too. The fix (`src/reactivity.ts`) is two-layered, per the pilot's own
  proposal: (1) every place that wraps a value for the warning (or for the existing one-level
  child-Proxy tracking) first normalizes it back to the raw object if it turns out to already
  be a Proxy this library produced, via a shared `Proxy → raw` `WeakMap`, so wrapping is
  idempotent and a cache lookup by a Proxy always resolves to the same entry as a lookup by
  its raw target; (2) every `set` that can receive a value coming from outside (the top-level
  Proxy, the one-level child Proxy, and the warning Proxy's own `set`) now recursively
  unwraps whatever it's given — plain objects and arrays are walked and any Proxy found
  anywhere inside is replaced with what it wraps — before storing it, so a nested spread like
  `{ ...app.pages[0], nodes: [...app.pages[0].nodes] }` can't leave a Proxy behind either. A
  branch that finds nothing to unwrap returns the exact same reference it was given (no
  incidental copying), and a circular reference is not walked twice. Both of the above are
  dev-only (`bakedDevMode ?? isDevMode()`, same discipline as everywhere else in the file) —
  in production this code path doesn't exist, since state reads there are never wrapped in
  the first place. See `docs/SPEC.md` §3 for the updated FACT.

### Verified

- Unit (jsdom, `tests/arraySpreadProxyLeak.test.ts`, new): confirmed red-first against the
  pre-fix code — `app.pages[0].nodes.push({})` after a deep write + `app.pages =
  [...app.pages]` in a separate task warned 3 times (now 1); `util.types.isProxy(raw.pages[0])`
  was `true` after the spread (now always `false`, checked directly against the object passed
  into `createReactiveState`, not a value read back through it); the nested-spread case left a
  Proxy in `raw.pages[0].nodes`/`.page` (now doesn't); `structuredClone(raw)` after three
  spreads threw `DataCloneError` (now succeeds). Also covers: a `wrapChild` Proxy
  (`app.user`) assigned into a fresh array unwraps to the original raw object (same
  reference, since nothing inside it changed); the same raw object always gets back the same
  cached warning Proxy, before and after a spread that doesn't otherwise touch it; assigning a
  value that contains no Proxy anywhere stores the exact same reference (no copying); in
  production the new unwrap code doesn't run at all (assignment stores the given reference
  unchanged). The existing deferred-warning suites (`tests/deepAssignPendingDiscard.test.ts`'s
  four canon-is-silent cases, one forgot-to-trigger case, and the await-crosses-a-task case;
  `tests/devArrayDeepWarning.test.ts`) are unaffected by this change. 582 unit tests total
  (was 573).
- Core min gzip: **4,801B → 4,803B** (+2B; raw minified byte length 12,140B → 12,141B, +1B).
  Confirmed via `grep` (after decoding `\uXXXX` escapes) that none of the new dev-only code —
  `rawByProxy`, `toRaw`, `isPlainRecursable`, `unwrapDeep` — nor any of their identifying
  calls (`Object.getPrototypeOf`, an extra `Object.keys`, a `WeakSet`) appear anywhere in
  `dist/ricdom.iife.min.js`; `new WeakMap`/`new Proxy` counts are unchanged from the prior
  release. The always-shipped code paths this change touches (`wrapChild`, the top-level
  `set` trap) were deliberately written so their production branch is byte-identical, source
  line for source line, to what shipped before this release — confirmed by pretty-printing
  and diffing both bundles, which shows every changed line is a pure minifier identifier
  rename (same total statement count, 406 lines either way), not new logic. The remaining +2B
  is minifier identifier-slot churn from the larger dev-only source, not a functional
  addition. Dev IIFE gzip: 8,229B → 8,633B (+404B, the actual cost of the new dev-only
  idempotency/unwrap machinery; no ceiling applies to the dev IIFE).

## [2.0.0-alpha.12] — not yet published

A report from the tenth pilot (線茶/Sencha, a Rancha-derived Electron app that migrated
successfully at alpha.9), triaged and verified by the maintainer before implementation.

### Changed

- **`createPopup`/`createDropdown` now light-dismiss on an outside click instead of
  swallowing it.** Before this release, opening either component rendered a full-viewport
  `.ric-popup__overlay` with `pointer-events: auto` and an `onclick` that closed it — since
  the overlay covers the entire viewport, a click meant for anything else underneath it was
  entirely consumed: closing the popup/dropdown was the only effect, and the actually-intended
  target required a *second* click. This surfaced as a 30-second Playwright actionability
  timeout on an "open a dropdown, then click a different button" E2E test (the overlay
  intercepted the click, so the target button was never considered actionable), and as "the
  first click just closes it" for real users. The overlay element is unchanged in every other
  respect (still rendered while open, same `.ric-popup__overlay` class, same `popup-overlay`
  role, same z-index) — it is now `pointer-events: none` and carries no `onclick`, existing
  purely as a visual/role marker. Closing is now driven by a `document` `pointerdown` listener
  (capture phase, bound only while open, unbound on close/`dispose()`) that closes
  (`doClose()`, no forced focus restore) whenever the pointerdown's target is outside both the
  rendered body and the trigger button — a click on the trigger itself is excluded from this
  check and left entirely to the trigger's own existing open/close toggle, so a second click on
  the trigger still closes exactly once and still restores focus to it. This mirrors HTML's own
  `popover="auto"` light-dismiss behavior rather than a modal backdrop; `createDialog`'s
  `.ric-dialog__overlay` is deliberately unaffected (it stays a `pointer-events: auto` modal
  backdrop by design). See SPEC.md §10.3.1e for the full FACT.

### Fixed

- **`DropdownProps.label` was `string`-only** while `PopupTriggerObject.label` (the
  equivalent field on `createPopup`'s trigger object form) had already been `RicNode |
  RicNode[]` since 2.0.0-alpha.2 — a label mixing in a `uiIcon(...)` (e.g. `[uiIcon(ICON),
  ' テーマ']`) could be built for a popup trigger but not for a dropdown trigger, an
  asymmetry with no reason behind it. `DropdownProps.label` is now `RicNode | RicNode[]` to
  match; a plain string still works exactly as before (`string` is a `RicNode`). Type-only
  change, no behavior change: the implementation already just needed
  `Array.isArray(label) ? label : [label]` fed into the label `<span>`'s `children`.

### Docs

- **`docs/V1_VS_V2.ja.md`**: added a note to the machine-conversion section that a vdom
  generator *vendored from an upstream project* (one that still returns v1-shaped `{ tag,
  ctx }` nodes — e.g. 線茶 syncing Rancha's dxf-to-svg generator) should be excluded from a
  repo-wide `ctx`→`children` conversion entirely; convert only at the single boundary where
  its output enters your own tree (a recursive `ctx`→`children` pass in the adapter), and drop
  that boundary conversion once the upstream project itself moves to v2. Also noted, in the
  same section: a conversion script should print how many replacements it made — a past
  incident lost the `\b` word-boundary escape when a regex was piped through a shell heredoc,
  silently reducing the match to zero replacements. `docs/SPEC.md` §10.3.1a gained a short
  paragraph on `label`'s type (both components now share `RicNode | RicNode[]`), §10.3.1e is
  a new FACT for the light-dismiss behavior above, and `docs/API_AUDIT.ja.md` gained a
  post-audit tracking entry for the `DropdownProps.label` type change. §3 gained a FACT (from
  an 11th-pilot report) spelling out that *any* same-task top-level trigger clears the whole
  deep-assignment pending set regardless of path, and the array-mutating-method dev warning's
  parenthetical was corrected (it used to claim mutating methods were undetected, which was
  stale leftover text from before alpha.11 — they are detected and warned on).

### Verified

- Unit (jsdom): `DropdownProps.label` accepting a `RicNode[]` (icon + text) renders both parts
  in the trigger button, label mode still detected via the same truthiness check. 573 unit
  tests total (was 572).
- Real browser: new light-dismiss coverage in `tests/browser/uiPopup.test.ts` (4 tests) and
  `tests/browser/uiDropdown.test.ts` (3 tests) — outside click closes and the same click still
  reaches an unrelated button's own `onclick` (confirmed red against the pre-fix code: a
  `userEvent.click` on the outside button hit a 14-second-plus Playwright actionability
  timeout, `<div class="ric-popup__overlay">... subtree intercepts pointer events`, reproducing
  the reported bug exactly), a click inside the body (dropdown: toggling a checkbox; popup: a
  non-menuitem area) does not close it, a second click on the trigger still closes exactly once
  and still restores focus to it (this assertion catches a regression where the outside-click
  path would otherwise also fire on the trigger's own click and suppress the toggle's focus
  restore), and a popup opened via `openAt()` (no trigger ever clicked) still light-dismisses on
  an outside click. `tests/browser/portalContract.test.ts` gained one more cross-component
  case (popup + dropdown) for the same "closes and the click passes through" contract, using
  the file's existing build/open harness. 139 browser tests total (was 130).
- `npm run test:examples` (production IIFE) unaffected: 0 deep-assignment/console warnings,
  all 6 example pages pass.
- Core min gzip: **unchanged at 4,801B** (no core files touched — `src/*.ts` at the top level
  was not modified, only `src/ui/popup.ts`/`dropdown.ts`/`cssTemplates.ts`). UI IIFE min gzip:
  24,408B → 24,975B (+567B; the `document`-level pointerdown listener, its bind/unbind
  bookkeeping, and the new trigger-marker attributes/queries, duplicated across
  `createPopup`/`createDropdown`).

## [2.0.0-alpha.11] — not yet published

A minimal-repro report from the ninth pilot (Potopeta), confirmed against the code by the
maintainer before implementation: the dev-mode deep-assignment warning (`src/reactivity.ts`)
never fired for anything reached through an array, at any depth, because the code that wraps
values for the warning skipped arrays outright. Since list-shaped state (`pages[]`, `items[]`)
is exactly the shape most consumers reach for the deepest assignment, this was a real blind
spot in the warning's coverage, not a cosmetic gap.

A second finding from the same pilot, this time as a push-before-merge review rather than a
runtime repro: extending the warning to arrays (below) made an existing problem with its
*timing* much more visible. v1's own documented pattern for a deep update writes the nested
value in place and only afterward triggers the render that will pick it up
(`app.pages[0].page.width = 1; app.pages = [...app.pages];`) — assign first, trigger second.
Warning at the moment of the first line, which is what this warning had always done, fires on
every single instance of that canon-compliant pattern; Potopeta's codebase had several dozen
call sites in exactly that shape, producing hundreds of runtime warnings and burying the one
case the warning exists to catch. See "Changed" below for the fix.

### Added

- **Dev-mode deep-assignment warning now covers arrays, from the first level down.** Reading
  an array through reactive state in a dev build (`dist/ricdom.iife.js`, or `NODE_ENV !==
  'production'` in ESM/CJS) now returns a read-only-style Proxy of it, matching what already
  happened for plain objects one level deep. Element assignment (`arr[0] = x`), `length`
  assignment, and `delete arr[i]` warn with the element's full path (e.g.
  `"pages[0].page.width"`); reading further into an object or array reached through an index
  keeps recursing through the same wrapping, so `app.pages[0].page.width = 1` now warns
  exactly like `app.o.p.q = 2` already did (subject to the deferred timing described under
  "Changed" below). The nine mutating array methods
  (`push`/`pop`/`shift`/`unshift`/`splice`/`sort`/`reverse`/`fill`/`copyWithin`) queue at most
  one warning per *call*: the wrapped method records one pending entry, then applies the real
  method directly to the underlying (unwrapped) array, so a `sort()` on a five-element array
  doesn't produce five pending entries from element writes happening inside the sort. Every
  non-mutating read — `map`/`filter`/`slice`/`forEach`/`find`/`includes`/`indexOf`/`join`/
  `concat`/`flat`/`entries`/`keys`/`values`/`for...of`/`Array.isArray()`/`JSON.stringify()`/
  `length` reads — stays silent and returns the same values a production build would. **What
  does not change**: arrays remain entirely untracked for render scheduling at any depth
  (`app.list = [...app.list]` is still the one supported replacement pattern) — this release
  only extends the dev *warning*'s coverage to match that existing tracking rule, it does not
  change what gets tracked. Production (`.iife.min.js`, `__RICDOM_DEV__` baked `false`) is
  unaffected: array reads stay the plain, unwrapped array, and the new code is fully removed
  by dead-code elimination (core min gzip essentially unchanged, see below).

### Changed

- **The deep-assignment dev warning no longer fires at the moment of assignment — it is
  deferred to the end of the current task, and only fires if the task ends without anything
  ever triggering a render.** (Push-before-merge finding from the ninth pilot, Potopeta, see
  above.) A deep `set`/`deleteProperty`/mutating-array-method call now only records its path
  in a small per-`createApp` pending set and schedules a single `queueMicrotask` flush,
  instead of calling `console.warn` immediately. Anything that means "the render will pick
  this up" — a tracked top-level or one-level-deep assignment (i.e. anything that calls
  `notify`), or an explicit synchronous `renderNow()` — clears the entire pending set before
  that microtask runs, because the render it triggers re-reads the whole state tree and
  therefore also picks up the deep write made earlier in the same task, tracked or not. Only
  entries still pending when the microtask actually runs produce a `console.warn`, one per
  distinct path (repeated assignments to the same path within the task collapse into a single
  warning). This makes v1's own canonical deep-update pattern — write deep, then trigger by
  touching something tracked, in the same synchronous task — entirely silent, which it was
  never supposed to warn about in the first place. An assignment that never gets picked up in
  the same task, including one separated from its trigger by an `await` (a `queueMicrotask`
  runs before the next tick resolves, so the flush has already happened by the time execution
  resumes), still warns — this is intentional, not a gap, since state left half-updated across
  an `await` is a real staleness window independent of this warning.

### Docs

- **`docs/SPEC.md` §3** split the previous single "arrays are never wrapped" sentence into
  two separate claims that were being conflated: tracking (unchanged, arrays never
  scheduled a render at any depth) and the dev warning (changed by this release, arrays now
  wrapped from the first level down). Added a FACT: because dev-mode reads return Proxy
  wrappers, passing a value read from state straight into `structuredClone()` or
  `postMessage()` throws `DataCloneError` in dev builds (this was already true for plain
  objects below the first level; it is now also true for arrays from the first level down).
  This is a consequence of the wrapping the warning needs, not a bug — copy the value first
  (`JSON.parse(JSON.stringify(v))` or a spread) if you need to hand it to one of those APIs.
  Rewrote the warning's own description to explain the deferred/`queueMicrotask` timing above,
  including the v1-canon-is-silent and await-crosses-a-task-boundary-and-still-warns FACTs.
  `docs/TUTORIAL.md` §3 updated to match (a couple of sentences, no structural change).

### Verified

- Unit (jsdom): the table of previously-invisible cases (`app.arr[0].x`, `app.arr[0].p.q`,
  `app.pages[0].page.width`, the `app.pages = [...app.pages]` canon staying silent) each
  warn exactly once after a microtask flush (or zero times for the canon replacement, checked
  both immediately after the assignment and after the flush); `push`/`splice`/`sort` each
  warn exactly once per call; `map`/`filter`/`for...of`/`Array.isArray`/`JSON.stringify`/
  `length` produce no warnings; production (`NODE_ENV=production`) leaves the array unwrapped
  (`state.arr === raw.arr`). New: a dedicated suite for the deferred-timing contract
  (`tests/deepAssignPendingDiscard.test.ts`) covers the four Potopeta-canon cases (deep write
  + array spread in the same task, deep write + unrelated top-level `++`, several deep writes
  batched before one spread, deep write + `renderNow()`) staying silent, plus the
  forgot-to-trigger cases (single path, same path repeated, two distinct paths, a lone
  `push()`) still warning, plus the await-crosses-a-task case warning even though a trigger
  eventually follows. Confirmed red-first against the pre-fix code (commit `1bd53fb`): all
  four Potopeta-canon cases produced warnings there (1, 1, 2, and 1 respectively) before this
  fix. 572 unit tests total (was 559).
- Real browser (`tests/browser/devIifeWarn.test.ts`): `dist/ricdom.iife.js` warns once for
  `app.pages[0].page.width = 1` alone, after a microtask flush, and stays silent for the same
  write followed by `app.pages = [...app.pages]` in the same task (new tests, both cases);
  `dist/ricdom.iife.min.js` does not warn for the same assignment and does not wrap the array
  (`structuredClone` succeeds); `dist/ricdom.iife.js` throws on `structuredClone(app.arr)`
  (the FACT above, pinned as a regression test). 130 browser tests total (was 129).
  `npm run test:examples` (production IIFE, unchanged) and a one-off dev-IIFE pass over the
  same `examples/*.html` (not checked in — swaps in `ricdom.iife.js`/`ricdom-ui.iife.js` and
  exercises each page's tabs/accordion/collapse/popup triggers) both produced zero deep-
  assignment warnings, confirming the examples and UI components' existing `.map()`-over-
  `items` render code isn't a false positive under the new coverage or the new timing.
- Core min gzip: **4,767B → 4,801B** (+34B; raw minified byte length 12,053B → 12,140B,
  +87B). The only string from this change that survives in `dist/ricdom.iife.min.js` is the
  `pending` property name, reached through `clearPendingDeepWarnings()` — the one function
  `renderNow()` must call unconditionally (across a module boundary, so esbuild can't fold it
  away) to discard pending warnings before its synchronous re-render, the same kind of small,
  always-present exception `isDevMode()` itself already is. Confirmed via `grep` (after
  decoding `\uXXXX` escapes) that none of the other new strings — `pending` context internals
  (`microtask`, `queueMicrotask`, `flushScheduled`, `PendingWarnCtx`, `scheduleFlush`,
  `recordPendingWarning`, `pendingWarnByRawState`) or the new warning wording (`発火されませ
  んでした`) — appear anywhere in the production bundle. Dev IIFE gzip: 7,956B → 8,244B
  (+288B, the actual cost of the new dev-only pending/microtask machinery, which is fine
  since the dev IIFE has no gzip ceiling).

## [2.0.0-alpha.10] — not yet published

Four reports from the ninth pilot migration (Potopeta = a RicUI theme/component designer,
5,647 lines + 906 tests, distributed as a self-contained HTML bundle built with v1's LZ
self-extraction tool), triaged and verified against the code by the maintainer before
implementation.

### Added

- **`createDensity(base, overrides)` / `createFontSize(base, overrides)`** (`ricdom/ui`):
  the `density`/`fontSize` counterparts of `createTheme`, restoring v1's
  `create_density`/`create_font_size` (`ric_ui/context.js`), which return a plain variable
  map as a value rather than requiring `applyTheme` to be called first. Before this
  release, reading a density/font-size preset's computed CSS variables required calling
  `applyTheme` on a detached element and reading them back off `el.style` — undocumented,
  and dependent on `applyTheme`'s internal (non-public) variable names. Both functions
  accept a bundled name or your own `ThemeVars` object as `base`, merge in `overrides`, and
  return a `ThemeVars` object suitable for passing straight into
  `applyTheme(el, { density: createDensity(...) })` / `applyTheme(el, { fontSize:
  createFontSize(...) })` — this round-trips exactly with what `applyTheme` computes from
  the same name. An invalid string `base` warns using the same rule as `applyTheme`'s
  invalid-name warning (dev builds only), since both reuse the same name-resolution
  helpers.
- **Unminified dev IIFE builds**: `dist/ricdom.iife.js` / `dist/ricdom-ui.iife.js`, built
  without `NODE_ENV` statically inlined to `'production'` and without minification.
  `dist/ricdom.iife.min.js` / `dist/ricdom-ui.iife.min.js` remain the production builds,
  unchanged (still subject to the core gzip ceiling). Before this release, the only IIFE
  builds shipped were the production ones, which meant the dev-mode console warnings
  documented elsewhere in this project (deep-assignment tracking, duplicate keys, etc.)
  could not actually be observed by anyone using the single-`<script>`-tag distribution
  form, contradicting the "dev builds warn" story told everywhere else in the docs. This
  mirrors the development/production split React and other major libraries ship. Use the
  `.iife.js` build during development, `.iife.min.js` for what you ship — see the README
  Quick start.

### Fixed

- **The IIFE builds now assign their global explicitly, so they survive being `eval`'d
  inside a function scope (#Potopeta)**: esbuild's IIFE output is a bare top-level `var
  ricdom=(()=>{...})();` (same for `ricdomUI`). A normal `<script>` tag executes at global
  scope, where a top-level `var` becomes a `window` property, so this was never a problem
  for ordinary usage — but Potopeta's self-contained HTML bundle restores its embedded code
  through v1's LZ self-extraction tool, whose decompression wrapper evaluates the restored
  source as `(()=>{ eval(s) })()`, i.e. **inside a function scope**. A `var` declared inside
  a function scope is local to that function and never reaches `window`/`globalThis` at
  all, so after decompression, `window.ricdom` (and `window.ricdomUI`) simply didn't exist
  — even though the exact same code, loaded via a plain `<script src>`, worked fine. v1's
  own LZ-self-extracting builds already carried an explicit global assignment as protection
  against exactly this, and v2's esbuild-based IIFE output never picked up the equivalent —
  an asymmetry nobody had reason to notice until a consumer combined the two independently
  evolving tools. Fixed by adding a `footer: { js: 'globalThis.ricdom=ricdom;' }` (`ricdomUI`
  analogously) to each of the four IIFE entries in `tsup.config.ts` — a statement in the
  same lexical/function scope as the preceding `var` declaration can always read it,
  regardless of how many scopes the whole file itself is nested inside when it runs. New
  tests in `tests/browser/iifeSmoke.test.ts`/`uiIifeSmoke.test.ts` evaluate the built file
  via `new Function(code)` (which, like the LZ tool's `eval`, creates a fresh function
  scope) and assert `globalThis.ricdom`/`globalThis.ricdomUI` end up defined; both were
  confirmed red (the global stayed `undefined`) before the footer was added. Core gzip:
  **5,169B → 5,182B** (+13B, `globalThis.ricdom=ricdom;` on the core build only — the `ui`
  IIFE has no gzip ceiling), still under the 5,200B budget.
- **CSS-loaded detection (`warnIfStylesMissing`) no longer false-positives when the raw CSS
  is inlined directly into a `<style>` tag (#Potopeta)**: the check only ever looked for
  `injectStyles()`'s own marker (`style[data-ricdom-role="styles"]`) or a
  `link[href$="ricdom-ui.css"]`, so a single-file distribution that embeds
  `ricdom-ui.css`'s text directly inside a plain `<style>` tag (as Potopeta's self-contained
  HTML bundle does) matched neither, and was warned at as "not loaded" even though the
  styles were, in fact, present and working. Fixed by additionally scanning
  `document.styleSheets` for a `CSSStyleRule` whose selector includes `.ric-button`
  (cross-origin sheets, which throw on `.cssRules` access, are skipped and don't count
  against the check) — checking whether ricdom's rules are actually *in effect* is a more
  direct test than looking for a particular loading mechanism, and covers any future
  loading method the same way. `buildStylesheet()`'s output also now starts with a
  `/*! ricdom-ui */` marker comment (kept by most minifiers due to the `/*!` convention) as
  a human-readable identifier, independent of the `styleSheets` check that actually drives
  the warning. New browser tests in `tests/browser/uiStylesInlineDetect.test.ts` cover:
  inlined raw CSS in a `<style>` (no warning — confirmed red before the fix), nothing
  loaded (warns once), an existing `<link>` (no warning), and an unrelated `<style>` that
  doesn't contain `.ric-button` (still warns).
- **`dist/ricdom.iife.min.js` (production) no longer ships live dev-mode warning code in a
  plain browser with no `process` global** — the primary target of a `<script src>`
  distribution. `isDevMode()` (`src/reactivity.ts`) previously read
  `typeof process === 'undefined' || typeof process.env === 'undefined' ||
  process.env.NODE_ENV !== 'production'`; tsup's `define` only replaces the
  `process.env.NODE_ENV` token, so the first two `typeof` guards stayed live code and
  evaluated `true` whenever `process` didn't exist, making `isDevMode()` return `true` in
  "production" too — the deep-assignment and duplicate-`key` warning code (and their
  strings) shipped active, un-eliminated, in every alpha.9-and-earlier `.iife.min.js`.
  Fixed by introducing a build-time constant `__RICDOM_DEV__` (`declare`d in
  `src/env.d.ts`), baked to `false`/`true` by `tsup.config.ts`'s `define` for the four IIFE
  entries (`.iife.min.js`/`.iife.js`, core and `ui`) and left unset for ESM/CJS. The two
  call sites (`src/reactivity.ts`'s deep-read trap, `src/dom.ts`'s duplicate-`key` check)
  reference the baked constant with it as the **left** operand of `??`/`&&`
  (`bakedDevMode ?? isDevMode()`, dev-flag check before the other condition) rather than
  calling `isDevMode()` directly — esbuild does not propagate a function's constant return
  value across the call boundary, so calling `isDevMode()` directly left the warning code
  physically present (confirmed by direct esbuild experiments during this fix); only a
  bare constant referenced first in the condition gets properly dead-code-eliminated.
  `tests/browser/devIifeWarn.test.ts` no longer shims `window.process` — it now asserts the
  real condition (no `process` global at all) directly. Core gzip: **5,182B → 4,774B**
  (net **−408B**, comfortably under the 5,200B ceiling — the removed dead code was larger
  than the constant-check overhead added).
- **`dist/ricdom-ui.iife.min.js` (production `ui`) no longer ships its three dev-only
  warnings live in a plain browser with no `process` global** — the same root cause as the
  core fix above. `src/ui/internal/pureHelpers.ts` has its own copy of `isDevMode()` (kept
  separate on purpose: `ricdom/ui` has zero runtime dependency on the core), and it had the
  identical `typeof process` guard hole; the `__RICDOM_DEV__` `define` already added to the
  `ui` IIFE entries by the core fix had no effect because this copy never read it. Fixed the
  same way: a `bakedDevMode` top-level constant in `pureHelpers.ts`, and the three call
  sites (`createFocusWhen`'s "ref not found", `uiInlineMenu`'s "parent has no position",
  `applyTheme`'s "invalid theme/density/fontSize name") now reference it as the **left**
  operand (`bakedDevMode ?? isDevMode()`, or `!(bakedDevMode ?? isDevMode())` for the
  early-return form) instead of calling `isDevMode()` directly. Two more esbuild
  observations were made while doing this and are documented in the source comments:
  (1) in one bisection with direct esbuild builds (0.27.7), `bakedDevMode` placed *after*
  the `UI_ROLE` object literal stayed a live variable at every call site and the warnings
  survived, while placing it first in `pureHelpers.ts` let them fold — a second,
  independent set of clean rebuilds could **not** reproduce the failure with the original
  order, so the causal rule is unconfirmed; the constant is kept at the top of the file
  because that ordering is harmless and is the configuration that was verified;
  (2) esbuild's tree shaking decides which declarations to keep from
  parse-time reference counts, before the constant is substituted, so guarding the *call*
  to a separate helper (`if (baked ?? …) scheduleParentPositionCheck()`) removed the call
  but left the helper — and its warning string — in the bundle. `uiInlineMenu` therefore
  puts the check as an early return *inside* `scheduleParentPositionCheck`, which lets
  esbuild fold the whole body (rAF + `getComputedStyle` scan) down to an empty function.
  Verified by escape-aware grep (esbuild emits `\uXXXX` for non-ASCII) that all three
  warning strings are absent from `dist/ricdom-ui.iife.min.js` and present in
  `dist/ricdom-ui.iife.js`. `ui` gzip: **24,970B → 24,472B** (net **−498B**).
  `tests/browser/devIifeWarn.test.ts` gained the `ui` counterpart of the core assertions
  (`applyTheme` with an invalid `density` warns from `.iife.js`, stays silent from
  `.iife.min.js`, in a real browser with no `process` global).

### Docs

- `docs/V1_VS_V2.ja.md`: noted that `density`'s valid values are the same three
  (`comfortable`/`compact`/`tight`) in both v1 and v2 — v1 silently fell back to the
  default for anything else (e.g. `spacious`) too, it just never warned about it; added
  notes on the LZ self-extraction footer fix and the inline-`<style>` CSS-detection fix
  above; noted that `createTabs` is a stateful component (`app.use()` required) where v1's
  `ui_tabs` was a pure function.
- `CHANGELOG.md` (this entry) and `package.json` version bumped to `2.0.0-alpha.10`.
- README (EN/JA): one line after the Quick start snippet pointing at `.iife.js` (dev,
  warnings enabled) vs. `.iife.min.js` (what to ship).
- `docs/SPEC.md` §8 (Themes): documented `createDensity`/`createFontSize`.
- `docs/API_AUDIT.ja.md`: addendum for the two new `ricdom/ui` exports, confirming naming
  convention compliance (`create` + noun, same shape as `createTheme`).
- `docs/SPEC.md` §3 ("Dev-mode warning for untracked deep assignment"): corrected the
  false "dead-code elimination removes this in the shipped bundle" claim to describe the
  actual per-distribution-format behavior (`.iife.min.js` DCE'd via `__RICDOM_DEV__`,
  `.iife.js` always warns, ESM/CJS defer to the consumer's bundler, a no-bundler ESM import
  falls back to dev mode) — see the `isDevMode()` fix above.
- `docs/SPEC.md` §8 (`applyTheme` invalid-name warning FACT) and §10.3.2
  (`createFocusWhen`): replaced the bare `process.env.NODE_ENV !== 'production'` wording
  with the same per-distribution-format rule for `ricdom/ui` (`ricdom-ui.iife.min.js` DCE'd
  via `__RICDOM_DEV__`, `ricdom-ui.iife.js` always warns) — see the `ui` fix above.

## [2.0.0-alpha.9] — not yet published

Five reports from the eighth pilot migration (LCP = Local Code Pilot v2, an Electron
classic-script + `contextIsolation` app using both `ricdom`/`ricdom/ui` as IIFE globals,
confirmed migrated successfully at `2.0.0-alpha.8`), triaged and verified against the code
by the maintainer before implementation.

### Fixed

- **`createDialog`/`createPopup`/`createDropdown` had no `z-index`, so `createSplitter`'s
  divider could draw on top of them (#1)**: when the CSS layer was split out of inline
  styles into `ricdom-ui.css` classes, the `z-index: 500`/`501` (dialog overlay/body) and
  `z-index: 401` (popup/dropdown overlay/body, tooltip already had it) that v1 held as
  inline styles (`ric_ui/popup/create_ui_dialog.js`, `create_ui_popup.js`,
  `_popup_utils.js`) never made it into the corresponding CSS classes. In practice, any
  other rule that happened to declare a `z-index` — `.ric-splitter__divider { z-index: 1 }`
  being the one that actually surfaced this on a real app — was then the only element with
  a stacking order above `auto`, so it painted over an open modal dialog or an open popup
  menu wherever the two happened to overlap on screen. Fixed by adding
  `.ric-dialog__overlay { z-index: 500 }`, `.ric-dialog { z-index: 501 }`, and
  `.ric-popup__overlay` / `.ric-popup__body` / `.ric-dropdown__body { z-index: 401 }` to
  `src/ui/cssTemplates.ts`, restoring the v1 stacking order (toast 600 > dialog 501 >
  popup/dropdown/tooltip 401) exactly. Giving the portal element itself a stacking context
  was considered and rejected: a consumer using `portalTo` to target their own external
  element (outside `ricdom-ui.css`'s reach) would get no benefit from that, whereas
  per-component `z-index` on the overlay/body classes works regardless of where the portal
  physically lives. New tests in `tests/browser/uiZIndex.test.ts` assert (via
  `document.elementFromPoint()` at the actual overlap coordinates) that an open dialog/popup
  wins over a splitter divider they're made to overlap — both were red before this fix.

### Changed

- **`createDialog`'s default initial focus order is now body → footer → close button →
  root, not "first focusable in DOM order" (#4)**: DOM order for a dialog is header (with
  its `✕` close button) → body → footer, so "first focusable in DOM order" always landed on
  `✕` regardless of what the dialog actually contains — meaning every dialog opened with a
  focus ring on its close button, and a screen reader's first announcement was always
  "Close," ahead of whatever the dialog is actually asking the user to look at or do. `[
  autofocus]` still wins over everything (unchanged); absent that, focus now goes to the
  first focusable inside the body, then the first inside the footer/`actions`, then the `✕`,
  then the dialog root as a last resort. This can change the appearance/behavior of
  existing `2.0.0-alpha.x` consumers whose dialogs have a focusable body or footer — the
  visible focus ring on open moves from `✕` to that element. The `Tab`/`Shift+Tab` focus
  trap's cycle order is unaffected (still plain DOM order); only the one-time initial
  target changed. See SPEC.md §10.3.1c and `src/ui/dialog.ts`'s `focusFirstElement`. Tests
  in `tests/browser/uiDialogFocusOrder.test.ts` cover all four cases (body focusable,
  footer-only, neither, `[autofocus]` still wins) and were red before this fix (asserted
  `document.activeElement` landed on the body/footer target, not `✕`); the pre-existing
  `tests/browser/uiDialog.test.ts` and `uiDialogFocusFilter.test.ts` initial-focus
  assertions were updated to the new order.

### Added

- **`createScrollPane`'s follow-scroll now has the same rAF + 200ms `setTimeout` backstop
  double-up as the core scheduler (#5)**: it previously scheduled its post-render
  `scrollTop` application with a bare `requestAnimationFrame`, which — like the core
  render scheduler this mirrors (`src/scheduler.ts`, §4) — stops firing in a hidden
  Electron window (`backgroundThrottling`, see the new SPEC.md §7 FACT below), silently
  breaking auto-follow there. `src/ui/scrollPane.ts` now races an rAF against a 200ms
  `setTimeout`, whichever fires first applies the scroll position and cancels the other
  (same "first wins, second is a no-op" shape as `src/scheduler.ts`, reimplemented locally
  rather than imported — the state needs to live per scroll-pane instance, and this file is
  outside the `src/*.ts` core). New jsdom unit tests in `tests/ui/scrollPane.test.ts` stub
  a non-firing `requestAnimationFrame` and confirm the 200ms backstop still updates
  `scrollTop` (red before this fix — `scrollTop` never moved), and confirm a healthy rAF +
  the backstop together only apply once.
- **`style?: StyleValue` made explicit on stateless component prop types that were missing
  it** (`uiButton`, `uiInput`, `uiTextarea`, `uiCheckbox`, `uiRadiobutton`, `uiSelect`,
  `uiRange`, `uiColor`, `uiSeparator`, `uiMdPre` — an LCP type-review finding). All of these
  already passed `style` through to the rendered node at runtime via the `[key: string]:
  unknown` rest-spread contract (§10.5); only the TypeScript type was missing it, so `style`
  on these components previously typechecked only by falling through the catch-all index
  signature rather than being a documented, autocompletable prop. No runtime behavior
  change. See SPEC.md §10.5.

### Docs

- **TUTORIAL.md / V1_VS_V2.ja.md**: documented a `createApp` pitfall from the LCP migration
  (#2) — because `createApp` runs its first render synchronously during the call itself, a
  render function that closes over a `const` declared *after* the `createApp(...)` call (in
  the same module) hits a temporal-dead-zone `ReferenceError`, not the `console.error`+NOOP
  of the `use()`-ordering mistake documented alongside it. Cross-referenced with the
  `2.0.0-alpha.8` "`app.render` reassignment" pattern, which is also the fix (the real
  render function isn't called until it's assigned) — the same reason v1 code that assigned
  `handle.render = render` only after wiring up its dependencies never hit this.
- **SPEC.md §7**: added a FACT that a hidden Electron `BrowserWindow` throttles not just
  `requestAnimationFrame` (already documented via the scheduler's backstop, §4) but also
  clamps `setTimeout`/`setInterval` to roughly once per second — so the *backstop itself*
  can lag up to ~1s in a hidden window, not just rAF. Confirmed unchanged from v1 (LCP ran
  the same scenario against both and observed the same ~1s lag in each — a Chromium/Electron
  platform behavior, not a ricdom regression). Recommends
  `webPreferences: { backgroundThrottling: false }` for E2E tests driving a window that
  starts hidden or is backgrounded mid-test.
- **API_AUDIT.ja.md**: noted the `style?: StyleValue` additions above.
- **SPEC.md §2.4 / TUTORIAL.md / V1_VS_V2.ja.md**: documented a second alpha.9 follow-on
  from #4's new default initial focus (LCP, one further finding from the same pilot) — a
  dialog whose body starts with a focusable `textarea`/`input`/`select` has the editing
  guard active from the moment it opens, so a state-driven write to that field is silently
  skipped while it holds focus. This mainly bites E2E tests: `el.click()` never moves focus
  the way a real mousedown does, so a test that opens the dialog and immediately `.click()`s
  a "reset from state" button sees the guard block the write, whereas a real user's click
  would first move focus off the field and unblock it. Not a bug — write such tests as
  `btn.focus(); btn.click();`.

### Tests

- **`tests/browser/uiZIndex.test.ts`** (+1): added a third z-index/divider-vs-dialog
  variant that reproduces LCP's actual DOM shape more closely than the existing two — the
  splitter is *not* routed around via `portalTo` this time, so it ends up as an actual
  sibling of the dialog's own portal, meaning `createDialog`'s `setInert(true)` makes it
  `inert` (the same structure LCP verified with a pixel-diffed `capturePage()`). Since
  `inert` only removes an element from hit-testing and does not affect paint order, the
  test clears `inert` on the splitter right before calling `elementFromPoint()`, so the
  z-index fix is still what's under test rather than the inert side effect. Confirmed red
  against the pre-#1-fix CSS (`elementFromPoint()` returned the divider); also confirmed
  that the same test *without* clearing `inert` stays green against that same pre-fix CSS
  — i.e. that naive shape would have been a false positive, which is why the existing two
  tests route the portal away from the splitter instead of clearing `inert`.

## [2.0.0-alpha.8] — not yet published

Seven cross-cutting reports from pilots 5-7 (RaccoonMemo, Rancha, Brownies Desktop — three
Electron apps that migrated at the same time), triaged and verified against the code by the
maintainer before implementation.

### Changed

- **`ricdom-ui.css`'s default theme paint and scrollbar rules now have zero specificity**
  (Brownies Desktop #1): `THEME_PAINT_CSS` (`[data-ricdom-theme] { background; color;
  font-size }`) and `SCROLLBAR_CSS` (`[data-ricdom-theme]`/`[data-ricdom-theme] *` and their
  `::-webkit-scrollbar*` rules) were attribute selectors, specificity (0,1,0) — higher than
  a plain element selector like `body { background: ... }` (0,0,1), so a consumer's ordinary
  rule silently lost to this "default" paint despite alpha.3's docs claiming otherwise
  (`applyTheme` an element, then style `body` by tag name and get the theme's color back,
  not yours). Both are now wrapped in `:where(...)` so their specificity is zero — any rule
  of yours, including a bare element selector, wins. `[data-ricdom-role="portal"]:empty {
  display:none }` is unaffected (not a "default" paint). See SPEC.md §8.

### Added

- **`data-ricdom-role="dialog-title"`** on `createDialog`'s `.ric-dialog__title` span
  (Brownies Desktop #2), plus a role audit across dialog/popup/dropdown/toast/tooltip/
  tweakPanel for other `ric-*`-classed elements that had no role: `popup-trigger` (popup's
  trigger button — `createDropdown` had `dropdown-trigger`, popup's equivalent didn't),
  `tooltip-trigger` (tooltip's hover/focus wrapper, distinct from the floating `tooltip`
  popup), `toast-msg` (a toast item's message text), `tweak-title` (the tweak panel's
  optional title), and `button` on `createDialog`'s own trigger button (it builds a raw
  `.ric-button` node instead of going through `uiButton()`, so it had silently been the one
  `.ric-button`-styled element with no role). Repeated per-row decorative sub-parts inside
  `createTweakPanel` (row/folder label spans, the JSON-fallback preview) were deliberately
  left unroled — see SPEC.md §11 and `src/ui/tweakPanel.ts`'s `rowHookAttrs` comment for why.
- **`uiButton`'s `variant: 'link'` restored from v1** (Rancha): strips background, border,
  and the height constraint for a text-like button (breadcrumbs, inline links); ignores
  `size` the same way it ignores density's height. Per DESIGN.ja.md §20 ("a v1 prop that
  was official is restored by default"), not a new design.

### Docs

- **Two-stage wiring**: documented the second sanctioned way to untangle "the part needs
  the app handle; render needs the part" (v1's handle→wire→render-later order) — pass `()
  => null` to `createApp` and assign the real function to `app.render` afterward, which
  renders synchronously right away (an existing but barely-documented contract). There is
  no lenient mode where a missing render skips the first paint. Worked examples added to
  `docs/V1_VS_V2.ja.md` and `docs/TUTORIAL.md`; SPEC.md §5 gained an explicit FACT.
- **Editing guard + programmatic insertion** (RaccoonMemo): documented the consequence of
  the "no `value` reapply while focused" core rule for paste/drag-and-drop text insertion —
  do the insertion against the element (`setRangeText()`/`value` + selection), mirror the
  same value into state, and it will not be clobbered on the next render. SPEC.md's editing
  guard FACT gained this as a direct consequence, not a new recipe.
- **`children` omission = empty element** (Rancha): added a second TUTORIAL migration trap
  (mirroring chapter 3's) — grep the v1 codebase for `ref`-only elements and hosts that get
  `innerHTML` written into them externally, and add `island: true` before migrating.
- **`tag` required** (RaccoonMemo): `docs/V1_VS_V2.ja.md`'s mechanical-conversion section
  gained a note that v1's implicit `tag: 'div'` has no v2 equivalent — grep for
  `{ children: [...] }` literals with no `tag` and add it as a second conversion pass.
- **`docs/API_AUDIT.ja.md`**: recorded the public API additions above (`variant: 'link'`,
  the new `UI_ROLE` entries).

### Tests

- **`tests/browser/uiTheme.test.ts`**: replaced the outdated "override wins because
  specificity is low" test (which actually only proved a class selector + `!important`
  wins, true either way) with one that reproduces the bug directly — a bare `body {
  background: ... }` element selector, no `!important`, now wins against the theme paint;
  before this release it did not.
- **`tests/ui/buttonInput.test.ts`** (+1): `variant: 'link'` produces `ric-button
  ric-button--link`.
- **`tests/browser/uiButtonVariant.test.ts`** (new, 2 tests): `variant: 'link'` computes to
  a transparent background/border-color and smaller padding; a default-variant button in
  the same tree keeps its background and is taller.

## [2.0.0-alpha.7] — not yet published

Two reports from the fourth pilot migration (a bevel-gear reducer design tool, a classic
`<script>`-tag app migrated through a single adapter file, no portal-based components used)
— both confirmed against the code by the maintainer before implementation.

### Added

- **`createAccordion` controlled mode**: `AccordionProps` gains `open?: Record<string,
  boolean>` and `onToggle?: (id, nextOpen, nextMap) => void`, matching `createTabs`'s
  existing controlled/uncontrolled split. Passing `open` makes the accordion controlled —
  the displayed state always follows `open`, header clicks never touch internal state, and
  `onToggle` receives the complete next `{ [id]: boolean }` map (`multi: false` produces a
  map with every other item closed) so a caller can implement it as `onToggle: (id, next,
  map) => { s.x = map; }`. Omitting `open` keeps the existing uncontrolled behavior
  unchanged. There is deliberately **no `setOpen()`** or other imperative method — see
  `src/ui/accordion.ts`'s file header and SPEC.md §10.3.3a for why (one external-control
  mechanism, matching `createTabs`'s `active` prop). `isOpen(id)` returns the correct value
  in both modes.
- **`applyTheme` warns on an invalid `theme`/`density`/`fontSize` string** (e.g. `density:
  'md'`, which isn't a density name): one `console.warn` per `applyTheme` call naming the
  invalid value and which default it fell back to. The fallback behavior itself is
  unchanged (dev-build only, same convention as `createFocusWhen`/`uiInlineMenu`'s existing
  warnings) — see SPEC.md §8's new FACT.

### Docs

- **`docs/V1_VS_V2.ja.md`**: filled in four migration-guide gaps reported as "the table's
  literal advice breaks on first use": (1) `s.x = create_ui_x()` → `app.use(createX())`
  needs the `setup` option, since `createApp` renders synchronously on construction —
  worked example added; (2) `applyTheme` only paints `background`/`color`/`font-size`, not
  v1 `.ric-page`'s `padding`/`overflow`/`box-sizing` — compensating CSS snippet added; (3)
  the scrollbar defaults are actually identical between v2 and v1 since v0.4.2 (only the CSS
  *scope* changed, `.ric-page` → `[data-ricdom-theme]` — corrected a stale assumption that
  the default value itself had also changed, which was true only for pre-0.4.2 v1); (4) the
  naive `ctx`→`children` regex misses ES2015 shorthand (`{ style, ctx }`) and post-hoc
  assignment (`node.ctx = [...]`) forms, and a caution against running the conversion
  repo-wide when a non-ricdom `ctx`-named variable (e.g. a canvas 2D context) coexists.
  Also recorded the "fold v1 usage into one adapter file before migrating" approach the
  third and fourth pilots both used to keep the mechanical conversion scoped to that one
  file.

### Tests

- **`tests/ui/accordion.test.ts`** (+4): controlled `open` drives display and leaves
  internal state untouched; `onToggle` receives `(id, nextOpen, nextMap)` with `nextMap`
  merged from the current `open` for `multi: true`; `nextMap` closes every other item for
  `multi: false`; a controlled accordion with no `onToggle` does nothing on click.
- **`tests/browser/uiAccordion.test.ts`** (new, 1 test): a real click plus an external
  `open` reassignment both correctly flip `aria-expanded`/`hidden` in a real browser.
- **`tests/ui/theme.test.ts`** (+6): invalid `theme`/`density`/`fontSize` each warn once and
  fall back to the documented default; warns on every call (not memoized to once-ever);
  valid string names and `ThemeVars` objects never warn; omitting an option never warns.

## [2.0.0-alpha.6] — not yet published

Two bug reports from the third pilot migration (Unizon's exhibition viewer, a kiosk/embed
app opened directly via `file://`, confirmed against the code by the maintainer) — a
minimal integration (a single playback panel) that nonetheless surfaced two long-standing
gaps in how the UI CSS layer treats the always-present portal element and `applyTheme`'s
element-painting parity with v1.

### Fixed

- **the auto-generated portal element participates in `target`'s flex/grid layout while
  empty (#1)**: `createApp(target, ...)` always appends a `<div data-ricdom-role="portal">`
  as the last child of `target` when `portalTo` is not given (`src/app.ts`, core, unchanged
  by this release) — apps that never register a portal-backed part (dialog/popup/toast/
  tooltip/dropdown) carry this empty div for their entire lifetime. If `target` is a flex or
  grid container with a `gap`, the empty portal still counts as a layout participant and
  adds one extra `gap` to the total even though it renders nothing. Reproduction: a `target`
  with `display: flex; gap: 16px` and a single 50px-wide child measured 66px wide (50 + the
  16px gap) instead of 50px. Fixed with one CSS rule in `src/ui/cssTemplates.ts`
  (`[data-ricdom-role="portal"]:empty { display: none; }`) so the element is removed from
  flow while it has no content and rejoins automatically the instant a part renders
  something into it (dialog opens, etc.). `display: contents` was considered and rejected:
  an Electron consumer relies on `-webkit-app-region: no-drag` targeting the portal box
  itself (SPEC §7), which `display: contents` would remove by dropping the box altogether,
  and `display: contents` has known accessibility-tree quirks of its own. This fix only
  helps consumers who load `ricdom-ui.css`; SPEC §7 documents the one-line workaround for
  core-only consumers.
- **`applyTheme`'s `fontSize` option had no visible effect on the element itself (#2)**:
  `applyTheme(el, { fontSize })` only ever set the `--ric-font-size` CSS variable — almost
  nothing in `ricdom-ui.css` reads that variable directly (`.ric-panel`/`.ric-md-pre` are the
  exceptions), so the themed element's own font size (and any of its direct text) stayed at
  the browser default (16px) regardless of the `fontSize` option. v1's `.ric-page` painted
  `font-size` alongside `background`/`color`, matching the `background`/`color` parity fix
  from `2.0.0-alpha.3` (#11) that this release extends. Fixed by adding
  `font-size: var(--ric-font-size, 14px);` to `THEME_PAINT_CSS`'s `[data-ricdom-theme]` rule
  in `src/ui/cssTemplates.ts`.

### Changed

- **`applyTheme`d elements now have a visible `font-size` painted on them** (see #2 above).
  This can change the appearance of existing `2.0.0-alpha.x` consumers: text sitting directly
  under an `applyTheme`d element (not itself wrapped in a `ricdom/ui` component with its own
  `font-size`) may go from the browser default (usually 16px) to the theme's `fontSize`
  (default `'md'` → 14px). Opt out per element with `[data-ricdom-theme] { font-size: ...; }`
  in your own CSS (loaded after `ricdom-ui.css`), or set `font-size` directly on your own
  element — this mirrors the existing opt-out path for the `background`/`color` painting from
  `2.0.0-alpha.3`.

### Tests

- **`tests/browser/portalEmptyFlex.test.ts`** (new): a flex+gap `target` with no
  portal-backed parts registered — asserts `target`'s measured width equals its single
  child's width (no extra gap) and the portal's computed `display` is `none`; opening then
  closing a `createDialog` toggles the portal's computed `display` away from and back to
  `none`; a `portalTo`-supplied external element still gets no portal appended to `target`
  (existing behavior, unchanged). Confirmed red against the pre-fix CSS (`git checkout --
  src/ui/cssTemplates.ts`, rebuilt): the flex+gap case measured 66px instead of 50px, and the
  dialog case's portal computed `display: block` instead of `none` before the dialog was even
  opened.
- **`tests/browser/uiTheme.test.ts`**: added a `font-size` parity block alongside the existing
  `#11` background/color block — `fontSize: 'sm'/'md'/'lg'` resolving to computed
  `12px`/`14px`/`16px`, the `'md'` default when `fontSize` is omitted, a `ThemeVars`
  `--ric-font-size` override, and a child `uiButton` (`font-size: 1em`) inheriting the painted
  value. Confirmed red against the pre-fix CSS: all four assertions measured the browser
  default `16px` regardless of the requested `fontSize`.

### Docs

- SPEC.md §7 (Portals): new FACT documenting that the portal element always exists and can
  add to flex/grid gaps while empty, and how `ricdom-ui.css` (or a one-line workaround for
  core-only consumers) prevents it.
- SPEC.md §8 (Themes): the `applyTheme` element-painting FACT (from `2.0.0-alpha.3`) now
  covers `font-size` alongside `background`/`color`, with a note on the `2.0.0-alpha.6`
  visual-appearance change.
- TUTORIAL.md / V1_VS_V2.ja.md: the `applyTheme`/`create_ui_page` parity notes now mention
  `font-size` alongside `background`/`color`.

## [2.0.0-alpha.5] — not yet published

A single bug report from a pilot migration, confirmed against the code by the maintainer.

### Fixed

- **`createPopup`/`createDropdown`: the measuring render under-measured a body's width when
  its trigger sat near the viewport's right edge, so `offsetWidth`-based positioning left no
  right margin (#14)**: both components open by rendering the body once at
  `visibility: hidden` to measure `offsetWidth`/`offsetHeight`, then reposition based on the
  measurement. During that measuring render, the body (`position: fixed`, no explicit
  width — shrink-to-fit) was left at `left: rect.left` (the trigger's own position; `left: x`
  for `createPopup().openAt()`), which constrains the width available to the shrink-to-fit
  algorithm to `innerWidth - rect.left`. A trigger close to the right edge left barely any
  width to measure in, so wrappable content wrapped tighter than it needs to and
  `offsetWidth` came back smaller than the content's real width. Reproduction from a pilot
  consumer at 150% DPI, `innerWidth` 1361: trigger `rect.left` 1213.33 → measured
  `offsetWidth` 224 (true width 417) → final `left` 1011.33 → body `right` 1361.33, flush
  against the viewport edge with none of the usual 8px margin to spare. Fixed by placing the
  body at `left: 8px` (the same margin the final positioning clamps into) for the duration of
  the measuring render only, regardless of the trigger's position — since the render is
  `visibility: hidden`, where it sits on screen during measurement doesn't matter, and this
  gives the shrink-to-fit algorithm close to the full viewport width to measure against. The
  new `measuringLeft()` helper in `src/ui/internal/popupPosition.ts` is shared by all three
  affected call sites (`createDropdown`'s trigger path, `createPopup`'s trigger path and its
  `openAt()` path) rather than reimplemented per component. The final positioning logic
  (`computeAnchoredLeft`/`clampLeft`, the below/above flip) is unchanged — it was already
  correct once given an accurate width.

### Tests

- **`tests/browser/uiDropdown.test.ts`, `tests/browser/uiPopup.test.ts`**: one reproduction
  test each for `createDropdown`'s trigger path and `createPopup`'s trigger path and
  `openAt()` path — a trigger pinned to the viewport's right edge, opening a body with
  wrappable single-line content, asserting the measured `offsetWidth` is within 2px of the
  same content measured from a left-edge trigger (the "true" width) and that the body's
  right edge stays within the viewport's usual 8px margin. Confirmed red against the
  pre-fix code (`git stash` on the three changed `src/ui` files) before the fix: dropdown
  measured 132px narrower than the reference, `createPopup`'s trigger and `openAt` paths
  each measured 30px narrower.
- **`tests/browser/portalContract.test.ts`**: added a second parameterized block (`createPopup`
  trigger path + `createDropdown`) checking the same "measured width matches a left-edge-
  trigger reference" invariant, alongside the existing per-component tests — catching the bug
  class across components rather than one at a time, per the second pilot's earlier test-
  strategy proposal (`2.0.0-alpha.3`, #1).
- **`tests/ui/popupPosition.test.ts`**: unit coverage for the new `measuringLeft()` helper
  (default margin, explicit margin).

### Docs

- SPEC.md: the `createPopup`/`createDropdown` horizontal position rule FACT now describes
  the `left: 8px` placeholder used during the measuring render, and why anchoring it to the
  trigger instead (the pre-`2.0.0-alpha.5` behavior) under-measured wrappable content near
  the viewport's right edge.

## [2.0.0-alpha.4] — not yet published

A single bug report from the second pilot migration (Trend Guard): duplicate `key`s among
siblings caused the affected children to multiply on every render.

### Fixed

- **`patchChildrenByKey`: duplicate sibling `key` caused affected children to multiply on
  every render (#13)**: with a repeated `key` among siblings, the count of DOM children for
  that duplicate would grow every render (5 → 7 → 9 → 11 → 13 for the reproduction case) —
  this bug was inherited unmodified from v1's identically-named algorithm
  (`src/ricdom.js`'s `patch_children_by_key`), so every v1 release up to v0.4.4 has the same
  behavior (v1 gets the same fix, without the warning, as v0.4.5). Root cause: on the "previous" side, building the keyed
  lookup map overwrote the map entry for a repeated `key`, and the overwritten entry's DOM
  node then had no reference left (not in the map, not in the unkeyed pool) to be found by
  the removal pass, so it leaked and stayed in the DOM forever. On the "next" side, once the
  first occurrence of a repeated `key` consumed the map entry, every subsequent occurrence
  found nothing and built a brand-new DOM node from scratch on every render. Fixed by
  treating a duplicate `key` as unkeyed starting from its second occurrence (matched
  position-based against previous unkeyed siblings, same-tag/same-kind) instead of losing
  track of it — see the new SPEC FACT under §2.2. A first occurrence of a genuinely new
  `key` (not a repeat) is unaffected and still built fresh as before; the reconciliation
  logic is careful not to let a legitimately-new keyed sibling steal a DOM node from an
  unrelated unkeyed one (e.g. an `<input>` mid-edit) just because its own `key` wasn't found
  — an earlier, broader version of this fix had exactly that regression, caught during
  cross-checking against v1's behavior before release.
- **dev warning for duplicate sibling `key`s**: `NODE_ENV !== 'production'` builds now emit
  one `console.warn` per render (per parent element) when a duplicate `key` is detected
  among siblings, so the mistake is visible instead of silently degrading to
  position-based-only identity. Production builds stay silent, matching every other dev-only
  warning in this library.

### Notes

- **Core gzip ceiling re-baselined: 5,120B → 5,200B.** The fix alone already exceeded the
  previous ceiling (5,107B baseline → 5,126B, 6B over, even after offsetting with a shared
  `applyPlainAttr` helper for build/patch and short internal-only property names on the
  patch-time working struct `PrevEntry`, which is not part of any public API). The dev
  warning adds more, and its message text turned out to dominate the cost (a long Japanese
  message: 5,215B; the short one shipped: **5,169B**). No further behavior-preserving
  reduction was found without hurting readability or touching code unrelated to #13, so the
  ceiling was raised once, deliberately, to keep the warning — making a silent failure
  visible in dev is a stated design goal, and dropping it to save bytes would defeat the
  fix's purpose. The "no new core features" rule (design doc §13) still stands: this is a bug
  fix plus its visibility, not a feature. README now says "≤ 5.1KB (core)" / "≤ 5,200B".

### Tests

- **`tests/keyReconciliation.test.ts`**: duplicate `key` (string and number) doesn't
  multiply children across repeated renders; the DOM node for a duplicate is reused
  (identity-stable) across renders; removing the duplication in a later render removes the
  now-unmatched extra element; a genuinely new keyed sibling in a keyed/unkeyed mixed list
  does not steal an existing unkeyed sibling's DOM node; the dev warning fires once per
  render with a duplicate present (not on the very first mount, which builds fresh via
  `buildDomNode` and never calls `patchChildrenByKey`), stays silent in production, and
  stays silent for ordinary non-duplicate key-based reconciliation.

### Docs

- SPEC.md §2.2: new FACT that `key` must be unique among siblings, what happens when it
  isn't (unkeyed fallback from the second occurrence on, new keys unaffected), and the dev
  warning.

## [2.0.0-alpha.3] — not yet published

Four bug reports plus a test-strategy proposal from the second pilot migration (Trend
Guard, an Electron app), used in production.

### Fixed

- **`createDropdown`: missing `position: fixed` (#9)**: `.ric-dropdown__body` never had
  `position: fixed` (unlike `.ric-popup__body`, which always did), so the inline
  `top`/`left`/`bottom` values `dropdown.ts` computes had nothing to apply to — the body
  stayed in normal document flow inside the portal element. If the mount target was a
  vertical flex/grid container, the dropdown body's own layout height pushed the target's
  other children around while it was open. Added `position: fixed` to match
  `.ric-popup__body`.
- **`createPopup`: menu didn't close on item selection (#10)**: activating a menuitem
  (click; a `<button>` item also gets this via native `Enter`/`Space` → `click`) now closes
  the menu and returns focus to the trigger by default (the APG menu button pattern) —
  previously the menu stayed open until an explicit `Escape`/outside click/`menu.close()`.
  Implemented by wrapping each item's own `onclick` (in `wrapMenuItem`) rather than
  listening for a `click` on the menu body, so it still closes even if the item's `onclick`
  calls `ev.stopPropagation()`. Applies the same way whether the menu was opened from the
  trigger button or via `openAt()`. See `closeOnSelect` under Added for the opt-out.
- **`applyTheme`: didn't paint `background`/`color` on the element (#11)**: `applyTheme`
  only ever set CSS custom properties as inline style — the element it was called on stayed
  visually transparent/colorless (only its descendants looked themed, via normal variable
  inheritance). v1's `create_ui_page` painted `.ric-page` this way; with no `page` component
  in v2, that half of the parity was missing. `ricdom-ui.css` now has a
  `[data-ricdom-theme] { background: var(--ric-color-bg); color: var(--ric-color-fg); }`
  rule (single attribute selector, low specificity — override it yourself to opt a subtree
  out). A nested `applyTheme`d descendant still paints its own background over its
  ancestor's, matching v1.
- **`createDialog`: initial focus stole focus set by the consumer (#12)**: opening a dialog
  always moved focus to the first focusable descendant, even if the consumer had already
  focused something specific inside it during the same open (e.g. via `createFocusWhen`,
  or their own render-time code) — whichever of `animationend`/the 700ms fallback fired
  would override it a moment later. `focusFirstElement` now checks
  `document.activeElement` first and does nothing if it's already inside the dialog's root
  (excluding the root itself, which is a fallback target from a *previous* run of this same
  step, not "already focused" in the sense that matters here). When nothing is focused yet,
  an `[autofocus]` element (`{ autofocus: true }` on a `RicNode`, same idea as native
  `<dialog>`'s focusing steps) is now preferred over DOM order, ahead of the previous
  "first focusable" fallback.

### Added

- **`PopupProps.closeOnSelect`**: opt out of the #10 close-on-activate behavior
  (`closeOnSelect: false`) for checkbox-style menus where selecting an item should toggle
  state without dismissing the menu. A `disabled: true`/`aria-disabled="true"` item, or one
  whose `role` was explicitly overridden away from `'menuitem'` (e.g. a separator), is never
  treated as "activated" regardless of `closeOnSelect`.

### Tests

- **`tests/browser/portalContract.test.ts`**: a parameterized contract shared by
  `createPopup`/`createDropdown`/`createTooltip`/`createToast`/`createDialog` — asserting
  outcomes a consumer would actually observe rather than internal class names or inline
  values: the open body's rect is inside the viewport, its computed `position` is `fixed`,
  a trigger-anchored body sits within 32px of its trigger, and — the #9 reproduction case
  itself — a sibling inside a `display: flex; flex-direction: column; height: 100vh` mount
  target keeps the same rect before and after opening.
- **`tests/browser/uiPopup.test.ts`**: #10's close-on-activate via click/`Enter`/`Space`,
  focus restoration to the trigger, `closeOnSelect: false`, `disabled`/`aria-disabled`
  items not closing the menu, `stopPropagation()` in an item's `onclick` not preventing the
  close, and the same behavior through `openAt()`.
- **`tests/browser/uiTheme.test.ts`**: #11's computed `background-color`/`color` for both a
  bundled theme name and a custom `ThemeVars` object (whose `data-ricdom-theme` attribute
  value is always the empty string — `[data-ricdom-theme]` matches on presence, not value),
  a CSS override winning with no added specificity, and a nested themed descendant painting
  its own background.
- **`tests/browser/uiFocusWhen.test.ts`** / **`tests/browser/uiDialog.test.ts`**: #12's
  "focus already inside the dialog is left alone" (via `createFocusWhen` targeting a `ref`
  inside the dialog, asserted 800ms after open — past the 700ms fallback) and
  "`[autofocus]` wins over an earlier-in-DOM-order close button" (also asserted at 800ms).
- **`scripts/examplesSmoke.mjs`** (`npm run test:examples`, added to CI after the browser
  test step): serves the repo root over a plain Node `http` server and drives every
  `examples/*.html` page with Playwright — zero console errors/`pageerror`s, every
  `button[aria-haspopup]` opens a `[data-ricdom-role="popup"|"dropdown"|"dialog"]` body
  whose rect is inside the viewport, and `Escape` closes it. Requires a build first
  (`pretest:examples` runs `npm run build`).

### Docs

- SPEC.md: `createPopup`'s row documents close-on-activate + `closeOnSelect`, plus new FACT
  sections for it (§10.3.1d), dialog's initial-focus order (§10.3.1c), and `applyTheme`'s
  background/color paint (§8). Added the missing §10.3.3 component table for
  `createTabs`/`createSplitter`/`createScrollPane`/`createCollapseBox`/`createAccordion`
  (implemented in Phase 3b/3c, never added to this table).
- V1_VS_V2.ja.md / TUTORIAL.md: one-line notes on `create_ui_page`'s removal now having
  full parity (`applyTheme` paints background/color, alpha.3~) and the trigger-look prop
  shape difference between `createPopup` (inside the `trigger` object) and `createDropdown`
  (top-level props).

## [2.0.0-alpha.2] — not yet published

Ten fixes/additions from feedback on the second pilot migration (Trend Guard, an Electron
app).

### Fixed

- **`createPopup` trigger-path horizontal clamp**: opening a popup from a trigger near the
  right edge of the viewport could render the body partially off-screen — the trigger path
  only ever positioned at `rect.left`, with no fallback, while `openAt` already clamped
  correctly. Position calculation (below/above flip, horizontal placement) is now shared
  via `internal/popupPosition.ts`'s `computeAnchoredLeft`, used by both `createPopup`'s
  trigger path and `createDropdown`: fits at `rect.left` when possible, aligns to the
  trigger's right edge when it doesn't, and falls back to `clampLeft` only if the content
  is wider than the viewport.
- **Core: portal `ref`s available one render late**: `createApp`'s render cycle collected
  `data-ricdom-ref` elements (`registerRefs`) *before* patching the portal, so a `ref`
  inside a dialog/popup/toast — anything mounted through `renderPortal()` — wasn't visible
  via `app.refs.get()` until the *next* render. `registerRefs` now runs after the portal
  patch, and collects from both `target` and an external `portalTo` element.
- **`wrapMenuItem` (popup menu items) dropped non-string `class`**: an array- or
  boolean-map-form `class` on a menu item was silently discarded instead of being merged
  with `.ric-popup__item`. Now uses the same `mergeClass` every other component uses.
- **`.ric-popup__item` icon/text vertical alignment**: the item wrapper's
  `display: flex !important` had no `align-items`, so it fell back to the CSS default
  (`stretch`) — an icon of fixed height next to text could appear vertically off-center.
  Added `align-items: center` and `gap`. (`.ric-dropdown`/`.ric-inline-menu` don't
  auto-wrap arbitrary content the way `createPopup` does, so they weren't affected.)

### Added

- **`uiRow`/`uiCol`: `gap` prop**: v1's `ui_row({ gap })` was a first-class prop; in v2 it
  fell through the rest-spread and became a stray `gap` DOM attribute instead of
  `style.gap` — a silent regression hit in 25+ places during the pilot. `gap?: string |
  number` (a number is treated as px) now writes to `style.gap`, matching `uiGrid`'s
  existing `gap`.
- **`createPopup`: object-form `trigger`**: `trigger` now also accepts
  `{ icon?, label?, ghost?, size?, class?, style? }` in addition to the existing
  `RicNode | RicNode[]` form — v1's icon+ghost round trigger button couldn't be
  reproduced through the plain-children form, so consumers were overriding it with
  structural CSS selectors. The object form renders a `uiButton`-equivalent look
  (`.ric-button` + `--ghost`/`--sm`/`--lg`). `aria-haspopup`/`aria-expanded` are set either
  way. `createDropdown`'s existing `label`/`icon`/`ghost` props already cover the same
  ground for that component.
- **`createTabs`: panel-less mode**: if no `item` in `items` has `children`, `createTabs`
  renders no `tabpanel` and omits `aria-controls` from the tab buttons — for
  segmented-control-style usage where tabs don't drive a content panel. Any single item
  with `children` restores the previous (panel) behavior for all items.
- **`createFocusWhen`** (`ricdom/ui`), the v1 `focus_when` successor: a stateful helper
  (`app.use(createFocusWhen())`) called as `fw(refName, condition)` during `render` that
  moves focus to `app.refs.get(refName)` on the false→true rising edge of `condition`,
  once that render has committed (implemented via a synchronous `host.app.nextRender()`
  call during `render`, which resolves at the end of that same render per the `nextRender`
  contract). Continuing `true` doesn't refocus; a missing ref logs one `console.warn` in
  dev and does nothing otherwise. One instance tracks each `refName`'s previous condition
  independently, so a single `createFocusWhen()` can drive multiple refs. Fills a gap
  `createDialog`'s own initial-focus-first-focusable behavior doesn't cover: focusing a
  *specific* element, or focusing outside of a dialog-open event entirely.
- **`data-ricdom-role` on portal sub-parts**: dialog (`dialog-overlay`, `dialog-header`,
  `dialog-body`, `dialog-footer`, `dialog-close`), popup/dropdown (`popup-overlay`,
  shared), toast (`toast-item`, `toast-close`) — extending the existing per-component root
  role to their sub-parts for stable E2E/CSS targeting. (Tooltip's single sub-part already
  carried `data-ricdom-role="tooltip"`.)

### Changed

- Core gzip size: **5,107B** (was 5,091B), still under the 5,120B budget. The only core
  change is the portal-ref fix above; the registerRefs implementation was written to
  minimize the increase.
- SPEC.md: documents the popup/dropdown position rule (fit → right-align to trigger →
  clamp), the portal-ref collection timing, `gap`, the new `data-ricdom-role`s, the two
  `trigger` forms, panel-less tabs, `createFocusWhen`, and an Electron-specific footnote:
  give portal elements `-webkit-app-region: no-drag` (`[data-ricdom-role="portal"] {
  -webkit-app-region: no-drag; }`) or interactive UI mounted under a draggable
  `-webkit-app-region: drag` titlebar region becomes unclickable.

## [2.0.0-alpha.1] — not yet published

Five fixes/additions from feedback on the first pilot migration (歯車DXFジェネレーター).

### Added

- **`createApp(target, state, render, { setup })`**: `setup(app)` runs once, immediately
  before the first render (after the app and its portal exist). Anything registered with
  `app.use()` inside `setup` is already attached by the time the first `render` call
  references it, removing the "return a placeholder until `use()` has run, then force a
  render" two-step that was otherwise required on first render. `setup` is skipped for a
  NOOP app, and an exception thrown by `setup` is caught, logged via `console.error`, and
  does not prevent the first render.
- **`createTweakPanel`: `keys[k].get`/`keys[k].set`**: a `keys` entry can now read/write a
  row through `get()`/`set()` instead of `data[k]` — `data[k]` is never touched for that
  row, and the key doesn't even need to exist in `data` (useful for a value derived from
  other fields, e.g. a center distance computed from a module/teeth pair). Rows declared
  this way render after `data`'s own rows, in `keys` order. A throwing `get`/`set` is
  caught and logged, degrading only that row.
- **`createTweakPanel`: `keys[k].rows`**: a folder-shaped `keys` entry can carry its own
  `rows: RicNode[]`, appended at the end of *that* folder's body — the existing top-level
  `rows` prop only ever appends to the end of the whole panel.
- **`createTweakPanel`: stable row hooks**: every leaf row (number/range/checkbox/text/
  select/radiobutton/color, and the new `get`/`set` rows) carries
  `data-ricdom-role="tweak-row"` and `data-ricdom-tweak-key="<dot.path>"` for E2E/CSS
  targeting independent of row order.
- **`uiButton({ size })`**: `'sm' | 'md' | 'lg'`, default `'md'` (adds `.ric-button--sm`/
  `.ric-button--lg`; `'md'` is the core button's own size, so it adds no class).
- **`createDialog`: `returnFocus`**: `dlg.open({ returnFocus })` (uncontrolled) or
  `DialogProps.returnFocus` (controlled) controls where focus goes when the dialog closes.
  Default is unchanged (APG behavior — restore to the pre-open `activeElement`); `false`
  skips focus restoration entirely (the dialog's DOM is simply removed, and the browser's
  own default takes over — no explicit `document.body` focus call); an `Element` restores
  focus there specifically. Fixes a case where opening a dialog from a non-focusable
  trigger returned focus to an unrelated element that merely happened to be focused right
  before the click.

### Changed

- Core gzip size: **5,091B** (was 5,030B), still under the 5,120B budget — the increase is
  entirely the new `setup` option.
- SPEC.md: added a FACT that a hidden/unfocused tab throttles `setTimeout` (not just
  `requestAnimationFrame`), so the scheduler's 200ms backstop can take up to ~1s there;
  code needing an immediate render regardless of tab state should call `app.renderNow()`.

## [2.0.0-alpha.0] — not yet published

Initial alpha of ricdom 2, a from-scratch TypeScript successor to
[RicDOM v1](https://github.com/miyoshi-tec/RicDOM). Not source-compatible with v1 — see
[Breaking changes from v1](#breaking-changes-from-v1) below if migrating an existing app.

### Added — Core (`ricdom`)

- `createApp(target, state, render, options?)`: resolves `target` (CSS selector or
  `Element`) and performs a synchronous first render. An unresolved selector is retried
  once after `DOMContentLoaded`; if it still cannot be resolved, or any argument is
  invalid, `createApp` logs `console.error` and returns a type-safe NOOP `App` instead of
  throwing.
- Node representation: `{ tag, class, style, children, ref, key, island, ...attrs }`,
  fully typed by tag name (`RicElementNode`). `tag` is required at the type level.
- Diffing: position-based and key-based reconciliation, `FORCE_REAPPLY` for
  `value`/`checked`/`selected`/`scrollTop`/`scrollLeft`, an editing guard that exempts a
  focused input/textarea/select's `value` from `FORCE_REAPPLY`, `<select>` value/option
  construction-order handling, SVG namespace inheritance, `data-ricdom-ref` for named
  element references.
- Islands: `island: true` elements are built once and never diffed again — an explicit
  opt-out from ricdom's diffing for externally-managed subtrees (e.g. a `<canvas>` driven
  by your own render loop).
- Reactivity: a shallow `Proxy` over `state` (top level, plus one level into
  object-valued properties). `state.ignore` is never tracked. In non-production builds,
  assigning through an untracked (two-or-more-levels-deep) path logs `console.warn`
  explaining the shallow-copy pattern, without changing the assignment's effect.
- Scheduler: every render request arms both `requestAnimationFrame` and a
  `setTimeout(200ms)` backstop; whichever fires first renders, covering environments where
  rAF does not fire reliably (backgrounded tabs, Electron background throttling, kiosk
  transitions).
- `app.renderNow()` (synchronous, forced) and `app.nextRender()` (a `Promise` that
  resolves on the next *scheduled* render's completion — it does not resolve if nothing is
  pending).
- `app.refs`: a `ReadonlyMap<string, Element>` of every `ref`-named element in the last
  render.
- `app.use(part)`: registers a stateful component (see below), returning it unchanged.
- `app.unmount()`: disposes all registered parts and stops future renders/timers.
- Component contract (`app.use(part)`): `UsePart` (`attach(host)` / `dispose()` /
  `renderPortal()`), where `Host = { notify(), portal, app }` is only ever handed to a
  part through `use()` — a part called without going through `use()` has no way to
  request a render or a place to portal into, and detects this itself (see
  `ricdom/ui`, below).
- Portals: `createApp` auto-generates a `<div data-ricdom-role="portal">` as the last
  child of `target` (an `island: true`, stably-keyed sentinel node, so it is never
  mis-diffed even when the rest of the tree's visible/invisible shape varies render to
  render) and, each render, collects every registered part's `renderPortal()` output into
  it. `options.portalTo` replaces the auto-generated portal with an element you supply.
  Each `createApp` instance owns exactly one portal — there is no cross-app portal
  registry.
- Build: tsup produces ESM (`dist/index.js`), CJS (`dist/index.cjs`), and an IIFE
  (`dist/ricdom.iife.min.js`, global `ricdom`) plus a single `.d.ts`. Consumers never need
  a build step. Core gzip size: **5,030B**, under the 5,120B budget.
- Tests: Vitest (jsdom) unit tests, type-level tests (`expect-type`/`@ts-expect-error`),
  and real-browser tests (`@vitest/browser` + Playwright/Chromium) covering rAF-backstop
  rendering, `<select>` construction order, the editing guard against real `badInput`, and
  IIFE-build smoke tests. GitHub Actions CI runs typecheck → unit → browser → build on
  every push/PR.

### Added — `ricdom/ui`

- **Theming**: `applyTheme(el, { theme, density, fontSize })` writes `--ric-*` CSS custom
  properties (and the native `color-scheme` property, so native controls — scrollbars,
  `<select>`, checkboxes, date pickers — follow light/dark automatically) as inline style
  on any element — themes are per-element, not global, so multiple differently-themed
  mounts can coexist on one page. Five bundled themes (`light`/`dark`/`teal`/`cyber`/
  `aqua`), three densities, three font sizes, or a fully custom `Record<string,string>`.
  `createTheme(base, overrides)` and `exportTheme(el)` round-trip a theme for persistence.
  `applyTheme` also marks its element `data-ricdom-theme`, which scopes the page-wide
  scrollbar styling described below.
- **CSS distribution**: one stylesheet (`ricdom-ui.css`) covers every component — no
  per-instance CSS collection to route through correctly. Load it via `<link>` or, for a
  build-free `<script>`-only page, `injectStyles()` (idempotent, warns once if a
  stateful component is used before either has happened).
- **Component contract**: `Component<P>` (`(props) => RicNode` + `attach(host)` +
  `dispose()` + optional `renderPortal()`), the `ricdom/ui`-side shape of the core's
  `UsePart`. Every stateful component below detects being called without `app.use()` and
  logs one `console.error` (not spammed on every call) instead of doing anything silently
  wrong.
- **Stateless controls** (plain functions, no `app.use()` needed): `uiButton`, `uiInput`,
  `uiTextarea` (`autoResize`), `uiCheckbox`, `uiRadiobutton`, `uiSelect`, `uiRange`,
  `uiColor` (hex/`rgba()` auto-detected), `uiSeparator`, `uiText` (`variant`), `uiIcon`
  (see Icons, below). All follow a rest-spread contract: extra props merge onto the
  rendered root without being able to override the component's own computed attributes,
  and (where a component wraps an inner element, like `uiCheckbox`'s `<input>`) the props
  that belong to that inner element never leak into the outer wrapper's rest spread.
- **`bindInput`/`bindTextarea`/`bindCheckbox`/`bindSelect`/`bindRange`**: two-way-binding
  sugar over a state property, e.g. `bindInput(s, 'name', options)`. Caller-supplied
  `options` is always applied before the computed `value`/`on*` handlers, so it can never
  silently override the binding.
- **Layout**: `uiCol`, `uiRow`, `uiGrid` (`columns`/`rows` accept a number, a raw CSS
  track string, or `'auto-fit 200px'`/`'auto-fill 120px'` shorthand), `uiPanel`
  (`layout: 'col' | 'row'`, `disabled` sets the native `inert` attribute).
- **Text**: `uiMdPre` (a practical Markdown subset — headings, bold/italic, inline code,
  fenced code blocks with `` ``` ``/`~~~`, ordered lists with a `start` attribute,
  bulleted lists, blockquotes, aligned tables, horizontal rules, links, images —
  `transformText`/`transformImageSrc` hooks, and a blocklist, not a whitelist, for
  dangerous `href` schemes so custom protocols like `app://` still work), `uiCodePre`
  (code or `JSON.stringify`'d object display, always dark-themed, optional
  `window.hljs`-powered syntax highlighting if present).
- **Stateful dialog/popup/toast/tooltip/dropdown** (`app.use()` required): `createDialog`
  (modal, `role="dialog"` + `aria-modal`, focus trap, `Escape`-to-close with focus
  restoration, background `inert`, controlled/uncontrolled modes, optional auto-rendered
  trigger), `createPopup` (`role="menu"` dropdown menu with arrow-key/Home/End navigation
  and automatic `role="menuitem"` wrapping, plus `openAt({x,y})` for non-trigger-anchored
  opening), `createToast` (`role="status"`/`role="alert"` queue, never steals focus),
  `createTooltip` (`aria-describedby`, hover/focus-triggered, viewport-aware direction),
  `createDropdown` (a generic Popover — `aria-haspopup="dialog"` — for label/icon-mode
  triggers whose body semantics are entirely up to the caller; shares position-flip and
  exclusive-open logic with `createPopup`). All animate open/close on real CSS events
  (`animationend`) with a 700ms `setTimeout` fallback, so a state transition always
  eventually completes even if `ricdom-ui.css` never loaded.
- **Stateful composite components** (`app.use()` required): `createSplitter`
  (drag-to-resize two-pane layout, `role="separator"` + `aria-valuenow/min/max`, arrow-key
  resizing, collapsible), `createScrollPane` (auto-follow-to-bottom/top scroll region for
  chat/log UIs, with a `threshold` for "is the user currently looking elsewhere"),
  `createCollapseBox` (an animated open/close container primitive; supports multiple
  simultaneous keyed instances for sparse-list animation; completion is detected via
  `transitionend` with a 700ms `setTimeout` fallback, since a dynamic per-instance
  height/width cannot be expressed as a fixed `@keyframes` animation), `createAccordion`
  (`<button aria-expanded aria-controls>` header + `role="region"` panel, closed panels
  get `hidden` to drop out of the accessibility tree while keeping their CSS open/close
  transition working), `createTabs` (`role="tablist"/"tab"/"tabpanel"`, roving tabindex,
  arrow-key/Home/End navigation, controlled or uncontrolled active-tab state).
- **`uiInlineMenu`**: a lightweight, portal-free absolutely-positioned popover (a plain
  function — no `app.use()`), for cases where a full `createPopup` instance per row would
  be too heavy (e.g. an ellipsis menu on every row of a long list). Warns in development
  if its parent element isn't a positioned ancestor.
- **`createTweakPanel`**: a dat.GUI-style parameter panel. Pass `data` alone for full
  auto-generated rows (row type inferred from each value's type — booleans → checkbox,
  numbers → number input, hex/`rgba()` strings → color picker, nested plain objects →
  collapsible folders); `keys` partially overrides individual rows (type/min/max/step/
  options/label/open); `rows` appends hand-built `RicNode`s after the generated ones. The
  editing guard (core) means typing a decimal into a number row survives an unrelated
  re-render mid-keystroke without being clobbered.
- **`ricdom/icons`**: 36 bundled icon descriptors (`{ v?, s?, p }`) as individual,
  tree-shakable named exports (`import { check, chevronDown } from 'ricdom/icons'`),
  Lucide-style kebab-case names converted to camelCase (`chevron-down` → `chevronDown`).
  `ICON_NAMES` (camelCase → kebab) and `ICONS_BY_NAME` (kebab → descriptor) provide the
  reverse/direct lookups. `svgToDescriptor(svg)` converts an arbitrary SVG's
  `circle`/`rect`/`polygon`/`line`/`ellipse`/`path` shapes into descriptor path data.
  `IconDescriptor` (used by `ricdom/icons`) and `uiIcon`'s descriptor parameter (
  `ricdom/ui`) are the same type — `ricdom/ui` imports it type-only, with zero runtime
  dependency on `ricdom/icons`.
- **`ricdom-icon` CLI** (`npx ricdom-icon <name> [--json] [--search TERM] [--names]`):
  returns a bundled descriptor instantly, or fetches and converts one from Lucide if not
  bundled — the tool a no-bundler consumer uses to get an icon's path data without ever
  hand-writing it. stdout carries only the requested data; diagnostics go to stderr.
- **`data-ricdom-role`** is set on every component's rendered root — including the portal
  root of `createDialog`/`createPopup`/`createToast`/`createTooltip`/`createDropdown` —
  as a stable selector for E2E tests and CSS overrides, independent of class names or DOM
  structure. See [SPEC.md §11](docs/SPEC.md#11-data-ricdom-role-registry) for the full
  list of values.
- Build: `dist/ui.js`/`dist/ui.cjs` (`ricdom/ui` subpath, ESM+CJS+`.d.ts`) and
  `dist/ricdom-ui.iife.min.js` (global `ricdomUI`) — `ricdom/ui` has **zero runtime
  dependency on `ricdom`** (only type-only imports of `RicNode`/`App`/`Host`), so the two
  IIFE builds are a logical pairing, not a bundler-level dependency.

### Fixed

- A portal sentinel node lacking a stable `key` could be misdiffed as a different element
  when the surrounding render's top-level visibility toggled between a node and
  `null`/`false` across renders (the sentinel's array index would shift), causing the
  cached portal DOM reference to become detached from the live document while later
  `renderPortal()` patches kept targeting it. Fixed by giving the portal sentinel a fixed
  `key`, which routes it through key-based (not position-based) reconciliation.

### Changed

- License: MIT, for the whole v2 codebase, from the first commit — a clean slate that
  does not inherit v1's noncommercial-with-exceptions license.

### Breaking changes from v1

If you're migrating an existing [RicDOM v1](https://github.com/miyoshi-tec/RicDOM) app,
expect all of the following to require code changes — there is no source compatibility:

- **Naming**: snake_case → camelCase everywhere (`create_RicDOM` → `createApp`,
  `create_ui_dialog` → `createDialog`, `ctx` → `children`, `data-ric-role` →
  `data-ricdom-role`, …).
- **`createApp(target, state, render)`** takes `render` as a required third argument,
  never nested inside `state`.
- **Stateful components require `app.use()`.** v1's implicit wiring (assigning a
  factory's return value to a specific place in `state` silently activated a hidden Proxy
  trap) does not exist in v2 — every stateful component (dialog/popup/toast/tooltip/
  dropdown/splitter/scrollPane/collapseBox/accordion/tabs/tweak panel) must be registered
  via `app.use(create...())` first.
- **`style` is object-only.** v1's string/array/object style forms are reduced to one:
  a plain `Record<string, string | number>`.
- **Islands are explicit**: `island: true`, not "omit `children`."
- **Portals are per-app**, not routed through a page component — there is no v2
  equivalent of v1's `create_ui_page`. `applyTheme(el)` applies directly to any element;
  CSS ships as one stylesheet regardless of what wraps a given mount.
- **`createPopup` is menu-only** (`role="menu"`); v1's combined label/icon/chevron
  dropdown modes are `createDropdown` in v2.
- Checked/selected values are passed as plain booleans — v2's core always assigns
  `checked`/`selected` as DOM properties, so the `1`/`0` numeric-conversion workaround v1
  components needed is gone.
