// fnscene.js — 7機能のライブ図解
// ------------------------------------------------------------------
// もとは Remotion で書き出した mp4 を7枚とも同じ構図で貼っていたため、
// 「7つ同じに見える／動きがない」状態だった。
// ここでは7本それぞれに別の“動きの軸”を与える:
//   01 流し込み（左→右）／02 分岐（1→3）／03 仕分け（落下→左右）
//   04 描画（中心→外）／05 重ね合わせ（3枚→1枚）／06 走査（横断）
//   07 積み上げ（上→下に絞る）
// DOMは実行時に .fn-video の中へ差し込むので index.html は触らない。
// 司令塔が管理。班は編集しない。
// ------------------------------------------------------------------

const NS = 'http://www.w3.org/2000/svg';

function el(tag, cls, html) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
}
function svg(tag, attrs) {
  const n = document.createElementNS(NS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  return n;
}

/* ---------- 01 自動応募要件の作成：走り書き4行から、要件書9項目が起きる ----------
   「メモを言い換えただけ」に見えると製品として弱いので、
   メモに無い項目（MUST/WANT の分解・除外条件・ターゲット企業・訴求の根拠）を
   AIが足していることを、印で明示する。 */
function scene01(root) {
  root.classList.add('fs', 'fs-01');
  root.appendChild(el('div', 'fs-note', `
    <span class="fs-note-h">担当者の走り書き（4行）</span>
    <p class="fs-line" data-i="0">営業／東京</p>
    <p class="fs-line" data-i="1">年収 500〜700</p>
    <p class="fs-line" data-i="2">未経験も可</p>
    <p class="fs-line" data-i="3">早く決めたい</p>
    <span class="fs-note-f">これだけ渡せば足ります</span>`));
  root.appendChild(el('div', 'fs-flow', '<i></i><i></i><i></i>'));

  const F = [
    ['ポジション', 'SaaS フィールドセールス（東京・中途）', 0],
    ['ミッション', '商談化率を保ったまま、新規の初回接点を2倍にする', 1],
    ['MUST', '法人向け無形商材の新規開拓 2年以上／商談〜受注を一気通貫', 1],
    ['WANT', 'SaaS・IT 業界／インサイドセールスとの協業経験', 1],
    ['除外条件', '個人営業のみ・代理店販売のみの経験', 1],
    ['想定ターゲット', '人材・広告・SaaSの営業（26〜33歳／年収450〜650万）', 1],
    ['報酬レンジ', '年収 500〜700万円（市場中央値 +8%）', 0],
    ['訴求', '裁量の大きさ／意思決定の速さ／立ち上げフェーズ', 1],
    ['選考スピード', '書類2営業日・面接2回・最短12日で内定', 0],
  ];
  const sheet = el('div', 'fs-sheet');
  sheet.appendChild(el('span', 'fs-sheet-h', '応募要件（自動生成）<em>9項目</em>'));
  F.forEach(([k, v, added], i) => {
    const row = el('div', 'fs-field' + (added ? ' is-add' : ''));
    row.dataset.i = i;
    row.innerHTML = `<b>${k}</b><span>${v}</span>` + (added ? '<i class="fs-add">AIが補完</i>' : '');
    sheet.appendChild(row);
  });
  root.appendChild(sheet);
  return (gsap) => {
    const tl = gsap.timeline({ repeat: -1, repeatDelay: 0 });
    const lines = root.querySelectorAll('.fs-line');
    const fields = root.querySelectorAll('.fs-field');
    const flow = root.querySelectorAll('.fs-flow i');
    tl.fromTo(root.querySelectorAll('.fs-note, .fs-sheet'), { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: .45, stagger: .1 });
    lines.forEach((l, i) => {
      tl.fromTo(l, { opacity: 0, x: -12 }, { opacity: 1, x: 0, duration: .28 }, .45 + i * 0.24);
    });
    tl.to(flow, { opacity: 1, duration: .16, stagger: .06 }, 1.35)
      .to(flow, { opacity: .18, duration: .16, stagger: .06 }, '>-.04');
    fields.forEach((f, i) => {
      tl.fromTo(f, { opacity: 0, x: 18 }, { opacity: 1, x: 0, duration: .3 }, 1.45 + i * 0.17);
    });
    tl.fromTo(root.querySelectorAll('.fs-add'), { opacity: 0, scale: .7 },
      { opacity: 1, scale: 1, duration: .3, stagger: .08 }, 3.1);
    tl.addLabel("done");
    tl.to({}, { duration: 4.8 });
    tl.to(root.querySelectorAll('.fs-line, .fs-field'), { opacity: 0, duration: 0.22 });
    return tl;
  };
}

/* ---------- 02 AIスカウト：経歴の事実 → 選んだ訴求 → 実際に送る1通 ----------
   訴求と理由と一節を同じ箱に詰めると読めないので、
   左に「何を根拠に何を選んだか」、右に「その結果できあがった文面」を置く。 */
function scene02(root) {
  root.classList.add('fs', 'fs-02');

  const left = el('div', 'fs-left');
  left.appendChild(el('div', 'fs-cand', `
    <span class="fs-cand-h">職務経歴書から抽出</span>
    <p class="fs-fact">20名のチームリード（2024〜）</p>
    <p class="fs-fact">年間120社・達成率 128%</p>
    <p class="fs-fact">SaaS インサイドセールス 3年</p>`));

  const PICK = [
    ['裁量の大きさ', '現職はプレイヤー兼務のため'],
    ['再現性の言語化', '個人成績は十分。次は型化フェーズ'],
    ['事業フェーズ', 'IS専任3年で 0→1 の経験が薄い'],
  ];
  const pw = el('div', 'fs-picks');
  pw.appendChild(el('span', 'fs-picks-h', '選んだ訴求'));
  PICK.forEach(([k, why], i) => {
    const r = el('div', 'fs-pick');
    r.dataset.i = i;
    r.innerHTML = `<b>${k}</b><span>${why}</span>`;
    pw.appendChild(r);
  });
  left.appendChild(pw);
  root.appendChild(left);

  // 右：できあがったスカウト文面そのもの
  const mail = el('div', 'fs-mail');
  mail.innerHTML = `
    <div class="fs-mail-h"><span>生成されたスカウト文面</span><em>自動</em></div>
    <p class="fs-subj">20名のマネジメント経験を、事業ごとお任せしたい</p>
    <div class="fs-mailbody">
      <p>〇〇様</p>
      <p>はじめまして。株式会社NEXTの採用担当です。</p>
      <p class="fs-hi" data-i="1">SaaSのインサイドセールスとして年間120社・目標達成率128％という実績を残しながら、20名規模のチームを率いてこられたご経歴を拝見し、ぜひ一度お話ししたくご連絡しました。</p>
      <p>数字そのものはもちろんですが、私たちが特に惹かれたのは、プレイヤーとして成果を上げながら、チーム全体の成果にも責任を持ってこられた点です。</p>
      <p class="fs-hi" data-i="2">当社はいま、事業拡大に向けて、営業を「個人の力で伸ばす組織」から「仕組みで伸び続ける組織」へ進化させるフェーズにあります。</p>
      <p>〇〇様には、これまで培われた現場の勝ち筋を、営業戦略・KPI設計・育成・組織づくりへと広げ、事業全体の成長を牽引していただきたいと考えています。</p>
      <p class="fs-hi" data-i="0">今回お声がけしたのは、既存チームを管理するだけのポジションではありません。事業責任者候補として、戦略から実行まで大きな裁量を持っていただくことを想定しています。</p>
      <p>すぐの転職をお考えでなくても構いません。まずは30分ほど、当社の事業とお任せしたい役割について、率直にお話しできないでしょうか。</p>
      <p>〇〇様が次のキャリアで実現したいことも、ぜひ伺えればうれしいです。</p>
      <p class="fs-sign">株式会社NEXT　採用担当</p>
    </div>`;
  root.appendChild(mail);

  return (gsap) => {
    const tl = gsap.timeline({ repeat: -1, repeatDelay: 0 });
    const facts = root.querySelectorAll('.fs-fact');
    const picks = root.querySelectorAll('.fs-pick');
    const his = root.querySelectorAll('.fs-hi');
    tl.fromTo(root.querySelectorAll('.fs-cand, .fs-mail'), { opacity: 0, y: 12 },
      { opacity: 1, y: 0, duration: .4, stagger: .1 });
    tl.fromTo(facts, { opacity: 0, x: -10 }, { opacity: 1, x: 0, duration: .28, stagger: .18 }, .3);
    tl.fromTo(root.querySelector('.fs-picks-h'), { opacity: 0 }, { opacity: 1, duration: .3 }, .95);
    tl.fromTo(root.querySelector('.fs-subj'), { opacity: 0 }, { opacity: 1, duration: .35 }, 1.1);
    // 訴求を1つ選ぶと、その訴求で書いた段落が光る
    picks.forEach((pk, i) => {
      const t = 1.25 + i * 0.75;
      tl.fromTo(pk, { opacity: 0, x: -14 }, { opacity: 1, x: 0, duration: .32 }, t);
      tl.to(pk, { '--on': 1, duration: .01 }, t + .3);
      tl.call(() => pk.classList.add('is-on'), null, t + .3);
      const target = Array.from(his).find((h) => +h.dataset.i === i);
      if (target) {
        tl.fromTo(target, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: .42 }, t + .3);
        tl.fromTo(target, { backgroundColor: 'rgba(22,104,200,.16)' },
          { backgroundColor: 'rgba(22,104,200,0)', duration: 1.1 }, t + .45);
      }
    });
    tl.fromTo(root.querySelector('.fs-sign'), { opacity: 0 }, { opacity: 1, duration: .3 }, 3.7);
    tl.addLabel("done");
    tl.to({}, { duration: 3.4 });
    tl.call(() => picks.forEach((p) => p.classList.remove('is-on')));
    tl.to(root.querySelectorAll('.fs-fact, .fs-pick, .fs-hi, .fs-subj, .fs-sign'),
      { opacity: 0, duration: 0.22 });
    return tl;
  };
}

