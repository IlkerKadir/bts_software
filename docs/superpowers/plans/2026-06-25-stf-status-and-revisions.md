# STF — Simplified Statuses + Revisions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Simplify STF statuses to **Taslak / Tamamlandı / İptal**, add "Taslağa geri çek" + "İptali geri al" transitions, allow deleting Taslak STFs, and add **"Revize Oluştur"** on completed STFs that clones to a standalone `STF-6000.1` (flat `.N`, mirroring the current quote revision logic — no parent linking).

**Architecture:** Mirror the current quote revision model exactly (investigated: `src/app/api/quotes/[id]/revisions/route.ts`): a revision is a **standalone** new record with a flat `root.{N+1}` number, starts in draft, full content copy, source untouched, NO `parentQuoteId`/`parentOrderId` link, list ordering (createdAt desc) naturally surfaces the newest. The STF schema already has unused `parentOrderId`/`revisionNo` (Phase 1) — they stay unused (consistent with quotes).

**Tech Stack:** Next.js 16, Prisma + Postgres 16 (hand-authored migrations), Vitest, TypeScript.

**Constraints:**
- 🚨 Subagents: no `git checkout`/`switch`/`stash`/`reset`/`restore`. Only `git add`/`git commit`. Branch: `main`.
- ⚠️ tsc baseline: 11 pre-existing `.test.ts` errors. Bar: zero NEW non-test errors. Verify with `rm -rf .next && rm -f tsconfig.tsbuildinfo && npx tsc --noEmit 2>&1 | grep "error TS" | grep -vE "\.test\.ts|\.next/"` → empty. (Delete `.next` first — stale generated route types produce spurious errors.)
- Migration applied to live prod via `prisma migrate deploy` (container entrypoint). Must be safe on existing rows.
- **Postgres enum gotcha:** a newly-added enum value canNOT be used in the same transaction that adds it. `prisma migrate deploy` runs each migration file in its own transaction → the `ADD VALUE 'TASLAK'` and the `UPDATE ... = 'TASLAK'` MUST be in **two separate migration files**.

**Status model (final, owner-approved):**
- Statuses surfaced in UI: `TASLAK`, `TAMAMLANDI`, `IPTAL`.
- Remap existing rows: `HAZIRLANIYOR → TASLAK`; `ONAYLANDI → TAMAMLANDI`; `GONDERILDI → TAMAMLANDI`; `TAMAMLANDI`/`IPTAL` unchanged. Old enum values stay in the type (unused).
- Transitions: `TASLAK → TAMAMLANDI, IPTAL`; `TAMAMLANDI → TASLAK, IPTAL`; `IPTAL → TASLAK`.
- Editable only in `TASLAK`. Deletable only in `TASLAK`. New STF defaults to `TASLAK`.
- "Revize Oluştur" only on `TAMAMLANDI`.

---

## File Structure
- Modify `prisma/schema.prisma` — add `TASLAK` to `OrderStatus`; change `OrderConfirmation.status` default to `TASLAK`.
- Create `prisma/migrations/20260625000000_stf_add_taslak_status/migration.sql` — `ADD VALUE`.
- Create `prisma/migrations/20260625010000_stf_remap_statuses/migration.sql` — data remap + column default.
- Create `src/lib/stf/stf-revision-number.ts` (+ test) — flat `.N` numbering helper.
- Modify `src/app/api/orders/route.ts` — POST default status `TASLAK`.
- Modify `src/app/api/orders/[id]/route.ts` — PATCH state machine; DELETE gate.
- Modify `src/lib/orders/order-access.ts` — `STF_EDITABLE_STATUSES = ['TASLAK']`.
- Create `src/app/api/orders/[id]/revisions/route.ts` — STF revision (clone).
- Modify `src/app/(dashboard)/orders/[id]/page.tsx` — status labels/variants/select (3), Taslağa geri çek, İptali geri al, Revize Oluştur, Sil (Taslak).
- Modify `src/app/(dashboard)/orders/page.tsx` — status labels/variants + filter options (3).

---

