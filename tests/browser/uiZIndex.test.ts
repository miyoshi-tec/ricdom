// 実ブラウザ回帰テスト: dialog/popup の z-index が createSplitter の divider を貫通しない
// ことの確認 (LCP #1、2.0.0-alpha.9)。
//
// CSS クラス化 (Phase 1) の際に v1 (ric_ui/popup/create_ui_dialog.js の zIndex: 500/501、
// _popup_utils.js の zIndex: 401) が inline style で持っていた z-index が CSS クラスへ
// 引き継がれずに落ちていた。結果 `.ric-splitter__divider { z-index: 1 }` が
// 修正前は「唯一 z-index を持つ要素」としてダイアログ/ポップアップより前面に描かれる
// 実機バグになっていた (LCP 報告 #1)。
//
// jsdom は elementFromPoint を実装していない (常に null を返す) ため、実ブラウザでのみ
// 検証できる。
//
// ⚠️ dialog テストの構成についての注記 (この観測手法特有の落とし穴):
// 素朴に「splitter の main にダイアログのトリガーを置き、開いた状態で divider との
// 交点を elementFromPoint する」という構成にすると、createDialog の setInert(true) が
// portal の兄弟要素 (= splitter 全体) を `inert` にする副作用により、divider が
// hit-test の対象から外れてしまい (`inert` は accessibility だけでなく
// `elementFromPoint` 等のヒットテストからも要素を除外する)、**修正前の CSS でも
// テストが green になってしまう** (実際に手を動かして確認した — z-index 未指定の
// cssTemplates.ts に戻した状態で一度 green になり、原因を切り分けた)。これは
// 「見た目の重なり順」ではなく「ポインタが inert な divider を素通りする」ことに
// よる偽陽性で、z-index の修正を検証したことにならない。
// 対策: `createApp` の `portalTo` を使い、ダイアログの portal を splitter の
// `.ric-splitter__main` 内の**専用の入れ子 div** に向ける。setInert が inert にするのは
// 「portal の兄弟要素」だけなので、この構成では main 内の他の子 (今回は無し) だけが
// 対象になり、main の外側にある divider は一切 inert 化されない — hit-test が
// 素通りしない、CSS の見た目どおりの検証になる。ダイアログは uncontrolled の
// `dlg.open()` で開く (トリガー要素を経由しないので、上記の入れ子構成と両立する)。
//
// ⚠️ 追記 (LCP alpha.9 追検証、指摘 A): 上記の portalTo 回避は「splitter が portal の
// 兄弟にならない」構成に作り替えることで inert の巻き添えを避けているが、LCP の実構造は
// portalTo を使わず、splitter とダイアログを同じ `createApp` から素で描画するもの
// だった (= splitter は target 直下 = ダイアログの自前 portal と兄弟)。つまり LCP が
// 実機で踏んだのは、まさに上で「回避した」側の構造 (splitter が inert 化対象) そのもの
// であり、そちらは上記の 2 テストでは一切カバーされていなかった。LCP はこの構造を
// capturePage() で実際に画面をピクセル比較して検証した (ダイアログの上に divider の
// ピクセルが乗っていることを目視・差分の両方で確認)。
// 下の 3 つ目のテストがこの構造を補う変種: splitter を portal の兄弟のまま (portalTo を
// 使わない) にして dialog を main 内のトリガーから開き、setInert(true) で splitter が
// inert 化されるところまでは実機と同じにする。そのうえで **テスト側が inert を外して
// から** elementFromPoint を呼ぶ — `inert` 仕様はヒットテスト (ポインタイベント/
// elementFromPoint) からの除外だけを行い、要素の描画順 (stacking / z-index の適用結果)
// には一切影響しない (https://html.spec.whatwg.org/multipage/interaction.html#inert) ため、
// 外してから測っても「CSS がどう重ねて描いているか」はそのまま観測できる。
// 実際に確認した内容 (修正前 CSS = `git show 9dd7898:src/ui/cssTemplates.ts` を一時的に
// `src/ui/cssTemplates.ts` に上書きして走らせた):
//   - この 3 つ目のテスト (inert を外してから hit-test): 赤。elementFromPoint(cx, cy) が
//     divider 自身を返し、`divider.contains(hit)).toBe(false)` が失敗した
//     (= 修正前は実際に divider がダイアログより前面に描かれていることを、この変種は
//     正しく検知できる)。
//   - 同じ構成から「inert を外す」行だけを削った素朴版 (splitterEl.inert = false を
//     呼ばない版): 修正前 CSS でも緑になった — inert によって divider が hit-test
//     対象から丸ごと除外され、elementFromPoint が (実際の重なり順に関わらず) ダイアログ
//     側を返してしまうため。これは 1 つ目のテストの注記で述べた偽陽性と同じ罠が
//     「splitter が portal の兄弟」構成でもそのまま起きることの確認であり、
//     素朴な構成のままではこの LCP の実構造を検証したことにならない。
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { createDialog } from '../../src/ui/dialog.js';
import { createPopup } from '../../src/ui/popup.js';
import { createSplitter } from '../../src/ui/splitter.js';
import { injectStyles } from '../../src/ui/injectStyles.js';
import { flush, setupApp } from '../_helpers/dom.js';

