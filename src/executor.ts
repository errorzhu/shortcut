import { Command } from "./types";
import { openUrl, launchApp, openFolder } from "./tauriCommands";
import { formatDate, formatDateTime, expandTextVariables } from "./commandStore";

// Robust Tauri detection matching other modules
const isTauri = typeof window !== "undefined" && (
  (window as any).__TAURI__ !== undefined ||
  (window as any).__TAURI_INTERNALS__ !== undefined ||
  (window as any).tauri !== undefined
);

export interface ExecutionResult {
  success: boolean;
  message: string;
  output?: string;
}

/**
 * Execute a command.
 *
 * In Tauri production: the Rust backend (rdev + enigo) already handles
 * the actual action (delete trigger, type replacement, open URL, launch app).
 * The frontend only needs to record the result for UI feedback (notifications,
 * activity log). We must NOT re-execute the action here.
 *
 * In browser dev mode: we fall back to clipboard / window.open for preview.
 */
export async function executeCommand(
  command: Command
): Promise<ExecutionResult> {
  try {
    // ── Tauri environment: Rust already executed the action ──
    if (isTauri) {
      switch (command.type) {
        case "date": {
          const dateStr =
            command.value === "datetime" ? formatDateTime() : formatDate();
          return {
            success: true,
            message: `日期已输出: ${dateStr}`,
            output: dateStr,
          };
        }
        case "url": {
          return {
            success: true,
            message: `已在浏览器中打开 ${command.value}`,
            output: command.value,
          };
        }
        case "app": {
          return {
            success: true,
            message: `已启动 ${command.label}`,
            output: command.value,
          };
        }
        case "folder": {
          return {
            success: true,
            message: `已打开文件夹 ${command.label}`,
            output: command.value,
          };
        }
        case "text": {
          return {
            success: true,
            message: `文本已输出`,
            output: command.value,
          };
        }
        case "script": {
          return {
            success: false,
            message: "脚本类型暂未实现",
          };
        }
        default:
          return { success: false, message: `未知命令类型` };
      }
    }

    // ── Browser fallback: simulate actions for dev preview ──
    switch (command.type) {
      case "date": {
        const dateStr =
          command.value === "datetime" ? formatDateTime() : formatDate();
        await copyToClipboard(dateStr);
        return {
          success: true,
          message: `日期已复制到剪贴板`,
          output: dateStr,
        };
      }

      case "url": {
        await openUrl(command.value);
        return {
          success: true,
          message: `已在浏览器中打开 ${command.value}`,
          output: command.value,
        };
      }

      case "app": {
        await launchApp(command.value);
        return {
          success: true,
          message: `已启动 ${command.label}`,
          output: command.value,
        };
      }

      case "folder": {
        await openFolder(command.value);
        return {
          success: true,
          message: `已打开文件夹 ${command.label}`,
          output: command.value,
        };
      }

      case "text": {
        const expandedText = expandTextVariables(command.value);
        await copyToClipboard(expandedText);
        return {
          success: true,
          message: `文本已复制到剪贴板`,
          output: expandedText,
        };
      }

      case "script": {
        return {
          success: false,
          message: "脚本类型暂未实现",
        };
      }

      default:
        return { success: false, message: `未知命令类型` };
    }
  } catch (err) {
    return {
      success: false,
      message: `执行失败: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

async function copyToClipboard(text: string): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    await navigator.clipboard.writeText(text);
  }
}
