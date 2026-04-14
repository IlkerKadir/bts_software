'use client';

import { AlertTriangle, X } from 'lucide-react';
import { Button } from '@/components/ui';

/**
 * Yellow attention banner shown at the top of the quote editor when
 * the rates frozen on `quote.rateSnapshot` have drifted meaningfully
 * from fresh TCMB. The banner never touches rates directly — it just
 * tells the user and offers to open `RateUpdateDialog`, which handles
 * the preview + apply flow.
 *
 * Visible only when:
 *  - A snapshot is loaded (legacy quotes without one don't show the
 *    banner — nothing to compare against).
 *  - Fresh TCMB is available (`liveExchangeRates` non-empty).
 *  - The max pair drift exceeds the threshold (default 0.5%).
 *  - The user hasn't dismissed it this session.
 *
 * Dismissing only hides the banner for the current editor session —
 * next reopen re-evaluates against the latest fresh TCMB.
 */

export interface RateDriftBannerProps {
  /** Max drift percentage across all pairs, e.g. `1.83` for 1.83%. */
  driftPct: number;
  /** Opens the `RateUpdateDialog` in the parent. */
  onOpenDialog: () => void;
  /** User-triggered dismiss for this editor session. */
  onDismiss: () => void;
}

export function RateDriftBanner({ driftPct, onOpenDialog, onDismiss }: RateDriftBannerProps) {
  return (
    <div className="flex items-start gap-3 px-4 py-3 border border-amber-300 bg-amber-50 rounded-lg">
      <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-amber-900">
          Bu teklifin kurları güncel TCMB değerlerinden %{driftPct.toFixed(2)} fark gösteriyor.
        </p>
        <p className="text-xs text-amber-700 mt-0.5">
          Eklenen yeni kalemlerin tutarlı hesaplanması için kurları güncellemeyi tercih edebilirsiniz.
          Ek maliyet satırları için kaynak para birimi kullanılarak otomatik yeniden dağıtılır.
        </p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <Button
          variant="primary"
          size="sm"
          onClick={onOpenDialog}
          className="!bg-amber-600 hover:!bg-amber-700"
        >
          Kurları Güncelle
        </Button>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Kapat"
          className="p-1.5 rounded-md text-amber-700 hover:bg-amber-100 transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
