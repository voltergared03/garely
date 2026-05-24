import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hashPassword, passwordPolicyError } from "@/lib/password";
import { sendEmail } from "@/lib/email";
import { readConfig, CONFIG_DEFAULTS } from "@/lib/config";

// GET /api/users — list workspace users (all authenticated users)
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      role: true,
      lastLogin: true,
      createdAt: true,
      passwordHash: true,
    } as any,
    orderBy: { createdAt: "asc" },
  });

  // Expose only whether a password is set (for the "reset password" action) —
  // never the hash itself.
  const safe = (users as any[]).map(({ passwordHash, ...u }) => ({
    ...u,
    hasPassword: !!passwordHash,
  }));

  return NextResponse.json(safe);
}

// POST /api/users — admin creates a credentials (email+password) user.
// Admin sets a temporary password (shared out-of-band) and the user is forced
// to change it on first login. A credentials email is also sent if SMTP works.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || (session.user as any).role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({} as any));
  const email = String(body.email || "").trim().toLowerCase();
  const name = String(body.name || "").trim();
  const role = body.role === "admin" ? "admin" : "member";
  const password = String(body.password || "");

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "Вкажіть коректний email" }, { status: 400 });
  }
  const pwErr = passwordPolicyError(password);
  if (pwErr) return NextResponse.json({ error: pwErr }, { status: 400 });

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "Користувач із таким email вже існує" }, { status: 409 });
  }

  const cfg = await readConfig(["WS_TIMEZONE", "WS_LANGUAGE", "WS_NAME"]);
  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: {
      email,
      name: name || email.split("@")[0],
      role,
      status: "active",
      passwordHash,
      mustChangePassword: true,
      timezone: cfg.WS_TIMEZONE || CONFIG_DEFAULTS.WS_TIMEZONE,
      preferences: { language: cfg.WS_LANGUAGE || CONFIG_DEFAULTS.WS_LANGUAGE },
    } as any,
    select: { id: true, email: true, name: true, role: true },
  });

  // Best-effort credentials email (no-ops if SMTP isn't configured).
  const wsName = cfg.WS_NAME || CONFIG_DEFAULTS.WS_NAME;
  const appUrl = (process.env.APP_URL || process.env.PUBLIC_URL || "").replace(/\/+$/, "");
  const loginUrl = appUrl ? `${appUrl}/login` : "/login";
  let emailed = false;
  try {
    const r = await sendEmail({
      to: email,
      template: "credentials",
      subject: `${wsName} — доступ до акаунта`,
      text: `Вам створено акаунт у ${wsName}.\nEmail: ${email}\nТимчасовий пароль: ${password}\nУвійдіть і змініть пароль: ${loginUrl}`,
      html: `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:28px 24px;background:#0f1115;border-radius:14px;color:#e8eaed">
        <div style="font-size:20px;font-weight:700;margin-bottom:8px">${wsName}</div>
        <p style="color:#9aa0a6;margin:0 0 14px;line-height:1.5">Вам створено акаунт. Увійдіть і змініть тимчасовий пароль.</p>
        <div style="background:#1a1d24;border-radius:10px;padding:12px 14px;font-size:14px;line-height:1.7">
          <div>Email: <b>${email}</b></div>
          <div>Тимчасовий пароль: <b>${password}</b></div>
        </div>
        ${appUrl ? `<a href="${loginUrl}" style="display:inline-block;margin-top:16px;background:#2563eb;color:#fff;text-decoration:none;font-weight:600;padding:10px 18px;border-radius:10px">Увійти →</a>` : ""}
      </div>`,
    });
    emailed = !!r?.ok;
  } catch {
    emailed = false;
  }

  return NextResponse.json({ ok: true, user, emailed }, { status: 201 });
}
