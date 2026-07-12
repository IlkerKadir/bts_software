import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { canUserAccessQuote } from '@/lib/quote-access';

interface RouteParams {
  params: Promise<{ id: string; interactionId: string }>;
}

/**
 * DELETE /api/quotes/[id]/interactions/[interactionId]
 * Removes one İletişim Geçmişi entry (client 12.07). Only the note's author
 * or management may delete; quote visibility is enforced like every other
 * tracking route. A mirrored Reminder (created together with the note when a
 * follow-up date was set) is removed best-effort in the same transaction.
 */
export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id, interactionId } = await params;

    const interaction = await db.quoteInteraction.findUnique({
      where: { id: interactionId },
      include: {
        quote: {
          select: {
            createdById: true,
            project: {
              select: {
                visibility: true,
                visibleToRoleId: true,
                visibleTo: { select: { userId: true } },
              },
            },
          },
        },
      },
    });
    if (!interaction || interaction.quoteId !== id) {
      return NextResponse.json({ error: 'İletişim kaydı bulunamadı' }, { status: 404 });
    }

    const isManager = user.role.canApprove || user.role.canManageUsers;
    if (!canUserAccessQuote(user.id, isManager, interaction.quote, user.roleId)) {
      return NextResponse.json({ error: 'Bu teklife erişim yetkiniz yok' }, { status: 403 });
    }

    // Author-or-management: the log is shared, so a user can't prune
    // someone else's entries.
    if (interaction.userId !== user.id && !isManager) {
      return NextResponse.json(
        { error: 'Bu kaydı sadece ekleyen kullanıcı veya yönetim silebilir' },
        { status: 403 }
      );
    }

    await db.$transaction(async (tx) => {
      if (interaction.reminderDate) {
        // The POST mirrors reminderDate into a Reminder with these exact
        // fields; there is no FK between them, so match best-effort.
        await tx.reminder.deleteMany({
          where: {
            quoteId: id,
            userId: interaction.userId,
            dueDate: interaction.reminderDate,
            note: interaction.note,
          },
        });
      }
      await tx.quoteInteraction.delete({ where: { id: interactionId } });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Quote interaction DELETE error:', error);
    return NextResponse.json(
      { error: 'İletişim kaydı silinirken bir hata oluştu' },
      { status: 500 }
    );
  }
}
