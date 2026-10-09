// 実ブラウザ契約テスト: Rancha の移行報告 (2026-10-09、alpha.27 で行メニューを createPopup + openAt
// に移した結果) から入れた popup / dropdown の修正 (2.0.0-alpha.28)。
//   1. 浮遊面は Electron のドラッグ領域の上でも押せる: portal の子孫に -webkit-app-region: no-drag
//      (この property は継承されず、alpha.26 から portal は 0×0 の箱なので portal 自身に付けても効かない。
//      Rancha が Electron 32 / Windows 11 の OS 実クリックで確認)
//   2. 基準要素 (トリガー / openAt の要素) を含む領域がスクロールしたら閉じる
//      (開いたまま一覧をスクロールすると、メニューが別の行に付いて見えたまま最初の行を対象にしていた)
//   3. 上下どちらにも入りきらないときは画面内に収まる高さに制限し、中をスクロールさせる
//   4. role を menuitem 以外にした子 (区切り線) は項目扱いしない (矢印キーの移動先にしない・項目の装飾を付けない)
//   5. trigger のオブジェクト形は、予約外のキー (title, aria-label, data-* 等) をボタンへ素通しする

import { describe, expect, it } from 'vitest';
import { userEvent } from '@vitest/browser/context';
import { createApp } from '../../src/app.js';
import { createPopup } from '../../src/ui/popup.js';
import { createDropdown } from '../../src/ui/dropdown.js';
import { injectStyles } from '../../src/ui/injectStyles.js';
import { applyTheme } from '../../src/ui/theme.js';
import { flush } from '../_helpers/dom.js';

injectStyles(document);

const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 150));
const closed = (): Promise<void> => new Promise((r) => setTimeout(r, 400));
const body = (): HTMLElement | null => document.querySelector('[data-ricdom-role="popup"], [data-ricdom-role="dropdown"]');

const themedHost = (html: string): void => {
  document.body.innerHTML = `<div id="host">${html}</div>`;
  applyTheme(document.getElementById('host')!, { theme: 'light' });
};

