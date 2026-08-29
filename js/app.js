gsap.registerPlugin(ScrollTrigger);

/* ============================================================
   Lenis smooth scroll
   ============================================================ */
const lenis = new Lenis({
  duration: 1.2,
  easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
  smoothWheel: true
});
lenis.on("scroll", ScrollTrigger.update);
gsap.ticker.add((time) => lenis.raf(time * 1000));
gsap.ticker.lagSmoothing(0);

/* ============================================================
   Loader — preloads distri.mp4 fully into memory as a Blob.
   Video-scrub (canvas seeking) needs random access into the file via
   HTTP Range requests, which GitHub Pages' CDN does not support (it
   always returns a full 200 response, never 206 Partial Content).
   Fetching the whole file once up front and handing every <video> a
   blob: URL sidesteps that entirely — seeking then happens against
   the in-memory copy, no further network requests involved.
   ============================================================ */
const loader = document.getElementById("loader");
const loaderBar = document.getElementById("loader-bar");
const loaderPercent = document.getElementById("loader-percent");
const heroVideo = document.querySelector(".hero-video");

function updateLoaderUI(pct) {
  loaderBar.style.width = pct + "%";
  loaderPercent.textContent = Math.round(pct) + "%";
}

function finishLoading() {
  updateLoaderUI(100);
  setTimeout(() => {
    loader.classList.add("loader-hidden");
    playIntro();
  }, 350);
}

function applyVideoSrc(url) {
  document.querySelectorAll("video").forEach((v) => {
    v.setAttribute("src", url);
    v.load();
    if (v.autoplay) v.play().catch(() => {});
  });
}

let videoLoadSettled = false;
setTimeout(() => {
  if (!videoLoadSettled) { videoLoadSettled = true; finishLoading(); }
}, 15000); // safety fallback if the fetch stalls on a very slow connection

fetch("distri.mp4")
  .then((response) => {
    const total = parseInt(response.headers.get("Content-Length") || "0", 10);
    if (!response.body || !total) {
      // Streaming progress unavailable — fall back to a plain fetch, still avoids Range entirely.
      updateLoaderUI(60);
      return response.blob();
    }
    const reader = response.body.getReader();
    const chunks = [];
    let loaded = 0;
    function pump() {
      return reader.read().then(({ done, value }) => {
        if (done) return new Blob(chunks, { type: "video/mp4" });
        chunks.push(value);
        loaded += value.length;
        updateLoaderUI(Math.min(96, (loaded / total) * 100));
        return pump();
      });
    }
    return pump();
  })
  .then((blob) => {
    if (videoLoadSettled) return;
    videoLoadSettled = true;
    applyVideoSrc(URL.createObjectURL(blob));
    finishLoading();
  })
  .catch(() => {
    // Network/CORS failure: keep the original <source src="distri.mp4"> already in the
    // markup as a plain-playback fallback (scrubbing just won't be available).
    if (videoLoadSettled) return;
    videoLoadSettled = true;
    finishLoading();
  });

/* ============================================================
   Header scroll state + mobile nav
   ============================================================ */
const header = document.querySelector(".site-header");
window.addEventListener("scroll", () => {
  header.classList.toggle("scrolled", window.scrollY > 40);
});

const burger = document.getElementById("nav-burger");
const navMobile = document.getElementById("nav-mobile");
const navBackdrop = document.getElementById("nav-backdrop");
const navMobileItems = navMobile.querySelectorAll(
  ".nav-mobile-item, .nav-mobile-cta, .nav-mobile-contact, .nav-mobile-socials"
);

function openMobileNav() {
  burger.classList.add("open");
  navMobile.classList.add("open");
  navBackdrop.classList.add("open");
  navMobile.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  gsap.fromTo(
    navMobileItems,
    { opacity: 0, x: 24 },
    { opacity: 1, x: 0, duration: 0.6, stagger: 0.08, ease: "power3.out", delay: 0.15 }
  );
}

function closeMobileNav() {
  burger.classList.remove("open");
  navMobile.classList.remove("open");
  navBackdrop.classList.remove("open");
  navMobile.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
  gsap.set(navMobileItems, { opacity: 0, x: 24 });
}

burger.addEventListener("click", () => {
  if (navMobile.classList.contains("open")) closeMobileNav();
  else openMobileNav();
});
navBackdrop.addEventListener("click", closeMobileNav);
navMobile.querySelectorAll("a").forEach((a) =>
  a.addEventListener("click", closeMobileNav)
);