## Task 1: Schema + migrations (statuses)

**Files:** `prisma/schema.prisma`; two new migration dirs.

- [ ] **Step 1: schema.prisma** — add `TASLAK` as the FIRST value of `enum OrderStatus` (keep the rest):
```prisma
enum OrderStatus {
  TASLAK
  HAZIRLANIYOR
  ONAYLANDI
  GONDERILDI
  TAMAMLANDI
  IPTAL
}
```
Change `OrderConfirmation`: `status OrderStatus @default(HAZIRLANIYOR)` → `status OrderStatus @default(TASLAK)`.

- [ ] **Step 2:** Create `prisma/migrations/20260625000000_stf_add_taslak_status/migration.sql`:
```sql
-- STF: add the new TASLAK status value (must commit before it can be used).
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'TASLAK';
```

- [ ] **Step 3:** Create `prisma/migrations/20260625010000_stf_remap_statuses/migration.sql`:
```sql
-- STF: remap legacy statuses to the simplified set, and default new rows to TASLAK.
UPDATE "OrderConfirmation" SET status = 'TASLAK'     WHERE status = 'HAZIRLANIYOR';
UPDATE "OrderConfirmation" SET status = 'TAMAMLANDI' WHERE status IN ('ONAYLANDI', 'GONDERILDI');
ALTER TABLE "OrderConfirmation" ALTER COLUMN status SET DEFAULT 'TASLAK';
```

