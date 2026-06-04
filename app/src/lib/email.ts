import nodemailer from 'nodemailer';
import { prisma } from './prisma';
import { getSingletonOrgId } from './org';

const SMTP_KEYS = [
  'SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE',
  'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM', 'SMTP_FROM_NAME',
];

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
  fromName: string;
}

/** Read SMTP config from the SystemConfig key-value store (DB, not env). */
export async function getSmtpConfig(): Promise<SmtpConfig | null> {
  const rows = await prisma.systemConfig.findMany({
    where: { key: { in: SMTP_KEYS } },
  });
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value || '';

  const host = (map.SMTP_HOST || '').trim();
  const user = (map.SMTP_USER || '').trim();
  if (!host) return null; // not configured

  return {
    host,
    port: parseInt(map.SMTP_PORT || '587', 10) || 587,
    secure: map.SMTP_SECURE === 'true',
    user,
    pass: map.SMTP_PASS || '',
    from: (map.SMTP_FROM || '').trim() || user,
    fromName: (map.SMTP_FROM_NAME || '').trim() || 'Garely',
  };
}

type NMTransporter = ReturnType<typeof nodemailer.createTransport>;
let _transporter: NMTransporter | null = null;
let _key = '';

function makeTransporter(c: SmtpConfig): NMTransporter {
  return nodemailer.createTransport({
    host: c.host,
    port: c.port,
    secure: c.secure,
    auth: c.user ? { user: c.user, pass: c.pass } : undefined,
  });
}

/** Get a (cached) transporter built from the current saved config. */
export async function getTransporter(
  override?: SmtpConfig,
): Promise<{ transporter: NMTransporter; config: SmtpConfig } | null> {
  const config = override || (await getSmtpConfig());
  if (!config) return null;

  if (override) return { transporter: makeTransporter(config), config };

  const key = `${config.host}|${config.port}|${config.secure}|${config.user}|${config.pass}`;
  if (_transporter && _key === key) return { transporter: _transporter, config };
  _transporter = makeTransporter(config);
  _key = key;
  return { transporter: _transporter, config };
}

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  meetingId?: string;
  template?: string;
  attachments?: { filename: string; content?: string | Buffer; path?: string; contentType?: string }[];
  // Calendar invite as a multipart/alternative part (text/calendar; method=...).
  // This is what Gmail/Google Calendar/Outlook need to render the RSVP card and
  // add the event — a plain .ics attachment shows "failed to load event".
  icalEvent?: { method?: string; filename?: string; content: string };
}

/**
 * Send an email through the configured SMTP server and log it to EmailLog.
 * Returns { ok, error?, messageId? } — never throws.
 */
export async function sendEmail(
  opts: SendEmailOptions,
): Promise<{ ok: boolean; error?: string; messageId?: string }> {
  const t = await getTransporter();
  if (!t) return { ok: false, error: 'SMTP is not configured' };

  const { transporter, config } = t;
  const recipients = (Array.isArray(opts.to) ? opts.to : [opts.to]).filter(Boolean);
  if (recipients.length === 0) return { ok: false, error: 'No recipients' };

  const logOrgId = await getSingletonOrgId();
  const logAll = (status: string, messageId: string | null) =>
    logOrgId
      ? Promise.all(
          recipients.map((r) =>
            prisma.emailLog
              .create({
                data: {
                  recipient: r,
                  template: opts.template || 'generic',
                  meetingId: opts.meetingId || null,
                  mailersendId: messageId,
                  status,
                  orgId: logOrgId,
                },
              })
              .catch(() => {}),
          ),
        )
      : Promise.resolve();

  try {
    const info = await transporter.sendMail({
      from: `"${config.fromName}" <${config.from}>`,
      to: recipients.join(', '),
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
      attachments: opts.attachments,
      icalEvent: opts.icalEvent,
    });
    const messageId = (info as any)?.messageId || null;
    await logAll('sent', messageId);
    return { ok: true, messageId: messageId || undefined };
  } catch (e: any) {
    await logAll('failed', null);
    return { ok: false, error: e?.message || String(e) };
  }
}
