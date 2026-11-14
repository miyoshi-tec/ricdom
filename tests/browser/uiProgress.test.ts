// 実ブラウザ契約テスト: uiProgress (2.0.0-alpha.33、Paper Bridge の依頼)。
//
// 棒は <progress> ではなく div + role="progressbar" で描く。<progress> の見た目は UA 任せで
// (色はテーマの明暗に追従するが、不定のときの動きや prefers-reduced-motion の扱いはブラウザ
// ごとに違う)、alpha.32 の方針「見た目をブラウザ既定に預けない」に合わせた。そのため、幅・色・
// 動きは ricdom-ui の CSS が決めていて、jsdom では検証できない。

import { afterEach, describe, expect, it } from 'vitest';
import { cdp } from '@vitest/browser/context';
import { createApp } from '../../src/app.js';
import { injectStyles } from '../../src/ui/injectStyles.js';
import { applyTheme, createTheme } from '../../src/ui/theme.js';
import { uiButton } from '../../src/ui/button.js';
import { uiProgress } from '../../src/ui/progress.js';
import { flush, settled, setupApp } from '../_helpers/dom.js';

injectStyles(document);

const themedApp = (width = 400): HTMLDivElement => {
  const app = setupApp();
  applyTheme(app, { theme: 'light' });
  app.style.width = `${width}px`;
  return app;
};

const emulateReducedMotion = (on: boolean): Promise<unknown> =>
  (cdp() as unknown as { send: (m: string, p: unknown) => Promise<unknown> }).send('Emulation.setEmulatedMedia', {
    features: on ? [{ name: 'prefers-reduced-motion', value: 'reduce' }] : [],
  });

afterEach(async () => {
  await emulateReducedMotion(false);
});

describe('実ブラウザ: uiProgress (2.0.0-alpha.33)', () => {
  it('棒の塗りは value の割合の幅になり、value が変わると追従する', async () => {
    const app = themedApp();
    const handle = createApp('#app', { v: 0.25 }, (s) => uiProgress({ value: s.v, label: 'けいさん中' }));
    await flush();
    const track = app.querySelector('.ric-progress__track') as HTMLElement;
    const fill = (): HTMLElement => app.querySelector('.ric-progress__fill') as HTMLElement;

    expect(track.getBoundingClientRect().width, '前提: 棒は幅いっぱい').toBeCloseTo(400, 0);
    expect(track.getBoundingClientRect().height).toBeGreaterThan(4);
    await settled(fill);
    expect(fill().getBoundingClientRect().width).toBeCloseTo(100, 0);

    handle.v = 0.8;
    handle.renderNow();
    await settled(fill); // 幅の transition が終わるまで
    expect(fill().getBoundingClientRect().width).toBeCloseTo(320, 0);
    expect(track.getAttribute('aria-valuenow')).toBe('80');
    expect(app.querySelector('.ric-progress__percent')!.textContent).toBe('80%');
  });

  it('色はテーマに従い、--ric-progress-bar / --ric-progress-track で上書きできる', async () => {
    const app = themedApp();
    createApp('#app', {}, () => uiProgress({ value: 0.5 }));
    await flush();
    const track = app.querySelector('.ric-progress__track') as HTMLElement;
    const fill = app.querySelector('.ric-progress__fill') as HTMLElement;
    const probe = document.createElement('div');
    app.appendChild(probe);
    const colorOf = (css: string): string => {
      probe.style.backgroundColor = css;
      return getComputedStyle(probe).backgroundColor;
    };

    expect(getComputedStyle(fill).backgroundColor).toBe(colorOf('var(--ric-color-accent)'));
    expect(getComputedStyle(track).backgroundColor).toBe(colorOf('var(--ric-color-border)'));
    expect(getComputedStyle(fill).backgroundColor).not.toBe(getComputedStyle(track).backgroundColor);

    applyTheme(app, { theme: createTheme('light', { '--ric-progress-bar': 'rgb(1, 2, 3)', '--ric-progress-track': 'rgb(4, 5, 6)' }) });
    expect(getComputedStyle(fill).backgroundColor).toBe('rgb(1, 2, 3)');
    expect(getComputedStyle(track).backgroundColor).toBe('rgb(4, 5, 6)');

    applyTheme(app, { theme: 'dark' });
    expect(getComputedStyle(fill).backgroundColor, 'ダークテーマでもテーマの色').toBe(colorOf('var(--ric-color-accent)'));
  });

  it('不定 (value なし) は塗りが動き続け、prefers-reduced-motion では動かさず全体を薄く塗る', async () => {
    const app = themedApp();
    createApp('#app', {}, () => uiProgress({ label: 'まっています' }));
    await flush();
    const track = app.querySelector('.ric-progress__track') as HTMLElement;
    const fill = app.querySelector('.ric-progress__fill') as HTMLElement;

    expect(track.hasAttribute('aria-valuenow')).toBe(false);
    const running = fill.getAnimations().filter((a) => a.playState === 'running');
    expect(running.length, '動いている').toBeGreaterThan(0);
    expect(fill.getBoundingClientRect().width, '塗りは棒の一部').toBeLessThan(track.getBoundingClientRect().width);

    await emulateReducedMotion(true);
    expect(matchMedia('(prefers-reduced-motion: reduce)').matches, '前提: 設定が効いている').toBe(true);
    expect(fill.getAnimations().length, '動きを止める').toBe(0);
    expect(fill.getBoundingClientRect().width, '止まっていても「不定」と分かるよう全体を塗る').toBeCloseTo(track.getBoundingClientRect().width, 0);
    expect(Number(getComputedStyle(fill).opacity)).toBeLessThan(1);
  });

  it('幅の狭い場所でも、見出し・棒・補足・ボタンが枠からはみ出さない', async () => {
    const app = themedApp(180);
    createApp('#app', {}, () =>
      uiProgress({
        value: 0.42,
        label: 'とても長い説明の文がここに入ります',
        children: ['はじめてから 12 びょう・のこり やく 30 びょう (めやす)'],
        action: uiButton({ children: ['やめる'] }),
      }),
    );
    await flush();
    const root = app.querySelector('.ric-progress') as HTMLElement;
    expect(root.getBoundingClientRect().width).toBeCloseTo(180, 0);
    expect(root.scrollWidth, '横にはみ出さない').toBeLessThanOrEqual(root.clientWidth);
    for (const sel of ['.ric-progress__head', '.ric-progress__track', '.ric-progress__foot']) {
      const r = app.querySelector(sel)!.getBoundingClientRect();
      expect(r.right, `${sel} の右端`).toBeLessThanOrEqual(root.getBoundingClientRect().right + 0.5);
    }
    // % とボタンは縮まない (読める大きさのまま右に残る)
    const percent = app.querySelector('.ric-progress__percent') as HTMLElement;
    expect(percent.scrollWidth).toBeLessThanOrEqual(percent.clientWidth);
    const btn = app.querySelector('.ric-progress__action button') as HTMLElement;
    expect(btn.getBoundingClientRect().right).toBeCloseTo(root.getBoundingClientRect().right, 0);
  });
});
