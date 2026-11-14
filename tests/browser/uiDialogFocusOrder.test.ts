// 実ブラウザ回帰テスト: createDialog の既定初期フォーカス順 (LCP #4、Trend Guard でも
// 同種の体験報告、2.0.0-alpha.9)。
//
// 変更前は「DOM 順で最初の focusable」= 常にヘッダの ✕ (close) ボタンだった。✕ は
// 「閉じる」ボタンであり、開いた直後にそこへフォーカスリングが付く/スクリーンリーダーが
// 真っ先に「閉じる」を読み上げるのは、ダイアログの主目的 (本文の確認・入力・アクション
// 選択) と噛み合わない。新順序は「[autofocus] → 本文 (dialog-body) の最初の focusable →
// フッター (dialog-footer/actions) の最初の focusable → ヘッダの ✕ → root」
// (src/ui/dialog.ts の focusFirstElement 参照)。
//
// 700ms の ANIMATION_FALLBACK_MS バックストップより後で判定する (他 dialog テストと
// 同じ 800ms 待ちの流儀、animationend 経路・バックストップ経路のどちらで先に
// フォーカスが決まっても同じ結果になることの確認を兼ねる)。

import { describe, expect, it } from 'vitest';
import { userEvent } from '@vitest/browser/context';
import { createApp } from '../../src/app.js';
import { createDialog } from '../../src/ui/dialog.js';
import { uiButton } from '../../src/ui/button.js';
import { injectStyles } from '../../src/ui/injectStyles.js';
import { dialogOpened, flush, pastDialogBackstop, setupApp } from '../_helpers/dom.js';

injectStyles(document);

describe('実ブラウザ: createDialog の既定初期フォーカス順 (LCP #4)', () => {
  it('本文に focusable (input) があれば、✕ ではなく本文の最初の要素へフォーカスする', async () => {
    const app = setupApp();
    let dlg: ReturnType<typeof createDialog>;
    const handle = createApp('#app', {}, () =>
      dlg
        ? dlg({
            triggerChildren: ['開く'],
            title: 't',
            children: [{ tag: 'input', id: 'name' }],
            actions: [uiButton({ children: ['OK'] })],
          })
        : null,
    );
    dlg = handle.use(createDialog());
    await flush();

    await userEvent.click(app.querySelector('button')!);
    await dialogOpened();
    await pastDialogBackstop();

    const input = app.querySelector('#name') as HTMLElement;
    expect(document.activeElement).toBe(input);
  });

  it('本文に focusable が無く、フッターに actions のボタンがあれば、そちらへフォーカスする', async () => {
    const app = setupApp();
    let dlg: ReturnType<typeof createDialog>;
    const handle = createApp('#app', {}, () =>
      dlg
        ? dlg({
            triggerChildren: ['開く'],
            title: 't',
            children: ['ただのテキスト (focusable 無し)'],
            actions: [uiButton({ children: ['キャンセル'] }), uiButton({ children: ['OK'] })],
          })
        : null,
    );
    dlg = handle.use(createDialog());
    await flush();

    await userEvent.click(app.querySelector('button')!);
    await dialogOpened();
    await pastDialogBackstop();

    const footerFirst = app.querySelector('.ric-dialog__footer button') as HTMLElement;
    expect(footerFirst.textContent).toBe('キャンセル');
    expect(document.activeElement).toBe(footerFirst);
  });

  it('本文にもフッターにも focusable が無ければ、ヘッダの ✕ へフォーカスする (最終フォールバック)', async () => {
    const app = setupApp();
    let dlg: ReturnType<typeof createDialog>;
    const handle = createApp('#app', {}, () => (dlg ? dlg({ triggerChildren: ['開く'], title: 't', children: ['ただのテキスト'] }) : null));
    dlg = handle.use(createDialog());
    await flush();

    await userEvent.click(app.querySelector('button')!);
    await dialogOpened();
    await pastDialogBackstop();

    const closeBtn = app.querySelector('.ric-dialog__close') as HTMLElement;
    expect(document.activeElement).toBe(closeBtn);
  });

  it('[autofocus] があれば、本文/フッター/✕ の優先順位より最優先でフォーカスする', async () => {
    const app = setupApp();
    let dlg: ReturnType<typeof createDialog>;
    const handle = createApp('#app', {}, () =>
      dlg
        ? dlg({
            triggerChildren: ['開く'],
            title: 't',
            // 本文の最初の focusable は「先頭」ボタンだが、autofocus 付きの textarea が
            // 別にあるので、新順序 (本文優先) より autofocus がさらに優先されるはず。
            children: [uiButton({ children: ['先頭'] }), { tag: 'textarea', autofocus: true }],
            actions: [uiButton({ children: ['OK'] })],
          })
        : null,
    );
    dlg = handle.use(createDialog());
    await flush();

    await userEvent.click(app.querySelector('button')!);
    await dialogOpened();
    await pastDialogBackstop();

    const textarea = app.querySelector('textarea') as HTMLElement;
    expect(document.activeElement).toBe(textarea);
  });
});
