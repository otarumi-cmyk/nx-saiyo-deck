/* =========================================================================
   js/core3d.js — 班G / 3D演出（Three.js）
   ---------------------------------------------------------------------
   1) #core-canvas（#vision）
      「雑務がAIに吸い込まれて消え、最終面接だけが残る」を表す発光コア。
      外周から中心へ螺旋状に落ち込む粒子 ＝ 吸収され続ける雑務。
      スクロールが進むほど発光・回転が強まり、後半は“供給（雑務）”自体が
      減っていき、静かなコアだけが残る。
   2) #orbit-canvas（#map .orbit）
      7機能の円環の背後。採用フローが1周し続けることを表す3Dリング。
      DOMノードの半径に合わせた光の流れ＋傾いた2枚の軌道リング（奥行き）。

   契約:
   - 名前付き export は init() ひとつだけ（引数なし・戻り値なし）
   - 対象canvasが無ければその分をスキップ。両方無ければ即return
   - 初期化に失敗しても throw しない（console.error に留める）
   - 描画は「document.hidden でない」かつ「対象が画面内」のときだけ
   - window.NX.reduce のときは1フレームだけ描いて静止
   ========================================================================= */

import * as THREE from 'three';

/* ---------- 色（シアン〜青のみ。暖色は使わない） ---------- */
const COL_ACCENT = new THREE.Color(0x3b82f6); // --accent
const COL_ACCENT2 = new THREE.Color(0x2b6cff); // --accent-2
const COL_PALE = new THREE.Color(0xbfeeff); // 淡いシアン

/* ---------- チューニング値 ---------- */
const CFG = {
  core: {
    fov: 45,
    camZ: 9.0,
    particles: 2600, // PC
    particlesSP: 1300, // <=768px
    moteRatio: 0.05, // 大粒（＝雑務ひとかたまり）の割合
    rInner: 0.48, // 吸い込まれきる半径
    rOutMin: 2.8,
    rOutMax: 6.0,
    speedMin: 0.020, // 1周（外→中心）あたりの基本速度 cycles/sec
    speedMax: 0.052,
    diskRatio: 0.66, // 降着円盤に沿う粒子の割合
    diskNormal: [0.15, 0.62, 0.77],
    diskJitter: 0.42,
    camDrift: 0.34, // 視差用のカメラ揺れ（unit）
    runSec: 6.5 // デッキ構成で「吸収→静止」を1周させる秒数
  },
  orbit: {
    fov: 40,
    camZ: 6.0,
    nodeRadiusPct: 0.37, // viz.js の ORBIT_RADIUS と同じ（DOMノードの軌道）
    dust: 620,
    pulses: 3, // 円環を巡る光のかたまりの数
    pulseLapSec: 22, // 光が1周する秒数
    dustLapSec: 96, // 微粒子そのものの回転
    ringALap: 54, // 傾いた軌道リングAの歳差
    ringBLap: 78
  }
};

/* ---------- 小物 ---------- */
function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

