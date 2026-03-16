import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { companySchema, companyQuerySchema } from '@/lib/validations/company';
import { getSession } from '@/lib/session';
import { Prisma } from '@prisma/client';

export async function GET(request: NextRequest) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const query = companyQuerySchema.parse({
      search: searchParams.get('search') || undefined,
      type: searchParams.get('type') || undefined,
      isActive: searchParams.get('isActive') || undefined,
      page: searchParams.get('page') || '1',
      limit: searchParams.get('limit') || '20',
    });

    const where: Prisma.CompanyWhereInput = {};

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { taxNumber: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (query.type) {
      where.type = query.type;
    }

    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }

    const [companies, total] = await Promise.all([
      db.company.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      db.company.count({ where }),
    ]);

    return NextResponse.json({
      companies,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    });
  } catch (error) {
    console.error('Companies GET error:', error);
    return NextResponse.json(
      { error: 'Firmalar alınırken bir hata oluştu' },
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
    const validatedData = companySchema.parse(body);

    // Empty email is already cleaned to null by the validation preprocess

    // Prepare data for Prisma (handle Json field)
    const createData = {
      ...validatedData,
      contacts: validatedData.contacts ?? Prisma.JsonNull,
    };

    const company = await db.company.create({
      data: createData,
    });

    return NextResponse.json({ company }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.name === 'ZodError') {
      const zodError = error as import('zod').ZodError;
      const fieldErrors = zodError.errors.map((e) => {
        const field = e.path.join('.');
        const fieldLabels: Record<string, string> = {
          name: 'Firma Adı',
          type: 'Firma Tipi',
          email: 'E-posta',
          phone: 'Telefon',
          address: 'Adres',
          taxNumber: 'Vergi No',
        };
        const label = fieldLabels[field] || field;
        return `${label}: ${e.message}`;
      });
      return NextResponse.json(
        { error: fieldErrors.join(', ') },
        { status: 400 }
      );
    }
    console.error('Companies POST error:', error);
    return NextResponse.json(
      { error: 'Firma oluşturulurken bir hata oluştu' },
      { status: 500 }
    );
  }
}