/* ---------- 03 AI書類選考：要件と経歴を1条件ずつ突き合わせ、根拠つきで判定 ----------
   ○×を振り分けるだけでは「何を見て判断したか」が伝わらないので、
   MUST / WANT / 除外 の条件ごとに、経歴のどの記述と照合したかを出す。 */
function scene03(root) {
  root.classList.add('fs', 'fs-03');

  const CASES = [
    {
      name: '候補者D', verdict: '一次通過', ok: true, score: 92,
      rows: [
        ['MUST', '法人向け新規開拓 2年以上', 1, '3年2か月（前職SaaS）'],
        ['MUST', '商談〜受注を一気通貫', 1, '受注まで担当の記載あり'],
        ['WANT', 'SaaS・IT 業界', 1, 'SaaS 3年'],
        ['WANT', 'IS との協業経験', 2, '記載なし'],
        ['除外', '個人営業のみ', 1, '該当なし'],
      ],
    },
    {
      name: '候補者E', verdict: '見送り（MUST未充足）', ok: false, score: 38,
      rows: [
        ['MUST', '法人向け新規開拓 2年以上', 0, '個人向け営業のみ 4年'],
        ['MUST', '商談〜受注を一気通貫', 0, '受注は別部門が担当'],
        ['WANT', 'SaaS・IT 業界', 2, '記載なし'],
        ['WANT', 'IS との協業経験', 1, 'IS チームと連携の記載'],
        ['除外', '個人営業のみ', 0, '該当あり'],
      ],
    },
  ];

  const board = el('div', 'fs-board');
  CASES.forEach((c, ci) => {
    const card = el('div', 'fs-case' + (ci ? ' is-second' : ''));
    card.dataset.c = ci;
    card.appendChild(el('span', 'fs-case-h', c.name + '<em>応募書類との照合</em>'));
    const list = el('div', 'fs-rows');
    c.rows.forEach(([k, cond, st, ev]) => {
      const mark = st === 1 ? '✓' : st === 0 ? '✕' : '－';
      const cls = st === 1 ? 'is-y' : st === 0 ? 'is-n' : 'is-m';
      const r = el('div', 'fs-row ' + cls);
      r.innerHTML = `<i class="fs-k">${k}</i><span class="fs-cond">${cond}</span>`
        + `<b class="fs-mark">${mark}</b><span class="fs-ev">${ev}</span>`;
      list.appendChild(r);
    });
    card.appendChild(list);
    card.appendChild(el('div', 'fs-verdict' + (c.ok ? ' is-ok' : ' is-ng'),
      `<span>合致度</span><b class="fs-score" data-v="${c.score}">0</b><em>%</em><i>${c.verdict}</i>`));
    board.appendChild(card);
  });
  root.appendChild(board);
  root.appendChild(el('p', 'fs-foot', '合否の最終判断は、必ず人が行います'));

  return (gsap) => {
    const tl = gsap.timeline({ repeat: -1, repeatDelay: 0 });
    const cards = root.querySelectorAll('.fs-case');
    tl.set(root.querySelectorAll('.fs-row, .fs-verdict'), { opacity: 0 });
    tl.fromTo(cards, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: .4, stagger: .14 });
    cards.forEach((card, ci) => {
      const rows = card.querySelectorAll('.fs-row');
      const base = .5 + ci * 1.9;
      rows.forEach((r, i) => {
        tl.fromTo(r, { opacity: 0, x: -12 }, { opacity: 1, x: 0, duration: .26 }, base + i * 0.26);
        tl.fromTo(r.querySelector('.fs-mark'), { scale: .4 }, { scale: 1, duration: .26, ease: 'back.out(2)' }, '<+.08');
      });
      const v = card.querySelector('.fs-verdict');
      const sc = card.querySelector('.fs-score');
      const o = { v: 0 };
      tl.to(v, { opacity: 1, duration: .3 }, base + 1.45)
        .to(o, {
          v: +sc.dataset.v, duration: .5, ease: 'power2.out',
          onUpdate: () => { sc.textContent = Math.round(o.v); },
        }, '<');
    });
    tl.addLabel("done");
    tl.to({}, { duration: 4.8 });
    tl.to(root.querySelectorAll('.fs-row, .fs-verdict'), { opacity: 0, duration: 0.22 });
    return tl;
  };
}

