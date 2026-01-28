import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { z } from 'zod';

const createFilterSchema = z.object({
  name: z.string().min(1).max(100),
  entity: z.string().min(1),
  filters: z.record(z.string(), z.any()),
  isDefault: z.boolean().optional(),
});

// GET - List saved filters for current user
export async function GET(request: NextRequest) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const entity = searchParams.get('entity');

    const where = {
      userId: user.id,
      ...(entity && { entity }),
    };

    const filters = await db.savedFilter.findMany({
      where,
      orderBy: [
        { isDefault: 'desc' },
        { name: 'asc' },
      ],
    });

    return NextResponse.json({ filters });
  } catch (error) {
    console.error('Saved filters GET error:', error);
    return NextResponse.json(
      { error: 'Filtreler yüklenirken bir hata oluştu' },
      { status: 500 }
    );
  }
}

// POST - Create a new saved filter
export async function POST(request: NextRequest) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const data = createFilterSchema.parse(body);

    // If setting as default, unset other defaults for this entity
    if (data.isDefault) {
      await db.savedFilter.updateMany({
        where: {
          userId: user.id,
          entity: data.entity,
          isDefault: true,
        },
        data: { isDefault: false },
      });
    }

    const filter = await db.savedFilter.create({
      data: {
        userId: user.id,
        name: data.name,
        entity: data.entity,
        filters: data.filters as object,
        isDefault: data.isDefault || false,
      },
    });

    return NextResponse.json({ filter }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Geçersiz veri', details: error.issues },
        { status: 400 }
      );
    }

    // Check for unique constraint violation
    if ((error as { code?: string }).code === 'P2002') {
      return NextResponse.json(
        { error: 'Bu isimde bir filtre zaten mevcut' },
        { status: 409 }
      );
    }

    console.error('Saved filter POST error:', error);
    return NextResponse.json(
      { error: 'Filtre kaydedilirken bir hata oluştu' },
      { status: 500 }
    );
  }
}

// DELETE - Delete a saved filter
export async function DELETE(request: NextRequest) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Filtre ID gerekli' }, { status: 400 });
    }

    // Check filter belongs to user
    const filter = await db.savedFilter.findFirst({
      where: { id, userId: user.id },
    });

    if (!filter) {
      return NextResponse.json({ error: 'Filtre bulunamadı' }, { status: 404 });
    }

    await db.savedFilter.delete({
      where: { id },
    });

    return NextResponse.json({ message: 'Filtre silindi' });
  } catch (error) {
    console.error('Saved filter DELETE error:', error);
    return NextResponse.json(
      { error: 'Filtre silinirken bir hata oluştu' },
      { status: 500 }
    );
  }
}
