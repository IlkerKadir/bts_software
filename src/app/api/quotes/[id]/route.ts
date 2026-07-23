import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { Prisma } from '@prisma/client';
import { recalculateAndPersistQuoteTotals } from '@/lib/quote-calculations';
import { z } from 'zod';
import { quoteUpdateSchema } from '@/lib/validations/quote';
// Shared visibility rule (incl. the ROLE mode) — the same boundary as the
// tracking/interactions routes and the STF access checks.
import { canUserAccessQuote } from '@/lib/quote-access';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const quote = await db.quote.findUnique({
      where: { id },
      include: {
        company: true,
        project: { include: { visibleTo: { select: { userId: true } } } },
        createdBy: { select: { id: true, fullName: true } },
        approvedBy: { select: { id: true, fullName: true } },
        lastEditedBy: { select: { id: true, fullName: true } },
        items: {
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
        },
        commercialTerms: {
          orderBy: { sortOrder: 'asc' },
        },
        history: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          include: {
            user: { select: { id: true, fullName: true } },
          },
        },
      },
    });

    if (!quote) {
      return NextResponse.json({ error: 'Teklif bulunamadı' }, { status: 404 });
    }

    // Visibility check: enforce project-based access rules
    const isManager = user.role.canApprove || user.role.canManageUsers;
    if (!canUserAccessQuote(user.id, isManager, quote, user.roleId)) {
      return NextResponse.json({ error: 'Bu teklifi görüntüleme yetkiniz bulunmamaktadır' }, { status: 403 });
    }

    // Add profit data for Yonetim users
    let profitSummary = null;
    if (user.role.canViewCosts) {
      const { calculateQuoteProfitSummary } = await import('@/lib/quote-calculations');
      const mapped = quote.items.map(item => {
        // Include ek maliyet delta in effective cost price for profit calc
        const baseCost = item.costPrice != null ? Number(item.costPrice) : null;
        const delta = item.ekMaliyetDelta != null ? Number(item.ekMaliyetDelta) : 0;
        const effectiveCost = delta > 0 ? (baseCost ?? 0) + delta : baseCost;
        return {
          id: item.id,
          totalPrice: Number(item.totalPrice),
          costPrice: effectiveCost,
          listPrice: item.listPrice != null ? Number(item.listPrice) : null,
          quantity: Number(item.quantity),
          itemType: item.itemType,
          parentItemId: item.parentItemId,
          priceLabel: item.priceLabel,
          currency: item.currency ?? null,
          // SUBTOTAL rows carry the section discount; without this the
          // profit calc treats every section as 0% and overstates revenue.
          sectionDiscountPct:
            item.sectionDiscountPct != null ? Number(item.sectionDiscountPct) : null,
        };
      });
      // Only build a currency ctx when the quote actually has a set
      // with a non-null currency override. Pure single-currency quotes
      // take the identity path inside calculateQuoteProfitSummary.
      const hasMixedCurrency = mapped.some(
        (i) => i.currency && i.currency !== quote.currency
      );
      const protectionPct = Number(quote.protectionPct || 0);
      const protectedRate = Number(quote.exchangeRate || 1);
      const baseForeignRate = protectionPct > 0
        ? protectedRate / (1 + protectionPct / 100)
        : protectedRate;
      const ctx = hasMixedCurrency
        ? { quoteCurrency: quote.currency, baseForeignRate }
        : undefined;
      const raw = calculateQuoteProfitSummary(mapped, 0, ctx);
      profitSummary = {
        totalCost: raw.totalCost,
        totalProfit: raw.totalProfit,
        profitMargin: raw.overallMarginPct,
      };
    }

    // Strip costPrice from items if user does not have canViewCosts permission
    if (!user.role.canViewCosts) {
      quote.items = quote.items.map(item => ({
        ...item,
        costPrice: null,
      }));
    }

    return NextResponse.json({ quote, profitSummary });
  } catch (error) {
    console.error('Quote GET error:', error);
    return NextResponse.json(
      { error: 'Teklif alınırken bir hata oluştu' },
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

    const { id } = await params;
    const rawBody = await request.json();

    // Validate request body with Zod schema
    const parseResult = quoteUpdateSchema.safeParse(rawBody);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Geçersiz veri', details: parseResult.error.issues },
        { status: 400 }
      );
    }
    const body = parseResult.data;

    const existingQuote = await db.quote.findUnique({
      where: { id },
      include: { project: { include: { visibleTo: { select: { userId: true } } } } },
    });
    if (!existingQuote) {
      return NextResponse.json({ error: 'Teklif bulunamadı' }, { status: 404 });
    }

    // Visibility check
    const isManager = user.role.canApprove || user.role.canManageUsers;
    if (!canUserAccessQuote(user.id, isManager, existingQuote, user.roleId)) {
      return NextResponse.json({ error: 'Bu teklifi düzenleme yetkiniz bulunmamaktadır' }, { status: 403 });
    }

    // Authorization: only quote creator or admin can edit
    // For ONAY_BEKLIYOR quotes, only users with canApprove permission can edit
    const isOwnerOrAdmin = existingQuote.createdById === user.id || user.role.canManageUsers;
    const isApproverOnPending = existingQuote.status === 'ONAY_BEKLIYOR' && user.role.canApprove;

    if (!isOwnerOrAdmin && !isApproverOnPending) {
      return NextResponse.json(
        { error: 'Bu teklifi düzenleme yetkiniz bulunmamaktadır' },
        { status: 403 }
      );
    }

    // Regular users (non-approvers) cannot edit quotes in ONAY_BEKLIYOR status
    if (existingQuote.status === 'ONAY_BEKLIYOR' && !user.role.canApprove) {
      return NextResponse.json(
        { error: 'Onay bekleyen teklifler sadece onay yetkisi olan kullanıcılar tarafından düzenlenebilir' },
        { status: 403 }
      );
    }

    // Build update data
    const updateData: Prisma.QuoteUpdateInput = {};

    // companyId and projectId update independently. The schema treats a
    // project as a tag/grouping that can hold quotes for multiple
    // different companies (`Project.clientId` is just the project's
    // primary owner — quotes attached to it may target other companies),
    // so changing one does not invalidate the other.
    if (body.companyId !== undefined) {
      updateData.company = { connect: { id: body.companyId } };
    }
    if (body.projectId !== undefined) {
      if (body.projectId) {
        updateData.project = { connect: { id: body.projectId } };
      } else {
        updateData.project = { disconnect: true };
      }
    }
    if (body.quoteNumber !== undefined) updateData.quoteNumber = body.quoteNumber;
    if (body.refNo !== undefined) updateData.refNo = body.refNo;
    if (body.subject !== undefined) updateData.subject = body.subject;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.currency !== undefined) updateData.currency = body.currency;
    if (body.exchangeRate !== undefined) updateData.exchangeRate = body.exchangeRate;
    if (body.protectionPct !== undefined) updateData.protectionPct = body.protectionPct;
    if (body.protectionMap !== undefined) updateData.protectionMap = body.protectionMap;
    if (body.rateSnapshot !== undefined) {
      updateData.rateSnapshot = body.rateSnapshot === null
        ? Prisma.JsonNull
        : (body.rateSnapshot as Prisma.InputJsonValue);
    }
    if (body.validityDays !== undefined) updateData.validityDays = body.validityDays;
    if (body.notes !== undefined) updateData.notes = body.notes;
    if (body.language !== undefined) updateData.language = body.language;

    await db.quote.update({
      where: { id },
      data: updateData,
    });

    // If the quote's currency just changed, clear any SET currency
    // overrides that are now invalid — a SET can only carry 'TRY' or
    // the quote's own currency. Silently resetting to null (= inherit
    // the new quote currency) is safer than erroring the save, and it
    // matches the editor UI which clamps the dropdown to the new
    // options on refresh.
    if (body.currency !== undefined && body.currency !== existingQuote.currency) {
      await db.quoteItem.updateMany({
        where: {
          quoteId: id,
          itemType: 'SET',
          parentItemId: null,
          currency: { not: null, notIn: ['TRY', body.currency] },
        },
        data: { currency: null },
      });
    }

    // Always recalculate totals to keep them in sync
    await recalculateAndPersistQuoteTotals(id);

    // Re-fetch with includes after all updates
    const quote = await db.quote.findUniqueOrThrow({
      where: { id },
      include: {
        company: true,
        project: true,
        createdBy: { select: { id: true, fullName: true } },
        items: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    // Build structured diff for history: { field: { from, to } }
    const trackableFields = [
      'refNo', 'currency', 'subject', 'description', 'language',
      'companyId', 'projectId', 'exchangeRate',
      'validityDays', 'protectionPct', 'protectionMap', 'notes',
    ] as const;

    const changes: Record<string, { from: unknown; to: unknown }> = {};

    for (const field of trackableFields) {
      if (body[field] === undefined) continue;

      let oldVal: unknown = (existingQuote as Record<string, unknown>)[field];
      let newVal: unknown = body[field];

      // Normalize Decimal fields to numbers for comparison
      if (oldVal !== null && oldVal !== undefined && typeof oldVal === 'object' && 'toNumber' in (oldVal as object)) {
        oldVal = Number(oldVal);
      }
      if (typeof newVal === 'number' && typeof oldVal === 'number') {
        // Compare with tolerance for floating point
        if (Math.abs(oldVal - newVal) < 0.0001) continue;
      } else if (
        typeof oldVal === 'object' && typeof newVal === 'object' &&
        JSON.stringify(oldVal) === JSON.stringify(newVal)
      ) {
        continue;
      } else if (oldVal === newVal) {
        continue;
      }

      // Normalize null-ish values
      if (oldVal === undefined) oldVal = null;
      if (newVal === undefined) newVal = null;

      changes[field] = { from: oldVal, to: newVal };
    }

    // Resolve project names if projectId changed
    if (changes.projectId) {
      const oldProjectId = changes.projectId.from as string | null;
      const newProjectId = changes.projectId.to as string | null;

      const [oldProject, newProject] = await Promise.all([
        oldProjectId ? db.project.findUnique({ where: { id: oldProjectId }, select: { name: true } }) : null,
        newProjectId ? db.project.findUnique({ where: { id: newProjectId }, select: { name: true } }) : null,
      ]);

      (changes.projectId as Record<string, unknown>).fromName = oldProject?.name ?? null;
      (changes.projectId as Record<string, unknown>).toName = newProject?.name ?? null;
    }

    // Same name-resolution treatment for companyId so the audit timeline
    // shows "ABC İnşaat → XYZ Ltd." instead of opaque cuids.
    if (changes.companyId) {
      const oldCompanyId = changes.companyId.from as string | null;
      const newCompanyId = changes.companyId.to as string | null;
      const [oldCompany, newCompany] = await Promise.all([
        oldCompanyId ? db.company.findUnique({ where: { id: oldCompanyId }, select: { name: true } }) : null,
        newCompanyId ? db.company.findUnique({ where: { id: newCompanyId }, select: { name: true } }) : null,
      ]);
      (changes.companyId as Record<string, unknown>).fromName = oldCompany?.name ?? null;
      (changes.companyId as Record<string, unknown>).toName = newCompany?.name ?? null;
    }

    // Only create history entry if there are actual changes
    if (Object.keys(changes).length > 0) {
      await db.quoteHistory.create({
        data: {
          quoteId: id,
          userId: user.id,
          action: 'UPDATE',
          changes: JSON.parse(JSON.stringify(changes)),
        },
      });
    }

    return NextResponse.json({ quote });
  } catch (error) {
    console.error('Quote PUT error:', error);
    return NextResponse.json(
      { error: 'Teklif güncellenirken bir hata oluştu' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!user.role.canDelete) {
      return NextResponse.json(
        { error: 'Bu işlem için yetkiniz bulunmuyor' },
        { status: 403 }
      );
    }

    const { id } = await params;

    const existingQuote = await db.quote.findUnique({ where: { id } });
    if (!existingQuote) {
      return NextResponse.json({ error: 'Teklif bulunamadı' }, { status: 404 });
    }

    // Allowed delete states:
    //   - TASLAK: never been approved
    //   - DUZENLEME_TALEP_EDILDI: approver rejected, behaves like draft
    //   - IPTAL: cancelled, can be cleaned up after the fact
    // Everything else (in-flight or post-send) blocks deletion to keep
    // audit trail intact.
    const deletableStatuses: typeof existingQuote.status[] = [
      'TASLAK',
      'DUZENLEME_TALEP_EDILDI',
      'IPTAL',
    ];
    if (!deletableStatuses.includes(existingQuote.status)) {
      return NextResponse.json(
        { error: 'Sadece taslak veya iptal edilmiş teklifler silinebilir' },
        { status: 400 }
      );
    }

    await db.quote.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    // P2003 = FK violation. Most common case: deleting an IPTAL
    // parent quote that still has linked legacy revisions
    // (`parentQuoteId` self-relation has no cascade). Surface a
    // friendly Turkish 400 instead of the generic 500 so the user
    // knows what to do next.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2003'
    ) {
      return NextResponse.json(
        {
          error:
            'Bu teklifin bağlı revizyonları olduğu için silinemez. Önce revizyonları silin.',
        },
        { status: 400 }
      );
    }
    console.error('Quote DELETE error:', error);
    return NextResponse.json(
      { error: 'Teklif silinirken bir hata oluştu' },
      { status: 500 }
    );
  }
}
