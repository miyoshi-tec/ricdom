// ricdom/ui — uiProgress (設計書 §52、2.0.0-alpha.33)
//
// 時間のかかる処理の「どこまで進んだか」を出す進捗棒。状態を持たない純粋関数
// (uiButton や uiRange と同じ流儀)。Paper Bridge からの依頼で追加した (v1 には無い部品)。
//
// 構成:
//   div.ric-progress
//   ├ div.ric-progress__head      label か % があるとき
//   │  ├ div.ric-progress__label  role="status" (文が変わったときだけ読み上げられる)
//   │  └ span.ric-progress__percent  aria-hidden (進むたびに読み上げさせない)
//   ├ div.ric-progress__track     role="progressbar" + aria-valuenow (0〜100)
//   │  └ div.ric-progress__fill   幅 = %
//   └ div.ric-progress__foot      children か action があるとき
//      ├ div.ric-progress__detail children (経過時間などの補足。読み上げない)
//      └ div.ric-progress__action action (やめるボタンなど)
//
// 設計上の判断:
//   - **棒は <progress> ではなく div + role="progressbar"**。<progress> の見た目は UA 任せで、
//     不定のときの動きや prefers-reduced-motion の扱いがブラウザごとに違う。alpha.32 の方針
//     (見た目をブラウザ既定に預けない) に合わせ、幅・色・動きを ricdom-ui の CSS で決める。
//     読み上げは WAI-ARIA の progressbar の作法どおり (値は aria-valuenow、不定なら属性なし)。
//   - **経過時間や残り時間を部品の中で数えない**。ricdom には部品単位の再描画が無く、部品が毎秒
//     再描画を求めてもアプリ全体の描画になる (= アプリが 1 秒ごとに state を更新するのと同じ
//     負荷で、省けるのはタイマーの数行だけ)。残り時間の見積もり方もアプリごとに違う。
//     文はアプリが作って `children` に渡す。再検討の条件は設計書 §52。
//   - **% は status の外**。進捗は aria-valuenow で伝わる (読み上げソフトが自分の間隔で読む)。
//     status の中に % を入れると、進むたびに読み上げが割り込む。
//
// rest スプレッド契約: rest と class / style は外側の div.ric-progress に付く。

import type { ClassValue, RicElementNode, RicNode, StyleValue } from '../types.js';
import { UI_ROLE, mergeClass } from './internal/pureHelpers.js';

export interface UiProgressProps {
  /** 進み具合 (0〜1)。範囲外は 0〜1 に収める。省略・null・NaN なら「不定」(動く棒) になる。 */
  value?: number | null;
  /** 何をしているかの文。`role="status"` の中に出すので、文が変わると読み上げられる。 */
  label?: RicNode | RicNode[];
  /** 棒の読み上げ名。省略時、`label` が文字列ならそれを使う。 */
  barLabel?: string;
  /** `label` の右に % を出すか (既定 true)。不定のときは出さない。 */
  showPercent?: boolean;
  /** 棒の下に出す補足 (経過時間など)。読み上げの対象にしないので、毎秒書き換えてよい。 */
  children?: RicNode | RicNode[];
  /** 棒の下の右に置く操作 (やめるボタンなど)。 */
  action?: RicNode | RicNode[];
  class?: ClassValue;
  style?: StyleValue;
  [key: string]: unknown;
}

const toArray = (v: RicNode | RicNode[] | undefined): RicNode[] => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]);

/**
 * 進捗棒。状態を持たない純粋関数。
 *   uiProgress({ value: s.done / s.total, label: '計算しています', action: uiButton({ children: ['やめる'], onclick: cancel }) })
 *   uiProgress({ label: '接続を待っています' })   // value なし = 不定
 */
export const uiProgress = ({ value, label, barLabel, showPercent = true, children, action, class: extraClass, ...rest }: UiProgressProps = {}): RicNode => {
  const determinate = typeof value === 'number' && Number.isFinite(value);
  const percent = determinate ? Math.round(Math.min(1, Math.max(0, value)) * 100) : null;
  const labelNodes = toArray(label);
  const detailNodes = toArray(children);
  const actionNodes = toArray(action);
  const name = barLabel ?? (typeof label === 'string' ? label : undefined);
  const hasPercentText = percent !== null && showPercent;

  const head =
    labelNodes.length > 0 || hasPercentText
      ? {
          tag: 'div',
          class: 'ric-progress__head',
          children: [
            { tag: 'div', class: 'ric-progress__label', role: 'status', children: labelNodes },
            hasPercentText ? { tag: 'span', class: 'ric-progress__percent', 'aria-hidden': 'true', children: [`${percent}%`] } : null,
          ],
        }
      : null;

  const track = {
    tag: 'div',
    class: `ric-progress__track${percent === null ? ' ric-progress__track--indeterminate' : ''}`,
    role: 'progressbar',
    'aria-valuemin': '0',
    'aria-valuemax': '100',
    ...(percent !== null ? { 'aria-valuenow': String(percent) } : {}),
    ...(name !== undefined ? { 'aria-label': name } : {}),
    children: [{ tag: 'div', class: 'ric-progress__fill', ...(percent !== null ? { style: { width: `${percent}%` } } : {}) }],
  };

  const foot =
    detailNodes.length > 0 || actionNodes.length > 0
      ? {
          tag: 'div',
          class: 'ric-progress__foot',
          children: [
            { tag: 'div', class: 'ric-progress__detail', children: detailNodes },
            actionNodes.length > 0 ? { tag: 'div', class: 'ric-progress__action', children: actionNodes } : null,
          ],
        }
      : null;

  return {
    ...rest,
    tag: 'div',
    class: mergeClass('ric-progress', extraClass),
    'data-ricdom-role': UI_ROLE.progress,
    children: [head, track, foot],
  } as RicElementNode;
};
