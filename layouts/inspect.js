/* Inspector: a full-screen viewer for the exploded F1 car.
 * Scroll or pinch to zoom, drag to orbit, right-drag (or two fingers) to pan.
 * Click a part (on the model or in the list) to fly to it; the rest fades back.
 * Opens from the anatomy section on Home; Esc or the close button returns you there.
 */

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { buildF1 } from "./vehicles.js";

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const isDark = () => (document.documentElement.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")) === "dark";

// label id -> the model's part groups it covers, plus a few extra parts you can only pick here
const GROUPS = {
  frontWing: ["frontWing"], nose: ["nose"], halo: ["halo"], sidepods: ["sidepodL", "sidepodR"], tyres: ["wheelFL", "wheelFR", "wheelRL", "wheelRR"],
  rearWing: ["rearWing"], powerUnit: ["powerUnit"], floor: ["floor"], engineCover: ["engineCover"], chassis: ["chassis"], suspension: ["suspension"],
};
const EXTRA = [
  ["nose", "Nose", "Crash structure: absorbs a frontal impact"],
  ["chassis", "Survival cell", "Carbon monocoque around the driver"],
  ["engineCover", "Engine cover", "Airbox on top feeds the engine"],
  ["suspension", "Suspension", "Wishbones and pushrods, all carbon"],
];

export function openInspector(parts, focusId, hooks = {}) {
  const list = [...parts, ...EXTRA];
  const el = document.createElement("div");
  el.className = "insp"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "Inspect the car in 3D"); el.dataset.lenisPrevent = "";
  el.innerHTML = `
    <div class="insp-stage"></div>
    <aside class="insp-panel glass">
      <p class="hx-label">Inspect · F1 car</p>
      <h2>Take it apart</h2>
      <div class="insp-list">${list.map(([id, name], i) => `<button type="button" data-id="${esc(id)}" data-cursor="Focus"><b>${String(i + 1).padStart(2, "0")}</b>${esc(name)}</button>`).join("")}</div>
      <div class="insp-card" aria-live="polite"></div>
      <p class="insp-hint">Scroll or pinch to zoom · drag to orbit · right-drag to pan</p>
    </aside>
    <button type="button" class="insp-close glass" aria-label="Close" data-cursor="Close">×</button>
    <button type="button" class="insp-reset glass" data-cursor="Reset">Whole car</button>`;
  document.body.appendChild(el);
  document.documentElement.classList.add("insp-open");
  hooks.onOpen?.();

  const stage = el.querySelector(".insp-stage");
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.NeutralToneMapping;
  stage.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const ground = getComputedStyle(document.documentElement).getPropertyValue("--ground").trim() || "#070B19";
  scene.background = new THREE.Color(ground);
  const dark = isDark();

  // studio, as in the main scene
  const env = new THREE.Scene();
  env.add(new THREE.Mesh(new THREE.SphereGeometry(40, 32, 16), new THREE.MeshBasicMaterial({ color: dark ? 0x2a3350 : 0xa9acb3, side: THREE.BackSide })));
  const box = (w, h, p, c, k) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), side: THREE.DoubleSide })); m.position.set(...p); m.lookAt(0, 0, 0); env.add(m); };
  box(18, 8, [8, 14, 10], 0xffffff, 3.4); box(6, 16, [-16, 2, 4], dark ? 0x7d95ff : 0xdfe6ff, 2); box(8, 5, [12, -3, -10], 0xffe7a8, 2.2); box(40, 14, [0, -14, 0], dark ? 0x05070d : 0x26282e, 1);
  const pmrem = new THREE.PMREMGenerator(renderer); const envRT = pmrem.fromScene(env, 0.04); scene.environment = envRT.texture;
  const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(4, 6, 8); scene.add(key);

  // the car, exploded, with its own materials so parts can fade independently
  const car = buildF1();
  for (const k in car.apart) { const a = car.apart[k]; car.parts[k].position.x += a[0]; car.parts[k].position.y += a[1]; car.parts[k].position.z += a[2]; }
  car.group.traverse(o => { if (o.isMesh) o.material = Array.isArray(o.material) ? o.material.map(m => m.clone()) : o.material.clone(); });
  scene.add(car.group);
  // grid floor for scale
  const grid = new THREE.GridHelper(8, 32, dark ? 0x3a4060 : 0xb8bbc2, dark ? 0x1a1e2e : 0xd8dade); grid.position.y = -1.05; scene.add(grid);

  const camera = new THREE.PerspectiveCamera(35, 1, 0.05, 100);
  camera.position.set(4.6, 2.6, 5.2);
  const controls = new OrbitControls(camera, renderer.domElement);
  Object.assign(controls, { enableDamping: true, dampingFactor: 0.08, minDistance: 0.6, maxDistance: 12, zoomSpeed: 0.9, screenSpacePanning: true });
  controls.target.set(0, -0.1, 0);

  const resize = () => { const w = stage.clientWidth, h = stage.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); };
  resize(); addEventListener("resize", resize);

  // ---------- selecting parts ----------
  const groupOf = obj => { for (let o = obj; o; o = o.parent) if (o.parent === car.group) return o.name; return null; };
  const idOfGroup = name => Object.keys(GROUPS).find(id => GROUPS[id].includes(name));
  const card = el.querySelector(".insp-card");
  let selected = null, fly = null;
  const setFade = id => car.group.children.forEach(g => {
    const on = !id || GROUPS[id]?.includes(g.name);
    g.traverse(o => { if (!o.isMesh) return; (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if (m.transparent !== !on) m.needsUpdate = true; m.transparent = !on; m.opacity = on ? 1 : 0.12; m.depthWrite = on; }); });
  });
  const select = id => {
    selected = id || null;
    el.querySelectorAll(".insp-list button").forEach(b => b.setAttribute("aria-pressed", b.dataset.id === selected));
    setFade(selected);
    const info = list.find(p => p[0] === selected);
    card.innerHTML = info ? `<h3>${esc(info[1])}</h3><p>${esc(info[2])}</p>` : "";
    const b = new THREE.Box3();
    if (selected) GROUPS[selected].forEach(n => b.expandByObject(car.parts[n])); else b.setFromObject(car.group);
    const c = b.getCenter(new THREE.Vector3()), r = b.getSize(new THREE.Vector3()).length() * 0.5;
    const dir = camera.position.clone().sub(controls.target).normalize();
    fly = { t0: performance.now(), fromT: controls.target.clone(), toT: c, fromP: camera.position.clone(), toP: c.clone().add(dir.multiplyScalar(Math.max(1.5, r * 2.8) * (camera.aspect < 1 ? 1.9 : 1))) };
  };
  el.querySelectorAll(".insp-list button").forEach(b => b.onclick = () => select(b.dataset.id === selected ? null : b.dataset.id));
  el.querySelector(".insp-reset").onclick = () => select(null);
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let down = null;
  renderer.domElement.addEventListener("pointerdown", e => { down = [e.clientX, e.clientY]; });
  renderer.domElement.addEventListener("pointerup", e => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObject(car.group, true).find(h => h.object.material?.opacity !== 0.12);
    const id = hit && idOfGroup(groupOf(hit.object));
    select(id && id !== selected ? id : null);
  });

  // ---------- loop ----------
  let raf = 0;
  const ease = t => 1 - Math.pow(1 - t, 3);
  const loop = now => {
    raf = requestAnimationFrame(loop);
    if (fly) { const k = Math.min(1, (now - fly.t0) / 900), e = ease(k);
      controls.target.lerpVectors(fly.fromT, fly.toT, e); camera.position.lerpVectors(fly.fromP, fly.toP, e); if (k >= 1) fly = null; }
    controls.update();
    // idle vibration: the car sits on its stand with the engine running
    const t = now / 1000;
    car.group.position.set(0.0025 * Math.sin(t * 61), -0.4 + 0.003 * Math.sin(t * 47 + 1.3), 0.002 * Math.sin(t * 53 + 0.7));
    car.group.rotation.x = 0.0015 * Math.sin(t * 39);
    car.tick?.(1 / 60, 0, now, dark);
    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(loop);
  requestAnimationFrame(() => el.classList.add("on"));
  if (focusId) setTimeout(() => select(focusId), 350);

  const close = () => {
    cancelAnimationFrame(raf); removeEventListener("resize", resize); removeEventListener("keydown", onKey);
    controls.dispose(); envRT.dispose(); pmrem.dispose();
    car.group.traverse(o => { if (o.isMesh) { o.geometry.dispose(); (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose()); } });
    renderer.dispose(); renderer.forceContextLoss?.();
    el.classList.remove("on"); document.documentElement.classList.remove("insp-open");
    setTimeout(() => el.remove(), 350);
    hooks.onClose?.();
  };
  const onKey = e => { if (e.key === "Escape") close(); };
  addEventListener("keydown", onKey);
  el.querySelector(".insp-close").onclick = close;
  el.querySelector(".insp-close").focus();
  return close;
}
