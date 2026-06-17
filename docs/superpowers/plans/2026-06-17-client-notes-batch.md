# Client Notes Implementation Plan — June 2026 Batch

**Date:** 2026-06-17
**Source:** Client email + `client_notes/not.pdf` (first note), `client_notes/not2.pdf` (meeting follow-up), and `client_notes/stf örnekler/` (STF samples).
**Context:** App has been in production ~3 months. **Every change must be additive / backward-compatible. No destructive migrations. Logic changes get a code-reviewer pass.**

**Decisions already made with client/owner:**
- **A1 (Firma Tipi):** *Add new types alongside the existing ones* — do NOT remove/remap `CLIENT`/`PARTNER`.
- **STF (Section C):** *Deferred.* Planned separately after A & B ship. Captured at the end for record only.
- **B8 (Yıl column):** *Siparişler/STF list only* — do NOT add a Yıl column to the Teklifler list.
- **B1 (notes):** bold + bullet formatting is OK to add if not overly complex (not just plain multi-line).
- **A2 (Proje Yeri):** do NOT add it as a filter on the Projeler list — form field + detail display only.
- **All items must ship** — order is flexible, but the whole A+B batch is in scope.

Scope of this plan: **Sections A and B.**

**Backup for investigation (B6):** production data is in `~/Downloads/bts_backup_10.06.2026/bts_backup_2026-06-10_0906.dump` (custom format). Convert to readable SQL with `/opt/homebrew/opt/postgresql@16/bin/pg_restore -f /tmp/bts_prod.sql <dump>` — this only reads the file, no DB connection, fully safe.

---

## Risk & sequencing overview

Status legend: ✅ done (branch `feature/client-notes-jun2026`, tested) · ⬜ todo

| # | Item | Type | Risk | Migration? | Status |
|---|------|------|------|------------|--------|
| A2 | Proje Yeri dropdown | Additive | Low | Yes (1 nullable col) | ✅ |
| A3 | Multi-word product search | Hot-path logic | Medium | No | ✅ (reviewed) |
| B3 | Quote detail preview button | Additive UI | Low | No | ✅ |
| B7 | Marka Kar Özeti "Maliyet %" | Additive calc/UI | Low | No | ✅ |
| B8 | Teklif Adı column | Additive UI | Low | No | ✅ (export part → with B9) |
| B5 | "Dahildir" revert + not shown | Bug fix | Medium | No | ✅ |
| B6 | Set cost in analysis | Bug + feature | Medium | No | ✅ (reviewed) |
| A1 | Firma Tipi expansion | Enum migration | Medium | Yes (enum) | ⬜ |
| B1 | Notes newline / Word paste | UI/input | Medium | No | ⬜ |
| B2 | Filter + pagination persistence | UI state | Medium | Maybe (SavedFilter exists) | ⬜ |
| B4 | Right-click "insert above" | Editor logic | Medium | No | ⬜ |
| B9 | Teklif Takip panel | New feature | High | Yes (2 tables) | ⬜ |

### Implementation notes (done items)
- **A2:** `Project.location` nullable column; migration `20260617000000_add_project_location` (hand-authored, applied locally + recorded — production `migrate deploy` will pick it up). `src/lib/turkish-provinces.ts` (81 + Yurtdışı). Wired into `ProjectForm` and the detail-page inline edit + display.
- **A3:** `buildTokenizedSearchAND` + `escapeLike` in `search-helpers.ts`; product search route uses `where.AND`. Single-char tokens kept ("DTS 2"). LIKE wildcards escaped. 12 new tests; live-validated against 2567-row prod table.
- **B5:** reorder payload now includes `priceLabel` (was the only lossy field); duplicate-row POST preserves it; view screen renders the label as a merged cell. PDF/Excel already handled it.
- **B7:** "Maliyet %" = brand cost / total cost, in header + rows + totals (manager/`canViewCosts` view only).
- **B8:** "Teklif Adı" column (from `subject`) right of Proje. **Admin-only Excel export deferred** — no list export exists today; it should be built with B9 so it can include the tracking columns the client wants exported.

**Recommended order:** quick safe wins (A2, A3, B3, B7, B8) → confirmed bug fixes (B5, B6) → migration (A1) → editor UX (B1, B4, B2) → Teklif Takip (B9) → STF (separate project).

---

# Section A — from `not.pdf`

## A1. Firma Tipi — add new options (decision: add, keep old)

