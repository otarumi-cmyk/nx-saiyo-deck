// js/charts.js — 班H：図解・グラフ（SVGを自前で組み立てる／外部チャートライブラリ不使用）
// 契約: 名前付きexport init() 1つのみ。引数なし・戻り値なし。担当外のDOMには触れない。
// 対象: index.html の .chart-slot[data-chart]（cost-donut / chore-ratio / roi-cumulative）
//
// ── 形（form）の選び方 ─ dataviz スキルの手順に沿って、色より先に形を決めている ──
//  1) cost-donut   part-to-whole（4区分・6以下）→ ドーナツ。中央に要約を置く
//  2) chore-ratio  1つの比率 → 2スライスの円ではなく **メーター**（横バー1本）
//  3) roi-cumulative 時系列の累積2系列＋差分 → 折れ線＋差分の面
//
// ── 配色 ─ 主張が「1系列が主役・他は文脈」なので categorical ではなく emphasis ──
// （アクセント1色＋沈んだグレー）。色は CONTRACT.md / deck.css のトークンのみ。
// scripts/validate_palette.js --mode dark --surface #0C121A の実測（隣接ペア）:
//   （検証コマンド: node scripts/validate_palette.js "#00D4FF,#2C9DBC,#5A6879,#94A3B4,#00D4FF"
//     --mode dark --surface "#0C121A"  ※末尾は一周して隣り合うペアを見るため先頭色を再掲）
//   CVD separation      PASS  worst #00D4FF↔#94A3B4 ΔE 11.4 (deutan)  ※目標 ≥8
//   Normal-vision floor PASS  worst #00D4FF↔#94A3B4 ΔE 15.4 (normal)  ※下限 15
//   Contrast vs surface PASS  4色すべて ≥3:1（3.30〜10.4:1）
//   Lightness band      FAIL  #00D4FF(L .804) / #94A3B4(L .709)
//        → deck.css 指定のブランドトークン（--accent / --ink-dim）。ほぼ黒の面の上で
//          明るい側に外れているだけで、可読性は 10.4:1 / 6.3:1。意図的な逸脱。
//   Chroma floor        FAIL  #5A6879 / #94A3B4（C≈.03）
//        → emphasis の「沈ませる」側。グレーに見えることが仕様なので設計通り。
// 二次エンコード（凡例＋直接ラベル＋2pxのサーフェス隙間）は全図に入れてある。
//
// ⚠ 数値の扱い：このファイルは**数値を自前で持たない**。すべて index.html の
//   実DOMから読む（司令塔が数字を差し替えれば図も自動で追従する）。
//     ドーナツ  … #breakdown .bd-list の --w と .bd-name（is-key＝社内の時間）
//     メーター  … .tl-grid の data-kind ブロック数
//     ROI      … #roi-chart .roi-cap の「◯万円」
//   いずれも実データ確定前の想定値なので、図中に必ず「想定値」と明記する。
//   読めなかった場合は数字を出さず、比率だけのイメージ表示に落とす。

/* ------------------------------------------------------------------ */
/* 定数                                                                */
/* ------------------------------------------------------------------ */

const NS = 'http://www.w3.org/2000/svg';

// 役割名 → charts.css のロール変数（生のhexをこのファイルに書かない）
const V = {
  in1: 'var(--nx-in-1)',      // 社内の時間・主役（--accent）
  in2: 'var(--nx-in-2)',      // 社内の時間・従（同じシアンの1段下）
  ex1: 'var(--nx-ex-1)',      // 外部費用・明（--ink-dim）
  ex2: 'var(--nx-ex-2)',      // 外部費用・暗
  mut: 'var(--nx-mute)',      // 沈ませるグレー（雑務・サービス費用）
  ink: 'var(--nx-ink)',
  dim: 'var(--nx-dim)',
  grid: 'var(--nx-grid)',
  axis: 'var(--nx-axis)',
  track: 'var(--nx-track)',
  surf: 'var(--nx-surface)',
};

// 社内＝アクセント2段階、外部＝グレー2段階。並び順は検証済みの隣接ペアを崩さない
// （in1 → in2 → ex2 → ex1 → 一周して in1）
const IN_COLORS = [V.in1, V.in2];
const EX_COLORS = [V.ex2, V.ex1];

