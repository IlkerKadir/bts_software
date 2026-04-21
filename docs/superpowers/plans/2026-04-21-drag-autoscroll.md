# Drag-to-Reorder Vertical Auto-Scroll — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-scroll the page vertically while the user is dragging a row in the quote editor, when the pointer enters a top / bottom 80px dead-zone, so long quotes can be re-ordered without manual scroll interruptions.

**Architecture:** Add a requestAnimationFrame loop that runs only while a drag is in progress. The loop reads the latest pointer Y from a document-level `dragover` listener, computes a linear speed ramp, and calls `window.scrollBy`. Listeners and loop are installed on `dragstart` and torn down on `dragend` / `drop` / component unmount.

**Tech Stack:** React 19, TypeScript, browser native HTML5 drag-and-drop, `requestAnimationFrame`.

**Spec:** `docs/superpowers/specs/2026-04-21-drag-autoscroll-design.md`

---

## File structure

One file changes:

- `src/components/quotes/QuoteItemsTable.tsx` — add two refs, two helper callbacks (`startAutoScrollLoop`, `stopAutoScrollLoop`), an unmount cleanup effect, and extensions to `handleDragStart` + `handleDrop` to install / tear down the loop.

No new files, no tests (the behavior is pointer + window-scroll integration; jsdom does not simulate either meaningfully — manual verification only, matching the spec).

---

### Task 1: Add refs and helper callbacks

**Files:**
- Modify: `src/components/quotes/QuoteItemsTable.tsx`

- [ ] **Step 1: Add the two refs alongside existing scroll refs**

Find the existing refs block (around lines 159–167 — search for `stickyBottomScrollRef` to locate). Below the `thumbDragRef` line, add:

```ts
  // Auto-scroll loop state — only active while a row drag is in
  // progress. The rAF id is non-null when the loop is running; the
  // pointer Y is updated by a document-level `dragover` listener.
  const autoScrollRafRef = useRef<number | null>(null);
  const pointerYRef = useRef<number>(0);
```

Paste immediately after the `thumbDragRef` declaration (current structure has `thumbRef` and `thumbDragRef` together; keep the new refs grouped with them but clearly documented as a separate concern).

- [ ] **Step 2: Add `startAutoScrollLoop` callback**

Find a good location for this callback — near the other `useCallback` declarations in the component (for example, just above the existing `handleDragStart`). Insert:

```ts
  // Vertical auto-scroll loop. Runs during an active row drag. When
  // the pointer is within 80px of the viewport top or bottom, scroll
  // the window at a speed that ramps linearly — 0 px/frame at the
  // dead-zone's inner boundary, 18 px/frame at the viewport edge.
  // Outside the dead-zone: no scrolling, loop idle-runs.
  const startAutoScrollLoop = useCallback(() => {
    if (autoScrollRafRef.current !== null) return; // already running
    const EDGE = 80;
    const MAX_PX_PER_FRAME = 18;
    const tick = () => {
      const y = pointerYRef.current;
      const h = window.innerHeight;
      let dy = 0;
      if (y < EDGE) {
        dy = -MAX_PX_PER_FRAME * (1 - y / EDGE);
      } else if (y > h - EDGE) {
        dy = MAX_PX_PER_FRAME * (1 - (h - y) / EDGE);
      }
      if (dy !== 0) window.scrollBy(0, dy);
      autoScrollRafRef.current = requestAnimationFrame(tick);
    };
    autoScrollRafRef.current = requestAnimationFrame(tick);
  }, []);
```

- [ ] **Step 3: Add `stopAutoScrollLoop` callback**

Directly below `startAutoScrollLoop`:

```ts
  const stopAutoScrollLoop = useCallback(() => {
    if (autoScrollRafRef.current !== null) {
      cancelAnimationFrame(autoScrollRafRef.current);
      autoScrollRafRef.current = null;
    }
  }, []);
```

- [ ] **Step 4: Verify compile**

Run: `npx tsc --noEmit`
Expected: No new errors. Pre-existing test-file errors stay.

