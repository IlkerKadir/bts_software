# Düzenleme Talep Et (Edit Request) — Design Spec

**Date:** 2026-04-21
**Status:** Ready for plan
**Author:** IlkerKadir + Claude
**Target release:** next deploy (immediate follow-up to the Onayı Geri Çek feature)

## Goal

Today, when an approver rejects a quote that is awaiting approval, the quote moves to the `REVIZYON` state and the creator receives a "Revizyon Gerekli" notification. This collides semantically with the app's unrelated "Revizyon Oluştur" feature (a client-facing clone/revision of an already-sent quote). Rename and rewire the approver-rejection path to be an **edit request**: the quote returns to `TASLAK` (draft), the creator receives a "Düzenleme talep edildi" notification carrying the approver's note, and the word *revizyon* is freed up to refer exclusively to the customer-facing revision concept.

## Non-goals

- No change to the `REVIZYON` enum value itself. The state still exists and remains reachable from `GONDERILDI` and `TAKIPTE` (legitimate customer-driven revision flows).
- No migration of existing quotes that are currently in `REVIZYON`. They keep working — a `REVIZYON → ONAY_BEKLIYOR` resubmit path is preserved.
- No change to the "Revizyon Oluştur" button (clone into a new revision quote).
- No change to the creator's "Onayı Geri Çek" path (already ships).
- No change to approval-check rule logic, to clone / revert / revisions, PDF / Excel, dashboards, or orders.
- No new permission flag — reuses `role.canApprove`.

## Current state (before this change)

- `src/lib/quote-status.ts`: `ONAY_BEKLIYOR → { ONAYLANDI, REVIZYON, IPTAL, TASLAK }`. (`TASLAK` was added by the preceding Onayı Geri Çek feature.)
- `src/app/api/quotes/[id]/status/route.ts` PUT:
  - For `newStatus === 'ONAYLANDI'`: requires `role.canApprove`.
  - For `ONAY_BEKLIYOR → TASLAK`: requires `user.id === quote.createdById` (creator-only — from the Onayı Geri Çek feature).
  - For `newStatus === 'REVIZYON'`: no per-role guard; anyone with access can hit this. Notifies creator with `type: 'QUOTE_REJECTED'`, title "Revizyon Gerekli", message "`{quoteNumber} numaralı teklif için revizyon istendi`".
- Approver's rejection UI lives in the editor page (`src/app/(dashboard)/quotes/[id]/edit/QuoteEditor.tsx`):
  - `handleRejectFromEditor` prompts `"Revizyon nedeni:"`, POSTs `{ status: 'REVIZYON', note }`.
  - Triggered by a "Reddet" / "Revizyon" button visible only when `status === 'ONAY_BEKLIYOR' && canApprove`.

## Target state

### State machine

- Remove `'REVIZYON'` from `ONAY_BEKLIYOR`'s allowed-transition list in `src/lib/quote-status.ts`. New list: `['ONAYLANDI', 'IPTAL', 'TASLAK']`.
- Every other transition (including `GONDERILDI → REVIZYON`, `TAKIPTE → REVIZYON`, `REVIZYON → ONAY_BEKLIYOR`, `REVIZYON → IPTAL`) stays identical.
- Unit test: `canTransitionTo('ONAY_BEKLIYOR', 'REVIZYON') === false`.

### PUT `/api/quotes/[id]/status`

Replace the current `ONAY_BEKLIYOR → TASLAK` creator-only guard with a two-path guard that distinguishes retract (creator) from edit-request (approver):

```ts
if (currentStatus === 'ONAY_BEKLIYOR' && newStatus === 'TASLAK') {
  const isCreator = user.id === quote.createdById;
  const isApprover = user.role.canApprove;
  if (!isCreator && !isApprover) {
    return 403 'Bu işlem için yetkiniz yok';
  }
  // When the approver is requesting edits, a note is required — the
  // whole point is to tell the salesperson what to fix.
  if (!isCreator && isApprover) {
    const note = (body.note ?? '').toString().trim();
    if (!note) {
      return 400 'Düzenleme talebi için not gereklidir';
    }
  }
}
```

Creator-wins precedence: if `user.id === createdById` AND `user.role.canApprove`, treat as retract (no note required). Rare edge case — an approver retracting their own submission.

### Notification branches

Replace the existing `else if (newStatus === 'REVIZYON')` branch with the new edit-request branch under the `ONAY_BEKLIYOR → TASLAK` fork. Concretely the notification if/else chain becomes:

1. `newStatus === 'ONAY_BEKLIYOR'` — notify approvers (unchanged).
2. `newStatus === 'ONAYLANDI'` — notify creator (unchanged).
3. `currentStatus === 'ONAY_BEKLIYOR' && newStatus === 'TASLAK' && isCreator` — notify approvers "Onay talebi geri çekildi" (existing Onayı Geri Çek behavior).
4. **NEW:** `currentStatus === 'ONAY_BEKLIYOR' && newStatus === 'TASLAK' && !isCreator && isApprover` — notify creator:
   - `type: 'QUOTE_REJECTED'`
   - `title: 'Düzenleme talep edildi'`
   - `message: "{user.fullName} {quoteNumber} numaralı teklif için düzenleme talep etti: {note}"`
   - `link: /quotes/{quoteId}`
5. `newStatus === 'REVIZYON'` — REMOVE the current branch that notifies creator "Revizyon Gerekli". The only remaining callers for REVIZYON are from GONDERILDI / TAKIPTE (customer-driven). Those already fall through to the generic else branch which posts a "Teklif {n} durumu değişti" system notification to the creator. That's the right fit — no approver action needed, no custom message.
6. `else` — generic status-change notification (unchanged).

