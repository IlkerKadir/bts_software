import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { PUT } from './route';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';

const tx = {
  project: { update: vi.fn() },
  projectUserAccess: { deleteMany: vi.fn(), createMany: vi.fn() },
  projectVisibleRole: { deleteMany: vi.fn(), createMany: vi.fn() },
};

vi.mock('@/lib/db', () => ({
  db: {
    project: { findUnique: vi.fn() },
    role: { findMany: vi.fn() },
    user: { findMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock('@/lib/session', () => ({ getSession: vi.fn() }));

const manager = { id: 'm', role: { canApprove: true, canManageUsers: true } };
const put = (body: unknown) =>
  PUT(new NextRequest('http://localhost/api/projects/p1/visibility', { method: 'PUT', body: JSON.stringify(body) }), {
    params: Promise.resolve({ id: 'p1' }),
  });

describe('PUT /api/projects/[id]/visibility — multi-role', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSession).mockResolvedValue(manager as never);
    vi.mocked(db.$transaction).mockImplementation((async (fn: (t: typeof tx) => unknown) => fn(tx)) as never);
    vi.mocked(db.project.findUnique)
      .mockResolvedValueOnce({ id: 'p1' } as never) // existence check
      .mockResolvedValue({ id: 'p1', name: 'P', visibility: 'ROLE', visibleToRole: null, visibleRoles: [], createdBy: null, visibleTo: [] } as never);
  });

  it('stores all roles, first one as the primary', async () => {
    vi.mocked(db.role.findMany).mockResolvedValue([{ id: 'r1' }, { id: 'r2' }] as never);
    const res = await put({ visibility: 'ROLE', roleIds: ['r1', 'r2'] });
    expect(res.status).toBe(200);
    expect(tx.project.update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { visibility: 'ROLE', visibleToRoleId: 'r1' } });
    expect(tx.projectVisibleRole.deleteMany).toHaveBeenCalledWith({ where: { projectId: 'p1' } });
    expect(tx.projectVisibleRole.createMany).toHaveBeenCalledWith({
      data: [{ projectId: 'p1', roleId: 'r1' }, { projectId: 'p1', roleId: 'r2' }],
    });
  });

  it('accepts the legacy single roleId payload', async () => {
    vi.mocked(db.role.findMany).mockResolvedValue([{ id: 'r9' }] as never);
    const res = await put({ visibility: 'ROLE', roleId: 'r9' });
    expect(res.status).toBe(200);
    expect(tx.project.update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { visibility: 'ROLE', visibleToRoleId: 'r9' } });
  });

  it('rejects ROLE with no roles or with an unknown role', async () => {
    expect((await put({ visibility: 'ROLE', roleIds: [] })).status).toBe(400);
    vi.mocked(db.role.findMany).mockResolvedValue([{ id: 'r1' }] as never);
    expect((await put({ visibility: 'ROLE', roleIds: ['r1', 'ghost'] })).status).toBe(400);
    expect(tx.project.update).not.toHaveBeenCalled();
  });

  it('switching away from ROLE clears both the primary role and the role rows', async () => {
    const res = await put({ visibility: 'EVERYONE' });
    expect(res.status).toBe(200);
    expect(tx.project.update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { visibility: 'EVERYONE', visibleToRoleId: null } });
    expect(tx.projectVisibleRole.deleteMany).toHaveBeenCalledWith({ where: { projectId: 'p1' } });
    expect(tx.projectVisibleRole.createMany).not.toHaveBeenCalled();
  });

  it('is manager-only', async () => {
    vi.mocked(getSession).mockResolvedValue({ id: 'u', role: { canApprove: false, canManageUsers: false } } as never);
    expect((await put({ visibility: 'ROLE', roleIds: ['r1'] })).status).toBe(403);
  });
});
