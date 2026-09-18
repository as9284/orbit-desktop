import { fetchWithRetry } from "./fetch-retry";

export type AiPriority = "interactive" | "user" | "background";

export interface AiQueueSlot {
  priority: AiPriority;
  label: string;
  acquiredAt: number;
}

export interface AiQueueState {
  inFlight: AiQueueSlot[];
  queued: number;
  pausedBackground: boolean;
  retryMessage: string | null;
}

export interface AiRunOptions {
  priority?: AiPriority;
  label?: string;
  dedupeKey?: string;
  scopeId?: string;
  signal?: AbortSignal;
}

const PRIORITY_RANK: Record<AiPriority, number> = {
  interactive: 0,
  user: 1,
  background: 2,
};

type QueueListener = (state: AiQueueState) => void;

interface QueueEntry<T> {
  priority: AiPriority;
  label: string;
  dedupeKey?: string;
  scopeId?: string;
  signal?: AbortSignal;
  run: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

class AiRequestQueue {
  private readonly maxConcurrent = 2;
  private inFlightSlots: AiQueueSlot[] = [];
  private activeScopeIds = new Set<string>();
  private queue: QueueEntry<unknown>[] = [];
  private inflightByKey = new Map<string, Promise<unknown>>();
  private backgroundPaused = false;
  private backgroundAbortControllers = new Set<AbortController>();
  private backgroundAbortSignal: AbortSignal | undefined;
  private listeners = new Set<QueueListener>();
  private retryMessage: string | null = null;

  getBackgroundAbortSignal(): AbortSignal | undefined {
    return this.backgroundAbortSignal;
  }

  subscribe(listener: QueueListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  getState(): AiQueueState {
    return {
      inFlight: [...this.inFlightSlots],
      queued: this.queue.length,
      pausedBackground: this.backgroundPaused,
      retryMessage: this.retryMessage,
    };
  }

  private emit(): void {
    const state = this.getState();
    window.dispatchEvent(
      new CustomEvent("orbit:ai:queue", { detail: state }),
    );
    for (const listener of this.listeners) listener(state);
  }

  private hasHigherPriorityWaiting(): boolean {
    return this.queue.some((e) => e.priority !== "background");
  }

  private pauseBackground(): void {
    this.backgroundPaused = true;
    for (const controller of this.backgroundAbortControllers) {
      controller.abort();
    }
    this.backgroundAbortControllers.clear();
  }

  private maybeResumeBackground(): void {
    const hasInteractiveOrUser =
      this.inFlightSlots.some((s) => s.priority !== "background") ||
      this.queue.some((e) => e.priority !== "background");
    if (!hasInteractiveOrUser) {
      this.backgroundPaused = false;
    }
  }

  async run<T>(opts: AiRunOptions, fn: () => Promise<T>): Promise<T> {
    if (opts.scopeId && this.activeScopeIds.has(opts.scopeId)) {
      return fn();
    }

    if (opts.dedupeKey) {
      const existing = this.inflightByKey.get(opts.dedupeKey);
      if (existing) return existing as Promise<T>;
    }

    const promise = new Promise<T>((resolve, reject) => {
      const entry: QueueEntry<T> = {
        priority: opts.priority ?? "user",
        label: opts.label ?? "AI request",
        dedupeKey: opts.dedupeKey,
        scopeId: opts.scopeId,
        signal: opts.signal,
        run: fn,
        resolve,
        reject,
      };
      this.queue.push(entry as QueueEntry<unknown>);
      this.queue.sort(
        (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority],
      );
      void this.drain();
      this.emit();
    });

    if (opts.dedupeKey) {
      this.inflightByKey.set(opts.dedupeKey, promise as Promise<unknown>);
      promise.finally(() => {
        if (this.inflightByKey.get(opts.dedupeKey!) === promise) {
          this.inflightByKey.delete(opts.dedupeKey!);
        }
      });
    }

    return promise;
  }

  private async drain(): Promise<void> {
    while (
      this.inFlightSlots.length < this.maxConcurrent &&
      this.queue.length > 0
    ) {
      const nextIdx = this.queue.findIndex((entry) => {
        if (entry.priority === "background") {
          if (this.backgroundPaused) return false;
          if (this.hasHigherPriorityWaiting()) return false;
        }
        return true;
      });
      if (nextIdx === -1) break;

      const entry = this.queue.splice(nextIdx, 1)[0] as QueueEntry<unknown>;
      void this.execute(entry);
    }
    this.emit();
  }

  private async execute<T>(entry: QueueEntry<T>): Promise<void> {
    if (entry.priority !== "background") {
      this.pauseBackground();
    }

    const slot: AiQueueSlot = {
      priority: entry.priority,
      label: entry.label,
      acquiredAt: Date.now(),
    };
    this.inFlightSlots.push(slot);

    if (entry.scopeId) {
      this.activeScopeIds.add(entry.scopeId);
    }

    const linkedAbort =
      entry.priority === "background" ? new AbortController() : null;
    if (linkedAbort) {
      this.backgroundAbortControllers.add(linkedAbort);
      this.backgroundAbortSignal = linkedAbort.signal;
    }

    const signal = entry.signal ?? linkedAbort?.signal;

    try {
      if (signal?.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }
      const result = await entry.run();
      entry.resolve(result);
    } catch (error) {
      entry.reject(error);
    } finally {
      this.inFlightSlots = this.inFlightSlots.filter((s) => s !== slot);
      if (entry.scopeId) {
        this.activeScopeIds.delete(entry.scopeId);
      }
      if (linkedAbort) {
        this.backgroundAbortControllers.delete(linkedAbort);
        this.backgroundAbortSignal = undefined;
      }
      this.maybeResumeBackground();
      void this.drain();
      this.emit();
    }
  }

  setRetryMessage(message: string | null): void {
    this.retryMessage = message;
    this.emit();
  }
}

export const aiQueue = new AiRequestQueue();

export async function aiFetch(
  url: string,
  init: RequestInit,
  options: AiRunOptions = {},
): Promise<Response> {
  return aiQueue.run(options, () =>
    fetchWithRetry(url, init, {
      signal: options.signal,
      onRetry: ({ status, delayMs }) => {
        const seconds = Math.ceil(delayMs / 1000);
        aiQueue.setRetryMessage(
          status === 429
            ? `Rate limited  -  retrying in ${seconds}s…`
            : `Upstream error  -  retrying in ${seconds}s…`,
        );
      },
    }).finally(() => {
      aiQueue.setRetryMessage(null);
    }),
  );
}
