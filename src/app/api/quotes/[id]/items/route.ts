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
    const sectionDiscountLabel = isSubtotal && data.sectionDiscountLabel
      ? data.sectionDiscountLabel.trim() || null
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

    // Cost resolution. The catalog APIs (`/api/products`,
    // `/api/products/search`) hide `costPrice` from non-canViewCosts
    // users — so a salesperson's client posts here with `costPrice`
    // null/undefined. Without a server-side fallback, the QuoteItem
    // ends up cost-less, and the manager who later approves the quote
    // (canViewCosts) opens it and sees an empty cost column even
    // though the master product has a known cost.
    //
    // The editor computes its conversion as:
    //   converted = master * rate * (1 + protectionPct / 100)
    // and now sends the same factor (`rate × (1 + protectionPct/100)`)
    // alongside the item as `costConversionFactor`. The server
    // multiplies the master cost by this factor to reproduce exactly
    // what a canViewCosts user's editor would have written.
    //
    // Why a factor and not server-side rate logic: replicating the
    // editor's rate/protection/SET-override formula on the server
    // would drift the next time the client formula changes, and the
    // server doesn't have the editor's runtime context (live TCMB
    // rates, per-pair protection map, parent-SET currency override)
    // without re-loading and re-deriving them.
    //
    // Why a factor and not a listPrice ratio: the ratio approach
    // (data.listPrice / master.listPrice) breaks for products with
    // master.listPrice == 0 (insurance, service items) — they often
    // have a real cost but no list price.
    //
    // Edge cases:
    //   - canViewCosts user sends an explicit value: trusted as-is
    //     (could be a manual override).
    //   - Older clients that don't send factor: fall back to listPrice
    //     ratio (works for non-zero master listPrice; same currency
    //     case has factor=1 implicitly via ratio=1).
    //   - CUSTOM items (no productId): unchanged null-fallback
    //     behavior.
    let resolvedCostPrice: number | null = data.costPrice ?? null;
    if (data.productId && resolvedCostPrice == null) {
      const masterProduct = await db.product.findUnique({
        where: { id: data.productId },
        select: { costPrice: true, listPrice: true },
      });
      if (masterProduct?.costPrice != null) {
        const masterCostPrice = Number(masterProduct.costPrice);
        const masterListPrice = Number(masterProduct.listPrice);

        let factor: number;
        let factorSource: string;
        if (data.costConversionFactor != null && data.costConversionFactor > 0) {
          // Preferred: explicit factor from editor
          factor = data.costConversionFactor;
          factorSource = 'explicit';
        } else if (masterListPrice > 0) {
          // Fallback: derive from listPrice ratio (older clients)
          factor = data.listPrice / masterListPrice;
          factorSource = 'ratio';
        } else {
          // Last resort: no factor, no ratio. Same-currency case is
          // captured by factor=1 above; foreign-currency master with
          // listPrice=0 and no factor is genuinely unrecoverable, so
          // write null rather than a wrong-currency value.
          factor = 1;
          factorSource = 'identity';
        }
        resolvedCostPrice = masterCostPrice * factor;
        // Audit breadcrumb — distinguishes "client sent X" from
        // "server resolved X" if a question arises later about a
        // quote's cost provenance.
        console.info(
          `[items POST] resolved costPrice from master: quoteId=${quoteId} productId=${data.productId} masterCost=${masterCostPrice} factor=${factor} source=${factorSource} resolved=${resolvedCostPrice}`
        );
      }
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
        costPrice: resolvedCostPrice,
        ekMaliyetDelta: data.ekMaliyetDelta ?? null,
        currency: itemCurrency,
        sectionDiscountPct,
        sectionDiscountLabel,
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

        // Per-section discount % — only meaningful on SUBTOTAL rows.
        // Undefined means "don't touch" (payload omitted the field);
        // null or an explicit value on a non-SUBTOTAL row gets coerced
        // to null so the DB never holds orphan state on a PRODUCT/CUSTOM/SET
        // row. Mirrors the `currency` normalization pattern above.
        const isSubtotalRow = item.itemType === 'SUBTOTAL';
        let sectionDiscountPctUpdate: number | null | undefined;
        if (item.sectionDiscountPct === undefined) {
          sectionDiscountPctUpdate = undefined;
        } else if (!isSubtotalRow || item.sectionDiscountPct === null) {
          sectionDiscountPctUpdate = null;
        } else {
          sectionDiscountPctUpdate = item.sectionDiscountPct;
        }

        // Same undef=no-touch pattern for the custom discount label.
        let sectionDiscountLabelUpdate: string | null | undefined;
        if (item.sectionDiscountLabel === undefined) {
          sectionDiscountLabelUpdate = undefined;
        } else if (!isSubtotalRow || !item.sectionDiscountLabel) {
          sectionDiscountLabelUpdate = null;
        } else {
          const trimmed = item.sectionDiscountLabel.trim();
          sectionDiscountLabelUpdate = trimmed || null;
        }

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

        // Cost resolution for PUT. Default behavior: respect the
        // body's costPrice (or skip update if null/undefined). When
        // the editor sends a `costConversionFactor` AND the item has
        // a productId, override the body's costPrice with master ×
        // factor. The editor only sends the factor for items where
        // `productCostPrice` was null in local state — i.e., the
        // salesperson case where the catalog API filtered cost. This
        // ensures currency-change saves on salesperson-prepared
        // quotes don't ship a stale costPrice from the previous
        // currency. Manager flow doesn't send factor → unchanged.
        let costPriceUpdate: number | null | undefined = item.costPrice ?? undefined;
        if (
          item.productId &&
          item.costConversionFactor != null &&
          item.costConversionFactor > 0
        ) {
          const masterProduct = await tx.product.findUnique({
            where: { id: item.productId },
            select: { costPrice: true },
          });
          if (masterProduct?.costPrice != null) {
            costPriceUpdate = Number(masterProduct.costPrice) * item.costConversionFactor;
            console.info(
              `[items PUT] resolved costPrice via factor: itemId=${item.id} productId=${item.productId} factor=${item.costConversionFactor} resolved=${costPriceUpdate}`
            );
          }
        }

        await tx.quoteItem.update({
          where: { id: item.id },
          data: {
            sortOrder: item.sortOrder,
            // Allow swapping the underlying product on a PRODUCT/SET row
            // by accepting a new productId. HEADER/NOTE/SUBTOTAL/GRAND_TOTAL
            // never carry a productId; passing undefined leaves the column
            // alone, null clears it, a string sets it.
            productId: item.productId === undefined ? undefined : (item.productId ?? null),
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
            costPrice: costPriceUpdate,
            ekMaliyetDelta: item.ekMaliyetDelta !== undefined ? item.ekMaliyetDelta : undefined,
            serviceMeta: item.serviceMeta !== undefined ? item.serviceMeta : undefined,
            ...(currencyUpdate === undefined ? {} : { currency: currencyUpdate }),
            ...(sectionDiscountPctUpdate === undefined ? {} : { sectionDiscountPct: sectionDiscountPctUpdate }),
            ...(sectionDiscountLabelUpdate === undefined ? {} : { sectionDiscountLabel: sectionDiscountLabelUpdate }),
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

