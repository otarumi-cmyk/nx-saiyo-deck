// deck.js — 横フリックのスライドデッキ本体
// ・スワイプ／キーボード／ドット／ボタンでめくる
// ・めくる最中は3Dの奥行き変形（連続）、着地したら入場アニメ（不連続）の2段構え
// 司令塔が管理。班は編集しない。

const CENTER_EASE = 'power3.out';

export function init() {
  const deck = document.getElementById('deck');
  if (!deck) return;

  const slides = Array.from(deck.querySelectorAll('.slide'));
  if (!slides.length) return;

  const reduce = !!(window.NX && window.NX.reduce);
  const gsap = window.gsap;

  // ---------- UI ----------
  const dotsWrap = document.getElementById('deck-dots');
  const btnPrev = document.getElementById('deck-prev');
  const btnNext = document.getElementById('deck-next');
  const elCur = document.getElementById('deck-cur');
  const elTotal = document.getElementById('deck-total');
  const bar = document.querySelector('#deck-progress span');
  const hint = document.getElementById('deck-hint');

  if (elTotal) elTotal.textContent = String(slides.length);

  const dots = slides.map((s, i) => {
    if (!dotsWrap) return null;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'deck-dot';
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-label', (i + 1) + '. ' + (s.dataset.title || ''));
    b.addEventListener('click', () => go(i));
    dotsWrap.appendChild(b);
    return b;
  });

  // ---------- 画面転換のフラッシュ ----------
  const flash = document.createElement('div');
  flash.className = 'deck-flash';
  flash.setAttribute('aria-hidden', 'true');
  document.body.appendChild(flash);

  let current = -1;
  let ticking = false;

  const width = () => deck.clientWidth || window.innerWidth;

  function go(i) {
    const n = Math.max(0, Math.min(slides.length - 1, i));
    deck.scrollTo({ left: n * width(), behavior: reduce ? 'auto' : 'smooth' });
  }

  // ---------- めくる最中の連続変形 ----------
  // 中心からの距離 p（-1..1）で、奥行き・回転・視差を与える
  function paint() {
    const w = width();
    const x = deck.scrollLeft;
    for (let i = 0; i < slides.length; i++) {
      const s = slides[i];
      const p = (i * w - x) / w;              // 0 = 画面中央
      const a = Math.abs(p);
      if (a > 1.15) {                          // 画面外は描画コストを捨てる
        if (s.style.visibility !== 'hidden') s.style.visibility = 'hidden';
        continue;
      }
      if (s.style.visibility) s.style.visibility = '';

      const inner = s.querySelector('.slide-in');
      if (inner) {
        // 中身は逆方向にずらして視差、奥に倒しながら縮む
        inner.style.transform =
          'translate3d(' + (-p * 14) + '%,0,' + (-a * 260) + 'px) ' +
          'rotateY(' + (p * 16) + 'deg) scale(' + (1 - a * 0.14) + ')';
        inner.style.opacity = String(Math.max(0, 1 - a * 1.25));
      }
      // 背景レイヤー（章扉画像・canvas）はゆっくり動かして奥行きを出す
      const bg = s.querySelector('.vision-bg, canvas');
      if (bg && bg.tagName !== 'CANVAS') {
        bg.style.transform = 'translate3d(' + (p * 6) + '%,0,0) scale(1.08)';
      }
    }

    const idx = Math.round(x / w);
    if (idx !== current) setActive(idx);

    if (bar) bar.style.width = ((x / Math.max(1, (slides.length - 1) * w)) * 100) + '%';
    ticking = false;
  }

  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(paint);
  }

  // ---------- 着地したときの入場アニメ ----------
  function setActive(idx) {
    const prev = current;
    current = idx;

    slides.forEach((s, i) => s.classList.toggle('is-active', i === idx));
    dots.forEach((d, i) => d && d.classList.toggle('is-on', i === idx));
    if (elCur) elCur.textContent = String(idx + 1);
    if (btnPrev) btnPrev.disabled = idx === 0;
    if (btnNext) btnNext.disabled = idx === slides.length - 1;
    if (hint && idx > 0) hint.classList.add('is-gone');

    const slide = slides[idx];
    if (!slide) return;

    // 他モジュール（timeline / viz / charts / core3d）への合図
    slide.dispatchEvent(new CustomEvent('nx:enter', { bubbles: true, detail: { index: idx } }));
    document.dispatchEvent(new CustomEvent('nx:slide', { detail: { index: idx, slide: slide } }));

    if (reduce || !gsap) {
      slide.querySelectorAll('.reveal').forEach((el) => el.classList.add('is-in'));
      return;
    }

    // 転換フラッシュ（前後に動いたときだけ）
    if (prev !== -1 && prev !== idx) {
      gsap.fromTo(flash,
        { opacity: 0.5, x: (idx > prev ? '-100%' : '100%') },
        { opacity: 0, x: (idx > prev ? '100%' : '-100%'), duration: 0.75, ease: 'power2.out' });
    }

    // 入場：見出し → 中身 の順に段差をつけて出す
    const items = slide.querySelectorAll('.reveal');
    items.forEach((el) => el.classList.remove('is-in'));

    const q = (sel) => { const n = slide.querySelectorAll(sel); return n.length ? n : null; };
    const tl = gsap.timeline();
    tl.fromTo(q('.sec-label, .chdiv-n, .hero-eyebrow') || [],
      { opacity: 0, y: 14, letterSpacing: '0.5em' },
      { opacity: 1, y: 0, letterSpacing: '0.14em', duration: 0.7, ease: CENTER_EASE }, 0);

    tl.fromTo(q('.sec-title, .q-big, .chdiv-t, .hero-title, .vision-title, .product-name, .cta-title, .tl-title') || [],
      { opacity: 0, y: 34, filter: 'blur(10px)' },
      { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.95, ease: CENTER_EASE }, 0.08);

    tl.add(() => { items.forEach((el) => el.classList.add('is-in')); }, 0.25);

    // 大きな数値は少し遅らせて「立ち上がる」
    const bigs = slide.querySelectorAll('.stat-v, .bignum-v, .price-v, .tl-meter-v');
    if (bigs.length) {
      tl.fromTo(bigs,
        { opacity: 0, scale: 0.82, y: 20 },
        { opacity: 1, scale: 1, y: 0, duration: 1.0, ease: CENTER_EASE, stagger: 0.09 }, 0.3);
    }

    // カード群は順に
    const cards = slide.querySelectorAll('.fn, .only-card, .why, .case, .cp, .safe, .flow-steps li, .faq-list details');
    if (cards.length) {
      tl.fromTo(cards,
        { opacity: 0, y: 26 },
        { opacity: 1, y: 0, duration: 0.7, ease: CENTER_EASE, stagger: 0.045 }, 0.28);
    }
  }

  // ---------- 操作 ----------
  deck.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', () => { go(current); requestAnimationFrame(paint); });

  if (btnPrev) btnPrev.addEventListener('click', () => go(current - 1));
  if (btnNext) btnNext.addEventListener('click', () => go(current + 1));

  document.addEventListener('keydown', (e) => {
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); go(current + 1); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); go(current - 1); }
    else if (e.key === 'Home') { e.preventDefault(); go(0); }
    else if (e.key === 'End') { e.preventDefault(); go(slides.length - 1); }
  });

  // 縦ホイールを横めくりに変換（PCのトラックパッド／マウス）
  let wheelLock = false;
  deck.addEventListener('wheel', (e) => {
    // fit.js が中身を縮小して収めるため、スライド内の縦スクロールは無い
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
    e.preventDefault();
    if (wheelLock) return;
    if (Math.abs(e.deltaY) < 12) return;
    wheelLock = true;
    go(current + (e.deltaY > 0 ? 1 : -1));
    setTimeout(() => { wheelLock = false; }, 620);
  }, { passive: false });

  // 初期化
  requestAnimationFrame(() => { paint(); setActive(0); });
}
