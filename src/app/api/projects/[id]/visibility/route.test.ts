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
    role: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

vi.mock('@/lib/session', () => ({
  getSession: vi.fn(),
}));

const managerUser = {
  id: 'manager-1',
  fullName: 'Manager',
  role: {
    id: 'role-mgr',
    name: 'Manager',
    canViewCosts: true,
    canApprove: true,
    canManageUsers: true,
    canExport: true,
    canEditProducts: true,
    canDelete: true,
    canOverrideKatsayi: true,
  },
};

const makeParams = (id: string) => ({ params: Promise.resolve({ id }) });

describe('GET /api/projects/[id]/visibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns creator info alongside visibility', async () => {
    vi.mocked(getSession).mockResolvedValue(managerUser as any);
    vi.mocked(db.project.findUnique).mockResolvedValue({
      id: 'proj-1',
      name: 'Project',
      visibility: 'CREATOR_ONLY',
      visibleTo: [],
      createdBy: {
        id: 'user-sales-1',
        fullName: 'Sales Rep',
        username: 'sales1',
      },
    } as any);

    const req = new NextRequest('http://localhost/api/projects/proj-1/visibility');
    const res = await GET(req, makeParams('proj-1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.createdBy).toEqual({
      id: 'user-sales-1',
      fullName: 'Sales Rep',
      username: 'sales1',
    });
  });

  it('returns createdBy: null when project has no creator (legacy)', async () => {
    vi.mocked(getSession).mockResolvedValue(managerUser as any);
    vi.mocked(db.project.findUnique).mockResolvedValue({
      id: 'proj-1',
      name: 'Legacy Project',
      visibility: 'CREATOR_ONLY',
      visibleTo: [],
      createdBy: null,
    } as any);

    const req = new NextRequest('http://localhost/api/projects/proj-1/visibility');
    const res = await GET(req, makeParams('proj-1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.createdBy).toBeNull();
  });
});

describe('GET /api/projects/[id]/visibility — multi-role', () => {
  it('returns all selected roles, primary first, deduped', async () => {
    vi.mocked(getSession).mockResolvedValue(managerUser as any);
    vi.mocked(db.project.findUnique).mockResolvedValue({
      id: 'proj-3',
      name: 'Rol projesi',
      visibility: 'ROLE',
      visibleTo: [],
      createdBy: null,
      visibleToRole: { id: 'r-sales', name: 'Satış' },
      visibleRoles: [
        { role: { id: 'r-sales', name: 'Satış' } },
        { role: { id: 'r-dir', name: 'Satış Direktörü' } },
      ],
    } as any);
    const res = await GET(new NextRequest('http://localhost/api/projects/proj-3/visibility'), makeParams('proj-3'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.selectedRoles).toEqual([
      { id: 'r-sales', name: 'Satış' },
      { id: 'r-dir', name: 'Satış Direktörü' },
    ]);
  });
});
