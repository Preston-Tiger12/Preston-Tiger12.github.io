/* "Solare" layout: a scroll-driven 3D story, inspired by casadisolare.com.
 *
 * The page is a stack of chapters over a pinned WebGL stage (solare-scene.js).
 * Each chapter in project.json names a camera "shot"; scrolling blends between them.
 * Everything after the story (calculator, CAD, final design) is ordinary HTML.
 */

import { startScene } from "./solare-scene.js";

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// older project files mark words with *asterisks*; the headings are set plain now
const rich = s => esc(String(s ?? "").replace(/\*/g, ""));
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

export function render(p, root, helpers) {
  document.body.dataset.layout = "solare";
  // night only (project.json darkOnly): html.force-dark hides the theme switch; solare-scene.js reads it and sets body.sol-dark
  const chapters = p.chapters || [];
  root.innerHTML = `
    <div class="sol-loader" id="solLoader" aria-hidden="true"><svg viewBox="0 0 100 60"><path d="M10 6 Q50 104 90 6" /></svg></div>
    <div class="sol-stage" id="solStage" aria-hidden="true"><img class="sol-fallback" src="${esc(p.dir + p.fallbackImage)}" alt=""></div>
    <div class="sol-scrim" id="solScrim" data-side="b" aria-hidden="true"><i class="l"></i><i class="r"></i><i class="b"></i></div>
        <div class="sol-chapters" id="solChapters">
      ${chapters.map((c, i) => `
        <section class="sol-ch ${c.hero ? "sol-hero" : i % 2 ? "sol-right" : "sol-left"}${i === 0 ? " on" : ""}" data-i="${i}">
          <div class="sol-copy">
            <span class="sol-kicker">${esc(c.kicker)}</span>
            ${c.hero ? `<h1 class="sol-title">${rich(c.title)}</h1>` : `<h2 class="sol-h">${rich(c.title)}</h2>`}
            <p class="sol-text">${esc(c.text)}</p>
            ${c.specs ? `<dl class="sol-specs">${c.specs.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>` : ""}
            ${c.hero ? `<dl class="sol-facts">${(p.facts || []).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl><span class="sol-scroll">Scroll to discover</span>` : ""}
          </div>
        </section>`).join("")}
    </div>
    <div class="sol-after">${after(p)}</div>`;

  wireAfter(p);
  const stop = startScene(document.getElementById("solStage"), document.getElementById("solChapters"), chapters);
  setTimeout(() => document.getElementById("solLoader")?.classList.add("done"), reduced ? 0 : 900);
  return () => { stop(); delete document.body.dataset.layout; document.body.classList.remove("sol-dark"); };
}

// ---------- the sections after the 3D story ----------
// Heart Aerospace-style bullets: square swatch, short bold label, one line.
// tone "did" is sun-orange, tone "improve" is cool blue.
export function bullets(block, tone, id) {
  if (!block) return "";
  return `<section class="sol-sec" id="${id}">
    <h2 class="sol-h">${rich(block.title)}</h2>
    <ul class="blt blt-${tone}">${block.items.map(([h, t]) => `<li><span class="sw" aria-hidden="true"></span><h3>${esc(h)}</h3><p>${esc(t)}</p></li>`).join("")}</ul>
  </section>`;
}

