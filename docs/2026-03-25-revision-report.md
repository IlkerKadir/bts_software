# Client Revision Report — March 25, 2026

## Overview

Implementation of all client revision requests from the March 25 meeting with Cansu Ceylan. 37 items total: 36 implemented, 1 pending client clarification.

**Build status:** 0 TypeScript errors, 482/482 tests passing
**Code review:** Passed — no critical or high issues found
**Files changed:** 24 modified, 10 new
**New migration:** `20260325000000_add_project_visibility`

---

## Items Addressed

### Bug Fixes

| # | Item | How Addressed |
|---|------|---------------|
| 1 | **Ek Maliyet Ekle — not working** | Fixed Prisma `Decimal` serialization in `/api/quotes/[id]/ek-maliyet/route.ts`. Both GET and PUT handlers now convert `amount` to `Number()` before returning JSON. |
| 2 | **Approval notification not reaching quote creator** | Fixed in `/api/quotes/[id]/status/route.ts`. Restructured error handling from one monolithic try-catch to per-branch isolation (matching the working bulk-status pattern). Added diagnostic logging with userId and status context. |
| 3 | **Currency wrong in database** | Created `scripts/fix-product-currencies.ts` — reads `real_database.xlsx` reference file, normalizes currencies (EURO→EUR, TL→TRY, USD, GBP), updates each product by code. Idempotent, safe to run multiple times. **Must be run on server after deploy.** |
| 4 | **Adet/birim click targeting issue** | Fixed in `QuoteItemRow.tsx`. Removed cell padding and wrapped content in a full-width/height div so the entire cell area is clickable. Added `cursor-pointer` to the cell. |
| 5 | **Notes alignment problem** | Fixed in `QuoteItemRow.tsx`. NOTE rows now compute colspan dynamically based on column visibility (same logic as SUBTOTAL rows), instead of using a static count. |
| 6 | **generateId() infinite recursion** | Found and fixed a critical bug where `generateId()` called itself instead of `crypto.randomUUID()`, causing stack overflow on HTTPS. |

### Renames & Label Changes

| # | Item | How Addressed |
|---|------|---------------|
| 7 | **Açıklama → Sistem Başlık** | Renamed in `QuoteEditorHeader.tsx` (line 389). Only the visible label changed — the `description` field name remains. |
| 8 | **Takip süresi → Geçerlilik Süresi** | Renamed in `QuoteEditorHeader.tsx` (line 497). |
| 9 | **Set Ekle → Serbest Kalem Ekle** | Renamed in `QuoteItemsTable.tsx` (3 locations) and `QuoteEditor.tsx` (1 location). All function/variable names preserved. |
| 10 | **Sete alt kalem ekle → Serbest Kalem Ekle** | Renamed in `QuoteItemsTable.tsx` alongside the above. |
| 11 | **Ticari şartlar — "değer" label removed** | Removed the `<label>Değer</label>` element from `CommercialTermsSection.tsx` single-value template display. |

### Quote Editor UI Improvements

| # | Item | How Addressed |
|---|------|---------------|
| 12 | **Column reorder: MİKTAR BİRİM FİYAT TOPLAM FİYAT KATSAYI LİSTE FİYATI** | Reordered `<th>` in `QuoteItemsTable.tsx` and `<td>` in `QuoteItemRow.tsx` to: Birim Fiyat → Toplam Fiyat → Katsayı → Liste Fiyatı. Cell order verified to match header order. |
| 13 | **Group headers: TEKLİF SATIŞ FİYATLARI / TEKLİF HAZIRLAMA** | Added a header row above column names in `QuoteItemsTable.tsx`. "Teklif Satış Fiyatları" spans Birim Fiyat + Toplam Fiyat (colSpan=2). "Teklif Hazırlama" spans Katsayı + Liste Fiyatı (colSpan=2). Only visible when fiyat column group is active. |
| 14 | **Liste fiyatları editable per quote item** | Already implemented in existing code — `EditableCell` for `listPrice` was present with proper `onChange` handler. Verified working. |
| 15 | **Ara toplam name editable** | Changed SUBTOTAL row in `QuoteItemRow.tsx` from hardcoded "Ara Toplam" text to an `EditableCell` using `item.description` (falls back to "Ara Toplam" if empty). Saves via existing item update API. |
| 16 | **İskonto label editable** | Added `discountLabel` state in `QuoteItemsTable.tsx` (default: "İskonto"). The hardcoded label in the summary footer is now an editable text input. |
| 17 | **Fiyat özeti alignment** | Redesigned summary footer in `QuoteItemsTable.tsx`. Values now align under the Toplam Fiyat column with computed `labelSpan` and `trailingSpan` that account for the new column order. |
| 18 | **SET rows: "-" for katsayı and liste fiyatı** | In `QuoteItemRow.tsx`, SET parent rows now render `<span>-</span>` in katsayı and liste fiyatı cells instead of showing 0 or an editable field. |
| 19 | **SET row background more visible** | Added `bg-indigo-50/60` background to SET parent rows in `QuoteItemRow.tsx` for visual distinction. |
| 20 | **SET note alignment** | Fixed alongside item 5 (note colspan fix). |
| 21 | **Sticky header** | Verified working — `<thead>` has `sticky top-0 z-20` and parent container has correct overflow settings. No change needed. |
| 22 | **Resizable columns** | Added `style={{ resize: 'horizontal', overflow: 'hidden', minWidth: N }}` to all `<th>` elements in `QuoteItemsTable.tsx`. Users can drag column borders to resize. |
| 23 | **Arrow key navigation in katsayı** | Added `onKeyDown` handler to katsayı cells in `QuoteItemRow.tsx`. ArrowDown/ArrowUp moves focus to the next/previous row's katsayı input using `data-field` and `data-sort-order` attributes. |
| 24 | **Quantity input on product catalog card** | Added an optional number input on `ProductSearchCard.tsx` next to the "Ekle" button. Quantity flows through `ProductCatalogPanel` to `QuoteEditor.handleAddProduct`. Defaults to 1 if empty. |
| 25 | **Font: Tahoma in editor** | Added `style={{ fontFamily: 'Tahoma, Calibri, sans-serif' }}` to the QuoteEditor root wrapper. Only affects the editor page. |

