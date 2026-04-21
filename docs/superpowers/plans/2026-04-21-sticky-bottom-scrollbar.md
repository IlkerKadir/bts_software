# Sticky-Bottom Horizontal Scrollbar — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a horizontal scrollbar pinned to the bottom of the viewport that mirrors the quote editor's main table scroll, so users can pan right on long quotes without scrolling to the bottom of the page.

**Architecture:** Mirror the existing sticky-top-header pattern. Wrap an empty width-matched `<div>` inside a `position: sticky; bottom: 0` outer div with `overflow-x: auto`; sync its `scrollLeft` to the main table both ways using `isSyncingRef` + `requestAnimationFrame` to break the loop. Visibility gated by a `ResizeObserver` that hides the bar when the table fits without overflow.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, Next.js 15.

**Spec:** `docs/superpowers/specs/2026-04-21-sticky-bottom-scrollbar-design.md`

---

## File structure

Only one file changes:

- `src/components/quotes/QuoteItemsTable.tsx` — add one ref, one state, one scroll handler, one effect; extend the existing scroll handler and `syncScrollLeft`; add a new `<div>` at the bottom of the table container.

No tests are added (the behavior is DOM-sync which jsdom cannot meaningfully render), no Prisma / API changes.

---

### Task 1: Add ref and state for the sticky-bottom bar

**Files:**
- Modify: `src/components/quotes/QuoteItemsTable.tsx`

- [ ] **Step 1: Add the new ref and `isSyncingRef` alongside existing refs**

Find the existing ref block (around line 159–161):

```ts
  const tableRef = useRef<HTMLTableElement>(null);
  const mainScrollRef = useRef<HTMLDivElement>(null);
  const stickyHeaderInnerRef = useRef<HTMLDivElement>(null);
```

Replace with:

```ts
  const tableRef = useRef<HTMLTableElement>(null);
  const mainScrollRef = useRef<HTMLDivElement>(null);
  const stickyHeaderInnerRef = useRef<HTMLDivElement>(null);
  const stickyBottomScrollRef = useRef<HTMLDivElement>(null);
  // Breaks the two-way scroll-sync loop between mainScrollRef and
  // stickyBottomScrollRef — cleared on the next animation frame.
  const isSyncingRef = useRef(false);
```

- [ ] **Step 2: Add `needsHScroll` state for visibility gating**

Find where the component's top-level state is declared (look for the first `useState` calls near the top — there are several, e.g. `columnWidths`). Add a new state declaration beside them (near the existing refs is also fine, but put it with the other `useState`s if there's a clear block):

```ts
  const [needsHScroll, setNeedsHScroll] = useState(false);
```

Note: in TypeScript React, `useState(false)` infers `boolean` — no generic needed.

- [ ] **Step 3: Verify the file still compiles**

Run: `npx tsc --noEmit`
Expected: No new errors. Pre-existing unrelated errors (in test files) remain.

- [ ] **Step 4: Commit**

```bash
git add src/components/quotes/QuoteItemsTable.tsx
git commit -m "$(cat <<'EOF'
refactor(quotes): add refs and state for sticky-bottom scrollbar

Preparatory step — introduces stickyBottomScrollRef, isSyncingRef,
and needsHScroll. No UI change yet.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Extend `handleMainScroll` to drive the sticky-bottom bar

**Files:**
- Modify: `src/components/quotes/QuoteItemsTable.tsx`

- [ ] **Step 1: Replace the existing `handleMainScroll`**

Find (currently around lines 165–170):

```ts
  // Sync sticky header horizontal scroll with main table via direct DOM manipulation
  // (avoids React re-render on every scroll pixel for performance on large quotes)
  const handleMainScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const sl = e.currentTarget.scrollLeft;
    if (stickyHeaderInnerRef.current) {
      stickyHeaderInnerRef.current.style.transform = `translateX(-${sl}px)`;
    }
  }, []);
