import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { z } from 'zod';
import { QuoteStatus } from '@prisma/client';
import { canTransitionTo, statusLabels, type QuoteStatus as QS } from '@/lib/quote-status';
import { createNotification } from '@/lib/services/notification-service';

const bulkStatusSchema = z.object({
  quoteIds: z.array(z.string()).min(1),
  status: z.nativeEnum(QuoteStatus),
  note: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const data = bulkStatusSchema.parse(body);

    // Check if user can approve (required for ONAYLANDI)
    if (data.status === 'ONAYLANDI' && !user.role.canApprove) {
      return NextResponse.json(
        { error: 'Toplu onaylama yetkiniz bulunmamaktadır' },
        { status: 403 }
      );
    }

    // Get quotes — non-admin users can only update their own quotes
    const isAdmin = user.role.canManageUsers;
    const quotes = await db.quote.findMany({
      where: {
        id: { in: data.quoteIds },
        ...(!isAdmin && { createdById: user.id }),
      },
      select: { id: true, quoteNumber: true, status: true, createdById: true },
    });

    if (quotes.length === 0) {
      return NextResponse.json(
        { error: 'Güncellenecek teklif bulunamadı' },
        { status: 404 }
      );
    }

    // Validate transitions and update
    const results: {
      success: { id: string; quoteNumber: string }[];
      failed: { id: string; quoteNumber: string; reason: string }[];
    } = {
      success: [],
      failed: [],
    };

    for (const quote of quotes) {
      const currentStatus = quote.status as QS;
      const targetStatus = data.status as QS;

      // Check if transition is valid using the tested canTransitionTo() state machine
      if (!canTransitionTo(currentStatus, targetStatus)) {
        results.failed.push({
          id: quote.id,
          quoteNumber: quote.quoteNumber,
          reason: `${quote.status} durumundan ${data.status} durumuna geçiş yapılamaz`,
        });
        continue;
      }

      try {
        // Update quote with status-specific fields
        await db.quote.update({
          where: { id: quote.id },
          data: {
            status: data.status,
            // Clear validUntil when leaving ONAYLANDI
            ...(currentStatus === 'ONAYLANDI' && targetStatus !== 'ONAYLANDI' && {
              validUntil: null,
            }),
          },
        });

        // Create history entry
        await db.quoteHistory.create({
          data: {
            quoteId: quote.id,
            userId: user.id,
            action: 'STATUS_CHANGE',
            changes: {
              from: currentStatus,
              to: targetStatus,
              note: data.note || 'Toplu güncelleme',
              bulk: true,
            },
          },
        });

        // Create notification for quote creator
        try {
          await createNotification({
            userId: quote.createdById,
            type: 'SYSTEM',
            title: `Teklif ${quote.quoteNumber} durumu değişti`,
            message: `Durum: ${statusLabels[targetStatus]}`,
            link: `/quotes/${quote.id}`,
          });
        } catch (notifErr) {
          console.error('Bulk status notification error:', notifErr);
        }

        results.success.push({
          id: quote.id,
          quoteNumber: quote.quoteNumber,
        });
      } catch (err) {
        results.failed.push({
          id: quote.id,
          quoteNumber: quote.quoteNumber,
          reason: 'Güncelleme hatası',
        });
      }
    }

    return NextResponse.json({
      message: `${results.success.length} teklif güncellendi, ${results.failed.length} başarısız`,
      results,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Geçersiz veri', details: error.issues },
        { status: 400 }
      );
    }

    console.error('Bulk status error:', error);
    return NextResponse.json(
      { error: 'Toplu güncelleme sırasında bir hata oluştu' },
      { status: 500 }
    );
  }
}
