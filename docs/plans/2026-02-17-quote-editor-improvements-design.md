# Quote Editor Improvements Design

**Date:** 2026-02-17
**Status:** Approved
**Scope:** Subtotal system, unified table, section templates, montaj costs, PDF preview, unit selection

---

## Background

Client feedback from Kadir requires significant improvements to the quote preparation screen to match real-world workflows used in BTS Yangin's fire safety equipment quoting process. The current system has products in a main table and services in a separate section, with no inline subtotals, no PDF preview, and limited unit selection.

## Requirements Summary

1. **Ara Toplam (Subtotal)** — Section-based subtotal rows insertable at any point. Each sums items between itself and the previous subtotal (or start of quote). Genel Toplam sums all section subtotals.
2. **Single unified table** — All item types in one table (products, services, installation, headers, notes, subtotals).
3. **Section templates** — 5 pre-defined templates that auto-populate header + sub-rows, fully editable afterward.
4. **Montaj diğer maliyet** — Overhead calculated in TL, converted to quote currency, distributed per-birim across selected montaj items.
5. **PDF preview** — Full Puppeteer-rendered PDF in a modal.
6. **Editable units** — Per quote item: Ad., m., Set, Kişi/Gün.
7. **SET sub-rows** — Internal cost tracking only; customer sees 1 SET line.

---

## Architecture: Approach A — Extend Current Item Model

Extend the flat `QuoteItem` list with a new `SUBTOTAL` item type and a `parentItemId` field for sub-rows. This preserves the free-form nature of the quote while supporting all 5 section patterns.

---

## 1. Data Model Changes

### Prisma Schema

**QuoteItemType enum** — add `SUBTOTAL`:

```
PRODUCT | HEADER | NOTE | CUSTOM | SERVICE | SUBTOTAL
```

**QuoteItem model** — add 2 fields:

```prisma
parentItemId  String?     // Links sub-rows to their SET parent item
parentItem    QuoteItem?  @relation("ItemSubRows", fields: [parentItemId], references: [id], onDelete: Cascade)
subRows       QuoteItem[] @relation("ItemSubRows")
```

### Item Type Mapping

| Concept | itemType | parentItemId | Visible in PDF |
|---------|----------|--------------|----------------|
| Regular product | PRODUCT | null | Yes |
| Section header | HEADER | null | Yes |
| Note | NOTE | null | Yes |
| Custom item | CUSTOM | null | Yes |
| Subtotal row | SUBTOTAL | null | Yes (computed sum) |
| SET parent line | SERVICE | null | Yes (1 line with SET price) |
| SET sub-row (internal) | SERVICE | parent.id | No |
| Installation item | CUSTOM | null | Yes (TAŞERON brand) |

### Key Behaviors

- Items with `parentItemId != null` are hidden from PDF/Excel export and excluded from quote totals (the parent carries the price).
- `SUBTOTAL` rows store no price data — computed dynamically at render time.
- `serviceMeta` JSON field on SERVICE items stores cost breakdowns.
- For montaj diğer maliyet, the distribution metadata is stored in `serviceMeta` on affected items.

---

## 2. Subtotal System

### Behavior

- New "Ara Toplam Ekle" button in the action bar.
- Inserts a SUBTOTAL row at the current position (end of items, reorderable via drag).
- Dynamically computes: sum of all priced items (PRODUCT, CUSTOM, SERVICE with `parentItemId == null`) between this SUBTOTAL and the previous SUBTOTAL (or start of quote).
- Stores `totalPrice = 0` in DB — always computed at render time.
- Renders as a bold full-width row: `"Ara Toplam: {sum} {currency}"`.

### Footer Logic

- If SUBTOTAL rows exist: Genel Toplam = sum of all section subtotals.
- If no SUBTOTAL rows: Genel Toplam = sum of all priced items (backward compatible).

### Rendering Example

```
HEADER: "Sistem Malzeme"
PRODUCT: Dedektör × 100 = 2,690 EUR
PRODUCT: Panel × 1 = 894 EUR
SUBTOTAL: ─── Ara Toplam: 3,584.00 EUR ───
HEADER: "Montaj ve İşçilik"
CUSTOM: Dedektör Montajı × 640 = 9,216 EUR
SUBTOTAL: ─── Ara Toplam: 9,216.00 EUR ───
                    GENEL TOPLAM: 12,800.00 EUR
```

---

## 3. Unified Table

### Current → New

- **Remove** `ServiceCostSection` as a separate component.
- **All items** (including SERVICE) go into `QuoteItemsTable`.
- `QuoteEditor` no longer splits items into `nonServiceItems` / `serviceItems`.
- New "Hizmet Ekle" button in action bar opens ServiceCostCalculator as a modal.
- SERVICE rows render like PRODUCT rows (wrench icon on Poz No) with non-editable price fields.
- Sub-rows (`parentItemId != null`) render indented with "↳" prefix, slightly dimmed, collapsible.

### SET Parent + Sub-rows in Editor

```
SERVICE: Montaj Süp., Müh., Test ve Devreye Alma | 1 Set | 7,810 EUR  [▼]
  ↳ SERVICE (sub): Süpervizyon Hizmeti (ŞD 750km) 1 Kişi | 7 Kişi/Gün  [internal]
  ↳ SERVICE (sub): Test ve Devreye Alma (ŞD 750km) 2 Kişi | 3 Kişi/Gün  [internal]
```

