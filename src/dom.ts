// RicDOM 2 — DOM 構築・差分更新 (patch)
//
// v1 (src/ricdom.js) の build_dom_node / patch_attributes / patch_children 系を
// TypeScript + camelCase + `children` 命名へ移植したもの。アルゴリズムは
// position-based + key-based reconciliation、FORCE_REAPPLY、SVG namespace 継承、
// select value 再適用など v1 と同じ (v1 踏襈)。
//
// v2 での変更点:
//   - 島は明示フラグ `island: true` (子孫を一切 build/patch しない、設計書 §3.1)
//   - 編集中ガード: document.activeElement な input/textarea/select には
//     `value` を FORCE_REAPPLY しない (設計書 §3.2、v1 は ui_tweak だけの局所対応だったが
//     v2 ではコアの規則に一般化)
//   - ref 属性名: data-ric-ref → data-ricdom-ref

import type { RicNode } from './types.js';
import {
  type NormalizedElement,
  type NormalizedNode,
  isJsonEqual,
  isInvisibleValue,
  normalizeChildren,
  normalizeNode,
} from './normalize.js';
import { bakedDevMode, isDevMode } from './reactivity.js';

// =====================================================================
// 定数
// =====================================================================

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

// DOM プロパティとして直接代入すべきキー (setAttribute ではなく代入する)
const DOM_PROPERTY_KEYS = new Set([
  'value',
  'checked',
  'selected',
  'disabled',
  'innerHTML',
  'textContent',
  'innerText',
  'scrollTop',
  'scrollLeft',
]);

// VDOM 上で prev=next が equal でも毎 render で DOM に再代入するキー (ユーザー操作で
// DOM 側が独自に drift するため)。React/Preact 等の主要 VDOM ライブラリも controlled
// input は force-set する canon (v1 踏襈)。
const FORCE_REAPPLY_DOM_KEYS = new Set(['value', 'checked', 'selected', 'scrollTop', 'scrollLeft']);

const isEventHandlerKey = (key: string): boolean => /^on[a-z]/.test(key);

// =====================================================================
// 編集中ガード (設計書 §3.2、コアの規則に一般化)
// =====================================================================

// document.activeElement である input/textarea/select には value の FORCE_REAPPLY を
// 行わない (ユーザーの編集バッファを潰さない)。blur 後の render で同期される。
// 対象を 'value' キーだけに絞るのは、checked/selected/scroll はユーザーが「今まさに
// タイプ中」の入力ではなく、drift しても打鍵中の文字を消す実害が無いため。
const EDITABLE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

const shouldSkipValueReapply = (el: Element): boolean => {
  if (typeof document === 'undefined') return false;
  return el === document.activeElement && EDITABLE_TAGS.has(el.tagName);
};

// =====================================================================
// class / style の DOM 書き込み
// =====================================================================

// HTML 要素: el.className = val で OK。SVG 要素: el.className は
// SVGAnimatedString (object) で文字列代入が silent no-op になるため setAttribute
// を使う必要がある (v1 踏襈)。
const setClassAttr = (el: Element, value: string): void => {
  if (el.namespaceURI === SVG_NAMESPACE) {
    if (value) el.setAttribute('class', value);
    else el.removeAttribute('class');
  } else {
    (el as HTMLElement).className = value || '';
  }
};

// CSS Custom Property (`--*`) は setProperty/removeProperty を使う必要がある
// (bracket setter は `--*` に対して silent no-op になる仕様、v1 踏襈)。
const setStyleProp = (el: HTMLElement | SVGElement, key: string, val: string | number): void => {
  const style = el.style as CSSStyleDeclaration;
  if (key.startsWith('--')) {
    if (style.getPropertyValue(key) !== String(val)) style.setProperty(key, String(val));
  } else {
    const styleAny = style as unknown as Record<string, string>;
    if (styleAny[key] !== String(val)) styleAny[key] = String(val);
  }
};

const removeStyleProp = (el: HTMLElement | SVGElement, key: string): void => {
  const style = el.style as CSSStyleDeclaration;
  if (key.startsWith('--')) style.removeProperty(key);
  else (style as unknown as Record<string, string>)[key] = '';
};

// =====================================================================
// select の value 再適用 (build / patch 共用)
// =====================================================================

