import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { deleteFile, getMimeType } from '@/lib/services/document-service';
import fs from 'fs/promises';
import path from 'path';

interface RouteParams {
  params: Promise<{ id: string; docId: string }>;
}

// GET - Download a document
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: quoteId, docId } = await params;

    const document = await db.quoteDocument.findFirst({
      where: { id: docId, quoteId },
    });

    if (!document) {
      return NextResponse.json({ error: 'Döküman bulunamadı' }, { status: 404 });
    }

    // Read file
    const filePath = path.join(process.cwd(), document.filePath);

    try {
      const fileBuffer = await fs.readFile(filePath);
      const mimeType = getMimeType(document.fileName);

      return new NextResponse(fileBuffer, {
        headers: {
          'Content-Type': mimeType,
          'Content-Disposition': `attachment; filename="${encodeURIComponent(document.fileName)}"`,
          'Content-Length': fileBuffer.length.toString(),
        },
      });
    } catch {
      return NextResponse.json(
        { error: 'Dosya bulunamadı' },
        { status: 404 }
      );
    }
  } catch (error) {
    console.error('Document GET error:', error);
    return NextResponse.json(
      { error: 'Döküman indirilirken bir hata oluştu' },
      { status: 500 }
    );
  }
}

// DELETE - Delete a document
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: quoteId, docId } = await params;

    const document = await db.quoteDocument.findFirst({
      where: { id: docId, quoteId },
    });

    if (!document) {
      return NextResponse.json({ error: 'Döküman bulunamadı' }, { status: 404 });
    }

    // Delete file from disk
    await deleteFile(document.filePath);

    // Delete database record
    await db.quoteDocument.delete({
      where: { id: docId },
    });

    return NextResponse.json({ message: 'Döküman silindi' });
  } catch (error) {
    console.error('Document DELETE error:', error);
    return NextResponse.json(
      { error: 'Döküman silinirken bir hata oluştu' },
      { status: 500 }
    );
  }
}

// PATCH - Update document metadata (e.g. fileName)
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: quoteId, docId } = await params;
    const body = await request.json();
    const { fileName } = body;

    if (!fileName || typeof fileName !== 'string') {
      return NextResponse.json(
        { error: 'Geçerli bir dosya adı giriniz' },
        { status: 400 }
      );
    }

    const document = await db.quoteDocument.findFirst({
      where: { id: docId, quoteId },
    });

    if (!document) {
      return NextResponse.json({ error: 'Döküman bulunamadı' }, { status: 404 });
    }

    const updated = await db.quoteDocument.update({
      where: { id: docId },
      data: { fileName },
    });

    return NextResponse.json({ document: updated });
  } catch (error) {
    console.error('Document PATCH error:', error);
    return NextResponse.json(
      { error: 'Döküman güncellenirken bir hata oluştu' },
      { status: 500 }
    );
  }
}
