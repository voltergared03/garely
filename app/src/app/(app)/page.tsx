import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { DashboardClient } from './dashboard-client';

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) return null;

  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(todayStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const userId = (session.user as any).id;

  const [upcoming, past, myTasks] = await Promise.all([
    prisma.meeting.findMany({
      where: {
        status: { in: ['scheduled', 'live'] },
        scheduledAt: { gte: todayStart },
      },
      include: {
        createdBy: { select: { id: true, name: true, image: true } },
        participants: {
          include: { user: { select: { id: true, name: true, image: true } } },
        },
      },
      orderBy: { scheduledAt: 'asc' },
      take: 10,
    }),
    prisma.meeting.findMany({
      where: { status: 'ended' },
      include: {
        createdBy: { select: { id: true, name: true, image: true } },
        participants: {
          include: { user: { select: { id: true, name: true, image: true } } },
        },
        reports: { select: { id: true } },
      },
      orderBy: { endedAt: 'desc' },
      take: 6,
    }),
    prisma.meetingTask.findMany({
      where: {
        assigneeId: userId,
        status: { not: 'done' },
      },
      include: {
        assignee: { select: { id: true, name: true, image: true } },
        meeting: { select: { id: true, title: true, scheduledAt: true } },
      },
      orderBy: [{ priority: 'asc' }, { dueDate: 'asc' }, { createdAt: 'desc' }],
      take: 8,
    }),
  ]);

  return (
    <DashboardClient
      upcoming={JSON.parse(JSON.stringify(upcoming))}
      past={JSON.parse(JSON.stringify(past))}
      myTasks={JSON.parse(JSON.stringify(myTasks))}
    />
  );
}
