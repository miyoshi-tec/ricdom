// 実ブラウザ回帰テスト: createMdEditor (src/mdEditor/mdEditor.ts)。
//
// jsdom はレイアウトを持たない (scrollHeight/clientWidth/getComputedStyle の font metrics が
// 常に 0 or 既定値) ため、「ミラー <pre> の折返し・高さが本物の textarea と一致する」という
// この部品の核心の契約は実ブラウザでしか検証できない。

import { describe, expect, it, vi } from 'vitest';
import { userEvent } from '@vitest/browser/context';
import { createApp } from '../../src/app.js';
import { applyTheme } from '../../src/ui/theme.js';
import { injectStyles } from '../../src/ui/injectStyles.js';
import { createMdEditor } from '../../src/mdEditor/mdEditor.js';
import { flush, setupApp } from '../_helpers/dom.js';

injectStyles(document);

// 日本語 + ASCII + 絵文字 + 見出し/強調/フェンス/長い URL/末尾スペース/複数の末尾改行を
// 混ぜた、折返し・末尾空行の両方をまとめて確認できるドキュメント。
const MIXED_DOC = [
  '# 見出し タイトル',
  '',
  '**強調** テキストと日本語がまざった長い一文です。絵文字も 🎉🚀 混ぜます。',
  '',
  '```js',
  'const veryLongUnbreakableToken = "https://example.com/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";',
  '```',
  '',
  'trailing spaces line   ',
  '',
  '',
  '',
].join('\n');

// 「content 幅」= clientWidth から padding を引いたもの。clientWidth (IDL) は
// box-sizing の値に関わらず常に「content + padding」(border/scrollbar を含まない) を
// 返すので、この式は textarea 側 (content-box/border-box どちらでも) にも
// ミラー側 (常に border-box、後述の修正参照) にも同じ式で使える —
// box-sizing が違っても「実際に文字が収まる幅」を揃えて比較できる。
const contentWidth = (el: HTMLElement): number => {
  const cs = getComputedStyle(el);
  return el.clientWidth - parseFloat(cs.paddingLeft || '0') - parseFloat(cs.paddingRight || '0');
};

