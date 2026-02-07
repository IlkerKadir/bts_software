import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Find stale GONDERILDI quotes (not updated in 7 days)
  const staleQuotes = await db.quote.findMany({
    where: {
      status: 'GONDERILDI',
      updatedAt: { lt: sevenDaysAgo },
    },
    select: { id: true, quoteNumber: true, createdById: true, company: { select: { name: true } } },
  });

  // Find expired quotes
  const expiredQuotes = await db.quote.findMany({
    where: {
      validUntil: { lt: now },
      status: { notIn: ['KAZANILDI', 'KAYBEDILDI', 'IPTAL'] },
    },
    select: { id: true, quoteNumber: true, createdById: true, company: { select: { name: true } } },
  });

  let created = 0;

  for (const q of staleQuotes) {
    const existing = await db.notification.findFirst({
      where: { userId: q.createdById, link: `/quotes/${q.id}`, type: 'FOLLOW_UP_REMINDER', createdAt: { gte: sevenDaysAgo } },
    });
    if (!existing) {
      await db.notification.create({
        data: {
          userId: q.createdById,
          type: 'FOLLOW_UP_REMINDER',
          title: 'Takip Hatirlatmasi',
          message: `${q.quoteNumber} - ${q.company.name} teklifinde 7 gundur guncelleme yapilmadi.`,
          link: `/quotes/${q.id}`,
        },
      });
      created++;
    }
  }

  for (const q of expiredQuotes) {
    const existing = await db.notification.findFirst({
      where: { userId: q.createdById, link: `/quotes/${q.id}`, type: 'QUOTE_EXPIRING', createdAt: { gte: sevenDaysAgo } },
    });
    if (!existing) {
      await db.notification.create({
        data: {
          userId: q.createdById,
          type: 'QUOTE_EXPIRING',
          title: 'Teklif Suresi Doldu',
          message: `${q.quoteNumber} - ${q.company.name} teklifinin gecerlilik suresi doldu.`,
          link: `/quotes/${q.id}`,
        },
      });
      created++;
    }
  }

  return NextResponse.json({ staleCount: staleQuotes.length, expiredCount: expiredQuotes.length, notificationsCreated: created });
}
