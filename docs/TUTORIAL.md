# What is ricdom? — A JavaScript UI library where "you write the UI as objects, and the screen follows when you assign to state"

ricdom is a JavaScript UI library built around **data binding**. It was made for "building
comfortable, valuable UIs" for web pages and web apps that run in a web browser (such as Chrome) or
on Electron.

By a "comfortable, valuable UI" I mean a UI that is comfortable for the people who use the finished
thing (the users), of course, and at the same time comfortable for the people who design, implement,
and maintain it (designers and programmers).

> This document is a rewrite of the 2020 article that introduced **JAVIS.js**, the predecessor of
> ricdom, with ricdom put in its place. The same idea has been polished over three generations,
> JAVIS → RicDOM v1 → ricdom (v2), so the skeleton of the article is kept as it was, and the code
> and the "things you can now do" are swapped for their current form. The Japanese version is
> [TUTORIAL.ja.md](TUTORIAL.ja.md).

## 0. Background

To implement a comfortable UI that runs in a web browser, you have to make full use of HTML tags,
tidy up the design with CSS, write events in JavaScript, and keep writing code with all kinds of
situations in mind, such as screen size (responsive layout). "You can't build a comfortable,
valuable UI unless you work hard and write a lot of code" — I feel that this is still how things
stand today.

Many people want to break out of this situation, and quite a few UI libraries (frameworks) have been
released, such as React, Vue.js, Svelte, and Solid. Thanks to them, implementing a UI has become
much easier. Even so, there was someone who felt it was "still far from comfortable" (that someone
is me), and what came out of that feeling is JAVIS.js, and its third generation is ricdom.

ricdom does not sell itself on being feature-rich. Quite the opposite: its selling point is being
**simple and lightweight**. The core is about 5KB gzipped, and it asks for no build step on your
side. It runs with a single `<script>` tag.

- **ricdom**: pronounced "rick-dom". It stands for **Ri**ch **C**ontrol **DOM**, meaning "a DOM that
  is easy to work with". JAVIS was named out of the wish to "bind JavaScript data to the UI
  (Visualization)", whereas ricdom is named from the other end: "the well-controlled DOM you get as
  a result"
- **Web browser**: here this mainly means Chrome (Chromium) on a PC. Many of the in-house apps that
  use ricdom are Electron apps (Chromium inside), so that is where most of the testing is done. It
  also works in Firefox and Safari
