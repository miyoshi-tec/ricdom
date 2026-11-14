// RicDOM 2 — createApp (v1 の create_RicDOM 後継)
//
// v1 との主な相違点、および確定した仕様 (設計書 §12 参照):
//   - `createApp(target, state, render)` の 3 引数。v1 の「state の中に render を同梱する」
//     形は TS で `S` の推論が自己参照になり render 内の `s` が `any` に落ちるため、
//     render を独立した第 3 引数にした。canon は 1 つ (state 同梱オーバーロードは持たない)。
//   - target が未解決のとき: v1 の 20 秒ポーリングは持たず、`DOMContentLoaded` を 1 回だけ
//     待って再解決する。それでも無ければ console.error + 型付き NOOP。
//   - 複数 createApp() 呼び出し間での state 共有 (v1 の WeakMap 経由の shared state) は
//     持たない。1 createApp = 1 独立 state。設計書にこの機能への言及が無いため実装しない。
//   - `render` は state の他プロパティとは別枠で管理する (v1 踏襲: 代入は同期描画、
//     Proxy の 1 段目/2 段目追跡ルールの対象外)。

import type { App, CreateAppOptions, Host, RenderFn, RicElementNode, RicNode, UsePart } from './types.js';
import { buildDomNode, patchChildren } from './dom.js';
import { createRenderScheduler } from './scheduler.js';
import { clearPendingDeepWarnings, createReactiveState } from './reactivity.js';

// =====================================================================
// NOOP App (設計書 §3.6、v1 の NOOP_PROXY を型付きで再定義)
// =====================================================================

// ターゲットを関数にすることで apply トラップが使える (NOOP_APP() のような誤用でも壊れない)。
// モジュールスコープの単一インスタンスとして保持する (get のたびに新規生成すると
// メモリリークするため、自分自身を返す設計。v1 踏襲)。
const noopFunction = (): unknown => NOOP_INSTANCE;
const NOOP_INSTANCE: object = new Proxy(noopFunction, {
  get: () => NOOP_INSTANCE,
  set: () => true,
  apply: () => NOOP_INSTANCE,
  deleteProperty: () => true,
});

// 実体は v1 と同じ universal proxy。throw しない・グルーコードを連鎖破壊しない、という
// v1 の哲学 A9 を型安全なまま継承する (設計書 §3.6 / B14)。
/**
 * 無効な target・state・render に対して返す「型付き NOOP App」。
 * 実体は何を読んでも・呼んでも自分自身を返す Proxy だが、戻り値の型は `App<S>` を満たすため、
 * 呼び出し側の TypeScript コードは分岐なしに `app.count` や `app.renderNow()` を
 * そのまま書ける (throw しない・グルーコードを連鎖破壊しない)。
 */
export const createNoopApp = <S extends object>(): App<S> => NOOP_INSTANCE as unknown as App<S>;

// =====================================================================
// target 解決
// =====================================================================

const isDomElement = (target: unknown): target is Element => typeof Element !== 'undefined' && target instanceof Element;

const resolveTargetElement = (target: string | Element): Element | null => {
  if (typeof target === 'string') return document.querySelector(target);
  if (isDomElement(target)) return target;
  return null;
};

// =====================================================================
// createApp
// =====================================================================
//
// 単一シグネチャ (canon は 1 つ、設計書 §12): render を第 3 引数として独立させることで
// `S` は `state` 引数から素直に推論され、`render` コールバック内の `s` パラメータも
// (v1 の「state に render を同梱する」形で起きていた自己参照問題無しに) 完全に型付く。
// 第 4 引数 `options` (省略可) は portal の描画先を差し替える `portalTo` のみを持つ
// (設計書 §3.5)。

/**
 * RicDOM アプリを作成し、target 要素へ同期的に初回描画する。
 *   createApp('#app', { count: 0 }, (s) => ({ tag: 'div', children: [String(s.count)] }))
 */
export const createApp = <S extends object>(
  target: string | Element,
  state: S,
  render: RenderFn<S>,
  options?: CreateAppOptions<S>,
): App<S> => createAppImpl(target, state, render, options);

