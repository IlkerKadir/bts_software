import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { generateQuoteNumber, parseQuoteNumber } from '@/lib/quote-number';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/quotes/[id]/revisions
 *
 * Creates a new revision of the quote.
 *
 * Revision model:
 *   - A "root" is the original quote (parentQuoteId = null).
 *   - All revisions are direct children of the root, with
 *     parentQuoteId = root.id. Revisions of revisions do not chain —
 *     the new quote still points at the same root.
 *   - Quote numbers follow the {INITIALS}{NNNN}-{SYSTEM}.{REV} scheme
 *     defined in src/lib/quote-number.ts: the root is
 *     `SA0051-YAS`, its first revision is `SA0051-YAS.1`, second
 *     is `SA0051-YAS.2`, etc.
 *   - The next revision index is `max(version of all children of the
 *     root) + 1`, so sibling collisions are impossible.
 *   - Items / commercial terms / ek maliyet are copied from the
 *     `source` quote (the one the user was looking at when they hit
 *     "create revision"), not from the root — so revising `.2` gives
 *     you `.3` with `.2`'s content, not the original's.
 *   - The source quote's status is set to REVIZYON so the UI can mark
 *     it as "superseded".
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // Fetch the source quote with all the data we need to copy
    const sourceQuote = await db.quote.findUnique({
      where: { id },
      include: {
        items: { orderBy: { sortOrder: 'asc' } },
        commercialTerms: { orderBy: { sortOrder: 'asc' } },
        ekMaliyetler: { orderBy: { sortOrder: 'asc' } },
      },
    });

    if (!sourceQuote) {
      return NextResponse.json({ error: 'Teklif bulunamadı' }, { status: 404 });
    }

    // Resolve the root: if source already is a revision, the root is
    // source.parentQuote; otherwise source itself is the root.
    const rootId = sourceQuote.parentQuoteId ?? sourceQuote.id;
    const rootQuote = sourceQuote.parentQuoteId
      ? await db.quote.findUnique({
          where: { id: rootId },
          select: { id: true, quoteNumber: true },
        })
      : { id: sourceQuote.id, quoteNumber: sourceQuote.quoteNumber };

    if (!rootQuote) {
      return NextResponse.json(
        { error: 'Kök teklif bulunamadı — revizyon zinciri bozuk olabilir' },
        { status: 500 }
      );
    }

    // Parse the root's quote number. The revision scheme requires a
    // system code (`SA0051-YAS`), so reject if we can't build the
    // `.{rev}` suffix deterministically.
    const parsed = parseQuoteNumber(rootQuote.quoteNumber);
    if (!parsed || !parsed.systemCode) {
      return NextResponse.json(
        {
          error:
            'Revizyon oluşturmak için ana teklif numarasında sistem kodu olmalıdır (örn: SA0051-YAS). Önce teklif numarasını güncelleyin.',
        },
        { status: 400 }
      );
    }

    // Next revision = 1 + highest version among all children of the
    // root. We only count rows whose parentQuoteId is the root, so
    // siblings of a deleted branch don't poison the counter.
    const children = await db.quote.findMany({
      where: { parentQuoteId: rootId },
      select: { version: true },
    });
    const maxRev = children.reduce((m, c) => Math.max(m, c.version), 0);
    const nextRev = maxRev + 1;

    const revisionNumber = generateQuoteNumber(
      parsed.initials,
      parsed.sequence,
      parsed.systemCode,
      nextRev
    );

    // Mark the source quote as REVIZYON (superseded). We mark source,
    // not root, so intermediate revisions get flagged correctly when
    // the user revises them.
    await db.quote.update({
      where: { id: sourceQuote.id },
      data: { status: 'REVIZYON' },
    });

    // Create the new revision quote, linked to the root
    const newQuote = await db.quote.create({
      data: {
        quoteNumber: revisionNumber,
        companyId: sourceQuote.companyId,
        projectId: sourceQuote.projectId,
        subject: sourceQuote.subject,
        currency: sourceQuote.currency,
        exchangeRate: sourceQuote.exchangeRate,
        protectionPct: sourceQuote.protectionPct,
        subtotal: sourceQuote.subtotal,
        vatTotal: sourceQuote.vatTotal,
        grandTotal: sourceQuote.grandTotal,
        status: 'TASLAK',
        validityDays: sourceQuote.validityDays,
        version: nextRev,
        parentQuoteId: rootId,
        notes: sourceQuote.notes,
        language: sourceQuote.language,
        createdById: user.id,
      },
      include: {
        company: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
        createdBy: { select: { id: true, fullName: true } },
      },
    });

    // Copy all QuoteItems (two passes: parent items first, then sub-items with remapped parentItemId)
    const oldToNewId = new Map<string, string>();
    if (sourceQuote.items.length > 0) {

      // First pass: create parent items (no parentItemId)
      const parentItems = sourceQuote.items.filter((item) => !item.parentItemId);
      for (const item of parentItems) {
        const created = await db.quoteItem.create({
          data: {
            quoteId: newQuote.id,
            productId: item.productId,
            itemType: item.itemType,
            sortOrder: item.sortOrder,
            code: item.code,
            brand: item.brand,
            model: item.model,
            description: item.description,
            quantity: item.quantity,
            unit: item.unit,
            listPrice: item.listPrice,
            katsayi: item.katsayi,
            unitPrice: item.unitPrice,
            discountPct: item.discountPct,
            vatRate: item.vatRate,
            totalPrice: item.totalPrice,
            notes: item.notes,
            isManualPrice: item.isManualPrice,
            costPrice: item.costPrice,
            ekMaliyetDelta: item.ekMaliyetDelta,
            serviceMeta: item.serviceMeta ?? undefined,
            priceLabel: item.priceLabel,
            currency: item.currency,
            sectionDiscountPct: item.sectionDiscountPct,
            sectionDiscountLabel: item.sectionDiscountLabel,
          },
        });
        oldToNewId.set(item.id, created.id);
      }

      // Second pass: create sub-items with remapped parentItemId
      const subItems = sourceQuote.items.filter((item) => item.parentItemId);
      for (const item of subItems) {
        const newParentId = oldToNewId.get(item.parentItemId!);
        const created = await db.quoteItem.create({
          data: {
            quoteId: newQuote.id,
            productId: item.productId,
            itemType: item.itemType,
            sortOrder: item.sortOrder,
            code: item.code,
            brand: item.brand,
            model: item.model,
            description: item.description,
            quantity: item.quantity,
            unit: item.unit,
            listPrice: item.listPrice,
            katsayi: item.katsayi,
            unitPrice: item.unitPrice,
            discountPct: item.discountPct,
            vatRate: item.vatRate,
            totalPrice: item.totalPrice,
            notes: item.notes,
            isManualPrice: item.isManualPrice,
            costPrice: item.costPrice,
            ekMaliyetDelta: item.ekMaliyetDelta,
            serviceMeta: item.serviceMeta ?? undefined,
            priceLabel: item.priceLabel,
            currency: item.currency,
            sectionDiscountPct: item.sectionDiscountPct,
            sectionDiscountLabel: item.sectionDiscountLabel,
            parentItemId: newParentId ?? null,
          },
        });
        oldToNewId.set(item.id, created.id);
      }
    }

    // Copy all QuoteCommercialTerms
    if (sourceQuote.commercialTerms.length > 0) {
      await db.quoteCommercialTerm.createMany({
        data: sourceQuote.commercialTerms.map((term) => ({
          quoteId: newQuote.id,
          category: term.category,
          value: term.value,
          sortOrder: term.sortOrder,
          highlight: term.highlight,
        })),
      });
    }

    // Copy QuoteEkMaliyet entries
    if (sourceQuote.ekMaliyetler.length > 0) {
      await db.quoteEkMaliyet.createMany({
        data: sourceQuote.ekMaliyetler.map((em) => ({
          quoteId: newQuote.id,
          title: em.title,
          amount: em.amount,
          sortOrder: em.sortOrder,
        })),
      });
    }

    // Create QuoteHistory entry
    await db.quoteHistory.create({
      data: {
        quoteId: newQuote.id,
        userId: user.id,
        action: 'REVISION_CREATED',
        changes: {
          sourceQuoteId: sourceQuote.id,
          sourceQuoteNumber: sourceQuote.quoteNumber,
          rootQuoteId: rootId,
          rootQuoteNumber: rootQuote.quoteNumber,
          version: nextRev,
        },
      },
    });

    return NextResponse.json({ quote: newQuote }, { status: 201 });
  } catch (error) {
    console.error('Revision create error:', error);
    return NextResponse.json(
      { error: 'Revizyon oluşturulurken bir hata oluştu' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/quotes/[id]/revisions
 *
 * Returns the full revision family of a quote: the root plus all its
 * direct children, ordered newest-first by `version`. Works regardless
 * of which quote in the family the caller is looking at.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: quoteId } = await params;

    // Get the quote to check existence and resolve the root.
    const quote = await db.quote.findUnique({
      where: { id: quoteId },
      select: { id: true, version: true, parentQuoteId: true },
    });

    if (!quote) {
      return NextResponse.json({ error: 'Teklif bulunamadı' }, { status: 404 });
    }

    // Root = the caller's parent if it has one, else the caller itself.
    // Revisions of revisions aren't supported, so one hop is enough.
    const rootId = quote.parentQuoteId ?? quote.id;

    // Pull the root itself plus every direct child in one query.
    const revisions = await db.quote.findMany({
      where: {
        OR: [{ id: rootId }, { parentQuoteId: rootId }],
      },
      select: {
        id: true,
        quoteNumber: true,
        version: true,
        status: true,
        grandTotal: true,
        currency: true,
        parentQuoteId: true,
        createdAt: true,
        createdBy: {
          select: {
            id: true,
            fullName: true,
          },
        },
      },
      // Root first (version=1 with no parent), then children by version desc.
      // Prisma can't express "root first" directly, so caller sorts if it
      // wants — we return newest-child-first as that's what the sidebar
      // expects.
      orderBy: { version: 'desc' },
    });

    return NextResponse.json({
      revisions,
      currentVersion: quote.version,
      currentQuoteId: quote.id,
    });
  } catch (error) {
    console.error('Revisions GET error:', error);
    return NextResponse.json(
      { error: 'Revizyon listesi alınırken bir hata oluştu' },
      { status: 500 }
    );
  }
}