- [ ] **Step 5: Commit**

```bash
git add src/components/quotes/QuoteItemsTable.tsx
git commit -m "$(cat <<'EOF'
refactor(quotes): add auto-scroll refs + start/stop helpers

Preparatory step — adds the rAF loop lifecycle helpers for the
upcoming drag-to-reorder auto-scroll feature. Not wired up yet.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Wire auto-scroll into drag handlers

**Files:**
- Modify: `src/components/quotes/QuoteItemsTable.tsx`

- [ ] **Step 1: Extend `handleDragStart`**

Find the existing `handleDragStart` (currently around line 693–700):

```ts
  const handleDragStart = useCallback(
    (index: number) => (e: React.DragEvent) => {
      setDragIndex(index);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(index));
    },
    [],
  );
```

Replace with:

```ts
  const handleDragStart = useCallback(
    (index: number) => (e: React.DragEvent) => {
      setDragIndex(index);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(index));

      // Install auto-scroll — tracks pointer Y at document level and
      // runs a rAF loop until the drag ends. Cleanup attaches to the
      // same listeners so they self-remove on dragend regardless of
      // whether the drop succeeded or was cancelled.
      const onDragOverDoc = (ev: DragEvent) => {
        pointerYRef.current = ev.clientY;
      };
      const onDragEndDoc = () => {
        document.removeEventListener('dragover', onDragOverDoc);
        document.removeEventListener('dragend', onDragEndDoc);
        stopAutoScrollLoop();
      };
      document.addEventListener('dragover', onDragOverDoc);
      document.addEventListener('dragend', onDragEndDoc);
      pointerYRef.current = e.clientY; // seed so first tick is correct
      startAutoScrollLoop();
    },
    [startAutoScrollLoop, stopAutoScrollLoop],
  );
```

- [ ] **Step 2: Extend `handleDrop` with belt-and-suspenders cleanup**

Find the existing `handleDrop` (currently around line 710–727):

```ts
  const handleDrop = useCallback(
    (targetIndex: number) => (e: React.DragEvent) => {
      e.preventDefault();
      const sourceIndex = dragIndex;
      setDragIndex(null);
      if (sourceIndex === null || sourceIndex === targetIndex) return;

      const updated = [...items];
      const [moved] = updated.splice(sourceIndex, 1);
      updated.splice(targetIndex, 0, moved);
      const reordered = updated.map((item, idx) => ({
        ...item,
        sortOrder: idx + 1,
      }));
      onReorder(reordered);
    },
    [dragIndex, items, onReorder],
  );
```

Replace with:

```ts
  const handleDrop = useCallback(
    (targetIndex: number) => (e: React.DragEvent) => {
      e.preventDefault();
      stopAutoScrollLoop(); // belt & suspenders — dragend may not fire on all browsers after drop
      const sourceIndex = dragIndex;
      setDragIndex(null);
      if (sourceIndex === null || sourceIndex === targetIndex) return;

      const updated = [...items];
      const [moved] = updated.splice(sourceIndex, 1);
      updated.splice(targetIndex, 0, moved);
      const reordered = updated.map((item, idx) => ({
        ...item,
        sortOrder: idx + 1,
      }));
      onReorder(reordered);
    },
    [dragIndex, items, onReorder, stopAutoScrollLoop],
  );
```

Only two changes from the original: the `stopAutoScrollLoop()` call at the top of the body, and `stopAutoScrollLoop` added to the deps array.

- [ ] **Step 3: Add unmount cleanup effect**

Find a good spot near other `useEffect` calls (the existing `syncScrollLeft`-deps effect is a natural neighbor). Add:

```ts
  // Belt-and-suspenders teardown on unmount: if the component
  // unmounts mid-drag (rare — navigation during drag), cancel the
  // loop so no orphan rAF keeps firing.
  useEffect(() => {
    return () => stopAutoScrollLoop();
  }, [stopAutoScrollLoop]);
