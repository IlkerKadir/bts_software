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

/**
 * Escape SQL LIKE/ILIKE wildcards so user input matches literally.
 * Prisma `contains` compiles to `ILIKE '%' || $1 || '%'` with no explicit ESCAPE
 * clause, so Postgres' default backslash escape applies. Without this, a search
 * for "50%" or a code containing "_" would be treated as a wildcard pattern.
 * No-op for ordinary terms (no %, _ or \), so normal searches are unaffected.
 */
export function escapeLike(value: string): string {
  return value.replace(/([\\%_])/g, '\\$1');
}

/**
 * A single Prisma `contains` matcher, supporting dotted paths for relations.
 * 'code'        -> { code: { contains, mode } }
 * 'brand.name'  -> { brand: { name: { contains, mode } } }
 */
function buildFieldContains(path: string, value: string): Record<string, unknown> {
  const leaf: Record<string, unknown> = { contains: escapeLike(value), mode: 'insensitive' };
  return path
    .split('.')
    .reduceRight<Record<string, unknown>>((acc, key) => ({ [key]: acc }), leaf);
}

/**
 * Build a Prisma `AND` clause for a multi-word, Turkish-i-aware "contains" search.
 *
 * Each whitespace-separated token must match (AND across tokens). A token matches
 * if ANY of the given fields contains ANY Turkish-i variant of that token (OR within
 * a token). This makes "DTS 2" match "DTS 2KM 2 Kanal" and "smart 10" match a product
 * whose description contains "10 modül" — cases the old single-substring search missed.
 *
 * A single-token query reduces to one `{ OR: [...] }` group — identical in behaviour to
 * the previous variant-only OR search.
 *
 * @returns An array suitable for Prisma `where.AND`. Empty array for empty/whitespace input.
 */
export function buildTokenizedSearchAND(
  query: string,
  fields: string[],
  maxTokens = 6
): Array<{ OR: Record<string, unknown>[] }> {
  // Single-char tokens are intentionally KEPT: the whole point of this feature is
  // queries like "DTS 2" / "DTS 5", where the numeric token ("2"/"5") is essential.
  const tokens = (query ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, maxTokens);
  if (tokens.length === 0) return [];

  return tokens.map((token) => {
    const variants = expandTurkishVariants(token);
    const OR = variants.flatMap((v) => fields.map((f) => buildFieldContains(f, v)));
    return { OR };
  });
}
