export interface TermLike {
  category: string;
  value: string;
}

export interface FooterDefaults {
  paymentTerms: string | null;
  deliveryPlace: string | null;
  warranty: string | null;
  vatNote: string | null;
}

function join(terms: TermLike[], category: string): string | null {
  const vals = terms.filter((t) => t.category === category).map((t) => t.value);
  return vals.length ? vals.join('\n') : null;
}

/**
 * Derive STF footer defaults from a quote's commercial terms.
 * deliveryPlace prefers the `teslim_yeri` category, falling back to `delivery`.
 */
export function footerDefaultsFromTerms(terms: TermLike[]): FooterDefaults {
  return {
    paymentTerms: join(terms, 'payment'),
    deliveryPlace: join(terms, 'teslim_yeri') ?? join(terms, 'delivery'),
    warranty: join(terms, 'warranty'),
    vatNote: join(terms, 'vat'),
  };
}
