import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { Prisma } from '@prisma/client';
import { recalculateAndPersistQuoteTotals } from '@/lib/quote-calculations';
import { z } from 'zod';
import { quoteUpdateSchema } from '@/lib/validations/quote';

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
        project: true,
        createdBy: { select: { id: true, fullName: true } },
        approvedBy: { select: { id: true, fullName: true } },
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

    // Add profit data for Yonetim users
    let profitSummary = null;
    if (user.role.canViewCosts) {
      const { calculateQuoteProfitSummary } = await import('@/lib/quote-calculations');
      const raw = calculateQuoteProfitSummary(
        quote.items.map(item => ({
          totalPrice: Number(item.totalPrice),
          costPrice: item.costPrice ? Number(item.costPrice) : null,
          quantity: Number(item.quantity),
          itemType: item.itemType,
          parentItemId: item.parentItemId,
        })),
        Number(quote.discountPct) || 0
      );
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

    const existingQuote = await db.quote.findUnique({ where: { id } });
    if (!existingQuote) {
      return NextResponse.json({ error: 'Teklif bulunamadı' }, { status: 404 });
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

    if (body.companyId !== undefined) updateData.company = { connect: { id: body.companyId } };
    if (body.projectId !== undefined) {
      if (body.projectId) {
        updateData.project = { connect: { id: body.projectId } };
      } else {
        updateData.project = { disconnect: true };
      }
    }
    if (body.refNo !== undefined) updateData.refNo = body.refNo;
    if (body.subject !== undefined) updateData.subject = body.subject;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.currency !== undefined) updateData.currency = body.currency;
    if (body.exchangeRate !== undefined) updateData.exchangeRate = body.exchangeRate;
    if (body.protectionPct !== undefined) updateData.protectionPct = body.protectionPct;
    if (body.protectionMap !== undefined) updateData.protectionMap = body.protectionMap;
    if (body.discountPct !== undefined) updateData.discountPct = body.discountPct;
    if (body.validityDays !== undefined) updateData.validityDays = body.validityDays;
    if (body.notes !== undefined) updateData.notes = body.notes;
    if (body.language !== undefined) updateData.language = body.language;

    await db.quote.update({
      where: { id },
      data: updateData,
    });

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

    // Create history entry
    await db.quoteHistory.create({
      data: {
        quoteId: id,
        userId: user.id,
        action: 'UPDATE',
        changes: body,
      },
    });

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

    // Only allow deleting draft quotes
    if (existingQuote.status !== 'TASLAK') {
      return NextResponse.json(
        { error: 'Sadece taslak teklifler silinebilir' },
        { status: 400 }
      );
    }

    await db.quote.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Quote DELETE error:', error);
    return NextResponse.json(
      { error: 'Teklif silinirken bir hata oluştu' },
      { status: 500 }
    );
  }
}
