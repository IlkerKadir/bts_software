import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { projectSchema, projectQuerySchema } from '@/lib/validations/project';
import { getSession } from '@/lib/session';
import { Prisma } from '@prisma/client';

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

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { client: { is: { name: { contains: query.search, mode: 'insensitive' } } } },
      ];
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
        // Projects with quotes the user created
        { quotes: { some: { createdById: user.id } } },
        // Projects visible to everyone
        { visibility: 'EVERYONE' },
        // Projects where user has explicit access
        { visibility: 'SPECIFIC_USERS', visibleTo: { some: { userId: user.id } } },
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
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      db.project.count({ where }),
    ]);

    return NextResponse.json({
      projects,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
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
        status: validatedData.status as any,
        clientId: validatedData.clientId || null,
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
