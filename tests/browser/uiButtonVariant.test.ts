// 実ブラウザ回帰テスト: uiButton の variant: 'link' (v1 からの復活、Rancha からの報告、
// 2.0.0-alpha.8) が実際に「背景・枠・高さ制限を全部外したテキスト風ボタン」になっている
// ことを computed style で確認する。class の付与だけは tests/ui/buttonInput.test.ts
// (unit) で検証済みなので、ここでは cssTemplates.ts の BUTTON_CSS 側 (実際に読み込まれた
// CSS が computed style に反映されるか) を見る。

import { describe, expect, it } from 'vitest';
import { uiButton } from '../../src/ui/button.js';
import { createApp } from '../../src/app.js';
import { applyTheme } from '../../src/ui/theme.js';
import { injectStyles } from '../../src/ui/injectStyles.js';
import { flush, setupApp } from '../_helpers/dom.js';
import { parkPointer } from '../_helpers/pointer.js';

injectStyles(document);

describe('実ブラウザ: uiButton variant: "link" (v1 からの復活)', () => {
  it('background/border-color が透明になり、パディングも小さいテキスト風の見た目になる', async () => {
    const app = setupApp();
    // BUTTON_CSS の default variant は `--ric-color-control` 等の --ric-* 変数を参照する
    // (cssTemplates.ts の `ct`/`bd` トークン) ため、applyTheme していないと変数が未定義で
    // 対照実験側 (default ボタン) の背景も透明になってしまう — 2 件目のテストで実際に踏んだ。
    applyTheme(app, { theme: 'light' });
    // 何も操作していないときの見た目を見るので、前のテストが残したポインタを先に退避する
    // (ボタンを描く前に。描いた後だと hover の色が抜ける途中を測ってしまう)
    await parkPointer();
    createApp(app, {}, () => uiButton({ variant: 'link', children: ['詳細'] }));
    await flush();

    const link = app.querySelector('.ric-button--link') as HTMLElement;
    const computed = getComputedStyle(link);
    expect(link.matches(':hover'), '前提: ポインタが乗っていない (乗っていると hover の背景色になる)').toBe(false);
    expect(computed.backgroundColor).toBe('rgba(0, 0, 0, 0)');
    // border-color: transparent を指定している (border-width 自体は .ric-button の
    // 1px solid を継承するが、色が透明なら見た目には出ない)。
    expect(computed.borderColor).toBe('rgba(0, 0, 0, 0)');
    // height: auto の指定どおり、padding (1px 5px) が effective な computed 値になる
    // (getComputedStyle は 'height' 自体を resolved px 値で返すため 'auto' 文字列には
    // ならない — ここでは padding という「auto 化の効果が確実に出る」プロパティを見る)。
    expect(computed.paddingTop).toBe('1px');
    expect(computed.paddingLeft).toBe('5px');
  });

  it('通常の (default) ボタンは背景色を持ち、高さも link より大きい (対照実験)', async () => {
    const app = setupApp();
    applyTheme(app, { theme: 'light' });
    createApp(app, {}, () => {
      return {
        tag: 'div',
        children: [uiButton({ children: ['保存'] }), uiButton({ variant: 'link', children: ['詳細'] })],
      };
    });
    await flush();

    const defaultBtn = app.querySelector('.ric-button:not(.ric-button--link)') as HTMLElement;
    const linkBtn = app.querySelector('.ric-button--link') as HTMLElement;
    expect(getComputedStyle(defaultBtn).backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
    // link は height:auto + padding 1px なので、固定 --ric-control-h (既定 28px) の
    // default ボタンより明確に低くなる。
    expect(linkBtn.offsetHeight).toBeLessThan(defaultBtn.offsetHeight);
  });
});
