/* The vehicles, modelled in code. Home goes ground, air, orbit:
 *   0  F1 car     McLaren MCL38 feel (two-tone livery, sculpted sidepods, spoon wing) in our colours
 *   1  formation   a black Phenom-style private jet in the centre, escorted by two
 *                  F-22-style fighters trailing on either side (diamond wings, gold canopies)
 *   2  rocket      stainless, Starship-style
 * Convention (same as boards.js): about 3.9 units nose to tail along x (nose at +x),
 * up is +y, width along z. Each model returns { group, parts, apart, labels }.
 */

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

const BLUE = 0x1a3fd6, GOLD = 0xe5be01;
const cBlue = new THREE.Color(0x2350f0), cDark = new THREE.Color(0x17181d), cGold = new THREE.Color(GOLD);

function canvasTex(w, h, draw, flip = true) {
  const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.flipY = flip; return t;
}
// flat outline in the x-z plane, extruded up by `t`
function slab(points, t, bevel = 0.004) {
  const s = new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(x, z)));
  const g = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2 });
  g.rotateX(Math.PI / 2); g.translate(0, t / 2, 0);
  return g;
}
// flat outline in the x-y plane, extruded across z by `t`
function fin(points, t, bevel = 0.004) {
  const s = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2 });
  g.translate(0, 0, -t / 2); return g;
}
const rod = (a, b, r, mat) => {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), 8), mat);
  m.position.copy(A).add(B).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); return m;
};
const put = (m, x, y, z) => { m.position.set(x, y, z); return m; };
const addm = (parent, m) => { parent.add(m); return m; };   // add, but return the child
const grp = (name, parent) => { const g = new THREE.Group(); g.name = name; parent.add(g); return g; };