/* ---------- 04 適性検査：レーダーが中心から描かれる ---------- */
function scene04(root) {
  root.classList.add('fs', 'fs-04');
  const AX = ['主体性', '対人影響力', 'ストレス耐性', '論理的思考', '協調性', '達成意欲'];
  const V = [0.86, 0.72, 0.55, 0.9, 0.62, 0.8];
  const R = 108, cx = 150, cy = 150;
  const s = svg('svg', { class: 'fs-radar', viewBox: '0 0 300 300' });
  [0.25, 0.5, 0.75, 1].forEach((k) => {
    const pts = AX.map((_, i) => {
      const a = -Math.PI / 2 + i * (Math.PI * 2 / 6);
      return `${cx + Math.cos(a) * R * k},${cy + Math.sin(a) * R * k}`;
    }).join(' ');
    s.appendChild(svg('polygon', { points: pts, class: 'fs-web' }));
  });
  const pts = AX.map((_, i) => {
    const a = -Math.PI / 2 + i * (Math.PI * 2 / 6);
    return `${cx + Math.cos(a) * R * V[i]},${cy + Math.sin(a) * R * V[i]}`;
  }).join(' ');
  const poly = svg('polygon', { points: pts, class: 'fs-shape' });
  s.appendChild(poly);
  AX.forEach((t, i) => {
    const a = -Math.PI / 2 + i * (Math.PI * 2 / 6);
    const tx = svg('text', {
      x: cx + Math.cos(a) * (R + 26), y: cy + Math.sin(a) * (R + 26) + 4,
      class: 'fs-ax', 'text-anchor': 'middle',
    });
    tx.textContent = t;
    s.appendChild(tx);
  });
  root.appendChild(s);
  // 検査結果を見せて終わりでは使い道がないので、
  // 「この候補者に面接で何を聞くべきか」を質問文の形で自動生成して出す。
  const Q = [
    ['ストレス耐性', '低め', 'こわ', '直近で最も追い込まれた場面と、そのとき実際に取った行動を教えてください'],
    ['協調性', '平均以下', 'きょ', '意見が割れたとき、どのように合意を作ってきましたか'],
    ['論理的思考', '突出', 'ろん', '複雑な案件を、どう分解して進めましたか。判断の順番も教えてください'],
  ];
  const qw = el('div', 'fs-qs');
  qw.appendChild(el('span', 'fs-qs-h', '面接で聞くべき質問<em>自動生成</em>'));
  Q.forEach(([ax, lv, _, q], i) => {
    const r = el('div', 'fs-q');
    r.dataset.i = i;
    r.innerHTML = `<span class="fs-q-ax">${ax}<i>${lv}</i></span><p class="fs-q-t">${q}</p>`;
    qw.appendChild(r);
  });
  root.appendChild(qw);
  return (gsap) => {
    const tl = gsap.timeline({ repeat: -1, repeatDelay: 0 });
    tl.fromTo(root.querySelectorAll('.fs-web'), { opacity: 0, scale: .4, transformOrigin: '150px 150px' },
      { opacity: 1, scale: 1, duration: .45, stagger: .08 });
    tl.fromTo(poly, { scale: 0, opacity: 0, transformOrigin: '150px 150px' },
      { scale: 1, opacity: 1, duration: .85, ease: 'back.out(1.15)' }, .4);
    tl.fromTo(root.querySelectorAll('.fs-ax'), { opacity: 0 }, { opacity: 1, duration: .35, stagger: .05 }, .55);
    tl.fromTo(root.querySelectorAll('.fs-q'), { opacity: 0, x: 20 },
      { opacity: 1, x: 0, duration: .42, stagger: .34 }, 1.15);
    tl.addLabel("done");
    tl.to({}, { duration: 4.9 });
    tl.to(root.querySelectorAll('.fs-q, .fs-shape'), { opacity: 0, duration: 0.22 });
    return tl;
  };
}

