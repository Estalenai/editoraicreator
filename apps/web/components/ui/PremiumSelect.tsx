"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type PremiumSelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

type PremiumSelectProps = {
  value: string;
  onChange: (nextValue: string) => void;
  options: PremiumSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
  menuClassName?: string;
  ariaLabel?: string;
};

export function PremiumSelect({
  value,
  onChange,
  options,
  placeholder = "Selecionar",
  disabled = false,
  className = "",
  triggerClassName = "",
  menuClassName = "",
  ariaLabel,
}: PremiumSelectProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [renderOnTop, setRenderOnTop] = useState(false);
  const [floatingStyle, setFloatingStyle] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
  } | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const selected = useMemo(() => options.find((option) => option.value === value) || null, [options, value]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    function updateFloatingMenuPosition() {
      if (!rootRef.current || !open) return;
      const rect = rootRef.current.getBoundingClientRect();
      const estimatedHeight = Math.min(260, Math.max(140, options.length * 40 + 20));
      const spaceBelow = window.innerHeight - rect.bottom - 8;
      const spaceAbove = rect.top - 8;
      const shouldRenderOnTop = spaceBelow < Math.min(180, estimatedHeight) && spaceAbove > spaceBelow;
      const maxHeight = Math.max(
        120,
        shouldRenderOnTop ? Math.min(260, spaceAbove - 8) : Math.min(260, spaceBelow - 8)
      );
      const top = shouldRenderOnTop
        ? Math.max(8, rect.top - Math.min(estimatedHeight, maxHeight) - 6)
        : Math.min(window.innerHeight - 8, rect.bottom + 6);
      setRenderOnTop(shouldRenderOnTop);
      setFloatingStyle({
        top,
        left: rect.left,
        width: rect.width,
        maxHeight,
      });
    }

    if (!open) return;

    updateFloatingMenuPosition();
    window.addEventListener("resize", updateFloatingMenuPosition);
    window.addEventListener("scroll", updateFloatingMenuPosition, true);
    return () => {
      window.removeEventListener("resize", updateFloatingMenuPosition);
      window.removeEventListener("scroll", updateFloatingMenuPosition, true);
    };
  }, [open, options.length]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!rootRef.current) return;
      if (rootRef.current.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  return (
    <div ref={rootRef} className={`ea-select ${className}`.trim()}>
      <button
        type="button"
        className={`ea-select-trigger ${triggerClassName}`.trim()}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        data-open={open}
        aria-label={ariaLabel || placeholder}
        onClick={() => {
          if (disabled) return;
          setOpen((prev) => !prev);
        }}
      >
        <span>{selected?.label || placeholder}</span>
        <span className="ea-select-caret" aria-hidden>
          ▾
        </span>
      </button>

      {open && mounted && floatingStyle
        ? createPortal(
            <div
              ref={menuRef}
              className={`ea-select-menu ${menuClassName}`.trim()}
              role="listbox"
              aria-label={ariaLabel || placeholder}
              data-floating="true"
              data-side={renderOnTop ? "top" : "bottom"}
              style={{
                position: "fixed",
                top: floatingStyle.top,
                left: floatingStyle.left,
                width: floatingStyle.width,
                maxHeight: floatingStyle.maxHeight,
              }}
            >
              {options.map((option) => {
                const isActive = option.value === value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    disabled={disabled || option.disabled}
                    data-active={isActive}
                    className="ea-select-option"
                    onClick={() => {
                      if (option.disabled) return;
                      onChange(option.value);
                      setOpen(false);
                    }}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
