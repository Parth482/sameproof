"use client";

import { Check, ChevronDown } from "lucide-react";
import { createPortal } from "react-dom";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";

export interface ResponsiveSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface ResponsiveSelectProps {
  id: string;
  value: string;
  options: ResponsiveSelectOption[];
  onChange(value: string): void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  ariaLabel?: string;
}

interface MenuPlacement {
  left: number;
  width: number;
  maxHeight: number;
  top?: number;
  bottom?: number;
}

const VIEWPORT_MARGIN = 12;
const MENU_GAP = 8;
const MAX_MENU_HEIGHT = 320;
const PREFERRED_MENU_HEIGHT = 240;

/** Keeps a portalled listbox beside its trigger and inside the visual viewport. */
export function calculateMenuPlacement(
  trigger: Pick<DOMRect, "left" | "right" | "top" | "bottom" | "width">,
  viewportWidth: number,
  viewportHeight: number,
): MenuPlacement {
  const width = Math.min(trigger.width, viewportWidth - VIEWPORT_MARGIN * 2);
  const left = Math.min(
    Math.max(trigger.left, VIEWPORT_MARGIN),
    Math.max(VIEWPORT_MARGIN, viewportWidth - width - VIEWPORT_MARGIN),
  );
  const roomBelow = Math.max(0, viewportHeight - trigger.bottom - VIEWPORT_MARGIN - MENU_GAP);
  const roomAbove = Math.max(0, trigger.top - VIEWPORT_MARGIN - MENU_GAP);
  const opensUp = roomBelow < PREFERRED_MENU_HEIGHT && roomAbove > roomBelow;
  const availableHeight = opensUp ? roomAbove : roomBelow;
  const maxHeight = Math.max(96, Math.min(MAX_MENU_HEIGHT, availableHeight));

  return opensUp
    ? { left, width, maxHeight, bottom: viewportHeight - trigger.top + MENU_GAP }
    : { left, width, maxHeight, top: trigger.bottom + MENU_GAP };
}

