/**
 * KeyboardHook - 全局键盘监听器
 *
 * 在真实 Tauri 环境：由 Rust 后端通过 rdev 监听全局键盘事件，
 *   前端通过 Tauri Event 接收触发通知。不在前端注册 document listener。
 *
 * 在浏览器预览环境：监听 document keydown 事件模拟输入缓冲区，
 *   当识别到注册的 trigger + Enter/Space 时触发回调。
 */

import { listen } from "./eventBridge";
import { Command } from "./types";
import { updateTauriCommands } from "./tauriCommands";

// More robust Tauri detection for v2
const isTauri = typeof window !== "undefined" && 
  ((window as any).__TAURI__ !== undefined || 
   (window as any).__TAURI_INTERNALS__ !== undefined ||
   (window as any).tauri !== undefined);

console.log("[keyboardHook] isTauri detection:", isTauri);
console.log("[keyboardHook] window.__TAURI__:", (window as any).__TAURI__);
console.log("[keyboardHook] window.__TAURI_INTERNALS__:", (window as any).__TAURI_INTERNALS__);
console.log("[keyboardHook] window.tauri:", (window as any).tauri);

type TriggerCallback = (command: Command) => void;

let buffer = "";
let commands: Command[] = [];
let callback: TriggerCallback | null = null;
let unlistenFn: (() => void) | null = null;

// ─── Browser fallback (only used when NOT in Tauri) ──────────────────────────

function handleKeydown(e: KeyboardEvent) {
  if (e.key === "Backspace") {
    buffer = buffer.slice(0, -1);
    return;
  }
  if (e.key === "Escape") {
    buffer = "";
    return;
  }
  if (e.key === "Enter" || e.key === " " || e.key === "Tab") {
    checkBuffer();
    buffer = "";
    return;
  }
  if (e.key.length === 1) {
    buffer += e.key;
    // keep last 64 chars to avoid memory bloat
    if (buffer.length > 64) buffer = buffer.slice(-64);
    checkBuffer();
  }
}

function checkBuffer() {
  if (!callback) return;
  const enabled = commands.filter((c) => c.enabled);
  for (const cmd of enabled) {
    if (buffer.endsWith(cmd.trigger)) {
      buffer = "";
      callback(cmd);
      break;
    }
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function startKeyboardHook(
  cmds: Command[],
  cb: TriggerCallback
): Promise<boolean> {
  commands = cmds;
  callback = cb;

  // 先清理旧的监听器，避免重复注册
  if (unlistenFn) {
    unlistenFn();
    unlistenFn = null;
  }

  if (isTauri) {
    // ── Tauri environment: rely entirely on Rust rdev global listener ──
    console.log("[keyboardHook] Tauri mode: using Rust rdev global listener");

    // Listen for events from Rust backend
    unlistenFn = await listen<string>("command-triggered", (event) => {
      const trigger = event.payload;
      console.log("[keyboardHook] Received trigger from Rust:", trigger);
      const found = commands.find((c) => c.trigger === trigger && c.enabled);
      if (found && callback) callback(found);
    });

    // Sync commands to Rust backend (监听器在 Rust 启动时自动开启)
    await syncCommandsToBackend(cmds);
  } else {
    // ── Browser fallback: use document keydown listener ──
    console.log("[keyboardHook] Browser mode: using document keydown listener");
    document.addEventListener("keydown", handleKeydown, true);
  }

  return true;
}

export function updateCommands(cmds: Command[]) {
  console.log("[keyboardHook] updateCommands called with", cmds.length, "commands");
  console.log("[keyboardHook] commands:", JSON.stringify(cmds.map(c => ({ id: c.id, trigger: c.trigger, type: c.type, enabled: c.enabled }))));
  commands = cmds;
  // Sync updated commands to Rust backend (fire-and-forget)
  if (isTauri) {
    console.log("[keyboardHook] isTauri=true, calling syncCommandsToBackend");
    syncCommandsToBackend(cmds);
  } else {
    console.log("[keyboardHook] isTauri=false, skipping sync");
  }
}

// 监听器始终运行，无需停止功能
export function stopKeyboardHook(): void {
  // 只移除浏览器端的监听器
  document.removeEventListener("keydown", handleKeydown, true);

  if (unlistenFn) {
    unlistenFn();
    unlistenFn = null;
  }
  buffer = "";
  callback = null;
}

/** Convert Command[] to the shape expected by Rust CommandDef and sync */
async function syncCommandsToBackend(cmds: Command[]): Promise<void> {
  // Protect against syncing empty commands array which would overwrite
  // user's saved commands with only built-in defaults
  if (cmds.length === 0) {
    console.warn("[keyboardHook] Skipping sync - commands array is empty, preventing data loss");
    return;
  }
  
  try {
    const payload = cmds.map((c) => ({
      id: c.id,
      trigger: c.trigger,
      type: c.type,
      label: c.label,
      value: c.value,
      enabled: c.enabled,
      group_id: c.groupId || "default",
      tags: c.tags || [],
    }));
    console.log("[keyboardHook] syncCommandsToBackend - payload:", JSON.stringify(payload.map(p => ({ id: p.id, trigger: p.trigger, group_id: p.group_id }))));
    await updateTauriCommands(payload);
  } catch (err) {
    console.warn("[keyboardHook] syncCommandsToBackend failed:", err);
  }
}