// select の value は option が生えた後でないと選択に反映できない (ブラウザは
// 該当 option が無い時点での value 代入を無視し、selectedIndex を -1 にする。
// さらに selectedIndex が -1 のまま option が増えると「選択が無いので先頭 option を
// 自動選択」する仕様があるため、症状としては新しい option ではなく先頭に戻って
// 見える)。build 経路 (buildDomNode) は子 append 直後にこの再適用を行っていたが、
// patch 経路は patchAttributes (value を含む属性適用) → patchChildren (option 追加)
// の順で呼んでいたため非対称だった: value が「これから増える新しい option」を指す
// render では、patchAttributes の時点でその option がまだ存在せず代入が無視され、
// その後 patchChildren で option を追加しても再適用していなかった (Raccoon Memo
// パイロット第 5 号、alpha.14 報告。options が後から増える描画で value が反映されない)。
// 編集中ガード (shouldSkipValueReapply) は build 経路には無かった通常の value 代入と
// 同じ扱いにするため、ここでも同じガードを通す。
//
// value を入れ直さなかったとき (フォーカス中、または value を渡していない select) の
// `<selectedcontent>` (2.0.0-alpha.35、設計書 §54):
// `<selectedcontent>` は「いま選ばれている option の中身」をブラウザが写して入れる HTML 標準の
// 要素 (`appearance: base-select` のセレクトの枠の中身)。ブラウザが写し直すのは選択が変わった
// とき・value / selectedIndex が代入されたときだけで、**選ばれている option の中身が patch で
// 変わっても写し直さない**。value を入れ直す経路ではその代入で追従するが、入れ直さない経路では
// 古い中身が残る (言語を選ぶセレクトが自分の選択肢を訳し直す構成で、枠の中だけ前の言語のまま)。
// そこで「写した中身が、選ばれている option の中身と違うとき」だけ `selectedIndex` に同じ値を
// 代入して写し直させる。この代入は選択を変えない (同じ value の option が複数あっても動かない。
// `value` の再代入だと先頭へ移る)。条件を絞る理由:
//   - 中身が変わっていない render では何も代入しない = 編集中ガードが守っている「利用者が
//     いま選んでいる途中の状態」に触る機会を、中身が実際に変わった render だけにする
//   - multiple は除く (selectedIndex の代入で複数の選択が 1 つに潰れる)
//   - `<selectedcontent>` を知らないブラウザ (HTMLUnknownElement になる。Chromium 134 以前・
//     jsdom) では何もしない (写す仕組みが無いので常に「違う」と判定されてしまうため)
const reapplySelectValue = (el: HTMLElement | SVGElement, normalized: NormalizedElement): void => {
  if (normalized.tag !== 'select') return;
  const select = el as HTMLSelectElement;
  if ('value' in normalized.attrs && !shouldSkipValueReapply(el)) {
    select.value = normalized.attrs.value as string; // フォーカス中は入れ直さない (編集中ガード、設計書 §3.2)
    return;
  }
  const shown = select.querySelector('selectedcontent');
  const chosen = select.selectedOptions[0];
  if (shown && chosen && !select.multiple && !(shown instanceof HTMLUnknownElement) && shown.innerHTML !== chosen.innerHTML) {
    select.selectedIndex = select.selectedIndex;
  }
};

// =====================================================================
// dev: 関数値が非イベント属性に渡ったときの警告
// =====================================================================

// UI コンポーネントは未知の prop を rest-spread でそのまま要素ノードの属性として
// 素通しする (SPEC §10.5)。v1 から移行する consumer が camelCase を snake_case の
// ままにしてしまう (例: transform_image_src) と isEventHandlerKey にも
// マッチせず applyPlainAttr に落ち、String(fn) で意味の無い文字列が setAttribute
// されるだけで hook が無言で死ぬ (Raccoon Memo パイロット第 5 号、alpha.14 報告。
// on_resize_end のように on* に似ていても `/^on[a-z]/` に一致しないキーも同様)。
// 関数値が HTML 属性として意味を持つことは絶対に無い = applyPlainAttr に関数が
// 来た瞬間が実害確定 (設計書 §29「実害が確定した時点で警告する」) なので、
// speculative fix (個別コンポーネントの alias 一覧) は持たず、ここ 1 箇所で
// 汎用的に検知する。dev/prod 問わず「関数を stringify して属性に入れない」に
// 統一する (壊れた属性値が DOM に残ること自体が望ましくないため)。
// 同じ key への再 render での連続警告を防ぐため key 単位で dedupe する
// (要素ごとではなくキー名だけで見る割り切り。isDevMode 定義直前のコメントの
// 「小さな例外」と同じ扱い)。
const warnedFunctionAttrKeys = new Set<string>();