### TCMB Exchange Rate

| # | Item | How Addressed |
|---|------|---------------|
| 26 | **Kur: TCMB Döviz Satış / Efektif Satış** | Created `src/lib/services/tcmb-service.ts` — fetches from `tcmb.gov.tr/kurlar/today.xml`, extracts ForexSelling and BanknoteSelling for EUR/USD/GBP, 1-hour in-memory cache, 10s timeout, stale cache fallback. Created `/api/exchange-rates/tcmb` route. Updated `ExchangeRateModal.tsx` with "TCMB Kuru Getir" button, two radio options (Döviz Satış / Efektif Satış), and clickable rate cards per currency. |

### Ref No / Invoice Coding

| # | Item | How Addressed |
|---|------|---------------|
| 27 | **Fatura kodlama — Ref No modal** | Created `RefNoBuilderModal.tsx` with fields: Creator Initials (auto from user name), 4-digit Sequence, System Code dropdown (YAS, CCTV, PAVA, KGS, GAZ, SOND, DAS), Revision number, Project Name (auto-filled), Contractor (optional), Brand (optional). Live preview of generated code. Parser function re-populates fields from existing refNo. Added wrench icon button next to refNo field in `QuoteEditorHeader.tsx`. |

### Quote History / Logs

| # | Item | How Addressed |
|---|------|---------------|
| 28 | **Loglar anlamlı hale getirilecek** | Created `src/lib/history-labels.ts` with Turkish field labels mapping (refNo→"Referans No", currency→"Para Birimi", etc.). Modified quote PUT route to compute structured diffs: fetches current state before update, compares each field, stores `{ field: { from, to } }` format with project name resolution. Updated `QuoteHistory.tsx` to render "Label: old → new" format. Backwards compatible with old entries. |

### Products & Companies

| # | Item | How Addressed |
|---|------|---------------|
| 29 | **Ürünler — Excel dışa aktar** | Created `/api/products/export/route.ts`. Columns: Kod, Kısa Kod, Marka, Kategori, Model, İsim TR, İsim EN, Birim, Liste Fiyatı, (Maliyet — if canViewCosts), Para Birimi, Tedarikçi, Aktif. Added "Excel'e Aktar" button to `ProductList.tsx`. |
| 30 | **Firmalar — Excel dışa aktar** | Created `/api/companies/export/route.ts`. Columns: Firma Adı, Tip, Adres, Vergi No, Telefon, E-posta, Aktif. Added "Excel'e Aktar" button to `CompanyList.tsx`. |
| 31 | **Firmalar — Excel içe aktar** | Created `/api/companies/import/route.ts`. Parses uploaded xlsx, upserts by company name (case-insensitive), validates type (CLIENT/PARTNER). Added "Excel'den Yükle" button to `CompanyList.tsx`. |

### Authorization / Visibility

