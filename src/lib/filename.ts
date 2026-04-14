/**
 * Filename helpers for quote exports.
 *
 * Used by the PDF and Excel export routes to assemble a
 * consistent, filesystem-safe filename like
 * `LC0002-YAS.1-Merkez_Ofis-Ankara_Otel_Isletmeleri.pdf`.
 *
 * - Turkish letters are transliterated to ASCII so Windows /
 *   macOS downloads don't end up with % escapes in the filename.
 * - Unsafe characters (`/ \ : * ? " < > |`) are stripped.
 * - Spaces become underscores so the filename survives shell use
 *   without quoting.
 * - Empty / whitespace-only parts are dropped from the final join
 *   so a missing project doesn't leave a trailing "--" in the name.
 */

const TURKISH_MAP: Record<string, string> = {
  ç: 'c', Ç: 'C',
  ğ: 'g', Ğ: 'G',
  ı: 'i', İ: 'I',
  ö: 'o', Ö: 'O',
  ş: 's', Ş: 'S',
  ü: 'u', Ü: 'U',
};

/** Transliterate Turkish letters to their ASCII equivalents. */
function transliterate(input: string): string {
  let out = '';
  for (const ch of input) {
    out += TURKISH_MAP[ch] ?? ch;
  }
  return out;
}

/**
 * Sanitize a single filename part: transliterate, drop everything
 * outside the ASCII-safe `[A-Za-z0-9._-]` set, and collapse runs.
 * We enforce strict ASCII so the result is safe to embed in a raw
 * `Content-Disposition: attachment; filename="..."` header (RFC 6266
 * reserves non-ASCII for the `filename*=UTF-8''...` form). Anything
 * that escapes the Turkish transliterator — em-dash, accented Latin,
 * Arabic, Cyrillic — gets stripped here. Returns an empty string for
 * null / whitespace-only input so the caller can drop it from the
 * final join.
 */
export function sanitizeFilenamePart(input: string | null | undefined): string {
  if (input == null) return '';
  return transliterate(input)
    .replace(/\s+/g, '_')              // spaces → underscore
    .replace(/[^A-Za-z0-9._-]+/g, '')  // hard-strip everything else
    .replace(/_+/g, '_')               // collapse runs
    .replace(/^[_.-]+|[_.-]+$/g, '');  // trim leading/trailing punctuation
}

/**
 * Build a quote export filename of the form
 * `{quoteNumber}-{project}-{company}.{ext}`, dropping any part
 * that's empty after sanitization.
 */
export function buildQuoteExportFilename(
  parts: { quoteNumber: string; projectName?: string | null; companyName?: string | null },
  ext: 'pdf' | 'xlsx'
): string {
  const segments = [
    sanitizeFilenamePart(parts.quoteNumber),
    sanitizeFilenamePart(parts.projectName ?? ''),
    sanitizeFilenamePart(parts.companyName ?? ''),
  ].filter((s) => s.length > 0);

  const base = segments.join('-') || 'teklif';
  return `${base}.${ext}`;
}
