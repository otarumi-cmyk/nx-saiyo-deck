// timeline.js — 班C：採用ご担当者の1週間タイムライン（同じ表を3回見せる）＋ #vision の吸い込み
// 横フリックのスライドデッキ版。ScrollTrigger は使わない。deck.js の合図で発火する。
//   #tl-grid-1（st-1 素）/ #tl-grid-2（st-2 塗り分け）/ #tl-grid-3（st-3 数字）/ #vision-grid
//   合図： document 'nx:slide' { detail:{ index, slide } } ／ 各スライドの 'nx:enter'
//
// 依存：window.gsap（UMD先読み）。window.NX.reduce が true のときはアニメせず最終状態を即表示。

const CORE = 'core';
const CHORE = 'chore';
const FINAL_LABEL = '最終面接';
const CORE_LABEL = '面接';

// 月〜金 × タスク。1日6〜7ブロック／全32ブロック（雑務27 / 採用そのもの5＝約84%が雑務）
// ⚠ 実データ待ち。実在のご担当者へのヒアリング結果に差し替える前提の仮配分。
const WEEK = [
  ['月', [
    ['スカウト作成・送信', CHORE],
    ['応募書類の確認', CHORE],
    ['日程調整メール', CHORE],
    ['面接', CORE],
    ['面接メモの整理', CHORE],
    ['評価入力・共有', CHORE],
    ['求人票の修正', CHORE]
  ]],
  ['火', [
    ['応募書類の確認', CHORE],
    ['日程調整メール', CHORE],
    ['面接', CORE],
    ['面接メモの整理', CHORE],
    ['評価入力・共有', CHORE],
    ['リスケジュール対応', CHORE]
  ]],
  ['水', [
    ['社内定例', CHORE],
    ['スカウト作成・送信', CHORE],
    ['媒体別の数値集計', CHORE],
    ['応募書類の確認', CHORE],
    ['面接', CORE],
    ['日程調整メール', CHORE],
    ['評価入力・共有', CHORE]
  ]],
  ['木', [
    ['日程調整メール', CHORE],
    ['応募書類の確認', CHORE],
    ['候補者との面談', CORE],
    ['面接メモの整理', CHORE],
    ['評価入力・共有', CHORE],
    ['スカウト作成・送信', CHORE]
  ]],
  ['金', [
    ['スカウト作成・送信', CHORE],
    ['応募書類の確認', CHORE],
    ['クロージング面談', CORE],
    ['面接メモの整理', CHORE],
    ['媒体別の数値集計', CHORE],
    ['求人票の修正', CHORE]
  ]]
];

// 「最終面接」として残すブロック：水（中央列）の core
const FINAL_DAY = 2;

