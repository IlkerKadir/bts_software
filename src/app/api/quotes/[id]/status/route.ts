import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import {
  canTransitionTo,
  getAvailableTransitions,
  statusLabels,
  type QuoteStatus,
} from '@/lib/quote-status';
import { checkQuoteApproval, type QuoteItemForApproval } from '@/lib/quote-approval';
import { createNotification } from '@/lib/services/notification-service';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: quoteId } = await params;
    const body = await request.json();

    if (!body.status) {
      return NextResponse.json({ error: 'Status required' }, { status: 400 });
    }

    const newStatus = body.status;

    // Get current quote
    const quote = await db.quote.findUnique({ where: { id: quoteId } });
    if (!quote) {
      return NextResponse.json({ error: 'Teklif bulunamadı' }, { status: 404 });
    }

    const currentStatus = quote.status as QuoteStatus;
    const targetStatus = newStatus as QuoteStatus;

    // Check if transition is valid using tested module
    if (!canTransitionTo(currentStatus, targetStatus)) {
      const allowedTransitions = getAvailableTransitions(currentStatus);
      return NextResponse.json(
        {
          error: `${statusLabels[currentStatus]} durumundan ${statusLabels[targetStatus]} durumuna geçiş yapılamaz`,
          allowedTransitions: allowedTransitions.map(s => ({ value: s, label: statusLabels[s] })),
        },
        { status: 400 }
      );
    }

    // Check permissions for approval
    if (newStatus === 'ONAYLANDI' && !user.role.canApprove) {
      return NextResponse.json(
        { error: 'Teklif onaylama yetkiniz bulunmuyor' },
        { status: 403 }
      );
    }

    // Run approval check when transitioning to ONAYLANDI
    let approvalCheckResult = null;
    if (newStatus === 'ONAYLANDI') {
      const quoteItems = await db.quoteItem.findMany({
        where: { quoteId },
      });

      const itemsForApproval: QuoteItemForApproval[] = quoteItems.map((item) => ({
        itemType: item.itemType as 'PRODUCT' | 'HEADER' | 'NOTE' | 'CUSTOM',
        quantity: Number(item.quantity),
        listPrice: Number(item.listPrice),
        katsayi: Number(item.katsayi),
        discountPct: Number(item.discountPct),
      }));

      approvalCheckResult = checkQuoteApproval(itemsForApproval);

      // If approval was needed, record the reasons
      if (approvalCheckResult.needsApproval) {
        await db.quoteHistory.create({
          data: {
            quoteId,
            userId: user.id,
            action: 'APPROVAL_CHECK',
            changes: {
              needsApproval: true,
              reasons: approvalCheckResult.reasons,
              reasonLabels: approvalCheckResult.reasonLabels,
              metrics: {
                totalValue: approvalCheckResult.metrics.totalValue,
                maxDiscountPct: approvalCheckResult.metrics.maxDiscountPct,
                minKatsayi: approvalCheckResult.metrics.minKatsayi,
              },
            },
          },
        });
      }
    }

    // Update quote status
    const updatedQuote = await db.quote.update({
      where: { id: quoteId },
      data: {
        status: newStatus,
        ...(newStatus === 'ONAYLANDI' && {
          approvedBy: { connect: { id: user.id } },
          approvedAt: new Date(),
          validUntil: new Date(Date.now() + quote.validityDays * 24 * 60 * 60 * 1000),
        }),
      },
      include: {
        company: true,
        project: true,
        createdBy: { select: { id: true, fullName: true } },
        approvedBy: { select: { id: true, fullName: true } },
      },
    });

    // Create history entry
    await db.quoteHistory.create({
      data: {
        quoteId,
        userId: user.id,
        action: 'STATUS_CHANGE',
        changes: {
          from: currentStatus,
          to: newStatus,
          note: body.note || null,
        },
      },
    });

    // Record price history when quote is sent to customer
    if (newStatus === 'GONDERILDI') {
      try {
        const quoteWithItems = await db.quote.findUnique({
          where: { id: quoteId },
          include: {
            items: {
              where: { itemType: 'PRODUCT', productId: { not: null } },
            },
          },
        });

        if (quoteWithItems) {
          for (const item of quoteWithItems.items) {
            if (item.productId) {
              await db.priceHistory.create({
                data: {
                  productId: item.productId,
                  companyId: quoteWithItems.companyId,
                  quoteId: quoteWithItems.id,
                  unitPrice: item.unitPrice,
                  katsayi: item.katsayi,
                  quantity: item.quantity,
                  currency: quoteWithItems.currency,
                },
              });
            }
          }
        }
      } catch (priceHistoryError) {
        // Log but don't fail the request if price history creation fails
        console.error('Price history creation error:', priceHistoryError);
      }
    }

    // Create notifications based on status change
    try {
      if (newStatus === 'ONAY_BEKLIYOR') {
        // Notify users with canApprove role
        const approvers = await db.user.findMany({
          where: {
            role: { canApprove: true },
            isActive: true,
          },
          select: { id: true },
        });

        for (const approver of approvers) {
          await createNotification({
            userId: approver.id,
            type: 'APPROVAL_NEEDED',
            title: 'Onay Bekleyen Teklif',
            message: `${updatedQuote.quoteNumber} numaralı teklif onayınızı bekliyor`,
            link: `/quotes/${quoteId}`,
          });
        }
      } else if (newStatus === 'ONAYLANDI') {
        // Notify quote creator
        await createNotification({
          userId: quote.createdById,
          type: 'QUOTE_APPROVED',
          title: 'Teklif Onaylandı',
          message: `${updatedQuote.quoteNumber} numaralı teklif ${user.fullName} tarafından onaylandı`,
          link: `/quotes/${quoteId}`,
        });
      } else if (newStatus === 'REVIZYON') {
        // Notify quote creator about revision request
        await createNotification({
          userId: quote.createdById,
          type: 'QUOTE_REJECTED',
          title: 'Revizyon Gerekli',
          message: `${updatedQuote.quoteNumber} numaralı teklif için revizyon istendi`,
          link: `/quotes/${quoteId}`,
        });
      }
    } catch (notificationError) {
      // Log but don't fail the request if notification creation fails
      console.error('Notification creation error:', notificationError);
    }

    return NextResponse.json({
      quote: updatedQuote,
      message: `Teklif durumu "${statusLabels[targetStatus]}" olarak güncellendi`,
      ...(approvalCheckResult && {
        approvalCheck: {
          needsApproval: approvalCheckResult.needsApproval,
          reasons: approvalCheckResult.reasons,
          reasonLabels: approvalCheckResult.reasonLabels,
          metrics: approvalCheckResult.metrics,
        },
      }),
    });
  } catch (error) {
    console.error('Quote status PUT error:', error);
    return NextResponse.json(
      { error: 'Teklif durumu güncellenirken bir hata oluştu' },
      { status: 500 }
    );
  }
}

