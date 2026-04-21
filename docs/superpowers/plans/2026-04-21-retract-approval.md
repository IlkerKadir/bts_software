# Onayı Geri Çek (Retract Approval) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the quote's creator move a pending quote (`ONAY_BEKLIYOR`) back to `TASLAK` via a dedicated "Onayı Geri Çek" button on the view page, unlocking the editor for further edits before an approver has acted.

**Architecture:** One new edge in the state machine. One auth branch in the PUT status route. One filter in the GET status route. One notification branch to approvers. One button in the view page. All guarded by existing transactional mechanics — no schema change.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Prisma (PostgreSQL), Vitest.

**Spec:** `docs/superpowers/specs/2026-04-21-retract-approval-design.md`

---

## File structure

**Modify:**
- `src/lib/quote-status.ts` — add `TASLAK` to `ONAY_BEKLIYOR`'s allowed transitions
- `src/lib/quote-status.test.ts` — add test for the new edge
- `src/app/api/quotes/[id]/status/route.ts` — PUT: creator-only gate for the ONAY_BEKLIYOR→TASLAK path + approver-notification branch. GET: filter TASLAK from allowed transitions unless the caller is the creator.
- `src/app/(dashboard)/quotes/[id]/page.tsx` — fetch `currentUserId` from `/api/auth/me`, show "Onayı Geri Çek" button, wire confirm + PUT

**Not modified:**
- DB schema. No migration.
- Editor page (`QuoteEditor.tsx`) — its `isEditable` math already turns back on when status is `TASLAK`.
- Clone / revert / revisions / PDF / Excel / dashboards / orders.

---

### Task 1: State machine edge (TDD)

**Files:**
- Modify: `src/lib/quote-status.ts`
- Test: `src/lib/quote-status.test.ts`

- [ ] **Step 1: Add failing test**

Open `src/lib/quote-status.test.ts`. Inside the existing `describe('canTransitionTo', ...)` block, add this test next to the other `ONAY_BEKLIYOR`-origin tests (search for "allows ONAY_BEKLIYOR to ONAYLANDI"):

```ts
    it('allows ONAY_BEKLIYOR to TASLAK (retract approval)', () => {
      expect(canTransitionTo('ONAY_BEKLIYOR', 'TASLAK')).toBe(true);
    });
```

- [ ] **Step 2: Run test — expect fail**

Run: `npx vitest run src/lib/quote-status.test.ts -t 'ONAY_BEKLIYOR to TASLAK'`
Expected: FAIL — the state machine still returns false for this edge.

- [ ] **Step 3: Add the edge**

Open `src/lib/quote-status.ts`. Find the `statusTransitions` object (around line 21–31):

```ts
const statusTransitions: Record<QuoteStatus, QuoteStatus[]> = {
  TASLAK: ['ONAY_BEKLIYOR', 'IPTAL'],
  ONAY_BEKLIYOR: ['ONAYLANDI', 'REVIZYON', 'IPTAL'],
  ...
```

Change the `ONAY_BEKLIYOR` row to:

```ts
  ONAY_BEKLIYOR: ['ONAYLANDI', 'REVIZYON', 'IPTAL', 'TASLAK'],
```

- [ ] **Step 4: Run test — expect pass**

Run: `npx vitest run src/lib/quote-status.test.ts`
Expected: All tests pass, including the new one.

- [ ] **Step 5: Commit**

```bash
git add src/lib/quote-status.ts src/lib/quote-status.test.ts
git commit -m "$(cat <<'EOF'
feat(quotes): allow ONAY_BEKLIYOR → TASLAK in state machine

New edge only; authorization (creator-only) is enforced in the
PUT /api/quotes/[id]/status route, not here.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: PUT route — creator-only gate + approver notification

**Files:**
- Modify: `src/app/api/quotes/[id]/status/route.ts`

- [ ] **Step 1: Add creator-only authorization branch**

Find the existing approval authorization block (around line 72–77):

```ts
    // Check permissions for approval
    if (newStatus === 'ONAYLANDI' && !user.role.canApprove) {
      return NextResponse.json(
        { error: 'Teklif onaylama yetkiniz bulunmuyor' },
        { status: 403 }
      );
    }
