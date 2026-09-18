import type {
  CodexRunEvent,
  CodexRunRequest,
  CodexToolCall,
} from "../../../shared/contracts";

export interface CodexCallbacks {
  onToken?: (delta: string) => void;
  onReasoning?: (delta: string) => void;
  onToolCall?: (name: string, args: Record<string, unknown>) => string | Promise<string>;
}

export interface CodexCompletionResult {
  text: string;
  model: string;
}

function abortError(): DOMException {
  return new DOMException("Request cancelled.", "AbortError");
}

export async function runCodexCompletion(
  request: CodexRunRequest,
  callbacks: CodexCallbacks = {},
  signal?: AbortSignal,
): Promise<CodexCompletionResult> {
  if (signal?.aborted) throw abortError();

  let runId: string | null = null;
  let settled = false;
  const earlyEvents: CodexRunEvent[] = [];
  const earlyToolCalls: CodexToolCall[] = [];

  return new Promise<CodexCompletionResult>((resolve, reject) => {
    const cleanup = (): void => {
      clearTimeout(timeout);
      offEvents();
      offTools();
      signal?.removeEventListener("abort", onAbort);
    };

    const finish = (
      action: () => void,
    ): void => {
      if (settled) return;
      settled = true;
      cleanup();
      action();
    };

    const handleEvent = (event: CodexRunEvent): void => {
      if (!runId) {
        earlyEvents.push(event);
        return;
      }
      if (event.runId !== runId) return;
      if (event.type === "token") callbacks.onToken?.(event.delta);
      if (event.type === "reasoning") callbacks.onReasoning?.(event.delta);
      if (event.type === "done") {
        finish(() => resolve({ text: event.text, model: event.model }));
      }
      if (event.type === "error") {
        finish(() => reject(new Error(event.error)));
      }
    };

    const handleToolCall = (call: CodexToolCall): void => {
      if (!runId) {
        earlyToolCalls.push(call);
        return;
      }
      if (call.runId !== runId) return;
      if (!callbacks.onToolCall) {
        window.orbitDesktop.codex.submitToolResult({
          requestId: call.requestId,
          success: false,
          result: `Orbit does not expose the ${call.name} tool for this completion.`,
        });
        return;
      }
      void Promise.resolve(callbacks.onToolCall(call.name, call.arguments))
        .then((result) => {
          window.orbitDesktop.codex.submitToolResult({
            requestId: call.requestId,
            success: true,
            result,
          });
        })
        .catch((error: unknown) => {
          window.orbitDesktop.codex.submitToolResult({
            requestId: call.requestId,
            success: false,
            result: error instanceof Error ? error.message : String(error),
          });
        });
    };

    const offEvents = window.orbitDesktop.codex.onRunEvent(handleEvent);
    const offTools = window.orbitDesktop.codex.onToolCall(handleToolCall);
    const onAbort = (): void => {
      if (runId) void window.orbitDesktop.codex.cancel(runId);
      finish(() => reject(abortError()));
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    const timeout = setTimeout(() => {
      if (runId) void window.orbitDesktop.codex.cancel(runId);
      finish(() => reject(new Error("Codex did not finish within five minutes.")));
    }, 300_000);

    void window.orbitDesktop.codex
      .run(request)
      .then((started) => {
        runId = started.runId;
        for (const event of earlyEvents.splice(0)) handleEvent(event);
        for (const call of earlyToolCalls.splice(0)) handleToolCall(call);
      })
      .catch((error: unknown) => {
        finish(() => reject(error instanceof Error ? error : new Error(String(error))));
      });
  });
}
