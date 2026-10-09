/* Three boards, modelled in code: a skateboard, a surfboard and a snowboard.
 * Every board is 3.9 units nose to tail along x, deck up (+y), width along z.
 * Each board body is one "plate": a grid of top and bottom surfaces plus a rail,
 * so it can bend (kicktails, rocker, turned-up tips) and carry a printed graphic.
 */

import * as THREE from "three";

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// plate: halfLen, w(x) half width, top(x, z) and bot(x, z) heights; groups 0 top, 1 bottom, 2 rail
function plate(L, w, top, bot, nx = 96, nz = 14) {
  const pos = [], uv = [], idx = [], groups = [];
  const grid = (surf, flip) => {
    const base = pos.length / 3;
    for (let i = 0; i <= nx; i++) {
      const x = -L + 2 * L * i / nx, hw = Math.max(w(x), 1e-4);
      for (let j = 0; j <= nz; j++) { const v = j / nz, z = -hw + 2 * hw * v; pos.push(x, surf(x, z), z); uv.push(i / nx, v); }
    }
    const start = idx.length;
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      const a = base + i * (nz + 1) + j, b = a + nz + 1;
      flip ? idx.push(a, a + 1, b, b, a + 1, b + 1) : idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
    groups.push([start, idx.length - start]);
  };
  grid(top, true); grid(bot, false);   // winding: top faces +y, bottom faces -y
  // rail: a strip along each edge joining top and bottom
  const start = idx.length;
  for (const side of [-1, 1]) {
    const base = pos.length / 3;
    for (let i = 0; i <= nx; i++) {
      const x = -L + 2 * L * i / nx, z = side * Math.max(w(x), 1e-4);
      pos.push(x, top(x, z), z, x, bot(x, z), z); uv.push(i / nx, 1, i / nx, 0);
    }
    for (let i = 0; i < nx; i++) { const a = base + i * 2, b = a + 2;
      side > 0 ? idx.push(a, a + 1, b, b, a + 1, b + 1) : idx.push(a, b, a + 1, b, b + 1, a + 1); }
  }
  groups.push([start, idx.length - start]);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  groups.forEach(([s, c], k) => g.addGroup(s, c, k));
  g.computeVertexNormals();
  return g;
}

// printed graphics, drawn once on canvases (u runs nose to tail, v across the board)
function graphic(w, h, draw) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
const word = (g, text, x, y, size, color, stretch = 1) => {
  g.save(); g.translate(x, y); g.scale(stretch, 1); g.fillStyle = color;
  g.font = `900 ${size}px Archivo, "Arial Black", Arial, sans-serif`; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(text, 0, 0); g.restore();
};
const BLUE = "#1A3FD6", GOLD = "#E5BE01", INK = "#0B0C0E", PAPER = "#F3F3F0";

