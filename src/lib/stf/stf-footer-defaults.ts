export interface TermLike {
  category: string;
  value: string;
}

export interface FooterDefaults {
  manufacturers: string | null;
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
 * uretici_firmalar values are stored as a JSON brand→systems map
 * (e.g. {"TYCO ZETTLER":["Yangın"]}). Render each as "BRAND - SYSTEM1, SYSTEM2"
 * (or just BRAND when no systems), one per line — mirrors the quote PDF/Excel
 * rendering (quote-template.ts `uretici_firmalar` branch). Falls back to the
 * raw value when it isn't valid JSON.
 */
function manufacturersFromTerms(terms: TermLike[]): string | null {
  const entries = terms.filter((t) => t.category === 'uretici_firmalar');
  if (!entries.length) return null;
  const lines: string[] = [];
  for (const entry of entries) {
    try {
      const parsed = JSON.parse(entry.value) as Record<string, string[]>;
      for (const [brand, systems] of Object.entries(parsed)) {
        lines.push(Array.isArray(systems) && systems.length ? `${brand} - ${systems.join(', ')}` : brand);
      }
    } catch {
      lines.push(entry.value);
    }
  }
  return lines.length ? lines.join('\n') : null;
}

/**
 * Derive STF footer defaults from a quote's commercial terms. Category keys
 * are the app's actual stored values (Turkish): `uretici_firmalar`, `odeme`,
 * `garanti`, `kdv`, `teslim_yeri`. deliveryPlace falls back to `delivery`.
 */
export function footerDefaultsFromTerms(terms: TermLike[]): FooterDefaults {
  return {
    manufacturers: manufacturersFromTerms(terms),
    paymentTerms: join(terms, 'odeme'),
    deliveryPlace: join(terms, 'teslim_yeri') ?? join(terms, 'delivery'),
    warranty: join(terms, 'garanti'),
    vatNote: join(terms, 'kdv'),
  };
}
