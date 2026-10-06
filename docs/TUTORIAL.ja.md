# ricdom とは — 「UI をオブジェクトで書き、state に代入すると画面が追従する」JavaScript の UI ライブラリ

ricdom は、**データバインディング**を特徴とする JavaScript 製の UI ライブラリです。Web ブラウザ (Chrome など) や Electron の上で動く
Web ページ・Web アプリの「快適で価値ある UI を構築する」ために作られています。

「快適で価値ある UI」とは、できあがった UI を使う人 (利用者) の快適さはもちろん、UI をデザインし、実装し、メンテナンスする人
(デザイナーとプログラマ) の快適さも同時に満たす UI のことを指しています。

> この文書は、ricdom の前身 **JAVIS.js** の紹介記事 (2020 年) を、ricdom に置き換えて書き直したものです。
> JAVIS → RicDOM v1 → ricdom (v2) と 3 代かけて同じ思想を磨いてきたので、記事の骨格はそのまま、
> コードと「できるようになったこと」を現在の形に差し替えています。英語版は [TUTORIAL.md](TUTORIAL.md) です。

## 0. 背景

Web ブラウザで動く快適な UI を実装するには、HTML のタグを駆使し、CSS でデザインを整え、JavaScript でイベントを書き、
画面サイズ (レスポンシブ) などいろいろな状況を想定してコードを書いていく必要があります。
「がんばって多くのコードを書かないと、快適で価値ある UI は作れない」というのが、今も変わらない現状だと感じています。

多くの人がこの状況を打破したいと考えていて、React や Vue.js、Svelte、Solid のように、いくつもの UI ライブラリ
(フレームワーク) がリリースされています。おかげで UI の実装はずいぶん楽になりました。それでも「まだまだ快適ではない」
と感じた人がいまして (わたしですが)、そこから生まれたのが JAVIS.js であり、その 3 代目が ricdom です。

ricdom は高機能が売りではありません。むしろ逆で、**シンプルで軽量**であることが売りです。コアは gzip で約 5KB、
利用者側にビルド工程を要求しません。`<script>` 1 本で動きます。

- **ricdom**: 「りっくどむ」と読みます。**Ri**ch **C**ontrol **DOM**、つまり「操作しやすい DOM」の意味です。
  JAVIS が「JavaScript のデータと UI (Visualization) をバインドする」気持ちから名付けられたのに対し、
  ricdom は「結果として手に入る、よく制御された DOM」の側から名付けました
- **Web ブラウザ**: ここでは主に PC 向けの Chrome (Chromium) を指します。ricdom を使う社内アプリの多くが Electron
  (中身は Chromium) なので、動作確認の主軸がそこにあるためです。Firefox / Safari でも動きます
