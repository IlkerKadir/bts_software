'use client';

import { useState, useRef, useCallback } from 'react';
import { Upload, File, FileText, Image, Trash2, Download, X } from 'lucide-react';
import { Button, Spinner } from '@/components/ui';
import { formatFileSize } from '@/lib/utils/format';

interface Document {
  id: string;
  fileName: string;
  filePath: string;
  fileType: string;
  fileSize: number;
  uploadedBy: string;
  createdAt: string;
}

interface ProjectDocumentsProps {
  projectId: string;
  documents: Document[];
  onRefresh: () => void;
}

const getFileIcon = (fileType: string) => {
  if (fileType.startsWith('image/')) return Image;
  if (fileType.includes('pdf')) return FileText;
  return File;
};

export function ProjectDocuments({ projectId, documents, onRefresh }: ProjectDocumentsProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setIsUploading(true);
    setError(null);

    try {
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch(`/api/projects/${projectId}/documents`, {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Yükleme hatası');
        }
      }

      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Yükleme hatası');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDelete = async (docId: string) => {
    if (!confirm('Bu dökümanı silmek istediğinize emin misiniz?')) return;

    try {
      const response = await fetch(`/api/projects/${projectId}/documents/${docId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Silme hatası');
      }

      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Silme hatası');
    }
  };

  const handleDownload = (docId: string, fileName: string) => {
    const link = document.createElement('a');
    link.href = `/api/projects/${projectId}/documents/${docId}`;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleUpload(e.dataTransfer.files);
  }, [projectId]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-4">
      {/* Upload Area */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          border-2 border-dashed rounded-lg p-6 text-center transition-colors
          ${isDragging
            ? 'border-accent-500 bg-accent-50'
            : 'border-primary-200 hover:border-primary-300'
          }
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={(e) => handleUpload(e.target.files)}
          className="hidden"
          accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.gif"
        />

        {isUploading ? (
          <div className="flex items-center justify-center gap-2">
            <Spinner />
            <span className="text-primary-600">Yükleniyor...</span>
          </div>
        ) : (
          <>
            <Upload className="w-10 h-10 text-primary-400 mx-auto mb-2" />
            <p className="text-primary-700 font-medium">
              Dosyaları sürükleyip bırakın
            </p>
            <p className="text-sm text-primary-500 mt-1">
              veya{' '}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="text-accent-600 hover:underline cursor-pointer"
              >
                dosya seçin
              </button>
            </p>
            <p className="text-xs text-primary-400 mt-2">
              PDF, DOC, DOCX, XLS, XLSX, PNG, JPG (max 10MB)
            </p>
          </>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <div className="flex items-center justify-between bg-red-50 border border-red-200 rounded-lg p-3">
          <span className="text-sm text-red-700">{error}</span>
          <button onClick={() => setError(null)} className="cursor-pointer">
            <X className="w-4 h-4 text-red-500" />
          </button>
        </div>
      )}

      {/* Documents List */}
      {documents.length > 0 ? (
        <div className="divide-y divide-primary-100 border border-primary-200 rounded-lg overflow-hidden">
          {documents.map((doc) => {
            const FileIcon = getFileIcon(doc.fileType);
            return (
              <div
                key={doc.id}
                className="flex items-center justify-between p-3 hover:bg-primary-50"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <FileIcon className="w-5 h-5 text-primary-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-primary-900 truncate">
                      {doc.fileName}
                    </p>
                    <p className="text-xs text-primary-500">
                      {formatFileSize(doc.fileSize)} • {doc.uploadedBy} • {formatDate(doc.createdAt)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDownload(doc.id, doc.fileName)}
                    title="İndir"
                  >
                    <Download className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(doc.id)}
                    className="text-red-600 hover:bg-red-50"
                    title="Sil"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-center text-primary-500 py-4">
          Henüz döküman yüklenmemiş
        </p>
      )}
    </div>
  );
}
