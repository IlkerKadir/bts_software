/**
 * BTS quote rounding rules (single source of truth for numeric
 * consistency across the app).
 *
 * These helpers exist so that the row's displayed unit price, the
 * row's computed total, the section subtotal, the quote-level
 * grand total, and every export (PDF, Excel, quote view) all
 * produce the same numbers from the same inputs. They live here in
 * a module with no React / no Prisma imports so they can be pulled
 * into client components, server routes, and pure calculation
 * libraries without cycles.
 */

/**
 * Epsilon used to absorb floating-point representation error before
 * the ceiling. Without this, `50 * 1.1 = 55.00000000000001` in JS
 * would ceiling-round to 55.1 instead of staying at 55. 1e-9 is far
 * below any meaningful currency magnitude but large enough to
 * swallow the noise of ordinary `×` / `÷` operations.
 */
const FP_EPSILON = 1e-9;

function ceilWithEpsilon(value: number, multiplier: number): number {
  return Math.ceil(value * multiplier - FP_EPSILON) / multiplier;
}

/**
 * Tiered ceiling-round the unit price per BTS's invoicing rule:
 *
 *   ≥ 100      → Math.ceil to integer            (120.15 → 121)
 *   10 – 99.99 → Math.ceil to 1 decimal          (15.22  → 15.3)
 *   < 10       → Math.ceil to 2 decimals         (1.0676 → 1.07)
 *
 * Notes:
 * - Always rounds **up** (yukarı yuvarla), never half-up. `1.0601`
 *   rounds to `1.07`, not `1.06`. `100.001` rounds to `101`, not
 *   `100`.
 * - The boundary test uses the *input* value, so exactly `100.00`
 *   lands in the integer bucket and stays `100`.
 * - An `FP_EPSILON` is subtracted before each ceiling so floating-
 *   point artifacts (e.g. `50 * 1.1 = 55.00000000000001`) don't
 *   falsely trigger a round-up.
 * - Non-finite / zero / negative inputs return `0` — the editor
 *   relies on this for fresh rows before the user has entered a
 *   price.
 */
export function roundUnitPrice(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (value >= 100) return Math.ceil(value - FP_EPSILON);
  if (value >= 10) return ceilWithEpsilon(value, 10);
  return ceilWithEpsilon(value, 100);
}

/**
 * Standard 2-decimal currency round, used for row totals /
 * subtotals / grand totals. Rounds half-up (banker's rounding is
 * explicitly NOT used — BTS quotes want the intuitive "round the 5
 * up" behavior).
 */
export function round2(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

/**
 * Compute a row's totalPrice from its quantity, unit price, and
 * item-level discount. The single formula the whole app must use.
 *
 * `unitPrice` should already be rounded via `roundUnitPrice` before
 * this is called — that's the invariant that keeps all displays
 * agreeing.
 */
export function computeRowTotal(params: {
  quantity: number;
  unitPrice: number;
  discountPct: number;
}): number {
  const qty = Number(params.quantity) || 0;
  const up = Number(params.unitPrice) || 0;
  const disc = Number(params.discountPct) || 0;
  return round2(qty * up * (1 - disc / 100));
}