- [ ] **Step 4: Apply locally + record + generate.** psql can't use a new enum value in the same connection-statement as the ADD when wrapped; apply the two files separately:
```bash
DB=$(grep -E "^DATABASE_URL=" .env | sed 's/^DATABASE_URL=//; s/"//g; s/?.*//'); PSQL=$(command -v psql || echo /opt/homebrew/Cellar/postgresql@17/17.9/bin/psql)
"$PSQL" "$DB" -f prisma/migrations/20260625000000_stf_add_taslak_status/migration.sql
"$PSQL" "$DB" -f prisma/migrations/20260625010000_stf_remap_statuses/migration.sql
npx prisma migrate resolve --applied 20260625000000_stf_add_taslak_status
npx prisma migrate resolve --applied 20260625010000_stf_remap_statuses
npx prisma generate
```
(If psql errors "unsafe use of new value TASLAK", that confirms why they're separate files — run the 2nd file in a fresh psql invocation, which the above already does.)

- [ ] **Step 5:** Typecheck clean (command in Constraints). Commit:
```bash
git add prisma/schema.prisma prisma/migrations/20260625000000_stf_add_taslak_status prisma/migrations/20260625010000_stf_remap_statuses
git commit -m "STF statuses (1): add TASLAK enum value + remap legacy statuses (migrations) + default TASLAK"
```

---

## Task 2: Revision-number helper (testable)

**Files:** Create `src/lib/stf/stf-revision-number.ts` + `stf-revision-number.test.ts`.

Mirror the quote logic (`quotes/[id]/revisions/route.ts:68-99`): root = strip trailing `.{N}` groups; next = max direct `.{N}` sibling + 1; flat (never `.1.1`).

- [ ] **Step 1: Failing test** — `src/lib/stf/stf-revision-number.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { nextStfRevisionNumber } from './stf-revision-number';

describe('nextStfRevisionNumber', () => {
  it('first revision of a base number → .1', () => {
    expect(nextStfRevisionNumber('STF-6000', ['STF-6000'])).toBe('STF-6000.1');
  });
  it('next sibling increments the flat counter', () => {
    expect(nextStfRevisionNumber('STF-6000.1', ['STF-6000', 'STF-6000.1'])).toBe('STF-6000.2');
  });
  it('revising any sibling collapses to the same root', () => {
    expect(nextStfRevisionNumber('STF-6000', ['STF-6000', 'STF-6000.1', 'STF-6000.2'])).toBe('STF-6000.3');
  });
  it('ignores legacy multi-dot names when counting', () => {
    expect(nextStfRevisionNumber('STF-6000.1', ['STF-6000.1', 'STF-6000.1.2'])).toBe('STF-6000.2');
  });
  it('only counts siblings of the same root', () => {
    expect(nextStfRevisionNumber('STF-6000', ['STF-6000', 'STF-6001.1', 'STF-6001.2'])).toBe('STF-6000.1');
  });
});
```

- [ ] **Step 2:** Run → fail. **Step 3:** Implement `src/lib/stf/stf-revision-number.ts`:
```ts
/**
 * Next flat revision number for an STF, mirroring the quote revision logic.
 * Root = the source number with trailing ".N" groups stripped. Next = the max
 * direct ".N" sibling among existingNumbers + 1. Always one level deep
 * (never ".1.1").
 */
export function nextStfRevisionNumber(sourceNumber: string, existingNumbers: string[]): string {
  const rootMatch = sourceNumber.match(/^(.+?)(?:\.\d+)*$/);
  const root = rootMatch ? rootMatch[1] : sourceNumber;
  const prefix = `${root}.`;
  const baseLen = prefix.length;
  const maxRev = existingNumbers.reduce((m, n) => {
    if (!n.startsWith(prefix)) return m;
    const suffix = n.slice(baseLen);
    const rev = /^\d+$/.test(suffix) ? parseInt(suffix, 10) : 0; // direct children only
    return Math.max(m, rev);
  }, 0);
  return `${root}.${maxRev + 1}`;
}
```

- [ ] **Step 4:** Run → pass. **Step 5:** Commit:
```bash
git add src/lib/stf/stf-revision-number.ts src/lib/stf/stf-revision-number.test.ts
git commit -m "STF revisions (2): flat .N revision-number helper (mirrors quote logic)"
```

---

## Task 3: Backend — status default, state machine, editable/delete gates

**Files:** `src/app/api/orders/route.ts`, `src/app/api/orders/[id]/route.ts`, `src/lib/orders/order-access.ts`.

- [ ] **Step 1:** `route.ts` POST — change `status: 'HAZIRLANIYOR'` (in the create) → `status: 'TASLAK'`. The dedup `status: { not: 'IPTAL' }` is unchanged.

- [ ] **Step 2:** `[id]/route.ts` — replace `orderStatusTransitions`:
```ts
const orderStatusTransitions: Record<string, string[]> = {
  TASLAK: ['TAMAMLANDI', 'IPTAL'],
  TAMAMLANDI: ['TASLAK', 'IPTAL'],
  IPTAL: ['TASLAK'],
};
```

- [ ] **Step 3:** `[id]/route.ts` DELETE — change the gate `existingOrder.status !== 'HAZIRLANIYOR'` → `!== 'TASLAK'`, and the error text to "Sadece taslak siparişler silinebilir".

- [ ] **Step 4:** `order-access.ts` — `STF_EDITABLE_STATUSES` → `['TASLAK']`. Update the doc comment.

- [ ] **Step 5:** Typecheck clean + suite green. Commit:
```bash
git add src/app/api/orders/route.ts "src/app/api/orders/[id]/route.ts" src/lib/orders/order-access.ts
git commit -m "STF statuses (3): TASLAK default, new state machine, edit/delete gates"
```

---

## Task 4: Revision route (clone)

**Files:** Create `src/app/api/orders/[id]/revisions/route.ts`.

**Reference:** `src/app/api/quotes/[id]/revisions/route.ts` (full-copy pattern, two-pass item copy with parentItemId remap, 409 on collision). For STF, copy the snapshot header/footer columns + `OrderItem` rows (incl. `sectionDiscountPct`/`sectionDiscountLabel`/`sectionNote`).

- [ ] **Step 1:** Implement:
```ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { QuoteItemType } from '@prisma/client';
import { nextStfRevisionNumber } from '@/lib/stf/stf-revision-number';

interface RouteParams { params: Promise<{ id: string }>; }

export async function POST(_req: NextRequest, { params }: RouteParams) {
  try {
    const user = await getSession();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;

    const source = await db.orderConfirmation.findUnique({
      where: { id },
      include: { items: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!source) return NextResponse.json({ error: 'STF bulunamadı' }, { status: 404 });

    // Only a completed STF can be revised (mirrors the owner's flow).
    if (source.status !== 'TAMAMLANDI') {
      return NextResponse.json({ error: 'Sadece tamamlanmış STF revize edilebilir' }, { status: 400 });
    }

    // Flat .N numbering off the source's root.
    const all = await db.orderConfirmation.findMany({ select: { orderNumber: true } });
    const revisionNumber = nextStfRevisionNumber(source.orderNumber, all.map((o) => o.orderNumber));

    const collision = await db.orderConfirmation.findFirst({
      where: { orderNumber: revisionNumber }, select: { id: true },
    });
    if (collision) {
      return NextResponse.json(
        { error: `"${revisionNumber}" numaralı bir STF zaten mevcut.` },
        { status: 409 }
      );
    }

    // Standalone copy — no parentOrderId link, starts as TASLAK, source untouched.
    const created = await db.orderConfirmation.create({
      data: {
        orderNumber: revisionNumber,
        quoteId: source.quoteId,
        companyId: source.companyId,
        status: 'TASLAK',
        createdById: user.id,
        notes: source.notes,
        deliveryDate: source.deliveryDate,
        customerName: source.customerName, customerAddress: source.customerAddress,
        customerPhone: source.customerPhone, customerTaxInfo: source.customerTaxInfo,
        projectName: source.projectName, quoteNo: source.quoteNo, refNo: source.refNo,
        formDate: source.formDate, siparisNo: source.siparisNo, currency: source.currency,
        discountTotal: source.discountTotal, grandTotal: source.grandTotal,
        manufacturers: source.manufacturers, warranty: source.warranty,
        deliveryPlace: source.deliveryPlace, deliveryTime: source.deliveryTime,
        paymentTerms: source.paymentTerms, vatNote: source.vatNote,
        customerApprovalName: source.customerApprovalName, btsResponsibleName: source.btsResponsibleName,
        items: {
          create: source.items.map((it) => ({
            sortOrder: it.sortOrder,
            itemType: it.itemType as QuoteItemType,
            pozNo: it.pozNo, code: it.code, brand: it.brand, model: it.model,
            description: it.description, quantity: it.quantity, unit: it.unit,
            unitPrice: it.unitPrice, totalPrice: it.totalPrice, priceLabel: it.priceLabel,
            parentItemId: it.parentItemId, discountPct: it.discountPct,
            sectionNote: it.sectionNote,
            sectionDiscountPct: it.sectionDiscountPct, sectionDiscountLabel: it.sectionDiscountLabel,
          })),
        },
      },
      include: { items: { orderBy: { sortOrder: 'asc' } } },
    });

    return NextResponse.json({ order: created }, { status: 201 });
  } catch (error) {
    console.error('STF revision error:', error);
    return NextResponse.json({ error: 'Revizyon oluşturulurken bir hata oluştu' }, { status: 500 });
  }
}
```
NOTE: `OrderItem.parentItemId` is a snapshot-only string (NOT a live FK — see schema comment), so copying it verbatim is correct and needs no remap (unlike the quote route's real FK). Confirm against the schema before finalizing.

- [ ] **Step 2:** Typecheck clean + suite green. Commit:
```bash
git add "src/app/api/orders/[id]/revisions/route.ts"
git commit -m "STF revisions (4): POST /orders/[id]/revisions — standalone .N clone of a completed STF"
```

---

## Task 5: STF detail page — statuses + buttons

**Files:** `src/app/(dashboard)/orders/[id]/page.tsx`.

- [ ] **Step 1:** `orderStatusLabels` → `{ TASLAK: 'Taslak', TAMAMLANDI: 'Tamamlandı', IPTAL: 'İptal' }`. `orderStatusVariants` → `{ TASLAK: 'default', TAMAMLANDI: 'success', IPTAL: 'error' }`. (Keep any legacy keys harmlessly or drop them.)

- [ ] **Step 2:** Status `<Select>` options → the 3 statuses only. The existing PATCH handler + state-machine enforce valid transitions, so a Select limited to the 3 is enough; invalid transitions get a 400 surfaced in the error banner.

- [ ] **Step 3:** Add action buttons in the action bar (next to PDF/Excel/Teklifi Gör), each calling the existing `handleStatusChange` (PATCH) or a new handler:
  - **"Taslağa Geri Çek"** — visible when `order.status === 'TAMAMLANDI'` → `handleStatusChange('TASLAK')`.
  - **"İptali Geri Al"** — visible when `order.status === 'IPTAL'` → `handleStatusChange('TASLAK')`.
  - **"Revize Oluştur"** — visible when `order.status === 'TAMAMLANDI'` → POST `/api/orders/${id}/revisions`, then `router.push('/orders/' + data.order.id)`. Mirror the quote page's `handleCreateRevision` (loading state, 409/error handling).
  - **"Sil"** — visible when `order.status === 'TASLAK'` (and the user has delete rights if applicable) → DELETE `/api/orders/${id}`, then `router.push('/orders')`. (Confirm with a window.confirm or a small confirm; avoid triggering a browser dialog that blocks — use a simple inline confirm state.)

- [ ] **Step 4:** Typecheck clean. Commit:
```bash
git add "src/app/(dashboard)/orders/[id]/page.tsx"
git commit -m "STF statuses (5): detail page — 3 statuses + Taslağa geri çek / İptali geri al / Revize Oluştur / Sil"
```

---

## Task 6: Siparişler list — statuses

**Files:** `src/app/(dashboard)/orders/page.tsx`.

- [ ] **Step 1:** `orderStatusLabels`/`orderStatusVariants` → 3 statuses (as Task 5 Step 1). Status filter `options` (line ~63) → `[{ value: 'TASLAK', label: 'Taslak' }, { value: 'TAMAMLANDI', label: 'Tamamlandı' }, { value: 'IPTAL', label: 'İptal' }]` (+ the "all" option if present). Default sort stays `createdAt desc` (revisions naturally surface on top — no change).

- [ ] **Step 2:** Typecheck clean + full suite green. Commit:
```bash
git add "src/app/(dashboard)/orders/page.tsx"
git commit -m "STF statuses (6): Siparişler list — 3 status labels + filter"
```

---

## Final verification (controller)
- [ ] `rm -rf .next && rm -f tsconfig.tsbuildinfo && npx tsc --noEmit 2>&1 | grep "error TS" | grep -vE "\.test\.ts|\.next/"` → empty.
- [ ] `npx vitest run` → green (668 + new helper tests).
- [ ] Dispatch a final integration review (status state-machine coherence; revision numbering vs the quote logic; migration safety incl. the two-file enum split; editable/delete gates align with the new statuses).
- [ ] Smoke-test (after deploy/restart): create STF (starts Taslak, editable) → set Tamamlandı (read-only) → "Taslağa Geri Çek" works → "Revize Oluştur" makes STF-####.1 (Taslak, standalone, appears on top of the list) → cancel + "İptali Geri Al" → delete a Taslak STF.
- [ ] Update the STF spec (§2 status set, §8 phase 4 revisions = DONE with the standalone/no-link model) + memory.

## Self-Review (vs owner requirements)
- 3 statuses (Taslak/Tamamlandı/İptal) ✓ — Tasks 1,5,6. Legacy values remapped, kept-but-unused ✓.
- Taslağa geri çek (Tamamlandı→Taslak) ✓; İptali geri al (İptal→Taslak) ✓ — Tasks 3,5.
- Editable only in Taslak ✓ (Task 3); deletable only in Taslak ✓ (Task 3,5).
- Revize Oluştur on Tamamlandı → STF-6000.1 standalone, flat .N, no link, Taslak, source untouched ✓ — Tasks 2,4,5 (mirrors current quote revision logic exactly).
- No grouped/linked view; newest-on-top via createdAt desc ✓ (Task 6, no change needed).
- Migration safe on live data (two-file enum split; remap; default) ✓ — Task 1.
