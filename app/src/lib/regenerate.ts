// Report generation (standard summary + extended topic-structured report with
// transcript citations) and single-speaker re-transcription.
//
// generateMeetingReport() runs server-side, so it is not constrained by the
// LiveKit agent's shutdown window and controls its own token budget (some
// configured models are reasoning models that need a large max_tokens). It is
// triggered by the agent on room end (notify=true) and by the report
// "fix language & regenerate" flow (notify=false).
import fs from 'node:fs/promises';
import { prisma } from './prisma';
import { readConfig, getDeepSeekConfig } from './config';
import { sseJsonChunks, chunkDelta } from './sse';
import { workspaceLocale } from './i18n-server';
import { notify } from './notify';
import { sendReportEmail } from './report-email';

export interface ReTranscribedSegment {
  content: string;
  start: number;
  end: number;
  confidence: number;
}

/** Re-transcribe a single speaker's WAV file in a specific language. */
export async function transcribeSpeakerFile(
  filePath: string,
  language: string
): Promise<ReTranscribedSegment[]> {
  const cfg = await readConfig(['DEEPGRAM_API_KEY']);
  const key = cfg.DEEPGRAM_API_KEY || process.env.DEEPGRAM_API_KEY || '';
  if (!key) throw new Error('Deepgram API key not configured');

  const audio = await fs.readFile(filePath);

  const url = new URL('https://api.deepgram.com/v1/listen');
  url.searchParams.set('model', 'nova-2');
  url.searchParams.set('language', language);
  url.searchParams.set('smart_format', 'true');
  url.searchParams.set('punctuate', 'true');
  url.searchParams.set('utterances', 'true');

  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Token ${key}`, 'Content-Type': 'audio/wav' },
    body: new Uint8Array(audio),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Deepgram ${res.status}: ${txt.slice(0, 200)}`);
  }
  const data: any = await res.json();

  const out: ReTranscribedSegment[] = [];
  for (const u of data?.results?.utterances || []) {
    const content = String(u.transcript || '').trim();
    if (content) {
      out.push({
        content,
        start: Number(u.start) || 0,
        end: Number(u.end) || 0,
        confidence: Number(u.confidence) || 0,
      });
    }
  }
  if (out.length === 0) {
    const alt = data?.results?.channels?.[0]?.alternatives?.[0];
    const t = String(alt?.transcript || '').trim();
    if (t) out.push({ content: t, start: 0, end: 0, confidence: Number(alt?.confidence) || 0 });
  }
  return out;
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
  if (lower.includes("п'ятниц") || lower.includes('friday')) {
    const d = new Date(now);
    const daysUntilFriday = (5 - d.getDay() + 7) % 7 || 7;
    d.setDate(d.getDate() + daysUntilFriday);
    return d;
  }
  return null;
}

/** Parse JSON that may be wrapped in markdown fences or surrounded by prose. */
function parseJsonLoose(s: string): any | null {
  if (!s) return null;
  const tryParse = (x: string) => {
    try {
      return JSON.parse(x);
    } catch {
      return null;
    }
  };
  let r = tryParse(s);
  if (r) return r;
  let t = s.trim();
  if (t.startsWith('```')) {
    t = t.replace(/^```[a-zA-Z]*\s*/, '').replace(/\s*```$/, '').trim();
    r = tryParse(t);
    if (r) return r;
  }
  const i = t.indexOf('{');
  const j = t.lastIndexOf('}');
  if (i >= 0 && j > i) return tryParse(t.slice(i, j + 1));
  return null;
}

/**
 * Generate the full meeting report — a short summary plus a topic-structured
 * extended report where every decision/task/open question cites the transcript.
 * Topics are the source of truth; the flat agenda/decisions/follow-ups and AI
 * tasks are derived from them. Replaces the previous report + AI tasks atomically
 * (manual tasks are preserved). When notify=true (first generation, from the
 * agent), it also marks the meeting ended, notifies participants and emails the
 * report.
 */