```

Replace with:

```ts
  // Sync sticky header + sticky bottom scrollbar horizontal scroll with
  // main table via direct DOM manipulation (avoids React re-render on
  // every scroll pixel for performance on large quotes).
  //
  // The two-way sync with stickyBottomScrollRef is guarded by
  // isSyncingRef so programmatic scrollLeft assignment does not trigger
  // a feedback loop.
  const handleMainScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const sl = e.currentTarget.scrollLeft;
    if (stickyHeaderInnerRef.current) {
      stickyHeaderInnerRef.current.style.transform = `translateX(-${sl}px)`;
    }
    if (!isSyncingRef.current && stickyBottomScrollRef.current) {
      isSyncingRef.current = true;
      stickyBottomScrollRef.current.scrollLeft = sl;
      requestAnimationFrame(() => { isSyncingRef.current = false; });
    }
  }, []);
```

- [ ] **Step 2: Add a new `handleStickyBottomScroll` handler below `handleMainScroll`**

Insert directly after the existing `handleMainScroll` definition (which now ends with its `}, []);` line):

```ts
  // Sync main table + sticky header horizontal scroll with the
  // sticky-bottom proxy scrollbar. Same isSyncingRef guard so we don't
  // loop back into handleMainScroll.
  const handleStickyBottomScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const sl = e.currentTarget.scrollLeft;
    if (!isSyncingRef.current && mainScrollRef.current) {
      isSyncingRef.current = true;
      mainScrollRef.current.scrollLeft = sl;
      requestAnimationFrame(() => { isSyncingRef.current = false; });
    }
    if (stickyHeaderInnerRef.current) {
      stickyHeaderInnerRef.current.style.transform = `translateX(-${sl}px)`;
    }
  }, []);
```

- [ ] **Step 3: Extend `syncScrollLeft` to also sync the sticky-bottom ref**

Find (currently around lines 174–179):

```ts
  // Re-sync sticky header after column visibility or table width changes
  // (browser may auto-clamp scrollLeft when table gets narrower)
  const syncScrollLeft = useCallback(() => {
    if (mainScrollRef.current && stickyHeaderInnerRef.current) {
      const sl = mainScrollRef.current.scrollLeft;
      stickyHeaderInnerRef.current.style.transform = `translateX(-${sl}px)`;
    }
  }, []);
```

Replace with:

```ts
  // Re-sync sticky header + sticky bottom after column visibility or
  // table width changes (browser may auto-clamp scrollLeft when the
  // table gets narrower).
  const syncScrollLeft = useCallback(() => {
    if (!mainScrollRef.current) return;
    const sl = mainScrollRef.current.scrollLeft;
    if (stickyHeaderInnerRef.current) {
      stickyHeaderInnerRef.current.style.transform = `translateX(-${sl}px)`;
    }
    if (stickyBottomScrollRef.current) {
      isSyncingRef.current = true;
      stickyBottomScrollRef.current.scrollLeft = sl;
      requestAnimationFrame(() => { isSyncingRef.current = false; });
    }
  }, []);
