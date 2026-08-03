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
//  3) 全7本とも 0 フレーム目が真っ黒（黒からのフェードイン。実測: 輝度平均 0.0/255、
//     poster は 13〜24）。つまり再生が始まっていない video は、正常に読めていても黒板になる。
//     → 黒いフェードインを抜ける currentTime >= 0.3s までは poster を出したままにし、
//       そこで video をクロスフェードで出す。離脱時は先に隠してから巻き戻す。
//  4) nx:slide は deck.js の requestAnimationFrame 経由なので、タブが非表示だと発火しない。
//     → nx:slide が一度も来ない環境向けに IntersectionObserver を保険として持つ
//       （nx:slide が来ていればそちらが正）。
//
// 検証用フック: window.__fnv.report()

const HAVE_CURRENT_DATA = 2;
const FADE_IN_DONE = 0.3;   // 素材の黒フェードインを抜ける秒数（実測 0.34s で輝度 10〜15）

export function init() {
  const vids = Array.from(document.querySelectorAll('video.fn-v'))
    .filter((v) => v.dataset.fnvReady !== '1');
  if (!vids.length) return;

  const reduce = !!(window.NX && window.NX.reduce);
  let decodeBroken = false;
  const items = vids.map(setup);

  // ---------- 1本ぶんの初期化 ----------
  function setup(v) {
    v.dataset.fnvReady = '1';
    const wrap = v.closest('.fn-video') || v.parentElement;

    // poster を親の背景として敷く（video が何も描けない状況でも必ず絵が出る）
    const posterAttr = v.getAttribute('poster');
    if (wrap && posterAttr) {
      const abs = new URL(posterAttr, document.baseURI).href;
      wrap.style.backgroundImage = 'url("' + abs + '")';
      wrap.style.backgroundRepeat = 'no-repeat';
    }

    // 「絵が出ている」と確認できるまで video は透明。
    // インラインstyleなので CSS の読み込み順・詳細度に左右されない。
    v.style.opacity = '0';
    v.style.transition = 'none';
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
      list: list,
      tried: new Set(),
      want: false,
      kicked: false,
      dead: false
    };

    // 素材は黒からフェードインするので、頭の黒い区間は poster を見せたままにする。
    // 出すときだけクロスフェード、隠すときは即時（フェード中に黒フレームを見せないため）。
    const reveal = () => {
      if (item.dead || !item.want) return;
      if (v.error || v.videoWidth === 0 || v.readyState < HAVE_CURRENT_DATA) return;
      if (v.paused || v.currentTime < FADE_IN_DONE) return;
      if (v.style.opacity === '1') return;
      v.style.transition = reduce ? 'none' : 'opacity .45s ease';
      void v.offsetWidth;                 // transition を確実に効かせる
      v.style.opacity = '1';
    };
    const conceal = () => {
      if (v.style.opacity === '0') return;
      v.style.transition = 'none';        // 即座に消す
      v.style.opacity = '0';
    };
    item.reveal = reveal;
    item.conceal = conceal;

    // poster の敷き方を video の object-fit に合わせる。
    // （cover のつもりで敷くと object-fit:contain のときにレターボックス部分から
    //   拡大された poster がはみ出して二重像になる）
    item.syncPosterFit = () => {
      if (!wrap || !posterAttr) return;
      const cs = getComputedStyle(v);
      const fit = cs.objectFit;
      wrap.style.backgroundSize =
        fit === 'contain' ? 'contain' :
        fit === 'fill' ? '100% 100%' :
        fit === 'none' ? 'auto' : 'cover';
      wrap.style.backgroundPosition = cs.objectPosition || '50% 50%';
    };
    item.syncPosterFit();
    v.addEventListener('loadedmetadata', item.syncPosterFit);

    ['loadeddata', 'canplay', 'canplaythrough', 'playing', 'timeupdate', 'seeked', 'progress']
      .forEach((ev) => v.addEventListener(ev, reveal));
    v.addEventListener('emptied', conceal);
    // 停止したまま頭に戻っている＝黒フレームを晒す状態。必ず poster に戻す。
    const hideIfBlack = () => { if (v.paused && v.currentTime < FADE_IN_DONE) conceal(); };
    v.addEventListener('pause', hideIfBlack);
    v.addEventListener('seeked', hideIfBlack);

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
    // 毎回 kick する。ブラウザが省電力でバックグラウンド再生を止めた場合、
    // 復帰時にここで再開させる必要がある（kick は再生中なら何もしない）。
    kick(item);
    item.reveal();
  }

  function leave(item) {
    if (!item.want && item.v.paused) return;
    item.want = false;
    const v = item.v;
    item.conceal();                                    // 先に隠す（巻き戻しの黒フレームを見せない）
    if (!v.paused) { try { v.pause(); } catch (e) { /* noop */ } }
    setTimeout(() => {
      if (item.want) return;
      if (v.readyState > 0 && v.currentTime > 0) {
        try { v.currentTime = 0; } catch (e) { /* noop */ }
      }
    }, 480);
  }

  // ---------- どのスライドにいるかの判定（nx:slide と IntersectionObserver の二重化） ----------
  const ioVisible = new Set();
  let evtActive = null;
  let evtSeen = false;

  function recompute() {
    // deck.js が現在地を教えてくれているならそれが正。
    // 一度も来ないとき（rAF が止まる環境など）だけ IntersectionObserver に任せる。
    let target;
    if (evtSeen) target = evtActive ? new Set([evtActive]) : new Set();
    else target = ioVisible;
    items.forEach((it) => (target.has(it) ? enter(it) : leave(it)));
  }

  document.addEventListener('nx:slide', (e) => {
    const slide = e.detail && e.detail.slide;
    evtSeen = true;
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

  // レイアウトが変わると object-fit の効き方も変わるので、poster の敷き方を合わせ直す
  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => items.forEach((it) => it.syncPosterFit()), 150);
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
      currentTime: Math.round(it.v.currentTime * 100) / 100,
      opacity: it.v.style.opacity,
      videoWidth: it.v.videoWidth,
      posterBg: !!(it.wrap && it.wrap.style.backgroundImage),
      error: it.v.error ? it.v.error.code : null
    }))
  };
}
