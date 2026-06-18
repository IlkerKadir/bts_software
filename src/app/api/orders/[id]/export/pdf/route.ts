import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { getPdfService } from '@/lib/pdf/pdf-service';
import { generateOrderHtml, OrderDataForPdf } from '@/lib/pdf/order-template';
import fs from 'fs';
import path from 'path';

interface RouteParams {
  params: Promise<{ id: string }>;
}

function loadImageBase64(relativePath: string): string | undefined {
  try {
    const filePath = path.join(process.cwd(), relativePath);
    const buffer = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
    return `data:${mime};base64,${buffer.toString('base64')}`;
  } catch {
    return undefined;
  }
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
        items: { orderBy: { sortOrder: 'asc' } },
        createdBy: { select: { id: true, fullName: true } },
      },
    });

    if (!order) {
      return NextResponse.json({ error: 'Siparis bulunamadi' }, { status: 404 });
    }

    // Authorization: user must be the order creator OR have canExport permission
    if (order.createdById !== user.id && !user.role.canExport) {
      return NextResponse.json(
        { error: 'Bu siparisi disa aktarma yetkiniz bulunmamaktadir' },
        { status: 403 }
      );
    }

    // Load header banner image
    const headerBase64 = loadImageBase64('public/header/BTS_teklif_form.png') || loadImageBase64('pdf/header/BTS_teklif_form.png');
    const logoBase64 = headerBase64 ? undefined : loadImageBase64('public/btslogo.png');

    // Prepare data for template from the STF snapshot (NOT the live quote).
    const pdfData: OrderDataForPdf = {
      order: {
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        customerAddress: order.customerAddress,
        customerPhone: order.customerPhone,
        customerTaxInfo: order.customerTaxInfo,
        projectName: order.projectName,
        quoteNo: order.quoteNo,
        refNo: order.refNo,
        formDate: order.formDate,
        siparisNo: order.siparisNo,
        currency: order.currency,
        manufacturers: order.manufacturers,
        warranty: order.warranty,
        deliveryPlace: order.deliveryPlace,
        paymentTerms: order.paymentTerms,
        vatNote: order.vatNote,
        notes: order.notes,
        customerApprovalName: order.customerApprovalName,
        btsResponsibleName: order.btsResponsibleName,
      },
      items: order.items.map((it) => ({
        itemType: it.itemType,
        pozNo: it.pozNo,
        code: it.code,
        brand: it.brand,
        description: it.description,
        quantity: Number(it.quantity),
        unit: it.unit,
        unitPrice: Number(it.unitPrice),
        totalPrice: Number(it.totalPrice),
        priceLabel: it.priceLabel,
        parentItemId: it.parentItemId,
        sectionDiscountPct: it.sectionDiscountPct === null ? null : Number(it.sectionDiscountPct),
        sectionDiscountLabel: it.sectionDiscountLabel,
      })),
      headerBase64,
      logoBase64,
    };

    // Generate HTML and PDF
    const html = generateOrderHtml(pdfData);
    const pdfService = getPdfService();
    const pdfBuffer = await pdfService.generatePdf(html);

    // Return PDF as download
    const filename = `${order.orderNumber}.pdf`;
    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': pdfBuffer.length.toString(),
      },
    });
  } catch (error) {
    console.error('Order PDF export error:', error);
    return NextResponse.json(
      { error: 'PDF olusturulurken bir hata olustu' },
      { status: 500 }
    );
  }
}
