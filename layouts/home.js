/* Home and About.
 *
 * One model (orbit-scene.js) floats over both pages. Home goes ground, air, orbit:
 * an F1 car, a private jet escorted by two fighters, then a rocket. About ends with Hobbies, where the
 * skateboard, surfboard and snowboard take over. Each section moves differently:
 *   hero      pinned: the name splits apart letter by letter
 *   intro     line-by-line mask reveal
 *   anatomy   pinned: the F1 car comes apart, labels draw their leader lines
 *   work      pinned: a horizontal track of projects (the jet flies along)
 *   numbers   pinned: each figure grows to fill the screen, then hands over
 *   contact   a blue circle opens from the centre and the rocket lights up
 * About: rows that scramble in, a pinned card deck with a progress ring, and a
 * pinned Hobbies stage (skateboard apart, then surfboard, then snowboard).
 * Text effects: labels decode with ScrambleText; "Tiger" glitches now and then.
 */

import { orbit } from "./orbit-scene.js";

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pad = i => String(i).padStart(2, "0");
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const phone = () => innerWidth < 760;

// the F1 car, read like an engineer (Home)
const PARTS = [
  ["frontWing", "Front wing", "First to meet the air; sets up the flow"],
  ["halo", "Halo", "Titanium hoop, tested to about 12 tonnes"],
  ["sidepods", "Sidepods", "Radiators inside, shaped to feed the floor"],
  ["tyres", "Tyres", "18-inch; four contact patches do everything"],
  ["rearWing", "Rear wing", "DRS flap opens on the straights"],
  ["powerUnit", "Power unit", "1.6 L V6 turbo hybrid"],
  ["floor", "Floor", "Ground effect: most of the downforce"],
];
const SLOT = { frontWing: ["L", 0.18], halo: ["L", 0.34], sidepods: ["L", 0.5], tyres: ["L", 0.66], rearWing: ["R", 0.22], powerUnit: ["R", 0.38], floor: ["R", 0.54] };
// the skateboard (About / Hobbies)
const SKATE = [
  ["grip", "Grip tape", "Silicon carbide grit"],
  ["deck", "Deck", "7-ply maple, cross-grain"],
  ["wheels", "Wheels", "Urethane: harder rolls faster"],
  ["trucks", "Trucks", "Lean the deck, the axle steers"],
  ["bushings", "Bushings", "Urethane springs that set the turn"],
  ["bearings", "Bearings", "608 size, two per wheel"],
];
const SKATE_SLOT = { grip: ["L", 0.2], deck: ["L", 0.4], wheels: ["L", 0.6], trucks: ["R", 0.26], bushings: ["R", 0.42], bearings: ["R", 0.58] };
const HOBBIES = [
  ["Skate", "Six parts. Lean, and the geometry steers."],
  ["Surf", "Three fins, a lot of rocker, one wave at a time."],
  ["Snow", "Twin tip, steel edges, gold straps."],
];

