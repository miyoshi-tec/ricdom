// 実ブラウザ smoke: IIFE 2 本 (ricdom.iife.min.js + ricdom-ui.iife.min.js) と
// ricdom-ui.css を <link> で読み、ビルド不要のまま dialog/popup/toast/tooltip が
// 動くことを確認する (設計書 G の examples/ui.html と同じ構成、設計書 F)。
// dist は事前にビルドされている必要がある (package.json の pretest:browser)。

import { describe, expect, it } from 'vitest';
import { commands } from '@vitest/browser/context';
import { userEvent } from '@vitest/browser/context';

interface RicdomGlobal {
  createApp: (target: string | Element, state: object, render: (s: never) => unknown) => Record<string, unknown>;
}
interface RicdomUiGlobal {
  createDialog: () => (props: unknown) => unknown;
  createToast: () => ((props?: unknown) => unknown) & { show: (msg: string, opts?: unknown) => void };
  applyTheme: (el: Element, opts: unknown) => void;
  injectStyles: (doc?: Document) => void;
}

const loadScript = async (code: string): Promise<void> => {
  const script = document.createElement('script');
  script.textContent = code;
  document.head.appendChild(script);
};

describe('実ブラウザ smoke: ricdom + ricdom/ui の IIFE 2 本 + CSS <link>', () => {
  it('<link rel="stylesheet"> で CSS を読み、ricdomUI.createDialog が動く (ビルド不要の証明)', async () => {
    const coreCode = await commands.readFile('dist/ricdom.iife.min.js');
    const uiCode = await commands.readFile('dist/ricdom-ui.iife.min.js');

    await loadScript(coreCode);
    await loadScript(uiCode);

    // examples/ui.html と同じ構成: <link rel="stylesheet"> で dist/ricdom-ui.css を読む
    // (vitest browser mode の Vite dev server はプロジェクトルート配下を静的配信するため、
    // ルート相対パスで実際にネットワーク越しに読み込ませる)。
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/dist/ricdom-ui.css';
    const linkLoaded = new Promise<void>((resolve, reject) => {
      link.onload = () => resolve();
      link.onerror = () => reject(new Error('dist/ricdom-ui.css の読み込みに失敗しました'));
    });
    document.head.appendChild(link);
    await linkLoaded;

    const ricdom = (window as unknown as { ricdom?: RicdomGlobal }).ricdom;
    const ricdomUI = (window as unknown as { ricdomUI?: RicdomUiGlobal }).ricdomUI;
    expect(ricdom).toBeTruthy();
    expect(ricdomUI).toBeTruthy();
    expect(typeof ricdomUI!.createDialog).toBe('function');

    document.body.innerHTML = '<div id="app"></div>';
    let dlg: (props: unknown) => unknown;
    const app = ricdom!.createApp('#app', {}, () => (dlg ? dlg({ triggerChildren: ['開く'], title: 'smoke', children: ['本文'] }) : null)) as Record<string, unknown> & {
      use: (part: unknown) => (props: unknown) => unknown;
    };
    dlg = app.use(ricdomUI!.createDialog());
    await new Promise((r) => setTimeout(r, 100));

    const trigger = document.querySelector('#app button') as HTMLElement;
    expect(trigger).not.toBeNull();
    await userEvent.click(trigger);
    await new Promise((r) => setTimeout(r, 300));

    const dialogEl = document.querySelector('[role="dialog"]');
    expect(dialogEl).not.toBeNull();
    // CSS が読み込まれているので実際にレイアウトされたサイズを持つ (無装飾ではない)
    expect((dialogEl as HTMLElement).getBoundingClientRect().width).toBeGreaterThan(0);
  });

  it('applyTheme + createToast も同じ 2 本の IIFE だけで動く', async () => {
    const ricdom = (window as unknown as { ricdom?: RicdomGlobal }).ricdom;
    const ricdomUI = (window as unknown as { ricdomUI?: RicdomUiGlobal }).ricdomUI;
    expect(ricdom).toBeTruthy();
    expect(ricdomUI).toBeTruthy();

    document.body.innerHTML = '<div id="app2"></div>';
    ricdomUI!.applyTheme(document.getElementById('app2')!, { theme: 'dark' });
    expect(getComputedStyle(document.getElementById('app2')!).colorScheme).toBe('dark');

    let toast: (ReturnType<RicdomUiGlobal['createToast']>) | undefined;
    const app = ricdom!.createApp('#app2', {}, () => {
      toast?.();
      return { tag: 'div' };
    }) as Record<string, unknown> & { use: (part: unknown) => ReturnType<RicdomUiGlobal['createToast']> };
    toast = app.use(ricdomUI!.createToast());
    await new Promise((r) => setTimeout(r, 100));

    toast.show('ok', { type: 'success' });
    await new Promise((r) => setTimeout(r, 100));
    expect(document.querySelector('[role="status"]')).not.toBeNull();
  });

  // iifeSmoke.test.ts と同じ理由 (パイロット第 9 号 = Potopeta、2.0.0-alpha.10):
  // `ricdom-ui.iife.min.js` 側の globalThis.ricdomUI 代入も同じ footer 対策なので、
  // ui 側でも同じ関数スコープ eval の耐性を確認する。
  it('関数スコープで評価 (new Function) しても globalThis.ricdomUI が定義される (footer の global 代入、修正前は赤)', async () => {
    const uiCode = await commands.readFile('dist/ricdom-ui.iife.min.js');
    // iifeSmoke.test.ts と同じ理由: 先行テストの <script> タグ実行で既に立っている
    // window.ricdomUI (var 由来、非 configurable) を undefined で上書きしてから
    // 関数スコープ eval の効果だけを見る。
    (window as unknown as { ricdomUI?: unknown }).ricdomUI = undefined;
    const fn = new Function(uiCode);
    fn();

    const ricdomUI = (window as unknown as { ricdomUI?: RicdomUiGlobal }).ricdomUI;
    expect(ricdomUI).toBeTruthy();
    expect(typeof ricdomUI!.createDialog).toBe('function');
  });

  // ricdom/md-editor (opt-in サブパス、2.0.0-alpha.16) の IIFE smoke。ricdom/ui とは別の
  // 独立した IIFE (dist/ricdom-md-editor.iife.min.js, globalName `ricdomMdEditor`) として
  // 配布されるため、`ricdom-ui.iife.min.js` を読んでいなくても単体で読み込める
  // (見た目は結局 ricdom-ui.css が要る — src/mdEditor/index.ts 参照)。
  it('dist/ricdom-md-editor.iife.min.js を読み込むと globalThis.ricdomMdEditor.createMdEditor が使える', async () => {
    const mdEditorCode = await commands.readFile('dist/ricdom-md-editor.iife.min.js');
    await loadScript(mdEditorCode);

    const ricdomMdEditor = (window as unknown as { ricdomMdEditor?: { createMdEditor: () => unknown } }).ricdomMdEditor;
    expect(ricdomMdEditor).toBeTruthy();
    expect(typeof ricdomMdEditor!.createMdEditor).toBe('function');
  });
});
