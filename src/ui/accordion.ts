// ricdom/ui — createAccordion (設計書 §3.4 部品契約 + 付録 E a11y)
//
// v1 (ric_ui/composite/create_ui_accordion.js) の移植。開閉パネルリスト、内部状態付き。
//
// v1 との相違点:
//   - 状態を持つので `app.use(createAccordion(options))` で明示登録する (設計書 §3.4)。
//   - a11y を新規実装 (v1 未対応): ヘッダは `<button aria-expanded aria-controls>`、
//     パネルは `role="region"` + `aria-labelledby`。Enter/Space は `<button>` タグの
//     ネイティブ挙動でそのまま満たされる (v1 も元々 `<button>` を使っていたため無料)。
//   - `title` に文字列だけでなく VDOM ノード (アイコン混在等) を渡せる契約は v1 から継承。
//   - **controlled / uncontrolled 両対応** (2.0.0-alpha.7、`createTabs` と同じ規約):
//     `open` props を渡せば controlled (外部の state が唯一の真実、内部 `openMap` は
//     更新しない)、省略すれば uncontrolled (従来どおり内部状態で管理)。パイロット第 4 号
//     (章動減速機 設計ツール) から「ボタン押下で節を外部から閉じたい」「共有 URL から
//     開閉状態を復元したい」の要望が出て追加した。
//   - **`setOpen()` のような命令的 API は持たない**: 外部制御の canon は controlled 1 つに
//     揃える (§ポリシー「canon は 1 つ」)。command 的な `setOpen(id, bool)` を別に生やすと
//     「controlled props で制御する」「命令的メソッドで制御する」の 2 系統が併存し、
//     どちらが正なのか consumer が毎回悩む polysemic API になる。`createTabs` も同じ理由で
//     `active` props のみ (専用の `select()` メソッドを持たない) — 一貫性を優先する。
//
// controlled モードの詳細 (tabs.ts と同じ規則):
//   - `open` が渡されると controlled。表示は常に `open` props に従い、ヘッダクリック
//     (および Enter/Space = button のネイティブ click) では内部状態を一切更新せず、
//     `onToggle?.(id, nextOpen, nextMap)` を呼ぶだけ。`onToggle` が未指定なら何も起きない
//     (tabs の `active` のみ指定・`onChange` 省略時と同じ「見た目が変わらないだけ」の扱い)。
//   - `nextMap` は「もし uncontrolled だったらこうなっていたはずの」完全な次状態:
//     `multi: false` (排他) なら押した節だけ true・他の全節が false の map、
//     `multi: true` (既定) なら現在の `open` に押した節の反転値をマージした map。
//     consumer は `onToggle: (id, next, map) => { s.acc = map; }` と書くだけで良い
//     (id / next 単体も渡すのは、map だけでは「どれが変わったか」を都度 diff するのが
//     面倒な consumer 向けの便宜。3 引数とも同じ情報から導けるが、生成済みの形で渡す)。
//   - `isOpen(id)` は両モードで正しい値を返す (controlled では直近に渡された `open` を参照)。
//
// アニメーション: `grid-template-rows: 0fr → 1fr` のトリックで auto 高さに対して
// アニメーションする (scrollHeight 計測不要、v1 継承)。
//
// 使い方 (uncontrolled、従来どおり):
//   const acc = app.use(createAccordion({ defaultOpen: { a: true } }));
//   render 内で毎回呼ぶ:
//   acc({
//     items: [
//       { id: 'a', title: 'タイトル', children: [uiText({ children: ['本文'] })] },
//       { id: 'b', title: [uiIcon(ICON), ' write_file'], children: [...] },
//     ],
//     multi: true, // true (既定) = 複数パネル同時展開可 / false = 常に 1 パネルのみ (排他)
//   })
//
// 使い方 (controlled):
//   acc({ items, open: s.acc, onToggle: (id, next, map) => { s.acc = map; } })

import type { RicNode } from '../types.js';
import { type AttachGuard, type Component, createAttachGuard } from './internal/component.js';
import { UI_ROLE } from './internal/pureHelpers.js';
import { uiIcon } from './icon.js';

// 開閉インジケータ (chevron-down)。閉=下向き、開=CSS で 180° 回転して上向き (v1 継承)。
const CHEVRON_DOWN = { p: 'm6 9 6 6 6-6' };

export interface AccordionItem {
  id: string;
  /** VDOM ノード可 (アイコン混在等、v1 継承の契約) */
  title: RicNode | RicNode[];
  children?: RicNode | RicNode[];
}

export interface CreateAccordionOptions {
  /** 初期展開状態 ({ [id]: boolean }) */
  defaultOpen?: Record<string, boolean>;
}

export interface AccordionProps {
  items: AccordionItem[];
  /** true (既定) = 複数パネル同時展開可 / false = 常に 1 パネルのみ展開 (排他) */
  multi?: boolean;
  /** 指定すると controlled モード ({ [id]: boolean })。省略すれば uncontrolled (内部状態管理)。 */
  open?: Record<string, boolean>;
  /**
   * controlled モードでヘッダクリック (Enter/Space 含む) のたびに呼ばれる。
   * `nextMap` は「uncontrolled ならこうなっていた」完全な次状態 —
   * `s.acc = nextMap` を代入するだけで良い形で渡す。uncontrolled モードでは呼ばれない。
   */
  onToggle?: (id: string, nextOpen: boolean, nextMap: Record<string, boolean>) => void;
}