describe('実ブラウザ: createMdEditor', () => {
  // 縦スクロールバーが出る (= 折返し高さがビューポートより大きい) 状態で、ミラーの
  // scrollHeight/幅/content 幅が textarea と一致することを確認する。box-sizing が
  // content-box (既定、.ric-textarea の CSS は border-box を指定しない) と border-box
  // (consumer が自分の CSS で明示するケース) の両方で同じ結果になることを見る —
  // ミラー側が textarea の box-sizing をそのままコピーしていると、content-box のときだけ
  // ミラーの「見た目の幅」の解釈がずれて折返しが食い違う (実際に踏んだ回帰)。
  const runWrapParityCheck = async (boxSizing: 'content-box' | 'border-box'): Promise<void> => {
    const app = setupApp();
    app.style.width = '320px';
    // applyTheme を呼ばないと --ric-pad-x/--ric-color-border 等の CSS 変数が未定義のまま
    // (フォールバック値を持たない `var()` 参照) になり、padding/border が実質 0 として
    // computed される (invalid-at-computed-value-time → 初期値) — その状態では
    // box-sizing content-box/border-box の差がほぼ消えてしまい、この回帰を検知できない
    // (実際に検知漏れを踏んだ)。実運用と同じく必ずテーマを適用してから測る。
    applyTheme(app, { theme: 'light' });
    let md: ReturnType<typeof createMdEditor>;
    const handle = createApp('#app', {}, () =>
      md ? md({ value: MIXED_DOC, rows: 3, style: { boxSizing } }) : null,
    );
    md = handle.use(createMdEditor());
    await flush();
    await new Promise((r) => setTimeout(r, 250)); // rAF + 200ms バックストップの同期を待つ

    const textarea = app.querySelector('textarea') as HTMLTextAreaElement;
    const mirror = app.querySelector('pre.ric-md-editor__mirror') as HTMLElement;

    // rows:3 の小さい高さ + MIXED_DOC の長さで、必ず縦スクロールが発生する状態にする
    // (scrollHeight > clientHeight でなければ、この比較は「たまたま一致した」可能性を
    // 排除できない)。
    expect(textarea.scrollHeight).toBeGreaterThan(textarea.clientHeight);

    expect(mirror.scrollHeight).toBe(textarea.scrollHeight);

    const bw = parseFloat(getComputedStyle(textarea).borderLeftWidth || '0') + parseFloat(getComputedStyle(textarea).borderRightWidth || '0');
    expect(Math.abs(mirror.getBoundingClientRect().width - (textarea.clientWidth + bw))).toBeLessThan(0.5);

    // ミラーの「文字が実際に収まる幅」が textarea のそれと一致することを box-sizing に
    // 依存しない式 (contentWidth) で直接確認する。
    expect(Math.abs(contentWidth(textarea) - contentWidth(mirror))).toBeLessThan(0.5);

    const tRect = textarea.getBoundingClientRect();
    const mRect = mirror.getBoundingClientRect();
    expect(Math.abs(tRect.left - mRect.left)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(tRect.top - mRect.top)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(tRect.width - mRect.width)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(tRect.height - mRect.height)).toBeLessThanOrEqual(0.5);
  };

  it('折返し幅・高さ (scrollHeight / rect / content 幅) が本物の textarea と一致する (box-sizing: content-box、既定)', async () => {
    await runWrapParityCheck('content-box');
  });

  it('折返し幅・高さ (scrollHeight / rect / content 幅) が本物の textarea と一致する (box-sizing: border-box、consumer 指定)', async () => {
    await runWrapParityCheck('border-box');
  });

  it('入力するとミラーが同期的に追従し、折返し高さも一致し続ける', async () => {
    const app = setupApp();
    app.style.width = '320px';
    let value = '';
    let md: ReturnType<typeof createMdEditor>;
    const handle = createApp('#app', {}, () =>
      md
        ? md({
            value,
            oninput: (ev) => {
              value = (ev.target as HTMLTextAreaElement).value;
            },
          })
        : null,
    );
    md = handle.use(createMdEditor());
    await flush();
    await new Promise((r) => setTimeout(r, 250));

    const textarea = app.querySelector('textarea') as HTMLTextAreaElement;
    const mirror = app.querySelector('pre.ric-md-editor__mirror') as HTMLElement;

    await userEvent.fill(textarea, '# heading\n\n**bold text** and more content that should wrap across multiple lines in a 320px wide box.');
    const zeroWidth = String.fromCharCode(0x200b);
    expect((mirror.textContent ?? '').replace(new RegExp(zeroWidth, 'g'), '')).toBe(textarea.value);

    await new Promise((r) => setTimeout(r, 250));
    expect(mirror.scrollHeight).toBe(textarea.scrollHeight);
  });

  it('ラッパー幅を変えると (ResizeObserver 経由で) 折返し高さが再同期される', async () => {
    const app = setupApp();
    app.style.width = '320px';
    let md: ReturnType<typeof createMdEditor>;
    const handle = createApp('#app', {}, () => (md ? md({ value: MIXED_DOC }) : null));
    md = handle.use(createMdEditor());
    await flush();
    await new Promise((r) => setTimeout(r, 250));

    const textarea = app.querySelector('textarea') as HTMLTextAreaElement;
    const mirror = app.querySelector('pre.ric-md-editor__mirror') as HTMLElement;

    app.style.width = '520px';
    await new Promise((r) => setTimeout(r, 300)); // ResizeObserver コールバック + rAF/バックストップ

    expect(mirror.scrollHeight).toBe(textarea.scrollHeight);
    expect(Math.abs(textarea.getBoundingClientRect().width - mirror.getBoundingClientRect().width)).toBeLessThanOrEqual(0.5);
  });

  it('textarea.scrollTop を変えて scroll を発火すると、ミラーの scrollTop も同じ値になる', async () => {
    const app = setupApp();
    app.style.width = '320px';
    let md: ReturnType<typeof createMdEditor>;
    const bigValue = Array.from({ length: 60 }, (_, i) => `line ${i}`).join('\n');
    const handle = createApp('#app', {}, () => (md ? md({ value: bigValue, rows: 4 }) : null));
    md = handle.use(createMdEditor());
    await flush();
    await new Promise((r) => setTimeout(r, 250));

    const textarea = app.querySelector('textarea') as HTMLTextAreaElement;
    const mirror = app.querySelector('pre.ric-md-editor__mirror') as HTMLElement;

    textarea.scrollTop = 40;
    textarea.dispatchEvent(new Event('scroll'));

    expect(mirror.scrollTop).toBe(40);
  });

  it('テーマ切替で .ric-md-heading の computed color が変わる', async () => {
    const app = setupApp();
    let md: ReturnType<typeof createMdEditor>;
    const handle = createApp('#app', {}, () => (md ? md({ value: '# heading' }) : null));
    md = handle.use(createMdEditor());
    await flush();
    await new Promise((r) => setTimeout(r, 250));

    applyTheme(app, { theme: 'light' });
    const headingSpan = () => app.querySelector('.ric-md-heading, span.ric-md-heading') as HTMLElement | null;
    // 見出しのテキストは 2 トークン (marker '###' 相当の '#' + heading 本文) に分かれる —
    // ここでは heading クラスを持つ span を探す (marker と別クラス)。
    await new Promise((r) => setTimeout(r, 50));
    const spanLight = app.querySelector('pre.ric-md-editor__mirror .ric-md-heading') as HTMLElement;
    expect(spanLight).not.toBeNull();
    const colorLight = getComputedStyle(spanLight).color;

    applyTheme(app, { theme: 'dark' });
    await new Promise((r) => setTimeout(r, 50));
    const spanDark = app.querySelector('pre.ric-md-editor__mirror .ric-md-heading') as HTMLElement;
    const colorDark = getComputedStyle(spanDark).color;

    expect(colorLight).not.toBe(colorDark);
    void headingSpan;
  });

  it('highlight:"none" では .ric-md-editor が存在せず、textarea の文字色は透明ではない', async () => {
    const app = setupApp();
    let md: ReturnType<typeof createMdEditor>;
    const handle = createApp('#app', {}, () => (md ? md({ value: 'plain text', highlight: 'none' }) : null));
    md = handle.use(createMdEditor());
    await flush();

    expect(app.querySelector('.ric-md-editor')).toBeNull();
    const textarea = app.querySelector('textarea') as HTMLTextAreaElement;
    const color = getComputedStyle(textarea).color;
    expect(color).not.toBe('rgba(0, 0, 0, 0)');
    expect(color).not.toBe('transparent');
  });

  it('IME 変換中 (compositionstart→input→compositionend) でもミラーが正しく追従し、console error を出さない', async () => {
    const app = setupApp();
    let md: ReturnType<typeof createMdEditor>;
    const handle = createApp('#app', {}, () => (md ? md({ value: '' }) : null));
    md = handle.use(createMdEditor());
    await flush();
    await new Promise((r) => setTimeout(r, 100));

    const errorSpy = vi.spyOn(console, 'error');
    const textarea = app.querySelector('textarea') as HTMLTextAreaElement;
    const mirror = app.querySelector('pre.ric-md-editor__mirror') as HTMLElement;

    textarea.dispatchEvent(new CompositionEvent('compositionstart'));
    textarea.value = '漢字';
    textarea.dispatchEvent(new InputEvent('input', { isComposing: true }));
    textarea.dispatchEvent(new CompositionEvent('compositionend', { data: '漢字' }));

    await new Promise((r) => setTimeout(r, 50));
    const zeroWidth = String.fromCharCode(0x200b);
    expect((mirror.textContent ?? '').replace(new RegExp(zeroWidth, 'g'), '')).toBe('漢字');
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  // ブラウザは `oncompositionend` を IDL イベントハンドラ属性として持たない
  // (`'oncompositionend' in document.createElement('textarea')` は false) — ricdom の on*
  // props 機構 (`el.oncompositionend = fn`、コアの src/dom.ts) はこのイベントには効かない。
  // 上のテストは `input` イベント経由の同期だけで通ってしまうため、compositionend の
  // 配線 (addEventListener) 自体が抜けていても検知できない — ここでは `input` を一切
  // 発火せず compositionend だけで同期されることを見て、その配線だけを直接確認する。
  it('compositionend 単体 (input イベントを発火しない) でもミラーが同期する — addEventListener 配線の直接確認', async () => {
    const app = setupApp();
    let md: ReturnType<typeof createMdEditor>;
    const handle = createApp('#app', {}, () => (md ? md({ value: '' }) : null));
    md = handle.use(createMdEditor());
    await flush();
    await new Promise((r) => setTimeout(r, 250)); // addEventListener が張られる (初回 sync) のを待つ

    const textarea = app.querySelector('textarea') as HTMLTextAreaElement;
    const mirror = app.querySelector('pre.ric-md-editor__mirror') as HTMLElement;

    // input は発火しない — compositionend の addEventListener だけが同期経路になる
    textarea.value = '確定テキスト';
    textarea.dispatchEvent(new CompositionEvent('compositionend', { data: '確定テキスト' }));

    await new Promise((r) => setTimeout(r, 20));
    const zeroWidth2 = String.fromCharCode(0x200b);
    expect((mirror.textContent ?? '').replace(new RegExp(zeroWidth2, 'g'), '')).toBe('確定テキスト');
  });

  it('consumer が textarea に当てた font-family がミラーにもコピーされる', async () => {
    const app = setupApp();
    let md: ReturnType<typeof createMdEditor>;
    const handle = createApp('#app', {}, () => (md ? md({ value: 'x', style: { fontFamily: 'monospace' } }) : null));
    md = handle.use(createMdEditor());
    await flush();
    await new Promise((r) => setTimeout(r, 250));

    const textarea = app.querySelector('textarea') as HTMLTextAreaElement;
    const mirror = app.querySelector('pre.ric-md-editor__mirror') as HTMLElement;

    expect(getComputedStyle(mirror).fontFamily).toBe(getComputedStyle(textarea).fontFamily);
  });
});
