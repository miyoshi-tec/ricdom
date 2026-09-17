// createMdEditor (src/mdEditor/mdEditor.ts、設計書 §3.4 部品契約)
//
// jsdom (レイアウト無し) での確認範囲: use() 忘れ検知、DOM 構造/role、highlight:'none' の
// identity フォールバック、ref/rest スプレッドの透過、input イベントでミラーが同期的に
// (await 無しで) 更新されること、閾値超えフォールバック、dispose() が例外を投げないこと。
// 実レイアウト (折返し幅が textarea と一致すること等) は tests/browser/uiMdEditor.test.ts
// (実ブラウザ) で検証する。

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { createMdEditor } from '../../src/mdEditor/mdEditor.js';
import { uiTextarea } from '../../src/ui/textarea.js';
import { flush, setupApp } from '../_helpers/dom.js';

describe('createMdEditor: use() 忘れ検知 (設計書 A)', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => errorSpy.mockRestore());

  it('use() されていないインスタンスを直接呼ぶと console.error を出し null を返す', () => {
    const md = createMdEditor();
    expect(md({})).toBeNull();
    expect(errorSpy).toHaveBeenCalled();
  });
});

describe('createMdEditor: highlight:"none" は uiTextarea と見分けが付かない', () => {
  it('uiTextarea(rest) と deep-equal なノードを返す (ラッパーもミラーも無い)', async () => {
    const app = setupApp();
    let md: ReturnType<typeof createMdEditor>;
    const props = { value: 'hello', placeholder: 'memo', class: 'extra', highlight: 'none' as const };
    const handle = createApp('#app', {}, () => (md ? md(props) : null));
    md = handle.use(createMdEditor());
    await flush();

    const { highlight: _highlight, ...rest } = props;
    expect(md({ ...props })).toEqual(uiTextarea(rest));
  });

  it('.ric-md-editor ラッパーが描画されない', async () => {
    const app = setupApp();
    let md: ReturnType<typeof createMdEditor>;
    const handle = createApp('#app', {}, () => (md ? md({ value: 'x', highlight: 'none' }) : null));
    md = handle.use(createMdEditor());
    await flush();

    expect(app.querySelector('.ric-md-editor')).toBeNull();
    expect(app.querySelector('textarea')).not.toBeNull();
  });
});

describe('createMdEditor: DOM 構造・role', () => {
  it('div.ric-md-editor > (pre.ric-md-editor__mirror, textarea.ric-md-editor__input) を描画する', async () => {
    const app = setupApp();
    let md: ReturnType<typeof createMdEditor>;
    const handle = createApp('#app', {}, () => (md ? md({ value: '# hi' }) : null));
    md = handle.use(createMdEditor());
    await flush();

    const wrapper = app.querySelector('.ric-md-editor') as HTMLElement;
    expect(wrapper).not.toBeNull();
    expect(wrapper.getAttribute('data-ricdom-role')).toBe('md-editor');
    expect(wrapper.hasAttribute('data-ricdom-md-editor-id')).toBe(true);

    const mirror = wrapper.querySelector('pre') as HTMLElement;
    expect(mirror).not.toBeNull();
    expect(mirror.className).toBe('ric-md-editor__mirror');
    expect(mirror.getAttribute('data-ricdom-role')).toBe('md-editor-mirror');
    expect(mirror.getAttribute('aria-hidden')).toBe('true');

    const textarea = wrapper.querySelector('textarea') as HTMLTextAreaElement;
    expect(textarea).not.toBeNull();
    expect(textarea.getAttribute('data-ricdom-role')).toBe('textarea');
    expect(textarea.className).toBe('ric-textarea ric-md-editor__input');
  });

  it('複数インスタンスはそれぞれ異なる data-ricdom-md-editor-id を持つ', async () => {
    const app = setupApp();
    let mdA: ReturnType<typeof createMdEditor>;
    let mdB: ReturnType<typeof createMdEditor>;
    const handle = createApp('#app', {}, () =>
      mdA !== undefined && mdB !== undefined ? [{ tag: 'div', id: 'a', children: [mdA({})] }, { tag: 'div', id: 'b', children: [mdB({})] }] : null,
    );
    mdA = handle.use(createMdEditor());
    mdB = handle.use(createMdEditor());
    await flush();

    const idA = app.querySelector('#a .ric-md-editor')!.getAttribute('data-ricdom-md-editor-id');
    const idB = app.querySelector('#b .ric-md-editor')!.getAttribute('data-ricdom-md-editor-id');
    expect(idA).not.toBe(idB);
  });
});