/* ---------- 05 AI日程調整：誰か1人でも空いていれば候補になる ----------
   面接は1名で成立するので、「3名とも空いている枠」では条件が厳しすぎる。
   各枠について「対応できる面接官が誰か」を出し、
   全員埋まっている枠だけを除外する。 */
function scene05(root) {
  root.classList.add('fs', 'fs-05');
  const DAYS = ['月', '火', '水', '木', '金'];
  const SLOTS = ['10:00', '14:00'];
  const NAMES = ['A', 'B', 'C'];
  // 各面接官の予定が入っているコマ [行, 列]
  const BUSY = [
    [[0, 0], [0, 2], [1, 1], [1, 3]],
    [[0, 0], [0, 1], [1, 1], [1, 4]],
    [[0, 0], [0, 3], [1, 0], [1, 1]],
  ];
  const busySets = BUSY.map((b) => new Set(b.map((x) => x.join(','))));

  function grid(k) {                              // k=null なら合成ビュー
    const big = k === null;
    const g = el('div', 'fs-cal-g' + (big ? ' is-big' : ''));
    g.appendChild(el('span', 'fs-cal-c'));
    DAYS.forEach((d) => g.appendChild(el('span', 'fs-cal-d', d)));
    SLOTS.forEach((t, r) => {
      g.appendChild(el('span', 'fs-cal-t', t));
      DAYS.forEach((_, c) => {
        const key = r + ',' + c;
        if (!big) {
          const busy = busySets[k].has(key);
          const cell = el('span', 'fs-cal-x' + (busy ? ' is-busy' : ' is-free'));
          if (busy) cell.textContent = '×';
          g.appendChild(cell);
          return;
        }
        const who = NAMES.filter((_, i) => !busySets[i].has(key));
        const cell = el('span', 'fs-cal-x ' + (who.length ? 'is-ok' : 'is-ng'));
        cell.dataset.free = who.length ? '1' : '0';
        cell.innerHTML = who.length
          ? who.map((n) => '<i>' + n + '</i>').join('')
          : '×';
        g.appendChild(cell);
      });
    });
    return g;
  }

  const wrap = el('div', 'fs-cals');
  NAMES.forEach((n, k) => {
    const c = el('div', 'fs-cal');
    c.appendChild(el('span', 'fs-cal-h', '面接官' + n));
    c.appendChild(grid(k));
    wrap.appendChild(c);
  });
  root.appendChild(wrap);

  const merged = el('div', 'fs-merged');
  merged.appendChild(el('span', 'fs-cal-h', '対応できる面接官がいる枠'));
  merged.appendChild(grid(null));
  merged.appendChild(el('p', 'fs-merged-n', '1名でも空いていれば候補になります。誰が出られるかまで添えて提示します'));
  root.appendChild(merged);

  return (gsap) => {
    const tl = gsap.timeline({ repeat: -1, repeatDelay: 0 });
    const cals = root.querySelectorAll('.fs-cal');
    const ok = merged.querySelectorAll('.fs-cal-x[data-free="1"]');
    tl.fromTo(cals, { opacity: 0, x: -26 }, { opacity: 1, x: 0, duration: .4, stagger: .15 });
    tl.to({}, { duration: 0.4 });
    tl.to(cals, { y: (i) => (1 - i) * 14, scale: .97, opacity: .66, duration: .6, ease: 'power2.inOut' });
    tl.fromTo(merged, { opacity: 0, scale: .95 }, { opacity: 1, scale: 1, duration: .5 }, '<+.2');
    tl.fromTo(ok, { scale: .7, opacity: .3 }, { scale: 1, opacity: 1, duration: .3, stagger: .05 }, '>-.1');
    tl.addLabel("done");
    tl.to({}, { duration: 4.3 });
    tl.to([merged, cals], { opacity: 0, duration: 0.22 });
    tl.set(cals, { x: -26, y: 0, scale: 1 });
    return tl;
  };
}

