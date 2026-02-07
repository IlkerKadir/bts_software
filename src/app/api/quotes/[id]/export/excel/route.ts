import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { getExcelService, QuoteDataForExcel, QuoteItemForExcel, CompanyInfo } from '@/lib/excel/excel-service';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * Extract system brand from items (first PRODUCT item's brand)
 */
function extractSystemBrand(items: { itemType: string; brand: string | null }[]): string | null {
  const firstProduct = items.find(item => item.itemType === 'PRODUCT' && item.brand);
  return firstProduct?.brand || null;
}

/**
 * Get item description based on quote language.
 * Uses nameTr for Turkish, nameEn for English, fallback to description.
 */
function getItemDescription(
  item: {
    description: string;
    product?: { nameTr?: string | null; nameEn?: string | null } | null;
  },
  language: string
): string {
  if (language === 'EN' && item.product?.nameEn) {
    return item.product.nameEn;
  }
  if (language === 'TR' && item.product?.nameTr) {
    return item.product.nameTr;
  }
  return item.description;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: quoteId } = await params;

    const quote = await db.quote.findUnique({
      where: { id: quoteId },
      include: {
        company: true,
        project: true,
        items: {
          orderBy: { sortOrder: 'asc' },
          include: {
            product: true,
          },
        },
        commercialTerms: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (!quote) {
      return NextResponse.json({ error: 'Teklif bulunamadi' }, { status: 404 });
    }

    // Use the quote's persisted totals (computed by recalculateAndPersistQuoteTotals)
    const subtotal = Number(quote.subtotal);
    const totalVat = Number(quote.vatTotal);
    const grandTotal = Number(quote.grandTotal);

    // Format date
    const formatDate = (date: Date) => date.toLocaleDateString('tr-TR');

    // Map items to customer-facing interface (no internal columns)
    const excelItems: QuoteItemForExcel[] = quote.items.map(item => {
      const itemType = item.itemType as QuoteItemForExcel['itemType'];
      const description = getItemDescription(item, quote.language);

      if (itemType === 'HEADER' || itemType === 'NOTE') {
        return { itemType, description };
      }

      // PRODUCT, CUSTOM, SERVICE - include quantity and prices
      return {
        itemType,
        description,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
        totalPrice: Number(item.totalPrice),
      };
    });

    // Extract notes from commercial terms (NOTLAR category)
    const notlarTerms = quote.commercialTerms.filter(term => term.category === 'NOTLAR');
    const notes = notlarTerms.map(term => ({
      text: term.value,
      sortOrder: term.sortOrder,
    }));

    // Commercial terms excluding NOTLAR (those go to notes section)
    const commercialTerms = quote.commercialTerms
      .filter(term => term.category !== 'NOTLAR')
      .map(term => ({
        category: term.category,
        value: term.value,
        sortOrder: term.sortOrder,
      }));

    const excelData: QuoteDataForExcel = {
      quoteNumber: quote.quoteNumber,
      refNo: null,
      subject: quote.subject,
      date: formatDate(quote.createdAt),
      validUntil: quote.validUntil ? formatDate(quote.validUntil) : null,
      currency: quote.currency,
      company: {
        name: quote.company.name,
        address: quote.company.address,
      },
      project: quote.project?.name || null,
      systemBrand: extractSystemBrand(quote.items),
      items: excelItems,
      totals: {
        subtotal,
        totalVat,
        grandTotal,
      },
      commercialTerms,
      notes: notes.length > 0 ? notes : undefined,
    };

    // Load optional company info override from system settings
    let companyInfo: CompanyInfo | undefined;
    try {
      const templateSettings = await db.systemSetting.findFirst({ where: { key: 'template_settings' } });
      if (templateSettings) {
        companyInfo = JSON.parse(String(templateSettings.value)) as CompanyInfo;
      }
    } catch {
      // Fallback to default company info if settings can't be loaded
    }

    const excelService = getExcelService();
    const buffer = await excelService.generateQuoteExcel(excelData, companyInfo);

    const filename = `${quote.quoteNumber}.xlsx`;
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': buffer.length.toString(),
      },
    });
  } catch (error) {
    console.error('Excel export error:', error);
    return NextResponse.json(
      { error: 'Excel olusturulurken bir hata olustu' },
      { status: 500 }
    );
  }
}