### Editor UI

`src/app/(dashboard)/quotes/[id]/edit/QuoteEditor.tsx`:

- In `handleRejectFromEditor` (lines 1653–1682):
  - Change `prompt('Revizyon nedeni:')` → `prompt('Düzenleme talebi notu:')`.
  - Change body `{ status: 'REVIZYON', note }` → `{ status: 'TASLAK', note }`.
  - Change `setQuote((prev) => (prev ? { ...prev, status: 'REVIZYON' } : prev))` → `{ ...prev, status: 'TASLAK' }`.
  - Change `setSuccessMessage('Teklif revizyona gönderildi')` → `setSuccessMessage('Düzenleme talebi gönderildi')`.
  - Error message stays ("Reddetme sırasında bir hata oluştu") — it's already generic.
- In the JSX that renders the reject button (around line 2161), rename the button label from "Revizyon" / "Reddet" to **"Düzenleme Talep Et"**. Keep the existing visibility gate (`status === 'ONAY_BEKLIYOR' && canApprove`) and the click handler binding.

### StatusChangeDropdown on the view page

`src/components/quotes/StatusChangeDropdown.tsx` reads transitions from the GET `/status` endpoint. Because we removed `'REVIZYON'` from `ONAY_BEKLIYOR`'s allowed list, the dropdown will automatically stop showing REVIZYON as an option when status is ONAY_BEKLIYOR. No explicit filter change needed.

### What does NOT change

- Prisma schema. `QuoteStatus` enum keeps all nine values; `Role` flags unchanged.
- The dedicated "Onayı Geri Çek" creator button on the view page (keeps working with its existing note `"Onayı geri çekti"`).
- `REVIZYON` status label ("Revizyon"), badge color ("warning"), and its presence in GONDERILDI→REVIZYON / TAKIPTE→REVIZYON / REVIZYON→ONAY_BEKLIYOR paths — all preserved for the customer-driven revision workflow.
- Status history. `QuoteHistory STATUS_CHANGE` entries record `{from: 'ONAY_BEKLIYOR', to: 'TASLAK', note}` exactly as today. Readers of the timeline can distinguish retracts from edit requests by looking at who authored the history entry (creator vs approver) or by the note content.

## Concurrency

The PUT route already does a transactional `findUnique → check → update`. Two ordering outcomes remain safe:

- Approver rejects first, creator retracts second → retract fails because row is now `TASLAK` and `TASLAK → TASLAK` is a no-op transition that the state machine refuses.
- Creator retracts first, approver rejects second → reject fails for the same reason.

Neither ordering allows double-rejection or data loss.

## Testing

### Automated

- Existing test `canTransitionTo('ONAY_BEKLIYOR', 'REVIZYON')` must flip from `true` to `false`. Search `src/lib/quote-status.test.ts` for the test that asserts this transition and update the expectation.
- Add test `canTransitionTo('GONDERILDI', 'REVIZYON')` remains `true` (regression guard for the customer-driven path).
- Full vitest suite must remain green (517+).

### Manual

1. Create a quote as sales user `A`, submit for approval.
2. Log in as approver `B`. Open the editor. Confirm the button now reads **"Düzenleme Talep Et"** (not "Revizyon" / "Reddet").
3. Click it. Prompt reads "Düzenleme talebi notu:". Enter a non-empty note ("Fiyat tekrar kontrol edilmeli"). Submit.
4. Quote status changes to **TASLAK** (not REVIZYON).
5. Log in as `A`. The notification bell shows **"Düzenleme talep edildi"** with `B`'s name + the note text. Clicking routes to the quote view page.
6. Open the editor — edits are live again (as for any draft). Resubmit for approval.
7. `B` rejects without entering a note → the PUT returns 400 with "Düzenleme talebi için not gereklidir" and the editor shows the error.
8. Regression: log in as any user with a quote in `GONDERILDI` state and transition it to `REVIZYON` via the status dropdown (customer-driven flow). This still works and the creator gets a generic "durumu değişti" notification.
9. Regression: quote in existing `REVIZYON` state (pre-change) — its creator can still resubmit for approval (`REVIZYON → ONAY_BEKLIYOR`). No data corruption.
10. Regression: creator's "Onayı Geri Çek" button still works — retract remains the creator-only path.

## Risk notes (production)

- **Single state-machine edge removed + one auth branch rewired + notification routing changed + UI label/body swapped.** Tight blast radius.
- **No schema change, no migration.** Existing REVIZYON quotes are data-compatible.
- **Rollback:** single `git revert` restores the previous approver-reject flow. Quotes that went through the new edit-request path stay in `TASLAK` (still a valid state) — no data-repair required.
- **Training:** approvers and salespeople should be informed of the label change. Brief email / Slack note is sufficient — no docs pages mention "Revizyon" in the approver-reject context.

## Out of scope

- Storing the edit-request note as a first-class field on `Quote` (e.g., `lastEditRequestNote`). The note lives in `QuoteHistory.changes.note` and in the notification body — readable but not first-class. Could be a follow-up if users ask for a visible banner.
- Visual banner on the view/editor page showing "Son düzenleme talebi: ..." for a TASLAK quote that came from an approver rejection. Nice-to-have but not requested.
- Removing the `REVIZYON` state entirely. Still valid for customer-driven flows.
