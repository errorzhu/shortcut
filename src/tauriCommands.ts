/**
 * Tauri command bridge
 * 在真实 Tauri 环境中调用 invoke()，
 * 在浏览器预览中使用 mock 实现。
 */

// Robust Tauri detection matching keyboardHook.ts and commandStore.ts
const isTauri = typeof window !== "undefined" && (
  (window as any).__TAURI__ !== undefined ||
  (window as any).__TAURI_INTERNALS__ !== undefined ||
  (window as any).tauri !== undefined
);

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (isTauri) {
    const { invoke: tauriInvoke } = await import("@tauri-apps/api/core");
    return tauriInvoke<T>(cmd, args);
  }
  // ---- Mock implementations for browser dev ----
  return mockInvoke<T>(cmd, args);
}

function mockInvoke<T>(cmd: string, args?: Record<string, unknown>): T {
  console.log(`[mock] invoke: ${cmd}`, args);
  switch (cmd) {
    case "execute_command":
      return { success: true, message: "Mock executed" } as T;
    case "get_listener_status":
      return { running: true } as T;
    case "start_listener":
      return "started" as T;
    case "stop_listener":
      return "stopped" as T;
    case "update_commands":
      return null as T;
    default:
      return null as T;
  }
}

// ---- Public API ----

export async function executeCommand(
  commandType: string,
  value: string
): Promise<{ success: boolean; message: string }> {
  return invoke("execute_command", { commandType, value });
}

export async function openUrl(url: string): Promise<void> {
  if (isTauri) {
    const { open } = await import("@tauri-apps/plugin-shell");
    return open(url);
  }
  window.open(url, "_blank");
}

export async function launchApp(appPath: string): Promise<void> {
  if (isTauri) {
    const { Command } = await import("@tauri-apps/plugin-shell");
    await Command.create("open-app", [appPath]).execute();
  } else {
    console.log(`[mock] launch app: ${appPath}`);
  }
}

export async function updateTauriCommands(
  commands: { id: string; trigger: string; type: string; label: string; value: string; enabled: boolean }[]
): Promise<void> {
  await invoke("update_commands", { commands });
}
