// js/impact.js — 班I: インパクト可視化（#scout-num）
// 契約: 名前付き export init() 1つだけ。引数なし・戻り値なし。
//
// 施主の指摘:「前と後で明らかに良くなった！ってことがわかるように、
//              グラフ二本 矢印ギュン！って感じがいい」
//
// 方針
//   ・index.html は編集できないので、既存の .cmp（左右2枚のカード）は
//     #scout-num に .nx-imp-on を付けて CSS 側で display:none にし、
//     新しい図を #scout-num .slide-in の中へ差し込む。
//     （JSが失敗したときは .nx-imp-on が付かず、元の図がそのまま出る）
//   ・軸は操作しない。横軸を「テンプレート送信＝1.0倍」を原点にした“倍率”にして、
//     開封率(12%→40%)と返信率(0.3%→2.2%)を “まったく同じ目盛り” の上に置く。
//     ％のままだと 0.3% が点になるので、伸びそのもの（倍率）を主役の量に取る。
//   ・1行につき棒は2本。灰＝テンプレート（必ず ×1.0）／シアンの矢印＝パーソナライズ（×3.3, ×7.3）。
//     どちらも原点0から伸びるので、長さの比がそのまま倍率になる。
//
// 依存: window.gsap（UMD先読み・import しない）。無ければ最終状態を即表示。
//       window.NX.reduce が true のときもアニメせず最終状態。

const NS = 'http://www.w3.org/2000/svg';

const AXIS_MAX = 8;          // 倍率軸の上限（返信率 7.3倍 の少し先）
const MOBILE_MAX = 620;      // これ未満は縦に詰めた寸法を使う

// 実数は index.html の記載（開封率 12%→40% ／ 返信率 0.3%→2.2%）と一致させる
const METRICS = [
  { key: '開封率', bTxt: '12%', aTxt: '40%', b: 12, a: 40, emph: 0.76 },
  { key: '返信率', bTxt: '0.3%', aTxt: '2.2%', b: 0.3, a: 2.2, emph: 1 },
];

let booted = false;

export function init() {
  if (booted) return;
  booted = true;

  // 置き場所: #scout-num（原契約）。構成変更でIDが変わった場合に備えて、
  // 司令塔が任意のスライドに data-nx-impact="scout" を付ければそこに出る。
  const sec = document.getElementById('scout-num')
    || document.querySelector('[data-nx-impact="scout"]');
  if (!sec) return;
  const inner = sec.querySelector('.slide-in');
  if (!inner) return;
  if (inner.querySelector('.imp')) return;   // 二重生成しない

  const hadCmp = !!inner.querySelector('.cmp');
  const chart = build(inner);
  sec.classList.add('nx-imp-on');            // ここで初めて旧 .cmp を隠す
  // 旧・左右2枚のカードを置き換えた場合だけ、その注記（別目盛りの断り書き）も隠す
  if (hadCmp) sec.classList.add('nx-imp-legacy');

  const gsap = window.gsap || null;
  const reduce = !!(window.NX && window.NX.reduce);
  const still = reduce || !gsap;

  let measured = 0;
  let tl = null;
  let done = false;

  function relayout() {
    const w = Math.round(chart.root.clientWidth);
    if (!w) return false;
    if (Math.abs(w - measured) < 2) return false;
    measured = w;
    layout(chart, w);
    return true;
  }

  function applyFinal() {
    chart.rows.forEach(function (r) {
      setBefore(r, 1);
      setArrow(r, 1);
      setBigValue(r, r.disp);
    });
    show(chart.staticEls, 1);
    chart.rows.forEach(function (r) { show([r.big, r.pct], 1); });
    done = true;
  }

  function applyReset() {
    if (tl) { tl.kill(); tl = null; }
    chart.rows.forEach(function (r) {
      setBefore(r, 0);
      setArrow(r, 0);
      setBigValue(r, 0);
      show([r.big, r.pct], 0);
      if (window.gsap) window.gsap.set([r.big, r.pct], { clearProps: 'transform,scale,x' });
    });
    show(chart.staticEls, 0);
    done = false;
  }

  function play() {
    if (!relayout() && !measured) return;      // 幅が取れないうちは何もしない
    if (still) { applyFinal(); return; }
    if (done && tl) return;                    // 再生済みならそのまま
    applyReset();
    tl = buildTimeline(chart, gsap, function () { done = true; });
  }

  // 幅の確定（スライドは display されているので通常はここで取れる）
  relayout();

  if (still) {
    // アニメせず最終状態を即表示。
    // ※ requestAnimationFrame に頼らない：非表示タブ／プレビューでは呼ばれず、
    //   「動きを減らす」設定の人に何も表示されなくなる。
    if (measured) applyFinal();
    else requestAnimationFrame(function () { relayout(); applyFinal(); });
  } else {
    applyReset();
  }

  // 幅が変わったら組み直す（高さ変化では組み直さない＝ループ防止）
  // 注意: 図を差し込んだ直後に .slide-in のスクロールバーが出入りして幅が数px動くことがある。
  //       ここで applyReset() すると再生中のアニメが巻き戻るので、走っている間は座標だけ差し替える。
  //       （進捗依存の描画は次の onUpdate が新しい r.geom で描き直す）
  const onResize = function () {
    if (!relayout()) return;
    if (still || done) { applyFinal(); return; }
    if (tl) return;              // 再生中 → 止めない
    applyReset();                // 未再生 → 新しい座標で初期状態を描き直す
  };
  window.addEventListener('resize', onResize);
  if (window.ResizeObserver) {
    try { new window.ResizeObserver(onResize).observe(chart.root); } catch (e) { /* noop */ }
  }

  document.addEventListener('nx:slide', function (ev) {
    const slide = ev && ev.detail && ev.detail.slide;
    if (slide === sec) play();
    else if (!still) applyReset();
  });

  if (sec.classList.contains('is-active')) play();
}

