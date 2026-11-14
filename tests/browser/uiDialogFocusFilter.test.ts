// 実ブラウザ回帰テスト: createDialog の focus trap の可視要素フィルタ (§14 追補)。
// `display:none` の focusable (セレクタは通るが実際にはフォーカスできない) を
// Tab 循環がスキップすることを確認する。jsdom はレイアウトを持たず
// offsetParent/getClientRects が実ブラウザと異なる値を返すため、ここでのみ検証できる
// (tests/ui/dialog.test.ts 側のコメント・src/ui/dialog.ts の hasLayoutEngine 参照)。

import { describe, expect, it } from 'vitest';
import { userEvent } from '@vitest/browser/context';
import { createApp } from '../../src/app.js';
import { createDialog } from '../../src/ui/dialog.js';
import { uiButton } from '../../src/ui/button.js';
import { injectStyles } from '../../src/ui/injectStyles.js';
import { dialogOpened, flush, setupApp } from '../_helpers/dom.js';

injectStyles(document);

describe('実ブラウザ: createDialog の focus trap 可視要素フィルタ', () => {
  it('display:none の focusable は Tab 循環の対象から外れる', async () => {
    const app = setupApp();
    let dlg: ReturnType<typeof createDialog>;
    const handle = createApp('#app', {}, () =>
      dlg
        ? dlg({
            triggerChildren: ['開く'],
            title: 't',
            children: [uiButton({ children: ['A'] }), uiButton({ children: ['隠れB'], style: { display: 'none' } }), uiButton({ children: ['C'] })],
          })
        : null,
    );
    dlg = handle.use(createDialog());
    await flush();

    await userEvent.click(app.querySelector('button')!);
    await dialogOpened();

    const closeBtn = app.querySelector('.ric-dialog__close') as HTMLElement;
    const [itemA, , itemC] = Array.from(app.querySelectorAll('.ric-dialog__body button')) as HTMLElement[];

    // フォーカス可能要素は [close, A, C] (B は display:none で除外される)。開いた直後は
    // 本文内の最初の可視要素 (A) が初期フォーカスを受ける (LCP #4、2.0.0-alpha.9)。
    expect(document.activeElement).toBe(itemA);
    await userEvent.tab();
    expect(document.activeElement).toBe(itemC); // B を飛ばして C へ
    await userEvent.tab(); // 末尾 (C) から Tab すると先頭 (close) へループ
    expect(document.activeElement).toBe(closeBtn);
    await userEvent.tab(); // close から Tab で A へ
    expect(document.activeElement).toBe(itemA);
  });

  it('disabled / tabindex="-1" だけでなく非表示要素も getFocusables から除外されるので、全 focusable が非表示なら root 自身にフォーカスが留まる', async () => {
    const app = setupApp();
    let dlg: ReturnType<typeof createDialog>;
    const handle = createApp('#app', {}, () => (dlg ? dlg({ triggerChildren: ['開く'], title: 't', children: [uiButton({ children: ['隠れ'], style: { display: 'none' } })] }) : null));
    dlg = handle.use(createDialog());
    await flush();

    await userEvent.click(app.querySelector('button')!);
    await dialogOpened();

    // header の close ボタンは可視なので、これが唯一の focusable として初期フォーカスを受ける。
    const closeBtn = app.querySelector('.ric-dialog__close') as HTMLElement;
    expect(document.activeElement).toBe(closeBtn);
    await userEvent.tab();
    expect(document.activeElement).toBe(closeBtn); // ループして自分自身に戻る
  });
});
