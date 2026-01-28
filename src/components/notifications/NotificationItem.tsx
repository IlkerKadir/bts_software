'use client';

import { useRouter } from 'next/navigation';
import { Bell, CheckCircle, XCircle, Clock, AlertTriangle, Info } from 'lucide-react';
import type { NotificationType } from '@/lib/services/notification-service';

interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string | null;
  isRead: boolean;
  createdAt: string;
}

interface NotificationItemProps {
  notification: Notification;
  onMarkAsRead: (id: string) => void;
}

const typeIcons: Record<NotificationType, typeof Bell> = {
  APPROVAL_NEEDED: AlertTriangle,
  QUOTE_APPROVED: CheckCircle,
  QUOTE_REJECTED: XCircle,
  QUOTE_EXPIRING: Clock,
  FOLLOW_UP_REMINDER: Bell,
  SYSTEM: Info,
};

const typeColors: Record<NotificationType, string> = {
  APPROVAL_NEEDED: 'text-amber-500 bg-amber-50',
  QUOTE_APPROVED: 'text-green-500 bg-green-50',
  QUOTE_REJECTED: 'text-red-500 bg-red-50',
  QUOTE_EXPIRING: 'text-orange-500 bg-orange-50',
  FOLLOW_UP_REMINDER: 'text-blue-500 bg-blue-50',
  SYSTEM: 'text-primary-500 bg-primary-50',
};

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return 'Az önce';
  if (diffMins < 60) return `${diffMins} dakika önce`;
  if (diffHours < 24) return `${diffHours} saat önce`;
  if (diffDays < 7) return `${diffDays} gün önce`;
  return date.toLocaleDateString('tr-TR');
}

export function NotificationItem({ notification, onMarkAsRead }: NotificationItemProps) {
  const router = useRouter();
  const Icon = typeIcons[notification.type] || Bell;
  const colorClasses = typeColors[notification.type] || 'text-primary-500 bg-primary-50';

  const handleClick = async () => {
    if (!notification.isRead) {
      onMarkAsRead(notification.id);
    }
    if (notification.link) {
      router.push(notification.link);
    }
  };

  return (
    <button
      onClick={handleClick}
      className={`w-full flex items-start gap-3 p-3 text-left hover:bg-primary-50 transition-colors ${
        !notification.isRead ? 'bg-blue-50/50' : ''
      }`}
    >
      <div className={`p-2 rounded-full ${colorClasses}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className={`text-sm ${!notification.isRead ? 'font-semibold' : 'font-medium'} text-primary-900 truncate`}>
            {notification.title}
          </p>
          {!notification.isRead && (
            <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
          )}
        </div>
        <p className="text-xs text-primary-600 line-clamp-2 mt-0.5">{notification.message}</p>
        <p className="text-xs text-primary-400 mt-1">{formatTimeAgo(notification.createdAt)}</p>
      </div>
    </button>
  );
}
