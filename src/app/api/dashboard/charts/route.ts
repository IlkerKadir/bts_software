import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getDashboardChartData } from '@/lib/dashboard-data';

// Aylık Gelir (won, by win date, EUR) / Kazanma Oranı (won/(won+lost)
// families decided per month) / pipeline — see src/lib/dashboard-data.ts.
export async function GET() {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!user.role.canViewCosts) return NextResponse.json({ error: 'Yetkiniz bulunmuyor' }, { status: 403 });
  try {
    return NextResponse.json(await getDashboardChartData(user));
  } catch (error) {
    console.error('Dashboard charts error:', error);
    return NextResponse.json({ error: 'Grafik verileri alınamadı' }, { status: 500 });
  }
}
