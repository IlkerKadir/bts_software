import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { generateQuoteNumber, getNextSequence, getInitials, getInitialsPrefix } from '@/lib/quote-number';
import { fetchTcmbDirectRates, buildRateMatrix } from '@/lib/services/tcmb-service';
import { Prisma } from '@prisma/client';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // Optional overrides from the client — when the user clones a
    // quote for a different customer, they pick a new company (and
    // optionally a new project) in the clone dialog. When omitted,
    // the clone inherits the source's company and project.
    let overrideCompanyId: string | undefined;
    let overrideProjectId: string | null | undefined;
    try {
      const body = await request.json().catch(() => ({}));
      if (body && typeof body === 'object') {
        const b = body as { companyId?: unknown; projectId?: unknown };
        if (typeof b.companyId === 'string' && b.companyId.length > 0) {
          overrideCompanyId = b.companyId;
        }
        if (b.projectId === null) {
          overrideProjectId = null;
        } else if (typeof b.projectId === 'string' && b.projectId.length > 0) {
          overrideProjectId = b.projectId;
        }
      }
    } catch { /* empty body — inherit from source */ }

    // Fetch the source quote with items, commercial terms, and ek maliyet
    const sourceQuote = await db.quote.findUnique({
      where: { id },
      include: {
        items: {
          orderBy: { sortOrder: 'asc' },
        },
        commercialTerms: {
          orderBy: { sortOrder: 'asc' },
        },
        ekMaliyetler: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (!sourceQuote) {
      return NextResponse.json({ error: 'Kaynak teklif bulunamadi' }, { status: 404 });
    }

    // Validate override company exists if supplied.
    if (overrideCompanyId) {
      const targetCompany = await db.company.findUnique({
        where: { id: overrideCompanyId },
        select: { id: true },
      });
      if (!targetCompany) {
        return NextResponse.json(
          { error: 'Seçilen firma bulunamadı' },
          { status: 400 }
        );
      }
    }

    // Validate override project exists (if supplied and not explicitly null).
    if (overrideProjectId) {
      const targetProject = await db.project.findUnique({
        where: { id: overrideProjectId },
        select: { id: true },
      });
      if (!targetProject) {
        return NextResponse.json(
          { error: 'Seçilen proje bulunamadı' },
          { status: 400 }
        );
      }
    }

    // Resolve the rate the same way POST /api/quotes does — live TCMB
    // is the authoritative source, with DB-stored and source-quote
    // fallbacks only if the live fetch fails. This keeps clones
    // consistent with newly created quotes (same day → same base rate)
    // and stamps a fresh rateSnapshot so the editor doesn't fall back
    // to stale data on reopen.
    //
    // Source protection intent (protectionPct + protectionMap) is
    // preserved: the live base rate is multiplied by the source's
    // single-currency protectionPct, matching how the source quote's
    // exchangeRate was originally stored.
    let resolvedExchangeRate: number;
    let rateSnapshot: Prisma.InputJsonValue | undefined;
    const sourceProtectionPct = Number(sourceQuote.protectionPct) || 0;

    let tcmbSnapshotRates: Awaited<ReturnType<typeof fetchTcmbDirectRates>> = null;
    try {
      tcmbSnapshotRates = await fetchTcmbDirectRates();
      if (tcmbSnapshotRates && tcmbSnapshotRates.rates.length > 0) {
        rateSnapshot = buildRateMatrix(
          tcmbSnapshotRates.rates,
          'forexSelling'
        ) as unknown as Prisma.InputJsonValue;
      }
    } catch { /* fall through; rateSnapshot stays undefined */ }

    if (sourceQuote.currency === 'TRY') {
      resolvedExchangeRate = 1.0;
    } else {
      const match = tcmbSnapshotRates?.rates.find((r) => r.currency === sourceQuote.currency);
      if (match && match.forexSelling > 0) {
        // Re-apply the source's protection on top of the fresh base so
        // the clone starts with the same "protected" semantics the
        // original quote had.
        resolvedExchangeRate = match.forexSelling * (1 + sourceProtectionPct / 100);
      } else {
        // TCMB unreachable — fall back to the most recent DB rate, then
        // finally to the source quote's frozen rate. The DB fallback
        // path does NOT re-apply protection because we don't know how
        // the DB row was originally produced.
        const dbRate = await db.exchangeRate.findFirst({
          where: { fromCurrency: sourceQuote.currency, toCurrency: 'TRY' },
          orderBy: { fetchedAt: 'desc' },
        });
        if (dbRate?.rate) {
          resolvedExchangeRate = Number(dbRate.rate);
        } else {
          resolvedExchangeRate = Number(sourceQuote.exchangeRate);
        }
      }
    }

    // Wrap quote number generation + creation in a transaction to prevent race conditions
    const newQuote = await db.$transaction(async (tx) => {
      // Generate quote number inside the transaction using user initials
      const initials = getInitials(user.fullName);
      const prefix = getInitialsPrefix(initials);
      const lastQuote = await tx.quote.findFirst({
        where: {
          quoteNumber: { startsWith: prefix },
        },
        orderBy: { quoteNumber: 'desc' },
      });

      const nextSequence = getNextSequence(lastQuote?.quoteNumber || null);
      const quoteNumber = generateQuoteNumber(initials, nextSequence);

      // Create the cloned quote. Company and project are either the
      // user-picked overrides from the clone dialog or inherited from
      // the source when omitted. `projectId === null` is meaningful:
      // the user can detach the clone from any project.
      const quote = await tx.quote.create({
        data: {
          quoteNumber,
          companyId: overrideCompanyId ?? sourceQuote.companyId,
          projectId: overrideProjectId === undefined
            ? sourceQuote.projectId
            : overrideProjectId,
          subject: sourceQuote.subject,
          currency: sourceQuote.currency,
          exchangeRate: resolvedExchangeRate,
          rateSnapshot,
          protectionPct: sourceQuote.protectionPct,
          protectionMap: sourceQuote.protectionMap ?? Prisma.JsonNull,
          subtotal: sourceQuote.subtotal,
          vatTotal: sourceQuote.vatTotal,
          grandTotal: sourceQuote.grandTotal,
          status: 'TASLAK',
          validityDays: sourceQuote.validityDays,
          version: 1,
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
        const parentItems = sourceQuote.items.filter(item => !item.parentItemId);
        for (const item of parentItems) {
          const created = await tx.quoteItem.create({
            data: {
              quoteId: quote.id,
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
              currency: item.currency,
              sectionDiscountPct: item.sectionDiscountPct,
            },
          });
          oldToNewId.set(item.id, created.id);
        }

        // Second pass: create sub-items with remapped parentItemId
        const subItems = sourceQuote.items.filter(item => item.parentItemId);
        for (const item of subItems) {
          const newParentId = oldToNewId.get(item.parentItemId!);
          const created = await tx.quoteItem.create({
            data: {
              quoteId: quote.id,
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
              currency: item.currency,
              sectionDiscountPct: item.sectionDiscountPct,
              parentItemId: newParentId ?? null,
            },
          });
          oldToNewId.set(item.id, created.id);
        }
      }

      // Copy all QuoteCommercialTerms
      if (sourceQuote.commercialTerms.length > 0) {
        await tx.quoteCommercialTerm.createMany({
          data: sourceQuote.commercialTerms.map((term) => ({
            quoteId: quote.id,
            category: term.category,
            value: term.value,
            sortOrder: term.sortOrder,
            highlight: term.highlight,
          })),
        });
      }

      // Copy QuoteEkMaliyet entries
      if (sourceQuote.ekMaliyetler.length > 0) {
        await tx.quoteEkMaliyet.createMany({
          data: sourceQuote.ekMaliyetler.map((em) => ({
            quoteId: quote.id,
            title: em.title,
            amount: em.amount,
            sortOrder: em.sortOrder,
          })),
        });
      }

      // Create QuoteHistory entry
      await tx.quoteHistory.create({
        data: {
          quoteId: quote.id,
          userId: user.id,
          action: 'CLONE',
          changes: {
            sourceQuoteId: sourceQuote.id,
            sourceQuoteNumber: sourceQuote.quoteNumber,
          },
        },
      });

      return quote;
    });

    return NextResponse.json({ quote: newQuote }, { status: 201 });
  } catch (error) {
    console.error('Quote clone error:', error);
    return NextResponse.json(
      { error: 'Teklif kopyalanirken bir hata olustu' },
      { status: 500 }
    );
  }
}
