import { getSession } from '@/lib/session';
import { db } from '@/lib/db';
import { Card, CardBody, Badge } from '@/components/ui';
import { FileText, Clock, CheckCircle, TrendingUp } from 'lucide-react';

async function getDashboardStats() {
  const [pendingQuotes, awaitingApproval, thisMonthQuotes, wonQuotes] = await Promise.all([
    db.quote.count({
      where: {
        status: { in: ['TASLAK', 'GONDERILDI', 'TAKIPTE'] },
      },
    }),
    db.quote.count({
      where: { status: 'ONAY_BEKLIYOR' },
    }),
    db.quote.count({
      where: {
        createdAt: {
          gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
        },
      },
    }),
    db.quote.aggregate({
      where: {
        status: 'KAZANILDI',
        createdAt: {
          gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
        },
      },
      _sum: { grandTotal: true },
    }),
  ]);

  return {
    pendingQuotes,
    awaitingApproval,
    thisMonthQuotes,
    wonTotal: wonQuotes._sum.grandTotal?.toNumber() || 0,
  };
}

async function getRecentQuotes() {
  return db.quote.findMany({
    take: 5,
    orderBy: { createdAt: 'desc' },
    include: {
      company: { select: { name: true } },
      project: { select: { name: true } },
    },
  });
}

export default async function DashboardPage() {
  const user = await getSession();
  if (!user) return null;

  const [stats, recentQuotes] = await Promise.all([
    getDashboardStats(),
    getRecentQuotes(),
  ]);

  const statCards = [
    {
      label: 'Bekleyen Teklifler',
      value: stats.pendingQuotes,
      icon: FileText,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
    },
    {
      label: 'Onay Bekleyen',
      value: stats.awaitingApproval,
      icon: Clock,
      color: 'text-amber-600',
      bgColor: 'bg-amber-50',
    },
    {
      label: 'Bu Ay Verilen',
      value: stats.thisMonthQuotes,
      icon: CheckCircle,
      color: 'text-green-600',
      bgColor: 'bg-green-50',
    },
    {
      label: 'Kazanılan (Bu Ay)',
      value: `€${stats.wonTotal.toLocaleString('tr-TR')}`,
      icon: TrendingUp,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-primary-900">Dashboard</h1>
        <p className="text-primary-500">Hoş geldiniz, {user.fullName}</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat) => (
          <Card key={stat.label}>
            <CardBody className="flex items-center gap-4">
              <div className={`p-3 rounded-lg ${stat.bgColor}`}>
                <stat.icon className={`w-6 h-6 ${stat.color}`} />
              </div>
              <div>
                <p className="text-sm text-primary-500">{stat.label}</p>
                <p className="text-2xl font-bold text-primary-900">{stat.value}</p>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>

      {/* Recent Quotes */}
      <Card>
        <div className="px-5 py-4 border-b border-primary-200 flex items-center justify-between">
          <h2 className="font-semibold text-primary-900">Son Teklifler</h2>
          <a href="/quotes" className="text-sm text-accent-700 hover:underline cursor-pointer">
            Tümünü Gör →
          </a>
        </div>
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Teklif No</th>
                <th>Firma</th>
                <th>Proje</th>
                <th>Tutar</th>
                <th>Durum</th>
              </tr>
            </thead>
            <tbody>
              {recentQuotes.map((quote) => (
                <tr key={quote.id} className="cursor-pointer hover:bg-primary-50">
                  <td className="font-medium">{quote.quoteNumber}</td>
                  <td>{quote.company.name}</td>
                  <td>{quote.project?.name || '-'}</td>
                  <td className="tabular-nums">
                    €{quote.grandTotal.toNumber().toLocaleString('tr-TR')}
                  </td>
                  <td>
                    <Badge status={quote.status} />
                  </td>
                </tr>
              ))}
              {recentQuotes.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center text-primary-500 py-8">
                    Henüz teklif bulunmuyor
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
