/**
 * Currency utilities for formatting, parsing, and conversion
 * Uses Turkish locale for number formatting
 */

const CURRENCY_SYMBOLS: Record<string, string> = {
  EUR: '€',
  USD: '$',
  GBP: '£',
  TRY: '₺',
};

/**
 * Get the symbol for a currency code
 * @param currency - ISO 4217 currency code
 * @returns Currency symbol or the code itself if unknown
 */
export function getCurrencySymbol(currency: string): string {
  return CURRENCY_SYMBOLS[currency] || currency;
}

/**
 * Format a number as currency with Turkish locale
 * Uses dot as thousand separator and comma as decimal separator
 * @param amount - Amount to format
 * @param currency - Currency code (EUR, USD, TRY, GBP)
 * @returns Formatted currency string (e.g., "€1.234,56")
 */
export function formatCurrency(amount: number, currency: string): string {
  const symbol = getCurrencySymbol(currency);
  const isNegative = amount < 0;
  const absAmount = Math.abs(amount);

  // Format with Turkish locale (1.234,56)
  const formatted = absAmount.toLocaleString('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return isNegative ? `-${symbol}${formatted}` : `${symbol}${formatted}`;
}

/**
 * Parse a currency input string to a number
 * Handles various formats including Turkish (1.234,56) and US (1,234.56)
 * @param input - String to parse
 * @returns Parsed number or 0 if invalid
 */
export function parseCurrencyInput(input: string): number {
  if (!input) return 0;

  // Remove whitespace and currency symbols
  let cleaned = input.trim().replace(/[€$£₺\s]/g, '');

  if (!cleaned) return 0;

  // Detect format: Turkish (1.234,56) vs US (1,234.56)
  // If there's a comma followed by exactly 2 digits at the end, it's Turkish format
  const turkishMatch = cleaned.match(/^-?[\d.]+,\d{2}$/);
  const usMatch = cleaned.match(/^-?[\d,]+\.\d{2}$/);

  if (turkishMatch) {
    // Turkish format: remove dots (thousand separators), replace comma with dot
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (usMatch) {
    // US format: remove commas (thousand separators)
    cleaned = cleaned.replace(/,/g, '');
  } else {
    // Try to handle ambiguous formats
    // If there's a comma, assume it's a decimal separator (Turkish single number)
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  }

  const result = parseFloat(cleaned);
  return isNaN(result) ? 0 : result;
}

/**
 * Convert an amount using an exchange rate
 * @param amount - Amount in source currency
 * @param exchangeRate - Exchange rate to apply
 * @returns Converted amount
 */
export function convertCurrency(amount: number, exchangeRate: number): number {
  return amount * exchangeRate;
}
