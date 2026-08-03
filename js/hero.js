/* =========================================================================
   js/hero.js — 班B / Three.js ヒーロー背景
   ---------------------------------------------------------------------
   #hero-canvas に「暗闇を緩やかに流れるシアンの微粒子 + 遠近の床グリッド」を描く。
   - 名前付き export は init() ひとつだけ（引数なし・戻り値なし）
   - #hero-canvas が無ければ即 return
   - 失敗しても throw せず console.error に留める
   ========================================================================= */

import * as THREE from 'three';

/* ---------- チューニング値（すべてここに集約） ---------- */
const CFG = {
  particles: 9000,          // PC。SPは 6000（CONTRACT: 6000〜12000）
  particlesSP: 6000,
  lanes: 6,                 // 「流れ」の本数
  strayRatio: 0.16,         // 流れに属さない浮遊粒子の割合

  camZ: 8,
  camY: 0.8,
  lookAt: [0, -0.2, -12],
  fovBase: 55,

  zFar: -70,                // 粒子の発生位置（奥）
  zSpan: 76,                // 奥→手前の移動距離（-70 → +6）
  speedMin: 0.55,           // units/sec（等速。加減速なし）
  speedMax: 1.35,

  fog: 0.020,               // 奥へ向かってのフェード係数
  nearFade: 11.0,           // カメラ手前で消える距離（近景の巨大ボケを抑える）

  gridY: -4.4,
  gridCell: 2.8,
  gridHalfX: 45,
  gridZStart: -50,
  gridCells: 22,
  gridOpacity: 0.06,        // rgba(255,255,255,.06)。線幅1device px分を dpr で補正する
  gridSpeed: 0.45,          // units/sec

  mouseAmp: 0.5,            // カメラ追従量（≒1.4度）
  mouseAmpY: 0.28,
  mouseEase: 1.8
};

const COL_ACCENT = 0x3b82f6;   // --accent
const COL_ACCENT2 = 0x2b6cff;  // --accent-2
const COL_PALE = 0xbfeeff;     // 淡いシアン（ハイライト用）

/* ---------- シェーダ ---------- */
const PARTICLE_VERT = /* glsl */ `
  uniform float uTime;
  uniform float uScale;
  uniform float uPixelRatio;
  uniform float uFog;
  uniform float uZFar;
  uniform float uSpan;
  uniform float uNearFade;

  attribute vec4 aFlow;   // x:progress offset  y:speed(cycles/s)  z:phaseX  w:phaseY
  attribute vec4 aLane;   // x:baseX  y:baseY  z:ampX  w:freqX
  attribute vec4 aWave;   // x:ampY  y:freqY  z:shimmer freq  w:shimmer phase
  attribute vec2 aStyle;  // x:size  y:alpha
  attribute vec3 aColor;

  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    float p = fract(aFlow.x + uTime * aFlow.y);
    float z = uZFar + p * uSpan + position.z;
    float x = aLane.x + aLane.z * sin(z * aLane.w + aFlow.z) + position.x;
    float y = aLane.y + aWave.x * sin(z * aWave.y + aFlow.w) + position.y;

    vec4 mv = modelViewMatrix * vec4(x, y, z, 1.0);
    float dist = max(-mv.z, 0.001);
    gl_Position = projectionMatrix * mv;

    gl_PointSize = clamp(aStyle.x * uScale / dist, 1.0, 9.0 * uPixelRatio);

    float fogAmt = 1.0 - exp(-pow(uFog * dist, 2.0));
    float near = smoothstep(0.0, uNearFade, dist);
    float shimmer = 0.9 + 0.1 * sin(uTime * aWave.z + aWave.w);

    vAlpha = aStyle.y * (1.0 - fogAmt) * near * shimmer;
    vColor = aColor;
  }
`;

const PARTICLE_FRAG = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    vec2 c = gl_PointCoord - vec2(0.5);
    float d2 = dot(c, c);
    if (d2 > 0.25) discard;
    float a = smoothstep(0.25, 0.02, d2) * vAlpha;
    gl_FragColor = vec4(vColor * a, a);   // premultiplied
  }
