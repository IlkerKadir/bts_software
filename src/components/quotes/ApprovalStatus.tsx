'use client';

import { AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui';
import type { ApprovalCheckResult } from '@/lib/quote-approval';

interface ApprovalStatusProps {
  result: ApprovalCheckResult;
  showMetrics?: boolean;
  compact?: boolean;
}

export function ApprovalStatus({
  result,
  showMetrics = false,
  compact = false,
}: ApprovalStatusProps) {
  if (!result.needsApproval) {
    return null;
  }

  const formatNumber = (num: number) => {
    return num.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  };

  if (compact) {
    return (
      <Badge variant="warning" className="gap-1">
        <AlertTriangle className="w-3 h-3" />
        Onay Gerekiyor
      </Badge>
    );
  }

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
      <div className="flex items-center gap-2 text-amber-700 font-medium mb-2">
        <AlertTriangle className="w-4 h-4" />
        <span>Onay Gerekiyor</span>
        <Badge variant="warning" className="ml-auto">
          {result.reasons.length} neden
        </Badge>
      </div>

      <ul className="space-y-1 text-sm text-amber-800">
        {result.reasonLabels.map((label, index) => (
          <li key={index} className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            {label}
          </li>
        ))}
      </ul>

      {showMetrics && (
        <div className="mt-3 pt-3 border-t border-amber-200 grid grid-cols-3 gap-3 text-xs">
          <div>
            <span className="text-amber-600">Toplam Değer</span>
            <p className="font-medium text-amber-900">
              {formatNumber(result.metrics.totalValue)}
            </p>
          </div>
          <div>
            <span className="text-amber-600">Maks. İskonto</span>
            <p className="font-medium text-amber-900">
              {formatNumber(result.metrics.maxDiscountPct)}%
            </p>
          </div>
          <div>
            <span className="text-amber-600">Min. Katsayı</span>
            <p className="font-medium text-amber-900">
              {formatNumber(result.metrics.minKatsayi)}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
