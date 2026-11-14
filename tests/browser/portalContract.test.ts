// 実ブラウザ回帰テスト: ポータル部品 (popup/dropdown/tooltip/toast/dialog) の共通コントラクト
// (2.0.0-alpha.3、パイロット第 2 号からのテスト戦略提案 #1)。
//
// 方針 (統括の指示): 「部品内部の決定 (class 名・inline 値) ではなく、利用者が観測できる
// 結果 (どこに出る・何にフォーカスがあるか・閉じたか) を assert する」。個々の部品テスト
// (uiPopup.test.ts 等) は各部品固有の挙動を見るが、このファイルは 5 部品共通で成り立つべき
// 契約をパラメタライズして検証する:
//   (a) 開いた本体の getBoundingClientRect() が viewport 内
//   (b) 本体の computed position が fixed (該当する要素で)
//   (c) target を `display:flex; flex-direction:column; height:100vh` のコンテナにして
//       開いても、target 内の兄弟コンテンツの rect が開く前後で変わらない
//       (#9 の再現条件そのもの — `.ric-dropdown__body` に position:fixed が無いと、
//       portal 内の本体が通常フローの高さを持ち、同じ flex 列に並ぶ兄弟を押し込んでいた)
// トリガーを持つ部品 (popup/dropdown/tooltip) は、本体がトリガーから妥当な距離
// (ここでは 32px) にあることも確認する。dialog はトリガーはあるが本体は viewport 中央に
// 固定表示される設計 (トリガーへの anchor ではない) なので距離チェックは対象外、
// toast はそもそもトリガーを持たない (queue に push するだけの通知 UI) ので対象外 —
// どちらも理由をコメントで明記し、テストを skip するのではなく最初から対象リストに
// 含めない形にする。

import { describe, expect, it } from 'vitest';
import { userEvent } from '@vitest/browser/context';
import { createApp } from '../../src/app.js';
import { createPopup } from '../../src/ui/popup.js';
import { createDropdown } from '../../src/ui/dropdown.js';
import { createTooltip } from '../../src/ui/tooltip.js';
import { createToast } from '../../src/ui/toast.js';
import { createDialog } from '../../src/ui/dialog.js';
import { injectStyles } from '../../src/ui/injectStyles.js';
import { dialogOpened, flush, setupApp, until } from '../_helpers/dom.js';

injectStyles(document);

// #9 の再現条件: target 自体を縦の flex コンテナにする (portal 要素は own-portal の
// 場合、target の末尾に追加の子要素として append される — position:fixed を持たない
// 本体は、この portal 要素に通常フローの高さを持たせてしまい、同じ列の兄弟を押し込む)。
const makeFlexColumnTarget = (): HTMLDivElement => {
  const app = setupApp();
  app.style.display = 'flex';
  app.style.flexDirection = 'column';
  app.style.height = '100vh';
  // flex item の既定 align-items:stretch のままだと、トリガー <button> 自身がコンテナの
  // クロス軸幅 (= viewport 幅) いっぱいに引き伸ばされてしまい、それを基準に
  // computeAnchoredLeft / label モードの minWidth を計算する dropdown の位置計算が
  // 意図せず巨大な幅を測ってしまう (テスト環境固有のノイズ、#9 の再現条件とは無関係) —
  // 兄弟を自然な幅のまま並べるため flex-start にする。
  app.style.alignItems = 'flex-start';
  // トリガーが viewport の左端ぎりぎりに来ると、水平方向のはみ出し clamp を持たない
  // createTooltip (popup/dropdown と違い computeAnchoredLeft/clampLeft を使わない、
  // 中心揃え + transform:translateX(-50%) のみ) が左にはみ出す — これは #9 の再現対象
  // (position:fixed の有無) とは無関係な、tooltip 側の既知の制約 (今回の 4 件のバグ修正
  // 対象外) なので、テスト環境側で余白を確保して踏まないようにする。
  app.style.padding = '0 0 0 40px';
  return app;
};

interface PortalCase {
  name: string;
  bodySelector: string;
  /** トリガーからの距離チェックをするか (無い場合は build() 呼び出しコメントに理由あり) */
  hasAnchorTrigger: boolean;
  build: () => Promise<{
    app: HTMLDivElement;
    triggerEl: HTMLElement | null;
    open: () => Promise<void>;
  }>;
}

