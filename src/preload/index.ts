import { contextBridge, ipcRenderer, webFrame, type IpcRendererEvent } from "electron";
import type {
  CodexAccountState,
  CodexModel,
  CodexRunEvent,
  CodexRunRequest,
  CodexRunStarted,
  CodexToolCall,
  CodexToolResult,
  OrbitDesktopApi,
  WindowStateSnapshot,
} from "../shared/contracts";

function on<T>(channel: string, listener: (payload: T) => void): () => void {
  const wrapped = (_event: IpcRendererEvent, payload: T): void => listener(payload);
  ipcRenderer.on(channel, wrapped);
  return () => ipcRenderer.removeListener(channel, wrapped);
}

webFrame.setZoomFactor(1);
webFrame.setZoomLevel(0);
void webFrame.setVisualZoomLevelLimits(1, 1);

const api: OrbitDesktopApi = {
  window: {
    minimize: () => ipcRenderer.invoke("window:minimize"),
    toggleMaximize: () => ipcRenderer.invoke("window:toggle-maximize"),
    close: () => ipcRenderer.invoke("window:close"),
    state: () => ipcRenderer.invoke("window:state") as Promise<WindowStateSnapshot>,
    onMaximizeChange: (listener) => on("window:maximized-changed", listener),
  },
  codex: {
    account: () => ipcRenderer.invoke("codex:account") as Promise<CodexAccountState>,
    models: () => ipcRenderer.invoke("codex:models") as Promise<CodexModel[]>,
    login: () => ipcRenderer.invoke("codex:login") as Promise<{ loginId: string | null }>,
    run: (request: CodexRunRequest) =>
      ipcRenderer.invoke("codex:run", request) as Promise<CodexRunStarted>,
    cancel: (runId: string) => ipcRenderer.invoke("codex:cancel", runId),
    submitToolResult: (result: CodexToolResult) => ipcRenderer.send("codex:tool-result", result),
    onRunEvent: (listener: (event: CodexRunEvent) => void) => on("codex:run-event", listener),
    onToolCall: (listener: (call: CodexToolCall) => void) => on("codex:tool-call", listener),
    onAccountChanged: (listener: () => void) => on("codex:account-changed", listener),
  },
  app: {
    version: () => ipcRenderer.invoke("app:version") as Promise<string>,
  },
};

contextBridge.exposeInMainWorld("orbitDesktop", api);
