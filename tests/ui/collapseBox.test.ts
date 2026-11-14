// createCollapseBox (設計書 §3.4 部品契約)
// 実際に height/width が変化することの確認は jsdom がレイアウトを持たない
// (scrollHeight が常に 0) ため tests/browser/uiCollapseBox.test.ts (実ブラウザ) で
// 検証する。ここでは状態遷移・複数インスタンス独立性・use() 忘れ検知・idFor/isAnimating を確認する。

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { createCollapseBox } from '../../src/ui/collapseBox.js';
import { flush, setupApp } from '../_helpers/dom.js';

describe('createCollapseBox: use() 忘れ検知 (設計書 A)', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => errorSpy.mockRestore());

  it('use() されていない box を直接呼ぶと console.error を出し null を返す', () => {
    const box = createCollapseBox();
    expect(box({ visible: true })).toBeNull();
    expect(errorSpy).toHaveBeenCalled();
  });
});

describe('createCollapseBox: 基本の開閉', () => {
  it('visible:false かつ未マウントなら null (DOM に何も現れない)', async () => {
    const app = setupApp();
    let box: ReturnType<typeof createCollapseBox>;
    const handle = createApp('#app', {}, () => (box ? box({ visible: false, children: ['x'] }) : null));
    box = handle.use(createCollapseBox());
    await flush();
    expect(app.querySelector('.ric-collapse-box')).toBeNull();
  });

  it('visible:true で mount し、entering クラス + data-ricdom-visible=true を持つ', async () => {
    const app = setupApp();
    let box: ReturnType<typeof createCollapseBox>;
    const handle = createApp('#app', {}, () => (box ? box({ visible: true, children: [{ tag: 'span', children: ['本文'] }] }) : null));
    box = handle.use(createCollapseBox());
    await flush();

    const el = app.querySelector('.ric-collapse-box') as HTMLElement;
    expect(el).not.toBeNull();
    expect(el.className).toContain('ric-collapse-box--entering');
    expect(el.getAttribute('data-ricdom-visible')).toBe('true');
    expect(el.getAttribute('data-ricdom-role')).toBe('collapse-box');
    expect(el.textContent).toBe('本文');
  });

  it('entering 直後に visible:false にすると、測定値も 0 (jsdom はレイアウト無し) なので即 closed になる (v1 の corner case 継承)', async () => {
    const app = setupApp();
    let visible = true;
    let box: ReturnType<typeof createCollapseBox>;
    const handle = createApp('#app', {}, () => (box ? box({ visible, children: ['x'] }) : null));
    box = handle.use(createCollapseBox());
    await flush();
    expect(app.querySelector('.ric-collapse-box')).not.toBeNull();

    visible = false;
    handle.renderNow();
    expect(app.querySelector('.ric-collapse-box')).toBeNull(); // 即 closed (アニメ無し)
  });
});

describe('createCollapseBox: 複数インスタンス (key)', () => {
  it('key ごとに独立した状態を持つ', async () => {
    // jsdom にはレイアウトが無く scrollHeight は常に 0。2.0.0-alpha.36 から、測った大きさが 0 の箱は
    // 「動かすものが無い」として開いている途中をすぐ終えるので、ここでは中身に高さがあることにする。
    const heightSpy = vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(40);
    const app = setupApp();
    let box: ReturnType<typeof createCollapseBox>;
    const visible: Record<string, boolean> = { a: true, b: false };
    const handle = createApp('#app', {}, () =>
      box
        ? [
            box({ key: 'a', visible: visible.a, children: ['A'], id: 'box-a' }),
            box({ key: 'b', visible: visible.b, children: ['B'], id: 'box-b' }),
          ]
        : null,
    );
    box = handle.use(createCollapseBox());
    await flush();

    expect(app.querySelector('#box-a')).not.toBeNull();
    expect(app.querySelector('#box-b')).toBeNull();
    expect(box!.isAnimating('a')).toBe(true); // entering 中
    expect(box!.isAnimating('b')).toBe(false); // 未マウント
    heightSpy.mockRestore();
  });
});

describe('createCollapseBox: idFor', () => {
  it('id 未指定時は key から安定した id を自動生成する', async () => {
    const app = setupApp();
    let box: ReturnType<typeof createCollapseBox>;
    const handle = createApp('#app', {}, () => (box ? box({ key: 'row1', visible: true, children: ['x'] }) : null));
    box = handle.use(createCollapseBox());
    await flush();

    const el = app.querySelector('.ric-collapse-box') as HTMLElement;
    expect(el.id).toBe(box!.idFor('row1'));
    expect(el.id).toContain('row1');
  });

  it('id 指定時はそれを使う (consumer の aria-controls 連携用)', async () => {
    const app = setupApp();
    let box: ReturnType<typeof createCollapseBox>;
    const handle = createApp('#app', {}, () => (box ? box({ visible: true, id: 'custom-id', children: ['x'] }) : null));
    box = handle.use(createCollapseBox());
    await flush();
    expect((app.querySelector('.ric-collapse-box') as HTMLElement).id).toBe('custom-id');
  });
});

describe('createCollapseBox: dispose', () => {
  it('unmount で内部状態がクリアされ、再度呼んでも描画されない', async () => {
    const app = setupApp();
    let box: ReturnType<typeof createCollapseBox>;
    const handle = createApp('#app', {}, () => (box ? box({ visible: true, children: ['x'] }) : null));
    box = handle.use(createCollapseBox());
    await flush();
    handle.unmount();

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(box!({ visible: true })).toBeNull();
    errorSpy.mockRestore();
  });
});
