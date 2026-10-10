import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import type { Prisma } from '@prisma/client';
import { getSession } from '@/lib/session';
import { updateRoleSchema } from '@/lib/validations/role';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check permission
    if (!user.role.canManageUsers) {
      return NextResponse.json(
        { error: 'Bu işlem için yetkiniz bulunmamaktadır' },
        { status: 403 }
      );
    }

    const { id } = await params;

    const role = await db.role.findUnique({
      where: { id },
      include: {
        _count: {
          select: { users: true },
        },
        projectLinksOut: { select: { targetRoleId: true } },
      },
    });

    if (!role) {
      return NextResponse.json(
        { error: 'Rol bulunamadı' },
        { status: 404 }
      );
    }

    const { projectLinksOut, ...roleRest } = role;
    return NextResponse.json({
      role: {
        ...roleRest,
        userCount: role._count.users,
        _count: undefined,
        linkedRoleIds: projectLinksOut.map((l) => l.targetRoleId),
      },
    });
  } catch (error) {
    console.error('Role GET error:', error);
    return NextResponse.json(
      { error: 'Rol alınırken bir hata oluştu' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check permission
    if (!user.role.canManageUsers) {
      return NextResponse.json(
        { error: 'Bu işlem için yetkiniz bulunmamaktadır' },
        { status: 403 }
      );
    }

    const { id } = await params;

    // Check if role exists
    const existingRole = await db.role.findUnique({
      where: { id },
    });

    if (!existingRole) {
      return NextResponse.json(
        { error: 'Rol bulunamadı' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const validatedData = updateRoleSchema.parse(body);

    // Check name uniqueness if being changed
    if (validatedData.name && validatedData.name !== existingRole.name) {
      const nameExists = await db.role.findUnique({
        where: { name: validatedData.name },
      });

      if (nameExists) {
        return NextResponse.json(
          { error: 'Bu rol adı zaten kullanılıyor' },
          { status: 400 }
        );
      }
    }

    // Linked roles (client 10.2026): replace the set when provided.
    // Only affects projects created AFTER the change — existing projects
    // keep the visibility they were created with.
    // NB: `deleteMany` must come BEFORE `create` — Prisma runs nested writes
    // in key order; the reverse would delete the links just created.
    let linksWrite: { projectLinksOut?: Prisma.RoleUpdateInput['projectLinksOut'] } = {};
    if (validatedData.linkedRoleIds !== undefined) {
      const wanted = Array.from(new Set(validatedData.linkedRoleIds.filter((rid) => rid !== id)));
      const targets = wanted.length
        ? await db.role.findMany({ where: { id: { in: wanted } }, select: { id: true } })
        : [];
      // Replace the set inside the same update (atomic with the role fields).
      linksWrite = {
        projectLinksOut: {
          deleteMany: {},
          create: targets.map((t) => ({ targetRoleId: t.id })),
        },
      };
    }

    const updatedRole = await db.role.update({
      where: { id },
      data: {
        ...linksWrite,
        ...(validatedData.name && { name: validatedData.name }),
        ...(validatedData.canViewCosts !== undefined && { canViewCosts: validatedData.canViewCosts }),
        ...(validatedData.canApprove !== undefined && { canApprove: validatedData.canApprove }),
        ...(validatedData.canExport !== undefined && { canExport: validatedData.canExport }),
        ...(validatedData.canManageUsers !== undefined && { canManageUsers: validatedData.canManageUsers }),
        ...(validatedData.canManageSettings !== undefined && { canManageSettings: validatedData.canManageSettings }),
        ...(validatedData.canEditProducts !== undefined && { canEditProducts: validatedData.canEditProducts }),
        ...(validatedData.canDelete !== undefined && { canDelete: validatedData.canDelete }),
        ...(validatedData.canDeleteProducts !== undefined && { canDeleteProducts: validatedData.canDeleteProducts }),
      },
    });

    return NextResponse.json({ role: updatedRole });
  } catch (error) {
    if (error instanceof Error && error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Geçersiz veri', details: error },
        { status: 400 }
      );
    }
    console.error('Role PUT error:', error);
    return NextResponse.json(
      { error: 'Rol güncellenirken bir hata oluştu' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check permission
    if (!user.role.canManageUsers) {
      return NextResponse.json(
        { error: 'Bu işlem için yetkiniz bulunmamaktadır' },
        { status: 403 }
      );
    }

    const { id } = await params;

    // Check if role exists
    const existingRole = await db.role.findUnique({
      where: { id },
    });

    if (!existingRole) {
      return NextResponse.json(
        { error: 'Rol bulunamadı' },
        { status: 404 }
      );
    }

    // Prevent deletion of current user's role
    if (id === user.roleId) {
      return NextResponse.json(
        { error: 'Kendi rolünüzü silemezsiniz' },
        { status: 400 }
      );
    }

    // Count only non-deleted users. Soft-deleted users still carry
    // `roleId` to satisfy the FK, but they're invisible to admins and
    // shouldn't block role deletion.
    const activeUserCount = await db.user.count({
      where: { roleId: id, deletedAt: null },
    });

    if (activeUserCount > 0) {
      return NextResponse.json(
        { error: `Bu rol ${activeUserCount} kullanıcıya atanmış durumda. Silmeden önce kullanıcıların rollerini değiştirin.` },
        { status: 400 }
      );
    }

    // Any soft-deleted users on this role need to be reassigned to
    // another surviving role before we can delete — otherwise the
    // default `Restrict` FK on User.role blocks the delete.
    const fallbackRole = await db.role.findFirst({
      where: { id: { not: id } },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });

    if (!fallbackRole) {
      return NextResponse.json(
        { error: 'Silinebilecek tek rol bu. Önce başka bir rol oluşturun.' },
        { status: 400 }
      );
    }

    await db.$transaction([
      db.user.updateMany({
        where: { roleId: id, deletedAt: { not: null } },
        data: { roleId: fallbackRole.id },
      }),
      db.role.delete({ where: { id } }),
    ]);

    return NextResponse.json({ message: 'Rol silindi' });
  } catch (error) {
    console.error('Role DELETE error:', error);
    return NextResponse.json(
      { error: 'Rol silinirken bir hata oluştu' },
      { status: 500 }
    );
  }
}
