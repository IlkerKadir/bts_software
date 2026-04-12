import { useCallback, useState, type RefObject } from 'react';
import { EDITOR_STYLES } from './editor-styles';
import { wireEditorAttrs } from './buildEdits';

/**
 * Wires an iframe holding the quote template for editing: injects
 * editor-only CSS, marks paragraphs contenteditable, hooks up row-click
 * selection, adds the drag-to-resize edge handlers, debounces input
 * events into history pushes, and binds undo/redo keyboard shortcuts.
 */
export function useIframeEditor(params: {
  iframeRef: RefObject<HTMLIFrameElement | null>;
  onInputDebounced: () => void;
  onBeforeMutation: () => void;
  onUndo: () => void;
  onRedo: () => void;
}) {
  const { iframeRef, onInputDebounced, onBeforeMutation, onUndo, onRedo } = params;
  const [selectedRow, setSelectedRow] = useState<HTMLTableRowElement | null>(null);
  const [iframeHeight, setIframeHeight] = useState(1200);

  const handleIframeLoad = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe || !iframe.contentDocument) return;
    const doc = iframe.contentDocument;

    // Editor-only styles (scoped to the iframe)
    const editorStyle = doc.createElement('style');
    editorStyle.setAttribute('data-editor-only', 'true');
    editorStyle.textContent = EDITOR_STYLES;
    doc.head.appendChild(editorStyle);

    wireEditorAttrs(doc);

    // Row click selection
    const handleClick = (e: Event) => {
      const target = e.target as HTMLElement;
      const tr = target.closest('tr');
      if (tr) {
        doc.querySelectorAll('tr[data-selected="true"]').forEach(el => {
          el.removeAttribute('data-selected');
        });
        tr.setAttribute('data-selected', 'true');
        setSelectedRow(tr as HTMLTableRowElement);
      }
    };
    doc.addEventListener('click', handleClick);

    // Drag-to-resize handler (edge hit test + merge/split logic)
    const getColspan = (el: Element) => parseInt(el.getAttribute('colspan') || '1', 10);

    const makeEmptyBodyCell = (): HTMLTableCellElement => {
      const newTd = doc.createElement('td');
      const p = doc.createElement('p');
      p.className = 's2';
      p.setAttribute('contenteditable', 'true');
      p.setAttribute('spellcheck', 'false');
      p.innerHTML = '<br>';
      newTd.appendChild(p);
      return newTd;
    };

    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement;
      const td = target.closest('td') as HTMLTableCellElement | null;
      if (!td || !td.closest('table.main')) return;
      const rowEl = td.parentElement;
      if (!rowEl || rowEl.closest('thead')) return;

      const rect = td.getBoundingClientRect();
      const nearRight = e.clientX >= rect.right - 8;
      const nearLeft = e.clientX <= rect.left + 8;
      if (!nearRight && !nearLeft) return;

      e.preventDefault();
      e.stopPropagation();
      const edge: 'left' | 'right' = nearRight ? 'right' : 'left';
      td.setAttribute('data-col-resizing', 'true');

      // Snapshot the state BEFORE the resize begins so undo restores
      // the pre-drag layout in a single step, not per-pointermove.
      onBeforeMutation();

      const onMove = (ev: PointerEvent) => {
        if (edge === 'right') {
          let sib = td.nextElementSibling as HTMLTableCellElement | null;
          while (sib) {
            const sRect = sib.getBoundingClientRect();
            if (ev.clientX > sRect.left + sRect.width / 2) {
              td.setAttribute('colspan', String(getColspan(td) + getColspan(sib)));
              const next = sib.nextElementSibling as HTMLTableCellElement | null;
              sib.remove();
              sib = next;
            } else break;
          }
          const cur = getColspan(td);
          if (cur > 1) {
            const tdRect = td.getBoundingClientRect();
            const vw = tdRect.width / cur;
            const steps = Math.min(cur - 1, Math.max(0, Math.floor((tdRect.right - ev.clientX) / vw)));
            if (steps > 0) {
              td.setAttribute('colspan', String(cur - steps));
              for (let i = 0; i < steps; i++) {
                rowEl.insertBefore(makeEmptyBodyCell(), td.nextElementSibling);
              }
            }
          }
        } else {
          let prev = td.previousElementSibling as HTMLTableCellElement | null;
          while (prev) {
            const pRect = prev.getBoundingClientRect();
            if (ev.clientX < pRect.left + pRect.width / 2) {
              td.setAttribute('colspan', String(getColspan(td) + getColspan(prev)));
              const prevPrev = prev.previousElementSibling as HTMLTableCellElement | null;
              prev.remove();
              prev = prevPrev;
            } else break;
          }
          const cur = getColspan(td);
          if (cur > 1) {
            const tdRect = td.getBoundingClientRect();
            const vw = tdRect.width / cur;
            const steps = Math.min(cur - 1, Math.max(0, Math.floor((ev.clientX - tdRect.left) / vw)));
            if (steps > 0) {
              td.setAttribute('colspan', String(cur - steps));
              for (let i = 0; i < steps; i++) {
                rowEl.insertBefore(makeEmptyBodyCell(), td);
              }
            }
          }
        }
      };

      const onUp = () => {
        td.removeAttribute('data-col-resizing');
        doc.removeEventListener('pointermove', onMove);
        doc.removeEventListener('pointerup', onUp);
      };

      doc.addEventListener('pointermove', onMove);
      doc.addEventListener('pointerup', onUp);
    };
    doc.addEventListener('pointerdown', handlePointerDown, true);

    /**
     * Column-width drag on the header row. Pointerdown on the right edge
     * of a `.col-hdr` cell (other than the last) re-distributes width
     * between that column and its right neighbor. Widths are written as
     * inline `style="width:N%"` on the two affected `<col>` elements so
     * the `colgroupHtml` snapshot captures them.
     */
    const handleHeaderPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement;
      const td = target.closest('td.col-hdr') as HTMLTableCellElement | null;
      if (!td) return;
      const rect = td.getBoundingClientRect();
      if (e.clientX < rect.right - 8) return;

      const headerRow = td.parentElement;
      if (!headerRow) return;
      const headerCells = Array.from(headerRow.querySelectorAll<HTMLTableCellElement>('td.col-hdr'));
      const colIndex = headerCells.indexOf(td);
      if (colIndex < 0 || colIndex >= headerCells.length - 1) return;

      const colgroup = doc.querySelector('table.main > colgroup');
      if (!colgroup) return;
      const cols = Array.from(colgroup.querySelectorAll<HTMLTableColElement>('col'));
      const colA = cols[colIndex];
      const colB = cols[colIndex + 1];
      const neighborCell = headerCells[colIndex + 1];
      if (!colA || !colB || !neighborCell) return;

      const tableEl = td.closest('table');
      if (!tableEl) return;
      const tableWidth = tableEl.getBoundingClientRect().width;
      if (tableWidth <= 0) return;

      const startWidthAPx = rect.width;
      const startWidthBPx = neighborCell.getBoundingClientRect().width;
      const totalABPx = startWidthAPx + startWidthBPx;
      const startX = e.clientX;

      e.preventDefault();
      e.stopPropagation();
      td.setAttribute('data-col-width-resizing', 'true');
      onBeforeMutation();

      const onMove = (ev: PointerEvent) => {
        const deltaPx = ev.clientX - startX;
        // Clamp so neither column shrinks below 20 px
        const newAPx = Math.max(20, Math.min(totalABPx - 20, startWidthAPx + deltaPx));
        const newBPx = totalABPx - newAPx;
        const aPct = (newAPx / tableWidth) * 100;
        const bPct = (newBPx / tableWidth) * 100;
        colA.style.width = `${aPct.toFixed(2)}%`;
        colB.style.width = `${bPct.toFixed(2)}%`;
      };

      const onUp = () => {
        td.removeAttribute('data-col-width-resizing');
        doc.removeEventListener('pointermove', onMove);
        doc.removeEventListener('pointerup', onUp);
      };

      doc.addEventListener('pointermove', onMove);
      doc.addEventListener('pointerup', onUp);
    };
    doc.addEventListener('pointerdown', handleHeaderPointerDown, true);

    // Forward `input` events to the history hook, which owns the
    // debounce timer. Keeping the timer inside useHistory lets row ops
    // and undo/redo cancel any pending push, which eliminates the
    // ghost "post-mutation" snapshot bug.
    const handleInput = () => onInputDebounced();
    doc.addEventListener('input', handleInput, true);

    // Undo/redo keyboard shortcuts. Bound to the iframe's contentDocument
    // because the iframe steals focus when a user types — a host-level
    // keydown listener would never fire during editing.
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;
      if (!isMod) return;
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        onUndo();
      } else if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault();
        onRedo();
      }
    };
    doc.addEventListener('keydown', handleKeyDown);

    // Auto-size iframe to content height
    const contentHeight = doc.documentElement.scrollHeight;
    setIframeHeight(Math.max(contentHeight + 40, 1200));
  }, [iframeRef, onBeforeMutation, onInputDebounced, onUndo, onRedo]);

  return { selectedRow, setSelectedRow, iframeHeight, handleIframeLoad };
}
