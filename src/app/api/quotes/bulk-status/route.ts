import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { z } from 'zod';
import { QuoteStatus } from '@prisma/client';
import { canTransitionTo, type QuoteStatus as QS } from '@/lib/quote-status';

const bulkStatusSchema = z.object({
  quoteIds: z.array(z.string()).min(1),
  status: z.nativeEnum(QuoteStatus),
  note: z.string().optional(),
});

// Only allow these bulk transitions
const ALLOWED_BULK_TRANSITIONS: Record<string, string[]> = {
  TASLAK: ['IPTAL'],
  ONAY_BEKLIYOR: ['IPTAL'],
  ONAYLANDI: ['GONDERILDI', 'IPTAL'],
  GONDERILDI: ['TAKIPTE', 'KAZANILDI', 'KAYBEDILDI'],
  TAKIPTE: ['KAZANILDI', 'KAYBEDILDI'],
};

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

    // Get quotes
    const quotes = await db.quote.findMany({
      where: { id: { in: data.quoteIds } },
      select: { id: true, quoteNumber: true, status: true },
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

      // Check if transition is valid
      if (!canTransitionTo(currentStatus, targetStatus)) {
        results.failed.push({
          id: quote.id,
          quoteNumber: quote.quoteNumber,
          reason: `${quote.status} durumundan ${data.status} durumuna geçiş yapılamaz`,
        });
        continue;
      }

      // Check if bulk transition is allowed
      const allowedTargets = ALLOWED_BULK_TRANSITIONS[currentStatus] || [];
      if (!allowedTargets.includes(data.status)) {
        results.failed.push({
          id: quote.id,
          quoteNumber: quote.quoteNumber,
          reason: `Bu durum toplu değişiklik için uygun değil`,
        });
        continue;
      }

      try {
        // Update quote
        await db.quote.update({
          where: { id: quote.id },
          data: { status: data.status },
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
