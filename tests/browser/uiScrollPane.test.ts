// 実ブラウザ回帰テスト: createScrollPane の follow:'bottom' で追加後に scrollTop が
// 末尾になる (設計書 F)。jsdom は scrollHeight/clientHeight が常に 0 (レイアウト無し) の
// ため、「端にいるかどうか」の判定と実 scrollTop 反映はここでのみ検証できる。

import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { createScrollPane } from '../../src/ui/scrollPane.js';
import { injectStyles } from '../../src/ui/injectStyles.js';
import { flush, setupApp } from '../_helpers/dom.js';

injectStyles(document);

const renderMessages = (messages: string[]) => messages.map((m) => ({ tag: 'div', style: { height: '30px' }, children: [m] }));

describe('実ブラウザ: createScrollPane', () => {
  it('末尾にいる状態でメッセージを追加すると自動で末尾まで追従する', async () => {
    const app = setupApp();
    let pane: ReturnType<typeof createScrollPane>;
    let messages = Array.from({ length: 20 }, (_, i) => `msg ${i}`);
    const handle = createApp('#app', {}, () => (pane ? pane({ style: { height: '200px' }, children: renderMessages(messages) }) : null));
    pane = handle.use(createScrollPane({ follow: 'bottom' }));
    await flush();
    await flush(50);

    const el = app.querySelector('.ric-scroll-pane') as HTMLElement;
    // 初回描画時点では DOM がまだ無く「端にいるか」を判定できないため強制スクロールで
    // 末尾に揃える (v1 継承の既知の制約、初回だけ consumer が明示する運用)。
    pane!.scrollToBottom();
    await flush(50);
    expect(el.scrollHeight - el.scrollTop - el.clientHeight).toBeLessThanOrEqual(1);

    messages = [...messages, 'new message'];
    handle.renderNow();
    await flush(50);

    // 直前に端にいたので、追加後も自動で末尾に追従する
    expect(el.scrollHeight - el.scrollTop - el.clientHeight).toBeLessThanOrEqual(1);
  });

  it('途中を見ている間 (端から threshold より離れている) は自動スクロールしない', async () => {
    const app = setupApp();
    let pane: ReturnType<typeof createScrollPane>;
    let messages = Array.from({ length: 20 }, (_, i) => `msg ${i}`);
    const handle = createApp('#app', {}, () => (pane ? pane({ style: { height: '200px' }, children: renderMessages(messages) }) : null));
    pane = handle.use(createScrollPane({ follow: 'bottom', threshold: 20 }));
    await flush();
    await flush(50);

    const el = app.querySelector('.ric-scroll-pane') as HTMLElement;
    el.scrollTop = 50; // 途中までスクロールして「見ている」状態にする (端から十分離れる)
    await flush(20);

    messages = [...messages, 'new message'];
    handle.renderNow();
    await flush(50);

    expect(el.scrollTop).toBe(50); // 追従しない
  });
});