**Current:** `enum CompanyType { CLIENT, PARTNER }` (`prisma/schema.prisma:68`). Company form dropdown shows "Müşteri" (= CLIENT).

**Requested:** add Müteahhit, Son Kullanıcı, Sözleşmeli Bayi, Entegratör, Danışman, Proje Firması, Distribütör, Üretici.

**Plan (additive):**
1. Migration: extend `CompanyType` enum with the 8 new values. **Postgres `ALTER TYPE ... ADD VALUE` is additive and non-destructive** — existing `CLIENT`/`PARTNER` rows are untouched. (Note: enum `ADD VALUE` cannot run inside a transaction block in older PG; verify Prisma migration generates it standalone.)
2. Keep `CLIENT`/`PARTNER` in the enum and in the dropdown (label them "Müşteri" / "Partner") so historic rows + any code branching on type still resolves. New companies can pick any value.
3. Update the company form dropdown (`companies/[id]/edit` + new-company form) and any Turkish label map for `CompanyType`.
4. Check for places that branch on `type === 'CLIENT'` / `'PARTNER'` (e.g. project client pickers, reports) so new types don't silently break filters — likely they treat anything as selectable, but verify.

**Risk:** Medium — enum migration on a live table. Mitigation: additive only; no row rewrite; verify the migration SQL before deploy.

**Tests:** enum accepts new values; company create/edit round-trips a new type; existing CLIENT/PARTNER rows still load.

**Open question:** confirmed exact 8 labels above (matches the PDF list).

---

## A2. Proje Yeri (project location) dropdown

**Current:** `model Project` (`prisma/schema.prisma:108`) has no location field. New-project modal: Proje Adı, Durum, Tahmini Başlangıç/Bitiş, Notlar.

**Requested:** a dropdown under Proje Adı with all 81 Turkish provinces + a "Yurtdışı" option.

**Plan:**
1. Migration: add `location String?` to `Project` (nullable → safe for existing rows).
2. Constant list of 81 provinces + "Yurtdışı" in a shared `src/lib/turkish-provinces.ts`.
3. Add the dropdown to the new-project form and project edit form; display on project detail.
4. **No** projects-list filter (decision).

**Risk:** Low — purely additive.

**Tests:** create/edit project with and without a location; null stays null.

---

## A3. Multi-word product search

**Current:** `src/app/api/products/search/route.ts` builds `where.OR` by calling `expandTurkishVariants(query)` on the **whole query string** and doing `contains "<whole query>"` per field. So "DTS 2" / "smart 10" only match a contiguous substring; non-adjacent tokens ("smart" ... "10 modül") never match. There is an existing design doc: `docs/superpowers/specs/2026-04-28-turkish-search-design.md`.

**Plan:**
1. Tokenize the query on whitespace.
2. Require **every token** to match (AND), where each token matches **any field** (OR over code/shortCode/name/nameTr/model/brand.name), each token still expanded via `expandTurkishVariants` for Turkish-i folding.
3. Resulting `where`: `AND: tokens.map(tok => ({ OR: variantsOf(tok).flatMap(fieldMatchers) }))`.
4. Cap token count (e.g. first 6 tokens) to bound query size; keep the existing min-length gate.

**Risk:** Medium — this is the live search hot path. Mitigation: comprehensive unit tests; preserve single-token behavior exactly.

**Tests:** "DTS 2" matches "DTS 2KM 2 Kanal"; "smart 10" matches a product whose description has "10 modül"; single-word queries behave as before; Turkish-i variants still fold; empty/short query returns [].

---

# Section B — from `not2.pdf`

## B1. Notes: newline support + formatted Word paste

**Requested:** Alt+Enter / Enter newlines work in notes fields; pasting a formatted paragraph from Word preserves line breaks; or a "Paragraf Ekle" button. **Decision: bold + bullets are OK to add if not overly complex.**

**Plan:**
1. Audit the notes/description inputs (quote item NOTE rows, quote notes, project notes) and how they render in editor + preview + PDF/Excel export.
2. Introduce light rich text: **newlines + bold + bullet lists**. Store as a constrained HTML or markdown subset (sanitized) so it round-trips through preview and PDF. Avoid a heavy rich-text dependency — a minimal editor (or contenteditable with a sanitizer + bold/bullet/paragraph buttons) keeps it simple.
3. Word paste: capture `onPaste`, prefer pasted HTML run through a strict sanitizer (keep b/strong, ul/li, p, br; drop everything else), falling back to `text/plain` with preserved `\n`.
4. Critically verify the chosen format renders correctly in the **PDF/Excel export** path (`lib/pdf`), not just the web view.

