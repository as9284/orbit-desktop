import { app, screen, type BrowserWindow, type Rectangle } from "electron";
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

interface PersistedWindowState extends Rectangle {
  maximized: boolean;
  minimized: boolean;
}

const DEFAULTS: PersistedWindowState = {
  width: 1320,
  height: 840,
  x: 0,
  y: 0,
  maximized: false,
  minimized: false,
};

const MIN_WIDTH = 980;
const MIN_HEIGHT = 680;

function statePath(): string {
  return join(app.getPath("userData"), "window-state.json");
}

function readState(): PersistedWindowState {
  try {
    const value = JSON.parse(readFileSync(statePath(), "utf8")) as Partial<PersistedWindowState>;
    return {
      ...DEFAULTS,
      ...value,
      width: Math.max(MIN_WIDTH, Number(value.width) || DEFAULTS.width),
      height: Math.max(MIN_HEIGHT, Number(value.height) || DEFAULTS.height),
      maximized: value.maximized === true,
      minimized: value.minimized === true,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

function intersects(a: Rectangle, b: Rectangle): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

function isOnScreen(value: PersistedWindowState): boolean {
  if (![value.x, value.y, value.width, value.height].every(Number.isFinite)) return false;
  return screen.getAllDisplays().some((display) => intersects(value, display.workArea));
}

function writeState(value: PersistedWindowState): void {
  const file = statePath();
  const temp = `${file}.tmp`;
  try {
    writeFileSync(temp, JSON.stringify(value, null, 2), "utf8");
    renameSync(temp, file);
  } catch {
    // Window persistence must never prevent the application from closing.
  }
}

export function restoredWindowOptions(): {
  bounds: Partial<Rectangle>;
  saved: PersistedWindowState;
  minWidth: number;
  minHeight: number;
} {
  const saved = readState();
  const bounds: Partial<Rectangle> = {
    width: saved.width,
    height: saved.height,
  };
  if (isOnScreen(saved)) {
    bounds.x = saved.x;
    bounds.y = saved.y;
  }
  return { bounds, saved, minWidth: MIN_WIDTH, minHeight: MIN_HEIGHT };
}

export function trackWindowState(win: BrowserWindow, saved: PersistedWindowState): void {
  if (saved.maximized) win.maximize();

  let timer: NodeJS.Timeout | null = null;
  const save = (): void => {
    if (win.isDestroyed()) return;
    const bounds = win.getNormalBounds();
    writeState({
      ...bounds,
      maximized: win.isMaximized(),
      minimized: win.isMinimized(),
    });
  };
  const queue = (): void => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(save, 350);
  };

  win.on("resize", queue);
  win.on("move", queue);
  win.on("maximize", queue);
  win.on("unmaximize", queue);
  win.on("minimize", queue);
  win.on("restore", queue);
  win.on("close", () => {
    if (timer) clearTimeout(timer);
    save();
  });
}