export interface AccordionInstance extends Component<AccordionProps> {
  /** 指定 id のパネルが現在展開中か */
  isOpen(id: string): boolean;
}

let nextAccordionId = 0;

/**
 * 開閉パネルリストを作る。状態を持つため `app.use(createAccordion())` で登録する。
 *   const acc = app.use(createAccordion());
 *   acc({ items: [{ id: 'a', title: 'A', children: [...] }], multi: true })
 */
export const createAccordion = (options: CreateAccordionOptions = {}): AccordionInstance => {
  const { defaultOpen = {} } = options;
  const fid = ++nextAccordionId;
  const guard: AttachGuard = createAttachGuard('createAccordion');

  const openMap: Record<string, boolean> = { ...defaultOpen };
  // controlled モード時の直近の `open` props (isOpen() が両モードで正しい値を返すための
  // 参照。tabs.ts の `lastActive` と同じ考え方 — render のたびに更新し、uncontrolled に
  // 戻ったら null に戻す)。
  let lastControlledOpen: Record<string, boolean> | null = null;

  const headerId = (id: string): string => `ricdom-accordion-${fid}-${encodeURIComponent(id)}-header`;
  const panelId = (id: string): string => `ricdom-accordion-${fid}-${encodeURIComponent(id)}-panel`;

  const inst = ((props: AccordionProps): RicNode => {
    const host = guard.ensure();
    if (!host) return null;

    const { items = [], multi = true, open, onToggle } = props;
    const controlled = open !== undefined;
    lastControlledOpen = controlled ? open : null;

    return {
      tag: 'div',
      class: 'ric-accordion',
      'data-ricdom-role': UI_ROLE.accordion,
      children: items.map(({ id, title, children: itemChildren }) => {
        const isItemOpen = controlled ? !!open[id] : !!openMap[id];
        return {
          tag: 'div',
          class: 'ric-accordion__item',
          'data-ricdom-role': UI_ROLE.accordionItem,
          children: [
            {
              tag: 'button',
              class: `ric-accordion__header${isItemOpen ? ' ric-accordion__header--open' : ''}`,
              'data-ricdom-role': UI_ROLE.accordionHeader,
              id: headerId(id),
              'aria-expanded': isItemOpen ? 'true' : 'false',
              'aria-controls': panelId(id),
              onclick: () => {
                if (controlled) {
                  // controlled: 内部状態には一切触れず、次状態を計算して onToggle に渡すだけ。
                  // onToggle 未指定なら何も起きない (tabs の active-only 指定時と同じ扱い)。
                  const nextOpen = !isItemOpen;
                  const nextMap: Record<string, boolean> = multi
                    ? { ...open, [id]: nextOpen }
                    : Object.fromEntries(items.map((it) => [it.id, it.id === id && nextOpen]));
                  onToggle?.(id, nextOpen, nextMap);
                  return;
                }
                if (!multi) {
                  // 排他モード: 他をすべて閉じる
                  for (const k of Object.keys(openMap)) openMap[k] = false;
                }
                openMap[id] = !isItemOpen;
                guard.host?.notify();
              },
              children: [
                { tag: 'span', class: 'ric-accordion__title', 'data-ricdom-role': UI_ROLE.accordionTitle, children: [title] },
                // 開閉インジケータ: uiIcon の chevron。header--open のとき CSS で 180° 回転。
                // uiIcon は data-ricdom-role を常に 'icon' で確定させる (icon.ts 参照) ため、
                // ここに 'data-ricdom-role' を渡しても反映されない — 渡さない (dead prop を作らない)。
                uiIcon(CHEVRON_DOWN, { size: '1em', class: 'ric-accordion__arrow' }),
              ],
            },
            {
              tag: 'div',
              class: `ric-accordion__body${isItemOpen ? ' ric-accordion__body--open' : ''}`,
              'data-ricdom-role': UI_ROLE.accordionBody,
              id: panelId(id),
              role: 'region',
              'aria-labelledby': headerId(id),
              // 閉じたパネルは inert でフォーカス (Tab) と a11y ツリーの両方から除外する
              // (2.0.0-alpha.23、ギア軽量化デモ報告)。以前は `hidden` 属性を使っていたが、
              // CSS 側が `.ric-accordion__body { display: grid; ... }` という author 規則を持つ
              // (grid-template-rows のクローズアニメーション用) ため UA スタイルシートの
              // `[hidden] { display: none }` に勝ち、hidden は何の効果も持たなかった —
              // 閉じていても中の input が Tab でフォーカスされ、AX ツリーにも残っていた
              // (Chromium 140/154 で実測)。inert は描画 (display / 高さ 0 のアニメーション) に
              // 影響せず、フォーカスと AX だけを除外する。role="region" 自体は維持される。
              // 中の要素は高さ 0 のレイアウトボックスを持ち続けるが、inert なので操作できない。
              inert: !isItemOpen,
              children: [{ tag: 'div', class: 'ric-accordion__body-inner', children: Array.isArray(itemChildren) ? itemChildren : [itemChildren ?? null] }],
            },
          ],
        };
      }),
    } as unknown as RicNode;
  }) as AccordionInstance;

  inst.attach = guard.attach;
  inst.dispose = (): void => guard.dispose();
  inst.isOpen = (id: string): boolean => (lastControlledOpen ? !!lastControlledOpen[id] : !!openMap[id]);

  return inst;
};
