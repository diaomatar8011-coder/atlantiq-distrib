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
  // Paint the canvas as soon as the scrub video has its first frame decoded, rather than
  // waiting for the first scroll-triggered seek — otherwise, if the user scrolls into the
  // circle-wipe reveal before that first seek completes (a real decode, can take a moment
  // on a fresh video element), the canvas is empty and only the navy fallback shows through.
  const scrubEl = document.getElementById("scrub-video");
  if (scrubEl) {
    if (scrubEl.readyState >= 2) {
      drawVideoFrame();
    } else {
      scrubEl.addEventListener("loadeddata", () => drawVideoFrame(), { once: true });
    }
  }
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
  // The fixed header sits above the mobile panel in z-index (so the burger, which
  // toggles to a close "X", stays clickable through it). At the top of the page
  // the header's own <nav> — its now-taller unscrolled brand row included — spans
  // an invisible area that would otherwise sit on top of the first couple of menu
  // items and silently swallow taps meant for them. Disable pointer-events on
  // everything in the header except the burger itself while the panel is open.
  header.classList.add("mobile-nav-open");
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
  header.classList.remove("mobile-nav-open");
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
    if (!isOpen) {
      // Wait for the grid-template-rows expand transition (0.4s) to finish
      // so the submenu's final height is what gets scrolled into view,
      // instead of scrolling to where it'll be mid-animation.
      setTimeout(() => {
        submenu.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }, 420);
    }
  });
});

/* ============================================================
   Nav click targets — read the section's own actual rendered position
   (getBoundingClientRect) rather than recomputing the enter/leave/mid
   math a second time here. Sections are positioned in three different
   ways depending on device and persist state (see setupSectionAnimation
   below); reading the live layout instead of duplicating that logic
   means this can never drift out of sync with however a section is
   actually placed, on any viewport, visible or not (visibility:hidden
   elements keep their geometry — only display:none would break this).
   ============================================================ */
