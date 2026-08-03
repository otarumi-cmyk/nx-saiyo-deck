// main.js — モジュール起動のみ。各班はこのファイルを編集しない。
import { init as initHero } from './hero.js';
import { init as initTimeline } from './timeline.js';
import { init as initViz } from './viz.js';
import { init as initCore3d } from './core3d.js';
import { init as initCharts } from './charts.js';
import { init as initDeck } from './deck.js';

const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
window.NX = { reduce };

// data-img を CSS変数 --chdiv-img に流し込む（章扉・CTAの背景画像）
function bindSectionImages() {
  document.querySelectorAll('[data-img]').forEach((el) => {
    const src = el.getAttribute('data-img');
    // カスタムプロパティ内の相対URLは、それを使うCSSファイル基準で解決されてしまう。
    // （css/deck.css から使うと css/assets/... を探しに行って404になる）
    // ドキュメント基準の絶対URLに直してから渡す。
    if (src) {
      const abs = new URL(src, document.baseURI).href;
      el.style.setProperty('--chdiv-img', 'url("' + abs + '")');
    }
  });
}

function boot() {
  if (window.gsap && window.ScrollTrigger) {
    window.gsap.registerPlugin(window.ScrollTrigger);
  }
  bindSectionImages();
  const safe = (name, fn) => {
    try { fn(); } catch (e) { console.error('[NX] ' + name + ' failed:', e); }
  };
  safe('hero', initHero);
  safe('timeline', initTimeline);
  safe('viz', initViz);
  safe('core3d', initCore3d);
  safe('charts', initCharts);
  safe('deck', initDeck);

  if (window.ScrollTrigger) {
    window.addEventListener('load', () => window.ScrollTrigger.refresh());
    setTimeout(() => window.ScrollTrigger.refresh(), 600);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
