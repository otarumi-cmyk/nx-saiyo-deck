// fit.js — どんなアスペクト比でもスクロールも見切れも出さない
//
// 各スライドの中身を固定幅のステージに入れ、
// ビューポートに収まる倍率へ transform: scale() で縮小する。
// プレゼンソフトと同じ方式なので、画面比が変わっても
// レイアウトが崩れず、はみ出しも縦スクロールも発生しない。
//
// 構造: .slide > .slide-in（deck.js が3D変形を当てる）> .nx-stage（ここを拡縮）

const STAGE_WIDE = 1280;   // PC・タブレット横
const STAGE_NARROW = 720;  // スマホ・縦長（文字が小さくなりすぎないよう狭めの版面にする）

export function init() {
  const slides = Array.from(document.querySelectorAll('.slide'));
  if (!slides.length) return;

  // .slide-in の中身を .nx-stage で包む（HTMLは変更せず実行時に行う）
  slides.forEach((sl) => {
    const inner = sl.querySelector(':scope > .slide-in');
    if (!inner || inner.querySelector(':scope > .nx-stage')) return;
    const stage = document.createElement('div');
    stage.className = 'nx-stage';
    while (inner.firstChild) stage.appendChild(inner.firstChild);
    inner.appendChild(stage);
  });

  let raf = 0;
  function fitAll() {
    const narrow = window.innerWidth < 900 || window.innerHeight > window.innerWidth;
    const W = narrow ? STAGE_NARROW : STAGE_WIDE;

    slides.forEach((sl) => {
      const inner = sl.querySelector(':scope > .slide-in');
      const stage = inner && inner.querySelector(':scope > .nx-stage');
      if (!stage) return;

      const cs = getComputedStyle(sl);
      const availW = sl.clientWidth - parseFloat(cs.paddingLeft || 0) - parseFloat(cs.paddingRight || 0);
      const availH = sl.clientHeight - parseFloat(cs.paddingTop || 0) - parseFloat(cs.paddingBottom || 0);
      if (availW <= 0 || availH <= 0) return;

      // 版面幅を固定し、素の高さを測ってから倍率を決める
      stage.style.transform = 'none';
      stage.style.width = W + 'px';
      const natH = stage.scrollHeight;

      const scale = Math.min(availW / W, availH / Math.max(natH, 1), 1);
      stage.style.transform = 'scale(' + scale.toFixed(4) + ')';
      // 縮小後の実寸を親に伝え、上下中央に置く
      inner.style.width = W + 'px';
      inner.style.height = natH + 'px';
      inner.style.setProperty('--nx-scale', String(scale));
    });
  }

  function schedule() {
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => { raf = 0; fitAll(); });
  }

  // 初期化と、内容・サイズが変わるたびに測り直す
  schedule();
  window.addEventListener('resize', schedule);
  window.addEventListener('orientationchange', schedule);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(schedule);
  window.addEventListener('load', schedule);
  // 他モジュールが中身を後から生成する（タイムライン・円環・チャート等）ため、
  // スライド着地のたびに測り直す
  document.addEventListener('nx:slide', schedule);
  // 画像・動画の読み込み完了でも高さが変わる
  document.querySelectorAll('img, video').forEach((el) => {
    el.addEventListener('load', schedule, { once: true });
    el.addEventListener('loadedmetadata', schedule, { once: true });
  });
  setTimeout(schedule, 400);
  setTimeout(schedule, 1200);
  setTimeout(schedule, 2500);

  window.__nxFit = fitAll;
}
