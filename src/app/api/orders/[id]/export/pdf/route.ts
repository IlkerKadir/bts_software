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
          },
        },
        company: true,
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

    // Prepare data for template
    const pdfData: OrderDataForPdf = {
      order: {
        orderNumber: order.orderNumber,
        status: order.status,
        notes: order.notes,
        deliveryDate: order.deliveryDate,
        createdAt: order.createdAt,
      },
      quote: {
        quoteNumber: order.quote.quoteNumber,
        refNo: (order.quote as any).refNo || null,
        subject: order.quote.subject,
        currency: order.quote.currency,
        grandTotal: Number(order.quote.grandTotal),
      },
      company: {
        name: order.company.name,
        address: order.company.address,
        taxNumber: order.company.taxNumber,
        phone: order.company.phone,
        email: order.company.email,
      },
      project: order.quote.project ? { name: order.quote.project.name } : null,
      items: order.quote.items
        .filter(item => item.itemType !== 'SUBTOTAL')
        .map(item => ({
          itemType: item.itemType,
          code: item.code,
          brand: item.brand,
          description: item.description,
          quantity: Number(item.quantity),
          unit: item.unit,
          unitPrice: Number(item.unitPrice),
          totalPrice: Number(item.totalPrice),
        })),
      commercialTerms: order.quote.commercialTerms.map(term => ({
        category: term.category,
        value: term.value,
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
