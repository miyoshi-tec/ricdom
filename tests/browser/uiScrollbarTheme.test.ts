// 実ブラウザ回帰テスト: [data-ricdom-theme] 配下でページ全体のスクロールバー既定スタイル
// (設計書 §13) が有効なことを確認する (v1 の `.ric-page, .ric-page *` 相当の後継)。
//
// 2.0.0-alpha.21 (オーナー決定、Rancha 報告) より前は `::-webkit-scrollbar*` 疑似要素の
// ルールも併記していたが、Chromium 121+ では同じ要素に `scrollbar-width`/`scrollbar-color`
// のどちらかが `auto` 以外だと `::-webkit-scrollbar*` 系ルールを一切無視する (実装仕様)。
// このファイルは元から両方を同じ要素に指定していたため、`::-webkit-scrollbar*` 側は
// Chromium ではずっと dead code だった (Rancha が実機のデバイスピクセル計測で発見 —
// つまみ幅が指定していた 8px ではなく標準の thin バーの実測値だった)。2.0.0-alpha.21 で
// そのブロックを削除し標準プロパティだけにしたため、ここでは標準プロパティの computed
// 値だけを検証する (`::-webkit-scrollbar` は擬似要素なので computed style からの直接
// 検証はそもそもできない — 削除前から変わらない制約)。
// scrollbar-width/scrollbar-color は Firefox 系プロパティだが、Chromium 121+ も
// getComputedStyle で値を返す。

import { describe, expect, it } from 'vitest';
import { applyTheme } from '../../src/ui/theme.js';
import { injectStyles } from '../../src/ui/injectStyles.js';
import { setupApp } from '../_helpers/dom.js';

injectStyles(document);

describe('実ブラウザ: [data-ricdom-theme] 配下のスクロールバー規則 (2.0.0-alpha.21、標準プロパティのみ)', () => {
  it('applyTheme した要素自身に scrollbar-width: thin と scrollbar-color の computed 値が入る', () => {
    const app = setupApp();
    applyTheme(app, { theme: 'light' });

    const style = getComputedStyle(app);
    expect(style.scrollbarWidth).toBe('thin');
    // 既定 (未適用) は 'auto'。[data-ricdom-theme] の規則が効いていれば
    // scrollbar-thumb の色 + transparent の 2 値になる ('auto' ではなくなる)。
    expect(style.scrollbarColor).not.toBe('auto');
    // `${sbt} transparent` の 2 値 (つまみ色 + トラック) が computed に反映されている
    // こと。thumb 側 (`--ric-scrollbar-thumb` の `color-mix()`) の解決後の関数表記は
    // ブラウザ/カラースペースの実装差で変わりうる (実測で `color(srgb ...)` 形式) ため
    // 文字列そのものは検証しない — track 側の `transparent` キーワードは Chromium の実測で
    // 常に `rgba(0, 0, 0, 0)` に解決される、という決定的な事実だけを見る。
    expect(style.scrollbarColor).not.toBe('auto');
    expect(style.scrollbarColor.endsWith('rgba(0, 0, 0, 0)')).toBe(true);
  });

  it('子孫要素にも scrollbar-width/scrollbar-color が継承経由ではなく規則自体で適用される ([data-ricdom-theme] *)', () => {
    const app = setupApp();
    app.innerHTML = '<div id="child" style="overflow:auto; height:10px;"></div>';
    applyTheme(app, { theme: 'dark' });

    const child = document.getElementById('child')!;
    const style = getComputedStyle(child);
    expect(style.scrollbarWidth).toBe('thin');
    expect(style.scrollbarColor).not.toBe('auto');
  });

  it('applyTheme していない要素には規則が適用されない (scrollbar-width/scrollbar-color とも既定 auto のまま)', () => {
    document.body.innerHTML = '<div id="plain"></div>';
    const plain = document.getElementById('plain')!;
    const style = getComputedStyle(plain);
    expect(style.scrollbarWidth).toBe('auto');
    expect(style.scrollbarColor).toBe('auto');
  });
});
