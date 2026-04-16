import { Terminal, Activity, Settings, Zap } from "lucide-react";
import "./Sidebar.css";

interface Props {
  activeView: string;
  onViewChange: (v: any) => void;
  commandCount: number;
  activityCount: number;
  listenerActive: boolean;
}

export default function Sidebar({
  activeView,
  onViewChange,
  commandCount,
  activityCount,
  listenerActive,
}: Props) {
  const nav = [
    { id: "commands", icon: Terminal, label: "命令", count: commandCount },
    { id: "activity", icon: Activity, label: "日志", count: activityCount },
    { id: "settings", icon: Settings, label: "设置", count: 0 },
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className={`logo-icon ${listenerActive ? "active" : ""}`}>
          <Zap size={18} />
        </div>
        <span className="logo-text">shortcut</span>
      </div>

      <nav className="sidebar-nav">
        {nav.map(({ id, icon: Icon, label, count }) => (
          <button
            key={id}
            className={`nav-item ${activeView === id ? "nav-active" : ""}`}
            onClick={() => onViewChange(id)}
          >
            <Icon size={16} />
            <span className="nav-label">{label}</span>
            {count > 0 && (
              <span className="nav-badge">{count}</span>
            )}
          </button>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className={`status-dot ${listenerActive ? "dot-on" : "dot-off"}`} />
        <span className="status-text">
          {listenerActive ? "监听中" : "已停止"}
        </span>
      </div>

    </aside>
  );
}