const createAppImpl = <S extends object>(
  target: string | Element,
  state: S,
  render: RenderFn<S>,
  options: CreateAppOptions<S> | undefined,
): App<S> => {
  // ── 引数バリデーション (throw しない: console.error + NOOP App、設計書 §3.6) ──
  if (typeof target !== 'string' && !isDomElement(target)) {
    console.error(
      'RicDOM: createApp の第 1 引数は CSS セレクタ文字列または DOM 要素です。\n' +
        "✅ 例: createApp('#app', { count: 0 }, (s) => ({ tag: 'div', children: [s.count] }))",
    );
    return createNoopApp<S>();
  }

  if (state === null || typeof state !== 'object') {
    console.error('RicDOM: createApp の第 2 引数 state はオブジェクトである必要があります。');
    return createNoopApp<S>();
  }

  if (typeof render !== 'function') {
    console.error(
      'RicDOM: createApp の第 3 引数 render は関数である必要があります。\n' +
        "✅ 例: createApp('#app', { count: 0 }, (s) => ({ tag: 'div', children: [s.count] }))",
    );
    return createNoopApp<S>();
  }

  const targetEl = resolveTargetElement(target);
  if (targetEl) return createResolvedApp<S>(targetEl, state, render, options);

  // target が (型上は妥当だが) 今この瞬間には見つからない。
  // `<head>` 内 script などで body がまだパースされていない典型ケースだけを、
  // DOMContentLoaded を 1 回だけ待って救う (v1 の 20 秒ポーリングは持たない、設計書 §12)。
  if (typeof document !== 'undefined' && document.readyState === 'loading') {
    return createDeferredApp<S>(target, state, render, options);
  }

  console.error(`RicDOM: target "${String(target)}" が見つかりません。`);
  return createNoopApp<S>();
};

// =====================================================================
// target 未解決時の一時ハンドル (DOMContentLoaded を 1 回だけ待つ)
// =====================================================================
//
// DOMContentLoaded 発火まで実 DOM が無いため、state の読み書きだけを素の object に対して
// 許可する「間接 Proxy」を返す (get/set は常に最新の委譲先 (`inner`) に転送する)。
// DOMContentLoaded 発火時に target が見つかれば、その時点までに行われた state の変更を
// 引き継いだまま通常の App (createResolvedApp) に切り替わり、同期初回描画が走る。
// 見つからなければ console.error を出し、以降は型付き NOOP として振る舞う。
const createDeferredApp = <S extends object>(
  target: string | Element,
  bufferState: S,
  render: RenderFn<S>,
  options: CreateAppOptions<S> | undefined,
): App<S> => {
  let inner: App<S> | null = null;

  const finalize = (): void => {
    if (inner) return; // 二重発火の防御 (once: true だが念のため)
    const resolved = resolveTargetElement(target);
    if (resolved) {
      inner = createResolvedApp<S>(resolved, bufferState, render, options);
    } else {
      console.error(`RicDOM: target "${String(target)}" が見つかりません (DOMContentLoaded 後も解決できませんでした)。`);
      inner = createNoopApp<S>();
    }
  };

  document.addEventListener('DOMContentLoaded', finalize, { once: true });

  return new Proxy(bufferState as Record<PropertyKey, unknown>, {
    get(target_, prop, receiver) {
      if (inner) return Reflect.get(inner as object, prop);
      if (prop === 'render') return render;
      if (prop === 'renderNow' || prop === 'unmount') return () => {}; // まだ描画対象が無い
      if (prop === 'nextRender') return () => new Promise<void>(() => {}); // 解決するまで resolve しない
      // target 未解決の間は portal が存在しないため attach() を呼べない。
      // part はそのまま返す (NOOP 流儀) — 解決後に呼び直してもらう必要がある
      // (DOMContentLoaded 待ちのごく短い窓のみの制約、設計書に言及なし・既知の穴)。
      if (prop === 'use') return (part: UsePart) => part;
      if (prop === 'refs') return new Map<string, Element>();
      return Reflect.get(target_, prop, receiver);
    },
    set(target_, prop, value) {
      if (inner) return Reflect.set(inner as object, prop, value);
      return Reflect.set(target_, prop, value);
    },
    deleteProperty(target_, prop) {
      if (inner) return Reflect.deleteProperty(inner as object, prop);
      return Reflect.deleteProperty(target_, prop);
    },
  }) as App<S>;
};

// =====================================================================
// 解決済み target からの本実装
// =====================================================================