- **UI ライブラリ**: React / Vue.js / Svelte / Solid / Lit のような「UI とデータを関連付ける」ライブラリの総称として使います。
  [UI data binding](https://en.wikipedia.org/wiki/UI_data_binding) にまとめられているものだと考えてください

## 1. ricdom の特徴

ricdom は**データバインディング** (UI とデータを関連付けること) によって、MVC だの MVVM だのと悩まず、
直感的に書ける実装を目指しています。

### 特徴 1: API が 1 つ

JAVIS.js の API は `render()` と `bind()` の 2 つでした。ricdom はそれを **`createApp()` 1 つ**にまとめました。
「どこに」「どのデータを」「どう描くか」の 3 つを渡すと、以後はデータに代入するだけで画面が追従します。

シンプルさは、放っておくとカオスに向かう自然に対する、1 つの明確な価値だと確信しています。

### 特徴 2: UI を plain object で書く

2 つ目の特徴は、HTML を **JavaScript の素のオブジェクト**で書くことです。

HTML をプログラム (JavaScript) から扱うとき、「HTML をどう記述するか」でとても苦労します。文字列をひたすら連結するのも
1 つの答えですが、その場合 HTML をまるごと差し替えることになり、一部分だけを更新するのに苦労します。React のように
言語を拡張する (JSX) のも 1 つの解決策ですが、コンパイラが要ります。

JAVIS.js は **JSAN** (JavaScript Array Notation、配列で HTML を書く記法) を発明しました。ricdom では、配列ではなく
**オブジェクト** `{ tag, children }` で書きます。配列より少しだけ長いですが、属性と子要素の置き場所が明確で、
TypeScript の型がそのまま付くからです。

```html
<button>Hello ricdom</button>
```

```js
{ tag: 'button', children: ['Hello ricdom'] }
```

- `tag` がタグ名です
- `children` が中身です。文字列ならそのまま表示され、オブジェクトなら子要素になります。配列で並べます

### 階層構造

HTML は階層構造を書けます。同じようにオブジェクトでも書けます。`children` の中にまたオブジェクトを並べるだけです。

```html
<div>
  <button>OK</button>
  <button>NG</button>
</div>
```

```js
{ tag: 'div', children: [
  { tag: 'button', children: ['OK'] },
  { tag: 'button', children: ['NG'] },
] }
```

### 属性 (アトリビュート)

HTML タグの属性は、同じオブジェクトの **キー**として書きます。特にイベント系の属性 (`onclick` など) は関数 (アロー関数) で書きます。

```html
<button onclick="alert('HELLO!!!')">Hello ricdom</button>
```

```js
{ tag: 'button', onclick: () => alert('HELLO!!!'), children: ['Hello ricdom'] }
```

総じて、HTML で書けることは、ほぼそのままオブジェクトで書けます。

### オブジェクトで書くメリット

では、HTML をほぼそのままオブジェクトで書けて、何が嬉しいのでしょうか。「書き方を変えただけでは?」と思われるかもしれません。

いえいえ。これは **JavaScript** です。変数、関数、三項演算子、`map()`、if 文、for 文、JavaScript で使える機能が
そのまま使えます。いままで固定的な表示しかできなかった HTML に、変数と関数と制御文が加わります。
**リアルタイムで動的な表現が可能になる**ことが、大きな価値です。

それでは、実際のコードを見てみましょう。

## 2. シンプルな例

### (1) 読み込み

まず、ricdom を読み込みます。`<script>` 1 本です。ビルドは要りません。

```html
<script src="https://cdn.jsdelivr.net/npm/ricdom@2/dist/ricdom.iife.min.js"></script>
```

(npm 公開前は、リポジトリの tag から `npm ci && npm run build` して `dist/ricdom.iife.min.js` を自分のサイトに置いてください。)

### (2) 表示位置

次に、表示位置を決めます。「ここに表示します」という目印のタグを用意します。`div` がおすすめです。

```html
<div id="app"></div>
```

### (3) 表示 — `createApp()`

`ricdom.createApp()` で表示します。引数は 3 つ、**どこに** (セレクタ文字列か要素)、**どのデータを** (state)、
**どう描くか** (render 関数) です。

```js
ricdom.createApp('#app', {}, () => ({ tag: 'button', children: ['Hello ricdom'] }));
```

この例では、セレクタに `'#app'`、state に空のオブジェクト、render 関数に「button を返す関数」を渡しています。
「`#app` の中に button を表示する」という意味になります。

- セレクタ文字列には `document.querySelector()` に渡せる文字列を指定します。要素そのものを渡しても構いません
- state は後で説明します。今は空で結構です
- render 関数は「オブジェクトを返す関数」です。`createApp()` はこの関数を呼んで、返ってきたオブジェクトを DOM にします

### (4) 実行例

まとめると次のコードになります。実行すると button が表示されます (押しても何も起きませんが)。

```html live
<div id="app"></div>
<script>
ricdom.createApp('#app', {}, () => ({ tag: 'button', children: ['Hello ricdom'] }));
</script>
```

このシンプルさで HTML のボタンが表示できるのは、結構すごいと思うのですが、誰も褒めてくれないので自分で褒めておきます。

## 3. 属性 (アトリビュート) の指定

HTML タグの属性は、オブジェクトのキーとして指定します。たとえば button に `style` と `onclick` を指定するなら、こうなります。

```html
<button style="height: 70px; background: #e77;" onclick="alert('HELLO!!')">Hello ricdom</button>
```

```js
{ tag: 'button',
  style: { height: '70px', background: '#e77' },
  onclick: () => alert('HELLO!!'),
  children: ['Hello ricdom'] }
```

HTML の内容がほぼそのまま表現できていることが分かると思います。

- `style` は**オブジェクトで**書きます。JAVIS では文字列でも書けましたが、ricdom はオブジェクトだけにしました
  (理由は 7 章で)。キーは `background` のようにそのまま書くか、`backgroundColor` のように camelCase で書きます
- `onclick` にはクリックされたときに呼ばれる関数を指定します

```html live
<div id="app"></div>
<script>
ricdom.createApp('#app', {}, () => ({
  tag: 'button',
  style: { height: '70px', background: '#e77' },
  onclick: () => alert('HELLO!!'),
  children: ['Hello ricdom'],
}));
</script>
```

少し大きめの赤い button が表示されましたか。クリックすると alert に「HELLO!!」が出るはずです。

## 4. データバインディング (UI とデータを関連付ける)

いよいよ ricdom の核心、データバインディングです。

準備運動として、state に `hu`, `ji`, `ko` の 3 つの値を持たせ、render 関数で div を 3 つ返してみます。
render 関数の引数 `s` に、その state が渡ってきます。

```html live
<div id="app"></div>
<script>
ricdom.createApp('#app', { hu: 111, ji: 222, ko: 333 }, (s) => ({
  tag: 'div', children: [
    { tag: 'div', children: [s.hu] },
    { tag: 'div', children: [s.ji] },
    { tag: 'div', children: [s.ko] },
  ],
}));
</script>
```

`{ tag: 'div', children: [s.hu] }` と書くと `s.hu` が展開され、`{ tag: 'div', children: [111] }` と書いたのと同じになります。
div に 111, 222, 333 が表示されることを確認してください。

期待どおりに表示されましたね。表示はされましたが、これがゴールでしょうか。いえいえ、ここが入り口です。

### データを更新してみる

`createApp()` の戻り値 `app` を受け取り、`setInterval()` でそれぞれ違う間隔で値を増やしてみます。

```html live
<div id="app"></div>
<script>
const app = ricdom.createApp('#app', { hu: 111, ji: 222, ko: 333 }, (s) => ({
  tag: 'div', children: [
    { tag: 'div', children: [s.hu] },
    { tag: 'div', children: [s.ji] },
    { tag: 'div', children: [s.ko] },
  ],
}));

setInterval(() => app.hu++,  500);  // 0.5 秒間隔
setInterval(() => app.ji++, 1500);  // 1.5 秒間隔
setInterval(() => app.ko++, 3000);  // 3.0 秒間隔
</script>
```

さてどうなるでしょう。少し考えてみてください。

……数字が動いていますね。**これが ricdom の核心です。**

JAVIS.js では、ここで一度「数字が動かない」例を見せてから `bind()` を呼ぶ必要がありました。ricdom は `createApp()` が
最初から state を監視 (バインド) しているので、`app.hu++` と**代入した瞬間に再描画が予約**されます。
`render()` と `bind()` が 1 つになった、というのはこういうことです。

ポイントは、HTML の表示とは無関係に (まったく意識せずに) データが更新され、しかも HTML の表示が**リアルタイムに追従**
しているところです。データと表示を完全に分離して書けるのが、データバインディングの特徴です。

### 1 つだけ、罠

`createApp()` に渡した**元のオブジェクト**を直接いじっても、画面は動きません。

```js
const state = { hu: 111 };
const app = ricdom.createApp('#app', state, (s) => ({ tag: 'div', children: [s.hu] }));

state.hu = 999;  // ✗ 何も起きない (監視されているのは app の方)
app.hu = 999;    // ✓ 再描画される
```

`createApp()` はオブジェクトを**包んで**返すのであって、元のオブジェクトを書き換えません。監視されているのは戻り値の `app`
(と render 関数の引数 `s`、この 2 つは同じもの) だけです。`app` か `s` を通して読み書きする習慣がつけば、二度と踏みません。

これは ricdom でいちばん多い「動かない」の原因なので、最初に書いておきます。

## 5. 標準的な書き方

この勢いで、コードを少しリファクタリングしましょう。

render 関数の引数 `s` は `app` と同じものなので、イベントハンドラの中では**外の変数 `app` を参照しなくても** `s` に代入すれば
画面が動きます。オブジェクト指向のように閉じた書き方ができます。

```html live
<div id="app"></div>
<script>
ricdom.createApp('#app', { hu: 111, ji: 222, ko: 333 }, (s) => ({
  tag: 'div', children: [
    { tag: 'div', children: [s.hu] },
    { tag: 'div', children: [s.ji] },
    { tag: 'div', children: [s.ko] },
    { tag: 'button', onclick: () => { s.hu++; }, children: ['hu++'] },
  ],
}));
</script>
```

戻り値を受け取る必要があるのは、`setInterval()` のように render 関数の外から state を触るときだけです。

### render 関数は「オブジェクトを返す」だけがルール

`createApp()` の render 関数は「オブジェクト (か、その配列) を返す」のがルールで、それさえ守れば中身は自由です。
たとえば、state のキーを `map()` してオブジェクトを作って返す、なんてこともできます。

```html live
<div id="app"></div>
<script>
const app = ricdom.createApp('#app', { hu: 111, ji: 222, ko: 333 }, (s) => ({
  tag: 'div',
  children: Object.keys(s).map((k) => ({ tag: 'div', children: [`${k}: ${s[k]}`] })),
}));

setInterval(() => app.hu++,  500);
setInterval(() => app.ji++, 1500);
setInterval(() => app.ko++, 3000);
</script>
```

## 6. 複数タグの連携

今度は、div, input, button の 3 つのタグを連携させます。それぞれ別のタグが、1 つの `s.hu` を参照して更新します。

1. div は `s.hu` の内容を表示します
2. input は `oninput` イベントで、変化した値 `ev.target.value` を (`Math.trunc()` で数値にして) `s.hu` に入れます
3. button は `onclick` イベントで `s.hu` を 1 増やします

イベントの関数に渡ってくる引数 `ev` は、ブラウザのイベントオブジェクトそのものです。

```html live
<div id="app"></div>
<script>
ricdom.createApp('#app', { hu: 111 }, (s) => ({
  tag: 'div', children: [
    { tag: 'div', children: [`hu: ${s.hu}`] },
    { tag: 'input', type: 'number', value: s.hu, oninput: (ev) => { s.hu = Math.trunc(ev.target.value); } },
    { tag: 'button', onclick: () => { s.hu++; }, children: ['hu++'] },
  ],
}));
</script>
```

複数のタグから 1 つのデータを非同期に更新・参照しても、問題なく表示が追従していることを確認できると思います。

### 見た目だけ変えてみる

input を `range` に変えてみます。最大値を 50、最小値を 0 にします。属性を変えているだけで、HTML の機能をそのまま使っています。

```html live
<div id="app"></div>
<script>
ricdom.createApp('#app', { hu: 11 }, (s) => ({
  tag: 'div', children: [
    { tag: 'div', children: [`hu: ${s.hu}`] },
    { tag: 'input', type: 'range', min: 0, max: 50,   // ← ここ
      value: s.hu, oninput: (ev) => { s.hu = Math.trunc(ev.target.value); } },
    { tag: 'button', onclick: () => { s.hu++; }, children: ['hu++'] },
  ],
}));
</script>
```

ここにデータバインディングのメリットが垣間見えます。**`s.hu` がどう更新されるかをまったく気にせず、見た目 (UI) を変更できる**。
UI とデータを切り離して、それぞれ好きなように更新できます。

(あとで気がつきましたが、button の方は上限を見ていないので 50 を超えて増えますね。JAVIS の記事のときと同じ穴です。)

## 7. 応用: RGB で色を選択

これまでの知識で、少し大きめのものを作ってみましょう。RGB の色を表示して更新します。

ポイントは div の背景色を state から組み立てているところです。

```js
style: { background: `rgb(${s.r}, ${s.g}, ${s.b})` }
```

```html live
<div id="app"></div>
<script>
ricdom.createApp('#app', { r: 200, g: 200, b: 200 }, (s) => ({
  tag: 'div',
  style: { padding: '10px', background: `rgb(${s.r}, ${s.g}, ${s.b})` },
  children: [
    `rgb(${s.r}, ${s.g}, ${s.b})`,
    { tag: 'div', children: ['R: ', { tag: 'input', type: 'range', min: 0, max: 255, value: s.r, oninput: (ev) => { s.r = Math.trunc(ev.target.value); } }, s.r] },
    { tag: 'div', children: ['G: ', { tag: 'input', type: 'range', min: 0, max: 255, value: s.g, oninput: (ev) => { s.g = Math.trunc(ev.target.value); } }, s.g] },
    { tag: 'div', children: ['B: ', { tag: 'input', type: 'range', min: 0, max: 255, value: s.b, oninput: (ev) => { s.b = Math.trunc(ev.target.value); } }, s.b] },
  ],
}));
</script>
```

### `style` がオブジェクトだけになった理由

JAVIS では `style` を文字列でもオブジェクトでも書けました。ricdom はオブジェクトだけです。理由は「一部だけ更新する」ためです。

ricdom は前回描いたオブジェクトと今回のオブジェクトを比べて、**変わったところだけ** DOM を更新します。`style` がオブジェクトなら
「`background` だけ変わった」と分かるので、`padding` には触りません。文字列だと全体を比べ直すしかなく、
どのプロパティが変わったか分からないので、まるごと書き直すことになります。

```js
// 前回
style: { padding: '10px', background: 'rgb(200, 200, 200)' }
// 今回 → background だけが DOM に書き込まれる。padding は触らない
style: { padding: '10px', background: 'rgb(201, 200, 200)' }
```

部品 (後述) のスタイルを一部だけ上書きするときも、同じ理由でオブジェクトの方が都合がよいのです。

## 8. 応用: HSLA で色を選択

今度は HSLA です。この文書のラスボスです。

いままでの応用なので深く解説することはありませんが、ここで初めて出てくる小技が 2 つあります。

1 つ目は、`control()` という**オブジェクトを返す関数**を作って、冗長で単調になりがちなタグの記述を共通化しています。
軽い「部品化」と言ってもよいでしょう。いわゆるコンポーネント化となると、クラスだ、隠蔽だ、継承だ、とゴージャスに考えがちですが、
ここでは「オブジェクトを組み立てて返す関数」にまとめるだけです。ricdom の UI 部品 (`ricdom/ui`) も、根っこはこれと同じ作りです。

(ついでに `onwheel` も追加して、マウスホイールでも操作できるようにしました。`ev.preventDefault()` で親へのスクロールを止めています。
ricdom に限らず HTML 全般で使える技です。)

もう 1 つは、

```js
color: s.l < 45 ? '#eee' : '#111',
```

として、背景が暗いときは文字を白、明るいときは黒にして、読めなくなるのを避けているところです。

```html live
<div id="app"></div>
<script>
ricdom.createApp('#app', { h: 200, s: 75, l: 75, a: 100 }, (s) => {
  const control = (label, k, max, min = 0) => ({
    tag: 'div',
    onwheel: (ev) => {
      s[k] = Math.min(max, Math.max(min, s[k] + (ev.deltaY <= 0 ? 5 : -5)));
      ev.preventDefault();
    },
    children: [
      label,
      { tag: 'input', type: 'number', min, max, value: s[k], style: { textAlign: 'right' },
        oninput: (ev) => { s[k] = Math.trunc(ev.target.value); } },
      { tag: 'input', type: 'range', min, max, value: s[k],
        oninput: (ev) => { s[k] = Math.trunc(ev.target.value); } },
    ],
  });
  const hsla = `hsla(${s.h}, ${s.s}%, ${s.l}%, ${s.a}%)`;

  return {
    tag: 'div',
    style: { padding: '10px', background: hsla, color: s.l < 45 ? '#eee' : '#111' },
    children: [
      hsla,
      control('H: ', 'h', 360),
      control('S: ', 's', 100),
      control('L: ', 'l', 100),
      control('A: ', 'a', 100),
    ],
  };
});
</script>
```

せっかくなので、マウスホイールでグリグリやって色を変えてみてください。

この行数でここまでの UI を書ける UI ライブラリは、なかなかない (レアな存在だ) と自負しております。

## 9. API

ここで ricdom コアの API を解説します。「1 つ」と言いましたが、正確には **`createApp()` と、その戻り値が持つ 4 つのメソッド**です。

### `createApp(target, state, render, options?)`

| 引数 | 型 | 説明 |
|---|---|---|
| `target` | 文字列 or 要素 | 描画先。文字列なら `document.querySelector()` に渡される。見つからなければ `DOMContentLoaded` を 1 回待ち、それでも無ければ `console.error` して何もしない app を返す (例外は投げない) |
| `state` | オブジェクト | 監視するデータ。**浅く**監視する (トップレベルと 1 段目まで。2 段目以降は 10 章) |
| `render` | 関数 `(s) => node` | 描画関数。`s` に state (の監視版) が渡る。オブジェクト / 配列 / 文字列 / 数値 / `null` を返す |
| `options.setup` | 関数 `(app) => void` | 初回描画の直前に呼ばれる (部品の登録に使う。[TUTORIAL.md](TUTORIAL.md) §5) |

**戻り値**: `state` を監視する Proxy (`app`)。`app.hu = 1` のように代入すると再描画が予約されます。`createApp()` は
**同期で初回描画**するので、戻った時点で DOM はできています。

戻り値 `app` のメソッド:

| メソッド | 説明 |
|---|---|
| `app.renderNow()` | 予約を待たず、今すぐ同期で描画する |
| `app.nextRender()` | 予約されている描画が終わったら解決する Promise。予約が無いと解決しない (「反映済みを保証したいだけ」なら `renderNow()`) |
| `app.use(part)` | 状態を持つ部品 (dialog / popup / splitter など) を登録する ([TUTORIAL.md](TUTORIAL.md) §5) |
| `app.unmount()` | 監視を止め、部品を破棄する。JAVIS の「`bind()` が外せない」はこれで解消 |
| `app.ignore` | この下に置いたデータは監視しない (キャッシュなど、画面に関係ないものの置き場) |

### 描画のタイミング

JAVIS.js は `_Hz` (既定 144) で state を**ポーリング**していました。ricdom は Proxy なので代入の瞬間に分かり、
`requestAnimationFrame` で次のフレームにまとめて描画します (同じフレーム内で 100 回代入しても描画は 1 回)。
ウィンドウが隠れていて rAF が止まる環境 (Electron の最小化など) のために、200ms の setTimeout も併設しています。

## 10. ここまでで触れなかったこと

この文書は JAVIS の記事と同じ範囲 (コア) だけを扱いました。ricdom にはこの先があります。

- **浅い監視と、深い代入の作法**: `s.user.name = 'x'` までは監視されますが、`s.user.address.city = 'y'` は監視されません。
  変えた階層をコピーして差し替えます (`s.user = { ...s.user, address: { ...s.user.address, city: 'y' } }`)。
  開発ビルドでは、再描画につながらなかった深い代入を `console.warn` で教えてくれます
- **`key`**: リストの並べ替えで DOM を使い回すためのキー。兄弟内で一意にします
- **島 (island)**: `{ tag: 'div', island: true }` と書くと、その中は ricdom が触りません。`<canvas>` や外部ライブラリの置き場です
- **UI 部品 `ricdom/ui`**: ボタン・入力・dialog・popup・toast・tooltip・dropdown・splitter・tabs・accordion・tweak パネル・
  Markdown 表示など 29 部品。JAVIS の振り返りで「ありがたい」と書いたアコーディオン・タブ・プルダウン・スプリッターは全部あります。
  CSS は 1 枚、テーマは 7 種 (曇りガラスの glass を含む)
- **アクセシビリティ**: dialog の focus trap、menu の矢印キー、tabs の roving tabindex などは部品が面倒を見ます

続きは英語版 [TUTORIAL.md](TUTORIAL.md) の §3 以降と、[examples/](../examples/index.html) のサンプルへ。

---

## 振り返り: JAVIS のデメリットは ricdom でどうなったか

JAVIS の記事の末尾に、2024 年の振り返りメモがありました。ricdom (v2) でどうなったかを並べておきます。

| JAVIS のデメリット (2024) | ricdom (2026) |
|---|---|
| 知られていない | 変わらず。これはライブラリの出来ではなく発信の問題なので、この文書とサンプルを公開するところから |
| JSAN 記法が独自で普及しにくい | 配列ではなく plain object に。JSON と同じ形なので説明が要らない。TypeScript の型も付く |
| UI 部品が少ない、自作するしかない | `ricdom/ui` に 29 部品。社内 14 アプリで使われて穴を塞いだもの |
| resize イベントが 1 テンポ遅れる | splitter / scrollPane は rAF で実測して追従。ポーリング (`_Hz`) そのものが無くなった |
| `bind()` が外せない | `app.unmount()` |
| ローカル CSS がほしい | CSS は 1 枚配布 + `--ric-*` の CSS 変数。テーマは要素ごとに `applyTheme()` で当てられる (同一ページに別テーマが共存できる) |

メリットの方 (軽い、使いやすい、直接 DOM を更新するので速い) は、そのまま引き継いでいます。コアは gzip 約 5KB です。
