# Sticky-Bottom Horizontal Scrollbar for Quote Editor — Design Spec

**Date:** 2026-04-21
**Status:** Ready for plan
**Author:** IlkerKadir + Claude
**Target release:** next deploy

## Problem

When a quote has many rows, the quote editor's horizontal scrollbar lives at the bottom of the items table. To pan right and see right-side columns (Katsayı, Liste Fiyatı, maliyet columns, PB, Geçmiş, Sil), the user must scroll the page all the way down to reach the scrollbar, pan, then scroll back up. The column header is already pinned to the viewport top; the horizontal scroll is not.

## Goal

Add a second horizontal scroll strip that stays visible at the bottom of the viewport while the user scrolls the page. Panning the sticky strip scrolls the main table, and scrolling the main table's own bar scrolls the sticky strip — both stay in sync. The user can see and edit middle-of-table rows and pan right-side columns into view from any vertical position.

## Non-goals

- No column freezing (first column stays non-frozen — out of scope).
- No column visibility changes, no column width changes.
- No change to the sticky floating header (already in place, stays as-is).
- Not changing the page's own vertical scroll behavior, scroll restoration, or back/forward behavior.

## Current state

`src/components/quotes/QuoteItemsTable.tsx`:

- `mainScrollRef` is a `<div className="overflow-x-auto">` wrapping the main `<table>` (line ~998).
- `stickyHeaderInnerRef` is a `<div>` inside a `position: sticky; top: 0` wrapper (line ~982–994) that holds a thead-only table duplicate.
- `handleMainScroll` (line 165) runs on the main div's `onScroll`, reads its `scrollLeft`, and applies `transform: translateX(-sl)` to `stickyHeaderInnerRef`.
- `syncScrollLeft` (line 174) re-applies after column-visibility / width changes.

## Target state

### DOM addition

Directly after the main scroll div (line ~1004 of current file, closing the `<div ref={mainScrollRef}>`), add:

```tsx
<div
  ref={stickyBottomScrollRef}
  className="sticky bottom-0 z-30 overflow-x-auto bg-white border-x border-b border-accent-200"
  onScroll={handleStickyBottomScroll}
  aria-hidden="true"
>
  <div style={{ width: tableWidth, height: 1 }} />
</div>
```

The outer div is `position: sticky; bottom: 0`, `overflow-x: auto`, matches the main table's border, and holds an empty width-matched inner div (1px tall). The browser renders a horizontal scrollbar on the outer div because its inner content is wider than itself. When the user drags this scrollbar, we mirror the scroll into `mainScrollRef`.

### Refs

Add one new ref at the top of the component:

```ts
const stickyBottomScrollRef = useRef<HTMLDivElement>(null);
```

### Scroll sync handlers

Two handlers, both guarded by an `isSyncingRef` to break the main ⇄ sticky scroll loop:

```ts
const isSyncingRef = useRef(false);

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

const handleStickyBottomScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
  if (isSyncingRef.current) return;
  const sl = e.currentTarget.scrollLeft;
  if (mainScrollRef.current) {
    isSyncingRef.current = true;
    mainScrollRef.current.scrollLeft = sl;
    requestAnimationFrame(() => { isSyncingRef.current = false; });
  }
  // Also drive the sticky header so it stays in sync when the user
  // scrolls via the bottom bar.
  if (stickyHeaderInnerRef.current) {
    stickyHeaderInnerRef.current.style.transform = `translateX(-${sl}px)`;
  }
}, []);
```

`syncScrollLeft` (the existing helper that runs after width/visibility changes) also assigns `stickyBottomScrollRef.current.scrollLeft = sl` to keep the third bar in sync after column changes.

### Width tracking

The sticky bottom's inner div's `width` must match the main table's `width` (already tracked via the existing `tableWidth` state). No additional state.

### Visibility

The sticky bottom is only useful when the main table overflows horizontally. If `tableWidth <= mainScrollRef.current.clientWidth`, the sticky bottom div has nothing to scroll and renders nothing meaningful, but also doesn't get in the way (its scrollbar disappears when content doesn't overflow).

Optionally hide the bar when no overflow exists:

```tsx
<div
  ref={stickyBottomScrollRef}
  className="sticky bottom-0 z-30 overflow-x-auto bg-white border-x border-b border-accent-200"
  style={{ display: needsHScroll ? 'block' : 'none' }}
  ...
>
```

where `needsHScroll` is derived via `ResizeObserver` on `mainScrollRef`. Recommended to include in the initial implementation to avoid a visible empty bar when columns fit.

### What does NOT change

- `mainScrollRef`, `handleMainScroll`'s header-sync branch, `stickyHeaderInnerRef`, `tableWidth`, `columnWidths`, colgroup/thead JSX.
- Page-level vertical scroll.
- Keyboard/mouse drag behavior on rows, column resize, product search modal.
- Other pages that use the same component (none — it's only used in the quote editor).

## Testing

### Automated

- Minimal: `tsc --noEmit` passes, existing vitest suite still green. No new unit tests — the behavior is DOM-sync which vitest/jsdom does not render meaningfully.

### Manual

1. Open a quote with many rows (scroll required) on a desktop browser with a trackpad or mouse.
2. Scroll the page halfway down. The sticky top header is visible, the sticky bottom scrollbar is visible at the bottom of the viewport.
3. Drag the sticky bottom scrollbar right. The main table pans right. The sticky top header pans right too.
4. Drag the main table's own (bottom-of-table) scrollbar right. The sticky bottom and sticky top both pan in step.
5. Resize the window narrower so more horizontal scroll is needed. The bars still sync, no drift.
6. Toggle a column's visibility. Scroll position clamps to the new max; all three bars stay aligned (`syncScrollLeft` call).
7. Hover over items, open context menu, edit cells — no regression.
8. Quote that fits without horizontal scroll: sticky bottom scrollbar is hidden (no ugly empty strip).

## Risk notes (production)

- **Scroll-loop risk**: the two-way sync can infinite-loop. Guarded by `isSyncingRef` + `requestAnimationFrame` debounce — standard pattern for linked scroll containers. If it misbehaves, the failure mode is a brief visual jitter, not a hang.
- **Z-index stacking**: the sticky bottom uses `z-30` (matches the sticky header). If any overlay (context menu, dropdown) is below `z-30`, it may render behind the scroll strip. Audit the Sil context menu + product search modal; bump z-indexes if needed.
- **Mobile / touch**: on touch devices the browser's native momentum scroll should still work. No change needed — the div uses native overflow.
- **Print**: `position: sticky` is inert on print media; the sticky bottom collapses. No print-view regression.
- **Accessibility**: the sticky bottom is `aria-hidden="true"` (it's a visual proxy only, all keyboard scroll still works on the main table).

## Rollback

If the feature misbehaves in production, a one-commit revert removes the sticky bottom div and both scroll-sync guards — no data or API surface is affected.
