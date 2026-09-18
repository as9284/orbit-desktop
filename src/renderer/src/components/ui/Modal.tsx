import { useEffect, useState, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { IconButton } from "./IconButton";
import { ScrollArea } from "./ScrollArea";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  maxWidth?: string;
  closeOnEscape?: boolean;
  closeOnOverlayClick?: boolean;
  zIndexClassName?: string;
  backdropClassName?: string;
  panelClassName?: string;
}

export function Modal({
  open,
  onClose,
  title,
  children,
  maxWidth = "max-w-lg",
  closeOnEscape = true,
  closeOnOverlayClick = true,
  zIndexClassName = "z-[80]",
  backdropClassName = "",
  panelClassName = "",
}: ModalProps) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  // Mount/unmount lifecycle
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (open) {
      previousFocus.current = document.activeElement as HTMLElement;
      setMounted(true);
    } else if (mounted) {
      // Exit animation then unmount
      setVisible(false);
      const timer = setTimeout(() => {
        setMounted(false);
        previousFocus.current?.focus();
      }, 220);
      return () => clearTimeout(timer);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  /* eslint-enable react-hooks/set-state-in-effect */

  // Entry animation: wait for mount to paint, then trigger visible.
  // Double-rAF guarantees we're past the browser's first paint of the
  // invisible state, so the CSS transition always plays.
  useEffect(() => {
    if (!mounted) return;
    let cancelled = false;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!cancelled) setVisible(true);
      });
    });
    return () => {
      cancelled = true;
    };
  }, [mounted]);

  // Body scroll lock
  useEffect(() => {
    if (!mounted) return;
    const currentCount = Number(document.body.dataset.orbitModalCount ?? "0");
    document.body.dataset.orbitModalCount = String(currentCount + 1);
    document.body.style.overflow = "hidden";

    return () => {
      const nextCount = Math.max(
        0,
        Number(document.body.dataset.orbitModalCount ?? "1") - 1,
      );

      if (nextCount === 0) {
        delete document.body.dataset.orbitModalCount;
        document.body.style.overflow = "";
        return;
      }

      document.body.dataset.orbitModalCount = String(nextCount);
    };
  }, [mounted]);

  // Escape key
  useEffect(() => {
    if (!mounted || !closeOnEscape) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [mounted, onClose, closeOnEscape]);

  // Focus trap  -  re-queries on every Tab so dynamically-rendered
  // children (e.g. date picker calendar) are always included
  useEffect(() => {
    if (!mounted || !visible) return;
    const panel = panelRef.current;
    if (!panel) return;

    const focusableSelector =
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

    // Auto-focus first element
    const initial = panel.querySelectorAll<HTMLElement>(focusableSelector);
    if (initial.length > 0) initial[0].focus();

    const trapFocus = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      // Re-query each time so newly added calendar buttons are included
      const focusable = panel.querySelectorAll<HTMLElement>(focusableSelector);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", trapFocus);
    return () => window.removeEventListener("keydown", trapFocus);
  }, [mounted, visible]);

  if (!mounted) return null;

  const overlayRoot = document.getElementById("overlay-root") ?? document.body;

  return createPortal(
    <div
      className={`fixed inset-x-0 bottom-0 top-[var(--appbar-height)] ${zIndexClassName} flex items-center justify-center p-5`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      onClick={closeOnOverlayClick ? onClose : undefined}
    >
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-overlay backdrop-blur-sm transition-opacity duration-200 ease-out ${backdropClassName} ${
          visible ? "opacity-100" : "opacity-0"
        }`}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className={`relative mx-auto min-h-0 max-h-[calc(100dvh-var(--appbar-height)-2.5rem)] w-full ${maxWidth} glass-raised rounded-2xl flex flex-col overflow-hidden transition-all duration-200 ease-out ${panelClassName} ${
          visible
            ? "opacity-100 transform-none"
            : "opacity-0 scale-[0.96] translate-y-3"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cosmic accent aura + hairline at the top of the panel */}
        <div className="pointer-events-none absolute -top-20 left-1/2 -translate-x-1/2 h-40 w-2/3 rounded-full bg-accent/12 blur-3xl" />
        <div className="pointer-events-none absolute top-0 left-1/4 right-1/4 h-px bg-linear-to-r from-transparent via-accent/50 to-transparent" />

        <div className="relative flex items-center justify-between gap-3 px-6 py-4 border-b border-border-subtle shrink-0">
          <h2
            id="modal-title"
            className="font-display text-base sm:text-lg font-semibold text-text-primary tracking-tight truncate"
          >
            {title}
          </h2>
          <IconButton label="Close" onClick={onClose}>
            <X size={15} />
          </IconButton>
        </div>
        <ScrollArea className="flex-1 min-h-0" viewportClassName="overscroll-contain">
          <div className="p-6">{children}</div>
        </ScrollArea>
      </div>
    </div>,
    overlayRoot,
  );
}
