'use client';

import { useMemo } from 'react';
import { X, AlertTriangle, CheckCircle2, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui';
import type { QuoteItemData } from './QuoteItemRow';
import {
  isRateSensitiveRow,
  isSetParentRow,
  isManualCommitmentRow,
} from '@/lib/quote-item-classification';

/**
 * Kurları Güncelle preview dialog.
 *
 * Shown when the user chooses to refresh a reopened quote's rates
 * against fresh TCMB. Walks the user through:
 *   - Which currency pairs actually moved, and by how much
 *   - Which items/rows will be recalculated automatically
 *   - Which rows are "commitments" and stay untouched
 *   - A single Uygula button that runs the update, or İptal
 *
 * The dialog is purely presentation + one callback — it doesn't
 * fetch data, doesn't touch React state directly, doesn't know
 * about the rate matrix math. The caller (QuoteEditor) hands in
 * the two matrices and a list of items, and receives the "go
 * ahead" signal on apply.
 */

type RateMatrix = Record<string, Record<string, number>>;

export interface RateUpdateDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** Callback when the user confirms. Caller runs the apply pipeline. */
  onApply: () => void | Promise<void>;
  /** Quote currency (for "X % daha pahalı" display hints). */
  quoteCurrency: string;
  /** Rate matrix currently frozen on the quote (from `rateSnapshot`). */
  oldMatrix: RateMatrix;
  /** Fresh TCMB-derived matrix to apply if the user confirms. */
  newMatrix: RateMatrix;
  /** Items in the editor. Used to count affected vs untouched rows. */
  items: QuoteItemData[];
  /** Count of ek maliyet lines with a stamped sourceCurrency
   *  (affected). Null means unknown / not loaded yet. */
  ekMaliyetStampedCount: number | null;
  /** Count of legacy ek maliyet lines without a source (unaffected). */
  ekMaliyetLegacyCount: number;
  /** True while the apply pipeline is running. Disables buttons. */
  isApplying?: boolean;
  /** Inline error surfaced after a failed apply attempt. Rendered
   *  below the affected-items section so the user sees it without
   *  closing the dialog. */
  applyError?: string | null;
}

interface PairDiff {
  pair: string;
  from: string;
  to: string;
  oldRate: number;
  newRate: number;
  pctChange: number;
}

const THRESHOLD_PCT = 0.01; // show any pair that moved by at least this much

/**
 * Walk both matrices and build the list of pairs that changed by
 * more than `THRESHOLD_PCT`. Only pairs present in BOTH matrices
 * are reported — a pair in only one side is skipped to avoid
 * confusing "null → 1.07" entries.
 */
