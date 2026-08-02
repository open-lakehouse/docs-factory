/**
 * Cross-tab-group sync store. When multiple <Tabs syncKey="engine"> groups
 * exist on a page, selecting a label in one updates all others live and
 * persists the choice in sessionStorage.
 */

type Listener = (value: string) => void;

interface SyncStore {
  value: string;
  listeners: Set<Listener>;
}

const stores = new Map<string, SyncStore>();

function storageKey(syncKey: string) {
  return `tabs:${syncKey}`;
}

function readStorage(syncKey: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return sessionStorage.getItem(storageKey(syncKey));
  } catch {
    return null;
  }
}

function writeStorage(syncKey: string, value: string) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(storageKey(syncKey), value);
  } catch {
    /* ignore quota errors */
  }
}

function getStore(syncKey: string, fallback: string): SyncStore {
  let store = stores.get(syncKey);
  if (!store) {
    const saved = readStorage(syncKey);
    store = { value: saved ?? fallback, listeners: new Set() };
    stores.set(syncKey, store);
  }
  return store;
}

/** Subscribe to a sync group; returns the current value and an unsubscribe fn. */
export function subscribeTabSync(syncKey: string, labels: string[], onChange: Listener): string {
  const fallback = labels[0] ?? "";
  const store = getStore(syncKey, fallback);
  const valid = labels.includes(store.value) ? store.value : fallback;
  if (valid !== store.value) store.value = valid;
  onChange(valid);
  store.listeners.add(onChange);
  return valid;
}

export function unsubscribeTabSync(syncKey: string, onChange: Listener) {
  stores.get(syncKey)?.listeners.delete(onChange);
}

/** Update every synced tab group and persist. */
export function setTabSync(syncKey: string, value: string) {
  const store = stores.get(syncKey);
  if (!store || store.value === value) return;
  store.value = value;
  writeStorage(syncKey, value);
  for (const listener of store.listeners) listener(value);
}
