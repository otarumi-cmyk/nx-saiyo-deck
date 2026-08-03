// js/fnanim.js — 班I：7機能の「秒でわかる」図解アニメーション
// 契約: 名前付きexport init() 1つのみ。引数なし・戻り値なし。担当外のDOMには触れない。
// 対象: index.html の .fn-fig[data-fn]（"01"〜"07"）。機能1つにつきスライド1枚（.fn-slide）。
//
// ── 7枚で統一した視覚言語 ────────────────────────────────────────────
//  ・キャンバス   作図は 200×100 の横長。表示は viewBox '0 -12.5 200 125' で
//                 上下に余白を足し、deck.css の .fn-fig（aspect-ratio:16/10）に
//                 レターボックスなしで収める
//  ・色の役割     シアン(--fna-ai)      = AIがやること・AIが作ったもの
//                 グレー(--fna-obj)     = 処理される対象（メモ・書類・テキスト・データ）
//                 淡い白(--fna-human)   = 人に戻す枠（03の「要確認」トレイだけ・破線）
//                 極薄の白(--fna-line)  = 器・目盛りなど動かない構造物
//                 ※黄・金・暖色は一切使わない
//  ・線           主役2.0 / 準主役1.6 / 細線1.0〜1.4、linecap=round、角丸 rx=2〜3
//  ・速度         1ループ 3.9秒。組み上がり〜1.6s / 見せ場〜2.7s / 保持 / 3.3sから0.45sでフェード
//  ・イージング   power2.out / power3.out / none のみ（bounce・elastic 禁止）
//  ・レイヤ       base = 動かない構造（常時表示）／anim = 変化する要素（ループ末にフェード）
//  ・静止時       DOMは「処理後の状態」で組み立ててある。アニメを走らせなければそれが静止画。
//                 → NX.reduce のときは timeline を一切作らないだけでよい
//
// 再生は「その図が載っているスライドがアクティブなときだけ」。着地したら頭から流す。
// （ScrollTrigger は使わない）

const NS = 'http://www.w3.org/2000/svg';

const VB_W = 200;
const VB_H = 100;
const VB_PAD = 12.5;  // 上下の余白（16:10の枠にぴたりと収めるため）

const LOOP = 3.9;      // 1ループの長さ（秒）
const OUT_AT = 3.3;    // ループ末のフェード開始
const OUT_DUR = 0.45;

// 色はすべて css/fnanim.css のロール変数を参照する（生のhexをJSに書かない）
const C = {
  ai: 'var(--fna-ai)',
  obj: 'var(--fna-obj)',
  objFill: 'var(--fna-obj-fill)',
  human: 'var(--fna-human)',
  line: 'var(--fna-line)',
  aiFill: 'var(--fna-ai-fill)',
};

/* ------------------------------------------------------------------ */
/* 小道具                                                              */
/* ------------------------------------------------------------------ */

function mk(tag, attrs) {
  const n = document.createElementNS(NS, tag);
  if (attrs) for (const k in attrs) n.setAttribute(k, String(attrs[k]));
  return n;
}

function add(parent, child) {
  parent.appendChild(child);
  return child;
}

function grp(parent) {
  return add(parent, mk('g', null));
}

function svgRoot() {
  const s = mk('svg', {
    viewBox: '0 ' + (-VB_PAD) + ' ' + VB_W + ' ' + (VB_H + VB_PAD * 2),
    preserveAspectRatio: 'xMidYMid meet',
    focusable: 'false',
  });
  s.setAttribute('aria-hidden', 'true');
  return s;
}

// 角丸長方形の実周長（stroke-dasharray の draw に使う）
function rectLen(w, h, r) {
  return 2 * (w - 2 * r) + 2 * (h - 2 * r) + 2 * Math.PI * r;
}

function polyLen(pts) {
  let L = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    L += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return L;
}

// ループ末の共通フェード（7枚で同じ呼吸にする）＋タイムライン長を揃える
function loopOut(tl, animG) {
  tl.set(animG, { opacity: 1 }, 0);
  tl.to(animG, { opacity: 0, duration: OUT_DUR, ease: 'power2.out' }, OUT_AT);
  tl.to(animG, { opacity: 0, duration: 0.01 }, LOOP - 0.01);
}

