import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createNotification,
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  NotificationType,
} from './notification-service';
import { db } from '@/lib/db';

// Mock Prisma client
vi.mock('@/lib/db', () => ({
  db: {
    notification: {
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

describe('notification-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createNotification', () => {
    it('creates a notification with required fields', async () => {
      const mockNotification = {
        id: 'notif-1',
        userId: 'user-1',
        type: 'APPROVAL_NEEDED' as NotificationType,
        title: 'Onay Bekliyor',
        message: 'BTS-2026-0001 teklifini onaylamanız bekleniyor',
        link: null,
        isRead: false,
        createdAt: new Date(),
      };

      vi.mocked(db.notification.create).mockResolvedValue(mockNotification);

      const result = await createNotification({
        userId: 'user-1',
        type: 'APPROVAL_NEEDED',
        title: 'Onay Bekliyor',
        message: 'BTS-2026-0001 teklifini onaylamanız bekleniyor',
      });

      expect(db.notification.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          type: 'APPROVAL_NEEDED',
          title: 'Onay Bekliyor',
          message: 'BTS-2026-0001 teklifini onaylamanız bekleniyor',
          link: undefined,
        },
      });
      expect(result).toEqual(mockNotification);
    });

    it('creates a notification with optional link', async () => {
      const mockNotification = {
        id: 'notif-2',
        userId: 'user-1',
        type: 'QUOTE_APPROVED' as NotificationType,
        title: 'Teklif Onaylandı',
        message: 'BTS-2026-0001 teklifi onaylandı',
        link: '/quotes/quote-123',
        isRead: false,
        createdAt: new Date(),
      };

      vi.mocked(db.notification.create).mockResolvedValue(mockNotification);

      const result = await createNotification({
        userId: 'user-1',
        type: 'QUOTE_APPROVED',
        title: 'Teklif Onaylandı',
        message: 'BTS-2026-0001 teklifi onaylandı',
        link: '/quotes/quote-123',
      });

      expect(db.notification.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          type: 'QUOTE_APPROVED',
          title: 'Teklif Onaylandı',
          message: 'BTS-2026-0001 teklifi onaylandı',
          link: '/quotes/quote-123',
        },
      });
      expect(result.link).toBe('/quotes/quote-123');
    });
  });

  describe('getNotifications', () => {
    it('returns notifications for a user', async () => {
      const mockNotifications = [
        {
          id: 'notif-1',
          userId: 'user-1',
          type: 'APPROVAL_NEEDED' as NotificationType,
          title: 'Test 1',
          message: 'Message 1',
          link: null,
          isRead: false,
          createdAt: new Date(),
        },
        {
          id: 'notif-2',
          userId: 'user-1',
          type: 'SYSTEM' as NotificationType,
          title: 'Test 2',
          message: 'Message 2',
          link: null,
          isRead: true,
          createdAt: new Date(),
        },
      ];

      vi.mocked(db.notification.findMany).mockResolvedValue(mockNotifications);

      const result = await getNotifications('user-1');

      expect(db.notification.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
      expect(result).toHaveLength(2);
    });

    it('supports pagination with limit', async () => {
      vi.mocked(db.notification.findMany).mockResolvedValue([]);

      await getNotifications('user-1', { limit: 10 });

      expect(db.notification.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        orderBy: { createdAt: 'desc' },
        take: 10,
      });
    });

    it('can filter by unread only', async () => {
      vi.mocked(db.notification.findMany).mockResolvedValue([]);

      await getNotifications('user-1', { unreadOnly: true });

      expect(db.notification.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', isRead: false },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
    });
  });

  describe('getUnreadCount', () => {
    it('returns count of unread notifications', async () => {
      vi.mocked(db.notification.count).mockResolvedValue(5);

      const result = await getUnreadCount('user-1');

      expect(db.notification.count).toHaveBeenCalledWith({
        where: { userId: 'user-1', isRead: false },
      });
      expect(result).toBe(5);
    });

    it('returns 0 when no unread notifications', async () => {
      vi.mocked(db.notification.count).mockResolvedValue(0);

      const result = await getUnreadCount('user-1');

      expect(result).toBe(0);
    });
  });

  describe('markAsRead', () => {
    it('marks a single notification as read', async () => {
      const mockNotification = {
        id: 'notif-1',
        userId: 'user-1',
        type: 'APPROVAL_NEEDED' as NotificationType,
        title: 'Test',
        message: 'Message',
        link: null,
        isRead: true,
        createdAt: new Date(),
      };

      vi.mocked(db.notification.update).mockResolvedValue(mockNotification);

      const result = await markAsRead('notif-1');

      expect(db.notification.update).toHaveBeenCalledWith({
        where: { id: 'notif-1' },
        data: { isRead: true },
      });
      expect(result.isRead).toBe(true);
    });
  });

  describe('markAllAsRead', () => {
    it('marks all notifications as read for a user', async () => {
      vi.mocked(db.notification.updateMany).mockResolvedValue({ count: 5 });

      const result = await markAllAsRead('user-1');

      expect(db.notification.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', isRead: false },
        data: { isRead: true },
      });
      expect(result.count).toBe(5);
    });

    it('returns 0 when no unread notifications', async () => {
      vi.mocked(db.notification.updateMany).mockResolvedValue({ count: 0 });

      const result = await markAllAsRead('user-1');

      expect(result.count).toBe(0);
    });
  });
});
