// ricdom/ui — Component<P> 契約の内部ヘルパー (設計書 §3.4/A)
//
// 状態を持つ部品 (dialog/popup/toast/tooltip) は `app.use(createXxx())` で登録して
// 初めて host ({ notify, portal, app }) を受け取る。use() を経由せず render 内で
// 直接呼ばれた場合は「初回だけ console.error し、何も描画しない (NOOP)」ことで
// 検知する — v1 の __notify 暗黙注入と違い、置き場所を間違えようがない構造にする
// (設計書 A)。4 部品共通のこの挙動を 1 箇所にまとめる。

// パッケージ内部では相対パスでコア (`ricdom`) を参照する (self-reference は npm link 等が
// 無いと解決できないため。公開後の consumer は `import type { Host } from 'ricdom'` を使う)。
import type { Host, RicNode } from '../../types.js';
import { warnIfStylesMissing } from '../injectStyles.js';
import { promotePortalToTopLayer } from './topLayer.js';

export type { Host };

/** `app.use(part)` に渡す部品の呼び出し可能インターフェース (設計書 A)。 */
export interface Component<P> {
  (props: P): RicNode;
  /** app.use() が登録時に呼ぶ。host を経由して初めて notify/portal が使えるようになる。 */
  attach(host: Host): void;
  /** app.unmount() 等で登録解除される際に呼ばれる。イベント解除・内部状態のリセットを行う。 */
  dispose(): void;
  /**
   * app の render サイクルごとに portal へ描画すべき内容を返す (コアの `UsePart.renderPortal`
   * のブリッジ、設計書 §3.5)。dialog/popup/toast/tooltip はこれを実装する。状態を持たず
   * portal も使わない部品 (uiButton 等) には無い。
   */
  renderPortal?(): RicNode;
}

/**
 * onanimationend で完了させる処理 (close 後の DOM 除去・open 後の初期フォーカス等) の
 * フォールバック猶予 (ms)。
 *
 * dialog/popup/toast の状態遷移の「完了」を実 CSS アニメーションの animationend に
 * 委ねている箇所は、consumer が `ricdom-ui.css` を読み込み忘れる (または CSS を独自に
 * 差し替えてアニメーションを持たない) と、対応するイベントが永久に発火せず処理が
 * 完了しない (dialog が閉じられない・toast が消えない 等) — 実ブラウザテストで発見した
 * 実害のあるバグ。コアの描画スケジューラが rAF + setTimeout バックストップの二重化
 * (v1 FACT A6) を持つのと同じ考え方で、animationend を待つ全箇所に setTimeout の
 * バックストップを併設する。組み込みテーマの最大 duration (aqua の 600ms) より
 * 十分長く取り、実アニメーションを踏み台にしない。ハンドラ側は「2 回呼ばれても安全」
 * (べき等) であることが前提 (dialog/popup/toast 側で保証)。
 */
export const ANIMATION_FALLBACK_MS = 700;

export interface AttachGuard {
  readonly host: Host | null;
  attach: (host: Host) => void;
  dispose: () => void;
  /** host が無ければ (= use() されていなければ) 初回だけ console.error して null を返す */
  ensure: () => Host | null;
}

export interface AttachGuardOptions {
  /**
   * portal に描画する浮遊部品 (dialog / popup / dropdown / toast / tooltip) は true。
   * attach 時と毎 render (ensure) で、アプリ専用 portal を top layer に上げる
   * (internal/topLayer.ts、2.0.0-alpha.26)。
   */
  topLayer?: boolean;
}

/**
 * 状態を持つ部品で共有する「host 未接続検知」の実装。
 * `componentName` はエラーメッセージに使う (例: 'createDialog')。
 */
export const createAttachGuard = (componentName: string, options: AttachGuardOptions = {}): AttachGuard => {
  let host: Host | null = null;
  let warned = false;
  const { topLayer = false } = options;

  return {
    get host() {
      return host;
    },
    attach: (h: Host) => {
      host = h;
      warned = false; // 再 attach (再 use()) されたら警告状態もリセットする
      if (typeof document !== 'undefined') warnIfStylesMissing(document);
      if (topLayer) promotePortalToTopLayer(h.portal);
    },
    dispose: () => {
      host = null;
    },
    ensure: () => {
      if (host) {
        // 毎 render で確認する (既に上がっていれば matches 1 回で終わる)。attach 時点では
        // target が未接続だった場合や、app を別の親へ移して popover が閉じた場合の再昇格。
        if (topLayer) promotePortalToTopLayer(host.portal);
        return host;
      }
      if (!warned) {
        warned = true;
        console.error(
          `RicDOM UI: ${componentName}() は app.use() で登録されていません。\n` +
            `✅ 例: const part = app.use(${componentName}()); render 内で part({ ... }) を呼んでください。\n` +
            '   (use() を経由しない呼び出しは host が無いため、何も描画されません)',
        );
      }
      return null;
    },
  };
};
