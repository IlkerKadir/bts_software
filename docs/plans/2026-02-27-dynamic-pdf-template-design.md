# Dynamic PDF Template Design

## Overview

Convert the static test HTML template (`pdf/test-template.html`) into a dynamic `quote-template.ts` that generates PDFs from quote editor data. Includes service section rendering (Mode A: with montaj, Mode B: without montaj), new fields, and template infrastructure.

## Schema Changes

### 1. Quote model — add `description`
```prisma
Quote {
  ...existing...
  description  String?  // Second header line (e.g., "TYCO ZETTLER ADRESLİ YANGIN ALGILAMA SİSTEMİ - BTS ÇÖZÜM")
}
```

### 2. QuoteCommercialTerm — add `highlight`
```prisma
QuoteCommercialTerm {
  ...existing...
  highlight  Boolean  @default(false)  // Yellow highlight in PDF
}
```

### 3. CommercialTermTemplate — add `highlight`
```prisma
CommercialTermTemplate {
  ...existing...
  highlight  Boolean  @default(false)
}
```

### 4. New categories (data only, no schema change)
- `DAHIL_OLMAYAN` — "Dahil Olmayan Hizmetler" templates (per-quote editable, like commercial terms)
- `MUH_ACIKLAMA` — Müh.devreye alma description text (global from settings, shown on PDF)

## PDF Template — Service Section Logic

### Detection
```
hasMontajItems = items with serviceMeta.montajParentId
hasMuhService = SERVICE items with serviceMeta.type === 'MUHENDISLIK'
```

### Mode A: With Montaj
After SİSTEM MALZEME TOPLAMI:
1. Header: "Ekipman Montaj Fiyatları" (green, auto-generated)
2. Montaj sub-items — shown individually, NO POZ number, with pricing
3. NOTE rows within montaj section
4. Müh.devreye alma — "1 Set" with total (if exists)
5. Nakliye and other service-adjacent items
6. **MONTAJ, İŞÇİLİK ve DEVREYE ALMA TOPLAMI (currency)** — total row

### Mode B: Without Montaj
After SİSTEM MALZEME TOPLAMI:
1. Müh.devreye alma — "1 Set" with total
2. Description paragraph — from MUH_ACIKLAMA settings template
3. Bullet points — from same template
4. "Dahil Olmayan Hizmetler:" — from DAHIL_OLMAYAN per-quote terms
5. No separate service total row

## PDF Template — HTML Structure

### Header (thead, repeats every page)
1. Header image row — `border: 1.2pt solid black`
2. Info box — `colspan="3"` (company) + `colspan="2"` (PROFORMA FATURA aligned with BİRİM FİYAT + TOPLAM FİYAT)
   - Left: company name, address, project name, **description** (new)
   - Right: PROFORMA FATURA, Tarih, Ref.No, Teklif No
3. Column headers

### Body (tbody, single continuous table)
1. Product items (HEADER, PRODUCT, CUSTOM, NOTE, OPSİYONEL, SUBTOTAL)
2. SİSTEM MALZEME TOPLAMI (thick borders)
3. Service section (Mode A or B)
4. Service total (Mode A only)
5. TİCARİ ŞARTLAR (inside main table)
6. NOTLAR with highlight support (inside main table)

### CSS Changes from Current Template
| Property | Current | New |
|---|---|---|
| Header borders | 2pt solid black | 1.2pt solid black |
| Item borders | none | 0.25pt solid black |
| Column widths | 9/57/10/12/12% | 8.7/57.2/9.5/11.5/13.1% |
| Terms font | 7pt | 7.2pt |
| Green color | #C5DFB4 | #C6E0B4 |
| Cell padding | 2pt 2pt | 3pt 4pt |
| Bottom margin | 10mm | 15mm |
| Price cells | - | white-space: nowrap |
| Info box inner | has borders | border: none |

## QuoteDataForPdf Interface Additions
```typescript
export interface QuoteDataForPdf {
  ...existing fields...
  description?: string | null;        // Second header line
  montajItems: QuoteItemForPdf[];     // Montaj sub-items to show in PDF
  muhDescription: string[];           // Müh description lines from settings
  dahilOlmayan: string;              // Per-quote dahil olmayan text
}
```

Notes interface addition:
```typescript
notes: {
  text: string;
  sortOrder: number;
  highlight: boolean;  // New: yellow background
}[];
```

## API & Editor Changes

### PDF Export Route (`/api/quotes/[id]/export/pdf`)
- Include montaj sub-items (serviceMeta.montajParentId) in query
- Fetch MUH_ACIKLAMA from CommercialTermTemplate (global settings)
- Fetch DAHIL_OLMAYAN from QuoteCommercialTerm (per-quote)
- Pass quote.description and highlight flags

### Quote Editor
- Add `description` to HeaderFields interface + UI
- DAHIL_OLMAYAN editable per-quote (same UX as commercial terms)
- NOTLAR entries get highlight toggle

### Quote API Routes
- POST/PUT accept `description` field

### Settings
- DAHIL_OLMAYAN default templates in commercial terms settings
- MUH_ACIKLAMA templates in commercial terms settings

### Migration
- ALTER TABLE Quote ADD description TEXT
- ALTER TABLE QuoteCommercialTerm ADD highlight BOOLEAN DEFAULT false
- ALTER TABLE CommercialTermTemplate ADD highlight BOOLEAN DEFAULT false
- Seed default MUH_ACIKLAMA and DAHIL_OLMAYAN templates

## Testing

### Unit Tests
1. `quote-template.test.ts` — Mode A, Mode B, description field, highlight, OPSİYONEL, nowrap
2. `quote-calculations.test.ts` — Service total calculation with montaj + müh + nakliye

### API Tests
3. `pdf/route.test.ts` — Montaj items included, settings fetched, description passed

### Visual
4. `pdf/test-template.html` as regression reference
5. Puppeteer PDF generation sanity check
