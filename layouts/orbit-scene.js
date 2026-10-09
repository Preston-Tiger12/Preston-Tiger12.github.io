/* The object that follows you through Home and About.
 *
 * How it works (the same idea as meermohsin.me, rebuilt our way):
 *  - one transparent WebGL canvas is fixed over the page and ignores the mouse;
 *  - it holds one model at a time: an F1 car, a private jet and a rocket (vehicles.js)
 *    for Home, then the skateboard, surfboard and snowboard (boards.js) for Hobbies.
 *    A swap is a quick barrel roll and a dip in scale, the new model appearing at the
 *    smallest point;
 *  - the page registers "anchors": scroll positions with a pose (where on screen,
 *    how big, which way it faces, how exploded). Between two anchors the pose blends
 *    with smoothstep, and the drawn pose chases that target with a lerp, so the
 *    motion feels weighted on top of Lenis' smoothed scroll;
 *  - the canvas survives route changes between Home and About, so the object flies
 *    to its new place instead of reloading.
 * Pose units: x, y are screen positions (-1 left/bottom to 1 right/top), s is the
 * model's length as a fraction of the screen height, rx/ry/rz in radians,
 * ex = exploded (0 to 1), m = model index (0 F1, 1 jet, 2 rocket, 3 skate, 4 surf, 5 snow;
 * fractions are mid-swap), fx = rocket exhaust (0 to 1), spin = extra turns per second.
 */

