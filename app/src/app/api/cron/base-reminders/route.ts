import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { notify } from '@/lib/notify';
import { withRoute } from '@/lib/with-route';
import { isInReminderWindow, reminderDueOn } from '@/lib/base-reminders';

export const runtime = 'nodejs';

// GET /api/cron/base-reminders?secret=XXX — daily. For every `date` field that
// has `reminderDays` set, notify the base owner + the row's person-field people
// once, when we enter the window [date - reminderDays, date). The BaseDateReminder
// table makes firing idempotent (one notify per row/field/target-day).
async function handler(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret');
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const now = new Date();

  const dateFields = await prisma.field.findMany({
    where: { type: 'date' },
    select: {
      id: true,
      options: true,
      tableId: true,
      table: { select: { baseId: true, name: true, primaryFieldId: true, base: { select: { createdById: true } } } },
    },
  });
  const reminderFields = dateFields.filter((f) => {
    const d = (f.options as { reminderDays?: unknown } | null)?.reminderDays;
    return Number.isInteger(d) && (d as number) > 0;
  });
  if (reminderFields.length === 0) return NextResponse.json({ fields: 0, sent: 0 });

  // Cache rows + person-field ids per table (a table may have several date fields).
  const tableIds = [...new Set(reminderFields.map((f) => f.tableId))];
  const personFieldsByTable = new Map<string, string[]>();
  const rowsByTable = new Map<string, { id: string; data: Record<string, unknown> }[]>();
  for (const tid of tableIds) {
    const [pfs, rows] = await Promise.all([
      prisma.field.findMany({ where: { tableId: tid, type: 'person' }, select: { id: true } }),
      prisma.row.findMany({ where: { tableId: tid }, select: { id: true, data: true } }),
    ]);
    personFieldsByTable.set(tid, pfs.map((p) => p.id));
    rowsByTable.set(tid, rows.map((r) => ({ id: r.id, data: (r.data ?? {}) as Record<string, unknown> })));
  }

  let sent = 0;
  for (const f of reminderFields) {
    const daysBefore = (f.options as { reminderDays: number }).reminderDays;
    const owner = f.table.base.createdById;
    const personIds = personFieldsByTable.get(f.tableId) ?? [];
    const primaryId = f.table.primaryFieldId;
    for (const row of rowsByTable.get(f.tableId) ?? []) {
      const cell = row.data[f.id];
      if (!isInReminderWindow(cell, daysBefore, now)) continue;

      // Idempotent: only the run that first inserts the dedup row notifies.
      const ins = await prisma.baseDateReminder
        .createMany({ data: [{ rowId: row.id, fieldId: f.id, dueOn: reminderDueOn(new Date(cell as string)) }], skipDuplicates: true })
        .catch(() => ({ count: 0 }));
      if (ins.count !== 1) continue;

      const recipients = new Set<string>();
      if (owner) recipients.add(owner);
      for (const pid of personIds) {
        const v = row.data[pid];
        if (typeof v === 'string') recipients.add(v);
        else if (Array.isArray(v)) for (const u of v) if (typeof u === 'string') recipients.add(u);
      }
      const userIds = [...recipients];
      if (userIds.length === 0) continue;

      const label = (primaryId && typeof row.data[primaryId] === 'string' && (row.data[primaryId] as string)) || f.table.name;
      const dateStr = new Date(cell as string).toISOString().slice(0, 10);
      await notify({
        userIds,
        type: 'base_date_reminder',
        titleKey: 'baseDateReminderTitle',
        bodyKey: 'baseDateReminderBody',
        values: { record: label, date: dateStr, days: daysBefore },
        link: `/database/${f.table.baseId}`,
      });
      sent += 1;
    }
  }

  return NextResponse.json({ fields: reminderFields.length, sent });
}

export const GET = withRoute('cron.base-reminders', handler);
