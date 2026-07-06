import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { quoteQuerySchema, createQuoteSchema } from '@/lib/validations/quote';
import { getSession } from '@/lib/session';
import { Prisma } from '@prisma/client';
import { generateQuoteNumber, getNextSequence, getInitials, getInitialsPrefix } from '@/lib/quote-number';
import { fetchTcmbDirectRates, buildRateMatrix } from '@/lib/services/tcmb-service';
import { expandTurkishVariants } from '@/lib/search-helpers';

/**
 * Resolve the "root" id for a quote used in revision grouping. A row
 * without a `parentQuoteId` is its own root; a revision points back
 * at its root via `parentQuoteId`. We use ids instead of string
 * matching on the quote number so the grouping is immune to manual
 * quote-number edits and format changes.
 */
function getRootQuoteId(quote: { id: string; parentQuoteId: string | null }): string {
  return quote.parentQuoteId ?? quote.id;
}

export async function GET(request: NextRequest) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const groupRevisions = searchParams.get('groupRevisions') !== 'false'; // default true

    const query = quoteQuerySchema.parse({
      search: searchParams.get('search') || undefined,
      companyId: searchParams.get('companyId') || undefined,
      projectId: searchParams.get('projectId') || undefined,
      status: searchParams.get('status') || undefined,
      createdById: searchParams.get('createdById') || undefined,
      page: searchParams.get('page') || '1',
      limit: searchParams.get('limit') || '20',
    });

    const where: Prisma.QuoteWhereInput = {};

    const searchVariants = expandTurkishVariants(query.search ?? '');
    if (searchVariants.length > 0) {
      where.OR = searchVariants.flatMap((v) => [
        { quoteNumber: { contains: v, mode: 'insensitive' as const } },
        { company: { name: { contains: v, mode: 'insensitive' as const } } },
        { project: { name: { contains: v, mode: 'insensitive' as const } } },
        { subject: { contains: v, mode: 'insensitive' as const } },
      ]);
    }

    if (query.companyId) {
      where.companyId = query.companyId;
    }

    if (query.projectId) {
      where.projectId = query.projectId;
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.createdById) {
      where.createdById = query.createdById;
    }

    // Date range filtering
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    if (dateFrom) {
      where.createdAt = { ...(where.createdAt as Prisma.DateTimeFilter || {}), gte: new Date(dateFrom) };
    }
    if (dateTo) {
      where.createdAt = { ...(where.createdAt as Prisma.DateTimeFilter || {}), lte: new Date(dateTo + 'T23:59:59.999Z') };
    }

    // Visibility filtering: managers see everything, others see based on project visibility
    const isManager = user.role.canApprove || user.role.canManageUsers;
    if (!isManager) {
      // Build visibility conditions
      const visibilityOR: Prisma.QuoteWhereInput[] = [
        // Always see own quotes
        { createdById: user.id },
        // See quotes in projects with EVERYONE visibility
        { project: { visibility: 'EVERYONE' } },
        // See quotes in projects where user has explicit access
        { project: { visibility: 'SPECIFIC_USERS', visibleTo: { some: { userId: user.id } } } },
        // See quotes in projects visible to the user's role (client 30.06)
        { project: { visibility: 'ROLE', visibleToRoleId: user.roleId } },
      ];

      // If there's already an OR from search, we need to AND them together
      if (where.OR) {
        const searchOR = where.OR;
        delete where.OR;
        where.AND = [
          { OR: searchOR },
          { OR: visibilityOR },
        ];
      } else {
        where.OR = visibilityOR;
      }
    }

    // Server-side sorting
    const sortField = searchParams.get('sortField') || 'createdAt';
    const sortDirection = (searchParams.get('sortDirection') === 'asc' ? 'asc' : 'desc') as Prisma.SortOrder;

    let orderBy: Prisma.QuoteOrderByWithRelationInput;
    switch (sortField) {
      case 'quoteNumber':
        orderBy = { quoteNumber: sortDirection };
        break;
      case 'company':
        orderBy = { company: { name: sortDirection } };
        break;
      case 'grandTotal':
        orderBy = { grandTotal: sortDirection };
        break;
      case 'status':
        orderBy = { status: sortDirection };
        break;
      case 'createdAt':
      default:
        orderBy = { createdAt: sortDirection };
        break;
    }

    if (!groupRevisions) {
      // Legacy flat list behavior
      const [quotes, total] = await Promise.all([
        db.quote.findMany({
          where,
          include: {
            company: { select: { id: true, name: true } },
            project: { select: { id: true, name: true } },
            createdBy: { select: { id: true, fullName: true } },
          },
          orderBy,
          skip: (query.page - 1) * query.limit,
          take: query.limit,
        }),
        db.quote.count({ where }),
      ]);

      return NextResponse.json({
        quotes,
        pagination: {
          page: query.page,
          limit: query.limit,
          total,
          totalPages: Math.ceil(total / query.limit),
        },
      });
    }

    // --- Grouped revisions mode ---
    // Fetch matching quotes, then group each revision family under its
    // root (the quote with parentQuoteId === null). This means the
    // original offer is always the primary row in the list; its
    // revisions appear nested underneath.
    const allQuotes = await db.quote.findMany({
      where,
      include: {
        company: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
        createdBy: { select: { id: true, fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Group by root id. Filters may exclude the root itself from the
    // result set (e.g. "status=APPROVED" when only a revision is
    // approved), so we still group by parentQuoteId but fall back to
    // the oldest matching member as the group primary.
    const groupMap = new Map<string, typeof allQuotes>();
    for (const q of allQuotes) {
      const rootKey = getRootQuoteId(q);
      if (!groupMap.has(rootKey)) {
        groupMap.set(rootKey, []);
      }
      groupMap.get(rootKey)!.push(q);
    }

    const groups = Array.from(groupMap.values()).map((members) => {
      const root = members.find((m) => m.parentQuoteId === null);
      const primary =
        root ??
        members
          .slice()
          .sort(
            (a, b) =>
              new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          )[0];
      // Revisions sort newest-first so the latest revision is at the
      // top of the expanded block.
      const revisions = members
        .filter((m) => m.id !== primary.id)
        .sort((a, b) => b.version - a.version);
      return { ...primary, revisions };
    });

    // 4. Apply user-requested sorting on the primary (group representative)
    groups.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'quoteNumber':
          cmp = a.quoteNumber.localeCompare(b.quoteNumber);
          break;
        case 'company':
          cmp = a.company.name.localeCompare(b.company.name);
          break;
        case 'grandTotal':
          cmp = Number(a.grandTotal) - Number(b.grandTotal);
          break;
        case 'status':
          cmp = a.status.localeCompare(b.status);
          break;
        case 'createdBy':
          cmp = a.createdBy.fullName.localeCompare(b.createdBy.fullName);
          break;
        case 'createdAt':
        default:
          cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
      }
      return sortDirection === 'asc' ? cmp : -cmp;
    });

    // 5. Paginate by groups (not individual quotes)
    const totalGroups = groups.length;
    const start = (query.page - 1) * query.limit;
    const paginatedGroups = groups.slice(start, start + query.limit);

    return NextResponse.json({
      quotes: paginatedGroups,
      pagination: {
        page: query.page,
        limit: query.limit,
        total: totalGroups,
        totalPages: Math.ceil(totalGroups / query.limit),
      },
    });
  } catch (error) {
    console.error('Quotes GET error:', error);
    return NextResponse.json(
      { error: 'Teklifler alınırken bir hata oluştu' },
      { status: 500 }
    );
  }
}


