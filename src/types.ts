export type CommandType = "text" | "date" | "url" | "app" | "script";

export interface CommandGroup {
  id: string;
  name: string;
  color: string;
  icon?: string;
  order: number;
  createdAt: number;
}

export interface Command {
  id: string;
  trigger: string;
  type: CommandType;
  label: string;
  value: string;
  description: string;
  enabled: boolean;
  builtIn?: boolean;
  createdAt: number;
  usageCount: number;
  groupId: string;
  tags: string[];
}

export type NotificationType = "success" | "error" | "info";

export interface Notification {
  id: string;
  message: string;
  type: NotificationType;
}