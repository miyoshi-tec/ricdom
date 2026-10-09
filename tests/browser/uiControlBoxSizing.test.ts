// 実ブラウザ契約テスト: `width: 100%` を持つ部品は border-box で、親の幅からはみ出さない
// (SPEC §10.1 FACT、2.0.0-alpha.25、オーナー報告 = 03-forms で textarea が枠を 29px はみ出した)。
//
// 原因: ブラウザの UA スタイルシートは <input type=text> / <textarea> を content-box、<select> /
// <button> を border-box にする。ricdom-ui は `width: 100%` + padding + 1px border を持つのに
// box-sizing を宣言していなかったため、input / textarea だけ「100% + padding + border」に
// なっていた (input は flex 行で縮むので目立たず、ブロック配置の textarea で露出)。
// v1 RicUI は `.ric-page *, *::before, *::after { box-sizing: inherit }` + `.ric-page
// { box-sizing: border-box }` の全称リセットで隠れていた穴で、v2 で page を廃止したときに
// 宣言が消えた。v2 は全称リセットを持ち込まず (ホストページの要素に触らない)、各部品の
// 規則に box-sizing を明示する。
//
// jsdom にはレイアウトが無い (幅は常に 0) ため、実ブラウザでしか検証できない。

import { describe, expect, it } from 'vitest';
import { userEvent } from '@vitest/browser/context';
import { createApp } from '../../src/app.js';
import { injectStyles } from '../../src/ui/injectStyles.js';
import { applyTheme } from '../../src/ui/theme.js';
import { uiButton } from '../../src/ui/button.js';
import { uiInput } from '../../src/ui/input.js';
import { uiSelect } from '../../src/ui/select.js';
import { uiTextarea } from '../../src/ui/textarea.js';
import { flush, setupApp } from '../_helpers/dom.js';

injectStyles(document);

const CONTAINER_W = 300;

// padding / border は --ric-* 変数で書かれているので、テーマを当てないと 0 になり検証にならない
const themedApp = (): HTMLDivElement => {
  const app = setupApp();
  applyTheme(app, { theme: 'light' });
  return app;
};

describe('実ブラウザ: width:100% の部品は border-box で親からはみ出さない (2.0.0-alpha.25)', () => {
  it('ブロック配置の input / textarea / select が親の content 幅ちょうどに収まる', async () => {
    const app = themedApp();
    app.style.width = `${CONTAINER_W}px`;
    app.style.padding = '0';
    app.style.border = '0';
    createApp('#app', {}, () => ({
      tag: 'div',
      children: [
        uiInput({ value: 'Alex' }),
        uiTextarea({ value: 'Notes can span\nseveral lines.' }),
        uiSelect({ value: 'a', options: ['a', 'b'] }),
      ],
    }));
    await flush();

    for (const sel of ['input.ric-input', 'textarea.ric-textarea', 'select.ric-select']) {
      const el = app.querySelector(sel) as HTMLElement;
      expect(getComputedStyle(el).boxSizing, `${sel} box-sizing`).toBe('border-box');
      expect(el.getBoundingClientRect().width, `${sel} の外形幅`).toBeCloseTo(CONTAINER_W, 0);
    }
  });

  it('UA 既定に依存せず、ボタン系 (button / popup item / accordion・tweak の見出し) も border-box を明示している', async () => {
    const app = themedApp();
    app.style.width = `${CONTAINER_W}px`;
    // アプリ側が `button { box-sizing: content-box }` のような逆向きのリセットを持っていても崩れないこと
    const reset = document.createElement('style');
    reset.textContent = 'button, div { box-sizing: content-box; }';
    document.head.appendChild(reset);
    try {
      createApp('#app', {}, () => ({
        tag: 'div',
        children: [
          uiButton({ children: ['OK'] }),
          // popup の項目は consumer が渡す任意要素 (div のこともある) に class が付く
          { tag: 'div', class: 'ric-popup__item', children: ['item'] },
          { tag: 'button', class: 'ric-accordion__header', children: ['A'] },
          { tag: 'button', class: 'ric-tweak-folder__header', children: ['F'] },
        ],
      }));
      await flush();

      for (const sel of ['.ric-button', '.ric-popup__item', '.ric-accordion__header', '.ric-tweak-folder__header']) {
        const el = app.querySelector(sel) as HTMLElement;
        expect(getComputedStyle(el).boxSizing, `${sel} box-sizing`).toBe('border-box');
        expect(el.getBoundingClientRect().width, `${sel} の外形幅`).toBeLessThanOrEqual(CONTAINER_W + 0.01);
      }
    } finally {
      reset.remove();
    }
  });

  it('autoResize の高さは「行数 × line-height + 上下 padding + 上下 border」ちょうど (余白も切れも無い)', async () => {
    const app = themedApp();
    app.style.width = `${CONTAINER_W}px`;
    let value = '';
    createApp('#app', {}, () =>
      uiTextarea({
        value,
        autoResize: { minRows: 1, maxRows: 10 },
        oninput: (ev) => {
          value = (ev.target as HTMLTextAreaElement).value;
        },
      }),
    );
    await flush();

    const ta = app.querySelector('textarea') as HTMLTextAreaElement;
    await userEvent.fill(ta, 'a\nb\nc');
    await flush();

    const cs = getComputedStyle(ta);
    const lineH = parseFloat(cs.lineHeight);
    const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    const borderY = parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
    expect(Number.isFinite(lineH)).toBe(true); // line-height が normal だと計算が成り立たない前提の確認
    expect(padY).toBeGreaterThan(0); // 前提: テーマの padding / border が効いている
    expect(borderY).toBeGreaterThan(0);
    // 外形 = 3 行 + padding + border。alpha.24 以前 (content-box で height = scrollHeight) は
    // padding 分だけ高く、border-box にして border を足し忘れると 2px 切れる — どちらも検出する
    expect(ta.getBoundingClientRect().height).toBeCloseTo(3 * lineH + padY + borderY, 0);
    // 中身が見切れていない (スクロールせずに全行が見える)
    expect(ta.scrollHeight).toBeLessThanOrEqual(ta.clientHeight + 1);
  });

  it('アプリが .ric-textarea を content-box に戻しても autoResize の外形は同じ (box-sizing を見て換算する)', async () => {
    const app = themedApp();
    app.style.width = `${CONTAINER_W}px`;
    const override = document.createElement('style');
    override.textContent = '.ric-textarea { box-sizing: content-box; }';
    document.head.appendChild(override);
    try {
      let value = '';
      createApp('#app', {}, () =>
        uiTextarea({
          value,
          autoResize: { minRows: 1, maxRows: 10 },
          oninput: (ev) => {
            value = (ev.target as HTMLTextAreaElement).value;
          },
        }),
      );
      await flush();

      const ta = app.querySelector('textarea') as HTMLTextAreaElement;
      await userEvent.fill(ta, 'a\nb\nc');
      await flush();

      const cs = getComputedStyle(ta);
      expect(cs.boxSizing).toBe('content-box');
      const lineH = parseFloat(cs.lineHeight);
      const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
      const borderY = parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
      expect(ta.getBoundingClientRect().height).toBeCloseTo(3 * lineH + padY + borderY, 0);
    } finally {
      override.remove();
    }
  });
});