describe('実ブラウザ: popup / dropdown の修正 (2.0.0-alpha.28、Rancha 移行報告)', () => {
  it('1. portal の中の浮遊面 (本体と項目) は -webkit-app-region: no-drag を持つ', async () => {
    themedHost('<div id="app"></div>');
    let menu: ReturnType<typeof createPopup>;
    const handle = createApp('#app', {}, () => (menu ? menu({ trigger: ['⋯'], children: [{ tag: 'button', id: 'item', children: ['A'] }] }) : null));
    menu = handle.use(createPopup());
    await flush();
    await userEvent.click(document.querySelector('#app button')!);
    await settle();
    for (const el of [body()!, document.getElementById('item')!]) {
      expect(getComputedStyle(el).getPropertyValue('-webkit-app-region'), el.className).toBe('no-drag');
    }
    handle.unmount();
  });

  it('2a. openAt(要素) で開いたあと、その要素を含むスクロール領域をスクロールすると閉じる', async () => {
    themedHost('<div id="scroller" style="height:120px;overflow:auto"><div id="app"></div></div>');
    let menu: ReturnType<typeof createPopup>;
    const handle = createApp(
      '#app',
      {},
      () => [
        ...Array.from({ length: 20 }, (_, i) => ({ tag: 'div', style: { height: '30px' }, children: [{ tag: 'button', id: `row-${i}`, onclick: (e: MouseEvent) => menu.openAt(e.currentTarget as HTMLElement), children: ['⋯'] }] })),
        menu({ children: [{ tag: 'button', children: ['Trash'] }] }),
      ],
      { setup: (a) => { menu = a.use(createPopup()); } },
    );
    await flush();
    await userEvent.click(document.getElementById('row-1')!);
    await settle();
    expect(body()).not.toBeNull();
    const scroller = document.getElementById('scroller')!;
    scroller.scrollTop = 200;
    scroller.dispatchEvent(new Event('scroll')); // scrollTop の代入でも発火するが、テストの確実さのため明示
    await closed();
    expect(body()).toBeNull();
    handle.unmount();
  });

  it('2b. トリガーで開いた dropdown も、ページのスクロールで閉じる / メニューの中のスクロールでは閉じない', async () => {
    themedHost('<div style="height:40px"></div><div id="app"></div><div style="height:3000px"></div>');
    let dd: ReturnType<typeof createDropdown>;
    const handle = createApp('#app', {}, () =>
      dd ? dd({ label: 'Sort', children: Array.from({ length: 40 }, (_, i) => ({ tag: 'button', children: [`item ${i}`] })) }) : null,
    );
    dd = handle.use(createDropdown());
    await flush();
    await userEvent.click(document.querySelector('#app button')!);
    await settle();
    const b = body()!;
    expect(b).not.toBeNull();
    // 中のスクロール (項目が多く高さが制限されている) では閉じない
    b.scrollTop = 50;
    b.dispatchEvent(new Event('scroll'));
    await closed();
    expect(body()).not.toBeNull();
    // ページのスクロールでは閉じる
    window.scrollTo(0, 300);
    document.dispatchEvent(new Event('scroll'));
    await closed();
    expect(body()).toBeNull();
    window.scrollTo(0, 0);
    handle.unmount();
  });

  it('3. 項目が多く上下どちらにも入りきらないときは、画面内に収まる高さに制限して中をスクロールさせる', async () => {
    themedHost(`<div style="height:${Math.round(innerHeight / 2) - 20}px"></div><div id="app"></div>`);
    let menu: ReturnType<typeof createPopup>;
    const handle = createApp('#app', {}, () =>
      menu ? menu({ trigger: ['⋯'], children: Array.from({ length: 60 }, (_, i) => ({ tag: 'button', children: [`item ${i}`] })) }) : null,
    );
    menu = handle.use(createPopup());
    await flush();
    await userEvent.click(document.querySelector('#app button')!);
    await settle();
    const b = body()!;
    const r = b.getBoundingClientRect();
    expect(r.top).toBeGreaterThanOrEqual(0);
    expect(r.bottom).toBeLessThanOrEqual(innerHeight);
    expect(b.scrollHeight).toBeGreaterThan(b.clientHeight); // 中身は切れずにスクロールで届く
    expect(['auto', 'scroll']).toContain(getComputedStyle(b).overflowY);
    handle.unmount();
  });

  it('4. role="separator" の子は項目扱いしない (矢印キーで飛ばす、項目のクラス・role・tabindex を付けない)', async () => {
    themedHost('<div id="app"></div>');
    let menu: ReturnType<typeof createPopup>;
    const handle = createApp('#app', {}, () =>
      menu
        ? menu({
            trigger: ['⋯'],
            children: [
              { tag: 'button', id: 'first', children: ['Cut'] },
              { tag: 'div', id: 'sep', role: 'separator', class: 'ric-popup__sep' },
              { tag: 'button', id: 'second', children: ['Copy'] },
            ],
          })
        : null,
    );
    menu = handle.use(createPopup());
    await flush();
    await userEvent.click(document.querySelector('#app button')!);
    await settle();
    const sep = document.getElementById('sep')!;
    expect(sep.classList.contains('ric-popup__item')).toBe(false);
    expect(sep.getAttribute('data-ricdom-role')).not.toBe('popup-item');
    expect(sep.hasAttribute('tabindex')).toBe(false);
    document.getElementById('first')!.focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(document.activeElement?.id).toBe('second');
    handle.unmount();
  });

  it('5. trigger のオブジェクト形は title / aria-label / data-* をボタンへ素通しし、契約の属性は上書きさせない', async () => {
    themedHost('<div id="app"></div>');
    let menu: ReturnType<typeof createPopup>;
    const handle = createApp('#app', {}, () =>
      menu
        ? menu({
            trigger: { label: ['◐'], ghost: true, title: 'Theme (now: light)', 'aria-label': 'Theme', 'data-test': 'theme', 'aria-haspopup': 'false' } as never,
            children: [{ tag: 'button', children: ['light'] }],
          })
        : null,
    );
    menu = handle.use(createPopup());
    await flush();
    const btn = document.querySelector('#app button')!;
    expect(btn.getAttribute('title')).toBe('Theme (now: light)');
    expect(btn.getAttribute('aria-label')).toBe('Theme');
    expect(btn.getAttribute('data-test')).toBe('theme');
    expect(btn.getAttribute('aria-haspopup')).toBe('menu'); // 契約の属性は渡しても変わらない
    expect(btn.classList.contains('ric-button--ghost')).toBe(true);
    handle.unmount();
  });
});
