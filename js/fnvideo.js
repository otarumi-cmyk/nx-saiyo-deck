// fnvideo.js — 機能スライドの映像を、そのスライドにいるときだけ再生する
export function init() {
  const vids = Array.from(document.querySelectorAll('video.fn-v'));
  if (!vids.length) return;
  const reduce = !!(window.NX && window.NX.reduce);

  function apply(slide) {
    vids.forEach((v) => {
      const inSlide = slide && slide.contains(v);
      if (inSlide) {
        if (v.preload === 'none') v.preload = 'auto';
        if (reduce) { v.pause(); return; }
        const p = v.play();
        if (p && p.catch) p.catch(() => {});
      } else if (!v.paused) {
        v.pause();
        v.currentTime = 0;
      }
    });
  }
  document.addEventListener('nx:slide', (e) => apply(e.detail && e.detail.slide));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) vids.forEach((v) => v.pause());
    else apply(document.querySelector('.slide.is-active'));
  });
  apply(document.querySelector('.slide.is-active'));
}
