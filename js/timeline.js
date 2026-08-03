// timeline.js — 班C：採用ご担当者の1週間タイムスケジュール（同じ表を3回見せる）＋ #vision の吸い込み
// 横フリックのスライドデッキ版。ScrollTrigger は使わない。deck.js の合図で発火する。
//   #tl-grid-1（st-1 素）/ #tl-grid-2（st-2 塗り分け）/ #tl-grid-3（st-3 数字）/ #vision-grid
//   合図： document 'nx:slide' { detail:{ index, slide } }
//
// レイアウト（スライド版 slides/ p.07〜09 と同じ週間予定表）:
//   .tl-grid  … 1列目=時間軸 ＋ 月〜金の5列  → grid-template-columns:auto repeat(5,1fr)
//   .tl-times / .tl-day … 1行目=見出し ＋ 9行の時間コマ → grid-template-rows:auto repeat(9,1fr)
//   9:00〜18:00／1コマ＝1時間。12:00〜13:00（--row:4）は昼休憩で全曜日とも空ける。
//   各ブロックは --row（開始コマ 1=9:00）と --span（コマ数）を持ち、grid-row もインラインで確定させる。
//
// 依存：window.gsap（UMD先読み）。window.NX.reduce が true のときはアニメせず最終状態を即表示。

const CORE = 'core';
const CHORE = 'chore';

// 1コマ＝1時間。--row:1 が 9:00、--row:9 が 17:00（--row:4 の 12:00 は昼休憩で空ける）
const HOURS = ['9:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'];

// 月〜金 × [タスク名, 種別, 開始コマ, コマ数]
// 全36ブロック／稼働8時間×5日＝40時間のうち、面接（採用そのもの）は7時間・雑務は33時間
// ⚠ 配置はスライド版（slides/ p.07）と同じイメージ。実在のご担当者へのヒアリングで確定する前提。
const WEEK = [
  ['月', [
    ['社内定例', CHORE, 1, 1],
    ['スカウト作成・送信', CHORE, 2, 2],
    ['応募書類の確認', CHORE, 5, 1],
    ['日程調整メールの往復', CHORE, 6, 1],
    ['面接', CORE, 7, 1],
    ['面接メモの整理', CHORE, 8, 1],
    ['求人票の修正', CHORE, 9, 1]
  ]],
  ['火', [
    ['応募書類の確認', CHORE, 1, 1],
    ['面接', CORE, 2, 1],
    ['面接メモの整理', CHORE, 3, 1],
    ['スカウト作成・送信', CHORE, 5, 1],
    ['面接', CORE, 6, 1],
    ['評価入力・社内共有', CHORE, 7, 1],
    ['日程調整メールの往復', CHORE, 8, 2]
  ]],
  ['水', [
    ['スカウト作成・送信', CHORE, 1, 2],
    ['リスケジュール対応', CHORE, 3, 1],
    ['応募書類の確認', CHORE, 5, 1],
    ['面接', CORE, 6, 1],
    ['面接メモの整理', CHORE, 7, 1],
    ['媒体別の数値集計', CHORE, 8, 1],
    ['日程調整メールの往復', CHORE, 9, 1]
  ]],
  ['木', [
    ['日程調整メールの往復', CHORE, 1, 1],
    ['面接', CORE, 2, 1],
    ['評価入力・社内共有', CHORE, 3, 1],
    ['スカウト作成・送信', CHORE, 5, 2],
    ['面接', CORE, 7, 1],
    ['面接メモの整理', CHORE, 8, 1],
    ['求人票の修正', CHORE, 9, 1]
  ]],
  ['金', [
    ['応募書類の確認', CHORE, 1, 1],
    ['リスケジュール対応', CHORE, 2, 1],
    ['面接', CORE, 3, 1],
    ['面接メモの整理', CHORE, 5, 1],
    ['評価入力・社内共有', CHORE, 6, 1],
    ['媒体別の数値集計', CHORE, 7, 1],
    ['スカウト作成・送信', CHORE, 8, 1],
    ['社内定例', CHORE, 9, 1]
  ]]
];