const CASES: PortalCase[] = [
  {
    name: 'createPopup',
    bodySelector: '[data-ricdom-role="popup"]',
    hasAnchorTrigger: true,
    build: async () => {
      const app = makeFlexColumnTarget();
      let menu: ReturnType<typeof createPopup>;
      const handle = createApp('#app', {}, () => [
        { tag: 'div', id: 'sibling', style: { height: '40px' }, children: ['sibling'] },
        menu ? menu({ trigger: ['⋯'], children: [{ tag: 'button', class: 'ric-button', children: ['A'] }] }) : null,
      ]);
      menu = handle.use(createPopup());
      await flush();
      const triggerEl = app.querySelector('button') as HTMLElement;
      return {
        app,
        triggerEl,
        open: async () => {
          triggerEl.click();
          await new Promise((r) => setTimeout(r, 100)); // rAF 実測フェーズ
        },
      };
    },
  },
  {
    name: 'createDropdown',
    bodySelector: '[data-ricdom-role="dropdown"]',
    hasAnchorTrigger: true,
    build: async () => {
      const app = makeFlexColumnTarget();
      let dd: ReturnType<typeof createDropdown>;
      const handle = createApp('#app', {}, () => [
        { tag: 'div', id: 'sibling', style: { height: '40px' }, children: ['sibling'] },
        dd ? dd({ label: '選択肢', children: [{ tag: 'div', children: ['項目'] }] }) : null,
      ]);
      dd = handle.use(createDropdown());
      await flush();
      const triggerEl = app.querySelector('button') as HTMLElement;
      return {
        app,
        triggerEl,
        open: async () => {
          triggerEl.click();
          await new Promise((r) => setTimeout(r, 100));
        },
      };
    },
  },
  {
    name: 'createTooltip',
    bodySelector: '[data-ricdom-role="tooltip"]',
    hasAnchorTrigger: true,
    build: async () => {
      const app = makeFlexColumnTarget();
      let tip: ReturnType<typeof createTooltip>;
      const handle = createApp('#app', {}, () => [
        { tag: 'div', id: 'sibling', style: { height: '40px' }, children: ['sibling'] },
        tip ? tip({ content: 'ヒント', children: [{ tag: 'button', children: ['?'] }] }) : null,
      ]);
      tip = handle.use(createTooltip());
      await flush();
      // aria-describedby を持つ <span class="ric-tooltip"> が onmouseenter を持つ実要素
      // (中の <button> ではない、tooltip.ts の ev.currentTarget 参照)。
      const triggerEl = app.querySelector('.ric-tooltip') as HTMLElement;
      return {
        app,
        triggerEl,
        open: async () => {
          // userEvent.hover はヘッドレス環境でポインタ位置に依存し不安定なことがあるため、
          // onmouseenter に直接束縛された DOM プロパティを dispatchEvent で確実に起動する。
          triggerEl.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
          await flush();
        },
      };
    },
  },
  {
    name: 'createToast',
    bodySelector: '[data-ricdom-role="toast"]',
    // toast はトリガー要素を持たない (どこからでも toast.show() で queue に積む通知 UI)。
    hasAnchorTrigger: false,
    build: async () => {
      const app = makeFlexColumnTarget();
      let toast: ReturnType<typeof createToast>;
      const handle = createApp('#app', {}, () => {
        toast?.();
        return [{ tag: 'div', id: 'sibling', style: { height: '40px' }, children: ['sibling'] }];
      });
      toast = handle.use(createToast());
      await flush();
      return {
        app,
        triggerEl: null,
        open: async () => {
          toast.show('お知らせ');
          await flush();
        },
      };
    },
  },
  {
    name: 'createDialog',
    bodySelector: '[data-ricdom-role="dialog"]',
    // dialog は viewport 中央に固定表示される設計で、トリガーの隣に anchor されるわけ
    // ではない (popup/dropdown/tooltip と違い位置計算そのものが無い) ため、距離チェックは
    // 対象外とする。
    hasAnchorTrigger: false,
    build: async () => {
      const app = makeFlexColumnTarget();
      let dlg: ReturnType<typeof createDialog>;
      const handle = createApp('#app', {}, () => [
        { tag: 'div', id: 'sibling', style: { height: '40px' }, children: ['sibling'] },
        dlg ? dlg({ triggerChildren: ['開く'], title: 't', children: ['本文'] }) : null,
      ]);
      dlg = handle.use(createDialog());
      await flush();
      const triggerEl = app.querySelector('button') as HTMLElement;
      return {
        app,
        triggerEl,
        open: async () => {
          triggerEl.click();
          await dialogOpened(); // 開くアニメーションが終わり、初期フォーカスが入るまで
        },
      };
    },
  },
];

