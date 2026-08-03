// fnvideo.js — 機能スライドの映像を、そのスライドにいるときだけ再生する
//
// 「動画枠が真っ黒」の原因と対策（実測ベース）
//  1) fn0X.webm は VP9 / 1920x1200。環境によっては canPlayType が "probably" を返すのに
//     実際にはデコードできず、MediaError code 3
//     （PipelineStatus::PIPELINE_ERROR_DECODE）で落ちる。
//     <source> の自動フォールバックは「リソース選択中のネットワーク/形式エラー」にしか
//     効かないので、選択後に起きるデコード失敗では mp4 に切り替わらない。
//     → ここで手動フォールバックする（1つでも decode error が出たら全部 mp4 に寄せる）。
//  2) デコードに失敗しても readyState は 1(HAVE_METADATA) まで進むため、
//     ブラウザは poster の表示をやめ、不透明な黒を描く。これが「完全な真っ黒」の正体。
//     → poster を親(.fn-video)の background に敷き、<video> は
//       「実フレームを持っている間だけ」不透明にする。何が起きても黒板にはならない。
//  3) nx:slide は deck.js の requestAnimationFrame 経由なので、タブが非表示だと発火しない。
//     → IntersectionObserver を併用して、再生開始/停止を二重化する。
//
// 検証用フック: window.__fnv.report()

const HAVE_CURRENT_DATA = 2;

