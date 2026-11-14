// RicDOM 2 — 描画スケジューラ (requestAnimationFrame + setTimeout バックストップ)
//
// v1 (src/ricdom.js の create_render_scheduler) をそのまま TypeScript へ移植したもの。
// アルゴリズムは変更していない (v1 踏襈)。
//
// rAF は hidden タブ・kiosk の全画面遷移・Electron の backgroundThrottling 等で
// 発火しないことがある。schedule 時に rAF と setTimeout(200ms) の両方を張り、
// 先に発火した方が描画する (フラグガードで他方は no-op)。200ms は「健常な rAF
// (~16ms) の描画タイミングを邪魔せず、かつ詰まったときの復旧が体感できる速さ」
// として v1 で選定された値 (Unizon kiosk consumer 報告)。

export interface RenderScheduler {
  scheduleRender: () => void;
  // renderNow は v1 の render_now に当たる。
  /**
   * renderNow() のように scheduleRender を経由せず外部から直接描画した直後に呼ぶ。
   * 保留中の rAF / バックストップを解除し、後追いで二重描画するのを防ぐ。
   */
  cancelPending: () => void;
}

export const createRenderScheduler = (doRender: () => void): RenderScheduler => {
  let renderScheduled = false;
  let rafId: number | null = null;
  let backstopId: ReturnType<typeof setTimeout> | null = null;

  const run = (): void => {
    if (!renderScheduled) return; // 相方が処理済み、または外部で描画済み (render_now 等)
    renderScheduled = false;
    rafId = null;
    if (backstopId !== null) {
      clearTimeout(backstopId);
      backstopId = null;
    }
    doRender();
  };

  const scheduleRender = (): void => {
    if (renderScheduled) return; // 同一フレーム内の重複登録を防ぐ
    renderScheduled = true;
    rafId = requestAnimationFrame(run);
    backstopId = setTimeout(run, 200);
  };

  const cancelPending = (): void => {
    if (!renderScheduled) return;
    renderScheduled = false;
    if (rafId !== null) {
      if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(rafId);
      rafId = null;
    }
    if (backstopId !== null) {
      clearTimeout(backstopId);
      backstopId = null;
    }
  };

  return { scheduleRender, cancelPending };
};