- **UI library**: I use this as a general term for libraries that "tie the UI to data", such as
  React / Vue.js / Svelte / Solid / Lit. Think of it as the things gathered under
  [UI data binding](https://en.wikipedia.org/wiki/UI_data_binding)

## 1. Features of ricdom

Through **data binding** (tying the UI to data), ricdom aims for an implementation you can write
intuitively, without agonizing over MVC, MVVM, and the like.

### Feature 1: One API

JAVIS.js had two APIs, `render()` and `bind()`. ricdom folds them into **just one, `createApp()`**.
You pass three things — "where", "which data", and "how to draw it" — and from then on the screen
follows whenever you assign to the data.

I am convinced that simplicity is one clear value in the face of a nature that heads toward chaos
when left alone.

### Feature 2: Write the UI as plain objects

The second feature is that you write HTML as **plain JavaScript objects**.

When you handle HTML from a program (JavaScript), "how to write the HTML" is a real struggle.
Concatenating strings on and on is one answer, but then you end up replacing the HTML wholesale, and
updating just one part of it is hard. Extending the language, as React does (JSX), is another
solution, but it needs a compiler.

JAVIS.js invented **JSAN** (JavaScript Array Notation, a way of writing HTML as arrays). In ricdom
you write **objects**, `{ tag, children }`, instead of arrays. It is slightly longer than an array,
but it is clear where the attributes and the children go, and TypeScript types apply to it as is.

```html
<button>Hello ricdom</button>
```

```js
{ tag: 'button', children: ['Hello ricdom'] }
```

- `tag` is the tag name
- `children` is the content. A string is shown as is; an object becomes a child element. List them in an array

### Hierarchy

HTML can express a hierarchy. Objects can do the same. You just line up more objects inside
`children`.

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

### Attributes

HTML tag attributes are written as **keys** of the same object. Event attributes in particular
(`onclick` and so on) are written as functions (arrow functions).

```html
<button onclick="alert('HELLO!!!')">Hello ricdom</button>
```

```js
{ tag: 'button', onclick: () => alert('HELLO!!!'), children: ['Hello ricdom'] }
```

All in all, almost anything you can write in HTML can be written as an object just as it is.

### The benefit of writing objects

So what is so good about being able to write HTML almost as is in objects? You might think, "Isn't
that just a different way of writing the same thing?"

Not at all. This is **JavaScript**. Variables, functions, the ternary operator, `map()`, if
statements, for loops — everything JavaScript offers can be used as is. HTML, which until now could
only show something fixed, gains variables, functions, and control flow.
**Real-time, dynamic expression becomes possible**, and that is where the big value lies.

Now, let's look at some actual code.

## 2. A simple example

### (1) Loading

First, load ricdom. It takes one `<script>` tag. No build is needed.

```html
<script src="https://cdn.jsdelivr.net/npm/ricdom@2/dist/ricdom.iife.min.js"></script>
```

(Until it is published on npm, run `npm ci && npm run build` from a tag of the repository and put
`dist/ricdom.iife.min.js` on your own site.)

### (2) Where to display

Next, decide where to display it. Prepare a tag as a marker that says "display it here". A `div` is
recommended.

```html
<div id="app"></div>
```

### (3) Displaying — `createApp()`

Display it with `ricdom.createApp()`. There are three arguments: **where** (a selector string or an
element), **which data** (the state), and **how to draw it** (the render function).

```js
ricdom.createApp('#app', {}, () => ({ tag: 'button', children: ['Hello ricdom'] }));
```

In this example we pass `'#app'` as the selector, an empty object as the state, and "a function that
returns a button" as the render function. It means "display a button inside `#app`".

- The selector string is anything you can pass to `document.querySelector()`. Passing the element itself is fine too
- The state is explained later. An empty one will do for now
- The render function is "a function that returns an object". `createApp()` calls it and turns the returned object into DOM

### (4) Running it

Put together, it becomes the following code. Run it and a button appears (pressing it does nothing,
though).

```html live
<div id="app"></div>
<script>
ricdom.createApp('#app', {}, () => ({ tag: 'button', children: ['Hello ricdom'] }));
</script>
```

I think it is rather impressive that an HTML button can be displayed this simply, but nobody praises
me for it, so I will praise myself.

## 3. Specifying attributes

HTML tag attributes are specified as keys of the object. For example, to give a button a `style` and
an `onclick`, it looks like this.

```html
<button style="height: 70px; background: #e77;" onclick="alert('HELLO!!')">Hello ricdom</button>
```

```js
{ tag: 'button',
  style: { height: '70px', background: '#e77' },
  onclick: () => alert('HELLO!!'),
  children: ['Hello ricdom'] }
```

I think you can see that the content of the HTML is expressed almost as is.

- `style` is written **as an object**. JAVIS also accepted a string, but ricdom takes objects only
  (the reason is in chapter 7). Write the keys as they are, like `background`, or in camelCase, like
  `backgroundColor`
- For `onclick`, specify the function to be called when the element is clicked

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

Did a slightly larger red button appear? When you click it, an alert should say "HELLO!!".

## 4. Data binding (tying the UI to data)

At last, the heart of ricdom: data binding.

As a warm-up, let's give the state three values, `hu`, `ji`, and `ko`, and have the render function
return three divs. That state is passed to the render function as its argument `s`.

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

When you write `{ tag: 'div', children: [s.hu] }`, `s.hu` is expanded, and it is the same as writing
`{ tag: 'div', children: [111] }`. Check that the divs show 111, 222, and 333.

It displayed as expected. It displayed, yes, but is this the goal? No, no. This is only the entrance.

### Let's update the data

We take `app`, the return value of `createApp()`, and increase each value at a different interval
with `setInterval()`.

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

setInterval(() => app.hu++,  500);  // every 0.5 s
setInterval(() => app.ji++, 1500);  // every 1.5 s
setInterval(() => app.ko++, 3000);  // every 3.0 s
</script>
```

Now, what will happen? Take a moment to think about it.

... The numbers are moving, aren't they? **This is the heart of ricdom.**

With JAVIS.js, at this point I first had to show an example where "the numbers don't move" and then
call `bind()`. In ricdom, `createApp()` tracks (binds) the state from the start, so with `app.hu++`
**a re-render is scheduled the moment you assign**. That is what I mean by `render()` and `bind()`
having become one.

The point is that the data is updated with no connection to the HTML display (with no awareness of
it at all), and yet the HTML display **follows in real time**. Being able to write the data and the
display completely apart from each other is what characterizes data binding.

### Just one trap

If you modify **the original object** you passed to `createApp()` directly, the screen does not
move.

```js
const state = { hu: 111 };
const app = ricdom.createApp('#app', state, (s) => ({ tag: 'div', children: [s.hu] }));

state.hu = 999;  // ✗ nothing happens (the one being tracked is app)
app.hu = 999;    // ✓ re-rendered
```

`createApp()` **wraps** the object and returns it; it does not rewrite the original object. The only
things that are tracked are the return value `app` (and the render function's argument `s`; these
two are the same thing). Once you are in the habit of reading and writing through `app` or `s`, you
will never step on this again.

This is the most common cause of "it doesn't work" in ricdom, so I am writing it down first.

## 5. The standard way to write it

While we have this momentum, let's refactor the code a little.

The render function's argument `s` is the same thing as `app`, so inside an event handler the screen
moves if you assign to `s`, **without referring to the outer variable `app`**. You can write it in a
closed way, as in object-oriented programming.

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

You only need to keep the return value when you touch the state from outside the render function, as
with `setInterval()`.

### The only rule for the render function is to "return an object"

The rule for the render function of `createApp()` is to "return an object (or an array of them)"; as
long as you keep to that, what goes on inside is up to you. For example, you can even `map()` over
the keys of the state to build objects and return them.

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

## 6. Making several tags work together

This time, we make three tags work together: div, input, and button. Each of these separate tags
refers to and updates the one `s.hu`.

1. The div shows the content of `s.hu`
2. The input, in its `oninput` event, puts the changed value `ev.target.value` into `s.hu` (as a number, via `Math.trunc()`)
3. The button, in its `onclick` event, increases `s.hu` by 1

The argument `ev` passed to an event function is the browser's event object itself.

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

I think you can confirm that even when several tags update and refer to one piece of data
asynchronously, the display follows without any problem.

### Changing only the look

Let's change the input to a `range`. We set the maximum to 50 and the minimum to 0. We are only
changing attributes, and using the features of HTML as they are.

```html live
<div id="app"></div>
<script>
ricdom.createApp('#app', { hu: 11 }, (s) => ({
  tag: 'div', children: [
    { tag: 'div', children: [`hu: ${s.hu}`] },
    { tag: 'input', type: 'range', min: 0, max: 50,   // ← here
      value: s.hu, oninput: (ev) => { s.hu = Math.trunc(ev.target.value); } },
    { tag: 'button', onclick: () => { s.hu++; }, children: ['hu++'] },
  ],
}));
</script>
```

Here you get a glimpse of the benefit of data binding.
**You can change the look (the UI) without caring at all about how `s.hu` is updated**. The UI and
the data are separated, and you can update each of them however you like.

(I noticed later that the button does not check the upper limit, so the value goes on past 50. It is
the same hole as in the JAVIS article.)

## 7. Putting it to work: Picking a color with RGB

With what we know so far, let's make something a little bigger. It displays an RGB color and updates
it.

The key point is that the background color of the div is assembled from the state.

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

### Why `style` became objects only

In JAVIS you could write `style` as either a string or an object. ricdom takes objects only. The
reason is "updating only a part".

ricdom compares the object it drew last time with the object this time, and updates the DOM
**only where something changed**. If `style` is an object, it can tell that "only `background`
changed", so it does not touch `padding`. With a string, all it can do is compare the whole thing
again; it cannot tell which property changed, so it ends up rewriting the lot.

```js
// last time
style: { padding: '10px', background: 'rgb(200, 200, 200)' }
// this time → only background is written to the DOM. padding is not touched
style: { padding: '10px', background: 'rgb(201, 200, 200)' }
```

When you override just part of the style of a component (explained later), objects are more
convenient for the same reason.

## 8. Putting it to work: Picking a color with HSLA

This time it is HSLA. This is the final boss of this document.

It is an application of everything so far, so there is not much to explain in depth, but two small
tricks appear here for the first time.

The first is that we make `control()`, a **function that returns an object**, to share the tag
descriptions that tend to get redundant and monotonous. You could call it a light form of "making a
component". When it comes to components proper, we tend to think in grand terms — classes,
encapsulation, inheritance — but here we only gather things into "a function that builds an object
and returns it". The UI components of ricdom (`ricdom/ui`) are built the same way at the root.

(While I was at it, I also added `onwheel` so that it can be operated with the mouse wheel.
`ev.preventDefault()` stops the scroll from reaching the parent. It is a technique you can use with
HTML in general, not only with ricdom.)

The other is that, with

```js
color: s.l < 45 ? '#eee' : '#111',
```

the text is made white when the background is dark and black when it is light, so that it does not
become unreadable.

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

Since we have come this far, try spinning the mouse wheel around to change the color.

I take pride in thinking that there are not many UI libraries (it is a rare breed) that can write
this much UI in so few lines.

## 9. Putting it to work: An accordion with CSS transitions

Here we use CSS transitions to make an accordion. You often see people working hard at an accordion
in JavaScript, but implementing one in CSS is quite difficult. You will see once you try it.

The biggest point is `transition: 'height 0.3s'` in `style`, and
**putting in a concrete height when opening, too**. With `auto` the transition does not fire, so we
compute the height on the basis of 28px per item and put that in. Opening and closing is a single
ternary operator.

```js
style: { overflow: 'hidden', transition: 'height 0.3s', height: `${s.open ? s.items.length * 28 : 0}px` }
```

```html live
<div id="app"></div>
<script>
ricdom.createApp('#app', { items: ['item-01', 'item-02', 'item-03', 'item-04'], open: false }, (s) => ({
  tag: 'div', children: [
    { tag: 'div', style: { cursor: 'pointer', userSelect: 'none' },
      onclick: () => { s.open = !s.open; },
      children: [`${s.open ? '▼' : '▶'} Accordion list`] },
    { tag: 'div',
      style: { paddingLeft: '15px', overflow: 'hidden', transition: 'height 0.3s', height: `${s.open ? s.items.length * 28 : 0}px` },
      children: s.items.map((it, i) => ({ tag: 'div', style: { height: '28px' }, children: [`${i + 1}: ${it}`] })) },
    { tag: 'button', onclick: () => { s.items = [...s.items, `item-0${s.items.length + 1}`]; }, children: ['Append'] },
  ],
}));
</script>
```

When you press Append while it is open, the list animates as it grows taller. Note that
`s.items` is **replaced** with `[...s.items, newItem]` rather than changed with `push()` (the reason
is "shallow tracking" in chapter 15).

By the way, HTML has the `<details>` / `<summary>` tags, which are "exactly an accordion". When I
wrote the JAVIS article they could not be animated, but now more and more browsers let you put a
transition on `::details-content`. ricdom provides the accordion as a component (`createAccordion`,
with keyboard operation and a11y), so use that one in a real app. What I wanted to show here is the
division of roles: "state → compute the style → CSS animates by itself".

## 10. Putting it to work: Animation with SVG

Here is the SVG you have been waiting for. SVG tags (`svg` / `rect` / `circle`) can be placed with
exactly the same notation as HTML tags.

Here, 200 points bounce around inside a frame. The display fits in the following 4 lines. Inside the
`svg` there is a background `rect`, and after it 200 `circle`s are expanded with `map()`. That is
all.

```js
{ tag: 'svg', width: W + 10, height: H + 10, stroke: '#111', fill: '#ddd', children: [
  { tag: 'rect', x: 0, y: 0, width: W + 10, height: H + 10 },
  ...s.points.map((p) => ({ tag: 'circle', cx: p.x + 5, cy: p.y + 5, r: 5, fill: `hsl(${p.hue}, 75%, 75%)` })),
] }
```

The animation runs at 20fps with `setInterval()`, and after moving the points we
**replace the array** with `app.points = [...app.points]`. What ricdom tracks is assignment at the
top level and one level down, so it does not notice when you only move the points inside the array directly with
`p.x += ...`. When you have finished moving them, replace. This is the ricdom way (chapter 15).

```html live
<div id="app"></div>
<script>
const W = 333, H = 111;
const makePoint = () => ({
  x: Math.random() * W, y: Math.random() * H,
  vx: Math.random() - 0.5, vy: Math.random() - 0.5,
  hue: Math.floor(Math.random() * 360),
});
const move = (p, speed) => {
  p.x += p.vx * speed; p.y += p.vy * speed;
  if (p.x < 0) { p.x = 0; p.vx *= -1; }  if (p.x > W) { p.x = W; p.vx *= -1; }
  if (p.y < 0) { p.y = 0; p.vy *= -1; }  if (p.y > H) { p.y = H; p.vy *= -1; }
};

const app = ricdom.createApp('#app', { points: Array.from({ length: 200 }, makePoint), speed: 10 }, (s) => ({
  tag: 'div',
  onwheel: (ev) => { s.speed += ev.deltaY <= 0 ? 1 : -1; ev.preventDefault(); },
  children: [
    { tag: 'svg', width: W + 10, height: H + 10, stroke: '#111', fill: '#ddd', children: [
      { tag: 'rect', x: 0, y: 0, width: W + 10, height: H + 10 },
      ...s.points.map((p) => ({ tag: 'circle', cx: p.x + 5, cy: p.y + 5, r: 5, fill: `hsl(${p.hue}, 75%, 75%)` })),
    ] },
    { tag: 'div', children: ['speed: ',
      { tag: 'input', type: 'range', min: -10, max: 30, value: s.speed, oninput: (ev) => { s.speed = Number(ev.target.value); } },
      s.speed] },
  ],
}));

setInterval(() => {
  for (const p of app.points) move(p, app.speed);
  app.points = [...app.points];   // replace once they have moved → drawn on the next frame
}, 1000 / 20);
</script>
```

The point is that
**we update the data whenever we like, without caring about the timing of the display**. We assign
at 20fps, but ricdom renders in one go on the next frame with `requestAnimationFrame`, so however
many assignments there are within the same frame, it renders once. For the 200 `circle`s, too, only
the attributes that changed (`cx` / `cy`) are written to the DOM.

## 11. Putting it to work: canvas and "islands"

In the JAVIS article I apologized that "canvas can simply be written in the ordinary way, and is not
a particularly good match". ricdom has just one tool for canvas. It is the **island**.

ricdom compares the object returned by the render function with the DOM and writes the differences,
so if you put something "drawn outside ricdom", like the contents of a canvas, under the management
of ricdom, it may be erased on the next render. ricdom does not touch the **inside** of an element
marked with `island: true` at all.

```html live
<div id="app"></div>
<script>
// Drawing is done outside ricdom. After changing the state, wait for that render to finish (nextRender) and draw it yourself.
const paint = () => {
  const cv = app.refs.get('cv');
  const ctx = cv.getContext('2d');
  ctx.fillStyle = `rgb(${app.r}, ${app.g}, ${app.b})`;
  ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.fillStyle = '#111';
  ctx.font = '16px sans-serif';
  ctx.fillText(`rgb(${app.r}, ${app.g}, ${app.b})`, 10, 48);
};
const onRange = (k) => (ev) => { app[k] = Number(ev.target.value); app.nextRender().then(paint); };

const app = ricdom.createApp('#app', { r: 120, g: 180, b: 220 }, (s) => ({
  tag: 'div', children: [
    { tag: 'canvas', island: true, width: 320, height: 80, ref: 'cv', style: { display: 'block', border: '1px solid #999' } },
    { tag: 'div', children: ['R: ', { tag: 'input', type: 'range', min: 0, max: 255, value: s.r, oninput: onRange('r') }] },
    { tag: 'div', children: ['G: ', { tag: 'input', type: 'range', min: 0, max: 255, value: s.g, oninput: onRange('g') }] },
    { tag: 'div', children: ['B: ', { tag: 'input', type: 'range', min: 0, max: 255, value: s.b, oninput: onRange('b') }] },
  ],
}));
paint();
</script>
```

An element marked with `ref: 'cv'` can be taken out with `app.refs.get('cv')`. `app.nextRender()` is
a Promise that resolves "once the scheduled render has finished"; if you call it right after an
assignment, you can wait for the render caused by that assignment to complete. ricdom manages the
attributes of the canvas (`width` / `height` / `style`), and you draw the picture inside yourself.
Being able to draw this boundary with the single word `island: true` is an improvement over v1 (in
v1 the rule was the implicit "omit `ctx` and it is an island", which could not be told apart from
simply forgetting to write it).

## 12. Comparing with Vue

The JAVIS article lined up samples for Vue.js and React. For ricdom, too, just one: the ToDo list
from the Vue tutorial.

```js
// Vue (split across three places: template / data / methods)
template: `<ol><li v-for="(it, idx) in items">{{ it }} <button v-on:click="del(idx)">x</button></li></ol>
           <input v-model="item" /> <button v-on:click="add()">Add</button>`,
data: { items: ['aaa', 'bbb', 'ccc'], item: 'Hello' },
methods: { add() { this.items.push(this.item) }, del(idx) { this.items.splice(idx, 1) } }
```

```html live
<div id="app"></div>
<script>
ricdom.createApp('#app', { items: ['aaa', 'bbb', 'ccc'], item: 'Hello ricdom' }, (s) => ({
  tag: 'div', children: [
    { tag: 'ol', children: s.items.map((it, i) => ({ tag: 'li', children: [
      it, ' ', { tag: 'button', onclick: () => { s.items = s.items.filter((_, j) => j !== i); }, children: ['x'] },
    ] })) },
    { tag: 'input', value: s.item, oninput: (ev) => { s.item = ev.target.value; } },
    { tag: 'button', onclick: () => { s.items = [...s.items, s.item]; }, children: ['Add'] },
  ],
}));
</script>
```

The `template` / `data` / `methods` of Vue fit into a single render function in ricdom. There are no
extended attributes such as `v-model` or `v-on:click`; we use
**the standard attributes as they are**: `value` and `oninput` on `<input>`, and `onclick` on
`<button>`. The reason ricdom can stay small is that there is nothing more to learn beyond "HTML and
JavaScript".

(The React sample was a comparison from the era of class components, so I left it out this time.)

## 13. How the UI components were born

At the end of the JAVIS article, under "testing it as a library", there were `ui_range(_d, 'r')`,
`ui_hover(...)`, and "`create_ui(_d)`, which generates the view automatically from the data". That
was the beginning of RicUI, and of `ricdom/ui`.

Remember the `control()` we made for HSLA in chapter 8. Just by gathering it into
**a function that returns an object**, it became a component. The 29 components of `ricdom/ui` are
the same at the root.

```js
// Inside, uiRange of ricdom/ui is pretty much this (the real one adds the CSS class of the theme and a11y attributes)
const uiRange = ({ value, min = 0, max = 100, oninput }) =>
  ({ tag: 'input', type: 'range', value, min, max, oninput, class: 'ric-range' });
```

And "generating the UI automatically from the data" became **`createTweakPanel`**. Pass it an
object, and it automatically grows a slider for a number, a checkbox for a boolean, an input field
for a string, and a collapsible folder for a nested object. It is the same idea as dat.GUI or
Tweakpane, but **you can pass the state of ricdom as is**, so the values you adjust take effect in
the app directly.

```js
// Turn the state of the SVG animation in chapter 10 into a tweak panel as is (it is a component, so register it with app.use())
const tweak = app.use(createTweakPanel());
// inside render: tweak({ data: s, keys: { speed: { min: -10, max: 30 } } })
```

Validation can be written with the same idea, too. "The button cannot be pressed while the input is
not valid" is just a matter of computing `disabled: !isValid(s)` inside render. A UI where "can
press / cannot press" changes in real time is kinder to the user than a UI that checks and then
scolds with an alert when something is wrong. For this, the JAVIS article prepared a separate
library called SimpleValidator.js, but in ricdom an expression inside the render function is enough.

For the details of how to make and use components, see §4–§8 of [GUIDE.md](GUIDE.md), and
[the samples](../examples/index.html) from 02 onward.

## 14. API

Here I explain the API of the ricdom core. I said "one", but to be exact it is
**`createApp()` and the four methods and one property that its return value has**.

### `createApp(target, state, render, options?)`

| Argument | Type | Description |
|---|---|---|
| `target` | string or element | Where to render. A string is passed to `document.querySelector()`. If it is not found, it waits once for `DOMContentLoaded`, and if it is still not there, it calls `console.error` and returns an app that does nothing (it does not throw) |
| `state` | object | The data to track. It is tracked **shallowly** (the top level and one level down. For the second level and deeper, see chapter 15) |
| `render` | function `(s) => node` | The render function. `s` receives the state (the tracked version of it). Returns an object / array / string / number / `null` |
| `options.setup` | function `(app) => void` | Called just before the first render (used to register components. [GUIDE.md](GUIDE.md) §5) |

**Return value**: a Proxy (`app`) that tracks `state`. Assigning to it, as in `app.hu = 1`,
schedules a re-render. `createApp()` does **the first render synchronously**, so the DOM is there by
the time it returns.

Methods and properties of the return value `app`:

| Name | Description |
|---|---|
| `app.renderNow()` | Renders synchronously right now, without waiting for the schedule |
| `app.nextRender()` | A Promise that resolves once the scheduled render has finished. It does not resolve when nothing is scheduled (if you "just want to guarantee that it has been applied", use `renderNow()`) |
| `app.use(part)` | Registers a component that has state (dialog / popup / splitter and so on) ([GUIDE.md](GUIDE.md) §5) |
| `app.unmount()` | Stops the tracking and disposes of the components. This settles JAVIS's "`bind()` cannot be removed" |
| `app.ignore` | Data placed under this is not tracked (a place for things unrelated to the screen, such as caches) |

### Render timing

JAVIS.js **polled** the state at `_Hz` (144 by default). ricdom uses a Proxy, so it knows at the
moment of assignment, and renders in one go on the next frame with `requestAnimationFrame` (even if
you assign 100 times within the same frame, it renders once). For environments where rAF stops
because the window is hidden (a minimized Electron window, for example), a 200ms setTimeout is in
place alongside it.

## 15. What I have not touched on so far

This document covered only the same range as the JAVIS article (the core). ricdom goes further than
this.

- **Shallow tracking, and how to assign deep down**: up to `s.user.name = 'x'` is tracked, but
  `s.user.address.city = 'y'` is not. You copy the levels you changed and replace them
  (`s.user = { ...s.user, address: { ...s.user.address, city: 'y' } }`). This is why chapters 9, 10,
  and 12 replaced the arrays with `[...s.items, x]` / `filter()` instead of `push()` / `splice()`.
  In the development build, a `console.warn` tells you about a deep assignment that did not lead to
  a re-render
- **`key`**: a key for reusing the DOM when a list is reordered. Make it unique among siblings
- **Islands**: write `{ tag: 'div', island: true }` and ricdom does not touch the inside. It is the place for `<canvas>` or external libraries
- **UI components `ricdom/ui`**: 29 components, such as buttons, inputs, dialog, popup, toast,
  tooltip, dropdown, splitter, tabs, accordion, the tweak panel, and Markdown display. The
  accordion, tabs, pull-down, and splitter that I wrote I would be "grateful for" in the JAVIS
  retrospective are all there. The CSS is one file (`ricdom-ui.css`; **load it before your own
  stylesheet** — loaded after it, your own rules of the same strength silently lose), and there
  are 7 themes (including glass, a frosted-glass look)
- **Accessibility**: the components look after the dialog's focus trap, the menu's arrow keys, the tabs' roving tabindex, and so on

For what comes next, go on to §3 onward of [GUIDE.md](GUIDE.md) (the practical guide that covers
components, themes, Electron, and migrating from v1) and to the samples in
[examples/](../examples/index.html).

---

## Looking back: What became of the drawbacks of JAVIS in ricdom

At the end of the JAVIS article there was a retrospective note from 2024. Here I line up what became
of each point in ricdom (v2).

| Drawback of JAVIS (2024) | ricdom (2026) |
|---|---|
| Not well known | Unchanged. This is a matter of getting the word out rather than of how good the library is, so I start by publishing this document and the samples |
| The JSAN notation is its own invention and hard to spread | Plain objects instead of arrays. It is the same shape as JSON, so it needs no explanation. TypeScript types apply, too |
| Few UI components; you have no choice but to make your own | 29 components in `ricdom/ui`. Their holes were plugged by being used in 14 in-house apps |
| The resize event lags one beat behind | splitter / scrollPane follow by measuring with rAF. The polling (`_Hz`) itself is gone |
| `bind()` cannot be removed | `app.unmount()` |
| I want local CSS | The CSS is distributed as one file + the `--ric-*` CSS variables. A theme can be applied per element with `applyTheme()` (different themes can coexist on the same page) |

The advantages (light, easy to use, fast because it updates the DOM directly) are carried over as
they are. The core is about 5KB gzipped.
