# Orbit Desktop

Orbit Desktop is a local-first Electron workspace for tasks, notes, projects, meetings, writing, and Luna. The interface keeps Orbit's purple cosmic identity while adapting it to a resizable desktop window.

## Requirements

- Windows 10 or 11
- Node.js 24 or newer
- Codex CLI available on `PATH`, or installed with the Codex desktop app
- A ChatGPT account authenticated through `codex login`

Orbit does not store an API key. It starts the local Codex app server and uses the Codex CLI's existing ChatGPT authentication. The model list and supported reasoning efforts are read from Codex at runtime.

## Development

```powershell
npm install
npm run dev
```

The project pins Electron 42.3.0. If that release is already in Electron's local cache, npm reuses the cached archive instead of downloading it again.

Useful checks:

```powershell
npm run test
npm run typecheck
npm run lint
npm run build
```

Create the Windows installer with:

```powershell
npm run dist
```

## Desktop behavior

- Minimum window size: 980 by 680
- Last normal window bounds and maximized state are restored on launch
- A single Orbit instance is allowed
- Browser zoom, webviews, popups, and renderer Node integration are disabled
- Settings, selectors, and other overlays are portaled below the custom app bar
- Workspace data remains in the renderer's local IndexedDB storage