// leader-line labels that follow a model's parts while a section is pinned
function wireLabels(sc, section, parts, slots, mi, getP, from, to, until, counter, P) {
  const tags = [...section.querySelectorAll(".hx-tag")], lines = [...section.querySelectorAll(".hx-leaders line")], dots = [...section.querySelectorAll(".hx-leaders circle")];
  return sc.onFrame((screenOf, pose) => {
    const p = getP();
    if ((p <= 0 || p >= 1) && pose.ex < 0.05) { section.classList.remove("live"); return; }
    section.classList.add("live");
    const shown = p < from ? 0 : Math.min(parts.length, 1 + Math.floor((p - from) / (to - from) * parts.length));
    if (counter) counter.textContent = pad(Math.max(1, shown));
    parts.forEach(([id], i) => {
      const pt = screenOf(mi, id), tag = tags[i], ln = lines[i], dot = dots[i];
      if (!pt) return;
      const on = i < shown && pose.ex > 0.6 && p > 0 && p < until && Math.round(pose.m) === mi;
      const [side, fy] = slots[id], left = P ? i % 2 === 0 : side === "L";
      const tx = P ? (left ? 16 : innerWidth - 16) : (left ? innerWidth * 0.14 : innerWidth * 0.86);
      const ty = P ? innerHeight * 0.66 + (i >> 1) * 56 : innerHeight * fy;
      tag.style.transform = `translate3d(${left ? tx : tx - tag.offsetWidth}px,${ty - 16}px,0)`;
      tag.classList.toggle("on", on);
      const ex = left ? tx + tag.offsetWidth + 8 : tx - tag.offsetWidth - 8;
      ln.setAttribute("x1", ex); ln.setAttribute("y1", ty); ln.setAttribute("x2", pt.x); ln.setAttribute("y2", pt.y);
      const len = Math.hypot(pt.x - ex, pt.y - ty); ln.style.strokeDasharray = len; ln.style.strokeDashoffset = on ? 0 : len;
      dot.setAttribute("cx", pt.x); dot.setAttribute("cy", pt.y); dot.classList.toggle("on", on);
      ln.style.display = dot.style.display = P ? "none" : "";
    });
  });
}
const tagsHTML = (parts, inspect) => `<svg class="hx-leaders" aria-hidden="true">${parts.map(([id]) => `<line data-for="${id}"/><circle r="3.5" data-for="${id}"/>`).join("")}</svg>
    ${parts.map(([id, name, spec], i) => `<div class="hx-tag glass" data-part="${id}"${inspect ? ' data-cursor="Zoom" role="button" tabindex="0"' : ""}><b>${pad(i + 1)}</b><span>${esc(name)}</span><small>${esc(spec)}</small></div>`).join("")}`;

// contact: a launch pad, not a flood. Huge type on the page ground, a countdown that runs with the scroll,
// a warm glow where the rocket lights, and glass cards for the ways to reach me.
function contact(h, heading = ["Drop", "in."], launch = false) {
  const c = h.contact || {};
  const cards = [
    `<div class="hx-c-card glass"><span>Status</span><b><i class="dot"></i>${esc(h.status)}</b></div>`,
    h.handle && `<div class="hx-c-card glass" data-cursor="Tiger"><span>Socials</span><b>${esc(h.handle)}</b></div>`,
    c.email && `<a class="hx-c-card glass" href="mailto:${esc(c.email)}" data-cursor="Email"><span>Email</span><b>${esc(c.email)}</b></a>`,
    c.linkedin && `<a class="hx-c-card glass" href="${esc(c.linkedin)}" target="_blank" rel="noopener" data-cursor="Open"><span>LinkedIn</span><b>Connect</b></a>`,
    c.cv && `<a class="hx-c-card glass" href="${esc(c.cv)}" target="_blank" rel="noopener" data-cursor="Open"><span>CV</span><b>Download</b></a>`,
  ].filter(Boolean);
  return `<section class="hx-contact${launch ? " is-launch" : ""}" id="contact">
    <div class="hx-pad" aria-hidden="true"><i class="glow"></i><i class="floor"></i></div>
    <div class="hx-contact-in">
      <div class="hx-c-top"><p class="hx-label" data-scramble>Contact</p>${launch ? `<p class="hx-tminus">T<span>−</span><b id="tminus">00:10</b></p>` : ""}</div>
      <h2 class="hx-big"><span>${esc(heading[0])}</span><span>${esc(heading[1])}</span></h2>
      <div class="hx-c-cards">${cards.join("")}</div>
    </div>
  </section>`;
}

const clocks = h => (h.clocks || []).map(([city, tz]) => `<dt>${esc(city)}</dt><dd class="num" data-tz="${esc(tz)}">--:--</dd>`).join("");
// option B (after Meer Mohsin's cinematic text): uppercase words that blur in, one word set in script
const cine = (text, script) => String(text).split(" ").map(w => w.replace(/[^\w]/g, "").toLowerCase() === script.toLowerCase()
  ? `<span class="w script" aria-hidden="true">${esc(w)}</span>` : `<span class="w" aria-hidden="true">${esc(w)}</span>`).join(" ");
const nick = h => `<span class="glitch" data-text="${esc(h.nick || "")}">${esc(h.nick || "")}</span>`;

