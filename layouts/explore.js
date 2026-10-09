/* "Explore" layout: an interactive 3D workbench for one device.
 *
 * Drag to orbit, click a part (in the list or on the model) to fly to it,
 * toggle an exploded view, and tune the device live. For the piezo harvester
 * the tuning is a small physics model taken from the group report:
 *   k = 3EI/L^3, f_n = (1/2π)·sqrt(k / (m_beam + m_proof))      (report's MATLAB)
 *   response = 1 / sqrt((1 - r^2)^2 + (2ζr)^2), r = f_machine / f_n
 *   the capacitor charges with response^2; at 2.2 V the sensor transmits
 *   and runs it down to 1.6 V (the report's relay thresholds).
 * Everything after the workbench is ordinary HTML from project.json.
 */

import { startPiezoScene } from "./piezo-scene.js";
import { bullets } from "./solare.js";

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export function render(p, root) {
  document.body.dataset.layout = "solare";          // shares the night palette and type with the Solar page
  document.body.classList.add("sol-dark", "explore");
  const themeBtn = document.getElementById("theme"); if (themeBtn) themeBtn.hidden = true;
  const s = p.sim;

  root.innerHTML = `
    <section class="ex-stage" id="exStage">
      <div class="ex-canvas" id="exCanvas"><img class="sol-fallback" src="${esc(p.dir + p.fallbackImage)}" alt="${esc(p.title)}"></div>

      <div class="ex-head">
        <span class="sol-kicker">${esc(p.code)} · ${esc(p.status)}</span>
        <h1 class="ex-title">${esc(p.title)}</h1>
        <p class="ex-intro">${esc(p.intro)}</p>
      </div>

      <nav class="ex-parts" aria-label="Parts">
        <button type="button" data-part="" aria-pressed="true">Whole device</button>
        ${p.parts.map(pt => `<button type="button" data-part="${esc(pt.id)}" aria-pressed="false">${esc(pt.name)}</button>`).join("")}
      </nav>
      <div class="ex-card" id="exCard" hidden></div>

      <div class="ex-read" aria-live="polite">
        <dl>
          <dt>Beam resonance</dt><dd id="rFn">-</dd>
          <dt>Machine</dt><dd id="rFm">-</dd>
          <dt>Response</dt><dd id="rResp">-</dd>
        </dl>
        <div class="ex-cap">
          <div class="ex-cap-top"><span>Storage capacitor</span><b id="rV">0.00 V</b></div>
          <div class="ex-cap-bar"><i id="capFill"></i><em style="left:${(s.off / 2.5) * 100}%"></em><em style="left:${(s.on / 2.5) * 100}%"></em></div>
          <div class="ex-cap-legend"><span>0 V</span><span>${s.off} V off</span><span>${s.on} V send</span></div>
        </div>
        <p class="ex-tx"><span class="ex-ping" id="ping"></span><span id="rTx">No transmissions yet</span></p>
      </div>

      <div class="ex-ctrl">
        <label>Machine vibration <output id="oFm"></output><input id="cFm" type="range" min="20" max="45" step="0.1" value="${s.machine}"></label>
        <label>Proof mass <output id="oM"></output><input id="cM" type="range" min="1" max="12" step="0.1" value="${s.mass}"></label>
        <div class="ex-toggles">
          <button type="button" id="tExplode" aria-pressed="false">Exploded view</button>
          <button type="button" id="tTune" aria-pressed="false">Auto-tune</button>
        </div>
        <p class="ex-hint">Drag to orbit · motion slowed and exaggerated so you can see it</p>
      </div>
    </section>

    <div class="sol-after ex-after">
      <section class="sol-sec">
        <p class="sol-credit">${esc(p.credit)}</p>
        <dl class="sol-facts ex-facts">${(p.facts || []).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>
      </section>
      ${p.how ? `<section class="sol-sec" id="how"><h2 class="sol-h">${esc(p.how.title)}</h2>
        <ol class="ex-how">${p.how.items.map(([h, t], i) => `<li><span class="num">${String(i + 1).padStart(2, "0")}</span><h3>${esc(h)}</h3><p>${esc(t)}</p></li>`).join("")}</ol></section>` : ""}
      ${p.figures ? `<section class="sol-sec" id="figures"><h2 class="sol-h">${esc(p.figures.title)}</h2>
        <div class="sol-figs">${p.figures.items.map(([src, cap]) => `<figure><a href="${esc(p.dir + src)}" target="_blank" rel="noopener"><img src="${esc(p.dir + src)}" alt="${esc(cap)}" loading="lazy"></a><figcaption>${esc(cap)}</figcaption></figure>`).join("")}</div></section>` : ""}
      ${bullets(p.did, "did", "did")}
      ${bullets(p.improve, "improve", "improve")}
    </div>`;

  // ---------- the physics model ----------
  const I = s.w * s.t ** 3 / 12, k = 3 * s.E * I / s.L ** 3, mBeam = s.L * s.w * s.t * s.rho;
  const fNat = grams => Math.sqrt(k / (mBeam + grams / 1000)) / (2 * Math.PI);
  const peak = 1 / (2 * s.zeta);
  const st = { fm: s.machine, mass: s.mass, tune: 0, auto: false, V: 1.2, sending: 0, count: 0, phase: 0, resp: 0, disp: 0, explode: false, part: "" };

  const $ = id => document.getElementById(id);
  const cFm = $("cFm"), cM = $("cM");
  const showInputs = () => { $("oFm").textContent = st.fm.toFixed(1) + " Hz"; $("oM").textContent = st.mass.toFixed(1) + " g"; };
  cFm.oninput = () => { st.fm = +cFm.value; showInputs(); };
  cM.oninput = () => { st.mass = +cM.value; showInputs(); };
  showInputs();
  $("tExplode").onclick = e => { st.explode = !st.explode; e.currentTarget.setAttribute("aria-pressed", st.explode); };
  $("tTune").onclick = e => { st.auto = !st.auto; if (!st.auto) st.tune = 0; e.currentTarget.setAttribute("aria-pressed", st.auto); };

  // ---------- parts list and info card ----------
  const card = $("exCard");
  const select = id => {
    st.part = id || "";
    document.querySelectorAll(".ex-parts button").forEach(b => b.setAttribute("aria-pressed", b.dataset.part === st.part));
    const pt = p.parts.find(x => x.id === st.part);
    card.hidden = !pt;
    if (pt) card.innerHTML = `<h3>${esc(pt.name)}</h3><dl><dt>Material</dt><dd>${esc(pt.material)}</dd><dt>Size</dt><dd>${esc(pt.size)}</dd></dl><p>${esc(pt.text)}</p>`;
    scene?.focus(st.part);
  };
  document.querySelectorAll(".ex-parts button").forEach(b => b.onclick = () => select(b.dataset.part));

  // ---------- readouts: written at ~10 Hz and only when the text changes ----------
  const out = {};
  const put = (id, text) => { if (out[id] !== text) { out[id] = text; $(id).textContent = text; } };
  let uiT = 0;

  // ---------- one simulation step per rendered frame ----------
  const step = dt => {
    const fn = fNat(st.mass);
    if (st.auto) st.tune += clamp((st.fm - fn) - st.tune, -1.5 * dt, 1.5 * dt);   // electrical tuning, ±3 Hz
    st.tune = clamp(st.tune, -3, 3);
    const fe = fn + st.tune, r = st.fm / fe;
    st.resp = (1 / Math.sqrt((1 - r * r) ** 2 + (2 * s.zeta * r) ** 2)) / peak;
    st.phase += 2 * Math.PI * (st.fm / 14) * dt;                                    // slowed ~14x so the eye can follow
    st.disp = 0.55 * st.resp * Math.sin(st.phase);

    // capacitor: charges with response^2; the relay sends at s.on and the sensor drains it to s.off
    if (st.sending > 0) { st.V -= 1.4 * dt; st.sending -= dt; if (st.V <= s.off) { st.V = s.off; st.sending = 0; } }
    else { st.V += (st.resp * st.resp * 0.55 - 0.012) * dt; if (st.V >= s.on) { st.sending = 1; st.count++; $("ping").classList.remove("go"); void $("ping").offsetWidth; $("ping").classList.add("go"); } }
    st.V = clamp(st.V, 0, 2.5);

    uiT += dt;
    if (uiT > 0.1) {
      uiT = 0;
      put("rFn", fe.toFixed(1) + " Hz" + (st.auto && Math.abs(st.tune) > 0.05 ? ` (tuned ${st.tune > 0 ? "+" : ""}${st.tune.toFixed(1)})` : ""));
      put("rFm", st.fm.toFixed(1) + " Hz");
      put("rResp", Math.round(st.resp * 100) + "% of peak");
      put("rV", st.V.toFixed(2) + " V");
      $("capFill").style.width = (st.V / 2.5 * 100).toFixed(1) + "%";
      put("rTx", st.count ? `${st.count} transmission${st.count > 1 ? "s" : ""} sent` : "No transmissions yet");
    }
  };

  const scene = startPiezoScene($("exCanvas"), $("exStage"), st, step, id => select(id));
  return () => { scene?.stop(); delete document.body.dataset.layout; document.body.classList.remove("sol-dark", "explore"); if (themeBtn) themeBtn.hidden = false; };
}
