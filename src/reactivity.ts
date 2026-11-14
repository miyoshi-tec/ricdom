// RicDOM 2 — リアクティビティ (浅い Proxy + dev の深い代入警告)
//
// 設計書 §3.3 の案 A (確定): 浅い Proxy (v1 と同じ) + 深い代入を dev で
// 検知して警告する。
//
// 追跡される深さ (v1 継承、用語は設計書の「1段目」に合わせる):
//   - state.x = v                     … 追跡される (トップレベル代入)
//   - state.obj.prop = v              … 追跡される (obj は 1 段目のオブジェクト。
//                                        obj 自体が set トラップ付き子 Proxy でラップされる
//                                        ため、その子 Proxy への代入は捕まる)
//   - state.obj.nested.prop = v       … 追跡されない (nested は 2 段目。読み出し時に
//                                        raw オブジェクトが返るため、その先の代入は
//                                        どの Proxy も経由しない)
//
// 2 段目以降の未追跡代入は「気づけない」のが実害 (v1 の負債 B5)。dev ビルドでは
// 2 段目以降の読み出しを read-only 相当の Proxy で包み、そこへの set を検知して
// console.warn する (代入自体はブロックしない。production と挙動を分岐させないため。
// 「気づかせる」ことが目的であり、「禁止する」ことが目的ではない)。
//
// dev/prod の切り替えは本来 `process.env.NODE_ENV` を都度読む設計だった (モジュール
// 読み込み時に 1 回だけ判定してキャッシュすると、テストで dev/prod 両方を切り替えて
// 検証できないため)。IIFE 配布版は tsup の define で 'production' を静的に焼き込み、
// この判定式ごと esbuild の dead-code elimination で消える —はずだったが、
// 2.0.0-alpha.10 で判明した穴 (統括確認済み): tsup/esbuild の `define` は
// `process.env.NODE_ENV` という「式全体」をトークンとして置換するだけで、OR 連鎖の
// 前 2 節 (`typeof process === 'undefined'` / `typeof process.env === 'undefined'`) は
// 置換対象外のまま生きたコードとして残る。`<script>` タグ直読みなど `process`
// グローバルが存在しないブラウザでは、この 2 節が常に true になり production ビルド
// (`.iife.min.js`) でも isDevMode() が true を返し続けてしまい、警告コードごと DCE
// されるという SPEC.md の記述が事実に反していた (grep で warn 文字列が min に残る
// ことを確認)。
//
// 対策の実装中にさらに判明した点 (esbuild の実機検証で確認、統括確認済み): 単に
// `isDevMode()` の中身を `typeof __RICDOM_DEV__ === 'boolean' ? ... : ...` という
// 定数畳み込み可能な形に書き換えるだけでは不十分だった。esbuild は「関数の中身が
// 定数に畳み込める」ことと「その関数の呼び出し箇所を定数に置き換える」ことを
// 結び付けない (関数呼び出しをまたいだ定数伝播/インライン化を行わない —
// `var f=()=>false; if(f()){...}` は実際にビルドしても `f` も `f()&&{...}` も
// 丸ごと残る。関数境界を越えると DCE が止まる)。呼び出し式 `isDevMode()` 自体を
// `if` の条件式から追い出さない限り、内部がどれだけ定数化されても warn コードは
// 物理的に残ってしまう。
//
// 正しい対策: `??` の左辺が「null/undefined でないと静的にわかる」場合、esbuild は
// 右辺を評価すらせず定数畳み込みできる (実測済み: `false ?? f()` → `false` に畳み込まれ
// `f` 呼び出しごと消える。逆に `X && false` のように定数を `&&` の右側に置くと、
// 左が非定数変数だと esbuild は畳み込まない — dom.ts 側で実際にこの順序違いで
// 一度ハマった。定数は必ず左に置くこと)。そこで、ビルド時に焼き込まれる生の値を
// トップレベル定数 `bakedDevMode` として先に確定させ (`typeof __RICDOM_DEV__` の
// 判定はここで一度だけ)、呼び出し側 (このファイルの wrapChild get トラップ、
// および dom.ts の重複 key 検知) は `isDevMode()` を直接呼ばず、必ず定数を左に
// 置いた `bakedDevMode ?? isDevMode()` の形で参照する。`.iife.min.js`
// (`__RICDOM_DEV__: 'false'` → `bakedDevMode` が定数 `false`) では
// `false ?? isDevMode()` が `false` に畳み込まれ、`isDevMode()` 呼び出しと
// それに続く wrapDeepWarn/console.warn のコードごと dead-code elimination される。
// `.iife.js` (`__RICDOM_DEV__: 'true'`) では `true ?? isDevMode()` が `true` に
// 畳み込まれ、警告コードが無条件に残る。ESM/CJS やバンドラを経由しない実行
// (ts-node、bundler なしの生 ESM import 等) では `__RICDOM_DEV__` は未定義のままなので
// `bakedDevMode` は `undefined` になり、`undefined ?? isDevMode()` は毎回
// `isDevMode()` を呼んで `process.env.NODE_ENV` を都度読む (テストで dev/prod を
// 切り替えて検証できる、従来どおりの動的挙動を維持)。`process` 自体が存在しない
// 環境では「判定不能なら dev 扱い」という方針を維持する (「silent failure を
// 増やさない」という本ライブラリの一貫した方針を、判定不能なケースでも優先するため)。
// `declare const __RICDOM_DEV__` の型宣言は src/env.d.ts。
//
// dom.ts の key 重複警告 (#13) も同じ判定規則を使うため `isDevMode` と `bakedDevMode`
// の両方を export する。1 箇所に定義を寄せて重複定義を避ける (dom.ts はここから
// import する)。`isDevMode()` 単体 (`bakedDevMode` を経由しない素の呼び出し) は
// 外部 API・テスト用途に残す — DCE 対象にならないことを許容した上での「常に正しい
// 判定を返す関数」としての役割は変わらない。
export const bakedDevMode: boolean | undefined = typeof __RICDOM_DEV__ === 'boolean' ? __RICDOM_DEV__ : undefined;