/* ------------------------------------------------------------------ */
/* DOM生成                                                             */
/* ------------------------------------------------------------------ */

function svgEl(tag, attrs, parent) {
  const n = document.createElementNS(NS, tag);
  if (attrs) for (const k in attrs) n.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(n);
  return n;
}

function show(list, v) {
  for (let i = 0; i < list.length; i++) {
    if (list[i]) list[i].style.opacity = String(v);
  }
}

function build(inner) {
  const root = document.createElement('div');
  root.className = 'imp';

  const top = document.createElement('div');
  top.className = 'imp-top';
  top.innerHTML =
    '<p class="imp-lead">テンプレート送信を <b>1.0倍</b> としたときの伸び</p>' +
    '<ul class="imp-legend"><li class="imp-lg-b">テンプレート送信</li>' +
    '<li class="imp-lg-a">パーソナライズ（AIが一人ひとり作成）</li></ul>';
  root.appendChild(top);

  const svg = svgEl('svg', {
    class: 'imp-svg',
    xmlns: NS,
    preserveAspectRatio: 'xMidYMid meet',
    'aria-hidden': 'true',
  });
  root.appendChild(svg);

  const defs = svgEl('defs', null, svg);
  const grad = svgEl('linearGradient', { id: 'imp-grad', x1: '0', y1: '0', x2: '1', y2: '0' }, defs);
  svgEl('stop', { offset: '0', class: 'imp-g0' }, grad);
  svgEl('stop', { offset: '1', class: 'imp-g1' }, grad);

  const gGrid = svgEl('g', { class: 'imp-gridg' }, svg);
  const gStreak = svgEl('g', { class: 'imp-streakg' }, svg);
  const gArrow = svgEl('g', { class: 'imp-arrowg' }, svg);
  const gText = svgEl('g', { class: 'imp-textg' }, svg);

  const note = document.createElement('p');
  note.className = 'imp-note';
  note.textContent =
    '※ 開封率・返信率とも同じ倍率目盛り（テンプレート送信＝1.0倍）で描いています。' +
    '開封率 12%→40%、返信率 0.3%→2.2% から算出。';
  root.appendChild(note);

  // .cmp の直後（= 旧注記の手前）に差し込む
  const cmp = inner.querySelector('.cmp');
  if (cmp && cmp.parentNode) cmp.parentNode.insertBefore(root, cmp.nextSibling);
  else inner.appendChild(root);

  // --- 軸まわり（静的） ---
  const grids = [];
  const ticks = [];
  for (let v = 1; v <= AXIS_MAX; v++) {
    grids.push(svgEl('line', { class: 'imp-grid' }, gGrid));
    const t = svgEl('text', { class: 'imp-tick', 'text-anchor': 'middle' }, gGrid);
    t.textContent = '×' + v;
    ticks.push(t);
  }
  const axis = svgEl('line', { class: 'imp-axis' }, gGrid);
  const ref = svgEl('line', { class: 'imp-ref' }, gGrid);
  const refLab = svgEl('text', { class: 'imp-reflab', 'text-anchor': 'start' }, gGrid);
  refLab.textContent = 'テンプレート送信の水準';

  // --- 行 ---
  const rows = METRICS.map(function (m) {
    const ratio = m.a / m.b;
    const disp = Math.round(ratio * 10) / 10;

    const title = svgEl('text', { class: 'imp-rowtitle', 'text-anchor': 'start' }, gText);
    title.textContent = m.key;

    const before = svgEl('rect', { class: 'imp-before', rx: '2' }, gText);

    const bLab = svgEl('text', { class: 'imp-beforelab', 'text-anchor': 'start' }, gText);
    const bLabJa = svgEl('tspan', { class: 'imp-ja' }, bLab);
    bLabJa.textContent = 'テンプレート ';
    const bLabN = svgEl('tspan', { class: 'imp-mono' }, bLab);
    bLabN.textContent = m.bTxt;

    const big = svgEl('text', { class: 'imp-big', 'text-anchor': 'end' }, gText);
    const bigN = svgEl('tspan', { class: 'imp-big-n' }, big);
    bigN.textContent = '0.0';
    const bigU = svgEl('tspan', { class: 'imp-big-u' }, big);
    bigU.textContent = '倍';

    const streaks = [];
    for (let i = 0; i < 4; i++) streaks.push(svgEl('line', { class: 'imp-streak' }, gStreak));

    const arrow = svgEl('path', { class: 'imp-arrow', fill: 'url(#imp-grad)' }, gArrow);

    const pct = svgEl('text', { class: 'imp-pct', 'text-anchor': 'end' }, gText);
    pct.textContent = m.aTxt;

    return {
      m: m, ratio: ratio, disp: disp,
      title: title, before: before, bLab: bLab, bLabJa: bLabJa,
      big: big, bigN: bigN, bigU: bigU,
      streaks: streaks, arrow: arrow, pct: pct,
      geom: { x0: 0, tipX: 0, cy: 0, shaftH: 0, headH: 0, headW: 0, beforeW: 0 },
    };
  });

  return {
    root: root, svg: svg, rows: rows,
    grids: grids, ticks: ticks, axis: axis, ref: ref, refLab: refLab,
    staticEls: grids.concat(ticks, [axis, ref, refLab])
      .concat(rows.map(function (r) { return r.title; }))
      .concat(rows.map(function (r) { return r.before; }))
      .concat(rows.map(function (r) { return r.bLab; })),
  };
}

