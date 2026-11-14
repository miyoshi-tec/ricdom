// 実ブラウザ回帰テスト (a): rAF が発火しない環境でも state 変更が描画される (バックストップ)。
// v1 でブラウザ固有だった回帰の 1 つ (設計書 §7)。jsdom 版の相当テストは
// tests/scheduler.test.ts に既にあるが、実ブラウザの requestAnimationFrame /
// setTimeout の実挙動 (throttling・タイマー精度) で確認する。

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { flush, setupApp } from '../_helpers/dom.js';

describe('実ブラウザ: rAF 停止環境でもバックストップで再描画される', () => {
  let originalRaf: typeof requestAnimationFrame;

  beforeEach(() => {
    originalRaf = window.requestAnimationFrame;
  });
  afterEach(() => {
    window.requestAnimationFrame = originalRaf;
  });

  it('requestAnimationFrame を無効化 (呼ばれても発火しない) しても、setTimeout(200ms) バックストップで DOM が更新される', async () => {
    // 「発火しない rAF」を模す: id は返すがコールバックを一切呼ばない (hidden タブ・
    // Electron の backgroundThrottling 等での実挙動に近い)。
    window.requestAnimationFrame = (() => 0) as typeof requestAnimationFrame;

    const app = setupApp();
    const handle = createApp('#app', { n: 1 }, (s) => ({ tag: 'div', id: 'out', children: [String(s.n)] }));
    expect(app.querySelector('#out')!.textContent).toBe('1'); // 初回は同期描画

    handle.n = 2;
    // rAF は発火しないので、setTimeout(200ms) バックストップが効くまで待つ
    await flush(300);
    expect(app.querySelector('#out')!.textContent).toBe('2');
  });

  it('健常な rAF 環境では通常どおり (バックストップを待たずに) 描画される', async () => {
    const app = setupApp();
    const handle = createApp('#app', { n: 1 }, (s) => ({ tag: 'div', id: 'out', children: [String(s.n)] }));

    handle.n = 2;
    await flush(); // 実ブラウザの rAF は数十 ms 以内に発火する
    expect(app.querySelector('#out')!.textContent).toBe('2');
  });
});