// 決定論的な擬似乱数（毎回同じ散り方にする）
function rnd(i) {
  const x = Math.sin((i + 1) * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

// 同じ表を4箇所に生成する（背骨：同じ表を3回見せて塗り替える）
// <div class="tl-day"><span class="tl-day-name">月</span>
//   <div class="tl-block" data-kind="chore" style="--i:0">スカウト作成・送信</div> …
function buildGrid(grid) {
  const frag = document.createDocumentFragment();
  const blocks = [];
  let i = 0;
  for (let d = 0; d < WEEK.length; d++) {
    const col = document.createElement('div');
    col.className = 'tl-day';
    const nm = document.createElement('span');
    nm.className = 'tl-day-name';
    nm.textContent = WEEK[d][0];
    col.appendChild(nm);
    const tasks = WEEK[d][1];
    for (let t = 0; t < tasks.length; t++) {
      const b = document.createElement('div');
      b.className = 'tl-block';
      b.dataset.kind = tasks[t][1];
      b.style.setProperty('--i', String(i));
      b.textContent = tasks[t][0];
      b.nxKind = tasks[t][1];
      col.appendChild(b);
      blocks.push(b);
      i++;
    }
    frag.appendChild(col);
  }
  grid.textContent = '';
  grid.appendChild(frag);
  return blocks;
}

function slideOf(el) {
  return el.closest('.slide') || el.closest('section') || null;
}

// root を基準にしたレイアウト座標。デッキはスライドに3D変形をかけるため、
// getBoundingClientRect ではなく transform の影響を受けない offsetLeft/Top を積む
function offsetIn(el, root) {
  let x = 0;
  let y = 0;
  let n = el;
  while (n && n !== root) {
    x += n.offsetLeft;
    y += n.offsetTop;
    n = n.offsetParent;
  }
  return { x: x, y: y };
}

/* ---------------- タイムライン（3枚） ---------------- */
// 状態クラス（.st-1/.st-2/.st-3）はHTML固定。JSは表の生成と「入り」の演出だけを担当する。
//   ・st-2 / st-3 … 着地した瞬間に data-kind を付け直し、CSSの transition-delay:calc(var(--i)*20ms)
//                    で月曜の上から金曜の下へ塗り分けが波打つ
//   ・1枚目      … ブロックが1つずつ積まれ、表が埋まっていく

function setupTimeline(grids, gsap, still) {
  const entries = grids.map(function (grid, gi) {
    const blocks = buildGrid(grid);
    const slide = slideOf(grid);
    const paints = !!(slide && (slide.classList.contains('st-2') || slide.classList.contains('st-3')));
    return { grid: grid, blocks: blocks, slide: slide, paints: paints, stacks: gi === 0, tween: null };
  });

  if (still) return entries;

  // 塗り分けの波を「着地の瞬間」に見せるため、まだ表示されていない表は種別を伏せておく
  entries.forEach(function (e) {
    if (e.paints && e.slide && !e.slide.classList.contains('is-active')) armPaint(e);
  });

  function armPaint(e) {
    for (let i = 0; i < e.blocks.length; i++) e.blocks[i].removeAttribute('data-kind');
  }
  function playPaint(e) {
    for (let i = 0; i < e.blocks.length; i++) e.blocks[i].dataset.kind = e.blocks[i].nxKind;
  }
  function playStack(e) {
    if (e.tween) e.tween.kill();
    e.tween = gsap.fromTo(e.blocks,
      { opacity: 0, y: 8 },
      {
        opacity: 1,
        y: 0,
        duration: 0.42,
        ease: 'power2.out',
        stagger: 0.014,
        clearProps: 'opacity,transform'
      });
  }

  function onSlide(slide) {
    entries.forEach(function (e) {
      if (!e.slide) return;
      if (e.slide === slide) {
        if (e.paints) playPaint(e);
        if (e.stacks) playStack(e);
      } else if (e.paints) {
        armPaint(e);
      }
    });
  }

  document.addEventListener('nx:slide', function (ev) {
    onSlide(ev.detail && ev.detail.slide);
  });

  // deck.js より先に init される想定だが、既にアクティブなスライドがあれば拾っておく
  const active = document.querySelector('.slide.is-active');
  if (active) onSlide(active);

  return entries;
}

/* ---------------- #vision：雑務が中央のコアへ吸い込まれ、最終面接だけが残る ---------------- */

function setupVision(grid, gsap, still) {
  const blocks = buildGrid(grid);
  const sec = grid.closest('#vision') || slideOf(grid);
  if (!sec) return;
  const copy = sec.querySelector('.vision-copy');
  const days = Array.prototype.slice.call(grid.children);
  const finalBlock =
    (days[FINAL_DAY] && days[FINAL_DAY].querySelector('.tl-block[data-kind="' + CORE + '"]')) ||
    grid.querySelector('.tl-block[data-kind="' + CORE + '"]');
  if (!finalBlock) return;

  const others = [];
  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i] !== finalBlock) others.push(blocks[i]);
  }

  const finalOrigText = finalBlock.textContent || CORE_LABEL;
  function markFinal(on) {
    finalBlock.classList.toggle('is-final', on);
    finalBlock.textContent = on ? FINAL_LABEL : finalOrigText;
  }

  if (still) {
    for (let i = 0; i < others.length; i++) others[i].style.opacity = '0';
    markFinal(true);
    if (copy) copy.classList.add('is-in');
    return;
  }

  // 旧 style.css の .tl-block transition と .vision-grid .tl-day backdrop-filter が残っており、
  // 前者はGSAPと二重掛けになり、後者は列ごとの stacking context で飛来ブロックを列の下に沈める
  for (let i = 0; i < blocks.length; i++) {
    blocks[i].style.transition = 'none';
    blocks[i].style.zIndex = '1';
  }
  for (let i = 0; i < days.length; i++) {
    days[i].style.backdropFilter = 'none';
    days[i].style.webkitBackdropFilter = 'none';
  }
  finalBlock.style.zIndex = '2';

  // 吸い込み先＝画面中央（#core-canvas に描かれているコアの位置）
  const core = sec.querySelector('#core-canvas') || sec;
  function delta(el) {
    const p = offsetIn(el, sec);
    const isSec = core === sec;
    const c = isSec ? { x: 0, y: 0 } : offsetIn(core, sec);
    // スライドが画面より高い場合でも「見えている中央」へ吸い込む
    const cw = Math.min(isSec ? sec.clientWidth : core.offsetWidth, window.innerWidth);
    const ch = Math.min(isSec ? sec.clientHeight : core.offsetHeight, window.innerHeight);
    return {
      x: (c.x + cw / 2) - (p.x + el.offsetWidth / 2),
      y: (c.y + ch / 2) - (p.y + el.offsetHeight / 2)
    };
  }

  let tl = null;
  let played = false;

  function reset() {
    if (tl) { tl.kill(); tl = null; }
    gsap.set(blocks, { clearProps: 'transform,opacity' });
    markFinal(false);
    if (copy) copy.classList.remove('is-in');
    played = false;
  }

  function play() {
    if (played) return;
    played = true;
    if (tl) tl.kill();
    gsap.set(blocks, { clearProps: 'transform,opacity' });
    markFinal(false);
    if (copy) copy.classList.remove('is-in');

    tl = gsap.timeline();
    // 雑務は、ふわりと浮いてから中央のコアへ吸い込まれて消える（タイミングはバラバラ）
    for (let i = 0; i < others.length; i++) {
      const el = others[i];
      const at = 0.05 + rnd(i) * 0.55;
      tl.to(el, { y: -9, duration: 0.2, ease: 'power2.out' }, at);
      tl.to(el, {
        x: function () { return delta(el).x; },
        y: function () { return delta(el).y; },
        scale: 0.12,
        opacity: 0,
        duration: 0.62,
        ease: 'power2.out'
      }, at + 0.2);
    }
    // 空いた表に、最終面接だけが残って光る
    tl.add(function () { markFinal(true); }, 0.62);
    tl.fromTo(finalBlock,
      { scale: 1 },
      { scale: 1.06, duration: 0.75, ease: 'power3.out' }, 0.62);
    // 絵が決まってからコピーを出す（表は消さない）
    tl.add(function () { if (copy) copy.classList.add('is-in'); }, 1.55);
    tl.to({}, { duration: 0.01 }, 1.9);
  }

  document.addEventListener('nx:slide', function (ev) {
    const slide = ev.detail && ev.detail.slide;
    if (slide === sec) play();
    else if (played) reset();
  });

  if (sec.classList.contains('is-active')) play();
}

/* ---------------- entry ---------------- */

export function init() {
  const vGrid = document.getElementById('vision-grid');
  const grids = Array.prototype.slice.call(document.querySelectorAll('.tl-grid'))
    .filter(function (g) { return g !== vGrid; });
  if (!grids.length && !vGrid) return;

  const gsap = window.gsap;
  const still = !!(window.NX && window.NX.reduce) || !gsap;

  if (grids.length) setupTimeline(grids, gsap, still);
  if (vGrid) setupVision(vGrid, gsap, still);
}