function newTl(gsap) {
  return gsap.timeline({ repeat: -1, paused: true, defaults: { ease: 'power2.out' } });
}

/* ================================================================== */
/* 01 自動応募要件の作成                                               */
/*    乱雑な短いメモ線 → 整った求人票のブロックに組み上がる             */
/* ================================================================== */

function build01(svg) {
  const base = grp(svg);
  const anim = grp(svg);

  // 左：散らかったメモ書き（常時表示＝「入力」）
  const scatter = [
    [8, 19, 42, 14], [16, 33, 54, 38], [6, 49, 36, 45],
    [20, 62, 58, 58], [10, 76, 40, 80], [26, 90, 60, 85],
  ];
  for (let i = 0; i < scatter.length; i++) {
    const s = scatter[i];
    add(base, mk('line', {
      x1: s[0], y1: s[1], x2: s[2], y2: s[3],
      stroke: C.obj, 'stroke-width': 2.4, 'stroke-linecap': 'round', opacity: 0.42,
    }));
  }

  // 右：求人票の器
  const DX = 104, DY = 12, DW = 88, DH = 80, DR = 3;
  add(base, mk('rect', {
    x: DX, y: DY, width: DW, height: DH, rx: DR,
    fill: 'none', stroke: C.line, 'stroke-width': 1.4,
  }));

  // 完成の合図：シアンの枠が一周描かれる
  const len = rectLen(DW, DH, DR);
  const hi = add(anim, mk('rect', {
    x: DX, y: DY, width: DW, height: DH, rx: DR,
    fill: 'none', stroke: C.ai, 'stroke-width': 1.8,
    'stroke-dasharray': len,
  }));

  // 見出し帯（AIが付ける）
  const head = add(anim, mk('rect', { x: 114, y: 24, width: 42, height: 6, rx: 3, fill: C.ai }));

  // 本文行＝散らかった線が整列したもの
  const rowW = [64, 54, 66, 46];
  const rowY = [42, 54, 66, 78];
  const from = [
    { x: -98, y: -9, r: 9, s: 0.42 },
    { x: -104, y: -5, r: -7, s: 0.36 },
    { x: -92, y: -4, r: 6, s: 0.48 },
    { x: -100, y: -2, r: -5, s: 0.34 },
  ];
  const rows = rowW.map(function (w, i) {
    return add(anim, mk('rect', { x: 114, y: rowY[i], width: w, height: 4, rx: 2, fill: C.obj }));
  });

  return function (gsap) {
    const tl = newTl(gsap);
    loopOut(tl, anim);

    tl.set(hi, { strokeDashoffset: len }, 0);
    tl.set(head, { scaleX: 0, svgOrigin: '114 27' }, 0);
    rows.forEach(function (r, i) {
      tl.set(r, {
        x: from[i].x, y: from[i].y, rotation: from[i].r, scaleX: from[i].s, opacity: 0.45,
        svgOrigin: (114 + rowW[i] / 2) + ' ' + (rowY[i] + 2),
      }, 0);
    });

    tl.to(hi, { strokeDashoffset: 0, duration: 1.05, ease: 'none' }, 0);
    rows.forEach(function (r, i) {
      tl.to(r, { x: 0, y: 0, rotation: 0, scaleX: 1, opacity: 1, duration: 0.8 }, 0.18 + i * 0.17);
    });
    tl.to(head, { scaleX: 1, duration: 0.45 }, 1.2);
    return tl;
  };
}

/* ================================================================== */
/* 02 AIスカウト                                                       */
/*    候補者3人 → それぞれ長さも形も違う文面が生成されて飛んでいく       */
/* ================================================================== */

