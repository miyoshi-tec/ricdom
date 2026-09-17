// 実ブラウザ回帰テスト: glass テーマの backdrop-filter (設計書 §8、2.0.0-alpha.18)。
// jsdom は backdrop-filter の computed style を実装しないため (常に空文字を返す)、
// 実ブラウザでのみ「実際にぼかしがかかっているか」を検証できる — 他のテーマテスト
// (tests/browser/uiTheme.test.ts の color-scheme/background 検証) と同じ構成。
//
// **各 it は必ず新しい setupApp() の要素に対して 1 つのテーマだけを適用する**
// (glass → light のように同一要素へ applyTheme を 2 回呼んで切り替えるテスト構成には
// しない)。同一要素上でのテーマ切替時の古いキー残留は 2.0.0-alpha.21 (Rancha 報告 #6) で
// applyTheme 自体が新しい vars に無い inline `--ric-*` プロパティを removeProperty する
// ように直り、tests/ui/theme.test.ts で単体テスト済み (cyber → dark の再現も含む) —
// この構成はそれとは独立に「テーマごとに新しい要素で backdrop-filter を検証する」という
// 本ファイル本来の単純さのために保っている (同一要素の切替アニメーション待ちなどを
// 絡めず、各テーマの静的な computed style だけを見る)。
//
// 検証方針:
//   - フローティング面 (dialog/popup/toast/tooltip/dropdown/panel) は glass テーマの
//     要素下で computed backdropFilter が 'none' ではなく blur( を含むこと。
//   - 同じ面が light テーマの要素下では backdropFilter === 'none' のままであること
//     (既存 5 テーマの見た目が変わらないことの回帰ガード、cssTemplates.ts の
//     var(--ric-surface-blur, none) フォールバックが効いている証拠)。
//   - 入力コントロール (uiInput) は glass 下でも backdropFilter は 'none' のまま
//     (コストの高い backdrop-filter を大量に存在しうるコントロール類には掛けない方針、
//     SPEC §8 FACT) だが、背景は rgba(...) の半透明であること。
//   - transparent bg (Electron 対応、docs/TUTORIAL.md §6): createTheme の override で
//     --ric-color-bg: transparent を渡すと、[data-ricdom-theme] 要素自身の computed
//     background-color が rgba(0, 0, 0, 0) になること。

import { describe, expect, it } from 'vitest';
import { userEvent } from '@vitest/browser/context';
import { createApp } from '../../src/app.js';
import { applyTheme, createTheme } from '../../src/ui/theme.js';
import type { ThemeName } from '../../src/ui/theme.js';
import { createDialog } from '../../src/ui/dialog.js';
import { createPopup } from '../../src/ui/popup.js';
import { createToast } from '../../src/ui/toast.js';
import { createTooltip } from '../../src/ui/tooltip.js';
import { createDropdown } from '../../src/ui/dropdown.js';
import { uiPanel } from '../../src/ui/panel.js';
import { uiInput } from '../../src/ui/input.js';
import { injectStyles } from '../../src/ui/injectStyles.js';
import { flush, setupApp } from '../_helpers/dom.js';

injectStyles(document);

const dialogBackdropFilter = async (theme: ThemeName): Promise<string> => {
  const app = setupApp();
  applyTheme(app, { theme });
  let dlg: ReturnType<typeof createDialog>;
  const handle = createApp('#app', {}, () => (dlg ? dlg({ triggerChildren: ['開く'], title: 't', children: ['本文'] }) : null));
  dlg = handle.use(createDialog());
  await flush();
  await userEvent.click(app.querySelector('button')!);
  await new Promise((r) => setTimeout(r, 300)); // entrance アニメーション終了待ち
  return getComputedStyle(document.querySelector('.ric-dialog')!).backdropFilter;
};

const popupBackdropFilter = async (theme: ThemeName): Promise<string> => {
  const app = setupApp();
  applyTheme(app, { theme });
  let menu: ReturnType<typeof createPopup>;
  const handle = createApp('#app', {}, () => (menu ? menu({ trigger: ['メニュー'], children: [{ tag: 'button', children: ['項目'] }] }) : null));
  menu = handle.use(createPopup());
  await flush();
  await userEvent.click(app.querySelector('button')!);
  await new Promise((r) => setTimeout(r, 150));
  return getComputedStyle(document.querySelector('.ric-popup__body')!).backdropFilter;
};

