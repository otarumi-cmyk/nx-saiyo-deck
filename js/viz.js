// js/viz.js — 班D: 7機能の円環（#orbit）／カウントアップ
// 契約: 名前付きexport init() 1つだけ。引数なし・戻り値なし。
//
// 横フリックのデッキ構成に伴う担当範囲（司令塔の指示）
//   ・.reveal → .is-in の付与は deck.js が担当（班Dは触らない）
//   ・バー（.bd-list li / .cmp-col / .roi-bar）は .is-in でCSSが伸ばす（班Dは何もしない）
//   ・ScrollTrigger は使わない。スライドの合図は document の 'nx:slide' で受ける
//
// 前提クラス（班A: css/deck.css）
//   .orbit          … position:relative / aspect-ratio:1/1 / overflow:hidden / border-radius:50%
//   .orbit-core     … width:44%（＝半径22%）中央に配置
//   .orbit-node     … position:absolute / transform:translate(-50%,-50%) / width:88px
//                     → 班Dは left/top を % で入れるだけ。transformには触らない
//   .orbit-node-n   … 番号バッジ（26px円）
//   .orbit-node-t   … 機能名
//   .orbit-list li.is-hot … ホバー時のハイライト（CSS定義済み。班Dはクラスを付けるだけ）

const SPIN_SECONDS = 150;   // 円環1周（ゆっくり・等速）
const RIM_MARGIN = 6;       // 円形クリップ（overflow:hidden）から内側に確保する余白 px

let booted = false;

export function init() {
  if (booted) return;       // 二重起動しても副作用を出さない
  booted = true;

  const gsap = window.gsap || null;
  const reduce = !!(window.NX && window.NX.reduce);

  initCounters(reduce, gsap);
  initOrbit(reduce, gsap);
}

/* ------------------------------------------------------------------ */
/* 1) カウントアップ（nx:slide で発火・一度だけ）                        */
/* ------------------------------------------------------------------ */

function initCounters(reduce, gsap) {
  const all = Array.prototype.slice.call(document.querySelectorAll('[data-count]'));
  if (!all.length) return;

  // 単位の <small> を持つ要素（例: `0<small>万円</small>`）があるので、
  // textContent ごと置き換えず、先頭のテキストノードだけを書き換える
  function sinkOf(el) {
    for (let i = 0; i < el.childNodes.length; i++) {
      if (el.childNodes[i].nodeType === 3) return el.childNodes[i];
    }
    const t = document.createTextNode('');
    el.insertBefore(t, el.firstChild);
    return t;
  }

  function run(el) {
    if (el._nxCounted) return;
    el._nxCounted = true;
    const target = parseFloat(el.getAttribute('data-count'));
    if (!isFinite(target)) return;
    const sink = sinkOf(el);

    if (reduce || !gsap) {
      sink.nodeValue = String(Math.round(target));
      return;
    }
    const o = { v: 0 };
    const dur = 1.2 + Math.min(0.6, Math.abs(target) / 1200); // 1.2〜1.8秒
    gsap.to(o, {
      v: target,
      duration: dur,
      delay: 0.35,           // deck.js が数値ブロックを立ち上げる分だけ待つ
      ease: 'power2.out',
      onUpdate: function () { sink.nodeValue = String(Math.round(o.v)); },
      onComplete: function () { sink.nodeValue = String(Math.round(target)); },
    });
  }

  if (reduce) {              // アニメせず最終状態を即表示
    all.forEach(run);
    return;
  }

  document.addEventListener('nx:slide', function (e) {
    const slide = e && e.detail && e.detail.slide;
    if (!slide) return;
    const targets = slide.querySelectorAll('[data-count]');
    for (let i = 0; i < targets.length; i++) run(targets[i]);
  });
}

/* ------------------------------------------------------------------ */
/* 2) 7機能の円環 #orbit                                               */
/* ------------------------------------------------------------------ */