export const isDevMode = (): boolean => {
  if (bakedDevMode !== undefined) return bakedDevMode;
  try {
    return typeof process === 'undefined' || typeof process.env === 'undefined' || process.env.NODE_ENV !== 'production';
  } catch {
    return true;
  }
};

// =====================================================================
// 2 段目以降 (+ 配列は 1 段目から): read-only 相当の警告 Proxy (dev only)
// =====================================================================
//
// 2.0.0-alpha.11 で判明した穴 (Potopeta の最小再現、統括確認済み、v2 の負債 B5 続き):
// 配列は「再描画の追跡対象外」(isTrackableObject が除外、これは変更しない — 配列の
// 差し替え `app.pages = [...app.pages]` が canon であることの帰結) だが、旧実装は
// この関数自体も配列を素通しにしていたため、配列要素を経由した先はどの深さでも
// dev 警告が出ないという別の穴になっていた (`app.arr[0].x = 2` 等)。list 状 state
// (`pages[]`/`items[]`) は consumer が最も深い代入をやりがちな形で、警告の死角に
// なっていた。対策: 配列も素通しせずこの警告 Proxy で包む。「追跡 (notify) の
// 対象外」と「警告の対象外」は別の話であり、後者だけをここで解消する。
//
// 上記の対応を push する前に、パイロット第 9 号 (Potopeta) から設計指摘が届いた
// (統括確認済み): v1 の canon (v1 docs 自身が推奨する書き方) は「深い場所をその場で
// 書いてから、トップレベルへの代入 (`handle.pages = [...handle.pages]` や
// `handle.render_tick++`) で発火する」——代入が先、発火が後——という順序であり、
// 代入の瞬間に警告すると canon 準拠のコードでも必ず鳴ってしまう (Potopeta の
// 実コードで静的に 29 箇所 + 実行時に数百件)。本当に発火を忘れた代入がそのノイズに
// 埋もれてしまうため、代入の瞬間に console.warn するのをやめ、「同じタスクの終わりに
// なっても発火 (notify) が起きなかった」ことが確定してから初めて警告する形に変更した:
// 深い代入は即座には警告せず、path ごとに 1 件だけ pending に積み、
// `queueMicrotask` で flush を 1 回だけ予約する。トップレベル代入・1 段目
// オブジェクトへの代入 (= notify、下の createReactiveState の `notify` 参照) が
// 同じタスク内で起きれば pending は丸ごと破棄される — render は state 全体を
// 再読するため、その場で書いた深い変更もその発火で一緒に画面に反映されるからである。
// 破棄されなかった pending だけが microtask の時点で初めて警告される (path ごとに
// 1 回、同じ path への複数回の代入は 1 回にまとめる)。`await` を挟んで発火が
// 別タスクになる場合はこの機構で捕まらず警告が出る — これは意図どおりで、await の
// 間 UI が古いままになる stale window の実害の検出でもある (docs/SPEC.md §3 の FACT)。
interface PendingWarnCtx {
  // 発火忘れ疑惑の path (または `path.method()` のような呼び出し形) → 警告本文。
  // 同じキーへの再代入は上書きし (dedup)、flush 時に path ごと 1 回だけ warn する。
  readonly pending: Map<string, string>;
  // 同じタスク内で queueMicrotask を二重予約しないためのフラグ。
  flushScheduled: boolean;
}

