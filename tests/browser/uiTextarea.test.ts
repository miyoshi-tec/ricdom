// 実ブラウザ回帰テスト: uiTextarea の autoResize が実 layout で高さを変える (設計書 F)。
// jsdom は scrollHeight/getComputedStyle(line-height 等) の実レイアウト値を持たない
// (常に 0 を返す) ため、autoResize の実効果はここでのみ検証できる。

import { describe, expect, it } from 'vitest';
import { userEvent } from '@vitest/browser/context';
import { createApp } from '../../src/app.js';
import { injectStyles } from '../../src/ui/injectStyles.js';
import { uiTextarea } from '../../src/ui/textarea.js';
import { applyTheme } from '../../src/ui/theme.js';
import { flush, setupApp } from '../_helpers/dom.js';

injectStyles(document);

describe('実ブラウザ: uiTextarea の autoResize', () => {
  it('内容量が増えると実際の高さ (getBoundingClientRect) が大きくなる', async () => {
    const app = setupApp();
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

    const textarea = app.querySelector('textarea')!;
    const initialHeight = textarea.getBoundingClientRect().height;

    // 実際にユーザー入力で複数行に増やす (autoResize の oninput ハンドラが実測 DOM に対して走る)
    await userEvent.fill(textarea, 'line1\nline2\nline3\nline4\nline5');
    await flush();

    const grownHeight = textarea.getBoundingClientRect().height;
    expect(grownHeight).toBeGreaterThan(initialHeight);
  });

  it('maxRows を超える内容では overflowY: auto になる (無制限には伸びない)', async () => {
    const app = setupApp();
    let value = '';
    createApp('#app', {}, () =>
      uiTextarea({
        value,
        autoResize: { minRows: 1, maxRows: 2 },
        oninput: (ev) => {
          value = (ev.target as HTMLTextAreaElement).value;
        },
      }),
    );
    await flush();

    const textarea = app.querySelector('textarea')!;
    await userEvent.fill(textarea, Array.from({ length: 20 }, (_, i) => `line${i}`).join('\n'));
    await flush();

    expect(getComputedStyle(textarea).overflowY).toBe('auto');
    expect(textarea.scrollHeight, '中身は入りきらずスクロールする').toBeGreaterThan(textarea.clientHeight);
  });
});

// 2.0.0-alpha.36: サンプル 15 (AI チャット) を書く過程で見つかった。autoResize は input イベントの
// ときしか高さを計算し直さなかったので、
//   - 複数行のメッセージを送信して欄を空にしても、高さが戻らない (次に 1 文字打つまで)
//   - 長い初期値や、状態から入れた値では、欄が伸びない
// 直した後は、CSS の `field-sizing: content` で「中身の大きさ = 欄の大きさ」にする。値がどこから
// 変わっても (入力・状態・初期値) 同じ render で追従する。対応していないブラウザでは、従来どおり
// input イベントで計算する。
describe('実ブラウザ: uiTextarea の autoResize は、状態から値が変わっても追従する (2.0.0-alpha.36)', () => {
  const LINES = (n: number): string => Array.from({ length: n }, (_, i) => `line ${i + 1}`).join('\n');

  const mount = (initial: string, autoResize: { minRows?: number; maxRows?: number }) => {
    const app = setupApp();
    applyTheme(app, { theme: 'light' }); // 余白は --ric-pad-y なので、テーマが無いと 0 になる
    app.style.width = '320px';
    const handle = createApp('#app', { text: initial }, (st) =>
      uiTextarea({
        value: st.text,
        autoResize,
        oninput: (ev) => {
          st.text = (ev.target as HTMLTextAreaElement).value;
        },
      }),
    );
    handle.renderNow();
    const ta = app.querySelector('textarea') as HTMLTextAreaElement;
    // 外形の高さの期待値: 行数 × 行の高さ + 上下の余白 + 上下の枠
    const expected = (rows: number): number => {
      const cs = getComputedStyle(ta);
      const lh = parseFloat(cs.lineHeight);
      expect(lh, '前提: 行の高さが数値で決まっている').toBeGreaterThan(0);
      expect(parseFloat(cs.paddingTop), '前提: テーマの余白が当たっている').toBeGreaterThan(0);
      return rows * lh + parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) + parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
    };
    const height = (): number => ta.getBoundingClientRect().height;
    return { handle, ta, expected, height };
  };

  it('前提: この環境は field-sizing: content に対応している (対応していなければ以下は従来の動きの確認にならない)', () => {
    expect(CSS.supports('field-sizing', 'content')).toBe(true);
  });

  it('長い初期値は、打たなくても中身の高さで描かれる', () => {
    const { ta, expected, height, handle } = mount(LINES(4), { minRows: 1, maxRows: 8 });
    expect(height()).toBeCloseTo(expected(4), 0);
    expect(ta.scrollHeight, 'スクロールは要らない').toBeLessThanOrEqual(ta.clientHeight);
    handle.unmount();
  });

  it('状態から値を空にすると、高さが minRows に戻る (チャットの送信後の欄)', async () => {
    const { ta, expected, height, handle } = mount('', { minRows: 1, maxRows: 6 });
    const one = height();
    expect(one).toBeCloseTo(expected(1), 0);

    await userEvent.fill(ta, LINES(3));
    await flush();
    expect(height(), '3 行ぶんに伸びる').toBeCloseTo(expected(3), 0);

    ta.blur(); // フォーカス中は編集中ガードで value が入れ直されないので、送信ボタンを押した状況にする
    handle.text = '';
    handle.renderNow();
    expect(ta.value).toBe('');
    expect(height(), '空にしたら 1 行ぶんに戻る').toBeCloseTo(one, 0);
    handle.unmount();
  });

  it('状態から値を長くすると伸び、maxRows で止まって中がスクロールする', () => {
    const { ta, expected, height, handle } = mount('', { minRows: 2, maxRows: 5 });
    expect(height(), 'minRows = 2').toBeCloseTo(expected(2), 0);

    handle.text = LINES(4);
    handle.renderNow();
    expect(height()).toBeCloseTo(expected(4), 0);

    handle.text = LINES(30);
    handle.renderNow();
    expect(height(), 'maxRows = 5 で止まる').toBeCloseTo(expected(5), 0);
    expect(ta.scrollHeight).toBeGreaterThan(ta.clientHeight);
    expect(getComputedStyle(ta).overflowY).toBe('auto');
    handle.unmount();
  });

  it('入力でも同じ高さになる (状態からの変化と、打ったときとで食い違わない)', async () => {
    const { ta, expected, height, handle } = mount('', { minRows: 1, maxRows: 8 });
    await userEvent.fill(ta, LINES(5));
    await flush();
    expect(height()).toBeCloseTo(expected(5), 0);
    await userEvent.fill(ta, 'x');
    await flush();
    expect(height()).toBeCloseTo(expected(1), 0);
    handle.unmount();
  });

  it('autoResize の欄には手動リサイズのつまみを出さない / autoResize なしの欄は従来どおり縦に伸ばせる', () => {
    const { ta, handle } = mount('', { minRows: 1 });
    expect(getComputedStyle(ta).resize).toBe('none');
    handle.unmount();

    const app = setupApp();
    createApp('#app', {}, () => uiTextarea({ value: '', rows: 3 }));
    expect(getComputedStyle(app.querySelector('textarea')!).resize).toBe('vertical');
  });
});
