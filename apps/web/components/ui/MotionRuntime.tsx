"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

const REVEAL_THRESHOLD = [0, 0.01, 0.04];
const REVEAL_ROOT_MARGIN = "0px 0px 14% 0px";
const REVEAL_DELAY_SCALE = 0.42;
const REVEAL_DELAY_CAP_MS = 96;
const REVEAL_IMMEDIATE_VIEWPORT_RATIO = 1.02;

export function MotionRuntime() {
  const pathname = usePathname();

  useEffect(() => {
    if (typeof document === "undefined") return;

    const root = document.documentElement;
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    root.classList.add("motion-runtime");

    const revealNow = (element: HTMLElement) => {
      element.classList.add("is-visible");
      element.dataset.revealBound = "1";
    };

    if (prefersReducedMotion) {
      document.querySelectorAll<HTMLElement>("[data-reveal]").forEach(revealNow);
      return () => {
        document
          .querySelectorAll<HTMLElement>("[data-reveal-bound='1']")
          .forEach((element) => element.removeAttribute("data-reveal-bound"));
      };
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
      { rootMargin: REVEAL_ROOT_MARGIN, threshold: REVEAL_THRESHOLD }
    );

    const bind = () => {
      document.querySelectorAll<HTMLElement>("[data-reveal]").forEach((element) => {
        if (element.dataset.revealBound === "1") return;

        element.dataset.revealBound = "1";

        if (element.dataset.revealDelay) {
          const rawDelay = Number(element.dataset.revealDelay || 0);
          const calibratedDelay = Number.isFinite(rawDelay)
            ? Math.min(Math.round(rawDelay * REVEAL_DELAY_SCALE), REVEAL_DELAY_CAP_MS)
            : 0;
          element.style.setProperty("--reveal-delay", `${calibratedDelay}ms`);
        }
        if (element.dataset.revealDuration) {
          element.style.setProperty("--reveal-duration", `${element.dataset.revealDuration}ms`);
        }

        const bounds = element.getBoundingClientRect();
        if (bounds.top <= window.innerHeight * REVEAL_IMMEDIATE_VIEWPORT_RATIO) {
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
      document
        .querySelectorAll<HTMLElement>("[data-reveal-bound='1']")
        .forEach((element) => element.removeAttribute("data-reveal-bound"));
    };
  }, [pathname]);

  return null;
}
