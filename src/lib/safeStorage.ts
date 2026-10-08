/** Non-throwing access to browser storage, which may be disabled by the host. */
export const safeStorage = {
  get(key: string): string | null {
    try {
      return globalThis.localStorage.getItem(key);
    } catch {
      return null;
    }
  },

  set(key: string, value: string): boolean {
    try {
      globalThis.localStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  },
};
