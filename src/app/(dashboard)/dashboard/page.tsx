import { getSession } from '@/lib/session';
import { db } from '@/lib/db';
import { QuotePipeline } from '@/components/dashboard/QuotePipeline';
import { RecentQuotes } from '@/components/dashboard/RecentQuotes';
import { QuickActions } from '@/components/dashboard/QuickActions';
import { ProfitSummary } from '@/components/dashboard/ProfitSummary';
import { DashboardCharts } from '@/components/dashboard/DashboardCharts';
import { ActivityFeed } from '@/components/dashboard/ActivityFeed';
import { UpcomingReminders } from '@/components/dashboard/UpcomingReminders';
import { quoteVisibilityWhere } from '@/lib/quote-visibility';
import { Prisma } from '@prisma/client';

interface DashboardUser {
  id: string;
  roleId?: string; // drives ROLE visibility matching in quoteVisibilityWhere
  role: { canApprove: boolean; canManageUsers: boolean };
}

function withVisibility(
  user: DashboardUser,
  extra: Prisma.QuoteWhereInput
): Prisma.QuoteWhereInput {
  const visibility = quoteVisibilityWhere(user);
  // quoteVisibilityWhere returns {} for managers — merge is a no-op.
  if (Object.keys(visibility).length === 0) {
    return extra;
  }
  return { AND: [extra, visibility] };
}

async function getPipelineCounts(user: DashboardUser) {
  const [taslak, onayBekliyor, duzenlemeTalep, onaylandi, gonderildi] = await Promise.all([
    db.quote.count({ where: withVisibility(user, { status: 'TASLAK' }) }),
    db.quote.count({ where: withVisibility(user, { status: 'ONAY_BEKLIYOR' }) }),
    db.quote.count({ where: withVisibility(user, { status: 'DUZENLEME_TALEP_EDILDI' }) }),
    db.quote.count({ where: withVisibility(user, { status: 'ONAYLANDI' }) }),
    db.quote.count({ where: withVisibility(user, { status: 'GONDERILDI' }) }),
  ]);

  return {
    TASLAK: taslak,
    ONAY_BEKLIYOR: onayBekliyor,
    DUZENLEME_TALEP_EDILDI: duzenlemeTalep,
    ONAYLANDI: onaylandi,
    GONDERILDI: gonderildi,
  };
}

async function getProfitSummary(user: DashboardUser) {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const sentThisMonth = await db.quote.findMany({
    where: withVisibility(user, {
      status: 'GONDERILDI',
      updatedAt: { gte: startOfMonth },
    }),
    select: {
      subtotal: true,
      discountTotal: true,
      items: {
        where: { itemType: 'PRODUCT' },
        select: {
          costPrice: true,
          quantity: true,
        },
      },
    },
  });

  const sentCount = sentThisMonth.length;
  let totalRevenue = 0;
  let totalCost = 0;

  // Revenue = subtotal - discount (pre-VAT, post-discount)
  for (const quote of sentThisMonth) {
    totalRevenue += Number(quote.subtotal) - Number(quote.discountTotal);
    for (const item of quote.items) {
      if (item.costPrice) {
        totalCost += Number(item.costPrice) * Number(item.quantity);
      }
    }
  }

  const totalProfit = totalRevenue - totalCost;
  const avgMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

  return {
    sentCount,
    totalRevenue,
    totalProfit,
    avgMargin,
  };
}

export default async function DashboardPage() {
  const user = await getSession();
  if (!user) return null;

  const canViewCosts = user.role.canViewCosts;

  const [pipelineCounts, profitData] = await Promise.all([
    getPipelineCounts(user),
    canViewCosts ? getProfitSummary(user) : Promise.resolve(null),
  ]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-primary-900">Dashboard</h1>
        <p className="text-primary-500">Hoş geldiniz, {user.fullName}</p>
      </div>

      {/* Pipeline - full width across top */}
      <QuotePipeline counts={pipelineCounts} />

      {/* Middle section: RecentQuotes (2/3) + QuickActions + Reminders (1/3) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <RecentQuotes />
        </div>
        <div className="lg:col-span-1 space-y-6">
          <QuickActions />
          <UpcomingReminders />
        </div>
      </div>

      {/* Profit Summary - conditional on canViewCosts */}
      {canViewCosts && <ProfitSummary data={profitData} />}

      {/* Charts - conditional on canViewCosts */}
      {canViewCosts && <DashboardCharts />}

      {/* Activity Feed - management only (client 30.06) */}
      {(user.role.canApprove || user.role.canManageUsers) && <ActivityFeed />}
    </div>
  );
}
