'use client';

import { useState } from 'react';
import { cn } from '@/lib/cn';
import { Card, CardBody } from '@/components/ui';
import { Send, Trophy, TrendingUp, Percent } from 'lucide-react';
import type { DashboardSummaryData } from '@/lib/dashboard-data';
import type { SummaryPeriod } from '@/lib/dashboard-metrics';

const PERIOD_OPTIONS: { value: SummaryPeriod; label: string }[] = [
  { value: 'month', label: 'Bu Ay' },
  { value: '3m', label: 'Son 3 Ay' },
  { value: '6m', label: 'Son 6 Ay' },
  { value: '12m', label: 'Son 1 Yıl' },
];

function formatEuro(value: number) {
  return `€${value.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface ProfitSummaryProps {
  /** Server-rendered summary for the default period ("Bu Ay"). */
  data: DashboardSummaryData;
}

export function ProfitSummary({ data: initial }: ProfitSummaryProps) {
  // Heading and active button follow the data actually shown (data.period),
  // so a failed switch never labels old numbers with the new period.
  const [data, setData] = useState<DashboardSummaryData>(initial);
  const [pending, setPending] = useState<SummaryPeriod | null>(null);
  const [error, setError] = useState<string | null>(null);
  const period = data.period;
  const loading = pending !== null;

  const changePeriod = async (next: SummaryPeriod) => {
    setPending(next);
    setError(null);
    try {
      const res = await fetch(`/api/dashboard/summary?period=${next}`);
      // An expired session redirects to the HTML login page — don't show a
      // raw JSON parse error.
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.period) throw new Error(body?.error || 'Kâr özeti hesaplanamadı');
      setData(body as DashboardSummaryData);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kâr özeti hesaplanamadı');
    } finally {
      setPending(null);
    }
  };

  const periodTitle = PERIOD_OPTIONS.find((o) => o.value === period)?.label ?? 'Bu Ay';
  const cards = [
    {
      key: 'won',
      label: 'Kazanılan',
      value: formatEuro(data.wonAmount),
      sub: `${data.wonCount} teklif`,
      icon: Trophy, iconBg: 'bg-emerald-50', iconColor: 'text-emerald-600', valueColor: 'text-emerald-700',
    },
    {
      key: 'profit',
      label: 'Kâr',
      value: formatEuro(data.wonProfit),
      sub: 'kazanılan tekliflerden',
      icon: TrendingUp, iconBg: 'bg-green-50', iconColor: 'text-green-600', valueColor: 'text-green-700',
    },
    {
      key: 'margin',
      label: 'Kâr Marjı',
      value: `%${data.wonMargin.toFixed(1)}`,
      sub: 'kazanılan tekliflerde',
      icon: Percent, iconBg: 'bg-purple-50', iconColor: 'text-purple-600', valueColor: 'text-purple-700',
    },
    {
      key: 'sent',
      label: 'Gönderilen',
      value: `${data.sentCount} teklif`,
      sub: formatEuro(data.sentAmount),
      icon: Send, iconBg: 'bg-blue-50', iconColor: 'text-blue-600', valueColor: 'text-blue-700',
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold text-primary-900">Kâr Özeti ({periodTitle})</h2>
        <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Dönem">
          {PERIOD_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              aria-pressed={o.value === period}
              onClick={() => o.value !== period && changePeriod(o.value)}
              disabled={loading}
              className={cn(
                'px-3 py-1 rounded-md text-xs font-medium border transition-colors',
                o.value === period || o.value === pending
                  ? 'bg-primary-700 text-white border-primary-700'
                  : 'bg-white text-primary-700 border-primary-200 hover:bg-primary-50',
                loading && 'opacity-60 cursor-wait',
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
      <p className="text-xs text-primary-500">
        Kâr, dönemde kazanılan tekliflerden (kazanma tarihine göre) hesaplanır · revizyonlar bir kez sayılır ·
        tutarlar EUR&apos;ya çevrilmiştir
        {data.uncostedPct > 0 && (
          <> · maliyeti girilmemiş ciro payı: %{data.uncostedPct < 1 ? data.uncostedPct.toFixed(1) : data.uncostedPct.toFixed(0)} (kâr ve marja dahil edilmedi)</>
        )}
        {data.noRateCount > 0 && <> · {data.noRateCount} teklif kur bilgisi olmadığı için tutarlara dahil edilmedi</>}
      </p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className={cn('grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4', loading && 'opacity-60')}>
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Card key={c.key}>
              <CardBody className="flex items-center gap-4">
                <div className={cn('p-3 rounded-lg', c.iconBg)}>
                  <Icon className={cn('w-6 h-6', c.iconColor)} />
                </div>
                <div>
                  <p className="text-sm text-primary-500">{c.label}</p>
                  <p className={cn('text-xl font-bold', c.valueColor)}>{c.value}</p>
                  <p className="text-xs text-primary-400">{c.sub}</p>
                </div>
              </CardBody>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
