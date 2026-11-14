// 実ブラウザ回帰テスト: createCollapseBox の開閉で実 height が変わる (設計書 F)。
// jsdom は scrollHeight/transition を持たないため、実測 → transition → transitionend の
// パイプラインはここでのみ検証できる。

import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { createCollapseBox } from '../../src/ui/collapseBox.js';
import { injectStyles } from '../../src/ui/injectStyles.js';
import { flush, setupApp } from '../_helpers/dom.js';

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
