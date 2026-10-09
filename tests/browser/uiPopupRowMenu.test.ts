// 実ブラウザ契約テスト: 行ごとの「…」メニューを createPopup 1 つで作る (2.0.0-alpha.27)。
//
// 背景 (オーナー判断 2026-10-09): 行ごとの「…」メニューを作る部品が uiInlineMenu と
// createPopup の 2 つあるのは「canon は 1 つ」に反する。uiInlineMenu は親要素の中に
// absolute で置くだけで、画面の下端に近い行では下に開いて切れる (docs サイトの 06 サンプルで
// オーナーが発見、Rancha は自前の実測 _pick_menu_anchor で回避していた)。createPopup は
// 上下反転・top layer・矢印キー・light dismiss を持つが、行メニューに使うには 2 点足りなかった:
//   1. `trigger` が必須で、openAt だけで使うときもダミーのトリガーボタンを描いて捨てる必要があった
//   2. openAt は「点」しか受け取らず、上に反転するとメニューが「…」ボタンに重なった
// alpha.27 で `trigger` を省略可能にし、`openAt(element)` で要素の上下端を基準に開けるようにした。

import { describe, expect, it } from 'vitest';
import { userEvent } from '@vitest/browser/context';
import { createApp } from '../../src/app.js';
import { createPopup } from '../../src/ui/popup.js';
import { injectStyles } from '../../src/ui/injectStyles.js';
import { applyTheme } from '../../src/ui/theme.js';
import { flush } from '../_helpers/dom.js';

injectStyles(document);

const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 150)); // rAF 実測フェーズ + 開くアニメーション開始
const closed = (): Promise<void> => new Promise((r) => setTimeout(r, 400)); // 閉じるアニメーション終了

// 行が 3 本並ぶ一覧。最後の行は画面の最下部 (下に開くスペースが無い)。メニューは 1 つ。
const mountRows = () => {
  document.body.innerHTML = '<div id="host" style="height:100vh;display:flex;flex-direction:column;justify-content:space-between"><div id="app" style="display:contents"></div></div>';
  applyTheme(document.getElementById('host')!, { theme: 'light' });
  const picked: string[] = [];
  let menu: ReturnType<typeof createPopup>;
  const state = { row: '' };
  const handle = createApp(
    '#app',
    state,
    (s) => [
      ...['top', 'middle', 'bottom'].map((name) => ({
        tag: 'div',
        style: { display: 'flex', justifyContent: 'space-between', padding: '4px' },
        children: [
          name,
          {
            tag: 'button',
            id: `more-${name}`,
            'aria-haspopup': 'menu',
            onclick: (e: MouseEvent) => {
              s.row = name;
              menu.openAt(e.currentTarget as HTMLElement);
            },
            children: ['⋯'],
          },
        ],
      })),
      // trigger を渡さない = openAt 専用。戻り値は null (何も描かない)
      menu({ children: [{ tag: 'button', id: 'item-rename', onclick: () => picked.push(`rename:${s.row}`), children: ['Rename'] }] }),
    ],
    { setup: (a) => { menu = a.use(createPopup()); } },
  );
  return { handle, picked, menu: () => menu };
};

const menuRect = (): DOMRect | null => document.querySelector('[data-ricdom-role="popup"]')?.getBoundingClientRect() ?? null;

describe('実ブラウザ: createPopup で行ごとの「…」メニュー (2.0.0-alpha.27)', () => {
  it('trigger を省略すると何も描かない (ダミーのトリガーボタンが要らない)', async () => {
    const { handle } = mountRows();
    await flush();
    expect(document.querySelectorAll('[data-ricdom-role="popup-trigger"]').length).toBe(0);
    expect(document.querySelectorAll('button').length).toBe(3); // 3 行の「…」だけ
    handle.unmount();
  });

  it('openAt(要素): 上の行では要素の下端の直下に開く', async () => {
    const { handle } = mountRows();
    await flush();
    const btn = document.getElementById('more-top')!;
    await userEvent.click(btn);
    await settle();
    const m = menuRect()!;
    const b = btn.getBoundingClientRect();
    expect(m.top).toBeGreaterThanOrEqual(b.bottom);
    expect(m.top - b.bottom).toBeLessThan(10);
    handle.unmount();
  });

  it('openAt(要素): 最下部の行では上に反転し、メニューが「…」ボタンに重ならず画面内に収まる', async () => {
    const { handle } = mountRows();
    await flush();
    const btn = document.getElementById('more-bottom')!;
    await userEvent.click(btn);
    await settle();
    const m = menuRect()!;
    const b = btn.getBoundingClientRect();
    expect(m.bottom).toBeLessThanOrEqual(b.top); // 点で開く openAt({x,y}) だとここが重なっていた
    expect(m.top).toBeGreaterThanOrEqual(0);
    expect(m.bottom).toBeLessThanOrEqual(innerHeight);
    handle.unmount();
  });

  it('同じ「…」をもう一度押すと閉じ、フォーカスはそのボタンに戻る (Escape でも同じ)', async () => {
    const { handle } = mountRows();
    await flush();
    const btn = document.getElementById('more-middle')!;
    await userEvent.click(btn);
    await settle();
    expect(menuRect()).not.toBeNull();
    await userEvent.click(btn); // 2 回目 = 閉じる (light dismiss で閉じてから開き直す、にならない)
    await closed();
    expect(menuRect()).toBeNull();

    await userEvent.click(btn);
    await settle();
    (document.querySelector('[role="menuitem"]') as HTMLElement).focus();
    await userEvent.keyboard('{Escape}');
    await closed();
    expect(menuRect()).toBeNull();
    expect(document.activeElement).toBe(btn);
    handle.unmount();
  });

  it('開いたまま別の行の「…」を押すと、1 回のクリックでその行のメニューに切り替わる', async () => {
    const { handle, picked } = mountRows();
    await flush();
    await userEvent.click(document.getElementById('more-top')!);
    await settle();
    const other = document.getElementById('more-middle')!;
    await userEvent.click(other);
    await settle();
    const m = menuRect()!;
    expect(m).not.toBeNull();
    expect(m.top).toBeGreaterThanOrEqual(other.getBoundingClientRect().bottom); // middle の行の下に移った
    await userEvent.click(document.getElementById('item-rename')!);
    expect(picked).toEqual(['rename:middle']);
    handle.unmount();
  });

  it('従来の点の形 openAt({ x, y }) / openAt(event) はそのまま', async () => {
    const { handle, menu } = mountRows();
    await flush();
    menu().openAt({ x: 100, y: 100 });
    await flush();
    await settle();
    const m = menuRect()!;
    expect(m.top).toBeGreaterThanOrEqual(100);
    expect(m.top).toBeLessThan(150);
    handle.unmount();
  });
});