**Risk:** Medium — rich text must round-trip into PDF; sanitization needed to avoid breaking export/layout. Keep the allowed tag set tiny.

**Tests:** multi-line + bold + bulleted note saved → reloads identically → renders correctly in editor, preview, and PDF; pasted Word paragraph keeps structure; disallowed HTML is stripped.

---

## B2. Filter + pagination state persistence (client: important)

**Current:** `QuoteList.tsx` keeps `search`, `companyFilter`, `createdByFilter`, `dateFrom/To`, `page`, `sort` in **local `useState`**; only `status` is read from the URL (`QuoteList.tsx:105, 208-212`). Browser back resets everything except status. Same pattern in `ProductList.tsx`, `CompanyList.tsx`, `ProjectList.tsx`. A `SavedFilter` model exists (`schema.prisma:559`) and a `SavedFiltersDropdown` component exists but is **not wired into any list**.

**Plan (preferred — lightweight, no schema change):**
1. Lift all list filters + page + sort into the **URL query string** (`useSearchParams` + `router.replace`). Back-navigation then restores state for free, and links are shareable.
2. Apply the same pattern to Teklifler, Ürünler, Firmalar, Projeler (the screens the client named: dashboard, ürün ekle, teklifler).
3. (Optional later) wire the existing `SavedFiltersDropdown` for named filters — separate enhancement.

**Risk:** Medium — touches list fetch effects; must avoid render loops when syncing state↔URL.

**Tests:** set filter+page 15 → open quote → back → same filter + page 15; deep-link with query params loads filtered.

---

## B3. Quote-list "Önizleme" (quick PDF preview) button

**Current:** preview infra exists (`quotes/[id]/preview`, `quotes/[id]/preview-html`, `quotes/[id]/export/pdf`).

**Plan:** add a preview action to each row's İşlemler in `QuoteList.tsx` opening the existing preview (modal or new tab). Pure UI wiring.

**Risk:** Low.

---

## B4. Right-click "Üstüne ürün ekle" (insert product above selected row)

**Current:** add-product appends to the end (`QuoteEditor.tsx:1204` `handleAddProduct`). Ordering is by integer `sortOrder` (`QuoteItem.sortOrder`). Context menu already exists (`QuoteItemRow.tsx`, "Üstüne Başlık Ekle" already present per the not2 screenshot).

**Plan:**
1. Add an "Üstüne Ürün Ekle" entry to the row context menu that opens the product picker, then inserts the chosen product at the selected row's `sortOrder` and **shifts subsequent `sortOrder` values down**.
2. Reuse existing insert/reorder persistence; ensure the bulk save includes all fields (see B5 — same payload that currently drops `priceLabel`).

**Risk:** Medium — sortOrder reshuffling + must not regress the reorder payload bug.

**Tests:** insert above row N puts it at N and pushes the rest down; totals unchanged; priceLabels on other rows survive.

---

## B5. "Dahildir / Tarafınızca sağlanacaktır" — revert bug + not shown on view (TWO confirmed bugs)

**Current behavior — root causes confirmed in code:**
- **Bug 1 (revert):** `QuoteEditor.tsx:1140-1161` `handleReorder` builds the bulk-save payload **omitting `priceLabel`** (also `ekMaliyetDelta`, `serviceMeta`, `currency`, `sectionDiscountPct/Label`). So any drag-reorder wipes a row's price label back to numeric — exactly the "kendisi atmış / fiyatlı satıra döndü" the client reports.
- **Bug 2 (not shown on view):** quote view screen `quotes/[id]/page.tsx:1346-1374` always renders `unitPrice`/`totalPrice` and **never checks `item.priceLabel`**, so labels don't appear on the customer-facing view. The editor renders them correctly (`QuoteItemRow.tsx:967-977`); the view does not.

Data model is fine: `QuoteItem.priceLabel: String?` stores literal text (`schema.prisma:365`); calc code already treats labeled rows as 0 (`quotes/[id]/page.tsx:390`, `quote-calculations.ts`).

**Plan:**
1. **Bug 1:** include `priceLabel` (and the other dropped fields) in the `handleReorder` bulk payload so reorder is lossless. Audit every caller of the items bulk-PUT for the same omission.
2. **Bug 2:** in the view screen renderRow, mirror the editor: when `item.priceLabel` is set, render a single merged cell with the label text instead of numeric price columns.
3. Verify PDF/Excel export also renders the label (check `lib/pdf` quote template).