`;

const GRID_VERT = /* glsl */ `
  uniform float uFog;
  varying float vFade;

  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float dist = max(-mv.z, 0.001);
    float fogAmt = 1.0 - exp(-pow(uFog * dist, 2.0));
    // 手前は寝かせ、地平線手前で消す（線が密集して明るい帯／モアレになるのを防ぐ）
    float near = smoothstep(3.0, 16.0, dist);
    float far = 1.0 - smoothstep(24.0, 44.0, dist);
    vFade = (1.0 - fogAmt) * near * far;
    gl_Position = projectionMatrix * mv;
  }
`;

const GRID_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vFade;

  void main() {
    float a = uOpacity * vFade;
    gl_FragColor = vec4(uColor * a, a);   // premultiplied
  }
`;

/* ---------- エントリポイント ---------- */
export function init() {
  const canvas = document.getElementById('hero-canvas');
  if (!canvas) return;
  try {
    build(canvas);
  } catch (err) {
    console.error('[NX hero] 初期化に失敗しました:', err);
  }
}

/* ---------- 本体 ---------- */
function build(canvas) {
  const hero = document.getElementById('hero') || canvas.parentElement;
  const reduce = !!(window.NX && window.NX.reduce);

  const pr0 = Math.min(window.devicePixelRatio || 1, 2);
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: pr0 < 1.5,
      powerPreference: 'high-performance'
    });
  } catch (err) {
    console.error('[NX hero] WebGL を初期化できませんでした:', err);
    return;
  }
  renderer.setPixelRatio(pr0);
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(CFG.fovBase, 1, 0.1, 200);
  camera.position.set(0, CFG.camY, CFG.camZ);
  camera.lookAt(CFG.lookAt[0], CFG.lookAt[1], CFG.lookAt[2]);

  const particles = createParticles(pr0);
  const grid = createGrid();
  scene.add(grid.object);
  scene.add(particles.object);

  /* ---- リサイズ ---- */
  let width = 0;
  let height = 0;

  function resize() {
    const w = canvas.clientWidth || (hero && hero.clientWidth) || window.innerWidth;
    const h = canvas.clientHeight || (hero && hero.clientHeight) || window.innerHeight;
    if (!w || !h) return false;
    if (w === width && h === height) return false;
    width = w;
    height = h;

    const pr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);

    const aspect = w / h;
    camera.aspect = aspect;
    camera.fov = aspect >= 1.2 ? CFG.fovBase : Math.min(78, CFG.fovBase + (1.2 - aspect) * 30);
    camera.updateProjectionMatrix();

    particles.uniforms.uScale.value = h * pr * 0.5;
    particles.uniforms.uPixelRatio.value = pr;
    // 線幅は常に1デバイスpx。CSS px 換算で .06 相当の濃さになるよう dpr を掛ける
    grid.uniforms.uOpacity.value = CFG.gridOpacity * pr;
    return true;
  }

  let dirty = true;
  function markDirty() { dirty = true; }
  function applyResize() {
    if (!dirty) return;
    dirty = false;
    resize();
  }
  applyResize();

  /* ---- マウス追従（fine pointer のみ／タッチ端末は無効） ---- */
  const canHover =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  const mouse = { tx: 0, ty: 0, x: 0, y: 0 };
  function onPointerMove(e) {
    if (!width || !height) return;
    mouse.tx = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.ty = (e.clientY / window.innerHeight) * 2 - 1;
  }
  if (canHover && !reduce) {
    window.addEventListener('pointermove', onPointerMove, { passive: true });
  }

  /* ---- 描画ループ制御 ---- */
  let running = false;
  let rafId = 0;
  let last = 0;
  let time = 0;
  let inView = true;
  let lost = false;

  function renderFrame() {
    camera.position.x = mouse.x * CFG.mouseAmp;
    camera.position.y = CFG.camY - mouse.y * CFG.mouseAmpY;
    camera.lookAt(CFG.lookAt[0], CFG.lookAt[1], CFG.lookAt[2]);
    particles.uniforms.uTime.value = time;
    grid.object.position.z = (time * CFG.gridSpeed) % CFG.gridCell;
    renderer.render(scene, camera);
  }

  function tick(now) {
    if (!running) return;
    rafId = requestAnimationFrame(tick);
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    time += dt;
    const k = 1 - Math.exp(-CFG.mouseEase * dt);
    mouse.x += (mouse.tx - mouse.x) * k;
    mouse.y += (mouse.ty - mouse.y) * k;
    applyResize();
    renderFrame();
  }

  function shouldRun() {
    return !reduce && !lost && inView && !document.hidden;
  }

  function start() {
    if (running || !shouldRun()) return;
    running = true;
    last = performance.now();
    rafId = requestAnimationFrame(tick);
  }

  function stop() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
  }

  function drawStill() {
    applyResize();
    if (!width || !height) return;
    renderFrame();
  }

  /* ---- 可視性 ---- */
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else start();
  });

  function onIntersect(entries) {
    const en = entries[entries.length - 1];
    if (!en) return;
    const r = en.boundingClientRect;
    // レイアウト未確定（幅ゼロ）の通知は無視する
    if (!r || r.width === 0 || r.height === 0) return;
    inView = en.isIntersecting;
    if (inView) start();
    else stop();
  }

  if (hero && 'IntersectionObserver' in window) {
    new IntersectionObserver(onIntersect, { threshold: 0 }).observe(hero);
  }

  function onResize() {
    markDirty();
    if (running) return;
    start();
    if (!running) drawStill();
  }
  window.addEventListener('resize', onResize);
  if ('ResizeObserver' in window) {
    new ResizeObserver(onResize).observe(canvas);
  }

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    lost = true;
    stop();
  });
  canvas.addEventListener('webglcontextrestored', () => {
    lost = false;
    start();
  });

  /* ---- 起動 ---- */
  if (reduce) {
    drawStill();                       // アニメを回さず1フレームだけ
  } else {
    drawStill();
    start();
  }
  // フォント読込等でヒーロー高さが変わるケースの保険
  setTimeout(onResize, 500);
}

