import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { hashPassword } from '@/lib/auth';
import { updateUserSchema } from '@/lib/validations/user';

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

    const targetUser = await db.user.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        fullName: true,
        email: true,
        roleId: true,
        role: {
          select: {
            id: true,
            name: true,
            canViewCosts: true,
            canApprove: true,
            canExport: true,
            canManageUsers: true,
            canEditProducts: true,
            canDelete: true,
          },
        },
        isActive: true,
        lastLogin: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!targetUser) {
      return NextResponse.json(
        { error: 'Kullanıcı bulunamadı' },
        { status: 404 }
      );
    }

    return NextResponse.json({ user: targetUser });
  } catch (error) {
    console.error('User GET error:', error);
    return NextResponse.json(
      { error: 'Kullanıcı alınırken bir hata oluştu' },
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

    // Check if user exists
    const existingUser = await db.user.findUnique({
      where: { id },
    });

    if (!existingUser) {
      return NextResponse.json(
        { error: 'Kullanıcı bulunamadı' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const validatedData = updateUserSchema.parse(body);

    // Check username uniqueness if being changed
    if (validatedData.username && validatedData.username !== existingUser.username) {
      const usernameExists = await db.user.findUnique({
        where: { username: validatedData.username },
      });

      if (usernameExists) {
        return NextResponse.json(
          { error: 'Bu kullanıcı adı zaten kullanılıyor' },
          { status: 400 }
        );
      }
    }

    // Check if role exists if being changed
    if (validatedData.roleId) {
      const role = await db.role.findUnique({
        where: { id: validatedData.roleId },
      });

      if (!role) {
        return NextResponse.json(
          { error: 'Geçersiz rol' },
          { status: 400 }
        );
      }
    }

    // Build update data
    const updateData: {
      username?: string;
      passwordHash?: string;
      fullName?: string;
      email?: string | null;
      roleId?: string;
      isActive?: boolean;
    } = {};

    if (validatedData.username) {
      updateData.username = validatedData.username;
    }

    if (validatedData.password) {
      updateData.passwordHash = await hashPassword(validatedData.password);
    }

    if (validatedData.fullName) {
      updateData.fullName = validatedData.fullName;
    }

    if (validatedData.email !== undefined) {
      updateData.email = validatedData.email || null;
    }

    if (validatedData.roleId) {
      updateData.roleId = validatedData.roleId;
    }

    if (validatedData.isActive !== undefined) {
      updateData.isActive = validatedData.isActive;
    }

    const updatedUser = await db.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        username: true,
        fullName: true,
        email: true,
        roleId: true,
        role: {
          select: {
            id: true,
            name: true,
          },
        },
        isActive: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ user: updatedUser });
  } catch (error) {
    if (error instanceof Error && error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Geçersiz veri', details: error },
        { status: 400 }
      );
    }
    console.error('User PUT error:', error);
    return NextResponse.json(
      { error: 'Kullanıcı güncellenirken bir hata oluştu' },
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

    // Prevent self-deletion
    if (id === user.id) {
      return NextResponse.json(
        { error: 'Kendinizi silemezsiniz' },
        { status: 400 }
      );
    }

    // Check if user exists
    const existingUser = await db.user.findUnique({
      where: { id },
    });

    if (!existingUser) {
      return NextResponse.json(
        { error: 'Kullanıcı bulunamadı' },
        { status: 404 }
      );
    }

    // Soft delete - deactivate user
    await db.user.update({
      where: { id },
      data: { isActive: false },
    });

    return NextResponse.json({ message: 'Kullanıcı devre dışı bırakıldı' });
  } catch (error) {
    console.error('User DELETE error:', error);
    return NextResponse.json(
      { error: 'Kullanıcı silinirken bir hata oluştu' },
      { status: 500 }
    );
  }
}