injectStyles(document);

// 2 つの rect の交差領域を返す (無ければ null)。テストの前提 (実際に重なっているか) を
// elementFromPoint を呼ぶ前に明示的に検証するために使う。
const intersect = (a: DOMRect, b: DOMRect): DOMRect | null => {
  const left = Math.max(a.left, b.left);
  const top = Math.max(a.top, b.top);
  const right = Math.min(a.right, b.right);
  const bottom = Math.min(a.bottom, b.bottom);
  if (right <= left || bottom <= top) return null;
  return new DOMRect(left, top, right - left, bottom - top);
};

describe('実ブラウザ: dialog/popup の z-index が createSplitter の divider を貫通しない (LCP #1)', () => {
  it('dialog を開くと、divider と重なる座標の elementFromPoint がダイアログ側になる', async () => {
    const app = setupApp();
    // 位置 fixed + inset:0 で app 自身を viewport 全域にする。
    app.style.position = 'fixed';
    app.style.inset = '0';

    // まず splitter だけを普通に描画する。main の中に「dialog の portal 先」専用の
    // 入れ子 div (#portal-host) を置く — ファイルヘッダの注記のとおり、これを
    // portalTo に使うことで setInert の巻き添えから divider を守る。
    let split: ReturnType<typeof createSplitter>;
    const splitterHandle = createApp('#app', {}, () =>
      split
        ? split({
            side: [{ tag: 'div', children: ['side'] }],
            main: [{ tag: 'div', id: 'portal-host' }],
          })
        : null,
    );
    // side 幅を viewport 幅の半分にする → divider は viewport 水平中央のすぐ近くに来る。
    // divider は .ric-splitter__main と同じ高さ (100%) を占めるため、垂直方向は
    // viewport 全域をカバーする (計算不要)。
    split = splitterHandle.use(createSplitter({ size: Math.round(window.innerWidth / 2) }));
    await flush();

    const portalHost = document.getElementById('portal-host')!;
    expect(portalHost).not.toBeNull();

    // dialog は別の createApp インスタンスとして portalTo: portalHost で登録する
    // (target 自体は使わない使い捨て要素 — トリガーを経由せず dlg.open() で開くため
    // 通常描画は不要)。これで dialog の portal は splitter の外の何かではなく
    // splitter の main の中に生える (見た目の座標としては同じ main 領域内)。
    const unusedTarget = document.createElement('div');
    let dlg: ReturnType<typeof createDialog>;
    const dialogHandle = createApp(unusedTarget, {}, () => (dlg ? dlg({ title: 't', children: ['本文'] }) : null), { portalTo: portalHost });
    dlg = dialogHandle.use(createDialog());
    await flush();

    dlg!.open();
    await flush(300); // entrance animationend を待つ (他 dialog テストと同じ待ち方)

    const divider = app.querySelector('.ric-splitter__divider') as HTMLElement;
    const dialogEl = document.querySelector('[role="dialog"]') as HTMLElement;
    expect(divider).not.toBeNull();
    expect(dialogEl).not.toBeNull();
    // 今回の構成では divider (splitter 全体) は inert 化されない対象であることの確認
    // (万一 inert が付いていたら、このテストは前のバグと同じ偽陽性を再現してしまう)。
    expect((app.querySelector('.ric-splitter') as HTMLElement).inert).toBe(false);

    // dialog は viewport 中央に固定表示されるので、viewport 中央の点は必ずダイアログの
    // 内側にある。divider も (side 幅を半分にしたことで) viewport 中央近くに来ているはず
    // ── その前提をまず明示的に確認する (前提が崩れていたらテスト自体が無意味なので)。
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    const dialogRect = dialogEl.getBoundingClientRect();
    const dividerRect = divider.getBoundingClientRect();
    expect(cx).toBeGreaterThanOrEqual(dialogRect.left);
    expect(cx).toBeLessThanOrEqual(dialogRect.right);
    expect(cy).toBeGreaterThanOrEqual(dialogRect.top);
    expect(cy).toBeLessThanOrEqual(dialogRect.bottom);
    expect(cx).toBeGreaterThanOrEqual(dividerRect.left);
    expect(cx).toBeLessThanOrEqual(dividerRect.right);

    // 修正前 (z-index 未指定): divider の z-index:1 だけが有効で、ダイアログ本体
    // (z-index 無し = auto) より前面に描かれ、ここで divider が返っていた
    // (ファイルヘッダの注記のとおり、素朴な構成だとこの巻き戻しでも green になって
    // しまう罠があったため、上記の portalTo 構成を採用している)。
    const hit = document.elementFromPoint(cx, cy);
    expect(divider.contains(hit)).toBe(false);
    expect(dialogEl === hit || dialogEl.contains(hit)).toBe(true);
  });

  it('LCP の実構造 (splitter が portal の兄弟) の変種: dialog の inert を外せば実際の描画順が観測できる', async () => {
    const app = setupApp();
    app.style.position = 'fixed';
    app.style.inset = '0';

    // portalTo を指定しない (省略) → dialog の portal は target (#app) 直下の末尾に
    // 自前生成される (app.ts の ownPortal 経路)。splitter も同じ target の直下に描画する
    // ので、splitter (root) と portal センチネルは兄弟になる — これが LCP の実構造:
    // setInert(true) が「portal の兄弟要素」全部を inert にする対象に、splitter 全体が
    // 入ってしまう構成そのもの。ダイアログのトリガーは main の中に置く (実操作の導線と
    // 同じ — main 内のボタンをクリックして開く)。
    let split: ReturnType<typeof createSplitter>;
    let dlg: ReturnType<typeof createDialog>;
    const handle = createApp('#app', {}, () => {
      if (!split || !dlg) return null;
      return split({
        side: [{ tag: 'div', children: ['side'] }],
        main: [dlg({ triggerChildren: ['開く'], title: 't', children: ['本文'] })],
      });
    });
    split = handle.use(createSplitter({ size: Math.round(window.innerWidth / 2) }));
    dlg = handle.use(createDialog());
    await flush();

    const trigger = app.querySelector('button.ric-button') as HTMLButtonElement;
    expect(trigger).not.toBeNull();
    trigger.click();
    await flush(300); // entrance animationend を待つ (他 dialog テストと同じ待ち方)

    const splitterEl = app.querySelector('.ric-splitter') as HTMLElement;
    const divider = app.querySelector('.ric-splitter__divider') as HTMLElement;
    const dialogEl = document.querySelector('[role="dialog"]') as HTMLElement;
    expect(splitterEl).not.toBeNull();
    expect(divider).not.toBeNull();
    expect(dialogEl).not.toBeNull();

    // 1 つ目のテストとの違いはここ: この構成では splitter (= portal の兄弟) が
    // setInert(true) の対象そのものになっている前提を確認する (LCP の実構造の再現)。
    expect(splitterEl.inert).toBe(true);

    // `inert` はヒットテスト (pointer-events / elementFromPoint 等) からの除外だけを
    // 行う仕様で、要素の描画順 (stacking / z-index の適用結果) には影響しない
    // (https://html.spec.whatwg.org/multipage/interaction.html#inert)。テスト側で外して
    // から elementFromPoint を呼べば、「inert によってポインタが素通りする」副作用を
    // 取り除いたうえで、実際に画面がどう重なって描かれているか (CSS の効果) だけを
    // 観測できる (ファイルヘッダの注記も参照)。
    splitterEl.inert = false;

    // dialog は viewport 中央に固定表示されるので、viewport 中央の点は必ずダイアログの
    // 内側にある。divider も (side 幅を半分にしたことで) viewport 中央近くに来ているはず
    // ── その前提をまず明示的に確認する (1 つ目のテストと同じ理由)。
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    const dialogRect = dialogEl.getBoundingClientRect();
    const dividerRect = divider.getBoundingClientRect();
    expect(cx).toBeGreaterThanOrEqual(dialogRect.left);
    expect(cx).toBeLessThanOrEqual(dialogRect.right);
    expect(cy).toBeGreaterThanOrEqual(dialogRect.top);
    expect(cy).toBeLessThanOrEqual(dialogRect.bottom);
    expect(cx).toBeGreaterThanOrEqual(dividerRect.left);
    expect(cx).toBeLessThanOrEqual(dividerRect.right);

    // 修正前 (z-index 未指定): divider の z-index:1 だけが有効で、ダイアログ本体
    // (z-index 無し = auto) より前面に描かれ、ここで divider が返っていた (ファイル
    // ヘッダの注記のとおり実測済み — inert を外さない素朴版は修正前 CSS でも green に
    // なってしまう偽陽性であることも合わせて確認済み)。
    const hit = document.elementFromPoint(cx, cy);
    expect(divider.contains(hit)).toBe(false);
    expect(dialogEl === hit || dialogEl.contains(hit)).toBe(true);
  });

  it('popup を divider の実測 rect と重なる座標に開くと、その交差点の elementFromPoint がポップアップ側になる', async () => {
    // popup は dialog と違い背景を inert 化しない (createPopup に setInert 相当の処理が
    // 無い) ため、素朴な「splitter の main にトリガーを置く」構成のままで安全に検証できる。
    const app = setupApp();
    app.style.position = 'fixed';
    app.style.inset = '0';

    let split: ReturnType<typeof createSplitter>;
    let menu: ReturnType<typeof createPopup>;
    const handle = createApp('#app', {}, () => {
      if (!split || !menu) return null;
      return split({
        side: [{ tag: 'div', children: ['side'] }],
        main: [menu({ trigger: ['⋯'], children: [{ tag: 'div', children: ['項目'] }] })],
      });
    });
    split = handle.use(createSplitter({ size: Math.round(window.innerWidth / 2) }));
    menu = handle.use(createPopup());
    await flush();

    const divider = app.querySelector('.ric-splitter__divider') as HTMLElement;
    expect(divider).not.toBeNull();
    const dividerRect = divider.getBoundingClientRect();

    // divider の実測 rect の左端付近の座標に openAt する → 本体の left は divider の
    // 左端とほぼ一致し、5px 幅の divider と本体の左端側で確実に重なる帯ができる。
    menu.openAt({ x: dividerRect.left, y: dividerRect.top + 20 });
    await flush(100); // rAF 実測フェーズ + 再描画を待つ (他 popup テストと同じ)

    const body = app.querySelector('[role="menu"]') as HTMLElement;
    expect(body).not.toBeNull();
    const bodyRect = body.getBoundingClientRect();

    const overlap = intersect(dividerRect, bodyRect);
    expect(overlap).not.toBeNull(); // 前提: 実際に重なっている

    const px = overlap!.left + overlap!.width / 2;
    const py = overlap!.top + overlap!.height / 2;

    // 修正前 (z-index 未指定): divider の z-index:1 だけが有効で popup 本体
    // (z-index 無し = auto) より前面に描かれ、ここで divider が返っていた。
    const hit = document.elementFromPoint(px, py);
    expect(divider.contains(hit)).toBe(false);
    expect(body === hit || body.contains(hit)).toBe(true);
  });
});
