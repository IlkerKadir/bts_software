# Onayı Geri Çek (Retract Approval Request) — Design Spec

**Date:** 2026-04-21
**Status:** Ready for plan
**Author:** IlkerKadir + Claude
**Target release:** next deploy

## Goal

After a salesperson submits a quote for approval, they cannot edit it while its status is `ONAY_BEKLIYOR`. If they realize they need to fix something before an approver gets to it, they currently have no way out. Add an **"Onayı Geri Çek"** button that lets the quote's own creator roll the quote back to `TASLAK`, at which point editing unlocks again. Other roles see no such button — approvers can still Approve or Reject as today.

## Non-goals

- No new `Role` permission flag. The check is "user is the quote's creator", reusing existing `Quote.createdById`.
- No change to any other status transition (submit, approve, reject, cancel, send, close).
- No change to approval rules / approval-check audit entries.
- No change to clone / revert / revisions behavior.
- No touch-device / mobile-only UI tuning.
- Not covering the case where approvers "un-approve" a quote back to `ONAY_BEKLIYOR` — approvers already have a Reject→REVIZYON path for that.

## Current state (before this change)

- `src/lib/quote-status.ts` encodes a state machine. `ONAY_BEKLIYOR → {ONAYLANDI, REVIZYON, IPTAL}` — no path back to `TASLAK`.
- `src/app/api/quotes/[id]/status/route.ts` PUT — transactional status change. Authorization:
  - `ONAYLANDI` requires `user.role.canApprove`.
  - Other transitions allowed if the state machine allows them and the caller can access the quote.
- `src/app/api/quotes/[id]/status/route.ts` GET — returns the list of allowed transitions for the caller, filtering out `ONAYLANDI` when the caller is not an approver.
- Quote view page (`src/app/(dashboard)/quotes/[id]/page.tsx`) hosts a `StatusChangeDropdown` that reads the GET endpoint and renders each allowed transition as a menu item.
- `QuoteHistory` with action `STATUS_CHANGE` captures every transition (from/to/note delta). Used by the history timeline in the view page.
- Notifications: `src/lib/services/notification-service.ts` + `createNotification()`. Existing flow already notifies approvers on submit and notifies the creator on approve / reject / generic status change.
- Editor page computes `isEditable = status in {TASLAK, REVIZYON} || (status === ONAY_BEKLIYOR && user.role.canApprove)`. So once status flips back to `TASLAK`, the creator's editor is live again with no further change.

## Target state

### State machine

- `ONAY_BEKLIYOR` gains one new allowed target: `TASLAK`.
- Every other transition in `src/lib/quote-status.ts` stays identical.

### Authorization

- In the PUT `/api/quotes/[id]/status` route, when `currentStatus === 'ONAY_BEKLIYOR'` and `newStatus === 'TASLAK'`, require `user.id === quote.createdById`. Any other caller → 403 with Turkish message "Sadece teklifi oluşturan kullanıcı onayı geri çekebilir." The rest of the route's authorization stays unchanged.
- In the GET `/api/quotes/[id]/status` endpoint that lists available transitions, include `TASLAK` in the response ONLY when the caller is the creator AND current status is `ONAY_BEKLIYOR`. This keeps the dropdown clean for approvers viewing someone else's pending quote.

### Concurrency

The route already uses `db.$transaction` with a row-level re-read of `Quote` before the update, comparing the caller-provided `currentStatus` to the row's status. No extra lock needed. Race outcomes:
- **Creator retracts before approver approves** → retract succeeds, approver's approve POST fails with "Teklif durumu değişti" because the row is now `TASLAK` and TASLAK→ONAYLANDI is not an allowed transition.
- **Approver approves before creator retracts** → approve succeeds, retract POST fails with "Teklif durumu değişti" because the row is now `ONAYLANDI` and the retract path only activates on `ONAY_BEKLIYOR`.
- No data loss or partial writes in either ordering.

### Audit

- `QuoteHistory` entry with `action = 'STATUS_CHANGE'`, `changes = { status: { from: 'ONAY_BEKLIYOR', to: 'TASLAK' }, note: 'Onayı geri çekti' }` — created by the existing helper, no new code path.

### Notifications

Add one branch: when the new transition fires, notify all users with `role.canApprove = true` that the pending quote has been withdrawn, so they don't start reviewing something that no longer wants their attention.