/* ------------------------------------------------------------------ */
/* レイアウト（SVGユーザー単位 = CSS px にして、画面幅ごとに組み直す）    */
/* ------------------------------------------------------------------ */

function layout(chart, W) {
  const mob = W < MOBILE_MAX;

  const x0 = 2;
  const rightPad = mob ? 13 : 16;              // 右端の「×8」ラベルが切れない分
  const plotW = Math.max(60, W - x0 - rightPad);
  const xOf = function (v) { return x0 + plotW * (v / AXIS_MAX); };

  const topLab = mob ? 16 : 20;
  const titleH = mob ? 18 : 24;
  const beforeH = mob ? 11 : 16;
  const gap1 = mob ? 6 : 8;                    // before棒と矢印のすき間（近づけて2本1組に見せる）
  const arrowH = mob ? 38 : 60;                // 矢じりの高さ＝矢印の帯の高さ
  const rowGap = mob ? 22 : 34;                // 行と行の間（行内のすき間より必ず広く取る）
  const axisH = mob ? 24 : 30;

  const shaftH = Math.round(arrowH * 0.52);
  const headW = Math.round(arrowH * 0.62);

  const fTitle = mob ? 14 : 19;
  const fBefore = mob ? 10 : 13;
  const fTick = mob ? 10 : 12;
  const fRef = mob ? 10 : 12;
  const fPct = Math.max(10, Math.round(shaftH * 0.58));

  // 行の上半分（見出し＋before棒 ／ 右側に倍率の大きい数字）は横にずれるので同じ帯に同居させる。
  // こうすると before棒 と矢印が隣り合って「2本1組」に見える。
  let y = topLab;
  const rowTops = [];
  const bigFonts = [];
  const headBands = [];
  for (let i = 0; i < chart.rows.length; i++) {
    const f = Math.round((mob ? 34 : 58) * METRICS[i].emph);
    const band = Math.max(titleH + beforeH + gap1, Math.round(f * 1.06));
    bigFonts.push(f);
    headBands.push(band);
    rowTops.push(y);
    y += band + arrowH;
    if (i < chart.rows.length - 1) y += rowGap;
  }
  const axisY = y + (mob ? 8 : 10);
  const H = axisY + axisH;

  chart.svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
  chart.svg.setAttribute('width', '100%');
  chart.svg.setAttribute('height', H);

  // 目盛り
  for (let v = 1; v <= AXIS_MAX; v++) {
    const gx = xOf(v);
    const g = chart.grids[v - 1];
    g.setAttribute('x1', gx); g.setAttribute('x2', gx);
    g.setAttribute('y1', topLab); g.setAttribute('y2', axisY);
    const t = chart.ticks[v - 1];
    t.setAttribute('x', gx);
    t.setAttribute('y', axisY + fTick + (mob ? 5 : 7));
    t.setAttribute('font-size', fTick);
  }
  chart.axis.setAttribute('x1', x0); chart.axis.setAttribute('x2', xOf(AXIS_MAX));
  chart.axis.setAttribute('y1', axisY); chart.axis.setAttribute('y2', axisY);

  chart.ref.setAttribute('x1', xOf(1)); chart.ref.setAttribute('x2', xOf(1));
  chart.ref.setAttribute('y1', topLab); chart.ref.setAttribute('y2', axisY);
  chart.refLab.setAttribute('x', xOf(1) + 7);
  chart.refLab.setAttribute('y', topLab - (mob ? 5 : 7));
  chart.refLab.setAttribute('font-size', fRef);

  // 行
  for (let i = 0; i < chart.rows.length; i++) {
    const r = chart.rows[i];
    const top = rowTops[i];

    // before棒は帯の下端にそろえる（＝矢印のすぐ上）
    const byTop = top + headBands[i] - gap1 - beforeH;

    r.title.setAttribute('x', x0);
    r.title.setAttribute('y', byTop - (mob ? 5 : 7));
    r.title.setAttribute('font-size', fTitle);
    r.before.setAttribute('x', x0);
    r.before.setAttribute('y', byTop);
    r.before.setAttribute('height', beforeH);

    r.bLab.setAttribute('x', xOf(1) + 8);
    r.bLab.setAttribute('y', byTop + beforeH * 0.5 + fBefore * 0.36);
    r.bLab.setAttribute('font-size', fBefore);
    r.bLabJa.textContent = mob ? '' : 'テンプレート ';

    const bigBase = top + headBands[i] - Math.round(bigFonts[i] * 0.1);
    const cy = top + headBands[i] + arrowH / 2;

    r.geom = {
      x0: x0,
      tipX: xOf(r.ratio),
      cy: cy,
      shaftH: shaftH,
      headH: arrowH,
      headW: headW,
      beforeW: xOf(1) - x0,
    };

    r.big.setAttribute('x', r.geom.tipX);
    r.big.setAttribute('y', bigBase);
    r.big.setAttribute('font-size', bigFonts[i]);
    r.bigU.setAttribute('font-size', Math.round(bigFonts[i] * 0.46));

    r.pct.setAttribute('x', r.geom.tipX - headW - (mob ? 7 : 11));
    r.pct.setAttribute('y', cy + fPct * 0.36);
    r.pct.setAttribute('font-size', fPct);

    for (let s = 0; s < r.streaks.length; s++) {
      r.streaks[s].setAttribute('stroke-width', mob ? 1.5 : 2);
    }
  }
}