// ---------- markup ----------
function homeHTML(h, projects) {
  const [first, ...rest] = String(h.name).split(" ");
  const chars = w => [...w].map(c => `<span class="c">${esc(c)}</span>`).join("");
  const when = p => (p.facts || []).find(f => /when/i.test(f[0]))?.[1] || "";
  const role = p => (p.facts || []).find(f => /role/i.test(f[0]))?.[1] || p.credit?.split(";")[1]?.trim() || "";
  return `
  <section class="hx-hero" id="hxHero">
    <dl class="hx-read hx-tl"><dt>Handle</dt><dd>${esc(h.handle)}</dd><dt>Course</dt><dd>${esc(h.role)}</dd><dt>Focus</dt><dd>${esc(h.focus)}</dd></dl>
    <dl class="hx-read hx-tr">${clocks(h)}<dt>Status</dt><dd><i class="dot"></i>Available 2027</dd></dl>
    <h1 class="hx-name" aria-label="${esc(h.name)}"><span class="hx-row r1">${chars(first)}</span><span class="hx-row r2">${chars(rest.join(" "))}</span></h1>
    <p class="hx-aka"><small>a.k.a.</small>${nick(h)}</p>
    <p class="hx-voice">${esc(h.voice)}</p>
    <p class="hx-cue"><span>Scroll</span><i></i></p>
  </section>

  <section class="hx-intro" id="hxIntro">
    <p class="hx-label" data-scramble>01 / Intro</p>
    <p class="hx-cine" aria-label="${esc(h.statement)}">${cine(h.statement, h.statementScript || "nobody")}</p>
    <p class="hx-sub hx-caps" data-lines>${esc(h.intro)}</p>
    <a class="hx-more" href="#about" data-cursor="Read">More about me</a>
  </section>

  <section class="hx-anatomy" id="hxAnatomy">
    <div class="hx-anat-head">
      <p class="hx-label" data-scramble>02 / Anatomy</p>
      <h2 class="hx-h">A race car, taken apart</h2>
      <p class="hx-anat-note">Seven parts. Every one of them is fighting the air.</p>
    </div>
    ${tagsHTML(PARTS, true)}
    <div class="hx-anat-foot"><span class="hx-count"><b id="anatN">01</b> / ${pad(PARTS.length)}</span><button type="button" class="hx-inspect glass" data-cursor="Zoom"><i></i>Inspect in 3D</button></div>
  </section>

  <section class="hx-work" id="work">
    <div class="hx-work-pin">
      <div class="hx-work-head"><p class="hx-label" data-scramble>03 / Work</p><span class="hx-count"><b id="workN">01</b> / ${pad(projects.length + (h.next?.length || 0))}</span></div>
      <div class="hx-track">
        ${projects.map((p, i) => `<a class="hx-card" href="#${esc(p.id)}" data-cursor="Open">
          <span class="hx-card-img"><img src="${esc(p.dir + (p.fallbackImage || ""))}" alt="" loading="lazy"></span>
          <span class="hx-card-n">${pad(i + 1)}</span>
          <span class="hx-card-t">${esc(p.tab)}</span>
          <span class="hx-card-s">${esc(p.title)}</span>
          <span class="hx-card-m">${esc(role(p))}${when(p) ? " · " + esc(when(p)) : ""}</span>
        </a>`).join("")}
        ${(h.next || []).map(([name, text]) => `<div class="hx-card is-next" data-cursor="Soon">
          <span class="hx-card-img"><span class="hx-ghost">${esc(name)}</span></span>
          <span class="hx-card-n">Next</span><span class="hx-card-t">${esc(name)}</span><span class="hx-card-s">${esc(text)}</span><span class="hx-card-m">In development</span>
        </div>`).join("")}
      </div>
    </div>
  </section>

  ${h.stats ? `<section class="hx-numbers" id="numbers">
    <p class="hx-label" data-scramble>04 / In numbers</p>
    ${h.stats.map(([n, k, v], i) => `<div class="hx-stat" data-i="${i}"><b>${esc(n)}</b><p><span>${esc(k)}</span>${esc(v)}</p></div>`).join("")}
  </section>` : ""}

  ${contact(h, ["Count", "me in."], true)}`;
}

