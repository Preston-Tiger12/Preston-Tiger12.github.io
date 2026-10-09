/* 3D workbench for the piezoelectric vibration harvester.
 * Built from the report's bill of materials (1 scene unit = 10 mm):
 *   base 40x40x8 stainless · cantilever 50x10x0.4 stainless · PZT 30x10x0.2 · silver electrodes
 *   brass proof mass 30x15x1.5 · twisted copper pair to the PCB corner.
 * The beam bends in the vertex shader with the static cantilever shape y = A·u²(3-u)/2.
 */

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const ROOT = 0.92, LEN = 5;                      // beam root x (machine pad 1.2 mm + base 8 mm) and length (50 mm)
const shape = u => { u = clamp(u, 0, 1); return u * u * (3 - u) / 2; };
const slope = u => { u = clamp(u, 0, 1); return (6 * u - 3 * u * u) / 2 / LEN; };

// camera framing per part: [camera position, look-at target]
const VIEWS = {
  "":         [[12.5, 5.2, 11.5], [0.6, -0.6, 0]],
  base:       [[4.2, 2.4, 5.4], [0.4, -0.3, 0]],
  beam:       [[3.6, 3.4, 5.0], [3.3, 0, 0]],
  pzt:        [[2.6, 1.7, 2.6], [2.3, 0.04, 0]],
  electrodes: [[2.2, 1.0, 1.6], [2.1, 0.04, 0.3]],
  mass:       [[7.0, 1.8, 3.0], [5.0, 0.1, 0]],
  wires:      [[3.6, -0.4, 4.6], [0.9, -1.0, 0.9]],
};

