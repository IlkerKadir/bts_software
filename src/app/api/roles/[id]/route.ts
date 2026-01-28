import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
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
      },
    });

    if (!role) {
      return NextResponse.json(
        { error: 'Rol bulunamadı' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      role: {
        ...role,
        userCount: role._count.users,
        _count: undefined,
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

    const updatedRole = await db.role.update({
      where: { id },
      data: {
        ...(validatedData.name && { name: validatedData.name }),
        ...(validatedData.canViewCosts !== undefined && { canViewCosts: validatedData.canViewCosts }),
        ...(validatedData.canApprove !== undefined && { canApprove: validatedData.canApprove }),
        ...(validatedData.canExport !== undefined && { canExport: validatedData.canExport }),
        ...(validatedData.canManageUsers !== undefined && { canManageUsers: validatedData.canManageUsers }),
        ...(validatedData.canEditProducts !== undefined && { canEditProducts: validatedData.canEditProducts }),
        ...(validatedData.canDelete !== undefined && { canDelete: validatedData.canDelete }),
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
      include: {
        _count: {
          select: { users: true },
        },
      },
    });

    if (!existingRole) {
      return NextResponse.json(
        { error: 'Rol bulunamadı' },
        { status: 404 }
      );
    }

    // Prevent deletion of role with users
    if (existingRole._count.users > 0) {
      return NextResponse.json(
        { error: `Bu rol ${existingRole._count.users} kullanıcıya atanmış durumda. Silmeden önce kullanıcıların rollerini değiştirin.` },
        { status: 400 }
      );
    }

    // Prevent deletion of current user's role
    if (id === user.roleId) {
      return NextResponse.json(
        { error: 'Kendi rolünüzü silemezsiniz' },
        { status: 400 }
      );
    }

    await db.role.delete({
      where: { id },
    });

    return NextResponse.json({ message: 'Rol silindi' });
  } catch (error) {
    console.error('Role DELETE error:', error);
    return NextResponse.json(
      { error: 'Rol silinirken bir hata oluştu' },
      { status: 500 }
    );
  }
}
