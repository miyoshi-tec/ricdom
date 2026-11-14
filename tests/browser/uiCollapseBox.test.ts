// 実ブラウザ回帰テスト: createCollapseBox の開閉で実 height が変わる (設計書 F)。
// jsdom は scrollHeight/transition を持たないため、実測 → transition → transitionend の
// パイプラインはここでのみ検証できる。

import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { createCollapseBox } from '../../src/ui/collapseBox.js';
import { injectStyles } from '../../src/ui/injectStyles.js';
import { flush, setupApp, until } from '../_helpers/dom.js';

injectStyles(document);

describe('実ブラウザ: createCollapseBox', () => {
  it('開くと実 height (getBoundingClientRect) が content の自然サイズまで変化し、完了後は inline height が外れる', async () => {
    const app = setupApp();
    let box: ReturnType<typeof createCollapseBox>;
    let visible = false;
    const handle = createApp('#app', {}, () =>
      box ? box({ visible, children: [{ tag: 'p', style: { margin: '0', height: '120px' }, children: ['content'] }] }) : null,
    );
    box = handle.use(createCollapseBox({ duration: 50 }));
    await flush();
    expect(app.querySelector('.ric-collapse-box')).toBeNull();

    visible = true;
    handle.renderNow();
    await flush(300); // 実測 (rAF) + transition (50ms) 完了を待つ

    const el = app.querySelector('.ric-collapse-box') as HTMLElement;
    expect(el).not.toBeNull();
    expect(el.getBoundingClientRect().height).toBeGreaterThanOrEqual(119);
    expect(el.className).not.toContain('--entering'); // transitionend で entering フラグが落ちている
    expect(el.style.height).toBe(''); // 完了後は inline height が外れ natural サイズに戻る (VDOM が正)
  });

  it('閉じると実 height が 0 に向けて変化し、完了後は DOM から消える', async () => {
    const app = setupApp();
    let box: ReturnType<typeof createCollapseBox>;
    let visible = true;
    const handle = createApp('#app', {}, () =>
      box ? box({ visible, children: [{ tag: 'p', style: { margin: '0', height: '120px' }, children: ['content'] }] }) : null,
    );
    box = handle.use(createCollapseBox({ duration: 50 }));
    await flush();
    await flush(300); // open 完了まで待つ
    expect(app.querySelector('.ric-collapse-box')).not.toBeNull();

    visible = false;
    handle.renderNow();
    await flush(300); // 2 段クロージング + transition 完了を待つ

    expect(app.querySelector('.ric-collapse-box')).toBeNull();
    expect(box!.isAnimating()).toBe(false);
  });
});

// 2.0.0-alpha.36: サンプル 14 (JSON エディタ) を書く過程で見つかった。中身が空のまま開くと、
// 測った大きさが 0 なので `height: 0px → 0px` になり、transition が起きない = transitionend が
// 来ない。「開いている途中」の状態が 700ms の保険のタイマーまで続き、その間は height: 0px が
// 付いたままなので、**開いた直後に足した中身が見えない** (空のフォルダを開いてから値を足す操作)。
describe('実ブラウザ: createCollapseBox を中身が空のまま開いても、後から足した中身がすぐ見える (2.0.0-alpha.36)', () => {
  const mount = async (direction: 'v' | 'h' | 'both') => {
    const app = setupApp();
    let box: ReturnType<typeof createCollapseBox>;
    const data = { visible: false, rows: [] as string[] };
    const handle = createApp('#app', {}, () =>
      box ? box({ visible: data.visible, children: data.rows.map((r) => ({ tag: 'p', style: { margin: '0', height: '30px', width: '80px' }, children: [r] })) }) : null,
    );
    box = handle.use(createCollapseBox({ direction, duration: 50 }));
    await flush();
    return { app, handle, data };
  };

  for (const direction of ['v', 'h', 'both'] as const) {
    it(`direction: '${direction}' — 空で開いて 100ms 後に中身を足すと、700ms を待たずに見える`, async () => {
      const { app, handle, data } = await mount(direction);
      data.visible = true;
      handle.renderNow();
      await flush(100);
      const el = app.querySelector('.ric-collapse-box') as HTMLElement;
      expect(el, '前提: 箱は描かれている').not.toBeNull();

      const t0 = performance.now();
      data.rows = ['a', 'b'];
      handle.renderNow();
      await until(() => el.getBoundingClientRect().height >= 59 && el.getBoundingClientRect().width >= 79, '中身が見える大きさになる', 2000);
      expect(performance.now() - t0, '保険のタイマー (700ms) を待っていない').toBeLessThan(300);
      expect(el.className).not.toContain('--entering');
      handle.unmount();
    });
  }

  it('中身があるときの開くアニメーションは従来どおり (途中の高さを通る)', async () => {
    const app = setupApp();
    let box: ReturnType<typeof createCollapseBox>;
    const data = { visible: false };
    const handle = createApp('#app', {}, () => (box ? box({ visible: data.visible, children: [{ tag: 'p', style: { margin: '0', height: '200px' }, children: ['x'] }] }) : null));
    box = handle.use(createCollapseBox({ duration: 300 }));
    await flush();
    data.visible = true;
    handle.renderNow();
    const seen: number[] = [];
    for (let i = 0; i < 12; i++) {
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      const el = app.querySelector('.ric-collapse-box') as HTMLElement | null;
      if (el) seen.push(Math.round(el.getBoundingClientRect().height));
    }
    expect(seen.some((h) => h > 5 && h < 195), `途中の高さがある: ${seen.join(',')}`).toBe(true);
    handle.unmount();
  });
});
