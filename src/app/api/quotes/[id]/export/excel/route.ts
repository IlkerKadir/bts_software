import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { canUserAccessQuote } from '@/lib/quote-access';
import { getExcelService, QuoteDataForExcel, QuoteItemForExcel, CompanyInfo } from '@/lib/excel/excel-service';
import { buildQuoteExportFilename } from '@/lib/filename';
import { convertToQuoteCurrency, type QuoteCurrencyContext } from '@/lib/quote-calculations';
import { getEffectiveCostPriceForItem, getSetEffectiveCostPrice } from '@/lib/ek-maliyet';
import { computePriceHistoryStats, type PriceHistoryStats } from '@/lib/price-history-stats';
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

    // SET children ship in the Excel (client 27.07: "STF'deki gibi ama
    // fiyatları ile") seated directly behind their parent. A dangling
    // parentItemId (unreachable today — children cascade-delete with the
    // parent) degrades to a standalone top-level poz'd row rather than
    // disappearing. Sums in the Excel writer skip sub-rows, so including
    // them cannot double-count.
    const knownIds = new Set(quote.items.map(i => i.id));
    const childrenByParent = new Map<string, typeof quote.items>();
    const topLevelItems: typeof quote.items = [];
    for (const it of quote.items) {
      const pid = it.parentItemId && knownIds.has(it.parentItemId) ? it.parentItemId : null;
      if (pid) {
        const list = childrenByParent.get(pid) ?? [];
        list.push(it);
        childrenByParent.set(pid, list);
      } else {
        topLevelItems.push(it);
      }
    }
    const orderedItems = topLevelItems.flatMap(it => [it, ...(childrenByParent.get(it.id) ?? [])]);

    // MALİYET column is manager-only (canViewCosts) — server-side gate,
    // never driven by a client parameter.
    const includeCosts = user.role.canViewCosts === true;
    const effectiveUnitCost = (item: (typeof quote.items)[number]): number | null => {
      // Mirrors the editor's Maliyet column: a SET aggregates its
      // children; a childless SET falls back to its own cost fields.
      if (item.itemType === 'SET') {
        const children = (childrenByParent.get(item.id) ?? []).map(c => ({
          itemType: c.itemType,
          costPrice: c.costPrice,
          ekMaliyetDelta: c.ekMaliyetDelta,
          listPrice: c.listPrice,
          quantity: Number(c.quantity),
        }));
        if (children.length > 0) return getSetEffectiveCostPrice(children);
      }
      return getEffectiveCostPriceForItem(item);
    };

    // Fiyat Geçmişi columns (manager Excel only): per-product price
    // stats for this company — same helper the editor's batch-stats
    // endpoint uses, so the two surfaces always agree.
    let historyByProduct: Record<string, PriceHistoryStats> = {};
    if (includeCosts) {
      const productIds = [
        ...new Set(orderedItems.map(i => i.productId).filter((id): id is string => !!id)),
      ];
      historyByProduct = await computePriceHistoryStats(quote.companyId, productIds);
    }

    const excelItems: QuoteItemForExcel[] = orderedItems
      .map(item => {
        const itemType = item.itemType as QuoteItemForExcel['itemType'];
        // The item's OWN description — what the user sees/edited in the
        // editor and what the PDF prints. The old catalog-name preference
        // (product.nameTr/nameEn) silently reverted user edits (client 27.07).
        const description = item.description;
        const isSubRow = !!(item.parentItemId && knownIds.has(item.parentItemId));
        const parentSet = isSubRow ? quote.items.find(p => p.id === item.parentItemId) : undefined;

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
        if (!isSubRow && xlsxCtx && item.currency && item.currency !== xlsxCtx.quoteCurrency) {
          totalPriceInQuoteCurrency = convertToQuoteCurrency(rawTotal, item.currency, xlsxCtx);
        }

        // PRODUCT, CUSTOM, SET - include quantity, unit, prices, katsayı and list price
        return {
          itemType,
          description,
          customPozNo:
            !isSubRow && meta && typeof meta.customPozNo === 'string' ? meta.customPozNo : null,
          code: item.code ?? '',
          brand: item.brand ?? '',
          model: item.model ?? '',
          quantity: Number(item.quantity),
          unit: item.unit,
          unitPrice: Number(item.unitPrice),
          totalPrice: rawTotal,
          highlight,
          // Internal fields ship only in the manager payload — the
          // writer ignores them otherwise, this is defense-in-depth.
          katsayi: includeCosts ? Number(item.katsayi) : undefined,
          // Display value — ek maliyet dahil, like the editor's Liste
          // Fiyatı column (only rendered in the manager layout).
          listPrice: includeCosts
            ? Number(item.listPrice) +
              (item.ekMaliyetDelta != null ? Number(item.ekMaliyetDelta) : 0)
            : undefined,
          priceLabel: item.priceLabel,
          // Children inherit their parent SET's currency so their price
          // cells render with the SET's symbol (mirrors the editor).
          currency: isSubRow
            ? (item.currency ?? parentSet?.currency ?? null)
            : (item.currency ?? null),
          totalPriceInQuoteCurrency,
          isSubRow,
          costPrice: includeCosts ? effectiveUnitCost(item) : undefined,
          history:
            includeCosts && item.productId
              ? historyByProduct[item.productId] ?? null
              : null,
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
      includeCosts,
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
