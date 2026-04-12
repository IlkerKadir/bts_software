/**
 * Editor-only CSS injected into the iframe's `<head>` on load. Marked with
 * `data-editor-only="true"` so it can be stripped before serializing for
 * the PDF export.
 */
export const EDITOR_STYLES = `
[contenteditable="true"]:hover {
  outline: 1px dashed rgba(59, 130, 246, 0.4);
  cursor: text;
}
[contenteditable="true"]:focus {
  outline: 2px solid rgba(59, 130, 246, 0.6);
  background-color: rgba(59, 130, 246, 0.05);
}
tr[data-selected="true"] {
  outline: 2px solid #f59e0b;
  outline-offset: -2px;
}
/* Drag-to-resize: both the left and right edges of every body cell are
   6px handles that show the col-resize cursor. The td itself needs
   relative positioning so the pseudo-elements can be placed. */
table.main tbody td {
  position: relative;
}
table.main tbody td::before,
table.main tbody td::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  width: 6px;
  cursor: col-resize;
  z-index: 2;
}
table.main tbody td::before { left: -3px; }
table.main tbody td::after  { right: -3px; }
table.main tbody td[data-col-resizing="true"] {
  background: rgba(245, 158, 11, 0.12);
}
/* Column-width drag: the right edge of every column header cell is a
   6px handle that re-distributes width between the column and its
   right neighbor. Only applies to real column headers (.col-hdr). */
table.main thead td.col-hdr {
  position: relative;
}
table.main thead td.col-hdr::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  right: -3px;
  width: 6px;
  cursor: col-resize;
  z-index: 2;
}
table.main thead td.col-hdr[data-col-width-resizing="true"] {
  background: rgba(59, 130, 246, 0.12);
}
`;
