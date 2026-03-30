/**
 * In-memory per-plugin view state (tab selection, etc.).
 * Survives navigation within a session; resets on full page reload.
 * Keyed by "{pluginId}:{instanceId}:{field}", values are strings.
 */
const _store: Record<string, string> = {}

export function getViewState(key: string, fallback: string): string {
  return _store[key] ?? fallback
}

export function setViewState(key: string, value: string): void {
  _store[key] = value
}