- `type: 'SYSTEM'`
- `title: "Onay talebi geri çekildi"`
- `message: "{creator.fullName} kullanıcısı {quote.quoteNumber} numaralı teklifin onay talebini geri çekti. Teklif taslak durumuna geri döndü."`
- `link: "/quotes/{quote.id}"`

Reuses `createNotification()`. Same approvers list the submit flow uses.

### UI

On the quote view page (`src/app/(dashboard)/quotes/[id]/page.tsx`):

1. When `quote.status === 'ONAY_BEKLIYOR'` AND `user.id === quote.createdById`, render a dedicated **"Onayı Geri Çek"** button near the status badge (warning-colored so it reads distinct from Approve/Reject, which are visually loud green/red).
2. Click opens a confirmation prompt:
   > "Bu teklifin onay talebini geri çekip taslağa döndürmek istediğinize emin misiniz?"
   - Uses the component's existing confirm-dialog pattern if one exists; otherwise `window.confirm()` is acceptable (no other custom confirms are used on this page).
3. On confirm → PUT `/api/quotes/[id]/status` with `{ newStatus: 'TASLAK', currentStatus: quote.status, note: 'Onayı geri çekti' }`.
4. On success → reload the page (existing pattern after status changes) so the editor unlocks + the status badge updates.
5. On error → surface the route's error message in the existing toast / error banner slot.

Button stays OUT of the `StatusChangeDropdown` even though the GET endpoint includes TASLAK in the allowed list — we want a dedicated, obvious affordance for this specific user action. The dropdown entry is a fallback for power users.

### What does NOT change

- Prisma schema (`QuoteStatus` enum, `Role` flags).
- Any approve / reject route.
- Editor permission math (the editor becomes live automatically once status is `TASLAK`).
- Clone / revert / revisions.
- PDF / Excel / dashboards / orders.
- Any other role's view.

## Testing

### Automated

- Unit test the state-machine function exported from `src/lib/quote-status.ts` to confirm the new edge `ONAY_BEKLIYOR → TASLAK` is allowed.
- Unit test the authorization branch in the PUT route via integration test or a small helper test. At minimum: creator → allowed; non-creator approver → 403 on retract (but still allowed on approve).

### Manual

1. Create a quote as sales user `A`. Submit for approval.
2. Log in as `A`, open the quote view page. Confirm the "Onayı Geri Çek" button is visible.
3. Click it, confirm the dialog. Quote status changes to `TASLAK`.
4. Navigate to the editor — edits are allowed again.
5. Log in as an approver `B` while `A`'s quote is `ONAY_BEKLIYOR`. Confirm:
   - `B` does NOT see the "Onayı Geri Çek" button.
   - `B` sees Approve / Reject as before.
6. Log in as sales user `C` (not the creator) while `A`'s quote is `ONAY_BEKLIYOR`. Confirm `C` does NOT see the button.
7. Resubmit the quote, then log in as an approver and approve it. The retract path is now inactive (status is `ONAYLANDI`) — the button is gone even for creator `A`.
8. Check `QuoteHistory` in the DB (or the view page's history timeline) — a `STATUS_CHANGE` entry from ONAY_BEKLIYOR to TASLAK exists with a human-readable note.
9. Check the approver's notification list — a "Onay talebi geri çekildi" entry is present.

## Risk notes (production)

- **Smallest possible surface**: one transition edge, one authorization branch, one notification branch, one button. All paths are guarded by existing transactional mechanics.
- **No schema migration** — zero DB risk.
- **Rollback**: a single `git revert` cleanly disables everything. Quotes in `TASLAK` that arrived via retraction are indistinguishable from any other `TASLAK` quote.
- **Audit completeness**: the STATUS_CHANGE history entry has the note field set, so someone auditing the timeline sees the intent ("Onayı geri çekti") not just the bare from/to.

## Out of scope

- Admin override to retract someone else's pending quote. The user explicitly said creator-only.
- Retracting an already-approved quote (`ONAYLANDI → TASLAK`). Not requested, and conceptually a different workflow (approvers already have Reject→REVIZYON).
- Configurable time window on retraction (e.g., "only within the first hour"). Not requested.
- Bulk retraction across multiple quotes. Not requested.
