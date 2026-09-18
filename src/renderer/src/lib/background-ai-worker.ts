/**
 * Coordinates background categorization so task and note passes don't
 * stampede the AI queue, and emits one summary notification per drain.
 */

import toast from "react-hot-toast";

type DrainListener = (detail: { taskCount: number; noteCount: number }) => void;

const CATEGORIZE_TOAST_ID = "orbit-categorize-progress";

let chain: Promise<void> = Promise.resolve();
let activeSessions = 0;
const listeners = new Set<DrainListener>();

export function onBackgroundAiDrain(listener: DrainListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emitDrain(taskCount: number, noteCount: number): void {
  for (const listener of listeners) {
    listener({ taskCount, noteCount });
  }
}

/**
 * Serialize background categorize runs. Callers pass their async work;
 * the worker ensures only one background session runs at a time.
 */
export function runBackgroundAiSession(
  label: "tasks" | "notes",
  work: () => Promise<number>,
): Promise<void> {
  const next = chain.then(async () => {
    activeSessions += 1;
    if (activeSessions === 1) {
      toast.loading("Categorizing items…", { id: CATEGORIZE_TOAST_ID });
    }

    try {
      const count = await work();
      if (label === "tasks") emitDrain(count, 0);
      else emitDrain(0, count);
    } finally {
      activeSessions -= 1;
      if (activeSessions <= 0) {
        activeSessions = 0;
        toast.dismiss(CATEGORIZE_TOAST_ID);
      }
    }
  });
  chain = next.catch(() => undefined);
  return next;
}
