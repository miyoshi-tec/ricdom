// 実ブラウザ回帰テスト: dev IIFE (`dist/ricdom.iife.js`、2.0.0-alpha.10) は深い代入で
// console.warn が出るが、production IIFE (`dist/ricdom.iife.min.js`) では出ない。
//
// 2.0.0-alpha.10 で判明した穴 (統括確認済み、コア (src/reactivity.ts) 修正で対処):
// `isDevMode()` は `typeof process === 'undefined' || typeof process.env === 'undefined'
// || process.env.NODE_ENV !== 'production'` の OR 連鎖で、tsup の `define` は
// `process.env.NODE_ENV` という「トークン」だけを `"production"` に置換していた
// (`"production" !== "production"` に畳み込まれ `false` になる)。だが最初の 2 つの
// `typeof` ガードは置換対象外のまま生きたコードとして残っていたため、`process`
// グローバルが一切存在しない素のブラウザ (`<script>` タグ読み込み、bundler も
// Electron の Node 統合も無い環境 — 主要な配布形態そのもの) では
// `typeof process === 'undefined'` が常に true になり、`.iife.min.js` でも
// isDevMode() が true を返し続けていた (警告コード自体も DCE されずバンドルに残存)。
//
// 対策 (src/reactivity.ts): `__RICDOM_DEV__` というビルド時定数を導入し、
// `bakedDevMode`（`typeof __RICDOM_DEV__ === 'boolean' ? __RICDOM_DEV__ : undefined`）
// を経由することで `.iife.min.js` (`__RICDOM_DEV__: 'false'`) では警告コードが
// dead-code elimination で完全に消え、`.iife.js` (`__RICDOM_DEV__: 'true'`) では
// 常に警告が有効になる (tsup.config.ts 参照)。
//
// このテストは **`window.process` を注入しない** (real な `<script>` 1 行配布を
// 素のまま模す — Playwright/chromium の実ブラウザには元々 `process` が無い)。
// shim に頼っていた旧版は「NODE_ENV の baked/非-baked」という限定的な差異しか
// 見ておらず、本来問題だった「`process` が無いブラウザで min が正しく無警告になるか」
// を検証できていなかった。
//
// dist は事前にビルドされている必要がある (package.json の `pretest:browser`)。
//
// 2.0.0-alpha.11 で契約変更 (パイロット第 9 号 Potopeta の push 前指摘、統括確認済み):
// 深い代入の警告は代入した瞬間ではなく「同じタスクの終わりに再描画が発火しなかったと
// 確定した時」(queueMicrotask 1 回) に遅延するようになった (src/reactivity.ts の
// wrapDeepWarn 定義直前のコメント参照)。実ブラウザでもこの遅延が dev IIFE
// (`.iife.js`) に正しく効いていること、および「深い代入 → 同じタスク内でトップレベル
// を差し替えて発火」(v1 canon) が無警告になることを確認する。
import { describe, expect, it, vi } from 'vitest';
import { commands } from '@vitest/browser/context';
import { flush, flushMicrotasks, setupApp } from '../_helpers/dom.js';

interface RicdomGlobal {
  createApp: (target: string | Element, state: object, render: (s: never) => unknown) => Record<string, unknown>;
}

const loadScript = (code: string): void => {
  const script = document.createElement('script');
  script.textContent = code;
  document.head.appendChild(script);
};