**Risk:** Medium — touches shared persistence + view render. Well-isolated; strong test coverage.

**Tests:** set label → reorder → label persists; labeled row shows label (not price) on view + PDF; sums treat it as 0.

---

## B6. Set (bundle) cost in cost analysis (client: important) — ROOT CAUSE CONFIRMED from prod data

**Current behavior:** `quote-calculations.ts:405-496` `calculateQuoteProfitSummary` and brand summary `BrandProfitSummary.tsx:198-261`:
- SET **parent**: contributes its full `totalPrice` as revenue, attributed to the **parent's brand**; **excluded from cost** (`:478-481`, `isSetParent`).
- SET **children**: excluded from revenue (have `parentItemId`), but **cost counted, attributed to each child's own brand**.

**Confirmed bug (verified against `CC0335-YAS` in the 2026-06-10 backup):** when a SET groups children of **different brands**, the brand-profit summary mis-attributes revenue vs cost:

| Row | Brand | Revenue | Cost |
|-----|-------|---------|------|
| SET parent | ADVANTECH | 3005 (all) | 881.02 *(ignored)* |
| child | ADVANTECH | 0 | 889.83 |
| child | BTS | 0 | 321.35 |
| child | BTS | 0 | 161.39 |

Result in Marka Kar Özeti: **ADVANTECH** shows revenue 3005 vs cost 889.83 → inflated margin; **BTS** shows cost 482.74 with **zero revenue → phantom loss**. The set's true cost (children sum = 1372.57) is never visible as a set. This is exactly the client's "set maliyetini/karını analizde göremiyoruz."

Two secondary observations from the data:
- The SET parent in CC0335 carries its own stored `costPrice` (881.02) that is **silently ignored** by the calc (children costs are used instead). Need a decision on whether a bundle-level cost should ever count (today it never does).
- `SA0195-YAS` has a second set (`BTS-MS.MH.T.v.DA`, totP=814) whose 2 children (cost 406.77 each = 813.54) are same-brand, so it's less distorted — but still invisible as a per-set margin.

**Plan:**
1. Treat each **SET as its own analysis group/line**: sum children revenue + children cost under the set → show Set sale / Set cost / Set profit / margin %. This both gives the requested per-set view AND removes the cross-brand scatter (children no longer leak cost into unrelated brand buckets). Likely a new sub-section in `BrandProfitSummary.tsx`, manager-only (`canViewCosts`).
2. Ensure a labeled child (priceLabel) still contributes its `costPrice * qty` to the set's cost even though its revenue is 0 — verify against the many `tarafınızca sağlanacaktır` rows seen in SA0195.
3. Decide bundle-level cost handling (see open question) — recommend: keep using children costs; ignore the stale parent costPrice, but surface it in the UI if set so the user notices the mismatch.

**Risk:** Medium — margin math, manager-facing. Strong tests; no change to stored data.

**Tests:** cross-brand set (CC0335 shape) → set shows revenue 3005 / cost 1372.57 / correct margin, and ADVANTECH/BTS brand buckets no longer show phantom revenue/loss; same-brand set (SA0195 shape) correct; labeled child still counts cost; non-set quotes unchanged.

