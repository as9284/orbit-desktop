import { app, BrowserWindow, ipcMain, session } from "electron";
import { join } from "node:path";
import { CodexAppServer } from "./codex-app-server";
import { restoredWindowOptions, trackWindowState } from "./window-state";
import type { CodexRunRequest, CodexToolResult } from "../shared/contracts";

const gotLock = app.requestSingleInstanceLock();
const codex = new CodexAppServer();
let mainWindow: BrowserWindow | null = null;

function windowIconPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, "icon.ico")
    : join(app.getAppPath(), "assets", "icon.ico");
}

function focusMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function createWindow(): BrowserWindow {
  const { bounds, saved, minWidth, minHeight } = restoredWindowOptions();
  const win = new BrowserWindow({
    ...bounds,
    minWidth,
    minHeight,
    show: false,
    frame: false,
    thickFrame: true,
    backgroundColor: "#070812",
    autoHideMenuBar: true,
    icon: windowIconPath(),
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  mainWindow = win;
  trackWindowState(win, saved);

  const sendMaximized = (): void => {
    if (!win.isDestroyed()) win.webContents.send("window:maximized-changed", win.isMaximized());
  };
  win.on("maximize", sendMaximized);
  win.on("unmaximize", sendMaximized);
  win.on("enter-full-screen", sendMaximized);
  win.on("leave-full-screen", sendMaximized);
  win.once("ready-to-show", () => win.show());
  win.on("closed", () => {
    if (mainWindow === win) mainWindow = null;
  });
  win.webContents.on("did-finish-load", () => {
    win.webContents.setZoomFactor(1);
    win.webContents.setZoomLevel(0);
  });
  win.webContents.on("before-input-event", (event, input) => {
    const isZoomShortcut =
      input.type === "keyDown" &&
      (input.control || input.meta) &&
      ["+", "=", "-", "0"].includes(input.key);
    if (isZoomShortcut) event.preventDefault();
  });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void win.loadFile(join(__dirname, "../renderer/index.html"));
  }
  return win;
}

function registerIpc(): void {
  ipcMain.handle("window:minimize", () => mainWindow?.minimize());
  ipcMain.handle("window:toggle-maximize", () => {
    if (!mainWindow) return false;
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
    return mainWindow.isMaximized();
  });
  ipcMain.handle("window:close", () => mainWindow?.close());
  ipcMain.handle("window:state", () => ({ maximized: mainWindow?.isMaximized() ?? false }));

  ipcMain.handle("codex:account", () => codex.account());
  ipcMain.handle("codex:models", () => codex.models());
  ipcMain.handle("codex:login", () => codex.login());
  ipcMain.handle("codex:run", (event, request: CodexRunRequest) => codex.run(event.sender, request));
  ipcMain.handle("codex:cancel", (_event, runId: string) => codex.cancel(runId));
  ipcMain.on("codex:tool-result", (_event, result: CodexToolResult) => codex.submitToolResult(result));
  ipcMain.handle("app:version", () => app.getVersion());
}

if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", focusMainWindow);

  app.whenReady().then(() => {
    app.setAppUserModelId("com.anthonysaliba.orbit");

    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
      callback(false);
    });
    registerIpc();
    createWindow();
    void codex.start();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("before-quit", () => codex.dispose());
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
  app.on("web-contents-created", (_event, contents) => {
    contents.on("will-attach-webview", (event) => event.preventDefault());
    contents.setWindowOpenHandler(() => ({ action: "deny" }));
  });
}
