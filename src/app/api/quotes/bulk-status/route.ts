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

      // ONAYLANDI → TASLAK is open to anyone with quote access per
      // the 29.04 client decision; the per-quote PUT writes
      // `lastEditedBy` so the audit trail still identifies who pulled
      // the quote back. Note: BulkStatusModal currently doesn't expose
      // this transition (`ALLOWED_BULK_TRANSITIONS['ONAYLANDI']`
      // omits TASLAK). If you ever wire it in, also stamp
      // lastEditedBy/At in the update below — same as the per-quote
      // route does.

      // ONAY_BEKLIYOR → DUZENLEME_TALEP_EDILDI is approver-only
      // (mirrors per-quote guard). Without this, a non-approver could
      // bulk-flip pending quotes to "edit-requested" and forge a fake
      // approver-rejection trail. Bulk path doesn't carry a per-quote
      // note so we can't satisfy the per-PUT note requirement either —
      // refuse the transition entirely from the bulk flow.
      if (currentStatus === 'ONAY_BEKLIYOR' && targetStatus === 'DUZENLEME_TALEP_EDILDI') {
        results.failed.push({
          id: quote.id,
          quoteNumber: quote.quoteNumber,
          reason: 'Düzenleme talebi tek tek yapılmalıdır (not gerekli)',
        });
        continue;
      }

      // DUZENLEME_TALEP_EDILDI → ONAY_BEKLIYOR ("yeniden onaya gönder")
      // is creator-only.
      if (
        currentStatus === 'DUZENLEME_TALEP_EDILDI' &&
        targetStatus === 'ONAY_BEKLIYOR' &&
        quote.createdById !== user.id
      ) {
        results.failed.push({
          id: quote.id,
          quoteNumber: quote.quoteNumber,
          reason: 'Sadece teklifi oluşturan kişi yeniden onaya gönderebilir',
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
