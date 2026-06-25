import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { QuoteItemType } from '@prisma/client';
import { nextStfRevisionNumber } from '@/lib/stf/stf-revision-number';

interface RouteParams { params: Promise<{ id: string }>; }

export async function POST(_req: NextRequest, { params }: RouteParams) {
  try {
    const user = await getSession();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;

    const source = await db.orderConfirmation.findUnique({
      where: { id },
      include: { items: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!source) return NextResponse.json({ error: 'STF bulunamadı' }, { status: 404 });

    // Only a completed STF can be revised (mirrors the owner's flow).
    if (source.status !== 'TAMAMLANDI') {
      return NextResponse.json({ error: 'Sadece tamamlanmış STF revize edilebilir' }, { status: 400 });
    }

    // Flat .N numbering off the source's root.
    const all = await db.orderConfirmation.findMany({ select: { orderNumber: true } });
    const revisionNumber = nextStfRevisionNumber(source.orderNumber, all.map((o) => o.orderNumber));

    const collision = await db.orderConfirmation.findFirst({
      where: { orderNumber: revisionNumber }, select: { id: true },
    });
    if (collision) {
      return NextResponse.json(
        { error: `"${revisionNumber}" numaralı bir STF zaten mevcut.` },
        { status: 409 }
      );
    }

    // Standalone copy — no parentOrderId link, starts as TASLAK, source untouched.
    const created = await db.orderConfirmation.create({
      data: {
        orderNumber: revisionNumber,
        quoteId: source.quoteId,
        companyId: source.companyId,
        status: 'TASLAK',
        createdById: user.id,
        notes: source.notes,
        deliveryDate: source.deliveryDate,
        customerName: source.customerName, customerAddress: source.customerAddress,
        customerPhone: source.customerPhone, customerTaxInfo: source.customerTaxInfo,
        projectName: source.projectName, quoteNo: source.quoteNo, refNo: source.refNo,
        formDate: source.formDate, siparisNo: source.siparisNo, currency: source.currency,
        discountTotal: source.discountTotal, grandTotal: source.grandTotal,
        manufacturers: source.manufacturers, warranty: source.warranty,
        deliveryPlace: source.deliveryPlace, deliveryTime: source.deliveryTime,
        paymentTerms: source.paymentTerms, vatNote: source.vatNote,
        customerApprovalName: source.customerApprovalName, btsResponsibleName: source.btsResponsibleName,
        items: {
          create: source.items.map((it) => ({
            sortOrder: it.sortOrder,
            itemType: it.itemType as QuoteItemType,
            pozNo: it.pozNo, code: it.code, brand: it.brand, model: it.model,
            description: it.description, quantity: it.quantity, unit: it.unit,
            unitPrice: it.unitPrice, totalPrice: it.totalPrice, priceLabel: it.priceLabel,
            parentItemId: it.parentItemId, discountPct: it.discountPct,
            sectionNote: it.sectionNote,
            sectionDiscountPct: it.sectionDiscountPct, sectionDiscountLabel: it.sectionDiscountLabel,
          })),
        },
      },
      include: { items: { orderBy: { sortOrder: 'asc' } } },
    });

    return NextResponse.json({ order: created }, { status: 201 });
  } catch (error) {
    console.error('STF revision error:', error);
    return NextResponse.json({ error: 'Revizyon oluşturulurken bir hata oluştu' }, { status: 500 });
  }
}
