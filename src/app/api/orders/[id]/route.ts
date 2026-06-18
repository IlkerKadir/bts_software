import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { OrderStatus, QuoteItemType } from '@prisma/client';
import { stfUpdateSchema } from '@/lib/validations/stf';
import { computeStfTotals } from '@/lib/stf/stf-totals';
import { canAccessOrder, isStfEditable } from '@/lib/orders/order-access';
import type { ZodError } from 'zod';

/**
 * Prisma `include` for STF access checks. Scalars (createdById, status) are
 * returned automatically with `include`; we only need the source quote's
 * creator + project visibility relation. See canAccessOrder (spec §10.3).
 */
const orderAccessInclude = {
  quote: {
    select: {
      createdById: true,
      project: { select: { visibility: true, visibleTo: { select: { userId: true } } } },
    },
  },
} as const;

const VALID_ORDER_STATUSES: string[] = Object.values(OrderStatus);

/** Order status state machine: maps current status to valid next statuses */
const orderStatusTransitions: Record<string, string[]> = {
  HAZIRLANIYOR: ['ONAYLANDI', 'IPTAL'],
  ONAYLANDI: ['GONDERILDI', 'IPTAL'],
  GONDERILDI: ['TAMAMLANDI', 'IPTAL'],
  TAMAMLANDI: [], // terminal
  IPTAL: [], // terminal
};

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
            project: { select: { id: true, name: true, visibility: true, visibleTo: { select: { userId: true } } } },
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
        items: { orderBy: { sortOrder: 'asc' } },
      },
    });

    if (!order) {
      return NextResponse.json({ error: 'Siparis bulunamadi' }, { status: 404 });
    }

    const isManager = user.role.canApprove || user.role.canManageUsers;
    if (!canAccessOrder(order, user.id, isManager)) {
      return NextResponse.json({ error: 'Bu siparişe erişim yetkiniz yok' }, { status: 403 });
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

    const existingOrder = await db.orderConfirmation.findUnique({
      where: { id },
      include: orderAccessInclude,
    });
    if (!existingOrder) {
      return NextResponse.json({ error: 'Siparis bulunamadi' }, { status: 404 });
    }

    const isManager = user.role.canApprove || user.role.canManageUsers;
    if (!canAccessOrder(existingOrder, user.id, isManager)) {
      return NextResponse.json({ error: 'Bu siparişe erişim yetkiniz yok' }, { status: 403 });
    }

    const updateData: Record<string, any> = {};

    if (body.status !== undefined) {
      // Validate status enum value
      if (!VALID_ORDER_STATUSES.includes(body.status)) {
        return NextResponse.json(
          { error: 'Geçersiz sipariş durumu.' },
          { status: 400 }
        );
      }

      // Validate state machine transition
      const currentStatus = existingOrder.status as string;
      const allowedNextStatuses = orderStatusTransitions[currentStatus] || [];
      if (!allowedNextStatuses.includes(body.status)) {
        return NextResponse.json(
          { error: 'Bu durum geçişi yapılamaz' },
          { status: 400 }
        );
      }

      updateData.status = body.status;
    }
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

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getSession();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const body = await request.json();
    const data = stfUpdateSchema.parse(body);

    const existing = await db.orderConfirmation.findUnique({
      where: { id },
      include: orderAccessInclude,
    });
    if (!existing) return NextResponse.json({ error: 'STF bulunamadı' }, { status: 404 });

    const isManager = user.role.canApprove || user.role.canManageUsers;
    if (!canAccessOrder(existing, user.id, isManager)) {
      return NextResponse.json({ error: 'Bu STF’yi düzenleme yetkiniz yok' }, { status: 403 });
    }
    // Freeze sent/terminal STFs — status changes still go through PATCH.
    if (!isStfEditable(existing.status)) {
      return NextResponse.json(
        { error: 'Gönderilmiş veya tamamlanmış STF düzenlenemez' },
        { status: 409 }
      );
    }

    const { items, formDate, ...header } = data;

    const { grandTotal, discountTotal } = computeStfTotals(
      items.map((it) => ({
        itemType: it.itemType,
        totalPrice: it.totalPrice,
        priceLabel: it.priceLabel,
        parentItemId: it.parentItemId,
        sectionDiscountPct: it.sectionDiscountPct,
      }))
    );

    const order = await db.$transaction(async (tx) => {
      await tx.orderItem.deleteMany({ where: { orderId: id } });
      return tx.orderConfirmation.update({
        where: { id },
        data: {
          ...header,
          grandTotal,
          discountTotal,
          formDate: formDate ? new Date(formDate) : null,
          items: {
            create: items.map((it) => ({
              sortOrder: it.sortOrder,
              itemType: it.itemType as QuoteItemType,
              pozNo: it.pozNo,
              code: it.code,
              brand: it.brand,
              model: it.model,
              description: it.description,
              quantity: it.quantity,
              unit: it.unit,
              unitPrice: it.unitPrice,
              totalPrice: it.totalPrice,
              priceLabel: it.priceLabel,
              parentItemId: it.parentItemId,
              discountPct: it.discountPct,
              sectionNote: it.sectionNote,
              sectionDiscountPct: it.sectionDiscountPct,
              sectionDiscountLabel: it.sectionDiscountLabel,
            })),
          },
        },
        include: { items: { orderBy: { sortOrder: 'asc' } } },
      });
    });

    return NextResponse.json({ order });
  } catch (error) {
    if (error instanceof Error && error.name === 'ZodError') {
      return NextResponse.json({ error: 'Geçersiz veri', details: (error as ZodError).issues }, { status: 400 });
    }
    console.error('STF PUT error:', error);
    return NextResponse.json({ error: 'STF kaydedilirken bir hata oluştu' }, { status: 500 });
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