const ROI_WIDE_MIN = 560; // これ未満はROIを縦長レイアウトで描く

/* ------------------------------------------------------------------ */
/* ページ実DOMから数値を読む（このファイルは数値を持たない）            */
/* ------------------------------------------------------------------ */

// #breakdown の内訳バー → ドーナツの構成比
function readCostParts() {
  const lis = document.querySelectorAll('#breakdown .bd-list > li');
  const inn = [];
  const ext = [];

  for (let i = 0; i < lis.length; i++) {
    const li = lis[i];
    const bar = li.querySelector('.bd-bar');
    const nameEl = li.querySelector('.bd-name');
    if (!bar || !nameEl) continue;

    const w = parseFloat((bar.getAttribute('style') || '').replace(/[\s\S]*--w:\s*/, ''));
    if (!isFinite(w) || w <= 0) continue;

    const em = nameEl.querySelector('em');
    const sub = em ? em.textContent.trim() : '';
    const name = nameEl.textContent.replace(sub, '').trim();

    (li.classList.contains('is-key') ? inn : ext).push({ name: name, sub: sub, w: w });
  }
  if (!inn.length || !ext.length) return null;

  for (let i = 0; i < inn.length; i++) {
    inn[i].group = 'in';
    inn[i].color = IN_COLORS[Math.min(i, IN_COLORS.length - 1)];
  }
  for (let i = 0; i < ext.length; i++) {
    ext[i].group = 'ex';
    ext[i].color = EX_COLORS[Math.min(i, EX_COLORS.length - 1)];
  }
  return inn.concat(ext); // 社内を先に＝12時から時計回りに社内の弧が続く
}

// .tl-grid の実ブロック数 → 雑務メーターの比率
function countTimelineBlocks() {
  const grids = document.querySelectorAll('.tl-grid');
  for (let i = 0; i < grids.length; i++) {
    const chore = grids[i].querySelectorAll('.tl-block[data-kind="chore"]').length;
    const core = grids[i].querySelectorAll('.tl-block[data-kind="core"]').length;
    if (chore + core > 0) return { chore: chore, core: core };
  }
  return null;
}

// #roi-chart の棒キャプション「◯万円」→ 累積グラフの傾き
// ⚠ 単位が「／月」か「／年」かで意味が変わるので、キャプションから必ず判定する。
//    戻り値はどちらの場合も「12ヶ月の累計（万円）」に揃える。
function readRoiFigures() {
  const bars = document.querySelectorAll('#roi-chart .roi-bar');
  let save = null;
  let cost = null;
  let perYear = false;

  for (let i = 0; i < bars.length; i++) {
    const b = bars[i].querySelector('.roi-cap b');
    if (!b) continue;
    const m = b.textContent.replace(/,/g, '').match(/(\d+(?:\.\d+)?)\s*万円/);
    if (!m) continue;
    const v = parseFloat(m[1]);
    if (bars[i].classList.contains('is-save')) save = v;
    else if (bars[i].classList.contains('is-cost')) cost = v;

    const u = bars[i].querySelector('.roi-cap span');
    if (u && /[／/]\s*年|年間|年当たり/.test(u.textContent)) perYear = true;
  }
  if (!save || !cost || save <= cost) return null; // 読めなければ金額を出さない

  const k = perYear ? 1 : 12;
  return { saveY: Math.round(save * k), costY: Math.round(cost * k) };
}

let booted = false;

/* ------------------------------------------------------------------ */
/* init                                                                */
/* ------------------------------------------------------------------ */

export function init() {
  if (booted) return;
  booted = true;

  const slots = Array.prototype.slice.call(
    document.querySelectorAll('.chart-slot[data-chart]')
  );
  if (!slots.length) return; // 対象要素が無ければ何もしない

  const reduce = isReduce();
  const gsap = window.gsap || null;

  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    if (slot.querySelector('.nx-chart')) continue; // 二重生成しない
    const build = BUILDERS[slot.getAttribute('data-chart')];
    if (!build) continue;

    let api = null;
    try {
      api = build(slot);
    } catch (e) {
      console.error('[NX charts] build failed:', slot.getAttribute('data-chart'), e);
      continue;
    }
    if (!api) continue;

    if (reduce || !gsap) {
      api.final(); // アニメせず最終状態を即表示
      continue;
    }
    api.rest();
    watch(slot, function () { api.play(gsap); });
  }
}

