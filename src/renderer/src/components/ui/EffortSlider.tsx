import { useMemo, useRef, type KeyboardEvent, type PointerEvent } from "react";

interface EffortOption {
  value: string;
  label: string;
  description: string;
}

interface EffortSliderProps {
  value: string;
  options: EffortOption[];
  onChange: (value: string) => void;
}

export function EffortSlider({ value, options, onChange }: EffortSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const index = Math.max(0, options.findIndex((option) => option.value === value));
  const percent = options.length > 1 ? (index / (options.length - 1)) * 100 : 0;
  const selected = options[index];
  const positions = useMemo(
    () => options.map((_, optionIndex) => (options.length > 1 ? (optionIndex / (options.length - 1)) * 100 : 0)),
    [options],
  );

  const setFromPointer = (clientX: number): void => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || options.length === 0) return;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const next = Math.round(ratio * (options.length - 1));
    onChange(options[next].value);
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    event.currentTarget.setPointerCapture(event.pointerId);
    setFromPointer(event.clientX);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>): void => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) setFromPointer(event.clientX);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    let next = index;
    if (event.key === "ArrowRight" || event.key === "ArrowUp") next += 1;
    else if (event.key === "ArrowLeft" || event.key === "ArrowDown") next -= 1;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = options.length - 1;
    else return;
    event.preventDefault();
    next = Math.max(0, Math.min(options.length - 1, next));
    onChange(options[next].value);
  };

  if (!selected) return null;

  return (
    <div className="effort-control">
      <div className="effort-copy">
        <span className="effort-value">{selected.label}</span>
        <span className="effort-description">{selected.description}</span>
      </div>
      <div
        ref={trackRef}
        className="effort-slider"
        role="slider"
        tabIndex={0}
        aria-label="Reasoning effort"
        aria-valuemin={0}
        aria-valuemax={options.length - 1}
        aria-valuenow={index}
        aria-valuetext={selected.label}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
      >
        <span className="effort-track" />
        <span className="effort-track-active" style={{ width: `${percent}%` }} />
        {positions.map((position, optionIndex) => (
          <span
            key={options[optionIndex].value}
            className={`effort-tick ${optionIndex <= index ? "is-active" : ""}`}
            style={{ left: `${position}%` }}
          />
        ))}
        <span className="effort-thumb" style={{ left: `${percent}%` }} />
      </div>
      <div className="effort-labels" aria-hidden="true">
        <span>{options[0]?.label}</span>
        <span>{options.at(-1)?.label}</span>
      </div>
    </div>
  );
}