export function startPiezoScene(host, stageEl, st, step, onPick) {
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" }); if (!renderer.getContext()) throw 0; }
  catch (e) { host.classList.add("nogl"); return null; }
  host.classList.add("gl");
  const phone = innerWidth < 760;
  const gpu = (() => { try { const g = renderer.getContext(), x = g.getExtension("WEBGL_debug_renderer_info"); return x ? g.getParameter(x.UNMASKED_RENDERER_WEBGL) : ""; } catch (e) { return ""; } })();
  const weakGPU = /intel|mali|adreno|powervr|apple gpu|swiftshader|llvmpipe/i.test(gpu) || phone;
  const MAX_DPR = Math.min(devicePixelRatio, weakGPU ? 1.4 : 1.75), MIN_DPR = 0.75;
  let DPR = Math.min(MAX_DPR, weakGPU ? 1 : 1.4);
  renderer.setPixelRatio(DPR);
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0d18);
  const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 200);

  // ---------- studio lighting: an env map with two soft boxes, plus a shadowing key ----------
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(40, 32, 16), new THREE.MeshBasicMaterial({ color: 0x1a1d33, side: THREE.BackSide })));
  const box = (w, h, pos, c) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(3), side: THREE.DoubleSide })); m.position.set(...pos); m.lookAt(0, 0, 0); envScene.add(m); };
  box(16, 7, [10, 14, 12], 0xfff1e0);       // warm overhead softbox
  box(10, 14, [-16, 4, -6], 0x9db8ff);      // cool rim
  box(30, 3, [0, -12, 10], 0xff9f2e);       // a low amber strip for the brass and copper
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envRT = pmrem.fromScene(envScene, 0.03); scene.environment = envRT.texture;

  const key = new THREE.DirectionalLight(0xfff0dc, 2.2); key.position.set(6, 9, 7); key.castShadow = true;
  key.shadow.mapSize.set(weakGPU ? 1024 : 2048, weakGPU ? 1024 : 2048);
  Object.assign(key.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: 2, far: 25 });
  key.shadow.bias = -0.0003; key.shadow.normalBias = 0.02;
  key.target.position.set(2.5, 0, 0);
  scene.add(key, key.target, new THREE.HemisphereLight(0x8fa3d6, 0x1a1420, 0.35));

  // ---------- materials ----------
  const HDR_CAP = "24.0";
  const cap = m => { const prev = m.onBeforeCompile; m.onBeforeCompile = (sh, r) => { prev && prev(sh, r); sh.fragmentShader = sh.fragmentShader.replace("#include <dithering_fragment>", "#include <dithering_fragment>\n gl_FragColor.rgb = min(gl_FragColor.rgb, vec3(" + HDR_CAP + "));"); }; return m; };
  const bendU = { uAmp: { value: 0 } };
  const bending = m => { m.onBeforeCompile = (sh, r) => {
    sh.uniforms.uAmp = bendU.uAmp;
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nuniform float uAmp;\nfloat bshape(float x){ float u = clamp((x - " + ROOT.toFixed(2) + ") / " + LEN.toFixed(2) + ", 0.0, 1.0); return u*u*(3.0-u)*0.5; }")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\ntransformed.y += uAmp * bshape(transformed.x);");
    sh.fragmentShader = sh.fragmentShader.replace("#include <dithering_fragment>", "#include <dithering_fragment>\n gl_FragColor.rgb = min(gl_FragColor.rgb, vec3(" + HDR_CAP + "));");
  }; m.customProgramCacheKey = () => "bend"; return m; };

  const M = {
    paint: cap(new THREE.MeshStandardMaterial({ color: 0x232a3b, roughness: 0.62, metalness: 0.35 })),
    steelDark: cap(new THREE.MeshStandardMaterial({ color: 0x3a4152, roughness: 0.4, metalness: 0.8 })),
    stainless: cap(new THREE.MeshStandardMaterial({ color: 0xc9ccd2, roughness: 0.28, metalness: 1 })),
    base: cap(new THREE.MeshStandardMaterial({ color: 0xc4c7cd, roughness: 0.32, metalness: 1 })),
    beam: bending(new THREE.MeshStandardMaterial({ color: 0xd3d6dc, roughness: 0.22, metalness: 1 })),
    pzt: bending(new THREE.MeshStandardMaterial({ color: 0xe8e3d8, roughness: 0.55, metalness: 0.05, emissive: new THREE.Color(0.35, 0.75, 1.0), emissiveIntensity: 0 })),
    silver: bending(new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.18, metalness: 1 })),
    brass: cap(new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(0.91, 0.78, 0.42), roughness: 0.26, metalness: 1 })),
    copper: cap(new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(0.955, 0.637, 0.538), roughness: 0.3, metalness: 1 })),
    copper2: cap(new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(0.75, 0.35, 0.2), roughness: 0.35, metalness: 0.9 })),
    epoxy: cap(new THREE.MeshStandardMaterial({ color: 0xd9c9a3, roughness: 0.4, metalness: 0, transparent: true, opacity: 0.75 })),
  };

  const parts = {};   // part id -> meshes (for highlight and picking)
  const tag = (mesh, id) => { mesh.userData.part = id; (parts[id] ||= []).push(mesh); mesh.castShadow = true; mesh.receiveShadow = true; return mesh; };

  // ---------- the machine it is bonded to ----------
  const machine = new THREE.Group(); scene.add(machine);
  const housing = new THREE.Mesh(new RoundedBoxGeometry(6, 12, 14, 4, 0.25), M.paint); housing.position.set(-3, -1, 0); housing.receiveShadow = true; machine.add(housing);
  for (let i = 0; i < 9; i++) { const fin = new THREE.Mesh(new RoundedBoxGeometry(5.4, 0.18, 1.0, 2, 0.06), M.steelDark); fin.position.set(-3, -5.6 + i * 1.3, 7.4); fin.castShadow = fin.receiveShadow = true; machine.add(fin); }
  const pad = new THREE.Mesh(new RoundedBoxGeometry(0.12, 6, 6, 2, 0.04), M.steelDark); pad.position.set(0.06, 0, 0); pad.receiveShadow = true; machine.add(pad);
  for (const [y, z] of [[2.6, 2.6], [2.6, -2.6], [-2.6, 2.6], [-2.6, -2.6]]) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.16, 6), M.stainless); b.rotation.z = Math.PI / 2; b.position.set(0.18, y, z); machine.add(b); }

  // ---------- the harvester (built in place, so object space = scene space) ----------
  const dev = new THREE.Group(); scene.add(dev);
  const base = tag(new THREE.Mesh(new RoundedBoxGeometry(0.8, 4, 4, 3, 0.05), M.base), "base"); base.position.set(0.12 + 0.4, 0, 0); dev.add(base);
  const glue = new THREE.Mesh(new THREE.BoxGeometry(0.03, 3.8, 3.8), M.epoxy); glue.position.set(0.13, 0, 0); dev.add(glue);

  const beamG = new THREE.Group(); dev.add(beamG);          // everything that bends
  const bar = (w, h, d, x0, y0, segs) => { const g = new THREE.BoxGeometry(w, h, d, segs, 1, 1); g.translate(x0 + w / 2, y0 + h / 2, 0); return g; };
  const BEAM_X = 0.12 + 0.8;                                  // root at the base face
  const beam = tag(new THREE.Mesh(bar(LEN, 0.04, 1, BEAM_X, -0.02, 80), M.beam), "beam"); beamG.add(beam);
  const pzt = tag(new THREE.Mesh(bar(3, 0.02, 0.96, BEAM_X + 0.05, 0.02, 50), M.pzt), "pzt"); beamG.add(pzt);
  const elTop = tag(new THREE.Mesh(bar(3, 0.004, 0.96, BEAM_X + 0.05, 0.04, 50), M.silver), "electrodes"); beamG.add(elTop);
  const elBot = tag(new THREE.Mesh(bar(3, 0.004, 0.96, BEAM_X + 0.05, 0.018, 50), M.silver), "electrodes"); beamG.add(elBot);

  const MASS_U = (LEN - 0.75) / LEN;                           // proof mass centre along the beam
  const massG = new THREE.Group(); dev.add(massG);
  const mass = tag(new THREE.Mesh(new RoundedBoxGeometry(1.5, 0.15, 3, 2, 0.02), M.brass), "mass"); mass.position.set(0, 0.095, 0); massG.add(mass);
  massG.position.set(BEAM_X + LEN - 0.75, 0, 0);

  // twisted pair from the electrodes at the root down to the PCB corner
  const wirePath = new THREE.CatmullRomCurve3([
    new THREE.Vector3(BEAM_X + 0.25, 0.06, 0.3), new THREE.Vector3(BEAM_X + 0.15, 0.35, 0.9), new THREE.Vector3(BEAM_X + 0.1, -0.4, 1.5),
    new THREE.Vector3(BEAM_X + 0.05, -1.6, 1.7), new THREE.Vector3(BEAM_X + 0.02, -2.25, 1.75)]);
  const strand = phase => {
    const pts = [], N = 160, frames = wirePath.computeFrenetFrames(N, false);
    for (let i = 0; i <= N; i++) { const t = i / N, a = t * 34 + phase; const c = wirePath.getPointAt(t);
      pts.push(c.clone().addScaledVector(frames.normals[i], Math.cos(a) * 0.035).addScaledVector(frames.binormals[i], Math.sin(a) * 0.035)); }
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 220, 0.022, 8, false);
  };
  tag(new THREE.Mesh(strand(0), M.copper), "wires"); tag(new THREE.Mesh(strand(Math.PI), M.copper2), "wires");
  parts.wires.forEach(w => dev.add(w));

  // ---------- charge: soft sparks running down the wires when the PZT is producing ----------
  const N_SP = 40, spU = { uTime: { value: 0 }, uAmt: { value: 0 }, uPR: { value: DPR }, uColor: { value: new THREE.Color(0.55, 0.85, 1.0).multiplyScalar(2.2) } };
  const spPos = []; for (let i = 0; i < N_SP; i++) { const p = wirePath.getPointAt(i / N_SP); spPos.push(p.x, p.y, p.z); }
  // positions are baked along the path; the shader just slides a bright band along them
  const spGeo = new THREE.BufferGeometry(); spGeo.setAttribute("position", new THREE.Float32BufferAttribute(spPos, 3));
  spGeo.setAttribute("aT", new THREE.Float32BufferAttribute([...Array(N_SP)].map((_, i) => i / N_SP), 1));
  const sparks = new THREE.Points(spGeo, new THREE.ShaderMaterial({
    uniforms: spU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute float aT; uniform float uTime, uAmt, uPR; varying float vA;
      void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); float w = fract(aT * 3.0 - uTime * 1.6);
        vA = uAmt * smoothstep(0.0, 0.15, w) * (1.0 - smoothstep(0.15, 0.6, w));
        gl_PointSize = 22.0 * uPR / max(-mv.z, 0.5); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uColor; varying float vA; void main(){ vec2 c = gl_PointCoord - 0.5; float a = exp(-dot(c,c)*24.0) * vA; if (a < 0.003) discard; gl_FragColor = vec4(uColor * a, a); }`,
  }));
  sparks.frustumCulled = false; dev.add(sparks);

  // ---------- post: render, bloom, output (tone map + grain + vignette) ----------
  const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: weakGPU ? 2 : 4 });
  const composer = new EffectComposer(renderer, rt); composer.setPixelRatio(DPR);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.45, 0.5, 1.2);
  bloom.materialHighPassFilter.fragmentShader = bloom.materialHighPassFilter.fragmentShader.replace("vec4 texel = texture2D( tDiffuse, vUv );",
    "vec4 texel = texture2D( tDiffuse, vUv ); if (any(isnan(texel.rgb)) || any(isinf(texel.rgb))) texel = vec4(0.0); texel.rgb = min(texel.rgb, vec3(" + HDR_CAP + "));");
  composer.addPass(bloom);
  const output = new OutputPass();
  Object.assign(output.material.uniforms, { uTime: { value: 0 }, uGrain: { value: 0.035 }, uVig: { value: 0.3 } });
  output.material.fragmentShader = output.material.fragmentShader
    .replace("varying vec2 vUv;", "varying vec2 vUv; uniform float uTime, uGrain, uVig;\n float rnd(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }")
    .replace(/}\s*$/, `  gl_FragColor.rgb += (rnd(vUv * 1000.0 + fract(uTime) * 61.0) - 0.5) * uGrain;
      gl_FragColor.rgb *= mix(1.0 - uVig, 1.0, smoothstep(0.95, 0.25, length((vUv - 0.5) * vec2(1.1, 1.0))));
    }`);
  composer.addPass(output);

  const PART_MATS = { base: [M.base], beam: [M.beam], electrodes: [M.silver], mass: [M.brass], wires: [M.copper, M.copper2] };
  Object.values(PART_MATS).flat().forEach(m => m.emissive.setRGB(1, 0.62, 0.2));
  const hl = Object.fromEntries(Object.keys(PART_MATS).map(k => [k, 0]));

  // ---------- camera and controls ----------
  const controls = new OrbitControls(camera, renderer.domElement);
  Object.assign(controls, { enableDamping: true, dampingFactor: 0.08, enableZoom: false, enablePan: false, rotateSpeed: 0.6, minPolarAngle: 0.25, maxPolarAngle: 2.1 });
  camera.position.set(...VIEWS[""][0]); controls.target.set(...VIEWS[""][1]);
  let tween = null;
  const focus = id => {
    const [p, t] = VIEWS[id] || VIEWS[""];
    tween = { t: 0, p0: camera.position.clone(), t0: controls.target.clone(), p1: new THREE.Vector3(...p), t1: new THREE.Vector3(...t) };
    if (phone) tween.p1.sub(tween.t1).multiplyScalar(id ? 1.8 : 1.35).add(tween.t1);
  };
  focus("");

  // click to pick a part (ignored if the pointer moved, i.e. it was a drag)
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(); let down = null;
  renderer.domElement.addEventListener("pointerdown", e => { down = [e.clientX, e.clientY]; });
  renderer.domElement.addEventListener("pointerup", e => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(Object.values(parts).flat(), false)[0];
    onPick(hit ? hit.object.userData.part : "");
  });

  // ---------- sizing and adaptive resolution ----------
  const resize = () => {
    const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); composer.setSize(w, h);
    camera.aspect = w / h; camera.updateProjectionMatrix(); spU.uPR.value = DPR;
  };
  const ro = new ResizeObserver(resize); ro.observe(host); resize();
  let avg = 16.7, lastFrame = 0, lastChange = 0;
  const adapt = now => {
    if (lastFrame) avg += (Math.min(now - lastFrame, 100) - avg) * 0.08; lastFrame = now;
    if (now - lastChange < 1200) return;
    if (avg > 18 && DPR > MIN_DPR) { DPR = Math.max(MIN_DPR, +(DPR * 0.85).toFixed(2)); }
    else if (avg < 11.5 && DPR < MAX_DPR) { DPR = Math.min(MAX_DPR, +(DPR * 1.1).toFixed(2)); }
    else return;
    renderer.setPixelRatio(DPR); composer.setPixelRatio(DPR); resize(); lastChange = now;
  };

  // ---------- frame loop (only while the workbench is on screen) ----------
  let visible = true, running = true, raf = 0, last = performance.now(), clock = 0;
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible && running && !raf) { last = performance.now(); raf = requestAnimationFrame(frame); } }, { threshold: 0.01 });
  io.observe(stageEl);
  const ex = { pzt: 0, el: 0, mass: 0, beam: 0 };
  function frame(now) {
    raf = 0; if (!running || !visible || document.hidden) return;
    const dt = clamp((now - last) / 1000, 0, 0.05); last = now; if (!reduced) clock += dt;
    step(reduced ? 0 : dt);

    // bending and the proof mass riding on the tip
    bendU.uAmp.value = st.disp;
    massG.position.y = st.disp * shape(MASS_U) + ex.mass; massG.rotation.z = Math.atan(st.disp * slope(MASS_U));
    // exploded view: layers lift apart
    const k = 1 - Math.pow(0.002, dt), E = st.explode ? 1 : 0;
    ex.pzt += (E * 0.55 - ex.pzt) * k; ex.el += (E * 0.95 - ex.el) * k; ex.mass += (E * 1.6 - ex.mass) * k; ex.beam += (E * 0.7 - ex.beam) * k;
    beamG.position.x = ex.beam; massG.position.x = BEAM_X + LEN - 0.75 + ex.beam;
    pzt.position.y = ex.pzt; elTop.position.y = ex.el; elBot.position.y = ex.pzt * 0.5;
    sparks.visible = ex.beam < 0.05; parts.wires.forEach(w => w.visible = ex.beam < 0.3);

    // electricity: PZT glows and sparks run down the wires with power (response squared)
    const power = st.resp * st.resp;
    M.pzt.emissiveIntensity = power * (1.2 + 0.8 * Math.abs(Math.sin(st.phase)));
    spU.uAmt.value = clamp(power * 1.4, 0, 1); spU.uTime.value = clock * (0.4 + power);
    // selected part warms up slightly (each part has its own material, so nothing else is tinted)
    for (const [pid, mats] of Object.entries(PART_MATS)) { hl[pid] += ((st.part === pid ? 1 : 0) - hl[pid]) * k; mats.forEach(m => { m.emissiveIntensity = hl[pid] * 0.16; }); }
    elBot.visible = ex.pzt > 0.05;

    if (tween) { tween.t = Math.min(1, tween.t + dt / 0.9); const e = tween.t < 0.5 ? 4 * tween.t ** 3 : 1 - (-2 * tween.t + 2) ** 3 / 2;
      camera.position.lerpVectors(tween.p0, tween.p1, e); controls.target.lerpVectors(tween.t0, tween.t1, e); if (tween.t >= 1) tween = null; }
    controls.update();
    output.material.uniforms.uTime.value = clock;
    composer.render(); adapt(now);
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
  const vis = () => { if (!document.hidden && running && visible && !raf) { last = performance.now(); raf = requestAnimationFrame(frame); } };
  document.addEventListener("visibilitychange", vis);
  if (location.search.includes("debug")) window.__pz = { THREE, renderer, scene, camera, composer, st, frame: t => { visible = true; frame(t); }, get dpr() { return DPR; } };

  return {
    focus,
    stop() { running = false; cancelAnimationFrame(raf); io.disconnect(); ro.disconnect(); document.removeEventListener("visibilitychange", vis);
      controls.dispose(); envRT.dispose(); pmrem.dispose(); rt.dispose(); renderer.dispose(); renderer.domElement.remove(); },
  };
}
