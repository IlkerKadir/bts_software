import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { db } from '@/lib/db';

export async function GET() {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const now = new Date();
  const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);

  // Get all quotes from last 12 months
  const quotes = await db.quote.findMany({
    where: { createdAt: { gte: twelveMonthsAgo } },
    select: { status: true, grandTotal: true, createdAt: true },
  });

  // Build monthly revenue data
  const months: string[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(d.toLocaleDateString('tr-TR', { month: 'short', year: '2-digit' }));
  }

  const monthlyRevenue = months.map((month, idx) => {
    const targetDate = new Date(now.getFullYear(), now.getMonth() - (11 - idx), 1);
    const nextMonth = new Date(now.getFullYear(), now.getMonth() - (10 - idx), 1);
    const monthQuotes = quotes.filter(q => q.createdAt >= targetDate && q.createdAt < nextMonth);
    return {
      month,
      kazanilan: monthQuotes.filter(q => q.status === 'KAZANILDI').reduce((sum, q) => sum + Number(q.grandTotal), 0),
      kaybedilen: monthQuotes.filter(q => q.status === 'KAYBEDILDI').reduce((sum, q) => sum + Number(q.grandTotal), 0),
      bekleyen: monthQuotes.filter(q => !['KAZANILDI', 'KAYBEDILDI', 'IPTAL'].includes(q.status)).reduce((sum, q) => sum + Number(q.grandTotal), 0),
    };
  });

  // Win rate trend
  const winRate = months.map((month, idx) => {
    const targetDate = new Date(now.getFullYear(), now.getMonth() - (11 - idx), 1);
    const nextMonth = new Date(now.getFullYear(), now.getMonth() - (10 - idx), 1);
    const monthQuotes = quotes.filter(q => q.createdAt >= targetDate && q.createdAt < nextMonth);
    const closed = monthQuotes.filter(q => ['KAZANILDI', 'KAYBEDILDI'].includes(q.status));
    const won = closed.filter(q => q.status === 'KAZANILDI');
    return { month, rate: closed.length > 0 ? Math.round((won.length / closed.length) * 100) : 0 };
  });

  // Pipeline
  const statusLabels: Record<string, string> = {
    TASLAK: 'Taslak', ONAY_BEKLIYOR: 'Onay Bekliyor', ONAYLANDI: 'Onaylandi',
    GONDERILDI: 'Gonderildi', TAKIPTE: 'Takipte', KAZANILDI: 'Kazanildi', KAYBEDILDI: 'Kaybedildi',
  };
  const statusColors: Record<string, string> = {
    TASLAK: '#94A3B8', ONAY_BEKLIYOR: '#F59E0B', ONAYLANDI: '#0EA5E9',
    GONDERILDI: '#3B82F6', TAKIPTE: '#8B5CF6', KAZANILDI: '#22C55E', KAYBEDILDI: '#EF4444',
  };

  const pipeline = Object.entries(statusLabels).map(([status, name]) => ({
    name,
    value: quotes.filter(q => q.status === status).length,
    color: statusColors[status] || '#94A3B8',
  })).filter(p => p.value > 0);

  return NextResponse.json({ monthlyRevenue, winRate, pipeline });
}
