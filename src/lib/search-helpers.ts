/**
 * Turkish-aware case-insensitive search helpers.
 *
 * Postgres `ILIKE` (with default UTF-8 locale) folds Latin `I↔i` but treats
 * the four Turkish "i" characters as 3 distinct equivalence classes:
 *   - Latin {i, I}     — folded by ILIKE
 *   - Dotless {ı}      — its own class
 *   - Dotted {İ}       — its own class (lowercase becomes "i̇" with combining dot, ≠ "i")
 *
 * To match all variants of a Turkish query like "altınay" against any DB form
 * ("Altınay", "altinay", "Altİnay", ...), expand the query into one variant per
 * combination of i-like positions and OR them in the WHERE clause.
 */

const I_LIKE_CHARS = new Set(['i', 'I', 'ı', 'İ']);
const I_CLASSES = ['i', 'ı', 'İ'] as const;

/**
 * Expand a search query into Turkish-i-aware variants.
 *
 * @param query     Raw user query.
 * @param maxVariants  Cap on variant count. Above this, returns [query] only.
 * @returns Deduplicated variants. Empty array for empty/whitespace input.
 */
export function expandTurkishVariants(query: string, maxVariants = 16): string[] {
  if (!query || !query.trim()) return [];

  const chars = Array.from(query);
  const positions: number[] = [];
  for (let i = 0; i < chars.length; i++) {
    if (I_LIKE_CHARS.has(chars[i])) positions.push(i);
  }

  if (positions.length === 0) return [query];

  const variantCount = Math.pow(I_CLASSES.length, positions.length);
  if (variantCount > maxVariants) return [query];

  const seen = new Set<string>();
  const variants: string[] = [];
  for (let v = 0; v < variantCount; v++) {
    let n = v;
    const work = chars.slice();
    for (const pos of positions) {
      work[pos] = I_CLASSES[n % I_CLASSES.length];
      n = Math.floor(n / I_CLASSES.length);
    }
    const variant = work.join('');
    if (!seen.has(variant)) {
      seen.add(variant);
      variants.push(variant);
    }
  }
  return variants;
}
