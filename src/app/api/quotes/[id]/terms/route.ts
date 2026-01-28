import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET - Fetch commercial terms for a quote
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: quoteId } = await params;

    const terms = await db.quoteCommercialTerm.findMany({
      where: { quoteId },
      orderBy: { sortOrder: 'asc' },
    });

    return NextResponse.json({ terms });
  } catch (error) {
    console.error('Commercial terms GET error:', error);
    return NextResponse.json(
      { error: 'Ticari şartlar alınırken bir hata oluştu' },
      { status: 500 }
    );
  }
}

// POST - Add a new commercial term
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: quoteId } = await params;
    const body = await request.json();

    // Verify quote exists
    const quote = await db.quote.findUnique({ where: { id: quoteId } });
    if (!quote) {
      return NextResponse.json({ error: 'Teklif bulunamadı' }, { status: 404 });
    }

    // Get max sort order
    const maxTerm = await db.quoteCommercialTerm.findFirst({
      where: { quoteId },
      orderBy: { sortOrder: 'desc' },
    });
    const nextSortOrder = (maxTerm?.sortOrder || 0) + 1;

    const term = await db.quoteCommercialTerm.create({
      data: {
        quoteId,
        sortOrder: body.sortOrder ?? nextSortOrder,
        category: body.category,
        value: body.value,
      },
    });

    return NextResponse.json({ term }, { status: 201 });
  } catch (error) {
    console.error('Commercial term POST error:', error);
    return NextResponse.json(
      { error: 'Ticari şart eklenirken bir hata oluştu' },
      { status: 500 }
    );
  }
}

// PUT - Bulk update commercial terms
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: quoteId } = await params;
    const body = await request.json();

    if (!body.terms || !Array.isArray(body.terms)) {
      return NextResponse.json({ error: 'Terms array required' }, { status: 400 });
    }

    // Verify quote exists
    const quote = await db.quote.findUnique({ where: { id: quoteId } });
    if (!quote) {
      return NextResponse.json({ error: 'Teklif bulunamadı' }, { status: 404 });
    }

    // Update terms in a transaction
    await db.$transaction(async (tx) => {
      for (const term of body.terms) {
        if (term.id) {
          await tx.quoteCommercialTerm.update({
            where: { id: term.id },
            data: {
              sortOrder: term.sortOrder,
              category: term.category,
              value: term.value,
            },
          });
        }
      }
    });

    // Fetch updated terms
    const terms = await db.quoteCommercialTerm.findMany({
      where: { quoteId },
      orderBy: { sortOrder: 'asc' },
    });

    return NextResponse.json({ terms });
  } catch (error) {
    console.error('Commercial terms PUT error:', error);
    return NextResponse.json(
      { error: 'Ticari şartlar güncellenirken bir hata oluştu' },
      { status: 500 }
    );
  }
}