document.querySelectorAll("[data-target]").forEach((el) => {
  el.addEventListener("click", (e) => {
    e.preventDefault();
    const key = el.dataset.target;
    if (key === "hero") {
      lenis.scrollTo(0, { duration: 1.4 });
      return;
    }
    const targetSection = document.getElementById(key);
    if (!targetSection) return;
    const targetY = window.scrollY + targetSection.getBoundingClientRect().top - HEADER_CLEARANCE;
    lenis.scrollTo(targetY, { duration: 1.6 });
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
   Section reveal choreography
   ============================================================ */
const CONTAINER_VH = 1300; // must match #scroll-container height in CSS
const FADE_IN = 0.02;
const FADE_OUT = 0.02;
const HEADER_CLEARANCE = 108; // clears the fixed header in both its scrolled/unscrolled heights

// ScrollTrigger's progress (0-1) spans scrollY range [containerTop, containerTop + H - V],
// while CSS `top:%` is relative to the full container height H. Since GSAP's "end: bottom bottom"
// stops the scroll range one viewport-height short of the container's own height, a section's
// `top` must be remapped so a chosen anchor point (align: 0 = its own top edge, 0.5 = its
// center, matched by translateY) lines up with that same point in the viewport at the given
// scroll progress.
function progressToTopPercent(progress, align = 0.5) {
  const k = 10000 / CONTAINER_VH;
  return progress * (100 - k) + k * align;
}

function setupSectionAnimation(section) {
  const type = section.dataset.animation;
  const persist = section.dataset.persist === "true";
  let enter = parseFloat(section.dataset.enter) / 100;
  let leave = parseFloat(section.dataset.leave) / 100;
  const isMobile = window.innerWidth <= 768;

  if (persist) {
    // Persistent CTA content can run taller than the viewport (stacked mobile
    // form fields especially, or a multi-step form with a lot in one step) —
    // anchor it to the bottom of the scroll range by its own measured height
    // instead of centering it, so scrolling to the end of the page always
    // reveals all the way down to its last element (e.g. the submit button).
    //
    // Content this tall can end up positioned much earlier on the page than the
    // hardcoded data-enter percentage assumes (a short form near data-enter="97"
    // vs. a tall one whose bottom-anchored top actually lands around 85%) — if
    // the opacity/visibility logic below kept using the static data-enter, the
    // section would already be scrolled into view while still invisible. So its
    // real fade-in threshold is derived from the same pixel math as its position,
    // recomputed by positionPersistSection() whenever that height changes
    // (resize, or switching quote-form steps) via section._dynEnter.
    positionPersistSection(section);
    enter = section._dynEnter;
    leave = 1;
  } else if (isMobile) {
    // Mobile layouts stack content into columns taller than the viewport, so
    // centering it around a midpoint would push its top half off-screen. Anchor
    // by top-of-section at "enter + FADE_IN" instead: that's the point it has
    // just finished fading in, so it lands fully opaque AND at the top of the
    // viewport, then the rest scrolls past normally, top to bottom.
    const topProgress = enter + FADE_IN;
    section.style.top = `calc(${progressToTopPercent(topProgress, 0)}% + ${HEADER_CLEARANCE}px)`;
    section.style.transform = "translateY(0)";

    // The hand-tuned data-leave values were set with desktop's compact multi-column
    // layouts in mind. Stacked mobile content (e.g. a 3-card grid collapsing into 3
    // full-width cards) can need much more scroll distance to fully reveal than that
    // window allows — the fade-out would then start while the bottom of the section
    // (its last card, say) is still on screen, making it flash past unread. Extend
    // leave to cover the section's real rendered height, capped just short of the
    // next section's own entrance so the two are never both visible at once.
    const container = section.parentElement;
    const scrollableRange = container.offsetHeight - window.innerHeight;
    if (scrollableRange > 0) {
      const neededLeave = topProgress + section.offsetHeight / scrollableRange + FADE_OUT;
      const next = section.nextElementSibling;
      const nextEnter = next && next.classList.contains("scroll-section")
        ? parseFloat(next.dataset.enter) / 100
        : 1;
      leave = Math.min(Math.max(leave, neededLeave), nextEnter - 0.005);
    }
  } else {
    section.style.top = `calc(${progressToTopPercent((enter + leave) / 2, 0.5)}% + 24px)`;
  }

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
      const fadeIn = FADE_IN;
      const fadeOut = FADE_OUT;
      // Persist sections re-measure their fade-in threshold whenever their height changes
      // (positionPersistSection updates section._dynEnter) — read it live rather than the
      // value captured in this closure at initial setup, which would go stale.
      const liveEnter = persist ? section._dynEnter : enter;
      const liveLeave = persist ? 1 : leave;

      if (p < liveEnter) {
        section.style.visibility = "hidden";
        if (entered && !persist) entered = false;
        return;
      }
      if (persist && p >= liveLeave) {
        section.style.visibility = "visible";
        section.style.opacity = 1;
        if (!entered) { tl.progress(1); entered = true; }
        return;
      }
      section.style.visibility = "visible";

      if (p >= liveEnter && p < liveEnter + fadeIn) {
        section.style.opacity = (p - liveEnter) / fadeIn;
      } else if (p >= liveEnter + fadeIn && p <= liveLeave - fadeOut) {
        section.style.opacity = 1;
      } else if (p > liveLeave - fadeOut && p <= liveLeave) {
        section.style.opacity = persist ? 1 : 1 - (p - (liveLeave - fadeOut)) / fadeOut;
      } else {
        section.style.opacity = persist ? 1 : 0;
      }

      // Persist sections' enter→leave range spans all the way to the very bottom of the
      // page (liveLeave is always 1) — stretching the entrance stagger across that whole
      // range meant elements late in the stagger order (buttons buried in later quote-form
      // steps, in particular) stayed faded/near-invisible unless the visitor scrolled to
      // the literal last pixel of the page, which most people filling out a form never do.
      // Complete the stagger quickly instead, in the same short window as the section's
      // own fade-in.
      const tlWindow = persist ? FADE_IN : Math.min(0.08, (liveLeave - liveEnter) * 0.4);
      const tlProgress = Math.max(0, Math.min(1, (p - liveEnter) / tlWindow));
      tl.progress(tlProgress);
      entered = true;
    }
  });
}

// Wait for web fonts before measuring the persist section's height (see setupSectionAnimation):
// measuring while text is still rendered in a fallback font under-counts its real height,
// pushing the bottom-anchored position too far down and letting it overflow past the footer
// once the real font swaps in and the content grows taller.
function initSectionAnimations() {
  document.querySelectorAll(".scroll-section").forEach(setupSectionAnimation);
}
if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(initSectionAnimations).catch(initSectionAnimations);
} else {
  initSectionAnimations();
}

