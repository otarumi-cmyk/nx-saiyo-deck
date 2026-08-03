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
// #vision-grid だけは別構造（やることが次々出て、バツで消える）:
//   <div class="vx-field">
//     <span class="vx-chip" data-kind="chore" style="--i:0; --x:23.5%; --y:16.3%; --r:-2.4deg">
//       <span class="vx-label">スカウト作成・送信</span>
//       <span class="vx-x"><i></i><i></i></span>   ← バツの2本線。GSAPが scaleX 0→1 で引く
//     </span> …雑務23枚＋ data-kind="core" の「面接」1枚（--x:50% --y:50%）
//   </div>
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

/* ---------------- #vision：やることがバババッと出て、バツで消え、面接だけが残る ---------------- */

// 散らばるチップ [業務名, 枚数]。合計23枚＋「面接」1枚＝24枚
const CHIPS = [
  ['スカウト作成・送信', 5],
  ['日程調整メールの往復', 4],
  ['応募書類の確認', 3],
  ['面接メモの整理', 3],
  ['評価入力・社内共有', 2],
  ['媒体別の数値集計', 2],
  ['求人票の修正', 2],
  ['リスケジュール対応', 2]
];

const FIELD_COLS = 4;
const FIELD_ROWS = 6;

// 同じ名前が連続しないよう、ラウンドロビンで並べる
function chipNames() {
  const left = CHIPS.map(function (c) { return { name: c[0], n: c[1] }; });
  const out = [];
  let any = true;
  while (any) {
    any = false;
    for (let i = 0; i < left.length; i++) {
      if (left[i].n > 0) { out.push(left[i].name); left[i].n--; any = true; }
    }
  }
  return out;
}

// 格子＋ゆらぎで散らす（決定論的）。cellOrder はポップする順番のばらけ用
function scatter(n) {
  const cells = [];
  for (let r = 0; r < FIELD_ROWS; r++) {
    for (let c = 0; c < FIELD_COLS; c++) cells.push([c, r]);
  }
  cells.sort(function (a, b) {
    return rnd(a[1] * FIELD_COLS + a[0]) - rnd(b[1] * FIELD_COLS + b[0]);
  });
  const out = [];
  for (let i = 0; i < n; i++) {
    const cell = cells[i % cells.length];
    const x = 11 + (cell[0] + 0.5) * (78 / FIELD_COLS) + (rnd(i * 2 + 1) * 12 - 6);
    const y = 9 + (cell[1] + 0.5) * (82 / FIELD_ROWS) + (rnd(i * 2 + 2) * 9 - 4.5);
    out.push({ x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, r: Math.round((rnd(i + 7) * 8 - 4) * 10) / 10 });
  }
  return out;
}

function buildChip(label, kind, i, pos) {
  const chip = document.createElement('span');
  chip.className = 'vx-chip';
  chip.dataset.kind = kind;
  chip.style.setProperty('--i', String(i));
  chip.style.setProperty('--x', pos.x + '%');
  chip.style.setProperty('--y', pos.y + '%');
  chip.style.setProperty('--r', pos.r + 'deg');

  const text = document.createElement('span');
  text.className = 'vx-label';
  text.textContent = label;
  chip.appendChild(text);

  const x = document.createElement('span');
  x.className = 'vx-x';
  x.setAttribute('aria-hidden', 'true');
  const s1 = document.createElement('i');
  const s2 = document.createElement('i');
  x.appendChild(s1);
  x.appendChild(s2);
  chip.appendChild(x);

  chip.nxStrokes = [s1, s2];
  chip.nxKind = kind;
  chip.nxX = pos.x;
  chip.nxY = pos.y;
  return chip;
}

