import { Command } from "../types";
import { Plus, Edit2, Trash2, Globe, Calendar, AppWindow, Type, Lock, ToggleLeft, ToggleRight, FolderOpen } from "lucide-react";
import "./CommandList.css";

interface Props {
  commands: Command[];
  onEdit: (cmd: Command) => void;
  onDelete: (id: string) => void;
  onToggle: (id: string) => void;
  onCreateNew: () => void;
}

const TYPE_CONFIG = {
  date: { icon: Calendar, label: "日期", color: "#ffd166" },
  url: { icon: Globe, label: "网址", color: "#7c6af7" },
  app: { icon: AppWindow, label: "应用", color: "#3ddc84" },
  folder: { icon: FolderOpen, label: "文件夹", color: "#f5a623" },
  text: { icon: Type, label: "文本", color: "#60c8ff" },
  script: { icon: Type, label: "脚本", color: "#ff9f7f" },
};

export default function CommandList({ commands, onEdit, onDelete, onToggle, onCreateNew }: Props) {
  return (
    <div className="cmd-list-root">
      <div className="list-header">
        <div className="list-header-left">
          <h2 className="list-title">命令管理</h2>
          <span className="list-count">{commands.length} 条</span>
        </div>
        <button className="create-btn" onClick={onCreateNew}>
          <Plus size={14} />
          <span>新建命令</span>
        </button>
      </div>

      <div className="list-body">
        {commands.length === 0 && (
          <div className="empty-state">
            <div className="empty-icon">⌨</div>
            <p>暂无命令，点击「新建命令」开始</p>
          </div>
        )}

        <div className="cmd-grid">
          {commands.map((cmd) => {
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
    </div>
  );
}
