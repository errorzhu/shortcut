import { Notification } from "../types";
import { CheckCircle, XCircle, Info } from "lucide-react";
import "./NotificationToast.css";

interface Props {
  notifications: Notification[];
}

export default function NotificationToast({ notifications }: Props) {
  return (
    <div className="toast-container">
      {notifications.map((n) => (
        <div key={n.id} className={`toast toast-${n.type}`}>
          {n.type === "success" && <CheckCircle size={14} />}
          {n.type === "error" && <XCircle size={14} />}
          {n.type === "info" && <Info size={14} />}
          <span>{n.message}</span>
        </div>
      ))}
    </div>
  );
}
