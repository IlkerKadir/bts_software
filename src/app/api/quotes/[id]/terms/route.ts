import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { getQuoteEditDenial, quoteEditAccessInclude } from '@/lib/quote-edit-access';

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
      select: {
        id: true,
        category: true,
        value: true,
        sortOrder: true,
        highlight: true,
      },
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

    // Verify quote exists + shared edit rule (visibility + status)
    const quote = await db.quote.findUnique({ where: { id: quoteId }, include: quoteEditAccessInclude });
    if (!quote) {
      return NextResponse.json({ error: 'Teklif bulunamadı' }, { status: 404 });
    }
    const denial = getQuoteEditDenial(user, quote);
    if (denial) {
      return NextResponse.json({ error: denial.error }, { status: denial.status });
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
        highlight: body.highlight ?? false,
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

// PUT - Bulk update commercial terms (delete all + recreate)
// Accepts body: { terms: Array<{ category, value, sortOrder?, highlight? }> }
// Multiple entries per category are allowed (multi-value categories).
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

    // Verify quote exists + shared edit rule (client 02.09: same rule as
    // items/header — the old creator-or-admin gate blocked Satış users who
    // could already edit the quote's items).
    const quote = await db.quote.findUnique({ where: { id: quoteId }, include: quoteEditAccessInclude });
    if (!quote) {
      return NextResponse.json({ error: 'Teklif bulunamadı' }, { status: 404 });
    }
    const denial = getQuoteEditDenial(user, quote);
    if (denial) {
      return NextResponse.json({ error: denial.error }, { status: denial.status });
    }

    // Replace all terms in a transaction (delete + create)
    await db.$transaction(async (tx) => {
      await tx.quoteCommercialTerm.deleteMany({ where: { quoteId } });

      const termsToCreate = body.terms
        .filter((t: any) => t.value && t.value.trim().length > 0)
        .map((t: any, index: number) => ({
          quoteId,
          category: t.category,
          value: t.value,
          sortOrder: t.sortOrder ?? index + 1,
          highlight: t.highlight ?? false,
        }));

      if (termsToCreate.length > 0) {
        await tx.quoteCommercialTerm.createMany({ data: termsToCreate });
      }
    });

    // Fetch updated terms
    const terms = await db.quoteCommercialTerm.findMany({
      where: { quoteId },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        category: true,
        value: true,
        sortOrder: true,
        highlight: true,
      },
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
