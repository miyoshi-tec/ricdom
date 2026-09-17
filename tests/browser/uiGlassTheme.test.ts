// 実ブラウザ回帰テスト: glass テーマの backdrop-filter (設計書 §8、2.0.0-alpha.18)。
// jsdom は backdrop-filter の computed style を実装しないため (常に空文字を返す)、
// 実ブラウザでのみ「実際にぼかしがかかっているか」を検証できる — 他のテーマテスト
// (tests/browser/uiTheme.test.ts の color-scheme/background 検証) と同じ構成。
//
// **各 it は必ず新しい setupApp() の要素に対して 1 つのテーマだけを適用する**
// (glass → light のように同一要素へ applyTheme を 2 回呼んで切り替えるテスト構成には
// しない)。理由: computeThemeVars は「解決したテーマが明示的に持つキーだけ」を
// style.setProperty するため、cyber/aqua/glass のように他テーマに無いキー
// (--ric-popup-blur 等) を持つテーマから、そのキーを持たない別テーマへ同一要素上で
// 切り替えると、古いキーが inline style に残ったままになる (applyTheme は「持っていない
// キーを明示的に削除する」until 実装ではない — この挙動自体は今回のスコープ外の
// 既存仕様で、cyber/aqua でも同じ穴が理論上ある。ここでは踏まず、テーマごとに独立した
// 要素で検証することで既存テーマの回帰確認という本来の目的を達成する)。
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
});