// #14 (2.0.0-alpha.5): popup (トリガー経路) と dropdown 共通の横幅測定バグ。
// 実測 render (visibility:hidden) の間、本体が `left: rect.left` のままだと、
// position:fixed + 幅未指定 (shrink-to-fit) の本体が使える横幅が
// `innerWidth - rect.left` に制限され、トリガーが viewport 右端に近いと折り返し可能な
// 長文が本来より狭く折り返されて offsetWidth が過小に測られる (uiDropdown.test.ts /
// uiPopup.test.ts の個別再現テストと同じ原因)。ここでは「部品固有の値ではなく利用者が
// 観測できる結果を見る」というこのファイルの方針に沿い、offsetWidth が本来幅 (viewport
// 左端近くのトリガーで開いたときの幅) と一致するかを popup/dropdown 共通の形で検証する
// (パイロット第 2 号からの「部品横断で捕まえる」提案への対応)。tooltip は
// computeAnchoredLeft 系のロジックを使わない (中心揃え + transform のみ) ため対象外、
// toast/dialog はそもそも横幅がトリガー位置に依存しないため対象外。
const LONG_TEXT = 'Alpha bravo charlie delta echo';

interface WidthCase {
  name: string;
  bodySelector: string;
  build: (triggerStyle: { left?: string; right?: string }) => Promise<{ width: number; right: number }>;
}

const measureBody = (app: HTMLElement, bodySelector: string): { width: number; right: number } => {
  const body = app.querySelector(bodySelector) as HTMLElement;
  return { width: body.offsetWidth, right: body.getBoundingClientRect().right };
};

const WIDTH_CASES: WidthCase[] = [
  {
    name: 'createPopup (トリガー経路)',
    bodySelector: '[data-ricdom-role="popup"]',
    build: async (triggerStyle) => {
      const app = setupApp();
      let menu: ReturnType<typeof createPopup>;
      // `.ric-button` は white-space:nowrap を持つため使わない (uiPopup.test.ts と同じ理由)。
      const handle = createApp('#app', {}, () => (menu ? menu({ trigger: ['⋯'], children: [{ tag: 'div', children: [LONG_TEXT] }] }) : null));
      menu = handle.use(createPopup());
      await flush();
      const trigger = app.querySelector('button')!;
      Object.assign(trigger.style, { position: 'fixed', top: '50px' }, triggerStyle);
      trigger.click();
      await new Promise((r) => setTimeout(r, 100));
      return measureBody(app, '[data-ricdom-role="popup"]');
    },
  },
  {
    name: 'createDropdown',
    bodySelector: '[data-ricdom-role="dropdown"]',
    build: async (triggerStyle) => {
      const app = setupApp();
      let dd: ReturnType<typeof createDropdown>;
      const handle = createApp('#app', {}, () => (dd ? dd({ label: '選択肢', children: [{ tag: 'div', children: [LONG_TEXT] }] }) : null));
      dd = handle.use(createDropdown());
      await flush();
      const trigger = app.querySelector('button')!;
      Object.assign(trigger.style, { position: 'fixed', top: '50px' }, triggerStyle);
      trigger.click();
      await new Promise((r) => setTimeout(r, 100));
      return measureBody(app, '[data-ricdom-role="dropdown"]');
    },
  },
];

describe('実ブラウザ: ポータル部品の横幅測定コントラクト (#14)', () => {
  for (const c of WIDTH_CASES) {
    it(`${c.name}: offsetWidth が本来幅と一致する (位置依存の過小測定なし)`, async () => {
      const reference = await c.build({ left: '8px' });
      const actual = await c.build({ right: '8px' });
      expect(Math.abs(actual.width - reference.width)).toBeLessThanOrEqual(2);
      expect(actual.right).toBeLessThanOrEqual(window.innerWidth - 8 + 1);
    });
  }
});

