// ricdom/ui — popup 系の位置計算ヘルパー (設計書「共通」節)
//
// createPopup が自前に持っていた位置計算 (v1 の `_popup_utils.js` 相当:
// `_make_popup_dir` / `_pos_style` の後継) を、popup.ts / dropdown.ts / tooltip.ts の
// 3 部品で共有できるようここに切り出す (「重複を作らない」指示への対応)。
//
// v1 の `_get_portal_cb` (containing block 探索、`.ric-page` の backdrop-filter を
// 避けるための祖先探索) は移植しない — v2 には `.ric-page` 概念が無く、
// createPopup も既に「viewport 基準 (window.innerWidth/innerHeight)」に簡略化して
// portal を実装していた (v1 との既知の差異、CB 相当の概念が無いため)。dropdown も
// 同じ簡略化を踏襲する (最終報告に記載)。
//
// v1 の `_get_expand_ref` (アイコンモードの「左右どちらに展開するか」を論理コンテナの
// 中心で判定する) も同様の理由で移植しない。dropdown は代わりに `clampLeft` で
// viewport 内に収める (below/above の flip と同じ「実測してからはみ出しを解消する」
// 考え方、位置決めの厳密さより「壊れない」ことを優先する v1 の設計思想を継承)。

export interface Pos {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
  minWidth?: number;
  /** 上下どちらにも入りきらないときの高さ制限 (2.0.0-alpha.28)。指定時は中をスクロールさせる */
  maxHeight?: number;
}

/** Pos (px 数値) を inline style 用の文字列 object に変換する。 */
export const posToStyle = (pos: Pos): Record<string, string> => {
  const style: Record<string, string> = {};
  if (pos.top !== undefined) style.top = `${pos.top}px`;
  if (pos.bottom !== undefined) style.bottom = `${pos.bottom}px`;
  if (pos.left !== undefined) style.left = `${pos.left}px`;
  if (pos.right !== undefined) style.right = `${pos.right}px`;
  if (pos.minWidth !== undefined) style.minWidth = `${pos.minWidth}px`;
  if (pos.maxHeight !== undefined) {
    style.maxHeight = `${pos.maxHeight}px`;
    style.overflowY = 'auto';
  }
  return style;
};

/**
 * スクロールで閉じるべきか (2.0.0-alpha.28、popup / dropdown で共有)。
 *
 * 浮遊面は開いた瞬間の位置に `position: fixed` で留まるので、基準要素 (トリガーや openAt の要素) が
 * スクロールで動くと、見た目は別の要素に付いているのに中身は元の対象を指す。Rancha の報告では、一覧の
 * 「…」メニューを開いたままホイールでスクロールすると別の行に付いて見え、「ごみ箱へ」で見た目と違う
 * ファイルが消えうる状態だった (wheel は pointerdown ではないので light dismiss も効かない)。
 *
 * 判定 (document の capture で受けた scroll イベントの target について):
 *   - 本体の中のスクロール (項目が多く高さを制限したとき) → 閉じない
 *   - ページ全体のスクロール (document / html / body) → 閉じる
 *   - 基準要素があり、その祖先 (= 基準要素を含む領域) のスクロール → 閉じる
 *   - それ以外 → 閉じない。基準要素の無い openAt({x,y}) (右クリックメニュー等) は、無関係な領域
 *     (末尾に追従するログ欄など) が動くたびに閉じないよう、ページのスクロールだけで閉じる
 */
export const shouldCloseOnScroll = (target: EventTarget | null, anchor: Element | null, body: Element | null): boolean => {
  if (!target || typeof document === 'undefined') return false;
  if (body && target instanceof Node && body.contains(target)) return false;
  if (target === document || target === document.documentElement || target === document.body) return true;
  if (!anchor) return false;
  return target instanceof Node && target.contains(anchor);
};

/**
 * 実測した高さが、選んだ向きの空きに入りきらないときの高さ制限 (2.0.0-alpha.28、Rancha の報告:
 * 高さ 100px のウィンドウでテーマメニューを開くと、上に反転した本体が画面の上にはみ出して 7 項目中
 * 6 項目が押せなかった)。below は `edge` (本体の上端) から viewport 下端まで、above は viewport 上端から
 * `edge` (本体の下端) までを、`margin` を残して使う。入りきるなら undefined (= 制限しない)。
 * 向きの選択 (computeFlipDir) は空きの広い側を選ぶので、ここで制限されるのは「どちらにも入らない」ときだけ。
 */
export const fitHeight = (dir: 'below' | 'above', edge: number, measuredH: number, margin = 8): number | undefined => {
  const available = dir === 'below' ? window.innerHeight - edge - margin : edge - margin;
  return measuredH > available ? Math.max(available, 0) : undefined;
};

/**
 * below/above の判定 (v1 `_make_popup_dir` 継承)。
 * trigger の下に contentH px 収まるか。収まらなくても上より下のスペースが広ければ below のまま。
 */
export const computeFlipDir = (rect: DOMRect, contentH: number): 'below' | 'above' => {
  const spaceBelow = window.innerHeight - rect.bottom;
  return spaceBelow >= contentH || spaceBelow >= rect.top ? 'below' : 'above';
};

