// ricdom/md-editor — createMdEditor (設計書 §3.4 部品契約、opt-in サブパス)
//
// Raccoon Memo (パイロット第 5 号) からの要望: 「uiTextarea と同じ props/DOM 挙動を持つ
// "Markdown ソースを色分け表示する textarea"」。consumer が実際に触る DOM は本物の
// `<textarea>` のまま — value/oninput/selectionStart/setSelectionRange/onpaste/ondrop/
// onscroll/scrollTop/scrollHeight/onkeydown/ref/class/placeholder/spellcheck が
// 一切変わらず動く。仕組みは「本物の textarea を文字を透明にして最前面に置き、その後ろに
// `<pre aria-hidden>` の「ミラー」が同じテキストを色分けして描画する」— キャレット/IME/
// undo/スクリーンリーダー/スペルチェックは全部本物の textarea が担う (ミラーは
// `aria-hidden="true"` + `island: true` で ricdom の diff から完全に外れる、この部品自身が
// DOM を直接書き換えて管理する)。
//
// `app.use(createMdEditor())` で登録する状態を持つ部品 (createScrollPane と同じ形、
// src/ui/scrollPane.ts のヘッダコメント参照)。ただし portal は使わない (scrollPane 同様、
// render が返すツリーの中に直接混ざる)。
//
// **文字幅不変の原則 (SPEC 参照)**: ミラーの色分け CSS (cssTemplates.ts の MD_EDITOR_CSS) は
// color/background-color/text-decoration/text-shadow/opacity/border-radius **だけ**を使う。
// font-weight/font-style/font-family/font-size/letter-spacing/padding をトークンの span に
// 使うと、ミラーの折返し位置が textarea の折返し位置とずれてしまう (実際のグリフ幅が変わる
// ため)。`**strong**` が実際には太字にならず text-shadow の縁取りで「それっぽく」見せている
// のはこのため。
//
// **同期のタイミング**: (1) `input` イベント (composedInput) で同期的にミラーを再構築、
// (2) `compositionend` でも安全のため再同期 (IME 確定後の取りこぼし対策)、(3) `scroll`
// イベントで scrollTop/scrollLeft をミラーへコピー、(4) render のたびに rAF + 200ms
// バックストップの二重化 (createScrollPane と同じアルゴリズム) でレイアウト
// (フォント計測・幅/高さ) を再同期 — ResizeObserver で textarea 自身のサイズ変化
// (splitter ドラッグ・`resize:vertical` ハンドル) も追う。

import type { ClassValue, RicElementNode, RicNode, StyleValue } from '../types.js';
import { type AttachGuard, type Component, createAttachGuard } from '../ui/internal/component.js';
// `HljsLike`/`declare global { interface Window { hljs?: HljsLike } }` は uiMdPre/uiCodePre と
// 共有する定義 (src/ui/internal/hljs.ts)。ここでは warnHljsMissing は使わない (hljs が無い
// 場合にプレーン色になるのが既定の想定挙動であり、md-editor では警告を出さない設計指示)。
import type { HljsLike } from '../ui/internal/hljs.js';
import { UI_ROLE, mergeClass } from '../ui/internal/pureHelpers.js';
import { uiTextarea, type UiTextareaProps } from '../ui/textarea.js';
import { tokenizeMarkdown } from './tokenizer.js';