/* ---------- 粒子 ---------- */
function createParticles(pixelRatio) {
  const isSP = Math.min(window.innerWidth, window.innerHeight) < 768 && window.innerWidth < 768;
  const count = isSP ? CFG.particlesSP : CFG.particles;

  const pos = new Float32Array(count * 3);
  const flow = new Float32Array(count * 4);
  const lane = new Float32Array(count * 4);
  const wave = new Float32Array(count * 4);
  const style = new Float32Array(count * 2);
  const color = new Float32Array(count * 3);

  // 「流れ」の定義
  const lanes = [];
  for (let i = 0; i < CFG.lanes; i++) {
    const t = CFG.lanes === 1 ? 0.5 : i / (CFG.lanes - 1);
    lanes.push({
      baseX: -7.6 + t * 15.2 + (Math.random() - 0.5) * 1.4,
      baseY: -2.0 + Math.random() * 4.0,
      ampX: 1.6 + Math.random() * 1.8,
      freqX: 0.030 + Math.random() * 0.045,
      ampY: 0.6 + Math.random() * 1.1,
      freqY: 0.018 + Math.random() * 0.032,
      radius: 0.5 + Math.random() * 0.5
    });
  }

  const cA = new THREE.Color(COL_ACCENT);
  const cB = new THREE.Color(COL_ACCENT2);
  const cP = new THREE.Color(COL_PALE);
  const tmp = new THREE.Color();

  for (let i = 0; i < count; i++) {
    const stray = Math.random() < CFG.strayRatio;
    const L = lanes[(Math.random() * lanes.length) | 0];

    // 流れの中心からの半径オフセット（中心が濃くなるよう二乗で寄せる）
    const r = stray ? 3.5 + Math.random() * 9 : L.radius * Math.pow(Math.random(), 0.55);
    const a = Math.random() * Math.PI * 2;
    const i3 = i * 3;
    const i4 = i * 4;
    const i2 = i * 2;

    pos[i3] = Math.cos(a) * r * (stray ? 1.5 : 1);
    pos[i3 + 1] = Math.sin(a) * r * (stray ? 0.7 : 1);
    pos[i3 + 2] = (Math.random() - 0.5) * 0.8;

    flow[i4] = Math.random();                                        // 位相（均一 = 密度が波打たない）
    const speed = CFG.speedMin + Math.random() * (CFG.speedMax - CFG.speedMin);
    flow[i4 + 1] = speed / CFG.zSpan;                                // cycles/sec（等速）
    flow[i4 + 2] = Math.random() * Math.PI * 2;
    flow[i4 + 3] = Math.random() * Math.PI * 2;

    lane[i4] = L.baseX;
    lane[i4 + 1] = L.baseY;
    lane[i4 + 2] = stray ? L.ampX * 0.4 : L.ampX;
    lane[i4 + 3] = L.freqX;

    wave[i4] = stray ? L.ampY * 0.4 : L.ampY;
    wave[i4 + 1] = L.freqY;
    wave[i4 + 2] = 0.25 + Math.random() * 0.5;                       // shimmer freq（ごく僅か）
    wave[i4 + 3] = Math.random() * Math.PI * 2;

    const sz = Math.random();
    style[i2] = 0.042 + sz * sz * 0.085;
    style[i2 + 1] = stray ? 0.05 + Math.random() * 0.08 : 0.16 + Math.random() * 0.3;

    // シアン〜青のみ。稀に淡いシアンのハイライト
    if (Math.random() < 0.1) tmp.copy(cP);
    else tmp.copy(cA).lerp(cB, Math.random() * 0.8);
    color[i3] = tmp.r;
    color[i3 + 1] = tmp.g;
    color[i3 + 2] = tmp.b;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aFlow', new THREE.BufferAttribute(flow, 4));
  geo.setAttribute('aLane', new THREE.BufferAttribute(lane, 4));
  geo.setAttribute('aWave', new THREE.BufferAttribute(wave, 4));
  geo.setAttribute('aStyle', new THREE.BufferAttribute(style, 2));
  geo.setAttribute('aColor', new THREE.BufferAttribute(color, 3));

  const uniforms = {
    uTime: { value: 0 },
    uScale: { value: 400 },
    uPixelRatio: { value: pixelRatio },
    uFog: { value: CFG.fog },
    uZFar: { value: CFG.zFar },
    uSpan: { value: CFG.zSpan },
    uNearFade: { value: CFG.nearFade }
  };

  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: PARTICLE_VERT,
    fragmentShader: PARTICLE_FRAG,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    // フラグメントは premultiplied で出力している。
    // three は material.premultipliedAlpha を見て blendFunc を決める（既定 false = SRC_ALPHA,ONE）。
    // true にしないと出力が二重に alpha 倍され、意図の 1/5 の明るさになる。
    premultipliedAlpha: true
  });

  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;   // 位置は頂点シェーダで生成するため
  points.renderOrder = 2;

  return { object: points, uniforms, count };
}