function isReduce() {
  if (window.NX && window.NX.reduce) return true;
  return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

// 画面に入ったら1回だけ実行（ScrollTrigger.refresh() は呼ばない）
function watch(el, fn) {
  if (!('IntersectionObserver' in window)) { fn(); return; }
  const io = new IntersectionObserver(function (entries, obs) {
    for (let i = 0; i < entries.length; i++) {
      if (!entries[i].isIntersecting) continue;
      obs.disconnect();
      fn();
      return;
    }
  }, { threshold: 0.2 });
  io.observe(el);
}

/* ------------------------------------------------------------------ */
/* 小道具                                                              */
/* ------------------------------------------------------------------ */

function svgEl(name, attrs) {
  const n = document.createElementNS(NS, name);
  if (attrs) for (const k in attrs) n.setAttribute(k, String(attrs[k]));
  return n;
}

function htmlEl(name, cls, text) {
  const n = document.createElement(name);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

// SVGのテキスト。色は必ずテキストトークン（系列色を文字に乗せない）
function label(x, y, text, opt) {
  const o = opt || {};
  const t = svgEl('text', {
    x: x, y: y,
    'text-anchor': o.anchor || 'start',
    'font-size': o.size || 13,
    'font-weight': o.weight || 500,
    class: 'nx-t' + (o.mono ? ' nx-mono' : '') + (o.cls ? ' ' + o.cls : ''),
  });
  t.style.fill = o.fill || V.dim;
  t.textContent = text;
  return t;
}

function figure(cls, ariaLabel) {
  const fig = htmlEl('figure', 'nx-chart ' + cls);
  fig.setAttribute('role', 'group');
  fig.setAttribute('aria-label', ariaLabel);
  return fig;
}

function svgRoot(vbW, vbH, titleText, descText) {
  const svg = svgEl('svg', {
    viewBox: '0 0 ' + vbW + ' ' + vbH,
    role: 'img',
    preserveAspectRatio: 'xMidYMid meet',
  });
  const t = svgEl('title');
  t.textContent = titleText;
  svg.appendChild(t);
  if (descText) {
    const d = svgEl('desc');
    d.textContent = descText;
    svg.appendChild(d);
  }
  return svg;
}

/* ================================================================== */
/* 1) cost-donut ── 採用コストの内訳                                    */
/*    主張：最も大きなコストは、担当者の時間である                       */
/* ================================================================== */

function buildCostDonut(slot) {
  const parts = readCostParts();
  if (!parts) return null; // 元データが読めなければ何も描かない
  const total = parts.reduce(function (s, p) { return s + p.w; }, 0);
  const inSum = parts.reduce(function (s, p) { return s + (p.group === 'in' ? p.w : 0); }, 0);
  const inPct = Math.round((inSum / total) * 100);

  const fig = figure('nx-donut', '採用コストの内訳');
  const body = htmlEl('div', 'nx-donut-body');
  const ringBox = htmlEl('div', 'nx-donut-ring');

  const SZ = 360, CX = 180, CY = 180, R = 130, SW = 44;
  const CIRC = 2 * Math.PI * R;
  const GAP = 3.4; // ≒2px のサーフェス隙間（描画は約0.6倍スケール）

  const svg = svgRoot(
    SZ, SZ,
    '採用コストの内訳（想定値）',
    '採用コストを' + parts.length + '項目に分けた構成比。担当者の人件費と面接官の時間、' +
    'すなわち社内の時間が全体の' + inPct + '％を占めます。実データ確定前の想定値です。'
  );

  const track = svgEl('circle', { cx: CX, cy: CY, r: R, fill: 'none', 'stroke-width': SW });
  track.style.stroke = V.track;
  svg.appendChild(track);

  const g = svgEl('g', { transform: 'rotate(-90 ' + CX + ' ' + CY + ')' });
  svg.appendChild(g);

  // 主役アークの後ろの微発光（フィルタ不使用＝viewBoxからはみ出さない）
  const glow = svgEl('circle', { cx: CX, cy: CY, r: R, fill: 'none', 'stroke-width': SW + 18 });
  glow.style.stroke = V.in1;
  glow.style.opacity = '.12';
  g.appendChild(glow);

  const segs = [];
  let acc = 0;
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    const frac = p.w / total;
    const start = acc * CIRC + GAP / 2;
    const len = Math.max(0, frac * CIRC - GAP);
    const c = svgEl('circle', {
      cx: CX, cy: CY, r: R, fill: 'none',
      'stroke-width': SW, 'stroke-linecap': 'butt',
      'stroke-dashoffset': -start,
    });
    c.style.stroke = p.color;
    g.appendChild(c);
    segs.push({ node: c, len: len });
    if (i === 0) {
      glow.setAttribute('stroke-dashoffset', String(-start));
      glow._len = len;
    }
    acc += frac;
  }

  // 中央の要約（ページ本文の「社内の時間が◯%」と同じ数字になる＝食い違わない）
  const mid = svgEl('g');
  mid.appendChild(label(CX, CY - 40, '社内の時間', { anchor: 'middle', size: 23, weight: 700, fill: V.dim }));
  mid.appendChild(label(CX, CY + 30, inPct + '%', {
    anchor: 'middle', size: 76, weight: 700, fill: V.in1, mono: true,
  }));
  mid.appendChild(label(CX, CY + 62, '担当者 ＋ 面接官', { anchor: 'middle', size: 19, weight: 500, fill: V.dim }));
  svg.appendChild(mid);

  ringBox.appendChild(svg);
  body.appendChild(ringBox);
  body.appendChild(donutLegend(parts));
  fig.appendChild(body);
  fig.appendChild(htmlEl(
    'figcaption', 'nx-note',
    '※ 構成比は想定値（イメージ）です。実データ確定後に差し替えます。'
  ));
  slot.appendChild(fig);

  const rows = fig.querySelectorAll('.nx-lg');

  // k: 0..1 の配列（セグメントごと）。単一の値を渡したら全セグメントに適用する
  function setK(k) {
    for (let i = 0; i < segs.length; i++) {
      const ki = typeof k === 'number' ? k : k[i];
      const l = segs[i].len * ki;
      segs[i].node.setAttribute('stroke-dasharray', l + ' ' + (CIRC - l));
    }
    const g0 = typeof k === 'number' ? k : k[0];
    const gl = glow._len * g0;
    glow.setAttribute('stroke-dasharray', gl + ' ' + (CIRC - gl));
  }
  function setOpacity(v) {
    mid.style.opacity = v;
    for (let i = 0; i < rows.length; i++) rows[i].style.opacity = v;
  }

  return {
    rest: function () { setK(0); setOpacity('0'); },
    final: function () { setK(1); setOpacity('1'); },
    play: function (gsap) {
      // 1本のトゥイーンで駆動し、セグメントごとの段差(OFF)と power2.out を自前で当てる。
      // 複数トゥイーン＋staggerだと、最後の onUpdate が最終値を書かずに終わる場合がある。
      const N = segs.length;
      const OFF = 0.12;
      const SPAN = 1 - OFF * (N - 1);
      const o = { p: 0 };
      const ks = new Array(N);
      gsap.to(o, {
        p: 1, duration: 1.35, ease: 'none',
        onUpdate: function () {
          for (let i = 0; i < N; i++) {
            let k = (o.p - i * OFF) / SPAN;
            k = k < 0 ? 0 : k > 1 ? 1 : k;
            ks[i] = 1 - (1 - k) * (1 - k); // power2.out
          }
          setK(ks);
        },
        onComplete: function () { setK(1); }, // 最終状態を必ず確定させる
      });
      gsap.to(mid, { opacity: 1, duration: 0.7, delay: 0.55, ease: 'power2.out' });
      gsap.to(rows, { opacity: 1, duration: 0.5, delay: 0.3, ease: 'power2.out', stagger: 0.06 });
    },
  };
}

// 凡例はHTML（狭い列でも折り返る／文字サイズがSVGスケールに引きずられない）
function donutLegend(parts) {
  const wrap = htmlEl('div', 'nx-legend');
  const groups = [
    { key: 'in', head: '社内の時間', note: '計測されていない' },
    { key: 'ex', head: '外部への支出', note: '見えている' },
  ];

  for (let gi = 0; gi < groups.length; gi++) {
    const grp = groups[gi];
    const sec = htmlEl('div', 'nx-lg-grp is-' + grp.key);
    const h = htmlEl('p', 'nx-lg-head');
    h.appendChild(htmlEl('b', null, grp.head));
    h.appendChild(htmlEl('span', null, grp.note));
    sec.appendChild(h);

    const ul = htmlEl('ul', 'nx-lg-list');
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (p.group !== grp.key) continue;
      const li = htmlEl('li', 'nx-lg');
      const sw = htmlEl('i', 'nx-sw');
      sw.style.background = p.color;
      li.appendChild(sw);
      const t = htmlEl('span', 'nx-lg-t');
      t.appendChild(htmlEl('b', null, p.name));
      if (p.sub) t.appendChild(htmlEl('em', null, p.sub));
      li.appendChild(t);
      ul.appendChild(li);
    }
    sec.appendChild(ul);
    wrap.appendChild(sec);
  }
  return wrap;
}

