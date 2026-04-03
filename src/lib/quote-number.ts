/**
 * Quote number generation and parsing utilities
 * Format: {INITIALS}{NNNN}-{SYSTEM}.{REVISION}
 * Example: SA0051-YAS.2, CC0004-CCTV
 */

export interface ParsedQuoteNumber {
  initials: string;
  sequence: number;
  systemCode: string;
  revision: number;
}

/** Extract initials from a full name: "Selale Acar" → "SA" */
export function getInitials(fullName: string): string {
  return fullName
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase())
    .join('');
}

/**
 * Generate a quote number
 * @param initials - User initials (e.g. "SA")
 * @param sequence - The sequence number for this user (1-based)
 * @param systemCode - System code (e.g. "YAS"), optional at creation
 * @param revision - Revision number (0 = first version)
 */
export function generateQuoteNumber(
  initials: string,
  sequence: number,
  systemCode?: string,
  revision?: number,
): string {
  const seq = String(sequence).padStart(4, '0');
  let result = `${initials}${seq}`;
  if (systemCode) {
    result += `-${systemCode}`;
    if (revision && revision > 0) {
      result += `.${revision}`;
    }
  }
  return result;
}

/**
 * Parse a quote number to extract its components
 * Supports: SA0051-YAS.2, CC0004-CCTV, SA0051, BTS-2026-0001
 */
export function parseQuoteNumber(quoteNumber: string): ParsedQuoteNumber | null {
  if (!quoteNumber) return null;

  // New format: {INITIALS}{NNNN}-{SYSTEM}.{REV}
  const newMatch = quoteNumber.match(/^([A-ZÇĞİÖŞÜ]+)(\d+)(?:-([A-Z0-9]+)(?:\.(\d+))?)?$/i);
  if (newMatch) {
    return {
      initials: newMatch[1].toUpperCase(),
      sequence: parseInt(newMatch[2], 10),
      systemCode: newMatch[3]?.toUpperCase() || '',
      revision: newMatch[4] ? parseInt(newMatch[4], 10) : 0,
    };
  }

  // Legacy format: BTS-YYYY-NNNN
  const legacyMatch = quoteNumber.match(/^BTS-(\d{4})-(\d+)$/);
  if (legacyMatch) {
    return {
      initials: 'BTS',
      sequence: parseInt(legacyMatch[2], 10),
      systemCode: '',
      revision: 0,
    };
  }

  return null;
}

/**
 * Get the prefix for finding the last sequence for a given user's initials
 */
export function getInitialsPrefix(initials: string): string {
  return initials.toUpperCase();
}

/**
 * Legacy: get BTS-YYYY- prefix for backward compatibility
 */
export function getCurrentYearPrefix(): string {
  const year = new Date().getFullYear();
  return `BTS-${year}-`;
}

/**
 * Get the next sequence number for a user based on their last quote
 */
export function getNextSequence(lastQuoteNumber: string | null): number {
  if (!lastQuoteNumber) return 1;

  const parsed = parseQuoteNumber(lastQuoteNumber);
  if (!parsed) return 1;

  return parsed.sequence + 1;
}
