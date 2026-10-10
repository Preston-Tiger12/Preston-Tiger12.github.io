/* Portfolio
 *
 * Every project is a folder in projects/ with a project.json and its images.
 * projects/index.json lists the folders in tab order.
 *
 * To add a tab: copy projects/energy-harvesting to a new folder, edit its
 * project.json, drop your images next to it, and add the folder name to
 * projects/index.json. Section types you can use: chain, calc, figure, parts,
 * contribution, concepts, stub, reflection, text.
 */

const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
let projects = [];
let home = null;
let observers = [];

// ---------- 1. load ----------
async function load() {
  const ids = await fetch("projects/index.json").then(r => r.json());
  home = await fetch("home.json").then(r => r.ok ? r.json() : null).catch(() => null);
  projects = await Promise.all(ids.map(id =>
    fetch(`projects/${id}/project.json`).then(r => r.json()).then(p => ({ ...p, dir: `projects/${id}/` }))));
  route();
}

const PAGES = ["home", "about"];
function current() {
  const id = location.hash.slice(1).split("/")[0];
  if (home && (!id || PAGES.includes(id))) return id || "home";
  return projects.find(p => p.id === id) || projects[0];
}

const pad = i => String(i).padStart(2, "0");

// ---------- smooth scroll (Lenis) driving GSAP ScrollTrigger ----------
let lenis = null;
if (window.gsap && window.ScrollTrigger) {
  gsap.registerPlugin(ScrollTrigger, window.SplitText, window.ScrambleTextPlugin);
  if (window.Lenis && !reduced) {
    lenis = new Lenis({ lerp: 0.1, wheelMultiplier: 0.9 });
    lenis.on("scroll", ScrollTrigger.update);
    window.__lenis = lenis;   // the 3D inspector pauses smooth scrolling while it is open
    gsap.ticker.add(t => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  }
}
const goTop = () => { lenis ? lenis.scrollTo(0, { immediate: true, force: true }) : scrollTo(0, 0); };
const goTo = el => { lenis ? lenis.scrollTo(el, { duration: 1.4 }) : el.scrollIntoView({ behavior: reduced ? "auto" : "smooth" }); };

function route() {
  const p = current();
  closeMenu(true);
  const isPage = typeof p === "string";
  const pages = [...(home ? [["home", "Home"], ["about", "About"]] : []), ...projects.map(x => [x.id, x.tab])];
  const on = id => (isPage ? id === p : p && p.id === id);
  $("#tabs").innerHTML = pages.map(([id, name], i) =>
    `<a href="#${esc(id)}" ${on(id) ? 'aria-current="page"' : ""}><span class="tn">${pad(i + 1)}</span>${esc(name)}</a>`).join("");
  $("#menuLinks").innerHTML = [...pages.map(([id, name]) => [`#${id}`, name, ""]), ...(home ? [["#home", "Contact", "contact"]] : [])]
    .map(([href, name, to], i) => `<a href="${esc(href)}" ${to ? `data-scroll="${to}"` : ""} ${!to && on(href.slice(1)) ? 'aria-current="page"' : ""} style="--i:${i}"><span class="mn">${pad(i + 1)}</span><span class="mt">${esc(name)}</span></a>`).join("");
  document.body.classList.toggle("is-home", isPage);
  if (isPage) { document.title = p === "about" ? "About, Ntwali Preston (Tiger)" : "Ntwali Preston (Tiger), Mechanical Engineering"; renderPage(p); return; }
  if (!p) { $("#page").innerHTML = `<div class="empty">No projects yet.</div>`; return; }
  document.title = `${p.tab}, Ntwali Preston`;
  hideOrbit();
  render(p);
  goTop();
}

// ---------- menu: a full-screen blue panel with giant links ----------
const menu = $("#menu"), menuBtn = $("#menuBtn");
let menuTimer = 0;
function openMenu() {
  clearTimeout(menuTimer);
  menu.hidden = false; void menu.offsetWidth;
  menu.classList.add("open"); document.documentElement.classList.add("menu-open");
  menuBtn.setAttribute("aria-expanded", "true"); lenis?.stop();
  menu.querySelector(".menu-links a")?.focus({ preventScroll: true });
}
function closeMenu(instant) {
  if (menu.hidden) return;
  menu.classList.remove("open"); document.documentElement.classList.remove("menu-open");
  menuBtn.setAttribute("aria-expanded", "false"); lenis?.start();
  clearTimeout(menuTimer);
  if (instant || reduced) menu.hidden = true; else menuTimer = setTimeout(() => { menu.hidden = true; }, 650);
}
menuBtn.onclick = () => menu.classList.contains("open") ? closeMenu() : openMenu();
addEventListener("keydown", e => { if (e.key === "Escape" && menu.classList.contains("open")) { closeMenu(); menuBtn.focus(); } });

// "Contact" lives at the bottom of Home and About: scroll there, or go Home first
let pendingScroll = "";
document.addEventListener("click", e => {
  const a = e.target.closest("[data-scroll]");
  if (!a) return;
  e.preventDefault();
  const to = a.dataset.scroll;
  closeMenu(true);
  const el = document.getElementById(to);
  if (el && typeof current() === "string") goTo(el);
  else { pendingScroll = to; location.hash = "home"; }
});
// ---------- 2. render ----------
const img = (p, f, alt = "", cls = "") => f ? `<img src="${esc(p.dir + f)}" alt="${esc(alt)}" class="${cls}" loading="lazy" decoding="async">` : "";

const SECTIONS = {
  chain(p, s) {
    return `<div class="chain">
      <div class="chainstage" aria-hidden="true">
        <span class="label chainidx" id="chainIdx">01 / ${String(s.steps.length).padStart(2, "0")}</span>
        <div class="flow">${s.steps.map(() => "<i></i>").join("")}</div>
        ${s.steps.map((st, i) => img(p, st.image, "", i === 0 ? "on" : "")).join("")}
        <div class="chainread"><b id="chainVal">${esc(s.steps[0].value)}</b><span class="label" id="chainLbl">${esc(s.steps[0].valueLabel)}</span></div>
      </div>
      <div class="steps">${s.steps.map((st, i) => `
        <article class="step${i === 0 ? " on" : ""}" data-i="${i}">
          ${img(p, st.image, st.part, "inl")}
          <span class="label">${String(i + 1).padStart(2, "0")} ${esc(st.label)}</span>
          <h3>${esc(st.part)}</h3>
          <div class="mat">${esc(st.material)} · <span class="num">${esc(st.value)}</span> ${esc(st.valueLabel)}</div>
          <p>${esc(st.text)}</p>
        </article>`).join("")}
      </div></div>`;
  },
  calc(p, s) {
    return `<div class="calc" data-calc='${esc(JSON.stringify({ G: s.solar, r: s.reflectivity, n: s.couples, a: s.seebeck }))}'>
      <div class="ctrl">
        <div><label for="cD">Dish diameter <output id="oD"></output></label><input id="cD" type="range" min="0.2" max="2" step="0.05" value="0.6"></div>
        <div><label for="cT">Temperature difference across the TEG <output id="oT"></output></label><input id="cT" type="range" min="10" max="300" step="5" value="100"></div>
        <p class="note">Fixed from the design: ${s.solar} W/m² solar constant, ${Math.round(s.reflectivity * 100)}% reflectivity, ${s.couples} couples at ${s.seebeck * 1e6} μV/K.</p>
      </div>
      <div>
        <div class="reads">
          <div class="read"><span class="label">Aperture area</span><b class="num" id="rA"></b><small>π(D/2)²</small></div>
          <div class="read"><span class="label">Power at the focus</span><b class="num" id="rP"></b><small>G × ρ × A</small></div>
          <div class="read"><span class="label">TEG open-circuit voltage</span><b class="num" id="rV"></b><small>N × α × ΔT</small></div>
          <div class="read"><span class="label">Per kelvin</span><b class="num" id="rK"></b><small>N × α</small></div>
        </div>
        <p class="note">${esc(s.note)}</p>
      </div></div>`;
  },
  figure(p, s) {
    return `<figure class="fig"><a href="${esc(p.dir + s.image)}" target="_blank" rel="noopener">${img(p, s.image, s.alt)}</a></figure><figcaption class="cap">${esc(s.caption)}</figcaption>`;
  },
  parts(p, s) {
    return `<div class="parts">${s.items.map(([name, f]) => `<div class="part">
      ${f ? img(p, f, name) : `<div class="ini">${esc(name.replace(/[^A-Za-z ]/g, "").split(/\s+/).filter(Boolean).map(w => w[0]).join("").slice(0, 3).toUpperCase())}</div>`}
      <span>${esc(name)}</span></div>`).join("")}</div>`;
  },
  contribution(p, s) {
    return `<div class="rows">${s.items.map(([h, t]) => `<div class="row"><h3>${esc(h)}</h3><p>${esc(t)}</p></div>`).join("")}</div>`;
  },
  concepts(p, s) {
    return `<div class="cols two">${s.items.map(([h, t]) => `<div class="col"><h3>${esc(h)}</h3><p>${esc(t)}</p></div>`).join("")}</div>`;
  },
  reflection(p, s) {
    return `<div class="cols">${s.items.map(([h, t]) => `<div class="col"><h3>${esc(h)}</h3><p>${esc(t)}</p></div>`).join("")}</div>`;
  },
  stub(p, s) {
    return `<div class="stub"><span class="dot hold"></span><span>${esc(s.text)}</span></div>`;
  },
  text(p, s) {
    return `<div class="intro">${(s.paragraphs || []).map(t => `<p>${esc(t)}</p>`).join("")}</div>`;
  },
};

let cleanup = null;

async function render(p) {
  if (cleanup) { cleanup(); cleanup = null; }
  document.documentElement.classList.toggle("force-dark", !!p.darkOnly);
  if (p.layout) {
    // projects can bring their own layout, e.g. layouts/solare.js for the 3D story
    try {
      const mod = await import(`./layouts/${p.layout}.js`);
      cleanup = mod.render(p, $("#page")) || null;
      return;
    } catch (e) { console.error("Layout failed, using the standard page", e); }
  }
  const h = p.hero || {};
  $("#page").innerHTML = `
    <section class="hero">
      ${h.giant ? `<div class="giant num" aria-hidden="true">${esc(h.giant)}</div>` : ""}
      ${h.giantLabel ? `<span class="label giantlabel">${esc(h.giant)} ${esc(h.giantLabel)}</span>` : ""}
      <div class="stage3d">${img(p, h.image, h.alt)}</div>
      <div class="herobase">
        <div>
          <div class="code label"><span class="dot${p.status === "Complete" ? "" : " hold"}"></span>${esc(p.code)} · ${esc(p.status)}</div>
          <h1 class="title rv">${esc(p.title)}</h1>
          ${p.statement ? `<p class="statement">${esc(p.statement)}</p>` : ""}
        </div>
        <dl class="facts">${(p.facts || []).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>
      </div>
    </section>
    <div class="body">
      <nav class="toc" aria-label="On this page">${p.sections.map(s => `<a href="#${esc(p.id)}/${esc(s.id)}" data-to="${esc(s.id)}">${esc(s.nav || s.title)}</a>`).join("")}</nav>
      <div>
        ${p.summary ? `<p class="summary">${esc(p.summary)}</p>` : ""}
        ${p.sections.map(s => `<section class="sec" id="s-${esc(s.id)}">
          <h2 class="rv">${esc(s.title)}</h2>
          ${s.intro ? `<p class="intro">${esc(s.intro)}</p>` : ""}
          ${(SECTIONS[s.type] || SECTIONS.text)(p, s)}
        </section>`).join("")}
      </div>
    </div>`;
  wire(p);
}

// ---------- 2b. Home and About (layouts/home.js) ----------
let booted = false, orbitMod = null;
function hideOrbit() { orbitMod?.orbit().hide(); }

async function renderPage(kind) {
  if (cleanup) { cleanup(); cleanup = null; }
  document.documentElement.classList.remove("force-dark");
  observers.forEach(o => o.disconnect()); observers = [];
  goTop();
  const first = !booted; booted = true;
  const loader = first && !reduced ? showLoader() : null;
  try {
    const mod = await import("./layouts/home.js");
    orbitMod ||= await import("./layouts/orbit-scene.js");
    if (current() !== kind) return;   // the visitor moved on while it loaded
    cleanup = mod.render(kind, home, projects, $("#page"));
  } catch (e) { console.error(e); $("#page").innerHTML = `<div class="empty">Couldn't load this page.</div>`; }
  if (pendingScroll) { const el = document.getElementById(pendingScroll); pendingScroll = ""; if (el) setTimeout(() => goTo(el), 300); }
  loader?.done();
}

// first visit: a counter in gold script, then the cover lifts
function showLoader() {
  const L = document.createElement("div");
  L.className = "loader";
  L.innerHTML = `<span class="glitch go" data-text="TIGER">TIGER</span><b>000</b><small>Ntwali Preston</small><i class="bar"></i>`;
  document.body.append(L);
  const n = L.querySelector("b"), t0 = performance.now();
  let ready = false, shown = false;
  const step = now => {
    const k = Math.min(1, (now - t0) / 1100), e = 1 - (1 - k) ** 3;
    n.textContent = String(Math.round(e * (ready ? 100 : 92))).padStart(3, "0");
    L.style.setProperty("--p", e * (ready ? 1 : 0.92));
    if (k < 1 || !ready) requestAnimationFrame(step);
    else if (!shown) { shown = true; n.textContent = "100"; L.classList.add("out"); setTimeout(() => L.remove(), 1100); }
  };
  requestAnimationFrame(step);
  return { done() { ready = true; } };
}

// ---------- 3. behaviour ----------
function wire(p) {
  observers.forEach(o => o.disconnect()); observers = [];

  // hero render tilts toward the pointer
  const hero = $(".stage3d img");
  if (hero && !reduced) {
    let tx = 0, ty = 0, x = 0, y = 0, raf;
    const tick = () => { x += (tx - x) * .08; y += (ty - y) * .08;
      hero.style.transform = `rotateY(${x * 14}deg) rotateX(${-y * 10}deg) translateZ(0)`;
      if (Math.abs(tx - x) + Math.abs(ty - y) > .001) raf = requestAnimationFrame(tick); else raf = null; };
    $(".hero").onpointermove = e => { tx = e.clientX / innerWidth - .5; ty = e.clientY / innerHeight - .5; if (!raf) raf = requestAnimationFrame(tick); };
    hero.style.transition = "none";
  }

  // headings reveal once
  // (watch the parent: a fully clipped element never counts as visible)
  const rv = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.querySelectorAll(":scope > .rv").forEach(h => h.classList.add("in")); rv.unobserve(e.target); } }), { rootMargin: "0px 0px -12% 0px" });
  document.querySelectorAll(".rv").forEach(el => reduced ? el.classList.add("in") : rv.observe(el.parentElement));
  observers.push(rv);

  // chain: whichever step is in the middle of the screen drives the render
  const steps = [...document.querySelectorAll(".step")];
  if (steps.length) {
    const sec = p.sections.find(s => s.type === "chain");
    const imgs = [...document.querySelectorAll(".chainstage img")], bars = [...document.querySelectorAll(".flow i")];
    const set = i => {
      steps.forEach((s, k) => s.classList.toggle("on", k === i));
      imgs.forEach((m, k) => m.classList.toggle("on", k === i));
      bars.forEach((b, k) => b.classList.toggle("on", k <= i));
      $("#chainVal").textContent = sec.steps[i].value; $("#chainLbl").textContent = sec.steps[i].valueLabel;
      $("#chainIdx").textContent = `${String(i + 1).padStart(2, "0")} / ${String(steps.length).padStart(2, "0")}`;
    };
    const so = new IntersectionObserver(es => es.forEach(e => e.isIntersecting && set(+e.target.dataset.i)), { rootMargin: "-45% 0px -45% 0px" });
    steps.forEach(s => so.observe(s)); observers.push(so); set(0);
  }

  // table of contents follows the scroll
  const links = [...document.querySelectorAll(".toc a")];
  const to = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) links.forEach(a => a.classList.toggle("on", "s-" + a.dataset.to === e.target.id)); }), { rootMargin: "-40% 0px -55% 0px" });
  document.querySelectorAll(".sec").forEach(s => to.observe(s)); observers.push(to);
  links.forEach(a => a.onclick = e => { e.preventDefault(); document.getElementById("s-" + a.dataset.to).scrollIntoView({ behavior: reduced ? "auto" : "smooth" }); });

  // calculator
  const calc = $(".calc");
  if (calc) {
    const k = JSON.parse(calc.dataset.calc), D = $("#cD"), T = $("#cT");
    const fmtW = w => w >= 1000 ? (w / 1000).toFixed(2) + " kW" : Math.round(w) + " W";
    const run = () => {
      const d = +D.value, dt = +T.value, A = Math.PI * (d / 2) ** 2;
      $("#oD").textContent = d.toFixed(2) + " m"; $("#oT").textContent = dt + " K";
      $("#rA").textContent = A.toFixed(2) + " m²";
      $("#rP").textContent = fmtW(k.G * k.r * A);
      $("#rV").textContent = (k.n * k.a * dt).toFixed(2) + " V";
      $("#rK").textContent = (k.n * k.a * 1000).toFixed(0) + " mV";
    };
    D.oninput = T.oninput = run; run();
  }
}

