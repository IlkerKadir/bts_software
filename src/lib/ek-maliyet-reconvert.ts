/**
 * Ek maliyet redistribution helper.
 *
 * When the user applies a new TCMB rate matrix via the exchange-rate
 * modal or the "Kurları Güncelle" dialog, every ek maliyet cost line
 * stamped with a `sourceCurrency` needs to be reconverted into the
 * quote currency at the new rate. The sum of the reconverted entries
 * becomes the new per-item distribution total.
 *
 * Lives in a dedicated module so both the editor's unified apply
 * handler and future server-side recalc flows can import the same
 * pure function — no React, no Prisma, no network.
 */

export interface EkMaliyetEntryLike {
  amount: number;
  /** Null on legacy rows written before Phase 3 — interpreted as TRY
   *  to match the old modal's hardcoded assumption. */
  sourceCurrency: string | null;
}

type RateMatrix = Record<string, Record<string, number>>;

/**
 * Sum every ek maliyet entry, converting each via
 * `rateMatrix[sourceCurrency][quoteCurrency]`. Returns the total in
 * the quote currency, ready to be handed to `handleEkMaliyetApply`.
 *
 * Conversion rules:
 * - Empty entry list → 0.
 * - Entry with `sourceCurrency === quoteCurrency` → contribute `amount`
 *   directly, no rate lookup.
 * - Entry with null `sourceCurrency` → treat as 'TRY' (legacy rule).
 * - Entry whose pair is missing from the matrix → skipped, logged as
 *   a warning. Callers should surface this in the preview dialog so
 *   the user knows some lines couldn't be redistributed.
 */
export function reconvertEkMaliyetTotal(
  entries: EkMaliyetEntryLike[],
  rateMatrix: RateMatrix,
  quoteCurrency: string
): number {
  let total = 0;
  for (const entry of entries) {
    const source = entry.sourceCurrency ?? 'TRY';
    const amount = Number(entry.amount) || 0;
    if (amount === 0) continue;

    if (source === quoteCurrency) {
      total += amount;
      continue;
    }

    const rate = rateMatrix[source]?.[quoteCurrency];
    if (rate == null || rate <= 0) {
      console.warn(
        `[reconvertEkMaliyetTotal] missing rate for ${source}→${quoteCurrency} — skipping entry`,
        entry
      );
      continue;
    }

    total += amount * rate;
  }
  return Math.round(total * 100) / 100;
}
