// timeline.js — 班C：採用ご担当者の業務別・週の時間内訳（同じリストを3回見せる）＋ #vision の消失
// 横フリックのスライドデッキ版。ScrollTrigger は使わない。deck.js の合図で発火する。
//   #tl-grid-1（st-1 素）/ #tl-grid-2（st-2 塗り分け）/ #tl-grid-3（st-3 数字）/ #vision-grid
//   合図： document 'nx:slide' { detail:{ index, slide } }
//
// 生成物（4箇所とも同じ）:
//   <ul class="tl-tasks">
//     <li class="tl-task" data-kind="chore" style="--i:0; --h:9">
//       <span class="tt-name">スカウト作成・送信</span>
//       <span class="tt-bar"></span>
//       <span class="tt-h num">9<small>時間</small></span>
//     </li> …9行、時間の多い順
//   </ul>
//   --h は週あたりの時間数（素の数値。バー長への変換はCSS側 / 最大9時間＝100%）
//   --i は上からの通し番号（0始まり。CSSの transition-delay 用）
//
// 依存：window.gsap（UMD先読み）。window.NX.reduce が true のときはアニメせず最終状態を即表示。

const CORE = 'core';
const CHORE = 'chore';

// 業務別・週あたりの時間 [業務名, 種別, 時間]
// 合計40時間（面接7時間 / 雑務33時間）。表示は時間の降順。
// ⚠ 実データ待ち。実在のご担当者へのヒアリングで確定する前提の想定値。
const TASKS = [
  ['スカウト作成・送信', CHORE, 9],
  ['面接', CORE, 7],
  ['日程調整メールの往復', CHORE, 6],
  ['応募書類の確認', CHORE, 5],
  ['面接メモの整理', CHORE, 4],
  ['評価入力・社内共有', CHORE, 3],
  ['媒体別の数値集計', CHORE, 3],
  ['求人票の修正', CHORE, 2],
  ['リスケジュール対応', CHORE, 1]
];