// portal の描画先を自前生成する場合、target 直下の末尾に置く「島」の目印ノード
// (設計書 §3.5)。island: true なので子孫は build/patch されず、portal 要素自身の
// 中身は下記の portal 専用パッチサイクルが別途管理する。
//
// `key` を固定値で持たせるのが重要: render() のトップレベルが null/false 等の
// invisible を返す render とそうでない render が交互に起きると、
// normalizeChildren が invisible を除去した結果 [mainTree, PORTAL_SENTINEL] の
// 「配列上のインデックス」が render ごとに 0 だったり 1 だったりズレる
// (invisible な render では portal がインデックス 0 に繰り上がる)。key が無いと
// position-based reconciliation はこのインデックスの主だけを見て「型が変わった」と
// 誤判定し、portal の実 DOM ノードを破棄して新しい要素を作ってしまう
// (キャッシュ済みの portal 要素参照が指す DOM ノードが浮遊し、以後の portal
// パッチが実際には画面に繋がっていないノードに対して行われる、という実害のあるバグ
// だった。実装中に発見・修正)。key を持たせることで key-based reconciliation
// (dom.ts の patchChildrenByKey) が使われ、位置に関係なく同一の DOM ノードが
// 常に再利用されることを保証する。
const PORTAL_SENTINEL: RicElementNode = {
  tag: 'div',
  island: true,
  key: '__ricdom_portal__',
  'data-ricdom-role': 'portal',
} as RicElementNode;

const isPortalSentinelEl = (el: Element): boolean => el.getAttribute('data-ricdom-role') === 'portal';

