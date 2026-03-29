import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { projectSchema } from '@/lib/validations/project';
import { getSession } from '@/lib/session';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const project = await db.project.findUnique({
      where: { id },
      include: {
        client: { select: { id: true, name: true } },
        quotes: {
          select: {
            id: true,
            quoteNumber: true,
            status: true,
            grandTotal: true,
            currency: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
        _count: {
          select: { quotes: true, documents: true, activities: true },
        },
      },
    });

    if (!project) {
      return NextResponse.json({ error: 'Proje bulunamadı' }, { status: 404 });
    }

    return NextResponse.json({ project });
  } catch (error) {
    console.error('Project GET error:', error);
    return NextResponse.json(
      { error: 'Proje alınırken bir hata oluştu' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const validatedData = projectSchema.parse(body);

    const existingProject = await db.project.findUnique({ where: { id } });
    if (!existingProject) {
      return NextResponse.json({ error: 'Proje bulunamadı' }, { status: 404 });
    }

    // Transform date strings to Date objects if provided
    // Convert empty string clientId to null
    const updateData = {
      ...validatedData,
      clientId: validatedData.clientId || null,
      estimatedStart: validatedData.estimatedStart ? new Date(validatedData.estimatedStart) : null,
      estimatedEnd: validatedData.estimatedEnd ? new Date(validatedData.estimatedEnd) : null,
    };

    const project = await db.project.update({
      where: { id },
      data: updateData,
      include: {
        client: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ project });
  } catch (error) {
    if (error instanceof Error && error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Geçersiz veri', details: error },
        { status: 400 }
      );
    }
    console.error('Project PUT error:', error);
    return NextResponse.json(
      { error: 'Proje güncellenirken bir hata oluştu' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user can delete
    if (!user.role.canDelete) {
      return NextResponse.json(
        { error: 'Bu işlem için yetkiniz bulunmuyor' },
        { status: 403 }
      );
    }

    const { id } = await params;

    const existingProject = await db.project.findUnique({
      where: { id },
      include: {
        _count: { select: { quotes: true } },
      },
    });

    if (!existingProject) {
      return NextResponse.json({ error: 'Proje bulunamadı' }, { status: 404 });
    }

    // Check if project has related quotes
    if (existingProject._count.quotes > 0) {
      return NextResponse.json(
        { error: 'Bu projeye bağlı teklif bulunduğu için silinemez.' },
        { status: 400 }
      );
    }

    await db.project.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Project DELETE error:', error);
    return NextResponse.json(
      { error: 'Proje silinirken bir hata oluştu' },
      { status: 500 }
    );
  }
}
