import { Keyboard, Zap, CheckCircle } from "lucide-react";
import "./StatusBar.css";

interface Props {
  listenerActive: boolean;
  onToggle?: () => void;
  commandCount: number;
  lastTriggered: string | null;
}

export default function StatusBar({
  commandCount,
  lastTriggered,
}: Props) {
  return (
    <header className="status-bar">
      <div className="bar-left">
        <div className="bar-title">
          <Keyboard size={14} className="bar-icon" />
          <span>shortcut</span>
        </div>
        <div className="bar-meta">
          <span className="meta-chip">
            {commandCount} 个命令已启用
          </span>
        </div>
      </div>

      {lastTriggered && (
        <div className="trigger-flash">
          <Zap size={12} />
          <span>{lastTriggered} 已触发</span>
        </div>
      )}

      <div className="bar-right">
        <div className="listener-status">
          <CheckCircle size={13} className="status-icon" />
          <span>监听中</span>
        </div>
      </div>

    </header>
  );
}