describe('createMdEditor: ref / rest スプレッド', () => {
  it('ref は textarea に付き、app.refs.get(ref) は HTMLTextAreaElement を返す', async () => {
    setupApp();
    let md: ReturnType<typeof createMdEditor>;
    const handle = createApp('#app', {}, () => (md ? md({ value: '', ref: 'body' }) : null));
    md = handle.use(createMdEditor());
    await flush();

    const el = handle.refs.get('body');
    expect(el).not.toBeUndefined();
    expect((el as Element).tagName).toBe('TEXTAREA');
  });

  it('placeholder/data-* 等の rest props は textarea に透過される', async () => {
    const app = setupApp();
    let md: ReturnType<typeof createMdEditor>;
    const handle = createApp('#app', {}, () => (md ? md({ value: '', placeholder: 'write here', 'data-testid': 'body-editor' }) : null));
    md = handle.use(createMdEditor());
    await flush();

    const textarea = app.querySelector('textarea') as HTMLTextAreaElement;
    expect(textarea.placeholder).toBe('write here');
    expect(textarea.getAttribute('data-testid')).toBe('body-editor');
  });
});

describe('createMdEditor: consumer ハンドラが呼ばれる', () => {
  it('oninput/onkeydown/onpaste が呼ばれる', async () => {
    const app = setupApp();
    const oninput = vi.fn();
    const onkeydown = vi.fn();
    const onpaste = vi.fn();
    let md: ReturnType<typeof createMdEditor>;
    const handle = createApp('#app', {}, () => (md ? md({ value: '', oninput, onkeydown, onpaste }) : null));
    md = handle.use(createMdEditor());
    await flush();

    const textarea = app.querySelector('textarea') as HTMLTextAreaElement;
    textarea.value = 'typed';
    textarea.dispatchEvent(new Event('input'));
    textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    textarea.dispatchEvent(new Event('paste'));

    expect(oninput).toHaveBeenCalledTimes(1);
    expect(onkeydown).toHaveBeenCalledTimes(1);
    expect(onpaste).toHaveBeenCalledTimes(1);
  });

  it('input イベント後、await 無しで同期的にミラーの textContent が value と一致する (末尾ゼロ幅を除く)', async () => {
    const app = setupApp();
    let md: ReturnType<typeof createMdEditor>;
    const handle = createApp('#app', {}, () => (md ? md({ value: '' }) : null));
    md = handle.use(createMdEditor());
    await flush();

    const textarea = app.querySelector('textarea') as HTMLTextAreaElement;
    const mirror = app.querySelector('pre.ric-md-editor__mirror') as HTMLElement;

    textarea.value = '# heading **bold**';
    textarea.dispatchEvent(new Event('input'));

    // await していない — 同期的にミラーが更新されているはず
    const zeroWidth = String.fromCharCode(0x200b);
    expect((mirror.textContent ?? '').replace(new RegExp(zeroWidth, 'g'), '')).toBe('# heading **bold**');
  });

  // compositionend 経由の再同期は jsdom では検証できない: jsdom は `oncompositionend` を
  // IDL イベントハンドラ属性として実装しておらず (`'oncompositionend' in el` が false)、
  // ricdom のコア (src/dom.ts) は on* ハンドラを `el.oncompositionend = fn` という直接代入
  // (addEventListener ではなく) で結線するため、jsdom 上では dispatchEvent しても
  // ハンドラが一切呼ばれない — dom.ts 自体の既存挙動に起因する jsdom の制約であり、
  // このテストファイル固有の問題ではない。実際の Chromium での確認は
  // tests/browser/uiMdEditor.test.ts (compositionstart→input→compositionend) で行う。
});

describe('createMdEditor: maxHighlightLength 超えのフォールバック', () => {
  it('value.length が閾値を超えると装飾なしの textarea になる', async () => {
    const app = setupApp();
    let md: ReturnType<typeof createMdEditor>;
    const longValue = 'x'.repeat(50);
    const handle = createApp('#app', {}, () => (md ? md({ value: longValue }) : null));
    md = handle.use(createMdEditor({ maxHighlightLength: 10 }));
    await flush();

    expect(app.querySelector('.ric-md-editor')).toBeNull();
    const textarea = app.querySelector('textarea') as HTMLTextAreaElement;
    expect(textarea.value).toBe(longValue);
  });
});

describe('createMdEditor: dispose', () => {
  it('dispose() は例外を投げず、unmount 後は再度呼んでも描画されない', async () => {
    setupApp();
    let md: ReturnType<typeof createMdEditor>;
    const handle = createApp('#app', {}, () => (md ? md({ value: 'x' }) : null));
    md = handle.use(createMdEditor());
    await flush();

    expect(() => handle.unmount()).not.toThrow();

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(md!({})).toBeNull();
    errorSpy.mockRestore();
  });
});