const createResolvedApp = <S extends object>(
  targetEl: Element,
  state: S,
  initialRender: RenderFn<S>,
  options: CreateAppOptions<S> | undefined,
): App<S> => {
  let isDestroyed = false;
  let currentRenderFn: RenderFn<S> = initialRender;
  const refsMap = new Map<string, Element>();
  const registeredParts = new Set<UsePart>();

  // portal の描画先 (設計書 §3.5)。`portalTo` 指定時はそれを直接使う (target の子として
  // 管理しない = target 側の children 配列には登場しない)。省略時は target 直下の末尾に
  // 自前生成し、target の子要素リストの一部として (末尾固定の島として) 管理する。
  const ownPortal = options?.portalTo === undefined;
  const externalPortalEl = options?.portalTo;
  let portalEl: Element | null = ownPortal ? null : (externalPortalEl as Element);

  // 「target 直下の children 配列」としての prev/next。ownPortal のときは
  // [mainTree, PORTAL_SENTINEL] の 2 要素、そうでなければ [mainTree] の 1 要素として扱う。
  // これにより既存の position/key-based reconciliation (dom.ts) をそのまま再利用でき、
  // portal 用の特別なパッチ経路を dom.ts 側に持たせる必要が無い。
  let prevTargetChildren: RicNode[] = [];
  let prevPortalChildren: RicNode[] = [];
  let isFirstRender = true;

  // nextRender() 用の保留 Promise (呼ばれるまで作らない、v1 踏襲)
  let pendingResolve: (() => void) | null = null;
  let pendingPromise: Promise<void> | null = null;

  // 2.0.0-alpha.2: portal 内 ref の 1 render 遅れ修正 (パイロット第 2 号の報告)。
  // 単一 root ではなく target + (portalTo 指定時のみ) 外部 portal を両方集める —
  // 呼び出しタイミングを doRender 内で portal パッチの「後」に動かすのと対 (下記)。
  // ownPortal のときは portalEl が targetEl の子孫なので targetEl 側の
  // querySelectorAll だけで portal 内の ref も一緒に拾える (二重登録の心配は無い、
  // Map への set は同じ要素なら同じ結果)。
  const registerRefs = (): void => {
    refsMap.clear();
    const roots = portalEl && !ownPortal ? [targetEl, portalEl] : [targetEl];
    for (const root of roots) {
      for (const node of root.querySelectorAll<HTMLElement>('[data-ricdom-ref]')) {
        const name = node.dataset.ricdomRef;
        if (name) refsMap.set(name, node);
      }
    }
  };

  // 登録済み part から今フレームの portal 内容を集める (v1 の _page_portal_queue.drain 後継、
  // ただし push キューではなく「毎 render 時に現在の内容を尋ねる」プル方式。
  // page への依存が無いので「drain されず溜まり続ける」silent failure が構造的に起きない)。
  const collectPortalChildren = (): RicNode[] => {
    const out: RicNode[] = [];
    for (const part of registeredParts) {
      if (typeof part.renderPortal === 'function') out.push(part.renderPortal());
    }
    return out;
  };

  const doRender = (): void => {
    if (isDestroyed) return;

    const nextTree = currentRenderFn(appHandle);
    const nextTargetChildren: RicNode[] = ownPortal ? [nextTree, PORTAL_SENTINEL] : [nextTree];

    if (isFirstRender) {
      targetEl.innerHTML = ''; // 初回のみ target 内の既存内容を丸ごと引き取る (v1 踏襲)
      isFirstRender = false;
    }
    patchChildren(prevTargetChildren, nextTargetChildren, targetEl);
    prevTargetChildren = nextTargetChildren;

    if (ownPortal && portalEl === null) {
      // PORTAL_SENTINEL に対応する実 DOM 要素を 1 度だけ特定してキャッシュする
      // (以後は同じ島ノードが使い回されるので再検索不要)。
      for (const child of targetEl.children) {
        if (isPortalSentinelEl(child)) {
          portalEl = child;
          break;
        }
      }
      flushPendingAttach(); // portal 確定前に use() された part があれば、ここで初めて attach する
    }

    if (portalEl) {
      const nextPortalChildren = collectPortalChildren();
      patchChildren(prevPortalChildren, nextPortalChildren, portalEl);
      prevPortalChildren = nextPortalChildren;
    }

    // registerRefs は portal パッチの「後」に呼ぶ (2.0.0-alpha.2 修正)。旧実装は
    // target パッチ直後・portal パッチ前に呼んでいたため、dialog 等 portal 内の
    // `ref` は当該 render の DOM にはまだ反映されておらず、次の render まで
    // `app.refs.get()` で取れなかった (パイロット第 2 号の報告、コアのバグ)。
    registerRefs();

    if (pendingResolve) {
      const resolve = pendingResolve;
      pendingResolve = null;
      pendingPromise = null;
      resolve();
    }
  };

  const { scheduleRender, cancelPending } = createRenderScheduler(() => {
    if (!isDestroyed) doRender();
  });

  // state 本体は浅い Proxy でラップする (設計書 §3.3)。render はここには含まれない
  // (render/renderNow/nextRender/use/unmount/refs は下の予約キー経由で appHandle が扱う)。
  const reactiveState = createReactiveState(state as unknown as Record<string, unknown>, scheduleRender);

  // ── API 実装 ──────────────────────────────────────────────

  const apiRenderNow = (): void => {
    if (isDestroyed) return;
    // renderNow() は reactiveState の Proxy trap を経由せず直接描画するため、深い
    // 代入の発火忘れ pending (src/reactivity.ts) が自動では破棄されない。この直後の
    // doRender() が state 全体を再読むので、その場で書いた深い変更も反映される
    // (= 通常の notify で発火したのと同じ結果) → pending を明示的に破棄する。
    // dev ガードを掛けても (esbuild の DCE を実測で確認済み) この 1 行はモジュール
    // 境界をまたぐ関数呼び出しのため折り畳まれず production からも消えない
    // (isDevMode 定義直前のコメントの「関数境界を越えると DCE が止まる」と同種)。
    // clearPendingDeepWarnings 自体が WeakMap.get の no-op で production でも
    // 無害なため、isDevMode() 単体と同じ「小さな例外」として無条件に呼ぶ。
    clearPendingDeepWarnings(state);
    cancelPending(); // 保留中の rAF/バックストップを解除し、二重描画を防ぐ (v1 踏襲)
    doRender();
  };

  const apiNextRender = (): Promise<void> => {
    if (!pendingPromise) {
      pendingPromise = new Promise<void>((resolve) => {
        pendingResolve = resolve;
      });
    }
    return pendingPromise;
  };

  // 正式な部品契約 (設計書 §3.4)。host ({ notify, portal, app }) を渡すのはここだけ —
  // render 内で `use()` を経由せず直接呼ばれた part は host を受け取れないため、
  // 部品側 (ricdom/ui の Component<P>) が「初回だけ console.error して何も描画しない」
  // ことで検知できる (v1 の __notify 暗黙注入と違い、置き場所を間違えようがない)。
  const apiUse = <T extends UsePart>(part: T): T => {
    if (isDestroyed) return part;
    if (registeredParts.has(part)) return part; // 二重登録は no-op (べき等)
    registeredParts.add(part);
    if (portalEl) {
      // portalTo 指定時は最初から確定しているのでここに来る。自前 portal の場合も
      // 初回 render 後 (通常は createApp() の戻り値を受け取った時点で既に完了している) なら。
      const host: Host = { notify: scheduleRender, portal: portalEl, app: appHandle };
      part.attach?.(host);
      // 登録直後に renderPortal() の内容を portal へ反映する (part が自分から
      // host.notify() を呼ばなくても、use() した時点の内容は次の描画で拾われる)。
      scheduleRender();
    } else {
      // 自前 portal がまだ実 DOM に解決していない (初回 render 前) 場合のみここに来る。
      // 初回 render 直後 (flushPendingAttach) にまとめて attach する。
      pendingAttachParts.add(part);
    }
    return part;
  };

  // portal 要素の解決前 (初回 render 前) に use() された part を保留し、初回 render 後に
  // まとめて attach する (createApp は生成時に同期初回描画するため、この配列は基本的に
  // 「render 関数の外、createApp 呼び出し直後に use() された」ごく短い間しか使われない)。
  const pendingAttachParts = new Set<UsePart>();
  const flushPendingAttach = (): void => {
    if (pendingAttachParts.size === 0 || !portalEl) return;
    const host: Host = { notify: scheduleRender, portal: portalEl, app: appHandle };
    for (const part of pendingAttachParts) part.attach?.(host);
    pendingAttachParts.clear();
  };

  const apiUnmount = (): void => {
    if (isDestroyed) return;
    isDestroyed = true;
    cancelPending();
    for (const part of registeredParts) part.dispose?.();
    registeredParts.clear();
    pendingAttachParts.clear();
    refsMap.clear();
  };

  // ── インスタンスハンドル ────────────────────────────────────
  // state へのアクセスは reactiveState に委譲しつつ、render/renderNow/nextRender/use/
  // unmount/refs は per-instance の予約キーとして割り込む (v1 の instance_handle 継承)。
  const RESERVED_KEYS = new Set(['render', 'renderNow', 'nextRender', 'use', 'unmount', 'refs']);

  const appHandle = new Proxy(reactiveState, {
    get(target, prop, receiver) {
      if (prop === 'render') return currentRenderFn;
      if (prop === 'renderNow') return apiRenderNow;
      if (prop === 'nextRender') return apiNextRender;
      if (prop === 'use') return apiUse;
      if (prop === 'unmount') return apiUnmount;
      if (prop === 'refs') return refsMap;
      return Reflect.get(target, prop, receiver);
    },
    set(target, prop, value) {
      if (prop === 'render') {
        if (typeof value === 'function') {
          currentRenderFn = value as RenderFn<S>;
          // render の (再) 設定は同期描画する (FOUC 防止、v1 の shared_proxy.render 挙動踏襲)
          doRender();
          return true;
        }
        console.error('RicDOM: render は関数である必要があります。');
        return true;
      }
      if (RESERVED_KEYS.has(prop as string)) {
        console.error(`RicDOM: "${String(prop)}" は予約済みのプロパティ名です (上書きできません)。`);
        return true;
      }
      return Reflect.set(target, prop, value);
    },
    deleteProperty(target, prop) {
      if (RESERVED_KEYS.has(prop as string)) return true; // 予約キーの削除は無視する
      return Reflect.deleteProperty(target, prop);
    },
  }) as App<S>;

  // setup オプション (パイロット移行の報告 #5): 初回 render の直前に 1 回だけ呼ぶ。
  // ownPortal は通常 PORTAL_SENTINEL 経由で初回 doRender() の中で初めて portalEl が
  // 確定する (attach() もそれ以降) が、setup 内の use() を初回 render から効かせるには
  // その前に portal を確定させる必要があるため、ここで前倒しして 1 回だけ構築する
  // (setup 省略時はこの分岐に入らず、既存の遅延生成のまま)。
  if (options?.setup) {
    if (ownPortal && portalEl === null) {
      targetEl.innerHTML = ''; // 初回 doRender() 側の「初回だけクリア」を前倒しする
      isFirstRender = false;
      portalEl = buildDomNode(PORTAL_SENTINEL, targetEl.namespaceURI) as Element;
      targetEl.appendChild(portalEl);
      // 前倒しで作った portal を「前回の描画結果」として扱う。normalizeChildren が
      // 不可視要素を落とすので、prevChildren は正規化後 [PORTAL_SENTINEL] の 1 件になり
      // 上で appendChild した実 DOM ノードと index が一致する (key-based reconciliation が
      // 同一ノードとして再利用する)。
      prevTargetChildren = [PORTAL_SENTINEL];
    }
    try {
      options.setup(appHandle);
    } catch (err) {
      console.error('RicDOM: setup 失敗', err);
    }
  }

  // 生成時に同期初回描画する (v1 踏襲)
  doRender();

  return appHandle;
};