export function init() {
  const vids = Array.from(document.querySelectorAll('video.fn-v'))
    .filter((v) => v.dataset.fnvReady !== '1');
  if (!vids.length) return;

  const reduce = !!(window.NX && window.NX.reduce);
  const items = vids.map(setup);
  let decodeBroken = false;

  // ---------- 1本ぶんの初期化 ----------
  function setup(v) {
    v.dataset.fnvReady = '1';
    const wrap = v.closest('.fn-video') || v.parentElement;

    // poster を親の背景として敷く（video が何も描けない状況でも必ず絵が出る）
    const posterAttr = v.getAttribute('poster');
    if (wrap && posterAttr) {
      const abs = new URL(posterAttr, document.baseURI).href;
      wrap.style.backgroundImage = 'url("' + abs + '")';
      wrap.style.backgroundSize = 'cover';
      wrap.style.backgroundPosition = 'center';
      wrap.style.backgroundRepeat = 'no-repeat';
    }

    // 実フレームを持つまで video は透明。インラインなので CSS の読み込み順に左右されない。
    v.style.opacity = '0';
    v.style.transition = reduce ? 'none' : 'opacity .35s ease';
    v.style.backgroundColor = 'transparent';

    // 自動再生の前提（index.html 側に付いていない場合の保険）
    v.muted = true;
    v.setAttribute('muted', '');
    v.playsInline = true;
    v.setAttribute('playsinline', '');

    const list = Array.from(v.querySelectorAll('source'))
      .map((s) => s.getAttribute('src'))
      .filter(Boolean)
      .map((s) => new URL(s, document.baseURI).href);
    if (!list.length && v.getAttribute('src')) {
      list.push(new URL(v.getAttribute('src'), document.baseURI).href);
    }

    const item = {
      v: v,
      wrap: wrap,
      slide: v.closest('.slide'),
      list: list,
      tried: new Set(),
      want: false,
      kicked: false,
      dead: false
    };

    const reveal = () => {
      if (item.dead) return;
      if (v.readyState >= HAVE_CURRENT_DATA && v.videoWidth > 0 && !v.error) {
        if (v.style.opacity !== '1') v.style.opacity = '1';
      }
    };
    const conceal = () => { if (v.style.opacity !== '0') v.style.opacity = '0'; };
    item.reveal = reveal;
    item.conceal = conceal;

    ['loadeddata', 'canplay', 'canplaythrough', 'playing', 'timeupdate', 'seeked', 'progress']
      .forEach((ev) => v.addEventListener(ev, reveal));
    v.addEventListener('emptied', conceal);

    v.addEventListener('error', () => {
      const code = v.error ? v.error.code : 0;
      conceal();
      if (v.currentSrc) item.tried.add(v.currentSrc);
      // 3 = MEDIA_ERR_DECODE。この環境は webm(VP9) を再生できないので全部 mp4 に寄せる。
      if (code === 3 && !decodeBroken) {
        decodeBroken = true;
        items.forEach((other) => { if (other !== item) switchToFallback(other); });
      }
      switchToFallback(item);
    });

    reveal();
    return item;
  }

  // ---------- 再生できないソースを次の候補に差し替える ----------
  function switchToFallback(item) {
    if (item.dead) return;
    const v = item.v;
    if (v.currentSrc) item.tried.add(v.currentSrc);

    const rest = item.list.filter((u) => !item.tried.has(u));
    if (!rest.length) {
      // 打つ手なし。poster（親の背景）だけが残る＝黒画面にはならない。
      item.dead = true;
      item.conceal();
      return;
    }
    // H.264 の mp4 が最も通りやすいので優先する
    const next = rest.filter((u) => /\.mp4(\?|$)/i.test(u))[0] || rest[0];
    item.tried.add(next);
    item.conceal();
    item.kicked = false;
    v.src = next;
    v.preload = 'auto';
    try { v.load(); } catch (e) { /* noop */ }
    if (item.want) kick(item);
  }

  // ---------- 再生/停止 ----------
  function kick(item) {
    const v = item.v;
    if (item.dead) return;
    if (reduce) {                      // 動きを減らす設定：再生しない（poster を見せる）
      if (v.readyState === 0 && !item.kicked) { item.kicked = true; v.preload = 'auto'; try { v.load(); } catch (e) {} }
      return;
    }
    if (v.preload === 'none' || v.preload === 'metadata') v.preload = 'auto';
    if (!v.paused) { item.reveal(); return; }
    const p = v.play();
    if (p && p.catch) {
      p.catch(() => {
        // 自動再生拒否・デコード待ちなど。poster は出ているので黒にはならない。
        if (v.readyState === 0 && !item.kicked) {
          item.kicked = true;
          try { v.load(); } catch (e) { /* noop */ }
        }
      });
    }
  }

  function enter(item) {
    item.want = true;
    kick(item);
    item.reveal();
  }

  function leave(item) {
    item.want = false;
    const v = item.v;
    if (!v.paused) { try { v.pause(); } catch (e) { /* noop */ } }
    if (v.readyState > 0 && v.currentTime > 0) {
      try { v.currentTime = 0; } catch (e) { /* noop */ }
    }
  }

  // ---------- どのスライドにいるかの判定（nx:slide と IntersectionObserver の二重化） ----------
  const ioVisible = new Set();
  let evtActive = null;

  function recompute() {
    // IO が「見えている」と言っているものを優先。まだ誰も見えていなければ nx:slide の結果を使う。
    let target;
    if (ioVisible.size) target = ioVisible;
    else if (evtActive) target = new Set([evtActive]);
    else target = new Set();
    items.forEach((it) => (target.has(it) ? enter(it) : leave(it)));
  }

  document.addEventListener('nx:slide', (e) => {
    const slide = e.detail && e.detail.slide;
    evtActive = slide ? (items.filter((it) => slide.contains(it.v))[0] || null) : null;
    recompute();
  });

  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        const item = items.filter((it) => it.v === en.target)[0];
        if (!item) return;
        if (en.isIntersecting && en.intersectionRatio >= 0.5) ioVisible.add(item);
        else ioVisible.delete(item);
      });
      recompute();
    }, { threshold: [0, 0.5, 0.75] });
    items.forEach((it) => io.observe(it.v));
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) items.forEach((it) => { try { it.v.pause(); } catch (e) {} });
    else recompute();
  });

  const active = document.querySelector('.slide.is-active');
  if (active) evtActive = items.filter((it) => active.contains(it.v))[0] || null;
  recompute();

  // 検証用
  window.__fnv = {
    items: items,
    report: () => items.map((it) => ({
      fn: it.v.dataset.fn,
      src: (it.v.currentSrc || '').split('/').pop(),
      readyState: it.v.readyState,
      paused: it.v.paused,
      opacity: it.v.style.opacity,
      videoWidth: it.v.videoWidth,
      error: it.v.error ? it.v.error.code : null
    }))
  };
}
