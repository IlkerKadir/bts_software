import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/quotes/[id]/revisions
 *
 * Creates a new revision of the quote. After #9 the new quote is fully
 * standalone — there is no `parentQuoteId` link, no `version` field
 * bookkeeping, and the source quote is left untouched (no flip to
 * REVIZYON). The relationship to the source survives only as the
 * quote-number suffix.
 *
 * Revision model:
 *   - A revision is a brand-new quote with `parentQuoteId = null` and
 *     `status = TASLAK`. The user edits it like any other draft.
 *   - Numbering is FLAT under a root. We compute the root by stripping
 *     any trailing `.{N}` sequences from the source's quote number, so
 *     revising `Foo`, `Foo.1`, or `Foo.1.2` all share the same root
 *     `Foo`. The new quote's number is `${root}.${nextRev}` — never
 *     `.1.1`, never deeper than one level. Revising a revision is
 *     just another sibling of the original.
 *   - `nextRev` = max numeric direct-child suffix off `root` plus one.
 *     Sibling lookup matches `quoteNumber: { startsWith: '${root}.' }`,
 *     scoped by `companyId` so unrelated quotes at other companies
 *     don't bump the counter. Multi-dot legacy names like `Foo.1.2`
 *     get pulled in by the prefix but ignored by the suffix parser
 *     (the slice after `Foo.` isn't purely a number), so they don't
 *     inflate `nextRev`.
 *   - Items / commercial terms / ek maliyet are deep-copied from the
 *     `source` quote (whichever quote the user clicked from), not
 *     from the computed root. Revising `Foo.1` gives you `Foo.2` with
 *     `Foo.1`'s content — the user is iterating, not restarting.
 *   - The source quote's status, validUntil, and approval timestamps
 *     are NOT touched. An ONAYLANDI quote stays ONAYLANDI; closing
 *     #16 naturally.
 *   - 409 returned on quote-number collision (rare; hand-edited
 *     numbers can produce one).
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

    // Compute the root by stripping any trailing `.{N}` segments from
    // the source's quote number. Revising the original `Foo`, `Foo.1`,
    // or even a legacy `Foo.1.2` all collapse to root = `Foo`, so the
    // next revision lands at `Foo.{N+1}` instead of nesting deeper.
    // Client wanted flat numbering — `.1.1` is "saçma".
    const rootMatch = sourceQuote.quoteNumber.match(/^(.+?)(?:\.\d+)*$/);
    const rootNumber = rootMatch ? rootMatch[1] : sourceQuote.quoteNumber;

    // Sibling lookup: every quote whose number starts with `${root}.`,
    // scoped to the same company so a same-named quote at a different
    // company can't bump this counter.
    const siblings = await db.quote.findMany({
      where: {
        quoteNumber: { startsWith: `${rootNumber}.` },
        companyId: sourceQuote.companyId,
      },
      select: { quoteNumber: true },
    });
    const baseLen = rootNumber.length + 1; // skip "Root."
    const maxRev = siblings.reduce((m, s) => {
      const suffix = s.quoteNumber.slice(baseLen);
      // Only count direct children (suffix is purely a number — no
      // further dots). Legacy multi-dot names like `Foo.1.2` are
      // pulled in by the prefix but ignored here, so they don't
      // inflate the flat counter.
      const n = /^\d+$/.test(suffix) ? parseInt(suffix, 10) : 0;
      return Math.max(m, n);
    }, 0);
    const nextRev = maxRev + 1;

    // Always one level deep under root — flat sibling, never `.1.1`.
    const revisionNumber = `${rootNumber}.${nextRev}`;

    // Defense-in-depth: even with the maxRev calc above, a manually
    // named quote could collide. Surface a clean 409 instead of letting
    // Prisma's unique-violation bubble up.
    const collision = await db.quote.findUnique({
      where: { quoteNumber: revisionNumber },
      select: { id: true },
    });
    if (collision) {
      return NextResponse.json(
        {
          error: `"${revisionNumber}" numaralı bir teklif zaten mevcut. Ana teklif numarasını değiştirin veya çakışan kaydı yeniden adlandırın.`,
        },
        { status: 409 }
      );
    }

    // After #9 the source quote is left untouched — revisions are now
    // standalone new quotes, not children of the original. The user's
    // original ONAYLANDI / GONDERILDI / etc. status stays as-is so the
    // approved-and-shipped record isn't corrupted by the user clicking
    // "Revizyon Oluştur" (#16 follows from this naturally).
    //
    // The new quote starts as TASLAK with no `parentQuoteId` link, no
    // `version` bookkeeping. List grouping that used to nest revisions
    // under their root still works for legacy parent-linked rows and is
    // a no-op for the new standalone ones.
    const newQuote = await db.quote.create({
      data: {
        quoteNumber: revisionNumber,
        companyId: sourceQuote.companyId,
        projectId: sourceQuote.projectId,
        subject: sourceQuote.subject,
        // Description carries free-form metadata (project notes, internal
        // tags). Losing it on revision was an oversight — the user
        // expects the new revision to start as a faithful copy of the
        // source they're iterating on.
        description: sourceQuote.description,
        currency: sourceQuote.currency,
        exchangeRate: sourceQuote.exchangeRate,
        // Preserve the source's exchange-rate context exactly. A
        // revision is "what if we changed X about this approved
        // quote" — it should NOT silently re-fetch today's TCMB
        // rates (that's the clone semantics, which is a different
        // intent). Same for protectionMap (per-currency override
        // matrix). Use Prisma.JsonNull for null source values so
        // Prisma writes a JSON null instead of skipping the column.
        rateSnapshot: sourceQuote.rateSnapshot ?? Prisma.JsonNull,
        protectionPct: sourceQuote.protectionPct,
        protectionMap: sourceQuote.protectionMap ?? Prisma.JsonNull,
        subtotal: sourceQuote.subtotal,
        // Quote-level discount fields. Without these, the new revision's
        // grandTotal would still reflect a discount the discount fields
        // claim isn't there — totals look right but the editor shows
        // "no discount" until the user re-enters it. The scope id
        // points at a SUBTOTAL QuoteItem so it has to be remapped via
        // `oldToNewId` after items are created (see below).
        discountTotal: sourceQuote.discountTotal,
        discountPct: sourceQuote.discountPct,
        vatTotal: sourceQuote.vatTotal,
        grandTotal: sourceQuote.grandTotal,
        status: 'TASLAK',
        validityDays: sourceQuote.validityDays,
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

    // Remap the optional `discountScopeSubtotalId` — it points at a
    // SUBTOTAL QuoteItem and item IDs were just regenerated. Done after
    // both passes so the SUBTOTAL row is guaranteed to exist in the
    // map. If the source's scope target is missing from the map (e.g.
    // dangling FK in legacy data) we fall back to null so the discount
    // applies quote-wide rather than crashing.
    if (sourceQuote.discountScopeSubtotalId) {
      const remappedScopeId =
        oldToNewId.get(sourceQuote.discountScopeSubtotalId) ?? null;
      if (remappedScopeId) {
        await db.quote.update({
          where: { id: newQuote.id },
          data: { discountScopeSubtotalId: remappedScopeId },
        });
      } else {
        console.warn(
          `[revisions] dangling discountScopeSubtotalId=${sourceQuote.discountScopeSubtotalId} on source quote ${sourceQuote.id}; revision will apply discount quote-wide`
        );
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
          // Root is what numbering is keyed off; useful in the audit
          // trail when source is itself a revision (rootNumber !=
          // sourceQuoteNumber in that case).
          rootNumber,
          // `revIndex` rather than `version` since the standalone
          // quote no longer carries a `version` column value.
          revIndex: nextRev,
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

    const quote = await db.quote.findUnique({
      where: { id: quoteId },
      select: { id: true, quoteNumber: true, version: true, parentQuoteId: true, companyId: true },
    });

    if (!quote) {
      return NextResponse.json({ error: 'Teklif bulunamadı' }, { status: 404 });
    }

    // Find the family of related quotes for the version sidebar. Two
    // schemes coexist after #9:
    //   - Legacy quotes (created before #9) link via parentQuoteId →
    //     gather root + every direct child.
    //   - New standalone revisions have no parent link → gather them by
    //     quote-number prefix instead, scoped to the same company so an
    //     unrelated quote with a colliding name doesn't pollute the
    //     family.
    // We compute a "root number" by trimming any trailing `.{N}` from
    // the current quote's number, then match the root + everything
    // that starts with `${rootNumber}.` (covers `.1`, `.1.2`, etc.).
    const rootMatch = quote.quoteNumber.match(/^(.+?)(?:\.\d+)*$/);
    const rootNumber = rootMatch ? rootMatch[1] : quote.quoteNumber;
    const legacyRootId = quote.parentQuoteId ?? quote.id;

    const revisions = await db.quote.findMany({
      where: {
        OR: [
          // Legacy parent-linked tree
          { id: legacyRootId },
          { parentQuoteId: legacyRootId },
          // New standalone tree (matched by quote-number prefix +
          // company so we don't accidentally pull unrelated rows).
          { quoteNumber: rootNumber, companyId: quote.companyId },
          {
            quoteNumber: { startsWith: `${rootNumber}.` },
            companyId: quote.companyId,
          },
        ],
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
      orderBy: { createdAt: 'desc' },
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
