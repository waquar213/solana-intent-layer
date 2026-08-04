/**
 * A localStorage-shaped SYNCHRONOUS key/value store for React Native, backed by
 * AsyncStorage. The web app's non-secret prefs (settings, contacts, the multi-account
 * index) assume a synchronous localStorage; RN's AsyncStorage is async. So we keep an
 * in-memory cache that is hydrated ONCE at startup (await hydrateStorage() before the
 * first render) and written through to AsyncStorage on every set/remove — which lets the
 * web logic modules port with a single `localStorage` → `storage` swap.
 *
 * Secrets NEVER live here: the sealed (encrypted) vault stays in the OS keystore via
 * expo-secure-store (see wallet.ts). Only public preferences use this store.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const cache = new Map<string, string>();

export const storage = {
  getItem(key: string): string | null {
    return cache.get(key) ?? null;
  },
  setItem(key: string, value: string): void {
    cache.set(key, value);
    // Surface (don't swallow) a failed durable write: the in-memory cache still reflects the value
    // for this session, but if AsyncStorage rejects, the change won't survive a restart — log it
    // rather than letting the rejection vanish, so a silent persistence failure is at least visible.
    AsyncStorage.setItem(key, value).catch((e: unknown) => console.warn(`storage: persist "${key}" failed`, e));
  },
  removeItem(key: string): void {
    cache.delete(key);
    AsyncStorage.removeItem(key).catch((e: unknown) => console.warn(`storage: remove "${key}" failed`, e));
  },
  /** Remove EVERY cached key with `prefix`, from the in-memory cache AND durable storage. Used on a wipe
   *  to sweep all `iw.`/`iw_` prefs so the NEXT wallet on this device can't inherit the prior owner's Auto
   *  mode / spend caps / address book / recents. Mirrors the web wipe's localStorage sweep. (hydrateStorage
   *  loads every persisted key into the cache at startup, so this covers all persisted prefs.) */
  removeByPrefix(prefix: string): void {
    for (const key of [...cache.keys()]) {
      if (key.startsWith(prefix)) {
        cache.delete(key);
        AsyncStorage.removeItem(key).catch((e: unknown) => console.warn(`storage: remove "${key}" failed`, e));
      }
    }
  },
};

/** Load all persisted keys into the in-memory cache. Call once before the first render. */
export async function hydrateStorage(): Promise<void> {
  const keys = await AsyncStorage.getAllKeys();
  if (keys.length === 0) return;
  const entries = await AsyncStorage.multiGet(keys);
  for (const [key, value] of entries) {
    if (value != null) cache.set(key, value);
  }
}
