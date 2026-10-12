import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getDashboardSummary } from '@/lib/dashboard-data';
import { isSummaryPeriod } from '@/lib/dashboard-metrics';

// Kâr özeti for a period (?period=month|3m|6m|12m) — profit data, so
// canViewCosts only, same as the dashboard page shows it.
export async function GET(request: NextRequest) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!user.role.canViewCosts) return NextResponse.json({ error: 'Yetkiniz bulunmuyor' }, { status: 403 });
  const raw = request.nextUrl.searchParams.get('period') ?? 'month';
  if (!isSummaryPeriod(raw)) return NextResponse.json({ error: 'Geçersiz dönem' }, { status: 400 });
  try {
    return NextResponse.json(await getDashboardSummary(user, raw));
  } catch (error) {
    console.error('Dashboard summary error:', error);
    return NextResponse.json({ error: 'Kâr özeti hesaplanamadı' }, { status: 500 });
  }
}
