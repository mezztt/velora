import { useEffect, useRef, useState } from "react";
import Icon from "./Icons";
import { API_URL } from "../apiBase";

interface NotificationItem {
  id: number;
  type: string;
  title: string;
  message: string | null;
  read: boolean;
  created_at: string;
}


function authHeaders() {
  const token = localStorage.getItem("velora_token");
  return { Authorization: `Bearer ${token}` };
}

const TYPE_ICON: Record<string, string> = {
  LOGIN: "🔑",
  STOCK_BAJO: "⚠",
  CUENTA_CORRIENTE: "💳",
  VENCIMIENTO: "⏰",
  SISTEMA: "🔔",
  PEDIDO_WEB: "🛒",
  ARREPENTIMIENTO: "↩",
};

function timeAgo(dateStr: string) {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "ahora";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return `hace ${days} d`;
}

function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  async function loadNotifications() {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/notifications`, {
        headers: authHeaders(),
      });
      if (!response.ok) return;
      const data = await response.json();
      setNotifications(data.notifications);
      setUnreadCount(data.unread_count);
    } catch (error) {
      console.error("Error cargando notificaciones:", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadNotifications();
    const interval = setInterval(loadNotifications, 60000); // cada 1 min
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function markAsRead(id: number) {
    setNotifications((current) =>
      current.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
    setUnreadCount((current) => Math.max(0, current - 1));
    try {
      await fetch(`${API_URL}/notifications/${id}/read`, {
        method: "POST",
        headers: authHeaders(),
      });
    } catch (error) {
      console.error("Error marcando como leída:", error);
    }
  }

  async function markAllAsRead() {
    setNotifications((current) => current.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
    try {
      await fetch(`${API_URL}/notifications/read-all`, {
        method: "POST",
        headers: authHeaders(),
      });
    } catch (error) {
      console.error("Error marcando todas como leídas:", error);
    }
  }

  function toggleOpen() {
    setOpen((current) => {
      if (!current) loadNotifications();
      return !current;
    });
  }

  return (
    <div className="vl-bell" ref={wrapperRef}>
      <button
        className="notification-button"
        title="Notificaciones"
        aria-label={unreadCount > 0 ? `Notificaciones, ${unreadCount} sin leer` : "Notificaciones"}
        aria-expanded={open}
        type="button"
        onClick={toggleOpen}
      >
        <Icon name="bell" size={18} />
        {unreadCount > 0 && (
          <span className="vl-bell-count">{unreadCount > 9 ? "9+" : unreadCount}</span>
        )}
      </button>

      {open && (
        <div className="vl-bell-panel" role="dialog" aria-label="Notificaciones">
          <div className="vl-bell-head">
            <strong>Notificaciones</strong>
            {unreadCount > 0 && (
              <button type="button" className="vl-bell-readall" onClick={markAllAsRead}>
                Marcar todas como leídas
              </button>
            )}
          </div>

          {loading && notifications.length === 0 ? (
            <div className="vl-bell-empty">Cargando...</div>
          ) : notifications.length === 0 ? (
            <div className="vl-bell-empty">No hay notificaciones todavía.</div>
          ) : (
            notifications.map((notification) => (
              <button
                key={notification.id}
                type="button"
                className={`vl-bell-item ${notification.read ? "is-read" : "is-unread"}`}
                onClick={() => !notification.read && markAsRead(notification.id)}
              >
                <span className="vl-bell-icon" aria-hidden="true">
                  {TYPE_ICON[notification.type] || "🔔"}
                </span>
                <span className="vl-bell-text">
                  <strong>{notification.title}</strong>
                  {notification.message && <span>{notification.message}</span>}
                  <small>{timeAgo(notification.created_at)}</small>
                </span>
                {!notification.read && <span className="vl-bell-dot" aria-label="Sin leer" />}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default NotificationsBell;
