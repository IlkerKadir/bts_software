# Düzenleme Talep Et (Edit Request) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewire the approver-rejection flow so rejecting a pending quote moves it to `TASLAK` (not `REVIZYON`) and notifies the creator with a "Düzenleme talep edildi" message carrying the approver's note. Frees the word "revizyon" for the customer-driven revision concept.

**Architecture:** Remove `REVIZYON` from `ONAY_BEKLIYOR`'s allowed transitions. Combine the existing creator-retract path with a new approver-reject path on `ONAY_BEKLIYOR → TASLAK` (with required note). Swap notification branches. Update editor UI: the reject button posts `TASLAK` and is relabeled "Düzenleme Talep Et".

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Prisma, Vitest.

**Spec:** `docs/superpowers/specs/2026-04-21-edit-request-design.md`

---

## File structure

**Modify:**
- `src/lib/quote-status.ts` — remove `'REVIZYON'` from `ONAY_BEKLIYOR`'s allowed-transitions list
- `src/lib/quote-status.test.ts` — flip the existing "allows ONAY_BEKLIYOR to REVIZYON (rejection)" test to assert `false`
- `src/app/api/quotes/[id]/status/route.ts` — PUT: combine creator-retract + approver-reject under one auth branch; swap notification branches (add "Düzenleme talep edildi", remove "Revizyon Gerekli")
- `src/app/(dashboard)/quotes/[id]/edit/QuoteEditor.tsx` — `handleRejectFromEditor`: prompt label, request body `status: 'TASLAK'`, success toast, local state update
- `src/components/quotes/QuoteEditorHeader.tsx` — reject button label `"Revizyon"` → `"Düzenleme Talep Et"`, title `"Revizyona Gönder"` → `"Düzenleme talep gönder"`

**Not modified:**
- Prisma schema. No enum or column change.
- The standalone "Onayı Geri Çek" button on the view page (still creator-only, still uses note `"Onayı geri çekti"`).
- `REVIZYON` label, color, or any of its other transitions.
- Clone / revert / revisions / PDF / Excel / dashboards / orders / approvals page.

---

### Task 1: Remove REVIZYON from ONAY_BEKLIYOR transitions (TDD)

**Files:**
- Modify: `src/lib/quote-status.ts`
- Test: `src/lib/quote-status.test.ts`

- [ ] **Step 1: Flip the existing test from `true` to `false`**

Open `src/lib/quote-status.test.ts`. Find the existing test around line 28:

```ts
    it('allows ONAY_BEKLIYOR to REVIZYON (rejection)', () => {
      expect(canTransitionTo('ONAY_BEKLIYOR', 'REVIZYON')).toBe(true);
    });
```

Replace with:

```ts
    it('does NOT allow ONAY_BEKLIYOR to REVIZYON (approver rejection now routes to TASLAK)', () => {
      expect(canTransitionTo('ONAY_BEKLIYOR', 'REVIZYON')).toBe(false);
    });
```

- [ ] **Step 2: Add a regression-guard test for GONDERILDI → REVIZYON**

In the same `describe('canTransitionTo', ...)` block, add a test confirming the customer-driven revision path still works. Place it near the other GONDERILDI-origin tests:

```ts
    it('still allows GONDERILDI to REVIZYON (customer-driven revision)', () => {
      expect(canTransitionTo('GONDERILDI', 'REVIZYON')).toBe(true);
    });
```

- [ ] **Step 3: Run tests — expect the flipped test to fail**

Run: `npx vitest run src/lib/quote-status.test.ts -t 'ONAY_BEKLIYOR to REVIZYON'`
Expected: FAIL — state machine currently returns `true`, but the test now asserts `false`.

- [ ] **Step 4: Remove the edge in the state machine**

Open `src/lib/quote-status.ts`. Find the `statusTransitions` object (around line 21):