/** テスト用: 「同じ key につき 1 回だけ」警告する状態をリセットする */
export const _resetFunctionAttrWarningsForTest = (): void => {
  warnedFunctionAttrKeys.clear();
};

// =====================================================================
// 素の属性の適用 (build / patch 共用)
// =====================================================================

// boolean は有無属性 (true→空文字で setAttribute、false→removeAttribute)、それ以外は
// 文字列化して setAttribute。null/undefined は呼び出し側に委ねる (build は既存属性が
// 無いので何もしない、patch は removeAttribute する必要がある ため分岐が非対称) —
// build/patch 双方で重複していた分岐を 1 箇所に集約する (挙動は変えない、#13 gzip 相殺)。
// 関数値は (dev/prod 問わず) 属性として設定しない (warnedFunctionAttrKeys 定義直前の
// コメント参照)。警告本体をここに直接書く (別の top-level 関数に切り出さない) のは、
// 独立した関数として括り出すと production ビルドでその関数への「呼び出し」自体は
// dead-code elimination で消えても、関数の宣言そのものは残ってしまうのを実測で確認した
// ため (esbuild の tree-shaking は dead-branch の畳み込みより前に「参照があるかどうか」
// で生死を判定する 1 パス構成で、後段の畳み込み結果を再度 tree-shaking にフィード
// バックしない。dom.ts の重複 key 警告 (#13) は元から console.warn を分岐の中に直接
// 書いていたため、この問題を最初から踏んでいなかった)。定数
// (`bakedDevMode ?? isDevMode()`) を `&&` の左に置く規律は isDevMode 定義直前の
// コメント参照。
const applyPlainAttr = (el: Element, key: string, val: unknown): void => {
  if (typeof val === 'function') {
    if ((bakedDevMode ?? isDevMode()) && !warnedFunctionAttrKeys.has(key)) {
      warnedFunctionAttrKeys.add(key);
      console.warn(
        `ricdom: attribute "${key}" received a function. Functions are only meaningful for ` +
          'on* event handlers (onclick) or component props — check the prop name ' +
          '(v1 snake_case → v2 camelCase, e.g. transformImageSrc).',
      );
    }
    return;
  }
  if (typeof val === 'boolean') {
    if (val) el.setAttribute(key, '');
    else el.removeAttribute(key);
  } else if (val !== null && val !== undefined) {
    el.setAttribute(key, String(val));
  }
};

// =====================================================================
// 属性適用 (build 用)
// =====================================================================

const applyAttributesToElement = (el: HTMLElement | SVGElement, normalized: NormalizedElement): void => {
  if (normalized.id) el.id = normalized.id;

  if (normalized.class.length > 0) setClassAttr(el, normalized.class.join(' '));

  for (const [key, val] of Object.entries(normalized.style)) {
    setStyleProp(el, key, val);
  }

  for (const [key, val] of Object.entries(normalized.attrs)) {
    if (isEventHandlerKey(key)) {
      if (typeof val === 'function') (el as unknown as Record<string, unknown>)[key] = val;
      else if (val === null) (el as unknown as Record<string, unknown>)[key] = null;
    } else if (DOM_PROPERTY_KEYS.has(key)) {
      (el as unknown as Record<string, unknown>)[key] = val;
    } else {
      applyPlainAttr(el, key, val);
    }
  }
};

// =====================================================================
// DOM 構築
// =====================================================================

/** 正規化済み RicNode から DOM ノードを構築する (再帰)。inheritedNamespace: SVG コンテキスト継承用 */
export const buildDomNode = (raw: RicNode, inheritedNamespace: string | null = null): Node | null => {
  const normalized = normalizeNode(raw);

  if (normalized.kind === 'invisible') return null;
  if (normalized.kind === 'text') return document.createTextNode(normalized.text);

  const currentNamespace = normalized.tag === 'svg' ? SVG_NAMESPACE : inheritedNamespace;

  const el = currentNamespace
    ? (document.createElementNS(currentNamespace, normalized.tag) as unknown as HTMLElement | SVGElement)
    : (document.createElement(normalized.tag) as HTMLElement);

  applyAttributesToElement(el, normalized);

  // ref: DOM の id とは別に data-ricdom-ref で管理する (RicDOM 内部の refs Map 収集用)
  if (normalized.ref) {
    (el as HTMLElement).dataset.ricdomRef = normalized.ref;
  }

  // 島 (island: true) は子孫を一切 build しない (設計書 §3.1)。
  if (!normalized.island) {
    for (const child of normalizeChildren(normalized.children)) {
      const childEl = buildDomNode(child, currentNamespace);
      if (childEl) el.appendChild(childEl);
    }
  }

  // 子 append 後にもう一度 value を当て直して確定させる (v1 踏襈、詳細は
  // reapplySelectValue 定義直前のコメント参照)。
  reapplySelectValue(el, normalized);

  return el;
};

