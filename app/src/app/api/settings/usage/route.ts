import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { readConfig, num } from '@/lib/config';
import { withRoute } from '@/lib/with-route';

async function getHandler() {
  const session = await auth();
  if (!session?.user || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  // Meetings this month
  const meetingsThisMonth = await prisma.meeting.count({
    where: { status: 'ended', endedAt: { gte: monthStart } },
  });

  // Total meetings all time
  const meetingsTotal = await prisma.meeting.count({
    where: { status: 'ended' },
  });

  // Actual total duration (hours) this month — from scheduledAt/createdAt to endedAt
  const endedMeetings = await prisma.meeting.findMany({
    where: { status: 'ended', endedAt: { gte: monthStart } },
    select: { scheduledAt: true, createdAt: true, endedAt: true },
  });

  let totalMinutes = 0;
  for (const m of endedMeetings) {
    if (m.endedAt) {
      const start = m.scheduledAt || m.createdAt;
      const diffMs = m.endedAt.getTime() - start.getTime();
      totalMinutes += Math.max(0, diffMs / 60000);
    }
  }
  const hoursRecorded = Math.round(totalMinutes / 6) / 10; // 1 decimal

  // Action items this month
  const actionItems = await prisma.meetingTask.count({
    where: { createdAt: { gte: monthStart } },
  });

  // Total action items
  const actionItemsTotal = await prisma.meetingTask.count();

  // Emails this month
  const emailsSent = await prisma.emailLog.count({
    where: { sentAt: { gte: monthStart } },
  });

  // Users count
  const usersCount = await prisma.user.count();

  // Transcript segments this month
  const transcriptSegments = await prisma.transcriptSegment.count({
    where: { createdAt: { gte: monthStart } },
  });

  // AI reports this month (for cost estimation)
  const reports = await prisma.meetingReport.findMany({
    where: { generatedAt: { gte: monthStart } },
    select: { tokensInput: true, tokensOutput: true, modelUsed: true },
  });

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  for (const r of reports) {
    totalInputTokens += r.tokensInput || 0;
    totalOutputTokens += r.tokensOutput || 0;
  }

  // DeepSeek pricing: ~/bin/zsh.27/M input, ~.10/M output (cache miss)
  const cfg = await readConfig(['PRICE_DEEPSEEK_IN', 'PRICE_DEEPSEEK_OUT', 'PRICE_DEEPGRAM_MIN', 'EMAIL_LIMIT']);
  const deepseekCost = (totalInputTokens / 1_000_000) * num(cfg, 'PRICE_DEEPSEEK_IN') + (totalOutputTokens / 1_000_000) * num(cfg, 'PRICE_DEEPSEEK_OUT');
  // Deepgram Nova-3: /bin/zsh.0043/min (pay-as-you-go)
  const deepgramCost = totalMinutes * num(cfg, 'PRICE_DEEPGRAM_MIN');
  const totalCost = deepseekCost + deepgramCost;

  // Round cost to meaningful precision (at least 2 decimals, up to 4 for small amounts)
  const roundCost = (v: number) => {
    if (v === 0) return 0;
    if (v < 0.01) return Math.round(v * 10000) / 10000;
    if (v < 0.10) return Math.round(v * 1000) / 1000;
    return Math.round(v * 100) / 100;
  };

  return NextResponse.json({
    period: { start: monthStart.toISOString(), end: now.toISOString() },
    meetings: { thisMonth: meetingsThisMonth, total: meetingsTotal },
    hours: { thisMonth: hoursRecorded },
    actionItems: { thisMonth: actionItems, total: actionItemsTotal },
    emails: { thisMonth: emailsSent, limit: num(cfg, 'EMAIL_LIMIT') },
    users: usersCount,
    transcriptSegments: { thisMonth: transcriptSegments },
    ai: {
      reportsGenerated: reports.length,
      tokensInput: totalInputTokens,
      tokensOutput: totalOutputTokens,
      costPerReport: reports.length > 0 ? roundCost(deepseekCost / reports.length) : 0,
    },
    costs: {
      deepseek: roundCost(deepseekCost),
      deepgram: roundCost(deepgramCost),
      total: roundCost(totalCost),
    },
  });
}

export const GET = withRoute('settings.usage', getHandler);