export interface MdEditorProps extends UiTextareaProps {
  /** 'none' で装飾なしの素の uiTextarea にフォールバックする (既定 'markdown') */
  highlight?: 'markdown' | 'none';
  /**
   * ラッパー `div.ric-md-editor`（`[data-ricdom-role="md-editor"]`）に合成する追加 class。
   * textarea 側の `class` (`.ric-md-editor__input` に合成される) とは別系統 — consumer が
   * ラッパーを flex item としてサイズ指定したいという要望 (Raccoon Memo 追報 4、
   * 2026-09-17) に対応する。**`highlight:'none'` / 閾値超えのフォールバック時はラッパー
   * 自体が存在しないため、この prop は単に無視される** (SPEC.md §13 FACT 参照 — その
   * パスに入る前に rest から取り除いているので uiTextarea には一切渡らない)。
   */
  wrapperClass?: ClassValue;
  /**
   * ラッパー `div.ric-md-editor` に適用する inline style。wrapperClass と同じ理由・同じ
   * フォールバック挙動 (highlight:'none' 等ではラッパーが無いので無視される)。textarea 側の
   * レイアウトを変えたい場合は uiTextarea の `style` prop (rest 経由でそのまま透過) を使う。
   */
  wrapperStyle?: StyleValue;
}

export interface MdEditorInstance extends Component<MdEditorProps> {}

// ミラーへコピーする、文字の折返し位置に影響する computed style のプロパティ一覧
// (SPEC の FACT: ミラーは textarea の computed font metrics をコピーするので、
// consumer が textarea に当てた CSS — フォント指定・パディング・枠線幅 等 — がそのまま
// 尊重される)。
//
// **`boxSizing` は意図的にこの一覧から除外する** (統括の独立検証で発見した実装の穴、
// 2026-09-17)。textarea の box-sizing (既定 `content-box` — `.ric-textarea` の CSS は
// border-box を指定していない) をそのままミラーにコピーすると、`content-box` の場合に
// `mirror.style.width = clientWidth + 横 border` という宣言値がそのまま「文字の収まる幅」
// として使われてしまい、padding 分だけ textarea の実際の content 幅より広くなって
// 折返しがずれる (実測: textarea content 233px に対しミラー content 262px、scrollHeight
// 814 vs 793、矩形幅差 19px 超)。ミラーは常に `mirror.style.boxSizing = 'border-box'`
// に固定する (applyLayout 内、下記) — border-box なら `width - padding - border`
// = `(clientWidth + border) - padding - border` = `clientWidth - padding` となり、
// textarea 自身の box-sizing に関わらず「textarea の content 幅」と一致する
// (clientWidth は IDL 上つねに「content + padding」を返すため)。
const COPIED_LAYOUT_PROPS = [
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'lineHeight',
  'letterSpacing',
  'wordSpacing',
  'tabSize',
  'textIndent',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'textAlign',
  'direction',
  'overflowWrap',
] as const;

const SYNC_BACKSTOP_MS = 200;

// 文字コード経由で組み立てる (ソース上に生の不可視文字を残さない — エディタ/差分表示で
// 見えない文字が紛れ込むと事故の元になるため)。textarea の「末尾の空行」を <pre> でも
// 同じ見た目の行数にするための埋め草 (rebuildMirror 参照)。
const ZERO_WIDTH_SPACE = String.fromCharCode(0x200b);

let nextMdEditorId = 0;

/**
 * uiTextarea と同じ props/DOM 挙動を保ったまま、Markdown ソースを VS Code 風に色分け表示する
 * textarea を作る。状態を持つため `app.use()` で登録する。
 *   const md = app.use(createMdEditor());
 *   md({ value: s.body, oninput: (ev) => { s.body = ev.target.value; } })
 */