// =====================================================================
// 重複タグの検出とシリアルキー (position-based reconciliation 用)
// =====================================================================

const collectDuplicateTags = (prevChildren: RicNode[], nextChildren: RicNode[]): Set<string> => {
  const countTags = (children: RicNode[]): Record<string, number> => {
    const counts: Record<string, number> = {};
    for (const child of children) {
      if (typeof child === 'object' && child !== null && !Array.isArray(child)) {
        const normalized = normalizeNode(child);
        if (normalized.kind === 'element') counts[normalized.tag] = (counts[normalized.tag] ?? 0) + 1;
      }
    }
    return counts;
  };
  const prevCounts = countTags(prevChildren);
  const nextCounts = countTags(nextChildren);
  const dupTags = new Set<string>();
  for (const [tag, n] of Object.entries(prevCounts)) if (n > 1) dupTags.add(tag);
  for (const [tag, n] of Object.entries(nextCounts)) if (n > 1) dupTags.add(tag);
  return dupTags;
};

const buildSerialKeyList = (children: RicNode[], dupTags: Set<string>): string[] => {
  const counters: Record<string, number> = {};
  return children.map((child) => {
    if (typeof child === 'string' || typeof child === 'number') return 'text';
    if (typeof child !== 'object' || child === null) return 'invisible';
    const normalized = normalizeNode(child);
    if (normalized.kind !== 'element') return 'text';
    const tag = normalized.tag;
    if (!dupTags.has(tag)) return tag;
    const n = counters[tag] ?? 0;
    counters[tag] = n + 1;
    return `${tag}@${n}`;
  });
};

// =====================================================================
// 属性差分 (patch 用)
// =====================================================================

const patchAttributes = (prevNormalized: NormalizedElement, nextNormalized: NormalizedElement, el: HTMLElement | SVGElement): void => {
  const nextId = nextNormalized.id ?? '';
  if ((prevNormalized.id ?? '') !== nextId) el.id = nextId;

  const prevRef = prevNormalized.ref ?? '';
  const nextRef = nextNormalized.ref ?? '';
  if (prevRef !== nextRef) {
    if (nextRef) (el as HTMLElement).dataset.ricdomRef = nextRef;
    else delete (el as HTMLElement).dataset.ricdomRef;
  }

  const prevClass = prevNormalized.class.join(' ');
  const nextClass = nextNormalized.class.join(' ');
  if (prevClass !== nextClass) setClassAttr(el, nextClass);

  const prevStyle = prevNormalized.style;
  const nextStyle = nextNormalized.style;
  for (const [key, val] of Object.entries(nextStyle)) setStyleProp(el, key, val);
  for (const key of Object.keys(prevStyle)) {
    if (!(key in nextStyle)) removeStyleProp(el, key);
  }

  const prevExtra = prevNormalized.attrs;
  const nextExtra = nextNormalized.attrs;

  for (const [key, val] of Object.entries(nextExtra)) {
    if (isEventHandlerKey(key)) {
      // イベントハンドラは差分チェックを通さず常に最新ハンドラで上書きする
      // (render 関数の中で毎回新しいクロージャを作るのが普通の使い方なので、
      // 参照は毎回新しい。同一参照でも最新クロージャに差し替わることを保証する)
      (el as unknown as Record<string, unknown>)[key] = typeof val === 'function' ? val : null;
    } else if (FORCE_REAPPLY_DOM_KEYS.has(key)) {
      if (key === 'value' && shouldSkipValueReapply(el)) continue; // 編集中ガード (設計書 §3.2)
      (el as unknown as Record<string, unknown>)[key] = val;
    } else if (!isJsonEqual(prevExtra[key], val)) {
      if (DOM_PROPERTY_KEYS.has(key)) {
        (el as unknown as Record<string, unknown>)[key] = val;
      } else if (val === null || val === undefined) {
        el.removeAttribute(key);
      } else {
        applyPlainAttr(el, key, val);
      }
    }
  }

  for (const key of Object.keys(prevExtra)) {
    if (!(key in nextExtra)) {
      if (isEventHandlerKey(key)) (el as unknown as Record<string, unknown>)[key] = null;
      else el.removeAttribute(key);
    }
  }
};

