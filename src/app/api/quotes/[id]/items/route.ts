import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import {
  calculateUnitPrice,
  recalculateAndPersistQuoteTotals,
} from '@/lib/quote-calculations';
import { roundUnitPrice, computeRowTotal, round2 } from '@/lib/quote-rounding';
import { quoteItemSchema, bulkQuoteItemUpdateSchema } from '@/lib/validations/quote';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: quoteId } = await params;

    // Verify quote exists
    const quote = await db.quote.findUnique({ where: { id: quoteId } });
    if (!quote) {
      return NextResponse.json({ error: 'Teklif bulunamadı' }, { status: 404 });
    }

    // Fetch items
    const items = await db.quoteItem.findMany({
      where: { quoteId },
      orderBy: { sortOrder: 'asc' },
      include: {
        product: {
          include: {
            brand: true,
            category: true,
          },
        },
        subRows: {
          orderBy: { sortOrder: 'asc' },
          include: {
            product: {
              include: { brand: true, category: true },
            },
          },
        },
      },
    });

    return NextResponse.json({ items });
  } catch (error) {
    console.error('Quote items GET error:', error);
    return NextResponse.json(
      { error: 'Kalemler yüklenirken bir hata oluştu' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: quoteId } = await params;
    const body = await request.json();

    // Validate input using schema
    const validation = quoteItemSchema.safeParse(body);
    if (!validation.success) {
      const firstError = validation.error.issues[0];
      return NextResponse.json(
        { error: firstError?.message || 'Geçersiz kalem verisi' },
        { status: 400 }
      );
    }
    const data = validation.data;

    // Verify quote exists
    const quote = await db.quote.findUnique({ where: { id: quoteId } });
    if (!quote) {
      return NextResponse.json({ error: 'Teklif bulunamadı' }, { status: 404 });
    }

    // Regular users cannot add items to ONAY_BEKLIYOR quotes — only approvers can
    if (quote.status === 'ONAY_BEKLIYOR' && !user.role.canApprove) {
      return NextResponse.json(
        { error: 'Onay bekleyen tekliflere sadece onay yetkisi olan kullanıcılar kalem ekleyebilir' },
        { status: 403 }
      );
    }

    // Get max sort order
    const maxItem = await db.quoteItem.findFirst({
      where: { quoteId },
      orderBy: { sortOrder: 'desc' },
    });
    const nextSortOrder = (maxItem?.sortOrder || 0) + 1;

    // Calculate prices using tested calculation module
    const { listPrice, katsayi, quantity, discountPct, vatRate } = data;
    const isManualPrice = body.isManualPrice === true;
    const isSubtotal = data.itemType === 'SUBTOTAL';
    const isGrandTotal = data.itemType === 'GRAND_TOTAL';
    const isNonPriced = data.itemType === 'HEADER' || data.itemType === 'NOTE' || isSubtotal || isGrandTotal;
    // SET parents have unitPrice = childrenTotal — starts at 0 until children are added
    const isSetParent = data.itemType === 'SET' && !data.parentItemId;

    // Per-section discount % — only meaningful on SUBTOTAL rows. Any
    // stray value on a non-SUBTOTAL row is silently coerced to null so
    // the DB never holds orphan state.
    const sectionDiscountPct = isSubtotal && data.sectionDiscountPct != null
      ? data.sectionDiscountPct
      : null;

    // For non-priced items (HEADER, NOTE, SUBTOTAL, GRAND_TOTAL),
    // zero out prices. For SET parents, start at 0 (price derived from
    // children). For manual-price items, accept the client unitPrice
    // through the same tier-round rule. Otherwise, compute from
    // listPrice × katsayi.
    //
    // `totalPrice` is never trusted from the client — always
    // recomputed from the (rounded) unitPrice so the row total and
    // the section subtotal always agree.
    let unitPrice: number;
    if (isNonPriced || isSetParent) {
      unitPrice = 0;
    } else if (isManualPrice && body.unitPrice != null) {
      unitPrice = roundUnitPrice(Number(body.unitPrice));
    } else {
      unitPrice = roundUnitPrice(calculateUnitPrice(listPrice, katsayi));
    }

    const totalPrice = (isNonPriced || isSetParent)
      ? 0
      : computeRowTotal({ quantity, unitPrice, discountPct });

    // Per-SET currency override: only accepted on top-level SET rows,
    // and only when the value is either 'TRY' or the parent quote's
    // currency. Any other combination is rejected — children never
    // carry their own currency (they inherit), and non-SET rows must
    // always sit in the quote's currency. An override equal to the
    // quote's currency is normalized to NULL so the DB only holds
    // meaningful overrides (keeps `hasMixedCurrency` detection cheap).
    let itemCurrency: string | null = null;
    if (data.currency) {
      if (!isSetParent) {
        return NextResponse.json(
          { error: 'Para birimi sadece set başlığına atanabilir' },
          { status: 400 }
        );
      }
      if (data.currency !== 'TRY' && data.currency !== quote.currency) {
        return NextResponse.json(
          { error: `Set para birimi yalnızca TRY veya teklif para birimi (${quote.currency}) olabilir` },
          { status: 400 }
        );
      }
      itemCurrency = data.currency === quote.currency ? null : data.currency;
    }

    const item = await db.quoteItem.create({
      data: {
        quoteId,
        productId: data.productId || null,
        itemType: data.itemType,
        sortOrder: body.sortOrder ?? nextSortOrder,
        code: data.code || null,
        brand: data.brand || null,
        model: data.model || null,
        description: data.description,
        quantity,
        unit: data.unit,
        listPrice,
        katsayi,
        unitPrice,
        discountPct,
        vatRate,
        totalPrice,
        isManualPrice,
        notes: data.notes || null,
        priceLabel: data.priceLabel || null,
        parentItemId: data.parentItemId || null,
        costPrice: data.costPrice ?? null,
        ekMaliyetDelta: data.ekMaliyetDelta ?? null,
        currency: itemCurrency,
        sectionDiscountPct,
      },
      include: {
        product: {
          include: {
            brand: true,
            category: true,
          },
        },
        subRows: true,
      },
    });

    // Recalculate quote totals
    await recalculateAndPersistQuoteTotals(quoteId);

    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    console.error('Quote item POST error:', error);
    return NextResponse.json(
      { error: 'Kalem eklenirken bir hata oluştu' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: quoteId } = await params;
    const body = await request.json();

    // Validate input using schema
    const validation = bulkQuoteItemUpdateSchema.safeParse(body);
    if (!validation.success) {
      const firstError = validation.error.issues[0];
      return NextResponse.json(
        { error: firstError?.message || 'Geçersiz kalem verisi' },
        { status: 400 }
      );
    }
    const { items: validatedItems } = validation.data;

    // Verify quote exists
    const quote = await db.quote.findUnique({ where: { id: quoteId } });
    if (!quote) {
      return NextResponse.json({ error: 'Teklif bulunamadı' }, { status: 404 });
    }

    // Regular users cannot update items on ONAY_BEKLIYOR quotes — only approvers can
    if (quote.status === 'ONAY_BEKLIYOR' && !user.role.canApprove) {
      return NextResponse.json(
        { error: 'Onay bekleyen tekliflerin kalemleri sadece onay yetkisi olan kullanıcılar tarafından düzenlenebilir' },
        { status: 403 }
      );
    }

    // Pre-validate SET currency overrides across the batch so a bad
    // value returns a friendly 400 instead of tripping the generic
    // transaction 500 below.
    for (const item of validatedItems) {
      if (item.currency == null) continue;
      const isSetParent = item.itemType === 'SET' && !item.parentItemId;
      if (!isSetParent) continue;
      if (item.currency !== 'TRY' && item.currency !== quote.currency) {
        return NextResponse.json(
          { error: `Set para birimi yalnızca TRY veya teklif para birimi (${quote.currency}) olabilir` },
          { status: 400 }
        );
      }
    }

    // Update items in a transaction
    await db.$transaction(async (tx) => {
      for (const item of validatedItems) {
        const { listPrice, katsayi, quantity, discountPct, vatRate } = item;
        const isManualPrice = item.isManualPrice === true;
        const isNonPriced =
          item.itemType === 'HEADER' ||
          item.itemType === 'NOTE' ||
          item.itemType === 'SUBTOTAL' ||
          item.itemType === 'GRAND_TOTAL';
        // SET parents have unitPrice = sum of children's totalPrice —
        // round2 only, no tier-round (children are already rounded).
        const isSetParent = item.itemType === 'SET' && !item.parentItemId;

        // Per-section discount % — only meaningful on SUBTOTAL rows. Any
        // stray value on a non-SUBTOTAL row is silently coerced to null so
        // the DB never holds orphan state.
        const isSubtotalRow = item.itemType === 'SUBTOTAL';
        const sectionDiscountPct = isSubtotalRow && item.sectionDiscountPct != null
          ? item.sectionDiscountPct
          : null;

        // Normalize the currency override. Undefined means "don't
        // touch" (PUT omits the field → keep existing DB value); null
        // means "clear back to quote currency"; a set value on a
        // non-SET row gets coerced to null so we never store an
        // orphaned override on a child or PRODUCT row; a value equal
        // to the quote's currency is also normalized to null so the
        // DB only holds meaningful overrides. The cross-quote
        // validity check already ran above as a pre-flight.
        let currencyUpdate: string | null | undefined;
        if (item.currency === undefined) {
          currencyUpdate = undefined;
        } else if (item.currency === null || !isSetParent) {
          currencyUpdate = null;
        } else if (item.currency === quote.currency) {
          currencyUpdate = null;
        } else {
          currencyUpdate = item.currency;
        }

        // Include ekMaliyetDelta in the effective list price for
        // unitPrice computation.
        const ekDelta = item.ekMaliyetDelta != null ? Number(item.ekMaliyetDelta) : 0;
        const effectiveListPrice = listPrice + ekDelta;

        // Single choke point for unit price normalization:
        // - non-priced rows → 0
        // - SET parents → round2 of whatever the client computed from
        //   children (no ceiling)
        // - manual price → client value through the tier-round rule
        // - auto (regular PRODUCT) → listPrice × katsayi through the
        //   tier-round rule
        // In every case, totalPrice is recomputed from the (rounded)
        // unit price — the client-sent totalPrice is ignored.
        let unitPrice: number;
        if (isNonPriced) {
          unitPrice = 0;
        } else if (isSetParent) {
          unitPrice = round2(Number(item.unitPrice ?? 0));
        } else if (isManualPrice && item.unitPrice != null) {
          unitPrice = roundUnitPrice(Number(item.unitPrice));
        } else {
          unitPrice = roundUnitPrice(
            calculateUnitPrice(effectiveListPrice, katsayi)
          );
        }

        const totalPrice = isNonPriced
          ? 0
          : computeRowTotal({ quantity, unitPrice, discountPct });

        await tx.quoteItem.update({
          where: { id: item.id },
          data: {
            sortOrder: item.sortOrder,
            code: item.code || null,
            brand: item.brand || null,
            model: item.model || null,
            description: item.description,
            quantity,
            unit: item.unit,
            listPrice,
            katsayi,
            unitPrice,
            discountPct,
            vatRate,
            totalPrice,
            isManualPrice,
            notes: item.notes || null,
            priceLabel: item.priceLabel || null,
            parentItemId: item.parentItemId || null,
            costPrice: item.costPrice ?? undefined,
            ekMaliyetDelta: item.ekMaliyetDelta !== undefined ? item.ekMaliyetDelta : undefined,
            serviceMeta: item.serviceMeta !== undefined ? item.serviceMeta : undefined,
            ...(currencyUpdate === undefined ? {} : { currency: currencyUpdate }),
            sectionDiscountPct,
          },
        });
      }
    });

    // Recalculate quote totals
    await recalculateAndPersistQuoteTotals(quoteId);

    // Record history entry for item updates
    await db.quoteHistory.create({
      data: {
        quoteId,
        userId: user.id,
        action: 'UPDATE',
        changes: { itemsUpdated: validatedItems.length },
      },
    });

    // Fetch updated items
    const items = await db.quoteItem.findMany({
      where: { quoteId },
      orderBy: { sortOrder: 'asc' },
      include: {
        product: {
          include: {
            brand: true,
            category: true,
          },
        },
        subRows: {
          orderBy: { sortOrder: 'asc' },
          include: {
            product: {
              include: { brand: true, category: true },
            },
          },
        },
      },
    });

    return NextResponse.json({ items });
  } catch (error) {
    console.error('Quote items PUT error:', error);
    return NextResponse.json(
      { error: 'Kalemler güncellenirken bir hata oluştu' },
      { status: 500 }
    );
  }
}

