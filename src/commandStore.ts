import { Command, CommandType, CommandGroup } from "./types";

// Robust Tauri detection matching keyboardHook.ts and tauriCommands.ts
function isTauriEnv(): boolean {
  const w = window as any;
  const result = typeof window !== "undefined" && (
    w.__TAURI__ !== undefined ||
    w.__TAURI_INTERNALS__ !== undefined ||
    w.tauri !== undefined
  );
  // Debug log to help diagnose issues in compiled app
  if (typeof window !== "undefined") {
    console.log("[commandStore] isTauriEnv check:", {
      has_TAURI: w.__TAURI__ !== undefined,
      has_TAURI_INTERNALS: w.__TAURI_INTERNALS__ !== undefined,
      has_tauri: w.tauri !== undefined,
      result: result
    });
  }
  return result;
}

const DEFAULT_GROUP: CommandGroup = {
  id: "default",
  name: "默认分组",
  color: "#60c8ff",
  order: 0,
  createdAt: Date.now(),
};

const DEFAULT_COMMANDS: Command[] = [
  {
    id: "builtin-date",
    trigger: "-date",
    type: "date",
    label: "打印当前日期",
    value: "date",
    description: "输入 -date 输出当前日期，如：2025-01-15",
    enabled: true,
    builtIn: true,
    createdAt: Date.now(),
    usageCount: 0,
    groupId: "default",
    tags: ["日期"],
  },
  {
    id: "builtin-bd",
    trigger: "-bd",
    type: "url",
    label: "打开百度",
    value: "https://www.baidu.com",
    description: "输入 -bd 在浏览器中打开百度首页",
    enabled: true,
    builtIn: true,
    createdAt: Date.now(),
    usageCount: 0,
    groupId: "default",
    tags: ["搜索"],
  },
  {
    id: "builtin-wx",
    trigger: "-wx",
    type: "app",
    label: "打开微信",
    value: "C:\\Program Files\\Tencent\\WeChat\\WeChat.exe",
    description: "输入 -wx 启动微信客户端",
    enabled: true,
    builtIn: false,
    createdAt: Date.now(),
    usageCount: 0,
    groupId: "default",
    tags: ["社交"],
  },
];

// Convert Tauri CommandDef to frontend Command
function convertCommandDef(cmd: {
  id: string;
  trigger: string;
  type: string;
  label: string;
  value: string;
  enabled: boolean;
  group_id: string;
  tags: string[];
}): Command {
  return {
    id: cmd.id,
    trigger: cmd.trigger,
    type: cmd.type as CommandType,
    label: cmd.label,
    value: cmd.value,
    description: "",
    enabled: cmd.enabled,
    builtIn: cmd.id.startsWith("builtin-"),
    createdAt: Date.now(),
    usageCount: 0,
    groupId: cmd.group_id,
    tags: cmd.tags,
  };
}

// Convert frontend Command to Tauri CommandDef
function convertToCommandDef(cmd: Command): {
  id: string;
  trigger: string;
  type: string;
  label: string;
  value: string;
  enabled: boolean;
  group_id: string;
  tags: string[];
} {
  console.log("[convertToCommandDef] cmd.groupId:", cmd.groupId);
  const result = {
    id: cmd.id,
    trigger: cmd.trigger,
    type: cmd.type,
    label: cmd.label,
    value: cmd.value,
    enabled: cmd.enabled,
    group_id: cmd.groupId || "default",
    tags: cmd.tags || [],
  };
  console.log("[convertToCommandDef] result.group_id:", result.group_id);
  return result;
}

// ============ Group Storage ============

export async function loadGroups(): Promise<CommandGroup[]> {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const groups = await invoke<CommandGroup[]>("load_groups");
    return groups;
  } catch (e) {
    console.error("[commandStore] Failed to load groups:", e);
    return [DEFAULT_GROUP];
  }
}

export async function saveGroups(groups: CommandGroup[]): Promise<void> {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("update_groups", { groups });
  } catch (e) {
    console.error("[commandStore] Failed to save groups:", e);
  }
}