// createReactiveState の呼び出し単位 (= 1 app インスタンス) につき 1 つの
// PendingWarnCtx を持つ。renderNow() (src/app.ts の apiRenderNow) は reactiveState の
// Proxy trap を一切経由せず直接描画するため、外部から pending を破棄する経路が要る —
// rawState をキーに公開する (`isDevMode()` 単体と同じく、DCE 対象にならないことを
// 許容した上での小さな公開 API として残す)。
const pendingWarnByRawState = new WeakMap<object, PendingWarnCtx>();

/**
 * renderNow() のように reactiveState の Proxy trap を経由しない同期描画の直前に呼ぶ。
 * その時点までに積まれていた pending (発火忘れ疑惑) を破棄する — 直後の描画で
 * state 全体が再読されるため、その場で書いた深い変更も含めて画面に反映される
 * (= 通常の notify で発火したのと同じ結果になる)。
 */
export const clearPendingDeepWarnings = (rawState: object): void => {
  pendingWarnByRawState.get(rawState)?.pending.clear();
};

const scheduleFlush = (ctx: PendingWarnCtx): void => {
  if (ctx.flushScheduled) return;
  ctx.flushScheduled = true;
  queueMicrotask(() => {
    ctx.flushScheduled = false;
    if (ctx.pending.size === 0) return; // 同じタスク内で notify/renderNow が起きて破棄済み
    for (const message of ctx.pending.values()) console.warn(message);
    ctx.pending.clear();
  });
};

const recordPendingWarning = (ctx: PendingWarnCtx, key: string, message: string): void => {
  ctx.pending.set(key, message);
  scheduleFlush(ctx);
};

const deepWarnProxies = new WeakMap<object, unknown>();

// =====================================================================
// alpha.13: alpha.11 の regression 修正 (パイロット第 9 号 Potopeta の差分実験で特定、
// 統括再現済み)
// =====================================================================
//
// alpha.11 で配列も下の wrapDeepWarn で包むようになった結果、canon の
// `app.pages = [...app.pages]` が壊れていた。spread は各要素を配列 Proxy の get
// トラップ経由で読むため、新しい配列の中身は生オブジェクトではなく wrapDeepWarn の
// Proxy そのものになり、それがそのまま root の set で生 state に書き戻ってしまう
// (Potopeta の再現: spread 前 `isProxy(state.pages[0]) === false` → spread後 `true`)。
// 以後その要素を読むたびに「Proxy の Proxy」が作られ (`deepWarnProxies` は生オブジェクト
// をキーにしたキャッシュのため、Proxy をキーにした別エントリが際限なく増える)、
// 配列 mutating メソッドの `fn.apply(target, args)` の target も内側 Proxy になり、
// 内部の要素代入がその Proxy の set トラップを踏んで pending が多重登録される
// (`push()` 1 件で済むはずが `push()` + `nodes[0]` + `nodes.length` の 3 件)。
// spread を重ねるほど生 state 自体に Proxy が深く紛れ込み、最終的に
// `structuredClone(state)` が `DataCloneError` になる。
//
// 対策は 2 段構え (Potopeta の案 1 + 2、統括決定):
//   1. wrap の冪等化 — wrapDeepWarn 自身、および下の wrapChild は、渡された値が
//      既知の Proxy なら raw に正規化してからキャッシュを引く・Proxy を組み立てる。
//      「mutating the original state object does nothing」(SPEC §3) の抜け道
//      (consumer が生 rawState に直接 Proxy を代入する経路) にも効く防御的な措置。
//   2. root Proxy / wrapChild / この wrapDeepWarn 自身の set トラップで、代入値を
//      再帰的に unwrap してから格納する (下の unwrapDeep)。1 だけでは
//      `{ ...app.pages[0], nodes: [...app.pages[0].nodes] }` のように入れ子で
//      spread した場合、nested な Proxy が生 state に残ってしまうため。
// production では「生 state に Proxy が入る経路」自体がそもそも存在しない
// (wrapDeepWarn がまるごと dev 限定のため) — 2 は wrapChild/root の set にも
// 手を入れる分だけ `bakedDevMode ?? isDevMode()` で明示的に dev 限定にする
// (production は DCE、isDevMode 定義直前のコメントの規律のとおり)。
//
// Proxy → raw の対応表。wrapDeepWarn と wrapChild の両方がここに登録する (共有)。
const rawByProxy = new WeakMap<object, object>();

