// 実ブラウザ回帰テスト: createDialog の focus trap (設計書 F、付録 E)。
// jsdom はレイアウト・visibility を持たず offsetParent/フォーカス許可判定が
// 実ブラウザと異なるため、Tab 循環・Esc 復帰の「実フォーカス移動」はここで確認する。

import { describe, expect, it } from 'vitest';
import { userEvent } from '@vitest/browser/context';
import { createApp } from '../../src/app.js';
import { createDialog } from '../../src/ui/dialog.js';
import { uiButton } from '../../src/ui/button.js';
import { injectStyles } from '../../src/ui/injectStyles.js';
import { dialogClosed, dialogOpened, flush, pastDialogBackstop, setupApp } from '../_helpers/dom.js';

// CSS を読み込んでおく (実 CSS アニメーションの animationend で焦点移動・
// クローズ処理が完了する。ANIMATION_FALLBACK_MS の backstop 経由ではなく
// 本来の経路を検証するため)。
injectStyles(document);

describe('実ブラウザ: createDialog の focus trap', () => {
  it('開くと本文内の最初の focusable 要素にフォーカスが移る (LCP #4、2.0.0-alpha.9: ✕ より本文を優先)', async () => {
    const app = setupApp();
    let dlg: ReturnType<typeof createDialog>;
    const handle = createApp('#app', {}, () =>
      dlg
        ? dlg({
            triggerChildren: ['開く'],
            title: 't',
            children: [uiButton({ children: ['最初'] }), uiButton({ children: ['次'] })],
          })
        : null,
    );
    dlg = handle.use(createDialog());
    await flush();

    await userEvent.click(app.querySelector('button')!);
    // エントランスアニメーション終了 (onanimationend) を待つ
    await dialogOpened();

    // DOM 順で最初の focusable 要素はヘッダーの ✕ (close) ボタンだが、新順序 (本文 →
    // フッター → ✕ → root) では本文内の最初の要素 (ここでは「最初」ボタン) が勝つ。
    const bodyFirst = app.querySelector('.ric-dialog__body button')!;
    expect(bodyFirst.textContent).toBe('最初');
    expect(document.activeElement).toBe(bodyFirst);
  });

  it('Tab / Shift+Tab がダイアログ内でループする (focus trap)', async () => {
    const app = setupApp();
    let dlg: ReturnType<typeof createDialog>;
    const handle = createApp('#app', {}, () =>
      dlg
        ? dlg({
            triggerChildren: ['開く'],
            title: 't',
            children: [uiButton({ children: ['A'] }), uiButton({ children: ['B'] })],
          })
        : null,
    );
    dlg = handle.use(createDialog());
    await flush();

    await userEvent.click(app.querySelector('button')!);
    await dialogOpened();

    const closeBtn = app.querySelector('.ric-dialog__close') as HTMLElement;
    const [itemA, itemB] = Array.from(app.querySelectorAll('.ric-dialog__body button')) as HTMLElement[];

    // Tab トラップの循環順序 (DOM 順) 自体は変わらず [close, A, B]。変わるのは
    // 「開いた直後にどこへ置くか」だけ (LCP #4、2.0.0-alpha.9) — 新順序では本文内の
    // 最初の要素 (A) が初期フォーカスを受ける。
    expect(document.activeElement).toBe(itemA);
    await userEvent.tab();
    expect(document.activeElement).toBe(itemB);
    await userEvent.tab(); // 最後 (B) から Tab すると先頭 (close) へループ
    expect(document.activeElement).toBe(closeBtn);
    await userEvent.tab();
    expect(document.activeElement).toBe(itemA);
    await userEvent.tab({ shift: true }); // Shift+Tab で A から close へ (DOM 順で 1 つ前)
    expect(document.activeElement).toBe(closeBtn);
    await userEvent.tab({ shift: true }); // 先頭 (close) から Shift+Tab で末尾 (B) へループ
    expect(document.activeElement).toBe(itemB);
    await userEvent.tab({ shift: true });
    expect(document.activeElement).toBe(itemA);
  });

  it('Esc で閉じ、起動元 (trigger ボタン) へフォーカスが復帰する', async () => {
    const app = setupApp();
    let dlg: ReturnType<typeof createDialog>;
    const handle = createApp('#app', {}, () => (dlg ? dlg({ triggerChildren: ['開く'], title: 't', children: [uiButton({ children: ['x'] })] }) : null));
    dlg = handle.use(createDialog());
    await flush();

    const trigger = app.querySelector('button')!;
    await userEvent.click(trigger);
    await dialogOpened();
    expect(app.querySelector('[role="dialog"]')).not.toBeNull();

    await userEvent.keyboard('{Escape}');
    await dialogClosed(); // exit アニメーション終了を待つ

    expect(app.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('returnFocus: false で開くと、閉じてもフォーカスが復帰しない (パイロット移行の報告 #4)', async () => {
    const app = setupApp();
    let dlg: ReturnType<typeof createDialog>;
    const handle = createApp('#app', {}, () => [
      { tag: 'input', id: 'unrelated' },
      dlg ? dlg({ title: 't', children: ['本文'] }) : null,
    ]);
    dlg = handle.use(createDialog());
    await flush();

    // フォーカス不可能なラベル (span) 相当のトリガーから開くケースの再現: 開く直前に
    // 「たまたまフォーカスされていた無関係な要素」(数値入力等) がある状態で dlg.open() する。
    const unrelated = app.querySelector('#unrelated') as HTMLInputElement;
    unrelated.focus();
    expect(document.activeElement).toBe(unrelated);

    dlg.open({ returnFocus: false });
    await dialogOpened();
    expect(app.querySelector('[role="dialog"]')).not.toBeNull();
    expect(document.activeElement).not.toBe(unrelated); // 開いた時点でダイアログ内へ移動済み

    dlg.close();
    await dialogClosed();
    expect(app.querySelector('[role="dialog"]')).toBeNull();
    // 復帰しない = 無関係な要素 (unrelated) へは絶対に戻らない。ダイアログの DOM が
    // 消えたことで activeElement は自然に <body> になる (明示的に .focus() されていない)。
    expect(document.activeElement).not.toBe(unrelated);
    expect(document.activeElement).toBe(document.body);
  });

  it('returnFocus: Element を指定すると、その要素へ復帰する', async () => {
    const app = setupApp();
    let dlg: ReturnType<typeof createDialog>;
    const handle = createApp('#app', {}, () => [
      { tag: 'input', id: 'unrelated' },
      { tag: 'button', id: 'explicit-target', children: ['target'] },
      dlg ? dlg({ title: 't', children: ['本文'] }) : null,
    ]);
    dlg = handle.use(createDialog());
    await flush();

    const unrelated = app.querySelector('#unrelated') as HTMLInputElement;
    const target = app.querySelector('#explicit-target') as HTMLElement;
    unrelated.focus();

    dlg.open({ returnFocus: target });
    await dialogOpened();
    expect(app.querySelector('[role="dialog"]')).not.toBeNull();

    dlg.close();
    await dialogClosed();
    expect(document.activeElement).toBe(target);
  });

  it('controlled mode: returnFocus: false を props に渡すと復帰しない', async () => {
    const app = setupApp();
    let dlg: ReturnType<typeof createDialog>;
    const state = createApp('#app', { show: false }, (s) => [
      { tag: 'input', id: 'unrelated' },
      dlg ? dlg({ title: 't', children: ['本文'], open: s.show, returnFocus: false, onClose: () => { s.show = false; } }) : null,
    ]);
    dlg = state.use(createDialog());
    await flush();

    const unrelated = app.querySelector('#unrelated') as HTMLInputElement;
    unrelated.focus();

    state.show = true;
    await dialogOpened();
    expect(app.querySelector('[role="dialog"]')).not.toBeNull();

    state.show = false;
    await dialogClosed();
    expect(app.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).not.toBe(unrelated);
  });

  it('既定 (returnFocus 省略) は従来どおり開く直前の activeElement へ復帰する', async () => {
    const app = setupApp();
    let dlg: ReturnType<typeof createDialog>;
    const handle = createApp('#app', {}, () => [
      { tag: 'input', id: 'unrelated' },
      dlg ? dlg({ title: 't', children: ['本文'] }) : null,
    ]);
    dlg = handle.use(createDialog());
    await flush();

    const unrelated = app.querySelector('#unrelated') as HTMLInputElement;
    unrelated.focus();

    dlg.open();
    await dialogOpened();
    dlg.close();
    await dialogClosed();
    expect(document.activeElement).toBe(unrelated);
  });

  it('[autofocus] を持つ要素があれば、DOM 順で先に来る close ボタンより優先してフォーカスする (#12、700ms バックストップより後で確認)', async () => {
    const app = setupApp();
    let dlg: ReturnType<typeof createDialog>;
    const handle = createApp('#app', {}, () =>
      dlg
        ? dlg({
            triggerChildren: ['開く'],
            title: 't',
            // DOM 順は [close (header), 先頭, autofocus 対象, 末尾] — autofocus 属性が
            // 無ければ close が最初の focusable として勝つはずの配置。
            children: [uiButton({ children: ['先頭'] }), { tag: 'textarea', autofocus: true }, uiButton({ children: ['末尾'] })],
          })
        : null,
    );
    dlg = handle.use(createDialog());
    await flush();

    await userEvent.click(app.querySelector('button')!);
    await dialogOpened();
    await pastDialogBackstop(); // 700ms バックストップより後で確認

    const textarea = app.querySelector('textarea') as HTMLElement;
    expect(textarea.hasAttribute('autofocus')).toBe(true);
    expect(document.activeElement).toBe(textarea);
  });

  it('背景 (トリガーボタン側) が inert になる', async () => {
    const app = setupApp();
    let dlg: ReturnType<typeof createDialog>;
    const handle = createApp('#app', { count: 0 }, (s) =>
      dlg
        ? [
            { tag: 'button', id: 'outside', children: [String(s.count)] },
            dlg({ triggerChildren: ['開く'], title: 't', children: ['本文'] }),
          ]
        : null,
    );
    dlg = handle.use(createDialog());
    await flush();

    const outside = app.querySelector('#outside') as HTMLElement;
    expect(outside.inert).toBe(false);

    await userEvent.click(app.querySelectorAll('button')[1]!); // trigger は 2 番目
    await dialogOpened();
    expect(outside.inert).toBe(true);

    await userEvent.keyboard('{Escape}');
    await dialogClosed();
    expect(outside.inert).toBe(false);
  });
});