import * as THREE from "three";
import { buildBoards } from "./boards.js";
import { buildVehicles } from "./vehicles.js";

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = t => t * t * (3 - 2 * t);
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const KEYS = ["x", "y", "s", "rx", "ry", "rz", "ex", "m", "fx", "spin"];
export const POSE = { x: 0, y: 0, s: 0.5, rx: 0.35, ry: -0.6, rz: 0, ex: 0, m: 0, fx: 0, spin: 0 };
const isDark = () => (document.documentElement.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")) === "dark";

let inst = null;   // one scene for the whole visit
export function orbit() { return inst || (inst = create()); }

function create() {
  const host = document.createElement("div");
  host.className = "orbit";
  host.setAttribute("aria-hidden", "true");
  document.body.appendChild(host);

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    if (!renderer.getContext()) throw 0;
  } catch (e) { host.remove(); return stub(); }
  const gpu = (() => { try { const g = renderer.getContext(), x = g.getExtension("WEBGL_debug_renderer_info"); return x ? g.getParameter(x.UNMASKED_RENDERER_WEBGL) : ""; } catch (e) { return ""; } })();
  const phone = innerWidth < 760;
  const weak = /intel|mali|adreno|powervr|apple gpu|swiftshader|llvmpipe/i.test(gpu) || phone;
  const MAX_DPR = Math.min(devicePixelRatio, weak ? 1.5 : 2), MIN_DPR = 0.75;
  let DPR = Math.min(MAX_DPR, weak ? 1.1 : 1.5);
  renderer.setPixelRatio(DPR);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.setClearColor(0x000000, 0);
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  camera.position.set(0, 0, 10);

  // ---------- studio: env map with soft boxes; colours follow the theme ----------
  const pmrem = new THREE.PMREMGenerator(renderer);
  let envRT = null;
  const buildEnv = dark => {
    const env = new THREE.Scene();
    env.add(new THREE.Mesh(new THREE.SphereGeometry(40, 32, 16), new THREE.MeshBasicMaterial({ color: dark ? 0x2a3350 : 0xa9acb3, side: THREE.BackSide })));
    const box = (w, h, pos, c, k) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), side: THREE.DoubleSide })); m.position.set(...pos); m.lookAt(0, 0, 0); env.add(m); };
    box(18, 8, [8, 14, 10], 0xffffff, dark ? 3.4 : 3.6);         // overhead
    box(6, 16, [-16, 2, 4], dark ? 0x7d95ff : 0xdfe6ff, dark ? 1.5 : 2.4);   // blue strip, left
    box(8, 5, [12, -3, -10], dark ? 0xffc533 : 0xffe7a8, 2.2);  // gold kicker, behind right
    box(40, 14, [0, -14, 0], dark ? 0x05070d : 0x26282e, 1);   // dark floor: gives metals a horizon line
    envRT?.dispose(); envRT = pmrem.fromScene(env, 0.04); scene.environment = envRT.texture;
  };

  const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(4, 6, 8);
  const mouseLight = new THREE.PointLight(0xffc533, 0, 14, 1.6); mouseLight.position.set(0, 2, 4);
  scene.add(key, mouseLight);

  // ---------- the models ----------
  const B = buildBoards(), V = buildVehicles();
  const pick = (obj, keys) => Object.fromEntries(keys.map(k => [k, obj[k]]));
  const MODELS = [
    ...V.models,
    { group: B.boards[0], parts: pick(B.parts, Object.keys(B.skateApart)), apart: B.skateApart, labels: B.skateLabels },
    { group: B.boards[1], parts: {}, apart: {}, labels: {} },
    { group: B.boards[2], parts: {}, apart: {}, labels: {} },
  ];
  const model = new THREE.Group(), roll = new THREE.Group();
  model.add(roll); scene.add(model);
  for (const M of MODELS) { roll.add(M.group); M.home = {}; for (const k in M.apart) M.home[k] = M.parts[k].position.clone(); }
  const LAST = MODELS.length - 1;

  // ---------- poses ----------
  const cur = { ...POSE, x: -2.4 }, tgt = { ...POSE };   // the first model drives in from the left
  const lastPose = { x: cur.x, y: cur.y }; let lastScroll = scrollY, motion = 0;
  let anchors = [];   // [{ y: () => scrollY where this pose is exact, pose }]
  let anchorY = [];
  let pinned = null;  // a pose that overrides scroll (route transitions, menu)
  let spinA = 0;
  const pointer = { x: 0, y: 0, sx: 0, sy: 0 };
  addEventListener("pointermove", e => { pointer.x = e.clientX / innerWidth * 2 - 1; pointer.y = -(e.clientY / innerHeight) * 2 + 1; }, { passive: true });

  const measure = () => { anchorY = anchors.map(a => a.y()); };
  const targetAt = sy => {
    if (pinned) return pinned;
    if (!anchors.length) return POSE;
    if (sy <= anchorY[0]) return anchors[0].pose;
    for (let i = 0; i < anchors.length - 1; i++) {
      const a = anchorY[i], b = anchorY[i + 1];
      if (sy <= b) {
        const t = b > a ? smooth(clamp((sy - a) / (b - a), 0, 1)) : 1;
        const A = anchors[i].pose, B = anchors[i + 1].pose, o = {};
        for (const k of KEYS) o[k] = A[k] + (B[k] - A[k]) * t;
        return o;
      }
    }
    return anchors[anchors.length - 1].pose;
  };

  // ---------- theme ----------
  let dark = null;
  const applyTheme = () => {
    const d = isDark(); if (d === dark) return; dark = d;
    buildEnv(d);
    key.intensity = d ? 1.7 : 1.8;
    key.color.set(d ? 0xdfe6ff : 0xffffff);
    renderer.toneMappingExposure = d ? 1.1 : 1.0;
  };
  applyTheme();
  const themeObs = new MutationObserver(applyTheme);
  themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  // ---------- size ----------
  let W = 0, H = 0, halfH = 0, halfW = 0;
  const resize = () => {
    W = innerWidth; H = innerHeight;
    renderer.setSize(W, H, false);
    camera.aspect = W / H; camera.updateProjectionMatrix();
    halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z; halfW = halfH * camera.aspect;
    measure();
  };
  resize();
  addEventListener("resize", resize);

  // ---------- labels: screen positions of each part's label point ----------
  const tmp = new THREE.Vector3();
  const screenOf = (mi, name) => {
    const M = MODELS[mi], at = M?.labels[name]; if (!at) return null;
    tmp.set(...at[1]); M.parts[at[0]].localToWorld(tmp); tmp.project(camera);
    return { x: (tmp.x + 1) / 2 * W, y: (1 - tmp.y) / 2 * H };
  };

  // ---------- frame loop ----------
  const hooks = new Set();
  let last = performance.now(), raf = 0, visible = true, acc = 0, frames = 0, cool = 0;
  const frame = now => { raf = requestAnimationFrame(frame); draw(now); };
  const draw = now => {
    const dt = clamp((now - last) / 1000, 0, 0.05); last = now;
    if (!visible || host.hidden) return;
    const T = targetAt(scrollY);
    for (const k of KEYS) tgt[k] = T[k];
    const f = reduced ? 1 : 1 - Math.pow(1 - 0.1, dt * 60);   // lerp 0.1 per 60 Hz frame (DESIGN.md: 0.08 to 0.12)
    for (const k of KEYS) cur[k] += (tgt[k] - cur[k]) * f;
    pointer.sx += (pointer.x - pointer.sx) * f; pointer.sy += (pointer.y - pointer.sy) * f;
    if (!reduced) spinA += cur.spin * Math.PI * 2 * dt;

    // model swap: two barrel rolls while the scale dips; the new model shows at the smallest point
    const bi = clamp(Math.round(cur.m), 0, LAST), mid = Math.abs(cur.m - Math.round(cur.m)) * 2;   // 0 settled, 1 halfway
    const dip = 1 - 0.82 * smooth(clamp(mid, 0, 1));
    MODELS.forEach((M, i) => { M.group.visible = i === bi; });
    roll.rotation.x = cur.m * Math.PI * 4;
    model.position.set(cur.x * halfW, cur.y * halfH, 0);
    model.scale.setScalar(cur.s * 2 * halfH / 3.9 * dip);
    model.rotation.set(cur.rx - pointer.sy * 0.12, cur.ry + spinA + pointer.sx * 0.2, cur.rz);
    const e = smooth(clamp(cur.ex, 0, 1)), A = MODELS[bi];
    for (const k in A.apart) { const a = A.apart[k], h = A.home[k]; A.parts[k].position.set(h.x + a[0] * e, h.y + a[1] * e, h.z + a[2] * e); }
    // on-screen speed of the model (pose change plus page scroll), smoothed; drives wheel spin, smoke and streak length
    const sp = Math.hypot(cur.x - lastPose.x, cur.y - lastPose.y) / Math.max(dt, 1e-3) + Math.abs(scrollY - lastScroll) / innerHeight / Math.max(dt, 1e-3) * 0.6;
    lastPose.x = cur.x; lastPose.y = cur.y; lastScroll = scrollY;
    motion += (Math.min(sp, 4) - motion) * (1 - Math.pow(0.002, dt));
    A.tick?.(dt, reduced ? 0 : motion, now, dark);
    if (A.streaks) { A.streaks.uniforms.uT.value = now / 1000; A.streaks.uniforms.uColor.value.set(dark ? 0xdfe6ff : 0x3a3f4b); A.streaks.uniforms.uA.value = dark ? 0.7 : 0.55; }
    if (A.plume) {
      const P = A.plume, inner = P.userData.inner, t = now / 1000, fx = clamp(cur.fx, 0, 1);
      P.uniforms.uA.value = fx; P.uniforms.uT.value = t;
      // dark: orange fire that adds light; light: a Bunsen burner flame drawn normally (additive vanishes on paper)
      const blend = dark ? THREE.AdditiveBlending : THREE.NormalBlending;
      if (P.blending !== blend) { P.blending = blend; P.needsUpdate = true;
        P.uniforms.uMode.value = dark ? 0 : 1;
        P.uniforms.uHot.value.set(dark ? 0xff7319 : 0x6a5cff); P.uniforms.uCore.value.set(dark ? 0xffeba6 : 0x2f6bff);
        inner.material.uniforms.uMode.value = 1;
        inner.material.uniforms.uHot.value.set(0x9fe8ff); inner.material.uniforms.uCore.value.set(0x1aa8ff); }
      inner.visible = !dark && fx > 0.02;
      inner.material.uniforms.uA.value = fx; inner.material.uniforms.uT.value = t;
      inner.scale.x = 1 + 0.06 * Math.sin(t * 19) * Math.sin(t * 5.3);
    }
    mouseLight.position.set(pointer.sx * halfW, pointer.sy * halfH, 4);
    mouseLight.intensity = dark ? 26 : 10;

    renderer.render(scene, camera);
    hooks.forEach(h => h(screenOf, cur));

    // adapt resolution to the GPU
    if (dt < 0.04) { acc += dt; frames++; }   // ignore throttled frames (background tabs)
    if (acc > 1 && frames) { const ms = acc / frames * 1000; acc = 0; frames = 0;
      if (cool > 0) cool--; else if (ms > 20 && DPR > MIN_DPR) { DPR = Math.max(MIN_DPR, DPR - 0.15); renderer.setPixelRatio(DPR); renderer.setSize(W, H, false); cool = 2; }
      else if (ms < 12 && DPR < MAX_DPR) { DPR = Math.min(MAX_DPR, DPR + 0.1); renderer.setPixelRatio(DPR); renderer.setSize(W, H, false); cool = 3; } }
  };
  raf = requestAnimationFrame(frame);
  document.addEventListener("visibilitychange", () => { visible = !document.hidden; last = performance.now(); });

  if (new URLSearchParams(location.search).has("debug")) window.__orbit = { cur, tgt, MODELS, frame: t => draw(t), renderer };

  return {
    // anchors: [{ y: () => number, pose: {partial pose} }]; missing keys come from POSE
    setAnchors(list) { anchors = list.map(a => ({ y: a.y, pose: { ...POSE, ...a.pose } })); measure(); host.hidden = false; },
    refresh: measure,
    pin(pose) { pinned = pose ? { ...POSE, ...pose } : null; },
    onFrame(fn) { hooks.add(fn); return () => hooks.delete(fn); },
    hide() { host.hidden = true; anchors = []; pinned = null; },
    get host() { return host; },
  };
}

function stub() { return { setAnchors() {}, refresh() {}, pin() {}, onFrame() { return () => {}; }, hide() {}, host: null }; }
