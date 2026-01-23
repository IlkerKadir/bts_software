import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';

export async function GET() {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const brands = await db.productBrand.findMany({
      orderBy: { sortOrder: 'asc' },
    });

    return NextResponse.json({ brands });
  } catch (error) {
    console.error('Brands GET error:', error);
    return NextResponse.json(
      { error: 'Markalar alınırken bir hata oluştu' },
      { status: 500 }
    );
  }
}