export async function createGroup(name: string, color: string): Promise<CommandGroup> {
  const groups = await loadGroups();
  const newGroup: CommandGroup = {
    id: `group-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name,
    color,
    order: groups.length,
    createdAt: Date.now(),
  };
  groups.push(newGroup);
  await saveGroups(groups);
  return newGroup;
}

export async function updateGroup(group: CommandGroup): Promise<void> {
  const groups = await loadGroups();
  const index = groups.findIndex(g => g.id === group.id);
  if (index !== -1) {
    groups[index] = group;
    await saveGroups(groups);
  }
}

export async function deleteGroup(groupId: string): Promise<void> {
  if (groupId === "default") {
    throw new Error("不能删除默认分组");
  }
  const groups = await loadGroups();
  const filtered = groups.filter(g => g.id !== groupId);
  await saveGroups(filtered);
}

// ============ Command Storage ============

export async function loadCommands(): Promise<Command[]> {
  try {
    const tauri = isTauriEnv();
    console.log("[commandStore] loadCommands - isTauri:", tauri);
    
    if (tauri) {
      const { invoke } = await import("@tauri-apps/api/core");
      console.log("[commandStore] Calling invoke('load_commands')");
      const cmds = await invoke<Array<{
        id: string;
        trigger: string;
        type: string;
        label: string;
        value: string;
        enabled: boolean;
        group_id: string;
        tags: string[];
      }>>("load_commands");
      console.log("[commandStore] Loaded", cmds.length, "commands from Tauri backend");
      return cmds.map(convertCommandDef);
    }
    
    // Browser fallback: use localStorage for development
    console.log("[commandStore] Using localStorage fallback");
    const raw = localStorage.getItem("shortcut_commands");
    if (!raw) return DEFAULT_COMMANDS;
    const parsed = JSON.parse(raw) as Command[];
    const userIds = new Set(parsed.map((c) => c.id));
    const missing = DEFAULT_COMMANDS.filter(
      (d) => d.builtIn && !userIds.has(d.id)
    );
    
    // Ensure all commands have groupId and tags
    const migrated = parsed.map(cmd => ({
      ...cmd,
      groupId: cmd.groupId || "default",
      tags: cmd.tags || [],
    }));
    
    return [...missing, ...migrated];
  } catch (e) {
    console.error("[commandStore] Failed to load commands:", e);
    return DEFAULT_COMMANDS;
  }
}

export async function saveCommands(commands: Command[]): Promise<void> {
  try {
    const tauri = isTauriEnv();
    console.log("[commandStore] saveCommands - isTauri:", tauri, "commands:", commands.length);
    
    if (tauri) {
      const { invoke } = await import("@tauri-apps/api/core");
      const cmdDefs = commands.map(convertToCommandDef);
      console.log("[commandStore] Calling invoke('update_commands') with", cmdDefs.length, "commands");
      await invoke("update_commands", { commands: cmdDefs });
      console.log("[commandStore] Successfully saved commands to Tauri backend");
      return;
    }
    
    // Browser fallback: use localStorage for development
    console.log("[commandStore] Using localStorage fallback");
    localStorage.setItem("shortcut_commands", JSON.stringify(commands));
  } catch (e) {
    console.error("[commandStore] Failed to save commands:", e);
  }
}

export function createCommand(
  trigger: string,
  type: CommandType,
  label: string,
  value: string,
  description: string,
  groupId: string = "default",
  tags: string[] = []
): Command {
  return {
    id: `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    trigger,
    type,
    label,
    value,
    description,
    enabled: true,
    builtIn: false,
    createdAt: Date.now(),
    usageCount: 0,
    groupId,
    tags,
  };
}

export function formatDate(): string {
  const now = new Date();
  return now.toISOString().split("T")[0]; // YYYY-MM-DD
}

export function formatDateTime(): string {
  return new Date().toLocaleString("zh-CN");
}

/**
 * 扩展文本中的变量占位符，将 {{variable}} 替换为实际值
 * 支持的变量：
 * - {{date}}: 当前日期 (YYYY-MM-DD)
 * - {{datetime}}: 当前日期时间 (YYYY-MM-DD HH:mm:ss)
 * - {{time}}: 当前时间 (HH:mm)
 * - {{timestamp}}: 当前时间戳 (毫秒)
 */
export function expandTextVariables(text: string): string {
  const now = new Date();
  
  const replacements: Record<string, string> = {
    "{{date}}": now.toISOString().split("T")[0], // YYYY-MM-DD
    "{{datetime}}": now.toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }),
    "{{time}}": now.toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }),
    "{{timestamp}}": String(now.getTime()),
  };

  let result = text;
  for (const [placeholder, value] of Object.entries(replacements)) {
    result = result.split(placeholder).join(value);
  }
  return result;
}

/**
 * 获取所有可用的变量占位符列表
 */
export function getAvailableVariables(): { placeholder: string; label: string; example: string }[] {
  return [
    { placeholder: "{{date}}", label: "当前日期", example: "2025-04-15" },
    { placeholder: "{{datetime}}", label: "当前日期时间", example: "2025-04-15 13:48:00" },
    { placeholder: "{{time}}", label: "当前时间", example: "13:48" },
    { placeholder: "{{timestamp}}", label: "时间戳", example: "1713160080000" },
  ];
}