/* The 3D scene behind the Solare layout.
 *
 * Rendering: physically based materials lit by an environment map made from
 * our own sky (so the dish mirrors the dawn), a soft-shadowed sun light,
 * HDR bloom, AgX tone mapping, then grain and vignette.
 * Everything is procedural: no textures to download.
 * Units: 1 = 100 mm, from the group report.
 */

import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = t => t * t * (3 - 2 * t);
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------- art direction ----------
// "Dawn over the terminator" (light) and "night pass" (dark).
const PALETTES = {
  light: {
    skyTop: "#9E92C8", skyMid: "#EDAF8C", skyLow: "#FFD3A0", halo: "#FFB866",
    sunCore: "#FFD98C", sunEdge: "#FF8A1E", sunPower: 1.45,
    ocean: "#8EA6D2", land: "#E6CDAB", cloud: "#FFF7EE", atmoDay: "#AECBFF", atmoTwi: "#FFB27A", night: "#2C3152",
    key: "#FFE6C8", keyPower: 3.4, hemiSky: "#E6DAFF", hemiGround: "#F3C8A0", hemiPower: 0.35,
    dust: "#FFE0B4", dustAmt: 0.55, stars: 0, exposure: 0.9, bloom: 0.45,
  },
  dark: {
    skyTop: "#03040A", skyMid: "#0A0F22", skyLow: "#1A2550", halo: "#FF9C4A",
    sunCore: "#FFD58A", sunEdge: "#FF7A18", sunPower: 2.4,
    ocean: "#0D2246", land: "#28382F", cloud: "#C9D4E8", atmoDay: "#4E8BFF", atmoTwi: "#FF8448", night: "#060912",
    key: "#FFE2BE", keyPower: 3.8, hemiSky: "#3A4270", hemiGround: "#0B0E1C", hemiPower: 0.25,
    dust: "#BFD2FF", dustAmt: 0.35, stars: 1, exposure: 1.05, bloom: 0.6,
  },
};

const SUN_DIR = new THREE.Vector3(-70, 9, -14).normalize();
const SUN_POS = SUN_DIR.clone().multiplyScalar(120);
const v3 = a => new THREE.Vector3(...a);
const at = (d, k) => SUN_DIR.clone().multiplyScalar(d).toArray().map((x, i) => x + (k?.[i] || 0));

// camera shots; body = shell opacity, explode = TEG stack spread, the rest are effect strengths
export const SHOTS = {
  sun:      { pos: at(88, [0, -4, 2]), look: SUN_POS.clone().add(new THREE.Vector3(0, -13, 0)).toArray(), body: 1, explode: 0, rays: 0, heat: 0, glow: 0, cold: 0, spin: 0 },
  wide:     { pos: [5.8, 1.15, 3.2], look: [-1.4, 0.4, 0], body: 1, explode: 0, rays: 0.35, heat: 0, glow: 0.2, cold: 0, spin: 0 },
  dish:     { pos: [-5.4, 1.2, 2.7], look: [-1.5, 0, 0], body: 1, explode: 0, rays: 1, heat: 0, glow: 0.6, cold: 0, spin: 0 },
  receiver: { pos: [-2.75, 0.62, 1.2], look: [-1.7, 0, 0], body: 1, explode: 0, rays: 0.7, heat: 0.2, glow: 1, cold: 0, spin: 0 },
  pipe:     { pos: [0.1, 1.95, 4.3], look: [-0.25, 0.05, 0], body: 0.14, explode: 0, rays: 0.25, heat: 1, glow: 0.8, cold: 0, spin: 0 },
  stack:    { pos: [2.9, 1.05, -3.3], look: [1.85, 0, 0], body: 0.5, explode: 1, rays: 0, heat: 0.6, glow: 0.3, cold: 0.6, spin: 0 },
  radiator: { pos: [4.5, 0.75, -1.8], look: [1.15, 0, 0], body: 1, explode: 0, rays: 0, heat: 0.25, glow: 0, cold: 1, spin: 0 },
  orbit:    { pos: [5.6, 2.4, 6.0], look: [0, 0, 0], body: 1, explode: 0, rays: 0.55, heat: 0.45, glow: 0.45, cold: 0.45, spin: 1 },
};
const KEYS = ["body", "explode", "rays", "heat", "glow", "cold", "spin", "shift"];

// ---------- shared GLSL ----------
const NOISE = /* glsl */`
  float hash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float noise(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z); }
  float fbm(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++){ s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }
  float fbm3(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 3; i++){ s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }
`;
const SOFT_POINT_FRAG = /* glsl */`
  uniform vec3 uColor; varying float vA;
  void main(){ vec2 c = gl_PointCoord - 0.5; float a = exp(-dot(c, c) * 26.0) * vA; if (a < 0.003) discard; gl_FragColor = vec4(uColor * a, a); }
`;