// value が既知の Proxy (wrapDeepWarn/wrapChild が過去に作ったもの) なら raw に正規化する。
// 未知の値 (初めて見る生オブジェクト・他ライブラリの Proxy 等) はそのまま返す。
const toRaw = <T>(value: T): T => {
  if (value === null || typeof value !== 'object') return value;
  return (rawByProxy.get(value as object) as T | undefined) ?? value;
};

// 再帰 unwrap が踏み込んでよい対象かどうか (「plain object または配列」のみ)。
// Date/Map/Set/DOM ノード・関数・consumer 側のクラスインスタンス等はここで false になり、
// raw への正規化だけ済ませて中身には踏み込まない。
const isPlainRecursable = (v: object): boolean => {
  if (Array.isArray(v)) return true;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
};

/**
 * 代入値を再帰的に unwrap する (dev 限定。呼び出し側で `bakedDevMode ?? isDevMode()` を
 * 満たしていることを前提にする — この関数自体は wrapDeepWarn 経由 (dev 専用) からも
 * 呼ばれるため、内部では改めて判定しない)。既知の Proxy はすべて raw に戻し、
 * plain object/配列は中身を再帰する (循環参照は `seen` で防ぐ)。変更が無かった枝は
 * そのまま同じ参照を返す (不要なコピーをしない — 入れ子 spread でも実際に Proxy を
 * 含んでいた枝だけが浅くコピーし直される)。
 */
const unwrapDeep = (value: unknown, seen: WeakSet<object>): unknown => {
  if (value === null || typeof value !== 'object') return value;
  const raw = toRaw(value as object);
  if (!isPlainRecursable(raw)) return raw; // Date/Map/DOM ノード等はここで打ち切り、中身には踏み込まない
  if (seen.has(raw)) return raw; // 循環参照: これ以上辿らず正規化済みの raw を返す
  seen.add(raw);

  const isArr = Array.isArray(raw);
  const source = raw as Record<string, unknown>;
  const keys = Object.keys(source);
  const unwrapped = new Array<unknown>(keys.length);
  let nestedChanged = false;
  for (let i = 0; i < keys.length; i++) {
    const original = source[keys[i]!];
    const uv = unwrapDeep(original, seen);
    unwrapped[i] = uv;
    if (uv !== original) nestedChanged = true;
  }
  if (!nestedChanged) return raw; // トップが Proxy だっただけなら raw で正規化済み、コピーは不要
  const copy: Record<string, unknown> | unknown[] = isArr ? [] : {};
  for (let i = 0; i < keys.length; i++) (copy as Record<string, unknown>)[keys[i]!] = unwrapped[i];
  return copy;
};

// 呼び出すと配列の中身を書き換える mutating メソッド。個別に pending へ積み、1 回の
// 呼び出しで pending 1 件だけにする (target = 生配列に対して直接 apply することで、
// 内部の要素代入がこの Proxy の set トラップを経由せず、要素数分の多重登録を避ける)。
const ARRAY_MUTATING_METHODS = ['push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse', 'fill', 'copyWithin'];