export async function POST(request: NextRequest) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    // Validate input using schema
    const validation = createQuoteSchema.safeParse(body);
    if (!validation.success) {
      const firstError = validation.error.issues[0];
      return NextResponse.json(
        { error: firstError?.message || 'Geçersiz veri' },
        { status: 400 }
      );
    }
    const data = validation.data;

    // Project is mandatory for new quotes
    if (!data.projectId) {
      return NextResponse.json(
        { error: 'Proje seçimi zorunludur' },
        { status: 400 }
      );
    }

    // Determine exchange rate — prefer TCMB direct forexSelling rate.
    // Also build a full rate matrix from the same TCMB fetch so it can
    // be frozen onto the quote as `rateSnapshot`. On reopen, the
    // editor reads from the snapshot instead of hitting live TCMB, so
    // every item — existing and newly added — uses the same rates.
    //
    // TRY-denominated quotes also stamp a snapshot: their own TRY leg
    // is trivial (1:1), but the quote may later gain a non-TRY
    // subcontractor row that needs the cross rates at the original
    // creation time.
    let resolvedExchangeRate: number;
    let rateSnapshot: Prisma.InputJsonValue | undefined;

    // Always attempt a TCMB fetch so we can stamp the snapshot,
    // regardless of the quote's own currency.
    let tcmbSnapshotRates: Awaited<ReturnType<typeof fetchTcmbDirectRates>> = null;
    try {
      tcmbSnapshotRates = await fetchTcmbDirectRates();
      if (tcmbSnapshotRates && tcmbSnapshotRates.rates.length > 0) {
        rateSnapshot = buildRateMatrix(tcmbSnapshotRates.rates, 'forexSelling') as unknown as Prisma.InputJsonValue;
      }
    } catch { /* fall through, rateSnapshot stays undefined */ }

    if (data.currency === 'TRY') {
      resolvedExchangeRate = 1.0;
    } else {
      // Try TCMB direct rates first (forexSelling = Döviz Satış)
      let found = false;
      const match = tcmbSnapshotRates?.rates.find((r) => r.currency === data.currency);
      if (match && match.forexSelling > 0) {
        resolvedExchangeRate = match.forexSelling;
        found = true;
      }

      // Fallback to DB-stored rate
      if (!found) {
        const exchangeRate = await db.exchangeRate.findFirst({
          where: { fromCurrency: data.currency, toCurrency: 'TRY' },
          orderBy: { fetchedAt: 'desc' },
        });
        if (exchangeRate?.rate) {
          resolvedExchangeRate = Number(exchangeRate.rate);
          // rateSnapshot stays whatever the TCMB block produced
          // (possibly undefined if TCMB was unreachable). The editor
          // will fall back to fresh TCMB on reopen until the user
          // explicitly applies rates via Kurları Güncelle.
        } else {
          return NextResponse.json(
            { error: 'Döviz kuru bulunamadı. Lütfen önce kurları güncelleyin.' },
            { status: 400 }
          );
        }
      }
    }

    // Wrap quote number generation and creation in a transaction to prevent race conditions
    const quote = await db.$transaction(async (tx) => {
      const initials = getInitials(user.fullName);
      const prefix = getInitialsPrefix(initials);

      // Find the last quote by this user (by initials prefix) to get
      // next sequence. Exclude revision-style numbers (anything with a
      // `.` in it) so a row like `LC0014.1` doesn't pollute the lex-desc
      // result and corrupt sequencing — even with the regex fix in
      // parseQuoteNumber, base quotes are the only correct source of
      // truth for the user's "next" sequence.
      const lastQuote = await tx.quote.findFirst({
        where: {
          quoteNumber: { startsWith: prefix },
          NOT: { quoteNumber: { contains: '.' } },
        },
        orderBy: { quoteNumber: 'desc' },
      });

      const nextSequence = getNextSequence(lastQuote?.quoteNumber || null);
      const quoteNumber = generateQuoteNumber(initials, nextSequence);

      const created = await tx.quote.create({
        data: {
          quoteNumber,
          companyId: data.companyId,
          projectId: data.projectId || null,
          subject: data.subject || null,
          description: data.description || null,
          currency: data.currency,
          exchangeRate: resolvedExchangeRate,
          rateSnapshot,
          createdById: user.id,
          validityDays: data.validityDays,
          notes: data.notes || null,
        },
        include: {
          company: { select: { id: true, name: true } },
          project: { select: { id: true, name: true } },
          createdBy: { select: { id: true, fullName: true } },
        },
      });

      // Seed isDefault=true NOTLAR templates onto the freshly created
      // quote. Admin marks one note (e.g. "Gizlilik") as default in
      // Settings and every new quote starts with that note already
      // selected — the editor renders isDefault rows as locked
      // checkboxes so it can't be accidentally unchecked.
      //
      // Scoped to NOTLAR only by design. Other categories already
      // surface the default template via their own UI (single-value
      // dropdowns show the default as the picked value); auto-seeding
      // them here would silently lock entries the user expects to
      // pick themselves. Kept inside the transaction so a failure
      // rolls back the whole quote create.
      const defaultTemplates = await tx.commercialTermTemplate.findMany({
        where: {
          isDefault: true,
          category: 'NOTLAR',
        },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      });
      if (defaultTemplates.length > 0) {
        await tx.quoteCommercialTerm.createMany({
          data: defaultTemplates.map((tpl) => ({
            quoteId: created.id,
            category: tpl.category,
            value: tpl.value,
            sortOrder: tpl.sortOrder,
            highlight: tpl.highlight,
          })),
        });
      }

      // History entry — also inside the transaction so audit trail and
      // quote row stay in lockstep.
      await tx.quoteHistory.create({
        data: {
          quoteId: created.id,
          userId: user.id,
          action: 'CREATE',
        },
      });

      return created;
    });

    return NextResponse.json({ quote }, { status: 201 });
  } catch (error) {
    console.error('Quotes POST error:', error);
    return NextResponse.json(
      { error: 'Teklif oluşturulurken bir hata oluştu' },
      { status: 500 }
    );
  }
}
