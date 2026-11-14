// 実ブラウザ契約テスト: ricdom-ui の部品は、ブラウザ既定のスタイル (UA スタイルシート) に
// 見た目を預けない (2.0.0-alpha.32、UA 既定依存の一括監査)。
//
// alpha.24 (書体) / 25 (box-sizing) / 29 (書体の取りこぼし) / 30 (select の折り返し) /
// 31 (max-height) は、どれも「UA 既定に頼っていた箇所」が利用側の報告で 1 つずつ見つかった。
// alpha.32 では全部品を描いて、各要素の computed style を「同じタグの素の要素」「中立の div」と
// 機械的に比べ、UA 既定がそのまま出ている箇所を洗い出した (設計書 §51)。このファイルは、
// そこで直した項目を 1 つずつ固定する。書体まわりの全数走査は uiControlFont.test.ts にある。
//
// jsdom は UA スタイルシートもレイアウトも持たないので、実ブラウザでしか検証できない。

import { describe, expect, it } from 'vitest';
import { userEvent } from '@vitest/browser/context';
import { createApp } from '../../src/app.js';
import { injectStyles } from '../../src/ui/injectStyles.js';
import { applyTheme } from '../../src/ui/theme.js';
import { uiButton } from '../../src/ui/button.js';
import { uiCodePre } from '../../src/ui/codePre.js';
import { uiColor } from '../../src/ui/color.js';
import { uiMdPre } from '../../src/ui/mdPre.js';
import { uiRange } from '../../src/ui/range.js';
import { createDialog } from '../../src/ui/dialog.js';
import { createDropdown } from '../../src/ui/dropdown.js';
import { createToast } from '../../src/ui/toast.js';
import { createTooltip } from '../../src/ui/tooltip.js';
import { dialogOpened, flush, settled, setupApp, until } from '../_helpers/dom.js';

injectStyles(document);

// 寸法は --ric-* 変数で書かれているので、テーマを当てないと 0 になり検証にならない
const themedApp = (): HTMLDivElement => {
  const app = setupApp();
  applyTheme(app, { theme: 'light' });
  return app;
};

const px = (el: Element, prop: string): number => parseFloat(getComputedStyle(el).getPropertyValue(prop));