```

- [ ] **Step 4: Verify compile**

Run: `npx tsc --noEmit`
Expected: No new errors.

- [ ] **Step 5: Run vitest**

Run: `npx vitest run`
Expected: 517/517 pass (or current baseline count). No behavior change in covered tests.

- [ ] **Step 6: Commit**

```bash
git add src/components/quotes/QuoteItemsTable.tsx
git commit -m "$(cat <<'EOF'
feat(quotes): auto-scroll page while dragging a row to reorder

When the pointer enters the top or bottom 80px of the viewport
during an active drag, the page scrolls in that direction at a
speed that ramps from 0 to 18 px/frame based on edge proximity.
Listeners install on dragstart and tear down on dragend / drop /
unmount — no leaked rAF loops.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Manual verification

- [ ] **Step 1: Start dev server**

Run: `npm run dev`
Expected: App starts. Open an existing quote with ≥30 items.

- [ ] **Step 2: Bottom-edge auto-scroll**

Scroll the page so that a row near the bottom of the quote (say row 25) is visible in the upper half of the viewport. Grab row 25's drag handle, start dragging. Move the pointer into the bottom 80px of the viewport. The page should scroll down smoothly, revealing more rows below. Continue holding — scroll continues. Move the pointer back into the middle of the viewport — scroll stops. Release over any row to drop.

- [ ] **Step 3: Top-edge auto-scroll**

Scroll down so the top rows are off-screen. Grab a row near the bottom. Drag the pointer into the top 80px of the viewport. The page should scroll up. Continue until row 2 is visible. Drop above row 2 to move the item there.

- [ ] **Step 4: No auto-scroll when pointer is mid-viewport**

Drag a row, hover the pointer in the middle 70% of the viewport. Page should NOT scroll. Confirm.

- [ ] **Step 5: No leak after release**

Open DevTools Console. Drag a row, release it anywhere. Open Performance tab and record 5 seconds. Confirm no ongoing `requestAnimationFrame` ticks are happening (CPU should be idle). Alternatively, add a temporary `console.log('tick', y)` inside `tick` to watch — remove before committing (this plan does not ask you to add that log, only use it if you doubt the teardown).

- [ ] **Step 6: Short quote (no regression)**

Open a quote with ≤5 items that fits in the viewport. Drag a row. No auto-scroll should fire (pointer never enters a dead-zone relative to the small page). Drop works as before.

- [ ] **Step 7: Escape / outside-drop**

Drag a row, then drop it somewhere outside the table (e.g., on the sidebar). Confirm auto-scroll stops and no errors appear in console.

- [ ] **Step 8: If any manual test fails**

Do not close out the work. Diagnose and fix inside this same plan. Common failure modes:
- **Scroll never fires**: check that `pointerYRef.current` is being updated — log `ev.clientY` inside `onDragOverDoc`.
- **Scroll keeps firing after drop**: `dragend` or `drop` isn't calling `stopAutoScrollLoop`. Verify both handlers call it.
- **Duplicate listeners**: if you drag twice in quick succession and the scroll seems twice as fast, `onDragOverDoc` closures may be leaking. Confirm `dragend` removes them.

---

## Self-review notes

- **Spec coverage:** refs + helpers (Task 1), drag-handler wiring + unmount cleanup (Task 2), manual tests matching the spec's 3 scenarios + extras (Task 3). Every risk note in the spec is handled: unmount cleanup ✓, drop-without-dragend fallback ✓, no new browser-API surface.
- **Placeholders:** none — every code block is complete and copy-pasteable.
- **Type consistency:** single ref names `autoScrollRafRef` + `pointerYRef`, single helpers `startAutoScrollLoop` + `stopAutoScrollLoop` used identically across tasks.
- **Rollback:** revert Task 2 (and optionally Task 1 as a noop) to disable the feature without touching existing drag semantics.

## Out of scope (not in this plan)

- Horizontal auto-scroll while dragging near the left / right viewport edges. User explicitly said vertical-only.
- Visual "scroll zone active" indicator (halo at top / bottom of viewport). Can be added later if users find the scroll direction ambiguous.
- Touch support (app's existing drag is mouse-only).