/* ================================================================== */
/* 2) chore-ratio ── 雑務の比率（.tl-meter の中・小さめ）                */
/*    主張：採用ご担当者の時間の大半が雑務である                         */
/*    色：タイムラインと同じルール（雑務=グレー／採用そのもの=アクセント） */
/* ================================================================== */

function buildChoreRatio(slot) {
  const n = countTimelineBlocks();
  if (!n) return null; // タイムラインが無ければ何も描かない
  const choreFrac = n.chore / (n.chore + n.core);

  const W = 240, H = 56, BAR_Y = 24, BAR_H = 12, GAP = 2;
  const fig = figure('nx-ratio', '雑務と採用そのものの時間比率');
  const svg = svgRoot(
    W, H,
    '1週間の予定に占める雑務の割合（想定）',
    '上の予定表の全' + (n.chore + n.core) + 'ブロックのうち' + n.chore +
    'ブロックが雑務（作成・調整・入力・集計）で、採用そのもの（会う・見極める・口説く）は' +
    n.core + 'ブロックです。想定値です。'
  );

  // ラベル行：文字はテキストトークン、identity は色ドットが担う
  const d1 = svgEl('circle', { cx: 4, cy: 8, r: 4 });
  d1.style.fill = V.mut;
  svg.appendChild(d1);
  svg.appendChild(label(13, 12, '雑務', { size: 12, weight: 700, fill: V.dim }));

  const d2 = svgEl('circle', { cx: W - 82, cy: 8, r: 4 });
  d2.style.fill = V.in1;
  svg.appendChild(d2);
  svg.appendChild(label(W - 73, 12, '採用そのもの', { size: 12, weight: 700, fill: V.ink }));

  const track = svgEl('rect', { x: 0, y: BAR_Y, width: W, height: BAR_H, rx: BAR_H / 2 });
  track.style.fill = V.track;
  svg.appendChild(track);

  const choreW = Math.max(0, choreFrac * W - GAP / 2);
  const coreW = Math.max(0, W - choreW - GAP);

  const rChore = svgEl('rect', { x: 0, y: BAR_Y, width: 0, height: BAR_H, rx: BAR_H / 2 });
  rChore.style.fill = V.mut;
  svg.appendChild(rChore);

  const rCore = svgEl('rect', { x: W, y: BAR_Y, width: 0, height: BAR_H, rx: BAR_H / 2 });
  rCore.style.fill = V.in1;
  svg.appendChild(rCore);

  // ⚠「週22時間」との二重解釈を避けるため、これは“上の予定表の内訳”だと明記する
  svg.appendChild(label(W, 52, '※ 上の予定表の内訳（想定）', { anchor: 'end', size: 10.5, weight: 500, fill: V.dim }));

  fig.appendChild(svg);
  slot.appendChild(fig);

  function set(k) {
    rChore.setAttribute('width', String(choreW * k));
    rCore.setAttribute('x', String(W - coreW * k));
    rCore.setAttribute('width', String(coreW * k));
  }

  return {
    rest: function () { set(0); },
    final: function () { set(1); },
    play: function (gsap) {
      const o = { k: 0 };
      gsap.to(o, {
        k: 1, duration: 0.95, ease: 'power3.out',
        onUpdate: function () { set(o.k); },
        onComplete: function () { set(1); },
      });
    },
  };
}

