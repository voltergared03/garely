import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { isSetupComplete } from '@/lib/setup';
import { readConfig } from '@/lib/config';

// GET /api/setup/status — first-run state for the wizard (no token required).
export async function GET() {
  const setupComplete = await isSetupComplete();

  let signedIn = false;
  let email: string | null = null;
  let isAdmin = false;
  try {
    const session = await auth();
    if (session?.user) {
      signedIn = true;
      email = session.user.email ?? null;
      isAdmin = session.user.role === 'admin';
    }
  } catch {
    /* no session */
  }

  let hasGoogle = false;
  try {
    const m = await readConfig(['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET']);
    hasGoogle = !!(m.GOOGLE_CLIENT_ID && m.GOOGLE_CLIENT_SECRET);
  } catch {
    /* ignore */
  }

  return NextResponse.json({ setupComplete, signedIn, email, isAdmin, hasGoogle });
}