export const createMdEditor = (options: { maxHighlightLength?: number } = {}): MdEditorInstance => {
  const { maxHighlightLength = 200_000 } = options;
  const id = ++nextMdEditorId;
  const guard: AttachGuard = createAttachGuard('createMdEditor');

  // 直近にミラーへ反映済みのテキスト (再構築が必要かどうかの同期比較用)
  let lastMirroredText: string | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let observedTextarea: HTMLTextAreaElement | null = null;

  // rAF + setTimeout(200ms) バックストップの二重化 (createScrollPane と同じアルゴリズムの
  // 複製 — インスタンスごとに閉じた状態であるべきで、かつこの部品はコアの一部ではないため)。
  let syncScheduled = false;
  let syncRafId: number | null = null;
  let syncBackstopId: ReturnType<typeof setTimeout> | null = null;

  const findWrapper = (): HTMLElement | null => (typeof document === 'undefined' ? null : (document.querySelector(`[data-ricdom-md-editor-id="${id}"]`) as HTMLElement | null));

  const findParts = (): { textarea: HTMLTextAreaElement; mirror: HTMLElement } | null => {
    const wrapper = findWrapper();
    if (!wrapper) return null;
    const textarea = wrapper.querySelector('textarea');
    const mirror = wrapper.querySelector('pre');
    if (!textarea || !mirror) return null;
    return { textarea, mirror: mirror as HTMLElement };
  };

  // compositionend の安全網 (Chromium の `input` 経由の同期で足りない場合の保険)。
  //
  // **`oncompositionend` を uiTextarea の props (ricdom の on* 機構、`el.oncompositionend =
  // fn`) として渡すのは統括の独立検証で発見した実装の穴 (2026-09-17) だった** — ブラウザは
  // `compositionend`/`compositionstart`/`compositionupdate` に対応する IDL イベントハンドラ
  // 属性を持たない (`'oncompositionend' in document.createElement('textarea')` は
  // Chromium で false)。ricdom のコア (src/dom.ts) は on* キーをプロパティ代入
  // (`el[key] = fn`) で結線するだけなので、これらのイベントでは何もしない expando を
  // 作るだけで発火しない dead code になっていた (SPEC.md §2.1 の新規 FACT 参照)。
  // 代わりに `addEventListener` で直接結線する — 対象の textarea 要素が変わったとき
  // (ResizeObserver の張り替えと同じタイミング、syncNow 参照) に張り替える。
  const handleCompositionEnd = (ev: Event): void => {
    const target = ev.target as HTMLTextAreaElement;
    const parts = findParts();
    if (parts) rebuildMirror(parts.mirror, target.value);
  };

  // トークン列 → ミラー <pre> の子ノードを作る (innerHTML を使わず createTextNode/
  // createElement で組み立てる — 唯一の例外は hljs 適用時の 1 span だけ、uiCodePre と同じ
  // ルール)。フェンスコード本文 (fenceBody) は「言語あり + window.hljs あり」の場合だけ
  // hljs を通す。hljs が無い場合は警告を出さない (プレーン色が既定の想定挙動であり、
  // uiMdPre/uiCodePre の「hljs 未読込 warn」とは違う扱い — 設計指示どおり)。
  const rebuildMirror = (mirror: HTMLElement, text: string): void => {
    const doc = mirror.ownerDocument;
    const frag = doc.createDocumentFragment();
    for (const tok of tokenizeMarkdown(text)) {
      if (tok.cls === null) {
        if (tok.text) frag.appendChild(doc.createTextNode(tok.text));
        continue;
      }
      const span = doc.createElement('span');
      span.className = tok.cls;
      const hljs: HljsLike | undefined = typeof window !== 'undefined' ? window.hljs : undefined;
      if (tok.fenceBody && tok.lang && hljs) {
        try {
          span.innerHTML = hljs.highlight(tok.text, { language: tok.lang }).value;
        } catch {
          span.textContent = tok.text;
        }
      } else {
        span.textContent = tok.text;
      }
      frag.appendChild(span);
    }
    // 末尾が改行 (または空文字列) の場合、textarea は「最後の空行」を持つ見た目になるが
    // <pre> はテキストノード末尾の改行だけでは高さを持たない — ゼロ幅スペースを足して
    // textarea と同じ見た目の行数にする (mirror.textContent は「ゼロ幅を除けば」value と一致)。
    if (text.length === 0 || text.endsWith('\n')) frag.appendChild(doc.createTextNode(ZERO_WIDTH_SPACE));
    mirror.replaceChildren(frag);
    lastMirroredText = text;
  };

  // textarea の computed style をミラーへコピーし、折返し幅がスクロールバーの分だけ
  // ずれないよう clientWidth/clientHeight (スクロールバー分を除いた内寸) を使う。
  const applyLayout = (textarea: HTMLTextAreaElement, mirror: HTMLElement): void => {
    if (typeof window === 'undefined') return;
    const cs = window.getComputedStyle(textarea);
    const mirrorStyle = mirror.style as unknown as Record<string, string>;
    const csIndexable = cs as unknown as Record<string, string>;
    for (const prop of COPIED_LAYOUT_PROPS) mirrorStyle[prop] = csIndexable[prop]!;
    // white-space/overflow-wrap は textarea の指定に関わらず必ずこの値に固定する
    // (textarea は本質的に white-space:pre-wrap 相当の折返しをするため)。
    mirror.style.whiteSpace = 'pre-wrap';
    mirror.style.overflowWrap = cs.overflowWrap || 'break-word';
    mirror.style.borderStyle = 'solid';
    mirror.style.borderColor = 'transparent';
    // ミラー自身は常に border-box に固定する (COPIED_LAYOUT_PROPS のコメント参照 —
    // textarea の box-sizing (既定 content-box) をそのままコピーしていたのがバグだった)。
    mirror.style.boxSizing = 'border-box';
    // 内寸 (スクロールバー幅を除く) を使い、textarea 側の縦スクロールバー分だけ折返し幅が
    // 広くならないようにする (仕様: textarea.clientWidth + 横 border 幅)。ミラーを
    // border-box に固定したので、`width - padding - border` = `(clientWidth + border) -
    // padding - border` = `clientWidth - padding` = textarea の実際の content 幅
    // (textarea 自身が content-box でも border-box でも、clientWidth は常に
    // 「content + padding」を返すため式が成立する)。
    const bw = (cs.borderLeftWidth ? parseFloat(cs.borderLeftWidth) : 0) + (cs.borderRightWidth ? parseFloat(cs.borderRightWidth) : 0);
    const bh = (cs.borderTopWidth ? parseFloat(cs.borderTopWidth) : 0) + (cs.borderBottomWidth ? parseFloat(cs.borderBottomWidth) : 0);
    mirror.style.width = `${textarea.clientWidth + bw}px`;
    mirror.style.height = `${textarea.clientHeight + bh}px`;
    mirror.style.overflow = 'hidden';
  };

  const syncNow = (): void => {
    const parts = findParts();
    if (!parts) return;
    const { textarea, mirror } = parts;
    applyLayout(textarea, mirror);
    if (textarea.value !== lastMirroredText) rebuildMirror(mirror, textarea.value);
    mirror.scrollTop = textarea.scrollTop;
    mirror.scrollLeft = textarea.scrollLeft;

    // 対象の textarea 要素が変わった (初回 or 再マウント) タイミングで、ResizeObserver と
    // compositionend の addEventListener を両方張り替える。ResizeObserver の有無に
    // かかわらず compositionend は結線する (どちらも「対象要素が変わったら張り替える」
    // という同じ寿命管理なので、判定を分けない)。
    if (observedTextarea !== textarea) {
      if (observedTextarea) {
        observedTextarea.removeEventListener('compositionend', handleCompositionEnd);
      }
      textarea.addEventListener('compositionend', handleCompositionEnd);
      if (resizeObserver) resizeObserver.disconnect();
      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(() => scheduleSync());
        resizeObserver.observe(textarea);
      } else {
        resizeObserver = null;
      }
      observedTextarea = textarea;
    }
  };

  const scheduleSync = (): void => {
    if (syncScheduled) return; // 同一フレーム内の重複予約を防ぐ
    syncScheduled = true;
    const run = (): void => {
      if (!syncScheduled) return; // 相方が既に処理済み
      syncScheduled = false;
      syncRafId = null;
      if (syncBackstopId !== null) {
        clearTimeout(syncBackstopId);
        syncBackstopId = null;
      }
      syncNow();
    };
    if (typeof requestAnimationFrame !== 'undefined') syncRafId = requestAnimationFrame(run);
    if (typeof setTimeout !== 'undefined') syncBackstopId = setTimeout(run, SYNC_BACKSTOP_MS);
  };

  const inst = ((props: MdEditorProps = {}): RicNode => {
    const host = guard.ensure();
    if (!host) return null;

    // wrapperClass/wrapperStyle はここで最初に取り除く — 'none'/閾値超えのフォールバック
    // (下記) は rest をそのまま uiTextarea に渡すだけなので、この時点で除いておけば
    // 「ラッパーが無いフォールバックでは静かに無視される」契約が自動的に成り立つ。
    const { highlight = 'markdown', wrapperClass, wrapperStyle, ...rest } = props;
    const value = typeof rest.value === 'string' ? rest.value : '';

    // エスケープハッチ: 'none' または閾値超えは「装飾なしの uiTextarea そのもの」を返す
    // (ラッパーもミラーも一切生成しない — uiTextarea と見分けが付かないことが契約)。
    if (highlight === 'none' || value.length > maxHighlightLength) {
      return uiTextarea(rest as UiTextareaProps);
    }

    // `oncompositionend` はここで destructure/合成しない — compositionend の実際の同期は
    // handleCompositionEnd の addEventListener 配線が担う (on* プロパティ代入では効かない、
    // 上のコメント参照)。consumer が独自に `oncompositionend` prop を渡した場合はここでの
    // 特別扱いをせず、他の rest props と同様そのまま textarea に透過する
    // (uiTextarea 経由で `el.oncompositionend = fn` される — 効かないのは consumer 自身の
    // ハンドラの話であり、md-editor の同期機構とは無関係)。
    const { class: extraClass, oninput, onscroll, ...restForTextarea } = rest;

    const composedInput = (ev: Event): void => {
      const target = ev.target as HTMLTextAreaElement;
      const parts = findParts();
      if (parts) rebuildMirror(parts.mirror, target.value);
      (oninput as ((ev: Event) => void) | undefined)?.(ev);
    };

    const composedScroll = (ev: Event): void => {
      const target = ev.target as HTMLTextAreaElement;
      const parts = findParts();
      if (parts) {
        parts.mirror.scrollTop = target.scrollTop;
        parts.mirror.scrollLeft = target.scrollLeft;
      }
      (onscroll as ((ev: Event) => void) | undefined)?.(ev);
    };

    scheduleSync();

    const textareaNode = uiTextarea({
      ...restForTextarea,
      value,
      class: mergeClass('ric-md-editor__input', extraClass),
      oninput: composedInput,
      onscroll: composedScroll,
    } as UiTextareaProps);

    const mirrorNode: RicElementNode = {
      tag: 'pre',
      class: 'ric-md-editor__mirror',
      'data-ricdom-role': UI_ROLE.mdEditorMirror,
      'aria-hidden': 'true',
      island: true,
    } as RicElementNode;

    return {
      tag: 'div',
      class: mergeClass('ric-md-editor', wrapperClass),
      ...(wrapperStyle ? { style: wrapperStyle } : {}),
      'data-ricdom-role': UI_ROLE.mdEditor,
      'data-ricdom-md-editor-id': String(id),
      children: [mirrorNode, textareaNode],
    } as RicElementNode;
  }) as MdEditorInstance;

  inst.attach = guard.attach;
  inst.dispose = (): void => {
    if (syncScheduled) {
      syncScheduled = false;
      if (syncRafId !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(syncRafId);
      syncRafId = null;
      if (syncBackstopId !== null) {
        clearTimeout(syncBackstopId);
        syncBackstopId = null;
      }
    }
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }
    if (observedTextarea) {
      observedTextarea.removeEventListener('compositionend', handleCompositionEnd);
    }
    observedTextarea = null;
    guard.dispose();
  };

  return inst;
};