// ---------- 4. theme: light ("paper") and dark ("night"); the Piezo page is night only ----------
const SUN = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>`;
const MOON = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>`;
const isDark = () => (document.documentElement.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")) === "dark";
const paintTheme = () => { $("#theme").innerHTML = isDark() ? MOON : SUN; $("#theme").setAttribute("aria-label", isDark() ? "Switch to light" : "Switch to dark"); };
$("#theme").onclick = () => {
  const t = isDark() ? "light" : "dark";
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem("hangar-theme", t); } catch (e) {}
  paintTheme();
  slashMark();
};
paintTheme();
// Brand mark: the claws re-cut the star whenever the theme changes (and once on load).
// Removing the class and forcing a reflow restarts the CSS animations on every click.
function slashMark() {
  const m = document.querySelector(".tmark");
  if (!m) return;
  m.classList.remove("tm-go"); void m.offsetWidth; m.classList.add("tm-go");
}
setTimeout(slashMark, 600);

// ---------- custom cursor (mouse only), after the Hangar's: a dot that sticks and a ring that follows ----------
// The ring grows over anything clickable and shows that element's data-cursor word ("Open", "Read").
if (matchMedia("(pointer: fine)").matches && !reduced) {
  const ring = $("#cursor"), dot = $("#cursorDot"), word = ring.firstElementChild;
  let mx = -100, my = -100, rx = -100, ry = -100, raf = 0;
  const follow = () => {
    rx += (mx - rx) * 0.18; ry += (my - ry) * 0.18;
    ring.style.translate = `${rx}px ${ry}px`;
    raf = Math.abs(mx - rx) + Math.abs(my - ry) > 0.2 ? requestAnimationFrame(follow) : 0;   // idle mouse, idle loop
  };
  addEventListener("pointermove", e => {
    if (rx < -50) { rx = e.clientX; ry = e.clientY; }
    mx = e.clientX; my = e.clientY; dot.style.translate = `${mx}px ${my}px`;
    document.documentElement.classList.add("has-cursor");
    const t = e.target.closest?.("a, button, [data-cursor], input, label");
    const label = t?.dataset.cursor || "";
    ring.classList.toggle("hover", !!t); ring.classList.toggle("word", !!label);
    if (word.textContent !== label) word.textContent = label;
    if (!raf) raf = requestAnimationFrame(follow);
  }, { passive: true });
  addEventListener("pointerdown", () => ring.classList.add("down"));
  addEventListener("pointerup", () => ring.classList.remove("down"));
  document.documentElement.addEventListener("mouseleave", () => document.documentElement.classList.remove("has-cursor"));
}

// ---------- 5. boot ----------
// phone and desktop choreographies differ: rebuild Home or About when the layout crosses 760 px
let wasPhone = innerWidth < 760;
addEventListener("resize", () => { const ph = innerWidth < 760; if (ph !== wasPhone) { wasPhone = ph; if (typeof current() === "string") renderPage(current()); } });
addEventListener("hashchange", () => { if (!location.hash.includes("/")) route(); });
$("[data-home]").onclick = e => { e.preventDefault(); if (current() === "home") goTo(document.body); else location.hash = "home"; };
load().then(() => {
  $("#menuNote").textContent = [home?.status, home?.handle].filter(Boolean).join(" · ");
  const c = home?.contact || {};
  $("#menuContact").innerHTML = [c.email && `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>`, c.linkedin && `<a href="${esc(c.linkedin)}" target="_blank" rel="noopener">LinkedIn</a>`, c.cv && `<a href="${esc(c.cv)}" target="_blank" rel="noopener">CV</a>`].filter(Boolean).join("") || `<span>${esc(home?.role || "")}</span>`;
}).catch(e => { console.error(e); $("#page").innerHTML = `<div class="empty">Couldn't load projects/index.json.</div>`; });
