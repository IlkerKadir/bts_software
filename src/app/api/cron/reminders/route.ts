import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  // Authenticate cron requests via CRON_SECRET Bearer token
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ') || authHeader.slice(7) !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

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
          title: 'Takip Hatırlatması',
          message: `${q.quoteNumber} - ${q.company.name} teklifinde 7 gündür güncelleme yapılmadı.`,
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
          title: 'Teklif Süresi Doldu',
          message: `${q.quoteNumber} - ${q.company.name} teklifinin geçerlilik süresi doldu.`,
          link: `/quotes/${q.id}`,
        },
      });
      created++;
    }
  }

  // ==================== USER REMINDERS ====================
  // Find user reminders that are due today or overdue (and not completed)
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);

  const dueReminders = await db.reminder.findMany({
    where: {
      isCompleted: false,
      dueDate: { lt: endOfToday },
    },
    include: {
      quote: { select: { id: true, quoteNumber: true } },
      project: { select: { id: true, name: true } },
    },
  });

  let reminderNotifications = 0;

  for (const r of dueReminders) {
    // Don't send duplicate notifications for the same reminder within the last 24 hours
    const existingNotification = await db.notification.findFirst({
      where: {
        userId: r.userId,
        type: 'FOLLOW_UP_REMINDER',
        message: { contains: r.id },
        createdAt: { gte: startOfToday },
      },
    });

    if (!existingNotification) {
      let message = r.title;
      let link: string | undefined;

      if (r.quote) {
        message += ` (Teklif: ${r.quote.quoteNumber})`;
        link = `/quotes/${r.quote.id}`;
      } else if (r.project) {
        message += ` (Proje: ${r.project.name})`;
        link = `/projects/${r.project.id}`;
      }

      // Tag with reminder ID so we can detect duplicates
      message += ` [ref:${r.id}]`;

      await db.notification.create({
        data: {
          userId: r.userId,
          type: 'FOLLOW_UP_REMINDER',
          title: 'Hatırlatma',
          message,
          link,
        },
      });
      reminderNotifications++;
      created++;
    }
  }

  return NextResponse.json({
    staleCount: staleQuotes.length,
    expiredCount: expiredQuotes.length,
    reminderCount: dueReminders.length,
    reminderNotifications,
    notificationsCreated: created,
  });
}
