// テスト共通ヘルパー。vitest の jsdom 環境 (vitest.config.ts) 上で動く前提。
export const setupApp = (): HTMLDivElement => {
  document.body.innerHTML = '<div id="app"></div>';
  return document.getElementById('app') as HTMLDivElement;
};

/** rAF (+ 必要なら setTimeout バックストップ) が一巡して DOM commit が終わるのを待つ */
export const flush = (ms = 30): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * 深い代入の発火忘れ警告 (src/reactivity.ts の scheduleFlush、queueMicrotask 1 回分) が
 * flush されるのを待つ。setTimeout ではなく queueMicrotask を使うのは、こちらが
 * マクロタスクの完了を待たず「同じタスクの直後」の意味を保つため (setTimeout(0) でも
 * 動くが、マクロタスク境界をまたぐぶん「同じタスク内で発火したか」の判定タイミングが
 * ずれ得る)。
 */
export const flushMicrotasks = (): Promise<void> => new Promise((r) => queueMicrotask(r));

/**
 * 浮遊面 (popup / dropdown / dialog …) が **最終状態** になるまで待って、その要素を返す。
 * 条件: 要素が現れている / 実測用の非表示 render (`visibility: hidden`) を抜けている /
 * 開閉アニメーションが終わっている。
 *
 * 位置や大きさを assert する前は、固定時間待ち (`flush(150)` など) ではなくこれを使う。
 * 固定時間待ちは遅い環境で早すぎて落ちるだけでなく、**速い環境でアニメーションの途中を測って
 * 偽の緑になる** (2.0.0-alpha.31: popup の下端が画面を 2px はみ出すバグを、`scaleY(0.6→1)` の
 * 途中 = 実寸より小さい瞬間を測っていたローカルのテストが見逃し、遅い CI だけが検出していた)。
 * 実ブラウザ専用 (jsdom には getAnimations が無いので、呼べば要素が現れた時点で返る)。
 */
/**
 * 条件が成り立つまで待つ (16ms ごとに確かめる)。固定時間待ちの代わりに使う。
 * 成り立たなければ `what` を含むメッセージで throw する (= テストはそこで落ちる)。
 */
export const until = async (cond: () => boolean, what = '条件', timeout = 3000): Promise<void> => {
  const t0 = performance.now();
  while (!cond()) {
    if (performance.now() - t0 > timeout) throw new Error(`until: ${timeout}ms 待っても成り立たなかった: ${what}`);
    await new Promise((r) => setTimeout(r, 16));
  }
};

const dialogEl = (): HTMLElement | null => document.querySelector('[role="dialog"]');

/**
 * ダイアログが **開ききる** まで待って、その要素を返す: 要素がある / 開くアニメーションが終わった /
 * 初期フォーカスがダイアログの中に入った (createDialog は `animationend` を合図にフォーカスを移す)。
 * `setTimeout(300)` で待つと、遅い環境ではアニメーションが終わる前に assert して落ちる
 * (背景が inert になった直後で、フォーカスは body にある。2026-11-14 の CI で実際に起きた)。
 */
export const dialogOpened = async (timeout = 3000): Promise<HTMLElement> => {
  const el = await settled(dialogEl, timeout);
  await until(() => el.contains(document.activeElement), '初期フォーカスがダイアログの中に入る', timeout);
  return el;
};

/**
 * ダイアログが **閉じきる** まで待つ: 閉じるアニメーションが終わり、要素が DOM から消えるまで。
 * createDialog は「背景の inert 解除 → フォーカス復帰 → 再描画で要素を外す」の順に片付けるので、
 * 要素が消えた時点でフォーカスと inert も片付いている。
 */
export const dialogClosed = (timeout = 3000): Promise<void> => until(() => dialogEl() === null, 'ダイアログが DOM から消える', timeout);

/**
 * createDialog のバックストップ (`ANIMATION_FALLBACK_MS` = 700ms、animationend が来ないときの保険)
 * が発火し終わるまで待つ。「バックストップが後から発火してもフォーカスを奪わない」を確かめる
 * テスト用で、準備待ちではなく **時間そのものが検証対象**。必ず dialogOpened() の後に呼ぶ
 * (開いた時点から数えれば、遅い環境でも確実にタイマーより後になる)。
 */
export const pastDialogBackstop = (): Promise<void> => new Promise((r) => setTimeout(r, 750));

export const settled = async (get: () => HTMLElement | null, timeout = 3000): Promise<HTMLElement> => {
  const t0 = performance.now();
  for (;;) {
    const el = get();
    if (el && getComputedStyle(el).visibility !== 'hidden') {
      const running = (): Animation[] => (el.getAnimations?.() ?? []).filter((a) => a.playState !== 'finished');
      await Promise.all(running().map((a) => a.finished.catch(() => undefined)));
      if (get() === el && running().length === 0) return el;
    }
    if (performance.now() - t0 > timeout) throw new Error(`settled: ${timeout}ms 待っても最終状態にならなかった`);
    await new Promise((r) => setTimeout(r, 16));
  }
};
