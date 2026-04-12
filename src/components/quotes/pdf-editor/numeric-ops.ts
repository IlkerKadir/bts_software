/**
 * Numerical helpers for the PDF editor. These operate on the already-
 * rendered currency strings in table cells — there's no formula engine
 * and no recompute-on-edit, because Puppeteer runs with JS disabled.
 * "Sum these rows" means "read the numbers out of the DOM now, total
 * them, write the static result back."
 *
 * Currency format matches `formatCurrency` in the PDF template:
 *   "1.234,56 €" — Turkish locale, dots for thousands, comma for
 *   decimal, currency symbol after the number.
 */

const CURRENCY_SYMBOLS = ['€', '$', '£', '₺'];

/**
 * Parse a Turkish-formatted currency string like "1.234,56 €" to a
 * number. Returns 0 if nothing parseable is found.
 */
export function parseTurkishCurrency(text: string): number {
  if (!text) return 0;
  // Strip everything that isn't a digit, dot, comma, or minus sign
  const cleaned = text.replace(/[^\d,.-]/g, '');
  if (!cleaned) return 0;
  // Turkish locale: dots are thousand separators (drop them), comma is
  // the decimal separator (swap to dot so parseFloat reads it)
  const normalized = cleaned.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(normalized);
  return isNaN(n) ? 0 : n;
}

/**
 * Extract the currency symbol from a formatted string, defaulting to
 * "€" if nothing recognizable is present.
 */
export function detectCurrencySymbol(text: string): string {
  for (const sym of CURRENCY_SYMBOLS) {
    if (text.includes(sym)) return sym;
  }
  return '€';
}

/**
 * Format a number as Turkish currency.
 */
export function formatTurkishCurrency(amount: number, symbol: string): string {
  const formatted = amount.toLocaleString('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${formatted} ${symbol}`;
}

/**
 * Sum the last-column numerical values of all rows above `targetRow`,
 * stopping at another subtotal card or the top of tbody. Returns the
 * total plus the currency symbol encountered.
 *
 * A row is considered a "subtotal card" if any of its `<td>` has the
 * `sys-total-label` or `sys-total-val` class — those are the markers
 * the template uses for the grand-total and the `insertSubtotalRow`
 * helper uses for user-inserted subtotals.
 */
export function sumPricedRowsAbove(targetRow: HTMLTableRowElement): {
  total: number;
  symbol: string;
} {
  let total = 0;
  let symbol = '€';
  let cur: Element | null = targetRow.previousElementSibling;

  while (cur) {
    // Stop at another subtotal card
    if (cur.querySelector?.('.sys-total-label, .sys-total-val')) break;
    // Skip spacer rows (no text content at all)
    const text = cur.textContent?.trim() ?? '';
    if (!text) {
      cur = cur.previousElementSibling;
      continue;
    }

    const cells = cur.querySelectorAll('td');
    const lastCell = cells[cells.length - 1];
    if (lastCell) {
      const cellText = lastCell.textContent || '';
      const n = parseTurkishCurrency(cellText);
      if (n !== 0) {
        total += n;
        const detected = detectCurrencySymbol(cellText);
        if (detected) symbol = detected;
      }
    }

    cur = cur.previousElementSibling;
  }

  return { total, symbol };
}