navMobile.querySelectorAll(".nav-mobile-chevron").forEach((btn) => {
  btn.addEventListener("click", () => {
    const submenu = btn.closest(".nav-mobile-row").nextElementSibling;
    const isOpen = btn.getAttribute("aria-expanded") === "true";
    btn.setAttribute("aria-expanded", String(!isOpen));
    submenu.classList.toggle("open", !isOpen);
  });
});

/* ============================================================
   Section scroll targets — midpoint of each section's data-enter/data-leave,
   so a nav click lands where the section is fully visible and centered
   (not at its "enter" edge, where it's still fading in / off-position).
   ============================================================ */
const SECTION_TARGETS = {
  hero: 0,
  produit: 11.5,
  marches: 27.5,
  pourquoi: 44.5,
  comment: 61.5,
  modeles: 78.5,
  distributeur: 92.5,
  contact: 99.2
};

document.querySelectorAll("[data-target]").forEach((el) => {
  el.addEventListener("click", (e) => {
    e.preventDefault();
    const key = el.dataset.target;
    if (key === "hero") {
      lenis.scrollTo(0, { duration: 1.4 });
      return;
    }
    const container = document.getElementById("scroll-container");
    const pct = SECTION_TARGETS[key] / 100;
    // Scroll progress spans [containerTop, containerTop + containerHeight - viewportHeight]
    // (ScrollTrigger's "end: bottom bottom" stops one viewport short of the container's own height),
    // so the target scrollY must use that same shorter range — not the full container height.
    const scrollableRange = container.offsetHeight - window.innerHeight;
    const targetY = container.offsetTop + pct * scrollableRange;
    lenis.scrollTo(targetY, { duration: 1.6, offset: -20 });
  });
});

/* ============================================================
   Hero intro (word stagger)
   ============================================================ */
function playIntro() {
  const tl = gsap.timeline({ delay: 0.15 });
  tl.from(".hero-label", { y: 24, opacity: 0, duration: 0.8, ease: "power3.out" })
    .from(".hero-heading .word", { y: "110%", duration: 1.0, stagger: 0.05, ease: "power4.out" }, "-=0.5")
    .from(".hero-tagline", { y: 20, opacity: 0, duration: 0.8, ease: "power3.out" }, "-=0.5")
    .from(".hero-actions .btn", { y: 20, opacity: 0, duration: 0.7, stagger: 0.1, ease: "power3.out" }, "-=0.5")
    .from(".scroll-indicator", { opacity: 0, duration: 0.8 }, "-=0.4");
}

/* ============================================================
   Canvas video-scrub renderer
   ============================================================ */
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const canvasWrap = document.getElementById("canvas-wrap");
const scrubVideo = document.getElementById("scrub-video");
const IMAGE_SCALE = 0.86;
let videoDuration = 0;
let dpr = Math.min(window.devicePixelRatio || 1, 2);

function resizeCanvas() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
}
resizeCanvas();
window.addEventListener("resize", resizeCanvas);

function captureDuration() {
  if (scrubVideo.duration && !isNaN(scrubVideo.duration)) {
    videoDuration = scrubVideo.duration;
  }
}
if (scrubVideo.readyState >= 1) {
  captureDuration();
} else {
  scrubVideo.addEventListener("loadedmetadata", captureDuration);
}

function drawVideoFrame() {
  const vw = scrubVideo.videoWidth, vh = scrubVideo.videoHeight;
  if (!vw || !vh) return;
  const cw = canvas.width, ch = canvas.height;

  const grad = ctx.createRadialGradient(cw / 2, ch * 0.42, ch * 0.1, cw / 2, ch * 0.42, ch * 0.85);
  grad.addColorStop(0, "#0f213f");
  grad.addColorStop(1, "#060f20");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, cw, ch);

  const scale = Math.max(cw / vw, ch / vh) * IMAGE_SCALE;
  const dw = vw * scale, dh = vh * scale;
  const dx = (cw - dw) / 2, dy = (ch - dh) / 2;
  ctx.drawImage(scrubVideo, dx, dy, dw, dh);
}

let seekBusy = false;
let pendingTime = null;
function seekTo(t) {
  if (seekBusy) { pendingTime = t; return; }
  seekBusy = true;
  try { scrubVideo.currentTime = t; } catch (e) { seekBusy = false; }
}
scrubVideo.addEventListener("seeked", () => {
  drawVideoFrame();
  seekBusy = false;
  if (pendingTime !== null) {
    const t = pendingTime;
    pendingTime = null;
    seekTo(t);
  }
});

