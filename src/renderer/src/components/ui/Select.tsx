import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { ScrollArea } from "./ScrollArea";

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
  badge?: string;
}

interface SelectProps {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  ariaLabel: string;
  disabled?: boolean;
  compact?: boolean;
}

export function Select({
  value,
  options,
  onChange,
  ariaLabel,
  disabled = false,
  compact = false,
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0, height: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value) ?? options[0];

  const measure = useCallback((): void => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const rowHeight = compact ? 38 : 64;
    const menuHeight = Math.min(340, options.length * rowHeight + 12);
    const spaceBelow = window.innerHeight - rect.bottom - 12;
    const top = spaceBelow >= menuHeight
      ? rect.bottom + 8
      : Math.max(52, rect.top - menuHeight - 8);
    setPosition({
      top,
      left: Math.max(12, Math.min(rect.left, window.innerWidth - rect.width - 12)),
      width: rect.width,
      height: menuHeight,
    });
  }, [compact, options.length]);

  const openMenu = (): void => {
    setActiveIndex(Math.max(0, options.findIndex((option) => option.value === value)));
    setOpen(true);
  };

  useLayoutEffect(() => {
    if (!open) return;
    measure();
  }, [measure, open]);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent): void => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !listRef.current?.contains(target)) setOpen(false);
    };
    const reposition = (): void => measure();
    window.addEventListener("pointerdown", close);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [measure, open]);

  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector<HTMLElement>(`#orbit-select-option-${activeIndex}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  const choose = (index: number): void => {
    const option = options[index];
    if (!option) return;
    onChange(option.value);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!open && ["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
      event.preventDefault();
      openMenu();
      return;
    }
    if (!open) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(options.length - 1, index + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(0, index - 1));
    } else if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(options.length - 1);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      choose(activeIndex);
    }
  };

  const overlay = document.getElementById("overlay-root") ?? document.body;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`select-trigger ${compact ? "is-compact" : ""} ${open ? "is-open" : ""}`}
        onClick={() => {
          if (open) setOpen(false);
          else openMenu();
        }}
        onKeyDown={onKeyDown}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls="orbit-select-listbox"
        aria-activedescendant={open ? `orbit-select-option-${activeIndex}` : undefined}
        disabled={disabled}
      >
        <span className="select-trigger-copy">
          <span className="select-trigger-label">{selected?.label ?? "Select"}</span>
          {selected?.description && (
            <span className="select-trigger-description">{selected.description}</span>
          )}
        </span>
        {selected?.badge && <span className="select-badge">{selected.badge}</span>}
        <ChevronDown size={14} className="select-chevron" />
      </button>

      {open &&
        createPortal(
          <div
            ref={listRef}
            id="orbit-select-listbox"
            role="listbox"
            aria-label={ariaLabel}
            className={`select-menu ${compact ? "is-compact" : ""}`}
            style={position}
            onKeyDown={onKeyDown}
          >
            <ScrollArea className="h-full">
              {options.map((option, index) => {
                const selectedOption = option.value === value;
                return (
                  <button
                    key={option.value}
                    id={`orbit-select-option-${index}`}
                    type="button"
                    role="option"
                    aria-selected={selectedOption}
                    className={`select-option ${selectedOption ? "is-selected" : ""} ${activeIndex === index ? "is-active" : ""}`}
                    onPointerMove={() => setActiveIndex(index)}
                    onClick={() => choose(index)}
                  >
                    <span className="select-option-check">
                      {selectedOption && <Check size={13} strokeWidth={2.2} />}
                    </span>
                    <span className="select-option-copy">
                      <span className="select-option-label">{option.label}</span>
                      {option.description && (
                        <span className="select-option-description">{option.description}</span>
                      )}
                    </span>
                    {option.badge && <span className="select-badge">{option.badge}</span>}
                  </button>
                );
              })}
            </ScrollArea>
          </div>,
          overlay,
        )}
    </>
  );
}
