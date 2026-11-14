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
