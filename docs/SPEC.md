# ricdom SPEC

This document states the **contract** of `ricdom` (core), `ricdom/ui`, and `ricdom/icons`:
what is guaranteed to be true, and what is guaranteed to stay true across patch/minor
releases. It contains facts, not recipes — for task-oriented walkthroughs see
[TUTORIAL.md](TUTORIAL.md); for design rationale see the (Japanese) internal design
record `docs/DESIGN.ja.md`.

Everything here describes **current, released behavior**. Where v1 (`RicDOM`) behaved
differently, that is noted only when it helps someone migrating — this is not a changelog.

- [1. Node representation](#1-node-representation)
- [2. Diffing (patch) rules](#2-diffing-patch-rules)
- [3. Reactivity](#3-reactivity)
- [4. Scheduler](#4-scheduler)
- [5. `createApp`](#5-createapp)
- [6. `use()` and the component contract](#6-use-and-the-component-contract)
- [7. Portals](#7-portals)
- [8. Themes](#8-themes)
- [9. CSS distribution](#9-css-distribution)
- [10. Components](#10-components)
- [11. `data-ricdom-role` registry](#11-data-ricdom-role-registry)
- [12. Icons](#12-icons)

---

## 1. Node representation

A UI tree is plain data. There is no JSX, no template compiler, no build step required to
author it.

```ts
type RicNode = string | number | null | false | undefined | RicElementNode | RicNode[];
```

- `string` / `number` render as a text node.
- `null`, `false`, `undefined`, and empty arrays render as nothing (**invisible**). Arrays
  are flattened one level and their invisible members are dropped before diffing.
- `RicElementNode` is a discriminated union keyed by `tag`. For a known HTML/SVG tag name,
  the object's allowed attributes are inferred from `HTMLElementTagNameMap` /
  `SVGElementTagNameMap` (so `{ tag: 'input', value: '' }` type-checks and
  `{ tag: 'input', href: '' }` does not). Unknown tags (custom elements) fall back to a
  generic attribute set (primitive IDL properties + `data-*`/`aria-*`).
- Where an HTML and an SVG tag share a name (`a`, `title`, `script`, `style`), the HTML
  attribute types win.
- `tag` is **required** at the type level — `{}` is a type error. If a non-TypeScript
  caller passes a node without a string `tag` at runtime, `ricdom` logs a `console.error`
  and treats the node as invisible; it never throws.

### `BaseNodeProps` (present on every element node)

| Key | Type | Meaning |
|---|---|---|
| `id` | `string` | DOM `id` |
| `class` | `string \| string[] \| Record<string, boolean>` | Concatenated / filtered into a class list |
| `style` | `Record<string, string \| number>` | Inline style. **Object only** — v1's string/array forms do not exist in v2 |
| `children` | `RicNode \| RicNode[]` | Child nodes. v1 called this `ctx`; v2 always calls it `children` |
| `island` | `true` (or omitted) | See [§2.5](#25-islands) |
| `key` | `string \| number` | Reconciliation identity, see [§2.2](#22-key-based-reconciliation) |
| `ref` | `string` | Registers the rendered DOM element under `app.refs.get(name)` (backed by a `data-ricdom-ref` attribute) |

Any other key is either an event handler (`on*`, assigned as a DOM property), a
`data-*`/`aria-*` attribute, or a tag-specific IDL property/attribute — see §2.1.

### FACT: empty object is not invisible

v1 treated `{}` as invisible (no `ctx` key at all was its own signal for "island"). In v2,
`island` is an explicit flag (§2.5) and `{}` does not type-check without a `tag`, so an
empty object is never a meaningful "invisible" input at the type level. At the
`normalizeNode` level, only `null`/`undefined`/`false`/`[]` are invisible.

---

## 2. Diffing (patch) rules

`ricdom` builds real DOM nodes from a tree and, on every render, diffs the previous tree
against the next one in place — there is no virtual DOM retained between renders beyond
the plain-object tree itself.

### 2.1 Attribute application

- Keys in `DOM_PROPERTY_KEYS` (`value`, `checked`, `selected`, `disabled`, `innerHTML`,
  `textContent`, `innerText`, `scrollTop`, `scrollLeft`) are assigned as DOM **properties**
  (`el.value = x`), not via `setAttribute`.
- `on*` keys are assigned as DOM event-handler properties (`el.onclick = fn`). A new
  function reference on every render is expected and cheap — the handler is simply
  reassigned each patch, so closures over fresh render-scoped variables work correctly.
- Boolean values for any other key toggle the attribute's presence
  (`el.setAttribute(key, '')` / `el.removeAttribute(key)`).
- `null`/`undefined` values remove the attribute.
- Everything else is stringified and set via `setAttribute`.
- `class` on an SVG element is written via `setAttribute('class', …)` (SVG's `className`
  is an `SVGAnimatedString`, not a plain string — direct assignment silently no-ops).
- CSS custom properties (style keys starting with `--`) are written via
  `style.setProperty()`/`removeProperty()` — bracket assignment is a silent no-op for
  these on `CSSStyleDeclaration`.
- `style` keys are camelCased automatically (`background-color` and `backgroundColor` are
  equivalent); `--custom-property` keys are left untouched.

### FACT: `on*` only fires for events with a native IDL handler attribute

`on*` keys are assigned as an element **property** (`el.onclick = fn`, §2.1) — this is a
DOM property assignment, not `addEventListener`. It only does anything observable for
event types the browser itself exposes as an IDL event-handler attribute (`onclick`,
`oninput`, `onscroll`, …). For an event type with no such attribute — most notably
`compositionstart`/`compositionupdate`/`compositionend`, and any custom event
(`el.dispatchEvent(new CustomEvent('my-event'))`) — assigning `el.oncompositionend = fn`
merely creates an inert expando property; it is never invoked, and `ricdom` has no way to
detect this at render time (the assignment itself never throws). Passing
`oncompositionend` as a prop to any component is therefore silent dead code, in both v1
and v2 — this was not a regression introduced by any specific release, just an inherent
limitation of the "reassign a property every patch" mechanism.

Wire these events with `addEventListener` yourself instead, after the element exists —
via `app.refs.get(name)` (§5) in a `setup`/effect-style callback, or from inside a
stateful `use()` part that already holds a reference to its own DOM node. `ricdom/md-
editor`'s `createMdEditor` (§13) is the in-tree example: it needs a `compositionend`
safety net for its mirror sync and does so via `textarea.addEventListener('compositionend',
handler)`, attached/detached whenever the observed `<textarea>` element changes (the same
place its `ResizeObserver` is attached) — not via an `oncompositionend` prop.

### FACT: a function value on a non-`on*` key is never set as an attribute (2.0.0-alpha.15)

A key that is not one of `DOM_PROPERTY_KEYS` and does not match the event-handler pattern
(`/^on[a-z]/`) but receives a `function` value is **never** stringified into the DOM via
`setAttribute` — the attribute is simply not set (existing behavior for other keys, e.g.
`null`/`undefined`, is unaffected). This is a deliberate guard, not a stringification
edge case: a function is never a meaningful HTML attribute value, so a caller who reaches
this path almost certainly mistyped an event-handler or component-prop name (the reported
case: v1's snake_case `transform_image_src` instead of v2's camelCase
`transformImageSrc`; note that `on_resize_end` also lands here, since it fails
`/^on[a-z]/`). In a dev build (`isDevMode()`/`bakedDevMode`, §3.3), this fires
`console.warn` once per attribute key (deduped across renders, not per element) naming the
offending key; the warning — and the `Set` tracking which keys have already warned — is
dead-code-eliminated from production builds via the same `bakedDevMode ?? isDevMode()`
convention as the rest of `src/dom.ts`.

### FACT: `on*` handling of `null`/`undefined` (v1→v2 parity audit #16)

An `on*` key's value that isn't a function is **not** simply "removed" the same way a
plain attribute is — the exact behavior differs by phase, and (confirmed by reading both
`src/dom.ts` and v1's `src/ricdom.js`) is **identical between v1 and v2** in both phases:

- **Initial build**: a `function` value assigns the handler property; `null` explicitly
  assigns `null` to the property; `undefined` is skipped entirely — the property is never
  touched (no handler ends up present either way, so `null` and `undefined` are
  observably the same at build time).
- **Patch (re-render)**: every `on*` key present on the next node has its property
  unconditionally reassigned as `typeof val === 'function' ? val : null` — this means an
  `undefined` value on a re-render **actively clears a previously assigned handler**,
  unlike a plain attribute where `undefined` is treated the same as `null` (removed).
  This is not new v2 behavior — v1's patch function (`_patch_attributes`) has the exact
  same `el[key] = (typeof val === 'function') ? val : null;` line.
- If an `on*` key is present on the previous node but absent from the next node entirely
  (not just `undefined` — the key itself is gone), the handler is also nulled out (both
  versions).

Net effect: `onclick: undefined` and omitting `onclick` altogether behave the same on the
very first render, but differ from `onclick: undefined` on a later render replacing an
`onclick: fn` from an earlier one — the later render **does** clear the handler. This
asymmetry exists in both v1 and v2, so no behavior change was needed; it is documented
here because it was flagged as unconfirmed during the v1→v2 parity audit
(`docs/V1_PARITY_AUDIT.ja.md` #16) and is easy to assume works like a plain attribute.

### 2.2 Key-based reconciliation

If **any** sibling in either the previous or the next children list has a non-null `key`,
the whole sibling list is reconciled by key:

- A next child with a `key` reuses the previous DOM node that had the same `key`
  (regardless of position), and is attribute/child-patched in place.
- A next child without a `key` is matched against previous **unkeyed** siblings in order,
  by same-tag/same-kind, first-available.
- Unmatched previous entries are removed from the DOM; unmatched next entries are built
  fresh and inserted at the correct position.

#### FACT: `key` must be unique among siblings

`key` must be unique within a single sibling list (both in the previous and the next
children array). A duplicate `key` is treated as **unkeyed** starting from its second
occurrence: it is matched against previous unkeyed siblings in order, by same-tag/same-kind
(the same rule as a key-less child, §2.2 above) — it does **not** get a fresh DOM node built
on every render, but it also loses key-based identity (position-based reuse only). A first
occurrence of a `key` that is genuinely new (not present in the previous list, and not a
repeat within the current pass) is unaffected and is still built fresh as usual — duplicate
handling never steals a DOM node from an unrelated, legitimately-new keyed sibling. In a
dev build (`NODE_ENV !== 'production'`), a duplicate `key` triggers one `console.warn` per
render (per parent element) identifying the problem; production builds stay silent (#13,
fixed in 2.0.0-alpha.4 — this bug was inherited from v1's identically-named algorithm).

### 2.3 Position-based reconciliation

If no sibling has a `key`, children are reconciled by index. To avoid two different
element types at the same index being patched into each other's DOM node, a **duplicate
tag detector** first finds any tag that appears more than once (in either list) and gives
those siblings a per-tag serial key (`div@0`, `div@1`, …) purely for the "did the type
change at this position" check — this is not the same mechanism as an explicit `key` and
does not enable reordering.

### 2.4 `FORCE_REAPPLY`

`value`, `checked`, `selected`, `scrollTop`, and `scrollLeft` are re-applied to the DOM on
every render **even when the previous and next VDOM values are equal**, because the user
(typing, checking a box, scrolling) can make the live DOM drift from the last-rendered
value without ricdom knowing. This mirrors the "controlled input" convention used by
React, Preact, and other major VDOM libraries. It also applies to subtrees where the
parent's children list is structurally unchanged (`isJsonEqual` short-circuits the
subtree, but a dedicated walker still re-applies these five keys).

### FACT: the editing guard

While an `input`/`textarea`/`select` element **is** `document.activeElement`, its `value`
is exempted from `FORCE_REAPPLY`. This prevents an unrelated state change elsewhere in the
app from re-rendering and clobbering what the user is mid-typing (this was a real,
user-visible bug in v1 that only had a local fix inside one widget; in v2 it is a core
rule that applies everywhere). The exemption is scoped to `value` only — `checked`,
`selected`, and scroll position are still force-reapplied, since drift there does not
destroy in-progress keystrokes. Once the element loses focus, the next render re-syncs
`value` normally.

**Consequence for programmatic insertion while focused (RaccoonMemo, one of pilots 5-7,
2.0.0-alpha.8)**: because the guard makes the live DOM authoritative for `value` while an
element is focused, a state-driven write to that element's `value` (e.g. pasting an image
→ inserting Markdown, or a drag-and-drop handler that wants to splice text in) has no
effect as long as focus stays there — the next render sees the guard and skips reapplying
`value`, so nothing appears to happen. This isn't a bug to work around; it follows directly
from the rule above. Do the insertion against the **element**, not the state — e.g.
`el.setRangeText(text, start, end, 'end')` or `el.value = ...` plus restoring
`el.selectionStart`/`el.selectionEnd` — and write the same resulting value into state at
the same time, so state and DOM already agree. The guard will not clobber it on the next
render (it's exempting `value` precisely because the DOM is already right), and once the
element blurs, state and DOM must already match — there is no separate blur-time
reconciliation step.

**Interaction with dialog initial focus (LCP, pilot 8, 2.0.0-alpha.9)**: for a dialog whose
body starts with a focusable `textarea`/`input`/`select`, §10.3.1c's default initial focus
lands there the instant it opens, so this guard is already active from that first render —
a state-driven write to that field's `value` is silently skipped until it loses focus.

### 2.5 Islands

`{ tag: 'div', island: true, children: [...] }` tells ricdom to build the element once and
never look at its descendants again on any subsequent render — no diff, no patch, no
`FORCE_REAPPLY` walk. This is for embedding externally-managed DOM (a `<canvas>` driven by
your own animation loop, a third-party widget) inside a ricdom tree without ricdom fighting
it for control of that subtree. v1 used *omitting* the `ctx` key as an implicit island
signal; v2 requires the explicit `island: true` flag, because in a typed tree simply
forgetting to write `children` would otherwise silently turn a node into an island.

### 2.6 `<select>`

Because a browser ignores a `<select>`'s `value` assignment until it has at least one
`<option>` child, `value` is re-applied a second time immediately after all child
`<option>` elements exist in the DOM — in **both** the build path (`buildDomNode`, after
appending children) and the patch path (after `patchChildren` has grown or changed the
option list, at both patch call sites — keyed and positional reconciliation). This matters specifically for a render
that both adds new `<option>`s *and* points `value` at one of them in the same render: the
patch path applies attributes before children, so the first `value` assignment is ignored
(the option doesn't exist yet); without the post-`patchChildren` re-apply, the browser is
left as if `value` had never been set at all (falling back to its own "select the first
option" default, or staying on the previously selected option) — fixed in 2.0.0-alpha.15.
Consumers never need to work around option/value construction order themselves, in either
path. As with any other `value` write, this re-apply still honors the editing guard (§3.2):
while the `<select>` is `document.activeElement`, it is not force-corrected.

### 2.7 SVG

An element whose tag is `svg` establishes the SVG namespace for itself and is inherited by
all of its descendants (`document.createElementNS`), regardless of how deep. An `<svg>`
nested inside an already-SVG-namespaced tree stays in that namespace (namespace, once
entered, is never re-derived from a nested `svg` tag — the inherited one wins for tags
other than `svg` itself).

---

## 3. Reactivity

`createApp(target, state, render)` wraps `state` in a **shallow** `Proxy` (one level deep,
plus one more for object-valued top-level properties):

```
state.count = 1            // tracked → triggers a render
state.user.name = 'x'       // tracked → user itself is a Proxy'd child, its set trap fires
state.user.address.city = 'x' // NOT tracked → nothing renders
```

### Canon: shallow-copy replacement

To change something two or more levels deep, replace the shallow-copied parent:

```js
app.user = { ...app.user, address: { ...app.user.address, city: 'x' } };
```

This is the one and only supported pattern for deep updates — there is no `watch()` /
`effect()` helper and no deep-Proxy mode. It keeps the reactivity system's cost bounded
regardless of state shape, and keeps "why didn't this re-render" answerable by one rule.

### Dev-mode warning for untracked deep assignment

In a non-production build, reading a nested object through the reactive state returns it
wrapped in a second, read-only-style Proxy that detects any `set`/`deleteProperty` reached
through it, then still performs the assignment (so dev and production observe the same
final data — dev additionally may warn, later, once it is clear the assignment was never
picked up by a render).

**The warning is deferred to the end of the task, not fired at the moment of assignment
(2.0.0-alpha.11, changed from firing immediately).** v1's own documented pattern for a deep
update is to write into the nested object in place and *then* trigger the render that will
pick it up, by touching something tracked afterward:

```js
app.pages[0].page.width = 1;   // deep write — not tracked by itself
app.pages = [...app.pages];    // trigger — the render this schedules re-reads the whole
                                // state tree, so the deep write above reaches the screen
                                // through it regardless of whether it was itself "tracked"
```

Warning at the moment of the first line fires on every single instance of this
canon-compliant pattern — which is what 2.0.0-alpha.10 and earlier did, surfaced by a pilot
whose codebase had several dozen call sites in this exact shape, firing hundreds of runtime
warnings and drowning out the one case the warning exists to catch: a deep assignment that
truly never gets picked up because nothing tracked is ever touched afterward.

The fix: a deep `set`/`deleteProperty`/array-mutating-method call no longer calls
`console.warn` immediately. It records the path in a small per-`createApp` pending set and
schedules one `queueMicrotask` flush. Anything that means "the render will pick this up" —
a tracked top-level or one-level-deep assignment (i.e. anything that calls `notify`), or an
explicit synchronous `renderNow()` — clears the entire pending set before that microtask
runs. Only entries still pending when the microtask actually runs (meaning nothing in the
same task ever triggered a render) produce a `console.warn`, one per distinct path
(repeated assignments to the same path within the task collapse into a single warning).

**FACT — the clear is unconditional: any top-level trigger in the same task discards the
whole pending set, regardless of path.** The pending set holds paths, but what clears it does
not consult them — *any* tracked top-level assignment, *any* one-level-deep assignment, or
`renderNow()`, no matter which key it touches, discards every pending entry. This is correct
rather than a loophole: a render re-reads the entire state tree regardless of what triggered
it, so even an unrelated top-level write still carries the deep change to the screen. This is
what a consumer pattern like `mutate(() => { app.pages[0].page.width = 1; }); app.render_tick++`
(bumping an unrelated tracked counter purely to trigger a render after a batch of deep writes)
relies on — `render_tick` has nothing to do with `pages`, and the warning still stays silent.

**FACT — an `await` between the deep write and the trigger defeats this.**
`queueMicrotask` callbacks run as soon as the current task finishes, which is before the
continuation after an `await` runs:

```js
app.pages[0].page.width = 1;
await something();             // the pending flush already ran here — too late
app.pages = [...app.pages];    // this trigger no longer has anything to clear; the
                                // warning already fired
```

This still warns, and that is intentional rather than a gap in the deferral: state left
half-updated across an `await` is a real staleness window in its own right (a render
triggered by something else between the two lines above would see the old value), and the
warning is incidentally also catching that.

Arrays are a separate axis from this and the two halves must not be conflated:

- **Tracking (render scheduling): arrays are never tracked, at any depth** (matches v1,
  unchanged by 2.0.0-alpha.11 below). `state.list.push(x)` never schedules a render, no
  matter how the array was reached. Replacing the array is the one supported pattern —
  `app.list = [...app.list, x]` — because it is an ordinary top-level (or one-level-deep)
  assignment and is tracked like any other.
- **Dev warning: arrays ARE wrapped, from the first level down (2.0.0-alpha.11)**. Before
  2.0.0-alpha.11, the same code path that wraps nested objects for the warning above skipped
  arrays entirely, which meant any assignment reached through an array element — the shape
  most list-like state takes (`state.pages[0].page.width = 1`, `state.items[i].x = 1`) —
  was invisible to the dev warning at any depth, even though it was exactly as untracked as
  the plain-object case the warning exists to catch. Reading an array through reactive state
  in dev now returns a read-only-style Proxy of it (`Array.isArray()` still reports `true`,
  since it's a Proxy *of* the array): element assignment (`arr[0] = x`), `length` assignment,
  and `deleteProperty` warn like the object case; the nine mutating methods
  (`push`/`pop`/`shift`/`unshift`/`splice`/`sort`/`reverse`/`fill`/`copyWithin`) warn once per
  call (not once per element moved internally — the call runs directly against the
  underlying array, bypassing the Proxy's own `set` trap, specifically so `sort()` doesn't
  produce one warning per swap); every non-mutating read (`map`/`filter`/`slice`/`forEach`/
  `find`/`includes`/`indexOf`/`join`/`concat`/`flat`/`entries`/`keys`/`values`/`for...of`/
  `JSON.stringify`/`length` reads) stays silent and returns the same values as production.
  Production (`.iife.min.js`, `__RICDOM_DEV__` baked `false`) is unaffected: arrays read
  from state are the plain, unwrapped array, identical to before this change.

**FACT — structured cloning a value read through the reactive state still throws; the raw
state object itself is always cloneable.** Because dev-mode state reads return Proxy wrappers
(this was already true for plain objects below the first level, and is now also true for
arrays from the first level down), passing a value read from state straight into
`structuredClone()` or `postMessage()` throws `DataCloneError` in dev builds, while the same
call succeeds in production (where the value is the unwrapped original). This is a
consequence of the wrapping, not a bug to route around with a special case — if you need to
hand state data to one of those APIs, produce a plain copy first (`JSON.parse(JSON.stringify(v))`,
or a shallow/deep spread), which also happens to be the same shape of fix the shallow-copy
canon above already asks for.

**Invariant — the raw state object never contains a Proxy, in dev or production, no matter
how many times the canon spread pattern above runs.** A value read from state is wrapped in
dev (unchanged from the FACT above), but writing that same value back into state — directly,
or nested inside a fresh object/array built with a spread (`app.pages = [...app.pages]`,
`{ ...app.pages[0], nodes: [...app.pages[0].nodes] }`) — always unwraps it back to the
identical raw value before it is stored, recursively, in both `createApp`'s `state` and
`app.use()`'s parts. dev and production therefore always hold the same underlying data; only
what a *read* returns differs between them. This closes a 2.0.0-alpha.11 regression
(2.0.0-alpha.13, found by a pilot's differential experiment): reading an array through its
dev-mode wrapper and spreading it (the canon pattern itself) fed the wrapper Proxies for its
elements back into a fresh array, which was then stored as-is — after enough repeated spreads
this left the raw state object holding nested Proxies, at which point `structuredClone()` on
the *raw* object (not a value read from it) also started throwing, and further reads
downstream re-wrapped an already-wrapped Proxy instead of the original value. Neither of
those is possible now: writing a value that turns out to be (or to contain) a proxy the
library itself produced always substitutes the original raw value it was wrapping instead,
so the array-replacement canon never leaves anything but plain data behind in `state`.

Which build counts as "dev" depends on the distribution format (2.0.0-alpha.10, fixing a
gap found while auditing the shipped `.iife.min.js`):

- **`dist/ricdom.iife.min.js`** (the production `<script src>` build) has a build-time
  constant `__RICDOM_DEV__` statically inlined to `false`, which removes this entire code
  path by dead-code elimination — it costs nothing in the shipped bundle. Before
  2.0.0-alpha.10, only `process.env.NODE_ENV` was inlined, but the surrounding
  `typeof process === 'undefined'` guards were not — so in a plain browser with no
  `process` global (the primary target of a `<script src>` build), those guards stayed true
  at runtime and the warning code shipped active in "production" despite the intent.
- **`dist/ricdom.iife.js`** (the dev `<script src>` build, alongside the minified one) has
  `__RICDOM_DEV__` inlined to `true`, so the warning is always active — this is the build to
  use locally when you want to see these warnings from a no-bundler `<script>` tag.
- **ESM/CJS** (the `import`/`require` entry points) do not inline `__RICDOM_DEV__`; they
  defer to whatever `process.env.NODE_ENV` your bundler (Vite, webpack, etc.) substitutes,
  matching the convention used by React and other major libraries.
- Loading the ESM build directly with **no bundler** (e.g. from `esm.sh` or another CDN, or
  a plain `<script type="module">` import) has neither `__RICDOM_DEV__` nor a `process`
  global, so it falls back to dev mode (warnings on) — the library treats "can't tell" as
  dev mode rather than silently hiding the problem.

### FACT: dev mode costs a Proxy trap per nested read; production costs nothing

In dev mode every nested read through the reactive handle (`app.items[i].field`,
`app.map[key].score`, …) goes through the deep-warning Proxy's `get` trap plus a `WeakMap`
lookup. On a hot loop this is measurable: 40,000 nested reads took ~24ms on the dev IIFE vs
~9.5ms on the production IIFE in a jsdom measurement, and a pilot app (a scanner sorting 800
records every 60s) saw 1–1.8s long tasks when it was unknowingly running the pre-alpha.10
`.iife.min.js` in dev mode (see the paragraph above). Production builds have none of this
code, so: **measure performance against `.iife.min.js`, never against `.iife.js`**, and if a
no-bundler ESM deployment is performance-sensitive, bundle it with `NODE_ENV=production`
instead. A dev-only optimization (e.g. not wrapping reads that happen during `render`) is
deliberately not attempted until a consumer reports the dev build itself becoming unusable.

### `ignore`

A property literally named `ignore` (`state.ignore = {...}`) is never wrapped, never
tracked, and mutating anything under it never schedules a render. Use it for large caches
or non-reactive scratch space that lives alongside reactive state.

### FACT: mutating the original `state` object does nothing

```js
const state = { count: 0 };
const app = createApp('#app', state, (s) => ({ tag: 'div', children: [s.count] }));
state.count = 1;       // does NOT re-render — `state` is not the Proxy
app.count = 1;          // DOES re-render — `app` (and the render callback's `s`) are the Proxy
```

`createApp` never replaces or proxies the reference you passed in — it wraps it. Only the
returned `app` handle (and the `s` parameter your `render` function receives, which is the
same object) is reactive. This is true in v1 as well, but it is easy to trip over,
especially when refactoring state setup into its own function and holding onto the
original local variable by habit — the fix is always "use the handle you got back from
`createApp`, not the object you built."

---

## 4. Scheduler

Every render request (a `Proxy` `set`, or `app.use()`'s part calling `host.notify()`) goes
through a scheduler that arms **both** `requestAnimationFrame` and `setTimeout(fn, 200)` at
once; whichever fires first performs the render, and the other is cancelled. This exists
because `requestAnimationFrame` does not fire reliably in every environment ricdom targets
— a backgrounded/hidden browser tab, an Electron window with `backgroundThrottling`, a
kiosk mid-transition — and a render that silently never happens is worse than one that is
merely ~200ms late. Multiple render requests within one scheduling window collapse into a
single render.

### `renderNow()` vs `nextRender()`

- `app.renderNow()` cancels any pending scheduled render and renders **synchronously,
  immediately**. Use it when you need "definitely rendered by the time this line returns"
  and don't care whether anything was actually pending.
- `app.nextRender()` returns a `Promise<void>` that resolves once the **next scheduled
  render actually completes**. If no render is currently scheduled, the promise never
  resolves — it observes a pending render, it does not force one. Use it in tests/E2E code
  that needs to await "the DOM has caught up with a state change I just made," not as a
  general-purpose "wait a tick."

### FACT: hidden tabs throttle both halves of the backstop

A hidden/backgrounded tab (or any document where `document.hasFocus() === false`) does not
just stop `requestAnimationFrame` — most browsers also throttle `setTimeout` in that state,
typically to no faster than about once per second. The 200ms backstop described above is
still armed and will still eventually fire, but "eventually" can mean up to ~1s in a hidden
tab, not 200ms. A test (or any code) that needs the DOM to reflect a state change
immediately, regardless of tab visibility/focus, should call `app.renderNow()` rather than
waiting on a timer — `nextRender()`/a bare `setTimeout` wait is not reliable under
throttling.

### FACT: the "2 rAF rule"

A `requestAnimationFrame` callback firing does **not** mean the browser has laid out or
painted the DOM mutations that callback just made — it means a new frame has *started*.
If your own code needs to measure post-patch layout (element size, scroll position) you
generally need to wait for a *second* `requestAnimationFrame` after the one in which the
DOM mutation happened, not just one. This is a browser platform fact, not a ricdom API;
several `ricdom/ui` components that measure the DOM after opening (popup/dropdown
positioning) account for it internally.

---

## 5. `createApp`

```ts
function createApp<S extends object>(
  target: string | Element,
  state: S,
  render: (state: S) => RicNode,
  options?: { portalTo?: Element; setup?: (app: App<S>) => void },
): App<S>;
```

`render` is a required, separate third argument — not a property placed inside `state` (a
form v1 also supported). This is the only signature; there is no overload. Keeping `render`
out of `state` lets `S` be inferred cleanly from the `state` argument, so the `s` parameter
your `render` callback receives is fully typed with no manual type annotation and no
self-referential generic.

### `options.setup`

`setup(app)` runs **once, immediately before the first render** — after the app and its
portal (§7) exist, but before `render` is called for the first time. Anything registered
with `app.use()` inside `setup` is therefore already attached (has a `Host`) by the time
the first `render` call references it — no placeholder-then-`renderNow()` two-step needed:

```js
let dlg;
const app = createApp(
  '#app',
  {},
  () => dlg({ triggerChildren: ['Open'], title: 'Confirm', children: ['Really?'] }),
  { setup: (a) => { dlg = a.use(createDialog()); } },
);
```

Without `setup`, `render` would have to guard the first call (`dlg ? dlg(...) : null`)
because `createApp` itself performs the first render synchronously, before the line that
calls `app.use()` has had a chance to run — `setup` exists specifically so that placeholder
branch is never necessary. If `setup` throws, the exception is caught, logged via
`console.error`, and the first render proceeds normally (never throws, per project
convention). `setup` is **not** called when `createApp` returns a NOOP app (invalid
`target`/`state`/`render`) — there is no app/portal for it to receive.

### Target resolution

- `target` may be a CSS selector string or an `Element`.
- If it resolves immediately, `createApp` performs a **synchronous first render** before
  returning — there is no `await`, no next-tick delay, no flash of unstyled/empty content
  window.
- If it is a selector string that does not currently match anything, and
  `document.readyState === 'loading'`, `createApp` waits for `DOMContentLoaded` **once**
  and retries resolution then (this covers the common case of a `<script>` running in
  `<head>` before `<body>` has parsed). While waiting, the returned handle already behaves
  like a normal `App<S>` for reading/writing state (backed by a temporary Proxy over your
  state object) — `render`, `renderNow()`/`unmount()` are no-ops, `nextRender()` never
  resolves, and `use()` returns the part unchanged, until the target resolves.
- If the target still cannot be resolved (already past `DOMContentLoaded`, or resolution
  fails after waiting), `createApp` logs `console.error` and returns a **NOOP app**.

### NOOP app

`createApp` never throws. On any invalid argument (`target` not a string/Element, `state`
not an object, `render` not a function) or unresolvable target, it logs a descriptive
`console.error` and returns an object that structurally satisfies `App<S>` — every
property read returns itself, every method call is a no-op that returns itself, every
property write succeeds silently. Calling code can chain `app.count`, `app.renderNow()`,
`app.use(part)` etc. against a NOOP app without adding a branch to check "did this actually
work," matching the project's "never let a wiring mistake cascade into a crash of unrelated
code" stance. The trade-off is explicit: prefer catching setup mistakes via `console.error`
during development over hard failures in front of end users.

### `App<S>`

The value returned by `createApp` (and the `s` argument to `render`) is `state` itself,
Proxy-wrapped, with these additional members layered on top (they are reserved property
names — assigning to `app.render`, `app.renderNow`, etc. either performs the documented
special behavior or logs `console.error` and refuses):

| Member | Type | Behavior |
|---|---|---|
| `render` | `(state: S) => RicNode` | Current render function. Assigning a new function replaces it and renders synchronously right away |
| `renderNow()` | `() => void` | See §4 |
| `nextRender()` | `() => Promise<void>` | See §4 |
| `use(part)` | `<T extends UsePart>(part: T) => T` | See §6. Idempotent — registering the same part object twice is a no-op |
| `unmount()` | `() => void` | Disposes all registered parts, stops the scheduler, clears refs. Nothing renders again after this |
| `refs` | `ReadonlyMap<string, Element>` | Every element with a `ref: 'name'` in the last-rendered tree, keyed by that name; recomputed after each render, **including elements inside the portal** (§7) |

### FACT: `app.render = fn` is a sanctioned two-stage wiring pattern (2.0.0-alpha.8)

Passing `() => null` as `createApp`'s third argument and reassigning `app.render` right
after is not a workaround — it's one of exactly two canon ways to break a circular
dependency between "the handle" and "what it renders" (the other is `options.setup`, §5).
This comes up whenever building the render function needs the `App` handle itself (e.g. a
part built with `app.use(...)` that the render function then calls), which you don't have
until `createApp` returns:

```js
const app = createApp(target, state, () => null); // initial render: nothing yet
const panel = app.use(createTweakPanel());          // now you have the handle
app.render = (s) => panel({ title: 'Params', data: s }); // sanctioned reassignment,
                                                          // renders synchronously right away
```

There is no separate "lenient mode" where omitting `render` (or passing a nullish value)
skips the initial synchronous render — `createApp`'s render argument is required and
called immediately either way (§5, "a **synchronous first render**"); `() => null` is
just an ordinary render function that happens to render nothing yet. Once `app.render` is
reassigned, the next render reflects it, synchronously, same as any other reassignment (see
table above).

### FACT: portal `ref`s are collected in the same render they first appear

`refs` collection runs *after* the portal has been patched for that render (not before),
so a `ref` on an element returned from a stateful component's `renderPortal()` (a dialog
body input, say) is already present in `app.refs` by the time that render's `nextRender()`
promise resolves — there is no "wait one extra render" step. This is what makes
`createFocusWhen` (§10.3.1a) usable on the very render a dialog opens.

---

## 6. `use()` and the component contract

Stateful UI components (dialog, popup, toast, tooltip, and the other `ricdom/ui` widgets
that hold internal state or need a place to portal into) must be registered via
`app.use()` before they will do anything:

```js
const dlg = app.use(createDialog());
// render:
dlg({ triggerChildren: ['Open'], title: 'Confirm', children: ['Really?'] })
```

```ts
interface UsePart {
  attach?: (host: Host) => void;
  dispose?: () => void;
  renderPortal?: () => RicNode;
}
interface Host {
  notify(): void;   // request a render, same scheduler as a state assignment
  portal: Element;   // this app's portal element (§7)
  app: App<any>;      // the app instance this part was registered on
}
```

`app.use(part)` calls `part.attach?.(host)` and returns `part` unchanged (so
`const dlg = app.use(createDialog())` reads naturally). `app.unmount()` calls
`part.dispose?.()` on every registered part.

### FACT: calling a stateful component without `use()` does nothing, on purpose

If you call `createDialog()()` directly, without ever passing it through `app.use()`, the
component has no `Host` and therefore no way to notify or portal. Every `ricdom/ui`
stateful component detects this and, **the first time only**, logs a `console.error`
explaining the fix, then returns `null`/renders nothing on every subsequent call — it does
not throw, and it does not spam the console. This replaces v1's implicit wiring (assigning
a factory's return value to a specific place in `state` silently activated a hidden
`Proxy` trap); in v2 there is exactly one way to register a part, so "I forgot to wire this
up" surfaces immediately in the console instead of failing silently.

### Stateless components are plain functions

Anything without internal state — `uiButton`, `uiInput`, layout (`uiCol`/`uiRow`/`uiGrid`/
`uiPanel`), `uiText`, `uiIcon`, markdown/code display, `uiInlineMenu`, `bind*` — is just a
function `(props) => RicNode`. There is nothing to register and no `Host`; call it directly
in your render tree.

---

## 7. Portals

Every `App` created without `options.portalTo` gets its own portal element: `createApp`
appends a `<div data-ricdom-role="portal">` as the last child of `target`, marked
`island: true` (so ricdom's own diffing never descends into it structurally — only the
portal's own dedicated patch cycle touches its contents) and given a fixed `key` so
key-based reconciliation always finds the same DOM node across renders even when the rest
of the tree's visible/invisible shape changes from render to render.

On every render, `createApp` collects `renderPortal()` from every currently-registered
part and diffs that combined list against the portal element's previous content — this is
a pull, not a push: nothing can "queue up and never drain," because the content is always
"whatever every registered part's `renderPortal()` returns right now."

### `portalTo`

```js
createApp('#app', state, render, { portalTo: document.getElementById('my-portal') });
```

Passing `portalTo` uses that element instead of auto-generating one — useful for anchoring
portal content (dialogs, toasts) to a specific place in the DOM regardless of where
`target` itself lives. When `portalTo` is set, the portal element is **not** managed as
part of `target`'s child list (it is not a sentinel node inside the app's own tree).

### One portal per app

Multiple independent `createApp()` calls each get (or are given) their own portal — there
is no global/shared portal registry and no cross-app portal stacking order to reason
about.

### FACT: Electron — portal elements need `-webkit-app-region: no-drag`

If your app's title bar (or any ancestor of the portal element) has
`-webkit-app-region: drag` set (the standard way to make an Electron custom title bar
draggable), that region also swallows clicks on anything rendered inside it — including a
dialog/popup/toast/tooltip mounted into ricdom's portal, if the portal happens to sit under
that draggable area. `-webkit-app-region` is not a normal CSS property that stops at
`position: fixed`/`z-index` stacking contexts the way you'd expect; it is inherited
independently of the box model. Add this one rule to your own stylesheet (not something
`ricdom-ui.css` sets on your behalf — it's Electron-specific and irrelevant to every other
target):

```css
[data-ricdom-role="portal"] { -webkit-app-region: no-drag; }
```

### FACT: Electron — hidden windows throttle both `requestAnimationFrame` and the `setTimeout` backstop (2.0.0-alpha.9)

When an Electron `BrowserWindow` is hidden (minimized, on an inactive workspace, or an
off-screen/background window used for pre-rendering), `document.visibilityState` becomes
`'hidden'` and Chromium stops firing `requestAnimationFrame` entirely — the same throttling
a background browser tab gets. This is not unique to ricdom: the core scheduler's
rAF-and-200ms-`setTimeout`-backstop double-up (§4) exists precisely because rAF can stop,
and every `ricdom/ui` part that waits on an entrance/exit CSS `animationend` (dialog,
popup, toast, tooltip, `createScrollPane`'s follow-scroll as of 2.0.0-alpha.9 — see §10)
has the same 200ms-or-`ANIMATION_FALLBACK_MS`-backstop shape for the same reason. But in a
hidden window, Chromium *also* clamps `setTimeout`/`setInterval` to fire no more than about
once per second — so the backstop itself is throttled, not just rAF. The practical
consequence: rendering and every animation-driven state transition (a dialog finishing its
open/close, a toast auto-dismissing, `createScrollPane` catching up to newly-added
content) can lag up to roughly 1 second behind in a hidden Electron window, instead of the
usual ~16ms (rAF) or 200ms (backstop) upper bound. This is confirmed unchanged from v1 (a
pilot app ran the same scenario against v1 and v2 side by side and saw the same ~1s lag in
both) — it is a Chromium/Electron platform behavior, not a ricdom regression.

If your E2E tests drive a window that starts hidden, is backgrounded during the test, or
runs against `nativeWindowOpen`/multiple `BrowserWindow`s where only one has focus, set
`webPreferences: { backgroundThrottling: false }` on that `BrowserWindow` — this disables
the throttling described above (both rAF and the `setTimeout` clamp) so timing in tests
matches what a focused, visible window would do.

### FACT: the portal element always exists, and can add to flex/grid gaps while empty (2.0.0-alpha.6)

The auto-generated portal element (`[data-ricdom-role="portal"]`) is appended to `target`
unconditionally, whether or not your app ever registers a part with `renderPortal()`. For
an app that never uses a portal-backed component (dialog/popup/toast/tooltip/dropdown),
this div sits there empty for the app's entire lifetime. If `target` happens to be a flex
or grid container with a `gap`, an empty block-level child still counts as a layout
participant — it contributes one extra `gap` to the total, even though it renders nothing
visible.

If you load `ricdom-ui.css` (directly or via `injectStyles`), this is already handled: the
stylesheet includes `[data-ricdom-role="portal"]:empty { display: none; }`, so the portal
element is removed from flow entirely while empty and rejoins normally the moment a part
renders something into it. If you use ricdom's core only (no `ricdom-ui.css`), add the same
one-line rule to your own CSS, or sidestep the auto-generated portal altogether with
`portalTo`.

---

## 8. Themes

```ts
applyTheme(el: Element, opts?: {
  theme?: 'light' | 'dark' | 'teal' | 'cyber' | 'aqua' | 'glass' | 'glass-dark' | Record<string, string>;
  density?: 'comfortable' | 'compact' | 'tight' | Record<string, string>;
  fontSize?: 'sm' | 'md' | 'lg' | Record<string, string>;
}): void;
```

`applyTheme` computes a set of CSS custom properties (plus the plain `color-scheme`
property) and writes them as **inline style** on `el` via `style.setProperty()`, then
marks `el` with `data-ricdom-theme` (an attribute, not a class — used by the scrollbar CSS
scope, see §9). There is no `:root` write and no global singleton theme: different
elements on the same page — different `createApp` mounts, or nested containers — can each
carry their own theme, and CSS custom-property inheritance carries the values down to
descendants normally.

### CSS variables set by `applyTheme`

Color/theme (from the `theme` option — one of the seven bundled names, or your own
`Record<string, string>` of the same keys):

`--ric-color-fg`, `--ric-color-fg-muted`, `--ric-color-bg`, `--ric-color-control`,
`--ric-color-border`, `--ric-color-accent`, `--ric-color-accent-fg`, `--ric-tooltip-bg`,
`--ric-tooltip-fg`, `--ric-code-bg`, `--ric-code-fg`, `--ric-shadow`, `--ric-radius`,
`--ric-surface-blur` (new in `2.0.0-alpha.18`, see below), `--ric-theme` (new in
`2.0.0-alpha.19`, see below), `--ric-panel-bg` (new in `2.0.0-alpha.20`, see below),
`--ric-popup-bg`, `--ric-popup-blur`, `--ric-panel-shadow`, `color-scheme` — **all seven**
bundled palettes set all of these (see the "same key set" FACT below; before
`2.0.0-alpha.21` the last three were only set by `cyber`/`aqua`/`glass`/`glass-dark`,
`light`/`dark`/`teal` fell back to the CSS defaults baked into `ricdom-ui.css`).
`cyber`/`aqua` additionally set `--ric-duration`/`--ric-easing` as literal palette values
(other themes still fall back to `computeThemeVars`'s own defaults for those two — see
"Computed regardless of options" below — so this one pair is deliberately *not* part of the
uniform key-set guarantee).

Density (from the `density` option): `--ric-gap`, `--ric-pad-x`, `--ric-pad-y`,
`--ric-control-h`.

Font size (from the `fontSize` option): `--ric-font-size`.

Computed regardless of options, if not already supplied by the resolved theme/overrides:
`--ric-color-fg-muted`, `--ric-color-border` (both `color-mix()` derived from
`--ric-color-fg` when a custom `theme` object omits them), `--ric-scrollbar-thumb`,
`--ric-scrollbar-thumb-hover`, `--ric-gap-md` (`calc(var(--ric-gap) * 2)`),
`--ric-duration` (`200ms`), `--ric-easing` (`ease`).

### FACT: `glass`/`glass-dark` (frosted glass, `2.0.0-alpha.18`) and `--ric-surface-blur`

Two new bundled themes, `glass` (light frost, `color-scheme: light`) and `glass-dark`
(dark frost, `color-scheme: dark`), model Windows 11 Acrylic / iOS translucency: a
built-in gradient `--ric-color-bg` (so the theme looks intentional in a plain browser
out of the box), translucent `rgba()` `--ric-color-control`/`--ric-color-border`/
`--ric-popup-bg`, and a soft `--ric-shadow` with an inset highlight for a glass edge.

`--ric-surface-blur` is the new public token holding the actual `backdrop-filter` value
for `glass`/`glass-dark` (e.g. `blur(24px) saturate(160%)`); the other five bundled
themes set it to the literal string `'none'` so the token is always present (`exportTheme`
round-trips it regardless of theme). `ricdom-ui.css` applies
`backdrop-filter: var(--ric-surface-blur, none)` (plus the `-webkit-` prefix) to every
**floating** surface: `.ric-dialog`, `.ric-toast__item`, `.ric-tooltip__popup`,
`.ric-dropdown__body`, the tweak panel root (`.ric-tweak`), and `.ric-inline-menu`.
`.ric-popup__body` and `.ric-panel` instead resolve through the existing `--ric-popup-blur`
token, whose CSS fallback chain is now `var(--ric-popup-blur, var(--ric-surface-blur,
none))` — `glass`/`glass-dark` set `--ric-popup-blur` to the same literal value as
`--ric-surface-blur` (not a `var()` reference, so both are independently readable via
`exportTheme`), matching how `cyber`/`aqua` already set `--ric-popup-blur` on their own.
**Controls are excluded on purpose**: `.ric-input`, `.ric-textarea`, `.ric-button`,
`.ric-select`, `.ric-checkbox`, `.ric-radio`, tables, etc. never receive `backdrop-filter`
— its rendering cost scales with the number of filtered elements, and controls can exist
in large numbers, unlike the handful of floating surfaces open at once. Controls still look
translucent under `glass`/`glass-dark` because `--ric-color-control`/`--ric-color-border`
are `rgba()` values, just without the blur itself.

Because the five pre-`glass` themes all resolve `--ric-surface-blur` to `'none'`, and
`--ric-popup-blur`'s fallback chain is unchanged for them (`cyber`/`aqua` still set it
explicitly; the rest still fall through to `none`), their rendering is unaffected —
verified with the existing browser theme tests and the examples smoke test.

### FACT: `--ric-theme` is a data marker, not a rendered value (`2.0.0-alpha.19`)

Every bundled palette (`light`/`dark`/`teal`/`cyber`/`aqua`/`glass`/`glass-dark`) sets
`--ric-theme` to its own name as a plain string. `ricdom-ui.css` never reads it — no rule
references `var(--ric-theme, ...)` anywhere — it exists purely so `applyTheme` (and, if you
want, your own code) can tell which bundled theme a resolved set of vars came from, even
after it has passed through `createTheme(base, overrides)`. Because `createTheme` spreads
its base palette before applying `overrides`, a theme built with `createTheme('glass', {
'--ric-color-bg': 'transparent' })` carries `--ric-theme: 'glass'` automatically, unless
your own `overrides` explicitly replace it.

Two things key off `--ric-theme`, both previously keyed off the literal string you passed
as `opts.theme` (which meant they silently didn't apply to a `createTheme(...)`-derived
`ThemeVars` object — see the next two FACTs, fixed in `2.0.0-alpha.19`):

- **`data-ricdom-theme`'s attribute value.** `applyTheme` now sets
  `el.setAttribute('data-ricdom-theme', resolvedThemeName)` where `resolvedThemeName` is
  `vars['--ric-theme']` if it's a string, else `''`. A bundled name (string or
  `createTheme`-derived) resolves to that name (e.g. `data-ricdom-theme="glass"`); a fully
  custom `ThemeVars` object that never sets `--ric-theme` still resolves to `''`, unchanged
  from before. Since `[data-ricdom-theme]` (used by the paint/scrollbar rules, see below)
  matches on the attribute's *presence*, not a particular value, this is purely additive —
  it doesn't change which elements those rules match. It does let your own CSS or code key
  on the value, e.g. `[data-ricdom-theme="dark"] { ... }`, or read it back with
  `getComputedStyle(el).getPropertyValue('--ric-theme')`.
- **The `prefers-reduced-transparency` override** — see the next FACT.

A custom palette that never sets `--ric-theme` (or sets it to your own string) is not an
error — `applyTheme` doesn't validate it, the same as any other `--ric-*` value.

### FACT: `prefers-reduced-transparency` is applied once, at `applyTheme` call time

Theme variables are written as **inline style** by `applyTheme` (see above), so a
stylesheet `@media (prefers-reduced-transparency: reduce)` rule cannot override them.
Instead, `applyTheme` checks `window.matchMedia('(prefers-reduced-transparency: reduce)')`
itself: if the *resolved* `--ric-theme` marker (see above) is `'glass'` or `'glass-dark'`
and the media query matches, an opaque override set is merged in before the variables are
applied — `--ric-surface-blur`/`--ric-popup-blur` become `'none'` and
`--ric-color-control`/`--ric-popup-bg`/`--ric-color-border` become opaque colors.
**`--ric-color-bg` is deliberately excluded** from this override set, so the Electron
transparent-window recipe below (`--ric-color-bg: 'transparent'`) survives
reduced-transparency unchanged. Since the check keys on `--ric-theme` rather than on
whatever you literally passed as `opts.theme`, it applies equally whether `theme` is the
bundled string `'glass'`/`'glass-dark'` or a `createTheme('glass', overrides)`-derived
`ThemeVars` object — **before `2.0.0-alpha.19` it only fired for the literal string**, so a
`ThemeVars` object built with `createTheme` silently lost this accessibility fallback (a
real gap, since `createTheme('glass', { '--ric-color-bg': 'transparent' })` is exactly the
form this file's own Electron recipe below recommends). A fully custom `ThemeVars` object
that never sets `--ric-theme` still never triggers this override — there's no way to infer
the right opaque set for an arbitrary custom theme. An environment without `matchMedia`
(e.g. `jsdom`) or one where calling it throws is treated as "not reduced" — the theme
renders translucent as normal, rather than failing.

**This check happens once, at the moment `applyTheme` runs** — it is not a live
subscription. An app that wants to react to the user changing this OS setting while the
page is open must re-call `applyTheme` itself, e.g. from a
`matchMedia(...).addEventListener('change', ...)` handler (see
[TUTORIAL.md §6](TUTORIAL.md#6-theme-and-css) for a snippet).

### FACT: `--ric-color-bg: transparent` works, for Electron's transparent-window themes

`applyTheme` does not validate the value of any `--ric-*` variable — a `theme` object (or
`createTheme(base, overrides)` result) with `--ric-color-bg: 'transparent'` passes straight
through to `style.setProperty` like any other value, and `[data-ricdom-theme]`'s only other
paint is `color`/`font-size` (§ below) — there is no other opaque background declared on
the attribute selector that would block it. This is the mechanism a `glass`/`glass-dark`
consumer uses to let an Electron `BrowserWindow`'s own transparency (`backgroundMaterial:
'acrylic'`/`'mica'`, `vibrancy`, or `transparent: true`) show through instead of the
theme's built-in wallpaper-gradient `--ric-color-bg` — see TUTORIAL.md §6. `backgroundColor`
must also be transparent (e.g. `'#00000000'`) — an opaque `backgroundColor` on the
`BrowserWindow` (even Electron's own default) blocks acrylic/mica outright on Windows,
independent of anything `--ric-color-bg` does.

### FACT: floating/container surfaces read a *surface* token, never `--ric-color-bg`
(`--ric-panel-bg`, `2.0.0-alpha.20`)

The FACT above means `--ric-color-bg` overriding to `'transparent'` only clears the *page*
paint (`[data-ricdom-theme]`). Every floating or container surface in `ricdom-ui.css` is
designed to keep its own opacity regardless of what the page background is set to, by
reading a dedicated surface token instead: `.ric-dialog`/`.ric-toast__item` read
`var(--ric-popup-bg, var(--ric-color-bg))`, `.ric-popup__body`/`.ric-dropdown__body`/
`.ric-inline-menu` read `--ric-color-control`, `.ric-tooltip__popup` reads
`--ric-tooltip-bg`, and — new in `2.0.0-alpha.20` — `.ric-panel`/the tweak panel
(`.ric-tweak`) read `var(--ric-panel-bg, var(--ric-color-bg))`. `--ric-panel-bg` is a new
public token, present on all seven bundled palettes (`exportTheme`/`exportSettings` round-trip
it like any other `--ric-*` key): identical to that theme's `--ric-color-bg` value on the
five pre-`glass` themes (`light`/`dark`/`teal`/`cyber`/`aqua`), so their rendering is
pixel-unchanged; an independent translucent value on `glass`/`glass-dark`
(`rgba(255,255,255,0.45)` / `rgba(15,23,42,0.5)`) so the panel keeps a visible surface over
a transparent page background. `GLASS_REDUCED_TRANSPARENCY` (see the
`prefers-reduced-transparency` FACT below) also sets an opaque `--ric-panel-bg` for both
glass themes, matching `--ric-color-control`'s reduced value.

Before this fix, `.ric-panel`/`.ric-tweak` read `--ric-color-bg` directly — so the Electron
recipe two FACTs up (which exists specifically to make `--ric-color-bg` transparent) hollowed
out every panel's surface along with the page, leaving only its `backdrop-filter` blur. On
`glass-dark` this made the near-white `--ric-color-fg` text unreadable over a bright
wallpaper (reported by Trend Guard, pilot #2, report #16, `2026-09-17`). Any *new*
floating/container CSS rule must follow this same principle: read a surface token
(`--ric-color-control`, `--ric-popup-bg`, `--ric-panel-bg`, or a dedicated token like
`--ric-tooltip-bg`), never `--ric-color-bg`/`${bg}` directly — see the comment above
`PANEL_CSS` in `src/ui/cssTemplates.ts`.

### FACT: every bundled palette defines the same key set (`2.0.0-alpha.21`)

All seven bundled palettes (`light`/`dark`/`teal`/`cyber`/`aqua`/`glass`/`glass-dark`) set
exactly the same 28 color/theme keys — no palette defines a key another one omits, and
`tests/ui/theme.test.ts` asserts this by computing the union of every palette's `el.style`
property names after `applyTheme` and diffing each palette against it, so a future
imbalance fails immediately rather than surfacing as a rendering difference. The 28 keys:
`--ric-color-fg`, `--ric-color-fg-muted`, `--ric-color-bg`, `--ric-panel-bg`,
`--ric-color-control`, `--ric-color-border`, `--ric-color-accent`, `--ric-color-accent-fg`,
`--ric-tooltip-bg`, `--ric-tooltip-fg`, `--ric-code-bg`, `--ric-code-fg`, `--ric-popup-bg`,
`--ric-popup-blur`, `--ric-panel-shadow`, `--ric-shadow`, `--ric-radius`,
`--ric-surface-blur`, `--ric-theme`, `color-scheme`, and the eight `--ric-md-*` tokens
(`--ric-md-heading`, `--ric-md-emphasis`, `--ric-md-link`, `--ric-md-url`,
`--ric-md-code-bg`, `--ric-md-quote`, `--ric-md-marker`, `--ric-md-meta` —
`ricdom/md-editor`'s tokens). `--ric-duration`/`--ric-easing` are deliberately excluded from
this guarantee: `cyber`/`aqua` set them as literal palette values, the other five don't and
instead pick up `computeThemeVars`'s own defaults (`200ms`/`ease`, see "Computed regardless
of options" above) — the *rendered* result is still consistent across all seven, just via a
different mechanism for two of them.

Before this release, `--ric-popup-bg`/`--ric-popup-blur`/`--ric-panel-shadow` were the
exception: only `cyber`/`aqua`/`glass`/`glass-dark` set them, so `light`/`dark`/`teal` (and,
for `--ric-panel-shadow` specifically, `glass`/`glass-dark` too) relied on the CSS
fallback chain (`var(--ric-popup-bg, var(--ric-color-bg))` etc., `cssTemplates.ts`) to look
right. Reachable in isolation this is harmless, but it interacted badly with the next FACT
(switching themes on one element) — see below. The fix added the missing keys with literal
values equal to what the CSS fallback already resolved to for each of those themes (e.g.
`light`'s `--ric-popup-bg` is now `'#f9fafb'`, the same string as its `--ric-color-bg`), so
rendering is pixel-identical to before; only `cyber`/`aqua`, which already had their own
distinct (non-fallback) values for these three keys, are unaffected by this change (reported
by Rancha, pilot #6).

### FACT: `applyTheme` owns the element's inline `--ric-*` custom properties (`2.0.0-alpha.21`)

Calling `applyTheme` on the same element more than once — to switch themes — clears any
inline `--ric-*` custom property that the *new* call's resolved `vars` doesn't include,
in addition to setting the ones it does. Concretely: `applyTheme(el, { theme: 'cyber' })`
followed by `applyTheme(el, { theme: 'dark' })` leaves `el` with `dark`'s
`--ric-popup-bg`/`--ric-popup-blur`/`--ric-panel-shadow` (not `cyber`'s stale values, and
not `cyber`'s values mixed with `dark`'s — every key resolves to exactly what a *fresh*
`applyTheme(el, { theme: 'dark' })` on a blank element would produce). Before this release
`applyTheme` only ever called `style.setProperty()` for the new theme's own keys, so a key
present in an old theme but absent from the new one (e.g. `cyber`'s `--ric-popup-bg` before
`dark` had its own — see the previous FACT) stayed behind as a leftover, and the page
rendered a mix of two themes' surfaces. Now, all seven bundled palettes define the same key
set, so this specific case can no longer occur between bundled themes — but the ownership
rule still matters for a custom `ThemeVars` object (or `createTheme(base, overrides)`) that
carries a key none of the bundled palettes use: that key is cleared the next time
`applyTheme` runs on the same element with a `theme` that doesn't include it.

**Only inline properties whose name starts with `--ric-` are touched.** A non-`--ric-*`
inline property you set yourself (`el.style.setProperty('--app-accent', ...)`,
`el.style.width = '10px'`, etc.) is left alone. If you want a custom variable to survive a
later `applyTheme` call on the same element, pass it through `createTheme(base, overrides)`
(so it becomes part of `vars` every time) rather than setting it directly on `el` — a value
set directly on `el` before or after `applyTheme` that happens to *not* start with `--ric-`
survives; one that does start with `--ric-` does not, once a later `applyTheme` call omits
it.

### `color-scheme` and native controls

Because `applyTheme` sets the `color-scheme` CSS property (not just a `--ric-*` variable),
native browser chrome inside the themed subtree — scrollbars, `<select>` dropdowns,
checkboxes, date pickers — automatically follows light/dark, without any ricdom-specific
styling of those controls.

### `createTheme` / `createDensity` / `createFontSize` / `exportTheme` / `exportSettings`

- `createTheme(base, overrides)` returns a plain `ThemeVars` object (a merge of a base
  theme's color variables with your overrides) suitable for passing back into
  `applyTheme(el, { theme: createTheme(...) })`.
- `createDensity(base, overrides)` / `createFontSize(base, overrides)` are the `density`/
  `fontSize` counterparts of `createTheme`, added in `2.0.0-alpha.10` (a straight port of
  v1's `create_density`/`create_font_size` from `ric_ui/context.js`, which return the same
  kind of plain variable map). Each defaults its `base` to the same bundled default
  `applyTheme` uses (`'comfortable'` / `'md'` respectively), merges in `overrides`, and
  accepts either one of the bundled names or a `ThemeVars` object as `base` (in which case
  it's used as-is, bypassing name resolution). The result is a plain `ThemeVars` object,
  suitable for passing straight into `applyTheme(el, { density: createDensity(...) })` /
  `applyTheme(el, { fontSize: createFontSize(...) })` — including the round-trip case where
  the values you get back exactly match what `applyTheme` would have computed from the same
  name. Before this release, `ricdom/ui` had no way to *read* a density/font-size preset's
  computed variables without calling `applyTheme` on a detached element and reading them
  back off `el.style` — undocumented, and dependent on the exact (non-public) variable
  names `applyTheme` happens to use.
- `exportTheme(el)` reads the current `--ric-*`/`color-scheme` inline-style values off
  `el` (density/font-size variables are excluded) — round-trips with `applyTheme`, e.g.
  for persisting a user's theme choice to `localStorage`. `--ric-theme` round-trips the
  same way as any other `--ric-*` variable (no special-casing in `exportTheme`), so
  `applyTheme(el2, { theme: exportTheme(el1) })` reproduces `el1`'s `data-ricdom-theme`
  attribute value on `el2` too, not just its CSS variables.
- `exportSettings(el)`, added in `2.0.0-alpha.14` (a port of v1's `export_settings` from
  `ric_ui/context.js`, flagged as missing by the v1→v2 parity audit, #2), reads the same
  inline styles as `exportTheme` but returns all three groups separately: `{ theme,
  density, fontSize }`, each a plain `ThemeVars` object. `exportSettings(el).theme` always
  equals `exportTheme(el)` (both use the same variable-name classification internally) —
  use `exportTheme` if you only ever persist the color theme, `exportSettings` if you also
  want to save/restore a user's density and font-size choice. The result round-trips
  directly into `applyTheme(el2, exportSettings(el1))`.

### FACT: no built-in mechanism keeps multiple `applyTheme`d roots in sync (v1→v2 parity audit #12)

`applyTheme` only ever touches the one element it's called on — there is no event (no
`ric-theme-change` or equivalent) fired when a theme is applied, and no registry of
previously-themed elements. If an app calls `applyTheme` on more than one root (e.g. a
main window and a detached popout, or a host page plus an embedded island with its own
theme), keeping them showing the same theme is entirely the consumer's responsibility:
call `applyTheme` on each root yourself whenever the theme choice changes. v1 had an
internal `ric-theme-change` `window` event (`create_ui_page`, not part of its public API)
that some of its own internal components listened for; v2 has no page component and no
equivalent — a consumer that needs cross-root sync should call `applyTheme` on every root
it owns from the same place it decides to change the theme (e.g. a single `state.theme`
setter that loops over a list of root elements).

### FACT: `applyTheme` warns on an invalid `theme`/`density`/`fontSize` name (2.0.0-alpha.7)

If `theme`, `density`, or `fontSize` is given as a string that isn't one of the bundled
names (`light`/`dark`/`teal`/`cyber`/`aqua`/`glass`/`glass-dark`; `comfortable`/`compact`/
`tight`; `sm`/`md`/`lg`
respectively), `applyTheme` logs one `console.warn` per call naming the invalid value, the
valid names, and which default it fell back to — before this release, a typo (e.g.
`density: 'md'`, which isn't a density name) silently fell back to the default with no
indication anything was wrong. **The fallback behavior itself is unchanged** — this only
adds a warning; a typo'd `applyTheme` call still renders with the same default it always
did. Passing a `ThemeVars` object (your own CSS-variable map) or omitting the option
entirely never warns, in either case, since neither represents a mistyped name. Like
`createFocusWhen`'s "ref not found" warning and `uiInlineMenu`'s "parent has no position"
warning, this is dev-build only. "Dev build" for `ricdom/ui` follows the same
per-distribution-format rule as the core (§3, "Dev-mode warning for untracked deep
assignment"): `dist/ricdom-ui.iife.min.js` has `__RICDOM_DEV__` inlined to `false` and
all three warnings are removed by dead-code elimination (2.0.0-alpha.10 — before that, the
`ui` production IIFE shipped them live in a plain browser with no `process` global, for the
same reason as the core bug), `dist/ricdom-ui.iife.js` always warns, ESM/CJS defer to the
consumer's bundler's `process.env.NODE_ENV`, and a no-bundler ESM import falls back to dev
mode.

### FACT: `ricdom-ui.css` is a base layer — load it before app CSS (documented 2.0.0-alpha.15)

Component rules in `ricdom-ui.css` (`.ric-input`, `.ric-textarea`, `.ric-button`,
`.ric-select`, …) are ordinary single-class selectors, specificity (0,1,0). They include
properties an app commonly overrides — `.ric-textarea { font-family: inherit }`,
`.ric-select { width: 100% }`, control `font-size`, button colors. There is no `@layer`
and no `:where()` on component rules (only the theme paint and scrollbar rules are
zero-specificity, see below), so **an app rule of equal specificity wins only if it comes
later in source order**. Load `ricdom-ui.css` before the app's own stylesheet.
`injectStyles()` appends its `<style>` to the end of `<head>` at call time, so with that
path call it before the app's stylesheets are parsed (or use `<link>`). Reported by Raccoon
Memo (pilot #5): v1's `css_for(...)` injected only the requested component families, so
apps that never requested the input/textarea/button families had nothing to collide with;
v2's single sheet always carries those base rules.

### FACT: `applyTheme` paints `background`/`color`/`font-size` on the element (2.0.0-alpha.3, font-size added in alpha.6)

`ricdom-ui.css` has a rule scoped to the `[data-ricdom-theme]` attribute itself (not its
descendants): `background: var(--ric-color-bg); color: var(--ric-color-fg); font-size:
var(--ric-font-size, 14px);`. Without it, `applyTheme` would only ever set CSS custom
properties — the element it's called on stays visually transparent/colorless/at the
browser's default font size, and only its descendants (which inherit the variables
normally) end up looking themed, which is not what "apply a theme to this element" implies.
This mirrors v1's `create_ui_page`, which painted `.ric-page` the same way (including
`font-size`).

- If a themed element has descendants that are themselves `applyTheme`d (a nested "island"
  with its own theme), the nested element paints its own `background`/`color`/`font-size`
  over its ancestor's — this is intentional, matching v1.
- **Changed in 2.0.0-alpha.8**: the selector is wrapped in `:where(...)` —
  `:where([data-ricdom-theme])` — so its specificity is **zero** (`:where()`'s contents
  never count toward specificity). Before this release the selector was a bare
  `[data-ricdom-theme]` attribute selector, specificity (0,1,0); that is *higher* than a
  plain element selector like `body { background: ... }` (0,0,1), so a consumer's ordinary
  element-selector rule silently lost to this "default" paint unless they added
  `!important` or extra specificity — a real bug (Brownies Desktop, one of pilots 5-7, all
  Electron apps migrating at the same time). Any rule of yours, including a bare element
  selector, now wins — no `!important` or extra specificity needed.
- **Changed in `2.0.0-alpha.19`**: the attribute's value is the resolved `--ric-theme`
  marker (a bundled theme name, e.g. `data-ricdom-theme="glass"`) rather than always the
  empty string — see the `--ric-theme` FACT above. A fully custom `ThemeVars` object that
  never sets `--ric-theme` still gets `''`, matching every release before this one.
  `[data-ricdom-theme]` matches on the attribute's *presence*, not a particular value, so
  this rule (and the scrollbar rule below) behave identically regardless of the value —
  this change is additive for anyone who wants to key their own CSS or code off the value.
- **Changed in 2.0.0-alpha.6**: before this release, `font-size` was not painted — only
  `background`/`color` were. If you relied on the themed element (or its direct text)
  staying at the browser's default font size (16px) regardless of the `fontSize` option
  (default `'md'` → 14px), this is a visible change. Override with
  `[data-ricdom-theme] { font-size: ...; }` in your own CSS, or set `font-size` directly on
  your own element, to opt out.

### `[data-ricdom-theme]` and page-wide scrollbar styling

`ricdom-ui.css` styles the *standard* scrollbar properties, scoped to
`:where([data-ricdom-theme])` and its descendants:

```css
:where([data-ricdom-theme]), :where([data-ricdom-theme]) * {
  scrollbar-width: thin;
  scrollbar-color: var(--ric-scrollbar-thumb) transparent;
}
```

**This changes the visual appearance of scrollbars for any element inside whatever you
call `applyTheme` on** — including elements that are not `ricdom/ui` components — since the
selector is attribute-scoped, not class-scoped. Override `--ric-scrollbar-thumb` yourself,
or restyle `scrollbar-width`/`scrollbar-color` (any selector at all, since specificity here
is zero as of 2.0.0-alpha.8 — see above), to opt out for a subtree.

#### FACT: standard properties only, `::-webkit-scrollbar*` removed (`2.0.0-alpha.21`)

Before this release, the rule above also carried
`::-webkit-scrollbar`/`-track`/`-corner`/`-thumb`/`-thumb:hover` pseudo-element rules on the
same selector (an 8px rounded thumb, using `--ric-scrollbar-thumb`/
`--ric-scrollbar-thumb-hover`). **In Chromium 121+ (Electron 28+) and current Firefox, that
block was dead code**: when an element has `scrollbar-width` or `scrollbar-color` set to
anything other than `auto`, Chromium ignores `::-webkit-scrollbar*` rules on that same
element entirely — a platform behavior, not anything specific to `ricdom-ui.css`. Since
`ricdom-ui.css` always sets both `scrollbar-width: thin` and `scrollbar-color` on the same
selector, the `::-webkit-scrollbar*` block never rendered on those browsers; what consumers
actually saw was always the standard thin scrollbar (reported by Rancha, pilot #6, with
device-pixel measurements: a measured thumb width of 13 device px and no visible corner
rounding — the standard `thin` scrollbar's numbers, not the 8px/`border-radius: 4px` the
removed rule specified). This has been true since the styling was ported from v1
(`v0.4.2`) — no consumer-visible change on Chromium ≥121 or Firefox results from removing
it.

**What does change**: Chromium <121, Electron <28, and Safari <18.2 don't yet ignore
`::-webkit-scrollbar*` the same way, so on those specific old engines the themed
`::-webkit-scrollbar*` styling was the one actually rendering — removing it means those
older engines now fall back to their native (theme-untracked) scrollbar instead. There is
no standard-CSS equivalent for a scrollbar-thumb hover color, so
`--ric-scrollbar-thumb-hover` has no effect on anything `ricdom-ui.css` itself renders as of
this release — the token is kept in all seven bundled palettes (and in `exportTheme`/
`exportSettings` round-trips) for parity, and remains available to a consumer who wants to
style their own `::-webkit-scrollbar-thumb:hover` rule. Doing so only takes effect on an
element where the *standard* properties are not set to a non-`auto` value (per the platform
rule above) — e.g. reset them first: `scrollbar-width: auto; scrollbar-color: auto;` before
adding your own `::-webkit-scrollbar-thumb:hover { background: var(--ric-scrollbar-thumb-hover); }`
(a fact about the platform's precedence rule, not a `ricdom` recipe).

`createScrollPane`'s `.ric-scroll-pane` follows the same rule: it sets `scrollbar-width: thin`
and `scrollbar-color` on itself, and its former `::-webkit-scrollbar*` rules (dead for the
same reason) were removed in the same release. No `::-webkit-scrollbar*` rule remains
anywhere in `ricdom-ui.css`.

---

## 9. CSS distribution

`ricdom/ui`'s styles ship as **one stylesheet** covering every component — there is no
per-component or per-instance CSS collection. This is a deliberate simplification over
v1, where forgetting to route a mount through the right composition point could produce
correctly-structured, silently-unstyled DOM that still passed DOM-shape tests. In v2, the
CSS either is loaded (everything is styled) or is not (nothing is, obviously) — there is
no partially-styled state to fall into by accident.

Load it either way:

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/ricdom@2/dist/ricdom-ui.css">
```

or, for a build-free `<script>`-only page that never adds a `<link>`:

```js
ricdomUI.injectStyles(); // idempotent — inserts a <style data-ricdom-role="styles"> once per Document
```

`injectStyles(doc?)` defaults to `document`, checks for its own marker attribute before
inserting anything (so calling it repeatedly, or once per component library user, is
harmless), and returns immediately if a matching `<style>` is already present. If neither
`<link>` nor `injectStyles()` has run by the time a stateful component is first `use()`d,
`ricdom/ui` logs one `console.warn` (not per-component, once total) pointing at both fixes
— unstyled output is possible, it is just never silent about it.

Selectors are simple single-class rules (`.ric-button`, `.ric-dialog__header`, …) — no
`!important`, no ID selectors, no compounded specificity beyond what a given component
strictly needs (e.g. `.ric-tabs__tab--active`). Overriding any rule from your own
stylesheet loaded after `ricdom-ui.css` (or `injectStyles()`, which runs at `use()` time)
needs no more specificity than the rule itself.

---

## 10. Components

Every component below is exported from `ricdom/ui`. "Stateless" means a plain function you
call directly; "stateful" means `app.use(create...())` first (§6). Every component accepts
the props type of the same name shown here (e.g. `uiButton`'s props are `UiButtonProps`) —
consult the type for the exhaustive, exact field list; this table summarizes intent and
the accessibility contract, which is FACT that is easy to miss by reading types alone.

### 10.1 Stateless — control

| Component | Notes |
|---|---|
| `uiButton(props)` | `variant`: `'default' \| 'primary' \| 'ghost' \| 'link'` (`'link'` restored from v1 in 2.0.0-alpha.8, pilots 5-7/Rancha — strips background/border/height-constraint for a text-like button, e.g. breadcrumbs/inline links). `size`: `'sm' \| 'md' \| 'lg'`, default `'md'` (`'md'` adds no size class — it *is* the core `.ric-button` size; `'link'` ignores `size` the way it ignores density's height, matching v1). Rest-spread contract (§10.5) |
| `uiInput(props)` | Text input, controlled. `value` is always emitted (even `''`) so it participates in `FORCE_REAPPLY`/the editing guard |
| `uiTextarea(props)` | `autoResize?: { minRows?, maxRows? }` grows/shrinks height to content, clamped, with overflow scrolling past `maxRows`. **IME note**: a controlled textarea can have its value overwritten mid-composition before IME confirmation — consider driving updates from `onchange` instead of `oninput` for CJK-heavy input |
| `uiCheckbox(props)` | Renders `<label><input type=checkbox>…</label>`; `checked`/`onchange` are isolated to the inner `<input>` (rest props go on the outer `<label>`) |
| `uiRadiobutton(props)` | `options: (string \| { value, label, ...attrs })[]`. Per-option extra attributes are forwarded to that option's `<label>`. **Known browser constraint**: `name` groups radios natively — give every independent group its own `name`, or they will merge |
| `uiSelect(props)` | Native `<select>`; `options: (string \| { value, label })[]`, optional non-selectable `placeholder` option |
| `uiRange(props)` | Slider + live value display; mouse wheel over the control steps the value by `step` |
| `uiColor(props)` | Accepts and emits either `#rrggbb` hex or `rgba(r,g,b,a)`, auto-detected from `value`; rgba mode adds an alpha slider |
| `uiSeparator(props)` | `<hr>` |
| `uiText(props)` | `variant`: `'default' \| 'muted' \| 'title' (h2) \| 'label' (<label>)` |
| `uiIcon(descriptor, opts?)` | See §12 |
| `uiMdPre(props)` | See §10.4 |
| `uiCodePre(props)` | See §10.4 |

`bindInput`/`bindTextarea`/`bindCheckbox`/`bindSelect`/`bindRange` are two-way-binding
sugar: `bindInput(s, 'name', options)` is exactly
`uiInput({ ...options, value: s.name, oninput: (ev) => { s.name = ev.target.value; } })`
— `options` is applied *before* the computed `value`/`on*` so it can never accidentally
override the binding.

### 10.2 Stateless — layout

| Component | Notes |
|---|---|
| `uiCol(props)` | Vertical flex container. `gap?: string \| number` (a number is px) writes to `style.gap`. No color/background of its own — inherits theme from an ancestor `applyTheme`d element |
| `uiRow(props)` | Horizontal flex container. Same `gap` as `uiCol` |
| `uiGrid(props)` | CSS grid. `columns`/`rows`: a number expands to `N` × `1fr`; a string passes through to `grid-template-*` as-is; `'auto-fit 200px'`/`'auto-fill 120px'` expand to `repeat(auto-fit, minmax(200px, 1fr))`. `gap` is the same as `uiCol`/`uiRow` |
| `uiPanel(props)` | Surface/background/border container. `layout: 'col' \| 'row'`. `disabled: true` sets the native `inert` attribute (disables focus, click, and text selection on every descendant) — dims via `.ric-panel[inert]` CSS, not inline style |

### 10.3 Stateful — dialog / popup / toast / tooltip / dropdown

All of these must be `app.use()`d (§6). All animate their open/close transitions on real
CSS (`animationend`/`transitionend`) with a 700ms `setTimeout` fallback in case the CSS
never loaded — a state transition (dialog closing, toast disappearing) always eventually
completes even without `ricdom-ui.css` present, it just skips the animation.

| Component | ARIA / a11y contract |
|---|---|
| `createDialog()` | Modal. `role="dialog"` + `aria-modal="true"` + `aria-labelledby`/`aria-describedby`. Opening moves focus to body → footer → close-button → root, in that priority order (visible-element–filtered, `[autofocus]` wins over all of it — §10.3.1c); `Tab`/`Shift+Tab` are trapped inside (plain DOM order, unaffected by the above); `Escape` closes and returns focus to the triggering element; every sibling of the portal is set `inert` while open. Three usage modes: uncontrolled + auto trigger (`triggerChildren` given → call returns a trigger `RicNode`), uncontrolled + your own trigger (`triggerChildren` omitted → call `dlg.open()`/`dlg.close()`), or controlled (`open`/`onClose(reason)` where `reason` is `'overlay' \| 'close-button' \| 'escape' \| 'api'`). `returnFocus` (§10.3.1) controls where focus goes on close. `triggerVariant?: UiButtonVariant` styles the auto trigger built from `triggerChildren` (default `'primary'`, same as v1's `trigger_variant`; pass `'default'` for a plain button — `2.0.0-alpha.14`, restored from v1 after the parity audit) |
| `createPopup()` | `role="menu"` dropdown. Trigger gets `aria-haspopup="menu"` + `aria-expanded`; every menu child is auto-wrapped with `role="menuitem"`, its `class` merged (not replaced) with `.ric-popup__item`. `ArrowUp`/`ArrowDown`/`Home`/`End` move focus among items; `Escape` closes and restores focus to the trigger. Activating a menuitem (click; for a `<button>` item, `Enter`/`Space` fire a native click) closes the menu and returns focus to the trigger too (APG menu button pattern) — set `closeOnSelect: false` to opt out (checkbox-style menus); a `disabled: true`/`aria-disabled="true"` item, or one whose `role` was overridden away from `'menuitem'` (e.g. a separator), never triggers this regardless of `closeOnSelect` (§10.3.1d). `openAt({x,y} \| MouseEvent)` opens at an arbitrary point instead of a trigger button — the same close-on-select behavior applies to menus opened this way. `trigger` accepts a `RicNode`/`RicNode[]` (used as-is) or a `{ icon?, label?, ghost?, size?, class?, style? }` object (§10.3.1a). Menu-open state is exclusive with `createDropdown` within the same app (opening one closes any other open popup/dropdown) |
| `createToast()` | `toast.show(msg, { type, duration })` queues a notification; `type: 'error'` renders `role="alert"`/`aria-live="assertive"`, everything else `role="status"`/`aria-live="polite"`. `duration: 0` disables auto-dismiss (manual close only). Never steals focus |
| `createTooltip()` | `aria-describedby` links trigger ↔ popup; shown on hover or focus, dismissed on blur/mouseleave/`Escape`. `dir: 'auto' \| 'top' \| 'bottom' \| 'right' \| 'left'`, `'auto'` picks a direction that fits the viewport |
| `createDropdown()` | Generic popover (not a menu): trigger gets `aria-haspopup="dialog"` + `aria-expanded`; body content's semantics are entirely up to you. `label`+`chevron` mode or `icon` mode for the trigger. Shares position-flip logic and the exclusive-open registry with `createPopup` |

### FACT: `createPopup`/`createDropdown` horizontal position rule

Both flip below/above the trigger based on available vertical space (as before), and
resolve their horizontal position in the same three steps once the body's width is known:
1. If it fits starting at the trigger's left edge (`rect.left`), that's where it goes.
2. Otherwise, align it to the trigger's **right edge** instead (`rect.right - width`) — this
   keeps the body visually anchored under/over the trigger rather than jumping to an
   unrelated part of the screen.
3. If even that overflows the viewport (content wider than the viewport itself), the
   position is clamped into `[8px, innerWidth - width - 8px]` as a last resort.

Before the body's width has been measured (the first paint of an open, pre-`requestAnimationFrame`,
body rendered `visibility: hidden`), the body is placed at `left: 8px` — the same margin steps 2/3
clamp into — rather than at the trigger's own position (`rect.left`, or `x` for `openAt`); the real
position from steps 1–3 replaces this placeholder once measured (`2.0.0-alpha.5`, #14). This keeps
the width available to the body during measurement close to the full viewport width regardless of
where the trigger sits, so `offsetWidth` reflects what the content actually needs — anchoring the
placeholder near the trigger instead (`2.0.0-alpha.4` and earlier) constrained that available width
to `innerWidth - rect.left`, so a trigger near the viewport's right edge measured a falsely small
`offsetWidth` for wrappable content, which steps 2/3 then anchored flush against the right edge
with no margin to spare.

### FACT: popup/dropdown positioning is viewport-based, with no containing-block search (v1→v2 parity audit #14)

The three steps above (and the below/above flip) are computed purely from
`window.innerWidth`/`innerHeight` and the trigger's `getBoundingClientRect()` — there is
no search up the DOM tree for a `position: fixed`'s actual containing block. v1's
`_popup_utils.js` had this search (`_get_portal_cb`, walking ancestors of `.ric-page` for
a `backdrop-filter`/`transform`/`filter` that would change what a `position: fixed`
descendant is actually positioned relative to) plus `_get_expand_ref` (finding a "logical
container" to decide which way an icon-mode menu should expand). Neither is ported to v2:
there is no `.ric-page` concept to search from, and `createPopup`/`createDropdown` already
treat the viewport as ground truth. In the common case (no `backdrop-filter`/`transform`/
`filter` on an intervening ancestor) this makes no difference — a `position: fixed`
element really is positioned relative to the viewport. It only diverges when the popup's
DOM ancestor chain has such a property set (the `cyber`/`aqua` bundled themes use
`backdrop-filter`/`blur()` inside `.ric-panel`, so a popup/dropdown nested inside a
`cyber`/`aqua`-themed `.ric-panel` island could theoretically be positioned relative to
that panel by the browser while `ricdom`'s own math still assumes the viewport) — in that
case the computed `left`/`top` could be visually offset from the intended viewport-relative
position. No such case has been reported in practice. Re-examine if a `cyber`/`aqua`
`.ric-panel` popup/dropdown mispositioning is reported.

#### 10.3.1 FACT: dialog focus-return control (`returnFocus`)

By default, closing a dialog returns focus to whatever `document.activeElement` was
**at the moment it opened** (the APG-recommended behavior). This is not always what you
want: if the dialog was opened via `dlg.open()` from a non-focusable trigger (a `<span>`
click handler, say), "whatever happened to be focused right before that click" can be an
unrelated element (e.g. a number input the user was last typing into) — restoring focus
there can surface as spurious `focusin` events to app-level focus listeners.

- Uncontrolled mode: `dlg.open({ returnFocus })` (the auto-trigger button built from
  `triggerChildren` does not take this option — it is itself always a real, focusable
  `<button>`, so the default is always correct there).
- Controlled mode: pass `returnFocus` as a `DialogProps` field, alongside `open`/`onClose`.

`returnFocus` accepts:
- omitted (default): APG behavior, restore focus to the pre-open `activeElement`.
- `false`: do not restore focus at all. No element is focused programmatically — once the
  dialog's DOM is removed, the browser's own default (moving focus to `document.body`)
  takes over. This is "do nothing," not "explicitly focus `document.body`."
- an `Element`: restore focus to that element specifically, regardless of what was focused
  when the dialog opened.

### 10.3.1c FACT: dialog initial focus (`[autofocus]` / already-focused)

When a dialog opens, it decides where to send focus in this order:

1. **Already focused, do nothing.** If `document.activeElement` is already inside the
   dialog's root when the initial-focus step runs, it is left alone — this lets a
   `createFocusWhen` call (or any other consumer code that focuses something during the
   same open) win, instead of being overridden a moment later when the dialog's own
   entrance-animation/700ms-backstop timer fires. (If focus is on the dialog root element
   itself — the fallback target from a *previous* run of this same step, see 3 below — this
   case is skipped and the search continues to steps 2/3, rather than being treated as
   "already focused.")
2. **`[autofocus]`.** The first visible focusable descendant (searched across the whole
   dialog, DOM order) carrying the standard HTML `autofocus` attribute (`{ autofocus:
   true }` on a `RicNode` — same idea as native `<dialog>`'s focusing steps) wins over
   everything below — so an autofocus target anywhere in the dialog still beats the
   header's close button or the body's own first focusable.
3. **Body, then footer, then the close button, then the dialog root.** Falls back, in
   order, to: the first visible focusable descendant *inside* `children` (the
   `dialog-body` region, §14 filtering applies); if none, the first one *inside*
   `actions` (the `dialog-footer` region); if none, the header's close button
   (`.ric-dialog__close`); and if that isn't present either, the dialog root itself.
   Changed in 2.0.0-alpha.9 (LCP #4) — before that, this step was simply "first
   focusable in DOM order," which always landed on the header's close button (DOM order
   is header → body → footer) even though the close button is rarely what a dialog's
   opener actually wants focused first. The `Tab`/`Shift+Tab` trap's cycle order is
   unaffected by this change — it is still plain DOM order (`[close, ...body,
   ...footer]`); only which element receives focus *the moment the dialog opens* moved.

This runs on both the CSS `animationend` path and the 700ms fallback timer (§10.3, whichever
fires first; the other is a no-op) — step 1 makes both of those safe to skip when something
else already moved focus in the meantime.

### 10.3.1a FACT: `createPopup`'s two `trigger` forms

`PopupProps.trigger` accepts either:
- a `RicNode`/`RicNode[]` — used verbatim as the trigger `<button>`'s `children`, styled as
  a plain `.ric-button` (unchanged from earlier versions), or
- a `{ icon?, label?, ghost?, size?, class?, style? }` object — `icon` and `label` are
  concatenated into the button's children (icon first), and the button is styled the same
  way `uiButton({ ghost, size })` would be (`.ric-button` + `.ric-button--ghost` +
  `.ric-button--sm`/`--lg` as applicable), with `class`/`style` merged/applied on top.

`aria-haspopup="menu"`/`aria-expanded` are set on the trigger regardless of which form was
passed. `createDropdown`'s existing `label`/`icon`/`ghost` top-level props cover the same
icon/ghost-button use case for that component — it does not have a separate `trigger`
object form.

`label` on both `PopupTriggerObject` and `DropdownProps` is typed `RicNode | RicNode[]` (a
plain string still works, unchanged) — `DropdownProps.label` was widened from `string`-only
to match `PopupTriggerObject.label` in 2.0.0-alpha.12 (reported by the tenth pilot, 線茶: a
`string`-only label couldn't mix in a `uiIcon(...)` the way `PopupTriggerObject`'s already
could). Implementation is unchanged either way: `Array.isArray(label) ? label : [label]`
becomes the label `<span>`'s `children`.

### 10.3.1b FACT: `createTabs` panel-less mode

If no `TabItem` in `items` has a `children` field, `createTabs` renders only the tab list
(no `tabpanel`, and no `aria-controls` on the tab buttons) — for segmented-control-style
usage where selecting a tab doesn't reveal an associated content panel. If even one item in
`items` has `children`, the panel is rendered as before (for every item — items without
`children` simply show an empty panel when active).

### 10.3.1d FACT: `createPopup`'s `closeOnSelect` (menu close-on-activate)

By default (`closeOnSelect` omitted or `true`), activating a menuitem closes the menu and
restores focus to the trigger — this is implemented by wrapping the item's own `onclick`
(not by listening for a `click` event on the menu body), so it still closes even if the
item's `onclick` calls `ev.stopPropagation()`. The wrapped handler always calls the item's
original `onclick` first, then closes.

- `closeOnSelect: false` disables this entirely — useful for checkbox-style menus where
  selecting an item should toggle its state without dismissing the menu.
- An item is never treated as "activated" for this purpose if it is `disabled: true`
  (native `disabled`, which also means the browser itself won't dispatch `click` for it) or
  `aria-disabled="true"` (a soft/visual disable — `click` still fires, but the menu won't
  close on it), or if its `role` was explicitly overridden to something other than
  `'menuitem'` (e.g. a `role: 'separator'` divider you pass as one of `children`).
- Applies identically regardless of how the menu was opened — from the trigger button or
  via `openAt()`.

### 10.3.1e FACT: `createPopup`/`createDropdown` light dismiss (2.0.0-alpha.12)

Both close on an outside `pointerdown` — and, unlike a click landing on `.ric-popup__overlay`
in earlier versions, that same pointerdown/click is **not** consumed: it reaches whatever
element is actually under the pointer. This mirrors HTML's `popover="auto"` light-dismiss
behavior rather than a modal backdrop.

- The overlay element (`.ric-popup__overlay`, role `popup-overlay`) is still rendered while
  open — CSS/E2E selectors that target it for styling or visibility keep working — but it is
  `pointer-events: none` and carries no `onclick`; it exists purely as a visual/role marker,
  not a click target. Before 2.0.0-alpha.12 it was `pointer-events: auto` (the default) with
  an `onclick` that closed the popup/dropdown, and because it covers the full viewport it
  swallowed the click entirely — a second click on the actually-intended target was required
  (reported as a 30-second Playwright actionability timeout on "open a dropdown, then click a
  different button" — the overlay intercepted the click, so the target button was never
  considered actionable).
- The close is driven by a single `document` `pointerdown` listener (capture phase),
  registered only while open and removed on close/`dispose()` (no listener leak — same
  bind/unbind pattern already used for the `Escape` listener). It closes (`doClose()`, with
  **no** forced focus restore — unlike `Escape` or menuitem activation, which both call
  `closeAndRestoreFocus()`) whenever the event's target is outside both the rendered body and
  the trigger button.
- A click landing back on the trigger button itself is deliberately excluded from this check
  and left entirely to the trigger's own `onclick` (the existing open/close toggle) — the two
  mechanisms never both fire for the same click, so a second click on the trigger closes
  exactly once and still restores focus to it (via `closeAndRestoreFocus()`).
- Applies identically to a popup opened via `openAt()` with no trigger button ever clicked —
  every `pointerdown` outside the rendered body then counts as "outside" (§10.3.1a).
- `createDialog`'s own `.ric-dialog__overlay` is unaffected by this — it stays a modal
  backdrop (`pointer-events: auto`, closes on click, `reason: 'overlay'`) by design; a dialog
  is not meant to let clicks fall through to whatever is behind it.

### 10.3.2 Stateful — `createFocusWhen`

The `ricdom/ui` successor to v1's `focus_when`, for moving focus to a specific element on a
condition's rising edge — a case `createDialog`'s own "focus the first focusable element on
open" behavior doesn't cover (you want a *particular* field focused, or you want this
outside of a dialog opening at all, e.g. once a streamed response finishes).

```ts
const fw = app.use(createFocusWhen());
// inside render:
fw(refName: string, condition: boolean): null
```

- Registered via `app.use()` like the other stateful components (§6); calling it without
  `use()` logs the same one-time `console.error` and does nothing.
- Call it during `render`, once per `ref` you want to drive. It tracks each `refName`'s
  previous `condition` independently, so one instance can drive multiple refs.
- On the **false→true rising edge only**, once that render has committed (§5's portal-ref
  FACT — this works even for a `ref` inside a portal that's appearing for the first time in
  this same render), it calls `app.refs.get(refName)?.focus()`. `condition` staying `true`
  across renders does not refocus; a false→false or true→false transition does nothing.
- If `refName` doesn't resolve to a focusable element by the time the render commits, it
  logs one `console.warn` (dev builds only — see §8's `applyTheme` warning FACT for which
  `ricdom/ui` build counts as "dev") and otherwise does nothing — it never throws.
- Always returns `null` — it exists for its side effect, not to contribute to the render
  tree.

### 10.3.3 Stateful — layout/composite (2.0.0-alpha.3 docs addition)

All `app.use()`d like the rest of §10.3. These were implemented in Phase 3b/3c but missed
the initial docs pass (§20 of the design doc) — added here with the same FACT-only
treatment as the rest of this table.

| Component | ARIA / a11y contract |
|---|---|
| `createTabs()` | `role="tablist"`/`"tab"`/`"tabpanel"`, `aria-selected`, roving `tabindex` (active tab `0`, others `-1`). **Automatic activation**: `ArrowLeft`/`ArrowRight`/`ArrowUp`/`ArrowDown` move focus *and* switch the active tab in the same step (not focus-only); `Home`/`End` jump to the first/last tab. Controlled (`active` prop given) or uncontrolled (`defaultActive`, internal state); `onChange(key)` fires either way. `variant: 'line' \| 'pill'`. See §10.3.1b for the panel-less (no `TabItem.children`) mode |
| `createSplitter(options)` | Two-pane resizable layout. The divider is `role="separator"` + `aria-orientation` + `aria-valuenow`/`aria-valuemin`/`aria-valuemax` (the last omitted entirely when `options.max` is `null`, i.e. no logical upper bound) + `tabIndex: 0`; resizes via mouse drag or arrow keys (10px per keypress, in the direction that grows the side panel). `onResizeEnd(size)` fires once per drag (on `mouseup`) or once per keypress (since keyboard has no separate "end" event). The optional collapse toggle button gets `aria-label: 'Expand' \| 'Collapse'`. `side`/`main` (render props) hold the panel content directly (no `{ ctx }` wrapper, unlike v1); `collapsed`/`onCollapseChange` (props) make it controlled |
| `createScrollPane(options)` | A scrollable container that auto-follows new content at the `options.follow: 'bottom' \| 'top' \| 'none'` edge (within `options.threshold` px) unless the user has scrolled away from it — no ARIA role of its own (it's a plain `overflow: auto` region, not a live-region announcer). `pane.scrollToBottom()`/`scrollToTop()` force a scroll regardless of the current follow state |
| `createCollapseBox(options)` | Headless animated show/hide container (`options.direction: 'v' \| 'h' \| 'both'`) with **no trigger of its own** — unlike `createAccordion`, it has no button to hang `aria-expanded` on, so *you* put `aria-expanded={visible}` + `aria-controls={box.idFor(key)}` on your own trigger to satisfy the APG disclosure pattern (`idFor(key)`, key optional, gives the stable `id` the box renders with). Supports multiple concurrent instances distinguished by a `key` prop (sparse list animation). Completion is detected via `transitionend` (not `animationend` — height/width targets are per-instance dynamic values, not expressible as fixed `@keyframes`) with the same 700ms fallback as the rest of §10.3 |
| `createAccordion(options)` | Each item's header is a real `<button aria-expanded aria-controls>` (so `Enter`/`Space` activation is native, no extra keydown handling needed); its panel is `role="region"` + `aria-labelledby`, and gets the `hidden` attribute while closed (removing it from the accessibility tree — the CSS `grid-template-rows` close animation still runs visually, since an author `display` rule outranks the `[hidden] { display: none }` user-agent default). `options.defaultOpen: Record<id, boolean>` seeds initial state (uncontrolled only); `multi: false` on props makes it single-open (exclusive, closes any other open panel) instead of the default multi-open. Controlled (`open` prop given) or uncontrolled (internal state) — see §10.3.3a |

### 10.3.3a FACT: `createAccordion` controlled / uncontrolled (2.0.0-alpha.7)

Same two-mode contract as `createTabs` (§10.3.3's row above) — one `AccordionProps.open`
switch, no separate imperative method:

- **Uncontrolled** (`open` omitted): the component manages its own open/closed state
  internally, seeded from `options.defaultOpen`. This is unchanged from earlier releases.
- **Controlled** (`open: Record<id, boolean>` given): the displayed open/closed state always
  follows `open` — clicking a header (or activating it via `Enter`/`Space`, which is the
  same native `click`) never mutates anything internally. Instead it calls
  `onToggle?.(id, nextOpen, nextMap)`:
  - `nextOpen` is the item's next open state (the opposite of its current one).
  - `nextMap` is the complete next `{ [id]: boolean }` map — "what the internal state would
    have become had this been uncontrolled" — so `onToggle: (id, next, map) => { s.x = map;
    }` is a complete, correct handler on its own (id/next are provided as a convenience for
    callers that only care about the one item that changed). With `multi: false` (exclusive),
    `nextMap` closes every other item's entry to `false` regardless of what was in the
    incoming `open` object, keyed by every id present in the current `items` prop.
  - **`nextMap` is derived from the `open` prop of the most recent render**, not from your
    live state. If a second click lands before the re-render triggered by the first one has
    completed (measured by a pilot consumer: a 227ms render, clicks 150ms apart → 2 of 3
    toggles applied), `nextMap` still reflects the older `open` and the intermediate toggle
    is lost. This is the ordinary controlled-component contract (same as React), not a bug.
    When re-renders are heavy, derive the next state from your live value instead:
    `onToggle: (id, next) => { s.x = { ...s.x, [id]: next }; }` (for `multi: false`, close
    the others yourself in the same expression). When renders are fast the two forms produce
    identical results.
  - If `onToggle` is omitted, nothing happens on click — the same treatment `createTabs`
    gives an `active`-only call with no `onChange`.
- `isOpen(id)` returns the correct value in both modes (reading the most recently passed
  `open` prop in controlled mode).
- There is **no `setOpen()`** or other imperative open/close method — the controlled `open`
  prop is the one supported way to drive this component's state from the outside, matching
  `createTabs`'s `active` prop (no separate `select()` method either). Keeping exactly one
  external-control mechanism avoids two parallel, occasionally-inconsistent ways to ask "is
  this panel open" from outside the component.

### 10.4 Stateless — text

| Component | Notes |
|---|---|
| `uiMdPre(props)` | Renders a practical Markdown subset (headings, bold/italic, inline code, fenced code blocks with `` ``` ``/`~~~`, bullet and ordered lists with a `start` attribute, blockquotes, tables with alignment, horizontal rules, links, images) to a `RicNode` tree — no external parser dependency. `href` values with a `javascript:`/`data:`/`vbscript:` scheme (case-insensitively, after stripping control characters) are rendered without an `href` attribute at all; every other scheme (including custom ones like `app://`) passes through unmodified — this is a blocklist, not a whitelist, by design. `transformText(str)` post-processes plain-prose text nodes only (never code); `transformImageSrc(src, alt)` rewrites image sources before they're used. Both hooks fall back to the untransformed input and log `console.error` if they throw or return the wrong type — a broken hook degrades the rendered output, it does not break the page |
| `uiCodePre(props)` | `<pre><code>` for a code string or (`obj` prop) a `JSON.stringify`'d object. Always dark-themed (`--ric-code-bg`/`-fg`), regardless of the ambient theme — matching the general code-block convention. If `window.hljs` (highlight.js) is present, output is syntax-highlighted; if not, one `console.warn` per session explains how to enable it, and plain text is shown |

### 10.5 Rest-spread contract

Every stateless control/layout/text component that accepts arbitrary extra props (id,
`data-*`, `aria-*`, event handlers, etc.) spreads them onto the returned node in this
order: `...rest` first, then the component's computed `tag`/`class`/`data-ricdom-role`
(and, where the component wraps an inner element like `uiCheckbox`'s `<input>`, the
props that belong to that inner element are isolated and never merged into `rest`, so a
caller cannot accidentally shadow them). Passing `class` through `rest` extends rather
than replaces the component's base class (`mergeClass`), while any other computed field
you might collide with (`tag`, `data-ricdom-role`) always wins over what you pass.
`class` and `style` are always declared explicitly in each component's props type (not
left to fall through the catch-all `[key: string]: unknown` alone) even where the
runtime behavior is pure pass-through — a gap an LCP review caught (`uiButton` and
several others were missing `style?: StyleValue` in the type despite passing it through
at runtime, 2.0.0-alpha.9).

### 10.6 Stateful — `createTweakPanel`

Also `app.use()`-registered (§6). Builds a parameter panel from a `data` object in three
tiers: `data` alone infers a row per property from its runtime type (Tier 1); `keys`
overrides individual rows or folders by property name (Tier 2); `rows`/a folder's
`keys[k].rows` append hand-built `RicNode`s (Tier 3).

#### FACT: `keys[k].get`/`set` — rows that don't read/write `data`

A `keys` entry may carry `get?: () => unknown` and/or `set?: (v: unknown) => void`. When
either is present, that row's value comes from `get()` (not `data[k]`) and writes go to
`set()` (not `data[k] = v`) — `data[k]` is never touched for that row. This is how you
expose a value that doesn't live in `data` at all (e.g. a center distance derived from a
module/teeth pair): give `keys` an entry for a property name that doesn't exist in `data`,
with a `get`. Rows declared this way (key present in `keys`, absent from `data`) render
*after* all of `data`'s own rows, in the order they appear in `keys`. If `get` (or `set`)
throws, `createTweakPanel` logs `console.error` and continues rendering (`get` falls back
to `undefined` for that render) — a broken hook degrades one row, it does not break the
panel.

#### FACT: `keys[k].rows` — per-folder Tier 3

A folder-shaped `keys` entry (the property's value is a plain object) may also carry its
own `rows: RicNode[]`, appended at the end of that specific folder's body — distinct from
the panel-level `rows` prop, which only ever appends to the very end of the whole panel.
Use this to put a hand-built row (e.g. a "reset this section" button) inside a particular
folder rather than at the panel's outer edge.

#### FACT: a folder is a `<button aria-expanded>` + `<div role=region hidden>`, not `<details>` (v1→v2 parity audit #15)

v1's `ui_tweak.js` rendered a folder as a native `<details>`/`<summary>` pair. v2 renders
`tweak-folder-header` as a `<button aria-expanded aria-controls>` and `tweak-folder-body`
as a `<div role="region" hidden>` (matching the same open/close-state pattern as
`createAccordion`, §10.3.3). Functionally these are equivalent for click-to-toggle and for
screen readers, but `<details>` carries one behavior v2's markup doesn't reproduce: a
browser's in-page find (Ctrl+F) can automatically expand a closed `<details>` to reveal a
match inside it (browsers that support it treat `<details>` specially for this purpose); a
plain `hidden` `<div>` is invisible to in-page find no matter what, same as any other
`[hidden]` content. No consumer has reported this as a problem in practice. Re-examine if a
consumer requests find-in-page support for closed tweak folders — the fix would be
`hidden="until-found"` (the modern hidden-content-that-find-can-reveal attribute) rather
than reverting to `<details>`, since `<details>` doesn't compose with the folder's own
`aria-expanded`/animation model as cleanly.

#### FACT: every leaf row carries `data-ricdom-role="tweak-row"` + `data-ricdom-tweak-key`

Every leaf row (number/range/checkbox/text/select/radiobutton/color, and the `get`/`set`
computed rows above) has its outer container marked `data-ricdom-role="tweak-row"` and
`data-ricdom-tweak-key="<path>"`, where `<path>` is the dot-joined key chain from the
panel's root (`"outer.inner"` for a property nested one folder deep) — a stable hook for
E2E tests or custom CSS that doesn't depend on row order or DOM structure. The checkbox row
is the one exception to the usual row shape: because `uiCheckbox` renders its own
`<label>` internally, the checkbox row has no separate `.ric-tweak-row__label` `<span>`
(every other row type does) — the role/key attributes are still present on its container.

---

## 11. `data-ricdom-role` registry

Every `ricdom/ui` component's rendered root (and several internal parts) carries a
`data-ricdom-role` attribute for stable E2E/CSS targeting that does not depend on class
names or DOM structure. Portal-root elements of dialog/popup/toast/tooltip/dropdown carry
this too, distinct from their trigger element's role (if any). As of 2.0.0-alpha.2 this
extends to sub-parts of the portal-mounted components, not just their root:

`button` `input` `textarea` `checkbox` `radiogroup` `select` `range` `color` `separator`
`text` `icon` `col` `row` `grid` `panel` `md-pre` `code-pre` — `dialog` `dialog-overlay`
`dialog-header` `dialog-title` `dialog-body` `dialog-footer` `dialog-close` `popup`
`popup-trigger` `popup-overlay` `popup-item` `toast` `toast-item` `toast-msg`
`toast-close` `tooltip` `tooltip-trigger` `dropdown` `dropdown-trigger` —
`scroll-pane` `splitter` `splitter-side` `splitter-main` `splitter-divider`
`splitter-toggle` `collapse-box` `accordion` `accordion-item` `accordion-header`
`accordion-body` `accordion-title` `tabs` `tabs-bar` `tabs-tab` `tabs-panel` `inline-menu`
— `tweak-panel` `tweak-title` `tweak-folder` `tweak-folder-header` `tweak-folder-body`
`tweak-row` (§10.6) — `md-editor` `md-editor-mirror` (§13, `ricdom/md-editor`; the
`<textarea>` inside it keeps the plain `textarea` role, unchanged).

`popup-overlay` is shared by `createPopup` and `createDropdown` — both use the same
`.ric-popup__overlay` element and role. Dialog's sub-part roles map onto its existing CSS
classes one-to-one: `dialog-overlay` → `.ric-dialog__overlay`, `dialog-header` →
`.ric-dialog__header`, `dialog-title` → `.ric-dialog__title`, `dialog-body` →
`.ric-dialog__body`, `dialog-footer` → `.ric-dialog__footer`, `dialog-close` →
`.ric-dialog__close`.

**Sub-part role audit (2.0.0-alpha.8, pilots 5-7 = RaccoonMemo / Rancha / Brownies
Desktop, three Electron apps migrating at once)**: `dialog`'s plain-button trigger
(`buildTrigger`, rendered when you pass `triggerChildren` without `open`/`onClose`) now
also carries `data-ricdom-role="button"` — it renders `class: 'ric-button'` directly
instead of going through `uiButton()`, so it had silently been the one `.ric-button`-styled
element with no role at all. `createPopup`'s trigger button now carries
`popup-trigger` (it had `aria-haspopup="menu"` but, unlike `createDropdown`'s
`dropdown-trigger`, no role — an inconsistency, now fixed). `createTooltip`'s hover/focus
wrapper (`.ric-tooltip`, the trigger — not the floating `tooltip` popup) now carries
`tooltip-trigger`, for the same reason. `createToast`'s per-item message text
(`.ric-toast__msg`) now carries `toast-msg`, so it can be targeted separately from the
whole item (`toast-item`) or its close button (`toast-close`). `createTweakPanel`'s
optional `title` (`.ric-tweak__title`) now carries `tweak-title`.

**Deliberately not roled** (same audit): the per-row label spans/legends inside
`createTweakPanel` rows and folders (`.ric-tweak-row__label`, `.ric-tweak-folder__label`)
and the JSON-fallback preview (`.ric-tweak-row__json`). Unlike the roots above, these
repeat once per row/folder and the row/folder container already carries a unique hook
(`data-ricdom-tweak-key` on the row, `tweak-folder` role on the folder) — combine that with
the class name (e.g. `[data-ricdom-tweak-key="x"] .ric-tweak-row__label`) instead. Also not
roled: plain unclassed wrapper `<span>`s used purely to group text (e.g. `createDropdown`'s
label wrapper, `createTooltip`'s default string-content wrapper) — they carry no `ric-*`
class in the first place, so they were out of scope for this audit (which only looked at
elements that already have a `ric-*` class but no role).

The core library itself uses `data-ricdom-role="portal"` for the auto-generated portal
sentinel (§7) and `data-ricdom-ref` (a different attribute) for `ref`-registered elements
(§5).

---

## 12. Icons

An icon is data, not markup: `{ v?: string; s?: number | null; p?: string | string[] }`
(`v` = viewBox, default `'0 0 24 24'`; `s` = stroke width, omitted → 2, a number → that
width, `null` → filled/no-stroke mode; `p` = one or more SVG path `d` strings).
`uiIcon(descriptor, opts?)` (`ricdom/ui`) turns a descriptor into an `<svg>` `RicNode` —
`opts.size` (default `'1em'`, follows the surrounding font size), `opts.label` (present →
`role="img"` + `aria-label`; absent → `aria-hidden="true"` for a purely decorative icon
next to text), `opts.spin` (adds a CSS spin animation), `opts.strokeWidth` (overrides
`descriptor.s`). Icon color always follows `currentColor`.

### FACT: never hand-write a descriptor's `p` value

Path data is opaque, dense, and easy to get subtly wrong in a way that renders "close
enough to look right" while missing a sub-path — this has shipped broken icons in
practice. Get a descriptor one of two ways:

- `import { check, chevronDown, /* … */ } from 'ricdom/icons'` — 36 bundled descriptors as
  individual named exports (tree-shakable: importing one does not pull in the other 35).
  `ICON_NAMES` maps the camelCase export name back to Lucide's original kebab-case name;
  `ICONS_BY_NAME` maps kebab-case → descriptor.
- `npx ricdom-icon <name> [--json] [--search TERM] [--names]` — returns a bundled
  descriptor instantly, or fetches and converts one from Lucide if not bundled. No
  `ricdom/icons` install required; paste the output directly into your own code. This is
  also how `ricdom/icons` itself is generated/verified.

`ricdom/icons` also exports `svgToDescriptor(svg)`, converting an arbitrary SVG string's
`circle`/`rect`/`polygon`/`line`/`ellipse`/`path` shapes into a single descriptor's path
data — the tool behind both the bundled set and the CLI's Lucide conversion.

`ricdom/icons` has **zero runtime dependency** on `ricdom` or `ricdom/ui` (data-only
package) and ships no IIFE build — a no-bundler consumer is expected to use the CLI and
paste the resulting literal directly into their own code, rather than adding another
`<script>` tag for 36 icons they mostly won't use.

Of the 36 bundled icons, all but `contrast` are original to this project (simple
geometric shapes in a Lucide-compatible style); `contrast` is derived from Lucide (ISC
license) — see `THIRD_PARTY_NOTICES.md` for full attribution.

---

## 13. `ricdom/md-editor` (opt-in subpath)

`createMdEditor()` is a "`uiTextarea` with Markdown syntax colors" — the DOM element the
consumer touches is a real `<textarea>` with the exact same contract as `uiTextarea`
(§10.1): every prop `uiTextarea` accepts, plus `ref`, `class`, `style`,
`onkeydown`/`onpaste`/`ondrop`/`ondragover`, `spellcheck`, and `autoResize`, lands on that
same `<textarea>` — `app.refs.get(ref)` resolves to it, `createFocusWhen` works unchanged,
and the caret, IME composition, undo history, spellcheck, and screen-reader behavior are
all the browser's native textarea behavior, untouched.

Added as a **separate subpath** (`import { createMdEditor } from 'ricdom/md-editor'`), not
as part of `ricdom/ui` — a consumer who never imports it pays nothing: `ricdom/ui`'s own
bundle (`dist/ricdom-ui.iife.min.js`) does not contain `createMdEditor`/`tokenizeMarkdown`
(verified by grepping the built bundle). It ships its own IIFE
(`dist/ricdom-md-editor.iife.min.js`, `globalName: ricdomMdEditor`) that is self-contained
at the JS level (it bundles its own copy of `uiTextarea` and the shared `ricdom/ui`
internal helpers it needs) — but its component's CSS (`.ric-md-editor*`, `.ric-md-*` token
classes) lives in the single `ricdom-ui.css` stylesheet (§9), per the "CSS ships as one
file" policy, so a consumer still needs `ricdom-ui.css` loaded for it to look like
anything.

It is a stateful part like `createScrollPane` — register it with `app.use()` (§6):

```ts
const md = app.use(createMdEditor());
// inside render:
md({ value: s.body, oninput: (ev) => { s.body = ev.target.value; } })
```

### Mechanism: a transparent textarea over a colored mirror

The rendered tree (when `highlight` is not `'none'` and the value is under the size cap,
see below) is:

```
div.ric-md-editor[data-ricdom-role=md-editor][data-ricdom-md-editor-id]
├── pre.ric-md-editor__mirror[data-ricdom-role=md-editor-mirror][aria-hidden=true][island]
└── textarea.ric-textarea.ric-md-editor__input[data-ricdom-role=textarea]  (+ your class)
```

The `<pre>` mirror sits behind the `<textarea>` (absolute-positioned, `z-index: 0`) and
renders the same text with `<span class="ric-md-*">` wrapping each colored region; the
`<textarea>` itself is styled `color: transparent; caret-color: <fg>` (`z-index: 1`) so
only its caret and native selection highlight are visible — the colored text you see is
entirely the mirror underneath. The mirror is `island: true`, so `ricdom`'s own diff/patch
never touches its children; `createMdEditor` owns and rebuilds that DOM directly.

### Props table (in addition to every `uiTextarea` prop)

| Key | Type | Meaning |
| --- | --- | --- |
| `highlight` | `'markdown' \| 'none'` | Default `'markdown'`. `'none'` falls back to plain `uiTextarea` — see the FACT below |
| `wrapperClass` | `ClassValue` | *(2.0.0-alpha.17)* Merged into the wrapper `div.ric-md-editor`'s `class` (`mergeClass('ric-md-editor', wrapperClass)`) — **not** the `<textarea>`'s. Requested by Raccoon Memo (追報 4) so a consumer can size the wrapper as a flex item without reaching into `.ric-md-editor` from outside. Dropped silently when there is no wrapper (`highlight: 'none'` or the size-cap fallback, next section) |
| `wrapperStyle` | `StyleValue` | *(2.0.0-alpha.17)* Same target and same fallback behavior as `wrapperClass`, applied as the wrapper's inline `style` instead of its `class` |

The wrapper's `display` is `flex; flex-direction: column` (changed from `block` in
2.0.0-alpha.17 — see the `Changed` entry in `CHANGELOG.md`'s alpha.17 section for why), and
the `<textarea>` itself is not forced to `flex: 1` — `rows`/`autoResize` still determine its
own height inside the column exactly as before. A consumer who wants the textarea to fill
the wrapper sets `wrapperStyle: { height: '240px' }` (or any sizing that gives the wrapper a
definite height) plus the textarea's own `style: { height: '100%' }` (an ordinary
`uiTextarea` prop, passed straight through in `rest`).

The wrapper's **stable selector is `[data-ricdom-role="md-editor"]`** (§11) — like every
other `data-ricdom-role`, it exists precisely so CSS/E2E code doesn't have to depend on
class names, which are not a contract (`wrapperClass`'s own value least of all, since it's
consumer-supplied). Prefer the role selector, or your own `wrapperClass`, over assuming
`.ric-md-editor` will always be present or named that.

### FACT: `highlight: 'none'` is byte-for-byte identical to `uiTextarea`

`createMdEditor()({ ...props, highlight: 'none' })` returns exactly `uiTextarea(rest)`
(`rest` = every prop except `highlight`) — no wrapper `<div>`, no mirror, nothing added.
This is the deliberate escape hatch: a consumer that wants to conditionally disable
highlighting (e.g. a "plain text mode" toggle) gets the identical DOM shape either way, so
nothing else in the surrounding layout needs to change. A consequence: `wrapperClass` and
`wrapperStyle` (previous section) are dropped along with the rest of the wrapper — a
consumer who wrote CSS against the wrapper (`wrapperClass`'s value, or
`[data-ricdom-role="md-editor"]`) loses that wrapper entirely when switching to `'none'`,
by design. Layout CSS that must keep working in both modes belongs on the `<textarea>`'s
own `class`/`style` (the ordinary `uiTextarea` props, `rest`-forwarded either way), not on
the wrapper.

### FACT: oversized documents fall back to the same plain path automatically

If `value.length` exceeds `maxHighlightLength` (the `createMdEditor({ maxHighlightLength })`
option, default `200_000`), the same `uiTextarea(rest)` plain path is used for that render,
regardless of the `highlight` prop — tokenizing and rebuilding a mirror DOM for an
extremely large document is O(document size) work done synchronously on every keystroke, so
this cap exists to keep large-document editing responsive rather than to limit what
`uiTextarea` itself can hold (a plain `uiTextarea` has no such cap).

### Sync triggers

The mirror is kept in sync with the textarea's value, scroll position, and layout at these
points:

- **`input`**: rebuilds the mirror synchronously from `event.target.value`, before calling
  your own `oninput` (if given).
- **`compositionend`**: rebuilds the mirror again as a safety net. Not strictly required for
  Chromium (which already fires `input` events during IME composition, so the mirror
  already tracks composing text) — see the IME FACT below. Wired via
  `textarea.addEventListener('compositionend', …)`, **not** an `oncompositionend` prop —
  browsers have no IDL handler attribute for this event, so a prop-based `on*` assignment
  would silently never fire (§2's core FACT on this).
- **`scroll`**: copies `scrollTop`/`scrollLeft` onto the mirror, before calling your own
  `onscroll` (if given).
- **After every render this instance was called in**: schedules a layout re-sync via the
  same rAF + 200ms `setTimeout` backstop double-up used by `createScrollPane` (§10.3.3) —
  whichever fires first wins, so this still works in a hidden/throttled window where rAF
  doesn't fire.
- **`ResizeObserver`** on the textarea itself (attached on first sync, disconnected in
  `dispose()`): re-runs the layout sync whenever the textarea's own box size changes (a
  splitter drag, dragging its native `resize: vertical` handle, or any other layout change
  that isn't a `render` call).

### FACT: the mirror copies the textarea's computed font metrics — your CSS is honored

Each layout sync copies `font-family`/`font-size`/`font-weight`/`font-style`/`line-height`/
`letter-spacing`/`word-spacing`/`tab-size`/`text-indent`/padding (4 sides)/border-width (4
sides, applied as a transparent border so the box math matches)/`text-align`/`direction`/
`overflow-wrap` from the textarea's `getComputedStyle()` onto the mirror, and sets the
mirror's `width`/`height` from the textarea's `clientWidth`/`clientHeight` (plus
horizontal/vertical border widths) — the textarea's own scrollbar gutter is excluded from
the mirror's wrap width this way. Any CSS you apply to the textarea (a `style` prop, a
class targeting `.ric-md-editor__input`, a page-level font override) therefore reaches the
mirror automatically; there is nothing to configure separately for the mirror's own
appearance.

### FACT: the mirror is always `box-sizing: border-box`, regardless of the textarea's own box-sizing

The textarea's own `box-sizing` is **not** copied to the mirror — the mirror is always
forced to `box-sizing: border-box` (both in `MD_EDITOR_CSS`, as a static default, and by
`applyLayout` on every sync, which wins). `uiTextarea`'s own default CSS (`.ric-textarea`)
does not set `box-sizing`, so a plain `createMdEditor()` textarea is `content-box` (the
browser default) unless you set it yourself. With the mirror pinned to `border-box`, its
declared `width` (`textarea.clientWidth` + horizontal border) minus its padding and border
always equals `textarea.clientWidth` minus its padding — which is the textarea's actual
content width, in either box-sizing mode (`clientWidth` itself is defined as "content +
padding," independent of `box-sizing`). Copying the textarea's own `box-sizing` onto the
mirror instead (an earlier bug, since fixed) breaks this identity specifically in the
common `content-box` case: the mirror's declared width would then equal its own content
width directly, over-counting by exactly the horizontal padding — a real-page measurement
of it showed the mirror's content area 29px wider than the textarea's for a 14px `--ric-
pad-x`, enough to make `mirror.scrollHeight` diverge from `textarea.scrollHeight` on
wrapped multi-line content.

### FACT: highlighting never changes glyph widths — this is why `**strong**` isn't bold

Every `.ric-md-*` token class (`cssTemplates.ts`'s `MD_EDITOR_CSS`) uses only `color`,
`background-color`, `text-decoration`, `text-shadow`, `opacity`, and `border-radius` —
never `font-weight`/`font-style`/`font-family`/`font-size`/`letter-spacing`/`padding`. If a
token's color class changed how wide its characters render, the mirror's line-wrapping
would diverge from the textarea's (they share the same width and font metrics, per the FACT
above, specifically so wrapping stays in lockstep) — a 1px divergence there is enough to
misalign the highlighted text under the caret. `**strong**` is therefore rendered with
`text-shadow: 0 0 0.6px currentColor` (a same-width "fake bold" effect) rather than a real
`font-weight` change.

### FACT: IME composition — no special freezing, `input` fires during composition

Chromium fires `input` events while an IME composition is still in progress (not only on
`compositionend`), so the mirror already tracks composing text through the ordinary
`input`-triggered sync — `createMdEditor` does not add any composition-specific freezing or
buffering logic. The `compositionend` handler exists only as a cheap extra safety net (one
more synchronous rebuild once composition finishes), matching `uiTextarea`'s own existing
IME caveat (§10.1) about controlled `value`/`oninput` and IME confirmation timing. As
documented in §2's core FACT on `on*` handling, this handler is wired with
`textarea.addEventListener('compositionend', …)` — not an `oncompositionend` prop —
because browsers expose no IDL handler attribute for this event; a consumer-supplied
`oncompositionend` prop would still land on the textarea like any other prop, but (per that
same FACT) would never actually fire.

### `tokenizeMarkdown(src)` (exported, pure, no DOM)

```ts
interface MdToken { text: string; cls: string | null; lang?: string | null; fenceBody?: boolean }
const tokenizeMarkdown: (src: string) => MdToken[]
```

A practical, line-based Markdown subset (front matter, ATX headings, fenced code with a
language hint, blockquotes, bulleted/ordered/task lists, tables, horizontal rules, inline
`code`/`**strong**`/`*em*`/`~~strike~~`/links/images/autolinks/raw HTML tags) — not full
CommonMark. **Invariant**: `tokens.map(t => t.text).join('') === src` for every input,
including unterminated fences/emphasis, CRLF, tabs, and astral characters — a token with
`cls: null` is untouched plain text, never a dropped or rewritten character. This is what
lets the mirror be built purely from `createTextNode`/`createElement` (no `innerHTML`,
except the one exception below) while staying byte-identical to the textarea's value.

Fenced code bodies with a language hint are run through `window.hljs.highlight(code, {
language })` if `window.hljs` exists (the same optional integration as `uiCodePre`/`uiMdPre`,
§10.4) — this is the one place `innerHTML` is used, on that single `<span>`. Unlike
`uiMdPre`/`uiCodePre`, **`createMdEditor` never warns when `hljs` is missing** — plain,
un-highlighted color is the expected default here (a Markdown-colored textarea is still
useful without a syntax-highlighting library loaded), not a degraded state worth flagging.
*(2.0.0-alpha.17)* Because of this asymmetry, an app using both `uiMdPre`/`uiCodePre` and
`createMdEditor` together (e.g. a live Markdown preview next to the editor) can end up with
colored fences in the preview but plain ones in the editor if the `hljs` `<script>` loads
*after* `createMdEditor`'s first render: `uiMdPre`/`uiCodePre` are plain functions
re-evaluated on every render, so they pick up `window.hljs` the next time anything triggers
a re-render regardless of whether the Markdown text itself changed, but the mirror only
re-tokenizes on a discrete trigger (`input`/`compositionend`/an actual value change caught
by the layout re-sync) — if the text hasn't changed since `hljs` became available, the fence
stays in its original plain-color tokenization until the user types again. Load the `hljs`
script before both components render to avoid the mismatch entirely.



### Theme tokens

Five new `--ric-md-*` CSS variables, defined for all seven bundled themes (`applyTheme`,
§8) and picked up automatically by `exportTheme`/`exportSettings` (they filter on the
`--ric-` prefix, §8): `--ric-md-heading`, `--ric-md-emphasis`, `--ric-md-link`,
`--ric-md-url`, `--ric-md-code-bg`, `--ric-md-quote`, `--ric-md-marker`, `--ric-md-meta`.
