/// <reference types="vite/client" />

import type { OrbitDesktopApi } from "../../shared/contracts";

declare global {
  interface Window {
    orbitDesktop: OrbitDesktopApi;
  }
}

export {};