function build02(svg) {
  const base = grp(svg);
  const anim = grp(svg);

  const ys = [22, 50, 78];
  const icons = ys.map(function (y) {
    const g = grp(base);
    g.setAttribute('opacity', '0.85');
    add(g, mk('circle', { cx: 22, cy: y - 7, r: 5.5, fill: 'none', stroke: C.obj, 'stroke-width': 2 }));
    add(g, mk('path', {
      d: 'M12 ' + (y + 8) + ' a10 9 0 0 1 20 0',
      fill: 'none', stroke: C.obj, 'stroke-width': 2, 'stroke-linecap': 'round',
    }));
    return g;
  });

  // 3通は「行数も横幅もカードの形も」わざと揃えない＝同じ文面を配っていないことを見せる
  const specs = [
    { x: 46, y: 9, w: 54, h: 24, lh: 2.8, lines: [[36, 14], [44, 19], [24, 24]] },
    { x: 46, y: 42, w: 76, h: 18, lh: 3.0, lines: [[64, 47], [46, 53]] },
    { x: 46, y: 66, w: 46, h: 30, lh: 2.8, lines: [[34, 71], [26, 77], [36, 83], [20, 89]] },
  ];

  const cards = specs.map(function (sp) {
    const g = grp(anim);
    add(g, mk('rect', {
      x: sp.x, y: sp.y, width: sp.w, height: sp.h, rx: 3,
      fill: C.aiFill, stroke: C.ai, 'stroke-width': 1.5,
    }));
    const lines = sp.lines.map(function (ln) {
      return add(g, mk('rect', {
        x: sp.x + 5, y: ln[1], width: ln[0], height: sp.lh, rx: sp.lh / 2, fill: C.ai,
      }));
    });
    return { g: g, sp: sp, lines: lines };
  });

  return function (gsap) {
    const tl = newTl(gsap);
    loopOut(tl, anim);

    cards.forEach(function (c, i) {
      const t = i * 0.42;
      const sp = c.sp;
      tl.set(c.g, {
        x: 0, scaleX: 0.06, scaleY: 0.5, opacity: 0,
        svgOrigin: sp.x + ' ' + (sp.y + sp.h / 2),
      }, 0);
      c.lines.forEach(function (ln, j) {
        tl.set(ln, { scaleX: 0, svgOrigin: (sp.x + 5) + ' ' + (sp.lines[j][1] + sp.lh / 2) }, 0);
      });
      tl.set(icons[i], { opacity: 0.4 }, 0);

      tl.to(icons[i], { opacity: 1, duration: 0.25 }, t);
      tl.to(c.g, { scaleX: 1, scaleY: 1, opacity: 1, duration: 0.42 }, t + 0.1);
      c.lines.forEach(function (ln, j) {
        tl.to(ln, { scaleX: 1, duration: 0.28 }, t + 0.4 + j * 0.09);
      });
      // 生成できたら送信＝右へ飛んでいく
      tl.to(c.g, { x: 100, opacity: 0, duration: 0.75, ease: 'none' }, t + 1.5);
      tl.to(icons[i], { opacity: 0.4, duration: 0.4 }, t + 1.6);
    });
    return tl;
  };
}

/* ================================================================== */
/* 03 AI書類選考                                                       */
/*    書類が落ちてきて3つのトレイへ自動で振り分け（中央=要確認・人に戻す）*/
/* ================================================================== */

function build03(svg) {
  const base = grp(svg);
  const anim = grp(svg);

  // 投入口
  add(base, mk('rect', { x: 86, y: 5, width: 28, height: 4, rx: 2, fill: C.obj, opacity: 0.35 }));

  // AIが判定する線
  const scan = add(base, mk('line', {
    x1: 10, y1: 48, x2: 190, y2: 48,
    stroke: C.ai, 'stroke-width': 1.3, 'stroke-dasharray': '4 5', opacity: 0.5,
  }));

  // トレイ3つ。中央だけ「要確認＝人に戻す枠」で破線＋淡い白
  const trays = [
    { x: 10, human: false },
    { x: 78, human: true },
    { x: 146, human: false },
  ];
  trays.forEach(function (t) {
    const a = {
      d: 'M' + t.x + ' 74 V92 H' + (t.x + 44) + ' V74',
      fill: 'none', 'stroke-width': 2, 'stroke-linejoin': 'round',
      stroke: t.human ? C.human : C.ai,
    };
    if (t.human) a['stroke-dasharray'] = '5 4';
    add(base, mk('path', a));
  });

  // 書類（グレー＝処理される対象）
  const SRC_X = 93, SRC_Y = 6;
  const dest = [17, 152, 92, 33, 168];
  const docs = dest.map(function (dx) {
    return add(anim, mk('rect', {
      x: dx, y: 71, width: 15, height: 19, rx: 2,
      fill: C.objFill, stroke: C.obj, 'stroke-width': 1.3,
    }));
  });

  return function (gsap) {
    const tl = newTl(gsap);
    loopOut(tl, anim);

    docs.forEach(function (d, i) {
      const t = i * 0.42;
      tl.set(d, { x: SRC_X - dest[i], y: SRC_Y - 71, opacity: 0 }, 0);
      tl.to(d, { opacity: 1, duration: 0.18, ease: 'none' }, t);
      tl.to(d, { y: 44 - 71, duration: 0.42, ease: 'none' }, t);   // まっすぐ落ちる
      tl.to(d, { x: 0, y: 0, duration: 0.55 }, t + 0.42);           // 判定線で行き先が決まる
      // ⚠ fromTo は既定で immediateRender:true。切っておかないと t=0 から
      //    「from」の値が焼き付いてしまう（判定線が最初から光ってしまう）
      tl.fromTo(scan, { opacity: 0.5 },
        { opacity: 1, duration: 0.18, yoyo: true, repeat: 1, ease: 'none', immediateRender: false }, t + 0.36);
    });
    return tl;
  };
}

