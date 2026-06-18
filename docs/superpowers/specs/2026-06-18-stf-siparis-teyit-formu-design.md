# Sipariş Teyit Formu (STF) — Design Spec

**Date:** 2026-06-18
**Status:** Approved (design); pending written-spec review → implementation plan.
**Context:** BTS Yangın quote-management app (Next.js 16 App Router, Prisma, Postgres 16), ~3 months in production. **All changes additive / backward-compatible. No destructive migrations.** Source of requirements: `client_notes/not2.pdf` p.5 + the sample files in `client_notes/stf örnekler/` (Excel = internal, PDF = customer).

## 1. Concept & decisions

- **STF = the expanded `OrderConfirmation`.** We grow the existing Siparişler module into the full STF rather than building a parallel module (owner decision). "Sipariş Teyit Formu" *is* the order.
- **Snapshot + fully editable.** Creating an STF copies the won quote's header / line-items / footer into the STF. After creation, **every field on the STF is hand-editable and changes never touch the quote** (not2: "bu ekranda herşey elle değiştirilebilir olacak").
- **Manual creation.** A KAZANILDI quote shows a **"STF Oluştur"** button on its detail page; clicking it creates the STF pre-filled from the quote. One STF per quote (if it exists, open it). (owner decision)
- **Numbering from STF-6000.** New STFs get sequential `STF-6000`, `STF-6001`, … Existing `SIP-YYYY-NNNN` test orders are left as-is (not renumbered).
- **Revisions.** "Revizyon Oluştur" clones an STF and appends `R1`, `R2`, … to the original code (e.g. `STF-6001-R1`), with a parent/child link so the chain is cumulative — same pattern as quote revisions.

## 2. Data model (additive)

Extend `OrderConfirmation` (keep all existing columns + relations; everything new is nullable):

**Numbering / revision**
- `orderNumber` — now also holds `STF-####` / `STF-####-R#` values (column unchanged; only the generator changes).
- `parentOrderId String?` + self-relation `OrderRevisions` (mirrors `Quote.parentQuoteId`).
- `revisionNo Int @default(0)` — 0 = original, 1 = R1, …

