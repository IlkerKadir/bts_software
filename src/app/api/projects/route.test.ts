import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST, GET } from './route';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({
  db: {
    project: {
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

vi.mock('@/lib/session', () => ({
  getSession: vi.fn(),
}));

const makeUser = (overrides: Partial<{ canApprove: boolean; canManageUsers: boolean }> = {}) => ({
  id: 'user-sales-1',
  fullName: 'Sales Rep',
  roleId: 'role-sales',
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
    ...overrides,
  },
});

describe('POST /api/projects', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('stamps createdById with the session user id', async () => {
    vi.mocked(getSession).mockResolvedValue(makeUser() as any);
    vi.mocked(db.project.create).mockResolvedValue({
      id: 'proj-1',
      name: 'Test Project',
      createdById: 'user-sales-1',
    } as any);

    const req = new NextRequest('http://localhost/api/projects', {
      method: 'POST',
      body: JSON.stringify({ name: 'Test Project', status: 'TEKLIF_ASAMASINDA' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(201);

    expect(db.project.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'Test Project',
          createdById: 'user-sales-1',
        }),
      }),
    );
  });

  it("defaults visibility to the creator's role (client 30.06)", async () => {
    vi.mocked(getSession).mockResolvedValue(makeUser() as any);
    vi.mocked(db.project.create).mockResolvedValue({ id: 'proj-1' } as any);

    const req = new NextRequest('http://localhost/api/projects', {
      method: 'POST',
      body: JSON.stringify({ name: 'Rol Testi', status: 'TEKLIF_ASAMASINDA' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);

    expect(db.project.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          visibility: 'ROLE',
          visibleToRoleId: 'role-sales',
        }),
      }),
    );
  });
});

describe('GET /api/projects (non-manager visibility filter)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('includes a createdById branch for non-managers', async () => {
    vi.mocked(getSession).mockResolvedValue(makeUser() as any);
    vi.mocked(db.project.findMany).mockResolvedValue([] as any);
    vi.mocked(db.project.count).mockResolvedValue(0);

    const req = new NextRequest('http://localhost/api/projects');
    await GET(req);

    const call = vi.mocked(db.project.findMany).mock.calls[0][0];
    const orBranches = (call?.where as any)?.OR;
    expect(orBranches).toBeDefined();
    expect(orBranches).toEqual(
      expect.arrayContaining([{ createdById: 'user-sales-1' }]),
    );
  });

  it('managers see all projects without a visibility filter', async () => {
    vi.mocked(getSession).mockResolvedValue(
      makeUser({ canApprove: true }) as any,
    );
    vi.mocked(db.project.findMany).mockResolvedValue([] as any);
    vi.mocked(db.project.count).mockResolvedValue(0);

    const req = new NextRequest('http://localhost/api/projects');
    await GET(req);

    const call = vi.mocked(db.project.findMany).mock.calls[0][0];
    expect((call?.where as any)?.OR).toBeUndefined();
    expect((call?.where as any)?.AND).toBeUndefined();
  });
});
