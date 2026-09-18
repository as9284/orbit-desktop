import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import type { LocalProfile } from "../types/orbit";
import {
  getProfile,
  createProfile,
  updateDisplayName,
  clearProfile,
} from "../lib/storage/profile";

interface AppContextValue {
  profile: LocalProfile | null;
  loading: boolean;
  onboarded: boolean;
  completeOnboarding: (displayName: string) => void;
  setDisplayName: (name: string) => void;
  resetApp: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<LocalProfile | null>(() => getProfile());

  useEffect(() => {
    const syncProfile = () => setProfile(getProfile());
    window.addEventListener("orbit:data:changed", syncProfile);
    window.addEventListener("orbit:profile:changed", syncProfile);
    return () => {
      window.removeEventListener("orbit:data:changed", syncProfile);
      window.removeEventListener("orbit:profile:changed", syncProfile);
    };
  }, []);

  const completeOnboarding = useCallback((displayName: string) => {
    const p = createProfile(displayName);
    setProfile(p);
  }, []);

  const setDisplayName = useCallback((name: string) => {
    const updated = updateDisplayName(name);
    if (updated) setProfile(updated);
  }, []);

  const resetApp = useCallback(async () => {
    clearProfile();
    setProfile(null);
  }, []);

  return (
    <AppContext.Provider
      value={{
        profile,
        loading: false,
        onboarded: profile !== null,
        completeOnboarding,
        setDisplayName,
        resetApp,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