```

Directly below it, add the new retract-authorization check:

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

- [ ] **Step 2: Add approver-notification branch**

Find the notification if/else chain (around line 225–285). It currently branches on `newStatus === 'ONAY_BEKLIYOR' | 'ONAYLANDI' | 'REVIZYON' | else`. We need to insert a new branch for the retract case that triggers when `currentStatus === 'ONAY_BEKLIYOR'` AND `newStatus === 'TASLAK'`. Best place: make it explicit before the generic `else` falls through. Find this line (around line 272):

```ts
    } else {
      // Generic status change notification for the quote creator
      try {
        await createNotification({
          userId: creatorId,
          type: 'SYSTEM',
          title: `Teklif ${updatedQuote.quoteNumber} durumu değişti`,
          message: `Durum: ${statusLabels[targetStatus]}`,
          link: `/quotes/${quoteId}`,
        });
      } catch (notificationError) {
        console.error('Notification creation error (generic) for userId:', creatorId, notificationError);
      }
    }
```

Replace the whole `} else {` block with:

```ts
    } else if (currentStatus === 'ONAY_BEKLIYOR' && newStatus === 'TASLAK') {
      // Retraction — notify approvers so they don't review a withdrawn quote.
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
    } else {
      // Generic status change notification for the quote creator
      try {
        await createNotification({
          userId: creatorId,
          type: 'SYSTEM',
          title: `Teklif ${updatedQuote.quoteNumber} durumu değişti`,
          message: `Durum: ${statusLabels[targetStatus]}`,
          link: `/quotes/${quoteId}`,
        });
      } catch (notificationError) {
        console.error('Notification creation error (generic) for userId:', creatorId, notificationError);
      }
    }
```

- [ ] **Step 3: Verify compile**

Run: `npx tsc --noEmit`
Expected: No new errors. Pre-existing Prisma-mock errors in `*.test.ts` files stay.

- [ ] **Step 4: Run full vitest suite (quick sanity)**

Run: `npx vitest run`
Expected: All existing tests pass (517 or current baseline). No route-integration tests exist for this path, so the regression guard is "nothing else broke".

- [ ] **Step 5: Commit**

```bash
git add src/app/api/quotes/[id]/status/route.ts
git commit -m "$(cat <<'EOF'
feat(quotes): creator-only retract-approval path + approver notify

PUT /api/quotes/[id]/status now allows ONAY_BEKLIYOR → TASLAK when
the caller is the quote's createdBy user. Non-creator callers get
403 on that specific path; every other authorization check is
unchanged. Approvers are notified via createNotification so they
don't open a withdrawn quote.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: GET route — filter TASLAK unless creator

**Files:**
- Modify: `src/app/api/quotes/[id]/status/route.ts`

- [ ] **Step 1: Extend the GET handler's Prisma query to also fetch createdById**

Find the GET handler's `db.quote.findUnique` call (around line 318):

```ts
    const quote = await db.quote.findUnique({
      where: { id: quoteId },
      select: { status: true },
    });
```

Change to:

```ts
    const quote = await db.quote.findUnique({
      where: { id: quoteId },
      select: { status: true, createdById: true },
    });
```

- [ ] **Step 2: Filter TASLAK out of allowed transitions for non-creators**

Find the existing allowed-transitions filter (around line 327–333):

```ts
    const currentStatus = quote.status as QuoteStatus;
    let allowedTransitions = getAvailableTransitions(currentStatus);

    // Filter out ONAYLANDI if user can't approve
    if (!user.role.canApprove) {
      allowedTransitions = allowedTransitions.filter(s => s !== 'ONAYLANDI');
    }
```

Replace with:

```ts
    const currentStatus = quote.status as QuoteStatus;
    let allowedTransitions = getAvailableTransitions(currentStatus);

    // Filter out ONAYLANDI if user can't approve
    if (!user.role.canApprove) {
      allowedTransitions = allowedTransitions.filter(s => s !== 'ONAYLANDI');
    }

    // Retract (ONAY_BEKLIYOR → TASLAK) is creator-only — hide it
    // from everyone else so the status dropdown stays clean.
    if (currentStatus === 'ONAY_BEKLIYOR' && user.id !== quote.createdById) {
      allowedTransitions = allowedTransitions.filter(s => s !== 'TASLAK');
    }
```

- [ ] **Step 3: Verify compile**

Run: `npx tsc --noEmit`
Expected: No new errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/quotes/[id]/status/route.ts
git commit -m "$(cat <<'EOF'
feat(quotes): GET /status filters retract from non-creators

