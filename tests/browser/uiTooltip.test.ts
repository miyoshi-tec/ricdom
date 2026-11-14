// 実ブラウザ契約テスト: createTooltip はキーボードのフォーカスでも出て、説明が読み上げの対象になる
// (2.0.0-alpha.36)。
//
// 背景 (サンプル 13 を書く過程で見つかった): tooltip は包む側の `<span class="ric-tooltip">` に
// `onfocus` / `onblur` を付けていたが、**focus / blur はバブリングしない**。フォーカスを受けるのは
// 中のボタンなので、span のハンドラは一度も呼ばれず、Tab で移動してもツールチップは出なかった
// (SPEC は「shown on hover or focus」)。jsdom のテストは span に直接 `new Event('focus')` を
// dispatch していたので、この食い違いを見逃していた。関連して:
//   - `aria-describedby` も span に付いていて、フォーカスを受けるボタンには付いていなかった
//     (読み上げは、フォーカスのある要素の describedby しか読まない)
//   - Escape は span の `onkeydown` で受けていたので、ホバーだけで出したときは消せなかった
//     (ポインタを動かさずに消せること、が WCAG 1.4.13 の要件)
//
// 本物のフォーカス移動 (Tab) と本物のホバーでしか検証できないので、実ブラウザで確かめる。

import { describe, expect, it } from 'vitest';
import { userEvent } from '@vitest/browser/context';
import { createApp } from '../../src/app.js';
import { createTooltip } from '../../src/ui/tooltip.js';
import { injectStyles } from '../../src/ui/injectStyles.js';
import { applyTheme } from '../../src/ui/theme.js';
import { settled, setupApp, until } from '../_helpers/dom.js';
import { parkPointer } from '../_helpers/pointer.js';

injectStyles(document);

const popup = (): HTMLElement | null => document.querySelector('[role="tooltip"]');
const gone = (): Promise<void> => until(() => popup() === null, 'ツールチップが消える');

const mount = async (children: unknown = [{ tag: 'button', id: 'target', children: ['Save'] }]) => {
  const app = setupApp();
  applyTheme(app, { theme: 'light' });
  app.style.padding = '80px';
  await parkPointer(); // 前のテストが残したポインタでホバーにならないように
  let tip: ReturnType<typeof createTooltip>;
  const handle = createApp('#app', {}, () => ({
    tag: 'div',
    children: [{ tag: 'button', id: 'before', children: ['before'] }, tip ? tip({ content: '保存します', children: children as never }) : null, { tag: 'button', id: 'after', children: ['after'] }],
  }));
  tip = handle.use(createTooltip());
  handle.renderNow();
  return { app, handle };
};

describe('実ブラウザ: createTooltip はフォーカスでも出る (2.0.0-alpha.36)', () => {
  it('Tab で中のボタンに移ると出て、次へ移ると消える', async () => {
    const { handle } = await mount();
    document.getElementById('before')!.focus();
    expect(popup()).toBeNull();

    await userEvent.tab();
    expect(document.activeElement?.id, '前提: 中のボタンにフォーカスがある').toBe('target');
    const p = await settled(popup);
    expect(p.textContent).toBe('保存します');

    await userEvent.tab();
    expect(document.activeElement?.id).toBe('after');
    await gone();
    handle.unmount();
  });

  it('フォーカスを受ける要素が aria-describedby を持ち、出ている間はその id の要素が説明文を持つ', async () => {
    const { app, handle } = await mount();
    const target = document.getElementById('target')!;
    const id = target.getAttribute('aria-describedby');
    expect(id, 'ボタン自身に付く').toBeTruthy();
    expect(app.querySelector('.ric-tooltip')!.hasAttribute('aria-describedby'), '包む側の span には付けない (同じ説明が 2 回読まれないように)').toBe(false);

    target.focus();
    const p = await settled(popup);
    expect(p.id).toBe(id);
    handle.unmount();
  });

  it('ホバーで出したツールチップも、ポインタを動かさずに Escape で消せる', async () => {
    const { handle } = await mount();
    await userEvent.hover(document.getElementById('target')!);
    await settled(popup);
    expect(document.activeElement, '前提: フォーカスは中に無い').toBe(document.body);

    await userEvent.keyboard('{Escape}');
    await gone();
    handle.unmount();
  });

  it('フォーカスで出したツールチップも Escape で消え、フォーカスは動かない', async () => {
    const { handle } = await mount();
    document.getElementById('target')!.focus();
    await settled(popup);
    await userEvent.keyboard('{Escape}');
    await gone();
    expect(document.activeElement?.id).toBe('target');
    handle.unmount();
  });

  it('ホバーとポインタが離れる動きは従来どおり', async () => {
    const { handle } = await mount();
    await userEvent.hover(document.getElementById('target')!);
    await settled(popup);
    await userEvent.unhover(document.getElementById('target')!);
    await parkPointer();
    await gone();
    handle.unmount();
  });

  it('中身が文字だけ (フォーカスを受ける要素が無い) のときは、包む側の span が aria-describedby を持つ', async () => {
    const { app, handle } = await mount(['?']);
    expect(app.querySelector('.ric-tooltip')!.getAttribute('aria-describedby')).toBeTruthy();
    handle.unmount();
  });

  it('利用者が子に付けた aria-describedby は残し、ツールチップの id を後ろに足す', async () => {
    const { handle } = await mount([{ tag: 'button', id: 'target', 'aria-describedby': 'own-help', children: ['Save'] }]);
    const ids = document.getElementById('target')!.getAttribute('aria-describedby')!.split(' ');
    expect(ids[0]).toBe('own-help');
    expect(ids.length).toBe(2);
    handle.unmount();
  });

  it('unmount すると、フォーカスが動いてもツールチップは出ない (document のリスナーを外している)', async () => {
    const { handle } = await mount();
    handle.unmount();
    document.body.innerHTML = '<span class="ric-tooltip" data-ricdom-role="tooltip-trigger"><button id="t2">x</button></span>';
    document.getElementById('t2')!.focus();
    await new Promise((r) => setTimeout(r, 100));
    expect(popup()).toBeNull();
  });
});
