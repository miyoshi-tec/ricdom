// 実ブラウザ契約テスト: 浮遊面 (dialog / popup / dropdown / toast / tooltip) は、アプリが
// どこにマウントされていても画面 (viewport) 基準で表示される (SPEC §7 FACT、2.0.0-alpha.26)。
//
// 背景 (オーナー報告 2026-10-09): docs サイトのナビバー (`backdrop-filter: blur()` の
// sticky 要素) にマウントしたアプリで「ソース」ダイアログを開くと、上半分が画面外に出た。
// CSS 仕様上、祖先に transform / filter / backdrop-filter / contain があると、子孫の
// `position: fixed` は viewport ではなくその祖先を基準にする。dialog の `top: 50%` が
// 52px 高のバーの中央 (26px) で解決されていた。v1 も同じ構造 (dialog は `.ric-page` 直下の
// fixed 要素) で、popup/tooltip だけが祖先を探して座標を補正していた。
//
// 修正: ui の浮遊部品が描画する「アプリ専用の portal 要素」を Popover API
// (`popover="manual"`) で top layer に上げる。top layer の要素は祖先の containing block /
// overflow / z-index の影響を受けない。DOM 上の位置は変わらないので、テーマの CSS 変数の
// 継承・dialog の inert 化・フォーカス管理はそのまま。
//
// jsdom には Popover API もレイアウトも無いため、実ブラウザでしか検証できない。

import { describe, expect, it } from 'vitest';
import { userEvent } from '@vitest/browser/context';
import { createApp } from '../../src/app.js';
import { createDialog } from '../../src/ui/dialog.js';
import { createPopup } from '../../src/ui/popup.js';
import { createToast } from '../../src/ui/toast.js';
import { injectStyles } from '../../src/ui/injectStyles.js';
import { applyTheme } from '../../src/ui/theme.js';
import { flush } from '../_helpers/dom.js';

injectStyles(document);

// fixed の containing block を作る祖先の 3 パターン。どれも「画面の上の方にある細いバー」に
// アプリをマウントする — 今回の報告 (ナビバー) と同じ形。
const TRAPS: Array<[string, string]> = [
  ['backdrop-filter', 'backdrop-filter: blur(8px)'],
  ['transform', 'transform: translateZ(0)'],
  ['filter', 'filter: blur(0)'],
];

const mountInBar = (trapCss: string): HTMLElement => {
  document.body.innerHTML = `<div style="height:120px"></div><div id="bar" style="position:sticky;top:0;height:52px;${trapCss}"><div id="app"></div></div><div style="height:2000px"></div>`;
  const bar = document.getElementById('bar')!;
  applyTheme(bar, { theme: 'light' });
  return document.getElementById('app')!;
};

const waitAnim = (): Promise<void> => new Promise((r) => setTimeout(r, 400)); // 開くアニメーション (最長 aqua 600ms の手前で十分な位置)