/* ------------------------------------------------------------------ */
/* 進捗の反映                                                          */
/* ------------------------------------------------------------------ */

function setBefore(r, t) {
  r.before.setAttribute('width', Math.max(0, r.geom.beforeW * t));
}

function setBigValue(r, v) {
  r.bigN.textContent = (Math.round(v * 10) / 10).toFixed(1);
}

// 矢印は d を組み直して伸ばす（scaleXだと矢じりが潰れて「ギュン」に見えない）
function setArrow(r, t) {
  const g = r.geom;
  const full = g.tipX - g.x0;
  const len = full * t;

  if (len < 1.5) {
    r.arrow.style.opacity = '0';
    for (let i = 0; i < r.streaks.length; i++) r.streaks[i].style.opacity = '0';
    return;
  }
  r.arrow.style.opacity = '1';

  const hw = Math.min(g.headW, len * 0.62);
  const h = Math.min(g.shaftH, Math.max(2, len * 0.5));
  const hh = Math.min(g.headH, Math.max(h + 2, len * 1.4));
  const cy = g.cy;
  const xTip = g.x0 + len;
  const xBody = xTip - hw;

  r.arrow.setAttribute('d',
    'M' + g.x0 + ' ' + (cy - h / 2) +
    'L' + xBody + ' ' + (cy - h / 2) +
    'L' + xBody + ' ' + (cy - hh / 2) +
    'L' + xTip + ' ' + cy +
    'L' + xBody + ' ' + (cy + hh / 2) +
    'L' + xBody + ' ' + (cy + h / 2) +
    'L' + g.x0 + ' ' + (cy + h / 2) + 'Z');

  // 速度線（進行中だけ出て、着地で消える）
  const op = 0.9 * Math.min(1, t * 5) * Math.pow(Math.max(0, 1 - t), 1.1);
  const mult = [0.5, 0.32, 0.58, 0.36];
  const off = [-0.33, -0.5, 0.33, 0.5];
  for (let i = 0; i < r.streaks.length; i++) {
    const s = r.streaks[i];
    const x2 = xBody - 4;
    const x1 = Math.max(g.x0, x2 - Math.max(30, len * mult[i]));
    const y = cy + g.headH * off[i];
    s.setAttribute('x1', x1); s.setAttribute('x2', x2);
    s.setAttribute('y1', y); s.setAttribute('y2', y);
    s.style.opacity = String(op);
  }
}

