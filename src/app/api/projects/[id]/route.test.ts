import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from './route';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({
  db: {
    project: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('@/lib/session', () => ({
  getSession: vi.fn(),
}));

const salesUser = {
  id: 'user-sales-1',
  fullName: 'Sales Rep',
  role: {
    id: 'role-sales',
    name: 'Sales',
    canViewCosts: false,
    canApprove: false,
    canManageUsers: false,
    canExport: true,
    canEditProducts: false,
    canDelete: false,
    canOverrideKatsayi: false,
  },
};

const makeParams = (id: string) => ({ params: Promise.resolve({ id }) });

describe('GET /api/projects/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows the creator to view a CREATOR_ONLY project', async () => {
    vi.mocked(getSession).mockResolvedValue(salesUser as any);
    vi.mocked(db.project.findUnique).mockResolvedValue({
      id: 'proj-1',
      name: 'My Project',
      createdById: 'user-sales-1',
      visibility: 'CREATOR_ONLY',
      visibleTo: [],
      quotes: [],
    } as any);

    const req = new NextRequest('http://localhost/api/projects/proj-1');
    const res = await GET(req, makeParams('proj-1'));
    expect(res.status).toBe(200);
  });

  it('blocks non-creators from a CREATOR_ONLY project', async () => {
    vi.mocked(getSession).mockResolvedValue(salesUser as any);
    vi.mocked(db.project.findUnique).mockResolvedValue({
      id: 'proj-1',
      name: 'Other Project',
      createdById: 'user-other',
      visibility: 'CREATOR_ONLY',
      visibleTo: [],
      quotes: [],
    } as any);

    const req = new NextRequest('http://localhost/api/projects/proj-1');
    const res = await GET(req, makeParams('proj-1'));
    expect(res.status).toBe(403);
  });

  it('still allows legacy access via own quote attached to the project', async () => {
    vi.mocked(getSession).mockResolvedValue(salesUser as any);
    vi.mocked(db.project.findUnique).mockResolvedValue({
      id: 'proj-1',
      name: 'Legacy Project',
      createdById: null,
      visibility: 'CREATOR_ONLY',
      visibleTo: [],
      quotes: [{ id: 'q1', quoteNumber: 'BTS-2026-0001', createdById: 'user-sales-1' }],
    } as any);

    const req = new NextRequest('http://localhost/api/projects/proj-1');
    const res = await GET(req, makeParams('proj-1'));
    expect(res.status).toBe(200);
  });
});