export function ResponsiveSelect({
  id,
  value,
  options,
  onChange,
  className = "",
  placeholder = "Select an option",
  disabled = false,
  ariaLabel,
}: ResponsiveSelectProps) {
  const reactId = useId().replaceAll(":", "");
  const listboxId = `${id}-${reactId}-listbox`;
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const typeaheadRef = useRef({ value: "", timer: 0 });
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [placement, setPlacement] = useState<MenuPlacement>();

  const selectedIndex = useMemo(
    () => Math.max(0, options.findIndex((option) => option.value === value)),
    [options, value],
  );
  const selectedOption = options.find((option) => option.value === value);

  const updatePlacement = useCallback(() => {
    const trigger = buttonRef.current?.getBoundingClientRect();
    if (!trigger) return;
    const viewport = window.visualViewport;
    setPlacement(
      calculateMenuPlacement(
        trigger,
        viewport?.width ?? window.innerWidth,
        viewport?.height ?? window.innerHeight,
      ),
    );
  }, []);

  const openMenu = useCallback(
    (index = selectedIndex) => {
      if (disabled || options.length === 0) return;
      setActiveIndex(index);
      setOpen(true);
    },
    [disabled, options.length, selectedIndex],
  );

  const closeMenu = useCallback(() => {
    setOpen(false);
    setPlacement(undefined);
  }, []);

  const choose = useCallback(
    (index: number) => {
      const option = options[index];
      if (!option || option.disabled) return;
      onChange(option.value);
      closeMenu();
      buttonRef.current?.focus();
    },
    [closeMenu, onChange, options],
  );

  const move = useCallback(
    (from: number, direction: 1 | -1) => {
      if (options.length === 0) return from;
      for (let offset = 1; offset <= options.length; offset += 1) {
        const candidate = (from + direction * offset + options.length) % options.length;
        if (!options[candidate]?.disabled) return candidate;
      }
      return from;
    },
    [options],
  );

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        openMenu(selectedIndex);
      } else {
        setActiveIndex((current) => move(current, event.key === "ArrowDown" ? 1 : -1));
      }
      return;
    }
    if (event.key === "Home" && open) {
      event.preventDefault();
      setActiveIndex(move(-1, 1));
      return;
    }
    if (event.key === "End" && open) {
      event.preventDefault();
      setActiveIndex(move(0, -1));
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (open) choose(activeIndex);
      else openMenu();
      return;
    }
    if (event.key === "Escape" && open) {
      event.preventDefault();
      closeMenu();
      return;
    }
    if (event.key === "Tab") {
      closeMenu();
      return;
    }
    if (!event.ctrlKey && !event.metaKey && !event.altKey && event.key.length === 1) {
      window.clearTimeout(typeaheadRef.current.timer);
      const query = `${typeaheadRef.current.value}${event.key}`.toLocaleLowerCase();
      const match = options.findIndex(
        (option) => !option.disabled && option.label.toLocaleLowerCase().startsWith(query),
      );
      typeaheadRef.current = {
        value: query,
        timer: window.setTimeout(() => {
          typeaheadRef.current.value = "";
        }, 700),
      };
      if (match >= 0) {
        event.preventDefault();
        if (!open) openMenu(match);
        else setActiveIndex(match);
      }
    }
  }

  useEffect(() => {
    if (!open) return;
    updatePlacement();
    const handleOutside = (event: PointerEvent) => {
      const node = event.target as Node;
      if (!buttonRef.current?.contains(node) && !menuRef.current?.contains(node)) closeMenu();
    };
    document.addEventListener("pointerdown", handleOutside);
    window.addEventListener("resize", updatePlacement);
    window.addEventListener("scroll", updatePlacement, { passive: true });
    window.visualViewport?.addEventListener("resize", updatePlacement);
    window.visualViewport?.addEventListener("scroll", updatePlacement);
    return () => {
      document.removeEventListener("pointerdown", handleOutside);
      window.removeEventListener("resize", updatePlacement);
      window.removeEventListener("scroll", updatePlacement);
      window.visualViewport?.removeEventListener("resize", updatePlacement);
      window.visualViewport?.removeEventListener("scroll", updatePlacement);
    };
  }, [closeMenu, open, updatePlacement]);

  useEffect(() => {
    if (!open) return;
    document.getElementById(`${listboxId}-option-${activeIndex}`)?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, listboxId, open]);

  useEffect(
    () => () => window.clearTimeout(typeaheadRef.current.timer),
    [],
  );

  const menuStyle: CSSProperties | undefined = placement
    ? {
        left: placement.left,
        width: placement.width,
        maxHeight: placement.maxHeight,
        top: placement.top,
        bottom: placement.bottom,
      }
    : undefined;

  return (
    <>
      <button
        ref={buttonRef}
        id={id}
        type="button"
        role="combobox"
        aria-label={ariaLabel}
        aria-controls={listboxId}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-activedescendant={open ? `${listboxId}-option-${activeIndex}` : undefined}
        disabled={disabled}
        onClick={() => (open ? closeMenu() : openMenu())}
        onKeyDown={handleKeyDown}
        className={`field flex min-w-0 items-center justify-between gap-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-55 ${className}`}
      >
        <span className={`min-w-0 flex-1 whitespace-normal break-words leading-5 ${selectedOption ? "text-slate-950" : "text-slate-500"}`}>
          {selectedOption?.label ?? placeholder}
        </span>
        <ChevronDown
          size={17}
          aria-hidden="true"
          className={`shrink-0 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && placement && typeof document !== "undefined"
        ? createPortal(
            <ul
              ref={menuRef}
              id={listboxId}
              role="listbox"
              aria-labelledby={id}
              style={menuStyle}
              className="fixed z-[100] overflow-x-hidden overflow-y-auto overscroll-contain rounded-xl border border-slate-200 bg-white p-1.5 shadow-2xl shadow-slate-900/20"
            >
              {options.map((option, index) => {
                const selected = option.value === value;
                const active = index === activeIndex;
                return (
                  <li
                    key={option.value}
                    id={`${listboxId}-option-${index}`}
                    role="option"
                    aria-selected={selected}
                    aria-disabled={option.disabled || undefined}
                    onPointerMove={() => !option.disabled && setActiveIndex(index)}
                    onPointerDown={(event) => event.preventDefault()}
                    onClick={() => choose(index)}
                    className={`flex min-h-11 min-w-0 select-none items-start gap-2 rounded-lg px-3 py-2.5 text-sm leading-5 outline-none ${
                      option.disabled
                        ? "cursor-not-allowed text-slate-400"
                        : active
                          ? "cursor-pointer bg-blue-50 text-blue-950"
                          : "cursor-pointer text-slate-800 hover:bg-slate-50"
                    }`}
                  >
                    <span className="min-w-0 flex-1 whitespace-normal break-words">{option.label}</span>
                    <Check
                      size={16}
                      aria-hidden="true"
                      className={`mt-0.5 shrink-0 text-blue-600 ${selected ? "opacity-100" : "opacity-0"}`}
                    />
                  </li>
                );
              })}
            </ul>,
            document.body,
          )
        : null}
    </>
  );
}
