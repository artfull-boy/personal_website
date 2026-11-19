/* =========================================================
   Ilias Rais · interactions
   ========================================================= */
(() => {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const body = document.body;
  body.classList.add("is-loading");
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  const toTop = () => window.scrollTo({ top: 0, behavior: "instant" });
  toTop();
  window.addEventListener("load", () => { if (!location.hash) toTop(); });

  /* ---------- Language switch: the other language spreads across the page as a wave ----------
     Both pages share the same markup, so instead of loading a new page we fetch the other
     language once and swap each piece of text in place when the wave reaches it. The page
     stays fully interactive, nothing reloads, and open menus or running animations carry on. */
  const html = document.documentElement;
  const ink = {};
  const staticEls = [...body.querySelectorAll("*")];
  const directTexts = (el) => [...el.childNodes].filter((n) => n.nodeType === 3);
  let origText = staticEls.map((el) => directTexts(el).map((n) => n.nodeValue));
  const SKIP_ATTR = new Set(["class", "style", "id", "hidden", "tabindex", "aria-pressed", "aria-expanded", "aria-hidden", "aria-current"]);
  const isRel = (v) => v && !/^(#|[a-z][a-z0-9+.-]*:|\/\/)/i.test(v);
  const absUrl = (v, base) => (isRel(v) ? new URL(v, base).href : v);
  const absSet = (v, base) => v.split(",").map((s) => { const [u, ...d] = s.trim().split(/\s+/); return [absUrl(u, base), ...d].join(" "); }).join(", ");
  const docs = new Map();
  const getDoc = (url) => {
    if (!docs.has(url)) {
      docs.set(url, fetch(url, { credentials: "same-origin" })
        .then((r) => (r.ok ? r.text() : Promise.reject(r.status)))
        .then((t) => new DOMParser().parseFromString(t, "text/html"))
        .catch((e) => { docs.delete(url); throw e; }));
    }
    return docs.get(url);
  };
  const otherLink = () => $(".lang__opt:not(.is-active)");
  const prefetchLang = () => { const a = otherLink(); if (a) getDoc(a.href).catch(() => {}); };
  window.addEventListener("load", () => setTimeout(() => (window.requestIdleCallback || setTimeout)(prefetchLang), 2500));
  $$(".lang").forEach((l) => ["pointerenter", "focusin", "touchstart"].forEach((t) => l.addEventListener(t, prefetchLang, { passive: true })));

  let absolutized = false;
  let swapping = false;
  async function switchLang(lang, origin, push) {
    if (swapping || lang === html.lang) return;
    const link = $(`.lang__opt[hreflang="${lang}"]`);
    if (!link) return;
    const url = link.href;
    swapping = true;
    let doc;
    try { doc = await getDoc(url); } catch (e) { location.href = url; return; }
    const els = [...doc.body.querySelectorAll("*")];
    // the two pages must share their structure, otherwise fall back to a normal page load
    if (els.length < staticEls.length || staticEls.some((el, i) => el.tagName !== els[i].tagName)) { location.href = url; return; }

    // relative links and images must keep pointing to the same files once the address changes
    if (!absolutized) {
      absolutized = true;
      const base = location.href;
      $$("[href], [src], [srcset]").forEach((el) => {
        ["href", "src"].forEach((k) => { const v = el.getAttribute(k); if (isRel(v)) el.setAttribute(k, absUrl(v, base)); });
        const s = el.getAttribute("srcset");
        if (s && s.split(",").some((p) => isRel(p.trim().split(/\s+/)[0]))) el.setAttribute("srcset", absSet(s, base));
      });
    }

    // the toggle and the address change right away; the content follows the wave
    $$(".lang__opt").forEach((o) => {
      const on = o.getAttribute("hreflang") === lang;
      o.classList.toggle("is-active", on);
      if (on) o.setAttribute("aria-current", "page"); else o.removeAttribute("aria-current");
    });
    if (push) history.pushState({ lang }, "", url);

    const fixedRoots = $$("body > *, body > * > *").filter((el) => getComputedStyle(el).position === "fixed");
    const sy = window.scrollY;
    const jobs = [];
    const nextOrig = [];
    staticEls.forEach((el, i) => {
      const nu = els[i];
      const want = directTexts(nu).map((n) => n.nodeValue);
      nextOrig[i] = want;
      const cur = directTexts(el);
      const text = [];
      // only text still showing its original wording is translated; text a script is driving is left alone
      if (cur.length === want.length) cur.forEach((n, k) => { if (n.nodeValue === origText[i][k] && n.nodeValue !== want[k]) text.push([n, want[k]]); });
      const attrs = [];
      for (const { name, value } of nu.attributes) {
        if (SKIP_ATTR.has(name)) continue;
        const v = name === "href" || name === "src" ? absUrl(value, url) : name === "srcset" ? absSet(value, url) : value;
        if (el.getAttribute(name) !== v) attrs.push([name, v]);
      }
      if (!text.length && !attrs.length) return;
      const job = { el, text, attrs };
      const r = el.getBoundingClientRect();
      if (!r.width && !r.height) job.now = true;
      else {
        job.fixed = fixedRoots.some((f) => f.contains(el));
        job.x = r.left + r.width / 2;
        job.y = r.top + r.height / 2 + (job.fixed ? 0 : sy);
      }
      jobs.push(job);
    });
    origText = nextOrig;

    const apply = (j, fade) => {
      j.text.forEach(([n, v]) => { n.nodeValue = v; });
      j.attrs.forEach(([k, v]) => j.el.setAttribute(k, v));
      if (fade && j.text.length && !j.el.closest(".reveal")) {
        j.el.animate([{ opacity: 0.2, filter: "blur(2px)" }, { opacity: 1, filter: "blur(0)" }], { duration: 420, easing: "ease-out" });
      }
    };
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      jobs.forEach((j) => j.done || apply(j, false));
      html.lang = lang;
      document.title = doc.title;
      $$("meta[name], meta[property]", doc.head).forEach((m) => {
        const key = m.hasAttribute("name") ? `meta[name="${m.getAttribute("name")}"]` : `meta[property="${m.getAttribute("property")}"]`;
        const mine = $(key, document.head);
        if (mine) mine.setAttribute("content", m.getAttribute("content"));
      });
      const canon = $('link[rel="canonical"]', doc.head);
      if (canon && $('link[rel="canonical"]')) $('link[rel="canonical"]').href = canon.href;
      document.dispatchEvent(new CustomEvent("langchange", { detail: { lang, doc } }));
      swapping = false;
    };
    jobs.forEach((j) => { if (j.now) { apply(j, false); j.done = true; } });
    if (reduced || !origin) { finish(); return; }

    const { x: ox, y: oy } = origin;
    const R = Math.hypot(Math.max(ox, innerWidth - ox), Math.max(oy, innerHeight - oy)) + 60;
    const D = 1150;
    const E = "cubic-bezier(0.55, 0, 0.3, 1)";
    // same curve as E, so text changes exactly where the ring edge is
    const ease = (t) => {
      const x1 = 0.55, x2 = 0.3;
      let u = t;
      for (let k = 0; k < 8; k++) {
        const x = 3 * (1 - u) * (1 - u) * u * x1 + 3 * (1 - u) * u * u * x2 + u * u * u - t;
        const dx = 3 * (1 - u) * (1 - u) * x1 + 6 * (1 - u) * u * (x2 - x1) + 3 * u * u * (1 - x2);
        if (Math.abs(x) < 1e-4 || !dx) break;
        u = Math.min(1, Math.max(0, u - x / dx));
      }
      return 3 * (1 - u) * u * u + u * u * u;
    };
    [0, 130].forEach((delay, i) => {
      const ring = document.createElement("div");
      ring.className = "lang-wave" + (i ? " trail" : "");
      ring.style.left = ox + "px"; ring.style.top = oy + "px";
      body.appendChild(ring);
      ring.animate(
        [
          { width: "0px", height: "0px", opacity: 1 },
          { width: 1.5 * R + "px", height: 1.5 * R + "px", opacity: 1, offset: 0.75 },
          { width: 2 * R + "px", height: 2 * R + "px", opacity: 0 },
        ],
        { duration: D, delay, easing: E, fill: "both" }
      ).finished.then(() => ring.remove());
    });
    const t0 = performance.now();
    const tick = (now) => {
      const p = Math.min((now - t0) / D, 1);
      const rad = R * ease(p);
      const y0 = window.scrollY;
      for (const j of jobs) {
        if (j.done) continue;
        const dy = j.y - (j.fixed ? 0 : y0) - oy;
        if (Math.hypot(j.x - ox, dy) <= rad) { apply(j, true); j.done = true; }
      }
      if (finished) return;
      if (p < 1) requestAnimationFrame(tick); else finish();
    };
    requestAnimationFrame(tick);
    // a hidden tab pauses animation frames: make sure the switch still completes
    setTimeout(finish, D + 400);
  }

  document.addEventListener("click", (e) => {
    const a = e.target.closest && e.target.closest(".lang__opt");
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button) return;
    e.preventDefault();
    if (a.classList.contains("is-active")) return;
    const r = a.getBoundingClientRect();
    switchLang(a.getAttribute("hreflang"), { x: r.left + r.width / 2, y: r.top + r.height / 2 }, true);
  });
  window.addEventListener("popstate", () => {
    const lang = /\/fr\/?$/.test(location.pathname) ? "fr" : "en";
    if (lang === html.lang) return;
    const t = $(`.lang__opt[hreflang="${lang}"]`);
    const r = t && t.getBoundingClientRect();
    switchLang(lang, r && { x: r.left + r.width / 2, y: r.top + r.height / 2 }, false);
  });

  /* ---------- Preloader: terminal boot ---------- */
  const fr = document.documentElement.lang === "fr";
  const bootLines = [
    '<span class="hi">$</span> nmap -sV ilias.rais',
    fr ? "Analyse du profil cible en cours..." : "Starting scan of target profile...",
    "PORT     SERVICE        VERSION",
    "443/tcp  software-eng   ENSAM '25 · Top 10%",
    "502/tcp  ics-ot-sec     Sherbrooke '26",
    "8443/tcp cyberus-msc    UBS · Luxembourg",
    fr
      ? '<span class="ok">[✓] Hôte actif. Disponible en février 2027.</span>'
      : '<span class="ok">[✓] Host is up. Available Feb 2027.</span>',
  ];
  const log = $("#bootLog");
  const bar = $("#bootProgress");
  let i = 0;
  const finishBoot = () => {
    $("#preloader").classList.add("done");
    body.classList.remove("is-loading");
    body.classList.add("is-ready");
    startDecrypt();
    countUp($(".hero__counter-num"));
    try { sessionStorage.setItem("booted", "1"); } catch (e) {}
  };
  // the boot sequence plays once per visit, not on every page or language switch
  let booted = false;
  try { booted = sessionStorage.getItem("booted") === "1"; } catch (e) {}
  if (booted) {
    $("#preloader").style.transition = "none";
    finishBoot();
  } else if (reduced) {
    log.innerHTML = bootLines.join("\n");
    finishBoot();
  } else {
    const step = () => {
      if (i < bootLines.length) {
        log.innerHTML += (i ? "\n" : "") + bootLines[i];
        i++;
        bar.style.width = (i / bootLines.length) * 100 + "%";
        setTimeout(step, i === 1 ? 260 : 170);
      } else setTimeout(finishBoot, 380);
    };
    setTimeout(step, 200);
  }

  /* ---------- Decrypt / scramble headline ---------- */
  const glyphs = "!<>-_\\/[]{}=+*^?#01ABCDEF";
  function startDecrypt() {
    if (reduced) return;
    $$(".decrypt").forEach((el, idx) => {
      const final = el.dataset.text;
      const delay = idx * 180;          // ms before this line starts resolving
      const dur = final.length * 38;    // ms to fully resolve
      const t0 = performance.now();
      const tick = (now) => {
        const p = (now - t0 - delay) / dur;
        if (p >= 1) { el.textContent = final; return; }
        const solved = Math.max(0, p) * final.length;
        let out = "";
        for (let c = 0; c < final.length; c++) {
          const ch = final[c];
          if (ch === " " || c < solved) out += escapeHtml(ch);
          else out += `<span class="glitch">${glyphs[(Math.random() * glyphs.length) | 0]}</span>`;
        }
        el.innerHTML = out;
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }
  const escapeHtml = (s) => s.replace(/[&<>]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[m]));

  /* ---------- Counters ---------- */
  function countUp(el) {
    if (!el || el.dataset.done) return;
    el.dataset.done = 1;
    const target = +el.dataset.count;
    const pad = +(el.dataset.pad || 0);
    const fmt = (n) => String(n).padStart(pad, "0");
    if (reduced || target === 0) { el.textContent = fmt(target); return; }
    const dur = 1600;
    const t0 = performance.now();
    const run = (t) => {
      const p = Math.min((t - t0) / dur, 1);
      const e = 1 - Math.pow(1 - p, 4);
      el.textContent = fmt(Math.round(target * e));
      if (p < 1) requestAnimationFrame(run);
    };
    requestAnimationFrame(run);
  }

  /* ---------- Reveal on scroll ---------- */
  // Headings start fully clipped (zero visible area), so they are watched through their parent.
  const watchers = new Map();
  const revealEl = (el) => {
    el.classList.add("in");
    $$("[data-count]", el).forEach(countUp);
    if (el.classList.contains("stat")) el.parentElement.classList.add("lit");
    // once revealed, hand control back to the element's own (hover) transitions
    const delay = parseFloat(el.style.transitionDelay) || 0;
    setTimeout(() => {
      el.classList.remove("reveal", "in");
      el.style.transitionDelay = "";
    }, (delay + 1.3) * 1000);
  };
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        (watchers.get(e.target) || []).forEach(revealEl);
        watchers.delete(e.target);
        io.unobserve(e.target);
      });
    },
    { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
  );
  $$(".reveal").forEach((el) => {
    // stagger siblings
    const sibs = $$(":scope > .reveal", el.parentElement);
    const idx = sibs.indexOf(el);
    if (idx > 0) el.style.transitionDelay = Math.min(idx * 0.07, 0.5) + "s";
    const clipped = el.matches(".h2, .cta__title");
    const target = clipped ? el.parentElement : el;
    if (!watchers.has(target)) { watchers.set(target, []); io.observe(target); }
    watchers.get(target).push(el);
  });

  /* ---------- Nav + menu ---------- */
  const nav = $("#nav");
  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      nav.classList.toggle("scrolled", window.scrollY > 40);
      updateExpProgress();
      updateStacks();
      updateHeroParallax();
      updateClaim();
    });
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);

  /* ---------- Stacking cards: earlier cards shrink & dim behind the next ---------- */
  const stacks = $$(".stack").map((s) => {
    const cards = $$(":scope > .stack-card", s);
    cards.forEach((c, i) => c.style.setProperty("--i", i));
    return cards;
  });
  function updateStacks() {
    if (reduced) return;
    const vh = window.innerHeight;
    stacks.forEach((cards) => {
      const sticky = getComputedStyle(cards[0]).position === "sticky";
      // how far each card has travelled from the bottom of the screen to its sticky slot (0..1)
      const cover = cards.map((c) => {
        if (!sticky) return 0;
        const top = parseFloat(getComputedStyle(c).top) || 0;
        const r = c.getBoundingClientRect();
        return Math.min(Math.max((vh - r.top) / (vh - top), 0), 1);
      });
      cards.forEach((c, i) => {
        let depth = 0;
        for (let j = i + 1; j < cards.length; j++) depth += cover[j];
        if (!sticky || depth === 0) {
          c.style.transform = "";
          c.style.filter = "";
          return;
        }
        const scale = Math.max(1 - depth * 0.05, 0.82);
        const bright = Math.max(1 - depth * 0.28, 0.35);
        c.style.transform = `scale(${scale})`;
        c.style.filter = `brightness(${bright})`;
      });
    });
  }

  /* ---------- Hero parallax on scroll ---------- */
  const heroContent = $("#heroContent");
  const horizon = $(".hero__horizon");
  function updateHeroParallax() {
    if (reduced) return;
    const y = window.scrollY;
    const vh = window.innerHeight;
    if (y > vh * 1.2) return;
    heroContent.style.transform = `translateY(${y * 0.35}px) scale(${1 - y / vh * 0.06})`;
    heroContent.style.opacity = Math.max(1 - y / (vh * 0.7), 0);
    horizon.style.transform = `translateX(-50%) translateY(${y * -0.15}px)`;
  }

  /* ---------- Theme: dark or light, gliding between the two ---------- */
  const themeBtn = $("#themeToggle");
  const themeMeta = $('meta[name="theme-color"]');
  const isLight = () => html.dataset.theme === "light";
  const syncTheme = () => {
    const light = isLight();
    if (themeBtn) themeBtn.setAttribute("aria-label", light ? themeBtn.dataset.toDark : themeBtn.dataset.toLight);
    if (themeMeta) themeMeta.setAttribute("content", light ? "#eef1f5" : "#07080a");
    Object.assign(ink, light
      ? { line: "35,92,147", hub: "rgba(28,74,122,0.85)", node: "rgba(35,92,147,0.5)", ring: "rgba(35,92,147,0.3)", packet: "35,92,147", k: 1.5 }
      : { line: "159,195,230", hub: "rgba(220,235,250,0.9)", node: "rgba(159,195,230,0.55)", ring: "rgba(159,195,230,0.25)", packet: "220,240,255", k: 1 });
  };
  let themeTimer = 0;
  if (themeBtn) themeBtn.addEventListener("click", () => {
    const light = !isLight();
    if (!reduced) {
      html.classList.add("theme-anim");
      clearTimeout(themeTimer);
      themeTimer = setTimeout(() => html.classList.remove("theme-anim"), 800);
    }
    if (light) html.dataset.theme = "light"; else html.removeAttribute("data-theme");
    try { localStorage.setItem("theme", light ? "light" : "dark"); } catch (e) {}
    syncTheme();
  });
  syncTheme();
  document.addEventListener("langchange", syncTheme);

  const toggle = $("#menuToggle");
  const label = $(".menu-toggle__label");
  const setMenu = (open) => {
    body.classList.toggle("menu-open", open);
    toggle.setAttribute("aria-expanded", open);
    $("#menu").setAttribute("aria-hidden", !open);
    label.textContent = open ? label.dataset.close : label.dataset.open;
  };
  toggle.addEventListener("click", () => setMenu(!body.classList.contains("menu-open")));
  $$("#menu a").forEach((a) => a.addEventListener("click", () => setMenu(false)));
  document.addEventListener("keydown", (e) => e.key === "Escape" && setMenu(false));
  document.addEventListener("langchange", () => {
    label.textContent = body.classList.contains("menu-open") ? label.dataset.close : label.dataset.open;
  });

  /* ---------- Experience progress ---------- */
  const tl = $("#timeline");
  const expBar = $("#expProgress");
  function updateExpProgress() {
    if (!tl || !expBar) return;
    const r = tl.getBoundingClientRect();
    const vh = window.innerHeight;
    const p = Math.min(Math.max((vh * 0.6 - r.top) / r.height, 0), 1);
    expBar.style.height = p * 100 + "%";
  }

  /* ---------- Footer clock ---------- */
  $("#year").textContent = new Date().getFullYear();
  const clock = () => {
    $("#localTime").textContent = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit",
    }).format(new Date()) + " · Paris";
  };
  clock();
  setInterval(clock, 30000);

  /* ---------- FAQ: smooth, one open at a time ---------- */
  const accEase = "cubic-bezier(0.22, 1, 0.36, 1)";
  const accs = $$(".acc");
  function closeAcc(d) {
    if (!d.open) return;
    const b = $(".acc__body", d);
    if (reduced) { d.open = false; return; }
    const a = b.animate(
      [{ height: b.offsetHeight + "px", opacity: 1 }, { height: "0px", opacity: 0 }],
      { duration: 500, easing: accEase }
    );
    d.classList.add("closing");
    a.onfinish = () => { d.open = false; d.classList.remove("closing"); };
  }
  function openAcc(d) {
    d.open = true;
    if (reduced) return;
    const b = $(".acc__body", d);
    b.animate(
      [{ height: "0px", opacity: 0 }, { height: b.scrollHeight + "px", opacity: 1 }],
      { duration: 600, easing: accEase }
    );
    const p = $("p", b);
    p.animate([{ transform: "translateY(-8px)" }, { transform: "none" }], { duration: 700, easing: accEase });
  }
  accs.forEach((d) => {
    $("summary", d).addEventListener("click", (e) => {
      e.preventDefault();
      if (d.classList.contains("closing")) return;
      if (d.open) { closeAcc(d); return; }
      accs.forEach((o) => o !== d && closeAcc(o));
      openAcc(d);
    });
  });

  /* ---------- Magnetic buttons + portrait tilt (mouse only) ---------- */
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  if (finePointer && !reduced) {
    $$(".magnetic").forEach((btn) => {
      btn.addEventListener("pointermove", (e) => {
        const r = btn.getBoundingClientRect();
        const x = e.clientX - (r.left + r.width / 2);
        const y = e.clientY - (r.top + r.height / 2);
        btn.classList.add("is-magnet");
        btn.style.setProperty("--tx", x * 0.22 + "px");
        btn.style.setProperty("--ty", y * 0.32 + "px");
      });
      btn.addEventListener("pointerleave", () => {
        btn.classList.remove("is-magnet");
        btn.style.setProperty("--tx", "0px");
        btn.style.setProperty("--ty", "0px");
      });
    });

    const portrait = $("#portrait");
    portrait.addEventListener("pointermove", (e) => {
      const r = portrait.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      portrait.style.setProperty("--ry", px * 8 + "deg");
      portrait.style.setProperty("--rx", py * -8 + "deg");
    });
    portrait.addEventListener("pointerleave", () => {
      portrait.style.setProperty("--ry", "0deg");
      portrait.style.setProperty("--rx", "0deg");
    });
  }

  /* =========================================================
     CLAIM VERIFICATION · the quote decrypts and gets signed as you scroll
     0.00 to 0.48  characters decrypt left to right
     0.52 / 0.64 / 0.76  each company signature verifies
     0.86  stamp: VERIFIED
     ========================================================= */
  const claim = $("#claim");
  const claimQuote = $("#claimQuote");
  const hexGlyphs = "0123456789abcdef";
  const randHex = () => hexGlyphs[(Math.random() * 16) | 0];
  let claimChars = [];
  let claimP = -1;
  let lastGlyphTick = 0;

  if (claim) {
    // split the quote into words (kept unbroken) and characters
    const splitClaim = (text) => {
      claimQuote.setAttribute("aria-label", text);
      claimQuote.innerHTML = text
        .split(" ")
        .map((w) => `<span class="w" aria-hidden="true">${[...w].map((c) => `<span class="ch">${escapeHtml(c)}</span>`).join("")}</span>`)
        .join(" ");
      claimChars = $$(".ch", claimQuote);
    };
    splitClaim(claimQuote.textContent.trim());
    document.addEventListener("langchange", (e) => {
      const q = e.detail.doc.getElementById("claimQuote");
      if (q) splitClaim(q.textContent.trim());
      if (claimP >= 0) renderClaim(claimP, true);
    });

    // faint background of rolling hashes
    const hash = $(".claim__hash", claim);
    let rows = "";
    for (let r = 0; r < 14; r++) {
      let line = "";
      for (let k = 0; k < 160; k++) line += randHex();
      rows += `<div>${line}</div>`;
    }
    hash.innerHTML = rows;
  }

  function updateClaim() {
    if (!claim) return;
    const r = claim.getBoundingClientRect();
    const vh = window.innerHeight;
    const travel = r.height - vh;
    if (r.bottom < -50 || r.top > vh + 50) return;
    const p = reduced || travel <= 0 ? 1 : Math.min(Math.max(-r.top / travel, 0), 1);
    claimP = p;
    renderClaim(p, true);
  }

  function renderClaim(p, structural) {
    // 1) decrypt characters
    const solved = Math.min(p / 0.48, 1) * claimChars.length;
    claimChars.forEach((c, idx) => {
      const enc = idx >= solved;
      if (enc) {
        if (!c.classList.contains("enc")) c.classList.add("enc");
        c.dataset.g = randHex();
      } else if (c.classList.contains("enc")) c.classList.remove("enc");
    });
    if (!structural) return;

    // 2) signatures
    $$(".sig", claim).forEach((s) => {
      const at = parseFloat(s.dataset.at);
      const state = $(".sig__state", s);
      const ok = p >= at;
      const pending = !ok && p >= at - 0.08;
      s.classList.toggle("ok", ok);
      s.classList.toggle("pending", pending);
      state.innerHTML = ok ? state.dataset.ok : pending ? state.dataset.pending : state.dataset.wait;
    });

    // 3) progress + verdict
    const pct = Math.round(Math.min(p / 0.86, 1) * 100);
    $("#claimBar").style.transform = `scaleX(${pct / 100})`;
    $("#claimPct").textContent = pct + "%";
    const verified = p >= 0.86;
    claim.classList.toggle("verified", verified);
    const st = $("#claimStatus");
    st.textContent = verified ? st.dataset.ok : st.dataset.wait;
    $(".claim__hash", claim).style.transform = `translateX(${(p - 0.5) * -12}%)`;
  }

  // keep the still-encrypted characters flickering while the section is on screen
  if (claim && !reduced) {
    const flicker = (t) => {
      if (claimP >= 0 && claimP < 0.48 && t - lastGlyphTick > 70) {
        lastGlyphTick = t;
        const r = claim.getBoundingClientRect();
        if (r.top < window.innerHeight && r.bottom > 0) renderClaim(claimP, false);
      }
      requestAnimationFrame(flicker);
    };
    requestAnimationFrame(flicker);
  }

  /* ---------- Section dots: highlight the section in focus ---------- */
  const dotLinks = $$("#dots a");
  const dotTargets = dotLinks.map((a) => (a.getAttribute("href") === "#top" ? $(".hero") : $(a.getAttribute("href"))));
  const dotIO = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        const idx = dotTargets.indexOf(e.target);
        dotLinks.forEach((a, i) => a.classList.toggle("active", i === idx));
      });
    },
    { rootMargin: "-45% 0px -45% 0px" }
  );
  dotTargets.forEach((t) => t && dotIO.observe(t));

  /* =========================================================
     HERO CANVAS · network topology with travelling packets
     ========================================================= */
  const canvas = $("#netCanvas");
  const ctx = canvas.getContext("2d");
  let W, H, dpr, nodes = [], packets = [];
  const mouse = { x: -9999, y: -9999 };

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.clientWidth;
    H = canvas.clientHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const count = Math.round(Math.min(90, (W * H) / 16000));
    nodes = Array.from({ length: count }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.25,
      vy: (Math.random() - 0.5) * 0.25,
      r: Math.random() * 1.4 + 0.6,
      hub: Math.random() < 0.08,
    }));
    packets = [];
  }
  const LINK = 140;

  function spawnPacket() {
    const a = nodes[(Math.random() * nodes.length) | 0];
    let best = null, bd = Infinity;
    for (const b of nodes) {
      if (b === a) continue;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d < LINK && d < bd && Math.random() > 0.3) { bd = d; best = b; }
    }
    if (best) packets.push({ a, b: best, t: 0, speed: 0.012 + Math.random() * 0.02, hostile: Math.random() < 0.12 });
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    // movement
    for (const n of nodes) {
      n.x += n.vx; n.y += n.vy;
      if (n.x < 0 || n.x > W) n.vx *= -1;
      if (n.y < 0 || n.y > H) n.vy *= -1;
      const dx = mouse.x - n.x, dy = mouse.y - n.y;
      const md = Math.hypot(dx, dy);
      if (md < 180) { n.x -= dx * 0.004; n.y -= dy * 0.004; }
    }
    // links
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < LINK) {
          const fade = 1 - d / LINK;
          const yFade = Math.max(0, 1 - ((a.y + b.y) / 2) / (H * 0.95));
          ctx.strokeStyle = `rgba(${ink.line},${0.16 * fade * (0.4 + yFade) * ink.k})`;
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
      }
    }
    // mouse links
    for (const n of nodes) {
      const d = Math.hypot(mouse.x - n.x, mouse.y - n.y);
      if (d < 200) {
        ctx.strokeStyle = `rgba(${ink.line},${0.35 * (1 - d / 200) * ink.k})`;
        ctx.beginPath(); ctx.moveTo(mouse.x, mouse.y); ctx.lineTo(n.x, n.y); ctx.stroke();
      }
    }
    // nodes
    for (const n of nodes) {
      ctx.fillStyle = n.hub ? ink.hub : ink.node;
      ctx.beginPath(); ctx.arc(n.x, n.y, n.hub ? n.r + 1.2 : n.r, 0, Math.PI * 2); ctx.fill();
      if (n.hub) {
        ctx.strokeStyle = ink.ring;
        ctx.beginPath(); ctx.arc(n.x, n.y, 6, 0, Math.PI * 2); ctx.stroke();
      }
    }
    // packets
    if (Math.random() < 0.18) spawnPacket();
    packets = packets.filter((p) => p.t <= 1);
    for (const p of packets) {
      p.t += p.speed;
      const x = p.a.x + (p.b.x - p.a.x) * p.t;
      const y = p.a.y + (p.b.y - p.a.y) * p.t;
      const col = p.hostile ? "255,93,108" : ink.packet;
      const g = ctx.createRadialGradient(x, y, 0, x, y, 6);
      g.addColorStop(0, `rgba(${col},0.95)`);
      g.addColorStop(1, `rgba(${col},0)`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill();
    }
    raf = requestAnimationFrame(draw);
  }

  let raf;
  resize();
  window.addEventListener("resize", resize);
  const hero = $(".hero");
  hero.addEventListener("pointermove", (e) => {
    const r = canvas.getBoundingClientRect();
    mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top;
  });
  hero.addEventListener("pointerleave", () => { mouse.x = mouse.y = -9999; });
  if (!reduced) {
    // pause when hero is off-screen
    new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { if (!raf) raf = requestAnimationFrame(draw); }
      else { cancelAnimationFrame(raf); raf = null; }
    }).observe(hero);
  } else {
    draw(); cancelAnimationFrame(raf);
  }

  /* =========================================================
     ICS LAB · live attack / detection simulation
     ========================================================= */
  const svg = $("#labSvg");
  const pktLayer = $("#packets");
  const labLog = $("#labLog");
  const status = $("#labStatus");
  const NS = "http://www.w3.org/2000/svg";
  const path = (id) => document.getElementById(id);
  const attacks = [
    ["T0836", "Modify Parameter"],
    ["T0855", "Unauthorized Command Message"],
    ["T0831", "Manipulation of Control"],
    ["T0832", "Manipulation of View"],
    ["T0843", "Program Download"],
    ["T0806", "Brute Force I/O"],
  ];
  let atkIdx = 0, labRunning = false, labTimers = [];

  const ts = () => {
    const d = new Date();
    return d.toTimeString().slice(0, 8);
  };
  function logLine(html, cls = "") {
    const div = document.createElement("div");
    div.innerHTML = `<span class="t">${ts()}</span> <span class="${cls}">${html}</span>`;
    labLog.appendChild(div);
    while (labLog.children.length > 18) labLog.firstChild.remove();
  }

  function sendPacket(pathEl, cls = "pkt", dur = 1400, reverse = false) {
    return new Promise((res) => {
      const c = document.createElementNS(NS, "circle");
      c.setAttribute("r", cls === "pkt" ? 3.5 : 5);
      c.setAttribute("class", cls);
      pktLayer.appendChild(c);
      const len = pathEl.getTotalLength();
      const t0 = performance.now();
      const step = (t) => {
        const p = Math.min((t - t0) / dur, 1);
        const pt = pathEl.getPointAtLength((reverse ? 1 - p : p) * len);
        c.setAttribute("cx", pt.x); c.setAttribute("cy", pt.y);
        if (p < 1) requestAnimationFrame(step);
        else { c.remove(); res(); }
      };
      requestAnimationFrame(step);
    });
  }
  const wait = (ms) => new Promise((r) => labTimers.push(setTimeout(r, ms)));

  // normal process traffic
  const normal = [["l1"], ["l2"], ["l3"], ["l4"], ["l5"]];
  function trafficLoop() {
    if (!labRunning) return;
    const [id] = normal[(Math.random() * normal.length) | 0];
    sendPacket(path(id), "pkt", 1200 + Math.random() * 600, Math.random() < 0.3);
    labTimers.push(setTimeout(trafficLoop, 260 + Math.random() * 300));
  }

  async function attackLoop() {
    while (labRunning) {
      logLine("modbus poll ok · twin ↔ historian in sync", "b");
      await wait(2200);
      if (!labRunning) return;
      const [tid, name] = attacks[atkIdx % attacks.length];
      const missed = atkIdx % attacks.length === attacks.length - 1;
      atkIdx++;
      logLine(`caldera › ${tid} ${name}`, "a");
      await sendPacket(path("atkPath"), "pkt--atk", 1300);
      path("nPLC").classList.add("hit");
      logLine("plc › register write from unknown host", "a");
      await wait(500);
      // verifier cross-checks layers
      Promise.all([
        sendPacket(path("v1"), "pkt--ver", 1100, true),
        sendPacket(path("v3"), "pkt--ver", 1100, true),
        sendPacket(path("v2"), "pkt--ver", 1300, true),
      ]);
      logLine("verifier › cross-checking PLC · twin · historian", "b");
      await wait(1400);
      if (missed) {
        logLine(`verifier › no divergence observed (5/6 caught)`, "t");
      } else {
        const secs = 10 + Math.round(Math.random() * 10);
        status.textContent = "ALERT";
        status.classList.add("alert");
        path("nVer").classList.add("flag");
        logLine(`ALERT › ${tid} detected · ${secs}s · layer mismatch`, "g");
      }
      await wait(1800);
      path("nPLC").classList.remove("hit");
      path("nVer").classList.remove("flag");
      status.textContent = "MONITORING";
      status.classList.remove("alert");
      await wait(1200);
    }
  }

  if (svg) {
    new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !labRunning && !reduced) {
        labRunning = true;
        trafficLoop();
        attackLoop();
      } else if (!e.isIntersecting && labRunning) {
        labRunning = false;
        labTimers.forEach(clearTimeout);
        labTimers = [];
      }
    }, { threshold: 0.2 }).observe($("#lab"));
    if (reduced) {
      logLine("caldera › T0836 Modify Parameter", "a");
      logLine("ALERT › T0836 detected · 14s · layer mismatch", "g");
    }
  }

  /* =========================================================
     EXPERTISE RADAR · sweeping beam, one sector per domain
     ========================================================= */
  const radar = $("#radar");
  if (radar) {
    const NSR = "http://www.w3.org/2000/svg";
    const items = $$(".radar__item");
    const n = items.length;
    const R = 170;
    const sectorG = $("#radarSectors");
    const blipG = $("#radarBlips");
    const labelG = $("#radarLabels");
    const arc = $("#radarArc");
    const beam = $(".radar__beam", radar);
    const detail = $("#radarDetail");
    const pt = (a, r) => [r * Math.sin((a * Math.PI) / 180), -r * Math.cos((a * Math.PI) / 180)];
    const mk = (tag, attrs) => {
      const el = document.createElementNS(NSR, tag);
      for (const k in attrs) el.setAttribute(k, attrs[k]);
      return el;
    };
    const blips = [];
    const sectors = [];

    items.forEach((it, i) => {
      const a0 = (i * 360) / n;
      const a1 = ((i + 1) * 360) / n;
      const [x0, y0] = pt(a0, R);
      const [x1, y1] = pt(a1, R);
      const sec = mk("path", { d: `M0 0 L${x0} ${y0} A${R} ${R} 0 0 1 ${x1} ${y1} Z`, class: "radar__sector" });
      sectorG.appendChild(sec);
      sectors.push(sec);

      const [lx, ly] = pt((a0 + a1) / 2, R + 22);
      const label = mk("text", { x: lx, y: ly + 4, class: "radar__label" });
      label.textContent = it.dataset.short;
      labelG.appendChild(label);

      const tools = it.dataset.tools.split(",").map((t) => t.trim());
      tools.forEach((t, k) => {
        // stagger across three angular lanes and rising radius so labels don't collide
        const span = a1 - a0;
        const a = a0 + span * [0.2, 0.5, 0.8][k % 3];
        const r = 48 + k * (96 / Math.max(tools.length - 1, 1));
        const [bx, by] = pt(a, r);
        const g = mk("g", { class: "radar__blip", transform: `translate(${bx.toFixed(1)} ${by.toFixed(1)})` });
        g.appendChild(mk("circle", { r: 3.2 }));
        g.appendChild(mk("circle", { r: 8, class: "radar__halo" }));
        const tip = mk("title", {});
        tip.textContent = t;
        g.appendChild(tip);
        blipG.appendChild(g);
        blips.push({ g, a, i, k, chip: null });
      });

      const activate = () => { setActive(i); lastUser = performance.now(); };
      it.addEventListener("mouseenter", activate);
      it.addEventListener("focus", activate);
      it.addEventListener("click", activate);
      sec.addEventListener("mouseenter", activate);
      sec.addEventListener("click", activate);
    });

    const detailHtml = (i) => {
      const it = items[i];
      const tools = it.dataset.tools.split(",").map((t, k) => `<span data-k="${k}">${escapeHtml(t.trim())}</span>`).join("");
      return `
        <p class="radar__kicker mono">${String(i + 1).padStart(2, "0")} / ${String(n).padStart(2, "0")} · ${escapeHtml(it.dataset.short)}</p>
        <h3>${escapeHtml($(".radar__name", it).textContent)}</h3>
        <p class="radar__desc-out">${escapeHtml($(".radar__desc", it).textContent)}</p>
        <div class="chips radar__chips">${tools}</div>`;
    };
    // the panel keeps the height of its longest domain, so switching never shifts the section
    const fitDetail = () => {
      const probe = detail.cloneNode(false);
      probe.id = "";
      probe.className = "radar__detail";
      Object.assign(probe.style, { position: "absolute", visibility: "hidden", pointerEvents: "none", minHeight: "0", width: detail.offsetWidth + "px", left: "0", top: "0", transition: "none" });
      detail.parentElement.appendChild(probe);
      let h = 0;
      items.forEach((_, i) => { probe.innerHTML = detailHtml(i); h = Math.max(h, probe.offsetHeight); });
      detail.parentElement.removeChild(probe);
      detail.style.minHeight = h ? Math.ceil(h) + "px" : "";
    };
    let fitRaf = 0;
    const refit = () => { cancelAnimationFrame(fitRaf); fitRaf = requestAnimationFrame(fitDetail); };
    window.addEventListener("resize", refit);
    if (document.fonts) document.fonts.ready.then(refit);

    let active = -1;
    let lastUser = -Infinity;
    function setActive(i, force) {
      if (i === active && !force) return;
      active = i;
      const it = items[i];
      items.forEach((x, k) => x.setAttribute("aria-pressed", k === i));
      sectors.forEach((s, k) => s.classList.toggle("active", k === i));
      blips.forEach((b) => b.g.classList.toggle("active", b.i === i));
      const a0 = (i * 360) / n + 2;
      const a1 = ((i + 1) * 360) / n - 2;
      const [x0, y0] = pt(a0, R + 6);
      const [x1, y1] = pt(a1, R + 6);
      arc.setAttribute("d", `M${x0} ${y0} A${R + 6} ${R + 6} 0 0 1 ${x1} ${y1}`);
      detail.innerHTML = detailHtml(i);
      // each chip is wired to its dot: it lights up when the beam passes over it
      const chips = $$(".radar__chips span", detail);
      blips.forEach((b) => { b.chip = b.i === i ? chips[b.k] : null; });
      if (!reduced) {
        detail.animate(
          [{ opacity: 0, transform: "translateY(10px)", filter: "blur(4px)" }, { opacity: 1, transform: "none", filter: "blur(0)" }],
          { duration: 600, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }
        );
      }
    }
    setActive(0);
    fitDetail();
    document.addEventListener("langchange", () => {
      items.forEach((it, i) => { labelG.children[i].textContent = it.dataset.short; });
      const tips = $$("title", blipG);
      items.flatMap((it) => it.dataset.tools.split(",").map((t) => t.trim())).forEach((t, k) => { if (tips[k]) tips[k].textContent = t; });
      setActive(active, true);
      fitDetail();
    });

    // beam rotation + radar persistence on blips
    let sweep = 0;
    let last = performance.now();
    let cycleT = 0;
    let running = false;
    const frame = (now) => {
      if (!running) return;
      const dt = Math.min(now - last, 60);
      last = now;
      sweep = (sweep + dt * 0.09) % 360;
      beam.style.transform = `rotate(${sweep}deg)`;
      for (const b of blips) {
        const diff = (((sweep - b.a) % 360) + 360) % 360;
        const glow = diff < 200 ? Math.pow(1 - diff / 200, 2) : 0;
        b.g.style.setProperty("--glow", glow.toFixed(3));
        if (b.chip) b.chip.style.setProperty("--glow", glow.toFixed(3));
      }
      // auto-cycle through domains unless the visitor is exploring
      cycleT += dt;
      if (now - lastUser > 7000 && cycleT > 4200) {
        cycleT = 0;
        setActive((active + 1) % n);
      }
      requestAnimationFrame(frame);
    };
    if (reduced) {
      blips.forEach((b) => b.g.style.setProperty("--glow", 0.6));
    } else {
      new IntersectionObserver(([e]) => {
        if (e.isIntersecting && !running) { running = true; last = performance.now(); requestAnimationFrame(frame); }
        else if (!e.isIntersecting) running = false;
      }).observe(radar);
    }
  }

  /* =========================================================
     SMOOTH SECTION SCROLLING (desktop, mouse/trackpad)
     One gesture moves one section with an eased glide.
     Tall sections (experience, why me, claim) scroll freely
     inside with inertia, then hand over to the next section.
     ========================================================= */
  (() => {
    const mq = window.matchMedia("(min-width: 1001px) and (hover: hover) and (pointer: fine)");
    if (reduced || !mq.matches) return;
    const root = document.documentElement;
    root.classList.add("smooth-engine");

    let sections = [];
    let maxY = 0;
    function measure() {
      const vh = window.innerHeight;
      maxY = Math.max(root.scrollHeight - vh, 0);
      const els = [$(".hero"), ...$$(".snap, .claim"), $(".footer")];
      sections = els
        .filter(Boolean)
        .map((el, idx) => {
          if (idx === 0) return { start: 0, end: 0 };
          if (el.classList.contains("footer")) return { start: maxY, end: maxY };
          const top = el.getBoundingClientRect().top + window.scrollY;
          const start = Math.min(Math.round(top), maxY);
          const end = Math.min(Math.max(Math.round(top + el.offsetHeight - vh), start), maxY);
          return { start, end };
        })
        .sort((a, b) => a.start - b.start)
        .filter((s, k, arr) => k === 0 || s.start > arr[k - 1].start + 4);
    }
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("load", measure);
    if (document.fonts) document.fonts.ready.then(measure);

    const clampY = (y) => Math.min(Math.max(y, 0), maxY);
    const ease = (t) => (t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2);
    let current = window.scrollY;
    let target = current;
    let written = current;
    let tween = null;
    let jumpLock = false;
    let edgeLock = false;
    let lastWheel = 0;

    function goTo(y, dur) {
      y = Math.round(clampY(y));
      const dist = Math.abs(y - current);
      tween = { from: current, to: y, t0: performance.now(), dur: dur || Math.min(Math.max(700 + dist * 0.25, 900), 1500) };
      target = y;
    }

    const loop = (now) => {
      // the visitor dragged the scrollbar or used find-in-page: follow them
      if (!tween && Math.abs(window.scrollY - written) > 3) {
        current = target = written = window.scrollY;
      }
      if (tween) {
        const p = Math.min((now - tween.t0) / tween.dur, 1);
        current = tween.from + (tween.to - tween.from) * ease(p);
        if (p >= 1) { tween = null; current = target; }
      } else if (Math.abs(target - current) > 0.4) {
        current += (target - current) * 0.1;
      } else {
        current = target;
      }
      if (Math.abs(window.scrollY - current) > 0.4) {
        window.scrollTo(0, current);
        written = window.scrollY;
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);

    function indexAt(y) {
      return sections.findIndex((s) => y >= s.start - 3 && y <= s.end + 3);
    }

    // move by one "step": free scroll inside tall sections, otherwise glide to the neighbour
    function step(dir, amount, fromWheel) {
      const y = tween ? tween.to : target;
      let i = indexAt(y);
      if (i === -1) {
        // somewhere between two snap points (after a scrollbar drag)
        if (dir > 0) { const nx = sections.find((s) => s.start > y); if (nx) goTo(nx.start); }
        else { const pv = [...sections].reverse().find((s) => s.end < y); if (pv) goTo(pv.end); }
        jumpLock = fromWheel;
        return;
      }
      const s = sections[i];
      const tall = s.end - s.start > 4;
      if (tall && ((dir > 0 && y < s.end - 1) || (dir < 0 && y > s.start + 1))) {
        if (tween) return;
        target = Math.round(dir > 0 ? Math.min(y + amount, s.end) : Math.max(y - amount, s.start));
        if (fromWheel && (target === s.end || target === s.start)) edgeLock = true;
        return;
      }
      if (fromWheel && edgeLock) return;
      const nb = sections[i + dir];
      if (!nb) return;
      goTo(dir > 0 ? nb.start : nb.end);
      if (fromWheel) jumpLock = true;
    }

    const blocked = () => body.classList.contains("menu-open") || body.classList.contains("is-loading");

    window.addEventListener(
      "wheel",
      (e) => {
        if (e.ctrlKey || blocked()) return;
        if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
        e.preventDefault();
        const now = performance.now();
        const newGesture = now - lastWheel > 200;
        lastWheel = now;
        if (newGesture && !tween) { jumpLock = false; edgeLock = false; measure(); }
        if (tween || jumpLock) return;
        const d = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? window.innerHeight : 1);
        if (Math.abs(d) < 1) return;
        step(Math.sign(d), Math.abs(d) * 1.15, true);
      },
      { passive: false }
    );

    window.addEventListener("keydown", (e) => {
      if (blocked() || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.target.closest && e.target.closest("input, textarea, select, [contenteditable]")) return;
      const k = e.key;
      if (k === " " && e.target.closest && e.target.closest("button, summary, a")) return;
      let dir = 0;
      if (k === "ArrowDown" || k === "PageDown" || (k === " " && !e.shiftKey)) dir = 1;
      else if (k === "ArrowUp" || k === "PageUp" || (k === " " && e.shiftKey)) dir = -1;
      else if (k === "Home") { e.preventDefault(); goTo(0); return; }
      else if (k === "End") { e.preventDefault(); goTo(maxY); return; }
      if (!dir) return;
      e.preventDefault();
      measure();
      step(dir, k.startsWith("Arrow") ? 140 : window.innerHeight * 0.8, false);
    });

    // in-page links (menu, dots, buttons) glide instead of jumping
    document.addEventListener("click", (e) => {
      const a = e.target.closest && e.target.closest('a[href^="#"]');
      if (!a) return;
      const id = a.getAttribute("href");
      if (id.length < 2) return;
      const el = id === "#top" ? null : document.querySelector(id);
      if (id !== "#top" && !el) return;
      e.preventDefault();
      measure();
      goTo(el ? el.getBoundingClientRect().top + window.scrollY : 0);
    });
  })();

  /* ---------- Portrait: identity scan (ASCII face, scan line, face lock) ---------- */
  (() => {
    const box = $("#portrait");
    const img = box && $("img", box);
    const cv = box && $(".portrait__fx", box);
    if (!box || !img || !cv) return;
    if (reduced) { cv.remove(); return; }
    const ctx = cv.getContext("2d");
    const hud = $$(".portrait__hud span", box);
    let hudText = hud.map((s) => s.textContent);
    const NOISE = "01ABCDEF0123456789#%&$@*+=<>/\\";
    const rnd = (a) => a[(Math.random() * a.length) | 0];
    const RAMP = [" ", " ", ".", ".:", ":-", "=+", "+*1", "7105", "3569", "A4$%", "#8@&"];
    const glyph = (v) => rnd(RAMP[Math.min(RAMP.length - 1, (v * RAMP.length) | 0)]);
    const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
    const clamp = (x) => Math.min(Math.max(x, 0), 1);
    const FACE = { x0: 0.28, y0: 0.12, x1: 0.68, y1: 0.72 };
    const PTS = [[0.47, 0.2], [0.36, 0.37], [0.6, 0.36], [0.39, 0.43], [0.55, 0.42], [0.48, 0.52],
      [0.42, 0.59], [0.55, 0.58], [0.48, 0.6], [0.48, 0.7], [0.3, 0.5], [0.66, 0.5]];
    const EDGES = [[0, 1], [0, 2], [1, 3], [2, 4], [3, 5], [4, 5], [5, 6], [5, 7], [6, 8], [7, 8], [8, 9], [10, 3], [11, 4], [10, 9], [11, 9], [1, 2]];
    let LABEL, SCANLBL;
    const setLabels = () => {
      const fr = document.documentElement.lang === "fr";
      LABEL = fr ? "CORRESP. 99,8 % · ID VÉRIFIÉE" : "MATCH 99.8% · ID VERIFIED";
      SCANLBL = fr ? "ANALYSE BIOMÉTRIQUE" : "BIOMETRIC SCAN";
    };
    setLabels();
    document.addEventListener("langchange", (e) => {
      setLabels();
      hudText = $$(".portrait__hud span", e.detail.doc).map((s) => s.textContent);
      if (box.classList.contains("fx-done")) hud.forEach((s, i) => { s.textContent = hudText[i]; });
    });

    box.classList.add("fx-armed");
    box.style.setProperty("--reveal", "0%");
    const scrambleHud = () => hud.forEach((s, i) => { s.textContent = hudText[i].replace(/[^\s:/.]/g, () => rnd(NOISE)); });
    scrambleHud();

    let W, H, cell, cellH, cols, rows, lum, chars, delay, t0, raf, hudTimer;
    const setup = () => {
      W = box.clientWidth; H = box.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = W * dpr; cv.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cell = Math.max(8, W / 56); cellH = cell * 1.18;
      cols = Math.ceil(W / cell); rows = Math.ceil(H / cellH);
      const off = document.createElement("canvas");
      off.width = cols; off.height = rows;
      const o = off.getContext("2d", { willReadFrequently: true });
      o.drawImage(img, 0, 0, cols, rows);
      const d = o.getImageData(0, 0, cols, rows).data;
      lum = new Float32Array(cols * rows);
      let lo = 1, hi = 0;
      for (let i = 0; i < lum.length; i++) {
        const v = (0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]) / 255;
        lum[i] = v; lo = Math.min(lo, v); hi = Math.max(hi, v);
      }
      for (let i = 0; i < lum.length; i++) lum[i] = Math.pow(clamp((lum[i] - lo) / (hi - lo || 1)), 0.8);
      chars = Array.from(lum, (v) => glyph(v));
      delay = Array.from(lum, (_, i) => (i % cols) / cols * 250 + Math.random() * 550);
    };

    const T_DECODE = 1100, T_SCAN = 1900, T_LOCK = 1900, T_FADE = 700;
    const frame = (now) => {
      const t = now - t0;
      ctx.clearRect(0, 0, W, H);
      const scanP = clamp((t - T_DECODE) / T_SCAN);
      const y = ease(scanP) * (H + 60) - 30;
      box.style.setProperty("--reveal", clamp(y / H) * 100 + "%");
      ctx.globalAlpha = 1;

      // ASCII face (only below the scan line)
      if (scanP < 1) {
        ctx.font = `500 ${cell * 0.92}px "JetBrains Mono", monospace`;
        ctx.textBaseline = "top";
        for (let r = 0; r < rows; r++) {
          const cy = r * cellH;
          if (cy + cellH < y - 34) continue;
          for (let c = 0; c < cols; c++) {
            const i = r * cols + c;
            const on = clamp((t - delay[i]) / 260);
            if (Math.random() < 0.04) chars[i] = on < 1 ? rnd(NOISE) : glyph(lum[i]);
            let a = (0.35 + lum[i] * 0.65) * on;
            if (a < 0.03) continue;
            const band = cy < y;
            if (band) { ctx.fillStyle = "#5dffb0"; a *= clamp((cy - (y - 34)) / 34) * 1.4; }
            else ctx.fillStyle = "#9fc3e6";
            ctx.globalAlpha = Math.min(a, 1);
            ctx.fillText(chars[i], c * cell, cy);
          }
        }
        ctx.globalAlpha = 1;
      }

      // scan line + glitch slices
      if (scanP > 0 && scanP < 1) {
        for (let k = 0; k < 3; k++) {
          const sh = 4 + Math.random() * 10;
          const sy = y - Math.random() * 70;
          if (sy < 0 || sy + sh > H) continue;
          const dx = (Math.random() - 0.5) * 22;
          ctx.globalAlpha = 0.75;
          ctx.drawImage(img, 0, (sy / H) * img.naturalHeight, img.naturalWidth, (sh / H) * img.naturalHeight, dx, sy, W, sh);
        }
        ctx.globalAlpha = 1;
        const g = ctx.createLinearGradient(0, y - 40, 0, y + 2);
        g.addColorStop(0, "rgba(93,255,176,0)");
        g.addColorStop(1, "rgba(93,255,176,0.35)");
        ctx.fillStyle = g; ctx.fillRect(0, y - 40, W, 42);
        ctx.fillStyle = "#d9fff0"; ctx.shadowColor = "#5dffb0"; ctx.shadowBlur = 16;
        ctx.fillRect(0, y, W, 2); ctx.shadowBlur = 0;
        ctx.font = `600 10px "JetBrains Mono", monospace`;
        ctx.fillStyle = "#5dffb0";
        ctx.fillText(`${SCANLBL} ${String(Math.min(100, Math.round(scanP * 100))).padStart(3, "0")}%`, 16, Math.min(Math.max(y + 8, 12), H - 22));
      }

      // face lock: bracket, landmark mesh, label
      const lt = t - T_DECODE - T_SCAN;
      if (lt > 0) {
        const fade = 1 - clamp((lt - T_LOCK) / T_FADE);
        ctx.globalAlpha = fade;
        const k = ease(clamp(lt / 520));
        const x0 = (FACE.x0 * k) * W, y0 = (FACE.y0 * k) * H;
        const x1 = (1 - (1 - FACE.x1) * k) * W, y1 = (1 - (1 - FACE.y1) * k) * H;
        const L = 18;
        ctx.strokeStyle = "#5dffb0"; ctx.lineWidth = 2; ctx.shadowColor = "#5dffb0"; ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.moveTo(x0, y0 + L); ctx.lineTo(x0, y0); ctx.lineTo(x0 + L, y0);
        ctx.moveTo(x1 - L, y0); ctx.lineTo(x1, y0); ctx.lineTo(x1, y0 + L);
        ctx.moveTo(x0, y1 - L); ctx.lineTo(x0, y1); ctx.lineTo(x0 + L, y1);
        ctx.moveTo(x1 - L, y1); ctx.lineTo(x1, y1); ctx.lineTo(x1, y1 - L);
        ctx.stroke(); ctx.shadowBlur = 0;
        const mt = clamp((lt - 450) / 700);
        if (mt > 0) {
          ctx.lineWidth = 1; ctx.strokeStyle = "rgba(93,255,176,0.55)";
          const shown = Math.ceil(EDGES.length * mt);
          ctx.beginPath();
          for (let e = 0; e < shown; e++) {
            const [a, b] = EDGES[e];
            ctx.moveTo(PTS[a][0] * W, PTS[a][1] * H); ctx.lineTo(PTS[b][0] * W, PTS[b][1] * H);
          }
          ctx.stroke();
          ctx.fillStyle = "#d9fff0";
          PTS.slice(0, Math.ceil(PTS.length * mt)).forEach(([px, py]) => { ctx.beginPath(); ctx.arc(px * W, py * H, 2.2, 0, 7); ctx.fill(); });
        }
        if (lt > 900) {
          const n = Math.min(LABEL.length, Math.floor((lt - 900) / 22));
          ctx.font = `600 10.5px "JetBrains Mono", monospace`;
          const txt = LABEL.slice(0, n);
          const tw = ctx.measureText(LABEL).width + 14;
          ctx.fillStyle = "rgba(7,8,10,0.75)"; ctx.fillRect(x0, y0 - 24, tw, 18);
          ctx.fillStyle = "#5dffb0"; ctx.textBaseline = "middle"; ctx.fillText(txt, x0 + 7, y0 - 15);
          ctx.textBaseline = "top";
        }
        ctx.globalAlpha = 1;
        if (fade <= 0) { finish(); return; }
      }
      raf = requestAnimationFrame(frame);
    };

    const decryptHud = () => {
      clearInterval(hudTimer);
      const start = performance.now();
      const tick = () => {
        const p = clamp((performance.now() - start) / 700);
        hud.forEach((s, i) => {
          const full = hudText[i], keep = Math.floor(full.length * p);
          s.textContent = full.slice(0, keep) + full.slice(keep).replace(/[^\s:/.]/g, () => rnd(NOISE));
        });
        if (p < 1) requestAnimationFrame(tick);
      };
      tick();
    };

    function finish() {
      cancelAnimationFrame(raf);
      ctx.clearRect(0, 0, W, H);
      const amb = $(".portrait__scan", box);
      if (amb) { amb.style.animation = "none"; void amb.offsetHeight; amb.style.animation = ""; }
      box.classList.add("fx-done");
      box.classList.remove("fx-armed");
      box.style.removeProperty("--reveal");
      hud.forEach((s, i) => { s.textContent = hudText[i]; });
    }

    const run = async () => {
      try { if (!img.complete) await img.decode(); setup(); }
      catch (e) { finish(); return; }
      hudTimer = setInterval(scrambleHud, 70);
      setTimeout(decryptHud, T_DECODE + T_SCAN + 200);
      t0 = performance.now();
      raf = requestAnimationFrame(frame);
    };

    img.loading = "eager";
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { io.disconnect(); setTimeout(run, 250); }
    }, { threshold: 0.45 });
    io.observe(box);
  })();

  onScroll();
})();