/* ---------- 06 AI面接文字起こし：波形が走り、文字が追従する ---------- */
function scene06(root) {
  root.classList.add('fs', 'fs-06');
  const wave = el('div', 'fs-wave');
  for (let i = 0; i < 56; i++) {
    const b = el('i');
    b.style.setProperty('--h', (18 + Math.abs(Math.sin(i * 0.55)) * 62 + (i % 5) * 4) + '%');
    wave.appendChild(b);
  }
  root.appendChild(el('span', 'fs-wave-h', '面接の音声'));
  root.appendChild(wave);
  root.appendChild(el('div', 'fs-script', `
    <p data-i="0"><b>面接官</b>これまでで一番難しかった案件は。</p>
    <p data-i="1"><b>候補者</b>製造業の基幹システムの入れ替えです。</p>
    <p data-i="2"><b>候補者</b>現場の反対が強く、部署ごとに説明会を。</p>`));
  // タグの羅列では「どういう人か」が伝わらないので、発話から人物像を文章で起こす
  root.appendChild(el('div', 'fs-sum', `
    <span class="fs-sum-h">評価サマリ<em>自動</em></span>
    <p class="fs-sum-t">反対の強い現場を、<b>部署ごとの説明会という手段を自分で設計して</b>一つずつ合意に変えていった方です。抵抗の大きい環境でも、正面から関係者を巻き込んで前に進められるタイプと見られます。</p>
    <p class="fs-sum-t">製造業の基幹システム入れ替えという、<b>業務要件と技術要件の両方を扱う案件</b>を完遂しており、事業側と情報システム側の通訳ができる点が強みです。</p>
    <p class="fs-sum-n">※ 発話内容のみから生成しています。最終評価は面接官が行います。</p>`));
  return (gsap) => {
    const tl = gsap.timeline({ repeat: -1, repeatDelay: 0 });
    const bars = root.querySelectorAll('.fs-wave i');
    const lines = root.querySelectorAll('.fs-script p');
    const sums = root.querySelectorAll('.fs-sum-t, .fs-sum-n');
    tl.fromTo(bars, { scaleY: .06, opacity: .25 },
      { scaleY: 1, opacity: 1, duration: .5, stagger: { each: .022, from: 'start' }, ease: 'power2.out' });
    lines.forEach((l, i) => {
      tl.fromTo(l, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: .4 }, .5 + i * 0.55);
    });
    tl.fromTo(sums, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: .45, stagger: .3 }, 2.2);
    tl.addLabel("done");
    tl.to({}, { duration: 4.2 });
    tl.to(root.querySelectorAll('.fs-script p, .fs-sum-t, .fs-sum-n'), { opacity: 0, duration: 0.22 })
      .to(bars, { scaleY: .06, opacity: .25, duration: .3 }, '<');
    return tl;
  };
}