function aboutHTML(h) {
  return `
  <section class="hx-ab-hero" id="abHero">
    <p class="hx-label" data-scramble>About / ${esc(h.name)}</p>
    <h1 class="hx-ab-title" data-lines>${esc(h.aboutTitle)}</h1>
    <p class="hx-aka"><small>a.k.a.</small>${nick(h)}</p>
    <dl class="hx-read hx-ab-read">${(h.facts || []).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>
  </section>

  <section class="hx-started" id="started">
    <p class="hx-label" data-scramble>Things I've started</p>
    <ol class="hx-rows">${(h.started || []).map(([k, v], i) => `<li><span class="hx-ri">${pad(i + 1)}</span><h3 data-scramble>${esc(k)}</h3><p>${esc(v)}</p></li>`).join("")}</ol>
  </section>

  <section class="hx-record" id="record">
    <div class="hx-rec-pin">
      <div class="hx-rec-side">
        <p class="hx-label" data-scramble>Record</p>
        <svg class="hx-ring" viewBox="0 0 80 80" aria-hidden="true"><circle cx="40" cy="40" r="35"/><circle class="p" cx="40" cy="40" r="35"/></svg>
        <span class="hx-ring-n" id="recN">01</span>
      </div>
      <div class="hx-rec-stack">${(h.record || []).map(([k, v], i) => `<article class="hx-rec" data-i="${i}"><span>${pad(i + 1)}</span><h3>${esc(k)}</h3><p>${esc(v)}</p></article>`).join("")}</div>
    </div>
  </section>

  <section class="hx-hobbies" id="hobbies">
    <div class="hx-hob-pin">
      <div class="hx-hob-copy">
        <p class="hx-label" data-scramble>Hobbies</p>
        <div class="hx-hob-slides">${HOBBIES.map(([t, line], i) => `<article data-k="${i}"${i ? "" : ' class="on"'}><h2 class="hx-h">${esc(t)}</h2><p>${esc(line)}</p></article>`).join("")}</div>
        <span class="hx-count"><b id="hobN">01</b> / ${pad(HOBBIES.length)}</span>
      </div>
      ${tagsHTML(SKATE)}
    </div>
    <dl class="hx-offgrid">${(h.offclock || []).map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>
  </section>

  ${contact(h)}`;
}

