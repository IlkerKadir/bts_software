/**
 * Client-safe utility functions for formatting
 */

/**
 * Format file size in human-readable format
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Format currency value using Intl.NumberFormat with tr-TR locale.
 * Result example: "1.234,56 EUR" (number with 2 decimals, space, currency symbol).
 */
export function formatCurrency(
  value: number | string | { toNumber?: () => number } | null | undefined,
  currency: string = 'EUR',
): string {
  let numValue = 0;
  if (typeof value === 'number') {
    numValue = value;
  } else if (typeof value === 'string') {
    numValue = parseFloat(value) || 0;
  } else if (value && typeof (value as any).toNumber === 'function') {
    numValue = (value as any).toNumber();
  }

  return new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numValue) + ' ' + currency;
}

/**
 * Format date in Turkish locale
 */
export function formatDate(
  date: Date | string | null | undefined,
  options?: Intl.DateTimeFormatOptions
): string {
  if (!date) return '-';

  const defaultOptions: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  };

  return new Date(date).toLocaleDateString('tr-TR', options || defaultOptions);
}

/**
 * Format date with time
 */
export function formatDateTime(date: Date | string): string {
  return new Date(date).toLocaleDateString('tr-TR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Format a numeric price with the currency code appended (e.g. "1.234,56 EUR").
 * Uses Turkish locale with exactly 2 decimal places.
 */
export function formatPrice(price: number, currency: string): string {
  return new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(price) + ' ' + currency;
}

/**
 * Format a number using Turkish locale with the specified number of decimal places.
 */
export function formatNumber(value: number, decimals = 2): string {
  return new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/**
 * Safely convert a value (e.g. Prisma Decimal) to a plain number.
 * Returns 0 for null, undefined, NaN, or non-numeric values.
 */
export function toNumber(val: any): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return val;
  const parsed = parseFloat(String(val));
  return isNaN(parsed) ? 0 : parsed;
}