// GET - Get valid transitions for current status
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: quoteId } = await params;

    const quote = await db.quote.findUnique({
      where: { id: quoteId },
      select: { status: true },
    });

    if (!quote) {
      return NextResponse.json({ error: 'Teklif bulunamadı' }, { status: 404 });
    }

    const currentStatus = quote.status as QuoteStatus;
    let allowedTransitions = getAvailableTransitions(currentStatus);

    // Filter out ONAYLANDI if user can't approve
    if (!user.role.canApprove) {
      allowedTransitions = allowedTransitions.filter(s => s !== 'ONAYLANDI');
    }

    // Get approval check result for current quote items
    const quoteItems = await db.quoteItem.findMany({
      where: { quoteId },
    });

    const itemsForApproval: QuoteItemForApproval[] = quoteItems.map((item) => ({
      itemType: item.itemType as 'PRODUCT' | 'HEADER' | 'NOTE' | 'CUSTOM',
      quantity: Number(item.quantity),
      listPrice: Number(item.listPrice),
      katsayi: Number(item.katsayi),
      discountPct: Number(item.discountPct),
    }));

    const approvalCheck = checkQuoteApproval(itemsForApproval);

    return NextResponse.json({
      currentStatus: { value: currentStatus, label: statusLabels[currentStatus] },
      allowedTransitions: allowedTransitions.map(s => ({ value: s, label: statusLabels[s] })),
      approvalCheck: {
        needsApproval: approvalCheck.needsApproval,
        reasons: approvalCheck.reasons,
        reasonLabels: approvalCheck.reasonLabels,
        metrics: approvalCheck.metrics,
      },
    });
  } catch (error) {
    console.error('Quote status GET error:', error);
    return NextResponse.json(
      { error: 'Durum bilgisi alınırken bir hata oluştu' },
      { status: 500 }
    );
  }
}
