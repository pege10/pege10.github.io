/* FRONTOPEDIA | nézetváltás, vízszintes görgetés, fal-ábrák, idővonal, galéria, zene */
(() => {
  "use strict";

  const body = document.body;
  const wallView = document.getElementById("wall");
  const timelineView = document.getElementById("timeline");
  const views = { wall: wallView, timeline: timelineView };
  const titles = {
    wall: "FRONTOPEDIA - A fal",
    timeline: "FRONTOPEDIA - Idővonal",
  };
  const savedScroll = { wall: 0, timeline: 0 };
  let current = null;

  /* ---------------- Nézetek (#fal, #idovonal) ---------------- */

  function viewFromHash() {
    return location.hash === "#idovonal" ? "timeline" : "wall";
  }

  function showView(name) {
    if (name === current) return;
    if (current) savedScroll[current] = views[current].scrollLeft;
    closeFigure();
    closeLightbox();

    Object.entries(views).forEach(([key, el]) => {
      el.hidden = key !== name;
    });
    body.classList.toggle("is-wall", name === "wall");
    body.classList.toggle("is-timeline", name === "timeline");
    document.title = titles[name];
    current = name;

    if (name === "timeline") layoutTimeline();
    views[name].scrollLeft = savedScroll[name];
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

  enableWheel(wallView, 3);
  enableWheel(timelineView, 3);

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
      layoutTimeline();
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
  const gallery = galleryImgs.map((img) => ({
    src: img.getAttribute("src"),
    alt: img.alt,
    title: img.closest(".tl-section").querySelector("h3").textContent.trim(),
  }));
  let lightboxOpen = false;
  let lbIndex = 0;
  let lastFocus = null;

  function showImage(i) {
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

  function openLightbox(i) {
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
  // a sötét háttérre kattintva bezárul, a képre kattintva a következő jön
  lightbox.addEventListener("click", (e) => {
    if (e.target === lbImg) showImage(lbIndex + 1);
    else closeLightbox();
  });
  lightbox.addEventListener("wheel", (e) => e.preventDefault(), { passive: false });

  // húzás érintőképernyőn
  let touchX = null;
  lightbox.addEventListener("touchstart", (e) => {
    touchX = e.touches[0].clientX;
  }, { passive: true });
  lightbox.addEventListener("touchend", (e) => {
    if (touchX === null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    touchX = null;
    if (Math.abs(dx) > 40) showImage(lbIndex + (dx < 0 ? 1 : -1));
  });

  document.addEventListener("keydown", (e) => {
    if (musicAsk.open) return;
    if (lightboxOpen) {
      if (e.key === "Escape") closeLightbox();
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
    const view = views[current];
    if (e.key === "ArrowRight") smoothScrollTo(view, view.scrollLeft + view.clientWidth * 0.4);
    if (e.key === "ArrowLeft") smoothScrollTo(view, view.scrollLeft - view.clientWidth * 0.4);
  });

  /* ---------------- Zene: Spotify lejátszási lista ---------------- */

  // Betöltéskor rákérdezünk. Hangot a böngésző csak kattintás után enged,
  // ezért az "Igen" kattintása indítja a listát, az elejétől, sorban.
  const PLAYLIST = "spotify:playlist:5MuA7P10NREc6FB3ZtYOmB";
  const musicAsk = document.getElementById("music-ask");
  let spotify = null;
  let musicStarted = false;
  let wantMusic = false;

  window.onSpotifyIframeApiReady = (IFrameAPI) => {
    const el = document.getElementById("spotify-embed");
    IFrameAPI.createController(el, { uri: PLAYLIST, width: "100%", height: 80 }, (controller) => {
      spotify = controller;
      controller.addListener("playback_update", (e) => {
        if (e.data && e.data.isPaused === false) musicStarted = true;
      });
      if (wantMusic) startMusic();
    });
  };

  function startMusic() {
    if (musicStarted) return;
    if (!spotify) {
      wantMusic = true;
      return;
    }
    musicStarted = true;
    spotify.play();
  }

  musicAsk.querySelectorAll("[data-answer]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (btn.dataset.answer === "yes") startMusic();
      musicAsk.close();
    });
  });
  musicAsk.addEventListener("close", hintPulse);

  /* ---------------- Indulás ---------------- */

  showView(viewFromHash());
  if (typeof musicAsk.showModal === "function") musicAsk.showModal();
  else hintPulse();
})();
