// NOTE: This API route is currently unused. The dashboard page (src/app/(dashboard)/dashboard/page.tsx)
// fetches data directly via server-side functions. Keeping this route for potential future use
// if the dashboard is migrated to client-side data fetching.
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';

export async function GET() {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Pipeline counts for each status
    const [
      taslakCount,
      onayBekliyorCount,
      onaylandiCount,
      gonderildiCount,
      takipteCount,
    ] = await Promise.all([
      db.quote.count({ where: { status: 'TASLAK' } }),
      db.quote.count({ where: { status: 'ONAY_BEKLIYOR' } }),
      db.quote.count({ where: { status: 'ONAYLANDI' } }),
      db.quote.count({ where: { status: 'GONDERILDI' } }),
      db.quote.count({ where: { status: 'TAKIPTE' } }),
    ]);

    const pipeline = {
      TASLAK: taslakCount,
      ONAY_BEKLIYOR: onayBekliyorCount,
      ONAYLANDI: onaylandiCount,
      GONDERILDI: gonderildiCount,
      TAKIPTE: takipteCount,
    };

    // Profit summary (only computed if user can view costs)
    let profitSummary = null;

    if (user.role.canViewCosts) {
      const sentThisMonth = await db.quote.findMany({
        where: {
          status: 'GONDERILDI',
          updatedAt: { gte: startOfMonth },
        },
        include: {
          items: {
            where: { itemType: 'PRODUCT' },
            select: {
              totalPrice: true,
              costPrice: true,
              quantity: true,
            },
          },
        },
      });

      const sentCount = sentThisMonth.length;
      let totalRevenue = 0;
      let totalCost = 0;

      for (const quote of sentThisMonth) {
        // Revenue = subtotal - discount (pre-VAT, post-discount)
        totalRevenue += Number(quote.subtotal) - Number(quote.discountTotal);
        for (const item of quote.items) {
          if (item.costPrice) {
            totalCost += Number(item.costPrice) * Number(item.quantity);
          }
        }
      }

      const totalProfit = totalRevenue - totalCost;
      const avgMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

      profitSummary = {
        sentCount,
        totalRevenue,
        totalProfit,
        avgMargin,
      };
    }

    return NextResponse.json({
      pipeline,
      profitSummary,
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    return NextResponse.json(
      { error: 'Dashboard verileri alınırken bir hata oluştu' },
      { status: 500 }
    );
  }
}