**Open question (bundle cost):** when a SET parent has its own costPrice set, should it ever be used instead of summing children? (Today it's ignored; recommend keep ignoring + flag in UI.)

---

## B7. Marka Kar Özeti — add "Maliyet %" column

**Current:** `BrandProfitSummary.tsx` manager table has Marka, Kalem, Toplam Satış, Toplam Maliyet, Kar, Kar % (`:467-486`, `:198-261`). Totals already computed.

**Plan:** add a "Maliyet %" column = `totalCost / totalSatış * 100` per brand (and in the totals row), beside Toplam Maliyet as the client drew. Pure presentation; values already in hand.

**Risk:** Low.

**Tests:** Maliyet % = cost/revenue; sums to overall; hidden when `canViewCosts` is false.

---

## B8. Teklifler list — columns & gating

**Current:** columns Teklif No, Firma, Proje, Tutar, Kar Marjı %, Durum, Oluşturan, Tarih (`QuoteList.tsx:480-557`). Quote has `subject` ("Teklif Adı", `schema.prisma:252`) and `createdAt`. Excel export is API-gated by `canExport`/creator but **not gated in the list UI**.

**Plan:**
1. Add **"Teklif Adı"** column (from `subject`) immediately right of Proje.
2. **No "Yıl" column on Teklifler** (decision) — Yıl belongs only on the Siparişler/STF list (Section C).
3. **Excel export → admin/management only:** hide the list-level export control unless role has `canManageUsers` (or a dedicated permission); keep API gating as defense-in-depth.
4. (Phase 2, optional) toggleable extra tracking columns — defer until B9 (Teklif Takip) defines those fields.

**Risk:** Low.

**Tests:** Teklif Adı renders subject; export control hidden for non-admin; admin sees it.

---

## B9. Teklif Takip (quote tracking) panel — NEW feature

**Requested (not2 p.4-5):** a "Teklif Takip" button on the quote detail opening a panel with:
- **Static fields (overwrite):** Önem Sırası (A/B/C/D), Başarı % (number), Beklenen Sipariş Tarihi (date).
- **Cumulative interaction log (append-only):** who (auto = current user), Son İletişim Tarihi (default today), İletişim Tipi (Telefon/E-mail/Yüz Yüze/Online Toplantı/Fuar), İletişim Notu (textarea), Hatırlatıcı (future date → ties into existing `Reminder` model).
- **On status = Kaybedildi:** reason dropdown (Bütçe Yetersizliği, Rakipten Pahalı Kalmak, Rakip Marka Tercihi, Teknik Şartname/Yetersizlik, Proje İptali, Ödeme Koşulları) + preferred-competitor text field.

**Plan:**
1. Schema (additive): add static fields to `Quote` (`priority`, `successPct`, `expectedOrderDate`, `lostReason` enum, `lostCompetitor`) **or** a 1:1 `QuoteTracking` table; plus a `QuoteInteraction` table (id, quoteId, userId, date, type, note, reminderDate, createdAt). Prefer the dedicated table for the log.
2. Reuse existing `Reminder` for the Hatırlatıcı date so it surfaces in the current reminders system.
3. UI: a panel/drawer on the quote detail; append-entry form + history table.
4. New `LostReason` enum + Turkish labels; competitor free-text.

**Risk:** High (new tables + UI + reminder integration) — build as its own branch after the smaller items.

**Tests:** static fields overwrite; each interaction appends a row; reminder date creates a Reminder; lost-reason required only when status = Kaybedildi.

---

# Section C — STF / Sipariş Teyit Formu (DEFERRED — record only)

Captured for the future project. Today only a thin `OrderConfirmation` model exists (`schema.prisma:629`: orderNumber, quoteId, status, notes, deliveryDate) + a basic `lib/pdf/order-template.ts`.

Client requirements (not2 p.5 + samples in `client_notes/stf örnekler/`):
- Won quote → STF auto-populates all fields, everything hand-editable.
- Header auto-fill: Firma adı, Vergi No, adres, telefon, Proje adı, Tarih; **split Teklif No and Ref No** into two fields (Teklif No = won version code; Ref No = e.g. "219C"); Sipariş No editable.
- Auto numbering from **STF-6000**, incrementing.
- Revisions append **R1/R2/R3** to the STF code (same pattern as `docs/superpowers/plans/2026-04-28-revision-batch.md`).
- Two outputs: **Excel** (internal: left = poz/code/brand for warehouse+purchasing, right = hand-entered notes) and **PDF** (customer: kaşe/imza), matching the sample layouts incl. ÜRETİCİ FİRMALAR / GARANTİ / TESLİM YERİ / ÖDEME / KDV / NOTLAR / onay blocks and multi-section subtotals (Duran Doğan TRAFO-1/TRAFO-2 example).
- Siparişler list: Firma → Proje Adı → Teklif Adı columns; remove "Teslim Tarihi" column (keep Tarih); add "Yıl" column.

This expands `OrderConfirmation` into a full snapshot + line-items + multi-format export module — its own plan when A & B land.

---

# Open questions

**Resolved (2026-06-17):**
- B6 distortion — *confirmed* from the 2026-06-10 backup (cross-brand set mis-attribution). No client export needed.
- B8 Yıl column — Siparişler/STF only, not Teklifler.
- B1 — bold + bullets OK if not overly complex.
- A2 — no projects-list filter.

**Remaining (can default if no answer):**
1. **B6 bundle cost:** when a SET parent has its own costPrice, should it ever be used instead of summing children? Default: keep using children costs, surface the parent value in the UI.