Status-dropdown readers other than the quote's creator no longer
see TASLAK in the allowed transitions when status is ONAY_BEKLIYOR.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: UI — "Onayı Geri Çek" button on the view page

**Files:**
- Modify: `src/app/(dashboard)/quotes/[id]/page.tsx`

- [ ] **Step 1: Add currentUserId to permissions state**

Find the `permissions` state declaration (around line 171):

```ts
  const [permissions, setPermissions] = useState<UserPermissions>({
    canViewCosts: false,
    canExport: true,
    canApprove: false,
  });
```

Add a new state for the current user id beside it:

```ts
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
```

Then find the `useEffect` that fetches `/api/auth/me` and sets permissions (around line 198–216). Inside the `if (data.user?.role)` block, add:

```ts
            setCurrentUserId(data.user.id ?? null);
```

So the block reads:

```ts
          if (data.user?.role) {
            setPermissions({
              canViewCosts: !!data.user.role.canViewCosts,
              canExport: !!data.user.role.canExport,
              canApprove: !!data.user.role.canApprove,
            });
            setCurrentUserId(data.user.id ?? null);
          }
```

- [ ] **Step 2: Add a `handleRetractApproval` handler**

Near the other handlers in this file (e.g., near `handleExportPdf`), add:

```ts
  const [isRetracting, setIsRetracting] = useState(false);

  const handleRetractApproval = useCallback(async () => {
    if (!quote) return;
    const ok = window.confirm(
      'Bu teklifin onay talebini geri çekip taslağa döndürmek istediğinize emin misiniz?'
    );
    if (!ok) return;
    setIsRetracting(true);
    try {
      const res = await fetch(`/api/quotes/${id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'TASLAK', note: 'Onayı geri çekti' }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || 'Onay geri çekilemedi');
      }
      await fetchQuote();
    } catch (err) {
      console.error('Retract approval error:', err);
      setError(err instanceof Error ? err.message : 'Onay geri çekilirken bir hata oluştu');
    } finally {
      setIsRetracting(false);
    }
  }, [id, quote, fetchQuote]);
```

Place this callback right next to the other status-related handlers. If `useCallback` isn't already imported, it is — the file already uses it (check around line 4).

- [ ] **Step 3: Render the button when the caller is the creator of a pending quote**

Find the action bar where Kopyala / Revizyon Oluştur / PDF / Excel / Yazdır / Hatırlatma Ekle buttons live on the view page (grep for `Kopyala` in page.tsx, or `Revizyon Oluştur`). Add a new button conditional on `quote.status === 'ONAY_BEKLIYOR' && currentUserId === quote.createdBy.id`:

```tsx
          {quote.status === 'ONAY_BEKLIYOR' && currentUserId === quote.createdBy.id && (
            <Button
              variant="secondary"
              onClick={handleRetractApproval}
              disabled={isRetracting}
              title="Onay talebini geri çek — teklif taslağa geri döner"
            >
              <ArrowLeft className="w-4 h-4" />
              Onayı Geri Çek
            </Button>
          )}