describe('実ブラウザ: 浮遊面は祖先の containing block に閉じ込められない (2.0.0-alpha.26)', () => {
  for (const [name, css] of TRAPS) {
    it(`${name} を持つバーの中のアプリから開いたダイアログが画面中央に出て、幕が画面全体を覆う`, async () => {
      mountInBar(css);
      let dlg: ReturnType<typeof createDialog>;
      const handle = createApp('#app', {}, () => (dlg ? dlg({ title: 'T', children: ['body'] }) : null));
      dlg = handle.use(createDialog());
      await flush();
      dlg.open();
      await flush();
      await waitAnim();

      const card = document.querySelector('[data-ricdom-role="dialog"]')!.getBoundingClientRect();
      const overlay = document.querySelector('.ric-dialog__overlay')!.getBoundingClientRect();
      expect(card.top).toBeGreaterThanOrEqual(0);
      expect(card.bottom).toBeLessThanOrEqual(innerHeight);
      expect((card.top + card.bottom) / 2).toBeCloseTo(innerHeight / 2, -1); // ±5px
      expect((card.left + card.right) / 2).toBeCloseTo(innerWidth / 2, -1);
      expect(overlay.top).toBe(0);
      expect(overlay.left).toBe(0);
      expect(overlay.width).toBeGreaterThanOrEqual(innerWidth - 1);
      expect(overlay.height).toBeGreaterThanOrEqual(innerHeight - 1);
      handle.unmount();
    });
  }

  it('transform を持つ (画面の途中にある) 箱の中のアプリから開いた popup がトリガーの直下に出る', async () => {
    document.body.innerHTML = '<div style="height:300px"></div><div id="box" style="transform:translateZ(0);padding:8px"><div id="app"></div></div>';
    applyTheme(document.getElementById('box')!, { theme: 'light' });
    let menu: ReturnType<typeof createPopup>;
    const handle = createApp('#app', {}, () => (menu ? menu({ trigger: ['⋯'], children: [{ tag: 'button', class: 'ric-button', children: ['A'] }] }) : null));
    menu = handle.use(createPopup());
    await flush();

    const trigger = document.querySelector('#app button') as HTMLElement;
    await userEvent.click(trigger);
    await new Promise((r) => setTimeout(r, 150)); // rAF 実測フェーズ
    const t = trigger.getBoundingClientRect();
    const p = document.querySelector('[data-ricdom-role="popup"]')!.getBoundingClientRect();
    // 修正前は transform の箱 (top 300px) を基準に top が解決され、トリガーより約 300px 下に出た
    expect(p.top).toBeGreaterThanOrEqual(t.bottom - 1);
    expect(p.top - t.bottom).toBeLessThan(20);
    handle.unmount();
  });

  it('アプリの外にある z-index 最大の要素よりも、toast が前面に描かれる', async () => {
    document.body.innerHTML = '<div id="host"><div id="app"></div></div><div id="cover" style="position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,0.01)"></div>';
    applyTheme(document.getElementById('host')!, { theme: 'light' });
    let toast: ReturnType<typeof createToast>;
    const handle = createApp('#app', {}, () => {
      toast?.();
      return { tag: 'span', children: ['x'] };
    });
    toast = handle.use(createToast());
    await flush();
    toast!.show('保存しました');
    await flush();
    await waitAnim();

    const el = document.querySelector('[role="status"]') as HTMLElement;
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2);
    expect(el.contains(hit)).toBe(true);
    handle.unmount();
  });

  it('portal は 0×0 の箱なので、浮遊面が出ている間もアプリ本体のクリックを奪わない', async () => {
    document.body.innerHTML = '<div id="host"><div id="app"></div></div>';
    applyTheme(document.getElementById('host')!, { theme: 'light' });
    let toast: ReturnType<typeof createToast>;
    let clicks = 0;
    const handle = createApp('#app', {}, () => {
      toast?.();
      return { tag: 'button', id: 'btn', style: { margin: '200px' }, onclick: () => { clicks++; }, children: ['press'] };
    });
    toast = handle.use(createToast());
    await flush();
    toast!.show('表示中');
    await flush();

    const portal = document.querySelector('[data-ricdom-role="portal"]') as HTMLElement;
    expect(portal.matches(':popover-open')).toBe(true); // 前提: top layer に上がっている
    const pr = portal.getBoundingClientRect();
    expect(pr.width).toBe(0);
    expect(pr.height).toBe(0);
    const b = document.getElementById('btn')!.getBoundingClientRect();
    expect(document.elementFromPoint((b.left + b.right) / 2, (b.top + b.bottom) / 2)?.id).toBe('btn');
    await userEvent.click(document.getElementById('btn')!);
    expect(clicks).toBe(1);
    handle.unmount();
  });

  it('portal はアプリの文字色・CSS 変数を継承する (popover の UA 既定 color: CanvasText に負けない)', async () => {
    document.body.innerHTML = '<div id="host"><div id="app"></div></div>';
    const host = document.getElementById('host')!;
    applyTheme(host, { theme: 'dark' });
    let toast: ReturnType<typeof createToast>;
    const handle = createApp('#app', {}, () => {
      toast?.();
      return null;
    });
    toast = handle.use(createToast());
    await flush();
    toast!.show('x');
    await flush();
    const portal = document.querySelector('[data-ricdom-role="portal"]') as HTMLElement;
    expect(getComputedStyle(portal).color).toBe(getComputedStyle(host).color);
    expect(getComputedStyle(portal).getPropertyValue('--ric-color-bg')).toBe(getComputedStyle(host).getPropertyValue('--ric-color-bg'));
    handle.unmount();
  });

  it('portalTo で渡した外部要素は top layer に上げない (配置は consumer の管理下のまま)', async () => {
    document.body.innerHTML = '<div id="app"></div><div id="mine"></div>';
    const mine = document.getElementById('mine')!;
    let toast: ReturnType<typeof createToast>;
    const handle = createApp(
      '#app',
      {},
      () => {
        toast?.();
        return null;
      },
      { portalTo: mine },
    );
    toast = handle.use(createToast());
    await flush();
    toast!.show('x');
    await flush();
    expect(mine.hasAttribute('popover')).toBe(false);
    handle.unmount();
  });
});
