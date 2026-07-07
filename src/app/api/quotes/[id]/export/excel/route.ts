import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { canUserAccessQuote } from '@/lib/quote-access';
import { getExcelService, QuoteDataForExcel, QuoteItemForExcel, CompanyInfo } from '@/lib/excel/excel-service';
import { buildQuoteExportFilename } from '@/lib/filename';
import { convertToQuoteCurrency, type QuoteCurrencyContext } from '@/lib/quote-calculations';
import { getQuoteDisplayDate } from '@/lib/quote-display-date';

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
        project: { include: { visibleTo: { select: { userId: true } } } },
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


    // Visibility: same boundary as the quote list/detail (project role/user rules).
    const isManager = user.role.canApprove || user.role.canManageUsers;
    if (!canUserAccessQuote(user.id, isManager, quote, user.roleId)) {
      return NextResponse.json(
        { error: 'Bu teklife eri\u015Fim yetkiniz yok' },
        { status: 403 }
      );
    }

    // Authorization: user must be the quote creator OR have canExport permission
    if (quote.createdById !== user.id && !user.role.canExport) {
      return NextResponse.json(
        { error: 'Bu işlem için yetkiniz yok' },
        { status: 403 }
      );
    }

    // Use the quote's persisted totals (computed by recalculateAndPersistQuoteTotals)
    const subtotal = Number(quote.subtotal);
    const totalVat = Number(quote.vatTotal);
    const grandTotal = Number(quote.grandTotal);

    // Format date
    const formatDate = (date: Date) => date.toLocaleDateString('tr-TR');

    // Build currency context when the quote has at least one SET with
    // a non-null currency override — otherwise every item is already in
    // the quote's currency and subtotal math stays identical.
    const hasMixedCurrency = quote.items.some(
      (i) => i.currency && i.currency !== quote.currency
    );
    let xlsxCtx: QuoteCurrencyContext | undefined;
    if (hasMixedCurrency) {
      const protectionPct = Number(quote.protectionPct || 0);
      const protectedRate = Number(quote.exchangeRate || 1);
      const baseForeignRate = protectionPct > 0
        ? protectedRate / (1 + protectionPct / 100)
        : protectedRate;
      xlsxCtx = { quoteCurrency: quote.currency, baseForeignRate };
    }

    // Map items to customer-facing interface (no internal columns)
    // Filter out sub-rows (parentItemId != null) — they are internal cost tracking only
    const excelItems: QuoteItemForExcel[] = quote.items
      .filter(item => !item.parentItemId)
      .map(item => {
        const itemType = item.itemType as QuoteItemForExcel['itemType'];
        const description = getItemDescription(item, quote.language);

        const meta = item.serviceMeta as Record<string, unknown> | null;
        const highlight = meta && meta.highlight === true ? true : undefined;

        if (itemType === 'HEADER' || itemType === 'NOTE' || itemType === 'GRAND_TOTAL') {
          // NOTE rows may carry a customPozNo (in serviceMeta) overriding the
          // default "NOT:" marker. HEADER / GRAND_TOTAL ignore the field.
          const customPozNo = meta && typeof meta.customPozNo === 'string' ? meta.customPozNo : null;
          return { itemType, description, customPozNo, highlight };
        }

        if (itemType === 'SUBTOTAL') {
          return {
            itemType,
            description,
            sectionDiscountPct: item.sectionDiscountPct != null ? Number(item.sectionDiscountPct) : null,
            sectionDiscountLabel: item.sectionDiscountLabel ?? null,
            highlight,
          };
        }

        const rawTotal = Number(item.totalPrice);
        let totalPriceInQuoteCurrency: number | undefined;
        if (xlsxCtx && item.currency && item.currency !== xlsxCtx.quoteCurrency) {
          totalPriceInQuoteCurrency = convertToQuoteCurrency(rawTotal, item.currency, xlsxCtx);
        }

        // PRODUCT, CUSTOM, SET - include quantity, unit, prices, katsayı and list price
        return {
          itemType,
          description,
          code: item.code ?? '',
          brand: item.brand ?? '',
          model: item.model ?? '',
          quantity: Number(item.quantity),
          unit: item.unit,
          unitPrice: Number(item.unitPrice),
          totalPrice: rawTotal,
          highlight,
          katsayi: Number(item.katsayi),
          listPrice: Number(item.listPrice),
          priceLabel: item.priceLabel,
          currency: item.currency ?? null,
          totalPriceInQuoteCurrency,
        };
      });

    // Extract notes from commercial terms (NOTLAR category)
    const notlarTerms = quote.commercialTerms.filter(term => term.category === 'NOTLAR');
    const notes = notlarTerms.map(term => ({
      text: term.value,
      sortOrder: term.sortOrder,
      highlight: term.highlight,
    }));

    // All commercial terms (including NOTLAR — the service handles grouping)
    const commercialTerms = quote.commercialTerms
      .map(term => ({
        category: term.category,
        value: term.value,
        sortOrder: term.sortOrder,
        highlight: term.highlight,
      }));

    const excelData: QuoteDataForExcel = {
      quoteNumber: quote.quoteNumber,
      refNo: quote.refNo ?? null,
      subject: quote.subject,
      description: quote.description ?? null,
      date: formatDate(getQuoteDisplayDate(quote)),
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

    const filename = buildQuoteExportFilename(
      {
        quoteNumber: quote.quoteNumber,
        projectName: quote.project?.name,
        companyName: quote.company.name,
      },
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
    console.error('Excel export error:', error);
    return NextResponse.json(
      { error: 'Excel olusturulurken bir hata olustu' },
      { status: 500 }
    );
  }
}