/* ================================================================== */
/* 04 適性検査                                                         */
/*    レーダーの多角形が描かれ、その横に質問の線が3本出てくる            */
/* ================================================================== */

function build04(svg) {
  const base = grp(svg);
  const anim = grp(svg);

  const CX = 56, CY = 50, R = 34, N = 5;
  function pt(i, k) {
    const a = (-90 + i * (360 / N)) * Math.PI / 180;
    return [CX + R * k * Math.cos(a), CY + R * k * Math.sin(a)];
  }
  function ringPts(k) {
    const p = [];
    for (let i = 0; i < N; i++) p.push(pt(i, k));
    return p;
  }
  function str(p) {
    return p.map(function (q) { return q[0].toFixed(1) + ',' + q[1].toFixed(1); }).join(' ');
  }

  add(base, mk('polygon', { points: str(ringPts(1)), fill: 'none', stroke: C.line, 'stroke-width': 1 }));
  add(base, mk('polygon', { points: str(ringPts(0.58)), fill: 'none', stroke: C.line, 'stroke-width': 0.8 }));
  ringPts(1).forEach(function (q) {
    add(base, mk('line', { x1: CX, y1: CY, x2: q[0], y2: q[1], stroke: C.line, 'stroke-width': 0.8 }));
  });

  const vals = [0.92, 0.56, 0.86, 0.6, 0.78];
  const shape = vals.map(function (v, i) { return pt(i, v); });
  const plen = polyLen(shape);
  const poly = add(anim, mk('polygon', {
    points: str(shape),
    fill: C.ai, 'fill-opacity': 0.16,
    stroke: C.ai, 'stroke-width': 2, 'stroke-linejoin': 'round',
    'stroke-dasharray': plen,
  }));

  // 右：設問（グレーの短い線）＋回答済みのチェック（シアン）
  const qy = [26, 50, 74];
  const qw = [58, 44, 64];
  const qs = qy.map(function (y, i) {
    const g = grp(anim);
    add(g, mk('rect', { x: 104, y: y - 5, width: 10, height: 10, rx: 2, fill: 'none', stroke: C.line, 'stroke-width': 1.4 }));
    add(g, mk('rect', { x: 120, y: y - 2, width: qw[i], height: 3.6, rx: 1.8, fill: C.obj }));
    const chk = add(g, mk('rect', { x: 106.5, y: y - 2.5, width: 5, height: 5, rx: 1.2, fill: C.ai }));
    return { g: g, chk: chk, org: '109 ' + y };
  });

  return function (gsap) {
    const tl = newTl(gsap);
    loopOut(tl, anim);

    tl.set(poly, { strokeDashoffset: plen, fillOpacity: 0 }, 0);
    qs.forEach(function (q) {
      tl.set(q.g, { x: -16, opacity: 0 }, 0);
      tl.set(q.chk, { scale: 0, svgOrigin: q.org }, 0);
    });

    tl.to(poly, { strokeDashoffset: 0, duration: 1.0, ease: 'none' }, 0.05);
    tl.to(poly, { fillOpacity: 0.16, duration: 0.5 }, 0.8);
    qs.forEach(function (q, i) {
      tl.to(q.g, { x: 0, opacity: 1, duration: 0.5 }, 0.85 + i * 0.2);
      tl.to(q.chk, { scale: 1, duration: 0.3, ease: 'power3.out' }, 1.2 + i * 0.2);
    });
    return tl;
  };
}