describe('実ブラウザ: ポータル部品の共通コントラクト', () => {
  for (const c of CASES) {
    describe(c.name, () => {
      it('開いた本体の rect が viewport 内', async () => {
        const { app, open } = await c.build();
        await open();
        const body = app.querySelector(c.bodySelector) as HTMLElement;
        expect(body).not.toBeNull();
        const rect = body.getBoundingClientRect();
        expect(rect.left).toBeGreaterThanOrEqual(-1);
        expect(rect.top).toBeGreaterThanOrEqual(-1);
        expect(rect.right).toBeLessThanOrEqual(window.innerWidth + 1);
        expect(rect.bottom).toBeLessThanOrEqual(window.innerHeight + 1);
      });

      it('本体の computed position が fixed', async () => {
        const { app, open } = await c.build();
        await open();
        const body = app.querySelector(c.bodySelector) as HTMLElement;
        expect(body).not.toBeNull();
        expect(getComputedStyle(body).position).toBe('fixed');
      });

      if (c.hasAnchorTrigger) {
        it('本体がトリガーから妥当な距離 (32px 以内) にある', async () => {
          const { app, open, triggerEl } = await c.build();
          await open();
          const body = app.querySelector(c.bodySelector) as HTMLElement;
          const bodyRect = body.getBoundingClientRect();
          const triggerRect = triggerEl!.getBoundingClientRect();
          const dx = Math.max(0, triggerRect.left - bodyRect.right, bodyRect.left - triggerRect.right);
          const dy = Math.max(0, triggerRect.top - bodyRect.bottom, bodyRect.top - triggerRect.bottom);
          expect(Math.max(dx, dy)).toBeLessThanOrEqual(32);
        });
      }

      it('#9 の再現条件: flex 列コンテナの兄弟コンテンツは開く前後で位置が変わらない', async () => {
        const { app, open } = await c.build();
        const sibling = app.querySelector('#sibling') as HTMLElement;
        const before = sibling.getBoundingClientRect();
        await open();
        const after = sibling.getBoundingClientRect();
        expect(after.top).toBeCloseTo(before.top, 0);
        expect(after.left).toBeCloseTo(before.left, 0);
      });
    });
  }
});

// light dismiss (#A、2.0.0-alpha.12、パイロット第 10 号・線茶からの報告)。popup/dropdown の
// 個別テスト (uiPopup.test.ts/uiDropdown.test.ts) が詳細を見るのに対し、このファイルの方針
// (部品横断で「利用者が観測できる結果」を見る) に合わせて、5 部品のうち実際に外側クリックで
// 閉じる契約を持つ 2 部品 (popup/dropdown) だけを対象に「本体が消える」「そのクリックが下の
// 要素まで届く」を確認する。tooltip はホバー/フォーカスで開閉し外側クリックの契約を持たない、
// toast はそもそも閉じる操作の対象ではない (queue 経由の通知)、dialog は独自の overlay
// (`.ric-dialog__overlay`、pointer-events:auto のまま、クリックを吸うモーダル背景として
// 意図的に維持) を持ち今回のスコープ外 — いずれも対象から外す理由をここに明記する。
describe('実ブラウザ: ポータル部品の light dismiss (外側 pointerdown で閉じ、下の要素にクリックが届く、2.0.0-alpha.12)', () => {
  const LIGHT_DISMISS_CASES = CASES.filter((c) => c.name === 'createPopup' || c.name === 'createDropdown');

  for (const c of LIGHT_DISMISS_CASES) {
    it(`${c.name}: 外側の要素をクリックすると閉じ、そのクリックが下の要素まで届く`, async () => {
      const { app, open } = await c.build();
      await open();
      expect(app.querySelector(c.bodySelector)).not.toBeNull();

      const outsideBtn = document.createElement('button');
      Object.assign(outsideBtn.style, { position: 'fixed', top: '450px', left: '10px' });
      let clicked = 0;
      outsideBtn.addEventListener('click', () => {
        clicked++;
      });
      document.body.appendChild(outsideBtn);

      // userEvent.click (実マウスイベント列 = pointerdown を含む) を使う — `.click()`
      // (プログラム的呼び出し) は 'click' イベントのみで pointerdown を発火しないため、
      // light dismiss の再現には userEvent 経由が必須 (uiPopup.test.ts と同じ理由)。
      await userEvent.click(outsideBtn);
      await until(() => app.querySelector(c.bodySelector) === null, '外側クリックで本体が閉じて DOM から消える');

      expect(app.querySelector(c.bodySelector)).toBeNull();
      expect(clicked).toBe(1);
    });
  }
});
