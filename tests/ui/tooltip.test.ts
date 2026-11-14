// createTooltip (設計書 §3.4 部品契約 + §5/付録 E a11y)

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { createTooltip } from '../../src/ui/tooltip.js';
import { flush, setupApp } from '../_helpers/dom.js';

describe('createTooltip: use() 忘れ検知 (設計書 A)', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => errorSpy.mockRestore());

  it('use() されていない tooltip を直接呼ぶと console.error を出し null を返す', () => {
    const tip = createTooltip();
    expect(tip({ content: 'x', children: ['y'] })).toBeNull();
    expect(errorSpy).toHaveBeenCalled();
  });
});

describe('createTooltip: aria-describedby / 表示', () => {
  // aria-describedby は、フォーカスを受ける子の要素に付く (2.0.0-alpha.36。以前は包む側の span)
  it('子の要素に aria-describedby が付き、対応する id を持つ tooltip 要素が hover で現れる', async () => {
    const app = setupApp();
    let tip: ReturnType<typeof createTooltip>;
    const handle = createApp('#app', {}, () => (tip ? tip({ content: 'ヒント', children: [{ tag: 'button', children: ['?'] }] }) : null));
    tip = handle.use(createTooltip());
    await flush();

    const trigger = app.querySelector('.ric-tooltip')!;
    const describedBy = trigger.querySelector('button')!.getAttribute('aria-describedby')!;
    expect(describedBy).toBeTruthy();
    expect(trigger.hasAttribute('aria-describedby')).toBe(false);
    expect(app.querySelector(`#${describedBy}`)).toBeNull(); // まだ非表示

    trigger.dispatchEvent(new Event('mouseenter'));
    await flush();

    const popup = document.getElementById(describedBy)!;
    expect(popup).not.toBeNull();
    expect(popup.getAttribute('role')).toBe('tooltip');
    expect(popup.textContent).toBe('ヒント');
  });

  it('mouseleave で消える', async () => {
    const app = setupApp();
    let tip: ReturnType<typeof createTooltip>;
    const handle = createApp('#app', {}, () => (tip ? tip({ content: 'ヒント', children: ['x'] }) : null));
    tip = handle.use(createTooltip());
    await flush();

    const trigger = app.querySelector('.ric-tooltip')!;
    trigger.dispatchEvent(new Event('mouseenter'));
    await flush();
    const popup = app.querySelector('[role="tooltip"]');
    expect(popup).not.toBeNull();
    expect(popup!.getAttribute('data-ricdom-role')).toBe('tooltip'); // portal ルートの安定セレクタ

    trigger.dispatchEvent(new Event('mouseleave'));
    await flush();
    expect(app.querySelector('[role="tooltip"]')).toBeNull();
  });

  // focus / blur はバブリングしないので、部品は document の focusin / focusout を聞く (2.0.0-alpha.36)。
  // 以前のこのテストは span に直接 `new Event('focus')` を dispatch していて、本物のブラウザでは
  // 起きない経路を通していた (Tab で移動しても出ない不具合を見逃した)。本物のフォーカス移動での
  // 検証は tests/browser/uiTooltip.test.ts。
  it('中の要素の focusin で表示し、Esc で消える。focusout でも消える', async () => {
    const app = setupApp();
    let tip: ReturnType<typeof createTooltip>;
    const handle = createApp('#app', {}, () => (tip ? tip({ content: 'ヒント', children: [{ tag: 'button', children: ['x'] }] }) : null));
    tip = handle.use(createTooltip());
    await flush();

    const button = app.querySelector('.ric-tooltip button')!;
    button.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    await flush();
    expect(app.querySelector('[role="tooltip"]')).not.toBeNull();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await flush();
    expect(app.querySelector('[role="tooltip"]')).toBeNull();

    button.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    await flush();
    expect(app.querySelector('[role="tooltip"]')).not.toBeNull();
    button.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    await flush();
    expect(app.querySelector('[role="tooltip"]')).toBeNull();
    handle.unmount();
  });
});