/* ================================================================== */
/* 05 AI日程調整（半自動）                                             */
/*    2つのカレンダー格子が重なり、両方空いているマスが1つ光って確定     */
/* ================================================================== */

function build05(svg) {
  const anim = grp(svg); // 格子ごと動くので全部 anim 側

  const GX = 54, GY = 18, CW = 20, CH = 19, PX = 24, PY = 23;
  function cell(i) {
    return [GX + (i % 4) * PX, GY + Math.floor(i / 4) * PY];
  }

  // 埋まっているマスは少なめに置く。詰め込むと「格子がグレーで塗り潰れた絵」になり、
  // 空きマスが1つ光る、という主役の動きが読めなくなる。
  const busyA = { 0: 1, 3: 1, 5: 1, 10: 1 };
  const busyB = { 1: 1, 6: 1, 7: 1, 11: 1 };
  const HIT = 8; // 両方空いているマスのうち、AIが確定させた1コマ

  function makeGrid(busy, inset, lineOp) {
    const g = grp(anim);
    for (let i = 0; i < 12; i++) {
      const p = cell(i);
      add(g, mk('rect', {
        x: p[0], y: p[1], width: CW, height: CH, rx: 2,
        fill: 'none', stroke: C.line, 'stroke-width': 1, opacity: lineOp,
      }));
      if (busy[i]) {
        add(g, mk('rect', {
          x: p[0] + inset, y: p[1] + inset,
          width: CW - inset * 2, height: CH - inset * 2,
          rx: 2, fill: C.obj, opacity: 0.55,
        }));
      }
    }
    return g;
  }

  const gA = makeGrid(busyA, 0, 1);      // 自社の予定（マス全面）
  const gB = makeGrid(busyB, 3.5, 0.5);  // 候補者の予定（ひと回り小さく＝別レイヤーと分かる）

  const hp = cell(HIT);
  const hi = add(anim, mk('rect', { x: hp[0], y: hp[1], width: CW, height: CH, rx: 2, fill: C.ai }));
  const ring = add(anim, mk('rect', {
    x: hp[0] - 4, y: hp[1] - 4, width: CW + 8, height: CH + 8, rx: 4,
    fill: 'none', stroke: C.ai, 'stroke-width': 1.6, opacity: 0,
  }));
  const org = (hp[0] + CW / 2) + ' ' + (hp[1] + CH / 2);

  return function (gsap) {
    const tl = newTl(gsap);
    loopOut(tl, anim);

    // 上下にもずらして寄せる＝「2枚ある」ことが動きだけで分かるように
    tl.set(gA, { x: -46, y: -9, opacity: 0 }, 0);
    tl.set(gB, { x: 46, y: 9, opacity: 0 }, 0);
    tl.set(hi, { opacity: 0, scale: 0.35, svgOrigin: org }, 0);
    tl.set(ring, { opacity: 0, scale: 0.7, svgOrigin: org }, 0);

    tl.to([gA, gB], { opacity: 1, duration: 0.45, ease: 'none' }, 0);
    tl.to(gA, { x: 0, y: 0, duration: 1.05 }, 0.15);
    tl.to(gB, { x: 0, y: 0, duration: 1.05 }, 0.15);
    tl.to(hi, { opacity: 1, scale: 1, duration: 0.5, ease: 'power3.out' }, 1.35);
    tl.fromTo(ring, { opacity: 0.9, scale: 0.75 },
      { opacity: 0, scale: 1.55, duration: 1.0, ease: 'power2.out', immediateRender: false }, 1.5);
    return tl;
  };
}

/* ================================================================== */
/* 06 AI面接文字起こし                                                 */
/*    音声波形 → テキスト行が流れる → 要約カードに畳まれる              */
/* ================================================================== */