```

Use the `ArrowLeft` icon (already imported at the top of the file — it's used for the page's back button). If the file uses a different button convention (e.g., `className="btn btn-secondary"` rather than a `<Button>` component), match the surrounding code — inspect the file's actual rendering of Kopyala before inserting.

Color: the spec calls for a warning-colored variant so it reads distinct from Approve/Reject. If the codebase has a `variant="warning"` button variant already, use it; otherwise keep `variant="secondary"` for visual parity with Kopyala — the text "Onayı Geri Çek" plus the ArrowLeft icon is sufficient affordance.

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No new errors.

- [ ] **Step 5: Run vitest**

Run: `npx vitest run`
Expected: 517/517 pass. No behavior change in covered tests.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(dashboard)/quotes/[id]/page.tsx"
git commit -m "$(cat <<'EOF'
feat(quotes): Onayı Geri Çek button on view page for creators

Quote's own creator sees a dedicated button next to other actions
when status is ONAY_BEKLIYOR. Click → confirm → PUT status with
TASLAK, then reload. Approvers / other users see nothing new.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Manual verification

- [ ] **Step 1: Start dev server**

Run: `npm run dev`
Expected: App starts.

- [ ] **Step 2: Sales user retracts own pending quote**

Log in as a sales user `A` (non-approver). Create or open an existing quote, save as draft. Submit for approval. The status badge reads "Onay Bekliyor".
- Confirm the "Onayı Geri Çek" button is visible next to the action buttons.
- Click it. A native confirm dialog appears asking "Bu teklifin onay talebini geri çekip taslağa döndürmek istediğinize emin misiniz?" — click OK.
- Status badge updates to "Taslak" after reload.
- Navigate to the editor — it is now live (edit cells, add items, save without error).

- [ ] **Step 3: Approver does not see the button on someone else's pending quote**

While `A`'s quote is `ONAY_BEKLIYOR`, log in as an approver `B`. Open the quote.
- Confirm no "Onayı Geri Çek" button appears.
- Confirm Approve / Reject (or the status dropdown entries for ONAYLANDI / REVIZYON) are visible as before.

- [ ] **Step 4: Non-creator sales user does not see the button**

Log in as another sales user `C` (different from `A`, not an approver). Open `A`'s pending quote.
- Confirm no "Onayı Geri Çek" button appears.

- [ ] **Step 5: Approver gets the retraction notification**

As `A`, retract a pending quote. Log in as approver `B`. Check the notification bell / notifications page.
- Expect a notification titled "Onay talebi geri çekildi" with message naming `A` and the quote number. Clicking the notification link navigates to the quote view page.

- [ ] **Step 6: History entry exists**

Open the quote that was retracted. View its history timeline (if exposed in the UI) OR query the DB:

```bash
psql "$DATABASE_URL" -c "SELECT action, changes FROM \"QuoteHistory\" WHERE \"quoteId\" = 'THE_QUOTE_ID' ORDER BY \"createdAt\" DESC LIMIT 3;"
```

Expect a row with action `STATUS_CHANGE` and `changes = { "from": "ONAY_BEKLIYOR", "to": "TASLAK", "note": "Onayı geri çekti" }`.

- [ ] **Step 7: Retract is idempotent with approve (race)**

Manual simulation: as creator `A`, open the quote in browser window 1 (status: ONAY_BEKLIYOR). As approver `B`, open the same quote in browser window 2. In window 2, click Approve. In window 1, immediately click Onayı Geri Çek.
- Expect one of the two to succeed cleanly. The other returns an error like "Teklif durumu değişti" or "...durumundan ...durumuna geçiş yapılamaz".
- No DB corruption — a subsequent reload of the quote shows a consistent state.

- [ ] **Step 8: Regression guard — approved quotes**

Take an already-approved quote (`ONAYLANDI`). Log in as its creator.
- Confirm no "Onayı Geri Çek" button appears. The retract path is scoped strictly to `ONAY_BEKLIYOR` and does not affect later states.

- [ ] **Step 9: If any manual test fails**

Do not close out. Diagnose and fix in a follow-up commit inside this same work. Common failure modes:
- **Button appears for wrong user** → `currentUserId` from `/api/auth/me` may not match `quote.createdBy.id`. Log both values and verify types (string vs undefined).
- **403 from the PUT route even for the creator** → `user.id !== quote.createdById` may be comparing across different id types. Check server-side types.
- **Approvers not notified** → `db.user.findMany({ where: { role: { canApprove: true } } })` may return zero rows if no approver role has that flag set. Check the DB.
- **Dropdown still shows retract for non-creators** → the GET route filter is keyed on `user.id === quote.createdById`, confirm the branch runs.

Fix and re-verify before merging the work.

---

## Self-review notes

- **Spec coverage:** state machine (Task 1), PUT authorization + approver notification (Task 2), GET filter (Task 3), UI button with confirm (Task 4), manual tests matching the spec's 9-step checklist (Task 5). Every risk note in the spec has either a handling branch or a manual verification step.
- **Placeholders:** none — every code block is complete and copy-pasteable. The Task 4 button JSX explicitly adapts to the file's actual button convention (instructed to inspect surrounding code before inserting).
- **Type consistency:** `currentUserId: string | null`, `isRetracting: boolean`, `handleRetractApproval` reused across the task sequence. `quote.createdBy.id` (client) matches `quote.createdById` (server Prisma field) — standard Prisma `createdBy` include/select pattern.
- **Rollback:** revert Task 4 to hide the button; leave Tasks 1–3 as no-op infrastructure. Full rollback = revert all four commits.

## Out of scope (not in this plan)

- Admin override to retract someone else's pending quote.
- Retracting `ONAYLANDI → TASLAK`.
- Time-bounded retraction windows.
- Replacing `window.confirm()` with the project's standard confirm dialog (if one exists later, the callback can swap).
