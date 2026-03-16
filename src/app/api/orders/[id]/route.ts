import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
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

    const order = await db.orderConfirmation.findUnique({
      where: { id },
      include: {
        quote: {
          include: {
            company: true,
            project: { select: { id: true, name: true } },
            items: {
              where: { parentItemId: null },
              orderBy: { sortOrder: 'asc' },
            },
            commercialTerms: {
              orderBy: { sortOrder: 'asc' },
            },
            createdBy: { select: { id: true, fullName: true } },
          },
        },
        company: true,
        createdBy: { select: { id: true, fullName: true } },
      },
    });

    if (!order) {
      return NextResponse.json({ error: 'Siparis bulunamadi' }, { status: 404 });
    }

    return NextResponse.json({ order });
  } catch (error) {
    console.error('Order GET error:', error);
    return NextResponse.json(
      { error: 'Siparis alinirken bir hata olustu' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();

    const existingOrder = await db.orderConfirmation.findUnique({ where: { id } });
    if (!existingOrder) {
      return NextResponse.json({ error: 'Siparis bulunamadi' }, { status: 404 });
    }

    const updateData: Record<string, any> = {};

    if (body.status !== undefined) updateData.status = body.status;
    if (body.notes !== undefined) updateData.notes = body.notes;
    if (body.deliveryDate !== undefined) {
      updateData.deliveryDate = body.deliveryDate ? new Date(body.deliveryDate) : null;
    }

    const order = await db.orderConfirmation.update({
      where: { id },
      data: updateData,
      include: {
        quote: {
          select: {
            id: true,
            quoteNumber: true,
            subject: true,
            currency: true,
            grandTotal: true,
          },
        },
        company: { select: { id: true, name: true } },
        createdBy: { select: { id: true, fullName: true } },
      },
    });

    return NextResponse.json({ order });
  } catch (error) {
    console.error('Order PATCH error:', error);
    return NextResponse.json(
      { error: 'Siparis guncellenirken bir hata olustu' },
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

    if (!user.role.canDelete) {
      return NextResponse.json(
        { error: 'Bu islem icin yetkiniz bulunmuyor' },
        { status: 403 }
      );
    }

    const { id } = await params;

    const existingOrder = await db.orderConfirmation.findUnique({ where: { id } });
    if (!existingOrder) {
      return NextResponse.json({ error: 'Siparis bulunamadi' }, { status: 404 });
    }

    // Only allow deleting orders in HAZIRLANIYOR status
    if (existingOrder.status !== 'HAZIRLANIYOR') {
      return NextResponse.json(
        { error: 'Sadece hazirlanan siparisler silinebilir' },
        { status: 400 }
      );
    }

    await db.orderConfirmation.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Order DELETE error:', error);
    return NextResponse.json(
      { error: 'Siparis silinirken bir hata olustu' },
      { status: 500 }
    );
  }
}
