'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, CheckCircle, Filter, Trash2 } from 'lucide-react';
import { Button, Card, Badge, Spinner } from '@/components/ui';

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  link?: string | null;
  isRead: boolean;
  createdAt: string;
}

const typeLabels: Record<string, string> = {
  APPROVAL_NEEDED: 'Onay Gerekli',
  QUOTE_APPROVED: 'Teklif Onaylandı',
  QUOTE_REJECTED: 'Revizyon Gerekli',
  STATUS_CHANGED: 'Durum Değişti',
  REMINDER: 'Hatırlatma',
  SYSTEM: 'Sistem',
};

const typeVariants: Record<string, 'default' | 'warning' | 'success' | 'error' | 'info'> = {
  APPROVAL_NEEDED: 'warning',
  QUOTE_APPROVED: 'success',
  QUOTE_REJECTED: 'error',
  STATUS_CHANGED: 'info',
  REMINDER: 'warning',
  SYSTEM: 'default',
};

export default function NotificationsPage() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const fetchNotifications = useCallback(async () => {
    try {
      const response = await fetch('/api/notifications');
      if (response.ok) {
        const data = await response.json();
        setNotifications(data.notifications || []);
      }
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const handleMarkAsRead = async (id: string) => {
    try {
      const response = await fetch(`/api/notifications/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isRead: true }),
      });

      if (response.ok) {
        setNotifications((prev) =>
          prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
        );
      }
    } catch (error) {
      console.error('Failed to mark as read:', error);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      const response = await fetch('/api/notifications/mark-all-read', {
        method: 'POST',
      });

      if (response.ok) {
        setNotifications((prev) =>
          prev.map((n) => ({ ...n, isRead: true }))
        );
      }
    } catch (error) {
      console.error('Failed to mark all as read:', error);
    }
  };

  const handleClick = async (notification: Notification) => {
    if (!notification.isRead) {
      await handleMarkAsRead(notification.id);
    }
    if (notification.link) {
      router.push(notification.link);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Az önce';
    if (diffMins < 60) return `${diffMins} dakika önce`;
    if (diffHours < 24) return `${diffHours} saat önce`;
    if (diffDays < 7) return `${diffDays} gün önce`;

    return date.toLocaleDateString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const filteredNotifications = filter === 'unread'
    ? notifications.filter((n) => !n.isRead)
    : notifications;

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Bell className="w-6 h-6 text-primary-600" />
          <h1 className="text-2xl font-bold text-primary-900">Bildirimler</h1>
          {unreadCount > 0 && (
            <Badge variant="error">{unreadCount} okunmamış</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={filter === 'all' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setFilter('all')}
          >
            Tümü
          </Button>
          <Button
            variant={filter === 'unread' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setFilter('unread')}
          >
            Okunmamış
          </Button>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" onClick={handleMarkAllAsRead}>
              <CheckCircle className="w-4 h-4 mr-1" />
              Tümünü Okundu İşaretle
            </Button>
          )}
        </div>
      </div>

      {/* Notifications List */}
      {filteredNotifications.length > 0 ? (
        <Card>
          <div className="divide-y divide-primary-100">
            {filteredNotifications.map((notification) => (
              <div
                key={notification.id}
                onClick={() => handleClick(notification)}
                className={`
                  p-4 cursor-pointer transition-colors
                  ${notification.isRead ? 'bg-white' : 'bg-accent-50'}
                  hover:bg-primary-50
                `}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge
                        variant={typeVariants[notification.type] || 'default'}
                        className="text-xs"
                      >
                        {typeLabels[notification.type] || notification.type}
                      </Badge>
                      {!notification.isRead && (
                        <span className="w-2 h-2 bg-accent-500 rounded-full" />
                      )}
                    </div>
                    <h3 className="font-medium text-primary-900">
                      {notification.title}
                    </h3>
                    <p className="text-sm text-primary-600 mt-1">
                      {notification.message}
                    </p>
                  </div>
                  <span className="text-xs text-primary-500 whitespace-nowrap">
                    {formatDate(notification.createdAt)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : (
        <Card>
          <div className="p-12 text-center">
            <Bell className="w-12 h-12 text-primary-300 mx-auto mb-4" />
            <p className="text-primary-600">
              {filter === 'unread'
                ? 'Okunmamış bildiriminiz bulunmuyor'
                : 'Henüz bildiriminiz bulunmuyor'}
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}
