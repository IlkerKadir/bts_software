/**
 * The four editable regions of the proforma template. The client edits
 * these; the server rebuilds the full template from fresh quote data and
 * splices the HTML strings back in. Keeping this shape consistent across
 * the editor, the save/download payload, and the undo history is how
 * regressions are prevented.
 *
 * `colgroupHtml` was added in Phase 3 for user-driven column-width drag.
 */
export interface PdfEdits {
  tbodyHtml: string;
  infoLeftHtml: string;
  infoRightHtml: string;
  colgroupHtml: string;
}

/**
 * Snapshot the four editable fragments from a live document. Strips
 * editor-only attributes (`contenteditable`, `spellcheck`, `data-selected`)
 * so the snapshot is suitable both for sending to the server and for
 * restoring later via `applyEdits`.
 */
export function snapshotEdits(doc: Document | null | undefined): PdfEdits | null {
  if (!doc) return null;

  const tbody = doc.querySelector('table.main > tbody');
  const infoLeft = doc.querySelector('.info-left');
  const infoRight = doc.querySelector('.info-right');
  const colgroup = doc.querySelector('table.main > colgroup');
  if (!tbody || !infoLeft || !infoRight || !colgroup) return null;

  const tbodyClone = tbody.cloneNode(true) as HTMLElement;
  const infoLeftClone = infoLeft.cloneNode(true) as HTMLElement;
  const infoRightClone = infoRight.cloneNode(true) as HTMLElement;
  const colgroupClone = colgroup.cloneNode(true) as HTMLElement;
  stripEditorAttrs(tbodyClone);
  stripEditorAttrs(infoLeftClone);
  stripEditorAttrs(infoRightClone);
  stripEditorAttrs(colgroupClone);

  return {
    tbodyHtml: tbodyClone.innerHTML,
    infoLeftHtml: infoLeftClone.innerHTML,
    infoRightHtml: infoRightClone.innerHTML,
    colgroupHtml: colgroupClone.innerHTML,
  };
}

/**
 * Restore a snapshot into a live document. The caller is responsible for
 * re-wiring editor attributes (via `wireEditorAttrs`) after this runs —
 * replacing innerHTML discards any contenteditable flags on the restored
 * elements.
 */
export function applyEdits(doc: Document, edits: PdfEdits): void {
  const tbody = doc.querySelector('table.main > tbody');
  const infoLeft = doc.querySelector('.info-left');
  const infoRight = doc.querySelector('.info-right');
  const colgroup = doc.querySelector('table.main > colgroup');
  if (tbody) tbody.innerHTML = edits.tbodyHtml;
  if (infoLeft) infoLeft.innerHTML = edits.infoLeftHtml;
  if (infoRight) infoRight.innerHTML = edits.infoRightHtml;
  if (colgroup && typeof edits.colgroupHtml === 'string') {
    colgroup.innerHTML = edits.colgroupHtml;
  }
}

/**
 * Mark the editable regions as contenteditable. Called both when the
 * iframe first loads and after an undo/redo restores a snapshot (which
 * wipes the attributes by replacing innerHTML).
 *
 * Selector notes:
 *   - `table.main tbody td > p` — every item cell's paragraph.
 *   - `.info-left p` — every paragraph in the customer info box.
 *   - `.info-right > p` — the PROFORMA FATURA title (direct child of
 *     `.info-right`). The child combinator avoids matching the nested
 *     `<p>` elements inside the inner date/refNo/quoteNo table, which
 *     are covered by the next selector.
 *   - `.info-right td` — the date/refNo/quoteNo cells in the inner table.
 */
export function wireEditorAttrs(doc: Document): void {
  doc.querySelectorAll<HTMLElement>('table.main tbody td > p').forEach(p => {
    p.setAttribute('contenteditable', 'true');
    p.setAttribute('spellcheck', 'false');
    // An empty <p> collapses to 0 height; give it a <br> placeholder so
    // the user can click into added rows.
    if (!p.textContent || p.textContent.trim() === '') {
      p.innerHTML = '<br>';
    }
  });
  doc.querySelectorAll<HTMLElement>('.info-left p, .info-right > p, .info-right td').forEach(el => {
    el.setAttribute('contenteditable', 'true');
    el.setAttribute('spellcheck', 'false');
  });
}

function stripEditorAttrs(root: Element) {
  root.querySelectorAll('tr[data-selected="true"]').forEach(el => {
    el.removeAttribute('data-selected');
  });
  root.querySelectorAll('[contenteditable]').forEach(el => {
    el.removeAttribute('contenteditable');
    el.removeAttribute('spellcheck');
  });
  root.querySelectorAll('[data-col-resizing]').forEach(el => {
    el.removeAttribute('data-col-resizing');
  });
}