function build06(svg) {
  const anim = grp(svg);

  // 左：波形（シアン＝AIが聴いている）
  const hs = [10, 20, 32, 16, 40, 24, 34, 14, 22];
  const alt = [0.5, 1.3, 0.6, 1.35, 0.55, 1.25, 0.7, 1.4, 0.8];
  const bars = hs.map(function (h, i) {
    const x = 8 + i * 5.5;
    return add(anim, mk('rect', { x: x, y: 50 - h / 2, width: 3.4, height: h, rx: 1.7, fill: C.ai }));
  });

  // 中：文字起こしの行（グレー＝出てきたテキスト）
  const tw = [64, 52, 66, 44];
  const ty = [30, 42, 54, 66];
  const lines = tw.map(function (w, i) {
    return add(anim, mk('rect', { x: 68, y: ty[i], width: w, height: 3.6, rx: 1.8, fill: C.obj }));
  });

  // 右：要約カード（シアン＝AIの成果物）
  const card = grp(anim);
  add(card, mk('rect', {
    x: 146, y: 30, width: 46, height: 40, rx: 3,
    fill: C.aiFill, stroke: C.ai, 'stroke-width': 1.6,
  }));
  const cw = [32, 24];
  const cy = [44, 53];
  const cls = cw.map(function (w, i) {
    return add(card, mk('rect', { x: 153, y: cy[i], width: w, height: 3, rx: 1.5, fill: C.ai }));
  });

  return function (gsap) {
    const tl = newTl(gsap);
    loopOut(tl, anim);

    bars.forEach(function (b, i) {
      tl.set(b, { scaleY: 0, svgOrigin: (8 + i * 5.5 + 1.7) + ' 50' }, 0);
    });
    lines.forEach(function (l, i) {
      tl.set(l, { x: 0, scaleX: 0, opacity: 0, svgOrigin: '68 ' + (ty[i] + 1.8) }, 0);
    });
    tl.set(card, { scale: 0.6, opacity: 0, svgOrigin: '169 50' }, 0);
    cls.forEach(function (l, i) {
      tl.set(l, { scaleX: 0, svgOrigin: '153 ' + (cy[i] + 1.5) }, 0);
    });

    // 声が入る
    bars.forEach(function (b, i) {
      tl.to(b, { scaleY: 1, duration: 0.3 }, i * 0.045);
      tl.to(b, { scaleY: alt[i], duration: 0.45, ease: 'none' }, 0.75 + i * 0.02);
    });
    // 文字になって流れる
    lines.forEach(function (l, i) {
      tl.to(l, { scaleX: 1, opacity: 1, duration: 0.4 }, 0.8 + i * 0.16);
    });
    // 要約へ畳まれる。完全に消すと中央が空洞になって「波形とカードだけ」の絵になるので、
    // 縮んで中央へ寄った痕跡を残し、左→右のパイプラインが止め絵でも読めるようにする。
    lines.forEach(function (l, i) {
      tl.to(l, {
        x: 26, y: (46 + i * 2.6) - ty[i], scaleX: 0.42, opacity: 0.3, duration: 0.6,
      }, 1.85 + i * 0.06);
    });
    tl.to(card, { scale: 1, opacity: 1, duration: 0.5, ease: 'power3.out' }, 2.05);
    cls.forEach(function (l, i) {
      tl.to(l, { scaleX: 1, duration: 0.3 }, 2.4 + i * 0.14);
    });
    return tl;
  };
}

/* ================================================================== */
/* 07 AI採用分析ツール                                                 */
/*    ファネルの段が積み上がり、詰まっている段だけが光る                 */
/* ================================================================== */

