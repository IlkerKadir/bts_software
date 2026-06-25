/**
 * Next flat revision number for an STF, mirroring the quote revision logic.
 * Root = the source number with trailing ".N" groups stripped. Next = the max
 * direct ".N" sibling among existingNumbers + 1. Always one level deep
 * (never ".1.1").
 */
export function nextStfRevisionNumber(sourceNumber: string, existingNumbers: string[]): string {
  const rootMatch = sourceNumber.match(/^(.+?)(?:\.\d+)*$/);
  const root = rootMatch ? rootMatch[1] : sourceNumber;
  const prefix = `${root}.`;
  const baseLen = prefix.length;
  const maxRev = existingNumbers.reduce((m, n) => {
    if (!n.startsWith(prefix)) return m;
    const suffix = n.slice(baseLen);
    const rev = /^\d+$/.test(suffix) ? parseInt(suffix, 10) : 0; // direct children only
    return Math.max(m, rev);
  }, 0);
  return `${root}.${maxRev + 1}`;
}
