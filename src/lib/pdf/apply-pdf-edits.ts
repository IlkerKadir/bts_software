/**
 * Apply cosmetic edits from the WYSIWYG PDF editor to a freshly-generated
 * quote template. The editor only modifies three regions of the document:
 *
 *   - `table.main > tbody` — item rows, commercial terms, notes
 *   - `.info-left`          — company info box (left cell)
 *   - `.info-right`         — proforma box (right cell)
 *
 * Everything else (the banner image, colgroup widths, `@page` rules, the
 * style block) comes straight from the fresh template. That way a cosmetic
 * edit can never corrupt the structural parts of the PDF.
 */
// jsdom ships no TypeScript types in this project; import as untyped.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { JSDOM } from 'jsdom';
import { sanitizePdfHtml } from './sanitize-html';

export interface PdfEdits {
  tbodyHtml?: string;
  infoLeftHtml?: string;
  infoRightHtml?: string;
  /**
   * innerHTML of `table.main > colgroup`. Added in Phase 3 to support
   * user-driven column-width drag: widths live as inline `style="width:N%"`
   * attributes on the `<col>` elements, captured via this fragment.
   * Older overrides saved without this field are still valid — the
   * splice is a no-op and the template's original CSS class widths
   * continue to apply.
   */
  colgroupHtml?: string;
}

export function applyPdfEdits(templateHtml: string, edits: PdfEdits): string {
  const dom = new JSDOM(templateHtml);
  const doc = dom.window.document;

  if (typeof edits.tbodyHtml === 'string') {
    const tbody = doc.querySelector('table.main > tbody');
    if (tbody) tbody.innerHTML = edits.tbodyHtml;
  }
  if (typeof edits.infoLeftHtml === 'string') {
    const el = doc.querySelector('.info-left');
    if (el) el.innerHTML = edits.infoLeftHtml;
  }
  if (typeof edits.infoRightHtml === 'string') {
    const el = doc.querySelector('.info-right');
    if (el) el.innerHTML = edits.infoRightHtml;
  }
  if (typeof edits.colgroupHtml === 'string') {
    const cg = doc.querySelector('table.main > colgroup');
    if (cg) cg.innerHTML = edits.colgroupHtml;
  }

  const result = '<!DOCTYPE html>' + doc.documentElement.outerHTML;
  return sanitizePdfHtml(result);
}
