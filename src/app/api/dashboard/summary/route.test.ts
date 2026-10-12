import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';
import { getSession } from '@/lib/session';
import { getDashboardSummary } from '@/lib/dashboard-data';

vi.mock('@/lib/session', () => ({ getSession: vi.fn() }));
vi.mock('@/lib/dashboard-data', () => ({ getDashboardSummary: vi.fn() }));

const get = (q = '') => GET(new NextRequest(`http://localhost/api/dashboard/summary${q}`));

describe('GET /api/dashboard/summary', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires canViewCosts', async () => {
    vi.mocked(getSession).mockResolvedValue({ id: 'u', role: { canViewCosts: false } } as never);
    expect((await get()).status).toBe(403);
  });

  it('validates the period and passes it through', async () => {
    vi.mocked(getSession).mockResolvedValue({ id: 'u', role: { canViewCosts: true } } as never);
    vi.mocked(getDashboardSummary).mockResolvedValue({ period: '6m' } as never);
    expect((await get('?period=2y')).status).toBe(400);
    const res = await get('?period=6m');
    expect(res.status).toBe(200);
    expect(vi.mocked(getDashboardSummary).mock.calls[0][1]).toBe('6m');
  });
});