// 決定論的な擬似乱数（毎回同じ散り方にする）
function rnd(i) {
  const x = Math.sin((i + 1) * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function slideOf(el) {
  return el.closest('.slide') || el.closest('section') || null;
}

// 時間の多い順（同数は元の並びを維持）
function sortedTasks() {
  return TASKS.map(function (t, i) { return { t: t, i: i }; })
    .sort(function (a, b) { return (b.t[2] - a.t[2]) || (a.i - b.i); })
    .map(function (o) { return o.t; });
}

// 同じリストを4箇所に生成する（背骨：同じ内訳を3回見せて塗り替える）
function buildList(mount) {
  const list = document.createElement('ul');
  list.className = 'tl-tasks';
  const rows = [];
  const tasks = sortedTasks();

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    const li = document.createElement('li');
    li.className = 'tl-task';
    li.dataset.kind = task[1];
    li.style.setProperty('--i', String(i));
    li.style.setProperty('--h', String(task[2]));

    const name = document.createElement('span');
    name.className = 'tt-name';
    name.textContent = task[0];

    const bar = document.createElement('span');
    bar.className = 'tt-bar';
    bar.setAttribute('aria-hidden', 'true');

    const h = document.createElement('span');
    h.className = 'tt-h num';
    h.appendChild(document.createTextNode(String(task[2])));
    const unit = document.createElement('small');
    unit.textContent = '時間';
    h.appendChild(unit);

    li.appendChild(name);
    li.appendChild(bar);
    li.appendChild(h);
    list.appendChild(li);
    rows.push(li);
    li.nxKind = task[1];
    li.nxHours = task[2];
    li.nxBar = bar;
  }

  mount.style.removeProperty('--rows');
  mount.textContent = '';
  mount.appendChild(list);
  return rows;
}

/* ---------------- 3枚のリスト ---------------- */
// 状態クラス（.st-1/.st-2/.st-3）はHTML固定。色もCSSのみ（st-2/st-3 は雑務を強調・面接は白枠）。
// JSはリストの生成と、着地した瞬間の data-kind 付け直し（＝塗り分けを上から波打たせる）だけ。

function setupTimeline(mounts, gsap, still) {
  const entries = mounts.map(function (mount, gi) {
    const rows = buildList(mount);
    const slide = slideOf(mount);
    const paints = !!(slide && (slide.classList.contains('st-2') || slide.classList.contains('st-3')));
    return { mount: mount, rows: rows, slide: slide, paints: paints, intro: gi === 0, tween: null };
  });

  if (still) return entries;

  // 着地の瞬間に --h を0から戻す＝CSSの width transition（--i×70msの遅延）でバーが上から順に伸びる。
  // st-2/st-3 は data-kind も同時に付け直し、塗り分けを同じ波で走らせる。
  function armPaint(e) {
    for (let i = 0; i < e.rows.length; i++) {
      e.rows[i].style.setProperty('--h', '0');
      if (e.paints) e.rows[i].removeAttribute('data-kind');
    }
  }
  function playPaint(e) {
    for (let i = 0; i < e.rows.length; i++) {
      e.rows[i].style.setProperty('--h', String(e.rows[i].nxHours));
      if (e.paints) e.rows[i].dataset.kind = e.rows[i].nxKind;
    }
  }
  // 1枚目：行が上から順に置かれていく（バーが伸びる演出はCSS側の --i ディレイ）
  function playIntro(e) {
    if (e.tween) e.tween.kill();
    e.tween = gsap.fromTo(e.rows,
      { opacity: 0, y: 8 },
      {
        opacity: 1,
        y: 0,
        duration: 0.4,
        ease: 'power2.out',
        stagger: 0.05,
        clearProps: 'opacity,transform'
      });
  }

  // バーの伸びと塗り分けを「着地の瞬間」に見せるため、表示されていないリストは伏せておく
  entries.forEach(function (e) {
    if (e.slide && !e.slide.classList.contains('is-active')) armPaint(e);
  });

  function onSlide(slide) {
    entries.forEach(function (e) {
      if (!e.slide) return;
      if (e.slide === slide) {
        playPaint(e);
        if (e.intro) playIntro(e);
      } else {
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

/* ---------------- #vision：雑務の行が流れて消え、面接だけが残る ---------------- */

function setupVision(mount, gsap, still) {
  const rows = buildList(mount);
  const sec = mount.closest('#vision') || slideOf(mount);
  if (!sec) return;
  const copy = sec.querySelector('.vision-copy');

  // #vision には .st-1/.st-2/.st-3 が付かないため、CSSのバー表示ルール
  // （.st-1 .tt-bar 等）が当たらず width:0 のままになる。同じ式で幅を確定させる。
  // ⚠ css/deck.css に .vision-grid .tt-bar{width:calc(var(--h)/9*100%)} が入ればこの2行は不要
  for (let i = 0; i < rows.length; i++) rows[i].nxBar.style.width = 'calc(var(--h) / 9 * 100%)';

  const cores = [];
  const chores = [];
  for (let i = 0; i < rows.length; i++) {
    (rows[i].nxKind === CORE ? cores : chores).push(rows[i]);
  }
  if (!cores.length || !chores.length) return;

  function markCores(on) {
    for (let i = 0; i < cores.length; i++) cores[i].classList.toggle('is-final', on);
  }

  if (still) {
    // アニメせず「面接1行だけのリスト」を即表示（display:none で自然に上へ詰まる）
    for (let i = 0; i < chores.length; i++) chores[i].style.display = 'none';
    markCores(true);
    if (copy) copy.classList.add('is-in');
    return;
  }

  // 旧CSSの transition が残っていてもGSAPと二重掛けにならないようにする
  for (let i = 0; i < rows.length; i++) rows[i].style.transition = 'none';

  // 残る行が上に詰まる量（レイアウト座標なので transform の影響を受けない）
  function riseTo(el, targetIndex) {
    return rows[targetIndex].offsetTop - el.offsetTop;
  }

  let tl = null;
  let played = false;

  function reset() {
    if (tl) { tl.kill(); tl = null; }
    gsap.set(rows, { clearProps: 'transform,opacity' });
    markCores(false);
    if (copy) copy.classList.remove('is-in');
    played = false;
  }

  function play() {
    if (played) return;
    played = true;
    if (tl) tl.kill();
    gsap.set(rows, { clearProps: 'transform,opacity' });
    markCores(false);
    if (copy) copy.classList.remove('is-in');

    tl = gsap.timeline();
    // 雑務の行が右へ流れ、縮みながら消える（タイミングはバラバラ）
    for (let i = 0; i < chores.length; i++) {
      const el = chores[i];
      const at = 0.05 + rnd(i) * 0.5;
      tl.to(el, {
        x: 64,
        scale: 0.94,
        opacity: 0,
        duration: 0.55,
        ease: 'power2.out'
      }, at);
    }
    // 残った面接が上に詰まり、光る
    tl.to(cores, {
      y: function (i, el) { return riseTo(el, i); },
      duration: 0.7,
      ease: 'power3.out'
    }, 0.85);
    tl.add(function () { markCores(true); }, 1.05);
    // 絵が決まってからコピーを出す
    tl.add(function () { if (copy) copy.classList.add('is-in'); }, 1.6);
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
  const vMount = document.getElementById('vision-grid');
  const mounts = Array.prototype.slice.call(document.querySelectorAll('.tl-grid'))
    .filter(function (g) { return g !== vMount; });
  if (!mounts.length && !vMount) return;

  const gsap = window.gsap;
  const still = !!(window.NX && window.NX.reduce) || !gsap;

  if (mounts.length) setupTimeline(mounts, gsap, still);
  if (vMount) setupVision(vMount, gsap, still);
}