Customer PDF: only `Montaj Süp., Müh., Test ve Devreye Alma | 1 Set | 7,810 EUR`

---

## 4. Section Templates (5 Types)

New "Bölüm Ekle" dropdown button in the action bar:

| Template | Auto-creates |
|----------|-------------|
| **Müh. Test ve Devreye Alma (SET)** | HEADER + 1 SERVICE parent (unit=Set) + 2 SERVICE sub-rows (Süpervizyon + Test/Devreye Alma) with cost calculator + auto-note |
| **Müh. Test ve Devreye Alma (Kişi/Gün)** | HEADER + N SERVICE items (unit=Kişi/Gün), individually priced, no parent-child |
| **Montaj ve İşçilik (per-item)** | HEADER + empty state for CUSTOM items (TAŞERON installation lines) |
| **Montaj ve İşçilik (temini ve montajı)** | HEADER + empty state for combined supply+install CUSTOM items |
| **Grafik İzleme Yazılım Çalışmaları** | HEADER + 1 SERVICE parent (unit=Set) + 1 SERVICE sub-row (Test/Devreye Alma Ofis) + auto-note |

All items fully editable after creation. Templates are convenience shortcuts.

---

## 5. Montaj Diğer Maliyet Distribution

### Flow

1. User clicks "Diğer Maliyet" button (visible when installation items exist).
2. Modal opens — user enters: accommodation cost (TL), meals (TL), duration, other costs.
3. System computes total overhead in TL.
4. Converts to quote currency using exchange rate + koruma yüzdesi.
5. User selects which items to distribute across (checkboxes).
6. System sums total birim (all quantities regardless of unit type) across selected items.
7. Per-birim overhead = total overhead (EUR) / total birim.
8. Adds per-birim overhead to each selected item's `costPrice`.
9. Stores distribution metadata in `serviceMeta` for recalculation.

### Formula

```
totalOverheadEUR = totalOverheadTRY / (exchangeRate × (1 + korumaYüzdesi/100))
perBirimOverhead = totalOverheadEUR / sumOfAllSelectedQuantities
item.costPrice = item.baseLaborCost + perBirimOverhead
```

---

## 6. Unit Selection

### Options

| Display | Stored value | Usage |
|---------|-------------|-------|
| Ad. | Adet | Piece count |
| m. | Metre | Cable/material lengths |
| Set | Set | Package pricing |
| Kişi/Gün | Kişi/Gün | Per person per day |

### Behavior

- Unit dropdown added to each quote item row (near quantity).
- When product added from catalog, defaults to product's unit.
- User can change freely per item.
- Unit abbreviation shown next to quantity in editor and all exports.

---

## 7. PDF Preview

- New "Ön İzleme" button in `QuoteEditorHeader`.
- Opens a full-screen modal with iframe.
- Calls `/api/quotes/{id}/export/pdf?preview=true`.
- Returns PDF as blob URL displayed in iframe.
- User can close or download.

---

## 8. Export Changes

### PDF Export

- Filter out items where `parentItemId != null` (sub-rows hidden).
- Render SUBTOTAL rows as bold separator lines with computed sum.
- Show unit abbreviations in quantity column.
- SERVICE items with `parentItemId == null` render like normal items.

### Excel Export

- Same customer-facing filtering as PDF.
- Optional second "Internal" sheet with all items including sub-rows (for canViewCosts users).

---

## 9. Summary of Schema Changes

```prisma
enum QuoteItemType {
  PRODUCT
  HEADER
  NOTE
  CUSTOM
  SERVICE
  SUBTOTAL  // NEW
}

model QuoteItem {
  // ... existing fields ...
  parentItemId  String?     // NEW - links sub-rows to SET parent
  parentItem    QuoteItem?  @relation("ItemSubRows", fields: [parentItemId], references: [id], onDelete: Cascade)
  subRows       QuoteItem[] @relation("ItemSubRows")
}
```

## 10. Files Affected (Estimated)

### Schema & API
- `prisma/schema.prisma` — new enum value + parentItemId field
- `src/lib/validations/quote.ts` — add SUBTOTAL to enum, parentItemId to schema
- `src/app/api/quotes/[id]/items/route.ts` — handle SUBTOTAL creation, sub-row linking
- `src/app/api/quotes/[id]/export/pdf/route.ts` — filter sub-rows, render subtotals
- `src/app/api/quotes/[id]/export/excel/route.ts` — same

### Frontend Components
- `src/components/quotes/QuoteItemsTable.tsx` — unified table, subtotal computation, sub-row rendering
- `src/components/quotes/QuoteItemRow.tsx` — SUBTOTAL row type, sub-row indentation, unit dropdown
- `src/components/quotes/QuoteEditorHeader.tsx` — PDF preview button
- `src/app/(dashboard)/quotes/[id]/edit/QuoteEditor.tsx` — remove service split, add section templates, add diğer maliyet

### New Components
- `src/components/quotes/SectionTemplateDropdown.tsx` — template picker
- `src/components/quotes/DigerMaliyetModal.tsx` — overhead distribution calculator
- `src/components/quotes/PdfPreviewModal.tsx` — PDF preview iframe modal

### Removed
- `src/components/quotes/ServiceCostSection.tsx` — functionality merged into main table
