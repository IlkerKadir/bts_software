import type { RefObject } from 'react';

/**
 * Text formatting helpers for the PDF editor. Each function operates on
 * the current selection inside the iframe's contentDocument.
 *
 * Most actions wrap `document.execCommand`. execCommand is deprecated but
 * remains the simplest way to apply inline formatting to a contenteditable
 * selection. Two gotchas:
 *
 *   - execCommand('fontSize') emits `<font size="1..7">`, and
 *     execCommand('fontName') emits `<font face="...">`. `<font>` is not
 *     in the DOMPurify allowlist, so the server would strip it on save.
 *     We post-process the DOM to rewrite any `<font>` into a
 *     `<span style="font-size:...">` / `<span style="font-family:...">`.
 *
 *   - execCommand('foreColor') uses `<font color="...">` in some browsers
 *     but newer Chrome produces `<span style="color:...">` directly. We
 *     still run the rewrite pass just in case.
 *
 * All functions return `true` if something changed, `false` otherwise.
 * The caller is responsible for pushing a history snapshot BEFORE calling
 * any of these.
 */

type IframeRef = RefObject<HTMLIFrameElement | null>;

function getDoc(ref: IframeRef): Document | null {
  return ref.current?.contentDocument ?? null;
}

function exec(ref: IframeRef, cmd: string, value?: string): boolean {
  const doc = getDoc(ref);
  if (!doc) return false;
  // Focus the iframe so execCommand has a live selection to act on
  ref.current?.focus();
  const ok = doc.execCommand(cmd, false, value);
  rewriteFontTags(doc);
  return ok;
}

/**
 * Replace any `<font>` elements with `<span style="...">`. Runs after
 * every execCommand that might emit `<font>` (fontSize, fontName, foreColor
 * in older browsers).
 */
function rewriteFontTags(doc: Document): void {
  doc.querySelectorAll<HTMLElement>('font').forEach(f => {
    const span = doc.createElement('span');
    const styles: string[] = [];

    // size="1..7" → map to a pt value. We pick values close to the
    // template's defaults so transitions between execCommand wrappers
    // and our custom setFontSize function stay smooth.
    const size = f.getAttribute('size');
    if (size) {
      const ptBySize: Record<string, string> = {
        '1': '6pt', '2': '7pt', '3': '8pt', '4': '10pt',
        '5': '12pt', '6': '14pt', '7': '18pt',
      };
      styles.push(`font-size:${ptBySize[size] || '8pt'}`);
    }
    const face = f.getAttribute('face');
    if (face) styles.push(`font-family:${face}`);
    const color = f.getAttribute('color');
    if (color) styles.push(`color:${color}`);

    // Preserve any explicit style attribute already on the <font>
    const existingStyle = f.getAttribute('style');
    if (existingStyle) styles.push(existingStyle);

    if (styles.length > 0) {
      span.setAttribute('style', styles.join(';'));
    }
    while (f.firstChild) span.appendChild(f.firstChild);
    f.replaceWith(span);
  });
}

export function toggleBold(ref: IframeRef): boolean {
  return exec(ref, 'bold');
}

export function toggleItalic(ref: IframeRef): boolean {
  return exec(ref, 'italic');
}

export function toggleUnderline(ref: IframeRef): boolean {
  return exec(ref, 'underline');
}

export function setAlignment(ref: IframeRef, align: 'left' | 'center' | 'right'): boolean {
  const cmd = align === 'left' ? 'justifyLeft' : align === 'center' ? 'justifyCenter' : 'justifyRight';
  return exec(ref, cmd);
}

/**
 * Set the selection's font size using a precise pt value. execCommand's
 * `fontSize` only accepts 1-7, which map to a fixed browser scale and
 * don't match the template's 8pt default. We use a dummy `fontSize='7'`
 * to wrap the selection in `<font size="7">`, then immediately rewrite
 * that wrapper to `<span style="font-size:Npt">`.
 */
export function setFontSize(ref: IframeRef, sizePt: number): boolean {
  const doc = getDoc(ref);
  if (!doc) return false;
  ref.current?.focus();
  // Use an unusual size marker to make rewriting unambiguous
  const ok = doc.execCommand('fontSize', false, '7');
  if (!ok) return false;
  doc.querySelectorAll<HTMLElement>('font[size="7"]').forEach(f => {
    const span = doc.createElement('span');
    span.setAttribute('style', `font-size:${sizePt}pt`);
    while (f.firstChild) span.appendChild(f.firstChild);
    f.replaceWith(span);
  });
  return true;
}

/**
 * Set the selection's font family. Same trick as setFontSize: use
 * execCommand to wrap, then rewrite.
 */
export function setFontFamily(ref: IframeRef, family: string): boolean {
  const doc = getDoc(ref);
  if (!doc) return false;
  ref.current?.focus();
  const ok = doc.execCommand('fontName', false, family);
  if (!ok) return false;
  rewriteFontTags(doc);
  return true;
}

/**
 * Set the selection's text color.
 */
export function setTextColor(ref: IframeRef, color: string): boolean {
  return exec(ref, 'foreColor', color);
}

/**
 * Set the background color of the `<td>` containing the current
 * selection. execCommand's `hiliteColor` would work on inline runs, but
 * for our template we almost always want to color the whole cell.
 */
export function setCellBackground(ref: IframeRef, color: string | null): boolean {
  const doc = getDoc(ref);
  if (!doc) return false;
  const td = getSelectedCell(doc);
  if (!td) return false;
  if (color) {
    td.style.backgroundColor = color;
  } else {
    td.style.removeProperty('background-color');
  }
  return true;
}

/**
 * Highlight every `<td>` in the currently-selected row (the row with
 * `data-selected="true"`). Pass `null` to clear.
 */
export function setRowHighlight(ref: IframeRef, color: string | null): boolean {
  const doc = getDoc(ref);
  if (!doc) return false;
  const row = doc.querySelector('tr[data-selected="true"]');
  if (!row) return false;
  row.querySelectorAll<HTMLTableCellElement>('td').forEach(td => {
    if (color) {
      td.style.backgroundColor = color;
    } else {
      td.style.removeProperty('background-color');
    }
  });
  return true;
}

function getSelectedCell(doc: Document): HTMLTableCellElement | null {
  const sel = doc.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  const node = range.startContainer;
  const el = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  return el?.closest('td') ?? null;
}