function smoothstep(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

// 決定論的な擬似乱数（毎回同じ散り方にする）
function makeRnd(seed) {
  let s = seed >>> 0;
  return function () {
    s += 0x6d2b79f5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- 共通シェーダ片 ---------- */

// 発光ハロー（ビルボード板）
const HALO_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const HALO_FRAG = /* glsl */ `
  uniform vec3 uColA;
  uniform vec3 uColB;
  uniform float uI;
  uniform float uSoft;
  varying vec2 vUv;
  void main() {
    float d = length(vUv - 0.5) * 2.0;
    float g = pow(clamp(1.0 - d, 0.0, 1.0), uSoft);
    float a = g * uI;
    vec3 c = mix(uColB, uColA, g);
    gl_FragColor = vec4(c * a, a);
  }
`;

// リング（トーラス）：主円周方向に光の帯が流れる
const RING_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const RING_FRAG = /* glsl */ `
  uniform vec3 uColA;
  uniform vec3 uColB;
  uniform float uI;
  uniform float uPhase;
  uniform float uK;
  uniform float uBase;
  varying vec2 vUv;
  void main() {
    float w = pow(max(sin(vUv.x * uK * 6.2831853 - uPhase) * 0.5 + 0.5, 0.0), 7.0);
    float a = uI * (uBase + 0.95 * w);
    vec3 c = mix(uColB, uColA, w);
    gl_FragColor = vec4(c * a, a);
  }
`;

// 球殻（フレネルのリム発光）
const SHELL_VERT = /* glsl */ `
  varying vec3 vN;
  varying vec3 vE;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vE = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

const SHELL_FRAG = /* glsl */ `
  uniform vec3 uColA;
  uniform vec3 uColB;
  uniform float uI;
  uniform float uPow;
  uniform float uBase;
  varying vec3 vN;
  varying vec3 vE;
  void main() {
    float f = 1.0 - abs(dot(normalize(vN), normalize(vE)));
    float rim = pow(clamp(f, 0.0, 1.0), uPow);
    float a = (uBase + rim) * uI;
    vec3 c = mix(uColB, uColA, rim);
    gl_FragColor = vec4(c * a, a);
  }
`;

// 吸い込まれる粒子
const IN_VERT = /* glsl */ `
  uniform float uFlow;      // 累積フロー（＝吸い込みの進み具合）
  uniform float uScale;     // ピクセルサイズ換算
  uniform float uPR;
  uniform float uI;         // 0..1 コアの強さ
  uniform float uSupply;    // 1..0 供給される雑務の量
  uniform float uSpread;    // 画面比率に応じた外周スケール
  uniform float uRIn;
  uniform float uGain;      // セクションの暗幕（#vision::after）越しでも見える明るさ

  attribute vec3 aU;        // 軌道面の基底1
  attribute vec3 aV;        // 軌道面の基底2
  attribute vec4 aP;        // x:位相 y:速度 z:外周半径 w:初期角
  attribute vec3 aS;        // x:サイズ y:明るさ z:供給用の乱数
  attribute vec3 aColor;

  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    float t = fract(aP.x + uFlow * aP.y);
    float rOut = aP.z * uSpread;
    float k = pow(1.0 - t, 0.85);            // 中心が近いほど速く落ちる
    float r = uRIn + (rOut - uRIn) * k;
    float rn = clamp(r / rOut, 0.02, 1.0);
    float ang = aP.w + uFlow * 0.55 + (1.0 / max(rn, 0.16) - 1.0) * 0.55;

    vec3 pos = (cos(ang) * aU + sin(ang) * aV) * r;

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;

    float dist = max(-mv.z, 0.001);
    float grow = mix(1.0, 1.75, smoothstep(0.55, 0.97, t));
    gl_PointSize = clamp(aS.x * grow * uScale / dist, 1.0, 13.0 * uPR);

    float fadeIn = smoothstep(0.0, 0.07, t);
    float fadeOut = 1.0 - smoothstep(0.93, 1.0, t);
    float sup = smoothstep(uSupply + 0.14, uSupply - 0.14, aS.z);

    vAlpha = aS.y * uGain * fadeIn * fadeOut * sup * (0.34 + 0.66 * uI);
    vColor = aColor * (0.72 + 0.85 * smoothstep(0.35, 1.0, t));
  }
`;

const IN_FRAG = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = dot(c, c) * 4.0;
    if (d > 1.0) discard;
    float g = pow(1.0 - d, 2.4);
    gl_FragColor = vec4(vColor * g, g * vAlpha);
  }
`;

// 円環を巡る光（#orbit）
const FLOW_VERT = /* glsl */ `
  uniform float uSpin;
  uniform float uPulse;
  uniform float uR;
  uniform float uScale;
  uniform float uPR;
  uniform float uK;
  uniform vec3 uColA;
  uniform vec3 uColB;

  attribute vec3 aA;   // x:初期角 y:半径ゆらぎ z:奥行きゆらぎ
  attribute vec2 aB;   // x:サイズ y:基本の明るさ

  varying float vAlpha;
  varying vec3 vColor;

  void main() {
    float th = aA.x + uSpin;
    float r = uR * (1.0 + aA.y);
    vec3 pos = vec3(cos(th) * r, sin(th) * r, aA.z * uR);

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;

    float dist = max(-mv.z, 0.001);
    float w = pow(max(sin(th * uK - uPulse) * 0.5 + 0.5, 0.0), 16.0);

    gl_PointSize = clamp(aB.x * (1.0 + 2.1 * w) * uScale / dist, 1.0, 20.0 * uPR);
    vAlpha = aB.y * (0.26 + 1.7 * w);
    vColor = mix(uColB, uColA, w);
  }
`;

const FLOW_FRAG = IN_FRAG;

/* ---------- シーン管理 ---------- */

let booted = false;
const scenes = [];
let rafId = 0;
let lastT = 0;
let reduceMode = false;

export function init() {
  if (booted) return;
  booted = true;

  const coreCanvas = document.getElementById('core-canvas');
  const orbitCanvas = document.getElementById('orbit-canvas');
  if (!coreCanvas && !orbitCanvas) return;

  reduceMode = !!(window.NX && window.NX.reduce);

  if (coreCanvas) {
    try {
      scenes.push(buildCore(coreCanvas));
    } catch (e) {
      console.error('[NX] core3d: #core-canvas init failed:', e);
    }
  }
  if (orbitCanvas) {
    try {
      scenes.push(buildOrbit(orbitCanvas));
    } catch (e) {
      console.error('[NX] core3d: #orbit-canvas init failed:', e);
    }
  }
  if (!scenes.length) return;

  bindLifecycle();
}

function makeRenderer(canvas, antialias) {
  const renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    alpha: true,
    antialias: !!antialias,
    powerPreference: 'high-performance'
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  return renderer;
}

function sizeOf(ctx) {
  const el = ctx.canvas;
  let w = el.clientWidth;
  let h = el.clientHeight;
  if ((!w || !h) && el.parentElement) {
    w = w || el.parentElement.clientWidth;
    h = h || el.parentElement.clientHeight;
  }
  return { w: Math.max(1, w | 0), h: Math.max(1, h | 0) };
}

function applySize(ctx, force) {
  const s = sizeOf(ctx);
  const pr = Math.min(window.devicePixelRatio || 1, 2);
  if (!force && s.w === ctx.w && s.h === ctx.h && pr === ctx.pr) return false;
  ctx.w = s.w;
  ctx.h = s.h;
  ctx.pr = pr;
  ctx.renderer.setPixelRatio(pr);
  ctx.renderer.setSize(s.w, s.h, false);
  ctx.camera.aspect = s.w / s.h;
  ctx.camera.updateProjectionMatrix();
  if (ctx.onResize) ctx.onResize(s.w, s.h, pr);
  return true;
}

function drawScene(ctx, t, dt) {
  if (!ctx.canvas.clientWidth || !ctx.canvas.clientHeight) return;
  applySize(ctx, false);
  ctx.update(t, dt);
  ctx.renderer.render(ctx.scene, ctx.camera);
  if (!ctx.live) {
    ctx.live = true;
    ctx.canvas.classList.add('is-live');
  }
}

function tick(now) {
  rafId = requestAnimationFrame(tick);
  const t = now * 0.001;
  let dt = lastT ? t - lastT : 0.016;
  lastT = t;
  if (dt > 0.1) dt = 0.1; // タブ復帰時に一気に進めない
  for (let i = 0; i < scenes.length; i++) {
    const ctx = scenes[i];
    if (!ctx.visible || ctx.dead) continue;
    drawScene(ctx, t, dt);
  }
}

function anyVisible() {
  for (let i = 0; i < scenes.length; i++) {
    if (scenes[i].visible && !scenes[i].dead) return true;
  }
  return false;
}

function updateLoop() {
  if (reduceMode) return;
  const want = !document.hidden && anyVisible();
  if (want && !rafId) {
    lastT = 0;
    rafId = requestAnimationFrame(tick);
  } else if (!want && rafId) {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }
}

function renderStill() {
  for (let i = 0; i < scenes.length; i++) {
    const ctx = scenes[i];
    if (ctx.dead) continue;
    try {
      drawScene(ctx, 4.2, 0);
    } catch (e) {
      console.error('[NX] core3d: still render failed:', e);
    }
  }
}

function bindLifecycle() {
  // resize
  let rt = 0;
  const onResize = function () {
    if (rt) clearTimeout(rt);
    rt = setTimeout(function () {
      rt = 0;
      for (let i = 0; i < scenes.length; i++) {
        if (!scenes[i].dead) applySize(scenes[i], true);
      }
      if (reduceMode) renderStill();
    }, 140);
  };
  window.addEventListener('resize', onResize, { passive: true });
  window.addEventListener('orientationchange', onResize, { passive: true });

  // WebGLコンテキスト喪失時は静かに降りる
  for (let i = 0; i < scenes.length; i++) {
    (function (ctx) {
      ctx.canvas.addEventListener('webglcontextlost', function (ev) {
        ev.preventDefault();
        ctx.dead = true;
        ctx.canvas.classList.remove('is-live');
        console.error('[NX] core3d: WebGL context lost (' + ctx.canvas.id + ')');
        updateLoop();
      });
    })(scenes[i]);
  }

  if (reduceMode) {
    // 静止画1枚。レイアウト確定を待ってから描く
    requestAnimationFrame(function () {
      requestAnimationFrame(renderStill);
    });
    window.addEventListener('load', renderStill);
    return;
  }

  document.addEventListener('visibilitychange', updateLoop);

  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(
      function (entries) {
        for (let i = 0; i < entries.length; i++) {
          const e = entries[i];
          for (let j = 0; j < scenes.length; j++) {
            if (scenes[j].watch === e.target) scenes[j].visible = e.isIntersecting;
          }
        }
        updateLoop();
      },
      { rootMargin: '140px 0px 140px 0px', threshold: 0 }
    );
    for (let i = 0; i < scenes.length; i++) io.observe(scenes[i].watch);
  } else {
    for (let i = 0; i < scenes.length; i++) scenes[i].visible = true;
  }
  updateLoop();
}

/* =========================================================================
   1) #core-canvas — 吸収されるコア
   ========================================================================= */

function buildCore(canvas) {
  const C = CFG.core;
  const sp = window.innerWidth <= 768;
  const count = sp ? C.particlesSP : C.particles;

  const renderer = makeRenderer(canvas, false);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(C.fov, 1, 0.1, 100);
  camera.position.set(0, 0, C.camZ);
  camera.lookAt(0, 0, 0);

  const group = new THREE.Group();
  scene.add(group);

  /* --- ハロー（コアのにじみ）
     中心は加算で飽和しやすい。赤成分を持つ淡色は使わず、シアン→青だけで
     組むことで、明るくしても暖色に転ばないようにする。 --- */
  const haloMat = new THREE.ShaderMaterial({
    uniforms: {
      uColA: { value: COL_ACCENT.clone() },
      uColB: { value: COL_ACCENT2.clone() },
      uI: { value: 0.4 },
      uSoft: { value: 3.0 }
    },
    vertexShader: HALO_VERT,
    fragmentShader: HALO_FRAG,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), haloMat);
  halo.scale.setScalar(4.4);
  halo.renderOrder = -2;
  group.add(halo);

  /* --- 球殻（内側の光の玉 ＋ 外殻のリム） --- */
  const orbMat = new THREE.ShaderMaterial({
    uniforms: {
      uColA: { value: COL_ACCENT.clone() },
      uColB: { value: COL_ACCENT2.clone() },
      uI: { value: 0.5 },
      uPow: { value: 0.9 },
      uBase: { value: 0.22 }
    },
    vertexShader: SHELL_VERT,
    fragmentShader: SHELL_FRAG,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.52, 40, 26), orbMat);
  group.add(orb);

  const shellMat = new THREE.ShaderMaterial({
    uniforms: {
      uColA: { value: COL_ACCENT.clone() },
      uColB: { value: COL_ACCENT2.clone() },
      uI: { value: 0.5 },
      uPow: { value: 2.6 },
      uBase: { value: 0.02 }
    },
    vertexShader: SHELL_VERT,
    fragmentShader: SHELL_FRAG,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const shell = new THREE.Mesh(new THREE.SphereGeometry(0.95, 48, 30), shellMat);
  group.add(shell);

  /* --- 回転が見えるワイヤ球 --- */
  const wireMat = new THREE.LineBasicMaterial({
    color: COL_ACCENT.clone(),
    transparent: true,
    opacity: 0.16,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const wire = new THREE.LineSegments(
    new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(0.86, 1)),
    wireMat
  );
  group.add(wire);

  /* --- リング2枚（軌道面） --- */
  function makeRing(radius, tube, k, colA, colB, base) {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uColA: { value: colA.clone() },
        uColB: { value: colB.clone() },
        uI: { value: 0.5 },
        uPhase: { value: 0 },
        uK: { value: k },
        uBase: { value: base }
      },
      vertexShader: RING_VERT,
      fragmentShader: RING_FRAG,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 6, 240), mat);
    return { mesh: mesh, mat: mat };
  }

  const ringA = makeRing(1.40, 0.010, 2, COL_ACCENT, COL_ACCENT2, 0.26);
  ringA.mesh.rotation.set(1.12, 0.24, 0);
  group.add(ringA.mesh);

  const ringB = makeRing(2.00, 0.007, 3, COL_ACCENT, COL_ACCENT2, 0.2);
  ringB.mesh.rotation.set(-0.72, -0.42, 0.5);
  group.add(ringB.mesh);

  /* --- 吸い込まれる粒子 --- */
  const rnd = makeRnd(20260803);
  const posArr = new Float32Array(count * 3);
  const uArr = new Float32Array(count * 3);
  const vArr = new Float32Array(count * 3);
  const pArr = new Float32Array(count * 4);
  const sArr = new Float32Array(count * 3);
  const cArr = new Float32Array(count * 3);

  const diskN = new THREE.Vector3(C.diskNormal[0], C.diskNormal[1], C.diskNormal[2]).normalize();
  const n = new THREE.Vector3();
  const u = new THREE.Vector3();
  const v = new THREE.Vector3();
  const helper = new THREE.Vector3();
  const col = new THREE.Color();

  for (let i = 0; i < count; i++) {
    // 軌道面（多くは降着円盤に沿う／一部はあらゆる方向から）
    if (rnd() < C.diskRatio) {
      n.set(
        diskN.x + (rnd() - 0.5) * C.diskJitter,
        diskN.y + (rnd() - 0.5) * C.diskJitter,
        diskN.z + (rnd() - 0.5) * C.diskJitter
      ).normalize();
    } else {
      const z = rnd() * 2 - 1;
      const a = rnd() * Math.PI * 2;
      const s = Math.sqrt(Math.max(0, 1 - z * z));
      n.set(s * Math.cos(a), s * Math.sin(a), z).normalize();
    }
    helper.set(0, 0, 1);
    if (Math.abs(n.z) > 0.9) helper.set(1, 0, 0);
    u.copy(helper).cross(n).normalize();
    v.copy(n).cross(u).normalize();

    uArr[i * 3] = u.x;
    uArr[i * 3 + 1] = u.y;
    uArr[i * 3 + 2] = u.z;
    vArr[i * 3] = v.x;
    vArr[i * 3 + 1] = v.y;
    vArr[i * 3 + 2] = v.z;

    const isMote = rnd() < C.moteRatio;
    pArr[i * 4] = rnd(); // 位相
    pArr[i * 4 + 1] = C.speedMin + rnd() * (C.speedMax - C.speedMin);
    pArr[i * 4 + 2] = C.rOutMin + rnd() * (C.rOutMax - C.rOutMin);
    pArr[i * 4 + 3] = rnd() * Math.PI * 2;

    sArr[i * 3] = isMote ? 0.040 + rnd() * 0.022 : 0.010 + rnd() * 0.016;
    sArr[i * 3 + 1] = isMote ? 0.62 + rnd() * 0.22 : 0.32 + rnd() * 0.4;
    sArr[i * 3 + 2] = rnd(); // 供給カリング用

    const mix = rnd();
    if (isMote) col.copy(COL_PALE);
    else if (mix < 0.5) col.copy(COL_ACCENT);
    else if (mix < 0.85) col.copy(COL_ACCENT2);
    else col.copy(COL_PALE);
    cArr[i * 3] = col.r;
    cArr[i * 3 + 1] = col.g;
    cArr[i * 3 + 2] = col.b;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
  geo.setAttribute('aU', new THREE.BufferAttribute(uArr, 3));
  geo.setAttribute('aV', new THREE.BufferAttribute(vArr, 3));
  geo.setAttribute('aP', new THREE.BufferAttribute(pArr, 4));
  geo.setAttribute('aS', new THREE.BufferAttribute(sArr, 3));
  geo.setAttribute('aColor', new THREE.BufferAttribute(cArr, 3));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), C.rOutMax + 2);

  const inMat = new THREE.ShaderMaterial({
    uniforms: {
      uFlow: { value: 0 },
      uScale: { value: 600 },
      uPR: { value: 1 },
      uI: { value: 0.4 },
      uSupply: { value: 1 },
      uSpread: { value: 1 },
      uRIn: { value: C.rInner },
      uGain: { value: 2.0 }
    },
    vertexShader: IN_VERT,
    fragmentShader: IN_FRAG,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const points = new THREE.Points(geo, inMat);
  points.frustumCulled = false;
  group.add(points);

  /* --- 進行度 ---------------------------------------------------------
     デッキ構成（横スライド）: #vision が .is-active の間だけ時間で進める。
       離れたら巻き戻すので、戻ってくるたびに吸収→静止をやり直す。
     縦スクロール構成: セクションのスクロール量をそのまま進行度にする。
     どちらの構成でも 0→1 で「吸い込みが強まり、やがて供給が尽きる」。 */
  const sec = document.getElementById('vision');
  const deckEl = document.getElementById('deck');
  const RUN = C.runSec;
  let elapsed = 0;

  function progress(dt) {
    if (!sec) return 0.5;
    if (deckEl) {
      if (sec.classList.contains('is-active')) {
        elapsed = Math.min(elapsed + dt, RUN);
      } else if (elapsed !== 0) {
        elapsed = 0;
      }
      return clamp(elapsed / RUN, 0, 1);
    }
    const rect = sec.getBoundingClientRect();
    const span = sec.offsetHeight - window.innerHeight;
    if (span <= 0) return clamp(1 - (rect.top + rect.height) / (window.innerHeight + rect.height), 0, 1);
    return clamp(-rect.top / span, 0, 1);
  }

  let flow = 0;
  let spin = 0;
  let ringPhase = 0;
  const ctx = {
    canvas: canvas,
    renderer: renderer,
    scene: scene,
    camera: camera,
    watch: sec || canvas,
    visible: false,
    live: false,
    dead: false,
    w: 0,
    h: 0,
    pr: 0,
    onResize: function (w, h, pr) {
      const fovRad = (C.fov * Math.PI) / 180;
      inMat.uniforms.uScale.value = (h * pr) / (2 * Math.tan(fovRad / 2));
      inMat.uniforms.uPR.value = pr;
      // 縦長画面では外周を締めて、粒子が画面外に散りすぎないようにする
      inMat.uniforms.uSpread.value = clamp(0.62 + (w / h) * 0.3, 0.62, 1.15);
      const s = clamp(0.78 + (w / h) * 0.16, 0.78, 1.06);
      group.scale.setScalar(s);
    },
    update: function (t, dt) {
      const p = reduceMode ? 0.72 : progress(dt);

      // 前半：吸い込みが強まる／後半：吸い込むものが尽き、コアが静まる
      const rise = smoothstep(0.02, 0.55, p);
      const settle = smoothstep(0.58, 0.9, p);

      const intensity = 0.3 + 0.7 * rise;
      const intake = 0.55 + 1.3 * rise - 0.9 * settle;
      const supply = 1 - 0.72 * settle;
      const pulse = 1 + 0.05 * Math.sin(t * 0.9);

      flow += dt * intake;
      spin += dt * (0.05 + 0.13 * rise - 0.05 * settle);
      ringPhase += dt * (0.5 + 1.5 * rise - 0.5 * settle);

      inMat.uniforms.uFlow.value = flow;
      inMat.uniforms.uI.value = intensity;
      inMat.uniforms.uSupply.value = supply;

      // コピー表示中は中心のにじみを落として可読性を守る
      haloMat.uniforms.uI.value = (0.5 + 1.15 * rise) * (1 - 0.45 * settle) * pulse;
      orbMat.uniforms.uI.value = (0.5 + 0.95 * rise) * (1 - 0.2 * settle) * pulse;
      shellMat.uniforms.uI.value = (0.62 + 1.55 * rise) * pulse;
      wireMat.opacity = 0.10 + 0.28 * rise;

      ringA.mat.uniforms.uI.value = 0.5 + 1.35 * rise;
      ringB.mat.uniforms.uI.value = 0.36 + 1.0 * rise;
      ringA.mat.uniforms.uPhase.value = ringPhase;
      ringB.mat.uniforms.uPhase.value = -ringPhase * 0.72;

      ringA.mesh.rotation.z = spin * 0.9;
      ringB.mesh.rotation.z = -spin * 0.6;
      ringA.mesh.rotation.y = 0.24 + spin * 0.35;
      ringB.mesh.rotation.y = -0.42 - spin * 0.24;

      wire.rotation.y = spin * 1.1;
      wire.rotation.x = spin * 0.4;
      shell.rotation.y = -spin * 0.5;

      // ごく緩やかな視差（3Dであることが分かる程度）
      const d = C.camDrift;
      camera.position.x = Math.sin(t * 0.07) * d;
      camera.position.y = Math.cos(t * 0.055) * d * 0.62;
      camera.lookAt(0, 0, 0);

      halo.quaternion.copy(camera.quaternion);
    }
  };

  applySize(ctx, true);
  return ctx;
}

/* =========================================================================
   2) #orbit-canvas — 1周し続ける採用フロー
   ========================================================================= */

function buildOrbit(canvas) {
  const O = CFG.orbit;

  const renderer = makeRenderer(canvas, true);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(O.fov, 1, 0.1, 100);
  camera.position.set(0, 0, O.camZ);
  camera.lookAt(0, 0, 0);

  const group = new THREE.Group();
  scene.add(group);

  // DOMノードの軌道半径（%）をワールド半径に換算する
  const fovRad = (O.fov * Math.PI) / 180;
  const halfH = O.camZ * Math.tan(fovRad / 2);
  const nodeR = O.nodeRadiusPct * 2 * halfH; // .orbit は正方形（aspect-ratio:1）

  /* --- 中央のほのかな光（.orbit-core の背後） --- */
  const haloMat = new THREE.ShaderMaterial({
    uniforms: {
      uColA: { value: COL_ACCENT.clone() },
      uColB: { value: COL_ACCENT2.clone() },
      uI: { value: 0.22 },
      uSoft: { value: 2.2 }
    },
    vertexShader: HALO_VERT,
    fragmentShader: HALO_FRAG,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), haloMat);
  halo.scale.setScalar(nodeR * 1.5);
  halo.renderOrder = -2;
  group.add(halo);

  /* --- 傾いた軌道リング2枚（奥行き） --- */
  function makeRing(radius, tube, k, colA, colB, base, opacity) {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uColA: { value: colA.clone() },
        uColB: { value: colB.clone() },
        uI: { value: opacity },
        uPhase: { value: 0 },
        uK: { value: k },
        uBase: { value: base }
      },
      vertexShader: RING_VERT,
      fragmentShader: RING_FRAG,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    });
    const holder = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 6, 220), mat);
    holder.add(mesh);
    group.add(holder);
    return { holder: holder, mesh: mesh, mat: mat };
  }

  const ringA = makeRing(nodeR * 1.13, nodeR * 0.009, 2, COL_PALE, COL_ACCENT, 0.34, 0.62);
  ringA.mesh.rotation.x = 1.09; // ≒62度：明確に楕円に見える角度
  const ringB = makeRing(nodeR * 0.78, nodeR * 0.007, 3, COL_ACCENT, COL_ACCENT2, 0.3, 0.44);
  ringB.mesh.rotation.set(-0.84, 0.0, 0.0);
  ringB.holder.rotation.z = 0.6;

  /* --- ノード軌道上を巡る光の流れ --- */
  const rnd = makeRnd(70707);
  const cnt = O.dust;
  const posArr = new Float32Array(cnt * 3);
  const aArr = new Float32Array(cnt * 3);
  const bArr = new Float32Array(cnt * 2);

  for (let i = 0; i < cnt; i++) {
    aArr[i * 3] = rnd() * Math.PI * 2;
    aArr[i * 3 + 1] = (rnd() - 0.5) * 0.03; // 半径ゆらぎ ±1.5%（軌道が滲まない程度）
    aArr[i * 3 + 2] = (rnd() - 0.5) * 0.035; // 奥行きゆらぎ
    bArr[i * 2] = 0.007 + rnd() * 0.015;
    bArr[i * 2 + 1] = 0.42 + rnd() * 0.55;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
  geo.setAttribute('aA', new THREE.BufferAttribute(aArr, 3));
  geo.setAttribute('aB', new THREE.BufferAttribute(bArr, 2));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), nodeR * 2);

  const flowMat = new THREE.ShaderMaterial({
    uniforms: {
      uSpin: { value: 0 },
      uPulse: { value: 0 },
      uR: { value: nodeR },
      uScale: { value: 600 },
      uPR: { value: 1 },
      uK: { value: O.pulses },
      uColA: { value: COL_PALE.clone() },
      uColB: { value: COL_ACCENT.clone() }
    },
    vertexShader: FLOW_VERT,
    fragmentShader: FLOW_FRAG,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const flow = new THREE.Points(geo, flowMat);
  flow.frustumCulled = false;
  group.add(flow);

  const watch = document.getElementById('orbit') || canvas;

  let spin = 0;
  let pulse = 0;
  let prec = 0;

  const ctx = {
    canvas: canvas,
    renderer: renderer,
    scene: scene,
    camera: camera,
    watch: watch,
    visible: false,
    live: false,
    dead: false,
    w: 0,
    h: 0,
    pr: 0,
    onResize: function (w, h, pr) {
      flowMat.uniforms.uScale.value = (h * pr) / (2 * Math.tan(fovRad / 2));
      flowMat.uniforms.uPR.value = pr;
      // .orbit は正方形なので、横幅基準で見え方を揃える
      group.scale.setScalar(clamp(w / h, 0.7, 1));
    },
    update: function (t, dt) {
      spin += (dt * Math.PI * 2) / O.dustLapSec;
      pulse += (dt * Math.PI * 2 * O.pulses) / O.pulseLapSec;
      prec += dt;

      flowMat.uniforms.uSpin.value = spin;
      flowMat.uniforms.uPulse.value = pulse;

      ringA.holder.rotation.y = (prec * Math.PI * 2) / O.ringALap;
      ringB.holder.rotation.y = -(prec * Math.PI * 2) / O.ringBLap;
      ringA.mat.uniforms.uPhase.value = pulse * 0.55;
      ringB.mat.uniforms.uPhase.value = -pulse * 0.4;

      haloMat.uniforms.uI.value = 0.28 + 0.06 * Math.sin(t * 0.6);
      halo.quaternion.copy(camera.quaternion);
    }
  };

  applySize(ctx, true);
  return ctx;
}
