import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET - List activities for a project
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

    const activities = await db.projectActivity.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    });

    // Enrich with user names
    const userIds = [...new Set(activities.map((a) => a.userId))];
    const users = await db.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, fullName: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u.fullName]));

    const enrichedActivities = activities.map((a) => ({
      ...a,
      userName: userMap.get(a.userId) || 'Bilinmeyen Kullanıcı',
    }));

    return NextResponse.json({ activities: enrichedActivities });
  } catch (error) {
    console.error('Project activities GET error:', error);
    return NextResponse.json(
      { error: 'Aktiviteler yüklenirken bir hata oluştu' },
      { status: 500 }
    );
  }
}

// POST - Add an activity/note to a project
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

    const body = await request.json();
    const { action, note } = body;

    if (!note || typeof note !== 'string' || note.trim().length === 0) {
      return NextResponse.json(
        { error: 'Not alanı gereklidir' },
        { status: 400 }
      );
    }

    const activity = await db.projectActivity.create({
      data: {
        projectId,
        userId: user.id,
        action: action || 'NOT',
        note: note.trim(),
      },
    });

    return NextResponse.json(
      {
        activity: {
          ...activity,
          userName: user.fullName,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Project activity POST error:', error);
    return NextResponse.json(
      { error: 'Aktivite eklenirken bir hata oluştu' },
      { status: 500 }
    );
  }
}