// 決定論的な擬似乱数（毎回同じ散り方にする）
function rnd(i) {
  const x = Math.sin((i + 1) * 12.9898) * 43758.5453;
  return x - Math.floor(x);
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

// 同じ週間予定表を4箇所に生成する（背骨：同じ表を3回見せて塗り替える）
// <div class="tl-grid" style="--rows:9">
//   <div class="tl-times"><span class="tl-time" style="--row:1;grid-row:2">9:00</span>…</div>
//   <div class="tl-day"><span class="tl-day-name" style="grid-row:1">月</span>
//     <div class="tl-block" data-kind="chore" style="--i:0;--row:1;--span:1;grid-row:2/span 1">社内定例</div>
function buildGrid(grid) {
  const frag = document.createDocumentFragment();
  const blocks = [];

  const times = document.createElement('div');
  times.className = 'tl-times';
  times.setAttribute('aria-hidden', 'true');
  // 1行目（曜日見出しの行）の高さを曜日列と揃えるためのスペーサー。
  // 同じクラスを使うので、見出しの余白や罫線をCSSでどう変えても行がズレない
  const head = document.createElement('span');
  head.className = 'tl-day-name tl-times-head';
  head.style.gridRow = '1';
  head.textContent = ' ';
  times.appendChild(head);
  for (let r = 0; r < HOURS.length; r++) {
    const s = document.createElement('span');
    s.className = 'tl-time';
    s.style.setProperty('--row', String(r + 1));
    s.style.gridRow = String(r + 2);
    s.textContent = HOURS[r];
    times.appendChild(s);
  }
  frag.appendChild(times);

  let i = 0;
  for (let d = 0; d < WEEK.length; d++) {
    const col = document.createElement('div');
    col.className = 'tl-day';
    const nm = document.createElement('span');
    nm.className = 'tl-day-name';
    nm.style.gridRow = '1';
    nm.textContent = WEEK[d][0];
    col.appendChild(nm);
    const tasks = WEEK[d][1];
    for (let t = 0; t < tasks.length; t++) {
      const task = tasks[t];
      const row = task[2];
      const span = task[3];
      const b = document.createElement('div');
      b.className = 'tl-block';
      b.dataset.kind = task[1];
      b.style.setProperty('--i', String(i));
      b.style.setProperty('--row', String(row));
      b.style.setProperty('--span', String(span));
      b.style.gridRow = (row + 1) + ' / span ' + span;
      b.textContent = task[0];
      b.nxKind = task[1];
      col.appendChild(b);
      blocks.push(b);
      i++;
    }
    frag.appendChild(col);
  }

  grid.style.setProperty('--rows', String(HOURS.length));
  grid.textContent = '';
  grid.appendChild(frag);
  return blocks;
}

/* ---------------- タイムライン（3枚） ---------------- */
// 状態クラス（.st-1/.st-2/.st-3）はHTML固定。色もCSSのみ（st-2/st-3 は雑務を強調・面接は白枠）。
// JSは表の生成と「入り」の演出、data-kind の付け外しだけを担当する。
//   ・st-2 / st-3 … 着地した瞬間に data-kind を付け直し、CSSの transition-delay:calc(var(--i)*20ms)
//                    で月曜の上から金曜の下へ塗り分けが波打つ
//   ・1枚目      … ブロックが1つずつ積まれ、予定表が埋まっていく

function setupTimeline(grids, gsap, still) {
  const entries = grids.map(function (grid, gi) {
    const blocks = buildGrid(grid);
    const slide = slideOf(grid);
    const paints = !!(slide && (slide.classList.contains('st-2') || slide.classList.contains('st-3')));
    return { grid: grid, blocks: blocks, slide: slide, paints: paints, stacks: gi === 0, tween: null };
  });

  if (still) return entries;

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

  // 塗り分けの波を「着地の瞬間」に見せるため、まだ表示されていない表は種別を伏せておく
  entries.forEach(function (e) {
    if (e.paints && e.slide && !e.slide.classList.contains('is-active')) armPaint(e);
  });

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

/* ---------------- #vision：雑務が中央のコアへ吸い込まれ、面接だけが残る ---------------- */

function setupVision(grid, gsap, still) {
  const blocks = buildGrid(grid);
  const sec = grid.closest('#vision') || slideOf(grid);
  if (!sec) return;
  const copy = sec.querySelector('.vision-copy');
  const days = Array.prototype.slice.call(grid.querySelectorAll('.tl-day'));

  // 残すのは面接（core）すべて。消えるのは雑務（chore）だけ。テキストは書き換えない。
  const cores = [];
  const chores = [];
  for (let i = 0; i < blocks.length; i++) {
    (blocks[i].nxKind === CORE ? cores : chores).push(blocks[i]);
  }
  if (!cores.length || !chores.length) return;

  function markCores(on) {
    for (let i = 0; i < cores.length; i++) cores[i].classList.toggle('is-final', on);
  }

  if (still) {
    for (let i = 0; i < chores.length; i++) chores[i].style.opacity = '0';
    markCores(true);
    if (copy) copy.classList.add('is-in');
    return;
  }

  // 旧 style.css の .tl-block transition と .tl-day backdrop-filter が残る場合の保険。
  // 前者はGSAPと二重掛けになり、後者は列ごとの stacking context で飛来ブロックを列の下に沈める
  for (let i = 0; i < blocks.length; i++) {
    blocks[i].style.transition = 'none';
    blocks[i].style.zIndex = '1';
  }
  for (let i = 0; i < days.length; i++) {
    days[i].style.backdropFilter = 'none';
    days[i].style.webkitBackdropFilter = 'none';
  }
  for (let i = 0; i < cores.length; i++) cores[i].style.zIndex = '2';

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
    markCores(false);
    if (copy) copy.classList.remove('is-in');
    played = false;
  }

  function play() {
    if (played) return;
    played = true;
    if (tl) tl.kill();
    gsap.set(blocks, { clearProps: 'transform,opacity' });
    markCores(false);
    if (copy) copy.classList.remove('is-in');

    tl = gsap.timeline();
    // 雑務は、ふわりと浮いてから中央のコアへ吸い込まれて消える（タイミングはバラバラ）
    for (let i = 0; i < chores.length; i++) {
      const el = chores[i];
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
    // 空いた予定表に、面接だけが残って光る
    tl.add(function () { markCores(true); }, 0.9);
    tl.fromTo(cores,
      { scale: 0.94 },
      { scale: 1, duration: 0.6, ease: 'power3.out', stagger: 0.05, clearProps: 'transform' }, 0.9);
    // 絵が決まってからコピーを出す（表は消さない）
    tl.add(function () { if (copy) copy.classList.add('is-in'); }, 1.7);
    tl.to({}, { duration: 0.01 }, 2);
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
