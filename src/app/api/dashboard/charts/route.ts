import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { db } from '@/lib/db';
import { quoteVisibilityWhere } from '@/lib/quote-visibility';
import { Prisma } from '@prisma/client';

export async function GET() {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const now = new Date();
  const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);

  // Scope charts to quotes this user is allowed to see — managers
  // bypass the filter, everyone else sees own + visible-project quotes.
  const visibility = quoteVisibilityWhere(user);
  const baseWhere: Prisma.QuoteWhereInput = { createdAt: { gte: twelveMonthsAgo } };
  const where: Prisma.QuoteWhereInput = Object.keys(visibility).length === 0
    ? baseWhere
    : { AND: [baseWhere, visibility] };

  const quotes = await db.quote.findMany({
    where,
    select: { status: true, grandTotal: true, createdAt: true },
  });

  // Build monthly revenue data
  const months: string[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(d.toLocaleDateString('tr-TR', { month: 'short', year: '2-digit' }));
  }

  // Monthly revenue = ONLY quotes that have actually been won
  // (status KAZANILDI). Drafts and sent-but-undecided quotes are not
  // revenue and have been intentionally excluded so the chart matches
  // its label.
  const monthlyRevenue = months.map((month, idx) => {
    const targetDate = new Date(now.getFullYear(), now.getMonth() - (11 - idx), 1);
    const nextMonth = new Date(now.getFullYear(), now.getMonth() - (10 - idx), 1);
    const monthQuotes = quotes.filter(q => q.createdAt >= targetDate && q.createdAt < nextMonth);
    return {
      month,
      kazanilan: monthQuotes
        .filter(q => q.status === 'KAZANILDI')
        .reduce((sum, q) => sum + Number(q.grandTotal), 0),
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
    TASLAK: 'Taslak', ONAY_BEKLIYOR: 'Onay Bekliyor',
    DUZENLEME_TALEP_EDILDI: 'Duzenleme Talep Edildi',
    ONAYLANDI: 'Onaylandi', GONDERILDI: 'Gonderildi', TAKIPTE: 'Takipte',
    REVIZYON: 'Revizyon', KAZANILDI: 'Kazanildi', KAYBEDILDI: 'Kaybedildi', IPTAL: 'Iptal',
  };
  const statusColors: Record<string, string> = {
    TASLAK: '#94A3B8', ONAY_BEKLIYOR: '#F59E0B',
    DUZENLEME_TALEP_EDILDI: '#F43F5E',
    ONAYLANDI: '#0EA5E9', GONDERILDI: '#3B82F6', TAKIPTE: '#8B5CF6',
    REVIZYON: '#14B8A6', KAZANILDI: '#22C55E', KAYBEDILDI: '#EF4444', IPTAL: '#6B7280',
  };

  const pipeline = Object.entries(statusLabels).map(([status, name]) => ({
    name,
    value: quotes.filter(q => q.status === status).length,
    color: statusColors[status] || '#94A3B8',
  })).filter(p => p.value > 0);

  return NextResponse.json({ monthlyRevenue, winRate, pipeline });
}