const FRAME_SPEED = 1.8;
ScrollTrigger.create({
  trigger: "#scroll-container",
  start: "top top",
  end: "bottom bottom",
  scrub: true,
  onUpdate: (self) => {
    if (!videoDuration) return;
    const accelerated = Math.min(self.progress * FRAME_SPEED, 1);
    seekTo(accelerated * videoDuration);
  }
});

/* Circle-wipe hero reveal */
const heroSection = document.querySelector(".hero-standalone");
ScrollTrigger.create({
  trigger: "#scroll-container",
  start: "top top",
  end: "bottom bottom",
  scrub: true,
  onUpdate: (self) => {
    const p = self.progress;
    heroSection.style.opacity = Math.max(0, 1 - p * 15);
    heroSection.style.pointerEvents = p > 0.06 ? "none" : "auto";
    const wipeProgress = Math.min(1, Math.max(0, (p - 0.005) / 0.05));
    const radius = wipeProgress * 78;
    canvasWrap.style.clipPath = `circle(${radius}% at 50% 42%)`;
  }
});

/* ============================================================
   Dark overlay (stats section)
   ============================================================ */
function initDarkOverlay(overlayEl, enter, leave, maxOpacity) {
  const fadeRange = 0.035;
  ScrollTrigger.create({
    trigger: "#scroll-container",
    start: "top top",
    end: "bottom bottom",
    scrub: true,
    onUpdate: (self) => {
      const p = self.progress;
      let opacity = 0;
      if (p >= enter - fadeRange && p <= enter) opacity = (p - (enter - fadeRange)) / fadeRange;
      else if (p > enter && p < leave) opacity = 1;
      else if (p >= leave && p <= leave + fadeRange) opacity = 1 - (p - leave) / fadeRange;
      overlayEl.style.opacity = Math.max(0, Math.min(maxOpacity, opacity * maxOpacity));
    }
  });
}
initDarkOverlay(document.getElementById("dark-overlay"), 0.38, 0.51, 0.9);
initDarkOverlay(document.getElementById("dark-overlay-soft"), 0.21, 0.34, 1);
initDarkOverlay(document.getElementById("dark-overlay-soft-2"), 0.55, 0.68, 1);

/* ============================================================
   Marquee
   ============================================================ */
document.querySelectorAll(".marquee-wrap").forEach((el) => {
  const marqueeText = el.querySelector(".marquee-text");
  gsap.set(marqueeText, { xPercent: 0 });
  gsap.to(marqueeText, {
    xPercent: -50,
    ease: "none",
    duration: 16,
    repeat: -1
  });

  ScrollTrigger.create({
    trigger: "#scroll-container",
    start: "top top",
    end: "bottom bottom",
    scrub: true,
    onUpdate: (self) => {
      const p = self.progress;
      const enter = 0.175, peak1 = 0.183, peak2 = 0.192, leave = 0.20;
      let o = 0;
      if (p >= enter && p < peak1) o = (p - enter) / (peak1 - enter);
      else if (p >= peak1 && p <= peak2) o = 1;
      else if (p > peak2 && p <= leave) o = 1 - (p - peak2) / (leave - peak2);
      el.style.opacity = Math.max(0, Math.min(1, o));
    }
  });
});

/* ============================================================
   Section reveal choreography
   ============================================================ */
const CONTAINER_VH = 1300; // must match #scroll-container height in CSS

// ScrollTrigger's progress (0-1) spans scrollY range [containerTop, containerTop + H - V],
// while CSS `top:%` is relative to the full container height H. Since GSAP's "end: bottom bottom"
// stops the scroll range one viewport-height short of the container's own height, a section's
// `top` must be remapped so its center aligns with the viewport center at the intended progress.
function progressToTopPercent(mid) {
  return mid * (100 - 10000 / CONTAINER_VH) + 5000 / CONTAINER_VH;
}