function diffMatrices(oldMatrix: RateMatrix, newMatrix: RateMatrix): PairDiff[] {
  const diffs: PairDiff[] = [];
  for (const from of Object.keys(newMatrix)) {
    const toObj = newMatrix[from];
    if (!toObj) continue;
    for (const to of Object.keys(toObj)) {
      const newRate = toObj[to];
      const oldRate = oldMatrix[from]?.[to];
      if (oldRate == null || newRate == null) continue;
      if (!Number.isFinite(oldRate) || !Number.isFinite(newRate)) continue;
      if (oldRate === 0) continue;

      const pctChange = ((newRate - oldRate) / oldRate) * 100;
      if (Math.abs(pctChange) < THRESHOLD_PCT) continue;
      diffs.push({ pair: `${from}/${to}`, from, to, oldRate, newRate, pctChange });
    }
  }
  // Only show one direction per pair (the smaller lex-order
  // currency first) so we don't display EUR/TRY and TRY/EUR as two
  // separate rows of the same information.
  const seen = new Set<string>();
  return diffs.filter((d) => {
    const key = [d.from, d.to].sort().join('/');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function formatRate(rate: number): string {
  const decimals = rate < 1 ? 6 : 4;
  return rate.toLocaleString('tr-TR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function formatPct(pct: number): string {
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(2)}%`;
}

export function RateUpdateDialog({
  isOpen,
  onClose,
  onApply,
  quoteCurrency,
  oldMatrix,
  newMatrix,
  items,
  ekMaliyetStampedCount,
  ekMaliyetLegacyCount,
  isApplying = false,
  applyError = null,
}: RateUpdateDialogProps) {
  const diffs = useMemo(() => diffMatrices(oldMatrix, newMatrix), [oldMatrix, newMatrix]);

  // Classify items using the shared predicates so the counts here
  // agree exactly with what `recalcItemPrices` will actually touch.
  // - `isRateSensitiveRow` → ✓ affected (catalog-backed rows)
  // - `isSetParentRow`    → ✓ affected (rolled up from children)
  // - `isManualCommitmentRow` → ⚠ unaffected
  // Structural rows (HEADER/NOTE/SUBTOTAL/GRAND_TOTAL) and
  // price-labeled rows are excluded from both buckets by the
  // predicates themselves.
  const { affectedCatalogCount, affectedSetCount, unaffectedManualCount } = useMemo(() => {
    let affectedCatalog = 0;
    let affectedSet = 0;
    let unaffectedManual = 0;
    for (const item of items) {
      if (isRateSensitiveRow(item)) {
        affectedCatalog++;
        continue;
      }
      if (isSetParentRow(item)) {
        affectedSet++;
        continue;
      }
      if (isManualCommitmentRow(item)) {
        unaffectedManual++;
        continue;
      }
    }
    return {
      affectedCatalogCount: affectedCatalog,
      affectedSetCount: affectedSet,
      unaffectedManualCount: unaffectedManual,
    };
  }, [items]);

  if (!isOpen) return null;

  const hasDiffs = diffs.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />

      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-xl mx-4 max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-primary-200">
          <h2 className="text-lg font-semibold text-primary-900">
            Kurları Güncelle
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md hover:bg-primary-100 text-primary-500 hover:text-primary-700 transition-colors cursor-pointer"
            disabled={isApplying}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* --- Rate diffs --- */}
          <section>
            <h3 className="text-sm font-semibold text-primary-900 mb-2">Kur Değişiklikleri</h3>
            {hasDiffs ? (
              <div className="border border-primary-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-primary-50">
                    <tr className="text-xs font-medium text-primary-500 uppercase tracking-wide">
                      <th className="text-left px-3 py-2">Kur</th>
                      <th className="text-right px-3 py-2">Önceki</th>
                      <th className="w-8" />
                      <th className="text-right px-3 py-2">Yeni</th>
                      <th className="text-right px-3 py-2">Değişim</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diffs.map((d) => (
                      <tr key={d.pair} className="border-t border-primary-100">
                        <td className="px-3 py-2 font-mono text-xs text-primary-700">{d.pair}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-primary-600">{formatRate(d.oldRate)}</td>
                        <td className="px-3 py-2 text-center text-primary-400">
                          <ArrowRight className="w-3.5 h-3.5 inline-block" />
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium text-primary-900">{formatRate(d.newRate)}</td>
                        <td className={`px-3 py-2 text-right tabular-nums font-medium ${d.pctChange > 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {formatPct(d.pctChange)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-primary-500 italic">
                Kaydedilen kurlar ile güncel TCMB kurları arasında anlamlı bir fark bulunmuyor.
              </p>
            )}
          </section>

          {/* --- Affected items --- */}
          <section>
            <h3 className="text-sm font-semibold text-primary-900 mb-2">
              Etkilenecek Kalemler
            </h3>
            <ul className="space-y-1.5 text-sm">
              {affectedCatalogCount > 0 && (
                <li className="flex items-start gap-2 text-green-700">
                  <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>
                    <strong>{affectedCatalogCount}</strong> katalog kalemi otomatik yeniden hesaplanacak
                  </span>
                </li>
              )}
              {affectedSetCount > 0 && (
                <li className="flex items-start gap-2 text-green-700">
                  <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>
                    <strong>{affectedSetCount}</strong> SET toplamı yeniden hesaplanacak
                  </span>
                </li>
              )}
              {ekMaliyetStampedCount !== null && ekMaliyetStampedCount > 0 && (
                <li className="flex items-start gap-2 text-green-700">
                  <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>
                    <strong>{ekMaliyetStampedCount}</strong> ek maliyet satırı (kaynak para birimi üzerinden) yeniden dağıtılacak
                  </span>
                </li>
              )}
              {affectedCatalogCount === 0 && affectedSetCount === 0 && (ekMaliyetStampedCount ?? 0) === 0 && (
                <li className="text-sm text-primary-500 italic">
                  Güncel kurlardan otomatik etkilenecek kalem bulunmuyor.
                </li>
              )}
            </ul>
          </section>

          {/* --- Unaffected items --- */}
          {(unaffectedManualCount > 0 || ekMaliyetLegacyCount > 0) && (
            <section>
              <h3 className="text-sm font-semibold text-primary-900 mb-2">
                Etkilenmeyecek Kalemler
              </h3>
              <ul className="space-y-1.5 text-sm">
                {unaffectedManualCount > 0 && (
                  <li className="flex items-start gap-2 text-amber-700">
                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>
                      <strong>{unaffectedManualCount}</strong> serbest / manuel fiyatlı kalem — tutarları aynen korunacak
                    </span>
                  </li>
                )}
                {ekMaliyetLegacyCount > 0 && (
                  <li className="flex items-start gap-2 text-amber-700">
                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>
                      <strong>{ekMaliyetLegacyCount}</strong> ek maliyet satırı (kaynak para birimi belirtilmemiş) — aynen korunacak. Yeniden dağıtmak için Ek Maliyet modalını tekrar açın.
                    </span>
                  </li>
                )}
              </ul>
            </section>
          )}

          <p className="text-xs text-primary-500 leading-relaxed pt-1 border-t border-primary-100">
            Kurlar güncellendiğinde, {quoteCurrency} dışındaki katalog kalemleri ve kaynak para birimi belirtilmiş ek maliyet satırları yeni kur üzerinden yeniden hesaplanır. Uygulamak için onaylayın, ardından kaydedin.
          </p>

          {/* Inline error surfaced from the apply pipeline — stays
              visible without closing the dialog so the user can
              retry or cancel in context. */}
          {applyError && (
            <div className="mt-1 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
              {applyError}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-primary-200">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={isApplying}>
            İptal
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={onApply}
            disabled={!hasDiffs || isApplying}
            isLoading={isApplying}
          >
            Uygula
          </Button>
        </div>
      </div>
    </div>
  );
}