/* ================================================================== */
/* 3) roi-cumulative ── 年間の累積効果                                  */
/*    主張：月10万円の費用に対して、削減できる人件費が積み上がっていく    */
/*    ⚠ 金額は未確定 → 縦軸に金額を書かない                             */
/* ================================================================== */

const ROI_WIDE = {
  w: 720, h: 400,
  x0: 58, x1: 656, yTop: 84, yBase: 312,
  fs: 13, fsSmall: 11.5, fsWedge: 16,
  legendY: 24, legendY2: 24, legendX2: 300,
  ticks: [1, 3, 6, 9, 12],
  axisNote: '累積金額（目盛りなし・端の数値を参照）',
  endLabels: 'both',
};

const ROI_NARROW = {
  w: 340, h: 340,
  x0: 22, x1: 318, yTop: 86, yBase: 258,
  fs: 11.5, fsSmall: 10, fsWedge: 12.5,
  legendY: 18, legendY2: 40, legendX2: 0,
  ticks: [1, 6, 12],
  axisNote: '累積金額（目盛りなし）',
  endLabels: 'save', // 幅が無いので削減側の1つだけ。費用側は凡例が担う
};

function buildRoiCumulative(slot) {
  const fx = readRoiFigures(); // 読めなければ null → 金額を出さない

  const fig = figure('nx-roi', '年間の累積効果');
  const host = htmlEl('div', 'nx-roi-plot');
  fig.appendChild(host);
  fig.appendChild(htmlEl(
    'figcaption', 'nx-note',
    fx
      ? '※ 試算です。削減できる費用は想定値のため、実データ確定後に金額を差し替えます。'
      : '※ 実データ確定後に金額を入れます。縦軸の目盛りと傾きはイメージです。'
  ));
  slot.appendChild(fig);

  let view = null;
  let mode = null;
  let played = false;

  function render(next) {
    if (next === mode) return;
    mode = next;
    host.textContent = '';
    view = drawRoi(host, next === 'wide' ? ROI_WIDE : ROI_NARROW, fx);
    if (played || isReduce() || !window.gsap) view.final();
    else view.rest();
  }

  function pick() {
    const w = host.clientWidth || slot.clientWidth || 0;
    render(w >= ROI_WIDE_MIN || w === 0 ? 'wide' : 'narrow');
  }

  pick();
  // ビューポートではなく「置かれた枠の幅」で切り替える（列組みが変わっても崩れない）
  if ('ResizeObserver' in window) {
    const ro = new ResizeObserver(function () { pick(); });
    ro.observe(host);
  } else {
    window.addEventListener('resize', pick);
  }

  return {
    rest: function () { if (view) view.rest(); },
    final: function () { played = true; if (view) view.final(); },
    play: function (gsap) { played = true; if (view) view.play(gsap); },
  };
}

