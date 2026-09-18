const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 30_000;

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function retryDelayMs(res: Response, attempt: number): number {
  const retryAfter = res.headers.get("Retry-After");
  if (retryAfter) {
    const seconds = parseInt(retryAfter, 10);
    if (!Number.isNaN(seconds)) return seconds * 1000;
    const date = Date.parse(retryAfter);
    if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  }
  const exp = Math.min(BASE_DELAY_MS * 2 ** attempt, MAX_DELAY_MS);
  return exp + Math.random() * 500;
}

export interface FetchRetryOptions {
  signal?: AbortSignal;
  onRetry?: (detail: { attempt: number; status: number; delayMs: number }) => void;
}

export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  options: FetchRetryOptions = {},
): Promise<Response> {
  const { signal, onRetry } = options;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }

    const res = await fetch(url, { ...init, signal });

    if (!RETRYABLE_STATUSES.has(res.status) || attempt === MAX_RETRIES) {
      return res;
    }

    const delayMs = retryDelayMs(res, attempt);
    onRetry?.({ attempt: attempt + 1, status: res.status, delayMs });
    await sleep(delayMs, signal);
  }

  throw new Error("fetchWithRetry: unreachable");
}
