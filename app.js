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

  const figures = Array.from(document.querySelectorAll(".figure"));
  const panel = document.getElementById("figure-panel");
  let activeFigure = null;
  let locked = false;

  function openFigure(fig, clientX) {
    if (activeFigure && activeFigure !== fig) activeFigure.classList.remove("is-active");
    activeFigure = fig;
    fig.classList.add("is-active");
    panel.innerHTML = fig.querySelector(".figure-text").innerHTML;
    panel.scrollTop = 0;
    // a szöveg a kurzorral ellentétes oldalra kerül, így nem takarja az ábrát
    const onRight = clientX < window.innerWidth / 2;
    panel.classList.toggle("is-right", onRight);
    panel.classList.toggle("is-left", !onRight);
    body.classList.add("figure-open");
  }

  function closeFigure() {
    if (activeFigure) activeFigure.classList.remove("is-active");
    activeFigure = null;
    locked = false;
    body.classList.remove("figure-open");
  }

  figures.forEach((fig) => {
    const hit = fig.querySelector(".hit");
    hit.addEventListener("mouseenter", (e) => {
      if (!locked) openFigure(fig, e.clientX);
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
      openFigure(fig, e.clientX);
      locked = true;
    });
  });

  document.addEventListener("click", (e) => {
    if (locked && !panel.contains(e.target)) closeFigure();
  });

  // betöltéskor egy rövid jelzés, hogy mely ábrák kattinthatók
  if (viewFromHash() === "wall") {
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
    resizeRaf = requestAnimationFrame(layoutTimeline);
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

  // A böngészők hangot csak a látogató első kattintása után engednek,
  // ezért a lista az első kattintásra / billentyűre indul, elejétől, sorban.
  const PLAYLIST = "spotify:playlist:5MuA7P10NREc6FB3ZtYOmB";
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

  ["pointerdown", "keydown"].forEach((type) =>
    window.addEventListener(type, startMusic, { once: true, capture: true })
  );

  /* ---------------- Indulás ---------------- */

  showView(viewFromHash());
})();
