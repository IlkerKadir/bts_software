'use client';

import { cn } from '@/lib/cn';
import { Card, CardBody } from '@/components/ui';
import {
  Send,
  Euro,
  TrendingUp,
  Percent,
} from 'lucide-react';

interface ProfitData {
  sentCount: number;
  totalRevenue: number;
  totalProfit: number;
  avgMargin: number;
}

interface ProfitSummaryProps {
  data: ProfitData | null;
}

function formatEuro(value: number) {
  return `\u20AC${value.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const statConfig = [
  {
    key: 'sentCount' as const,
    label: 'Bu Ay Gönderilen',
    icon: Send,
    iconBg: 'bg-blue-50',
    iconColor: 'text-blue-600',
    valueColor: 'text-blue-700',
    format: (v: number) => String(v),
  },
  {
    key: 'totalRevenue' as const,
    label: 'Toplam Tutar',
    icon: Euro,
    iconBg: 'bg-emerald-50',
    iconColor: 'text-emerald-600',
    valueColor: 'text-emerald-700',
    format: (v: number) => formatEuro(v),
  },
  {
    key: 'totalProfit' as const,
    label: 'Toplam Kar',
    icon: TrendingUp,
    iconBg: 'bg-green-50',
    iconColor: 'text-green-600',
    valueColor: 'text-green-700',
    format: (v: number) => formatEuro(v),
  },
  {
    key: 'avgMargin' as const,
    label: 'Ortalama Kar Marjı',
    icon: Percent,
    iconBg: 'bg-purple-50',
    iconColor: 'text-purple-600',
    valueColor: 'text-purple-700',
    format: (v: number) => `%${v.toFixed(1)}`,
  },
];

export function ProfitSummary({ data }: ProfitSummaryProps) {
  if (!data) return null;

  return (
    <div className="space-y-3">
      <h2 className="font-semibold text-primary-900">Kar Özeti (Bu Ay)</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statConfig.map((stat) => {
          const Icon = stat.icon;
          const value = data[stat.key];

          return (
            <Card key={stat.key}>
              <CardBody className="flex items-center gap-4">
                <div className={cn('p-3 rounded-lg', stat.iconBg)}>
                  <Icon className={cn('w-6 h-6', stat.iconColor)} />
                </div>
                <div>
                  <p className="text-sm text-primary-500">{stat.label}</p>
                  <p className={cn('text-xl font-bold', stat.valueColor)}>
                    {stat.format(value)}
                  </p>
                </div>
              </CardBody>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
