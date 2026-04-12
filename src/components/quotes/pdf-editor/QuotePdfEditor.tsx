'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Download,
  Trash2,
  Copy,
  ArrowUp,
  ArrowDown,
  Info,
  Loader2,
  Save,
  RotateCcw,
  TableCellsSplit,
  Undo2,
  Redo2,
  ChevronsUp,
  ChevronsDown,
  Rows3,
  Sigma,
  Calculator,
  ClipboardCopy,
  ClipboardPaste,
} from 'lucide-react';
import { Button } from '@/components/ui';
import { useHistory } from './useHistory';
import { useIframeEditor } from './useIframeEditor';
import { useRowOps } from './useRowOps';
import { snapshotEdits } from './buildEdits';
import { FormatToolbar } from './FormatToolbar';

interface Props {
  quoteId: string;
}

/**
 * In-browser WYSIWYG PDF editor. Renders the quote template inside a
 * sandboxed iframe, wires up contenteditable + row operations + drag
 * resize via composable hooks, and provides undo/redo, save, and
 * download flows that all share a single fragment-based payload model.
 */
export function QuotePdfEditor({ quoteId }: Props) {
  const router = useRouter();
  const [html, setHtml] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [hasOverride, setHasOverride] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const iframeRef = useRef<HTMLIFrameElement>(null);

  const history = useHistory({ iframeRef });

  const iframe = useIframeEditor({
    iframeRef,
    onInputDebounced: history.pushDebounced,
    onBeforeMutation: history.push,
    onUndo: history.undo,
    onRedo: history.redo,
  });

  const rowOps = useRowOps({
    selectedRow: iframe.selectedRow,
    setSelectedRow: iframe.setSelectedRow,
    pushHistory: history.push,
  });

  // Fetch the rendered HTML
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      setError(null);
      iframe.setSelectedRow(null);
      history.clear();
      try {
        const res = await fetch(`/api/quotes/${quoteId}/preview-html`);
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || 'Önizleme yüklenemedi');
        }
        const text = await res.text();
        if (cancelled) return;
        setHtml(text);
        setHasOverride(res.headers.get('X-Pdf-Override') === 'true');
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Bir hata oluştu');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // `iframe` and `history` reference setters/clearers — intentionally
    // excluded so this effect only re-runs on quoteId/reloadKey change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteId, reloadKey]);

  // Auto-dismiss success messages
  useEffect(() => {
    if (!successMessage) return;
    const t = setTimeout(() => setSuccessMessage(null), 3000);
    return () => clearTimeout(t);
  }, [successMessage]);

  const buildCurrentEdits = useCallback(() => {
    return snapshotEdits(iframeRef.current?.contentDocument);
  }, []);

  const handleSave = useCallback(async () => {
    const edits = buildCurrentEdits();
    if (!edits) return;
    setIsSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/quotes/${quoteId}/pdf-override`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ edits }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Kaydedilemedi');
      }
      setHasOverride(true);
      setSuccessMessage('Düzenleme kaydedildi');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bir hata oluştu');
    } finally {
      setIsSaving(false);
    }
  }, [quoteId, buildCurrentEdits]);

  const handleReset = useCallback(async () => {
    if (!confirm('Düzenlemeleri silip orijinal teklif şablonuna dönmek istediğinizden emin misiniz?')) return;
    setIsResetting(true);
    setError(null);
    try {
      const res = await fetch(`/api/quotes/${quoteId}/pdf-override`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Sıfırlanamadı');
      }
      setHasOverride(false);
      setSuccessMessage('Orijinale sıfırlandı');
      setReloadKey(k => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bir hata oluştu');
    } finally {
      setIsResetting(false);
    }
  }, [quoteId]);

  const handleDownload = useCallback(async () => {
    const edits = buildCurrentEdits();
    if (!edits) return;
    setIsDownloading(true);
    setError(null);
    try {
      const saveRes = await fetch(`/api/quotes/${quoteId}/pdf-override`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ edits }),
      });
      if (saveRes.ok) {
        setHasOverride(true);
      }

      const res = await fetch(`/api/quotes/${quoteId}/pdf-download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ edits }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'PDF oluşturulamadı');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `teklif-duzenlenmis.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bir hata oluştu');
    } finally {
      setIsDownloading(false);
    }
  }, [quoteId, buildCurrentEdits]);

  // ── Render ──

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-32 gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-primary-600" />
        <span className="text-sm text-primary-600">Önizleme yükleniyor...</span>
      </div>
    );
  }

  if (error && !html) {
    return (
      <div className="max-w-2xl mx-auto mt-8 p-6 bg-red-50 border border-red-200 rounded-lg">
        <p className="text-sm text-red-700">{error}</p>
        <Button variant="secondary" size="sm" className="mt-3" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" /> Geri
        </Button>
      </div>
    );
  }

  const rowActionsDisabled = !iframe.selectedRow;

  return (
    <div className="min-h-screen bg-primary-50">
      {/* Sticky toolbar */}
      <div className="sticky top-0 z-40 bg-white border-b border-primary-200 shadow-sm">
        <div className="max-w-[210mm] mx-auto px-4 py-3 flex items-center gap-2 flex-wrap">
          <Button variant="secondary" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" /> Geri
          </Button>

          <div className="h-6 w-px bg-primary-200 mx-1" />

          <Button variant="secondary" size="sm" onClick={history.undo} disabled={!history.canUndo} title="Geri al (Ctrl+Z)">
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button variant="secondary" size="sm" onClick={history.redo} disabled={!history.canRedo} title="Yinele (Ctrl+Shift+Z)">
            <Redo2 className="h-4 w-4" />
          </Button>

          <div className="h-6 w-px bg-primary-200 mx-1" />

          <FormatToolbar iframeRef={iframeRef} pushHistory={history.push} />

          <div className="h-6 w-px bg-primary-200 mx-1" />

          <Button variant="secondary" size="sm" onClick={rowOps.addRowAbove} disabled={rowActionsDisabled}>
            <ArrowUp className="h-4 w-4" /> Üste Satır Ekle
          </Button>
          <Button variant="secondary" size="sm" onClick={rowOps.addRowBelow} disabled={rowActionsDisabled}>
            <ArrowDown className="h-4 w-4" /> Alta Satır Ekle
          </Button>
          <Button variant="secondary" size="sm" onClick={rowOps.duplicateRow} disabled={rowActionsDisabled}>
            <Copy className="h-4 w-4" /> Kopyala
          </Button>
          <Button variant="secondary" size="sm" onClick={rowOps.deleteRow} disabled={rowActionsDisabled}>
            <Trash2 className="h-4 w-4" /> Sil
          </Button>
          <Button variant="secondary" size="sm" onClick={rowOps.splitRowCells} disabled={rowActionsDisabled}>
            <TableCellsSplit className="h-4 w-4" /> Böl
          </Button>

          <div className="h-6 w-px bg-primary-200 mx-1" />

          <Button variant="secondary" size="sm" onClick={rowOps.moveRowUp} disabled={rowActionsDisabled} title="Satırı yukarı taşı">
            <ChevronsUp className="h-4 w-4" />
          </Button>
          <Button variant="secondary" size="sm" onClick={rowOps.moveRowDown} disabled={rowActionsDisabled} title="Satırı aşağı taşı">
            <ChevronsDown className="h-4 w-4" />
          </Button>

          <div className="h-6 w-px bg-primary-200 mx-1" />

          <Button variant="secondary" size="sm" onClick={rowOps.insertSpacerRow} disabled={rowActionsDisabled} title="Boşluk satırı ekle">
            <Rows3 className="h-4 w-4" /> Boşluk
          </Button>
          <Button variant="secondary" size="sm" onClick={rowOps.insertTotalHeadingRow} disabled={rowActionsDisabled} title="Toplam başlığı satırı ekle">
            <Sigma className="h-4 w-4" /> Toplam Başlığı
          </Button>
          <Button variant="secondary" size="sm" onClick={rowOps.sumRowsIntoSelected} disabled={rowActionsDisabled} title="Üstteki satırları topla ve bu hücreye yaz">
            <Calculator className="h-4 w-4" /> Topla
          </Button>

          <div className="h-6 w-px bg-primary-200 mx-1" />

          <Button variant="secondary" size="sm" onClick={rowOps.copyRow} disabled={rowActionsDisabled} title="Satırı panoya kopyala">
            <ClipboardCopy className="h-4 w-4" />
          </Button>
          <Button variant="secondary" size="sm" onClick={rowOps.pasteRow} disabled={rowActionsDisabled} title="Panodaki satırı yapıştır">
            <ClipboardPaste className="h-4 w-4" />
          </Button>

          <div className="flex-1" />

          {hasOverride && (
            <span className="text-[11px] px-2 py-1 rounded bg-amber-100 text-amber-800 border border-amber-300">
              Kaydedilmiş düzenleme yüklendi
            </span>
          )}

          <Button variant="secondary" size="sm" onClick={handleReset} disabled={isResetting || !hasOverride}>
            {isResetting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
            Sıfırla
          </Button>

          <Button variant="secondary" size="sm" onClick={handleSave} disabled={isSaving}>
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Kaydet
          </Button>

          <Button variant="primary" size="sm" onClick={handleDownload} disabled={isDownloading}>
            {isDownloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            PDF İndir
          </Button>
        </div>

        <div className="max-w-[210mm] mx-auto px-4 pb-2 flex items-start gap-2 text-xs text-primary-500">
          <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>
            Değişiklikler yalnızca indirilecek PDF için geçerlidir — teklif veritabanına kaydedilmez.
            Bir hücreye tıklayıp metni düzenleyebilirsiniz. Satır işlemleri için önce bir satıra tıklayın.
          </span>
        </div>

        {error && (
          <div className="max-w-[210mm] mx-auto px-4 pb-2">
            <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1">
              {error}
            </div>
          </div>
        )}

        {successMessage && (
          <div className="max-w-[210mm] mx-auto px-4 pb-2">
            <div className="text-xs text-green-700 bg-green-50 border border-green-200 rounded px-2 py-1">
              {successMessage}
            </div>
          </div>
        )}
      </div>

      {/* Rendered document — isolated in an iframe so template CSS does not leak */}
      <div className="max-w-[210mm] mx-auto py-6 px-4">
        <iframe
          ref={iframeRef}
          srcDoc={html}
          onLoad={iframe.handleIframeLoad}
          sandbox="allow-same-origin"
          className="bg-white shadow-lg block"
          style={{
            width: '210mm',
            height: `${iframe.iframeHeight}px`,
            border: 'none',
          }}
          title="Teklif Önizleme"
        />
      </div>
    </div>
  );
}
