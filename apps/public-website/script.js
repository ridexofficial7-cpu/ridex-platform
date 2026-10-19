/* RideX public website configuration. Admin route is configured; store destinations stay blank until approved. */
window.RIDEX_CONFIG = window.RIDEX_CONFIG || {
  adminUrl: "https://myxride.com/admin",
  androidUrl: "",
  iosUrl: ""
};

(() => {
  "use strict";
  const config = window.RIDEX_CONFIG;
  const ACK_KEY = "ridex-test-warning-ack-v1";
  const ACK_TTL_MS = 30 * 24 * 60 * 60 * 1000;

  // Responsive navigation: click, choose a section, or return to desktop width.
  const menu = document.querySelector(".menu-toggle");
  const nav = document.querySelector(".nav");
  const setMenuOpen = open => {
    if (!menu || !nav) return;
    nav.classList.toggle("open", open);
    menu.setAttribute("aria-expanded", String(open));
    menu.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  };
  menu?.addEventListener("click", () => setMenuOpen(menu.getAttribute("aria-expanded") !== "true"));
  document.querySelectorAll(".nav a").forEach(anchor => {
    anchor.addEventListener("click", () => setMenuOpen(false));
  });
  window.addEventListener("resize", () => {
    if (window.innerWidth > 900) setMenuOpen(false);
  }, { passive: true });

  // Smooth reveal for content as it enters the viewport; base content stays visible without IO.
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
  if (!reduceMotion && "IntersectionObserver" in window) {
    const revealTargets = document.querySelectorAll(
      ".impact-item, .section-heading, .service-card, .step-card, .about-copy, .about-feature, .safety-card, .why-banner-inner, .download-layout, .legal-notice-inner"
    );
    if (revealTargets.length) {
      document.body.classList.add("reveal-enabled");
      const revealObserver = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          revealObserver.unobserve(entry.target);
        });
      }, { threshold: 0.1, rootMargin: "0px 0px -30px 0px" });
      revealTargets.forEach(target => {
        target.classList.add("reveal-on-scroll");
        revealObserver.observe(target);
      });
    }
  }

  // Active-section highlighting supports browsers with IntersectionObserver.
  const navLinks = [...document.querySelectorAll(".nav a")];
  const navTargetIds = new Set(navLinks.map(link => link.getAttribute("href")?.slice(1)).filter(Boolean));
  const sections = [...document.querySelectorAll("main section[id]")].filter(section => navTargetIds.has(section.id));
  if ("IntersectionObserver" in window) {
    const sectionObserver = new IntersectionObserver(entries => {
      const visible = entries.filter(entry => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!visible) return;
      navLinks.forEach(link => link.classList.toggle("active", link.getAttribute("href") === `#${visible.target.id}`));
    }, { rootMargin: "-32% 0px -58% 0px", threshold: [0, .2, .45] });
    sections.forEach(section => sectionObserver.observe(section));
  }

  // Only accept absolute HTTPS destinations for production app/admin links.
  const safeHttpsUrl = value => {
    if (typeof value !== "string" || !value.trim()) return "";
    try {
      const parsed = new URL(value.trim());
      if (parsed.protocol !== "https:" || !parsed.hostname || parsed.username || parsed.password) return "";
      return parsed.href;
    } catch {
      return "";
    }
  };
  document.querySelectorAll("[data-ridex-link]").forEach(anchor => {
    const key = anchor.getAttribute("data-ridex-link");
    const url = safeHttpsUrl(config[key]);
    if (url) {
      anchor.href = url;
      anchor.classList.remove("is-unconfigured");
      anchor.removeAttribute("aria-disabled");
      if (anchor.target === "_blank") anchor.rel = "noopener noreferrer";
    } else {
      anchor.href = "#";
      anchor.classList.add("is-unconfigured");
      anchor.setAttribute("aria-disabled", "true");
      anchor.addEventListener("click", event => {
        event.preventDefault();
        window.alert("This RideX link has not been configured yet. Please use the official RideX channels for launch updates.");
      });
    }
  });

  // Test-period notice: require acknowledgment, remember it for 30 days, and trap focus.
  const modal = document.getElementById("ridexWarning");
  const continueButton = document.getElementById("ridexWarningContinue");
  const brand = document.querySelector(".brand");
  const hasValidAcknowledgement = () => {
    try {
      const stored = Number(window.localStorage.getItem(ACK_KEY));
      return Number.isFinite(stored) && stored > 0 && (Date.now() - stored) < ACK_TTL_MS;
    } catch {
      return false;
    }
  };
  const closeModal = () => {
    if (!modal) return;
    modal.hidden = true;
    document.body.classList.remove("warning-open");
    brand?.focus();
    try { window.localStorage.setItem(ACK_KEY, String(Date.now())); } catch { /* Private browsing may block storage. */ }
  };
  if (modal) {
    if (hasValidAcknowledgement()) {
      modal.hidden = true;
    } else {
      document.body.classList.add("warning-open");
      window.setTimeout(() => continueButton?.focus(), 0);
    }
    continueButton?.addEventListener("click", closeModal);
    modal.addEventListener("keydown", event => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        continueButton?.focus();
      }
      if (event.key === "Tab") {
        event.preventDefault();
        continueButton?.focus();
      }
    });
  }
})();
