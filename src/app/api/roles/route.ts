import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { createRoleSchema, roleQuerySchema } from '@/lib/validations/role';
import { Prisma } from '@prisma/client';

export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url);
    const query = roleQuerySchema.parse({
      search: searchParams.get('search') || undefined,
      page: searchParams.get('page') || '1',
      limit: searchParams.get('limit') || '20',
    });

    const where: Prisma.RoleWhereInput = {};

    if (query.search) {
      where.name = { contains: query.search, mode: 'insensitive' };
    }

    const [roles, total] = await Promise.all([
      db.role.findMany({
        where,
        include: {
          _count: {
            select: { users: true },
          },
        },
        orderBy: { name: 'asc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      db.role.count({ where }),
    ]);

    return NextResponse.json({
      roles: roles.map(role => ({
        ...role,
        userCount: role._count.users,
        _count: undefined,
      })),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    });
  } catch (error) {
    console.error('Roles GET error:', error);
    return NextResponse.json(
      { error: 'Roller alınırken bir hata oluştu' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
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

    const body = await request.json();
    const validatedData = createRoleSchema.parse(body);

    // Check if role name already exists
    const existingRole = await db.role.findUnique({
      where: { name: validatedData.name },
    });

    if (existingRole) {
      return NextResponse.json(
        { error: 'Bu rol adı zaten kullanılıyor' },
        { status: 400 }
      );
    }

    const role = await db.role.create({
      data: {
        name: validatedData.name,
        canViewCosts: validatedData.canViewCosts ?? false,
        canApprove: validatedData.canApprove ?? false,
        canExport: validatedData.canExport ?? true,
        canManageUsers: validatedData.canManageUsers ?? false,
        canEditProducts: validatedData.canEditProducts ?? false,
        canDelete: validatedData.canDelete ?? false,
      },
    });

    return NextResponse.json({ role }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Geçersiz veri', details: error },
        { status: 400 }
      );
    }
    console.error('Roles POST error:', error);
    return NextResponse.json(
      { error: 'Rol oluşturulurken bir hata oluştu' },
      { status: 500 }
    );
  }
}