/* ------------------------------------------------------------------ */
/* 再生                                                                */
/* ------------------------------------------------------------------ */

function buildTimeline(chart, gsap, onDone) {
  const tl = gsap.timeline({ delay: 0.34, onComplete: onDone });   // deck.js の入場と重ならないよう少し待つ

  // 1) 目盛り
  tl.fromTo(chart.grids.concat(chart.ticks, [chart.axis]),
    { opacity: 0 }, { opacity: 1, duration: 0.4, ease: 'power2.out', stagger: 0.012 }, 0);

  // 2) 「テンプレートの水準」の破線が上から降りる
  tl.fromTo(chart.ref,
    { opacity: 0, scaleY: 0, transformOrigin: '50% 0%' },
    { opacity: 1, scaleY: 1, duration: 0.45, ease: 'power3.out' }, 0.16);
  tl.fromTo(chart.refLab, { opacity: 0 }, { opacity: 1, duration: 0.35, ease: 'power2.out' }, 0.4);

  chart.rows.forEach(function (r, i) {
    const at = 0.22 + i * 0.1;

    // 3) 行タイトル
    tl.fromTo(r.title, { opacity: 0, x: -10 },
      { opacity: 1, x: 0, duration: 0.45, ease: 'power3.out' }, at);

    // 4) before の棒（×1.0）
    const b = { t: 0 };
    tl.set(r.before, { opacity: 1 }, at + 0.06);
    tl.to(b, {
      t: 1, duration: 0.45, ease: 'power2.out',
      onUpdate: function () { setBefore(r, b.t); },
    }, at + 0.06);
    tl.fromTo(r.bLab, { opacity: 0 }, { opacity: 1, duration: 0.3, ease: 'power2.out' }, at + 0.4);

    // 5) 矢印がギュン（bounce/elastic は使わない）
    const flyAt = 0.88 + i * 0.18;
    const a = { t: 0 };
    tl.to(a, {
      t: 1,
      duration: 0.95 + i * 0.12,
      ease: 'power3.out',
      onUpdate: function () { setArrow(r, a.t); },
      onComplete: function () { setArrow(r, 1); },
    }, flyAt);

    // 6) 倍率のカウントアップ＋出現（矢印の着地に合わせて決まる）
    const c = { v: 0 };
    tl.to(c, {
      v: r.disp,
      duration: 0.8 + i * 0.12,
      ease: 'power3.out',
      onUpdate: function () { setBigValue(r, c.v); },
      onComplete: function () { setBigValue(r, r.disp); },
    }, flyAt + 0.1);
    // 矢印が終点に近づいてから出す（先回りして終点で待っているように見せない）
    tl.fromTo(r.big, { opacity: 0, x: -26, scale: 0.9, transformOrigin: '100% 50%' },
      { opacity: 1, x: 0, scale: 1, duration: 0.52, ease: 'power3.out' }, flyAt + 0.38);

    // 7) 到達後の実数（40% / 2.2%）
    tl.fromTo(r.pct, { opacity: 0 }, { opacity: 1, duration: 0.35, ease: 'power2.out' },
      flyAt + 0.75 + i * 0.12);
  });

  // 8) 本命（返信率 7.3倍）だけ、着地したことが分かる一押し
  const last = chart.rows[chart.rows.length - 1];
  tl.to(last.big, {
    scale: 1.07, duration: 0.22, ease: 'power2.out',
    transformOrigin: '100% 50%', yoyo: true, repeat: 1,
  }, '>-0.1');

  return tl;
}
