/**
 * Coordinates background categorization so task and note passes don't
 * stampede the AI queue, and emits one summary notification per drain.
 */

type DrainListener = (detail: { taskCount: number; noteCount: number }) => void;

let chain: Promise<void> = Promise.resolve();
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
 *
 * Deliberately silent while running. A session starts on every visit to
 * Tasks or Notes, and usually finds nothing to categorize and returns in
 * a couple of frames, so any progress indicator raised here flashes. The
 * app-bar activity pill already reports the AI queue once real work is
 * enqueued, and `notifyBackgroundCategorizeComplete` reports the result.
 */
export function runBackgroundAiSession(
  label: "tasks" | "notes",
  work: () => Promise<number>,
): Promise<void> {
  const next = chain.then(async () => {
    const count = await work();
    if (label === "tasks") emitDrain(count, 0);
    else emitDrain(0, count);
  });
  chain = next.catch(() => undefined);
  return next;
}
