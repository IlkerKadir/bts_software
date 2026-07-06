import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { quoteInteractionSchema } from '@/lib/validations/quote-tracking';
import { canUserAccessQuote } from '@/lib/quote-access';
import type { ZodError } from 'zod';

interface RouteParams {
  params: Promise<{ id: string }>;
}

const QUOTE_ACCESS_SELECT = {
  id: true,
  quoteNumber: true,
  createdById: true,
  project: { select: { visibility: true, visibleToRoleId: true, visibleTo: { select: { userId: true } } } },
} as const;

/** List a quote's interaction log (newest first). */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const quote = await db.quote.findUnique({ where: { id }, select: QUOTE_ACCESS_SELECT });
    if (!quote) {
      return NextResponse.json({ error: 'Teklif bulunamadı' }, { status: 404 });
    }
    const isManager = user.role.canApprove || user.role.canManageUsers;
    if (!canUserAccessQuote(user.id, isManager, quote, user.roleId)) {
      return NextResponse.json({ error: 'Bu teklife erişim yetkiniz yok' }, { status: 403 });
    }

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

    const quote = await db.quote.findUnique({ where: { id }, select: QUOTE_ACCESS_SELECT });
    if (!quote) {
      return NextResponse.json({ error: 'Teklif bulunamadı' }, { status: 404 });
    }
    const isManager = user.role.canApprove || user.role.canManageUsers;
    if (!canUserAccessQuote(user.id, isManager, quote, user.roleId)) {
      return NextResponse.json({ error: 'Bu teklife erişim yetkiniz yok' }, { status: 403 });
    }

    // Create the interaction and (if a follow-up date is set) its mirrored
    // Reminder atomically — an append-only log must not end up with an
    // interaction whose reminderDate has no matching Reminder row.
    const interaction = await db.$transaction(async (tx) => {
      const created = await tx.quoteInteraction.create({
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

      if (data.reminderDate) {
        await tx.reminder.create({
          data: {
            userId: user.id,
            title: `Teklif takibi: ${quote.quoteNumber}`,
            note: data.note,
            dueDate: new Date(data.reminderDate),
            quoteId: id,
          },
        });
      }

      return created;
    });

    return NextResponse.json({ interaction }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.name === 'ZodError') {
      return NextResponse.json({ error: 'Geçersiz veri', details: (error as ZodError).issues }, { status: 400 });
    }
    console.error('Quote interactions POST error:', error);
    return NextResponse.json({ error: 'İletişim kaydı eklenirken bir hata oluştu' }, { status: 500 });
  }
}