/* ---------- 07 AI採用分析：工程間の転換率を出し、ボトルネックを指摘する ----------
   棒が並ぶだけでは「分析している」ようには見えないので、
   走査 → 各工程の転換率を算出 → いちばん悪い工程を名指し、の順に見せる。 */
function scene07(root) {
  root.classList.add('fs', 'fs-07');
  const ROWS = [['スカウト送信', 1000, 100], ['開封', 400, 40], ['返信', 22, 12], ['面接', 8, 7], ['内定', 2, 4]];
  const f = el('div', 'fs-funnel');
  ROWS.forEach(([n, v, w], i) => {
    const narrow = w < 22;
    const r = el('div', 'fs-frow' + (narrow ? ' is-narrow' : ''));
    r.style.setProperty('--w', w + '%');
    r.appendChild(el('span', 'fs-fk', n));
    const track = el('div', 'fs-ftrack');
    const bar = el('b', 'fs-fbar');
    bar.style.setProperty('--w', w + '%');
    track.appendChild(bar);
    const val = el('span', 'fs-fval');
    val.dataset.v = v; val.textContent = '0';
    track.appendChild(val);
    r.appendChild(track);
    f.appendChild(r);

    // 工程間の転換率
    if (i < ROWS.length - 1) {
      const rate = (ROWS[i + 1][1] / v) * 100;
      const worst = (i === 1);                         // 開封→返信 が最も低い
      const g = el('div', 'fs-gap' + (worst ? ' is-bad' : ''));
      g.innerHTML = '<span class="fs-gap-l"></span>'
        + '<b class="fs-gap-v">' + rate.toFixed(1) + '<small>%</small></b>'
        + (worst ? '<i class="fs-gap-w">要改善</i>' : '');
      f.appendChild(g);
    }
  });
  root.appendChild(f);
  root.appendChild(el('div', 'fs-scan'));
  root.appendChild(el('div', 'fs-flag',
    '<b class="fs-flag-h">「開封 → 返信」が、業界平均 8.4% より <em>2.9pt 低い</em></b>'
    + '<span class="fs-flag-s">20万件の採用データと突き合わせて、直すべき一点を特定します</span>'));

  return (gsap) => {
    const tl = gsap.timeline({ repeat: -1, repeatDelay: 0 });
    const bars = root.querySelectorAll('.fs-fbar');
    const vals = root.querySelectorAll('.fs-fval');
    const gaps = root.querySelectorAll('.fs-gap');
    const bad = root.querySelector('.fs-gap.is-bad');
    const scan = root.querySelector('.fs-scan');
    const flag = root.querySelector('.fs-flag');

    // 1) 棒が伸びて数値が入る
    bars.forEach((bar, i) => {
      const val = vals[i];
      const target = +val.dataset.v;
      const o = { v: 0 };
      tl.fromTo(bar, { width: 0, opacity: 0 }, { width: 'var(--w)', opacity: 1, duration: .5, ease: 'power3.out' }, i * 0.24)
        .fromTo(val, { opacity: 0 }, { opacity: 1, duration: .25 }, '<+.12')
        .to(o, {
          v: target, duration: .5, ease: 'power2.out',
          onUpdate: () => { val.textContent = Math.round(o.v).toLocaleString('ja-JP'); },
        }, '<');
    });

    // 2) 走査線が上から下へ流れる
    tl.fromTo(scan, { top: '0%', opacity: 0 }, { opacity: 1, duration: .2 }, 1.5)
      .to(scan, { top: '100%', duration: 1.0, ease: 'none' }, '<')
      .to(scan, { opacity: 0, duration: .2 }, '>-.1');

    // 3) 転換率が順に出る
    gaps.forEach((g, i) => {
      tl.fromTo(g, { opacity: 0, x: -10 }, { opacity: 1, x: 0, duration: .3 }, 1.6 + i * 0.24);
    });

    // 4) いちばん悪い工程を名指しする
    if (bad) {
      tl.fromTo(bad, { scale: 1 }, { scale: 1.06, duration: .3, yoyo: true, repeat: 3, transformOrigin: 'left center' }, 2.8);
      tl.call(() => bad.classList.add('is-on'), null, 2.8);
    }
    tl.fromTo(flag, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: .45 }, 3.3);

    tl.addLabel("done");
    tl.to({}, { duration: 4.2 });
    tl.call(() => { if (bad) bad.classList.remove('is-on'); });
    tl.to(bars, { width: 0, opacity: 0, duration: .3, stagger: .04 })
      .to([vals, gaps, flag], { opacity: 0, duration: 0.22 }, '<');
    return tl;
  };
}

