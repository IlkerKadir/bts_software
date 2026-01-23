import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { companySchema } from '@/lib/validations/company';
import { getSession } from '@/lib/session';
import { Prisma } from '@prisma/client';

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

    const company = await db.company.findUnique({
      where: { id },
      include: {
        projects: {
          select: { id: true, name: true, status: true },
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
        quotes: {
          select: { id: true, quoteNumber: true, status: true, grandTotal: true },
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
        _count: {
          select: { projects: true, quotes: true },
        },
      },
    });

    if (!company) {
      return NextResponse.json({ error: 'Firma bulunamadı' }, { status: 404 });
    }

    return NextResponse.json({ company });
  } catch (error) {
    console.error('Company GET error:', error);
    return NextResponse.json(
      { error: 'Firma alınırken bir hata oluştu' },
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
    const validatedData = companySchema.parse(body);

    // Clean empty email
    if (validatedData.email === '') {
      validatedData.email = null;
    }

    const existingCompany = await db.company.findUnique({ where: { id } });
    if (!existingCompany) {
      return NextResponse.json({ error: 'Firma bulunamadı' }, { status: 404 });
    }

    // Prepare data for Prisma (handle Json field)
    const updateData = {
      ...validatedData,
      contacts: validatedData.contacts ?? Prisma.JsonNull,
    };

    const company = await db.company.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ company });
  } catch (error) {
    if (error instanceof Error && error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Geçersiz veri', details: error },
        { status: 400 }
      );
    }
    console.error('Company PUT error:', error);
    return NextResponse.json(
      { error: 'Firma güncellenirken bir hata oluştu' },
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

    const existingCompany = await db.company.findUnique({
      where: { id },
      include: {
        _count: { select: { quotes: true, projects: true } },
      },
    });

    if (!existingCompany) {
      return NextResponse.json({ error: 'Firma bulunamadı' }, { status: 404 });
    }

    // Check if company has related data
    if (existingCompany._count.quotes > 0 || existingCompany._count.projects > 0) {
      return NextResponse.json(
        { error: 'Bu firmaya bağlı teklif veya proje bulunduğu için silinemez. Firmayı pasif yapabilirsiniz.' },
        { status: 400 }
      );
    }

    await db.company.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Company DELETE error:', error);
    return NextResponse.json(
      { error: 'Firma silinirken bir hata oluştu' },
      { status: 500 }
    );
  }
}
