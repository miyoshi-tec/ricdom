// 実ブラウザ回帰テスト: createAccordion の controlled モード (2.0.0-alpha.7)。
// jsdom でも動く内容だが、実ブラウザで aria-expanded / inert の反映を一度も確認していなかった
// ため (createTabs 同様、controlled 系は実ブラウザ回帰の対象に含める規約)。

import { describe, expect, it } from 'vitest';
import { userEvent } from '@vitest/browser/context';
import { createApp } from '../../src/app.js';
import { createAccordion } from '../../src/ui/accordion.js';
import { injectStyles } from '../../src/ui/injectStyles.js';
import { flush, setupApp } from '../_helpers/dom.js';

injectStyles(document);

const ITEMS = [
  { id: 'a', title: 'A', children: ['content-a'] },
  { id: 'b', title: 'B', children: ['content-b'] },
];

describe('実ブラウザ: createAccordion (controlled)', () => {
  it('外部ボタンで open props を更新すると aria-expanded と inert に反映される', async () => {
    const app = setupApp();
    let acc: ReturnType<typeof createAccordion>;
    const state = { acc: { a: false, b: false } as Record<string, boolean> };
    const handle = createApp('#app', state, (s) =>
      acc
        ? acc({
            items: ITEMS,
            open: s.acc,
            onToggle: (_id, _next, map) => {
              handle.acc = map;
            },
          })
        : null,
    );
    acc = handle.use(createAccordion());
    await flush();

    const header = () => app.querySelectorAll('.ric-accordion__header')[0] as HTMLElement;
    const panel = () => app.querySelectorAll('.ric-accordion__body')[0] as HTMLElement;

    expect(header().getAttribute('aria-expanded')).toBe('false');
    expect(panel().inert).toBe(true);

    // ヘッダクリック (実ブラウザの click イベント) → onToggle 経由で親 state を更新
    header().click();
    await flush();

    expect(header().getAttribute('aria-expanded')).toBe('true');
    expect(panel().inert).toBe(false);

    // 外部 (アプリ側) からも open を直接書き換えて閉じられる (これが controlled の要件)
    handle.acc = { a: false, b: false };
    await flush();

    expect(header().getAttribute('aria-expanded')).toBe('false');
    expect(panel().inert).toBe(true);
  });
});

// ── ギア軽量化デモ報告 (14 番目の consumer、alpha.22 で計測): 閉じたパネルは `display: grid`
// (閉じアニメーション用) が UA の `[hidden] { display: none }` に勝つため `hidden` 属性には
// a11y 上の効果が無く、中の input が Tab でフォーカスされ AX ツリーにも残っていた。
// alpha.23 から `inert` で除外する。
describe('実ブラウザ: createAccordion の閉じたパネルは inert (フォーカス・AX ツリーから除外)', () => {
  const mount = async () => {
    const app = setupApp();
    let acc: ReturnType<typeof createAccordion>;
    const items = [
      {
        id: 'a',
        title: 'A',
        children: [
          { tag: 'input', type: 'number', value: '1' },
          { tag: 'input', type: 'number', value: '2' },
        ],
      },
    ];
    const handle = createApp('#app', {}, () => (acc ? [acc({ items }), { tag: 'button', id: 'after', children: ['after'] }] : null));
    acc = handle.use(createAccordion());
    await flush();
    return { app };
  };

  it('閉じたパネルのヘッダから Tab すると、中の input ではなく後ろの button にフォーカスが移る', async () => {
    const { app } = await mount();
    const header = app.querySelector('.ric-accordion__header') as HTMLButtonElement;
    header.focus();
    expect(document.activeElement).toBe(header);

    await userEvent.tab();
    expect(document.activeElement).toBe(document.getElementById('after'));
  });

  it('開くと Tab で中の input に入れる (inert が外れている)', async () => {
    const { app } = await mount();
    const header = app.querySelector('.ric-accordion__header') as HTMLButtonElement;
    await userEvent.click(header);
    await flush();

    await userEvent.tab();
    expect(document.activeElement).toBe(app.querySelector('.ric-accordion__body input'));
  });

  it('body.inert は閉じている間 true、開くと false。閉じても display: grid のままで、閉じ後は高さ 0', async () => {
    const { app } = await mount();
    const header = app.querySelector('.ric-accordion__header') as HTMLButtonElement;
    const body = app.querySelector('.ric-accordion__body') as HTMLElement;

    expect(body.inert).toBe(true);
    expect(getComputedStyle(body).display).toBe('grid');
    expect(body.getBoundingClientRect().height).toBe(0);
    expect(body.querySelector('input')).not.toBeNull();

    await userEvent.click(header);
    await flush();
    expect(body.inert).toBe(false);
    await new Promise((r) => setTimeout(r, 400));
    expect(body.getBoundingClientRect().height).toBeGreaterThan(0);

    await userEvent.click(header);
    await flush();
    expect(body.inert).toBe(true);
    expect(getComputedStyle(body).display).toBe('grid');
    await new Promise((r) => setTimeout(r, 400));
    expect(body.getBoundingClientRect().height).toBe(0);
  });
});
