import { useEffect, useState } from "react";
import { type AiQueueState } from "../../lib/ai-queue";

function useAiQueueState(): AiQueueState | null {
  const [state, setState] = useState<AiQueueState | null>(null);
  useEffect(() => {
    const sync = (event: Event) => {
      setState((event as CustomEvent<AiQueueState>).detail);
    };
    window.addEventListener("orbit:ai:queue", sync);
    return () => window.removeEventListener("orbit:ai:queue", sync);
  }, []);
  return state;
}

function formatLabel(state: AiQueueState): string | null {
  if (state.retryMessage) return state.retryMessage;

  const visibleInFlight = state.inFlight.filter(
    (slot) =>
      slot.priority !== "background" || !slot.label.startsWith("Categorize"),
  );

  if (visibleInFlight.length > 0) return visibleInFlight[0].label;
  if (state.queued > 0) return `${state.queued} AI requests queued`;
  return null;
}

/**
 * Compact app-bar status for interactive/user AI work (not background
 * categorize). It lives in the app bar rather than floating over the
 * workspace so it cannot cover page controls or the bottom-right toasts.
 */
export function AiQueueIndicator() {
  const state = useAiQueueState();
  if (!state) return null;

  const label = formatLabel(state);
  if (!label) return null;

  const waiting = state.queued > 0 && state.inFlight.length > 0;

  return (
    <div className="appbar-activity" role="status" aria-live="polite">
      <span className="appbar-activity-dot" aria-hidden="true" />
      <span className="appbar-activity-label">{label}</span>
      {waiting ? (
        <span className="appbar-activity-count">+{state.queued}</span>
      ) : null}
    </div>
  );
}