// ---------- sky: gradient dome with the sun's halo ----------
function makeSky(u) {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms: u,
    vertexShader: /* glsl */`varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
    fragmentShader: /* glsl */`
      uniform vec3 uTop, uMid, uLow, uHalo, uSunDir; uniform float uHaloAmt;
      varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir); float h = d.y;
        vec3 c = mix(uLow, uMid, smoothstep(-0.2, 0.22, h));
        c = mix(c, uTop, smoothstep(0.22, 0.9, h));
        float s = max(dot(d, uSunDir), 0.0);
        c += uHalo * (pow(s, 5.0) * 0.45 + pow(s, 48.0) * 0.9) * uHaloAmt;
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
}

export function startScene(stage, wrap, chapters) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
    if (!renderer.getContext()) throw new Error("no context");
  } catch (e) { stage.classList.add("nogl"); return () => {}; }
  stage.classList.add("gl");
  const phone = innerWidth < 760;
  // Render resolution adapts to the device: start modest (integrated GPUs struggle with full-res HDR),
  // then the frame loop raises or lowers it based on measured frame times.
  const gpu = (() => { try { const g = renderer.getContext(), x = g.getExtension("WEBGL_debug_renderer_info"); return x ? g.getParameter(x.UNMASKED_RENDERER_WEBGL) : ""; } catch (e) { return ""; } })();
  const weakGPU = /intel|mali|adreno|powervr|apple gpu|swiftshader|llvmpipe/i.test(gpu) || phone;
  const MAX_DPR = Math.min(devicePixelRatio, weakGPU ? 1.25 : 1.75), MIN_DPR = 0.75;
  let DPR = Math.min(MAX_DPR, weakGPU ? 0.9 : 1.25);
  renderer.setPixelRatio(DPR);
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  stage.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, 0.05, 900);

  // ---------- sky ----------
  const skyU = {
    uTop: { value: new THREE.Color() }, uMid: { value: new THREE.Color() }, uLow: { value: new THREE.Color() },
    uHalo: { value: new THREE.Color() }, uSunDir: { value: SUN_DIR.clone() }, uHaloAmt: { value: 1 },
  };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(600, 48, 32), makeSky(skyU));
  sky.frustumCulled = false; sky.renderOrder = -10;
  scene.add(sky);

  // environment map from the same sky plus a hot sun, so metals reflect this world
  const envScene = new THREE.Scene();
  const envSky = new THREE.Mesh(new THREE.SphereGeometry(50, 48, 32), makeSky(skyU));
  const envSunMat = new THREE.MeshBasicMaterial({ color: new THREE.Color() });
  const envSun = new THREE.Mesh(new THREE.SphereGeometry(3.2, 24, 16), envSunMat); envSun.position.copy(SUN_DIR).multiplyScalar(40);
  const envEarthMat = new THREE.MeshBasicMaterial({ color: new THREE.Color() });
  const envEarth = new THREE.Mesh(new THREE.SphereGeometry(30, 32, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), envEarthMat); envEarth.position.y = -6;
  envScene.add(envSky, envSun, envEarth);
  const pmrem = new THREE.PMREMGenerator(renderer);
  let envRT = null;

  // ---------- sun: a soft sculpted ball (matcap-like core, fresnel rim), bright enough to bloom ----------
  const sunU = { uCore: { value: new THREE.Color() }, uEdge: { value: new THREE.Color() }, uPower: { value: 2 }, uTime: { value: 0 } };
  const sun = new THREE.Mesh(new THREE.SphereGeometry(9, 64, 40), new THREE.ShaderMaterial({
    uniforms: sunU, fog: false,
    vertexShader: /* glsl */`varying vec3 vNv; varying vec3 vObj; void main(){ vNv = normalize(normalMatrix * normal); vObj = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: NOISE + /* glsl */`
      uniform vec3 uCore, uEdge; uniform float uPower, uTime; varying vec3 vNv; varying vec3 vObj;
      void main(){
        float mu = clamp(vNv.z, 0.0, 1.0);
        float g = fbm3(vObj * 0.55 + vec3(uTime * 0.03, uTime * 0.02, 0.0));
        vec3 c = mix(uEdge, uCore, pow(mu, 0.7)) * (0.9 + 0.22 * g);
        c += uEdge * pow(1.0 - mu, 2.5) * 0.9;
        gl_FragColor = vec4(c * uPower, 1.0);
      }`,
  }));
  sun.position.copy(SUN_POS);
  scene.add(sun);

  // ---------- earth: procedural continents and clouds, terminator glow, atmosphere shell ----------
  const earthU = {
    uSunDir: { value: SUN_DIR.clone() }, uTime: { value: 0 },
    uOcean: { value: new THREE.Color() }, uLand: { value: new THREE.Color() }, uCloud: { value: new THREE.Color() },
    uDay: { value: new THREE.Color() }, uTwi: { value: new THREE.Color() }, uNight: { value: new THREE.Color() }, uSun: { value: new THREE.Color() },
  };
  const EARTH_C = new THREE.Vector3(4, -64, -8);
  const earth = new THREE.Mesh(new THREE.SphereGeometry(60, 112, 72), new THREE.ShaderMaterial({
    uniforms: earthU,
    vertexShader: /* glsl */`varying vec3 vN; varying vec3 vPos; varying vec3 vObj;
      void main(){ vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position, 1.0); vPos = w.xyz; vObj = position; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: NOISE + /* glsl */`
      uniform vec3 uSunDir, uOcean, uLand, uCloud, uDay, uTwi, uNight, uSun; uniform float uTime;
      varying vec3 vN; varying vec3 vPos; varying vec3 vObj;
      void main(){
        vec3 n = normalize(vN); vec3 v = normalize(cameraPosition - vPos);
        float l = dot(n, uSunDir);
        float land = smoothstep(0.5, 0.56, fbm(vObj * 0.05 + 3.1));
        vec3 surf = mix(uOcean, uLand, land);
        float cl = smoothstep(0.47, 0.78, fbm3(vObj * 0.09 + vec3(uTime * 0.004, 0.0, uTime * 0.002)));
        surf = mix(surf, uCloud, cl * 0.88);
        float day = smoothstep(-0.12, 0.35, l);
        vec3 col = mix(uNight * 0.6, surf * (0.32 + 0.9 * max(l, 0.0)), day);
        float twi = smoothstep(-0.3, 0.0, l) * (1.0 - smoothstep(0.0, 0.35, l));
        col += uTwi * twi * 0.45;
        float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
        col += mix(uTwi, uDay, smoothstep(-0.1, 0.45, l)) * fres * (0.25 + day) * 1.3;
        vec3 r = reflect(-uSunDir, n);
        col += uSun * pow(max(dot(r, v), 0.0), 80.0) * (1.0 - land) * (1.0 - cl) * day * 2.0;
        gl_FragColor = vec4(col, 1.0);
      }`,
  }));
  earth.position.copy(EARTH_C);
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(62.6, 96, 56), new THREE.ShaderMaterial({
    uniforms: earthU, side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`varying vec3 vN; varying vec3 vPos; void main(){ vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position, 1.0); vPos = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`
      uniform vec3 uSunDir, uDay, uTwi; varying vec3 vN; varying vec3 vPos;
      void main(){
        vec3 n = normalize(vN); vec3 v = normalize(cameraPosition - vPos);
        float edge = smoothstep(0.0, 0.32, -dot(n, v));
        float sunF = smoothstep(-0.35, 0.5, dot(n, uSunDir));
        vec3 c = mix(uTwi, uDay, sunF) * edge * (0.25 + sunF) * 1.6;
        gl_FragColor = vec4(c, 1.0);
      }`,
  }));
  atmo.position.copy(EARTH_C);
  scene.add(earth, atmo);

  // ---------- stars (night only) ----------
  const starPos = [], starA = [];
  for (let i = 0; i < 1600; i++) { const d = new THREE.Vector3().randomDirection(); if (d.y < -0.15) continue; starPos.push(...d.multiplyScalar(420).toArray()); starA.push(Math.random()); }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute("position", new THREE.Float32BufferAttribute(starPos, 3));
  starGeo.setAttribute("aSeed", new THREE.Float32BufferAttribute(starA, 1));
  const starU = { uColor: { value: new THREE.Color(1, 1, 1) }, uAmt: { value: 0 }, uTime: { value: 0 }, uPR: { value: DPR } };
  const stars = new THREE.Points(starGeo, new THREE.ShaderMaterial({
    uniforms: starU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: /* glsl */`attribute float aSeed; uniform float uAmt, uTime, uPR; varying float vA;
      void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position.z = gl_Position.w * 0.9999;
        vA = uAmt * (0.35 + 0.65 * aSeed) * (0.75 + 0.25 * sin(uTime * (1.0 + aSeed * 3.0) + aSeed * 40.0));
        gl_PointSize = (1.2 + 2.4 * aSeed * aSeed) * uPR * 2.0; }`,
    fragmentShader: SOFT_POINT_FRAG,
  }));
  stars.frustumCulled = false;
  scene.add(stars);

  // ---------- lights ----------
  const hemi = new THREE.HemisphereLight(0xffffff, 0x888888, 0.3);
  const key = new THREE.DirectionalLight(0xffffff, 3);
  key.position.copy(SUN_DIR).multiplyScalar(12); key.target.position.set(0, 0, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(phone ? 512 : 1024, phone ? 512 : 1024);
  Object.assign(key.shadow.camera, { left: -2.6, right: 2.6, top: 2.6, bottom: -2.6, near: 4, far: 22 });
  key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02; key.shadow.radius = 3;
  const earthshine = new THREE.DirectionalLight(0x9db7ff, 0.35); earthshine.position.set(1, -6, 2);
  scene.add(hemi, key, key.target, earthshine);

  // ---------- materials ----------
  // brushed-metal roughness map, drawn once
  const brush = document.createElement("canvas"); brush.width = brush.height = 512;
  const bx = brush.getContext("2d"); bx.fillStyle = "#7a7a7a"; bx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 2600; i++) { const y = Math.random() * 512, g = 90 + Math.random() * 90; bx.fillStyle = `rgba(${g},${g},${g},${0.15 + Math.random() * 0.35})`; bx.fillRect(0, y, 512, Math.random() * 1.4 + 0.3); }
  const brushTex = new THREE.CanvasTexture(brush); brushTex.wrapS = brushTex.wrapT = THREE.RepeatWrapping; brushTex.repeat.set(2, 2);

  const COPPER = new THREE.Color().setRGB(0.955, 0.637, 0.538);
  const M = {
    shell: new THREE.MeshPhysicalMaterial({ color: 0xb3aea8, metalness: 0.62, roughness: 0.4, roughnessMap: brushTex, transparent: true }),
    alu: new THREE.MeshPhysicalMaterial({ color: 0xdedbd6, metalness: 0.9, roughness: 0.3 }),
    mirror: new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 1, roughness: 0.045, side: THREE.DoubleSide, envMapIntensity: 1.15 }),
    copper: new THREE.MeshPhysicalMaterial({ color: COPPER, metalness: 1, roughness: 0.26, emissive: new THREE.Color(1.0, 0.35, 0.08), emissiveIntensity: 0 }),
    ceramic: new THREE.MeshStandardMaterial({ color: 0xf4f1ec, metalness: 0, roughness: 0.55 }),
    pelletN: new THREE.MeshPhysicalMaterial({ color: 0x4a4c55, metalness: 0.3, roughness: 0.45 }),
    radiator: new THREE.MeshPhysicalMaterial({ color: 0xf6f5f2, metalness: 0.05, roughness: 0.5, emissive: new THREE.Color(0.35, 0.6, 1.0), emissiveIntensity: 0 }),
    recess: new THREE.MeshStandardMaterial({ color: 0x24232a, roughness: 0.9 }),
    battery: new THREE.MeshStandardMaterial({ color: 0x2b2a30, metalness: 0.6, roughness: 0.35 }),
  };

  // Mirror-like metals catching the sun light can produce specular spikes beyond what a half-float
  // buffer stores (65504). Those become Inf, and bloom smears Inf/NaN into black blocks. Cap at the source.
  const HDR_CAP = 32.0;
  for (const m of Object.values(M)) {
    m.onBeforeCompile = sh => {
      sh.fragmentShader = sh.fragmentShader.replace("#include <dithering_fragment>",
        "#include <dithering_fragment>\n  gl_FragColor.rgb = min(gl_FragColor.rgb, vec3(" + HDR_CAP.toFixed(1) + "));");
    };
  }
  M.mirror.roughness = 0.06;

  // ---------- the satellite ----------
  const sat = new THREE.Group(); scene.add(sat);
  const add = (mesh, parent = sat) => { mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh; };

  // body: 220 x 140 x 140 mm aluminium shell
  const body = add(new THREE.Mesh(new RoundedBoxGeometry(2.2, 1.4, 1.4, 5, 0.035), M.shell));
  // mounting bracket, 5 mm plate behind the dish
  add(new THREE.Mesh(new RoundedBoxGeometry(0.05, 1.36, 1.36, 2, 0.012), M.alu)).position.x = -1.125;

  // dish: y = r^2/4f, f = 50 mm, 200 mm aperture, so the focus sits in the rim plane
  const prof = []; for (let i = 0; i <= 64; i++) { const r = 0.07 + 0.93 * (i / 64); prof.push(new THREE.Vector2(r, (r * r) / 2)); }
  const dishG = new THREE.Group(); dishG.rotation.z = Math.PI / 2; dishG.position.x = -1.2; sat.add(dishG);
  add(new THREE.Mesh(new THREE.LatheGeometry(prof, 160), M.mirror), dishG);
  const FOCUS = new THREE.Vector3(-1.7, 0, 0);
  const rim = add(new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.014, 12, 160), M.alu)); rim.rotation.y = Math.PI / 2; rim.position.copy(FOCUS);
  for (let k = 0; k < 3; k++) {   // three 101.45 mm struts
    const a = (k / 3) * Math.PI * 2 + Math.PI / 2;
    const s = add(new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 1.0, 10), M.alu));
    s.position.set(-1.7, Math.cos(a) * 0.5, Math.sin(a) * 0.5); s.rotation.x = a;
  }
  const collar = add(new THREE.Mesh(new THREE.TorusGeometry(0.095, 0.02, 12, 48), M.alu)); collar.rotation.y = Math.PI / 2; collar.position.copy(FOCUS);

  // receiver tube: copper, 16/12 mm, 60 mm long
  const tube = (ro, ri, len) => {
    const sh = new THREE.Shape(); sh.absarc(0, 0, ro, 0, Math.PI * 2);
    const hole = new THREE.Path(); hole.absarc(0, 0, ri, 0, Math.PI * 2, true); sh.holes.push(hole);
    const g = new THREE.ExtrudeGeometry(sh, { depth: len, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.004, bevelSegments: 2, curveSegments: 40 });
    g.translate(0, 0, -len / 2); g.rotateY(Math.PI / 2); return g;
  };
  add(new THREE.Mesh(tube(0.08, 0.06, 0.6), M.copper)).position.copy(FOCUS);

  // heat pipe: 6 mm copper from the receiver, through the mount and body, to the TEG stack
  const pipePath = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-1.4, 0, 0), new THREE.Vector3(-1.18, 0, 0), new THREE.Vector3(-0.95, 0.12, 0),
    new THREE.Vector3(-0.75, 0.36, 0.05), new THREE.Vector3(0.45, 0.36, 0.05), new THREE.Vector3(0.72, 0.2, 0.02), new THREE.Vector3(1.0, 0, 0)]);
  add(new THREE.Mesh(new THREE.TubeGeometry(pipePath, 200, 0.03, 16, false), M.copper));
  // heat: a glowing wave that travels along the pipe
  const heatU = { uTime: { value: 0 }, uHeat: { value: 0 }, uHot: { value: new THREE.Color(1.0, 0.42, 0.12) } };
  const heatGlow = new THREE.Mesh(new THREE.TubeGeometry(pipePath, 200, 0.034, 16, false), new THREE.ShaderMaterial({
    uniforms: heatU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`varying float vAlong; varying vec3 vNv; void main(){ vAlong = uv.x; vNv = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform float uTime, uHeat; uniform vec3 uHot; varying float vAlong; varying vec3 vNv;
      void main(){
        float w = fract(vAlong * 2.2 - uTime * 0.45);
        float band = smoothstep(0.0, 0.06, w) * (1.0 - smoothstep(0.06, 0.5, w));
        float rim = 0.55 + 0.45 * pow(1.0 - abs(vNv.z), 1.5);
        vec3 c = uHot * (0.18 + band * 2.6) * rim * uHeat;
        gl_FragColor = vec4(c, 1.0);
      }`,
  }));
  sat.add(heatGlow);

  // TEG stack: copper spreader 40x40x3, Bi2Te3 module 40x40x4 (two ceramic plates, 8 x 8 pellets), radiator 80x80x2 with six 80x15x1 fins
  const spreader = add(new THREE.Mesh(new RoundedBoxGeometry(0.03, 0.4, 0.4, 2, 0.006), M.copper));
  const teg = new THREE.Group(); sat.add(teg);
  const plateA = add(new THREE.Mesh(new RoundedBoxGeometry(0.006, 0.4, 0.4, 1, 0.002), M.ceramic), teg); plateA.position.x = -0.017;
  const plateB = add(new THREE.Mesh(new RoundedBoxGeometry(0.006, 0.4, 0.4, 1, 0.002), M.ceramic), teg); plateB.position.x = 0.017;
  const pellets = new THREE.InstancedMesh(new THREE.BoxGeometry(0.028, 0.026, 0.026), M.pelletN, 64);
  { const d = new THREE.Object3D(); let k = 0; for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { d.position.set(0, -0.175 + i * 0.05, -0.175 + j * 0.05); d.updateMatrix(); pellets.setMatrixAt(k++, d.matrix); } }
  pellets.castShadow = true; teg.add(pellets);
  const radiator = new THREE.Group(); sat.add(radiator);
  add(new THREE.Mesh(new RoundedBoxGeometry(0.02, 0.8, 0.8, 2, 0.005), M.radiator), radiator);
  for (let k = 0; k < 6; k++) { const fin = add(new THREE.Mesh(new RoundedBoxGeometry(0.15, 0.8, 0.012, 2, 0.004), M.radiator), radiator); fin.position.set(0.085, 0, -0.33 + k * 0.132); }
  const recess = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), M.recess); recess.rotation.y = Math.PI / 2; recess.position.x = 1.102; sat.add(recess);

  add(new THREE.Mesh(new RoundedBoxGeometry(0.6, 0.25, 0.3, 3, 0.02), M.battery)).position.set(0.1, -0.42, 0.2);

  // ---------- light as particles: 48 rays, each a comet of 14 soft points with a fading tail ----------
  const N_RAYS = 48, TRAIL = 14;
  const pa = [], pb = [], ph = [], pt = [];
  for (let i = 0; i < N_RAYS; i++) {
    const r = 0.16 + 0.8 * Math.sqrt(Math.random()), a = Math.random() * Math.PI * 2;
    const y = Math.cos(a) * r, z = Math.sin(a) * r, hitX = -1.2 - (r * r) / 2, phase = Math.random();
    for (let k = 0; k < TRAIL; k++) { pa.push(-4.6, y, z); pb.push(hitX, y, z); ph.push(phase); pt.push(k / (TRAIL - 1)); }
  }
  const photonGeo = new THREE.BufferGeometry();
  photonGeo.setAttribute("position", new THREE.Float32BufferAttribute(new Array(pa.length).fill(0), 3));
  photonGeo.setAttribute("aA", new THREE.Float32BufferAttribute(pa, 3));
  photonGeo.setAttribute("aB", new THREE.Float32BufferAttribute(pb, 3));
  photonGeo.setAttribute("aPhase", new THREE.Float32BufferAttribute(ph, 1));
  photonGeo.setAttribute("aTrail", new THREE.Float32BufferAttribute(pt, 1));
  const photonU = { uTime: { value: 0 }, uAmt: { value: 0 }, uFocus: { value: FOCUS.clone() }, uPR: { value: DPR }, uColor: { value: new THREE.Color(1.0, 0.62, 0.28).multiplyScalar(3.4) } };
  const photons = new THREE.Points(photonGeo, new THREE.ShaderMaterial({
    uniforms: photonU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      attribute vec3 aA, aB; attribute float aPhase, aTrail;
      uniform float uTime, uAmt, uPR; uniform vec3 uFocus; varying float vA;
      void main(){
        float t = fract(uTime * 0.26 + aPhase - aTrail * 0.032);
        vec3 p = t < 0.74 ? mix(aA, aB, t / 0.74) : mix(aB, uFocus, (t - 0.74) / 0.26);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float k = 1.0 - aTrail;
        vA = k * k * smoothstep(0.0, 0.1, t) * smoothstep(0.35, 1.1, -mv.z) * uAmt;
        gl_PointSize = (2.2 + 9.0 * k) * uPR / max(-mv.z, 0.3) * 6.0;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: SOFT_POINT_FRAG,
  }));
  photons.frustumCulled = false; sat.add(photons);

  // ---------- dust in the sunbeam ----------
  const DUST = phone ? 450 : 900, dp = [], ds = [];
  for (let i = 0; i < DUST; i++) { dp.push(-8 + Math.random() * 15, -2.2 + Math.random() * 5, -4.5 + Math.random() * 9); ds.push(Math.random(), Math.random(), Math.random()); }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute("position", new THREE.Float32BufferAttribute(dp, 3));
  dustGeo.setAttribute("aSeed", new THREE.Float32BufferAttribute(ds, 3));
  const dustU = { uTime: { value: 0 }, uAmt: { value: 0.5 }, uPR: { value: DPR }, uColor: { value: new THREE.Color() } };
  const dust = new THREE.Points(dustGeo, new THREE.ShaderMaterial({
    uniforms: dustU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      attribute vec3 aSeed; uniform float uTime, uAmt, uPR; varying float vA;
      void main(){
        vec3 p = position + vec3(sin(uTime * 0.07 + aSeed.x * 6.28) * 0.5, sin(uTime * 0.05 + aSeed.y * 6.28) * 0.35, cos(uTime * 0.06 + aSeed.z * 6.28) * 0.5);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float twinkle = 0.55 + 0.45 * sin(uTime * (0.6 + aSeed.y * 1.4) + aSeed.z * 30.0);
        vA = uAmt * twinkle * (0.25 + 0.75 * aSeed.x) * smoothstep(0.3, 1.6, -mv.z) * (1.0 - smoothstep(9.0, 16.0, -mv.z));
        gl_PointSize = (1.0 + 3.2 * aSeed.x) * uPR / max(-mv.z, 0.3) * 9.0;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: SOFT_POINT_FRAG,
  }));
  dust.frustumCulled = false; scene.add(dust);

  // ---------- post: render, bloom, output (tone map + grain + vignette in one pass) ----------
  const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: weakGPU ? 0 : 2 });
  const composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(DPR);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.55, 1.5);
  // its bright-pass is the first thing that reads the scene: make it ignore NaN/Inf and cap highlights,
  // so a stray pixel can never be smeared into black blocks
  bloom.materialHighPassFilter.fragmentShader = bloom.materialHighPassFilter.fragmentShader.replace(
    "vec4 texel = texture2D( tDiffuse, vUv );",
    "vec4 texel = texture2D( tDiffuse, vUv ); if (any(isnan(texel.rgb)) || any(isinf(texel.rgb))) texel = vec4(0.0); texel.rgb = min(texel.rgb, vec3(" + HDR_CAP.toFixed(1) + "));");
  bloom.materialHighPassFilter.needsUpdate = true;
  composer.addPass(bloom);
  const output = new OutputPass();
  output.material.uniforms.uTime = { value: 0 };
  output.material.uniforms.uGrain = { value: 0.04 };
  output.material.uniforms.uVig = { value: 0.22 };
  output.material.fragmentShader = output.material.fragmentShader
    .replace("varying vec2 vUv;", "varying vec2 vUv; uniform float uTime, uGrain, uVig;\n float rnd(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }")
    .replace(/}\s*$/, `
      gl_FragColor.rgb += (rnd(vUv * 1000.0 + fract(uTime) * 61.0) - 0.5) * uGrain;
      float vig = smoothstep(0.95, 0.25, length((vUv - 0.5) * vec2(1.15, 1.0)));
      gl_FragColor.rgb *= mix(1.0 - uVig, 1.0, vig);
    }`);
  composer.addPass(output);

  // ---------- theme ----------
  const isDark = () => document.documentElement.classList.contains("force-dark") || (document.documentElement.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")) === "dark";
  const applyTheme = () => {
    const c = PALETTES[isDark() ? "dark" : "light"];
    document.body.classList.toggle("sol-dark", isDark());
    skyU.uTop.value.set(c.skyTop); skyU.uMid.value.set(c.skyMid); skyU.uLow.value.set(c.skyLow); skyU.uHalo.value.set(c.halo);
    sunU.uCore.value.set(c.sunCore); sunU.uEdge.value.set(c.sunEdge); sunU.uPower.value = c.sunPower;
    earthU.uOcean.value.set(c.ocean); earthU.uLand.value.set(c.land); earthU.uCloud.value.set(c.cloud);
    earthU.uDay.value.set(c.atmoDay); earthU.uTwi.value.set(c.atmoTwi); earthU.uNight.value.set(c.night); earthU.uSun.value.set(c.sunCore);
    key.color.set(c.key); key.intensity = c.keyPower;
    hemi.color.set(c.hemiSky); hemi.groundColor.set(c.hemiGround); hemi.intensity = c.hemiPower;
    dustU.uColor.value.set(c.dust).multiplyScalar(1.2); dustU.uAmt.value = c.dustAmt;
    starU.uAmt.value = c.stars;
    photonU.uColor.value.set(isDark() ? 0xffd9a0 : 0xff9a3a).multiplyScalar(isDark() ? 1.45 : 2.0);   // kept under the bloom threshold: they glow on their own
    // additive light vanishes on a bright dawn sky, so by day the photons are laid on normally
    photons.material.blending = isDark() ? THREE.AdditiveBlending : THREE.NormalBlending; photons.material.needsUpdate = true;
    renderer.toneMappingExposure = c.exposure; bloom.strength = c.bloom;
    envSunMat.color.set(c.sunCore).multiplyScalar(5); envEarthMat.color.set(c.ocean).multiplyScalar(0.6);
    if (envRT) envRT.dispose();
    envRT = pmrem.fromScene(envScene, 0.035, 0.1, 200);
    scene.environment = envRT.texture;
  };
  applyTheme();
  const themeObs = new MutationObserver(applyTheme);
  themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });
  const mq = matchMedia("(prefers-color-scheme: dark)"); mq.addEventListener("change", applyTheme);

  // ---------- scroll choreography ----------
  const states = chapters.map((c, i) => ({ ...(SHOTS[c.shot] || SHOTS.wide), shift: c.hero ? 0 : i % 2 ? 1 : -1 }));
  const cur = { pos: v3(states[0].pos), look: v3(states[0].look) }; KEYS.forEach(k => cur[k] = states[0][k]);
  const tgt = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
  const sections = [...wrap.querySelectorAll(".sol-ch")];
  const scrim = document.getElementById("solScrim");
  const A = new THREE.Vector3(), B = new THREE.Vector3();
  const target = () => {
    const f = clamp(-wrap.getBoundingClientRect().top / innerHeight, 0, states.length - 1);
    const i = Math.floor(f), j = Math.min(states.length - 1, i + 1), t = smooth(clamp(f - i, 0, 1));
    const S = states[i], T = states[j];
    tgt.pos.copy(A.set(...S.pos)).lerp(B.set(...T.pos), t);
    tgt.look.copy(A.set(...S.look)).lerp(B.set(...T.look), t);
    KEYS.forEach(k => tgt[k] = S[k] + (T[k] - S[k]) * t);
    sections.forEach((s, k) => s.classList.toggle("on", Math.abs(f - k) < 0.5));
    // one backdrop pinned to the screen, crossfading sides, so no section edges slide over the render
    const k = Math.round(f), side = chapters[k]?.hero ? "b" : k % 2 ? "r" : "l";
    if (scrim && scrim.dataset.side !== side) scrim.dataset.side = side;
    const end = wrap.getBoundingClientRect().bottom;
    const op = String(+clamp((end - innerHeight * 0.35) / (innerHeight * 0.65), 0, 1).toFixed(3));
    if (stage.style.opacity !== op) { stage.style.opacity = op; if (scrim) scrim.style.opacity = op; }
  };

  const resize = () => {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false); composer.setSize(w, h);
    camera.aspect = w / h; camera.fov = w < 760 ? 50 : 36; camera.updateProjectionMatrix();
  };
  addEventListener("resize", resize); resize();

  // ---------- adaptive resolution ----------
  // Average the real frame time; drop the render scale when frames are slow, raise it when there is headroom.
  let avg = 16.7, lastFrame = 0, lastChange = 0;
  const setDPR = d => { DPR = d; renderer.setPixelRatio(d); composer.setPixelRatio(d); resize(); };
  const adapt = now => {
    if (lastFrame) avg += (Math.min(now - lastFrame, 100) - avg) * 0.08;
    lastFrame = now;
    if (now - lastChange < 1200) return;
    if (avg > 18 && DPR > MIN_DPR) { setDPR(Math.max(MIN_DPR, +(DPR * 0.85).toFixed(2))); lastChange = now; }
    else if (avg < 11.5 && DPR < MAX_DPR) { setDPR(Math.min(MAX_DPR, +(DPR * 1.1).toFixed(2))); lastChange = now; }
  };

  // ---------- frame loop ----------
  let raf, last = performance.now(), clock = 0, running = true;
  const camOff = new THREE.Vector3();
  const frame = now => {
    if (!running) return;
    const dt = clamp((now - last) / 1000, 0, 0.05); last = now; if (!reduced) clock += dt;
    target();
    const ease = reduced ? 1 : 1 - Math.pow(0.0011, dt);
    cur.pos.lerp(tgt.pos, ease); cur.look.lerp(tgt.look, ease);
    KEYS.forEach(k => cur[k] += (tgt[k] - cur[k]) * ease);

    // camera: framing plus a slow handheld drift
    const back = innerWidth < 760 ? 1.4 : 1;
    camOff.copy(cur.pos).sub(cur.look).multiplyScalar(back);
    camera.position.copy(cur.look).add(camOff);
    if (!reduced) camera.position.add(A.set(Math.sin(clock * 0.21) * 0.05, Math.sin(clock * 0.17 + 1) * 0.035, Math.cos(clock * 0.19) * 0.05));
    camera.lookAt(cur.look);
    const vw = innerWidth, vh = innerHeight;
    if (vw < 760) camera.setViewOffset(vw, vh, 0, vh * 0.17 * Math.min(1, Math.abs(cur.shift) * 2), vw, vh);
    else camera.setViewOffset(vw, vh, cur.shift * vw * 0.16, 0, vw, vh);

    // satellite state
    sat.rotation.y = cur.spin * clock * 0.22;
    sat.position.y = Math.sin(clock * 0.55) * 0.025;
    M.shell.opacity = cur.body; M.shell.depthWrite = cur.body > 0.95;
    const e = cur.explode;
    spreader.position.x = 1.04 + e * 0.42; teg.position.x = 1.075 + e * 0.86; radiator.position.x = 1.115 + e * 1.3;
    recess.visible = e < 0.15;
    M.copper.emissiveIntensity = cur.glow * (2.2 + 0.5 * Math.sin(clock * 3.0));
    M.radiator.emissiveIntensity = cur.cold * 0.55;
    heatU.uHeat.value = cur.heat; photonU.uAmt.value = cur.rays;

    const tsec = clock;
    heatU.uTime.value = photonU.uTime.value = dustU.uTime.value = starU.uTime.value = tsec;
    sunU.uTime.value = earthU.uTime.value = tsec;
    output.material.uniforms.uTime.value = tsec;
    sky.position.copy(camera.position);

    if (stage.style.opacity !== "0") { composer.render(); adapt(now); }
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  if (location.search.includes("debug")) window.__sol = { THREE, renderer, scene, camera, M, composer, frame: t => { running = true; frame(t); }, get dpr() { return DPR; }, gpu, weakGPU };

  const vis = () => { if (document.hidden) { running = false; cancelAnimationFrame(raf); } else if (!running) { running = true; last = performance.now(); raf = requestAnimationFrame(frame); } };
  document.addEventListener("visibilitychange", vis);

  return () => {
    running = false; cancelAnimationFrame(raf); themeObs.disconnect(); mq.removeEventListener("change", applyTheme);
    removeEventListener("resize", resize); document.removeEventListener("visibilitychange", vis);
    envRT?.dispose(); pmrem.dispose(); composer.dispose?.(); rt.dispose(); renderer.dispose(); renderer.domElement.remove();
  };
}