// =====================================================================
// FORCE_REAPPLY 専用 walker (VDOM 構造短絡時)
// =====================================================================

// VDOM 自体は prev=next なので構造 patch は不要だが、ユーザー操作で DOM が drift した
// FORCE_REAPPLY_DOM_KEYS だけは VDOM の値で上書きし直す (v1 踏襈)。
// 島の子孫には絶対に踏み込まない (子孫を一切触らない契約、設計書 §3.1)。
const applyForceReapplyToSubtree = (normalizedChildren: RicNode[], parentEl: Element): void => {
  for (let i = 0; i < normalizedChildren.length; i++) {
    const child = normalizedChildren[i];
    if (typeof child !== 'object' || child === null || Array.isArray(child)) continue;
    const domEl = parentEl.childNodes[i];
    if (!domEl || domEl.nodeType !== Node.ELEMENT_NODE) continue;
    const elChild = domEl as HTMLElement | SVGElement;

    const childRecord = child as unknown as Record<string, unknown>;
    for (const key of FORCE_REAPPLY_DOM_KEYS) {
      if (key in childRecord) {
        if (key === 'value' && shouldSkipValueReapply(elChild)) continue;
        (elChild as unknown as Record<string, unknown>)[key] = childRecord[key];
      }
    }

    if (childRecord.island === true) continue; // 島の子孫は触らない

    if (childRecord.children != null) {
      const childrenArr = Array.isArray(childRecord.children) ? (childRecord.children as RicNode[]) : [childRecord.children as RicNode];
      applyForceReapplyToSubtree(normalizeChildren(childrenArr), elChild);
    }
  }
};

// =====================================================================
// key の有無判定
// =====================================================================

const childrenHaveAnyKey = (children: RicNode[]): boolean => {
  for (const c of children) {
    if (c && typeof c === 'object' && !Array.isArray(c) && (c as { key?: unknown }).key != null) return true;
  }
  return false;
};

// =====================================================================
// 子要素の差分反映 (dispatch)
// =====================================================================

/** 子要素リストの差分を DOM に反映する。raw な children を受け取る。 */
export const patchChildren = (prevRawChildren: RicNode[], nextRawChildren: RicNode[], parentEl: Element): void => {
  const prevChildren = normalizeChildren(prevRawChildren);
  const nextChildren = normalizeChildren(nextRawChildren);

  if (isJsonEqual(prevChildren, nextChildren)) {
    applyForceReapplyToSubtree(nextChildren, parentEl);
    return;
  }

  if (childrenHaveAnyKey(prevChildren) || childrenHaveAnyKey(nextChildren)) {
    patchChildrenByKey(prevChildren, nextChildren, parentEl);
    return;
  }

  const dupTags = collectDuplicateTags(prevChildren, nextChildren);
  const prevSerialKeys = buildSerialKeyList(prevChildren, dupTags);
  const nextSerialKeys = buildSerialKeyList(nextChildren, dupTags);

  patchChildrenByPosition(prevChildren, nextChildren, parentEl, prevSerialKeys, nextSerialKeys);
};

// =====================================================================
// key ベースの差分更新
// =====================================================================

// n/d は normalized/dom の省略 (このファイルの命名規約の例外)。この interface は
// patchChildrenByKey 内だけで使う非公開の作業用構造体で、公開 API には一切出てこない。
// gzip 天井 (#13) に収めるため、頻出するプロパティ名だけ短縮する (esbuild の minify は
// プロパティ名を書き換えないため、ソースでの命名がそのまま出力バイト数に効く)。
interface PrevEntry {
  n: NormalizedNode;
  d: ChildNode | undefined;
}

