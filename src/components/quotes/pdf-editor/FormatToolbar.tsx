import { useRef, type RefObject } from 'react';
import {
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Highlighter,
} from 'lucide-react';
import { Button } from '@/components/ui';
import {
  toggleBold,
  toggleItalic,
  toggleUnderline,
  setAlignment,
  setFontSize,
  setFontFamily,
  setTextColor,
  setCellBackground,
  setRowHighlight,
} from './formatting';

interface Props {
  iframeRef: RefObject<HTMLIFrameElement | null>;
  pushHistory: () => void;
}

const FONT_SIZES = [6, 7, 8, 9, 10, 11, 12, 14, 16, 18];
const FONT_FAMILIES = ['Arial', 'Times New Roman', 'Courier New', 'Verdana', 'Georgia'];

/**
 * Formatting toolbar: bold/italic/underline, alignment, font size and
 * family, text color, cell background, row highlight.
 *
 * Two different focus strategies are mixed here:
 *
 *   - **Buttons** use `onMouseDown={preventDefault}` to keep focus on
 *     the iframe. execCommand requires a live selection in the target
 *     document, and preventing the button's default focus change keeps
 *     that selection intact.
 *
 *   - **Selects and color inputs** can't use preventDefault because
 *     that also blocks the native dropdown / color picker from opening.
 *     Instead, they save the iframe selection range on mousedown (which
 *     fires before the focus change) and restore it in their onChange
 *     handler right before applying the format.
 */
export function FormatToolbar({ iframeRef, pushHistory }: Props) {
  const savedRangeRef = useRef<Range | null>(null);

  const saveSelection = () => {
    const sel = iframeRef.current?.contentDocument?.getSelection();
    if (sel && sel.rangeCount > 0) {
      savedRangeRef.current = sel.getRangeAt(0).cloneRange();
    }
  };

  const restoreSelection = () => {
    const range = savedRangeRef.current;
    if (!range) return;
    const doc = iframeRef.current?.contentDocument;
    const sel = doc?.getSelection();
    if (!sel) return;
    sel.removeAllRanges();
    sel.addRange(range);
  };

  const runWithRestoredSelection = (fn: () => void) => {
    restoreSelection();
    pushHistory();
    fn();
  };

  // For buttons: preventDefault on mousedown stops focus from leaving
  // the iframe, keeping execCommand's target selection alive.
  const keepFocus = (e: React.MouseEvent) => e.preventDefault();

  const runButton = (fn: () => void) => {
    pushHistory();
    fn();
  };

  return (
    <div className="flex items-center gap-1">
      <Button variant="secondary" size="sm" onMouseDown={keepFocus} onClick={() => runButton(() => toggleBold(iframeRef))} title="Kalın (Ctrl+B)">
        <Bold className="h-4 w-4" />
      </Button>
      <Button variant="secondary" size="sm" onMouseDown={keepFocus} onClick={() => runButton(() => toggleItalic(iframeRef))} title="İtalik (Ctrl+I)">
        <Italic className="h-4 w-4" />
      </Button>
      <Button variant="secondary" size="sm" onMouseDown={keepFocus} onClick={() => runButton(() => toggleUnderline(iframeRef))} title="Altı çizili (Ctrl+U)">
        <Underline className="h-4 w-4" />
      </Button>

      <div className="h-6 w-px bg-primary-200 mx-1" />

      <Button variant="secondary" size="sm" onMouseDown={keepFocus} onClick={() => runButton(() => setAlignment(iframeRef, 'left'))} title="Sola hizala">
        <AlignLeft className="h-4 w-4" />
      </Button>
      <Button variant="secondary" size="sm" onMouseDown={keepFocus} onClick={() => runButton(() => setAlignment(iframeRef, 'center'))} title="Ortala">
        <AlignCenter className="h-4 w-4" />
      </Button>
      <Button variant="secondary" size="sm" onMouseDown={keepFocus} onClick={() => runButton(() => setAlignment(iframeRef, 'right'))} title="Sağa hizala">
        <AlignRight className="h-4 w-4" />
      </Button>

      <div className="h-6 w-px bg-primary-200 mx-1" />

      <select
        className="h-8 text-xs border border-primary-200 rounded px-1 bg-white"
        defaultValue=""
        title="Yazı boyutu"
        onMouseDown={saveSelection}
        onFocus={saveSelection}
        onChange={(e) => {
          const pt = parseInt(e.target.value, 10);
          if (!isNaN(pt)) {
            runWithRestoredSelection(() => setFontSize(iframeRef, pt));
          }
          e.target.value = '';
        }}
      >
        <option value="" disabled>Boyut</option>
        {FONT_SIZES.map(pt => (
          <option key={pt} value={pt}>{pt}pt</option>
        ))}
      </select>

      <select
        className="h-8 text-xs border border-primary-200 rounded px-1 bg-white max-w-[140px]"
        defaultValue=""
        title="Yazı tipi"
        onMouseDown={saveSelection}
        onFocus={saveSelection}
        onChange={(e) => {
          if (e.target.value) {
            runWithRestoredSelection(() => setFontFamily(iframeRef, e.target.value));
          }
          e.target.value = '';
        }}
      >
        <option value="" disabled>Yazı Tipi</option>
        {FONT_FAMILIES.map(f => (
          <option key={f} value={f}>{f}</option>
        ))}
      </select>

      <div className="h-6 w-px bg-primary-200 mx-1" />

      <label className="inline-flex items-center gap-1 text-xs cursor-pointer" title="Yazı rengi">
        <span className="text-primary-600 font-bold">A</span>
        <input
          type="color"
          className="w-6 h-6 border-0 p-0 bg-transparent cursor-pointer"
          onMouseDown={saveSelection}
          onFocus={saveSelection}
          onChange={(e) => runWithRestoredSelection(() => setTextColor(iframeRef, e.target.value))}
        />
      </label>

      <label className="inline-flex items-center gap-1 text-xs cursor-pointer" title="Hücre arka plan rengi">
        <span className="text-primary-600">▣</span>
        <input
          type="color"
          className="w-6 h-6 border-0 p-0 bg-transparent cursor-pointer"
          onMouseDown={saveSelection}
          onFocus={saveSelection}
          onChange={(e) => runWithRestoredSelection(() => setCellBackground(iframeRef, e.target.value))}
        />
      </label>

      <Button variant="secondary" size="sm" onMouseDown={keepFocus} onClick={() => runButton(() => setRowHighlight(iframeRef, '#FFFF00'))} title="Satırı sarı vurgula">
        <Highlighter className="h-4 w-4" />
      </Button>
    </div>
  );
}