/* ---------- 床グリッド ---------- */
function createGrid() {
  const cell = CFG.gridCell;
  const halfX = CFG.gridHalfX;
  const cols = Math.round(halfX / cell);
  const rows = CFG.gridCells;
  const y = CFG.gridY;
  const z0 = CFG.gridZStart;

  const verts = [];

  // 横線（z 固定）— 距離フェードのため cell 単位に分割
  for (let r = 0; r <= rows; r++) {
    const z = z0 + r * cell;
    for (let c = -cols; c < cols; c++) {
      verts.push(c * cell, y, z, (c + 1) * cell, y, z);
    }
  }
  // 縦線（x 固定）— 同様に分割
  for (let c = -cols; c <= cols; c++) {
    const x = c * cell;
    for (let r = 0; r < rows; r++) {
      verts.push(x, y, z0 + r * cell, x, y, z0 + (r + 1) * cell);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));

  const uniforms = {
    uFog: { value: CFG.fog },
    uColor: { value: new THREE.Color(0xffffff) },
    uOpacity: { value: CFG.gridOpacity }
  };

  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: GRID_VERT,
    fragmentShader: GRID_FRAG,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    premultipliedAlpha: true   // 粒子と同じ理由（premultiplied 出力のため）
  });

  const lines = new THREE.LineSegments(geo, mat);
  lines.frustumCulled = false;
  lines.renderOrder = 1;

  return { object: lines, uniforms };
}
