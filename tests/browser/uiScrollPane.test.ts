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

// 2.0.0-alpha.36: サンプル 15 (AI チャット) を書く過程で見つかった。応答が流れている間
// (内容が毎フレーム増えている間) は、利用者がゆっくり上へスクロールしても末尾に引き戻されていた。
//   - 部品は render の時点で「端にいるか」を測り、1 フレーム後に scrollTop を書く。その間に
//     利用者がスクロールしても、測った結果は「端にいた」のままなので上書きされる
//   - 1 回の移動が threshold (既定 50px) より小さい操作 (↑キーは 40px) は、何度やっても
//     「まだ端の近く」と判定されて毎回戻される
// 直した後は、端から離れる向きのスクロールを scroll イベントで見て、その時点で追従をやめる。
// 端 (threshold 以内) まで戻ると追従を再開する。
describe('実ブラウザ: createScrollPane は、内容が増え続けている間でも端から離れられる (2.0.0-alpha.36)', () => {
  const frames = async (n: number): Promise<void> => {
    for (let i = 0; i < n; i++) await new Promise((r) => requestAnimationFrame(() => r(null)));
  };
  const distanceFromEnd = (el: HTMLElement): number => el.scrollHeight - el.scrollTop - el.clientHeight;

  const mount = async (options: Parameters<typeof createScrollPane>[0] = { follow: 'bottom' }, extra: Record<string, unknown> = {}) => {
    const app = setupApp();
    let pane: ReturnType<typeof createScrollPane>;
    const data = { messages: Array.from({ length: 30 }, (_, i) => `msg ${i}`) };
    const handle = createApp('#app', {}, () => (pane ? pane({ style: { height: '200px' }, ...extra, children: renderMessages(data.messages) }) : null));
    pane = handle.use(createScrollPane(options));
    await flush(50);
    const el = app.querySelector('.ric-scroll-pane') as HTMLElement;
    pane!.scrollToBottom();
    await flush(50);
    expect(distanceFromEnd(el), '前提: 末尾にいる').toBeLessThanOrEqual(1);
    const append = (): void => {
      data.messages = [...data.messages, `new ${data.messages.length}`];
      handle.renderNow();
    };
    return { el, handle, append, pane: pane! };
  };

  it('render と scrollTop の書き込みの間に上へスクロールしても、引き戻されない', async () => {
    const { el, handle, append } = await mount();
    append(); // この render で「端にいた」と測られ、次のフレームでの書き込みが予約される
    const before = el.scrollTop;
    el.scrollTop = before - 100; // その間に、ホイール 1 目盛りぶん上へ
    await frames(3);
    expect(el.scrollTop, '上へ動かした位置のまま').toBe(before - 100);

    // 内容が増え続けても、離れたままでいられる
    for (let i = 0; i < 5; i++) {
      append();
      await frames(2);
    }
    expect(el.scrollTop).toBe(before - 100);
    handle.unmount();
  });

  it('threshold より小さい移動 (↑キー 1 回ぶん = 40px) でも、離れた時点で追従をやめる', async () => {
    const { el, handle, append } = await mount({ follow: 'bottom', threshold: 50 });
    const end = el.scrollTop;
    for (let step = 1; step <= 3; step++) {
      el.scrollTop = end - 40 * step;
      await frames(2); // scroll イベントが届く
      append();
      await frames(2);
      expect(el.scrollTop, `${step} 回目: 戻されていない`).toBe(end - 40 * step);
    }
    handle.unmount();
  });

  it('端の近く (threshold 以内) まで戻ると、追従を再開する', async () => {
    const { el, handle, append } = await mount({ follow: 'bottom', threshold: 50 });
    el.scrollTop = el.scrollTop - 200;
    await frames(2);
    append();
    await frames(2);
    expect(distanceFromEnd(el), '前提: 離れている').toBeGreaterThan(100);

    el.scrollTop = el.scrollHeight - el.clientHeight - 20; // 端から 20px のところまで戻る
    await frames(2);
    append();
    await frames(3);
    expect(distanceFromEnd(el), '追従が再開して末尾にいる').toBeLessThanOrEqual(1);
    handle.unmount();
  });

  it('内容が減って scrollTop が押し戻されただけでは、追従をやめない', async () => {
    const app = setupApp();
    let pane: ReturnType<typeof createScrollPane>;
    const data = { messages: Array.from({ length: 30 }, (_, i) => `msg ${i}`) };
    const handle = createApp('#app', {}, () => (pane ? pane({ style: { height: '200px' }, children: renderMessages(data.messages) }) : null));
    pane = handle.use(createScrollPane({ follow: 'bottom' }));
    await flush(50);
    const el = app.querySelector('.ric-scroll-pane') as HTMLElement;
    pane!.scrollToBottom();
    await flush(50);

    data.messages = data.messages.slice(0, 20); // 10 行減る → ブラウザが scrollTop を末尾へ押し戻す
    handle.renderNow();
    await frames(3);
    expect(distanceFromEnd(el)).toBeLessThanOrEqual(1);

    data.messages = [...data.messages, 'a', 'b', 'c'];
    handle.renderNow();
    await frames(3);
    expect(distanceFromEnd(el), '減った後も追従している').toBeLessThanOrEqual(1);
    handle.unmount();
  });

  it("follow: 'top' でも同じ: 下へ離れたら戻されず、上端の近くへ戻ると再開する", async () => {
    const app = setupApp();
    let pane: ReturnType<typeof createScrollPane>;
    const data = { messages: Array.from({ length: 30 }, (_, i) => `msg ${i}`) };
    const handle = createApp('#app', {}, () => (pane ? pane({ style: { height: '200px' }, children: renderMessages(data.messages) }) : null));
    pane = handle.use(createScrollPane({ follow: 'top', threshold: 50 }));
    await flush(50);
    const el = app.querySelector('.ric-scroll-pane') as HTMLElement;
    const prepend = (): void => {
      data.messages = [`new ${data.messages.length}`, ...data.messages];
      handle.renderNow();
    };
    prepend();
    await frames(3);
    expect(el.scrollTop, '前提: 上端を追っている').toBe(0);

    el.scrollTop = 40;
    await frames(2);
    prepend();
    await frames(3);
    expect(el.scrollTop, '下へ離れたら戻されない').toBe(40);

    el.scrollTop = 10;
    await frames(2);
    prepend();
    await frames(3);
    expect(el.scrollTop, '上端の近くへ戻ると再開').toBe(0);
    handle.unmount();
  });

  it('利用者が渡した onscroll も呼ばれる', async () => {
    let calls = 0;
    const { el, handle } = await mount({ follow: 'bottom' }, { onscroll: () => { calls += 1; } });
    el.scrollTop = el.scrollTop - 100;
    await frames(3);
    expect(calls).toBeGreaterThan(0);
    handle.unmount();
  });
});