describe('実ブラウザ (process 未定義): dev IIFE (.iife.js) は深い代入で warn する / production (.iife.min.js) は warn しない', () => {
  it('window.process が存在しないこと (このテストの前提)', () => {
    expect((window as unknown as { process?: unknown }).process).toBeUndefined();
  });

  it('dist/ricdom.iife.js (dev、__RICDOM_DEV__=true 焼き込み) は深い代入 (2 段目) で console.warn する', async () => {
    const code = await commands.readFile('dist/ricdom.iife.js');
    loadScript(code);

    const ricdom = (window as unknown as { ricdom?: RicdomGlobal }).ricdom;
    expect(ricdom).toBeTruthy();

    const app = setupApp();
    // obj.nested.prop への代入は 2 段目 (未追跡) — dev ビルドでは読み出し時に
    // 警告用 Proxy で包まれ、set で console.warn する (src/reactivity.ts の wrapDeepWarn)。
    const handle = ricdom!.createApp('#app', { obj: { nested: { prop: 1 } } }, () => ({ tag: 'div' })) as {
      obj: { nested: { prop: number } };
    };
    await flush();

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    handle.obj.nested.prop = 2; // 2 段目への代入 (未追跡 = 再描画はトリガーされない)
    expect(warnSpy).not.toHaveBeenCalled(); // 代入した瞬間はまだ警告しない (発火忘れと確定していない)
    await flushMicrotasks(); // 同じタスクの終わりに発火が起きなかったと確定 → ここで初めて警告
    expect(warnSpy).toHaveBeenCalled();
    expect(warnSpy.mock.calls.some((call) => String(call[0]).includes('再描画が発火されませんでした'))).toBe(true);
    warnSpy.mockRestore();
  });

  it('dist/ricdom.iife.min.js (production、__RICDOM_DEV__=false 焼き込み) は process が無くても同じ深い代入で console.warn しない', async () => {
    const code = await commands.readFile('dist/ricdom.iife.min.js');
    loadScript(code);

    const ricdom = (window as unknown as { ricdom?: RicdomGlobal }).ricdom;
    expect(ricdom).toBeTruthy();

    const app = setupApp();
    const handle = ricdom!.createApp('#app', { obj: { nested: { prop: 1 } } }, () => ({ tag: 'div' })) as {
      obj: { nested: { prop: number } };
    };
    await flush();

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    handle.obj.nested.prop = 2;
    await flushMicrotasks();
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

// 2.0.0-alpha.11: 配列経由の深い代入も dev IIFE では警告する (Potopeta の最小再現、
// src/reactivity.ts の wrapDeepWarn 定義直前のコメント参照)。list 状 state
// (`pages[]`) の最も深い代入パターンを実ブラウザ (process 未定義) で確認する。
interface RicdomAppGlobal {
  createApp: (
    target: string | Element,
    state: object,
    render: (s: never) => unknown,
  ) => { pages: Array<{ page: { width: number } }> };
}

describe('実ブラウザ (process 未定義): 配列経由の深い代入は dev IIFE で warn する / production では warn しない・配列は素通し', () => {
  it('dist/ricdom.iife.js (dev) は app.pages[0].page.width = 1 だけで完結すると console.warn する (深い代入のみ → 1)', async () => {
    const code = await commands.readFile('dist/ricdom.iife.js');
    loadScript(code);

    const ricdom = (window as unknown as { ricdom?: RicdomAppGlobal }).ricdom;
    expect(ricdom).toBeTruthy();

    const app = setupApp();
    const handle = ricdom!.createApp('#app', { pages: [{ page: { width: 100 } }] }, () => ({ tag: 'div' }));
    await flush();

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    handle.pages[0]!.page.width = 1;
    expect(warnSpy).not.toHaveBeenCalled(); // 代入した瞬間はまだ警告しない
    await flushMicrotasks();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]![0]).toContain('pages[0].page.width');
    warnSpy.mockRestore();
  });

  it('dist/ricdom.iife.js (dev) は深く書いてから同じタスク内でトップレベルを差し替えると warn しない (深い代入 + spread → 0、v1 canon)', async () => {
    const code = await commands.readFile('dist/ricdom.iife.js');
    loadScript(code);

    const ricdom = (window as unknown as { ricdom?: RicdomAppGlobal }).ricdom;
    expect(ricdom).toBeTruthy();

    const app = setupApp();
    const handle = ricdom!.createApp('#app', { pages: [{ page: { width: 100 } }] }, () => ({ tag: 'div' }));
    await flush();

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    handle.pages[0]!.page.width = 1; // 深く書く (代入が先)
    handle.pages = [...handle.pages]; // 同じタスク内でトップレベルを差し替えて発火 (発火が後)
    await flushMicrotasks();
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('dist/ricdom.iife.js (dev) では state から読んだ配列は Proxy 化されており structuredClone が throw する (副作用の FACT)', async () => {
    const code = await commands.readFile('dist/ricdom.iife.js');
    loadScript(code);

    const ricdom = (window as unknown as { ricdom?: { createApp: (t: string, s: object, r: () => unknown) => { arr: number[] } } })
      .ricdom;
    const app = setupApp();
    const handle = ricdom!.createApp('#app', { arr: [1, 2, 3] }, () => ({ tag: 'div' }));
    await flush();

    expect(() => structuredClone(handle.arr)).toThrow();
  });

  it('dist/ricdom.iife.min.js (production) は process が無くても app.pages[0].page.width = 1 で console.warn しない・配列は Proxy で包まれない', async () => {
    const code = await commands.readFile('dist/ricdom.iife.min.js');
    loadScript(code);

    const ricdom = (window as unknown as { ricdom?: RicdomAppGlobal }).ricdom;
    expect(ricdom).toBeTruthy();

    const app = setupApp();
    const rawPages = [{ page: { width: 100 } }];
    const handle = ricdom!.createApp('#app', { pages: rawPages }, () => ({ tag: 'div' }));
    await flush();

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    handle.pages[0]!.page.width = 1; // 代入自体は行われる (production と同じ結果)
    await flushMicrotasks();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(handle.pages[0]!.page.width).toBe(1);
    // 配列が Proxy で包まれていなければ structuredClone は素通りする (dev との対比)。
    expect(() => structuredClone(handle.pages)).not.toThrow();
    warnSpy.mockRestore();
  });
});

// ricdom/ui 側の複製 (src/ui/internal/pureHelpers.ts の isDevMode/bakedDevMode) も
// コアと同じ穴を抱えていたため、同じ規則で修正した (2.0.0-alpha.10)。focusWhen/
// theme (当時は inlineMenu も) のうち、`applyTheme` (無効な theme/density/fontSize 名で
// warn、src/ui/theme.ts の warnIfInvalidName) が最も単純に呼べるので代表としてテストする。
interface RicdomUiGlobal {
  applyTheme: (el: Element, opts: { density?: string }) => void;
}

describe('実ブラウザ (process 未定義): ui dev IIFE (ricdom-ui.iife.js) は無効な density 名で warn する / production (ricdom-ui.iife.min.js) は warn しない', () => {
  it('dist/ricdom-ui.iife.js (dev、__RICDOM_DEV__=true 焼き込み) は無効な density 名 (\'md\') で console.warn する', async () => {
    const code = await commands.readFile('dist/ricdom-ui.iife.js');
    loadScript(code);

    const ricdomUI = (window as unknown as { ricdomUI?: RicdomUiGlobal }).ricdomUI;
    expect(ricdomUI).toBeTruthy();

    const el = document.createElement('div');
    document.body.appendChild(el);

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // 'md' は density としては無効 (density の有効値は comfortable/compact/tight。
    // 'md' は fontSize の有効値であり、density と混同しやすい値としてあえて選んだ)。
    ricdomUI!.applyTheme(el, { density: 'md' });
    expect(warnSpy).toHaveBeenCalled();
    expect(warnSpy.mock.calls.some((call) => String(call[0]).includes('applyTheme の density'))).toBe(true);
    warnSpy.mockRestore();
    el.remove();
  });

  it('dist/ricdom-ui.iife.min.js (production、__RICDOM_DEV__=false 焼き込み) は process が無くても同じ無効な density 名で console.warn しない', async () => {
    const code = await commands.readFile('dist/ricdom-ui.iife.min.js');
    loadScript(code);

    const ricdomUI = (window as unknown as { ricdomUI?: RicdomUiGlobal }).ricdomUI;
    expect(ricdomUI).toBeTruthy();

    const el = document.createElement('div');
    document.body.appendChild(el);

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    ricdomUI!.applyTheme(el, { density: 'md' });
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
    el.remove();
  });
});
