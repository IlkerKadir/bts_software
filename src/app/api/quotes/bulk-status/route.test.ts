import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({
  db: {
    quote: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    quoteHistory: {
      create: vi.fn(),
    },
  },
}));

vi.mock('@/lib/session', () => ({
  getSession: vi.fn(),
}));

vi.mock('@/lib/services/notification-service', () => ({
  createNotification: vi.fn().mockResolvedValue({}),
}));

describe('POST /api/quotes/bulk-status', () => {
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
    vi.mocked(db.quote.update).mockResolvedValue({} as never);
    vi.mocked(db.quoteHistory.create).mockResolvedValue({} as never);
  });

  it('returns 401 if not authenticated', async () => {
    vi.mocked(getSession).mockResolvedValue(null);

    const request = new NextRequest('http://localhost/api/quotes/bulk-status', {
      method: 'POST',
      body: JSON.stringify({
        quoteIds: ['q1'],
        status: 'IPTAL',
      }),
    });
    const response = await POST(request);

    expect(response.status).toBe(401);
  });

  it('allows regular user to bulk-update their OWN quotes', async () => {
    vi.mocked(getSession).mockResolvedValue(regularUser as never);
    vi.mocked(db.quote.findMany).mockResolvedValue([
      { id: 'q1', quoteNumber: 'BTS-001', status: 'TASLAK', createdById: 'user1' },
    ] as never);

    const request = new NextRequest('http://localhost/api/quotes/bulk-status', {
      method: 'POST',
      body: JSON.stringify({
        quoteIds: ['q1'],
        status: 'IPTAL',
      }),
    });
    const response = await POST(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.results.success).toHaveLength(1);
  });

  it('PREVENTS regular user from bulk-updating quotes they do NOT own', async () => {
    vi.mocked(getSession).mockResolvedValue(regularUser as never);
    // DB would return empty because createdById filter excludes other users' quotes
    vi.mocked(db.quote.findMany).mockResolvedValue([] as never);

    const request = new NextRequest('http://localhost/api/quotes/bulk-status', {
      method: 'POST',
      body: JSON.stringify({
        quoteIds: ['q1', 'q2'],
        status: 'IPTAL',
      }),
    });
    const response = await POST(request);

    // Verify findMany was called with ownership filter for non-admin
    expect(db.quote.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          createdById: 'user1',
        }),
      })
    );

    // Should return 404 since no quotes match
    expect(response.status).toBe(404);
  });

  it('allows admin user to bulk-update any quotes', async () => {
    vi.mocked(getSession).mockResolvedValue(adminUser as never);
    vi.mocked(db.quote.findMany).mockResolvedValue([
      { id: 'q1', quoteNumber: 'BTS-001', status: 'TASLAK', createdById: 'other-user' },
      { id: 'q2', quoteNumber: 'BTS-002', status: 'TASLAK', createdById: 'another-user' },
    ] as never);

    const request = new NextRequest('http://localhost/api/quotes/bulk-status', {
      method: 'POST',
      body: JSON.stringify({
        quoteIds: ['q1', 'q2'],
        status: 'IPTAL',
      }),
    });
    const response = await POST(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.results.success).toHaveLength(2);
  });

  it('filters mixed quotes for regular user - only updates owned ones', async () => {
    vi.mocked(getSession).mockResolvedValue(regularUser as never);
    // First call (with ownership filter) returns only the user's quotes
    vi.mocked(db.quote.findMany).mockResolvedValue([
      { id: 'q1', quoteNumber: 'BTS-001', status: 'TASLAK', createdById: 'user1' },
    ] as never);

    const request = new NextRequest('http://localhost/api/quotes/bulk-status', {
      method: 'POST',
      body: JSON.stringify({
        quoteIds: ['q1', 'q2'], // q2 belongs to someone else
        status: 'IPTAL',
      }),
    });
    const response = await POST(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    // Only q1 should be updated (q2 filtered out by ownership)
    expect(data.results.success).toHaveLength(1);
    expect(data.results.success[0].id).toBe('q1');

    // Verify the findMany was called with ownership filter
    expect(db.quote.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          createdById: 'user1',
        }),
      })
    );
  });
});