function setupVision(mount, gsap, still) {
  const sec = mount.closest('#vision') || slideOf(mount);
  if (!sec) return;
  const copy = sec.querySelector('.vision-copy');

  const field = document.createElement('div');
  field.className = 'vx-field';

  const names = chipNames();
  const pos = scatter(names.length);
  const chores = [];
  for (let i = 0; i < names.length; i++) {
    const chip = buildChip(names[i], CHORE, i, pos[i]);
    field.appendChild(chip);
    chores.push(chip);
  }
  // 「面接」は中央。最後まで残って光る
  const core = buildChip('面接', CORE, names.length, { x: 50, y: 50, r: 0 });
  field.appendChild(core);
  const chips = chores.concat([core]);

  mount.textContent = '';
  mount.appendChild(field);

  // CSSがまだ当たっていない場合だけ、最低限の配置をインラインで補う（CSS適用後は何もしない）
  // ※ 中央寄せと傾きは transform で当てる（後述の baseState）。CSSの translate/rotate は
  //   GSAPが transform に畳み込んで消してしまうため使わない
  const fallback = getComputedStyle(chips[0]).position !== 'absolute';
  if (fallback) {
    field.style.position = 'relative';
    for (let i = 0; i < chips.length; i++) {
      const c = chips[i];
      c.style.position = 'absolute';
      c.style.whiteSpace = 'nowrap';
    }
  }
  if (field.offsetHeight < 120) field.style.minHeight = 'min(56vh, 460px)';

  // チップが舞台からはみ出さないよう、実寸を見て配置を内側に丸める（SPで効く）
  function clampPositions() {
    const fw = field.offsetWidth || 1;
    const fh = field.offsetHeight || 1;
    for (let i = 0; i < chips.length; i++) {
      const c = chips[i];
      const bx = Math.min(49, (c.offsetWidth / 2) / fw * 100 + 1);
      const by = Math.min(49, (c.offsetHeight / 2) / fh * 100 + 1);
      const x = Math.round(Math.min(100 - bx, Math.max(bx, c.nxX)) * 10) / 10;
      const y = Math.round(Math.min(100 - by, Math.max(by, c.nxY)) * 10) / 10;
      c.style.setProperty('--x', x + '%');
      c.style.setProperty('--y', y + '%');
      if (fallback) { c.style.left = x + '%'; c.style.top = y + '%'; }
    }
  }
  clampPositions();

  function markCore(on) {
    core.classList.toggle('is-final', on);
  }

  if (still) {
    for (let i = 0; i < chores.length; i++) chores[i].style.display = 'none';
    markCore(true);
    if (copy) copy.classList.add('is-in');
    return;
  }

  const strokesA = [];
  const strokesB = [];
  const strokes = [];
  for (let i = 0; i < chips.length; i++) {
    strokesA.push(chips[i].nxStrokes[0]);
    strokesB.push(chips[i].nxStrokes[1]);
    strokes.push(chips[i].nxStrokes[0], chips[i].nxStrokes[1]);
  }

  // 中央寄せ・傾き・バツの角度は transform（GSAP）が持つ。CSS側は left/top だけでよい
  function baseState() {
    gsap.set(chips, {
      xPercent: -50,
      yPercent: -50,
      rotation: function (i, el) { return parseFloat(el.style.getPropertyValue('--r')) || 0; }
    });
    gsap.set(strokesA, { xPercent: -50, yPercent: -50, rotation: 45 });
    gsap.set(strokesB, { xPercent: -50, yPercent: -50, rotation: -45 });
  }

  function clear() {
    baseState();
    gsap.set(chips, { opacity: 0, scale: 0.86 });
    gsap.set(strokes, { scaleX: 0 });
    markCore(false);
    if (copy) copy.classList.remove('is-in');
  }

  let tl = null;
  let played = false;
  clear();

  function reset() {
    if (tl) { tl.kill(); tl = null; }
    clear();
    played = false;
  }

  function play() {
    if (played) return;
    played = true;
    if (tl) tl.kill();
    clampPositions();
    clear();

    tl = gsap.timeline();

    // フェーズ1：バババッと出る（1枚50ms間隔・重なって画面が埋まる）
    const POP = 0.05;
    const coreAt = Math.floor(chores.length * 0.45);
    let t = 0.02;
    for (let i = 0; i < chores.length; i++) {
      if (i === coreAt) {
        tl.to(core, { opacity: 1, scale: 1, duration: 0.3, ease: 'power3.out' }, t);
        t += POP;
      }
      tl.to(chores[i], { opacity: 1, scale: 1, duration: 0.28, ease: 'power3.out' }, t);
      t += POP;
    }
    const popEnd = t + 0.28;

    // フェーズ2：バツが引かれて、そのまま消える（順番はバラバラ）
    const order = chores.map(function (el, i) { return i; })
      .sort(function (a, b) { return rnd(a * 3 + 1) - rnd(b * 3 + 1); });
    const XSTEP = 0.05;
    const x0 = popEnd + 0.12;
    for (let k = 0; k < order.length; k++) {
      const el = chores[order[k]];
      const at = x0 + k * XSTEP;
      tl.fromTo(el.nxStrokes, { scaleX: 0 }, { scaleX: 1, duration: 0.16, ease: 'power2.out' }, at);
      tl.to(el, { opacity: 0, scale: 0.9, duration: 0.26, ease: 'power2.out' }, at + 0.16);
    }
    const xEnd = x0 + (order.length - 1) * XSTEP + 0.42;

    // フェーズ3：面接だけが中央に残って光る → コピー
    tl.add(function () { markCore(true); }, xEnd);
    tl.to(core, { scale: 1.24, duration: 0.6, ease: 'power3.out' }, xEnd);
    tl.add(function () { if (copy) copy.classList.add('is-in'); }, xEnd + 0.45);
    tl.to({}, { duration: 0.01 }, xEnd + 0.8);
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
