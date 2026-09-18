/** Remove all Orbit keys from localStorage and sessionStorage. */
export function clearOrbitBrowserStorage(): void {
  const localKeys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith("orbit:") || key === "orbit_ek") localKeys.push(key);
  }
  for (const key of localKeys) {
    localStorage.removeItem(key);
  }

  const sessionKeys: string[] = [];
  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i);
    if (key?.startsWith("orbit:")) sessionKeys.push(key);
  }
  for (const key of sessionKeys) {
    sessionStorage.removeItem(key);
  }
}
