# Contributing to ricdom

Thanks for considering a contribution. This document covers how to get set up, the
conventions the codebase follows, and how changes get tested and merged.

## Development setup

```sh
git clone https://github.com/miyoshi-tec/ricdom.git
cd ricdom
npm install
```

Useful scripts:

| Command | What it does |
|---|---|
| `npm run typecheck` | `tsc --noEmit` — type-check everything, including tests |
| `npm test` | Unit tests (Vitest, jsdom) |
| `npm run test:browser` | Real-browser tests (Vitest browser mode, Playwright/Chromium) — runs `npm run build` first |
| `npm run build` | Produces `dist/` (ESM, CJS, IIFE, `.d.ts`, and `ricdom-ui.css`) |

Run `npm run typecheck`, `npm test`, `npm run test:browser`, and `npm run build` before
opening a PR — CI runs all four.

## Code conventions

- **No `class` syntax.** Every constructor is a factory function
  (`createDialog(): DialogInstance`, not `class Dialog`). This keeps state private via
  closures instead of instance fields, and keeps every component's shape (what it exposes,
  what's internal) explicit at the return statement.
- **CamelCase** for all identifiers (`createApp`, `uiButton`, `data-ricdom-role`) — no
  snake_case, no exceptions.
- **Comments explain *why*, not *when*.** A comment should tell the next reader what a
  piece of code does, what contract it's upholding, and — where it matters — why it's
  shaped the way it is (a browser quirk it's working around, a bug it fixed, a design
  trade-off). Comments should not narrate the project's own development timeline ("added
  in phase 3", "this used to work differently before we changed it") — that belongs in
  `CHANGELOG.md` and git history, not in code that ships to users. Where a piece of
  behavior differs from ricdom v1 in a way that helps someone migrating, noting that
  correspondence (`// equivalent to v1's create_ui_dialog`) is useful and welcome.
  Comments are written in Japanese in this codebase (consistent with the rest of the
  project's contribution history); code identifiers, JSDoc on public exports, and
  user-facing docs are in English.
- **Public exports carry JSDoc.** A short description plus a one-line usage example is
  expected on every exported function/type in `src/index.ts`, `src/ui/index.ts`, and
  `src/icons/index.ts`.
- **Never hand-write icon path data.** Get a descriptor via `import { x } from
  'ricdom/icons'` or `npx ricdom-icon <name>` — see [SPEC.md §12](docs/SPEC.md#12-icons).
  This applies to AI agents working on this codebase as much as to humans.

## Tests

- **Unit tests** (`tests/**/*.test.ts`, jsdom) cover logic that doesn't depend on real
  layout: reactivity, diffing, component props/ARIA attributes, type-level contracts
  (`expect-type`).
- **Browser tests** (`tests/browser/**/*.test.ts`, Playwright/Chromium via Vitest browser
  mode) cover anything that needs a real layout engine or real browser behavior: focus
  trapping, drag interactions, scrollbar CSS, IIFE smoke tests, `requestAnimationFrame`
  backstop timing.

If you're fixing a bug that only reproduces in a real browser (this has happened more than
once in this project's history — jsdom does not implement layout), add the regression to
`tests/browser/`, not `tests/`.

### Adversarial testing

This project has, in its v1 lineage, benefited from consumers testing it more
aggressively — and finding more real bugs — than the author's own test suite did. When
you add a test, try to think like a consumer trying to break the thing, not like the
author confirming it works the one way they already know it works: rapid state changes
mid-animation, a re-render firing while an input is mid-edit, a component used without its
required setup step, empty/zero/negative edge cases in numeric props. A bug that only
shows up under adversarial conditions is still a bug.

## Docs site

The docs site (landing page, tutorial, spec, icon playground and the numbered samples in
`examples/`) is plain HTML rendered by ricdom itself, with no build step of its own.

- `npm run build:site` builds the library and assembles `_site/` (git-ignored) from `site/`,
  `examples/`, `docs/*.md` and the browser-facing files of `dist/`. Serve it with any static
  server, for example `npx http-server _site`; the tutorial and spec fetch Markdown, which
  browsers block under `file://`.
- `npm run test:examples` rebuilds the site and smoke-tests every page in headless Chromium
  (no console errors, shared nav bar, both languages, live tutorial demos).
- Samples are numbered `examples/NN-slug.html` and listed in `examples/_samples.js`; the smoke
  test fails if a file and its list entry do not match. Load `_i18n.js`, `_samples.js` and
  `_nav.js` after the dist bundles, as the existing samples do.
- i18n is gettext-style: **the English string is the key** and there is no English dictionary.
  Write `t('English text')` (or ``t`${n} items`` for placeholders) and add the Japanese text in
  the same file with `ricdomI18n.addDict('ja', { 'English text': '日本語' })`.
  `npm run check:i18n` fails when a `t()` key has no `ja` entry. Code and comments in samples
  stay in English.

## Commit messages

This project uses [Conventional Commits](https://www.conventionalcommits.org/)
(`feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`, `ci:`, …). Keep the subject line
under ~70 characters; use the body for the "why" when it isn't obvious from the subject
alone. Keep unrelated changes in separate commits.

## Filing issues

Bug reports are most useful with a minimal reproduction — a single HTML file using the
IIFE build is ideal, since it removes any bundler/tooling variable from the picture. If a
bug can't be reproduced from the information given, expect to be asked for a smaller
repro rather than a speculative fix landing without one; see
[SECURITY.md](SECURITY.md) instead for anything security-sensitive.

## License

By contributing, you agree that your contributions will be licensed under the project's
[MIT license](LICENSE).
