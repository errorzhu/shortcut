import { useState } from "react";
import { Command, CommandGroup } from "../types";
import { Plus, Edit2, Trash2, Globe, Calendar, AppWindow, Type, Lock, ToggleLeft, ToggleRight, ChevronDown, ChevronRight, FolderOpen } from "lucide-react";
import GroupManager from "./GroupManager";
import "./GroupedCommandList.css";

interface Props {
  commands: Command[];
  groups: CommandGroup[];
  onEdit: (cmd: Command) => void;
  onDelete: (id: string) => void;
  onToggle: (id: string) => void;
  onCreateNew: (groupId?: string) => void;
  onGroupsChange: () => void;
}

const TYPE_CONFIG = {
  date: { icon: Calendar, label: "日期", color: "#ffd166" },
  url: { icon: Globe, label: "网址", color: "#7c6af7" },
  app: { icon: AppWindow, label: "应用", color: "#3ddc84" },
  text: { icon: Type, label: "文本", color: "#60c8ff" },
  script: { icon: Type, label: "脚本", color: "#ff9f7f" },
};

export default function GroupedCommandList({ commands, groups, onEdit, onDelete, onToggle, onCreateNew, onGroupsChange }: Props) {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  const toggleGroup = (groupId: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  // Filter commands by search
  const filteredCommands = searchQuery
    ? commands.filter(
        (cmd) =>
          cmd.trigger.toLowerCase().includes(searchQuery.toLowerCase()) ||
          cmd.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
          cmd.tags.some((tag) => tag.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : commands;

  // Group commands
  const groupedCommands = groups.map((group) => ({
    group,
    commands: filteredCommands.filter((cmd) => cmd.groupId === group.id),
  }));

  // Commands without group (fallback to default)
  const ungroupedCommands = filteredCommands.filter(
    (cmd) => !groups.find((g) => g.id === cmd.groupId)
  );

  return (
    <div className="grouped-list-root">
      <div className="grouped-header">
        <div className="grouped-header-top">
          <div className="grouped-header-left">
            <h2 className="grouped-title">命令管理</h2>
            <span className="grouped-count">{commands.length} 条</span>
          </div>
          <div className="grouped-header-actions">
            <GroupManager groups={groups} onGroupsChange={onGroupsChange} />
            <button className="create-btn" onClick={() => {
              console.log("[GroupedCommandList] Create new command, selectedGroupId:", selectedGroupId);
              onCreateNew(selectedGroupId ?? undefined);
            }}>
              <Plus size={14} />
              <span>新建命令</span>
            </button>
          </div>
        </div>

        <div className="search-bar">
          <input
            type="text"
            className="search-input"
            placeholder="搜索命令、标签..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="grouped-body">
        {filteredCommands.length === 0 && (
          <div className="empty-state">
            <div className="empty-icon">
              <FolderOpen size={48} />
            </div>
            <p>{searchQuery ? "未找到匹配的命令" : "暂无命令，点击「新建命令」开始"}</p>
          </div>
        )}

        {groupedCommands.map(({ group, commands: groupCommands }) => {
          const isCollapsed = collapsedGroups.has(group.id);
          return (
            <div key={group.id} className="group-section">
              <div 
                className={`group-header ${selectedGroupId === group.id ? 'group-selected' : ''}`} 
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedGroupId(group.id);
                  toggleGroup(group.id);
                }}
              >
                <div className="group-header-left">
                  <button className="collapse-btn">
                    {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                  </button>
                  <div className="group-color-indicator" style={{ background: group.color }} />
                  <span className="group-name">{group.name}</span>
                  <span className="group-count">{groupCommands.length}</span>
                </div>
              </div>

              {!isCollapsed && (
                <div className="group-commands">
                  {groupCommands.length === 0 && (
                    <div className="group-empty">
                      暂无命令
                    </div>
                  )}
                  <div className="cmd-grid">
                    {groupCommands.map((cmd) => {
                      const cfg = TYPE_CONFIG[cmd.type] ?? TYPE_CONFIG.text;
                      const Icon = cfg.icon;
                      return (
                        <div key={cmd.id} className={`cmd-card ${!cmd.enabled ? "cmd-disabled" : ""}`}>
                          <div className="cmd-card-top">
                            <div className="cmd-type-badge" style={{ color: cfg.color, borderColor: `${cfg.color}33`, background: `${cfg.color}11` }}>
                              <Icon size={11} />
                              <span>{cfg.label}</span>
                            </div>
                            {cmd.builtIn && (
                              <div className="builtin-badge">
                                <Lock size={9} />
                                <span>内置</span>
                              </div>
                            )}
                            <div className="cmd-usage">
                              使用 {cmd.usageCount} 次
                            </div>
                          </div>

                          <div className="cmd-trigger">
                            <code>{cmd.trigger}</code>
                          </div>

                          <div className="cmd-label">{cmd.label}</div>
                          <div className="cmd-desc">{cmd.description}</div>

                          {cmd.tags.length > 0 && (
                            <div className="cmd-tags">
                              {cmd.tags.map((tag, i) => (
                                <span key={i} className="cmd-tag">{tag}</span>
                              ))}
                            </div>
                          )}

                          <div className="cmd-value-row">
                            <span className="cmd-value-label">→</span>
                            <code className="cmd-value">{cmd.value}</code>
                          </div>

                          <div className="cmd-card-actions">
                            <button
                              className="action-toggle"
                              onClick={() => onToggle(cmd.id)}
                              title={cmd.enabled ? "点击禁用" : "点击启用"}
                            >
                              {cmd.enabled
                                ? <ToggleRight size={18} color="var(--green)" />
                                : <ToggleLeft size={18} color="var(--text-muted)" />
                              }
                            </button>
                            <div className="action-btns">
                              <button className="action-btn" onClick={() => onEdit(cmd)} title="编辑">
                                <Edit2 size={13} />
                              </button>
                              {!cmd.builtIn && (
                                <button className="action-btn action-delete" onClick={() => onDelete(cmd.id)} title="删除">
                                  <Trash2 size={13} />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {ungroupedCommands.length > 0 && (
          <div className="group-section">
            <div className="group-header">
              <div className="group-header-left">
                <span className="group-name">未分组</span>
                <span className="group-count">{ungroupedCommands.length}</span>
              </div>
            </div>
            <div className="group-commands">
              <div className="cmd-grid">
                {ungroupedCommands.map((cmd) => {
                  const cfg = TYPE_CONFIG[cmd.type] ?? TYPE_CONFIG.text;
                  const Icon = cfg.icon;
                  return (
                    <div key={cmd.id} className={`cmd-card ${!cmd.enabled ? "cmd-disabled" : ""}`}>
                      <div className="cmd-card-top">
                        <div className="cmd-type-badge" style={{ color: cfg.color, borderColor: `${cfg.color}33`, background: `${cfg.color}11` }}>
                          <Icon size={11} />
                          <span>{cfg.label}</span>
                        </div>
                        <div className="cmd-usage">使用 {cmd.usageCount} 次</div>
                      </div>
                      <div className="cmd-trigger"><code>{cmd.trigger}</code></div>
                      <div className="cmd-label">{cmd.label}</div>
                      <div className="cmd-desc">{cmd.description}</div>
                      <div className="cmd-value-row">
                        <span className="cmd-value-label">→</span>
                        <code className="cmd-value">{cmd.value}</code>
                      </div>
                      <div className="cmd-card-actions">
                        <button className="action-toggle" onClick={() => onToggle(cmd.id)}>
                          {cmd.enabled ? <ToggleRight size={18} color="var(--green)" /> : <ToggleLeft size={18} color="var(--text-muted)" />}
                        </button>
                        <div className="action-btns">
                          <button className="action-btn" onClick={() => onEdit(cmd)}><Edit2 size={13} /></button>
                          {!cmd.builtIn && <button className="action-btn action-delete" onClick={() => onDelete(cmd.id)}><Trash2 size={13} /></button>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}