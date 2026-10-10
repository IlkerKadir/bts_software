import { describe, it, expect, vi } from 'vitest';
import { projectRoleMatches, projectRoleWhere, defaultVisibleRoleIds } from './project-role-visibility';
import { canUserAccessQuote } from './quote-access';

describe('project-role-visibility', () => {
  const roleProject = {
    visibility: 'ROLE',
    visibleToRoleId: 'r-sales',
    visibleRoles: [{ roleId: 'r-sales' }, { roleId: 'r-dir' }],
  };

  it('matches the primary and linked roles only, and only in ROLE mode', () => {
    expect(projectRoleMatches(roleProject, 'r-sales')).toBe(true);
    expect(projectRoleMatches(roleProject, 'r-dir')).toBe(true);
    expect(projectRoleMatches(roleProject, 'r-other')).toBe(false);
    expect(projectRoleMatches(roleProject, undefined)).toBe(false);
    expect(projectRoleMatches({ ...roleProject, visibility: 'CREATOR_ONLY' }, 'r-dir')).toBe(false);
    // Legacy project with only the primary column still works
    expect(projectRoleMatches({ visibility: 'ROLE', visibleToRoleId: 'r-sales', visibleRoles: [] }, 'r-sales')).toBe(true);
  });

  it('builds the matching Prisma filter', () => {
    expect(projectRoleWhere('r-dir')).toEqual({
      visibility: 'ROLE',
      OR: [{ visibleToRoleId: 'r-dir' }, { visibleRoles: { some: { roleId: 'r-dir' } } }],
    });
  });

  it('defaults new projects to creator role + linked roles (deduped, creator first)', async () => {
    const db = { roleProjectLink: { findMany: vi.fn().mockResolvedValue([{ targetRoleId: 'r-dir' }, { targetRoleId: 'r-sales' }]) } };
    expect(await defaultVisibleRoleIds(db, 'r-sales')).toEqual(['r-sales', 'r-dir']);
  });

  it('a linked role sees the quote (Özkan Bey scenario)', () => {
    const quote = { createdById: 'firat', project: roleProject };
    expect(canUserAccessQuote('ozkan', false, quote, 'r-dir')).toBe(true);
    expect(canUserAccessQuote('someone', false, quote, 'r-other')).toBe(false);
  });
});
