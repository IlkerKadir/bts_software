import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { quoteInteractionSchema } from '@/lib/validations/quote-tracking';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** List a quote's interaction log (newest first). */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const interactions = await db.quoteInteraction.findMany({
      where: { quoteId: id },
      include: { user: { select: { id: true, fullName: true } } },
      orderBy: { interactionDate: 'desc' },
    });

    return NextResponse.json({ interactions });
  } catch (error) {
    console.error('Quote interactions GET error:', error);
    return NextResponse.json({ error: 'İletişim geçmişi alınırken bir hata oluştu' }, { status: 500 });
  }
}

/**
 * Append one interaction. "Kim tarafından" is the current user (automatic).
 * If a follow-up reminderDate is supplied, also create a Reminder for the
 * current user, linked to this quote, so it surfaces in the reminders system.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const data = quoteInteractionSchema.parse(body);

    const quote = await db.quote.findUnique({
      where: { id },
      select: { id: true, quoteNumber: true },
    });
    if (!quote) {
      return NextResponse.json({ error: 'Teklif bulunamadı' }, { status: 404 });
    }

    const interaction = await db.quoteInteraction.create({
      data: {
        quoteId: id,
        userId: user.id,
        type: data.type,
        note: data.note,
        interactionDate: data.interactionDate ? new Date(data.interactionDate) : new Date(),
        reminderDate: data.reminderDate ? new Date(data.reminderDate) : null,
      },
      include: { user: { select: { id: true, fullName: true } } },
    });

    // Mirror a follow-up date into the reminders system.
    if (data.reminderDate) {
      await db.reminder.create({
        data: {
          userId: user.id,
          title: `Teklif takibi: ${quote.quoteNumber}`,
          note: data.note,
          dueDate: new Date(data.reminderDate),
          quoteId: id,
        },
      });
    }

    return NextResponse.json({ interaction }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.name === 'ZodError') {
      return NextResponse.json({ error: 'Geçersiz veri', details: error }, { status: 400 });
    }
    console.error('Quote interactions POST error:', error);
    return NextResponse.json({ error: 'İletişim kaydı eklenirken bir hata oluştu' }, { status: 500 });
  }
}