const toastBackdropFilter = async (theme: ThemeName): Promise<string> => {
  const app = setupApp();
  applyTheme(app, { theme });
  let toast: ReturnType<typeof createToast>;
  const handle = createApp('#app', {}, () => {
    toast?.();
    return { tag: 'div' };
  });
  toast = handle.use(createToast());
  await flush();
  toast!.show('保存しました');
  await flush();
  return getComputedStyle(document.querySelector('.ric-toast__item')!).backdropFilter;
};

const tooltipBackdropFilter = async (theme: ThemeName): Promise<string> => {
  const app = setupApp();
  applyTheme(app, { theme });
  let tip: ReturnType<typeof createTooltip>;
  const handle = createApp('#app', {}, () => (tip ? tip({ content: 'ヒント', children: [{ tag: 'button', children: ['?'] }] }) : null));
  tip = handle.use(createTooltip());
  await flush();
  app.querySelector('.ric-tooltip')!.dispatchEvent(new Event('mouseenter'));
  await flush();
  return getComputedStyle(document.querySelector('[role="tooltip"]')!).backdropFilter;
};

const dropdownBackdropFilter = async (theme: ThemeName): Promise<string> => {
  const app = setupApp();
  applyTheme(app, { theme });
  let dd: ReturnType<typeof createDropdown>;
  const handle = createApp('#app', {}, () => (dd ? dd({ label: '選択肢', children: [{ tag: 'div', children: ['項目'] }] }) : null));
  dd = handle.use(createDropdown());
  await flush();
  await userEvent.click(app.querySelector('button')!);
  await new Promise((r) => setTimeout(r, 100));
  return getComputedStyle(document.querySelector('.ric-dropdown__body')!).backdropFilter;
};

const panelBackdropFilter = async (theme: ThemeName): Promise<string> => {
  const app = setupApp();
  applyTheme(app, { theme });
  createApp('#app', {}, () => uiPanel({ children: ['本文'] }));
  await flush();
  return getComputedStyle(app.querySelector('.ric-panel')!).backdropFilter;
};