async function generateReportInner(
  meetingId: string,
  opts: { notify?: boolean } = {}
): Promise<{ topics: number }> {
  const segments = await prisma.transcriptSegment.findMany({
    where: { meetingId },
    orderBy: { startTime: 'asc' },
    select: { speakerName: true, speakerId: true, content: true, language: true, startTime: true },
  });
  if (segments.length === 0) return { topics: 0 };

  const ds = await getDeepSeekConfig();
  if (!ds.apiKey) throw new Error('DeepSeek API key not configured');
  const wsLoc = await workspaceLocale();
  const langName = wsLoc === 'uk' ? 'Ukrainian' : 'English';

  // Meeting ATTENDEES = registered users (formal participants + any registered
  // transcript speaker) and guests (people who joined by name, with no account —
  // found as participants or as transcript speakers without a speakerId).
  // Auto-assignment is restricted to this list; a guest is assigned by the name
  // they joined with, with id=null (the UI flags them as "not registered").
  type Attendee = { id: string | null; name: string; preferences: any };
  const participantRows = await prisma.meetingParticipant.findMany({
    where: { meetingId },
    include: { user: { select: { id: true, name: true, preferences: true } } },
  });
  const registered = new Map<string, Attendee>();
  const guestNames = new Set<string>();
  for (const p of participantRows) {
    if (p.user) registered.set(p.user.id, { id: p.user.id, name: p.user.name || '', preferences: p.user.preferences });
    else if (p.guestName) guestNames.add(p.guestName);
  }
  for (const s of segments) {
    if (s.speakerId) {
      if (!registered.has(s.speakerId)) registered.set(s.speakerId, { id: s.speakerId, name: s.speakerName || '', preferences: null });
    } else if (s.speakerName) {
      guestNames.add(s.speakerName);
    }
  }
  const regNameSet = new Set(
    [...registered.values()].map((r) => (r.name || '').toLowerCase()).filter(Boolean)
  );
  const attendees: Attendee[] = [
    ...registered.values(),
    ...[...guestNames]
      .filter((g) => g && !regNameSet.has(g.toLowerCase()))
      .map((g) => ({ id: null, name: g, preferences: null })),
  ];
  const matchParticipant = (name: any): Attendee | null => {
    if (!name || typeof name !== 'string') return null;
    const n = name.trim().toLowerCase();
    if (!n) return null;
    for (const a of attendees) {
      const an = (a.name || '').toLowerCase();
      if (an && (an.includes(n) || n.includes(an))) return a;
    }
    return null;
  };
  const participantsLine = attendees.length
    ? `\nMeeting attendees (use ONLY these exact names for any assignee/owner, otherwise null): ${attendees.map((a) => a.name).filter(Boolean).join(', ')}.\n`
    : '\nNo identifiable attendees — set every assignee and owner to null.\n';

  const numbered = segments
    .map((s, i) => `${i + 1}. [${(s.language || '??').toUpperCase()}] ${s.speakerName || '?'}: ${s.content}`)
    .join('\n');

  const prompt = `You are a meeting documentarian. From the NUMBERED transcript below, produce a DETAILED, well-structured report.
Rules:
- Organise the report by TOPIC — create a SEPARATE topic for EACH distinct theme or agenda item actually discussed. A substantive meeting usually has 5-10 topics; do NOT consolidate everything into 2-3 broad topics. Prefer more, finer-grained topics, and within each capture every decision, task and open question raised.
- For EVERY decision, task and open question, include a "cites" array with the exact transcript line numbers that support it.
- NEVER invent facts that are not present in the transcript.
- Write all textual content in ${langName}.
- Extract ALL decisions, tasks and open questions that were discussed — never omit an item, even when nobody is clearly responsible for it.
- Be EXHAUSTIVE with tasks: capture every distinct action item, commitment, request or "I will / we need to / let's …" as its OWN separate task. Do not merge different tasks into one.
- A task's "title" (and a decision's "text") must state ONLY the action or outcome, in imperative form — NEVER include the responsible person's name, because tasks can be reassigned. e.g. write "Develop native apps for Android, iOS, Mac and Windows", NOT "Vitaliy will develop native apps". The person goes ONLY in the separate "assignee" / "owner" field.
- Be EQUALLY EXHAUSTIVE with DECISIONS: capture every conclusion, choice, agreement or settled direction ("we'll go with X", "let's use Y", "decided to…", "agreed that…", "the plan is…") as its own decision.
- Be EQUALLY EXHAUSTIVE with OPEN QUESTIONS / follow-ups: capture everything left unresolved, deferred or to revisit ("we still need to figure out…", "to be decided", "let's come back to this", any unanswered question or risk raised).
- Classify by intent and POPULATE ALL THREE categories — a typical working meeting has SEVERAL tasks, several decisions and a few open questions, so do not leave tasks (or any category) empty when the transcript contains them:
    • TASK = actionable work someone should do or build going forward ("develop…", "send…", "automate…", "I will…", "we need to…"). Keep it as a TASK even if it was also agreed upon — do not turn every action into a decision.
    • DECISION = a settled conclusion, choice, policy or direction (no direct action by itself).
    • OPEN QUESTION = anything unresolved, deferred or to revisit.
- Write rich, SPECIFIC content: include concrete details, names, numbers, examples and reasoning from the transcript — not vague generalities. The result should read like thorough, well-organised minutes.
- For a task's "assignee" or a decision's "owner": use an attendee's exact name (from the list below — it includes guests who joined by name) ONLY when the transcript clearly attributes it to that person; otherwise set it to null. Never invent a name, never use a name that is not a listed attendee, and never drop an item just because its owner is unknown.
- Respond with valid JSON only, in exactly this shape:
{
  "summary": "2-3 paragraph TL;DR of the whole meeting in ${langName}",
  "topics": [
    {
      "title": "short topic title in ${langName}",
      "discussion": "a thorough multi-sentence narrative of this topic in ${langName} — the context, the main points raised, who said what, and the reasoning / outcome",
      "decisions": [ { "text": "decision in ${langName}", "owner": "person name or null", "cites": [1, 2] } ],
      "tasks": [ { "title": "the action only, imperative, in ${langName} — NO person name", "assignee": "person name or null", "priority": "high|medium|low", "due": "timeframe or null", "cites": [3] } ],
      "open_questions": [ { "text": "open question in ${langName}", "cites": [4] } ],
      "cites": [1, 2, 3, 4]
    }
  ]
}
${participantsLine}
TRANSCRIPT:
${numbered}`;

  const res = await fetch(`${ds.baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ds.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: ds.model,
      messages: [
        { role: 'system', content: 'You are a meeting analysis assistant. Always respond with valid JSON.' },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
      // Large headroom: reasoning models spend much of the budget on hidden
      // reasoning before the JSON, and a detailed report can be long.
      max_tokens: 64000,
      // Stream the response so a multi-minute generation doesn't trip fetch's
      // header/idle timeouts (the full JSON only arrives at the very end).
      stream: true,
      stream_options: { include_usage: true },
    }),
  });
  if (!res.ok || !res.body) {
    const txt = res.ok ? '(no response body)' : await res.text().catch(() => '');
    throw new Error(`DeepSeek ${res.status}: ${txt.slice(0, 200)}`);
  }

  // Accumulate the streamed completion (OpenAI-compatible SSE).
  let content = '';
  let usage: any = {};
  for await (const chunk of sseJsonChunks(res.body.getReader())) {
    content += chunkDelta(chunk);
    if (chunk.usage) usage = chunk.usage;
  }

  const rep = parseJsonLoose(content);
  if (!rep) throw new Error('DeepSeek returned no parseable JSON');

  // Map a 1-based transcript line number -> that segment's start time (seconds),
  // so the UI can jump to the cited moment. Drop out-of-range (fabricated) cites.
  const citeTimes = (cs: any): number[] => {
    if (!Array.isArray(cs)) return [];
    const out: number[] = [];
    for (const c of cs) {
      const i = typeof c === 'number' ? c : parseInt(c, 10);
      if (Number.isFinite(i) && i >= 1 && i <= segments.length) out.push(segments[i - 1].startTime);
    }
    return out;
  };

  const rawTopics = Array.isArray(rep.topics) ? rep.topics : [];
  const topics = rawTopics.map((t: any) => ({
    title: String(t.title || '').trim(),
    discussion: String(t.discussion || '').trim(),
    decisions: (Array.isArray(t.decisions) ? t.decisions : []).map((d: any) => ({
      text: String(d.text || '').trim(),
      owner: matchParticipant(d.owner)?.name ?? null,
      cites: citeTimes(d.cites),
    })),
    tasks: (Array.isArray(t.tasks) ? t.tasks : []).map((k: any) => ({
      title: String(k.title || '').trim(),
      assignee: matchParticipant(k.assignee)?.name ?? null,
      priority: ['high', 'medium', 'low'].includes(k.priority) ? k.priority : 'medium',
      due: k.due || null,
      cites: citeTimes(k.cites),
    })),
    openQuestions: (Array.isArray(t.open_questions) ? t.open_questions : []).map((q: any) => ({
      text: String(q.text || '').trim(),
      cites: citeTimes(q.cites),
    })),
    cites: citeTimes(t.cites),
  }));

  const agenda = topics.map((t: any) => t.title).filter(Boolean);
  const decisions = topics.flatMap((t: any) => t.decisions.map((d: any) => d.text)).filter(Boolean);
  const followUps = topics.flatMap((t: any) => t.openQuestions.map((q: any) => q.text)).filter(Boolean);

  const flatTasks = topics.flatMap((t: any) => t.tasks);
  // Task assignees were already normalised to a participant name (or null) when
  // building topics, so this only resolves the name → participant id.
  const resolvedTasks = flatTasks.map((k: any) => {
    const m = matchParticipant(k.assignee);
    return {
      title: k.title || '(untitled)',
      assigneeId: m?.id || null,
      assigneeName: m?.name || null,
      priority: k.priority,
      dueDate: k.due ? parseDueDate(String(k.due)) : null,
      notifyAssignee: m && m.id ? (m.preferences as any)?.actionItemNotif !== false : false,
    };
  });

  await prisma.$transaction(async (tx) => {
    await tx.meetingTask.deleteMany({ where: { meetingId, source: 'ai' } });
    await tx.meetingReport.deleteMany({ where: { meetingId } });
    const created = await tx.meetingReport.create({
      data: {
        meetingId,
        summary: rep.summary || '',
        agenda,
        decisions,
        followUps,
        topics: topics as any,
        modelUsed: ds.model,
        tokensInput: usage.prompt_tokens || 0,
        tokensOutput: usage.completion_tokens || 0,
        rawPrompt: prompt,
        rawResponse: content,
      },
    });
    const meetingDeptId = (await tx.meeting.findUnique({ where: { id: meetingId }, select: { departmentId: true } }))?.departmentId ?? null;
    for (const r of resolvedTasks) {
      await tx.meetingTask.create({
        data: {
          meetingId,
          reportId: created.id,
          departmentId: meetingDeptId,
          title: r.title,
          assigneeId: r.assigneeId,
          assigneeName: r.assigneeName,
          priority: r.priority,
          status: 'open',
          dueDate: r.dueDate,
          source: 'ai',
        },
      });
    }
  });

  if (opts.notify) {
    try {
      for (const r of resolvedTasks) {
        if (r.assigneeId && r.notifyAssignee) {
          await notify({
            userIds: [r.assigneeId],
            type: 'task_assigned',
            titleKey: 'taskAssignedTitle',
            body: r.title,
            link: '/tasks',
            meetingId,
          });
        }
      }
      const meeting = await prisma.meeting.findUnique({
        where: { id: meetingId },
        include: { participants: { where: { userId: { not: null } } } },
      });
      if (meeting) {
        const userIds = meeting.participants
          .map((p) => p.userId)
          .filter((u): u is string => !!u);
        if (userIds.length > 0) {
          await notify({
            userIds,
            type: 'report_ready',
            titleKey: 'reportReadyTitle',
            bodyKey: 'reportReadyBody',
            values: { title: meeting.title },
            link: `/meetings/${meetingId}/report`,
            meetingId,
          });
        }
      }
    } catch (e) {
      console.error('report notify failed:', e);
    }
    try {
      await sendReportEmail(meetingId, { respectPref: true });
    } catch (e) {
      console.error('report email failed:', e);
    }
  }

  return { topics: topics.length };
}

/**
 * Public entry point. Manages the meeting's reportStatus around generation so
 * the UI can show generating / failed / retry, and — on the first generation
 * (notify) — the meeting is ALWAYS marked ended, even when the model fails, so
 * it never hangs in `live` and always lands in the archive.
 */
export async function generateMeetingReport(
  meetingId: string,
  opts: { notify?: boolean } = {}
): Promise<{ topics: number }> {
  await prisma.meeting
    .update({ where: { id: meetingId }, data: { reportStatus: 'generating', reportError: null } })
    .catch(() => {});
  try {
    const result = await generateReportInner(meetingId, opts);
    await prisma.meeting
      .update({
        where: { id: meetingId },
        data: {
          reportStatus: result.topics > 0 ? 'ready' : null,
          ...(opts.notify ? { status: 'ended', endedAt: new Date() } : {}),
        },
      })
      .catch(() => {});
    return result;
  } catch (e) {
    const message = (e instanceof Error ? e.message : String(e)).slice(0, 500);
    await prisma.meeting
      .update({
        where: { id: meetingId },
        data: {
          reportStatus: 'failed',
          reportError: message,
          ...(opts.notify ? { status: 'ended', endedAt: new Date() } : {}),
        },
      })
      .catch(() => {});
    throw e;
  }
}

/**
 * Regenerate the report from the current transcript (e.g. after a manual
 * language fix). No notifications/emails. Thin wrapper over generateMeetingReport.
 */
export async function regenerateMeetingReport(meetingId: string): Promise<void> {
  await generateMeetingReport(meetingId, { notify: false });
}
