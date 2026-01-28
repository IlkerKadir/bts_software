import { db } from '@/lib/db';

export type NotificationType =
  | 'APPROVAL_NEEDED'
  | 'QUOTE_APPROVED'
  | 'QUOTE_REJECTED'
  | 'QUOTE_EXPIRING'
  | 'FOLLOW_UP_REMINDER'
  | 'SYSTEM';

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
}

export interface GetNotificationsOptions {
  limit?: number;
  unreadOnly?: boolean;
}

/**
 * Create a new notification for a user
 */
export async function createNotification(input: CreateNotificationInput) {
  return db.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title,
      message: input.message,
      link: input.link,
    },
  });
}

/**
 * Get notifications for a user
 * @param userId - The user ID
 * @param options - Pagination and filter options
 */
export async function getNotifications(
  userId: string,
  options: GetNotificationsOptions = {}
) {
  const { limit = 50, unreadOnly = false } = options;

  return db.notification.findMany({
    where: {
      userId,
      ...(unreadOnly && { isRead: false }),
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

/**
 * Get count of unread notifications for a user
 */
export async function getUnreadCount(userId: string): Promise<number> {
  return db.notification.count({
    where: { userId, isRead: false },
  });
}

/**
 * Mark a single notification as read
 */
export async function markAsRead(notificationId: string) {
  return db.notification.update({
    where: { id: notificationId },
    data: { isRead: true },
  });
}

/**
 * Mark all notifications as read for a user
 */
export async function markAllAsRead(userId: string) {
  return db.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true },
  });
}