const patchChildrenByKey = (prevChildren: RicNode[], nextChildren: RicNode[], parentEl: Element): void => {
  const prevDoms = Array.from(parentEl.childNodes);
  // 値を null にできる Map にしておくことで、next 側の走査で「この key はこの pass で
  // 既に見た」を別の Set を持たずに記録できる (下記ループ参照。#13 の gzip 相殺)。
  const prevKeyedMap = new Map<string | number, PrevEntry | null>();
  const prevUnkeyed: PrevEntry[] = [];

  for (let i = 0; i < prevChildren.length; i++) {
    const normalized = normalizeNode(prevChildren[i] as RicNode);
    const dom = prevDoms[i];
    // 重複 key は「2 つ目以降」を unkeyed 扱いに落とす (#13 の修正本体)。
    // map.set で上書きしたままだと、上書きされた側の DOM が prevKeyedMap からも
    // prevUnkeyed からも参照されなくなり、削除パス (末尾の for) の対象から漏れて
    // 常に DOM に残り続ける (= render のたびに子要素が増殖するリーク) ため。
    if (normalized.kind === 'element' && normalized.key !== null && !prevKeyedMap.has(normalized.key)) {
      prevKeyedMap.set(normalized.key, { n: normalized, d: dom });
    } else {
      prevUnkeyed.push({ n: normalized, d: dom });
    }
  }

  let cursor: ChildNode | null = parentEl.firstChild;

  // dev: 兄弟内の key 重複を検知したら 1 render (= この関数呼び出し) につき 1 回だけ
  // 警告する (#13)。found === null (下記) の判定と表裏一体なので専用の Set は持たない。
  let hasDuplicateKey = false;

  for (let i = 0; i < nextChildren.length; i++) {
    const nextRaw = nextChildren[i] as RicNode;
    const nextNormalized = normalizeNode(nextRaw);
    let targetDom: Node | null = null;
    let prevNormalized: NormalizedNode | null = null;
    let entry: PrevEntry | undefined;
    // unkeyed 経路 (prevUnkeyed からの位置ベース再利用) への持ち越しを塞ぐフラグ。
    // 初出の keyed 要素 (prev に無い正当な新規 key) だけ true にする — ここを塞がずに
    // 広く unkeyed 経路へ倒すと、たまたま同じ tag の unkeyed prev ノード (例: 入力途中の
    // input) を横取りしてしまい、無関係な要素同士で DOM/状態が入れ替わる regression に
    // なる (統括の v1 対照検証で判明、修正の対象外の挙動まで変えてはいけない)。
    let blockUnkeyedFallback = false;

    if (nextNormalized.kind === 'element' && nextNormalized.key !== null) {
      const key = (nextNormalized as NormalizedElement).key as string | number;
      const found = prevKeyedMap.get(key);
      if (found) entry = found;
      else if (found === null) hasDuplicateKey = true; // 同じ pass で既に見た key = 重複
      else blockUnkeyedFallback = true; // found === undefined: 初出の新規 key
      prevKeyedMap.set(key, null); // 「見た」ことを記録 (元々無かった新規 key でも同様)
    }

    // 重複 key の 2 つ目以降を毎 render 新規生成するのではなく、位置ベースで
    // kind/tag が一致する prev ノードを再利用する (#13)。
    if (!blockUnkeyedFallback && !entry && prevUnkeyed.length > 0) {
      const candidate = prevUnkeyed[0]!;
      const sameType = candidate.n.kind === nextNormalized.kind && (nextNormalized.kind === 'text' || (candidate.n as NormalizedElement).tag === (nextNormalized as NormalizedElement).tag);
      if (sameType) {
        entry = candidate;
        prevUnkeyed.shift();
      }
    }

    if (entry) {
      targetDom = entry.d ?? null;
      prevNormalized = entry.n;
    }

    if (!targetDom) {
      targetDom = buildDomNode(nextRaw, parentEl.namespaceURI);
      if (!targetDom) continue;
    }

    if (cursor === targetDom) {
      cursor = cursor.nextSibling;
    } else {
      parentEl.insertBefore(targetDom, cursor);
    }

    if (prevNormalized) {
      if (nextNormalized.kind === 'text') {
        if (targetDom.nodeType === Node.TEXT_NODE && targetDom.textContent !== nextNormalized.text) {
          targetDom.textContent = nextNormalized.text;
        }
      } else if (nextNormalized.kind === 'element' && prevNormalized.kind === 'element') {
        patchAttributes(prevNormalized, nextNormalized, targetDom as HTMLElement | SVGElement);
        if (!nextNormalized.island) {
          patchChildren(prevNormalized.children, nextNormalized.children, targetDom as Element);
        }
        // option が今回の render で増えて value が新しい option を指す場合に備え、
        // children を patch し終えてからもう一度 value を当て直す (reapplySelectValue
        // 定義直前のコメント参照)。island でも属性レベルの話なので関係なく呼ぶ。
        reapplySelectValue(targetDom as HTMLElement | SVGElement, nextNormalized);
      }
    }
  }

  for (const entry of prevKeyedMap.values()) {
    // null は「next 側で見た (消費済み、または対応する prev が元々無い新規 key)」の
    // 印なので削除対象ではない。
    if (entry && entry.d && entry.d.parentNode === parentEl) parentEl.removeChild(entry.d);
  }
  for (const entry of prevUnkeyed) {
    if (entry.d && entry.d.parentNode === parentEl) parentEl.removeChild(entry.d);
  }

  // `isDevMode()` を直接条件に置かず `bakedDevMode ?? isDevMode()` にする理由は
  // src/reactivity.ts の isDevMode 定義直前のコメント参照 (production ビルドで
  // DCE を効かせるため。関数呼び出しをまたいだ定数伝播は esbuild が行わない)。
  // **`&&` の左側に置くこと**: `hasDuplicateKey && (bakedDevMode ?? isDevMode())`
  // のように定数側を右に置くと、esbuild は `bakedDevMode` を `false` に畳み込んだ後も
  // 左の非定数 (`hasDuplicateKey`) をまたいだ `X && false → false` という再畳み込みを
  // 行わず、`console.warn(...)` 呼び出しが物理的に残ってしまうことを実測で確認した
  // (2.0.0-alpha.10)。定数側を左に置けば `false && X` は無条件に `false` へ畳み込まれ、
  // 右側 (console.warn を含む) ごと dead-code elimination される。
  if ((bakedDevMode ?? isDevMode()) && hasDuplicateKey) {
    console.warn('RicDOM: 兄弟の key が重複しています。');
  }
};