describe('実ブラウザ: ブラウザ既定のスタイルに見た目を預けない (2.0.0-alpha.32)', () => {
  it('コード表示の中の <code> は、外側の <pre> に指定したフォントで描かれ、アプリの上書きも届く', async () => {
    const app = themedApp();
    const FENCE = ['```js', 'const a = 1;', '```'].join('\n');
    createApp('#app', {}, () => ({ tag: 'div', children: [uiCodePre({ obj: { a: 1 } }), uiMdPre({ children: [FENCE] })] }));
    await flush();

    // UA は <code> に font-family: monospace を当てる。部品が何もしないと、<pre> に書いた
    // フォントの並びではなく UA の monospace で描かれ、アプリが <pre> のクラスで上書きしても届かない
    for (const sel of ['.ric-code-pre', '.ric-md-pre__fence']) {
      const pre = app.querySelector(sel) as HTMLElement;
      const code = pre.querySelector('code') as HTMLElement;
      expect(code, `${sel} の中に <code> がある`).not.toBeNull();
      expect(getComputedStyle(pre).fontFamily, `前提: ${sel} はフォントの並びを指定している`).toContain('Consolas');
      expect(getComputedStyle(code).fontFamily, `${sel} > code`).toBe(getComputedStyle(pre).fontFamily);
    }

    const override = document.createElement('style');
    override.textContent = '.ric-code-pre { font-family: Georgia; }';
    document.head.appendChild(override);
    try {
      expect(getComputedStyle(app.querySelector('.ric-code-pre > code')!).fontFamily).toBe('Georgia');
    } finally {
      override.remove();
    }
  });

  it('スライダー (range) の周りに UA の余白 2px を残さない', async () => {
    const app = themedApp();
    createApp('#app', {}, () => ({ tag: 'div', children: [uiRange({ value: 3 }), uiColor({ value: 'rgba(1, 2, 3, 0.5)' })] }));
    await flush();
    for (const sel of ['.ric-range input[type="range"]', '.ric-color__alpha']) {
      const el = app.querySelector(sel)!;
      expect(el, `${sel} が描画されている`).not.toBeNull();
      for (const side of ['top', 'right', 'bottom', 'left']) expect(px(el, `margin-${side}`), `${sel} margin-${side}`).toBe(0);
    }
  });

  it('大きさを固定した小さなボタン (✕・アイコンのトリガー) は、内側の余白を UA に任せない', async () => {
    const app = themedApp();
    let dlg: ReturnType<typeof createDialog>;
    let toast: ReturnType<typeof createToast>;
    let dd: ReturnType<typeof createDropdown>;
    const handle = createApp('#app', {}, () => {
      if (!dlg) return null;
      toast();
      return { tag: 'div', children: [dlg({ title: 'T', children: ['body'] }), dd({ children: [{ tag: 'div', children: ['x'] }] })] };
    });
    dlg = handle.use(createDialog());
    toast = handle.use(createToast());
    dd = handle.use(createDropdown());
    handle.renderNow();
    dlg.open();
    toast.show('toast');
    await dialogOpened();

    for (const sel of ['.ric-dialog__close', '.ric-toast__close', '.ric-dropdown__trigger']) {
      const el = app.querySelector(sel)!;
      expect(el, `${sel} が描画されている`).not.toBeNull();
      for (const side of ['top', 'right', 'bottom', 'left']) expect(px(el, `padding-${side}`), `${sel} padding-${side}`).toBe(0);
    }
  });

  // 監査の途中で見つけた別件 (v1 から同じ指定): `white-space: nowrap` + `max-width: 200px` なので、
  // 200px を超える文は枠の外へはみ出し、ページの上に明るい文字で重なって読めなかった。
  it('ツールチップの長い文は最大幅で折り返して枠に収まり、短い文は 1 行のまま', async () => {
    const app = themedApp();
    let tipLong: ReturnType<typeof createTooltip>;
    let tipShort: ReturnType<typeof createTooltip>;
    const handle = createApp('#app', {}, () =>
      tipLong
        ? {
            tag: 'div',
            style: { padding: '120px 260px' },
            children: [
              tipLong({ content: 'とても長いツールチップの説明文です。200px を超える長さがあります。', children: [uiButton({ id: 'long', children: ['long'] })] }),
              tipShort({ content: '短い説明', children: [uiButton({ id: 'short', children: ['short'] })] }),
            ],
          }
        : null,
    );
    tipLong = handle.use(createTooltip());
    tipShort = handle.use(createTooltip());
    handle.renderNow();

    await userEvent.hover(app.querySelector('#short')!);
    const short = await settled(() => document.querySelector('.ric-tooltip__popup'));
    const oneLine = short.getBoundingClientRect().height;
    expect(short.getBoundingClientRect().width, '短い文は中身の幅 (200px まで広がらない)').toBeLessThan(150);
    expect(short.scrollWidth).toBeLessThanOrEqual(short.clientWidth);
    await userEvent.unhover(app.querySelector('#short')!);
    await until(() => document.querySelector('.ric-tooltip__popup') === null, '短いツールチップが消える');

    await userEvent.hover(app.querySelector('#long')!);
    const long = await settled(() => document.querySelector('.ric-tooltip__popup'));
    expect(long.getBoundingClientRect().width, '最大幅は外形で 200px').toBeLessThanOrEqual(200.5);
    expect(long.scrollWidth, '文字が枠の外にはみ出さない').toBeLessThanOrEqual(long.clientWidth);
    expect(long.getBoundingClientRect().height, '折り返して 2 行以上になる').toBeGreaterThan(oneLine * 1.5);
    // 上に出るツールチップは下端が基準なので、行が増えてもトリガーに重ならない。
    // 包む側の <span> が inline だと基準が「行の箱」になり、ボタンに 2px 重なっていた
    // (v1 にあった .ric-tooltip { display: inline-flex } の移植漏れ)。ボタンの上端から 8px 空く
    const gap = app.querySelector('#long')!.getBoundingClientRect().top - long.getBoundingClientRect().bottom;
    expect(gap, 'ボタンの上端とツールチップの下端の間隔').toBeCloseTo(8, 0);
  });

  it('幅や高さの指定は外形の大きさを指す: dialog の width、uiCodePre の maxHeight、toast と tooltip の最大幅', async () => {
    const app = themedApp();
    let dlg: ReturnType<typeof createDialog>;
    let toast: ReturnType<typeof createToast>;
    let tip: ReturnType<typeof createTooltip>;
    const LONG = 'とても長いメッセージ '.repeat(12);
    const handle = createApp('#app', {}, () => {
      if (!dlg) return null;
      toast();
      return {
        tag: 'div',
        children: [
          uiCodePre({ children: [Array.from({ length: 40 }, (_, i) => `line ${i}`).join('\n')], lang: 'text', maxHeight: '100px' }),
          tip({ content: LONG, children: [uiButton({ id: 'tip-target', children: ['hover'] })] }),
          dlg({ title: 'T', width: 300, children: ['body'] }),
        ],
      };
    });
    dlg = handle.use(createDialog());
    toast = handle.use(createToast());
    tip = handle.use(createTooltip());
    handle.renderNow();

    // uiCodePre: maxHeight は padding と枠線を含む外形の高さ
    const pre = app.querySelector('.ric-code-pre') as HTMLElement;
    expect(px(pre, 'padding-top') + px(pre, 'border-top-width'), '前提: padding か枠線がある').toBeGreaterThan(0);
    expect(pre.scrollHeight, '前提: 中身は 100px より高い').toBeGreaterThan(100);
    expect(pre.getBoundingClientRect().height).toBeCloseTo(100, 0);

    // tooltip: max-width 200px は外形
    await userEvent.hover(app.querySelector('#tip-target')!);
    const popup = await settled(() => document.querySelector('.ric-tooltip__popup'));
    expect(px(popup, 'padding-left'), '前提: padding がある').toBeGreaterThan(0);
    expect(popup.getBoundingClientRect().width).toBeLessThanOrEqual(200.5);
    await userEvent.unhover(app.querySelector('#tip-target')!);

    // toast: max-width 360px は外形
    toast.show(LONG);
    await until(() => document.querySelector('.ric-toast__item') !== null, 'toast が出る');
    const item = await settled(() => document.querySelector('.ric-toast__item'));
    expect(px(item, 'padding-left') + px(item, 'border-left-width'), '前提: padding か枠線がある').toBeGreaterThan(0);
    expect(item.getBoundingClientRect().width).toBeLessThanOrEqual(360.5);

    // dialog: width: 300 は枠線を含む外形の幅
    dlg.open();
    const card = await dialogOpened();
    expect(px(card, 'border-left-width'), '前提: 枠線がある').toBeGreaterThan(0);
    expect(card.getBoundingClientRect().width).toBeCloseTo(300, 0);
  });
});