**Snapshotted header (all editable, nullable)**
- `customerName` (firma adı / ilgili kişi), `customerAddress`, `customerPhone`, `customerTaxInfo` (V.D. + vergi no), `projectName`.
- `quoteNo` (won version's code) and `refNo` (e.g. "219C") — **two separate fields** (samples had them in one box; not2 wants them split).
- `formDate DateTime?` (STF tarih), `siparisNo` (free text, editable).
- `currency String @default("TRY")`, `discountTotal`, `grandTotal` (snapshot totals; editable).

**Footer blocks (editable text, nullable)**
- `manufacturers` (Üretici Firmalar), `warranty` (Garanti), `deliveryPlace` (Teslim Yeri), `paymentTerms` (Ödeme), `vatNote` (KDV), `notes` (Notlar — already exists), `customerApprovalName` (Müşteri Onayı), `btsResponsibleName` (BTS Sorumlusu).

**New table `OrderItem`** (line-item snapshot; one row per quote item copied at creation):
- `id`, `orderId` (→ `OrderConfirmation`, `onDelete: Cascade`, indexed)
- `sortOrder Int`, `itemType` (reuse `QuoteItemType`: PRODUCT/HEADER/NOTE/SUBTOTAL/GRAND_TOTAL/SET/CUSTOM — preserves the quote's sectioned structure incl. the Duran Doğan TRAFO-1/TRAFO-2 + ara toplam/indirim layout)
- `pozNo String?` (display poz), `code`, `brand`, `model` (for the internal Excel left side)
- `description String`, `quantity Decimal`, `unit String`
- `unitPrice Decimal`, `totalPrice Decimal`, `priceLabel String?` ("dahildir"/"tarafınızca sağlanacaktır")
- `parentItemId String?` (SET grouping), `discountPct`, `sectionNote String?` (right-side internal/purchasing note, Excel only — hand-editable)

`Quote`/`Company`/`User` gain the back-relations (`interactions`-style). No existing column changes type or nullability.

## 3. Creation flow ("STF Oluştur")

1. Quote detail (status === KAZANILDI) shows **"STF Oluştur"**. If an STF already exists for the quote → navigate to it instead.
2. `POST /api/orders` (extended): given `quoteId`, in a serializable transaction with the existing P2002 retry loop:
   - allocate the next `STF-####` (see §4),
   - copy header fields from the quote (customer from `quote.company`, `quoteNo = quote.quoteNumber`, `refNo = quote.refNo`, `projectName = quote.project?.name`, `formDate = today`, currency/totals),
   - copy each `QuoteItem` (incl. HEADER/NOTE/SUBTOTAL/SET children, sortOrder, priceLabel, parentItemId) into `OrderItem`,
   - footer blocks default from quote commercial terms / template defaults where available, else empty.
3. Redirect to the STF detail/edit page.

## 4. Numbering

New `getNextStfNumber(tx)` replacing the `SIP-YYYY` generator for new STFs:
- prefix `STF-`, scan `orderNumber` matching `^STF-(\d+)$`, take max, `next = max(6000, lastSeq + 1)` (so the very first is 6000).
- Revisions: `STF-####-R#` where `#` = parent's revision count + 1; not part of the base-number sequence.
- Keep the P2002 retry loop already in `route.ts` for concurrency.

## 5. Editable STF screen

STF detail page becomes editable (replaces the current read-mostly order detail):
- Header card: all snapshot header fields editable (customer, tax, phone, address, projectName, **quoteNo**, **refNo**, formDate, siparisNo, currency).
- Line items: editable table (poz, ürün adı, miktar, birim fiyat → toplam auto-calc, priceLabel, section grouping); add/remove/reorder rows; right-side `sectionNote` per row for the internal Excel.
- Footer blocks: editable textareas (üretici/garanti/teslim/ödeme/kdv/notlar) + müşteri onayı / BTS sorumlusu.
- STF no auto-assigned, editable. Save persists to the STF only (never the quote).
- "Revizyon Oluştur" button (see §1).

## 6. Outputs

**PDF (customer)** — extend `src/lib/pdf/order-template.ts` to match the sample proforma layout: header table (firma adı/ilgili kişi, adres, telefon, V.D./vergi no | tarih, STF no, teklif no/ref no, proje adı, sipariş no), line-item table (Poz No / Ürün Adı / Miktar / Birim Fiyat / Toplam Fiyat) with section subtotals + per-section "FİRMANIZA ÖZEL İNDİRİM" + net totals (Duran Doğan shape), then ÜRETİCİ FİRMALAR / GARANTİ / TESLİM YERİ / ÖDEME / KDV / NOTLAR blocks, and MÜŞTERİ ONAYI / BTS SORUMLUSU signature row. Reuse `escapeHtmlMultiline` for multi-line footer text. `GET /api/orders/[id]/export/pdf` already exists — extend it.

**Excel (internal)** — new `GET /api/orders/[id]/export/excel`: left columns = poz / kod / marka / model / ürün adı / miktar / birim fiyat / toplam (warehouse + purchasing clarity), right columns = the per-row `sectionNote` (purchasing / internal notes), plus the same header + footer blocks. Mirror styling conventions from `src/lib/excel/excel-service.ts` (the quote Excel).

## 7. Siparişler (STF) list changes

In `src/app/(dashboard)/orders/page.tsx`:
- Columns: Sipariş No (STF no) → Firma → **Proje Adı** → **Teklif Adı** → Tutar → Durum → **Tarih** → **Yıl** → İşlemler.
- **Remove** the "Teslim Tarihi" column (keep `deliveryDate` in the DB; just drop the column).
- Add a **Yıl** column derived from `createdAt`/`formDate` year (this is the deferred B8 "Yıl" item — STF list only).

## 8. Phasing (→ implementation plan)

1. **Schema + creation + edit + list + numbering** — data model migration (additive), `getNextStfNumber`, extended `POST /api/orders` (snapshot copy), editable STF screen, "STF Oluştur" button on won quotes, Siparişler list column changes. *(Largest phase; the core.)*
2. **PDF output** — extend `order-template.ts` + the pdf export route to the full sample layout.
3. **Excel output** — new internal Excel export route + service.
4. **Revisions** — "Revizyon Oluştur" (clone + `R#` numbering + parent/child link + a version panel on the STF, like quotes).

Each phase ships on its own commit(s) with tests, code-reviewed where logic-bearing, and is independently deployable.

## 9. Risks & mitigations

- **Live data:** migration is additive only (new nullable columns + new `OrderItem` table + self-relation); existing `SIP-*` orders untouched. Applied locally + recorded; production via `prisma migrate deploy`.
- **Snapshot drift:** by design the STF is independent of the quote after creation; we do NOT keep them in sync (matches "herşey elle değiştirilebilir").
- **Numbering concurrency:** reuse the existing serializable + P2002 retry loop.
- **Section/SET fidelity:** copy itemType/parentItemId/sortOrder verbatim so multi-section forms render identically; covered by tests with a multi-section sample.

## 10. Open questions (decide before/within plan)

1. **Footer defaults:** should üretici/garanti/teslim/ödeme/kdv default from the quote's commercial terms, from a settings template, or start empty? (Recommend: pull from quote commercial terms where a matching category exists, else empty.)
2. **Status set:** keep the current `OrderStatus` (HAZIRLANIYOR/ONAYLANDI/GONDERILDI/TAMAMLANDI/IPTAL) for STFs, or add STF-specific statuses? (Recommend: keep as-is for now.)
3. **Who can create/edit STF:** any authenticated user, or gated (e.g. canApprove/canManageUsers)? (Recommend: same visibility rule as the quote it derives from.)
