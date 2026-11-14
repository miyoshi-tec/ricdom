// 実ブラウザ回帰テスト: 空の portal センチネル (`<div data-ricdom-role="portal">`) が
// flex/grid コンテナのレイアウトに参加してしまうバグ (パイロット第 3 号 = 展示ビューア
// (kiosk/embed) からの報告 #1、2.0.0-alpha.6)。
//
// portal センチネルは createApp が target 直下に常に自動生成する (src/app.ts、コアの
// 設計 §3.5、UI 層からは変更しない)。popup/dropdown/tooltip/toast/dialog のような
// portal 系部品を一切使わない consumer では、この div は常に空 (幅 0・高さ 0) のまま
// 残る。target 自体が (portal とは無関係の理由で) `display:flex; gap:...` を持って
// いると、この空 div も flex item として数えられ、gap 1 個分の余白がレイアウトに
// 混入する。
//
// 実際の再現 (統括の裏取り): `d.style.cssText='display:flex;gap:16px'` の d に
// `createApp(d, {}, () => ({tag:'span', children:['x'], style:{display:'inline-block',
// width:'50px'}}))` すると d の幅が 66 (50 + gap 16) になる。ここではコンテナの幅を
// 決定的に測るため `display:flex` の代わりに `display:inline-flex` (shrink-to-fit) を
// 使う — 本質は同じ (空 portal が flex item として数えられるかどうか)。
//
// 対応: cssTemplates.ts の PORTAL_CSS (`[data-ricdom-role="portal"]:empty { display:
// none; }`)。ricdom-ui.css を読み込んでいない consumer (コアのみ使用) には効かないため
// SPEC §7 に同じ 1 行を自分の CSS に足す代替手段を明記する。

import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { createDialog } from '../../src/ui/dialog.js';
import { injectStyles } from '../../src/ui/injectStyles.js';
import { flush, setupApp } from '../_helpers/dom.js';

injectStyles(document);

const PORTAL_SELECTOR = '[data-ricdom-role="portal"]';

const makeFlexGapTarget = (): HTMLDivElement => {
  const app = setupApp();
  app.style.display = 'inline-flex';
  app.style.gap = '16px';
  return app;
};

describe('実ブラウザ: 空の portal は flex/grid の gap に数えられない (#1)', () => {
  it('flex+gap の target: portal 系部品を使わなくても target の幅が子の幅と一致する (gap が加算されない)', async () => {
    const app = makeFlexGapTarget();
    createApp(app, {}, () => ({ tag: 'span', style: { display: 'inline-block', width: '50px' }, children: ['x'] }));
    await flush();

    // 修正前は portal (空 div) も flex item として数えられ、幅が 50 + gap 16 = 66 になっていた。
    expect(app.offsetWidth).toBe(50);

    const portal = app.querySelector(PORTAL_SELECTOR) as HTMLElement;
    expect(portal).not.toBeNull();
    expect(getComputedStyle(portal).display).toBe('none');
  });

  it('dialog を開くと portal の computed display が none でなくなり、閉じて空に戻ると再び none になる', async () => {
    const app = makeFlexGapTarget();
    let dlg: ReturnType<typeof createDialog>;
    const handle = createApp(app, {}, () => (dlg ? dlg({ triggerChildren: ['開く'], title: 't', children: ['本文'] }) : null));
    dlg = handle.use(createDialog());
    await flush();

    const portal = app.querySelector(PORTAL_SELECTOR) as HTMLElement;
    expect(getComputedStyle(portal).display).toBe('none');

    const trigger = app.querySelector('button')!;
    trigger.click();
    await flush(300); // entrance animationend を待つ (uiDialog.test.ts と同じ待ち方)

    expect(portal.childElementCount).toBeGreaterThan(0);
    expect(getComputedStyle(portal).display).not.toBe('none');

    dlg.close();
    await flush(300); // exit animationend を待つ

    expect(portal.childElementCount).toBe(0);
    expect(getComputedStyle(portal).display).toBe('none');
  });

  it('portalTo 指定時は target 自身に portal が無い (既存挙動の確認、変更なし)', async () => {
    // 外部 portal 先は body 直下ではなく専用要素にする (tests/portal.test.ts と同じ流儀。
    // document.body へ直接 append すると他テストとの後片付けが絡み合うため避ける)。
    document.body.innerHTML = '<div id="app"></div><div id="external-portal"></div>';
    const app = document.getElementById('app') as HTMLDivElement;
    app.style.display = 'inline-flex';
    app.style.gap = '16px';
    const external = document.getElementById('external-portal')!;

    createApp(app, {}, () => ({ tag: 'span', style: { display: 'inline-block', width: '50px' }, children: ['x'] }), { portalTo: external });
    await flush();

    expect(app.querySelector(PORTAL_SELECTOR)).toBeNull();
    expect(app.offsetWidth).toBe(50);
  });
});