// ---------- behaviour ----------
export function render(kind, h, projects, root) {
  const { gsap, ScrollTrigger, SplitText } = window;
  const sc = orbit();
  root.innerHTML = kind === "about" ? aboutHTML(h) : homeHTML(h, projects);
  document.body.dataset.page = kind;
  const kill = [], splits = [];
  let ctx = null, dead = false;
  // line breaks and pin lengths depend on the web fonts, so build once they are in
  const ready = Promise.race([document.fonts?.ready || Promise.resolve(), new Promise(r => setTimeout(r, 1500))]);
  ready.then(() => { if (!dead) setup(); });

  function setup() {
  ctx = gsap.context(() => {}, root);

  // clocks
  const fmt = {};
  const tick = () => root.querySelectorAll("[data-tz]").forEach(el => {
    const tz = el.dataset.tz; fmt[tz] ||= new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: tz }); el.textContent = fmt[tz].format(new Date()); });
  tick(); const iv = setInterval(tick, 15000); kill.push(() => clearInterval(iv));

  ctx.add(() => {
    // line reveals: each line rises out of its own mask (DESIGN.md: text reveals by line)
    root.querySelectorAll("[data-lines]").forEach(el => {
      const s = SplitText.create(el, { type: "lines", mask: "lines", linesClass: "ln" }); splits.push(s);
      if (reduced) return;
      gsap.from(s.lines, { yPercent: 105, duration: 0.9, ease: "power3.out", stagger: 0.08, scrollTrigger: { trigger: el, start: "top 85%", once: true } });
    });
  });

  // text effects: labels decode once on arrival, "Tiger" glitches every few seconds
  const { ScrambleTextPlugin } = window;
  if (ScrambleTextPlugin && !reduced) ctx.add(() => {
    root.querySelectorAll("[data-scramble]").forEach(el => {
      const text = el.textContent;
      gsap.fromTo(el, { opacity: 0.2 }, { opacity: 1, duration: 1.1, ease: "none", scrambleText: { text, chars: "01/<>#_*TIGER", speed: 0.6, revealDelay: 0.25 },
        scrollTrigger: { trigger: el, start: "top 92%", once: true } });
    });
  });
  const glitches = [...root.querySelectorAll(".glitch")];
  if (glitches.length && !reduced) {
    const gi = setInterval(() => glitches.forEach(g => { g.classList.remove("go"); void g.offsetWidth; g.classList.add("go"); }), 4200);
    kill.push(() => clearInterval(gi));
    setTimeout(() => glitches.forEach(g => g.classList.add("go")), 900);
  }

  // intro statement: words come out of a blur as the paragraph scrolls in (scrubbed, so it reverses too)
  ctx.add(() => {
    root.querySelectorAll(".hx-cine").forEach(el => {
      const ws = el.querySelectorAll(".w");
      if (reduced) return;
      // long, overlapping stagger so several words sit at different depths at once (near ones sharp, far ones soft)
      gsap.fromTo(ws, { opacity: 0.06, y: 70, scale: 1.18, filter: "blur(18px)" }, { opacity: 1, y: 0, scale: 1, filter: "blur(0px)", ease: "power1.out", duration: 1, stagger: 0.35,
        scrollTrigger: { trigger: el, start: "top 95%", end: "bottom 30%", scrub: 0.8 } });
    });
  });
  const anchors = [];
  const top = el => () => el.getBoundingClientRect().top + scrollY;
  const P = phone();

  if (kind === "home") {
    const hero = root.querySelector("#hxHero"), intro = root.querySelector("#hxIntro"), anat = root.querySelector("#hxAnatomy"),
      work = root.querySelector("#work"), nums = root.querySelector("#numbers"), cont = root.querySelector("#contact");

    ctx.add(() => {
      // hero: pinned for one screen; the two rows of the name split apart letter by letter
      const tl = gsap.timeline({ scrollTrigger: { trigger: hero, start: "top top", end: "+=100%", scrub: 0.6, pin: true } });
      tl.to(".hx-row.r1 .c", { xPercent: i => -60 - i * 28, yPercent: i => -20 - (i % 3) * 30, opacity: 0, ease: "none", stagger: 0.02 }, 0)
        .to(".hx-row.r2 .c", { xPercent: i => 40 + i * 30, yPercent: i => 20 + (i % 3) * 25, opacity: 0, ease: "none", stagger: 0.02 }, 0)
        .to(".hx-read, .hx-voice, .hx-cue", { opacity: 0, y: -20, ease: "none" }, 0);
      if (!reduced) gsap.from(".hx-row .c", { yPercent: 110, duration: 1.1, ease: "power4.out", stagger: 0.035, delay: 0.15 });
    });
    const heroST = ScrollTrigger.getAll().find(t => t.trigger === hero);

    // anatomy: pinned for three screens; satellite explodes, then each label draws in
    let anatP = 0, anatST;
    ctx.add(() => { anatST = ScrollTrigger.create({ trigger: anat, start: "top top", end: "+=300%", pin: true, scrub: true, onUpdate: s => { anatP = s.progress; } }); });
    const anatOff = wireLabels(sc, anat, PARTS, SLOT, 0, () => anatP, 0.22, 0.82, 1, root.querySelector("#anatN"), P);
    // inspector: zoom into the exploded car (opened from the button or any label)
    const inspect = async id => {
      const { openInspector } = await import("./inspect.js");
      const host = document.querySelector(".orbit");   // the page's own model sleeps while the inspector is open
      openInspector(PARTS, id, { onOpen: () => { window.__lenis?.stop(); if (host) host.hidden = true; }, onClose: () => { window.__lenis?.start(); if (host) host.hidden = false; } });
    };
    anat.querySelector(".hx-inspect").onclick = () => inspect(null);
    anat.querySelectorAll(".hx-tag[data-cursor]").forEach(t => { t.onclick = () => inspect(t.dataset.part); t.onkeydown = e => { if (e.key === "Enter") inspect(t.dataset.part); }; });
    kill.push(anatOff);

    // work: horizontal track while pinned
    let workST;
    ctx.add(() => {
      const track = work.querySelector(".hx-track"), cards = [...track.children];
      const dist = () => Math.max(0, track.scrollWidth - innerWidth + parseFloat(getComputedStyle(track).paddingLeft));
      gsap.to(track, { x: () => -dist(), ease: "none", scrollTrigger: { trigger: work, start: "top top", end: () => "+=" + dist(), pin: true, scrub: 0.6, invalidateOnRefresh: true,
        onUpdate: s => { root.querySelector("#workN").textContent = pad(Math.min(cards.length, 1 + Math.round(s.progress * (cards.length - 1)))); } } });
      workST = ScrollTrigger.getAll().find(t => t.trigger === work);
      cards.forEach(c => gsap.from(c.querySelector(".hx-card-img"), { clipPath: "inset(100% 0 0 0)", ease: "power2.out", duration: 1, scrollTrigger: { trigger: work, start: "top 60%", once: true } }));
    });

    // numbers: each figure grows from small to screen-filling, then the next one takes over
    let numST;
    if (nums) ctx.add(() => {
      const stats = [...nums.querySelectorAll(".hx-stat")];
      const tl = gsap.timeline({ scrollTrigger: { trigger: nums, start: "top top", end: "+=" + stats.length * 90 + "%", pin: true, scrub: 0.5 } });
      stats.forEach((s, i) => {
        const b = s.querySelector("b"), p = s.querySelector("p");
        tl.fromTo(b, { scale: 0.25, opacity: 0 }, { scale: 1, opacity: 1, ease: "power2.out", duration: 1 }, i * 2)
          .fromTo(p, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.5 }, i * 2 + 0.4);
        if (i < stats.length - 1) tl.to(b, { scale: 1.6, opacity: 0, yPercent: -30, duration: 0.8, ease: "power2.in" }, i * 2 + 1.4).to(p, { opacity: 0, duration: 0.4 }, i * 2 + 1.4);
      });
      numST = ScrollTrigger.getAll().find(t => t.trigger === nums);
    });

    // contact: the countdown runs with the scroll; at zero the outlined line fills and the pad glows
    ctx.add(() => {
      const tm = cont.querySelector("#tminus");
      ScrollTrigger.create({ trigger: cont, start: "top 75%", end: "bottom bottom", scrub: true, onUpdate: st => {
        const t = Math.max(0, Math.round(10 * (1 - st.progress)));
        if (tm) tm.textContent = t ? "00:" + pad(t) : "LIFTOFF";
        cont.style.setProperty("--p", st.progress.toFixed(3)); cont.classList.toggle("lift", t === 0);
      } });
    });

    // ground, air, orbit: F1 car through the top half, the jet from the work track, the rocket for contact
    const sy = (stf, k) => () => stf()?.[k] ?? 0;
    const f1 = { m: 0 }, jet = { m: 1 }, rk = { m: 2 };
    const workIn = () => (workST?.start ?? 0) + (workST ? (workST.end - workST.start) * 0.22 : 0);
    anchors.push(
      { y: () => 0, pose: { ...f1, x: P ? 0 : 0.04, y: P ? 0.02 : -0.04, s: P ? 0.46 : 0.62, rx: 0.3, ry: -0.75, rz: 0 } },
      { y: sy(() => heroST, "end"), pose: { ...f1, x: P ? 0.3 : 0.45, y: P ? 0.6 : 0.02, s: P ? 0.32 : 0.5, rx: 0.45, ry: -2.3, rz: 0 } },
      { y: () => top(intro)() + intro.offsetHeight * 0.4, pose: { ...f1, x: P ? 0.45 : 0.66, y: P ? 0.74 : -0.3, s: P ? 0.24 : 0.36, rx: 0.35, ry: -3.6, rz: 0 } },
      { y: sy(() => anatST, "start"), pose: { ...f1, x: P ? 0 : 0.04, y: P ? 0.24 : 0, s: P ? 0.42 : 0.5, rx: 0.42, ry: -5.6, rz: 0 } },
      { y: () => (anatST?.start ?? 0) + (anatST ? (anatST.end - anatST.start) * 0.22 : 0), pose: { ...f1, x: P ? 0 : 0.04, y: P ? 0.28 : 0, s: P ? 0.38 : 0.48, rx: 0.42, ry: -5.6, ex: 1 } },
      { y: sy(() => anatST, "end"), pose: { ...f1, x: P ? 0 : 0.04, y: P ? 0.28 : 0, s: P ? 0.38 : 0.48, rx: 0.42, ry: -5.95, ex: 1 } },
      { y: workIn, pose: { ...jet, x: P ? 0.3 : 0.58, y: P ? 0.7 : 0.6, s: P ? 0.36 : 0.46, rx: 0.55, ry: -0.3, rz: 0.06 } },
      { y: sy(() => workST, "end"), pose: { ...jet, x: P ? 0.3 : 0.55, y: P ? 0.7 : 0.58, s: P ? 0.36 : 0.46, rx: 0.5, ry: 0.25, rz: 0.1 } },
      ...(nums ? [
        { y: sy(() => numST, "start"), pose: { ...jet, x: P ? -0.45 : -0.66, y: P ? -0.6 : -0.5, s: P ? 0.3 : 0.36, rx: 0.5, ry: 0.4, rz: 0.25 } },
        { y: sy(() => numST, "end"), pose: { ...jet, x: P ? 0.45 : 0.66, y: P ? -0.6 : -0.45, s: P ? 0.3 : 0.36, rx: 0.4, ry: -0.4, rz: 0.3 } },
      ] : []),
      { y: () => top(cont)() - innerHeight * 0.1, pose: { ...rk, x: P ? 0.5 : 0.55, y: P ? -0.1 : -0.25, s: P ? 0.5 : 0.62, rx: 0.12, ry: 0, rz: Math.PI / 2, fx: 0.3 } },
      { y: () => top(cont)() + cont.offsetHeight - innerHeight, pose: { ...rk, x: P ? 0.5 : 0.55, y: P ? 0.3 : 0.3, s: P ? 0.5 : 0.62, rx: 0.12, ry: 1.6, rz: Math.PI / 2, fx: 1 } },
    );
  } else {
    const story = root.querySelector("#started"), rec = root.querySelector("#record"), hob = root.querySelector("#hobbies"), cont = root.querySelector("#contact");
    // record: a pinned stack; each card rises to the front while the ring fills
    let recST;
    ctx.add(() => {
      const cards = [...rec.querySelectorAll(".hx-rec")], ring = rec.querySelector(".hx-ring .p"), C = 2 * Math.PI * 35;
      ring.style.strokeDasharray = C;
      const place = (el, d) => d === 0 ? { yPercent: 0, scale: 1, opacity: 1, rotate: 0, "--c": 1 } : d < 0 ? { yPercent: -120, scale: 0.92, opacity: 0, rotate: -3, "--c": 0 } : { yPercent: 7 * d, scale: 1 - 0.05 * d, opacity: d > 2 ? 0 : 1, rotate: 0, "--c": 0 };
      cards.forEach((c, i) => gsap.set(c, { ...place(c, i), zIndex: cards.length - i }));
      const tl = gsap.timeline({ scrollTrigger: { trigger: rec, start: "top top", end: "+=" + cards.length * 70 + "%", pin: true, scrub: 0.5,
        onUpdate: s => { const f = s.progress * (cards.length - 1); ring.style.strokeDashoffset = C * (1 - s.progress); rec.querySelector("#recN").textContent = pad(Math.round(f) + 1); } } });
      for (let k = 1; k < cards.length; k++) cards.forEach((c, i) => tl.to(c, { ...place(c, i - k), ease: "power2.inOut", duration: 1 }, k - 1));
      recST = ScrollTrigger.getAll().find(t => t.trigger === rec);
    });
    // (created after the record pin so its start includes that pin's spacer)
    // hobbies: pinned; the skateboard comes apart, then the surfboard, then the snowboard
    let hobP = 0, hobST;
    const slides = [...hob.querySelectorAll(".hx-hob-slides article")];
    ctx.add(() => { hobST = ScrollTrigger.create({ trigger: hob.querySelector(".hx-hob-pin"), start: "top top", end: "+=450%", pin: true, scrub: true,
      onUpdate: s => { hobP = s.progress; const k = hobP < 0.55 ? 0 : hobP < 0.85 ? 1 : 2; slides.forEach((a, i) => a.classList.toggle("on", i === k)); root.querySelector("#hobN").textContent = pad(k + 1); } }); });
    kill.push(wireLabels(sc, hob, SKATE, SKATE_SLOT, 3, () => hobP, 0.1, 0.3, 0.42, null, P));
    const hp = f => () => (hobST?.start ?? 0) + (hobST ? (hobST.end - hobST.start) * f : 0);
    ctx.add(() => { ScrollTrigger.create({ trigger: cont, start: "top 75%", end: "bottom bottom", scrub: true, onUpdate: st => cont.style.setProperty("--p", st.progress.toFixed(3)) }); });
    const sk = { m: 3, x: P ? 0 : 0.12, y: P ? 0.22 : 0.06, s: P ? 0.42 : 0.5, rx: 0.32, ry: -0.5 };
    anchors.push(
      { y: () => 0, pose: { m: 2, x: P ? 0.45 : 0.55, y: P ? 0.35 : 0, s: P ? 0.5 : 0.66, rx: 0.1, ry: 0, rz: Math.PI / 2, fx: 1 } },
      { y: () => top(story)() - innerHeight * 0.1, pose: { m: 2, x: P ? 0.6 : 0.78, y: P ? 0.6 : 0.2, s: P ? 0.34 : 0.46, rx: 0.1, ry: 2.4, rz: Math.PI / 2 - 0.2, fx: 1 } },
      { y: () => recST?.start ?? 0, pose: { m: 2, x: P ? 0.5 : -0.62, y: P ? 0.72 : -0.35, s: P ? 0.3 : 0.4, rx: 0.3, ry: 0, rz: 0.5, fx: 1 } },
      { y: () => recST?.end ?? 0, pose: { m: 2, x: P ? 0.5 : -0.62, y: P ? 0.72 : -0.35, s: P ? 0.3 : 0.4, rx: 0.3, ry: 1.2, rz: 0.7, fx: 1 } },
      { y: hp(0), pose: { ...sk } },
      { y: hp(0.12), pose: { ...sk, ex: 1 } },
      { y: hp(0.38), pose: { ...sk, ry: -0.9, ex: 1 } },
      { y: hp(0.48), pose: { ...sk, ry: -1.1 } },
      { y: hp(0.62), pose: { m: 4, x: P ? 0 : 0.18, y: P ? 0.22 : 0.08, s: P ? 0.46 : 0.56, rx: 1.0, ry: 0, rz: -0.2 } },
      { y: hp(0.78), pose: { m: 4, x: P ? 0 : 0.18, y: P ? 0.22 : 0.08, s: P ? 0.46 : 0.56, rx: 1.05, ry: 0, rz: 0.25 } },
      { y: hp(0.92), pose: { m: 5, x: P ? 0 : 0.18, y: P ? 0.22 : 0.08, s: P ? 0.48 : 0.6, rx: 1.15, ry: 0.1, rz: 0.45 } },
      { y: hp(1), pose: { m: 5, x: P ? 0 : 0.18, y: P ? 0.22 : 0.08, s: P ? 0.48 : 0.6, rx: 1.1, ry: -0.1, rz: 0.55 } },
      { y: () => top(cont)() - innerHeight * 0.1, pose: { m: 5, x: P ? 0.25 : 0.5, y: P ? 0.45 : 0.3, s: P ? 0.42 : 0.56, rx: 1.15, ry: 0.15, rz: 0.5 } },
      { y: () => top(cont)() + cont.offsetHeight - innerHeight, pose: { m: 5, x: P ? 0.25 : 0.5, y: P ? 0.45 : 0.3, s: P ? 0.42 : 0.56, rx: 1.0, ry: -0.2, rz: 0.62 } },
    );
  }

  sc.setAnchors(anchors);
  const onRefresh = () => sc.refresh();
  ScrollTrigger.addEventListener("refresh", onRefresh);
  kill.push(() => ScrollTrigger.removeEventListener("refresh", onRefresh));
  requestAnimationFrame(() => ScrollTrigger.refresh());

  }

  return () => { dead = true; kill.forEach(f => f()); splits.forEach(s => s.revert()); ctx?.revert(); delete document.body.dataset.page; };
}
