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

1. ✅ **DONE — Schema + creation + edit + list + numbering.**
2. ✅ **DONE — PDF output** (`order-template.ts` + pdf export route render the snapshot; full-width footer blocks per owner request).
3. ✅ **DONE (2026-06-19) — Excel output.** New `src/lib/excel/stf-excel.ts` (`generateStfExcel`) + `GET /api/orders/[id]/export/excel` (creator OR canExport) + "Excel Indir" button. Owner decision: ONLY the 5 visible columns (Poz No / Ürün Adı / Miktar / Birim Fiyat / Toplam Fiyat) — the sample's hidden MARKA/MODEL/ÜRÜN KODU + "SATIN ALMA TALEP BİLGİLERİ" purchasing/cost columns are intentionally excluded. Same sectioned layout/totals as the PDF (SET children excluded from section sums; subtotal labels use EURO/TL names; price cells numeric with currency-symbol numFmt). Plan: `docs/superpowers/plans/2026-06-19-stf-phase3-internal-excel.md`. 657 tests pass.
4. ✅ **Revisions — DONE (2026-06-25), reinstated by client request.** (Earlier dropped 2026-06-19, then the client asked for it after all.) Implemented to mirror the CURRENT quote revision model (which had its grouped/linked view removed): a revision is a **STANDALONE** new STF with flat `.N` numbering (`STF-6000`→`STF-6000.1`, never `.1.1`), starts `TASLAK`, full snapshot copy, source untouched, **NO `parentOrderId` link**, allowed only from a `TAMAMLANDI` source. `POST /api/orders/[id]/revisions` + `nextStfRevisionNumber` helper. No grouped list view — `createdAt desc` surfaces the newest. Statuses also simplified to **TASLAK / TAMAMLANDI / IPTAL** (supersedes §10.2) with "Taslağa Geri Çek" / "İptali Geri Al" transitions; editable & deletable only in `TASLAK`. Plan: `docs/superpowers/plans/2026-06-25-stf-status-and-revisions.md`.

Each phase ships on its own commit(s) with tests, code-reviewed where logic-bearing, and is independently deployable.

## 8b. Phase 1 status (2026-06-18) + carried-forward follow-ups

**Phase 1 COMPLETE** on branch `feature/client-notes-jun2026` (9 tasks, commits prefixed `STF (`, ending at `220399f`). Additive migration `20260618000000_add_stf_fields`, snapshot create + STF-6000 numbering, editable StfEditor, GET/PUT, "STF Oluştur" button, Siparişler list columns. 632 tests pass; typecheck clean. Every task got spec + code-quality review; a final integration review confirmed end-to-end coherence.

**⚠ Dev-server note:** after the schema migration + `prisma generate`, a long-running `next dev` must be RESTARTED to load the regenerated Prisma client — otherwise POST /api/orders 500s with `PrismaClientValidationError: Unknown argument customerName`. The code is correct; this is environment-only.

**Follow-ups for Phase 2 (PDF) or a hardening pass:**
1. ~~**Order-level totals recompute (Phase 2):**~~ ✅ DONE (Phase 2). `computeStfTotals` (`src/lib/stf/stf-totals.ts`) recomputes `grandTotal`/`discountTotal` server-side in PUT (overriding client values); SET children excluded (parent carries rolled-up total — matches `quote-calculations.ts`, verified vs live data).
2. ~~**Type-aware row rendering (Phase 2):**~~ ✅ DONE (Phase 2). StfEditor renders HEADER/NOTE/SUBTOTAL rows type-aware; SUBTOTAL rows expose editable section-discount % + label; `*` for SET children; read-only totals strip.
3. ~~**Access control hardening:**~~ ✅ DONE (Phase 2, owner-approved "full hardening"). Shared `canAccessOrder` + `isStfEditable` in `src/lib/orders/order-access.ts` (mirrors `canAccessQuote`: managers see all; STF creator; else source-quote creator / project EVERYONE|SPECIFIC_USERS visibility). Applied to GET/PATCH/PUT (403 on deny). PUT additionally gated to editable statuses `HAZIRLANIYOR`/`ONAYLANDI` (409 on GONDERILDI/TAMAMLANDI/IPTAL — sent/terminal STFs are frozen; status still changes via PATCH). 9 unit tests. Note: PDF export route keeps its own creator-OR-`canExport` guard (unchanged).

**Phase 2 (Customer PDF) — COMPLETE (2026-06-18), branch `feature/client-notes-jun2026`.** Additive migration `20260618010000_add_order_item_section_discount` (OrderItem `sectionDiscountPct`/`sectionDiscountLabel`, nullable). `order-template.ts` rewritten to render the editable STF snapshot (header table, sectioned items, `*` children, three-row GENEL TOPLAM / FİRMANIZA ÖZEL İNDİRİM / NET TOPLAM block, ÜRETİCİ/GARANTİ/TESLİM/ÖDEME/KDV/NOTLAR footer + MÜŞTERİ ONAYI/BTS SORUMLUSU signature). Export route reads the snapshot, not the live quote. 642 tests pass. **Known display gap (minor):** priced items trailing the last SUBTOTAL (an STF with no closing SUBTOTAL) get no summary row on the PDF — the sample/quotes always end in a SUBTOTAL, so latent. **TESLİMAT** has no dedicated snapshot column (folded into Teslim Yeri/Notlar). Remaining: **Phase 3** internal Excel, **Phase 4** revisions (R1/R2), plus the §8b-#3 access hardening above.

## 9. Risks & mitigations

- **Live data:** migration is additive only (new nullable columns + new `OrderItem` table + self-relation); existing `SIP-*` orders untouched. Applied locally + recorded; production via `prisma migrate deploy`.
- **Snapshot drift:** by design the STF is independent of the quote after creation; we do NOT keep them in sync (matches "herşey elle değiştirilebilir").
- **Numbering concurrency:** reuse the existing serializable + P2002 retry loop.
- **Section/SET fidelity:** copy itemType/parentItemId/sortOrder verbatim so multi-section forms render identically; covered by tests with a multi-section sample.

## 10. Resolved decisions

1. **Footer defaults:** pull üretici/garanti/teslim/ödeme/kdv from the quote's commercial terms where a matching category exists; otherwise start empty.
2. **Status set:** keep the current `OrderStatus` (HAZIRLANIYOR/ONAYLANDI/GONDERILDI/TAMAMLANDI/IPTAL) for STFs — no STF-specific statuses.
3. **Access:** same visibility rule as the quote the STF derives from (creator / project visibility), and managers (`canApprove` || `canManageUsers`) can create/edit any STF — consistent with the rest of the app.
