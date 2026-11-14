// 実ブラウザ回帰テスト: createApp の setup オプション (パイロット移行の報告 #5)。
// jsdom 側 (tests/createAppSetup.test.ts) は DOM 構造・呼び出し順を検証済み。ここでは
// 「setup 内で use() したステートフル部品が初回 render から実際にクリック操作できる」
// ことを実ブラウザで確認する (portal の前倒し生成が実レイアウト上も正しく動くかの回帰)。

import { describe, expect, it } from 'vitest';
import { userEvent } from '@vitest/browser/context';
import { createApp } from '../../src/app.js';
import { createDialog } from '../../src/ui/dialog.js';
import { injectStyles } from '../../src/ui/injectStyles.js';
import { flush, setupApp } from '../_helpers/dom.js';

injectStyles(document);

describe('実ブラウザ: createApp の setup オプション', () => {
  it('setup 内で use() した dialog が初回 render から開閉できる', async () => {
    const app = setupApp();
    let dlg: ReturnType<typeof createDialog>;
    createApp('#app', {}, () => dlg!({ triggerChildren: ['開く'], title: 't', children: ['本文'] }), {
      setup: (a) => {
        dlg = a.use(createDialog());
      },
    });

    // await flush() 無しでも既にトリガーが実在する (setup が初回 render に間に合っている)。
    const trigger = app.querySelector('button')!;
    expect(trigger.textContent).toBe('開く');

    await userEvent.click(trigger);
    await flush(300);
    expect(app.querySelector('[role="dialog"]')).not.toBeNull();

    await userEvent.keyboard('{Escape}');
    await flush(300);
    expect(app.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('portal 要素は 1 つだけ生成される (前倒し生成 + 通常経路の二重生成が起きない)', () => {
    const app = setupApp();
    createApp('#app', {}, () => ({ tag: 'div', id: 'main' }), {
      setup: (a) => {
        a.use({ renderPortal: () => ({ tag: 'span', id: 'out', children: ['x'] }) });
      },
    });

    expect(app.querySelectorAll('[data-ricdom-role="portal"]').length).toBe(1);
    expect(app.querySelector('#out')!.textContent).toBe('x');
    expect(app.querySelector('#main')).not.toBeNull();
  });
});
