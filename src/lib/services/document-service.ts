import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const UPLOAD_DIR = path.join(process.cwd(), 'uploads');

const ALLOWED_EXTENSIONS = [
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export interface UploadResult {
  success: boolean;
  filePath?: string;
  fileName?: string;
  originalName?: string;
  mimeType?: string;
  size?: number;
  error?: string;
}

export async function ensureUploadDir(): Promise<void> {
  try {
    await fs.access(UPLOAD_DIR);
  } catch {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
  }
}

export function generateFileName(originalName: string): string {
  const ext = path.extname(originalName).toLowerCase();
  const timestamp = Date.now();
  const randomStr = crypto.randomBytes(8).toString('hex');
  return `${timestamp}-${randomStr}${ext}`;
}

export function validateFile(
  fileName: string,
  size: number
): { valid: boolean; error?: string } {
  const ext = path.extname(fileName).toLowerCase();

  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return {
      valid: false,
      error: `Desteklenmeyen dosya türü. İzin verilen: ${ALLOWED_EXTENSIONS.join(', ')}`,
    };
  }

  if (size > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `Dosya boyutu çok büyük. Maksimum: ${MAX_FILE_SIZE / 1024 / 1024}MB`,
    };
  }

  return { valid: true };
}

export async function uploadFile(
  file: File
): Promise<UploadResult> {
  try {
    // Validate file
    const validation = validateFile(file.name, file.size);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    // Ensure upload directory exists
    await ensureUploadDir();

    // Generate unique filename
    const fileName = generateFileName(file.name);
    const filePath = path.join(UPLOAD_DIR, fileName);

    // Write file
    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(filePath, buffer);

    return {
      success: true,
      filePath: `/uploads/${fileName}`,
      fileName,
      originalName: file.name,
      mimeType: file.type,
      size: file.size,
    };
  } catch (error) {
    console.error('File upload error:', error);
    return { success: false, error: 'Dosya yüklenirken bir hata oluştu' };
  }
}

export async function deleteFile(filePath: string): Promise<boolean> {
  try {
    const fullPath = path.join(process.cwd(), filePath);
    await fs.unlink(fullPath);
    return true;
  } catch (error) {
    console.error('File delete error:', error);
    return false;
  }
}

export function getMimeType(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  const mimeTypes: Record<string, string> = {
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
