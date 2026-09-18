import type { LocalProfile } from "../../types/orbit";

const PROFILE_KEY = "orbit:profile";

export function getProfile(): LocalProfile | null {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as LocalProfile;
  } catch {
    return null;
  }
}

export function saveProfile(profile: LocalProfile): void {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

export function createProfile(displayName: string): LocalProfile {
  const profile: LocalProfile = {
    id: crypto.randomUUID(),
    displayName: displayName.trim() || "Explorer",
    onboardedAt: new Date().toISOString(),
  };
  saveProfile(profile);
  return profile;
}

export function updateDisplayName(displayName: string): LocalProfile | null {
  const profile = getProfile();
  if (!profile) return null;
  const updated = { ...profile, displayName: displayName.trim() || profile.displayName };
  saveProfile(updated);
  return updated;
}

export function isOnboarded(): boolean {
  return getProfile() !== null;
}

export function clearProfile(): void {
  localStorage.removeItem(PROFILE_KEY);
}
