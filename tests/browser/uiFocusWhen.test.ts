// 実ブラウザ回帰テスト: createFocusWhen (v1 focus_when の後継、2.0.0-alpha.2)。
// 実 focus() の移動 (jsdom の activeElement 追跡はブラウザの厳密な focus 挙動の近似) と、
// portal 内 ref (#2 の「portal 内 ref の 1 render 遅れ」修正) との組み合わせで、
// dialog を開いた最初の render から portal 内の ref へ正しく focus が移ることを確認する。

import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { createFocusWhen } from '../../src/ui/focusWhen.js';
import { createDialog } from '../../src/ui/dialog.js';
import { injectStyles } from '../../src/ui/injectStyles.js';
import { dialogOpened, flush, pastDialogBackstop, setupApp } from '../_helpers/dom.js';
import type { UsePart } from '../../src/types.js';

injectStyles(document);

describe('実ブラウザ: createFocusWhen', () => {
  it('立ち上がりエッジで portal 内の ref へ実際に focus が移る (#2 の portal ref 修正と組み合わせ)', async () => {
    const app = setupApp();
    let fw: ReturnType<typeof createFocusWhen>;
    const state = { open: false };
    const handle = createApp('#app', state, (s) => {
      fw?.('portalInput', s.open);
      return { tag: 'div' };
    });
    fw = handle.use(createFocusWhen());
    // dialog 等を経由せず、生の UsePart で「portal 内に ref 付き要素が現れる」最小構成を再現する。
    const part: UsePart = { renderPortal: () => (state.open ? { tag: 'input', ref: 'portalInput' } : null) };
    handle.use(part);
    await flush();
    expect(document.activeElement?.tagName).not.toBe('INPUT');

    // Proxy (handle) 経由で書く (SPEC §3 FACT: 元の state を直接書き換えても再描画されない)。
    // createReactiveState は同じオブジェクトを target にラップしているため、
    // part.renderPortal() が閉じ込めている `state` からもこの書き込みは見える。
    handle.open = true;
    await flush();
    await flush(60); // nextRender().then() のマイクロタスクを待つ余裕

    const portalInput = app.querySelector('[data-ricdom-role="portal"] input');
    expect(portalInput).not.toBeNull();
    expect(document.activeElement).toBe(portalInput);
  });

  it('dialog 内の特定 ref へ focus した場合、dialog 自身の初期フォーカス (最初の focusable) に後から上書きされない (#12、700ms バックストップより後で確認)', async () => {
    const app = setupApp();
    let dlg: ReturnType<typeof createDialog>;
    let fw: ReturnType<typeof createFocusWhen>;
    const state = { open: false };
    const handle = createApp('#app', state, (s) => {
      fw?.('ta', s.open);
      return dlg
        ? dlg({
            open: s.open,
            onClose: () => {
              state.open = false;
            },
            title: 't',
            // DOM 順ではヘッダーの ✕ (close) ボタンが textarea より先に来る — dialog の
            // 既定の初期フォーカスならそちらへ移るはずだが、fw で textarea へ focus 済みなら
            // それを尊重して欲しい、という #12 の再現条件そのもの。
            children: [{ tag: 'textarea', ref: 'ta' }],
          })
        : null;
    });
    dlg = handle.use(createDialog());
    fw = handle.use(createFocusWhen());
    await flush();

    handle.open = true;
    // 700ms の ANIMATION_FALLBACK_MS バックストップ (dialog 側の focusFirstElementOnce) が
    // 発火した「後」でも、fw が先に移した textarea へのフォーカスが保たれているかを見る —
    // これが #12 の核心 (バックストップ/animationend のどちらが先に来ても、dialog は
    // 「既に内部にフォーカスがある」ことを検知して何もしないはず)。
    await dialogOpened();
    await pastDialogBackstop();

    const textarea = app.querySelector('textarea');
    expect(textarea).not.toBeNull();
    expect(document.activeElement).toBe(textarea);
  });
});
