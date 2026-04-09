"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

const REVEAL_THRESHOLD = [0, 0.002, 0.012];
const REVEAL_ROOT_MARGIN = "0px 0px 24% 0px";
const REVEAL_ROOT_MARGIN_COMPACT = "0px 0px 30% 0px";
const REVEAL_DELAY_SCALE = 0.24;
const REVEAL_DELAY_SCALE_COMPACT = 0.14;
const REVEAL_DELAY_CAP_MS = 56;
const REVEAL_DELAY_CAP_MS_COMPACT = 24;
const REVEAL_IMMEDIATE_VIEWPORT_RATIO = 1.14;
const REVEAL_IMMEDIATE_VIEWPORT_RATIO_COMPACT = 1.22;
const COMPACT_VIEWPORT_QUERY = "(max-width: 900px)";
const REVEAL_TIMING_STYLE_ID = "ea-reveal-runtime-timing";

export function MotionRuntime() {
  const pathname = usePathname() || "";

  useEffect(() => {
    if (typeof document === "undefined") return;

    const root = document.documentElement;
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const compactViewport = window.matchMedia(COMPACT_VIEWPORT_QUERY).matches;
    const delayScale = compactViewport ? REVEAL_DELAY_SCALE_COMPACT : REVEAL_DELAY_SCALE;
    const delayCapMs = compactViewport ? REVEAL_DELAY_CAP_MS_COMPACT : REVEAL_DELAY_CAP_MS;
    const immediateViewportRatio = compactViewport
      ? REVEAL_IMMEDIATE_VIEWPORT_RATIO_COMPACT
      : REVEAL_IMMEDIATE_VIEWPORT_RATIO;
    const rootMargin = compactViewport ? REVEAL_ROOT_MARGIN_COMPACT : REVEAL_ROOT_MARGIN;
    const boundElements = new WeakSet<HTMLElement>();
    let timingStyle =
      document.getElementById(REVEAL_TIMING_STYLE_ID) as HTMLStyleElement | null;

    if (!timingStyle) {
      timingStyle = document.createElement("style");
      timingStyle.id = REVEAL_TIMING_STYLE_ID;
      document.head.appendChild(timingStyle);
    }

    root.classList.add("motion-runtime");

    const revealNow = (element: HTMLElement) => {
      element.classList.add("is-visible");
      boundElements.add(element);
    };

    if (prefersReducedMotion) {
      document.querySelectorAll<HTMLElement>("[data-reveal]").forEach(revealNow);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting && entry.intersectionRatio < 0.01) return;
          const element = entry.target as HTMLElement;
          element.classList.add("is-visible");
          observer.unobserve(element);
        });
      },
      { rootMargin, threshold: REVEAL_THRESHOLD }
    );

    const syncRevealTimingRules = () => {
      if (!timingStyle) return;

      const delayValues = new Set<string>();
      const durationValues = new Set<string>();

      document.querySelectorAll<HTMLElement>("[data-reveal]").forEach((element) => {
        const delayValue = String(element.dataset.revealDelay || "").trim();
        const durationValue = String(element.dataset.revealDuration || "").trim();

        if (delayValue) delayValues.add(delayValue);
        if (durationValue) durationValues.add(durationValue);
      });

      const delayRules = [...delayValues]
        .map((value) => {
          const rawDelay = Number(value);
          if (!Number.isFinite(rawDelay)) return "";
          const calibratedDelay = Math.min(Math.round(rawDelay * delayScale), delayCapMs);
          return `.motion-runtime [data-reveal][data-reveal-delay="${value}"] { --reveal-delay: ${calibratedDelay}ms; }`;
        })
        .filter(Boolean);

      const durationRules = [...durationValues]
        .map((value) => {
          const rawDuration = Number(value);
          if (!Number.isFinite(rawDuration)) return "";
          return `.motion-runtime [data-reveal][data-reveal-duration="${value}"] { --reveal-duration: ${rawDuration}ms; }`;
        })
        .filter(Boolean);

      timingStyle.textContent = [...delayRules, ...durationRules].join("\n");
    };

    const bind = () => {
      syncRevealTimingRules();

      document.querySelectorAll<HTMLElement>("[data-reveal]").forEach((element) => {
        if (boundElements.has(element)) return;

        boundElements.add(element);

        const bounds = element.getBoundingClientRect();
        if (bounds.top <= window.innerHeight * immediateViewportRatio) {
          requestAnimationFrame(() => element.classList.add("is-visible"));
          return;
        }

        observer.observe(element);
      });
    };

    const frame = requestAnimationFrame(bind);
    const mutationObserver = new MutationObserver(() => bind());
    mutationObserver.observe(document.body, { childList: true, subtree: true });

    return () => {
      cancelAnimationFrame(frame);
      mutationObserver.disconnect();
      observer.disconnect();
      timingStyle?.remove();
    };
  }, [pathname]);

  return null;
}
