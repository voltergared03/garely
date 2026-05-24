import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hashPassword, generateTempPassword } from "@/lib/password";
import { sendEmail } from "@/lib/email";
import { readConfig, CONFIG_DEFAULTS } from "@/lib/config";

// POST /api/users/[id]/password — admin resets a user's password.
// Issues a fresh temporary password, forces a change on next login, and emails
// the new credentials (best-effort). The temp password is returned so the admin
// can share it out-of-band when SMTP isn't configured.
// NOTE: sessions use JWTs, so existing logins aren't invalidated by a reset.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user || (session.user as any).role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true, name: true },
  });
  if (!target) {
    return NextResponse.json({ error: "Користувача не знайдено" }, { status: 404 });
  }

  const password = generateTempPassword();
  const passwordHash = await hashPassword(password);
  await prisma.user.update({
    where: { id },
    data: { passwordHash, mustChangePassword: true } as any,
  });

  // Best-effort credentials email (no-ops if SMTP isn't configured).
  const cfg = await readConfig(["WS_NAME"]);
  const wsName = cfg.WS_NAME || CONFIG_DEFAULTS.WS_NAME;
  const appUrl = (process.env.APP_URL || process.env.PUBLIC_URL || "").replace(/\/+$/, "");
  const loginUrl = appUrl ? `${appUrl}/login` : "/login";
  let emailed = false;
  if (target.email) try {
    const r = await sendEmail({
      to: target.email,
      template: "credentials",
      subject: `${wsName} — пароль скинуто`,
      text: `Адміністратор скинув ваш пароль у ${wsName}.\nEmail: ${target.email}\nНовий тимчасовий пароль: ${password}\nУвійдіть і змініть його: ${loginUrl}`,
      html: `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:28px 24px;background:#0f1115;border-radius:14px;color:#e8eaed">
        <div style="font-size:20px;font-weight:700;margin-bottom:8px">${wsName}</div>
        <p style="color:#9aa0a6;margin:0 0 14px;line-height:1.5">Адміністратор скинув ваш пароль. Увійдіть і задайте новий.</p>
        <div style="background:#1a1d24;border-radius:10px;padding:12px 14px;font-size:14px;line-height:1.7">
          <div>Email: <b>${target.email}</b></div>
          <div>Новий тимчасовий пароль: <b>${password}</b></div>
        </div>
        ${appUrl ? `<a href="${loginUrl}" style="display:inline-block;margin-top:16px;background:#2563eb;color:#fff;text-decoration:none;font-weight:600;padding:10px 18px;border-radius:10px">Увійти →</a>` : ""}
      </div>`,
    });
    emailed = !!r?.ok;
  } catch {
    emailed = false;
  }

  return NextResponse.json({ ok: true, password, emailed });
}
