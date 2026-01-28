import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: quoteId } = await params;

    // Check quote exists
    const quote = await db.quote.findUnique({
      where: { id: quoteId },
      select: { id: true },
    });

    if (!quote) {
      return NextResponse.json({ error: 'Teklif bulunamadı' }, { status: 404 });
    }

    const history = await db.quoteHistory.findMany({
      where: { quoteId },
      include: {
        user: {
          select: { id: true, fullName: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ history });
  } catch (error) {
    console.error('Quote history GET error:', error);
    return NextResponse.json(
      { error: 'Geçmiş yüklenirken bir hata oluştu' },
      { status: 500 }
    );
  }
}