// Anchors the persist section to the bottom of the scroll range using its own measured
// height, and derives the scroll progress at which it should start fading in from that
// same pixel math (see the long comment in setupSectionAnimation for why the two must
// stay in sync). Called at initial setup, on viewport resize, and after switching
// quote-form steps — anything that can change the section's rendered height.
function positionPersistSection(section) {
  const container = section.parentElement;
  const bottomPadding = 40;
  const topPx = Math.max(0, container.offsetHeight - section.offsetHeight - bottomPadding);
  section.style.top = topPx + "px";
  section.style.transform = "translateY(0)";

  const scrollableRange = container.offsetHeight - window.innerHeight;
  const rawEnter = scrollableRange > 0 ? topPx / scrollableRange : 0.9;
  // Nav clicks (and the natural resting scroll) land with the section's top at
  // HEADER_CLEARANCE px, not at the very top of the viewport (progress 0 there) — so the
  // progress actually reached is rawEnter minus that offset's share of the scroll range.
  // The fade-in must fully complete (dynEnter + FADE_IN) at or before that point, or
  // landing there shows the section mid-fade instead of fully opaque.
  const headerClearanceProgress = scrollableRange > 0 ? HEADER_CLEARANCE / scrollableRange : 0;
  section._dynEnter = Math.max(0, Math.min(0.96, rawEnter - headerClearanceProgress - FADE_IN - 0.005));
}

function repositionPersistSection() {
  const persistSection = document.querySelector('.scroll-section[data-persist="true"]');
  if (!persistSection) return;
  positionPersistSection(persistSection);
  // _dynEnter just changed but the scroll-linked opacity/stagger animation only
  // re-evaluates on an actual scroll event — without forcing an update here, a
  // step change (or resize) with no scroll in between can leave the form's fade-in
  // timeline stuck mid-progress (or at its pre-entrance state) until the user
  // scrolls again.
  ScrollTrigger.update();
}

let resizeRepositionTimer = null;
window.addEventListener("resize", () => {
  clearTimeout(resizeRepositionTimer);
  resizeRepositionTimer = setTimeout(() => {
    repositionPersistSection();
  }, 200);
});

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
   Quote form — card selection, step navigation, submit
   ============================================================ */
const form = document.getElementById("contact-form");
const formSuccess = document.getElementById("form-success");