const wrapDeepWarn = <T extends object>(value: T, path: string, ctx: PendingWarnCtx): T => {
  // alpha.13: 渡された value が既に (別の経路で作られた) 既知の Proxy なら、raw に
  // 正規化してからキャッシュを引く・Proxy を組み立てる (冪等化、上のコメント参照)。
  // これにより「Proxy の Proxy」が作られることも、target が raw 以外になることもない。
  const raw = toRaw(value);
  const cached = deepWarnProxies.get(raw);
  if (cached) return cached as T;

  const isArr = Array.isArray(raw);
  const rootKey = path.split(/[.[]/)[0]; // 最初の区切り (`.` か `[`) の手前 = 1 段目の state key
  // 配列要素は `path[i]`、オブジェクトのプロパティは `path.prop` で子パスを作る。
  const childPath = (prop: string): string => (isArr && /^\d+$/.test(prop) ? `${path}[${prop}]` : `${path}.${prop}`);
  const suggestion =
    `トップレベルを差し替えるか (例: app.${rootKey} = [...app.${rootKey}])、` + 'shallow copy で書き直してください。';

  const proxy = new Proxy(raw as Record<PropertyKey, unknown>, {
    get(target, prop, receiver) {
      if (isArr && typeof prop === 'string' && ARRAY_MUTATING_METHODS.includes(prop)) {
        return (...args: unknown[]): unknown => {
          const label = `${path}.${prop}()`;
          recordPendingWarning(
            ctx,
            label,
            `RicDOM: "${label}" のあと、同じタスク内で再描画が発火されませんでした` +
              ' (配列の要素変更は再描画をトリガーしません)。\n' +
              suggestion,
          );
          // target (生配列) に直接適用する。receiver (この Proxy) 越しに呼ぶと
          // メソッド内部の要素代入のたびに set トラップが発火し、要素数分の多重登録が
          // 起きてしまう (例: sort で N 件) ため、意図的に target に対して行う。
          const fn = Array.prototype[prop as keyof unknown[]] as (...a: unknown[]) => unknown;
          return fn.apply(target, args);
        };
      }
      const v = Reflect.get(target, prop, receiver);
      if (v != null && typeof v === 'object' && typeof prop === 'string') {
        return wrapDeepWarn(v as object, childPath(prop), ctx);
      }
      return v;
    },
    set(target, prop, value) {
      const label = typeof prop === 'string' ? childPath(prop) : `${path}.${String(prop)}`;
      recordPendingWarning(
        ctx,
        label,
        `RicDOM: "${label}" への代入のあと、同じタスク内で再描画が発火されませんでした` +
          ' (Proxy は 1 段目までしか追跡しません)。\n' +
          suggestion,
      );
      // production と同じ結果になるよう代入自体は実施する。alpha.13: 代入値も
      // unwrapDeep で raw に正規化してから格納する — この wrapDeepWarn 自体が dev
      // 専用 (呼び出し元がすべて `bakedDevMode ?? isDevMode()` 判定の内側) なので、
      // ここで改めて判定する必要はない (isDevMode 定義直前のコメントの規律のとおり
      // 呼び出し元で分岐済み)。
      target[prop] = unwrapDeep(value, new WeakSet());
      return true;
    },
    deleteProperty(target, prop) {
      const label = typeof prop === 'string' ? childPath(prop) : `${path}.${String(prop)}`;
      recordPendingWarning(
        ctx,
        label,
        `RicDOM: "${label}" の削除のあと、同じタスク内で再描画が発火されませんでした。\n` + suggestion,
      );
      delete target[prop];
      return true;
    },
  });
  deepWarnProxies.set(raw, proxy);
  rawByProxy.set(proxy, raw); // alpha.13: この Proxy → raw の対応も登録する (wrapChild とも共有)
  return proxy as T;
};

// =====================================================================
// 1 段目: 子オブジェクトの Proxy (v1 の _wrap_child 継承)
// =====================================================================

const isTrackableObject = (v: unknown): v is object => v != null && (typeof v === 'object' || typeof v === 'function') && !Array.isArray(v);

// `ignore` キーの扱いは v1 継承。
/**
 * state オブジェクトを浅い Proxy でラップする。
 * トップレベル代入と、1 段目オブジェクトへの代入で notify (scheduleRender) を呼ぶ。
 * `ignore` キー配下は追跡しない (内部キャッシュ用)。
 */
export const createReactiveState = <S extends object>(rawState: S, scheduleRender: () => void): S => {
  const childProxies = new WeakMap<object, unknown>();

  // pending 警告基盤は dev でのみ構築する (production は一切のコードを含まない、
  // `bakedDevMode ?? isDevMode()` を左に置く規律は isDevMode 定義直前のコメント参照)。
  // production では pendingCtx は null のまま (`new Map()` すら生成されない)。
  // 値を生成するための条件分岐は三項演算子ではなく if/else で書く — dom.ts の
  // 重複 key 検知 (`if ((bakedDevMode ?? isDevMode()) && ...)`) と同じ「値を返さない
  // 条件分岐」の形に揃えることで、esbuild の定数畳み込みが素直に効くことを
  // isDevMode 定義直前のコメントの規律の範囲内で保証する (実測: 三項演算子の版でも
  // 畳み込み自体は確認できたが、if/else の方が本ファイルの既存の書き方と一貫する)。
  let pendingCtx: PendingWarnCtx | null = null;
  if (bakedDevMode ?? isDevMode()) pendingCtx = { pending: new Map(), flushScheduled: false };
  if (pendingCtx) pendingWarnByRawState.set(rawState, pendingCtx);

  // トップレベル代入 (rootProxy の set) と 1 段目オブジェクトへの代入 (wrapChild の
  // set) はどちらも「発火 (notify)」そのものなので、scheduleRender を呼ぶ前に
  // pending を破棄する。v1 canon 「深く書いてからトップレベル/1段目を差し替えて
  // 発火する」が無警告になるのはこの破棄のおかげ (render は state 全体を再読するため、
  // その場で書いた深い変更もこの発火で一緒に画面へ反映される、wrapDeepWarn 定義直前の
  // コメント参照)。production では `notify` は `scheduleRender` そのもの (追加の
  // クロージャを一切生成しない) — 上と同じ理由で if/else を使う。
  let notify: () => void = scheduleRender;
  if (bakedDevMode ?? isDevMode()) {
    notify = (): void => {
      pendingCtx!.pending.clear();
      scheduleRender();
    };
  }

  const wrapChild = (val: object, key: string): unknown => {
    // alpha.13: dev では、渡された val が既に (別の経路で作られた) 既知の Proxy なら
    // raw に正規化してからキャッシュを引き・Proxy を組み立て、書き戻す値も unwrapDeep で
    // 正規化する (wrapDeepWarn 定義直前のコメント参照)。この if ブロックを丸ごと
    // production 用と分けて書く (共通化しない) のは、`let raw = val; if (dev) raw = ...`
    // のような「値を返す条件分岐」を挟むと、esbuild が dev 判定を畳み込んで死んだ枝を
    // 消してもその変数宣言自体は消してくれず (実測済み: `let p=l,c=n.get(p)` のような
    // 余剰な代入が minify 後も残ってしまう)、コア gzip が数バイト増えてしまうため。
    // if/else で丸ごと分けておけば、production の分岐は元の実装と一字一句同じになり、
    // dead code elimination が分岐ごと丸ごと削除できる (pendingCtx/notify と同じ
    // 「値を返す条件分岐は if/else」の規律の延長、isDevMode 定義直前のコメント参照)。
    if (bakedDevMode ?? isDevMode()) {
      const raw = (rawByProxy.get(val) as object | undefined) ?? val;
      const cached = childProxies.get(raw);
      if (cached) return cached;

      const proxy = new Proxy(raw as Record<PropertyKey, unknown>, {
        get(target, prop, receiver) {
          const v = Reflect.get(target, prop, receiver);
          // オブジェクトは従来どおり (isTrackableObject、関数含む・配列除く)。配列は
          // notify 追跡の対象外という判定 (isTrackableObject) はそのままに、警告 Proxy
          // だけは別途かける (alpha.11、v2 の負債 B5 続き — wrapDeepWarn 定義直前のコメント参照)。
          if (prop !== 'ignore' && typeof prop === 'string' && (isTrackableObject(v) || Array.isArray(v))) {
            return wrapDeepWarn(v, `${key}.${prop}`, pendingCtx!);
          }
          return v;
        },
        set(target, prop, value) {
          // 代入値も unwrapDeep で raw に正規化してから格納する (wrapDeepWarn 定義直前の
          // コメント参照)。
          target[prop] = unwrapDeep(value, new WeakSet());
          if (prop !== 'ignore') notify();
          return true;
        },
        deleteProperty(target, prop) {
          delete target[prop];
          if (prop !== 'ignore') notify();
          return true;
        },
      });
      childProxies.set(raw, proxy);
      rawByProxy.set(proxy, raw); // wrapDeepWarn と共有する Proxy → raw 対応表
      return proxy;
    }

    const cached = childProxies.get(val);
    if (cached) return cached;

    const proxy = new Proxy(val as Record<PropertyKey, unknown>, {
      get(target, prop, receiver) {
        return Reflect.get(target, prop, receiver);
      },
      set(target, prop, value) {
        target[prop] = value;
        if (prop !== 'ignore') notify();
        return true;
      },
      deleteProperty(target, prop) {
        delete target[prop];
        if (prop !== 'ignore') notify();
        return true;
      },
    });
    childProxies.set(val, proxy);
    return proxy;
  };

  const rootProxy = new Proxy(rawState as Record<PropertyKey, unknown>, {
    get(target, prop, receiver) {
      const v = Reflect.get(target, prop, receiver);
      // 元の分岐 (`prop === 'ignore' || typeof prop !== 'string' || !isTrackableObject(v)`)
      // はそのまま温存する (production ビルドの minify 後の形を変えないため —
      // 分岐を組み替えると内容が同じでも esbuild の変数名割り当てがずれ、DCE で
      // 消えるはずの配列分岐が無くても gzip が数バイト変動することを実測で確認した)。
      // 配列は notify 追跡の子 Proxy (wrapChild) を持たない (`app.pages = [...]` の
      // 差し替えがそのままトップレベル代入として追跡されるため、それで十分) が、
      // 1 段目で読んだ配列そのものへの要素代入・mutating メソッドは dev では
      // 警告 Proxy で包む (alpha.11、wrapDeepWarn 定義直前のコメント参照) ので、
      // この分岐の内側にだけ追加する。
      if (prop === 'ignore' || typeof prop !== 'string' || !isTrackableObject(v)) {
        // 定数 (`bakedDevMode ?? isDevMode()`) を `&&` の左に置く。右に置くと
        // (`Array.isArray(v) && 定数`) 、左が非定数のため esbuild は `Array.isArray(v)`
        // の呼び出し自体を副作用ありとみなして残してしまい、DCE が効かない
        // (isDevMode 定義直前のコメント、および dom.ts で一度ハマった教訓と同じ規律)。
        if (prop !== 'ignore' && typeof prop === 'string' && (bakedDevMode ?? isDevMode()) && Array.isArray(v)) {
          return wrapDeepWarn(v, prop, pendingCtx!);
        }
        return v;
      }
      return wrapChild(v, prop);
    },
    set(target, prop, value) {
      // alpha.13: トップレベル代入も dev では unwrapDeep で raw に正規化してから格納
      // する (wrapDeepWarn 定義直前のコメント参照)。canon の `app.pages = [...app.pages]`
      // がまさにこの経路 (spread が各要素を wrapDeepWarn の Proxy として読んでしまう) を
      // 通るため、ここでの正規化が今回の regression 修正の要になる。代入文そのものを
      // if/else で分けている (`let v = value; if (dev) v = ...` にしない) のは、
      // wrapChild 定義直前のコメントと同じ理由 (値を返す条件分岐だと esbuild が dev 判定を
      // 畳み込んでも変数宣言自体は残ってしまい、production の gzip が数バイト増える)。
      if (bakedDevMode ?? isDevMode()) {
        target[prop] = unwrapDeep(value, new WeakSet());
      } else {
        target[prop] = value;
      }
      if (prop !== 'ignore') notify();
      return true;
    },
    deleteProperty(target, prop) {
      delete target[prop];
      if (prop !== 'ignore') notify();
      return true;
    },
  });

  return rootProxy as S;
};