function initOrbit(reduce, gsap) {
  const orbit = document.getElementById('orbit');
  if (!orbit) return;
  if (orbit.querySelector('.orbit-node')) return;   // 二重生成しない

  const items = Array.prototype.slice.call(
    document.querySelectorAll('#map .orbit-list > li')
  );
  if (!items.length) return;

  // 番号・機能名は .orbit-list から取得（HTMLと順番・文言がずれない）
  const nodes = items.map(function (li, i) {
    const numEl = li.querySelector('.num');
    const nameEl = li.querySelector('b');

    const node = document.createElement('div');
    node.className = 'orbit-node';

    const n = document.createElement('span');
    n.className = 'orbit-node-n';
    n.textContent = numEl ? numEl.textContent.trim() : ('0' + (i + 1)).slice(-2);

    const t = document.createElement('span');
    t.className = 'orbit-node-t';
    t.textContent = nameEl ? nameEl.textContent.trim() : '';

    node.appendChild(n);
    node.appendChild(t);
    orbit.appendChild(node);
    return node;
  });

  const step = 360 / nodes.length;
  let radiusPct = 34;

  // .orbit は円形クリップ（overflow:hidden + border-radius:50%）なので、
  // ノードの外側の角が円からはみ出さない半径を実寸から決める
  // ※ deck.js がスライドに3D変形をかけるため、getBoundingClientRect（変形後の見た目px）
  //   は使わない。offsetWidth/clientWidth（レイアウトpx）だけで揃える
  function measureRadius() {
    const w = orbit.clientWidth;
    const nw = nodes[0].offsetWidth;
    const nh = nodes[0].offsetHeight;
    if (!w || !nw || !nh) return;
    const R = w / 2;
    // 角までクリップされない上限（通常はこちら）
    const strictMax = R - Math.hypot(nw / 2, nh / 2) - RIM_MARGIN;
    // 上下左右の端だけを守る上限（角は余白なので、狭い画面ではここまで許容する）
    const looseMax = R - Math.max(nw, nh) / 2 - RIM_MARGIN;
    const coreR = w * 0.22;                          // .orbit-core は width:44%
    const minR = coreR + Math.min(nw, nh) / 2;       // コアの文字に被らない下限

    let px = Math.min(strictMax, w * 0.38);
    // 狭い画面では strictMax だとコアに被るので、角の余白を削って外側へ逃がす
    if (px < minR) px = Math.min(looseMax, minR);
    radiusPct = Math.max(0, (px / w) * 100);
  }

  function place(deg) {
    for (let i = 0; i < nodes.length; i++) {
      const a = (deg + i * step - 90) * Math.PI / 180;  // -90deg = 真上から開始
      nodes[i].style.left = (50 + radiusPct * Math.cos(a)).toFixed(3) + '%';
      nodes[i].style.top = (50 + radiusPct * Math.sin(a)).toFixed(3) + '%';
    }
  }

  measureRadius();
  place(0);

  // ホバー連動（CSSの .orbit-list li.is-hot に任せる）
  if (window.matchMedia && window.matchMedia('(hover: hover)').matches) {
    const setHot = function (i, on) {
      nodes[i].classList.toggle('is-hot', on);
      if (items[i]) items[i].classList.toggle('is-hot', on);
    };
    nodes.forEach(function (node, i) {
      node.addEventListener('mouseenter', function () { setHot(i, true); });
      node.addEventListener('mouseleave', function () { setHot(i, false); });
    });
    items.forEach(function (li, i) {
      li.addEventListener('mouseenter', function () { setHot(i, true); });
      li.addEventListener('mouseleave', function () { setHot(i, false); });
    });
  }

  let spinDeg = 0;
  const relayout = function () { measureRadius(); place(spinDeg); };
  window.addEventListener('resize', relayout);
  // フォント読み込みでノードの高さが変わるので、確定後にもう一度測る
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(relayout);

  if (reduce || !gsap) return;   // 静止（最終状態のまま）

  const state = { deg: 0 };
  const spin = gsap.to(state, {
    deg: 360,
    duration: SPIN_SECONDS,
    ease: 'none',
    repeat: -1,
    paused: true,
    onUpdate: function () { spinDeg = state.deg; place(spinDeg); },
  });

  // #map スライドがアクティブなときだけ回す
  const mapSlide = orbit.closest('.slide') || document.getElementById('map');
  document.addEventListener('nx:slide', function (e) {
    const slide = e && e.detail && e.detail.slide;
    if (slide && mapSlide && slide === mapSlide) spin.play();
    else spin.pause();
  });
}