if (form) {
  const fieldsets = Array.from(form.querySelectorAll(".quote-fieldset"));
  const stepIndicators = document.querySelectorAll(".quote-step");
  const progressBar = document.getElementById("quote-progress-bar");
  let currentStep = 1;

  // Card groups store their choice in a hidden input so it submits like a normal form
  // field. Type d'établissement stays single-select. Type de distributeur allows several
  // choices (data-multi="true"), except its "Je ne sais pas encore" card (data-exclusive),
  // which clears/is cleared by the others since it doesn't make sense combined with them.
  form.querySelectorAll(".quote-cards").forEach((group) => {
    const name = group.dataset.name;
    const isMulti = group.dataset.multi === "true";
    const hidden = document.createElement("input");
    hidden.type = "hidden";
    hidden.name = name;
    group.appendChild(hidden);

    const syncHidden = () => {
      const values = Array.from(group.querySelectorAll(".quote-card.selected")).map((c) => c.dataset.value);
      hidden.value = values.join(",");
    };

    group.querySelectorAll(".quote-card").forEach((card) => {
      card.addEventListener("click", () => {
        if (!isMulti) {
          group.querySelectorAll(".quote-card").forEach((c) => c.classList.remove("selected"));
          card.classList.add("selected");
        } else if (card.dataset.exclusive === "true") {
          group.querySelectorAll(".quote-card").forEach((c) => c.classList.remove("selected"));
          card.classList.add("selected");
        } else {
          group.querySelectorAll('.quote-card[data-exclusive="true"]').forEach((c) => c.classList.remove("selected"));
          card.classList.toggle("selected");
        }
        syncHidden();
      });
    });
  });

  // Character counter for the free-text project field.
  const messageField = document.getElementById("quote-message");
  const charCountVal = document.getElementById("quote-charcount-val");
  if (messageField && charCountVal) {
    messageField.addEventListener("input", () => {
      charCountVal.textContent = messageField.value.length;
    });
  }

  function updateStepUI() {
    fieldsets.forEach((fs) => {
      const step = parseInt(fs.dataset.fieldset, 10);
      fs.hidden = step !== currentStep;
    });
    stepIndicators.forEach((el) => {
      const step = parseInt(el.dataset.stepIndicator, 10);
      el.classList.toggle("active", step === currentStep);
      el.classList.toggle("done", step < currentStep);
    });
    progressBar.style.width = (currentStep / fieldsets.length) * 100 + "%";
    // The visible fieldset just changed height, so the persist section's bottom-anchor
    // position (measured in real pixels) needs recalculating.
    repositionPersistSection();
  }

  function currentFieldset() {
    return fieldsets.find((fs) => parseInt(fs.dataset.fieldset, 10) === currentStep);
  }

  // A native <button> inside a form defaults to type="submit" unless declared otherwise;
  // every quote-card and nav button is explicitly type="button" in the markup so clicking
  // one never triggers an early, unintended form submission.
  function validateStep(fieldset) {
    const invalid = [];

    fieldset.querySelectorAll(".quote-cards[data-required='true']").forEach((group) => {
      if (!group.querySelector(".quote-card.selected")) invalid.push(group);
    });

    const requiredFields = fieldset.querySelectorAll("input[required], select[required], textarea[required]");
    requiredFields.forEach((field) => {
      if (field.type === "checkbox" ? !field.checked : !field.value.trim()) invalid.push(field);
    });

    if (invalid.length) {
      const first = invalid[0];
      if (first instanceof HTMLElement && "reportValidity" in first) first.reportValidity();
      first.scrollIntoView({ block: "center", behavior: "smooth" });
      if (first.classList && first.classList.contains("quote-cards")) {
        first.classList.add("quote-cards-error");
        setTimeout(() => first.classList.remove("quote-cards-error"), 1200);
      }
      return false;
    }
    return true;
  }

  form.querySelectorAll(".quote-next").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!validateStep(currentFieldset())) return;
      currentStep = Math.min(currentStep + 1, fieldsets.length);
      updateStepUI();
    });
  });

  form.querySelectorAll(".quote-prev").forEach((btn) => {
    btn.addEventListener("click", () => {
      currentStep = Math.max(currentStep - 1, 1);
      updateStepUI();
    });
  });

  const quoteError = document.getElementById("quote-error");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!validateStep(currentFieldset())) return;

    const submitBtn = form.querySelector('button[type="submit"]');
    const originalLabel = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.textContent = "Envoi en cours...";
    quoteError.hidden = true;

    const payload = {};
    new FormData(form).forEach((value, key) => { payload[key] = value; });

    fetch("api/submit-devis.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
      .then((res) => res.json().catch(() => ({ success: false })))
      .then((data) => {
        if (!data.success) throw new Error(data.error || "submit failed");
        form.classList.add("hidden");
        formSuccess.classList.add("visible");
        repositionPersistSection();
      })
      .catch(() => {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalLabel;
        quoteError.hidden = false;
        quoteError.scrollIntoView({ block: "nearest", behavior: "smooth" });
      });
  });
}

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
