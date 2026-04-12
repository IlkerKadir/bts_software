import { useCallback, useRef, type Dispatch, type SetStateAction } from 'react';
import { sumPricedRowsAbove, formatTurkishCurrency } from './numeric-ops';

/**
 * Row-level operations on the editable tbody. Each mutation pushes a
 * history snapshot BEFORE applying, so undo restores the state just
 * before the button was clicked.
 */
export function useRowOps(params: {
  selectedRow: HTMLTableRowElement | null;
  setSelectedRow: Dispatch<SetStateAction<HTMLTableRowElement | null>>;
  pushHistory: () => void;
}) {
  const { selectedRow, setSelectedRow, pushHistory } = params;

  // In-memory clipboard for row copy/paste. Kept at the hook level so it
  // survives across selection changes but does not persist across page
  // reloads (matches plan: session-scoped, not cross-quote).
  const clipboardRef = useRef<string | null>(null);

  const cloneSelectedRow = useCallback((): HTMLTableRowElement | null => {
    if (!selectedRow) return null;
    const clone = selectedRow.cloneNode(true) as HTMLTableRowElement;
    clone.removeAttribute('data-selected');
    // Keep the `<p>` wrappers (and their `.s1`/`.s2` classes) so the
    // cloned row renders with the same font as the source row.
    clone.querySelectorAll<HTMLElement>('p').forEach(p => {
      p.innerHTML = '<br>';
    });
    return clone;
  }, [selectedRow]);

  const addRowAbove = useCallback(() => {
    if (!selectedRow || !selectedRow.parentNode) return;
    pushHistory();
    const clone = cloneSelectedRow();
    if (!clone) return;
    selectedRow.parentNode.insertBefore(clone, selectedRow);
  }, [selectedRow, cloneSelectedRow, pushHistory]);

  const addRowBelow = useCallback(() => {
    if (!selectedRow || !selectedRow.parentNode) return;
    pushHistory();
    const clone = cloneSelectedRow();
    if (!clone) return;
    selectedRow.parentNode.insertBefore(clone, selectedRow.nextSibling);
  }, [selectedRow, cloneSelectedRow, pushHistory]);

  const duplicateRow = useCallback(() => {
    if (!selectedRow || !selectedRow.parentNode) return;
    pushHistory();
    const clone = selectedRow.cloneNode(true) as HTMLTableRowElement;
    clone.removeAttribute('data-selected');
    selectedRow.parentNode.insertBefore(clone, selectedRow.nextSibling);
  }, [selectedRow, pushHistory]);

  const deleteRow = useCallback(() => {
    if (!selectedRow) return;
    if (!confirm('Bu satırı silmek istediğinizden emin misiniz?')) return;
    pushHistory();
    selectedRow.remove();
    setSelectedRow(null);
  }, [selectedRow, setSelectedRow, pushHistory]);

  /**
   * Split a merged row back into 5 standard columns. Existing text is
   * moved into the AÇIKLAMA column so it isn't lost.
   */
  const splitRowCells = useCallback(() => {
    if (!selectedRow) return;
    const cells = Array.from(selectedRow.querySelectorAll<HTMLTableCellElement>('td'));
    if (cells.length >= 5) return;
    pushHistory();
    const existingText = (cells[0]?.textContent || '').trim();

    const doc = selectedRow.ownerDocument;
    selectedRow.innerHTML = '';
    const makeCell = (align: string, text: string, cls = 's2') => {
      const td = doc.createElement('td');
      const p = doc.createElement('p');
      p.className = cls;
      p.setAttribute('style', `text-align:${align};`);
      p.setAttribute('contenteditable', 'true');
      p.setAttribute('spellcheck', 'false');
      p.innerHTML = text || '<br>';
      td.appendChild(p);
      return td;
    };
    selectedRow.appendChild(makeCell('center', '', 's1'));
    selectedRow.appendChild(makeCell('left', existingText));
    selectedRow.appendChild(makeCell('right', ''));
    selectedRow.appendChild(makeCell('right', ''));
    selectedRow.appendChild(makeCell('right', ''));
  }, [selectedRow, pushHistory]);

  /**
   * Insert a section-heading row below the selected row. Uses the
   * template's existing `.section-hdr` class which carries the green
   * background styling.
   */
  const insertSectionHeading = useCallback(() => {
    if (!selectedRow || !selectedRow.parentNode) return;
    pushHistory();
    const doc = selectedRow.ownerDocument;
    const tr = doc.createElement('tr');
    tr.className = 'section-hdr';
    const td = doc.createElement('td');
    td.setAttribute('colspan', '5');
    const p = doc.createElement('p');
    p.className = 's1';
    p.setAttribute('style', 'padding-left:1pt;color:black;');
    p.setAttribute('contenteditable', 'true');
    p.setAttribute('spellcheck', 'false');
    p.textContent = 'BAŞLIK';
    td.appendChild(p);
    tr.appendChild(td);
    selectedRow.parentNode.insertBefore(tr, selectedRow.nextSibling);
  }, [selectedRow, pushHistory]);

  /**
   * Insert a blank 6pt spacer row below the selected row. Matches the
   * style of the spacer rows the server emits around subtotal cards.
   */
  const insertSpacerRow = useCallback(() => {
    if (!selectedRow || !selectedRow.parentNode) return;
    pushHistory();
    const doc = selectedRow.ownerDocument;
    const tr = doc.createElement('tr');
    const td = doc.createElement('td');
    td.setAttribute('colspan', '5');
    td.setAttribute('style', 'height:6pt; border:none; padding:0;');
    tr.appendChild(td);
    selectedRow.parentNode.insertBefore(tr, selectedRow.nextSibling);
  }, [selectedRow, pushHistory]);

  /**
   * Insert a static subtotal "card" row below the selected row. The
   * amount is empty by default — the user types it in, or uses the
   * numerical helpers in Phase 5 to auto-sum the rows above.
   *
   * The layout matches the server's existing subtotal structure
   * (`.sys-total-label` colspan=4 + `.sys-total-val`), wrapped by 6pt
   * spacer rows above and below, so it renders identically whether
   * inserted here or emitted by `generateQuoteHtml`.
   */
  const insertSubtotalRow = useCallback(() => {
    if (!selectedRow || !selectedRow.parentNode) return;
    pushHistory();
    const doc = selectedRow.ownerDocument;
    const parent = selectedRow.parentNode;

    const makeSpacer = () => {
      const tr = doc.createElement('tr');
      const td = doc.createElement('td');
      td.setAttribute('colspan', '5');
      td.setAttribute('style', 'height:4pt; border:none; padding:0;');
      tr.appendChild(td);
      return tr;
    };

    const tr = doc.createElement('tr');
    tr.setAttribute('style', 'height:12pt');

    const labelTd = doc.createElement('td');
    labelTd.className = 'sys-total-label';
    labelTd.setAttribute('colspan', '4');
    const labelP = doc.createElement('p');
    labelP.className = 's1';
    labelP.setAttribute('style', 'text-align:right;');
    labelP.setAttribute('contenteditable', 'true');
    labelP.setAttribute('spellcheck', 'false');
    labelP.textContent = 'ARA TOPLAM';
    labelTd.appendChild(labelP);

    const valTd = doc.createElement('td');
    valTd.className = 'sys-total-val';
    const valP = doc.createElement('p');
    valP.className = 's1';
    valP.setAttribute('style', 'text-align:right;');
    valP.setAttribute('contenteditable', 'true');
    valP.setAttribute('spellcheck', 'false');
    valP.textContent = '0,00';
    valTd.appendChild(valP);

    tr.appendChild(labelTd);
    tr.appendChild(valTd);

    const anchor = selectedRow.nextSibling;
    parent.insertBefore(makeSpacer(), anchor);
    parent.insertBefore(tr, anchor);
    parent.insertBefore(makeSpacer(), anchor);
  }, [selectedRow, pushHistory]);

  /**
   * Move the selected row one position up in its parent (swap with the
   * previous sibling).
   */
  const moveRowUp = useCallback(() => {
    if (!selectedRow || !selectedRow.parentNode) return;
    const prev = selectedRow.previousElementSibling;
    if (!prev) return;
    pushHistory();
    selectedRow.parentNode.insertBefore(selectedRow, prev);
  }, [selectedRow, pushHistory]);

  /**
   * Move the selected row one position down (swap with the next sibling).
   */
  const moveRowDown = useCallback(() => {
    if (!selectedRow || !selectedRow.parentNode) return;
    const next = selectedRow.nextElementSibling;
    if (!next) return;
    pushHistory();
    selectedRow.parentNode.insertBefore(next, selectedRow);
  }, [selectedRow, pushHistory]);

  /**
   * Copy the selected row to the in-memory clipboard. No history push —
   * copy is non-destructive.
   */
  const copyRow = useCallback(() => {
    if (!selectedRow) return;
    const clone = selectedRow.cloneNode(true) as HTMLTableRowElement;
    clone.removeAttribute('data-selected');
    clone.querySelectorAll('[contenteditable]').forEach(el => {
      el.removeAttribute('contenteditable');
      el.removeAttribute('spellcheck');
    });
    clipboardRef.current = clone.outerHTML;
  }, [selectedRow]);

  /**
   * Insert a generic "total heading" row below the selected row: a full-
   * width right-aligned bold label the user fills in (e.g. "TOPLAM
   * 1.234,56 €"). This is the cosmetic-only equivalent of a total
   * heading — actual subtotal / discount / grand-total structure lives
   * on the quote editor side and flows through via the template.
   */
  const insertTotalHeadingRow = useCallback(() => {
    if (!selectedRow || !selectedRow.parentNode) return;
    pushHistory();
    const doc = selectedRow.ownerDocument;
    const tr = doc.createElement('tr');
    tr.setAttribute('style', 'height:12pt');
    const td = doc.createElement('td');
    td.setAttribute('colspan', '5');
    const p = doc.createElement('p');
    p.className = 's1';
    p.setAttribute('style', 'text-align:right; padding:3pt 6pt;');
    p.setAttribute('contenteditable', 'true');
    p.setAttribute('spellcheck', 'false');
    p.textContent = 'TOPLAM';
    td.appendChild(p);
    tr.appendChild(td);
    selectedRow.parentNode.insertBefore(tr, selectedRow.nextSibling);
  }, [selectedRow, pushHistory]);

  /**
   * Insert a discount "card" row below the selected row. Same structure
   * as `insertSubtotalRow` but labelled "İSKONTO" — the user types the
   * discount amount manually.
   */
  const insertDiscountRow = useCallback(() => {
    if (!selectedRow || !selectedRow.parentNode) return;
    pushHistory();
    const doc = selectedRow.ownerDocument;
    const parent = selectedRow.parentNode;

    const makeSpacer = () => {
      const tr = doc.createElement('tr');
      const td = doc.createElement('td');
      td.setAttribute('colspan', '5');
      td.setAttribute('style', 'height:4pt; border:none; padding:0;');
      tr.appendChild(td);
      return tr;
    };

    const tr = doc.createElement('tr');
    tr.setAttribute('style', 'height:12pt');

    const labelTd = doc.createElement('td');
    labelTd.className = 'sys-total-label';
    labelTd.setAttribute('colspan', '4');
    const labelP = doc.createElement('p');
    labelP.className = 's1';
    labelP.setAttribute('style', 'text-align:right;');
    labelP.setAttribute('contenteditable', 'true');
    labelP.setAttribute('spellcheck', 'false');
    labelP.textContent = 'İSKONTO';
    labelTd.appendChild(labelP);

    const valTd = doc.createElement('td');
    valTd.className = 'sys-total-val';
    const valP = doc.createElement('p');
    valP.className = 's1';
    valP.setAttribute('style', 'text-align:right;');
    valP.setAttribute('contenteditable', 'true');
    valP.setAttribute('spellcheck', 'false');
    valP.textContent = '0,00';
    valTd.appendChild(valP);

    tr.appendChild(labelTd);
    tr.appendChild(valTd);

    const anchor = selectedRow.nextSibling;
    parent.insertBefore(makeSpacer(), anchor);
    parent.insertBefore(tr, anchor);
    parent.insertBefore(makeSpacer(), anchor);
  }, [selectedRow, pushHistory]);

  /**
   * Sum the last-column values of all priced rows above the selected
   * row (stopping at another subtotal card) and write the result into
   * the selected row's rightmost cell. Gives the user a one-click
   * "auto-sum" for a subtotal or grand total that they inserted earlier.
   *
   * This is a static computation — the value is frozen at click time.
   * If the user later edits rows above, they must click again to
   * refresh the sum. This is by design: Puppeteer runs with JS
   * disabled, so a live-recomputing formula has no way to work in the
   * exported PDF.
   */
  const sumRowsIntoSelected = useCallback(() => {
    if (!selectedRow) return;
    const { total, symbol } = sumPricedRowsAbove(selectedRow);
    if (total === 0) return;
    pushHistory();
    const cells = selectedRow.querySelectorAll('td');
    const targetCell = cells[cells.length - 1];
    if (!targetCell) return;
    const p = targetCell.querySelector('p') || targetCell;
    p.textContent = formatTurkishCurrency(total, symbol);
  }, [selectedRow, pushHistory]);

  /**
   * Paste the clipboard row below the selected row (or at the end of
   * tbody if no row is selected).
   */
  const pasteRow = useCallback(() => {
    const html = clipboardRef.current;
    if (!html) return;
    if (!selectedRow || !selectedRow.parentNode) return;
    pushHistory();
    const doc = selectedRow.ownerDocument;
    const wrapper = doc.createElement('tbody');
    wrapper.innerHTML = html;
    const newRow = wrapper.firstElementChild as HTMLTableRowElement | null;
    if (!newRow) return;
    // Re-wire contenteditable on the pasted row's paragraphs
    newRow.querySelectorAll<HTMLElement>('p').forEach(p => {
      p.setAttribute('contenteditable', 'true');
      p.setAttribute('spellcheck', 'false');
    });
    selectedRow.parentNode.insertBefore(newRow, selectedRow.nextSibling);
  }, [selectedRow, pushHistory]);

  return {
    addRowAbove,
    addRowBelow,
    duplicateRow,
    deleteRow,
    splitRowCells,
    insertSectionHeading,
    insertSpacerRow,
    insertSubtotalRow,
    insertDiscountRow,
    insertTotalHeadingRow,
    sumRowsIntoSelected,
    moveRowUp,
    moveRowDown,
    copyRow,
    pasteRow,
    hasClipboard: () => clipboardRef.current !== null,
  };
}