/** computeFlipDir の座標版 (v1 `_make_popup_dir_at` 継承)。trigger の rect が無い openAt 用。 */
export const computeFlipDirAt = (y: number, contentH: number): 'below' | 'above' => {
  const spaceBelow = window.innerHeight - y;
  return spaceBelow >= contentH || spaceBelow >= y ? 'below' : 'above';
};

/** 横位置を viewport 内 ([margin, innerWidth - width - margin]) に収める。 */
export const clampLeft = (left: number, width: number | undefined, margin = 8): number => {
  if (width === undefined) return left;
  const maxLeft = Math.max(margin, window.innerWidth - width - margin);
  return Math.min(Math.max(left, margin), maxLeft);
};

/**
 * トリガー (rect) 基準の横位置計算 (2.0.0-alpha.2、パイロット第 2 号 (Trend Guard) の
 * 実機バグ報告への対応)。`measuredWidth` が未実測 (undefined、初回描画) の間は
 * `rect.left` をそのまま返す (実測前は「とりあえずトリガー左端」で仮置きし、
 * measure 後の再描画で確定する — below/above の flip と同じ「実測してから直す」設計)。
 *
 * 実測後は 3 段階で決める:
 *   1. rect.left から開いて viewport 内に収まるならそのまま (従来どおり)
 *   2. 収まらなければ「トリガーの右端に揃える」(`rect.right - measuredWidth`) —
 *      v1 の openAt 系 (`clampLeft` だけ) と違い、popup/dropdown のようにトリガー要素を
 *      持つ経路は「トリガーのすぐ下/上」という視覚的な連続性を保てるところまでは保つ
 *   3. それでも画面外にはみ出す (コンテンツが viewport 幅より広い) 場合のみ、
 *      最終手段として `clampLeft` で viewport 内に強制的に収める
 *
 * createPopup (トリガー経路) と createDropdown で共有する。openAt 系 (トリガー要素を
 * 持たない、`computePosAt` 相当) は元々 `clampLeft` だけで正しく動いていたため対象外。
 */
export const computeAnchoredLeft = (rect: { left: number; right: number }, measuredWidth: number | undefined, margin = 8): number => {
  if (measuredWidth === undefined) return rect.left;
  const overflowsRight = rect.left + measuredWidth > window.innerWidth - margin;
  const candidate = overflowsRight ? rect.right - measuredWidth : rect.left;
  return clampLeft(candidate, measuredWidth, margin);
};

/**
 * 実測 render (`visibility: hidden` で一瞬だけ本体を描画し `offsetWidth`/`offsetHeight` を
 * 読む段階) 専用の仮 left 位置 (2.0.0-alpha.5、#14 バグ修正)。
 *
 * 経緯: popup (トリガー経路・openAt 経路) / dropdown はいずれも、実測 render の間
 * `left: rect.left` (または openAt の `left: x`) のまま本体を置いていた。本体は
 * `position: fixed` + 幅未指定 (shrink-to-fit) なので、その時点で使える横幅は
 * `innerWidth - rect.left` に制限される。トリガーが viewport 右端に近いと、本来
 * 折り返さない内容でも折り返され、`offsetWidth` が本来より小さく測られてしまう
 * (実測例: rect.left 1213.33 → 実測 offsetWidth 224、本来 417)。過小な幅で
 * `computeAnchoredLeft`/`clampLeft` の右端揃えをすると、本体は本来より狭いまま
 * viewport 右端に張り付き、右マージンが消える。
 *
 * 対策: 実測 render の間だけ `left: margin` (= 既定の viewport マージン、
 * `clampLeft`/`computeAnchoredLeft` の既定値と揃えた 8px) に置く。`visibility: hidden`
 * なので実測中の見た目上の位置はどこでも問題ない — 本体は `right` を指定していない
 * (`position: fixed` + shrink-to-fit) ので、これで実測時に使える横幅は
 * `innerWidth - margin` (viewport 右端いっぱいまで、ほぼ viewport 全幅) になり、
 * 「viewport に収まる最大幅」が正しく測れる。測定後の再描画では、この正しい幅を使って
 * `computeAnchoredLeft`/`clampLeft` が最終位置を決める (そちらのロジックは変更なし)。
 *
 * `width: max-content` (CSS だけで shrink-to-fit の制約を外す案) は採らなかった —
 * viewport よりコンテンツが広いケースで、最終的な折り返し幅 (clamp 後の利用可能幅で
 * 折り返した幅) と実測時の幅 (無制限に伸びた幅) が食い違ってしまうため。
 *
 * popup (トリガー経路・openAt 経路) と dropdown の 3 箇所で共有する (バラバラに
 * 書かない)。上下方向 (below/above の flip) の実測ロジックはこの対象外 — 高さ側は
 * 実測 render 中も `position: fixed` の `top`/`bottom` がトリガー基準のまま計算されて
 * おり、横方向のような「利用可能幅が縮む」問題が構造的に起きないため変更不要。
 */
export const measuringLeft = (margin = 8): number => margin;
