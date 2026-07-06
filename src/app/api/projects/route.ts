import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { projectSchema, projectQuerySchema } from '@/lib/validations/project';
import { getSession } from '@/lib/session';
import { Prisma } from '@prisma/client';
import { expandTurkishVariants } from '@/lib/search-helpers';
import { paginationArgs, paginationMeta } from '@/lib/pagination';

export async function GET(request: NextRequest) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const query = projectQuerySchema.parse({
      search: searchParams.get('search') || undefined,
      clientId: searchParams.get('clientId') || undefined,
      status: searchParams.get('status') || undefined,
      page: searchParams.get('page') || '1',
      limit: searchParams.get('limit') || '20',
    });

    const where: Prisma.ProjectWhereInput = {};

    const searchVariants = expandTurkishVariants(query.search ?? '');
    if (searchVariants.length > 0) {
      where.OR = searchVariants.flatMap((v) => [
        { name: { contains: v, mode: 'insensitive' as const } },
        { client: { is: { name: { contains: v, mode: 'insensitive' as const } } } },
      ]);
    }

    if (query.clientId) {
      where.clientId = query.clientId;
    }

    if (query.status) {
      // Support comma-separated statuses
      const statuses = query.status.split(',').map(s => s.trim());
      if (statuses.length === 1) {
        where.status = statuses[0] as any;
      } else {
        where.status = { in: statuses as any[] };
      }
    }

    // Visibility filtering: managers see all projects, others see based on visibility
    const isManager = user.role.canApprove || user.role.canManageUsers;
    if (!isManager) {
      const visibilityOR: Prisma.ProjectWhereInput[] = [
        // Projects the user created
        { createdById: user.id },
        // Projects with quotes the user created (legacy pre-createdById projects)
        { quotes: { some: { createdById: user.id } } },
        // Projects visible to everyone
        { visibility: 'EVERYONE' },
        // Projects where user has explicit access
        { visibility: 'SPECIFIC_USERS', visibleTo: { some: { userId: user.id } } },
        // Projects visible to the user's role (client 30.06)
        { visibility: 'ROLE', visibleToRoleId: user.roleId },
      ];
      if (where.OR) {
        const searchOR = where.OR;
        delete where.OR;
        where.AND = [{ OR: searchOR }, { OR: visibilityOR }];
      } else {
        where.OR = visibilityOR;
      }
    }

    const [projects, total] = await Promise.all([
      db.project.findMany({
        where,
        include: {
          client: { select: { id: true, name: true } },
          _count: { select: { quotes: true } },
        },
        orderBy: { createdAt: 'desc' },
        ...paginationArgs(query.page, query.limit),
      }),
      db.project.count({ where }),
    ]);

    return NextResponse.json({
      projects,
      pagination: paginationMeta(query.page, query.limit, total),
    });
  } catch (error) {
    console.error('Projects GET error:', error);
    return NextResponse.json(
      { error: 'Projeler alınırken bir hata oluştu' },
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

    const body = await request.json();
    const validatedData = projectSchema.parse(body);

    // Transform date strings to Date objects if provided
    // Convert empty string clientId to null
    const project = await db.project.create({
      data: {
        name: validatedData.name,
        location: validatedData.location || null,
        status: validatedData.status as any,
        clientId: validatedData.clientId || null,
        createdById: user.id,
        // Default visibility (client 30.06): the creator's role + managers.
        // Adjustable afterwards from the project's Görünürlük panel.
        visibility: 'ROLE',
        visibleToRoleId: user.roleId,
        estimatedStart: validatedData.estimatedStart ? new Date(validatedData.estimatedStart) : null,
        estimatedEnd: validatedData.estimatedEnd ? new Date(validatedData.estimatedEnd) : null,
        notes: validatedData.notes || null,
      },
      include: {
        client: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ project }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Geçersiz veri', details: error },
        { status: 400 }
      );
    }
    console.error('Projects POST error:', error);
    return NextResponse.json(
      { error: 'Proje oluşturulurken bir hata oluştu' },
      { status: 500 }
    );
  }
}
