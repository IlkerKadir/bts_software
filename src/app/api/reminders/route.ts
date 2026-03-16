import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const quoteId = searchParams.get('quoteId');
    const projectId = searchParams.get('projectId');
    const includeCompleted = searchParams.get('includeCompleted') === 'true';
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    const where: Record<string, unknown> = {
      userId: user.id,
    };

    if (!includeCompleted) {
      where.isCompleted = false;
    }

    if (quoteId) {
      where.quoteId = quoteId;
    }

    if (projectId) {
      where.projectId = projectId;
    }

    const reminders = await db.reminder.findMany({
      where,
      include: {
        quote: {
          select: { id: true, quoteNumber: true },
        },
        project: {
          select: { id: true, name: true },
        },
      },
      orderBy: { dueDate: 'asc' },
      take: limit,
    });

    return NextResponse.json({ reminders });
  } catch (error) {
    console.error('Reminders GET error:', error);
    return NextResponse.json(
      { error: 'Hatırlatmalar alınırken bir hata oluştu' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { title, note, dueDate, quoteId, projectId } = body;

    if (!title || !title.trim()) {
      return NextResponse.json(
        { error: 'Başlık zorunludur' },
        { status: 400 }
      );
    }

    if (!dueDate) {
      return NextResponse.json(
        { error: 'Tarih zorunludur' },
        { status: 400 }
      );
    }

    const parsedDate = new Date(dueDate);
    if (isNaN(parsedDate.getTime())) {
      return NextResponse.json(
        { error: 'Geçersiz tarih formatı' },
        { status: 400 }
      );
    }

    // Validate quoteId if provided
    if (quoteId) {
      const quote = await db.quote.findUnique({ where: { id: quoteId }, select: { id: true } });
      if (!quote) {
        return NextResponse.json({ error: 'Teklif bulunamadı' }, { status: 404 });
      }
    }

    // Validate projectId if provided
    if (projectId) {
      const project = await db.project.findUnique({ where: { id: projectId }, select: { id: true } });
      if (!project) {
        return NextResponse.json({ error: 'Proje bulunamadı' }, { status: 404 });
      }
    }

    const reminder = await db.reminder.create({
      data: {
        userId: user.id,
        title: title.trim(),
        note: note?.trim() || null,
        dueDate: parsedDate,
        quoteId: quoteId || null,
        projectId: projectId || null,
      },
      include: {
        quote: {
          select: { id: true, quoteNumber: true },
        },
        project: {
          select: { id: true, name: true },
        },
      },
    });

    return NextResponse.json({ reminder }, { status: 201 });
  } catch (error) {
    console.error('Reminders POST error:', error);
    return NextResponse.json(
      { error: 'Hatırlatma oluşturulurken bir hata oluştu' },
      { status: 500 }
    );
  }
}