```ts
const statusTransitions: Record<QuoteStatus, QuoteStatus[]> = {
  TASLAK: ['ONAY_BEKLIYOR', 'IPTAL'],
  ONAY_BEKLIYOR: ['ONAYLANDI', 'REVIZYON', 'IPTAL', 'TASLAK'],
  ONAYLANDI: ['GONDERILDI', 'IPTAL'],
  GONDERILDI: ['TAKIPTE', 'KAZANILDI', 'KAYBEDILDI', 'REVIZYON'],
  ...
```

Change the `ONAY_BEKLIYOR` row to:

```ts
  ONAY_BEKLIYOR: ['ONAYLANDI', 'IPTAL', 'TASLAK'],
```

- [ ] **Step 5: Run tests — expect pass**

Run: `npx vitest run src/lib/quote-status.test.ts`
Expected: All tests pass, including the flipped one and the new GONDERILDI→REVIZYON guard.

- [ ] **Step 6: Commit**

```bash
git add src/lib/quote-status.ts src/lib/quote-status.test.ts
git commit -m "$(cat <<'EOF'
feat(quotes): remove ONAY_BEKLIYOR → REVIZYON from state machine

Approver rejection now routes to TASLAK (wired in the next commit).
Customer-driven REVIZYON from GONDERILDI / TAKIPTE is unchanged —
covered by a new regression test.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Rewire PUT route — combined auth + new notification branch

**Files:**
- Modify: `src/app/api/quotes/[id]/status/route.ts`

- [ ] **Step 1: Replace the creator-only auth branch with combined auth**

Find the current creator-only guard (around lines 79–91):

```ts
    // Retract approval request (ONAY_BEKLIYOR → TASLAK) is scoped to
    // the quote's own creator. Approvers use Approve / Reject; any
    // other path is blocked.
    if (
      currentStatus === 'ONAY_BEKLIYOR' &&
      newStatus === 'TASLAK' &&
      user.id !== quote.createdById
    ) {
      return NextResponse.json(
        { error: 'Sadece teklifi oluşturan kullanıcı onayı geri çekebilir.' },
        { status: 403 }
      );
    }
```

Replace with:

```ts
    // ONAY_BEKLIYOR → TASLAK covers two paths:
    //   1. Creator retracts their own submission ("Onayı Geri Çek").
    //   2. Approver requests edits ("Düzenleme Talep Et"); a note is
    //      required so the salesperson knows what to fix.
    // Anyone else is blocked.
    if (currentStatus === 'ONAY_BEKLIYOR' && newStatus === 'TASLAK') {
      const isCreator = user.id === quote.createdById;
      const isApprover = !!user.role.canApprove;
      if (!isCreator && !isApprover) {
        return NextResponse.json(
          { error: 'Bu işlem için yetkiniz yok' },
          { status: 403 }
        );
      }
      if (!isCreator && isApprover) {
        const note = typeof body.note === 'string' ? body.note.trim() : '';
        if (!note) {
          return NextResponse.json(
            { error: 'Düzenleme talebi için not gereklidir' },
            { status: 400 }
          );
        }
      }
    }
