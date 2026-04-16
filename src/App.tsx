import { useState, useEffect, useCallback, useRef } from "react";
import { Command, CommandGroup, Notification } from "./types";
import { loadCommands, saveCommands, loadGroups } from "./commandStore";
import { startKeyboardHook, updateCommands } from "./keyboardHook";
import { executeCommand } from "./executor";
import Sidebar from "./components/Sidebar";
import GroupedCommandList from "./components/GroupedCommandList";
import CommandEditor from "./components/CommandEditor";
import StatusBar from "./components/StatusBar";
import NotificationToast from "./components/NotificationToast";
import ActivityFeed from "./components/ActivityFeed";
import GroupManager from "./components/GroupManager";
import "./App.css";

export interface ActivityLog {
  id: string;
  trigger: string;
  label: string;
  success: boolean;
  output?: string;
  timestamp: number;
}

type View = "commands" | "activity" | "settings";

// 监听器始终处于激活状态，无需切换
const LISTENER_ACTIVE = true;

export default function App() {
  const [commands, setCommands] = useState<Command[]>([]);
  const [groups, setGroups] = useState<CommandGroup[]>([]);
  const [view, setView] = useState<View>("commands");
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [editingCommand, setEditingCommand] = useState<Command | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newCommandGroupId, setNewCommandGroupId] = useState<string | null>(null);
  const [activityLog, setActivityLog] = useState<ActivityLog[]>([]);
  const [lastTriggered, setLastTriggered] = useState<string | null>(null);
  const commandsRef = useRef(commands);

  useEffect(() => {
    commandsRef.current = commands;
  }, [commands]);

  // Load commands and groups first, then start keyboard hook after commands are loaded
  // This ensures the hook doesn't sync an empty commands array to the backend
  useEffect(() => {
    let mounted = true;
    
    const init = async () => {
      const [cmds, grps] = await Promise.all([loadCommands(), loadGroups()]);
      if (!mounted) return;
      setCommands(cmds);
      setGroups(grps);
      // Start keyboard hook AFTER commands are loaded
      startKeyboardHook(cmds, handleCommandTriggered);
    };
    
    init();
    
    return () => {
      mounted = false;
    };
  }, []);

  const addNotification = useCallback(
    (message: string, type: Notification["type"] = "info") => {
      const n: Notification = {
        id: `n-${Date.now()}`,
        message,
        type,
      };
      setNotifications((prev) => [...prev, n]);
      setTimeout(() => {
        setNotifications((prev) => prev.filter((x) => x.id !== n.id));
      }, 3500);
    },
    []
  );

  const handleCommandTriggered = useCallback(
    async (cmd: Command) => {
      setLastTriggered(cmd.trigger);
      setTimeout(() => setLastTriggered(null), 2000);

      // increment usage count
      setCommands((prev) => {
        const updated = prev.map((c) =>
          c.id === cmd.id ? { ...c, usageCount: c.usageCount + 1 } : c
        );
        saveCommands(updated).catch(console.error);
        return updated;
      });

      const result = await executeCommand(cmd);

      setActivityLog((prev) => [
        {
          id: `log-${Date.now()}`,
          trigger: cmd.trigger,
          label: cmd.label,
          success: result.success,
          output: result.output,
          timestamp: Date.now(),
        },
        ...prev.slice(0, 49),
      ]);

      addNotification(result.message, result.success ? "success" : "error");
    },
    [addNotification]
  );

  // Sync commands to backend when they change
  useEffect(() => {
    updateCommands(commands);
  }, [commands]);

  const handleSaveCommand = (cmd: Command) => {
    console.log("[App] handleSaveCommand - cmd.groupId:", cmd.groupId);
    setCommands((prev) => {
      const exists = prev.find((c) => c.id === cmd.id);
      const updated = exists
        ? prev.map((c) => (c.id === cmd.id ? cmd : c))
        : [...prev, cmd];
      console.log("[App] handleSaveCommand - updated commands:", updated.map(c => ({ id: c.id, trigger: c.trigger, groupId: c.groupId })));
      saveCommands(updated).catch(console.error);
      return updated;
    });
    setEditingCommand(null);
    setIsCreating(false);
    setNewCommandGroupId(null);
    addNotification(
      `命令 ${cmd.trigger} 已保存`,
      "success"
    );
  };

  const handleDeleteCommand = (id: string) => {
    setCommands((prev) => {
      const updated = prev.filter((c) => c.id !== id);
      saveCommands(updated).catch(console.error);
      return updated;
    });
    addNotification("命令已删除", "info");
  };

  const handleToggleCommand = (id: string) => {
    setCommands((prev) => {
      const updated = prev.map((c) =>
        c.id === id ? { ...c, enabled: !c.enabled } : c
      );
      saveCommands(updated).catch(console.error);
      return updated;
    });
  };

  const handleGroupsChange = async () => {
    const grps = await loadGroups();
    setGroups(grps);
  };

  return (
    <div className="app-shell">
      <Sidebar
        activeView={view}
        onViewChange={setView}
        commandCount={commands.length}
        activityCount={activityLog.length}
        listenerActive={LISTENER_ACTIVE}
      />

      <main className="main-content">
        <StatusBar
          listenerActive={LISTENER_ACTIVE}
          commandCount={commands.filter((c) => c.enabled).length}
          lastTriggered={lastTriggered}
        />

        <div className="content-area">
          {view === "commands" && (
            <>
              {isCreating || editingCommand ? (
                <CommandEditor
                  key={isCreating ? `new-${newCommandGroupId ?? 'default'}` : `edit-${editingCommand?.id}`}
                  command={editingCommand}
                  groups={groups}
                  onSave={handleSaveCommand}
                  onCancel={() => {
                    setEditingCommand(null);
                    setIsCreating(false);
                    setNewCommandGroupId(null);
                  }}
                  defaultGroupId={newCommandGroupId || undefined}
                />
              ) : (
                <GroupedCommandList
                  commands={commands}
                  groups={groups}
                  onEdit={setEditingCommand}
                  onDelete={handleDeleteCommand}
                  onToggle={handleToggleCommand}
                  onCreateNew={(groupId) => {
                    console.log("[App] onCreateNew called with groupId:", groupId);
                    setNewCommandGroupId(groupId || null);
                    setIsCreating(true);
                  }}
                  onGroupsChange={handleGroupsChange}
                />
              )}
            </>
          )}

          {view === "activity" && (
            <ActivityFeed log={activityLog} />
          )}

          {view === "settings" && (
            <div className="placeholder">
              <div className="settings-groups">
                <GroupManager groups={groups} onGroupsChange={handleGroupsChange} />
              </div>
              <p className="placeholder-text">设置页面 — 开发中</p>
            </div>
          )}
        </div>
      </main>

      <NotificationToast notifications={notifications} />
    </div>
  );
}