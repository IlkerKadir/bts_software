import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { uploadFile } from '@/lib/services/document-service';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET - List documents for a project
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: projectId } = await params;

    // Check project exists
    const project = await db.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    });

    if (!project) {
      return NextResponse.json({ error: 'Proje bulunamadı' }, { status: 404 });
    }

    const documents = await db.projectDocument.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ documents });
  } catch (error) {
    console.error('Project documents GET error:', error);
    return NextResponse.json(
      { error: 'Dökümanlar yüklenirken bir hata oluştu' },
      { status: 500 }
    );
  }
}

// POST - Upload a document
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: projectId } = await params;

    // Check project exists
    const project = await db.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    });

    if (!project) {
      return NextResponse.json({ error: 'Proje bulunamadı' }, { status: 404 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'Dosya gerekli' }, { status: 400 });
    }

    // Upload file
    const uploadResult = await uploadFile(file);

    if (!uploadResult.success) {
      return NextResponse.json({ error: uploadResult.error }, { status: 400 });
    }

    // Create database record
    const document = await db.projectDocument.create({
      data: {
        projectId,
        fileName: uploadResult.originalName!,
        filePath: uploadResult.filePath!,
        fileType: uploadResult.mimeType!,
        fileSize: uploadResult.size!,
        uploadedBy: user.fullName,
      },
    });

    return NextResponse.json({ document }, { status: 201 });
  } catch (error) {
    console.error('Project document POST error:', error);
    return NextResponse.json(
      { error: 'Döküman yüklenirken bir hata oluştu' },
      { status: 500 }
    );
  }
}
