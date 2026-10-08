// 実ブラウザ契約テスト: すべてのフォームコントロールがページの書体 (font-family) を継承する
// (SPEC §10.1 FACT、2.0.0-alpha.24、オーナー決定)。
//
// 背景: ブラウザの UA スタイルシートは <button> / <input> / <select> / <textarea> に独自の
// font を与える (Windows の Chromium では Arial 13.33px)。これは 1990 年代の OS ネイティブ
// 部品の名残で、normalize.css 系は一律 `font-family: inherit` で潰している。ricdom-ui は
// alpha.23 まで textarea / select だけ `inherit` で、button / input が UA 既定のまま残って
// いた (v1 RicUI も同じ構成) — 同じフォームの中でボタンと入力欄の英数字だけ Arial になる。
// font-size は 4 部品とも `1em` で周囲に従っていたので、書体だけ 2 部品が漏れていた形。
//
// jsdom は UA スタイルシートを持たず getComputedStyle(...).fontFamily が常に '' になるため、
// 「UA 既定に負けていない」ことは実ブラウザでしか検証できない。

import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { injectStyles } from '../../src/ui/injectStyles.js';
import { uiButton } from '../../src/ui/button.js';
import { uiCheckbox } from '../../src/ui/checkbox.js';
import { uiInput } from '../../src/ui/input.js';
import { uiRange } from '../../src/ui/range.js';
import { uiSelect } from '../../src/ui/select.js';
import { uiTextarea } from '../../src/ui/textarea.js';
import { flush, setupApp } from '../_helpers/dom.js';

injectStyles(document);

// UA 既定 (Arial / system-ui 等) と絶対に一致しない書体名をページ側に立てる
const PAGE_FONT = '"Courier New"';

describe('実ブラウザ: フォームコントロールはページの書体を継承する (2.0.0-alpha.24)', () => {
  it('文字を描く 4 部品 button / input / textarea / select の computed font-family が親と同じになる', async () => {
    const app = setupApp();
    app.style.fontFamily = PAGE_FONT;
    createApp('#app', {}, () => ({
      tag: 'div',
      children: [
        uiButton({ children: ['保存する Save'] }),
        uiInput({ value: '入力 Input' }),
        uiTextarea({ value: 'メモ Textarea' }),
        uiSelect({ value: 'a', options: ['a', 'b'] }),
        // range / checkbox の <input> 自体は字形を描かない (値表示やラベルは span/label 側) ので
        // 対象外。ラベル側が親の書体を継承していることだけ見る
        uiRange({ value: 40 }),
        uiCheckbox({ checked: true, children: ['同意 Agree'] }),
      ],
    }));
    await flush();

    const expected = getComputedStyle(app).fontFamily;
    expect(expected).toBe(PAGE_FONT); // 前提確認: 親には指定どおりの書体が立っている

    const controls: Array<[string, Element | null]> = [
      ['button', app.querySelector('button.ric-button')],
      ['input', app.querySelector('input.ric-input')],
      ['textarea', app.querySelector('textarea.ric-textarea')],
      ['select', app.querySelector('select.ric-select')],
      ['checkbox label', app.querySelector('label.ric-checkbox')],
      ['range value', app.querySelector('.ric-range__value')?.parentElement ?? null],
    ];
    for (const [name, el] of controls) {
      expect(el, `${name} が描画されている`).not.toBeNull();
      expect(getComputedStyle(el!).fontFamily, `${name} の font-family`).toBe(expected);
    }
  });

  it('font-size も 1em で周囲に従う (書体と同じ扱いであることの対照)', async () => {
    const app = setupApp();
    app.style.fontSize = '19px'; // UA 既定 (13.33px) とも density 既定とも一致しない値
    createApp('#app', {}, () => ({
      tag: 'div',
      children: [uiButton({ children: ['OK'] }), uiInput({ value: 'x' }), uiTextarea({ value: 'y' }), uiSelect({ value: 'a', options: ['a'] })],
    }));
    await flush();

    for (const sel of ['button.ric-button', 'input.ric-input', 'textarea.ric-textarea', 'select.ric-select']) {
      expect(getComputedStyle(app.querySelector(sel)!).fontSize, sel).toBe('19px');
    }
  });

  it('アプリ側の 1 行で部品だけ別書体にできる (inherit は既定であって強制ではない)', async () => {
    const app = setupApp();
    app.style.fontFamily = PAGE_FONT;
    const override = document.createElement('style');
    override.textContent = '.ric-button { font-family: Georgia; }';
    document.head.appendChild(override);
    try {
      createApp('#app', {}, () => uiButton({ children: ['OK'] }));
      await flush();
      expect(getComputedStyle(app.querySelector('button')!).fontFamily).toBe('Georgia');
    } finally {
      override.remove();
    }
  });
});
