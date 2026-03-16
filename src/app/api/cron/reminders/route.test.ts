import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GET } from './route';
import { db } from '@/lib/db';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({
  db: {
    quote: {
      findMany: vi.fn(),
    },
    notification: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    reminder: {
      findMany: vi.fn(),
    },
  },
}));

describe('GET /api/cron/reminders', () => {
  const CRON_SECRET = 'test-cron-secret-123';

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = CRON_SECRET;
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it('returns 401 if no Authorization header is provided', async () => {
    const request = new NextRequest('http://localhost/api/cron/reminders');
    const response = await GET(request);

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.error).toBe('Unauthorized');
  });

  it('returns 401 if Authorization header has wrong token', async () => {
    const request = new NextRequest('http://localhost/api/cron/reminders', {
      headers: { Authorization: 'Bearer wrong-secret' },
    });
    const response = await GET(request);

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.error).toBe('Unauthorized');
  });

  it('returns 401 if Authorization header is not Bearer format', async () => {
    const request = new NextRequest('http://localhost/api/cron/reminders', {
      headers: { Authorization: CRON_SECRET },
    });
    const response = await GET(request);

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.error).toBe('Unauthorized');
  });

  it('returns 500 if CRON_SECRET env variable is not set', async () => {
    delete process.env.CRON_SECRET;

    const request = new NextRequest('http://localhost/api/cron/reminders', {
      headers: { Authorization: `Bearer ${CRON_SECRET}` },
    });
    const response = await GET(request);

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBe('Server configuration error');
  });

  it('processes reminders when valid Bearer token is provided', async () => {
    vi.mocked(db.quote.findMany).mockResolvedValue([]);
    vi.mocked(db.reminder.findMany).mockResolvedValue([]);

    const request = new NextRequest('http://localhost/api/cron/reminders', {
      headers: { Authorization: `Bearer ${CRON_SECRET}` },
    });
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty('staleCount');
    expect(data).toHaveProperty('expiredCount');
    expect(data).toHaveProperty('reminderCount');
    expect(data).toHaveProperty('reminderNotifications');
    expect(data).toHaveProperty('notificationsCreated');
  });
});
