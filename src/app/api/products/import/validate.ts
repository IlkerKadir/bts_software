/**
 * Validates that a product import filename has a valid Excel extension
 * and does not contain path traversal characters.
 *
 * @param filename - The filename to validate
 * @returns true if the filename is safe and has a valid extension
 */
export function validateImportFilename(filename: string): boolean {
  if (!filename) return false;

  // Reject path traversal attempts
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return false;
  }

  // Must end with .xlsx or .xls (case-insensitive)
  const lower = filename.toLowerCase();
  return lower.endsWith('.xlsx') || lower.endsWith('.xls');
}
