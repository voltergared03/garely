import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockReset } from 'vitest-mock-extended';
import { prisma as prismaMock } from '@/lib/__mocks__/prisma';
import { sendMeetingInvite } from '@/lib/meeting-invite';
import { sendEmail } from '@/lib/email';

vi.mock('@/lib/prisma');
vi.mock('@/lib/email', () => ({
  sendEmail: vi.fn(async () => ({ ok: true })),
  getSmtpConfig: vi.fn(async () => ({ from: 'admin@example.com' })),
}));
vi.mock('@/lib/i18n-server', () => ({
  getTranslator: () => (k: string) => k,
  workspaceLocale: vi.fn(async () => 'en'),
  workspaceTimezone: vi.fn(async () => 'UTC'),
}));
vi.mock('@/lib/config', () => ({ publicBaseUrl: vi.fn(async () => 'https://meet.example.com') }));
vi.mock('@/lib/suppression', () => ({ filterSuppressed: vi.fn(async (e: Iterable<string>) => [...e].map((x) => x.toLowerCase())) }));

const mockSend = vi.mocked(sendEmail);

const meeting = (over: Record<string, unknown> = {}) => ({
  id: 'm1',
  title: 'Monthly Call',
  description: null,
  scheduledAt: new Date('2026-06-20T09:00:00Z'),
  durationMin: 30,
  joinToken: 'tok1',
  recurrence: null,
  externalIcalUid: null,
  createdBy: { name: 'Dee', email: 'dee@example.com' },
  participants: [{ guestName: null, guestEmail: null, user: { name: 'Nas', email: 'nas@example.com', status: 'active' } }],
  ...over,
});

/** The text/calendar body handed to nodemailer for the first recipient. */
const icsSent = () => String((mockSend.mock.calls[0][0] as any).icalEvent.content);

beforeEach(() => {
  mockReset(prismaMock);
  mockSend.mockClear();
});

describe('sendMeetingInvite — which event the .ics claims to be', () => {
  it('addresses the Google event by its own UID when the meeting is mirrored there', async () => {
    // Otherwise the recipient's calendar cannot tell this .ics from a brand-new
    // meeting and files it beside the entry it already holds — one meeting, drawn
    // twice, which is exactly what users reported after imported meetings started
    // getting invitation mail.
    prismaMock.meeting.findUnique.mockResolvedValue(meeting({ externalIcalUid: 'ev1@google.com' }) as any);

    await sendMeetingInvite('m1', 'invite');

    expect(icsSent()).toContain('UID:ev1@google.com');
    expect(icsSent()).not.toContain('@ezmeet');
  });

  it('falls back to the synthetic UID for a meeting that only lives in Garely', async () => {
    prismaMock.meeting.findUnique.mockResolvedValue(meeting() as any);

    await sendMeetingInvite('m1', 'invite');

    expect(icsSent()).toContain('UID:meeting-m1@ezmeet');
  });

  it('cancels under the same UID it invited with', async () => {
    // A CANCEL that names a different event than the REQUEST did leaves the copy
    // it was meant to withdraw sitting on the calendar.
    prismaMock.meeting.findUnique.mockResolvedValue(meeting({ externalIcalUid: 'ev1@google.com' }) as any);

    await sendMeetingInvite('m1', 'cancel');

    const ics = icsSent();
    expect(ics).toContain('METHOD:CANCEL');
    expect(ics).toContain('UID:ev1@google.com');
  });

  it('mails every participant and the organizer', async () => {
    prismaMock.meeting.findUnique.mockResolvedValue(meeting() as any);

    await sendMeetingInvite('m1', 'invite');

    expect(mockSend.mock.calls.map((c) => (c[0] as any).to).sort()).toEqual(['dee@example.com', 'nas@example.com']);
  });
});
