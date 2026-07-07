import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { generateStfExcel, StfExcelData } from '@/lib/excel/stf-excel';
import { buildStfExportFilename } from '@/lib/filename';
import { canAccessOrder, orderAccessInclude } from '@/lib/orders/order-access';

interface RouteParams { params: Promise<{ id: string }>; }

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getSession();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const order = await db.orderConfirmation.findUnique({
      where: { id },
      include: { ...orderAccessInclude, items: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!order) return NextResponse.json({ error: 'Siparis bulunamadi' }, { status: 404 });

    // Visibility: same boundary as the STF list/detail (project role/user rules).
    const isManager = user.role.canApprove || user.role.canManageUsers;
    if (!canAccessOrder(order, user.id, isManager, user.roleId)) {
      return NextResponse.json({ error: 'Bu STF\u2019ye eri\u015Fim yetkiniz yok' }, { status: 403 });
    }

    // Same export gate as the PDF: creator OR canExport.
    if (order.createdById !== user.id && !user.role.canExport) {
      return NextResponse.json({ error: 'Bu siparisi disa aktarma yetkiniz bulunmamaktadir' }, { status: 403 });
    }

    const excelData: StfExcelData = {
      order: {
        orderNumber: order.orderNumber, customerName: order.customerName, customerAddress: order.customerAddress,
        customerPhone: order.customerPhone, customerTaxInfo: order.customerTaxInfo, projectName: order.projectName,
        quoteNo: order.quoteNo, refNo: order.refNo, formDate: order.formDate, siparisNo: order.siparisNo,
        currency: order.currency, manufacturers: order.manufacturers, warranty: order.warranty,
        deliveryPlace: order.deliveryPlace, deliveryTime: order.deliveryTime, paymentTerms: order.paymentTerms,
        vatNote: order.vatNote, notes: order.notes, freeNote: order.freeNote,
        customerApprovalName: order.customerApprovalName,
        btsResponsibleName: order.btsResponsibleName,
      },
      items: order.items.map((it) => ({
        itemType: it.itemType, pozNo: it.pozNo, code: it.code, brand: it.brand, model: it.model,
        description: it.description, quantity: Number(it.quantity), unit: it.unit,
        unitPrice: Number(it.unitPrice), totalPrice: Number(it.totalPrice), priceLabel: it.priceLabel,
        parentItemId: it.parentItemId,
        sectionDiscountPct: it.sectionDiscountPct === null ? null : Number(it.sectionDiscountPct),
        sectionDiscountLabel: it.sectionDiscountLabel,
      })),
    };

    const buffer = await generateStfExcel(excelData);
    const filename = buildStfExportFilename(
      { orderNumber: order.orderNumber, projectName: order.projectName, companyName: order.customerName },
      'xlsx'
    );
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': buffer.length.toString(),
      },
    });
  } catch (error) {
    console.error('Order Excel export error:', error);
    return NextResponse.json({ error: 'Excel olusturulurken bir hata olustu' }, { status: 500 });
  }
}