describe('実ブラウザ: glass テーマの backdrop-filter (フローティング面)', () => {
  it('dialog / popup / toast / tooltip / dropdown / panel は glass の下で backdrop-filter に blur( を含む', async () => {
    expect(await dialogBackdropFilter('glass')).toContain('blur(');
    expect(await popupBackdropFilter('glass')).toContain('blur(');
    expect(await toastBackdropFilter('glass')).toContain('blur(');
    expect(await tooltipBackdropFilter('glass')).toContain('blur(');
    expect(await dropdownBackdropFilter('glass')).toContain('blur(');
    expect(await panelBackdropFilter('glass')).toContain('blur(');
  });

  it('同じ面は light の下では backdrop-filter が none のまま (既存テーマの見た目は不変)', async () => {
    expect(await dialogBackdropFilter('light')).toBe('none');
    expect(await popupBackdropFilter('light')).toBe('none');
    expect(await toastBackdropFilter('light')).toBe('none');
    expect(await tooltipBackdropFilter('light')).toBe('none');
    expect(await dropdownBackdropFilter('light')).toBe('none');
    expect(await panelBackdropFilter('light')).toBe('none');
  });

  it('コントロール (uiInput) には glass でも backdrop-filter を掛けない (コスト方針、SPEC §8) が、背景は半透明になる', async () => {
    const app = setupApp();
    applyTheme(app, { theme: 'glass' });
    createApp('#app', {}, () => uiInput({ placeholder: 'x' }));
    await flush();

    const input = app.querySelector('.ric-input') as HTMLElement;
    expect(getComputedStyle(input).backdropFilter).toBe('none');
    expect(getComputedStyle(input).backgroundColor).toMatch(/^rgba\(/); // alpha 付き = 半透明
  });
});

describe('実ブラウザ: 透明ウィンドウ対応 (createTheme override、2.0.0-alpha.18)', () => {
  it('createTheme("glass", { "--ric-color-bg": "transparent" }) を適用すると要素の computed background-color が透明になる', () => {
    const app = setupApp();
    applyTheme(app, { theme: createTheme('glass', { '--ric-color-bg': 'transparent' }) });
    expect(getComputedStyle(app).backgroundColor).toBe('rgba(0, 0, 0, 0)');
  });

  // 2.0.0-alpha.19: `--ric-theme` マーカーの回帰ガード。TUTORIAL.md §6 の Electron recipe
  // (createTheme 経由で glass を渡す) でも data-ricdom-theme が正しく "glass" に解決され、
  // かつフローティング面 (dialog) の backdrop-filter (blur) が実ブラウザで効いていること —
  // 修正前は data-ricdom-theme が常に空文字になっていた (theme.ts 参照)。
  it('createTheme("glass", { "--ric-color-bg": "transparent" }) でも data-ricdom-theme="glass" になり、dialog に backdrop-filter の blur がかかる', async () => {
    const app = setupApp();
    const glassTransparent = createTheme('glass', { '--ric-color-bg': 'transparent' });
    applyTheme(app, { theme: glassTransparent });
    expect(app.getAttribute('data-ricdom-theme')).toBe('glass');

    let dlg: ReturnType<typeof createDialog>;
    const handle = createApp('#app', {}, () => (dlg ? dlg({ triggerChildren: ['開く'], title: 't', children: ['本文'] }) : null));
    dlg = handle.use(createDialog());
    await flush();
    await userEvent.click(app.querySelector('button')!);
    await new Promise((r) => setTimeout(r, 300)); // entrance アニメーション終了待ち
    expect(getComputedStyle(document.querySelector('.ric-dialog')!).backdropFilter).toContain('blur(');
  });
});

// Trend Guard #16 (パイロット第 2 号、2026-09-17、alpha.19): TUTORIAL.md §6 の Electron
// recipe (`createTheme('glass-dark', { '--ric-color-bg': 'transparent' })`) を適用すると、
// `.ric-panel` も `--ric-color-bg` を直接読んでいたため surface ごと透明になり、
// glass-dark のほぼ白い `--ric-color-fg` テキストが (壁紙次第で) 読めなくなっていた。
// `--ric-panel-bg` (2.0.0-alpha.20) 導入後は、ページ (`[data-ricdom-theme]`) 自身は
// 透明のままで、`.ric-panel` の表面だけは不透明度を保つ。
const parseAlpha = (rgba: string): number => {
  const m = rgba.match(/rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*(?:,\s*([\d.]+)\s*)?\)/);
  if (!m) throw new Error(`rgba(...) の形式ではない: ${rgba}`);
  return m[1] === undefined ? 1 : Number(m[1]);
};

describe('実ブラウザ: .ric-panel の表面は透明ウィンドウ recipe の影響を受けない (Trend Guard #16、2.0.0-alpha.20)', () => {
  it('glass-dark + --ric-color-bg: transparent でも panel の computed background-color は不透明 (alpha > 0)、ページ自身は透明のまま', async () => {
    const app = setupApp();
    applyTheme(app, { theme: createTheme('glass-dark', { '--ric-color-bg': 'transparent' }) });
    createApp('#app', {}, () => uiPanel({ children: ['本文'] }));
    await flush();

    // ページ (theme 適用先の要素自身) の背景は recipe どおり透明。
    expect(getComputedStyle(app).backgroundColor).toBe('rgba(0, 0, 0, 0)');

    // panel の表面は --ric-panel-bg (rgba(15,23,42,0.5)) を読み続けるので不透明度が残る
    // (修正前は --ric-color-bg を直接読んでいたため、ここが rgba(0, 0, 0, 0) になっていた
    // = このアサーションが RED になることを修正前のコードで確認済み)。
    const panelBg = getComputedStyle(app.querySelector('.ric-panel')!).backgroundColor;
    expect(parseAlpha(panelBg)).toBeGreaterThan(0);
  });

  it('light/dark テーマでは panel の computed background-color がテーマの色そのまま (見た目不変の回帰ガード)', async () => {
    const light = setupApp();
    applyTheme(light, { theme: 'light' });
    createApp('#app', {}, () => uiPanel({ children: ['本文'] }));
    await flush();
    expect(getComputedStyle(light.querySelector('.ric-panel')!).backgroundColor).toBe('rgb(249, 250, 251)'); // #f9fafb

    const dark = setupApp();
    applyTheme(dark, { theme: 'dark' });
    createApp('#app', {}, () => uiPanel({ children: ['本文'] }));
    await flush();
    expect(getComputedStyle(dark.querySelector('.ric-panel')!).backgroundColor).toBe('rgb(17, 19, 24)'); // #111318
  });
});