function setupSectionAnimation(section) {
  const type = section.dataset.animation;
  const persist = section.dataset.persist === "true";
  const enter = parseFloat(section.dataset.enter) / 100;
  const leave = parseFloat(section.dataset.leave) / 100;
  const mid = (enter + leave) / 2;
  section.style.top = `calc(${progressToTopPercent(mid)}% + 24px)`;

  const children = section.querySelectorAll(
    ".section-label, .section-heading, .section-body, .section-note, .product-tags, .product-visual-plaque, .feature-list li, .device-video-frame, .markets-grid .market, .steps-visual, .stats-grid .stat, .stats-note, .lineup-grid .lineup-card, .cta-direct-contact, .cta-button, .contact-form, .btn"
  );

  const tl = gsap.timeline({ paused: true });
  const base = { stagger: 0.12, duration: 0.9, ease: "power3.out" };

  switch (type) {
    case "fade-up":
      tl.from(children, { y: 50, opacity: 0, ...base });
      break;
    case "slide-left":
      tl.from(children, { x: -70, opacity: 0, ...base, stagger: 0.14 });
      break;
    case "slide-right":
      tl.from(children, { x: 70, opacity: 0, ...base, stagger: 0.14 });
      break;
    case "scale-up":
      tl.from(children, { scale: 0.88, opacity: 0, stagger: 0.12, duration: 1.0, ease: "power2.out" });
      break;
    case "stagger-up":
      tl.from(children, { y: 55, opacity: 0, stagger: 0.1, duration: 0.8, ease: "power3.out" });
      break;
    case "clip-reveal":
      tl.from(children, { clipPath: "inset(100% 0 0 0)", opacity: 0, stagger: 0.13, duration: 1.1, ease: "power4.inOut" });
      break;
    default:
      tl.from(children, { y: 40, opacity: 0, ...base });
  }

  let entered = false;
  ScrollTrigger.create({
    trigger: "#scroll-container",
    start: "top top",
    end: "bottom bottom",
    scrub: true,
    onUpdate: (self) => {
      const p = self.progress;
      const fadeIn = 0.02;
      const fadeOut = 0.02;

      if (p < enter) {
        section.style.visibility = "hidden";
        if (entered && !persist) entered = false;
        return;
      }
      if (persist && p >= leave) {
        section.style.visibility = "visible";
        section.style.opacity = 1;
        if (!entered) { tl.progress(1); entered = true; }
        return;
      }
      section.style.visibility = "visible";

      if (p >= enter && p < enter + fadeIn) {
        section.style.opacity = (p - enter) / fadeIn;
      } else if (p >= enter + fadeIn && p <= leave - fadeOut) {
        section.style.opacity = 1;
      } else if (p > leave - fadeOut && p <= leave) {
        section.style.opacity = persist ? 1 : 1 - (p - (leave - fadeOut)) / fadeOut;
      } else {
        section.style.opacity = persist ? 1 : 0;
      }

      const tlProgress = Math.max(0, Math.min(1, (p - enter) / Math.min(0.08, (leave - enter) * 0.4)));
      tl.progress(tlProgress);
      entered = true;
    }
  });
}

document.querySelectorAll(".scroll-section").forEach(setupSectionAnimation);

/* ============================================================
   Stats counters
   ============================================================ */
document.querySelectorAll(".stat-number").forEach((el) => {
  const target = parseFloat(el.dataset.value);
  const decimals = parseInt(el.dataset.decimals || "0", 10);
  ScrollTrigger.create({
    trigger: "#scroll-container",
    start: "top top",
    end: "bottom bottom",
    scrub: true,
    onUpdate: (self) => {
      const p = self.progress;
      if (p >= 0.38 && p <= 0.45) {
        const local = Math.max(0, Math.min(1, (p - 0.38) / 0.07));
        const val = target * local;
        el.textContent = decimals ? val.toFixed(decimals) : Math.round(val).toString();
      } else if (p > 0.45) {
        el.textContent = decimals ? target.toFixed(decimals) : target.toString();
      } else {
        el.textContent = decimals ? (0).toFixed(decimals) : "0";
      }
    }
  });
});

/* ============================================================
   Contact form
   ============================================================ */
const form = document.getElementById("contact-form");
const formSuccess = document.getElementById("form-success");
form.addEventListener("submit", (e) => {
  e.preventDefault();
  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }
  form.classList.add("hidden");
  formSuccess.classList.add("visible");
});

/* ============================================================
   Footer persist visibility
   ============================================================ */
ScrollTrigger.create({
  trigger: "#scroll-container",
  start: "top top",
  end: "bottom bottom",
  scrub: true,
  onUpdate: (self) => {
    document.querySelector(".site-footer").style.opacity = self.progress > 0.96 ? 1 : 0.0001;
  }
});