export function buildBoards() {
  const metal = new THREE.MeshPhysicalMaterial({ color: 0xd9d9d6, metalness: 1, roughness: 0.28 });
  const steel = new THREE.MeshPhysicalMaterial({ color: 0x8d9097, metalness: 1, roughness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1b1c20, metalness: 0.3, roughness: 0.55 });
  const gold = new THREE.MeshPhysicalMaterial({ color: 0xe5be01, metalness: 0.25, roughness: 0.4, clearcoat: 0.4 });
  const urethane = new THREE.MeshPhysicalMaterial({ color: 0xf1ead8, roughness: 0.55, clearcoat: 0.2, sheen: 0.4 });
  const maple = new THREE.MeshStandardMaterial({ color: 0xd8b688, roughness: 0.6 });

  // ---------------- skateboard ----------------
  const skate = new THREE.Group(); skate.name = "skate";
  const sw = x => { const a = Math.abs(x); return a <= 1.42 ? 0.5 : Math.sqrt(Math.max(0, 0.25 - (a - 1.42) ** 2)) * 1.0; };
  const kick = (x, z) => 0.34 * Math.pow(sstep(1.25, 1.92, Math.abs(x)), 1.4) + 0.035 * (z / 0.5) ** 2;
  const T = 0.055;
  const deckG = plate(1.92, sw, (x, z) => kick(x, z), (x, z) => kick(x, z) - T);
  const deckBottom = graphic(2048, 512, (g, W, H) => {
    g.fillStyle = BLUE; g.fillRect(0, 0, W, H);
    g.fillStyle = GOLD; g.fillRect(0, H * 0.08, W, H * 0.05); g.fillRect(0, H * 0.87, W, H * 0.05);
    word(g, "TIGER", W * 0.5, H * 0.52, H * 0.62, PAPER, 1.5);
    g.fillStyle = GOLD; g.beginPath(); g.arc(W * 0.86, H * 0.5, H * 0.09, 0, Math.PI * 2); g.fill();
  });
  deckBottom.wrapS = THREE.ClampToEdgeWrapping;
  const P = {};
  const grp = (n, parent) => { const g = new THREE.Group(); g.name = n; parent.add(g); return g; };
  P.deck = grp("deck", skate);
  P.deck.add(new THREE.Mesh(deckG, [maple, new THREE.MeshPhysicalMaterial({ map: deckBottom, roughness: 0.35, clearcoat: 0.6 }), maple]));
  P.grip = grp("grip", skate);
  const gripTex = graphic(1024, 256, (g, W, H) => { g.fillStyle = "#16171a"; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 9000; i++) { const v = 20 + Math.random() * 40; g.fillStyle = `rgb(${v},${v},${v + 4})`; g.fillRect(Math.random() * W, Math.random() * H, 1.4, 1.4); }
    g.fillStyle = GOLD; g.fillRect(W * 0.5 - 2, 0, 4, H); });
  const gripMat = new THREE.MeshStandardMaterial({ map: gripTex, roughness: 0.95 });
  P.grip.add(new THREE.Mesh(plate(1.9, x => sw(x) * 0.985, (x, z) => kick(x, z) + 0.008, (x, z) => kick(x, z) + 0.001, 96, 10), [gripMat, gripMat, dark]));

  P.trucks = grp("trucks", skate); P.bushings = grp("bushings", skate);
  P.wheelsA = grp("wheelsA", skate); P.wheelsB = grp("wheelsB", skate);
  P.bearingsA = grp("bearingsA", skate); P.bearingsB = grp("bearingsB", skate);
  for (const sx of [-1.12, 1.12]) {
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.035, 0.28), metal); base.position.set(sx, -T - 0.018, 0); P.trucks.add(base);
    const hanger = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.06, 0.6, 18), metal); hanger.rotation.x = Math.PI / 2; hanger.position.set(sx, -T - 0.2, 0); P.trucks.add(hanger);
    const yoke = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 0.14), metal); yoke.position.set(sx, -T - 0.16, 0); P.trucks.add(yoke);
    const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.9, 10), steel); axle.rotation.x = Math.PI / 2; axle.position.set(sx, -T - 0.2, 0); P.trucks.add(axle);
    const king = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.16, 8), steel); king.position.set(sx + (sx > 0 ? -0.05 : 0.05), -T - 0.1, 0); P.trucks.add(king);
    for (const dy of [0.07, 0.13]) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.045, 18), gold); b.position.set(sx + (sx > 0 ? -0.05 : 0.05), -T - dy, 0); P.bushings.add(b); }
    for (const sz of [-1, 1]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.13, 32, 1), urethane); wheel.rotation.x = Math.PI / 2; wheel.position.set(sx, -T - 0.2, sz * 0.38);
      (sz > 0 ? P.wheelsA : P.wheelsB).add(wheel);
      const brg = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.016, 10, 28), steel); brg.position.set(sx, -T - 0.2, sz * 0.452);
      const brg2 = brg.clone(); brg2.position.z = sz * 0.31;
      (sz > 0 ? P.bearingsA : P.bearingsB).add(brg, brg2);
    }
  }
  const skateApart = { grip: [0, 0.75, 0], deck: [0, 0, 0], bushings: [0, -0.38, 0], trucks: [0, -0.72, 0], wheelsA: [0, -0.72, 0.55], wheelsB: [0, -0.72, -0.55], bearingsA: [0, -0.72, 0.95], bearingsB: [0, -0.72, -0.95] };
  const skateLabels = { grip: ["grip", [0.4, 0.04, 0.3]], deck: ["deck", [-1.3, -0.02, -0.45]], trucks: ["trucks", [1.12, -T - 0.2, 0.22]], bushings: ["bushings", [1.07, -T - 0.1, 0]], bearings: ["bearingsA", [1.12, -T - 0.2, 0.47]], wheels: ["wheelsA", [-1.12, -T - 0.2, 0.45]] };

  // ---------------- surfboard ----------------
  const surf = new THREE.Group(); surf.name = "surf";
  const L = 1.95;
  const tt = x => (x + L) / (2 * L);                                             // 0 tail, 1 nose
  const swd = x => 0.5 * Math.pow(Math.max(0, Math.sin(Math.PI * (0.12 + 0.86 * tt(x)))), 0.62);
  const rocker = x => 0.42 * Math.pow(tt(x), 3.2) + 0.1 * Math.pow(1 - tt(x), 2.4);
  const thick = x => 0.16 * Math.pow(Math.max(0, Math.sin(Math.PI * (0.06 + 0.88 * tt(x)))), 0.55) + 0.012;
  const dome = (x, z) => { const hw = Math.max(swd(x), 1e-4); return Math.sqrt(Math.max(0, 1 - (z / hw) ** 2)); };
  const surfTop = graphic(2048, 512, (g, W, H) => {
    g.fillStyle = PAPER; g.fillRect(0, 0, W, H);
    g.fillStyle = "#3a2c1a"; g.fillRect(0, H / 2 - 3, W, 6);                                    // stringer
    g.fillStyle = BLUE; g.fillRect(W * 0.62, 0, W * 0.05, H); g.fillStyle = GOLD; g.fillRect(W * 0.69, 0, W * 0.015, H);
    word(g, "TIGER", W * 0.36, H * 0.5, H * 0.2, BLUE, 1.4);
  });
  surfTop.flipY = false;   // text reads the right way round from above
  const surfBot = graphic(1024, 256, (g, W, H) => { g.fillStyle = PAPER; g.fillRect(0, 0, W, H); g.fillStyle = BLUE; g.fillRect(0, 0, W, H * 0.12); g.fillRect(0, H * 0.88, W, H * 0.12); });
  const glass = { roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.08 };
  P.surfBody = grp("surfBody", surf);
  P.surfBody.add(new THREE.Mesh(plate(L, swd, (x, z) => rocker(x) + thick(x) * 0.62 * Math.pow(dome(x, z), 0.55), (x, z) => rocker(x) - thick(x) * 0.38 * Math.pow(dome(x, z), 0.8), 128, 18),
    [new THREE.MeshPhysicalMaterial({ map: surfTop, ...glass }), new THREE.MeshPhysicalMaterial({ map: surfBot, ...glass }), new THREE.MeshPhysicalMaterial({ color: 0xf3f3f0, ...glass })]));
  const finShape = new THREE.Shape(); finShape.moveTo(-0.12, 0); finShape.quadraticCurveTo(0.02, -0.06, 0.06, -0.26); finShape.quadraticCurveTo(0.1, -0.08, 0.12, 0); finShape.lineTo(-0.12, 0);
  const finG = new THREE.ExtrudeGeometry(finShape, { depth: 0.014, bevelEnabled: false }); finG.translate(0, 0, -0.007);
  const finMat = new THREE.MeshPhysicalMaterial({ color: 0x1a3fd6, roughness: 0.25, clearcoat: 1, transmission: 0.2, thickness: 0.05 });
  for (const [fx, fz, toe] of [[-1.72, 0, 0], [-1.48, 0.21, 0.08], [-1.48, -0.21, -0.08]]) {
    const f = new THREE.Mesh(finG, finMat); f.position.set(fx, rocker(fx) - thick(fx) * 0.38, fz); f.rotation.y = toe; P.surfBody.add(f);
  }

  // ---------------- snowboard ----------------
  const snow = new THREE.Group(); snow.name = "snow";
  const nw = x => { const a = Math.abs(x); if (a <= 1.5) return 0.43 + 0.055 * (a / 1.5) ** 2; return 0.485 * Math.sqrt(Math.max(0, 1 - ((a - 1.5) / 0.45) ** 2)); };
  const tip = x => 0.3 * Math.pow(sstep(1.38, 1.95, Math.abs(x)), 1.6) - 0.025 * Math.cos(Math.PI * x / 3);
  const snowTop = graphic(2048, 512, (g, W, H) => {
    g.fillStyle = INK; g.fillRect(0, 0, W, H);
    g.save(); g.translate(W * 0.5, H * 0.5); g.rotate(-0.5);
    for (let k = -6; k <= 6; k++) { g.fillStyle = k % 3 === 0 ? GOLD : k % 3 === 1 ? BLUE : "#2a2c33"; g.fillRect(k * 140 - 20, -H * 2, 40, H * 4); }
    g.restore();
    g.fillStyle = INK; g.fillRect(W * 0.3, H * 0.28, W * 0.4, H * 0.44);
    word(g, "TIGER", W * 0.5, H * 0.52, H * 0.34, PAPER, 1.6);
  });
  snowTop.flipY = false;
  P.snowBody = grp("snowBody", snow);
  P.snowBody.add(new THREE.Mesh(plate(1.95, nw, (x, z) => tip(x), (x, z) => tip(x) - 0.045, 128, 10),
    [new THREE.MeshPhysicalMaterial({ map: snowTop, roughness: 0.3, clearcoat: 0.8 }), new THREE.MeshPhysicalMaterial({ color: 0x0d0e12, roughness: 0.25, clearcoat: 1 }), steel]));
  const bindMat = new THREE.MeshPhysicalMaterial({ color: 0x15161a, roughness: 0.4, clearcoat: 0.5 });
  for (const bx of [-0.62, 0.62]) {
    const b = new THREE.Group(); b.position.set(bx, tip(bx), 0); b.rotation.y = bx > 0 ? -0.26 : 0.26;
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.03, 24), metal); disc.position.y = 0.015; b.add(disc);
    const baseB = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.035, 0.5), bindMat); baseB.position.y = 0.045; b.add(baseB);
    const high = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.15, 0.36, 18, 1, true, Math.PI * 0.2, Math.PI * 0.6), bindMat);
    high.material = bindMat.clone(); high.material.side = THREE.DoubleSide; high.position.set(-0.03, 0.23, 0); high.rotation.y = Math.PI; b.add(high);
    for (const [sx2, r] of [[0.06, 0.15], [-0.08, 0.13]]) { const s = new THREE.Mesh(new THREE.TorusGeometry(r, 0.03, 8, 24, Math.PI), gold); s.rotation.y = Math.PI / 2; s.position.set(sx2, 0.065, 0); b.add(s); }
    P.snowBody.add(b);
  }

  return {
    boards: [skate, surf, snow],
    parts: P,
    skateApart, skateLabels,
    materials: { metal, steel, dark, gold, urethane, maple },
  };
}
