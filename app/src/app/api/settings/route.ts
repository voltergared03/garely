import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// GET /api/settings — get current user settings
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      name: true,
      email: true,
      image: true,
      role: true,
      timezone: true,
      preferences: true,
      totpEnabled: true,
      passwordHash: true,
    } as any,
  }) as any;

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  // Merge defaults with saved preferences
  const defaults = {
    displayRole: 'Product Manager',
    language: 'uk',
    micOnJoin: false,
    camOnJoin: false,
    liveTranscript: true,
    emailReminder: true,
    emailReport: true,
    actionItemNotif: true,
    weeklyDigest: false,
  };

  const prefs = { ...defaults, ...(user.preferences as any || {}) };

  return NextResponse.json({
    name: user.name,
    email: user.email,
    image: user.image,
    role: user.role,
    timezone: user.timezone,
    preferences: prefs,
    twoFactorEnabled: !!user.totpEnabled,
    hasPassword: !!user.passwordHash,
  });
}

// PATCH /api/settings — update user settings
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { name, timezone, preferences } = body;

  const updateData: any = {};
  if (name !== undefined) updateData.name = name;
  if (timezone !== undefined) updateData.timezone = timezone;
  if (preferences !== undefined) {
    // Merge with existing preferences
    const existing = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { preferences: true },
    });
    updateData.preferences = { ...(existing?.preferences as any || {}), ...preferences };
  }

  const user = await prisma.user.update({
    where: { id: session.user.id },
    data: updateData,
    select: {
      name: true,
      timezone: true,
      preferences: true,
    },
  });

  return NextResponse.json(user);
}
