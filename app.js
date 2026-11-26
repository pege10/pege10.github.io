/* FRONTOPEDIA | nézetváltás, vízszintes görgetés, fal-ábrák, idővonal, galéria, zene */
(() => {
  "use strict";

  const body = document.body;
  const introView = document.getElementById("intro");
  const wallView = document.getElementById("wall");
  const timelineView = document.getElementById("timeline");
  const postersView = document.getElementById("posters");
  const views = { intro: introView, wall: wallView, timeline: timelineView, posters: postersView };
  const titles = {
    intro: "A Fal",
    wall: "A Fal | a fal",
    timeline: "A Fal | Idővonal",
    posters: "A Fal | Plakátok",
  };
  const hashes = { "#fal": "wall", "#idovonal": "timeline", "#plakatok": "posters" };
  const bodyClass = { intro: "is-intro", wall: "is-wall", timeline: "is-timeline", posters: "is-posters" };
  const savedScroll = { intro: 0, wall: 0, timeline: 0, posters: 0 };
  let current = null;
  let wallSeen = false;

  /* ---------------- Nézetek (nyitóoldal, #fal, #idovonal, #plakatok) ---------------- */

  function viewFromHash() {
    return hashes[location.hash] || "intro";
  }

  function showView(name) {
    if (name === current) return;
    if (current) savedScroll[current] = views[current].scrollLeft;
    closeFigure();
    closeLightbox();
    if (current === "intro") pauseVideo();

    Object.entries(views).forEach(([key, el]) => {
      el.hidden = key !== name;
    });
    Object.entries(bodyClass).forEach(([key, cls]) => body.classList.toggle(cls, key === name));
    document.title = titles[name];
    current = name;

    if (name === "intro") layoutIntro();
    if (name === "timeline") layoutTimeline();
    if (name === "posters") layoutPosters();
    views[name].scrollLeft = savedScroll[name];
    fitPlayer();
    if (name === "wall" && !wallSeen && !musicAsk.open) {
      wallSeen = true;
      hintPulse();
    }
  }

  window.addEventListener("hashchange", () => showView(viewFromHash()));

  // ha az aktuális nézet fülére kattintasz, visszaugrik az elejére
  document.querySelectorAll(".tab[data-view]").forEach((tab) => {
    tab.addEventListener("click", (e) => {
      if (tab.dataset.view === current) {
        e.preventDefault();
        smoothScrollTo(views[current], 0);
      }
      tab.blur();
    });
  });

  /* ---------------- Vízszintes görgetés a görgővel ---------------- */

  const scrollers = new Map();

  function scroller(el) {
    if (!scrollers.has(el)) scrollers.set(el, { target: null, raf: 0 });
    return scrollers.get(el);
  }

  function animate(el) {
    const s = scroller(el);
    if (s.raf) return;
    const step = () => {
      const diff = s.target - el.scrollLeft;
      const move = diff * 0.2;
      if (Math.abs(move) < 1) {
        el.scrollLeft = s.target;
        s.target = null;
        s.raf = 0;
        return;
      }
      el.scrollLeft += move;
      s.raf = requestAnimationFrame(step);
    };
    s.raf = requestAnimationFrame(step);
  }

  function smoothScrollTo(el, x) {
    const s = scroller(el);
    s.target = Math.max(0, Math.min(el.scrollWidth - el.clientWidth, x));
    animate(el);
  }

  function enableWheel(el, speed) {
    el.addEventListener(
      "wheel",
      (e) => {
        if (e.ctrlKey || lightboxOpen) return; // csípős nagyítás / nyitott galéria
        // a hosszú ábraszöveg függőlegesen a saját dobozában görög
        if (panel.contains(e.target) && panel.scrollHeight > panel.clientHeight) return;
        // a vízszintes trackpad-mozdulatot és a Shift+görgőt a böngésző intézi
        if (Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return;
        e.preventDefault();
        const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? el.clientWidth : 1;
        const s = scroller(el);
        const from = s.target === null ? el.scrollLeft : s.target;
        smoothScrollTo(el, from + e.deltaY * unit * speed);
      },
      { passive: false }
    );
  }

  enableWheel(introView, 3);
  enableWheel(wallView, 3);
  enableWheel(timelineView, 3);
  enableWheel(postersView, 3);

  /* ---------------- A fal: ábrák kiemelése ---------------- */

  // Rámutatásra az ábra kiemelődik, kattintásra megjelenik a szövege is.
  // A szöveg a falon ül (együtt görög vele), és oda kerül, ahol az ábra
  // egyik darabjába sem lóg bele: ehhez az ábra PNG-jének átlátszóságából
  // készül egy durva rács (CELL x CELL falpixeles cellák).
  const WALL_W = 15000;
  const WALL_H = 4271;
  const CELL = 16;
  const GW = Math.ceil(WALL_W / CELL);
  const GH = Math.ceil(WALL_H / CELL);

  const figures = Array.from(document.querySelectorAll(".figure"));
  const panel = document.getElementById("figure-panel");
  const wallBase = wallView.querySelector(".wall-base");
  const player = document.querySelector(".player");
  const masks = new Map();
  const wallStage = wallView.querySelector(".wall-stage");
  let wallLoaded = false;
  let pulseWaiting = false;

  // Amíg a falkép tölt, a piros töltőképernyő látszik. A képet mi töltjük le
  // (fetch), így tudjuk, hol tart: a nyolcszögek ehhez igazodva, sorban telnek
  // meg fehérrel. A kép dekódolása után a képernyő elhalványul, és megjelennek
  // a kiemelt ábrák.
  const loaderDots = Array.from(wallView.querySelectorAll(".loader-dots i"));
  const WALL_SIZES = [2500, 5000, 8000]; // images/fal_<szélesség>.jpg

  // a letöltés az utolsó előttiig tölti a sort, az utolsó a dekódoláskor telik meg
  function showProgress(p, decoded = false) {
    const steps = loaderDots.length - (decoded ? 0 : 1);
    const n = decoded ? loaderDots.length : Math.min(steps, Math.floor(p * steps + 1e-6));
    loaderDots.forEach((d, i) => d.classList.toggle("is-full", i < n));
  }

  function markWallLoaded() {
    if (wallLoaded) return;
    wallLoaded = true;
    wallStage.classList.add("is-loaded");
    if (pulseWaiting) {
      pulseWaiting = false;
      setTimeout(hintPulse, 700);
    }
  }

  // a fal kb. 352 vh széles: az ehhez (és a kijelző sűrűségéhez) elég kép;
  // retinán is legfeljebb 1,5-szörös, hogy gyorsan betöltsön
  function wallSource() {
    const need = window.innerHeight * 3.52 * Math.min(window.devicePixelRatio || 1, 1.5);
    const w = WALL_SIZES.find((size) => size >= need) || WALL_SIZES[WALL_SIZES.length - 1];
    return `images/fal_${w}.jpg`;
  }

  async function loadWall() {
    const url = wallSource();
    let guess = 0; // ha a szerver nem mondja meg a méretet: lassan, becsülve telik
    let guessTimer = 0;
    try {
      const res = await fetch(url);
      if (!res.ok || !res.body) throw new Error(String(res.status));
      const total = Number(res.headers.get("Content-Length")) || 0;
      if (!total) {
        guessTimer = setInterval(() => {
          guess = Math.min(guess + 1, loaderDots.length - 2);
          showProgress(guess / (loaderDots.length - 1));
        }, 500);
      }
      const reader = res.body.getReader();
      const chunks = [];
      let got = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        got += value.length;
        if (total) showProgress(got / total);
      }
      wallBase.src = URL.createObjectURL(new Blob(chunks, { type: "image/jpeg" }));
    } catch (err) {
      wallBase.src = url; // tartalék: a böngésző tölti be a szokásos módon
    }
    clearInterval(guessTimer);
    showProgress(1);
    try {
      await wallBase.decode();
    } catch (err) {
      /* a kép akkor is megjelenik, ha a dekódolás itt nem sikerült */
    }
    showProgress(1, true);
    // az utolsó nyolcszög megtelését még látni lehessen
    setTimeout(markWallLoaded, current === "wall" ? 450 : 0);
  }

  loadWall();

  let activeFigure = null;
  let locked = false;
  let anchor = null; // a kattintás helye falpixelben, átméretezéskor kell

  function figureBox(fig) {
    const img = fig.querySelector(".cutout");
    const x = parseFloat(fig.style.getPropertyValue("--x"));
    const y = parseFloat(fig.style.getPropertyValue("--y"));
    const w = parseFloat(fig.style.getPropertyValue("--w"));
    const ratio = img.naturalWidth ? img.naturalHeight / img.naturalWidth : img.height / img.width;
    return { img, x, y, w, h: w * ratio };
  }

  function figureMask(fig) {
    if (masks.has(fig)) return masks.get(fig);
    const { img, x, y, w, h } = figureBox(fig);
    const grid = new Uint8Array(GW * GH);
    const c0 = Math.floor(x / CELL);
    const r0 = Math.floor(y / CELL);
    const cw = Math.min(GW, Math.ceil((x + w) / CELL)) - c0;
    const rh = Math.min(GH, Math.ceil((y + h) / CELL)) - r0;
    let fromAlpha = false;
    if (img.complete && img.naturalWidth) {
      try {
        const cv = document.createElement("canvas");
        cv.width = cw;
        cv.height = rh;
        const ctx = cv.getContext("2d", { willReadFrequently: true });
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, (x - c0 * CELL) / CELL, (y - r0 * CELL) / CELL, w / CELL, h / CELL);
        const a = ctx.getImageData(0, 0, cw, rh).data;
        for (let r = 0; r < rh; r++) {
          for (let c = 0; c < cw; c++) {
            if (a[(r * cw + c) * 4 + 3] > 8) grid[(r0 + r) * GW + c0 + c] = 1;
          }
        }
        fromAlpha = true;
      } catch (err) {
        fromAlpha = false;
      }
    }
    if (!fromAlpha) {
      // ha a kép még nem töltött be: az egész befoglaló téglalap foglalt
      for (let r = 0; r < rh; r++) grid.fill(1, (r0 + r) * GW + c0, (r0 + r) * GW + c0 + cw);
      return grid;
    }
    masks.set(fig, grid);
    return grid;
  }

  function block(grid, x0, y0, x1, y1) {
    const c0 = Math.max(0, Math.floor(x0 / CELL));
    const c1 = Math.min(GW, Math.ceil(x1 / CELL));
    const r0 = Math.max(0, Math.floor(y0 / CELL));
    const r1 = Math.min(GH, Math.ceil(y1 / CELL));
    for (let r = r0; r < r1; r++) if (c1 > c0) grid.fill(1, r * GW + c0, r * GW + c1);
  }

  function placePanel(fig, scrollIntoView) {
    const rect = wallBase.getBoundingClientRect();
    const scale = rect.height / WALL_H; // képernyőpixel / falpixel
    if (!scale) return;
    const cellPx = CELL * scale;
    const vh = wallView.clientHeight;
    const vw = wallView.clientWidth;
    const clickX = rect.left + anchor.x * scale;
    const clickY = rect.top + anchor.y * scale;

    // foglalt: az ábra minden darabja, a kattintás helye és a lejátszó
    const grid = figureMask(fig).slice();
    const pad = 30 / scale;
    block(grid, anchor.x - pad, anchor.y - pad, anchor.x + pad, anchor.y + pad);
    const pr = player.getBoundingClientRect();
    block(grid, (pr.left - rect.left) / scale, (pr.top - rect.top) / scale,
      (pr.right - rect.left) / scale, (pr.bottom - rect.top) / scale);

    // összegzett tábla: egy téglalap foglaltsága egy lépésben
    const W1 = GW + 1;
    const sum = new Int32Array(W1 * (GH + 1));
    for (let r = 0; r < GH; r++) {
      let row = 0;
      for (let c = 0; c < GW; c++) {
        row += grid[r * GW + c];
        sum[(r + 1) * W1 + c + 1] = sum[r * W1 + c + 1] + row;
      }
    }
    const filled = (c0, r0, c1, r1) => {
      c0 = Math.max(0, c0); r0 = Math.max(0, r0);
      c1 = Math.min(GW, c1); r1 = Math.min(GH, r1);
      if (c1 <= c0 || r1 <= r0) return 0;
      return sum[r1 * W1 + c1] - sum[r0 * W1 + c1] - sum[r1 * W1 + c0] + sum[r0 * W1 + c0];
    };

    const gap = Math.max(1, Math.round(Math.max(14, vh * 0.02) / cellPx)); // hézag az ábrától
    const topSafe = vh * 0.075; // a felhúzott fülek alatt
    const bottomSafe = vh * 0.035;
    const maxH = vh - topSafe - bottomSafe;
    const rMin = Math.ceil((topSafe - rect.top) / cellPx);
    const rLimit = Math.floor((vh - bottomSafe - rect.top) / cellPx);
    const edge = 12;

    let best = null;
    // három szélesség: a középsőt szeretjük, de a keskeny/széles jobban befér a résekbe
    [[48, 0], [36, 40], [64, 40]].forEach(([vhWidth, penalty]) => {
      const widthPx = Math.min(vh * vhWidth / 100, vw - 2 * edge);
      panel.style.width = `${widthPx}px`;
      panel.style.maxHeight = `${maxH}px`;
      const hPx = panel.offsetHeight;
      const pw = Math.ceil(widthPx / cellPx);
      const ph = Math.ceil(hPx / cellPx);
      for (let r = rMin; r + ph <= rLimit; r++) {
        const y0 = rect.top + r * cellPx;
        const y1 = y0 + ph * cellPx;
        const dy = clickY < y0 ? y0 - clickY : clickY > y1 ? clickY - y1 : 0;
        const cy = (y0 + y1) / 2 - clickY;
        for (let c = 0; c + pw <= GW; c++) {
          const x0 = rect.left + c * cellPx;
          const x1 = x0 + pw * cellPx;
          const overlap = filled(c - gap, r - gap, c + pw + gap, r + ph + gap);
          const outside = Math.max(0, edge - x0) + Math.max(0, x1 - (vw - edge));
          const dx = clickX < x0 ? x0 - clickX : clickX > x1 ? clickX - x1 : 0;
          const cx = (x0 + x1) / 2 - clickX;
          const score = overlap * 1e6 + outside * 40 + Math.hypot(dx, dy) +
            0.25 * Math.hypot(cx, cy) + penalty;
          if (!best || score < best.score) best = { score, c, r, widthPx, x0, x1 };
        }
      }
    });
    if (!best) return;

    panel.style.width = `${best.widthPx}px`;
    panel.style.left = `${(best.c * CELL / WALL_W) * 100}%`;
    panel.style.top = `${(best.r * CELL / WALL_H) * 100}%`;

    // ha a legjobb hely kilóg a képernyőről, odagörgetünk
    if (scrollIntoView) {
      if (best.x1 > vw - edge) smoothScrollTo(wallView, wallView.scrollLeft + best.x1 - (vw - edge));
      else if (best.x0 < edge) smoothScrollTo(wallView, wallView.scrollLeft - (edge - best.x0));
    }
  }

  function highlight(fig) {
    if (activeFigure && activeFigure !== fig) activeFigure.classList.remove("is-active");
    activeFigure = fig;
    fig.classList.add("is-active");
    body.classList.add("figure-open");
  }

  function lockFigure(fig, clientX, clientY) {
    highlight(fig);
    locked = true;
    const rect = wallBase.getBoundingClientRect();
    const scale = rect.height / WALL_H;
    anchor = { x: (clientX - rect.left) / scale, y: (clientY - rect.top) / scale };
    panel.innerHTML = fig.querySelector(".figure-text").innerHTML;
    panel.scrollTop = 0;
    placePanel(fig, true);
    body.classList.add("figure-locked");
  }

  function closeFigure() {
    if (activeFigure) activeFigure.classList.remove("is-active");
    activeFigure = null;
    locked = false;
    anchor = null;
    body.classList.remove("figure-open", "figure-locked");
  }

  figures.forEach((fig) => {
    const hit = fig.querySelector(".hit");
    hit.addEventListener("mouseenter", () => {
      if (!locked) highlight(fig);
    });
    hit.addEventListener("mouseleave", () => {
      if (!locked) closeFigure();
    });
    hit.addEventListener("click", (e) => {
      e.stopPropagation();
      if (locked && activeFigure === fig) {
        closeFigure();
        return;
      }
      lockFigure(fig, e.clientX, e.clientY);
    });
    // a maszk előre elkészül, amint a kép betöltött
    const img = fig.querySelector(".cutout");
    if (img.complete) figureMask(fig);
    else img.addEventListener("load", () => figureMask(fig), { once: true });
  });

  document.addEventListener("click", (e) => {
    if (locked && !panel.contains(e.target)) closeFigure();
  });

  /* ---------------- Előadás mód: kiemelés ki/be ---------------- */

  const shadeToggle = document.getElementById("shade-toggle");
  shadeToggle.addEventListener("click", (e) => {
    e.stopPropagation();
    const off = body.classList.toggle("no-shade");
    shadeToggle.setAttribute("aria-pressed", String(!off));
    body.classList.remove("hint-pulse");
  });

  // egy rövid jelzés, hogy mely ábrák kattinthatók (a zene-kérdés után)
  function hintPulse() {
    if (current !== "wall" || body.classList.contains("no-shade")) return;
    if (!wallLoaded) {
      pulseWaiting = true;
      return;
    }
    body.classList.add("hint-pulse");
    setTimeout(() => body.classList.remove("hint-pulse"), 4600);
  }

  /* ---------------- Idővonal ---------------- */

  const GRID = 54; // egy nyolcszög szélessége a tervben
  const DESIGN_H = 1074; // a terv magassága (a nyolcszög-sor alatti margóval)
  const DOTS_TOP = 900;
  const sizer = timelineView.querySelector(".tl-sizer");
  const canvas = timelineView.querySelector(".tl-canvas");
  const dots = canvas.querySelector(".tl-dots");
  const sections = Array.from(canvas.querySelectorAll(".tl-section"));
  let dotsKey = "";

  function octagon(x) {
    const c = 15.8; // a sarok levágása (szabályos nyolcszög)
    return `M${x + c} 0H${x + GRID - c}L${x + GRID} ${c}V${GRID - c}L${x + GRID - c} ${GRID}H${x + c}L${x} ${GRID - c}V${c}Z`;
  }

  function layoutTimeline() {
    if (timelineView.hidden) return;

    // minden cím a nyolcszög-rácsra kerül, így pontosan egy fehér nyolcszög fölé
    const cols = new Set();
    let right = 0;
    sections.forEach((sec) => {
      const left = parseFloat(getComputedStyle(sec).left) || 0;
      const col = Math.round(left / GRID);
      sec.style.left = `${col * GRID}px`;
      cols.add(col);
      right = Math.max(right, col * GRID + sec.offsetWidth);
    });

    const count = Math.ceil((right + 270) / GRID);
    const width = count * GRID;

    const key = `${count}|${[...cols].join(",")}`;
    if (key !== dotsKey) {
      dotsKey = key;
      let black = "";
      let white = "";
      for (let i = 0; i < count; i++) {
        if (cols.has(i)) white += octagon(i * GRID);
        else black += octagon(i * GRID);
      }
      // a fekete sáv a nyolcszögek közös élei mögött: nincs piros rés közöttük
      dots.setAttribute("width", width);
      dots.setAttribute("height", GRID);
      dots.setAttribute("viewBox", `0 0 ${width} ${GRID}`);
      dots.innerHTML =
        `<rect x="0" y="16.3" width="${width}" height="${GRID - 32.6}" fill="#000"/>` +
        `<path d="${black}" fill="#000"/><path d="${white}" fill="#fff"/>`;
      dots.style.top = `${DOTS_TOP}px`;
    }

    const scale = timelineView.clientHeight / DESIGN_H;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${DESIGN_H}px`;
    canvas.style.transform = `scale(${scale})`;
    sizer.style.width = `${Math.ceil(width * scale)}px`;
  }

  let resizeRaf = 0;
  window.addEventListener("resize", () => {
    cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(() => {
      layoutIntro();
      layoutTimeline();
      layoutPosters();
      fitPlayer();
      if (locked && activeFigure && anchor) placePanel(activeFigure, false);
    });
  });
  canvas.querySelectorAll("img").forEach((img) => {
    if (!img.complete) img.addEventListener("load", layoutTimeline, { once: true });
  });

  /* ---------------- Galéria ---------------- */

  const lightbox = document.getElementById("lightbox");
  const lbImg = lightbox.querySelector(".lb-img");
  const lbTitle = lightbox.querySelector(".lb-title");
  const lbCount = lightbox.querySelector(".lb-count");
  const lbClose = lightbox.querySelector(".lb-close");
  const galleryImgs = Array.from(canvas.querySelectorAll(".image-column img"));
  const timelineGallery = galleryImgs.map((img) => ({
    src: img.getAttribute("src"),
    alt: img.alt,
    title: img.closest(".tl-section").querySelector("h3").textContent.trim(),
  }));
  let gallery = timelineGallery; // az éppen nyitott galéria képei
  let lightboxOpen = false;
  let lbIndex = 0;
  let lastFocus = null;

  // Nagyítás: kattintásra a kép a valódi felbontásában (legalább 2x) látszik,
  // az egér (vagy az ujj) helyzete szerint lehet benne mozogni.
  let lbZoom = 1;

  function panTo(clientX, clientY) {
    const x = Math.min(100, Math.max(0, (clientX / window.innerWidth) * 100));
    const y = Math.min(100, Math.max(0, (clientY / window.innerHeight) * 100));
    lbImg.style.transformOrigin = `${x}% ${y}%`;
  }

  function zoomIn(clientX, clientY) {
    const shown = lbImg.getBoundingClientRect().width || 1;
    lbZoom = Math.min(6, Math.max(2, lbImg.naturalWidth / shown));
    panTo(clientX, clientY);
    lbImg.style.transform = `scale(${lbZoom})`;
    lightbox.classList.add("is-zoomed");
  }

  function zoomOut() {
    lbZoom = 1;
    lbImg.style.transform = "";
    lightbox.classList.remove("is-zoomed");
  }

  lightbox.addEventListener("mousemove", (e) => {
    if (lbZoom > 1) panTo(e.clientX, e.clientY);
  });
  lightbox.addEventListener("touchmove", (e) => {
    if (lbZoom > 1 && e.touches.length === 1) {
      e.preventDefault();
      panTo(e.touches[0].clientX, e.touches[0].clientY);
    }
  }, { passive: false });

  function showImage(i) {
    zoomOut();
    lbIndex = (i + gallery.length) % gallery.length;
    const item = gallery[lbIndex];
    lbImg.classList.add("is-loading");
    lbImg.onload = () => lbImg.classList.remove("is-loading");
    lbImg.src = item.src;
    lbImg.alt = item.alt;
    lbTitle.textContent = item.title;
    lbCount.textContent = `${lbIndex + 1} / ${gallery.length}`;
    // a szomszédos képek előre betöltése
    [lbIndex - 1, lbIndex + 1].forEach((n) => {
      const pre = new Image();
      pre.src = gallery[(n + gallery.length) % gallery.length].src;
    });
  }

  function openLightbox(i, items) {
    gallery = items || timelineGallery;
    lastFocus = document.activeElement;
    lightbox.hidden = false;
    lightboxOpen = true;
    showImage(i);
    requestAnimationFrame(() => lightbox.classList.add("is-open"));
    lbClose.focus({ preventScroll: true });
  }

  function closeLightbox() {
    if (!lightboxOpen) return;
    lightboxOpen = false;
    zoomOut();
    lightbox.classList.remove("is-open");
    lightbox.hidden = true;
    lbImg.removeAttribute("src");
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }

  galleryImgs.forEach((img, i) => {
    img.addEventListener("click", (e) => {
      e.stopPropagation();
      openLightbox(i);
    });
  });
  lightbox.querySelector(".lb-prev").addEventListener("click", (e) => {
    e.stopPropagation();
    showImage(lbIndex - 1);
  });
  lightbox.querySelector(".lb-next").addEventListener("click", (e) => {
    e.stopPropagation();
    showImage(lbIndex + 1);
  });
  lbClose.addEventListener("click", (e) => {
    e.stopPropagation();
    closeLightbox();
  });
  // a képre kattintva nagyít / kicsinyít, a sötét háttérre kattintva bezárul
  lightbox.addEventListener("click", (e) => {
    if (e.target === lbImg) {
      if (lbZoom > 1) zoomOut();
      else zoomIn(e.clientX, e.clientY);
    } else if (lbZoom > 1) zoomOut();
    else closeLightbox();
  });
  lightbox.addEventListener("wheel", (e) => e.preventDefault(), { passive: false });

  // húzás érintőképernyőn
  let touchX = null;
  lightbox.addEventListener("touchstart", (e) => {
    touchX = e.touches[0].clientX;
  }, { passive: true });
  lightbox.addEventListener("touchend", (e) => {
    if (touchX === null || lbZoom > 1) return;
    const dx = e.changedTouches[0].clientX - touchX;
    touchX = null;
    if (Math.abs(dx) > 40) showImage(lbIndex + (dx < 0 ? 1 : -1));
  });

  document.addEventListener("keydown", (e) => {
    if (musicAsk.open) return;
    if (lightboxOpen) {
      if (e.key === "Escape") {
        if (lbZoom > 1) zoomOut();
        else closeLightbox();
      }
      else if (e.key === "ArrowRight") showImage(lbIndex + 1);
      else if (e.key === "ArrowLeft") showImage(lbIndex - 1);
      else if (e.key === "Tab") {
        // a fókusz a galérián belül marad
        const btns = Array.from(lightbox.querySelectorAll("button"));
        const at = btns.indexOf(document.activeElement);
        e.preventDefault();
        btns[(at + (e.shiftKey ? -1 : 1) + btns.length) % btns.length].focus();
      }
      return;
    }
    if (e.key === "Escape") closeFigure();
    if (current === "intro") return;
    const view = views[current];
    if (e.key === "ArrowRight") smoothScrollTo(view, view.scrollLeft + view.clientWidth * 0.4);
    if (e.key === "ArrowLeft") smoothScrollTo(view, view.scrollLeft - view.clientWidth * 0.4);
  });

  /* ---------------- Társadalmi szerződés (a fal közepén) ---------------- */

  const CHARTER = "Társadalmi szerződés az egyetem polgárságával";
  const charterGallery = [
    { src: "images/docs/szerzodes_1.jpg", alt: `${CHARTER}, 1/3`, title: `${CHARTER} | 1/3, a szöveg (a nyomdai fájlból)` },
    { src: "images/docs/szerzodes_2_fal.jpg", alt: `${CHARTER}, 2/3`, title: `${CHARTER} | 2/3, az aláírt lap a falon` },
    { src: "images/docs/szerzodes_3_fal.jpg", alt: `${CHARTER}, 3/3`, title: `${CHARTER} | 3/3, az aláírt lap a falon` },
    { src: "images/docs/szerzodes_fal.jpg", alt: `${CHARTER} a falon`, title: `${CHARTER} | a három lap a falon` },
  ];
  wallView.querySelectorAll(".wall-doc").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      closeFigure();
      openLightbox(Number(btn.dataset.doc), charterGallery);
    });
  });

  /* ---------------- Plakátfal ---------------- */

  // A plakátok a posters.js-ben vannak, időrendben. Két sorban kerülnek a falra:
  // mindig abba a sorba, amelyik éppen rövidebb, így balról jobbra időrendben
  // haladnak. Minden méret vh-ban van, ezért átméretezéskor nem kell újrarakni.
  // A kis elforgatás és elcsúszás plakátonként rögzített (a fájlnévből számolt),
  // így minden betöltéskor ugyanúgy néz ki a fal.
  const posterWall = document.getElementById("poster-wall");
  const POSTERS = Array.isArray(window.POSTERS) ? window.POSTERS : [];
  const MONTHS = ["január", "február", "március", "április", "május", "június",
    "július", "augusztus", "szeptember", "október", "november", "december"];
  const posterGallery = POSTERS.map((p) => ({
    src: p.full || p.src,
    alt: p.title || "Plakát",
    title: `${posterDate(p)}${p.title ? " | " + p.title : ""}`,
  }));
  let postersBuilt = false;

  function formatDate(iso) {
    const [y, m, d] = iso.split("-");
    return `${y}. ${m}. ${d}.`;
  }

  // a Figmából jött plakátoknak nincs pontos dátuma: csak a hónap, "kb."-val
  function posterDate(p) {
    if (!p.approx) return formatDate(p.date);
    const [y, m] = p.date.split("-");
    return `${y}. ${m}. (kb.)`;
  }

  function seeded(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
    return () => {
      h = Math.imul(h ^ (h >>> 15), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      return ((h ^= h >>> 16) >>> 0) / 4294967296;
    };
  }

  function layoutPosters() {
    if (postersBuilt || postersView.hidden) return;
    postersBuilt = true;

    if (!POSTERS.length) {
      posterWall.innerHTML = '<p class="pw-empty">A plakátok hamarosan felkerülnek.</p>';
      return;
    }

    const ROW_TOP = [11, 54]; // a két sor teteje (vh)
    const ROW_H = 39; // egy plakát magassága (vh)
    const START = 24; // a fal eleje (vh)
    const rowX = [START, START];
    let lastMonth = "";
    const frag = document.createDocumentFragment();

    POSTERS.forEach((p, i) => {
      const rnd = seeded(p.src);
      const month = p.date.slice(0, 7);

      // új hónap: mindkét sor kiegyenlítődik, és a falra felkerül a hónap neve
      if (month !== lastMonth) {
        const x = Math.max(rowX[0], rowX[1]) + (lastMonth ? 4 : 0);
        const label = document.createElement("div");
        label.className = "pw-month";
        label.style.left = `${x}vh`;
        const [y, m] = month.split("-");
        label.innerHTML = `<span>${y}</span> ${MONTHS[parseInt(m, 10) - 1]}`;
        frag.appendChild(label);
        rowX[0] = rowX[1] = x + 11;
        lastMonth = month;
      }

      const row = rowX[0] <= rowX[1] ? 0 : 1;
      const h = ROW_H * (0.9 + rnd() * 0.12);
      const w = (h * p.w) / p.h;
      const x = rowX[row] + (rnd() * 2.6 - 0.8);
      const y = ROW_TOP[row] + (ROW_H - h) / 2 + (rnd() * 2.4 - 1.2);
      const rot = rnd() * 3.6 - 1.8;
      rowX[row] = x + w + 1.2 + rnd() * 2;

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "pw-poster" + (rnd() < 0.55 ? " is-taped" : " is-pasted");
      btn.style.cssText = `left:${x}vh;top:${y}vh;width:${w}vh;height:${h}vh;--rot:${rot}deg;`;
      btn.setAttribute("aria-label", `${posterDate(p)} plakát${p.title ? ": " + p.title : ""}`);
      btn.innerHTML =
        `<img src="${p.src}" alt="" width="${p.w}" height="${p.h}" loading="lazy" decoding="async" />` +
        `<span class="pw-tape pw-tape-l" style="--t:${rnd() * 16 - 8}deg"></span>` +
        `<span class="pw-tape pw-tape-r" style="--t:${rnd() * 16 - 8}deg"></span>` +
        `<span class="pw-date">${posterDate(p)}</span>`;
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        openLightbox(i, posterGallery);
      });
      frag.appendChild(btn);
    });

    posterWall.appendChild(frag);
    posterWall.style.width = `${Math.max(rowX[0], rowX[1]) + 24}vh`;
  }

  /* ---------------- Nyitóoldal: hasábok ---------------- */

  // A két szöveg (cikk, esszé) a saját hasábjaiban fut jobbra. Mindkét doboz
  // szélességét a tényleges tördeléshez igazítjuk, különben a túlcsorduló
  // hasábok rácsúsznának a következőre, és nem számítanának a görgetésbe.
  const introBlocks = Array.from(introView.querySelectorAll(".intro-texts > article"));

  function layoutColumns(block) {
    const cs = getComputedStyle(block);
    const colW = parseFloat(cs.columnWidth);
    const gap = parseFloat(cs.columnGap) || 0;
    if (!colW) return;
    block.style.columnCount = "";
    block.style.width = `${colW}px`;
    const left = block.getBoundingClientRect().left;
    let right = left + colW;
    // a szövegsorok helye minden hasábban (Safariban is megbízható)
    const range = document.createRange();
    range.selectNodeContents(block);
    for (const r of range.getClientRects()) right = Math.max(right, r.right);
    const n = Math.max(1, Math.round((right - left + gap) / (colW + gap)));
    block.style.columnCount = String(n);
    block.style.width = `${n * colW + (n - 1) * gap}px`;
  }

  function layoutIntro() {
    if (introView.hidden) return;
    introBlocks.forEach(layoutColumns);
  }

  // a webfont betöltése után újratördelünk (más a betűszélesség)
  if (document.fonts) document.fonts.ready.then(layoutIntro);

  /* ---------------- Zene: Spotify lejátszási lista ---------------- */

  // Saját kis lejátszó; a Spotify lejátszója a képernyőn kívül szól, ezt vezéreljük.
  // Betöltéskor rákérdezünk. Hangot a böngésző csak kattintás után enged,
  // ezért az "Igen" (vagy a lejátszógomb) kattintása indítja a listát.
  const PLAYLIST = "spotify:playlist:5MuA7P10NREc6FB3ZtYOmB";
  const musicAsk = document.getElementById("music-ask");
  const playerBtn = document.getElementById("player-btn");
  const playerTitle = document.getElementById("player-title");
  const playerProgress = document.getElementById("player-progress");
  const titleCache = new Map();
  let spotify = null;
  let everPlayed = false;
  let playing = false;
  let wantMusic = false;
  let shownURI = "";

  function setTitle(text) {
    playerTitle.textContent = text;
    playerTitle.title = text;
  }

  // a lejátszó csak a szám azonosítóját adja, a címet a Spotify oEmbed
  function showTitle(uri) {
    if (!uri || uri === shownURI) return;
    shownURI = uri;
    if (titleCache.has(uri)) {
      setTitle(titleCache.get(uri));
      return;
    }
    const [, type, id] = uri.split(":");
    if (!type || !id) return;
    const url = `https://open.spotify.com/${type}/${id}`;
    fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((j) => {
        if (!j || !j.title) return;
        titleCache.set(uri, j.title);
        if (shownURI === uri) setTitle(j.title);
      })
      .catch(() => {});
  }

  function setPlaying(on) {
    if (on === playing) return;
    playing = on;
    player.classList.toggle("is-playing", on);
    playerBtn.setAttribute("aria-label", on ? "Zene szüneteltetése" : "Zene indítása");
  }

  window.onSpotifyIframeApiReady = (IFrameAPI) => {
    const el = document.getElementById("spotify-embed");
    IFrameAPI.createController(el, { uri: PLAYLIST, width: 300, height: 80 }, (controller) => {
      spotify = controller;
      // a keret nem látszik, ezért ne várjon a "lusta" betöltéssel
      const frame = document.querySelector(".spotify-hidden iframe");
      if (frame) frame.loading = "eager";
      controller.addListener("playback_update", (e) => {
        const d = e.data || {};
        setPlaying(d.isPaused === false);
        if (d.duration > 0) {
          playerProgress.style.width = `${Math.min(100, (100 * d.position) / d.duration)}%`;
        }
        showTitle(d.playingURI);
      });
      if (wantMusic) startMusic();
    });
  };

  showTitle(PLAYLIST); // amíg nem szól: a lista neve

  function startMusic() {
    if (!spotify) {
      wantMusic = true;
      return;
    }
    wantMusic = false;
    if (!everPlayed) {
      everPlayed = true;
      spotify.play(); // a lista elejétől
    } else {
      spotify.resume();
    }
  }

  function stopMusic() {
    wantMusic = false;
    if (spotify && playing) spotify.pause();
  }

  playerBtn.addEventListener("click", () => {
    if (playing) stopMusic();
    else startMusic();
  });

  musicAsk.querySelectorAll("[data-answer]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (btn.dataset.answer === "yes") startMusic();
      musicAsk.close();
    });
  });
  musicAsk.addEventListener("close", () => {
    if (current === "wall" && !wallSeen) {
      wallSeen = true;
      hintPulse();
    }
  });

  /* ---------------- Videó a nyitóoldalon ---------------- */

  // A borítón a site saját lejátszógombja, lejátszás közben saját vezérlősáv
  // (a böngészőé belelógna a levágott sarkokba).
  const introVideo = introView.querySelector("video");
  const introFigure = introView.querySelector(".intro-video");
  const videoFrame = introView.querySelector(".video-frame");
  const vbPlay = videoFrame.querySelector(".vb-play");
  const vbTrack = videoFrame.querySelector(".vb-track");
  const vbFill = videoFrame.querySelector(".vb-fill");
  const vbBuffer = videoFrame.querySelector(".vb-buffer");
  const vbTime = videoFrame.querySelector(".vb-time");
  const vbMute = videoFrame.querySelector(".vb-mute");
  const vbFull = videoFrame.querySelector(".vb-full");

  const clock = (t) => {
    const s = Math.max(0, Math.floor(t || 0));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };

  function toggleVideo() {
    if (introVideo.paused || introVideo.ended) introVideo.play();
    else introVideo.pause();
  }

  function updateVideoBar() {
    const d = introVideo.duration || 0;
    const t = introVideo.currentTime;
    vbFill.style.width = d ? `${(100 * t) / d}%` : "0";
    if (d && introVideo.buffered.length) {
      vbBuffer.style.width = `${(100 * introVideo.buffered.end(introVideo.buffered.length - 1)) / d}%`;
    }
    vbTime.textContent = `${clock(t)} / ${clock(d || 426)}`;
    vbTrack.setAttribute("aria-valuenow", String(Math.round(t)));
    vbTrack.setAttribute("aria-valuetext", vbTime.textContent);
  }
  ["timeupdate", "durationchange", "progress", "seeked"].forEach((ev) =>
    introVideo.addEventListener(ev, updateVideoBar)
  );

  // lejátszás közben a sáv 2,5 mp mozdulatlanság után elbújik
  let barTimer = 0;
  function wakeVideoBar() {
    videoFrame.classList.add("bar-awake");
    clearTimeout(barTimer);
    if (!introVideo.paused) barTimer = setTimeout(() => videoFrame.classList.remove("bar-awake"), 2500);
  }
  videoFrame.addEventListener("pointermove", wakeVideoBar);
  videoFrame.addEventListener("focusin", wakeVideoBar);

  introView.querySelector(".video-play").addEventListener("click", () => {
    introFigure.classList.add("is-started");
    introVideo.play();
    vbPlay.focus({ preventScroll: true });
  });
  introVideo.addEventListener("click", toggleVideo);
  vbPlay.addEventListener("click", toggleVideo);

  // ha elindul a videó, a zene megáll, hogy ne szóljon a kettő egyszerre
  introVideo.addEventListener("play", () => {
    introFigure.classList.add("is-started");
    videoFrame.classList.add("is-playing");
    vbPlay.setAttribute("aria-label", "Szünet");
    stopMusic();
    wakeVideoBar();
  });
  introVideo.addEventListener("pause", () => {
    videoFrame.classList.remove("is-playing");
    vbPlay.setAttribute("aria-label", "Lejátszás");
    wakeVideoBar();
  });

  // tekerés: kattintás vagy húzás a csíkon, illetve nyilak
  function seekTo(clientX) {
    const r = vbTrack.getBoundingClientRect();
    const p = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    if (introVideo.duration) introVideo.currentTime = p * introVideo.duration;
    updateVideoBar();
  }
  vbTrack.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    vbTrack.setPointerCapture(e.pointerId);
    seekTo(e.clientX);
    const move = (ev) => seekTo(ev.clientX);
    const up = () => vbTrack.removeEventListener("pointermove", move);
    vbTrack.addEventListener("pointermove", move);
    vbTrack.addEventListener("pointerup", up, { once: true });
    vbTrack.addEventListener("pointercancel", up, { once: true });
  });
  vbTrack.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const step = e.key === "ArrowRight" ? 5 : -5;
    introVideo.currentTime = Math.max(0, Math.min(introVideo.duration || 0, introVideo.currentTime + step));
  });

  vbMute.addEventListener("click", () => {
    introVideo.muted = !introVideo.muted;
  });
  introVideo.addEventListener("volumechange", () => {
    videoFrame.classList.toggle("is-muted", introVideo.muted);
    vbMute.setAttribute("aria-label", introVideo.muted ? "Hang be" : "Némítás");
  });

  vbFull.addEventListener("click", () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (videoFrame.requestFullscreen) videoFrame.requestFullscreen();
    else if (introVideo.webkitEnterFullscreen) introVideo.webkitEnterFullscreen(); // iPhone
  });

  function pauseVideo() {
    if (!introVideo.paused) introVideo.pause();
  }

  /* ---------------- Lejátszó helye ---------------- */

  // ha a fülsor elérné a jobb felső sarokban ülő lejátszót, az lecsúszik
  const nav = document.querySelector(".site-nav");
  function fitPlayer() {
    const navRight = nav.getBoundingClientRect().right;
    const playerLeft = window.innerWidth - 12 - player.getBoundingClientRect().width;
    body.classList.toggle("player-low", navRight + 16 > playerLeft);
  }

  /* ---------------- Indulás ---------------- */

  if (typeof musicAsk.showModal === "function") musicAsk.showModal();
  showView(viewFromHash());
})();
