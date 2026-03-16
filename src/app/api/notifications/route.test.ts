import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';
import { getSession } from '@/lib/session';
import { NextRequest } from 'next/server';

vi.mock('@/lib/session', () => ({
  getSession: vi.fn(),
}));

vi.mock('@/lib/services/notification-service', () => ({
  createNotification: vi.fn().mockResolvedValue({
    id: 'notif-1',
    userId: 'user1',
    type: 'SYSTEM',
    title: 'Test',
    message: 'Test message',
    isRead: false,
    createdAt: new Date(),
  }),
  getNotifications: vi.fn().mockResolvedValue([]),
}));

// Re-import after mock to get the mocked version
import { createNotification } from '@/lib/services/notification-service';

describe('POST /api/notifications', () => {
  const regularUser = {
    id: 'user1',
    fullName: 'Regular User',
    role: {
      id: 'role1',
      name: 'User',
      canViewCosts: true,
      canApprove: false,
      canExport: true,
      canManageUsers: false,
      canEditProducts: false,
      canDelete: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  };

  const adminUser = {
    id: 'admin1',
    fullName: 'Admin User',
    role: {
      id: 'role2',
      name: 'Admin',
      canViewCosts: true,
      canApprove: true,
      canExport: true,
      canManageUsers: true,
      canEditProducts: true,
      canDelete: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 if not authenticated', async () => {
    vi.mocked(getSession).mockResolvedValue(null);

    const request = new NextRequest('http://localhost/api/notifications', {
      method: 'POST',
      body: JSON.stringify({
        type: 'SYSTEM',
        title: 'Test',
        message: 'Test message',
      }),
    });
    const response = await POST(request);

    expect(response.status).toBe(401);
  });

  it('allows regular user to create notification for themselves (no userId in body)', async () => {
    vi.mocked(getSession).mockResolvedValue(regularUser as never);

    const request = new NextRequest('http://localhost/api/notifications', {
      method: 'POST',
      body: JSON.stringify({
        type: 'SYSTEM',
        title: 'Self notification',
        message: 'For myself',
      }),
    });
    const response = await POST(request);

    expect(response.status).toBe(201);
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user1' })
    );
  });

  it('PREVENTS regular user from creating notification for another user', async () => {
    vi.mocked(getSession).mockResolvedValue(regularUser as never);

    const request = new NextRequest('http://localhost/api/notifications', {
      method: 'POST',
      body: JSON.stringify({
        userId: 'other-user-id',
        type: 'SYSTEM',
        title: 'Spoofed notification',
        message: 'This should be blocked',
      }),
    });
    const response = await POST(request);

    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toBeDefined();
    // Ensure createNotification was NOT called
    expect(createNotification).not.toHaveBeenCalled();
  });

  it('allows user with canManageUsers to create notification for another user', async () => {
    vi.mocked(getSession).mockResolvedValue(adminUser as never);

    const request = new NextRequest('http://localhost/api/notifications', {
      method: 'POST',
      body: JSON.stringify({
        userId: 'other-user-id',
        type: 'SYSTEM',
        title: 'Admin notification',
        message: 'This should be allowed',
      }),
    });
    const response = await POST(request);

    expect(response.status).toBe(201);
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'other-user-id' })
    );
  });

  it('allows regular user to pass their own userId explicitly', async () => {
    vi.mocked(getSession).mockResolvedValue(regularUser as never);

    const request = new NextRequest('http://localhost/api/notifications', {
      method: 'POST',
      body: JSON.stringify({
        userId: 'user1', // Same as current user
        type: 'SYSTEM',
        title: 'Own notification',
        message: 'For myself, explicitly',
      }),
    });
    const response = await POST(request);

    expect(response.status).toBe(201);
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user1' })
    );
  });
});
