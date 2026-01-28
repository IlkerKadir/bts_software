/**
 * Quote number generation and parsing utilities
 * Format: BTS-YYYY-NNNN
 * Example: BTS-2025-0042
 */

const QUOTE_PREFIX = 'BTS';

export interface ParsedQuoteNumber {
  prefix: string;
  year: number;
  sequence: number;
}

/**
 * Generate a quote number for the current year
 * @param sequence - The sequence number for this year (1-based)
 * @returns Quote number in format BTS-YYYY-NNNN
 */
export function generateQuoteNumber(sequence: number): string {
  const year = new Date().getFullYear();
  const seq = String(sequence).padStart(4, '0');

  return `${QUOTE_PREFIX}-${year}-${seq}`;
}

/**
 * Generate the prefix for the current year
 * Used to query for existing quotes in the same year
 */
export function getCurrentYearPrefix(): string {
  const year = new Date().getFullYear();
  return `${QUOTE_PREFIX}-${year}-`;
}

/**
 * Parse a quote number to extract its components
 * @param quoteNumber - Quote number to parse
 * @returns Parsed components or null if invalid format
 */
export function parseQuoteNumber(quoteNumber: string): ParsedQuoteNumber | null {
  if (!quoteNumber) return null;

  // Match format: BTS-YYYY-NNNN (where NNNN can be 4+ digits)
  const match = quoteNumber.match(/^(BTS)-(\d{4})-(\d+)$/);

  if (!match) return null;

  const [, prefix, yearStr, seqStr] = match;

  return {
    prefix,
    year: parseInt(yearStr, 10),
    sequence: parseInt(seqStr, 10),
  };
}

/**
 * Get the next sequence number for the current year
 * This is used by the API to determine the next quote number
 * @param lastQuoteNumber - The last quote number created this year, or null
 * @returns The next sequence number (1 if no quotes this year)
 */
export function getNextSequence(lastQuoteNumber: string | null): number {
  if (!lastQuoteNumber) return 1;

  const parsed = parseQuoteNumber(lastQuoteNumber);
  if (!parsed) return 1;

  const currentYear = new Date().getFullYear();

  // If last quote is from a different year, start over
  if (parsed.year !== currentYear) {
    return 1;
  }

  return parsed.sequence + 1;
}
