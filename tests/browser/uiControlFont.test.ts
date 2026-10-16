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
import { createAccordion } from '../../src/ui/accordion.js';
import { createDialog } from '../../src/ui/dialog.js';
import { createDropdown } from '../../src/ui/dropdown.js';
import { createPopup } from '../../src/ui/popup.js';
import { createSplitter } from '../../src/ui/splitter.js';
import { createTabs } from '../../src/ui/tabs.js';
import { createToast } from '../../src/ui/toast.js';
import { createTweakPanel } from '../../src/ui/tweakPanel.js';
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

  // ギア軽量化デモの報告 (2.0.0-alpha.29): alpha.24 は「4 部品」だけを見ていたため、<button> で
  // 描く見出し・トリガー・閉じるボタン (tweak フォルダ / accordion / tabs / dropdown / splitter /
  // dialog・toast の ✕) が UA 既定の Arial のまま残っていた。部品の一覧を手で持つと次の部品で
  // また漏れるので、「ricdom-ui が描いたフォーム要素はすべて」をページ全体の走査で確かめる。
  it('ricdom-ui が描く文字入りのフォーム要素は、部品を問わずすべてページの書体になる (portal 内も含む)', async () => {
    const app = setupApp();
    const prevBodyFont = document.body.style.fontFamily;
    // 書体は body に立てる (ギア軽量化デモの再現手順と同じ)。portal はマウント要素の中に入るので、
    // dialog / toast の ✕ もここから継承する
    document.body.style.fontFamily = PAGE_FONT;
    try {
      let acc: ReturnType<typeof createAccordion>;
      let tabs: ReturnType<typeof createTabs>;
      let ddLabel: ReturnType<typeof createDropdown>;
      let ddIcon: ReturnType<typeof createDropdown>;
      let split: ReturnType<typeof createSplitter>;
      let dlg: ReturnType<typeof createDialog>;
      let toast: ReturnType<typeof createToast>;
      let tweak: ReturnType<typeof createTweakPanel>;
      let pop: ReturnType<typeof createPopup>;
      const handle = createApp('#app', {}, () => {
        if (!acc) return null;
        toast();
        return {
          tag: 'div',
          children: [
            acc({ items: [{ id: 'a', title: '見出し Header', children: ['a'] }] }),
            tabs({ items: [{ key: 'a', label: 'タブ Tab', children: ['a'] }] }),
            ddLabel({ label: '選択 Choose', children: [{ tag: 'div', children: ['x'] }] }),
            ddIcon({ children: [{ tag: 'div', children: ['x'] }] }),
            split({ side: [{ tag: 'div', children: ['side'] }], main: [{ tag: 'div', children: ['main'] }] }),
            dlg({ triggerChildren: ['開く Open'], title: 't', children: ['本文 Body'] }),
            tweak({ data: { gear: { teeth: 20 } }, keys: { gear: { summary: '要約 Summary' } } }),
            pop({ trigger: { children: ['メニュー Menu'] }, children: [uiButton({ children: ['項目 Item'] })] }),
          ],
        };
      });
      acc = handle.use(createAccordion());
      tabs = handle.use(createTabs());
      ddLabel = handle.use(createDropdown());
      ddIcon = handle.use(createDropdown());
      split = handle.use(createSplitter());
      dlg = handle.use(createDialog());
      toast = handle.use(createToast());
      tweak = handle.use(createTweakPanel());
      pop = handle.use(createPopup());
      handle.renderNow();
      dlg.open();
      toast.show('保存しました Saved');
      await flush();

      // 前提: 見落としやすい部品が実際に描かれている (描かれていなければ走査が空振りする)
      for (const sel of [
        '.ric-accordion__header', '.ric-tabs__tab', '.ric-dropdown__trigger--label', '.ric-dropdown__trigger',
        '.ric-splitter__collapse-btn', '.ric-dialog__close', '.ric-toast__close',
        '.ric-tweak-folder__header', '.ric-tweak-folder__label', '.ric-tweak-folder__summary',
      ]) {
        expect(document.querySelector(sel), `${sel} が描画されている`).not.toBeNull();
      }

      // 字形を描かない input (range / checkbox / radio / color) は対象外
      const formEls = Array.from(
        document.querySelectorAll<HTMLElement>(
          'button, select, textarea, input:not([type="range"]):not([type="checkbox"]):not([type="radio"]):not([type="color"])',
        ),
      ).filter((el) => !el.closest('[data-vitest], #vitest-tester') && (app.contains(el) || el.closest('[data-ricdom-role="portal"]')));
      expect(formEls.length).toBeGreaterThan(10);
      const wrong = [
        ...formEls,
        ...document.querySelectorAll<HTMLElement>('.ric-tweak-folder__label, .ric-tweak-folder__summary'),
      ]
        .filter((el) => getComputedStyle(el).fontFamily !== PAGE_FONT)
        .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).trim().split(/\s+/)[0]} = ${getComputedStyle(el).fontFamily}`);
      expect(wrong).toEqual([]);
    } finally {
      document.body.style.fontFamily = prevBodyFont;
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
