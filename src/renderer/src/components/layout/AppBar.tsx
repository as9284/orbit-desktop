import { useEffect, useMemo, useState } from "react";
import { Copy, Minus, Square, X } from "lucide-react";
import { useLocation } from "react-router-dom";
import { OrbitGlyph } from "../ui/Logo";
import { AiQueueIndicator } from "../ui/AiQueueIndicator";
import { getAiSettings } from "../../lib/ai";

const TITLES: Record<string, string> = {
  "/": "Tasks",
  "/notes": "Notes",
  "/projects": "Projects",
  "/meeting": "Meeting",
  "/luna": "Luna",
  "/writing": "Writing",
  "/archive": "Archive",
};

export function AppBar() {
  const location = useLocation();
  const [maximized, setMaximized] = useState(false);
  const [settings, setSettings] = useState(() => getAiSettings());

  useEffect(() => {
    void window.orbitDesktop.window.state().then((state) => setMaximized(state.maximized));
    return window.orbitDesktop.window.onMaximizeChange(setMaximized);
  }, []);

  useEffect(() => {
    const sync = () => setSettings(getAiSettings());
    window.addEventListener("orbit:ai:changed", sync);
    return () => window.removeEventListener("orbit:ai:changed", sync);
  }, []);

  const section = useMemo(() => TITLES[location.pathname] ?? "Workspace", [location.pathname]);
  const modelLabel = settings.model
    ? settings.model
        .replace(/^gpt-/, "GPT ")
        .replaceAll("-", " ")
        .replace(/\b\w/g, (letter) => letter.toUpperCase())
    : "Connecting";

  return (
    <header className="appbar" aria-label="Application title bar">
      <div className="appbar-brand">
        <OrbitGlyph className="h-5 w-5" />
        <span className="appbar-wordmark">ORBIT</span>
        <span className="appbar-separator" aria-hidden="true" />
        <span className="appbar-section">{section}</span>
      </div>

      <div className="appbar-drag-region" aria-hidden="true" />

      <AiQueueIndicator />

      <div className="appbar-context" aria-label="Active Codex configuration">
        <span className={`appbar-status ${settings.model ? "is-ready" : ""}`} aria-hidden="true" />
        <span className="appbar-model">{modelLabel}</span>
        {settings.effort && <span className="appbar-effort">{settings.effort}</span>}
      </div>

      <div className="window-controls">
        <button
          type="button"
          className="window-control"
          aria-label="Minimize"
          onClick={() => void window.orbitDesktop.window.minimize()}
        >
          <Minus size={14} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          className="window-control"
          aria-label={maximized ? "Restore" : "Maximize"}
          onClick={() => void window.orbitDesktop.window.toggleMaximize()}
        >
          {maximized ? <Copy size={12} strokeWidth={1.6} /> : <Square size={12} strokeWidth={1.6} />}
        </button>
        <button
          type="button"
          className="window-control window-control-close"
          aria-label="Close"
          onClick={() => void window.orbitDesktop.window.close()}
        >
          <X size={15} strokeWidth={1.75} />
        </button>
      </div>
    </header>
  );
}