// =====================================================================
// 位置ベースの差分更新
// =====================================================================

const patchChildrenByPosition = (
  prevChildren: RicNode[],
  nextChildren: RicNode[],
  parentEl: Element,
  prevSerialKeys: string[],
  nextSerialKeys: string[],
): void => {
  const prevLen = prevChildren.length;
  const nextLen = nextChildren.length;
  const maxLen = Math.max(prevLen, nextLen);

  for (let i = 0; i < maxLen; i++) {
    const prevNode = prevChildren[i];
    const nextNode = nextChildren[i];
    const domEl = parentEl.childNodes[i];

    if (nextNode === undefined) {
      if (domEl) parentEl.removeChild(domEl);
    } else if (prevNode === undefined) {
      const newEl = buildDomNode(nextNode, parentEl.namespaceURI);
      if (newEl) parentEl.appendChild(newEl);
    } else {
      const prevNormalized = normalizeNode(prevNode);
      const nextNormalized = normalizeNode(nextNode);

      if (nextNormalized.kind === 'text') {
        if (prevNormalized.kind === 'text') {
          if (domEl && domEl.nodeType === Node.TEXT_NODE && domEl.textContent !== nextNormalized.text) {
            domEl.textContent = nextNormalized.text;
          }
        } else {
          const newEl = document.createTextNode(nextNormalized.text);
          if (domEl) parentEl.replaceChild(newEl, domEl);
          else parentEl.appendChild(newEl);
        }
        continue;
      }

      const prevKey = prevSerialKeys[i];
      const nextKey = nextSerialKeys[i];
      if (prevKey !== nextKey) {
        const newEl = buildDomNode(nextNode, parentEl.namespaceURI);
        if (newEl && domEl) parentEl.replaceChild(newEl, domEl);
        else if (newEl) parentEl.appendChild(newEl);
        continue;
      }

      if (domEl && nextNormalized.kind === 'element' && prevNormalized.kind === 'element') {
        patchAttributes(prevNormalized, nextNormalized, domEl as HTMLElement | SVGElement);
        if (!nextNormalized.island) {
          patchChildren(prevNormalized.children, nextNormalized.children, domEl as Element);
        }
        // reapplySelectValue 定義直前のコメント参照 (patchChildrenByKey 側と同じ理由)。
        reapplySelectValue(domEl as HTMLElement | SVGElement, nextNormalized);
      }
    }
  }

  while (parentEl.childNodes.length > nextLen) {
    parentEl.removeChild(parentEl.lastChild as ChildNode);
  }
};

export { isInvisibleValue };
