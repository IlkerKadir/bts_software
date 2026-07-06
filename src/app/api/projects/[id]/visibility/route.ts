import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { z } from 'zod';

interface RouteParams {
  params: Promise<{ id: string }>;
}

const visibilityUpdateSchema = z.object({
  visibility: z.enum(['CREATOR_ONLY', 'SPECIFIC_USERS', 'EVERYONE', 'ROLE']),
  userIds: z.array(z.string()).optional(),
  roleId: z.string().optional(),
});

/**
 * GET /api/projects/[id]/visibility
 * Returns the current visibility setting and list of users with access.
 * Requires canManageUsers or canApprove role.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!user.role.canApprove && !user.role.canManageUsers) {
      return NextResponse.json(
        { error: 'Bu işlem için yetkiniz bulunmuyor' },
        { status: 403 }
      );
    }

    const { id } = await params;

    const project = await db.project.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        visibility: true,
        visibleToRole: { select: { id: true, name: true } },
        createdBy: {
          select: {
            id: true,
            fullName: true,
            username: true,
          },
        },
        visibleTo: {
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
                username: true,
              },
            },
          },
        },
      },
    });

    if (!project) {
      return NextResponse.json({ error: 'Proje bulunamadı' }, { status: 404 });
    }

    // All roles for the ROLE-mode picker (this route is manager-only).
    const roles = await db.role.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });

    return NextResponse.json({
      projectId: project.id,
      projectName: project.name,
      visibility: project.visibility,
      role: project.visibleToRole ?? null,
      roles,
      createdBy: project.createdBy ?? null,
      users: project.visibleTo.map((access) => ({
        id: access.user.id,
        fullName: access.user.fullName,
        username: access.user.username,
      })),
    });
  } catch (error) {
    console.error('Project visibility GET error:', error);
    return NextResponse.json(
      { error: 'Proje görünürlük ayarları alınırken bir hata oluştu' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/projects/[id]/visibility
 * Updates the project visibility setting and user access list.
 * Requires canManageUsers or canApprove role.
 * Body: { visibility: 'CREATOR_ONLY' | 'SPECIFIC_USERS' | 'EVERYONE', userIds?: string[] }
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!user.role.canApprove && !user.role.canManageUsers) {
      return NextResponse.json(
        { error: 'Bu işlem için yetkiniz bulunmuyor' },
        { status: 403 }
      );
    }

    const { id } = await params;

    const body = await request.json();
    const validation = visibilityUpdateSchema.safeParse(body);
    if (!validation.success) {
      const firstError = validation.error.issues[0];
      return NextResponse.json(
        { error: firstError?.message || 'Geçersiz veri' },
        { status: 400 }
      );
    }

    const { visibility, userIds, roleId } = validation.data;

    // Check that the project exists
    const project = await db.project.findUnique({ where: { id } });
    if (!project) {
      return NextResponse.json({ error: 'Proje bulunamadı' }, { status: 404 });
    }

    // If ROLE, validate the role exists
    if (visibility === 'ROLE') {
      if (!roleId) {
        return NextResponse.json(
          { error: 'Rol bazlı görünürlük için bir rol seçilmelidir' },
          { status: 400 }
        );
      }
      const role = await db.role.findUnique({ where: { id: roleId }, select: { id: true } });
      if (!role) {
        return NextResponse.json({ error: 'Geçersiz rol' }, { status: 400 });
      }
    }

    // If SPECIFIC_USERS, validate that userIds are provided
    if (visibility === 'SPECIFIC_USERS' && (!userIds || userIds.length === 0)) {
      return NextResponse.json(
        { error: 'SPECIFIC_USERS görünürlüğü için en az bir kullanıcı seçilmelidir' },
        { status: 400 }
      );
    }

    // If SPECIFIC_USERS, validate that all userIds exist
    if (visibility === 'SPECIFIC_USERS' && userIds && userIds.length > 0) {
      const existingUsers = await db.user.findMany({
        where: { id: { in: userIds }, isActive: true },
        select: { id: true },
      });
      const existingIds = new Set(existingUsers.map((u) => u.id));
      const invalidIds = userIds.filter((uid) => !existingIds.has(uid));
      if (invalidIds.length > 0) {
        return NextResponse.json(
          { error: `Geçersiz kullanıcı ID'leri: ${invalidIds.join(', ')}` },
          { status: 400 }
        );
      }
    }

    // Update visibility and user access in a transaction
    await db.$transaction(async (tx) => {
      // Update the project visibility (+ the role for ROLE mode)
      await tx.project.update({
        where: { id },
        data: {
          visibility,
          visibleToRoleId: visibility === 'ROLE' ? roleId : null,
        },
      });

      // Remove all existing access entries for this project
      await tx.projectUserAccess.deleteMany({
        where: { projectId: id },
      });

      // If SPECIFIC_USERS, create new access entries
      if (visibility === 'SPECIFIC_USERS' && userIds && userIds.length > 0) {
        await tx.projectUserAccess.createMany({
          data: userIds.map((userId) => ({
            projectId: id,
            userId,
          })),
        });
      }
    });

    // Fetch the updated state
    const updatedProject = await db.project.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        visibility: true,
        visibleToRole: { select: { id: true, name: true } },
        createdBy: {
          select: {
            id: true,
            fullName: true,
            username: true,
          },
        },
        visibleTo: {
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
                username: true,
              },
            },
          },
        },
      },
    });

    return NextResponse.json({
      projectId: updatedProject!.id,
      projectName: updatedProject!.name,
      visibility: updatedProject!.visibility,
      role: updatedProject!.visibleToRole ?? null,
      createdBy: updatedProject!.createdBy ?? null,
      users: updatedProject!.visibleTo.map((access) => ({
        id: access.user.id,
        fullName: access.user.fullName,
        username: access.user.username,
      })),
    });
  } catch (error) {
    console.error('Project visibility PUT error:', error);
    return NextResponse.json(
      { error: 'Proje görünürlük ayarları güncellenirken bir hata oluştu' },
      { status: 500 }
    );
  }
}