```

- [ ] **Step 2: Replace the REVIZYON notification branch with the edit-request branch**

Find the existing `else if (newStatus === 'REVIZYON')` block (around lines 273–285):

```ts
    } else if (newStatus === 'REVIZYON') {
      // Notify quote creator about revision request
      try {
        await createNotification({
          userId: creatorId,
          type: 'QUOTE_REJECTED',
          title: 'Revizyon Gerekli',
          message: `${updatedQuote.quoteNumber} numaralı teklif için revizyon istendi`,
          link: `/quotes/${quoteId}`,
        });
      } catch (notificationError) {
        console.error('Notification creation error (REVIZYON) for userId:', creatorId, notificationError);
      }
    } else if (currentStatus === 'ONAY_BEKLIYOR' && newStatus === 'TASLAK') {
      // Retraction — notify approvers so they don't review a withdrawn quote.
```

Delete the `else if (newStatus === 'REVIZYON')` block entirely and split the existing `ONAY_BEKLIYOR → TASLAK` retract branch into two — creator-retract (approvers notified) vs approver-reject (creator notified with note). After deletion and split, the relevant section should read:

```ts
    } else if (currentStatus === 'ONAY_BEKLIYOR' && newStatus === 'TASLAK' && user.id === quote.createdById) {
      // Creator retraction — notify approvers so they don't review a
      // withdrawn quote.
      try {
        const approvers = await db.user.findMany({
          where: { role: { canApprove: true }, isActive: true },
          select: { id: true },
        });
        for (const approver of approvers) {
          await createNotification({
            userId: approver.id,
            type: 'SYSTEM',
            title: 'Onay talebi geri çekildi',
            message: `${user.fullName} kullanıcısı ${updatedQuote.quoteNumber} numaralı teklifin onay talebini geri çekti. Teklif taslak durumuna geri döndü.`,
            link: `/quotes/${quoteId}`,
          });
        }
      } catch (notificationError) {
        console.error('Notification creation error (retract):', notificationError);
      }
    } else if (currentStatus === 'ONAY_BEKLIYOR' && newStatus === 'TASLAK' && user.role.canApprove) {
      // Approver edit request — notify creator with the note.
      try {
        const note = typeof body.note === 'string' ? body.note.trim() : '';
        await createNotification({
          userId: creatorId,
          type: 'QUOTE_REJECTED',
          title: 'Düzenleme talep edildi',
          message: `${user.fullName} ${updatedQuote.quoteNumber} numaralı teklif için düzenleme talep etti: ${note}`,
          link: `/quotes/${quoteId}`,
        });
      } catch (notificationError) {
        console.error('Notification creation error (edit-request) for userId:', creatorId, notificationError);
      }
    } else {
```

(The `else` below is the generic fallthrough branch — leave it unchanged.)

- [ ] **Step 3: Verify compile**

Run: `npx tsc --noEmit`
Expected: No new errors. Pre-existing Prisma-mock errors in `*.test.ts` files stay.

- [ ] **Step 4: Run vitest**

Run: `npx vitest run`
Expected: All existing tests pass (plus Task 1's new/flipped tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/quotes/[id]/status/route.ts
git commit -m "$(cat <<'EOF'
feat(quotes): approver edit request on pending quote → TASLAK + note

PUT /api/quotes/[id]/status:
  - ONAY_BEKLIYOR → TASLAK now accepts creator (retract) OR approver
    (edit-request). Approver path requires a non-empty note.
  - New notification branch: approver edit request → creator gets
    "Düzenleme talep edildi" with the note.
  - Old "Revizyon Gerekli" branch removed (no longer reachable).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Update editor reject handler

**Files:**
- Modify: `src/app/(dashboard)/quotes/[id]/edit/QuoteEditor.tsx`

- [ ] **Step 1: Rewrite `handleRejectFromEditor`**

Find the existing handler (around lines 1653–1682):

```ts
  const handleRejectFromEditor = useCallback(async () => {
    if (!quote || hasChanges) return;

    const note = prompt('Revizyon nedeni:');
    if (!note) return;

    try {
      const res = await fetch(`/api/quotes/${quoteId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'REVIZYON', note }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Reddetme işlemi başarısız');
      }

      setQuote((prev) => (prev ? { ...prev, status: 'REVIZYON' } : prev));
      setSuccessMessage('Teklif revizyona gönderildi');

      setTimeout(() => {
        router.push(`/quotes/${quoteId}`);
      }, 1500);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Reddetme sırasında bir hata oluştu'
      );
    }
  }, [quote, quoteId, hasChanges, router]);
```

Replace with:

```ts
  const handleRejectFromEditor = useCallback(async () => {
    if (!quote || hasChanges) return;

    const note = prompt('Düzenleme talebi notu:');
    if (!note || !note.trim()) return;

    try {
      const res = await fetch(`/api/quotes/${quoteId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'TASLAK', note: note.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Düzenleme talebi gönderilemedi');
      }

      setQuote((prev) => (prev ? { ...prev, status: 'TASLAK' } : prev));
      setSuccessMessage('Düzenleme talebi gönderildi');

      setTimeout(() => {
        router.push(`/quotes/${quoteId}`);
      }, 1500);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Düzenleme talebi sırasında bir hata oluştu'
      );
    }
  }, [quote, quoteId, hasChanges, router]);
```

Four changes from the original:
- `prompt('Revizyon nedeni:')` → `prompt('Düzenleme talebi notu:')`
- Request body `status: 'REVIZYON'` → `status: 'TASLAK'`
- Local state update `status: 'REVIZYON'` → `status: 'TASLAK'`
- Success / error messages updated to "Düzenleme talebi …"

- [ ] **Step 2: Verify compile**

Run: `npx tsc --noEmit`
Expected: No new errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(dashboard)/quotes/[id]/edit/QuoteEditor.tsx"
git commit -m "$(cat <<'EOF'
feat(quotes): editor reject button posts TASLAK with edit-request note

handleRejectFromEditor now drives the "Düzenleme Talep Et" action.
Prompt, request body, local state, and toast messages updated.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Rename the reject button in the editor header

**Files:**
- Modify: `src/components/quotes/QuoteEditorHeader.tsx`

- [ ] **Step 1: Update the button label and title**

Find the reject button JSX (around lines 591–603):

```tsx
        {onReject && (
          <Button
            variant="secondary"
            size="sm"
            onClick={onReject}
            disabled={hasChanges}
            title={hasChanges ? 'Önce değişiklikleri kaydedin' : 'Revizyona Gönder'}
            className="text-red-600 hover:bg-red-50"
          >
            <XCircle className="h-4 w-4" />
            Revizyon
          </Button>
        )}
```

Replace with:

```tsx
        {onReject && (
          <Button
            variant="secondary"
            size="sm"
            onClick={onReject}
            disabled={hasChanges}
            title={hasChanges ? 'Önce değişiklikleri kaydedin' : 'Düzenleme talebini gönder — teklif taslağa geri döner'}
            className="text-red-600 hover:bg-red-50"
          >
            <XCircle className="h-4 w-4" />
            Düzenleme Talep Et
          </Button>
        )}
```

Only the `title` string and the text content (`Revizyon` → `Düzenleme Talep Et`) change. Icon, variant, className, and click handler stay.

- [ ] **Step 2: Verify compile**

Run: `npx tsc --noEmit`
Expected: No new errors.

- [ ] **Step 3: Run vitest**

Run: `npx vitest run`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/quotes/QuoteEditorHeader.tsx
git commit -m "$(cat <<'EOF'
feat(quotes): rename reject button to "Düzenleme Talep Et"

Also updates the tooltip to describe the new behavior (quote
returns to TASLAK) instead of the old "Revizyona Gönder".

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Manual verification

- [ ] **Step 1: Start dev server**

Run: `npm run dev`
Expected: App starts.

- [ ] **Step 2: Approver edit-request happy path**

Log in as sales user `A`. Create or open a quote, submit for approval.
Log in as approver `B`. Open the editor (approver can edit ONAY_BEKLIYOR quotes).
- Confirm the reject button reads **"Düzenleme Talep Et"** (not "Revizyon" / "Reddet"). Hover shows tooltip "Düzenleme talebini gönder — teklif taslağa geri döner".
- Click it. Prompt reads "Düzenleme talebi notu:". Type a non-empty note (e.g., "Lütfen fiyatı tekrar kontrol edin.") and confirm.
- Toast shows "Düzenleme talebi gönderildi". Page navigates to the view page.
- Status badge now reads **"Taslak"** (not "Revizyon").

- [ ] **Step 3: Empty-note rejection blocked**

As approver `B`, submit another quote and open the editor. Click "Düzenleme Talep Et", then cancel the prompt OR submit an empty/whitespace-only note.
- Expected: no API call fires (client-side guard in `handleRejectFromEditor`).
- As belt-and-suspenders: manually POST via curl/devtools with `{status: 'TASLAK', note: ''}` while authenticated as `B`. Expected: 400 with "Düzenleme talebi için not gereklidir".

- [ ] **Step 4: Creator sees the edit-request notification**

Log in as creator `A`. Open the notification bell.
- Expect an entry titled **"Düzenleme talep edildi"** with message `"<B's name> <quote number> numaralı teklif için düzenleme talep etti: <note text>"`. Clicking the link navigates to the quote view page.

- [ ] **Step 5: Creator can edit and resubmit**

As `A`, open the quote (now in TASLAK). Navigate to the editor. Confirm edits are live. Make a small edit, save. Resubmit for approval. Status returns to ONAY_BEKLIYOR. Approver notification fires on the new submission.

- [ ] **Step 6: Status dropdown on view page no longer offers REVIZYON for pending quotes**

While a quote is in ONAY_BEKLIYOR, open the view page and click the status badge's dropdown (StatusChangeDropdown). Confirm:
- No "Revizyon" entry in the dropdown.
- Entries present: Onaylandı (if approver), Taslak (if creator), İptal (if allowed by role).

- [ ] **Step 7: Customer-driven REVIZYON (GONDERILDI → REVIZYON) still works**

Find or create a quote in `GONDERILDI` state. Use the status dropdown to transition it to `REVIZYON`. The transition succeeds; the creator receives a generic "Teklif {n} durumu değişti" system notification. No regression.

- [ ] **Step 8: Pre-existing REVIZYON quotes are unaffected**

If any quote in the DB is currently in `REVIZYON` state (from before this change), confirm it still renders correctly on the view page, and the creator can still resubmit it (`REVIZYON → ONAY_BEKLIYOR`).

- [ ] **Step 9: Creator's "Onayı Geri Çek" still works**

As creator `A`, submit a quote, then click "Onayı Geri Çek" on the view page. Confirm it still retracts to TASLAK and approvers get the "Onay talebi geri çekildi" notification (not the new "Düzenleme talep edildi" — that's for the approver path only).

- [ ] **Step 10: If any scenario fails**

Don't close out. Diagnose and fix in a follow-up commit. Common failure modes:
- **400 on valid note** → `body.note` typing or trim check incorrect. Verify the PUT route's note validation.
- **Creator sees "Düzenleme talep edildi" when they retract themselves** → the notification split condition missed `isCreator`. Check the `else if` order in Task 2 Step 2 — creator-retract branch must come first.
- **Dropdown still shows "Revizyon" from ONAY_BEKLIYOR** → the state machine change in Task 1 Step 4 didn't land, or the client is caching a stale response. Hard reload.

Fix and re-verify.

---

## Self-review notes

- **Spec coverage:** state machine edge removed + tests (Task 1), combined PUT auth + notification rewiring (Task 2), editor request body + prompt + messages (Task 3), UI button label (Task 4), 9-scenario manual check (Task 5). Every risk note in the spec has a handling branch or verification step.
- **Placeholders:** none — every code block is complete and copy-pasteable.
- **Type consistency:** same `isCreator` / `isApprover` naming used in route auth and notification branches. Same request body `{status: 'TASLAK', note}` shape across client and server. Status values always `'ONAY_BEKLIYOR'` / `'TASLAK'` string literals.
- **Rollback:** single `git revert` per task restores previous behavior cleanly. If only the UI is broken, revert Task 3 / Task 4 alone.

## Out of scope (not in this plan)

- Adding a `lastEditRequestNote` column on `Quote` and rendering a banner in the editor ("Son düzenleme talebi: ..."). The note lives in notifications and `QuoteHistory.changes.note` — sufficient for MVP.
- Removing the `REVIZYON` enum value entirely. Still used by GONDERILDI → REVIZYON and TAKIPTE → REVIZYON.
- Replacing `window.prompt()` with a styled modal for the note.