// loft: a smooth body through cross-sections along x.
// Section {x, y, z, w, h, p, b}: centre (y, z), half width w, half height h, superellipse power p
// (2 round, <2 diamond-ish chines, >2 boxy), b scales the lower half (flat bottoms).
// color(x, up) gives a vertex colour, up = -1 (bottom) .. 1 (top), for two-tone liveries.
const cr = (a, b, c, d, t) => 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (3 * b - a - 3 * c + d) * t * t * t);
function loft(secs, { n = 36, steps = 6, color } = {}) {
  const S = secs.map(s => ({ z: 0, p: 2.5, b: 1, ...s })), K = ["x", "y", "z", "w", "h", "p", "b"], rows = [];
  for (let i = 0; i < S.length - 1; i++) for (let k = 0; k < steps; k++) {
    const t = k / steps, o = {};
    for (const key of K) o[key] = cr(S[Math.max(0, i - 1)][key], S[i][key], S[i + 1][key], S[Math.min(S.length - 1, i + 2)][key], t);
    rows.push(o);
  }
  rows.push(S[S.length - 1]);
  const pos = [], col = [], uv = [], idx = [], c = new THREE.Color();
  rows.forEach((r, j) => {
    const w = Math.max(r.w, 0.001), h = Math.max(r.h, 0.001), e = 2 / Math.max(r.p, 0.6);
    for (let i = 0; i <= n; i++) {
      const a = i / n * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      const z = r.z + w * Math.sign(ca) * Math.pow(Math.abs(ca), e), y = r.y + h * Math.sign(sa) * Math.pow(Math.abs(sa), e) * (sa < 0 ? r.b : 1);
      pos.push(r.x, y, z); uv.push(j / (rows.length - 1), i / n);
      if (color) { c.copy(color(r.x, sa, ca)); col.push(c.r, c.g, c.b); }
    }
  });
  for (let j = 0; j < rows.length - 1; j++) for (let i = 0; i < n; i++) {
    const a = j * (n + 1) + i, b = a + n + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  // end caps
  for (const [j, flip] of [[0, true], [rows.length - 1, false]]) {
    const r = rows[j], ci = pos.length / 3;
    pos.push(r.x, r.y, r.z); uv.push(j ? 1 : 0, 0.5);
    if (color) { c.copy(color(r.x, 0, 1)); col.push(c.r, c.g, c.b); }
    for (let i = 0; i < n; i++) { const a = j * (n + 1) + i; flip ? idx.push(ci, a + 1, a) : idx.push(ci, a, a + 1); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  if (color) g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
// a tyre: lathe of a rounded rectangle cross-section, axis along z
function tyreGeo(R, w) {
  const pts = [], r0 = R - 0.08, k = 0.035;
  pts.push(new THREE.Vector2(r0, -w / 2));
  for (let i = 0; i <= 6; i++) { const a = -Math.PI / 2 + (i / 6) * Math.PI / 2; pts.push(new THREE.Vector2(R - k + Math.cos(a) * k, -w / 2 + k + Math.sin(a) * k)); }
  for (let i = 0; i <= 6; i++) { const a = (i / 6) * Math.PI / 2; pts.push(new THREE.Vector2(R - k + Math.cos(a) * k, w / 2 - k + Math.sin(a) * k)); }
  pts.push(new THREE.Vector2(r0, w / 2));
  const g = new THREE.LatheGeometry(pts, 48); g.rotateX(Math.PI / 2); return g;
}

export function buildVehicles() {
  const livery = new THREE.MeshPhysicalMaterial({ vertexColors: true, metalness: 0.35, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.05 });
  const paint = new THREE.MeshPhysicalMaterial({ color: 0x2350f0, metalness: 0.35, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.05 });
  const goldPaint = new THREE.MeshPhysicalMaterial({ color: GOLD, metalness: 0.5, roughness: 0.3, clearcoat: 1 });
  const carbonTex = canvasTex(128, 128, (g, W, H) => { g.fillStyle = "#16171b"; g.fillRect(0, 0, W, H);
    for (let y = 0; y < H; y += 8) for (let x = 0; x < W; x += 8) { g.fillStyle = (x + y) % 16 ? "#202128" : "#121317"; g.fillRect(x, y, 8, 8); } });
  carbonTex.wrapS = carbonTex.wrapT = THREE.RepeatWrapping; carbonTex.repeat.set(10, 10);
  const carbon = new THREE.MeshPhysicalMaterial({ map: carbonTex, roughness: 0.32, clearcoat: 0.9 });
  const anthracite = new THREE.MeshPhysicalMaterial({ color: 0x1b1c21, metalness: 0.4, roughness: 0.35, clearcoat: 1 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x111113, roughness: 0.82 });
  const rim = new THREE.MeshPhysicalMaterial({ color: GOLD, metalness: 1, roughness: 0.3 });
  const titanium = new THREE.MeshPhysicalMaterial({ color: 0xa4a7ae, metalness: 1, roughness: 0.3 });
  const chrome = new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 1, roughness: 0.08 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x0c1022, metalness: 0.3, roughness: 0.05, clearcoat: 1 });
  const steel = new THREE.MeshPhysicalMaterial({ color: 0xcfd2d7, metalness: 1, roughness: 0.32 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1b1c20, metalness: 0.4, roughness: 0.5 });
  const white = new THREE.MeshPhysicalMaterial({ color: 0xf4f4f1, roughness: 0.25, clearcoat: 1 });

  // two-tone F1 livery: blue on top (McLaren's papaya), anthracite below, a gold pinstripe between
  const f1Colour = (x, up) => (Math.abs(up + 0.5) < 0.06 ? cGold : up > -0.5 ? cBlue : cDark);

  // ======================= F1 car =======================
  const f1 = new THREE.Group(); f1.name = "f1";
  const C = {};
  C.floor = grp("floor", f1);
  C.floor.add(put(new THREE.Mesh(slab([[0.95, -0.28], [0.95, 0.28], [0.55, 0.6], [-1.38, 0.62], [-1.6, 0.42], [-1.6, -0.42], [-1.38, -0.62], [0.55, -0.6]], 0.02), carbon), 0, 0.05, 0));
  for (const s of [1, -1]) C.floor.add(put(new THREE.Mesh(fin([[0.5, 0.05], [-1.3, 0.05], [-1.3, 0.1], [0.4, 0.08]], 0.01), carbon), 0, 0, s * 0.61));
  C.nose = grp("nose", f1);
  C.nose.add(new THREE.Mesh(loft([
    { x: 1.74, y: 0.15, w: 0.04, h: 0.025 }, { x: 1.45, y: 0.17, w: 0.07, h: 0.045 }, { x: 1.1, y: 0.205, w: 0.1, h: 0.07 },
    { x: 0.75, y: 0.245, w: 0.14, h: 0.1, p: 2.8 }, { x: 0.5, y: 0.28, w: 0.18, h: 0.13, p: 3 },
  ], { color: f1Colour }), livery));
  C.chassis = grp("chassis", f1);
  C.chassis.add(new THREE.Mesh(loft([
    { x: 0.5, y: 0.28, w: 0.18, h: 0.13, p: 3 }, { x: 0.3, y: 0.31, w: 0.23, h: 0.16, p: 3.2 }, { x: 0.05, y: 0.32, w: 0.26, h: 0.17, p: 3.5 },
    { x: -0.3, y: 0.31, w: 0.25, h: 0.17, p: 3.5 }, { x: -0.75, y: 0.29, w: 0.2, h: 0.15, p: 3 }, { x: -1.15, y: 0.27, w: 0.13, h: 0.11 },
    { x: -1.45, y: 0.25, w: 0.07, h: 0.07 }, { x: -1.62, y: 0.24, w: 0.03, h: 0.035 },
  ], { color: f1Colour }), livery));
  const tub = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), anthracite); tub.scale.set(0.24, 0.05, 0.13); tub.position.set(0.22, 0.465, 0); C.chassis.add(tub);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.075, 24, 16), goldPaint); helmet.position.set(0.14, 0.52, 0); C.chassis.add(helmet);
  const visor = new THREE.Mesh(new THREE.SphereGeometry(0.077, 24, 16, -0.7, 1.4, 1.25, 0.45), glass); visor.position.copy(helmet.position); visor.rotation.y = Math.PI / 2; C.chassis.add(visor);
  for (const s of [1, -1]) { C.chassis.add(rod([0.42, 0.42, s * 0.2], [0.45, 0.45, s * 0.33], 0.008, carbon)); C.chassis.add(put(new THREE.Mesh(new RoundedBoxGeometry(0.06, 0.04, 0.1, 2, 0.01), anthracite), 0.45, 0.46, s * 0.36)); }
  C.engineCover = grp("engineCover", f1);
  C.engineCover.add(new THREE.Mesh(loft([
    { x: 0.13, y: 0.52, w: 0.07, h: 0.06, p: 3 }, { x: -0.1, y: 0.51, w: 0.09, h: 0.09 }, { x: -0.45, y: 0.46, w: 0.08, h: 0.08 },
    { x: -0.9, y: 0.4, w: 0.05, h: 0.05 }, { x: -1.35, y: 0.33, w: 0.02, h: 0.03 },
  ], { color: f1Colour }), livery));
  addm(C.engineCover, put(new THREE.Mesh(new THREE.CircleGeometry(0.055, 24), dark), 0.131, 0.52, 0)).rotation.y = Math.PI / 2;
  C.engineCover.add(new THREE.Mesh(fin([[-0.3, 0.58], [-1.4, 0.36], [-1.4, 0.52], [-0.38, 0.64]], 0.01), paint));
  C.engineCover.add(new THREE.Mesh(fin([[-0.38, 0.64], [-1.4, 0.52], [-1.4, 0.535], [-0.38, 0.655]], 0.012), goldPaint));
  C.engineCover.add(put(new THREE.Mesh(new RoundedBoxGeometry(0.08, 0.03, 0.05, 2, 0.01), anthracite), -0.02, 0.6, 0));   // T-cam
  // power unit: 1.6 L V6 turbo hybrid. Crankcase, two cylinder banks at 90 degrees with cam covers and coil packs,
  // an intake plenum with trumpets between the banks, six exhaust primaries into the turbo, a single tailpipe,
  // the MGU-H on the turbo shaft and the energy store underneath.
  C.powerUnit = grp("powerUnit", f1);
  const heat = new THREE.MeshPhysicalMaterial({ color: 0x9a7650, metalness: 1, roughness: 0.32, iridescence: 0.6, iridescenceIOR: 1.6 });
  C.powerUnit.add(put(new THREE.Mesh(new RoundedBoxGeometry(0.5, 0.11, 0.2, 3, 0.025), titanium), -0.72, 0.19, 0));
  for (const s of [1, -1]) {
    const bank = new THREE.Group(); bank.position.set(-0.72, 0.27, s * 0.055); bank.rotation.x = s * 0.62;   // banks splay outwards: a V, not a roof C.powerUnit.add(bank);
    bank.add(put(new THREE.Mesh(new RoundedBoxGeometry(0.44, 0.13, 0.1, 2, 0.02), titanium), 0, 0.04, 0));
    bank.add(put(new THREE.Mesh(new RoundedBoxGeometry(0.42, 0.03, 0.09, 2, 0.012), rim), 0, 0.115, 0));          // cam cover
    for (let k = 0; k < 3; k++) bank.add(put(new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.05, 10), anthracite), -0.13 + k * 0.13, 0.145, 0));   // coil packs
    // exhaust primaries: out of each bank, sweeping back and down into the turbo
    for (let k = 0; k < 3; k++) {
      const x0 = -0.85 + k * 0.13, path = new THREE.CatmullRomCurve3([
        new THREE.Vector3(x0, 0.24, s * 0.16), new THREE.Vector3(x0 - 0.04, 0.2, s * 0.21), new THREE.Vector3(x0 - 0.18, 0.16, s * 0.18), new THREE.Vector3(-1.02, 0.2, s * 0.06)]);
      C.powerUnit.add(new THREE.Mesh(new THREE.TubeGeometry(path, 24, 0.012, 8, false), heat));
    }
  }
  C.powerUnit.add(put(new THREE.Mesh(new RoundedBoxGeometry(0.34, 0.06, 0.07, 2, 0.02), goldPaint), -0.7, 0.39, 0));   // intake plenum
  for (let k = 0; k < 6; k++) C.powerUnit.add(put(new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.022, 0.05, 12, 1, true), chrome), -0.84 + (k % 3) * 0.13, 0.43, (k < 3 ? -1 : 1) * 0.018));
  const turbo = new THREE.Group(); turbo.position.set(-1.07, 0.24, 0); C.powerUnit.add(turbo);
  turbo.add(addm(new THREE.Group(), new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.026, 12, 28), heat)));            // turbine housing
  turbo.children[0].rotation.y = Math.PI / 2;
  turbo.add(put(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.14, 16), titanium), 0.07, 0, 0)).children.at(-1).rotation.z = Math.PI / 2;   // shaft with MGU-H
  turbo.add(put(new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.022, 12, 28), titanium), 0.15, 0, 0)).children.at(-1).rotation.y = Math.PI / 2; // compressor
  C.powerUnit.add(put(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.42, 16), heat), -1.33, 0.27, 0)).children.at(-1).rotation.z = Math.PI / 2 - 0.12;   // tailpipe
  C.powerUnit.add(put(new THREE.Mesh(new RoundedBoxGeometry(0.4, 0.06, 0.24, 2, 0.015), anthracite), -0.42, 0.11, 0));   // energy store
  C.powerUnit.add(put(new THREE.Mesh(new THREE.BoxGeometry(0.41, 0.012, 0.03), new THREE.MeshStandardMaterial({ color: 0xff7a1a, roughness: 0.5 })), -0.42, 0.142, 0.09));   // HV marking
  C.powerUnit.add(put(new THREE.Mesh(new RoundedBoxGeometry(0.12, 0.09, 0.1, 2, 0.02), anthracite), -0.46, 0.2, 0.13));   // MGU-K
  for (const s of [1, -1]) {
    const k = s > 0 ? "sidepodL" : "sidepodR"; C[k] = grp(k, f1);
    C[k].add(new THREE.Mesh(loft([
      { x: 0.44, y: 0.27, z: s * 0.3, w: 0.07, h: 0.075, p: 4 }, { x: 0.3, y: 0.26, z: s * 0.36, w: 0.11, h: 0.105, p: 3.5 },
      { x: 0.0, y: 0.25, z: s * 0.38, w: 0.12, h: 0.12, p: 3, b: 0.7 }, { x: -0.4, y: 0.22, z: s * 0.33, w: 0.1, h: 0.1, b: 0.55 },
      { x: -0.8, y: 0.18, z: s * 0.24, w: 0.07, h: 0.07, b: 0.6 }, { x: -1.1, y: 0.15, z: s * 0.16, w: 0.03, h: 0.04 },
    ], { color: f1Colour }), livery));
    addm(C[k], put(new THREE.Mesh(new THREE.CircleGeometry(1, 24), dark), 0.442, 0.27, s * 0.3)).rotation.y = Math.PI / 2;
    C[k].children[1].scale.set(0.068, 0.07, 1);
  }
  C.halo = grp("halo", f1);
  addm(C.halo, put(new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.017, 10, 40, Math.PI * 1.2), titanium), 0.14, 0.6, 0)).rotation.set(Math.PI / 2, 0, Math.PI * 0.4);
  C.halo.add(rod([0.33, 0.6, 0], [0.44, 0.47, 0], 0.017, titanium));
  C.frontWing = grp("frontWing", f1);
  C.frontWing.add(put(new THREE.Mesh(slab([[1.97, -0.7], [1.97, 0.7], [1.83, 0.7], [1.88, 0.1], [1.88, -0.1], [1.83, -0.7]], 0.014), carbon), 0, 0.06, 0));
  for (const s of [1, -1]) {
    for (let k = 0; k < 3; k++) {
      const x0 = 1.84 - k * 0.055;
      C.frontWing.add(put(new THREE.Mesh(slab([[x0, s * 0.16], [x0, s * 0.69], [x0 - 0.07, s * 0.69], [x0 - 0.06, s * 0.16]], 0.01), k === 2 ? goldPaint : paint), 0, 0.085 + k * 0.03, 0));
    }
    C.frontWing.add(put(new THREE.Mesh(fin([[1.98, 0.04], [1.62, 0.04], [1.66, 0.22], [1.92, 0.18]], 0.012), anthracite), 0, 0, s * 0.705));
    C.frontWing.add(rod([1.82, 0.08, s * 0.07], [1.62, 0.17, s * 0.04], 0.011, carbon));
  }
  C.rearWing = grp("rearWing", f1);
  const tilt = (g, cx, a) => g.translate(-cx, 0, 0).rotateZ(a).translate(cx, 0, 0);   // pitch a wing element about its own chord centre
  C.rearWing.add(put(new THREE.Mesh(tilt(slab([[-1.5, -0.45], [-1.5, 0.45], [-1.74, 0.45], [-1.71, 0], [-1.74, -0.45]], 0.02), -1.62, -0.12), anthracite), 0, 0.67, 0));
  C.rearWing.add(put(new THREE.Mesh(tilt(slab([[-1.6, -0.45], [-1.6, 0.45], [-1.78, 0.45], [-1.78, -0.45]], 0.014), -1.69, -0.4), paint), 0, 0.77, 0));
  C.rearWing.add(put(new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.012, 0.9), goldPaint), -1.79, 0.82, 0));
  for (const s of [1, -1]) C.rearWing.add(put(new THREE.Mesh(fin([[-1.92, 0.36], [-1.48, 0.42], [-1.5, 0.84], [-1.9, 0.86]], 0.012), anthracite), 0, 0, s * 0.46));
  C.rearWing.add(put(new THREE.Mesh(slab([[-1.62, -0.3], [-1.62, 0.3], [-1.78, 0.3], [-1.78, -0.3]], 0.012), carbon), 0, 0.36, 0));
  C.rearWing.add(rod([-1.68, 0.3, 0], [-1.66, 0.67, 0], 0.018, carbon));
  C.rearWing.add(put(new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 0.08), new THREE.MeshBasicMaterial({ color: 0xff3b2f })), -1.83, 0.28, 0));
  const wheel = (x, z, w) => {
    const g = new THREE.Group(); g.position.set(x, 0.25, z);
    g.add(new THREE.Mesh(tyreGeo(0.25, w), rubber));
    const cover = new THREE.Mesh(new THREE.CylinderGeometry(0.168, 0.168, w - 0.01, 32), anthracite); cover.rotation.x = Math.PI / 2; g.add(cover);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.007, 6, 48), goldPaint); band.position.z = Math.sign(z) * (w / 2 - 0.002); g.add(band);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(0.168, 0.008, 6, 48), rim); lip.position.z = Math.sign(z) * (w / 2 - 0.004); g.add(lip);
    const nut = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, w + 0.02, 12), rim); nut.rotation.x = Math.PI / 2; g.add(nut);
    return g;
  };
  C.wheelFL = grp("wheelFL", f1); C.wheelFL.add(wheel(1.05, 0.6, 0.22));
  C.wheelFR = grp("wheelFR", f1); C.wheelFR.add(wheel(1.05, -0.6, 0.22));
  C.wheelRL = grp("wheelRL", f1); C.wheelRL.add(wheel(-1.18, 0.6, 0.28));
  C.wheelRR = grp("wheelRR", f1); C.wheelRR.add(wheel(-1.18, -0.6, 0.28));
  C.suspension = grp("suspension", f1);
  for (const [x, s] of [[1.05, 1], [1.05, -1], [-1.18, 1], [-1.18, -1]]) {
    C.suspension.add(rod([x + 0.12, 0.31, s * 0.18], [x, 0.31, s * 0.47], 0.01, carbon), rod([x - 0.14, 0.31, s * 0.18], [x, 0.31, s * 0.47], 0.01, carbon),
      rod([x + 0.08, 0.17, s * 0.18], [x, 0.19, s * 0.47], 0.01, carbon), rod([x - 0.1, 0.17, s * 0.18], [x, 0.19, s * 0.47], 0.01, carbon));
  }
  f1.position.y = -0.4;
  // tyre smoke: a small pool of soft particles shed from the rear tyres while the car is moving
  const SMOKE = 70, smPos = new Float32Array(SMOKE * 3), smLife = new Float32Array(SMOKE), smSeed = new Float32Array(SMOKE);
  for (let i = 0; i < SMOKE; i++) { smLife[i] = 0; smSeed[i] = Math.random(); }
  const smGeo = new THREE.BufferGeometry();
  smGeo.setAttribute("position", new THREE.BufferAttribute(smPos, 3)); smGeo.setAttribute("aLife", new THREE.BufferAttribute(smLife, 1)); smGeo.setAttribute("aSeed", new THREE.BufferAttribute(smSeed, 1));
  const smMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, uniforms: { uColor: { value: new THREE.Color(0xd9dce3) }, uScale: { value: 300 } },
    vertexShader: `attribute float aLife; attribute float aSeed; uniform float uScale; varying float vA;
      void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
        vA = aLife * (1.0 - aLife) * 2.2; gl_PointSize = uScale * (0.05 + 0.16 * (1.0 - aLife)) * (0.7 + 0.6 * aSeed) / -mv.z; }`,
    fragmentShader: `uniform vec3 uColor; varying float vA;
      void main(){ vec2 c = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.0, length(c)) * vA * 0.55; if (a < 0.01) discard; gl_FragColor = vec4(uColor, a); }`,
  });
  const smoke = new THREE.Points(smGeo, smMat); smoke.frustumCulled = false; f1.add(smoke);
  let smNext = 0, smAcc = 0;
  const wheelSpinners = [C.wheelFL, C.wheelFR, C.wheelRL, C.wheelRR].map(g => g.children[0]);
  const f1Tick = (dt, motion, now, dark) => {
    // wheels roll with how fast the car is moving on screen
    const roll = (motion * 26 + 0.0) * dt;
    wheelSpinners.forEach(w => { w.rotation.z -= roll; });
    smMat.uniforms.uColor.value.set(dark ? 0xd9dce3 : 0x8a8f99);
    smAcc += Math.max(0, motion - 0.12) * dt * 90;          // emit only when it is really moving
    while (smAcc > 1) { smAcc -= 1;
      const i = smNext; smNext = (smNext + 1) % SMOKE; const side = i % 2 ? 1 : -1;
      smPos[i * 3] = -1.18 - 0.1 * Math.random(); smPos[i * 3 + 1] = 0.05 + 0.04 * Math.random(); smPos[i * 3 + 2] = side * (0.6 + 0.08 * Math.random()); smLife[i] = 1;
    }
    for (let i = 0; i < SMOKE; i++) if (smLife[i] > 0) {
      smLife[i] = Math.max(0, smLife[i] - dt * 0.9);
      smPos[i * 3] -= dt * (0.9 + smSeed[i]); smPos[i * 3 + 1] += dt * (0.25 + 0.3 * smSeed[i]); smPos[i * 3 + 2] += dt * 0.25 * Math.sign(smPos[i * 3 + 2]);
    }
    smGeo.attributes.position.needsUpdate = true; smGeo.attributes.aLife.needsUpdate = true;
  };
  const f1Apart = {
    frontWing: [0.75, 0.05, 0], nose: [0.45, 0.2, 0], halo: [0, 0.6, 0], engineCover: [-0.1, 0.75, 0], powerUnit: [0, 0.35, 0],
    sidepodL: [0, 0.05, 0.55], sidepodR: [0, 0.05, -0.55], floor: [0, -0.55, 0], rearWing: [-0.6, 0.45, 0],
    wheelFL: [0.1, 0, 0.7], wheelFR: [0.1, 0, -0.7], wheelRL: [-0.1, 0, 0.7], wheelRR: [-0.1, 0, -0.7], suspension: [0, -0.15, 0],
  };
  const f1Labels = {
    frontWing: ["frontWing", [1.85, 0.1, 0.5]], halo: ["halo", [0.14, 0.6, 0.2]], sidepods: ["sidepodL", [-0.1, 0.36, 0.4]],
    powerUnit: ["powerUnit", [-0.72, 0.38, 0.1]], floor: ["floor", [-0.5, 0.06, 0.6]], rearWing: ["rearWing", [-1.68, 0.8, 0.3]], tyres: ["wheelRL", [-1.18, 0.42, 0.74]],
  };

  // ======================= private jet (black, Phenom-style) =======================
  const jet = new THREE.Group(); jet.name = "jet";
  const J = {};
  const jetPaint = new THREE.MeshPhysicalMaterial({ vertexColors: true, metalness: 0.55, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.04 });
  const jetBlack = new THREE.Color(0x0d0e12);
  const jetColour = (x, up) => (x > -1.25 && x < 1.55 && Math.abs(up + 0.22) < 0.035 ? cGold : jetBlack);
  const fuseSecs = [
    { x: 1.96, y: -0.01, w: 0.01, h: 0.01 }, { x: 1.86, y: -0.01, w: 0.08, h: 0.07 }, { x: 1.62, y: 0.02, w: 0.16, h: 0.15 },
    { x: 1.25, y: 0.05, w: 0.21, h: 0.21 }, { x: 0.8, y: 0.05, w: 0.23, h: 0.24, p: 2.2 }, { x: -0.4, y: 0.06, w: 0.23, h: 0.24, p: 2.2 },
    { x: -0.95, y: 0.1, w: 0.19, h: 0.2 }, { x: -1.45, y: 0.16, w: 0.12, h: 0.13 }, { x: -1.85, y: 0.22, w: 0.05, h: 0.06 }, { x: -1.95, y: 0.24, w: 0.01, h: 0.01 },
  ];
  J.fuselage = grp("fuselage", jet);
  J.fuselage.add(new THREE.Mesh(loft(fuseSecs, { n: 40, color: jetColour }), jetPaint));
  // windscreen and round cabin windows with bright rims, as on the reference photo
  const ws = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12, -0.9, 1.8, 0.55, 0.5), glass); ws.scale.set(0.2, 0.2, 0.2); ws.position.set(1.42, 0.07, 0); ws.rotation.z = -0.35; J.fuselage.add(ws);
  const winGeo = new THREE.CircleGeometry(0.038, 20), rimGeo = new THREE.TorusGeometry(0.04, 0.007, 6, 24);
  for (const s of [1, -1]) for (let k = 0; k < 6; k++) {
    const x = 0.95 - k * 0.2, w = 0.232;
    const win = new THREE.Mesh(winGeo, glass); win.position.set(x, 0.11, s * w); win.rotation.y = s > 0 ? 0 : Math.PI; win.scale.y = 1.15; J.fuselage.add(win);
    const r = new THREE.Mesh(rimGeo, chrome); r.position.set(x, 0.11, s * (w + 0.001)); r.scale.y = 1.15; J.fuselage.add(r);
  }
  const door = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.008, 6, 28), chrome); door.scale.set(0.75, 1.4, 1); door.position.set(1.12, 0.08, 0.233); J.fuselage.add(door);
  const wingGrey = new THREE.MeshPhysicalMaterial({ color: 0x5d6168, metalness: 0.7, roughness: 0.3, clearcoat: 0.6 });
  J.wings = grp("wings", jet);
  for (const s of [1, -1]) {
    J.wings.add(put(new THREE.Mesh(slab([[0.5, 0.15], [-0.25, 0.15], [-0.6, 1.35], [-0.38, 1.35]].map(([x, z]) => [x, z * s]), 0.035), wingGrey), 0, -0.13, 0));
    J.wings.add(put(new THREE.Mesh(fin([[-0.38, 0], [-0.6, 0], [-0.68, 0.24], [-0.56, 0.24]], 0.012), jetPaint.clone()), 0, -0.12, s * 1.36));
    J.wings.children[J.wings.children.length - 1].material = goldPaint;
  }
  J.engines = grp("engines", jet);
  const nacMat = new THREE.MeshPhysicalMaterial({ color: 0x0d0e12, metalness: 0.55, roughness: 0.2, clearcoat: 1 });
  for (const s of [1, -1]) {
    J.engines.add(new THREE.Mesh(loft([
      { x: -0.72, y: 0.2, z: s * 0.38, w: 0.1, h: 0.1, p: 2 }, { x: -0.85, y: 0.2, z: s * 0.38, w: 0.115, h: 0.115, p: 2 },
      { x: -1.15, y: 0.2, z: s * 0.38, w: 0.1, h: 0.1, p: 2 }, { x: -1.32, y: 0.2, z: s * 0.38, w: 0.07, h: 0.07, p: 2 },
    ], { n: 28 }), nacMat));
    addm(J.engines, put(new THREE.Mesh(new THREE.TorusGeometry(0.098, 0.016, 10, 32), chrome), -0.72, 0.2, s * 0.38)).rotation.y = Math.PI / 2;
    addm(J.engines, put(new THREE.Mesh(new THREE.CircleGeometry(0.09, 24), dark), -0.74, 0.2, s * 0.38)).rotation.y = Math.PI / 2;
    J.engines.add(put(new THREE.Mesh(slab([[-0.85, 0.16], [-1.15, 0.16], [-1.15, 0.3], [-0.9, 0.3]].map(([x, z]) => [x, z * s]), 0.02), nacMat), 0, 0.2, 0));
  }
  J.tail = grp("tail", jet);
  J.tail.add(new THREE.Mesh(fin([[-1.4, 0.2], [-1.95, 0.22], [-2.08, 0.86], [-1.88, 0.86]], 0.03), nacMat));
  J.tail.add(put(new THREE.Mesh(slab([[-1.86, 0], [-2.0, 0.55], [-2.1, 0.55], [-2.08, 0], [-2.1, -0.55], [-2.0, -0.55]], 0.025), nacMat), 0, 0.86, 0));
  J.tail.add(new THREE.Mesh(fin([[-1.88, 0.86], [-2.08, 0.86], [-2.08, 0.89], [-1.88, 0.89]], 0.032), goldPaint));
  const jetApart = { fuselage: [0, 0, 0], wings: [0, -0.5, 0], engines: [0, 0.35, 0], tail: [-0.4, 0.35, 0] };

  // ======================= two fighters (F-22-style) in formation =======================
  const camo = new THREE.MeshPhysicalMaterial({ vertexColors: true, metalness: 0.35, roughness: 0.55 });
  const camoA = new THREE.Color(0xa6abb1), camoB = new THREE.Color(0x8c9198);
  const camoColour = (x, up, side) => (Math.sin(x * 3.2 + side * 2.2 + up) > 0.55 ? camoB : camoA);
  const wingMat = new THREE.MeshPhysicalMaterial({ color: 0x9ba0a6, metalness: 0.35, roughness: 0.55 });
  const canopy = new THREE.MeshPhysicalMaterial({ color: 0xc9a227, metalness: 0.95, roughness: 0.08, clearcoat: 1 });
  const nozzle = new THREE.MeshStandardMaterial({ color: 0x2a2c31, metalness: 0.7, roughness: 0.45 });
  const fighter = () => {
    const f = new THREE.Group();
    f.add(new THREE.Mesh(loft([
      { x: 1.3, y: 0, w: 0.008, h: 0.008, p: 1.5 }, { x: 1.12, y: 0, w: 0.05, h: 0.04, p: 1.4 }, { x: 0.8, y: 0.02, w: 0.12, h: 0.075, p: 1.4 },
      { x: 0.45, y: 0.03, w: 0.21, h: 0.095, p: 1.7 }, { x: 0.0, y: 0.02, w: 0.34, h: 0.1, p: 2.8 }, { x: -0.5, y: 0.0, w: 0.33, h: 0.09, p: 3.2 },
      { x: -0.95, y: 0.0, w: 0.25, h: 0.075, p: 3.5 }, { x: -1.2, y: 0.0, w: 0.2, h: 0.06, p: 4 },
    ], { n: 32, color: camoColour }), camo));
    const cp = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), canopy); cp.scale.set(0.3, 0.085, 0.075); cp.position.set(0.6, 0.085, 0); f.add(cp);
    for (const s of [1, -1]) {
      f.add(new THREE.Mesh(slab([[0.25, 0.3], [-0.72, 1.02], [-0.95, 1.02], [-0.9, 0.3]].map(([x, z]) => [x, z * s]), 0.022), wingMat));
      f.add(new THREE.Mesh(slab([[-0.86, 0.26], [-1.22, 0.6], [-1.36, 0.6], [-1.3, 0.26]].map(([x, z]) => [x, z * s]), 0.016), wingMat));
      const vt = new THREE.Mesh(fin([[-0.58, 0.0], [-1.0, 0.52], [-1.16, 0.52], [-1.12, 0.0]], 0.014), wingMat); vt.position.set(0, 0.04, s * 0.2); vt.rotation.x = -s * 0.45; f.add(vt);
      const intake = new THREE.Mesh(new RoundedBoxGeometry(0.34, 0.12, 0.1, 2, 0.02), wingMat); intake.position.set(0.12, -0.01, s * 0.27); f.add(intake);
      addm(f, put(new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.1), nozzle), 0.291, -0.01, s * 0.27)).rotation.y = Math.PI / 2;
      f.add(put(new THREE.Mesh(new RoundedBoxGeometry(0.16, 0.08, 0.12, 2, 0.015), nozzle), -1.26, 0.0, s * 0.1));
      // roundel in our colours
      addm(f, put(new THREE.Mesh(new THREE.CircleGeometry(0.07, 24), new THREE.MeshBasicMaterial({ color: BLUE })), -0.55, 0.013, s * 0.72)).rotation.x = -Math.PI / 2;
      addm(f, put(new THREE.Mesh(new THREE.RingGeometry(0.07, 0.085, 24), new THREE.MeshBasicMaterial({ color: GOLD })), -0.55, 0.013, s * 0.72)).rotation.x = -Math.PI / 2;
    }
    return f;
  };
  // the formation: private jet leads in the centre, the two fighters trail it, one on each side
  const flight = new THREE.Group(); flight.name = "formation";
  // speed streaks: thin crossed ribbons trailing wingtips and exhausts, dashes running backwards
  const streakMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uT: { value: 0 }, uColor: { value: new THREE.Color(1, 1, 1) }, uA: { value: 0.75 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float uT, uA; uniform vec3 uColor; varying vec2 vUv;
      void main(){ float u = vUv.x; float edge = 1.0 - abs(vUv.y - 0.5) * 2.0;
        float dash = 0.35 + 0.65 * smoothstep(0.35, 0.5, fract(u * 5.0 - uT * 2.2));
        float a = pow(1.0 - u, 1.7) * dash * edge * uA; if (a < 0.004) discard;
        gl_FragColor = vec4(uColor, a); }`,
  });
  const streakMeshes = [];
  const streak = (parent, [x, y, z], len, w) => {
    for (const vertical of [false, true]) {
      const g = new THREE.PlaneGeometry(len, w); g.translate(-len / 2, 0, 0);
      if (!vertical) g.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(g, streakMat); m.position.set(x, y, z); m.renderOrder = 4; m.userData.base = [x, y, z]; m.userData.k = streakMeshes.length; parent.add(m); streakMeshes.push(m);
    }
  };
  for (const s of [1, -1]) { streak(jet, [-0.62, -0.12, s * 1.37], 3.2, 0.02); streak(jet, [-1.36, 0.2, s * 0.38], 3.6, 0.035); }
  jet.scale.setScalar(0.72); jet.position.set(0.75, 0.05, 0); flight.add(jet);
  const escortL = fighter(), escortR = fighter();
  for (const [f, s] of [[escortL, 1], [escortR, -1]]) {
    for (const t of [1, -1]) { streak(f, [-0.96, 0.0, t * 1.03], 3.0, 0.025); streak(f, [-1.36, 0.0, t * 0.1], 3.4, 0.04); }
    f.scale.setScalar(0.62); f.position.set(-1.5, -0.08, s * 1.08);
  }
  // streaks stretch with speed on screen and ease back to their resting length; each one drifts a little
  let stretch = 1;
  const flightTick = (dt, motion, now) => {
    const target = 1 + Math.min(2.6, motion * 3.2);
    stretch += (target - stretch) * (target > stretch ? 1 - Math.pow(0.02, dt) : 1 - Math.pow(0.45, dt));   // quick to grow, slow to settle
    const t = now / 1000;
    streakMeshes.forEach(m => { const k = m.userData.k, b = m.userData.base;
      m.scale.x = stretch * (1 + 0.1 * Math.sin(t * 2.3 + k * 1.7));
      m.position.set(b[0], b[1] + 0.012 * Math.sin(t * 3.1 + k), b[2] + 0.018 * Math.sin(t * 1.9 + k * 2.1));
      m.rotation.y = 0.025 * Math.sin(t * 1.3 + k); });
  };
  const FL = { jet: grp("jetGroup", flight), escortL: grp("escortL", flight), escortR: grp("escortR", flight) };
  FL.jet.add(jet); FL.escortL.add(escortL); FL.escortR.add(escortR);
  const flightApart = { jet: [0.3, 0, 0], escortL: [-0.3, 0, 0.45], escortR: [-0.3, 0, -0.45] };

  // ======================= rocket (stainless, Starship-style) =======================
  const rocket = new THREE.Group(); rocket.name = "rocket";
  const R = {};
  const rp = [];
  for (let i = 0; i <= 64; i++) {
    const t = i / 64, y = -1.95 + 3.9 * t;
    let r = 0.27;
    if (t > 0.8) { const k = (t - 0.8) / 0.2; r = 0.27 * Math.sqrt(Math.max(0, 1 - k * k * 0.98)) * (1 - 0.15 * k); }
    if (t < 0.015) r = 0.27 * (0.85 + 10 * t);
    rp.push(new THREE.Vector2(Math.max(r, 0.002), y));
  }
  const tiles = canvasTex(1024, 1024, (g, W, H) => {
    g.fillStyle = "#cfd2d7"; g.fillRect(0, 0, W, H);
    for (let y = 0; y < H; y += 64) { g.fillStyle = "rgba(0,0,0,.06)"; g.fillRect(0, y, W, 2); }        // steel rings
    g.fillStyle = "#15161a"; g.fillRect(W * 0.12, 0, W * 0.26, H);                                     // heat shield on one side
    g.fillStyle = "#1A3FD6"; g.fillRect(W * 0.55, H * 0.12, W * 0.3, H * 0.03); g.fillStyle = "#E5BE01"; g.fillRect(W * 0.55, H * 0.16, W * 0.3, H * 0.008);
    g.save(); g.translate(W * 0.7, H * 0.5); g.rotate(Math.PI / 2); g.fillStyle = "#15161a"; g.font = `900 ${H * 0.07}px Archivo, Arial Black, sans-serif`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("TIGER", 0, 0); g.restore();
  });
  const rg = new THREE.LatheGeometry(rp, 48); rg.rotateZ(-Math.PI / 2);
  R.body = grp("body", rocket);
  R.body.add(new THREE.Mesh(rg, new THREE.MeshPhysicalMaterial({ map: tiles, metalness: 0.9, roughness: 0.3 })));
  R.flaps = grp("flaps", rocket);
  for (const s of [1, -1]) {
    R.flaps.add((new THREE.Mesh(slab([[1.45, 0.2], [1.05, 0.2], [1.1, 0.44], [1.38, 0.4]].map(([x, z]) => [x, z * s]), 0.02), dark)));
    R.flaps.add((new THREE.Mesh(slab([[-1.2, 0.22], [-1.9, 0.22], [-1.85, 0.6], [-1.35, 0.55]].map(([x, z]) => [x, z * s]), 0.025), dark)));
  }
  R.engines = grp("engines", rocket);
  const bellG = new THREE.CylinderGeometry(0.035, 0.075, 0.16, 20, 1, true); bellG.rotateZ(Math.PI / 2);
  const bellMat = new THREE.MeshPhysicalMaterial({ color: 0x8a6a3a, metalness: 1, roughness: 0.35, side: THREE.DoubleSide });
  for (const [y, z] of [[0, 0], [0.13, 0], [-0.065, 0.11], [-0.065, -0.11], [0.065, 0.11], [0.065, -0.11], [-0.13, 0]]) {
    const b = new THREE.Mesh(bellG, bellMat); b.position.set(-2.02, y, z); R.engines.add(b);
  }
  // exhaust plume. Dark mode: orange fire, additive. Light mode (uMode 1): a Bunsen burner flame,
  // a pale violet-blue outer cone with a short, sharp, bright cyan inner cone at the nozzle, gently flickering.
  const flameFrag = `uniform float uT, uA, uMode, uInner; uniform vec3 uHot, uCore; varying vec2 vUv;
    void main(){
      float y = vUv.y;                                       // 1 at the nozzle, 0 at the tip
      if (uMode < 0.5) {
        float a = pow(y, 1.6) * (0.75 + 0.25 * sin(y * 40.0 - uT * 30.0));
        vec3 c = mix(uHot, uCore, pow(y, 3.0));
        gl_FragColor = vec4(c * a * uA * 1.8, min(1.0, a * uA * 1.4));
      } else {
        float flick = 0.9 + 0.1 * sin(uT * 23.0 + y * 9.0) * sin(uT * 7.0);
        float a = uInner > 0.5 ? smoothstep(0.0, 0.35, y) * 0.95 : pow(y, 0.7) * 0.42;
        vec3 c = mix(uHot, uCore, uInner > 0.5 ? pow(y, 1.5) : y * 0.6);
        gl_FragColor = vec4(c, clamp(a * uA * flick, 0.0, 1.0));
      }
    }`;
  const flameVert = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
  const flameU = inner => ({ uT: { value: 0 }, uA: { value: 0 }, uMode: { value: 0 }, uInner: { value: inner },
    uHot: { value: new THREE.Color(1.0, 0.45, 0.1) }, uCore: { value: new THREE.Color(1.0, 0.92, 0.65) } });
  const plumeMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: flameU(0), vertexShader: flameVert, fragmentShader: flameFrag });
  const innerMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: flameU(1), vertexShader: flameVert, fragmentShader: flameFrag });
  const plumeG = new THREE.ConeGeometry(0.24, 2.2, 28, 1, true); plumeG.rotateZ(Math.PI / 2); plumeG.translate(-3.05, 0, 0);
  const plume = new THREE.Mesh(plumeG, plumeMat); plume.renderOrder = 5; R.engines.add(plume);
  const innerG = new THREE.ConeGeometry(0.13, 0.75, 28, 1, true); innerG.rotateZ(Math.PI / 2); innerG.translate(-0.375, 0, 0);   // nozzle at the mesh origin, so the flicker scales from there
  const inner = new THREE.Mesh(innerG, innerMat); inner.position.x = -1.96; inner.renderOrder = 6; inner.visible = false; R.engines.add(inner);
  plumeMat.userData.inner = inner;
  const rocketApart = { body: [0, 0, 0], flaps: [0, 0.45, 0], engines: [-0.5, 0, 0] };

  return {
    models: [
      { group: f1, parts: C, apart: f1Apart, labels: f1Labels, tick: f1Tick },
      { group: flight, parts: FL, apart: flightApart, labels: {}, streaks: streakMat, tick: flightTick },
      { group: rocket, parts: R, apart: rocketApart, labels: {}, plume: plumeMat },
    ],
  };
}

// a fresh, standalone F1 car for the inspector (its own materials and geometry)
export function buildF1() { return buildVehicles().models[0]; }
