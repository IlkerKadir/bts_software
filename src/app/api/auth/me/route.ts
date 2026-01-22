import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';

export async function GET() {
  const user = await getSession();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json({
    user: {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
    },
  });
}