```

- [ ] **Step 4: Verify compile**

Run: `npx tsc --noEmit`
Expected: No new errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/quotes/QuoteItemsTable.tsx
git commit -m "$(cat <<'EOF'
feat(quotes): two-way scroll sync for sticky-bottom scrollbar

handleMainScroll now also drives the bottom proxy; new
handleStickyBottomScroll mirrors back into the main table + sticky
header. isSyncingRef + rAF break the feedback loop.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Observe table width / viewport to toggle `needsHScroll`

**Files:**
- Modify: `src/components/quotes/QuoteItemsTable.tsx`

- [ ] **Step 1: Add a ResizeObserver effect**

Find a good place to insert the effect — near the other `useEffect` calls in the component. If you cannot find a clearly adjacent `useEffect`, insert after the `syncScrollLeft` declaration from Task 2.

Insert:

```ts
  // Hide the sticky-bottom scrollbar when the table fits in its
  // container (no horizontal overflow). Re-check whenever the table
  // container resizes (window resize, column width change, side panel
  // toggle, etc).
  useEffect(() => {
    const node = mainScrollRef.current;
    if (!node) return;
    const update = () => {
      setNeedsHScroll(node.scrollWidth > node.clientWidth + 1);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(node);
    return () => ro.disconnect();
  }, []);
```

Make sure `useEffect` is already imported at the top of the file — check the existing React import. If it is already being used (very likely in a component this large), no import change needed.

- [ ] **Step 2: Also re-check after column width / visibility changes**

Find the existing effect that depends on `columnWidths` or `columnVisibility` (grep the file for `useEffect` — there should be one that calls `syncScrollLeft` or similar). If such an effect exists, simply add a call to `update()`-equivalent logic by invoking `syncScrollLeft` which already runs — and the ResizeObserver from Step 1 will pick up the size change via `node.scrollWidth`.

No code change is needed if the observer from Step 1 is wired — `scrollWidth` updates synchronously when the table's columns resize, and `ResizeObserver` fires whenever the observed node's size changes. Verify after running the app; if the bar doesn't hide/show correctly on column toggle, add an explicit `useEffect` that calls `setNeedsHScroll(mainScrollRef.current ? mainScrollRef.current.scrollWidth > mainScrollRef.current.clientWidth + 1 : false)` with deps `[columnWidths, columnVisibility, tableWidth]`.

- [ ] **Step 3: Verify compile**

Run: `npx tsc --noEmit`
Expected: No new errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/quotes/QuoteItemsTable.tsx
git commit -m "$(cat <<'EOF'
feat(quotes): toggle sticky-bottom scrollbar visibility via ResizeObserver

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Render the sticky-bottom scrollbar DOM

**Files:**
- Modify: `src/components/quotes/QuoteItemsTable.tsx`

- [ ] **Step 1: Read the existing main scroll container JSX**

Locate (around lines 996–1006):

```tsx
        {/* Main scrolling table */}
        <div
          ref={mainScrollRef}
          className="rounded-b-lg border border-t-0 border-accent-200 bg-white overflow-x-auto"
          onScroll={handleMainScroll}
        >
        <table ref={tableRef} className="text-sm border-separate border-spacing-0" style={{ tableLayout: 'fixed', width: tableWidth }}>
          {colgroupJsx}
          {/* thead rendered in sticky floating header above */}
          ...
        </table>
        </div>
```

- [ ] **Step 2: Add the sticky-bottom div directly after the main scroll container's closing `</div>`**

Find the closing `</div>` of the `<div ref={mainScrollRef}>` block (a few lines after the `</table>` that ends the main table). Directly after that closing `</div>`, add:

```tsx
        {/* Sticky-bottom horizontal scrollbar proxy — keeps a scroll
            strip pinned to the bottom of the viewport so users can pan
            right-side columns into view without scrolling to the end of
            a long quote. Width-matched inner div drives the native
            scrollbar; handleStickyBottomScroll mirrors into the main
            table. */}
        <div
          ref={stickyBottomScrollRef}
          className="sticky bottom-0 z-30 overflow-x-auto bg-white border-x border-b border-accent-200 rounded-b-lg"
          style={{ display: needsHScroll ? 'block' : 'none' }}
          onScroll={handleStickyBottomScroll}
          aria-hidden="true"
        >
          <div style={{ width: tableWidth, height: 1 }} />
        </div>
```

Important: the existing main scroll container currently has `rounded-b-lg` on itself (it's the bottom-rounded card). When the sticky bar is visible it takes that role; when hidden the main container shows the rounded bottom again. To keep the visual consistent in both states, **remove `rounded-b-lg` from the main scroll container's className** and move it only to the sticky-bottom bar (which already has it in the snippet above). Specifically:

Replace:

```tsx
          className="rounded-b-lg border border-t-0 border-accent-200 bg-white overflow-x-auto"
```

with:

```tsx
          className="border border-t-0 border-accent-200 bg-white overflow-x-auto"
```

Then update the sticky-bottom bar's className when `needsHScroll` is false so the bottom corners still round correctly. Simplest way: add a conditional class on the main scroll container:

```tsx
          className={`border border-t-0 border-accent-200 bg-white overflow-x-auto ${needsHScroll ? '' : 'rounded-b-lg'}`}
```

Now: when the sticky bar is hidden, the main container has `rounded-b-lg`; when the sticky bar shows, the main container is squared off and the sticky bar itself is `rounded-b-lg`. Visually continuous in both states.

- [ ] **Step 3: Verify compile**

Run: `npx tsc --noEmit`
Expected: No new errors.

- [ ] **Step 4: Vitest**

Run: `npx vitest run`
Expected: All tests pass. (No new tests; just confirming no regression.)

- [ ] **Step 5: Commit**

```bash
git add src/components/quotes/QuoteItemsTable.tsx
git commit -m "$(cat <<'EOF'
feat(quotes): sticky-bottom horizontal scrollbar for long quotes

Users can now pan right-side columns into view from any vertical
position. Bar auto-hides when the table fits without overflow and
transfers the rounded-bottom styling between the main container and
the scroll strip depending on visibility.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Manual verification

- [ ] **Step 1: Start dev server**

Run: `npm run dev`
Expected: App starts, navigate to an existing quote with many rows.

- [ ] **Step 2: Regression guard — quote that fits without horizontal overflow**

Open a SHORT quote (few items, narrow columns so the table fits without horizontal scroll). Confirm:
- No sticky-bottom scrollbar appears (the empty strip is hidden via `display:none`).
- The main scroll container's bottom corners are rounded (as before).
- All existing functionality (edit cells, drag rows, open context menu) works unchanged.

- [ ] **Step 3: Sticky-bar visibility**

Open a quote with enough items / columns to require horizontal scroll. Confirm:
- A thin horizontal scrollbar appears pinned to the bottom of the viewport.
- The main container's bottom corners are squared off; the sticky bar's are rounded. No visual seam.

- [ ] **Step 4: Two-way scroll sync**

- Drag the sticky-bottom scrollbar to the right. The main table pans right. The sticky-top header pans right.
- Scroll the page up and down; the sticky bar stays visible, does not jitter.
- Drag the main table's own bottom scrollbar (if visible at the bottom of a long quote). Sticky bar + sticky top header pan in step.

- [ ] **Step 5: Column visibility toggle**

Toggle a column off (via the existing column toggle UI). Confirm:
- Sticky bar appears/disappears correctly based on whether the remaining table overflows.
- No scroll-offset drift between the three bars.

- [ ] **Step 6: Window resize**

Resize the browser window narrow and then wide. Confirm:
- Sticky bar appears when overflow begins, hides when it ends.
- No console errors from the ResizeObserver.

- [ ] **Step 7: If anything looks wrong**

Diagnose the issue. Common failure modes:
- **Jitter / infinite loop:** `isSyncingRef` may not reset. Check the `requestAnimationFrame` callback.
- **Sticky bar never appears:** `needsHScroll` stays false. Log `scrollWidth` vs `clientWidth` to check the observer fires.
- **Three bars desync:** `syncScrollLeft` not called after a width change. Add a `useEffect` with `[columnWidths, columnVisibility]` deps.
- **Context menu renders behind the sticky bar:** bump the context menu's z-index above `z-30`.

Fix and re-verify before closing out.

---

## Self-review notes

- **Spec coverage:** ref + state (Task 1), handlers (Task 2), visibility gating (Task 3), DOM render (Task 4), manual verification (Task 5) — maps exactly to spec's "DOM addition", "Refs", "Scroll sync handlers", "Width tracking", "Visibility", "Testing" sections.
- **Placeholders:** none — all code blocks are complete and copy-pasteable.
- **Type consistency:** single ref name `stickyBottomScrollRef`, single state `needsHScroll`, single guard `isSyncingRef` — used identically in every task.
- **Rollback:** once Task 4 is committed, reverting just that commit removes the sticky bar but leaves the refactored refs/handlers harmless. If the whole feature misbehaves, revert Tasks 2–4 as three commits in sequence.

## Out of scope (not in this plan)

- Column freezing (first column pinned to the left) — a separate UX improvement if needed later.
- Touch-gesture tuning for mobile. The browser's native behavior is used; if the client reports touch issues in production, that is a follow-up task with its own spec.
- Replacing the sticky-header pattern (already in place) — no reason to touch it.
