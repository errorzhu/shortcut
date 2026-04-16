import { ActivityLog } from "../App";
import { CheckCircle, XCircle, Clock } from "lucide-react";
import "./ActivityFeed.css";

interface Props {
  log: ActivityLog[];
}

function timeAgo(ts: number): string {
  const diff = (Date.now() - ts) / 1000;
  if (diff < 60) return `${Math.floor(diff)}秒前`;
  if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`;
  return `${Math.floor(diff / 3600)}小时前`;
}

export default function ActivityFeed({ log }: Props) {
  return (
    <div className="feed-root">
      <div className="feed-header">
        <h2 className="feed-title">触发日志</h2>
        <span className="feed-count">{log.length} 条记录</span>
      </div>

      <div className="feed-body">
        {log.length === 0 && (
          <div className="feed-empty">
            <Clock size={32} opacity={0.2} />
            <p>暂无记录，启动监听并触发命令后将显示在这里</p>
          </div>
        )}

        <div className="feed-list">
          {log.map((entry) => (
            <div key={entry.id} className={`feed-item ${entry.success ? "item-ok" : "item-fail"}`}>
              <div className="feed-icon">
                {entry.success
                  ? <CheckCircle size={14} color="var(--green)" />
                  : <XCircle size={14} color="var(--red)" />
                }
              </div>
              <div className="feed-content">
                <div className="feed-row">
                  <code className="feed-trigger">{entry.trigger}</code>
                  <span className="feed-sep">·</span>
                  <span className="feed-label">{entry.label}</span>
                </div>
                {entry.output && (
                  <div className="feed-output">{entry.output}</div>
                )}
              </div>
              <div className="feed-time">{timeAgo(entry.timestamp)}</div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
