"use client";

import { useCallback, useRef, useState } from "react";

type FocusScrollMode = "auto" | "always" | "never";

type FocusOptions = {
  mobileBreakpoint?: number;
};

type ActivateSectionOptions = {
  scroll?: FocusScrollMode;
};

export function useSectionFocus<T extends string>(
  defaultSection: T,
  options?: FocusOptions
) {
  const [activeSection, setActiveSection] = useState<T>(defaultSection);
  const sectionRefs = useRef(new Map<T, HTMLElement | null>());
  const mobileBreakpoint = options?.mobileBreakpoint ?? 960;

  const registerSection = useCallback(
    (section: T) => (node: HTMLElement | null) => {
      if (node) {
        sectionRefs.current.set(section, node);
        return;
      }
      sectionRefs.current.delete(section);
    },
    []
  );

  const focusSection = useCallback(
    (section: T, focusOptions?: ActivateSectionOptions) => {
      setActiveSection(section);

      if (typeof window === "undefined") return;

      const scrollMode = focusOptions?.scroll ?? "auto";
      const shouldScroll =
        scrollMode === "always" ||
        (scrollMode === "auto" && window.innerWidth <= mobileBreakpoint);

      if (!shouldScroll) return;

      requestAnimationFrame(() => {
        sectionRefs.current
          .get(section)
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    },
    [mobileBreakpoint]
  );

  return {
    activeSection,
    setActiveSection,
    registerSection,
    focusSection,
  };
}
