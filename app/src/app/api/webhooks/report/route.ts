import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendReportEmail } from '@/lib/report-email';
import { isInternalAuthed } from '@/lib/internal-auth';
import { notify } from '@/lib/notify';

// POST /api/webhooks/report — store AI-generated report (called by Python agent)
export async function POST(req: NextRequest) {
  // Internal-only: require the shared secret header (sent by the agent).
  if (!isInternalAuthed(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const {
    meetingId,
    summary,
    agenda,
    decisions,
    followUps,
    actionItems,
    modelUsed,
    tokensInput,
    tokensOutput,
    rawPrompt,
    rawResponse,
  } = body;

  if (!meetingId) {
    return NextResponse.json({ error: 'meetingId required' }, { status: 400 });
  }

  // Create the report
  const report = await prisma.meetingReport.create({
    data: {
      meetingId,
      summary,
      agenda,
      decisions,
      followUps,
      modelUsed,
      tokensInput,
      tokensOutput,
      rawPrompt,
      rawResponse,
    },
  });

  // Create action items / tasks
  if (actionItems && Array.isArray(actionItems)) {
    for (const item of actionItems) {
      // Try to find assignee by name
      let assigneeId: string | null = null;
      let notifyAssignee = true;
      if (item.assignee_name) {
        const user = await prisma.user.findFirst({
          where: {
            name: { contains: item.assignee_name, mode: 'insensitive' },
          },
        });
        if (user) {
          assigneeId = user.id;
          notifyAssignee = (user.preferences as any)?.actionItemNotif !== false;
        }
      }

      const task = await prisma.meetingTask.create({
        data: {
          meetingId,
          reportId: report.id,
          title: item.title,
          assigneeId,
          assigneeName: item.assignee_name || null,
          priority: item.priority || 'medium',
          status: 'open',
          dueDate: item.due_description ? parseDueDate(item.due_description) : null,
        },
      });

      // Notify assignee about the new task (respect their action-item notification preference)
      if (assigneeId && notifyAssignee) {
        await notify({
          userIds: [assigneeId],
          type: 'task_assigned',
          title: 'Нове завдання',
          body: item.title,
          link: '/tasks',
          meetingId,
        });
      }
    }
  }

  // Update meeting status
  await prisma.meeting.update({
    where: { id: meetingId },
    data: { status: 'ended', endedAt: new Date() },
  });

  // Notify all participants that report is ready
  try {
    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      include: { participants: { where: { userId: { not: null } } } },
    });
    if (meeting && meeting.participants.length > 0) {
      const userIds = meeting.participants
        .map(p => p.userId)
        .filter((uid): uid is string => uid !== null);
      if (userIds.length > 0) {
        await notify({
          userIds,
          type: 'report_ready',
          title: 'Звіт готовий',
          body: `Звіт по мітингу "${meeting.title}" згенерований`,
          link: `/meetings/${meetingId}/report`,
          meetingId,
        });
      }
    }
  } catch (e) {
    console.error('Failed to send report notifications:', e);
  }

  // Auto-email the report to participants (respects each user's emailReport preference)
  try {
    await sendReportEmail(meetingId, { respectPref: true });
  } catch (e) {
    console.error('Failed to auto-send report email:', e);
  }

  return NextResponse.json({ reportId: report.id }, { status: 201 });
}

function parseDueDate(desc: string): Date | null {
  const now = new Date();
  const lower = desc.toLowerCase();

  if (lower.includes('завтра') || lower.includes('tomorrow')) {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    return d;
  }
  if (lower.includes('тижн') || lower.includes('week')) {
    const d = new Date(now);
    d.setDate(d.getDate() + 7);
    return d;
  }
  if (lower.includes('місяц') || lower.includes('month')) {
    const d = new Date(now);
    d.setMonth(d.getMonth() + 1);
    return d;
  }
  if (lower.includes('п\'ятниц') || lower.includes('friday')) {
    const d = new Date(now);
    const daysUntilFriday = (5 - d.getDay() + 7) % 7 || 7;
    d.setDate(d.getDate() + daysUntilFriday);
    return d;
  }

  return null;
}