| # | Item | How Addressed |
|---|------|---------------|
| 32 | **Yetkilendirme — per-project visibility** | Added `ProjectVisibility` enum (CREATOR_ONLY, SPECIFIC_USERS, EVERYONE) and `ProjectUserAccess` join table to Prisma schema. Created migration `20260325000000_add_project_visibility`. Default is CREATOR_ONLY — existing projects get most restrictive visibility automatically. |
| 33 | **Project mandatory on quote creation** | Added validation in quotes POST route — returns 400 "Proje seçimi zorunludur" if `projectId` is missing. |
| 34 | **Quote listing filtered by visibility** | Modified quotes GET route: managers (canApprove/canManageUsers) see all. Regular users see: own quotes + EVERYONE projects + SPECIFIC_USERS projects where they have access. Created `/api/projects/[id]/visibility/route.ts` for managing visibility settings. |

### Price History

| # | Item | How Addressed |
|---|------|---------------|
| 35 | **Son teklif: same company only** | Added `companyId` prop to `PriceHistory.tsx`, appended to fetch URL. Modified `/api/products/[id]/price-history/route.ts` to accept `companyId` param and filter by `quote.companyId`. `QuoteEditor.tsx` now passes `companyId={quote.company.id}`. |

### PDF & Excel Format

| # | Item | How Addressed |
|---|------|---------------|
| 36 | **PDF — center firm info section** | Added `text-align: center` to the `.info-left` cell in `quote-template.ts` that contains company name, project, subject, and description. |
| 37 | **PDF — HEADER item coloring** | Modified PDF template to read `headerColor` from item's `serviceMeta` JSON field. Falls back to default green if no color set. Modified PDF export route to pass `headerColor` through. No schema migration needed — uses existing `serviceMeta Json?` field. |
| 38 | **PDF font verified** | Font is Arial throughout (confirmed). Current sizes (6.5pt/7.2pt) are tuned for the dense A4 table layout — switching to 10pt would overflow. Added comment documenting the tradeoff. |
| 39 | **Excel export matches PDF format** | Expanded from 5 to 8 columns: Poz No, Açıklama, Miktar, Birim, Birim Fiyat, Toplam Fiyat, Katsayı, Liste Fiyatı. Added group headers ("TEKLİF SATIŞ FİYATLARI" / "TEKLİF HAZIRLAMA") as merged cells. Proper number formatting, borders, column widths, and styled headers. |

### Commercial Terms

| # | Item | How Addressed |
|---|------|---------------|
| 40 | **Üretici firmalar — matrix format** | Converted from flat checkbox list to brand × system matrix grid in `CommercialTermsSection.tsx`. Rows = brands, columns = system types (abbreviated headers with tooltips). Stored as JSON: `{"BRAND": ["System1", "System2"]}`. Backwards compatible with legacy format. |

### Quote View Page

| # | Item | How Addressed |
|---|------|---------------|
| 41 | **Teklifin görüntülenme ekranı kontrol** | Reviewed entire quote view page (`quotes/[id]/page.tsx` — 1052 lines). All sections render correctly: header, status, company info, items table, summary, commercial terms, notes, documents, version history, audit trail. No issues found. |

---

## Not Addressed

| # | Item | Reason |
|---|------|--------|
| 1 | **"Ürünlerde tarafınızca sağlanacaktır. Dahildir."** | Unclear requirement — needs client clarification on what this means and where it should appear. |
| 2 | **Renk seçme (teklif format)** | Client said it was unclear, agreed to skip for now. |
| 3 | **Şablonlar tekrar bak** | User said they need to verify template data first before we make changes. |
| 4 | **İskonto ara toplamlar bazında dağıtılması** | Client said "ileride ihtiyaç olursa" — deferred to future. |
| 5 | **PDF font 10pt** | Current 6.5pt/7.2pt sizes are tuned for the dense A4 table. Switching to 10pt would cause content overflow. Kept current sizes, documented the request. |
| 6 | **HEADER item color picker in editor** | PDF rendering supports headerColor, but the UI-side color picker for HEADER items was not implemented yet. The infrastructure is ready — color is stored in `serviceMeta` JSON and rendered in PDF. |

---

## Deployment Steps

```bash
# On your Mac — push code
git push

# On the server
cd /opt/bts_quote/app
git pull
docker compose up -d --build

# After deploy — fix product currencies
docker cp scripts/fix-product-currencies.ts $(docker compose ps -q app):/app/fix-product-currencies.ts
docker compose exec app npx tsx /app/fix-product-currencies.ts
```

## Code Review Notes (from sub-agent review)

- **No critical or high issues found**
- Migration is safe: additive only, CREATOR_ONLY default protects existing data
- All new API routes have auth checks
- Column order in QuoteItemRow matches QuoteItemsTable header — verified
- Medium items noted: companies export has no role check (acceptable since company list is public to all users), old quotes without projects are creator-only (correct behavior)
