import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { cn } from "../../lib/cn";

interface ScrollAreaProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  viewportClassName?: string;
  contentClassName?: string;
}

export function ScrollArea({
  children,
  className,
  viewportClassName,
  contentClassName,
  ...props
}: ScrollAreaProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [metrics, setMetrics] = useState({ top: 0, height: 0, visible: false });
  const dragging = useRef<{ startY: number; startTop: number } | null>(null);

  const measure = useCallback(() => {
    const viewport = viewportRef.current;
    const track = trackRef.current;
    if (!viewport) return;
    const visible = viewport.scrollHeight > viewport.clientHeight + 1;
    const trackHeight = track?.clientHeight ?? viewport.clientHeight;
    const height = visible
      ? Math.max(30, (viewport.clientHeight / viewport.scrollHeight) * trackHeight)
      : 0;
    const maxScroll = viewport.scrollHeight - viewport.clientHeight;
    const maxTop = trackHeight - height;
    const top = maxScroll > 0 ? (viewport.scrollTop / maxScroll) * maxTop : 0;
    setMetrics({ top, height, visible });
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    if (viewport.firstElementChild) observer.observe(viewport.firstElementChild);
    viewport.addEventListener("scroll", measure, { passive: true });
    return () => {
      observer.disconnect();
      viewport.removeEventListener("scroll", measure);
    };
  }, [measure]);

  useEffect(() => {
    const onMove = (event: PointerEvent): void => {
      const viewport = viewportRef.current;
      const track = trackRef.current;
      if (!viewport || !track || !dragging.current) return;
      const maxTop = track.clientHeight - metrics.height;
      const nextTop = Math.min(
        maxTop,
        Math.max(0, dragging.current.startTop + event.clientY - dragging.current.startY),
      );
      const ratio = maxTop > 0 ? nextTop / maxTop : 0;
      viewport.scrollTop = ratio * (viewport.scrollHeight - viewport.clientHeight);
    };
    const onUp = (): void => {
      dragging.current = null;
      document.body.classList.remove("is-dragging-scrollbar");
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [metrics.height]);

  return (
    <div className={cn("custom-scroll-area", className)} {...props}>
      <div ref={viewportRef} className={cn("custom-scroll-viewport", viewportClassName)}>
        <div className={cn("custom-scroll-content", contentClassName)}>{children}</div>
      </div>
      <div
        ref={trackRef}
        className={`custom-scroll-track ${metrics.visible ? "is-visible" : ""}`}
        onPointerDown={(event) => {
          if (event.target !== event.currentTarget) return;
          const viewport = viewportRef.current;
          if (!viewport || !trackRef.current) return;
          const rect = trackRef.current.getBoundingClientRect();
          const maxTop = trackRef.current.clientHeight - metrics.height;
          const nextTop = Math.max(0, Math.min(maxTop, event.clientY - rect.top - metrics.height / 2));
          viewport.scrollTop = maxTop > 0
            ? (nextTop / maxTop) * (viewport.scrollHeight - viewport.clientHeight)
            : 0;
        }}
      >
        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          className="custom-scroll-thumb"
          style={{ height: metrics.height, transform: `translateY(${metrics.top}px)` }}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            dragging.current = { startY: event.clientY, startTop: metrics.top };
            document.body.classList.add("is-dragging-scrollbar");
          }}
        />
      </div>
    </div>
  );
}
