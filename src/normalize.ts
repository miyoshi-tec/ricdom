// RicDOM 2 — ノード正規化・比較ユーティリティ
//
// v1 (src/ricdom.js) の normalize_ric_node / normalize_style / is_json_equal /
// normalize_children を TypeScript + camelCase + `children` 命名へ移植したもの。
// アルゴリズム自体は v1 から変更していない (v1 踏襈)。差分:
//   - style は object のみ (v1 は string/array/object の 3 形態、設計書 §3.1 で統一)
//   - ctx → children
//   - 島は明示フラグ `island: true` (v1 は「ctx 省略」で暗黙に島だった、設計書 §3.1 判断 e)
//   - tag は必須 (v1 は `raw_node.tag ?? 'div'` で省略時に暗黙に div 扱いだったが、
//     v2 では型上必須にし、実行時に tag 欠落なら console.error + 不可視扱いにする。
//     設計書 §12)

import type { RicNode } from './types.js';

// =====================================================================
// style 正規化
// =====================================================================

// ハイフンケース → キャメルケース変換。CSS Custom Property (`--*`) はそのまま返す
// (変換すると先頭 `--` が壊れて CSS variable として認識されなくなるため、v1 踏襈)。
export const convertStyleKeyToCamel = (key: string): string => {
  if (key.startsWith('--')) return key;
  return key.replace(/-([a-z])/g, (_, char: string) => char.toUpperCase());
};

// object 限定は設計書 §3.1。
/** style は object 限定。キーをキャメルケースに統一して返す。 */
export const normalizeStyle = (style: Record<string, string | number> | undefined): Record<string, string | number> => {
  if (!style) return {};
  const result: Record<string, string | number> = {};
  for (const [key, val] of Object.entries(style)) {
    result[convertStyleKeyToCamel(key)] = val;
  }
  return result;
};

// =====================================================================
// class 正規化
// =====================================================================

export type ClassValueLike = string | string[] | Record<string, boolean> | undefined;

export const normalizeClass = (value: ClassValueLike): string[] => {
  if (!value) return [];
  if (typeof value === 'string') return value.split(/\s+/).filter(Boolean);
  if (Array.isArray(value)) return value.filter(Boolean);
  // Record<string, boolean>: 真な値のキーだけを採用する
  return Object.keys(value).filter((k) => value[k]);
};

// =====================================================================
// 不可視判定
// =====================================================================

// null / undefined / false / 空配列は描画しない (v1 継承)。
// v1 は「空オブジェクト」も不可視扱いだったが、v2 の型 (RicElementNode) では
// `{}` は「tag 省略 = div、子なし」の正当な値であり、型上は「不可視」を表さない。
// そのため v2 では空オブジェクトを不可視とは扱わない (v1 との意図的な差異)。
export const isInvisibleValue = (val: unknown): boolean => {
  if (val === null || val === undefined || val === false) return true;
  if (Array.isArray(val) && val.length === 0) return true;
  return false;
};

// =====================================================================
// 正規化済み内部表現
// =====================================================================

export interface NormalizedText {
  kind: 'text';
  text: string;
}

export interface NormalizedInvisible {
  kind: 'invisible';
}

export interface NormalizedElement {
  kind: 'element';
  tag: string;
  id: string | null;
  class: string[];
  style: Record<string, string | number>;
  // v1 の ctx_array 相当。
  /** 生の children 配列 (まだ flatten/normalize していない) */
  children: RicNode[];
  ref: string | null;
  key: string | number | null;
  island: boolean;
  /** tag/id/class/style/children/ref/key/island を除いた残り (属性・プロパティ・イベント) */
  attrs: Record<string, unknown>;
}

export type NormalizedNode = NormalizedText | NormalizedInvisible | NormalizedElement;

const STRUCTURAL_KEYS = new Set(['tag', 'id', 'class', 'style', 'children', 'ref', 'key', 'island']);

// v1 の normalize_ric_node 継承。
/** RicNode を正規化された内部表現に変換する */
export const normalizeNode = (raw: RicNode): NormalizedNode => {
  if (typeof raw === 'string' || typeof raw === 'number') {
    return { kind: 'text', text: String(raw) };
  }
  if (isInvisibleValue(raw)) {
    return { kind: 'invisible' };
  }

  // ここに来る時点で raw は RicElementNode か配列のいずれか。配列は呼び出し側
  // (normalizeChildren) で展開してから individual に normalizeNode を呼ぶ契約なので、
  // ここで配列が来ることは無い想定だが、防御的に「不可視」扱いにしておく
  // (throw しない方針、v1 踏襈)。
  if (Array.isArray(raw)) {
    return { kind: 'invisible' };
  }

  const node = raw as Record<string, unknown>;

  // tag は型上必須 (設計書 §12)。TypeScript を経由しない
  // 利用側 (プレーン JS、any 経由) が型チェックをすり抜けて tag を欠いたノードを渡した
  // 場合、v1 のように無言で 'div' 扱いにはせず、console.error を出した上で不可視ノード
  // として扱う (throw しない方針の継承)。
  if (typeof node.tag !== 'string') {
    console.error(
      'RicDOM: ノードに tag がありません (tag は必須です)。\n' + "✅ 例: { tag: 'div', children: [...] }",
    );
    return { kind: 'invisible' };
  }
  const tag = node.tag;
  const id = typeof node.id === 'string' ? node.id : null;
  const classes = normalizeClass(node.class as ClassValueLike);
  const style = normalizeStyle(node.style as Record<string, string | number> | undefined);
  const rawChildren = node.children;
  const childrenArray: RicNode[] = rawChildren === undefined ? [] : Array.isArray(rawChildren) ? (rawChildren as RicNode[]) : [rawChildren as RicNode];
  const ref = typeof node.ref === 'string' ? node.ref : null;
  const key = node.key !== undefined && node.key !== null ? (node.key as string | number) : null;
  const island = node.island === true;

  const attrs: Record<string, unknown> = {};
  for (const k of Object.keys(node)) {
    if (!STRUCTURAL_KEYS.has(k)) attrs[k] = node[k];
  }

  return {
    kind: 'element',
    tag,
    id,
    class: classes,
    style,
    children: childrenArray,
    ref,
    key,
    island,
    attrs,
  };
};

// =====================================================================
// 深い等価比較 (差分更新の変化判定)
// =====================================================================

// 関数は参照同一性で比較する (異なるクロージャ → false → ハンドラが正しく更新される)。v1 踏襈。
export const isJsonEqual = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;

  if (Array.isArray(a)) {
    const bArr = b as unknown[];
    if (a.length !== bArr.length) return false;
    return a.every((item, i) => isJsonEqual(item, bArr[i]));
  }

  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  const keysA = Object.keys(aObj);
  const keysB = Object.keys(bObj);
  if (keysA.length !== keysB.length) return false;
  return keysA.every((key) => isJsonEqual(aObj[key], bObj[key]));
};

// =====================================================================
// children 正規化 (ネスト配列の展開 + invisible 除去)
// =====================================================================

// v1 の normalize_children 継承。
/** raw な children 配列を平坦化し、invisible を除去する */
export const normalizeChildren = (rawChildren: RicNode[]): RicNode[] => {
  const result: RicNode[] = [];
  for (const child of rawChildren) {
    if (isInvisibleValue(child)) continue;
    if (Array.isArray(child)) {
      for (const nested of child) {
        if (!isInvisibleValue(nested)) result.push(nested);
      }
    } else {
      result.push(child);
    }
  }
  return result;
};