function build07(svg) {
  const base = grp(svg);
  const anim = grp(svg);

  const ws = [170, 128, 58, 44];
  const ys = [12, 33, 54, 75];
  const BH = 15;
  const HOT = 2; // 直前の段からの落ち込みが最大＝詰まっている段

  // ファネルの当たり（動かない構造）
  const x0 = 100 - ws[0] / 2;
  const xn = 100 - ws[3] / 2;
  add(base, mk('line', { x1: x0, y1: ys[0], x2: xn, y2: ys[3] + BH, stroke: C.line, 'stroke-width': 1 }));
  add(base, mk('line', { x1: 200 - x0, y1: ys[0], x2: 200 - xn, y2: ys[3] + BH, stroke: C.line, 'stroke-width': 1 }));

  const bars = ws.map(function (w, i) {
    return add(anim, mk('rect', {
      x: 100 - w / 2, y: ys[i], width: w, height: BH, rx: 2, fill: C.obj, opacity: 0.65,
    }));
  });

  const hot = add(anim, mk('rect', {
    x: 100 - ws[HOT] / 2, y: ys[HOT], width: ws[HOT], height: BH, rx: 2, fill: C.ai,
  }));
  const ring = add(anim, mk('rect', {
    x: 100 - ws[HOT] / 2 - 6, y: ys[HOT] - 5, width: ws[HOT] + 12, height: BH + 10, rx: 4,
    fill: 'none', stroke: C.ai, 'stroke-width': 1.5, opacity: 0,
  }));
  const org = '100 ' + (ys[HOT] + BH / 2);

  return function (gsap) {
    const tl = newTl(gsap);
    loopOut(tl, anim);

    bars.forEach(function (b, i) {
      tl.set(b, { scaleX: 0, svgOrigin: '100 ' + (ys[i] + BH / 2) }, 0);
    });
    tl.set(hot, { opacity: 0, scaleX: 1, svgOrigin: org }, 0);
    tl.set(ring, { opacity: 0, scale: 0.9, svgOrigin: org }, 0);

    bars.forEach(function (b, i) {
      tl.to(b, { scaleX: 1, duration: 0.55 }, i * 0.19);
    });
    tl.to(hot, { opacity: 1, duration: 0.4 }, 1.2);
    tl.fromTo(ring, { opacity: 0.85, scale: 0.9 },
      { opacity: 0, scale: 1.28, duration: 0.95, ease: 'power2.out', repeat: 1, immediateRender: false }, 1.4);
    return tl;
  };
}

/* ------------------------------------------------------------------ */
/* 起動                                                                */
/* ------------------------------------------------------------------ */

const BUILD = {
  '01': build01, '02': build02, '03': build03, '04': build04,
  '05': build05, '06': build06, '07': build07,
};

let booted = false;

export function init() {
  if (booted) return;
  booted = true;

  const figs = Array.prototype.slice.call(document.querySelectorAll('.fn-fig[data-fn]'));
  if (!figs.length) return; // 対象が無ければ何もしない

  const gsap = window.gsap || null;
  const reduce = isReduce();
  const items = [];

  for (let i = 0; i < figs.length; i++) {
    const fig = figs[i];
    if (fig.querySelector('svg')) continue; // 二重生成しない

    const key = fig.getAttribute('data-fn');
    const build = BUILD[key];
    if (!build) continue;

    const svg = svgRoot();
    let make = null;
    try {
      make = build(svg);
    } catch (e) {
      console.error('[NX fnanim] build failed:', key, e);
      continue;
    }
    fig.appendChild(svg);
    fig.classList.add('is-ready');

    // reduce のときは組み上げたまま＝「処理後の状態」を静止表示して終わり
    if (reduce || !gsap) continue;

    try {
      const tl = make(gsap);
      tl.pause(0);
      items.push({
        tl: tl,
        slide: fig.closest ? fig.closest('.slide') : null,
        on: false,
        vis: false,
      });
    } catch (e) {
      console.error('[NX fnanim] timeline failed:', key, e);
    }
  }

  if (!items.length) return;

  // ---- その図のスライドがアクティブなときだけ回す ----
  let activeSlide = null;   // null = デッキからの合図をまだ受けていない
  let heard = false;

  // デッキがあるときは「アクティブなスライドか」が正本（＝それ自体が画面に居る証拠）。
  // デッキが無いページでは IntersectionObserver の可視判定で代用する。
  function want(it) {
    if (document.hidden) return false;
    if (heard) return !!(it.slide && it.slide === activeSlide);
    return it.vis;
  }

  function apply() {
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const w = want(it);
      if (w === it.on) continue;
      it.on = w;
      if (w) it.tl.play(0); else it.tl.pause();  // 着地したら毎回、頭から見せる
    }
  }

  document.addEventListener('nx:slide', function (e) {
    heard = true;
    activeSlide = (e.detail && e.detail.slide) || null;
    apply();
  });

  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(function (entries) {
      for (let i = 0; i < entries.length; i++) {
        for (let j = 0; j < items.length; j++) {
          if (items[j].slide === entries[i].target) items[j].vis = entries[i].isIntersecting;
        }
      }
      apply();
    }, { threshold: 0.05 });
    items.forEach(function (it) { if (it.slide) io.observe(it.slide); else it.vis = true; });
  } else {
    items.forEach(function (it) { it.vis = true; });
  }

  document.addEventListener('visibilitychange', apply);
  apply();
}

function isReduce() {
  if (window.NX && window.NX.reduce) return true;
  return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}
