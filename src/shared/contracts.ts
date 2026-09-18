export type CodexAccount =
  | { type: "apiKey" }
  | { type: "chatgpt"; email: string | null; planType: string }
  | { type: "amazonBedrock"; usesCodexManagedCredentials: boolean };

export interface CodexAccountState {
  account: CodexAccount | null;
  requiresOpenaiAuth: boolean;
  connected: boolean;
  cliVersion: string | null;
  error: string | null;
}

export interface CodexReasoningOption {
  reasoningEffort: string;
  description: string;
}

export interface CodexModel {
  id: string;
  model: string;
  displayName: string;
  description: string;
  hidden: boolean;
  supportedReasoningEfforts: CodexReasoningOption[];
  defaultReasoningEffort: string;
  isDefault: boolean;
}

export interface CodexToolSpec {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface CodexRunRequest {
  prompt: string;
  model: string;
  effort: string;
  baseInstructions?: string;
  tools?: CodexToolSpec[];
  outputSchema?: Record<string, unknown>;
}

export interface CodexRunStarted {
  runId: string;
  threadId: string;
  turnId: string;
  model: string;
}

export type CodexRunEvent =
  | { runId: string; type: "token"; delta: string }
  | { runId: string; type: "reasoning"; delta: string }
  | { runId: string; type: "done"; text: string; model: string }
  | { runId: string; type: "error"; error: string };

export interface CodexToolCall {
  requestId: number | string;
  runId: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface CodexToolResult {
  requestId: number | string;
  success: boolean;
  result: string;
}

export interface WindowStateSnapshot {
  maximized: boolean;
}

export interface OrbitDesktopApi {
  window: {
    minimize: () => Promise<void>;
    toggleMaximize: () => Promise<boolean>;
    close: () => Promise<void>;
    state: () => Promise<WindowStateSnapshot>;
    onMaximizeChange: (listener: (maximized: boolean) => void) => () => void;
  };
  codex: {
    account: () => Promise<CodexAccountState>;
    models: () => Promise<CodexModel[]>;
    login: () => Promise<{ loginId: string | null }>;
    run: (request: CodexRunRequest) => Promise<CodexRunStarted>;
    cancel: (runId: string) => Promise<void>;
    submitToolResult: (result: CodexToolResult) => void;
    onRunEvent: (listener: (event: CodexRunEvent) => void) => () => void;
    onToolCall: (listener: (call: CodexToolCall) => void) => () => void;
    onAccountChanged: (listener: () => void) => () => void;
  };
  app: {
    version: () => Promise<string>;
  };
}