function drawRoi(host, cfg, fx) {
  const MONTHS = 12;
  const plotW = cfg.x1 - cfg.x0;
  const plotH = cfg.yBase - cfg.yTop;

  // 累積は「毎月同額 × nヶ月」なので両方とも直線。傾きは #roi-chart の実数値から起こす。
  const saveY = fx ? fx.saveY : null;   // 12ヶ月の累計（万円）
  const costY = fx ? fx.costY : null;
  const gapY = fx ? saveY - costY : null;

  const topV = plotH * 0.94; // 12ヶ月時点の削減側＝プロット上端
  const savePer = topV / MONTHS;
  const costPer = fx ? (topV * (costY / saveY)) / MONTHS : (plotH * 0.40) / MONTHS;
  const xAt = function (m) { return cfg.x0 + (m / MONTHS) * plotW; };
  const yAt = function (v) { return cfg.yBase - v; };

  const svg = svgRoot(
    cfg.w, cfg.h,
    fx ? '12ヶ月の累積効果（試算）' : '12ヶ月の累積効果（金額は実データ確定前）',
    '導入から12ヶ月の累積。削減できる費用の累積がサービス費用の累積を上回り続け、' +
    '両者の差が月を追うごとに広がります。' +
    (fx ? '12ヶ月では削減' + saveY + '万円に対し費用' + costY + '万円、差引' + gapY + '万円です。' : '') +
    '実データ確定前の試算です。'
  );

  // --- グリッド（実線ヘアライン・沈ませる）とベースライン
  for (let i = 0; i < cfg.ticks.length; i++) {
    const x = xAt(cfg.ticks[i]);
    const ln = svgEl('line', { x1: x, y1: cfg.yTop - 6, x2: x, y2: cfg.yBase, 'stroke-width': 1 });
    ln.style.stroke = V.grid;
    svg.appendChild(ln);
  }
  const base = svgEl('line', { x1: cfg.x0, y1: cfg.yBase, x2: cfg.x1, y2: cfg.yBase, 'stroke-width': 1 });
  base.style.stroke = V.axis;
  svg.appendChild(base);

  // --- 縦軸に目盛り金額は打たない。値は端の直接ラベルで持たせる（direct label 優先）
  svg.appendChild(label(cfg.x0, cfg.yTop - 16, cfg.axisNote, {
    size: cfg.fsSmall, weight: 500, fill: V.dim,
  }));

  // --- 凡例（2系列なので必ず出す。色だけに identity を負わせない）
  const lg = svgEl('g');
  lg.appendChild(keyLine(cfg.x0, cfg.legendY, V.in1));
  lg.appendChild(label(cfg.x0 + 26, cfg.legendY + 4, '累積 削減できる費用', { size: cfg.fs, weight: 700, fill: V.ink }));
  const l2x = cfg.legendX2 || cfg.x0;
  lg.appendChild(keyLine(l2x, cfg.legendY2, V.mut));
  lg.appendChild(label(l2x + 26, cfg.legendY2 + 4, '累積 サービス費用', { size: cfg.fs, weight: 500, fill: V.dim }));
  svg.appendChild(lg);

  // --- 左→右にスイープさせるクリップ
  const cid = 'nx-roi-clip-' + Math.random().toString(36).slice(2, 9);
  const defs = svgEl('defs');
  const cp = svgEl('clipPath', { id: cid });
  const cr = svgEl('rect', { x: cfg.x0 - 3, y: 0, width: plotW + 6, height: cfg.h });
  cp.appendChild(cr);
  defs.appendChild(cp);
  svg.appendChild(defs);

  const plot = svgEl('g', { 'clip-path': 'url(#' + cid + ')' });
  svg.appendChild(plot);

  // 差分の面（＝得している幅）
  let d = '';
  for (let m = 0; m <= MONTHS; m++) d += (m ? ' L ' : 'M ') + xAt(m) + ' ' + yAt(m * savePer);
  for (let m = MONTHS; m >= 0; m--) d += ' L ' + xAt(m) + ' ' + yAt(m * costPer);
  d += ' Z';
  const wedge = svgEl('path', { d: d });
  wedge.style.fill = V.in1;
  wedge.style.opacity = '.10';
  plot.appendChild(wedge);

  plot.appendChild(polyline(MONTHS, xAt, yAt, costPer, V.mut, 2));
  plot.appendChild(polyline(MONTHS, xAt, yAt, savePer, V.in1, 2));

  // --- 差分の説明（面の内側。テキストはインクトークン）
  //     面がいちばん広い右寄りに置き、上下の線に触れない位置に収める
  const WM = 8.6;
  const wx = xAt(WM);
  const wy = (yAt(WM * savePer) + yAt(WM * costPer)) / 2;
  const wedgeCap = svgEl('g');
  wedgeCap.appendChild(label(wx, wy - 4, 'この幅が差引', { anchor: 'middle', size: cfg.fsWedge, weight: 700, fill: V.ink }));
  wedgeCap.appendChild(label(wx, wy + cfg.fsWedge + 1,
    fx ? '年間 ' + gapY + '万円' : '＝ 御社に残る分',
    { anchor: 'middle', size: cfg.fsWedge, weight: 700, fill: V.ink, mono: !!fx }));
  svg.appendChild(wedgeCap);

  // --- 端点マーカー（2px のサーフェスリング）
  const dots = svgEl('g');
  dots.appendChild(endDot(xAt(MONTHS), yAt(MONTHS * savePer), V.in1));
  dots.appendChild(endDot(xAt(MONTHS), yAt(MONTHS * costPer), V.mut));
  svg.appendChild(dots);

  // --- 端の直接ラベル（広い版のみ。狭い版は凡例と差引ラベルが担う）
  //     金額は #roi-chart の実数値から起こす。読めない場合はプレースホルダのまま。
  const ends = svgEl('g');
  if (cfg.endLabels) {
    ends.appendChild(label(xAt(MONTHS) - 10, yAt(MONTHS * savePer) - 14,
      fx ? '12ヶ月で ' + saveY + '万円' : '12ヶ月で ◯◯万円', {
        anchor: 'end', size: cfg.fsSmall, weight: 700, fill: V.ink, mono: true,
        cls: fx ? '' : 'nx-ph',
      }));
  }
  if (cfg.endLabels === 'both') {
    ends.appendChild(label(xAt(MONTHS) - 10, yAt(MONTHS * costPer) + 25,
      fx ? '12ヶ月で ' + costY + '万円' : '12ヶ月で ◯◯万円', {
        anchor: 'end', size: cfg.fsSmall, weight: 500, fill: V.dim, mono: true,
        cls: fx ? '' : 'nx-ph',
      }));
  }
  svg.appendChild(ends);

  // --- X軸
  for (let i = 0; i < cfg.ticks.length; i++) {
    const m = cfg.ticks[i];
    svg.appendChild(label(xAt(m), cfg.yBase + 22, String(m), {
      anchor: 'middle', size: cfg.fsSmall, weight: 500, fill: V.dim, mono: true,
    }));
  }
  svg.appendChild(label(cfg.x1, cfg.yBase + 44, '経過月数（ヶ月）', {
    anchor: 'end', size: cfg.fsSmall, weight: 500, fill: V.dim,
  }));

  host.appendChild(svg);

  return {
    rest: function () {
      cr.setAttribute('width', '0');
      dots.style.opacity = '0';
      ends.style.opacity = '0';
      wedgeCap.style.opacity = '0';
    },
    final: function () {
      cr.setAttribute('width', String(plotW + 6));
      dots.style.opacity = '1';
      ends.style.opacity = '1';
      wedgeCap.style.opacity = '1';
    },
    play: function (gsap) {
      const o = { w: 0 };
      gsap.to(o, {
        w: plotW + 6, duration: 1.5, ease: 'power2.out',
        onUpdate: function () { cr.setAttribute('width', String(o.w)); },
        onComplete: function () { cr.setAttribute('width', String(plotW + 6)); },
      });
      gsap.to([dots, ends], { opacity: 1, duration: 0.6, delay: 1.1, ease: 'power2.out' });
      gsap.to(wedgeCap, { opacity: 1, duration: 0.7, delay: 0.85, ease: 'power2.out' });
    },
  };
}

function polyline(months, xAt, yAt, per, color, w) {
  const pts = [];
  for (let m = 0; m <= months; m++) pts.push(xAt(m) + ',' + yAt(m * per));
  const p = svgEl('polyline', {
    points: pts.join(' '), fill: 'none',
    'stroke-width': w, 'stroke-linejoin': 'round', 'stroke-linecap': 'round',
  });
  p.style.stroke = color;
  return p;
}

function keyLine(x, y, color) {
  const l = svgEl('line', { x1: x, y1: y, x2: x + 18, y2: y, 'stroke-width': 3, 'stroke-linecap': 'round' });
  l.style.stroke = color;
  return l;
}

function endDot(x, y, color) {
  const g = svgEl('g');
  const ring = svgEl('circle', { cx: x, cy: y, r: 6.5 });
  ring.style.fill = V.surf;
  const c = svgEl('circle', { cx: x, cy: y, r: 4.5 });
  c.style.fill = color;
  g.appendChild(ring);
  g.appendChild(c);
  return g;
}

/* ------------------------------------------------------------------ */

const BUILDERS = {
  'cost-donut': buildCostDonut,
  'chore-ratio': buildChoreRatio,
  'roi-cumulative': buildRoiCumulative,
};