const SCENES = { '01': scene01, '02': scene02, '03': scene03, '04': scene04, '05': scene05, '06': scene06, '07': scene07 };

export function init() {
  const gsap = window.gsap;
  const reduce = !!(window.NX && window.NX.reduce);
  const built = {};

  document.querySelectorAll('.fn-slide').forEach((slide) => {
    const box = slide.querySelector('.fn-video');
    const vid = box && box.querySelector('video');
    const key = vid && vid.dataset.fn;
    if (!box || !key || !SCENES[key]) return;

    // 動画は残したまま隠す（差し替えを戻したくなったときのため）
    if (vid) vid.style.display = 'none';

    const root = el('div', 'fn-scene');
    box.appendChild(root);
    const make = SCENES[key](root);

    if (reduce || !gsap) return;         // 動きを抑える設定なら静止画として見せる
    built[key] = { slide, make, tl: null };
    window.__nxScenes = built;   // 静止画書き出し用に外から seek する
  });

  // 表示中のスライドだけ動かす（裏で回すとバッテリーを食うだけ）
  document.addEventListener('nx:slide', (e) => {
    const id = e.detail && e.detail.slide && e.detail.slide.id;
    Object.keys(built).forEach((k) => {
      const b = built[k];
      const on = b.slide.id === id;
      if (on && !b.tl) b.tl = b.make(gsap);
      else if (on && b.tl) { b.tl.restart(); b.tl.play(); }
      else if (b.tl) b.tl.pause();
    });
  });
}
