import { useCallback, useRef, useState, type RefObject } from 'react';
import { snapshotEdits, applyEdits, wireEditorAttrs, type PdfEdits } from './buildEdits';

const MAX_HISTORY = 50;

interface HistoryStack {
  past: PdfEdits[];
  future: PdfEdits[];
}

/**
 * Undo/redo stack for the PDF editor. Snapshots are taken at the
 * fragment level (the same three HTML strings the save/download payload
 * uses) rather than at the keystroke level, for three reasons:
 *
 *  1. contenteditable produces very noisy input events — keystroke-level
 *     history would accumulate thousands of entries per session.
 *  2. Chrome's native `document.execCommand('undo')` doesn't see
 *     programmatic DOM changes like row inserts/resizes.
 *  3. The fragment shape is already the canonical unit the server uses
 *     for save — if the editor can save it, undo can restore it.
 *
 * The caller is responsible for calling `push()` before destructive
 * actions (row ops, format button clicks) and from a debounced input
 * handler. `undo`/`redo` restore the iframe document and re-wire the
 * contenteditable attributes that `applyEdits` discards.
 */
const INPUT_DEBOUNCE_MS = 400;

function snapshotsEqual(a: PdfEdits, b: PdfEdits): boolean {
  return (
    a.tbodyHtml === b.tbodyHtml &&
    a.infoLeftHtml === b.infoLeftHtml &&
    a.infoRightHtml === b.infoRightHtml &&
    a.colgroupHtml === b.colgroupHtml
  );
}

export function useHistory(params: {
  iframeRef: RefObject<HTMLIFrameElement | null>;
}) {
  const { iframeRef } = params;
  const stackRef = useRef<HistoryStack>({ past: [], future: [] });
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Version counter so callers re-render when canUndo/canRedo change.
  const [version, setVersion] = useState(0);

  const getDoc = useCallback((): Document | null => {
    return iframeRef.current?.contentDocument ?? null;
  }, [iframeRef]);

  const takeSnapshot = useCallback((): PdfEdits | null => {
    return snapshotEdits(getDoc());
  }, [getDoc]);

  const restore = useCallback((snap: PdfEdits) => {
    const doc = getDoc();
    if (!doc) return;
    applyEdits(doc, snap);
    wireEditorAttrs(doc);
  }, [getDoc]);

  /**
   * Cancel any pending debounced push (e.g. a still-scheduled input
   * debounce from the previous session or an in-flight keystroke).
   */
  const cancelPending = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
  }, []);

  /**
   * Internal: push `snap` onto the past stack with dedupe.
   */
  const pushSnapshot = useCallback((snap: PdfEdits) => {
    const stack = stackRef.current;
    const top = stack.past[stack.past.length - 1];
    if (top && snapshotsEqual(top, snap)) return;
    stack.past.push(snap);
    if (stack.past.length > MAX_HISTORY) stack.past.shift();
    stack.future = [];
    setVersion(v => v + 1);
  }, []);

  /**
   * Push the current state onto the undo stack immediately. Also
   * cancels any pending debounced push so a later input debounce can't
   * fire AFTER a row op and produce a ghost "post-mutation" snapshot
   * that makes the first undo click appear to do nothing.
   */
  const push = useCallback(() => {
    cancelPending();
    const snap = takeSnapshot();
    if (!snap) return;
    pushSnapshot(snap);
  }, [cancelPending, takeSnapshot, pushSnapshot]);

  /**
   * Schedule a debounced push. Multiple calls within the debounce
   * window collapse into a single push. Any subsequent `push()`,
   * `undo()`, `redo()`, or `clear()` cancels the pending timer.
   */
  const pushDebounced = useCallback(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      const snap = takeSnapshot();
      if (!snap) return;
      pushSnapshot(snap);
    }, INPUT_DEBOUNCE_MS);
  }, [takeSnapshot, pushSnapshot]);

  const undo = useCallback(() => {
    cancelPending();
    const stack = stackRef.current;
    const prev = stack.past.pop();
    if (!prev) return;
    const cur = takeSnapshot();
    if (cur) stack.future.push(cur);
    restore(prev);
    setVersion(v => v + 1);
  }, [cancelPending, takeSnapshot, restore]);

  const redo = useCallback(() => {
    cancelPending();
    const stack = stackRef.current;
    const next = stack.future.pop();
    if (!next) return;
    const cur = takeSnapshot();
    if (cur) stack.past.push(cur);
    restore(next);
    setVersion(v => v + 1);
  }, [cancelPending, takeSnapshot, restore]);

  const clear = useCallback(() => {
    cancelPending();
    stackRef.current = { past: [], future: [] };
    setVersion(v => v + 1);
  }, [cancelPending]);

  return {
    push,
    pushDebounced,
    undo,
    redo,
    clear,
    canUndo: stackRef.current.past.length > 0,
    canRedo: stackRef.current.future.length > 0,
    version,
  };
}