function after(p) {
  const c = p.calc, g = p.gallery, f = p.final, r = p.role, l = p.lessons;
  return `
    ${c ? `<section class="sol-sec" id="numbers">
      <h2 class="sol-h">${rich(c.title)}</h2><p class="sol-lead">${esc(c.intro)}</p>
      <div class="sol-calc" data-k='${esc(JSON.stringify({ G: c.solar, r: c.reflectivity, n: c.couples, a: c.seebeck }))}'>
        <div class="sol-ctrl">
          <label>Dish diameter <output id="oD"></output><input id="cD" type="range" min="0.1" max="1" step="0.01" value="0.2"></label>
          <label>ΔT across the TEG <output id="oT"></output><input id="cT" type="range" min="10" max="300" step="5" value="100"></label>
        </div>
        <div class="sol-reads">
          <div><span>Power at the focus</span><b id="rP"></b><small>1361 × 0.85 × π(D/2)²</small></div>
          <div><span>Open-circuit voltage</span><b id="rV"></b><small>60 × 200 μV/K × ΔT</small></div>
        </div>
      </div>
      <p class="sol-note">${esc(c.note)}</p>
    </section>` : ""}

    ${g ? `<section class="sol-sec" id="cad">
      <h2 class="sol-h">${rich(g.title)}</h2><p class="sol-lead">${esc(g.intro)}</p>
      <div class="sol-gallery">${g.items.map(([n, src]) => `<figure><div><img src="${esc(p.dir + src)}" alt="${esc(n)}" loading="lazy"></div><figcaption>${esc(n)}</figcaption></figure>`).join("")}</div>
      ${g.drawing ? `<figure class="sol-drawing"><a href="${esc(p.dir + g.drawing)}" target="_blank" rel="noopener"><img src="${esc(p.dir + g.drawing)}" alt="${esc(g.drawingCaption)}" loading="lazy"></a><figcaption>${esc(g.drawingCaption)}</figcaption></figure>` : ""}
    </section>` : ""}

    ${f ? `<section class="sol-sec sol-final" id="final">
      <span class="sol-kicker">Group outcome</span>
      <h2 class="sol-h">${rich(f.title)}</h2>
      <p class="sol-sub">${esc(f.subtitle)}</p>
      <p class="sol-credit">${esc(f.credit)}</p>
      <div class="sol-two">
        <div>${f.text.map(t => `<p class="sol-par">${esc(t)}</p>`).join("")}</div>
        <dl class="sol-specs big">${f.specs.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>
      </div>
      ${f.tuner ? `<div class="sol-tuner" data-t='${esc(JSON.stringify(f.tuner))}'>
        <div><h3>${esc(f.tuner.title)}</h3><p class="sol-note">${esc(f.tuner.intro)}</p>
          <label>Proof mass <output id="oM"></output><input id="cM" type="range" min="0.5" max="10" step="0.1" value="${f.tuner.default}"></label></div>
        <div class="sol-freq"><b id="rF"></b><span id="rBand"></span>
          <svg viewBox="0 0 300 120" preserveAspectRatio="none" id="fPlot"><rect class="band" /><path class="curve" /><circle class="pt" r="5" /></svg>
          <div class="axis"><span>0.5 g</span><span>10 g</span></div></div>
      </div>` : ""}
      <div class="sol-figs">${f.figures.map(([src, cap]) => `<figure><a href="${esc(p.dir + src)}" target="_blank" rel="noopener"><img src="${esc(p.dir + src)}" alt="${esc(cap)}" loading="lazy"></a><figcaption>${esc(cap)}</figcaption></figure>`).join("")}</div>
    </section>` : ""}

    ${r ? `<section class="sol-sec" id="role"><h2 class="sol-h">${rich(r.title)}</h2>
      <div class="sol-rows">${r.items.map(([h, t]) => `<div><h3>${esc(h)}</h3><p>${esc(t)}</p></div>`).join("")}</div></section>` : ""}
    ${l ? `<section class="sol-sec" id="lessons"><h2 class="sol-h">${rich(l.title)}</h2>
      <div class="sol-cols">${l.items.map(([h, t]) => `<div><h3>${esc(h)}</h3><p>${esc(t)}</p></div>`).join("")}</div></section>` : ""}
    ${bullets(p.did, "did", "did")}
    ${bullets(p.improve, "improve", "improve")}`;
}

function wireAfter(p) {
  const calc = document.querySelector(".sol-calc");
  if (calc) {
    const k = JSON.parse(calc.dataset.k), D = document.getElementById("cD"), T = document.getElementById("cT");
    const run = () => {
      const d = +D.value, dt = +T.value, P = k.G * k.r * Math.PI * (d / 2) ** 2;
      document.getElementById("oD").textContent = Math.round(d * 1000) + " mm";
      document.getElementById("oT").textContent = dt + " K";
      document.getElementById("rP").textContent = P >= 1000 ? (P / 1000).toFixed(2) + " kW" : P.toFixed(P < 100 ? 1 : 0) + " W";
      document.getElementById("rV").textContent = (k.n * k.a * dt).toFixed(2) + " V";
    };
    D.oninput = T.oninput = run; run();
  }
  const tuner = document.querySelector(".sol-tuner");
  if (tuner) {
    const t = JSON.parse(tuner.dataset.t), M = document.getElementById("cM");
    const I = t.w * t.t ** 3 / 12, k = 3 * t.E * I / t.L ** 3, mBeam = t.L * t.w * t.t * t.rho;
    const freq = g => Math.sqrt(k / (mBeam + g / 1000)) / (2 * Math.PI);
    const lo = 0.5, hi = 10, fMax = freq(lo), fMin = freq(hi);
    const X = g => (g - lo) / (hi - lo) * 300, Y = f => 112 - (f - fMin) / (fMax - fMin) * 104;
    const svg = document.getElementById("fPlot");
    let d = ""; for (let g = lo; g <= hi + 1e-9; g += 0.1) d += (d ? "L" : "M") + X(g).toFixed(1) + " " + Y(freq(g)).toFixed(1);
    svg.querySelector(".curve").setAttribute("d", d);
    const b = svg.querySelector(".band"); b.setAttribute("x", 0); b.setAttribute("width", 300);
    b.setAttribute("y", Y(t.band[1])); b.setAttribute("height", Y(t.band[0]) - Y(t.band[1]));
    const run = () => {
      const g = +M.value, f = freq(g), inBand = f >= t.band[0] && f <= t.band[1];
      const edge = !inBand && f > t.band[0] - 1 && f < t.band[1] + 1;
      document.getElementById("oM").textContent = g.toFixed(1) + " g";
      document.getElementById("rF").textContent = f.toFixed(1) + " Hz";
      document.getElementById("rBand").textContent = inBand ? `Inside the ${t.band[0]} to ${t.band[1]} Hz machinery band`
        : edge ? `Right at the edge of the ${t.band[0]} to ${t.band[1]} Hz band` : `Outside the ${t.band[0]} to ${t.band[1]} Hz band`;
      tuner.classList.toggle("ok", inBand || edge);
      const c = svg.querySelector(".pt"); c.setAttribute("cx", X(g)); c.setAttribute("cy", Y(f));
    };
    M.oninput = run; run();
  }
}
