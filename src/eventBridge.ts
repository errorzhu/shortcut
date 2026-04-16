/**
 * Event bridge - wraps @tauri-apps/api/event with browser mock fallback.
 */

type EventCallback<T> = (event: { payload: T }) => void;

// Robust Tauri detection matching other modules
const isTauri = typeof window !== "undefined" && (
  (window as any).__TAURI__ !== undefined ||
  (window as any).__TAURI_INTERNALS__ !== undefined ||
  (window as any).tauri !== undefined
);

export async function listen<T>(
  event: string,
  handler: EventCallback<T>
): Promise<() => void> {
  if (isTauri) {
    const { listen: tauriListen } = await import("@tauri-apps/api/event");
    return tauriListen<T>(event, handler);
  }
  // Browser: no-op, return empty cleanup
  return () => {};
}

export async function emit(event: string, payload?: unknown): Promise<void> {
  if (isTauri) {
    const { emit: tauriEmit } = await import("@tauri-apps/api/event");
    await tauriEmit(event, payload);
  }
}
