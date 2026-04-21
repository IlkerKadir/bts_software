# Drag-to-Reorder Auto-Scroll — Design Spec

**Date:** 2026-04-21
**Status:** Ready for plan
**Author:** IlkerKadir + Claude
**Target release:** next deploy

## Problem

When a quote has 50+ items, reordering an item from near the bottom of the list to near the top requires the user to drop the item, scroll up manually, grab it again, drop, scroll, repeat. HTML5 drag-and-drop does not auto-scroll the page. The user experience degrades sharply past 20–30 rows.

## Goal

While the user is dragging a row, the page auto-scrolls **vertically** when the pointer enters a dead-zone near the top or bottom of the viewport. The closer to the edge, the faster the scroll. When the pointer leaves the dead-zone, scrolling stops. When the user drops or aborts the drag, the loop tears down.

## Non-goals

- No horizontal auto-scroll — user said vertical-only.
- No change to the existing drag-to-reorder semantics (drop targets, index math, save flow).
- No replacement of HTML5 drag with a library (`react-dnd` / `dnd-kit`).
- No touch-device tuning — HTML5 drag is already mouse-only in this app, no change.

## Current state

`src/components/quotes/QuoteItemsTable.tsx` uses native HTML5 drag:

- `handleDragStart(index)` → sets `dragIndex` state + `dataTransfer.setData(...)`.
- `handleDragOver(index)` → `e.preventDefault()` + `dropEffect = 'move'`.
- `handleDrop(targetIndex)` → reorders items, saves.

No auto-scroll. No pointer-position tracking. No cleanup beyond `setDragIndex(null)` on drop.

## Target state

### Behavior

- **Dead-zone**: top 80 px and bottom 80 px of the viewport.
- **Speed curve**: linear, max 18 px/frame at the viewport edge, 0 px/frame at the dead-zone's inner boundary.
- **Direction**: top zone → scroll up; bottom zone → scroll down.
- **Trigger**: active whenever a row drag is in progress and the pointer is inside a dead-zone.
- **Teardown**: on `dragend` (user cancels or drops anywhere) and on `drop` (fallback).
- **Idempotent**: if the user drags, releases, and drags again, setup / teardown runs cleanly each cycle — no leaked rAF loops, no duplicate listeners.

### Implementation

Single file change: `src/components/quotes/QuoteItemsTable.tsx`.

Add one `useRef` for the running animation-frame id and one `useRef` for the latest pointer Y. Install listeners on `document` at drag start:

```ts
const autoScrollRafRef = useRef<number | null>(null);
const pointerYRef = useRef<number>(0);

const startAutoScrollLoop = useCallback(() => {
  if (autoScrollRafRef.current != null) return; // already running
  const EDGE = 80;
  const MAX = 18;
  const tick = () => {
    const y = pointerYRef.current;
    const h = window.innerHeight;
    let dy = 0;
    if (y < EDGE) {
      dy = -MAX * (1 - y / EDGE);
    } else if (y > h - EDGE) {
      dy = MAX * (1 - (h - y) / EDGE);
    }
    if (dy !== 0) window.scrollBy(0, dy);
    autoScrollRafRef.current = requestAnimationFrame(tick);
  };
  autoScrollRafRef.current = requestAnimationFrame(tick);
}, []);

const stopAutoScrollLoop = useCallback(() => {
  if (autoScrollRafRef.current != null) {
    cancelAnimationFrame(autoScrollRafRef.current);
    autoScrollRafRef.current = null;
  }
}, []);
```

Install / remove at drag start / end:

- Extend existing `handleDragStart(index)` to: attach `dragover` listener on `document` that sets `pointerYRef.current = e.clientY`; attach `dragend` listener on `document` that removes both and calls `stopAutoScrollLoop()`; call `startAutoScrollLoop()`.
- Also call `stopAutoScrollLoop()` at the top of `handleDrop` for belt-and-suspenders cleanup.

### What does NOT change

- `handleDragStart`'s existing body (`setDragIndex`, `dataTransfer`).
- `handleDragOver(index)` on individual rows (continues to call `e.preventDefault()` so rows accept drops).
- `handleDrop(targetIndex)` reorder logic.
- Any other component behavior.

## Testing

- **Automated**: no new unit tests — the behavior is pointer + window-scroll integration which jsdom does not simulate meaningfully. Keep existing 517 vitest tests green.
- **Manual** (3 scenarios):
  1. Long quote (≥30 items), drag row 30 toward viewport top → page scrolls up, allowing drop at row 2. Drop → save ok.
  2. Short quote (≤5 items, fits in viewport). Drag a row — no scroll happens (no dead-zone hit), no regression.
  3. Drag, then hit Escape or release outside the table → no lingering rAF loop (inspect via a `console.log` during tick, then confirm logs stop).

## Risk notes (production)

- **Browser compatibility**: `requestAnimationFrame`, `window.scrollBy`, and HTML5 drag events are universal across all supported browsers.
- **Perf**: rAF loop only runs during an active drag. Max iteration cost is a few arithmetic ops + one `window.scrollBy`. Negligible.
- **Cleanup robustness**: drag-end listeners are set at drag-start and torn down in the drag-end handler, not bound for the component lifetime. A drag that's interrupted by an unmount still cleans up because the handler closures hold refs to the same ids the component holds.
- **Teardown bug class (rare)**: if a `dragend` event does not fire (some browsers on file-drag aborts), the rAF loop would keep running. Mitigation: also call `stopAutoScrollLoop()` in `handleDrop`, plus add a component-unmount `useEffect` cleanup that calls `stopAutoScrollLoop()`.
- **Rollback**: one-commit revert removes the feature; drag-to-reorder remains as today.

## Out of scope

- Horizontal auto-scroll on the main table (user explicitly said vertical only).
- Touch-device drag. Current app already doesn't support touch drag.
- Visual indicator showing "scroll zone active" (halo at viewport top/bottom). Can be added later if users find the scroll direction ambiguous, but not needed for MVP.
